import { z } from 'zod';
import { ManifestService } from '../services/manifestService.js';
import { validateReadOnlySql } from '../utils/sqlSanitizer.js';

export const GetWidgetQueryInputSchema = z.object({
  dashboard_id: z.string().describe('ID dashboard Google Data Studio (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'),
  widget_id: z.string().describe('ID widget yang ingin diambil query SQL-nya (contoh: "cd-bya47jdl8d" atau "cd-kcg72eel8d")'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format harus YYYY-MM-DD').optional().describe('Tanggal awal filter rentang (format: "YYYY-MM-DD", contoh: "2026-10-01")'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format harus YYYY-MM-DD').optional().describe('Tanggal akhir filter rentang (format: "YYYY-MM-DD", contoh: "2026-10-22")'),
  filter_params: z.record(z.any()).optional().describe('Parameter filter kontrol tambahan (contoh: {"df5": "TOOL_ERROR"} atau {"event_type": "TOOL_ERROR"})'),
  dataset_override: z.string().optional().describe('Nama dataset BigQuery jika ingin menggantikan placeholder <DATASET> (opsional)')
});

export type GetWidgetQueryInput = z.infer<typeof GetWidgetQueryInputSchema>;

export function createGetWidgetQueryHandler(manifestService: ManifestService) {
  return async (args: GetWidgetQueryInput) => {
    const {
      dashboard_id,
      widget_id,
      start_date,
      end_date,
      filter_params = {},
      dataset_override
    } = GetWidgetQueryInputSchema.parse(args);

    const manifest = await manifestService.loadManifest(dashboard_id);

    // 1. Cari widget target di semua halaman
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

    // 2. Kumpulkan pemetaan kolom ke alias kontrol untuk parameter filter
    const fieldToAliasMap: Record<string, string> = {};
    for (const page of manifest.pages) {
      for (const w of page.widgets) {
        if (w.alias) {
          if (w.dimension?.field) fieldToAliasMap[w.dimension.field] = w.alias;
          if (w.dimensions) {
            w.dimensions.forEach(d => { fieldToAliasMap[d.field] = w.alias!; });
          }
        }
      }
    }

    // Bangun parameter yang sudah dinormalisasi (misal: "event_type" -> "df5")
    const normalizedParams: Record<string, any> = {
      start_date: start_date || null,
      end_date: end_date || null
    };

    for (const [k, v] of Object.entries(filter_params)) {
      if (fieldToAliasMap[k]) {
        normalizedParams[fieldToAliasMap[k]] = v;
      } else {
        normalizedParams[k] = v;
      }
    }

    // 3. Susun query SQL
    let sql = targetWidget.sql_query;
    const projectId = manifest.data_source?.project_id || 'devfest-workshop-479805';
    const dataset = dataset_override || manifest.data_source?.dataset || 'default';
    const tableName = manifest.data_source?.table_name || 'agent_events';

    if (!sql) {
      // Fallback query dinamis jika widget belum memiliki sql_query kustom
      sql = `SELECT * FROM \`${projectId}.${dataset}.${tableName}\` LIMIT 100`;
    } else {
      // Gantikan placeholder <DATASET> jika ada
      sql = sql.replace(/<DATASET>/g, dataset);
    }

    // 4. Validasi keamanan query (Read-Only Guardrail)
    validateReadOnlySql(sql);

    // 5. Render respon berstandar gateway MCP
    let markdown = `### 📝 Query SQL Ground-Truth: "${targetWidget.title}" (\`${targetWidget.widget_id}\`)\n\n`;
    markdown += `Query ini siap dieksekusi menggunakan tool BigQuery MCP Anda (misal: \`custom-bigquery-mcp.execute_query\`):\n\n`;
    markdown += `**Target Data Source:**\n`;
    markdown += `- Project ID: \`${projectId}\`\n`;
    markdown += `- Dataset: \`${dataset}\`\n`;
    markdown += `- Tabel: \`${tableName}\`\n\n`;

    markdown += `**Query SQL:**\n\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n`;

    markdown += `**Parameter Siap Injeksi:**\n\`\`\`json\n${JSON.stringify(normalizedParams, null, 2)}\n\`\`\`\n\n`;

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
            widget_title: targetWidget.title,
            widget_type: targetWidget.type,
            target: {
              project_id: projectId,
              dataset,
              table_name: tableName,
              region: manifest.data_source?.region || 'asia-southeast2'
            },
            sql: sql.trim(),
            params: normalizedParams,
            instruction_for_agent: 'Eksekusi query ini pada custom-bigquery-mcp.execute_query untuk memperoleh nilai numerik aktual.'
          }, null, 2)
        }
      ]
    };
  };
}
