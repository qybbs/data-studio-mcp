import { z } from 'zod';
import { GoogleApiService } from '../services/googleApiService.js';

export const SearchReportsInputSchema = z.object({
  query: z.string().optional().describe('Kata kunci pencarian nama atau topik dashboard (contoh: "agent", "analytics", "sales")'),
  limit: z.number().int().min(1).max(50).default(10).describe('Batas jumlah laporan yang dikembalikan (default: 10)')
});

export type SearchReportsInput = z.infer<typeof SearchReportsInputSchema>;

export function createSearchReportsHandler(googleApiService: GoogleApiService) {
  return async (args: SearchReportsInput) => {
    const { query, limit } = SearchReportsInputSchema.parse(args);
    const results = await googleApiService.searchReports(query, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Tidak ditemukan laporan Data Studio yang cocok dengan query "${query || ''}".`
          }
        ]
      };
    }

    let markdown = `### 📊 Daftar Laporan Data Studio Ditemukan (${results.length})\n\n`;
    markdown += `| No | Nama Laporan | Dashboard ID | Sumber | URL Akses |\n`;
    markdown += `|---|---|---|---|---|\n`;

    results.forEach((r, idx) => {
      markdown += `| ${idx + 1} | **${r.name}** | \`${r.id}\` | \`${r.source}\` | [Buka Dashboard](${r.url}) |\n`;
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: markdown
        },
        {
          type: 'text' as const,
          text: JSON.stringify({ reports: results }, null, 2)
        }
      ]
    };
  };
}
