import { z } from 'zod';
import { ManifestService } from '../services/manifestService.js';

export const GetDashboardContextInputSchema = z.object({
  dashboard_id: z.string().describe('ID dashboard Google Data Studio (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'),
  page_id: z.string().optional().describe('ID halaman spesifik (opsional, jika hanya ingin membaca 1 halaman)')
});

export type GetDashboardContextInput = z.infer<typeof GetDashboardContextInputSchema>;

export function createGetDashboardContextHandler(manifestService: ManifestService) {
  return async (args: GetDashboardContextInput) => {
    const { dashboard_id, page_id } = GetDashboardContextInputSchema.parse(args);
    const manifest = await manifestService.loadManifest(dashboard_id);

    let pages = manifest.pages;
    if (page_id) {
      pages = pages.filter(p => p.page_id === page_id);
      if (pages.length === 0) {
        throw new Error(`Halaman dengan page_id "${page_id}" tidak ditemukan pada dashboard "${dashboard_id}".`);
      }
    }

    let markdown = `### 📋 Konteks Semantik Dashboard: "${manifest.name}"\n\n`;
    markdown += `- **ID:** \`${manifest.dashboard_id}\`\n`;
    markdown += `- **URL:** [Buka Dashboard](${manifest.url})\n`;
    if (manifest.global_style) {
      markdown += `- **Tema / Dimensi:** Tema \`${manifest.global_style.theme || 'default'}\` (${manifest.global_style.canvas_width || 1220}x${manifest.global_style.canvas_height || 900}px)\n`;
    }
    if (manifest.data_source) {
      markdown += `- **Sumber Data:** \`${manifest.data_source.type}\` | Project: \`${manifest.data_source.project_id}\` | Tabel: \`${manifest.data_source.table_name}\` (Region: \`${manifest.data_source.region || 'asia-southeast2'}\`)\n`;
    }

    markdown += `\n---\n`;

    pages.forEach(p => {
      markdown += `\n#### 📄 Halaman ${p.page_number}: ${p.title} (\`${p.page_id}\`)\n`;
      if (p.description) markdown += `*${p.description}*\n\n`;

      markdown += `| Widget ID | Judul Widget | Tipe | Alias Filter | Dimensi & Formula | Metrik & Formula |\n`;
      markdown += `|---|---|---|---|---|---|\n`;

      p.widgets.forEach(w => {
        const alias = w.alias ? `\`${w.alias}\`` : '-';
        
        const dims: string[] = [];
        if (w.dimension) dims.push(`${w.dimension.field}${w.dimension.formula ? ` (\`${w.dimension.formula}\`)` : ''}`);
        if (w.dimensions) {
          w.dimensions.forEach(d => dims.push(`${d.field}${d.formula ? ` (\`${d.formula}\`)` : ''}`));
        }

        const mets: string[] = [];
        if (w.metric) mets.push(`${w.metric.field} (\`${w.metric.formula || w.metric.aggregation || 'COUNT'}\`)`);
        if (w.metrics) {
          w.metrics.forEach(m => mets.push(`${m.field} (\`${m.formula || m.aggregation || 'COUNT'}\`)`));
        }

        markdown += `| \`${w.widget_id}\` | **${w.title}** | \`${w.type}\` | ${alias} | ${dims.join('<br>') || '-'} | ${mets.join('<br>') || '-'} |\n`;
      });
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: markdown
        },
        {
          type: 'text' as const,
          text: JSON.stringify({ manifest, filtered_pages: pages }, null, 2)
        }
      ]
    };
  };
}
