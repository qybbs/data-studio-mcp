import { z } from 'zod';
import { ManifestService } from '../services/manifestService.js';
import { BigQueryService } from '../services/bigqueryService.js';

export const QueryDashboardMetricInputSchema = z.object({
  dashboard_id: z.string().describe('ID dashboard Google Data Studio (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'),
  widget_id: z.string().describe('ID widget yang ingin di-query datanya (contoh: "cd-bya47jdl8d" atau "cd-kcg72eel8d")'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format harus YYYY-MM-DD').optional().describe('Tanggal mulai filter (format: "YYYY-MM-DD", contoh: "2026-10-01")'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format harus YYYY-MM-DD').optional().describe('Tanggal akhir filter (format: "YYYY-MM-DD", contoh: "2026-10-22")'),
  filter_params: z.record(z.any()).optional().describe('Parameter filter tambahan (contoh: {"df5": "TOOL_ERROR"} atau {"event_type": "LLM_RESPONSE"})'),
  max_rows: z.number().int().min(1).max(1000).default(100).optional().describe('Batas maksimum baris yang diambil (default: 100, max: 1000)')
});

export type QueryDashboardMetricInput = z.infer<typeof QueryDashboardMetricInputSchema>;

export function createQueryDashboardMetricHandler(manifestService: ManifestService, bigqueryService: BigQueryService) {
  return async (args: QueryDashboardMetricInput) => {
    const { dashboard_id, widget_id, start_date, end_date, filter_params = {}, max_rows = 100 } = QueryDashboardMetricInputSchema.parse(args);

    const manifest = await manifestService.loadManifest(dashboard_id);

    // Cari widget berdasarkan widget_id di semua halaman
    let targetWidget: any = null;
    for (const page of manifest.pages) {
      const found = page.widgets.find(w => w.widget_id === widget_id);
      if (found) {
        targetWidget = found;
        break;
      }
    }

    if (!targetWidget) {
      throw new Error(`Widget ID "${widget_id}" tidak ditemukan pada manifest dashboard "${dashboard_id}".`);
    }

    // Ambil atau susun SQL query
    let sql = targetWidget.sql_query;
    if (!sql) {
      // Fallback query otomatis jika sql_query tidak ditulis eksplisit di widget
      const tableName = manifest.data_source?.table_name || 'agent_events';
      const projectId = manifest.data_source?.project_id || 'devfest-workshop-479805';
      const dataset = manifest.data_source?.dataset || 'default';
      sql = `SELECT * FROM \`${projectId}.${dataset}.${tableName}\` LIMIT ${max_rows}`;
    }

    // Suntikkan parameter query BigQuery
    const params: Record<string, any> = {
      start_date: start_date || null,
      end_date: end_date || null,
      ...filter_params
    };

    // Eksekusi BigQuery
    const result = await bigqueryService.executeMetricQuery({
      sql,
      params,
      projectId: manifest.data_source?.project_id,
      location: manifest.data_source?.region,
      maxRows: max_rows
    });

    // Render tabel Markdown
    let markdown = `### 📈 Hasil Query Ground-Truth: "${targetWidget.title}" (\`${targetWidget.widget_id}\`)\n\n`;
    markdown += `- **Waktu Eksekusi BigQuery:** ${result.executionTimeMs}ms\n`;
    markdown += `- **Total Baris Data:** ${result.totalRows}\n`;
    if (start_date || end_date) {
      markdown += `- **Rentang Tanggal:** \`${start_date || 'Awal'}\` s/d \`${end_date || 'Akhir'}\`\n`;
    }
    if (Object.keys(filter_params).length > 0) {
      markdown += `- **Filter Diterapkan:** \`${JSON.stringify(filter_params)}\`\n`;
    }

    markdown += `\n`;

    if (result.rows.length === 0) {
      markdown += `*Tidak ada data yang cocok dengan kriteria filter.*`;
    } else {
      const headers = Object.keys(result.rows[0]);
      markdown += `| ` + headers.join(' | ') + ` |\n`;
      markdown += `| ` + headers.map(() => '---').join(' | ') + ` |\n`;

      const displayRows = result.rows.slice(0, 20);
      displayRows.forEach(row => {
        markdown += `| ` + headers.map(h => row[h] !== null && row[h] !== undefined ? String(row[h]) : '-').join(' | ') + ` |\n`;
      });

      if (result.rows.length > 20) {
        markdown += `\n*... Menampilkan 20 dari ${result.totalRows} baris data (seluruh baris tersedia dalam format JSON).*`;
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: markdown
        },
        {
          type: 'text' as const,
          text: JSON.stringify({
            dashboard_id,
            widget_id,
            execution_time_ms: result.executionTimeMs,
            total_rows: result.totalRows,
            data: result.rows
          }, null, 2)
        }
      ]
    };
  };
}
