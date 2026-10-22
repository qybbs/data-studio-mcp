import { z } from 'zod';
import { ManifestService } from '../services/manifestService.js';

export const GenerateReportUrlInputSchema = z.object({
  dashboard_id: z.string().describe('ID dashboard Google Data Studio (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'),
  page_id: z.string().optional().describe('ID halaman spesifik jika ingin langsung membuka halaman tertentu (contoh: "85456419")'),
  filters: z.record(z.string()).describe('Pasangan parameter filter. Kunci dapat berupa alias kontrol langsung (contoh: {"df5": "TOOL_ERROR"}) atau nama kolom yang otomatis dipetakan ke aliasnya (contoh: {"event_type": "TOOL_ERROR"})')
});

export type GenerateReportUrlInput = z.infer<typeof GenerateReportUrlInputSchema>;

export function createGenerateReportUrlHandler(manifestService: ManifestService) {
  return async (args: GenerateReportUrlInput) => {
    const { dashboard_id, page_id, filters } = GenerateReportUrlInputSchema.parse(args);

    const manifest = await manifestService.loadManifest(dashboard_id);

    // Kumpulkan pemetaan kolom ke alias kontrol dari seluruh widget
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

    // Bangun objek linking parameter
    const mappedParams: Record<string, string> = {};
    const mappingExplanation: string[] = [];

    for (const [key, val] of Object.entries(filters)) {
      if (fieldToAliasMap[key]) {
        const alias = fieldToAliasMap[key];
        mappedParams[alias] = val;
        mappingExplanation.push(`- Kolom \`${key}\` otomatis dipetakan ke alias kontrol \`${alias}\` = \`"${val}"\``);
      } else {
        mappedParams[key] = val;
        mappingExplanation.push(`- Parameter langsung \`${key}\` = \`"${val}"\``);
      }
    }

    // Bangun URL resmi Looker Studio Linking API
    let baseUrl = manifest.url.split('?')[0];
    if (page_id) {
      baseUrl = baseUrl.replace(/\/page\/[^/]+/, '');
      baseUrl = `${baseUrl}/page/${page_id}`;
    }

    const paramsJson = JSON.stringify(mappedParams);
    const generatedUrl = `${baseUrl}?params=${encodeURIComponent(paramsJson)}`;

    let markdown = `### 🔗 URL Dashboard Terfilter (Linking API)\n\n`;
    markdown += `Silakan klik tautan berikut untuk membuka dashboard dengan filter aktif di browser:\n\n`;
    markdown += `👉 **[Buka Dashboard Terfilter](${generatedUrl})**\n\n`;
    markdown += `**URL Lengkap:**\n\`\`\`text\n${generatedUrl}\n\`\`\`\n\n`;

    if (mappingExplanation.length > 0) {
      markdown += `**Rincian Parameter Filter:**\n` + mappingExplanation.join('\n') + `\n\n`;
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
            page_id,
            generated_url: generatedUrl,
            params: mappedParams
          }, null, 2)
        }
      ]
    };
  };
}
