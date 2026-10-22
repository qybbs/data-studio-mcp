import { describe, it, expect } from 'vitest';
import { ManifestService } from '../src/services/manifestService.js';
import { GoogleApiService } from '../src/services/googleApiService.js';
import { createSearchReportsHandler } from '../src/tools/searchReports.js';

describe('search_reports Tool', () => {
  const manifestService = new ManifestService();
  // Gunakan null untuk driveClient agar test berjalan secara deterministik dan instan pada katalog lokal
  const googleApiService = new GoogleApiService(manifestService, null);
  const searchReportsHandler = createSearchReportsHandler(googleApiService);

  it('harus menemukan laporan lokal jika query cocok dengan nama atau ID', async () => {
    const result = await searchReportsHandler({
      query: 'Untitled',
      limit: 5
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toContain('Daftar Laporan Data Studio Ditemukan');
    expect(result.content[0].text).toContain('56f29b51-79b3-4ee6-a820-a1999e238ac5');

    const json = JSON.parse(result.content[1].text);
    expect(json.reports.length).toBeGreaterThan(0);
    expect(json.reports[0].id).toBe('56f29b51-79b3-4ee6-a820-a1999e238ac5');
  });

  it('harus memberikan pesan informatif jika tidak ada laporan yang cocok', async () => {
    const result = await searchReportsHandler({
      query: 'keyword-yang-pasti-tidak-ada-123456789',
      limit: 5
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Tidak ditemukan laporan Data Studio');
  });

  it('harus mendukung pencarian via mocked Google Drive API jika terkonfigurasi', async () => {
    const mockDriveClient = {
      files: {
        list: async () => ({
          data: {
            files: [
              { id: 'drive-report-1', name: 'Sales Performance 2026', webViewLink: 'https://datastudio.google.com/reporting/drive-report-1' }
            ]
          }
        })
      }
    };

    const driveApiService = new GoogleApiService(manifestService, mockDriveClient);
    const handler = createSearchReportsHandler(driveApiService);

    const result = await handler({ query: 'Sales' });
    expect(result.content[0].text).toContain('Sales Performance 2026');
    const json = JSON.parse(result.content[1].text);
    expect(json.reports.some((r: any) => r.id === 'drive-report-1')).toBe(true);
  });
});
