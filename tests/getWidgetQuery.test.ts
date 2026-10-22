import { describe, it, expect } from 'vitest';
import { ManifestService } from '../src/services/manifestService.js';
import { createGetWidgetQueryHandler } from '../src/tools/getWidgetQuery.js';

describe('get_widget_query Tool', () => {
  const manifestService = new ManifestService();
  const getWidgetQueryHandler = createGetWidgetQueryHandler(manifestService);

  it('harus meracik query SQL dengan substitusi dataset dan normalisasi filter alias df5', async () => {
    const result = await getWidgetQueryHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5',
      widget_id: 'cd-bya47jdl8d',
      start_date: '2026-10-01',
      end_date: '2026-10-22',
      filter_params: {
        event_type: 'TOOL_ERROR'
      },
      dataset_override: 'my_analytics'
    });

    const parsedJson = JSON.parse(result.content[1].text);

    expect(parsedJson.dashboard_id).toBe('56f29b51-79b3-4ee6-a820-a1999e238ac5');
    expect(parsedJson.widget_id).toBe('cd-bya47jdl8d');
    expect(parsedJson.target.dataset).toBe('my_analytics');
    expect(parsedJson.target.table_name).toBe('agent_events');

    // Pastikan SQL telah menggantikan <DATASET> dengan my_analytics
    expect(parsedJson.sql).toContain('FROM `devfest-workshop-479805.my_analytics.agent_events`');
    expect(parsedJson.sql).toContain('UPPER(event_type) AS upper_event_type');

    // Pastikan parameter event_type dinormalisasi ke df5
    expect(parsedJson.params).toEqual({
      start_date: '2026-10-01',
      end_date: '2026-10-22',
      df5: 'TOOL_ERROR'
    });

    expect(result.content[0].text).toContain('Query ini siap dieksekusi menggunakan tool BigQuery MCP');
  });

  it('harus melempar error jika widget_id tidak ditemukan di manifest', async () => {
    await expect(getWidgetQueryHandler({
      dashboard_id: '56f29b51-79b3-4ee6-a820-a1999e238ac5',
      widget_id: 'non-existent-widget'
    })).rejects.toThrow(/tidak ditemukan/);
  });
});
