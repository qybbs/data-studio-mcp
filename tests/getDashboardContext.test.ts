import { describe, it, expect } from 'vitest';
import { ManifestService } from '../src/services/manifestService.js';
import { createGetDashboardContextHandler } from '../src/tools/getDashboardContext.js';

describe('get_dashboard_context Tool', () => {
  const manifestService = new ManifestService();
  const getDashboardContextHandler = createGetDashboardContextHandler(manifestService);

  it('harus mengembalikan konteks semantik dashboard lengkap (5 widget, calculated fields, alias df5)', async () => {
    const result = await getDashboardContextHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5'
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Konteks Semantik Dashboard: "Untitled Report"');
    expect(result.content[0].text).toContain('df5');

    const json = JSON.parse(result.content[1].text);
    expect(json.manifest.dashboard_id).toBe('56f29b51-79b3-4ee6-a820-a1999e238ac5');
    expect(json.filtered_pages).toHaveLength(1);
    expect(json.filtered_pages[0].widgets).toHaveLength(5);
  });

  it('harus memfilter halaman jika page_id diberikan', async () => {
    const result = await getDashboardContextHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5',
      page_id: '85456419'
    });

    const json = JSON.parse(result.content[1].text);
    expect(json.filtered_pages[0].page_id).toBe('85456419');
  });

  it('harus melempar error jika page_id tidak ada', async () => {
    await expect(getDashboardContextHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5',
      page_id: 'invalid-page-id'
    })).rejects.toThrow(/tidak ditemukan/);
  });
});
