import { describe, it, expect } from 'vitest';
import { ManifestService } from '../src/services/manifestService.js';
import { createGenerateReportUrlHandler } from '../src/tools/generateReportUrl.js';

describe('generate_report_url Tool', () => {
  const manifestService = new ManifestService();
  const generateUrlHandler = createGenerateReportUrlHandler(manifestService);

  it('harus otomatis memetakan nama kolom "event_type" ke alias kontrol "df5" pada URL linking', async () => {
    const result = await generateUrlHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5',
      filters: {
        event_type: 'TOOL_ERROR'
      }
    });

    const jsonContent = JSON.parse(result.content[1].text);
    expect(jsonContent.params).toEqual({
      df5: 'TOOL_ERROR'
    });

    expect(jsonContent.generated_url).toContain('https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5?params=');
    const decodedParams = decodeURIComponent(jsonContent.generated_url.split('params=')[1]);
    expect(decodedParams).toBe('{"df5":"TOOL_ERROR"}');
  });

  it('harus menerima pemanggilan jika user langsung menggunakan alias "df5"', async () => {
    const result = await generateUrlHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5',
      filters: {
        df5: 'LLM_RESPONSE'
      }
    });

    const jsonContent = JSON.parse(result.content[1].text);
    expect(jsonContent.params).toEqual({
      df5: 'LLM_RESPONSE'
    });
  });
});
