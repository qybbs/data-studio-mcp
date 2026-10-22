import { google } from 'googleapis';
import { logger } from '../utils/logger.js';
import { ManifestService } from './manifestService.js';

export interface ReportSearchResult {
  id: string;
  name: string;
  url: string;
  source: 'google_drive' | 'local_manifest';
}

export class GoogleApiService {
  private driveClient: any = null;
  private manifestService: ManifestService;

  constructor(manifestService: ManifestService) {
    this.manifestService = manifestService;
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
      this.driveClient = google.drive({ version: 'v3', auth });
    } catch (err: any) {
      logger.warn('Google Drive API client tidak terinisialisasi (menggunakan fallback lokal):', err.message);
    }
  }

  /**
   * Search for Data Studio reports via Google Drive API or local manifests catalog.
   */
  async searchReports(query?: string, limit: number = 10): Promise<ReportSearchResult[]> {
    const results: ReportSearchResult[] = [];

    // 1. Coba pencarian via Google Drive API jika tersedia
    if (this.driveClient) {
      try {
        let q = "mimeType = 'application/vnd.google-apps.datastudio' and trashed = false";
        if (query) {
          q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
        }

        const res = await this.driveClient.files.list({
          q,
          pageSize: limit,
          fields: 'files(id, name, webViewLink)'
        });

        const files = res.data.files || [];
        for (const file of files) {
          if (file.id && file.name) {
            results.push({
              id: file.id,
              name: file.name,
              url: file.webViewLink || `https://datastudio.google.com/reporting/${file.id}`,
              source: 'google_drive'
            });
          }
        }
      } catch (err: any) {
        logger.warn('Drive API search gagal, menggunakan fallback katalog manifest lokal:', err.message);
      }
    }

    // 2. Gabungkan atau fallback ke katalog manifest lokal
    const localManifests = await this.manifestService.listManifests();
    for (const m of localManifests) {
      if (!query || m.name.toLowerCase().includes(query.toLowerCase()) || m.id.includes(query)) {
        if (!results.some(r => r.id === m.id)) {
          results.push({
            id: m.id,
            name: m.name,
            url: m.url,
            source: 'local_manifest'
          });
        }
      }
    }

    return results.slice(0, limit);
  }
}
