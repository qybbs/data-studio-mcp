import { chromium, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { DashboardManifest, Page, Widget, WidgetType } from '../types/manifest.js';
import { logger } from '../utils/logger.js';

export class BrowserService {
  private authFile: string;

  constructor(authFile?: string) {
    this.authFile = authFile || path.resolve(process.cwd(), '.auth/storageState.json');
  }

  private mapComponentType(rawType: string): WidgetType {
    switch (rawType) {
      case 'simple-table':
        return 'table';
      case 'kpi-metric':
        return 'scorecard';
      case 'dimension-filter':
        return 'dropdown_filter';
      case 'simple-daterangepicker':
        return 'date_range_picker';
      case 'simple-description':
        return 'text_box';
      case 'time-series':
        return 'time_series';
      case 'bar-chart':
        return 'bar_chart';
      case 'pie-chart':
        return 'pie_chart';
      default:
        return 'custom';
    }
  }

  /**
   * Inspect a live Data Studio dashboard and extract its manifest via Network RPC Interception.
   */
  async inspectDashboard(url: string): Promise<DashboardManifest> {
    logger.info(`Memulai perayap Playwright untuk dashboard: ${url}`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const contextOptions: any = {
        viewport: { width: 1440, height: 900 }
      };

      if (fs.existsSync(this.authFile)) {
        logger.info(`Menggunakan sesi auth tersimpan dari ${this.authFile}`);
        contextOptions.storageState = this.authFile;
      } else {
        logger.warn(`Sesi auth tidak ditemukan di ${this.authFile}. Berjalan dalam mode anonim/view.`);
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      let getReportData: any = null;
      let getSchemaData: any = null;
      let batchedData: any = null;

      page.on('response', async (response) => {
        const resUrl = response.url();
        if (resUrl.includes('getReport')) {
          try {
            const raw = await response.text();
            getReportData = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
            logger.info('RPC getReport berhasil ditangkap.');
          } catch {}
        } else if (resUrl.includes('getSchema')) {
          try {
            const raw = await response.text();
            getSchemaData = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
            logger.info('RPC getSchema berhasil ditangkap.');
          } catch {}
        } else if (resUrl.includes('batchedDataV2')) {
          try {
            const raw = await response.text();
            batchedData = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
            logger.info('RPC batchedDataV2 berhasil ditangkap.');
          } catch {}
        }
      });

      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {
        logger.warn('Networkidle timeout saat loading halaman, melanjutkan parsing...');
      });

      await page.waitForTimeout(3000);

      if (!getReportData || !getReportData.reportConfig) {
        throw new Error('Gagal menangkap payload getReport dari Google Looker Studio.');
      }

      const reportConfig = getReportData.reportConfig;
      const shareable = reportConfig.shareable || {};
      const dashboardId = shareable.id || 'unknown';
      const dashboardName = shareable.name || 'Untitled Report';

      // 1. Ekstraksi BigQuery Data Source Metadata
      let bqProject = 'unknown_project';
      let bqRegion = 'asia-southeast2';
      let bqDataset = 'default';
      let bqTable = 'agent_events';

      if (batchedData?.dataResponse?.[0]?.dataSubset?.[0]?.biJobUrl) {
        const biJobUrl = batchedData.dataResponse[0].dataSubset[0].biJobUrl;
        const projectMatch = biJobUrl.match(/project=([^&]+)/);
        const regionMatch = biJobUrl.match(/j=bq:([^:]+):/);
        if (projectMatch) bqProject = projectMatch[1];
        if (regionMatch) bqRegion = regionMatch[1];
      }

      // 2. Ekstraksi Skema Kolom dari getSchema
      const dimensionsSchema: any[] = [];
      const metricsSchema: any[] = [];

      if (getSchemaData?.schema) {
        const s = getSchemaData.schema;
        s.dimensions?.forEach((d: any) => {
          dimensionsSchema.push({
            name: d.displayName || d.name,
            internal_field_id: d.name,
            type: d.underlyingConnectorDataType || 'STRING',
            is_calculated_field: !d.isAutoField,
            scope: !d.isAutoField ? 'data_source' : undefined
          });
        });
        s.metrics?.forEach((m: any) => {
          metricsSchema.push({
            name: m.displayName || m.name,
            internal_field_id: m.name,
            type: 'INTEGER',
            aggregation: 'COUNT'
          });
        });
      }

      // 3. Ekstraksi Halaman & Widget
      const pages: Page[] = [];
      const rawPages = reportConfig.page || [];

      rawPages.forEach((p: any, idx: number) => {
        const pageObj = p.page || {};
        const pageId = pageObj.pageId || `page_${idx + 1}`;
        const widgets: Widget[] = [];

        pageObj.componentConfig?.forEach((c: any) => {
          const compType = this.mapComponentType(c.type);
          const attr = c.attributeConfig?.componentAttribute || {};
          const alias = attr.alias;

          const dimensions: any[] = [];
          const metrics: any[] = [];

          // Parse field transformations & calculated fields
          c.conceptDefs?.forEach((cd: any) => {
            const tf = cd.queryTimeTransformation?.dataTransformation;
            const dt = cd.displayTransformation;

            if (tf) {
              const fieldName = dt?.displayName || tf.sourceFieldName;
              const isCalc = Boolean(tf.textFormula);

              if (fieldName?.toLowerCase().includes('count') || cd.id?.includes('metric')) {
                metrics.push({
                  field: fieldName,
                  internal_field_id: cd.id,
                  aggregation: 'COUNT',
                  formula: 'COUNT(1)'
                });
              } else {
                dimensions.push({
                  field: fieldName,
                  internal_field_id: cd.id,
                  data_type: 'Text',
                  is_calculated_field: isCalc,
                  scope: isCalc ? 'chart' : undefined,
                  formula: tf.textFormula ? tf.textFormula.replace(/t\d+\._/g, '').replace(/_/g, '') : undefined,
                  internal_formula: tf.textFormula
                });
              }
            }
          });

          widgets.push({
            widget_id: c.componentId,
            title: c.propertyConfig?.componentProperty?.title || `${compType} widget`,
            type: compType,
            alias,
            data_source_id: '843d3814-fda1-4bea-a94b-603fd3aa29af',
            data_source_name: bqTable,
            dimensions: dimensions.length > 0 ? dimensions : undefined,
            metrics: metrics.length > 0 ? metrics : undefined,
            style: {
              position: {
                x: attr.left ?? 0,
                y: attr.top ?? 0,
                width: attr.width ?? 100,
                height: attr.height ?? 50
              }
            }
          });
        });

        pages.push({
          page_id: pageId,
          page_number: idx + 1,
          title: `Page ${idx + 1}`,
          widgets
        });
      });

      const manifest: DashboardManifest = {
        dashboard_id: dashboardId,
        name: dashboardName,
        url,
        global_style: {
          theme: reportConfig.report?.propertyConfig?.reportProperty?.themeConfig || 't-default-modern',
          canvas_width: reportConfig.report?.attributeConfig?.reportAttribute?.width || 1220,
          canvas_height: reportConfig.report?.attributeConfig?.reportAttribute?.height || 900
        },
        data_source: {
          type: 'bigquery',
          project_id: bqProject,
          dataset: bqDataset,
          table_name: bqTable,
          region: bqRegion,
          extracted_via: 'playwright_rpc_inspector',
          schema: {
            dimensions: dimensionsSchema,
            metrics: metricsSchema
          }
        },
        pages
      };

      return manifest;
    } finally {
      await browser.close();
    }
  }

  /**
   * Capture a visual snapshot screenshot of a dashboard.
   */
  async captureSnapshot(url: string, params?: Record<string, string>): Promise<Buffer> {
    logger.info(`Mengambil snapshot screenshot untuk: ${url}`);

    let targetUrl = url;
    if (params && Object.keys(params).length > 0) {
      const urlObj = new URL(url);
      urlObj.searchParams.set('params', JSON.stringify(params));
      targetUrl = urlObj.toString();
    }

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const contextOptions: any = {
        viewport: { width: 1440, height: 900 }
      };

      if (fs.existsSync(this.authFile)) {
        contextOptions.storageState = this.authFile;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);

      const screenshotBuffer = await page.screenshot({ fullPage: false });
      return screenshotBuffer;
    } finally {
      await browser.close();
    }
  }
}
