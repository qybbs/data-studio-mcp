import { z } from 'zod';
import { BrowserService } from '../services/browserService.js';
import { ManifestService } from '../services/manifestService.js';

export const InspectDashboardInputSchema = z.object({
  url: z.string().url().describe('URL lengkap dashboard Google Data Studio / Looker Studio (contoh: "https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5")'),
  save_manifest: z.boolean().default(true).describe('Simpan hasil ekstraksi secara otomatis ke file manifests/{dashboard_id}.yaml (default: true)')
});

export type InspectDashboardInput = z.infer<typeof InspectDashboardInputSchema>;

export function createInspectDashboardHandler(browserService: BrowserService, manifestService: ManifestService) {
  return async (args: InspectDashboardInput) => {
    const { url, save_manifest } = InspectDashboardInputSchema.parse(args);

    const manifest = await browserService.inspectDashboard(url);

    let savedPath = '';
    if (save_manifest) {
      savedPath = await manifestService.saveManifest(manifest);
    }

    const totalWidgets = manifest.pages.reduce((acc, p) => acc + p.widgets.length, 0);

    let markdown = `### 🔍 Hasil Inspeksi Dashboard: "${manifest.name}"\n\n`;
    markdown += `- **Dashboard ID:** \`${manifest.dashboard_id}\`\n`;
    markdown += `- **Total Halaman:** ${manifest.pages.length}\n`;
    markdown += `- **Total Widget:** ${totalWidgets}\n`;
    if (manifest.data_source) {
      markdown += `- **Data Source:** \`${manifest.data_source.type}\` | Project: \`${manifest.data_source.project_id}\` | Tabel: \`${manifest.data_source.table_name}\`\n`;
    }
    if (savedPath) {
      markdown += `- **File Manifest Disimpan:** \`${savedPath}\`\n\n`;
    }

    markdown += `#### Rincian Komponen per Halaman:\n`;
    manifest.pages.forEach((p) => {
      markdown += `\n**Halaman ${p.page_number}: ${p.title}** (ID: \`${p.page_id}\`)\n`;
      p.widgets.forEach((w, wIdx) => {
        const aliasStr = w.alias ? ` [Alias: \`${w.alias}\`]` : '';
        markdown += `- [${wIdx + 1}] **${w.title}** (Tipe: \`${w.type}\`)${aliasStr}\n`;
        if (w.dimensions && w.dimensions.length > 0) {
          markdown += `  - Dimensi: ${w.dimensions.map(d => `${d.field}${d.formula ? ` (Formula: \`${d.formula}\`)` : ''}`).join(', ')}\n`;
        }
        if (w.metrics && w.metrics.length > 0) {
          markdown += `  - Metrik: ${w.metrics.map(m => `${m.field}${m.formula ? ` (\`${m.formula}\`)` : ''}`).join(', ')}\n`;
        }
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
          text: JSON.stringify(manifest, null, 2)
        }
      ]
    };
  };
}
