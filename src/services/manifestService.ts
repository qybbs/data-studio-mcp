import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { DashboardManifest, DashboardManifestSchema } from '../types/manifest.js';
import { logger } from '../utils/logger.js';
import { getDefaultManifestsDir } from '../utils/paths.js';

export class ManifestService {
  private manifestsDir: string;

  constructor(manifestsDir?: string) {
    this.manifestsDir = manifestsDir || getDefaultManifestsDir();
    if (!fs.existsSync(this.manifestsDir)) {
      fs.mkdirSync(this.manifestsDir, { recursive: true });
    }
  }

  /**
   * Load and validate a dashboard manifest by dashboard ID.
   */
  async loadManifest(dashboardId: string): Promise<DashboardManifest> {
    const cleanId = dashboardId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(this.manifestsDir, `${cleanId}.yaml`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Manifest untuk dashboard ID "${dashboardId}" tidak ditemukan di ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsedYaml = yaml.parse(fileContent);

    const validationResult = DashboardManifestSchema.safeParse(parsedYaml);
    if (!validationResult.success) {
      logger.error(`Skema manifest ${dashboardId} tidak valid:`, validationResult.error.format());
      throw new Error(`Manifest "${dashboardId}" tidak lolos validasi skema: ${validationResult.error.message}`);
    }

    return validationResult.data;
  }

  /**
   * Save or update a dashboard manifest.
   */
  async saveManifest(manifest: DashboardManifest): Promise<string> {
    const validated = DashboardManifestSchema.parse(manifest);
    const cleanId = validated.dashboard_id.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(this.manifestsDir, `${cleanId}.yaml`);

    const yamlStr = yaml.stringify(validated, {
      indent: 2,
      lineWidth: 120
    });

    fs.writeFileSync(filePath, yamlStr, 'utf8');
    logger.info(`Manifest berhasil disimpan ke: ${filePath}`);
    return filePath;
  }

  /**
   * List all locally available manifests.
   */
  async listManifests(): Promise<Array<{ id: string; name: string; url: string; pagesCount: number }>> {
    const files = fs.readdirSync(this.manifestsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const results: Array<{ id: string; name: string; url: string; pagesCount: number }> = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.manifestsDir, file), 'utf8');
        const parsed = yaml.parse(content);
        if (parsed && parsed.dashboard_id && parsed.name) {
          results.push({
            id: parsed.dashboard_id,
            name: parsed.name,
            url: parsed.url,
            pagesCount: parsed.pages?.length || 0
          });
        }
      } catch (err: any) {
        logger.warn(`Gagal membaca manifest file ${file}:`, err.message);
      }
    }

    return results;
  }
}
