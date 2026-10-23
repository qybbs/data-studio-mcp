import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { DashboardManifest, DashboardManifestSchema } from '../types/manifest.js';
import { logger } from '../utils/logger.js';
import { getDefaultManifestsDir, getGlobalConfigDir } from '../utils/paths.js';

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
    let filePath = path.join(this.manifestsDir, `${cleanId}.yaml`);

    if (!fs.existsSync(filePath)) {
      // Fallback: coba cari di global ~/.data-studio-mcp/manifests atau lokal manifests/
      const globalPath = path.join(getGlobalConfigDir(), 'manifests', `${cleanId}.yaml`);
      const localPath = path.resolve(process.cwd(), 'manifests', `${cleanId}.yaml`);
      if (fs.existsSync(globalPath)) {
        filePath = globalPath;
      } else if (fs.existsSync(localPath)) {
        filePath = localPath;
      } else {
        throw new Error(`Manifest untuk dashboard ID "${dashboardId}" tidak ditemukan di ${filePath}`);
      }
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

    // Sinkronisasi ke direktori global ~/.data-studio-mcp/manifests jika berbeda
    const globalManifestDir = path.join(getGlobalConfigDir(), 'manifests');
    const globalPath = path.join(globalManifestDir, `${cleanId}.yaml`);
    if (path.resolve(filePath) !== path.resolve(globalPath)) {
      try {
        if (!fs.existsSync(globalManifestDir)) {
          fs.mkdirSync(globalManifestDir, { recursive: true });
        }
        fs.writeFileSync(globalPath, yamlStr, 'utf8');
      } catch {}
    }

    return filePath;
  }

  /**
   * List all locally available manifests (menggabungkan direktori aktif dan global).
   */
  async listManifests(): Promise<Array<{ id: string; name: string; url: string; pagesCount: number }>> {
    const searchDirs = [this.manifestsDir];
    const globalDir = path.join(getGlobalConfigDir(), 'manifests');
    if (!searchDirs.includes(globalDir) && fs.existsSync(globalDir)) {
      searchDirs.push(globalDir);
    }
    const localDir = path.resolve(process.cwd(), 'manifests');
    if (!searchDirs.includes(localDir) && fs.existsSync(localDir)) {
      searchDirs.push(localDir);
    }

    const seenIds = new Set<string>();
    const results: Array<{ id: string; name: string; url: string; pagesCount: number }> = [];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf8');
          const parsed = yaml.parse(content);
          if (parsed && parsed.dashboard_id && parsed.name && !seenIds.has(parsed.dashboard_id)) {
            seenIds.add(parsed.dashboard_id);
            results.push({
              id: parsed.dashboard_id,
              name: parsed.name,
              url: parsed.url,
              pagesCount: parsed.pages?.length || 0
            });
          }
        } catch (err: any) {
          logger.warn(`Gagal membaca manifest file ${file} di ${dir}:`, err.message);
        }
      }
    }

    return results;
  }
}
