import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserService } from '../services/browserService.js';
import { ManifestService } from '../services/manifestService.js';

export const CaptureSnapshotInputSchema = z.object({
  dashboard_id: z.string().optional().describe('ID dashboard yang ingin di-screenshot (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'),
  url: z.string().url().optional().describe('Atau URL langsung dashboard jika dashboard_id tidak disertakan'),
  page_id: z.string().optional().describe('ID halaman spesifik (opsional)'),
  filters: z.record(z.string()).optional().describe('Parameter filter opsional untuk diterapkan sebelum screenshot (contoh: {"df5": "TOOL_ERROR"})'),
  output_filename: z.string().optional().describe('Nama file output (default: snapshot-<id>-<timestamp>.png)')
});

export type CaptureSnapshotInput = z.infer<typeof CaptureSnapshotInputSchema>;

export function createCaptureSnapshotHandler(browserService: BrowserService, manifestService: ManifestService) {
  return async (args: CaptureSnapshotInput) => {
    const { dashboard_id, url, page_id, filters, output_filename } = CaptureSnapshotInputSchema.parse(args);

    let targetUrl = url;
    let idLabel = dashboard_id || 'custom';

    if (!targetUrl && dashboard_id) {
      const manifest = await manifestService.loadManifest(dashboard_id);
      targetUrl = manifest.url;
    }

    if (!targetUrl) {
      throw new Error('Harap sertakan minimal salah satu dari "dashboard_id" atau "url".');
    }

    if (page_id) {
      targetUrl = targetUrl.replace(/\/page\/[^/]+/, '');
      targetUrl = `${targetUrl}/page/${page_id}`;
    }

    const buffer = await browserService.captureSnapshot(targetUrl, filters);

    const screenshotsDir = path.resolve(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const filename = output_filename || `snapshot-${idLabel}-${Date.now()}.png`;
    const fullPath = path.join(screenshotsDir, filename);

    fs.writeFileSync(fullPath, buffer);

    let markdown = `### 📸 Snapshot Dashboard Berhasil Diambil\n\n`;
    markdown += `- **Target URL:** ${targetUrl}\n`;
    markdown += `- **Lokasi File:** \`${fullPath}\`\n`;
    markdown += `- **Ukuran File:** ${(buffer.length / 1024).toFixed(1)} KB\n`;
    if (filters && Object.keys(filters).length > 0) {
      markdown += `- **Filter Diterapkan:** \`${JSON.stringify(filters)}\`\n`;
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
            target_url: targetUrl,
            file_path: fullPath,
            size_bytes: buffer.length
          }, null, 2)
        }
      ]
    };
  };
}
