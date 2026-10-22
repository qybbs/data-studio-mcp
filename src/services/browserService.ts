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

  /**
   * Pemetaan komprehensif tipe komponen internal Google Looker Studio ke WidgetType standar.
   * Mengacu pada:
   * - https://docs.cloud.google.com/data-studio/types-of-charts
   * - https://docs.cloud.google.com/data-studio/about-controls
   */
  private mapComponentType(rawType: string): WidgetType {
    const t = rawType.toLowerCase().replace(/[_\s]+/g, '-');

    // 1. Charts & Visualizations
    if (t === 'simple-table' || t === 'table') return 'table';
    if (t === 'pivot-table' || t === 'pivot') return 'pivot_table';
    if (t === 'kpi-metric' || t === 'scorecard') return 'scorecard';
    if (t === 'time-series' || t === 'sparkline') return 'time_series';
    if (t.includes('bar') || t.includes('column')) return 'bar_chart';
    if (t.includes('pie') || t.includes('donut')) return 'pie_chart';
    if (t.includes('area')) return 'area_chart';
    if (t.includes('line')) return 'line_chart';
    if (t.includes('scatter') || t.includes('bubble')) return 'scatter_chart';
    if (t.includes('google-map')) return 'google_map';
    if (t.includes('geo')) return 'geo_map';
    if (t.includes('gauge')) return 'gauge';
    if (t.includes('treemap')) return 'treemap';
    if (t.includes('bullet')) return 'bullet_chart';

    // 2. Controls & Filter Interactivity
    if (t === 'dimension-filter' || t.includes('dropdown')) return 'dropdown_filter';
    if (t.includes('fixed-list') || t === 'list-filter') return 'fixed_list_filter';
    if (t.includes('input-box') || t.includes('search-box')) return 'input_box_filter';
    if (t.includes('advanced-filter')) return 'advanced_filter';
    if (t.includes('slider')) return 'slider_filter';
    if (t.includes('checkbox')) return 'checkbox_filter';
    if (t === 'simple-daterangepicker' || t.includes('daterange')) return 'date_range_picker';
    if (t.includes('data-control')) return 'data_control';
    if (t.includes('button')) return 'button';

    // 3. Layout & Static Elements
    if (t === 'simple-description' || t.includes('text') || t.includes('description')) return 'text_box';
    if (t.includes('image')) return 'image';
    if (t.includes('shape') || t.includes('rect') || t.includes('circle')) return 'shape';
    if (t.includes('embed')) return 'embed_url';

    return 'custom';
  }

  /**
   * Pemetaan kode agregasi internal Looker Studio ke standar SQL.
   */
  private mapAggregationType(aggCode?: number): string {
    switch (aggCode) {
      case 1:
        return 'SUM';
      case 2:
        return 'AVG';
      case 3:
        return 'COUNT';
      case 4:
        return 'COUNT_DISTINCT';
      case 5:
        return 'MIN';
      case 6:
        return 'MAX';
      case 7:
        return 'COUNT'; // Record Count
      default:
        return 'SUM';
    }
  }

  /**
   * Pemetaan jenis konektor data Looker Studio (BigQuery, Sheets, PostgreSQL, dll.).
   */
  private mapConnectorType(connectorType?: number, connectorName?: string): string {
    switch (connectorType) {
      case 2:
        return 'bigquery';
      case 1:
        return 'google_sheets';
      case 3:
        return 'mysql';
      case 4:
        return 'postgresql';
      case 5:
        return 'csv_upload';
      case 6:
        return 'google_analytics_4';
      default:
        if (connectorName) {
          return connectorName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        }
        return 'generic_datasource';
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
      let claimedDatasourcesData: any = null;

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
        } else if (resUrl.includes('getClaimedDatasources')) {
          try {
            const raw = await response.text();
            claimedDatasourcesData = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
            logger.info('RPC getClaimedDatasources berhasil ditangkap.');
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

      // 1. Ekstraksi Sumber Data & Konektor secara Dinamis (Bebas Hardcode)
      const primaryClaimed = claimedDatasourcesData?.claimedDatasources?.[0]?.basicEntityInfo;
      const dataSourceId: string | undefined = primaryClaimed?.id || reportConfig.report?.resource?.datasourceAlias?.[0]?.datasourceId;
      const rawConnectorType = getSchemaData?.schema?.connectorType;
      const connectorName = primaryClaimed?.name;
      const dataSourceType = this.mapConnectorType(rawConnectorType, connectorName);

      let bqProject: string | undefined = undefined;
      let bqRegion: string | undefined = undefined;
      let bqDataset: string | undefined = undefined;
      let bqTable: string | undefined = primaryClaimed?.name || undefined;

      // Ekstraksi metadata job BigQuery jika connector bertipe BigQuery dan biJobUrl tersedia
      if (dataSourceType === 'bigquery') {
        const biJobUrl = batchedData?.dataResponse?.[0]?.dataSubset?.[0]?.biJobUrl;
        if (biJobUrl) {
          const projectMatch = biJobUrl.match(/project=([^&]+)/);
          const regionMatch = biJobUrl.match(/j=bq:([^:]+):/);
          if (projectMatch) bqProject = projectMatch[1];
          if (regionMatch) bqRegion = regionMatch[1];
        }
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
          const aggType = this.mapAggregationType(m.defaultAggregation ?? m.newDefaultAggregation);
          metricsSchema.push({
            name: m.displayName || m.name,
            internal_field_id: m.name,
            type: 'INTEGER',
            aggregation: aggType,
            formula: aggType === 'COUNT' ? 'COUNT(1)' : `${aggType}(${m.displayName || m.name})`
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

              // Tentukan apakah metrik berdasarkan konfigurasi transformasi atau nama
              const isMetric = cd.id?.includes('metric') ||
                c.propertyConfig?.componentProperty?.metrics?.labeledConcepts?.[0]?.value?.conceptNames?.includes(cd.name);

              if (isMetric) {
                const agg = this.mapAggregationType(tf.transformationConfig?.aggregationType);
                metrics.push({
                  field: fieldName,
                  internal_field_id: cd.id,
                  aggregation: agg,
                  formula: tf.textFormula || (agg === 'COUNT' ? 'COUNT(1)' : `${agg}(${fieldName})`)
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
            data_source_id: dataSourceId,
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
          type: dataSourceType,
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
