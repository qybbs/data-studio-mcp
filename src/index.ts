#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './utils/logger.js';
import { ManifestService } from './services/manifestService.js';
import { BrowserService } from './services/browserService.js';
import { GoogleApiService } from './services/googleApiService.js';

import { createSearchReportsHandler } from './tools/searchReports.js';
import { createInspectDashboardHandler } from './tools/inspectDashboard.js';
import { createGetDashboardContextHandler } from './tools/getDashboardContext.js';
import { createGetWidgetQueryHandler } from './tools/getWidgetQuery.js';
import { createGenerateReportUrlHandler } from './tools/generateReportUrl.js';
import { createCaptureSnapshotHandler } from './tools/captureSnapshot.js';
import { runLoginFlow } from './cli/login.js';

async function main() {
  if (process.argv.includes('login') || process.argv.includes('--login')) {
    const customPath = process.argv[3] && !process.argv[3].startsWith('-') ? process.argv[3] : undefined;
    await runLoginFlow(customPath);
    process.exit(0);
  }

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.error(`
Data Studio MCP Server

Penggunaan:
  npx -y github:qybbs/data-studio-mcp         Menjalankan server MCP via stdio transport (default)
  npx -y github:qybbs/data-studio-mcp login   Membuka browser Google Chrome untuk login dan menyimpan sesi
  npx -y github:qybbs/data-studio-mcp --help  Menampilkan bantuan ini
`);
    process.exit(0);
  }

  logger.info('Menginisialisasi Data Studio MCP Server (v0.1.0)...');

  // Inisialisasi Service Layer
  const manifestService = new ManifestService();
  const browserService = new BrowserService();
  const googleApiService = new GoogleApiService(manifestService);

  // Inisialisasi Tool Handlers
  const searchReportsHandler = createSearchReportsHandler(googleApiService);
  const inspectDashboardHandler = createInspectDashboardHandler(browserService, manifestService);
  const getDashboardContextHandler = createGetDashboardContextHandler(manifestService);
  const getWidgetQueryHandler = createGetWidgetQueryHandler(manifestService);
  const generateReportUrlHandler = createGenerateReportUrlHandler(manifestService);
  const captureSnapshotHandler = createCaptureSnapshotHandler(browserService, manifestService);

  // Inisialisasi MCP Server
  const server = new Server(
    {
      name: 'data-studio-mcp',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Daftar 6 Tools MCP dengan pemisahan peran yang orthogonal dan bebas ambigu
  const tools: Tool[] = [
    {
      name: 'search_reports',
      description: 'Mencari laporan Google Data Studio / Looker Studio berdasarkan kata kunci judul/pemilik melalui Google Drive API atau katalog manifest lokal.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Kata kunci pencarian (contoh: "agent", "sales", "analytics")'
          },
          limit: {
            type: 'number',
            description: 'Batas jumlah hasil yang dikembalikan (default: 10, max: 50)'
          }
        }
      }
    },
    {
      name: 'inspect_dashboard_structure',
      description: 'Menjalankan perayap Playwright headless untuk mengintersepsi RPC backend (getReport, getSchema, batchedDataV2), membedah komponen kanvas, calculated fields, alias kontrol filter, dan data source BigQuery otomatis ke dalam file manifests/{dashboard_id}.yaml.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL lengkap dashboard Google Data Studio / Looker Studio'
          },
          save_manifest: {
            type: 'boolean',
            description: 'Simpan hasil ekstraksi secara otomatis ke file manifests/{dashboard_id}.yaml (default: true)'
          }
        },
        required: ['url']
      }
    },
    {
      name: 'get_dashboard_context',
      description: 'Mengambil ringkasan semantik dashboard (< 50ms) dari manifest YAML lokal: inventaris widget, formula kalkulasi, kolom tanggal, filter alias, dan style visual tanpa perlu mengakses browser.',
      inputSchema: {
        type: 'object',
        properties: {
          dashboard_id: {
            type: 'string',
            description: 'ID dashboard Google Data Studio (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'
          },
          page_id: {
            type: 'string',
            description: 'ID halaman spesifik (opsional, jika hanya ingin membaca 1 halaman tertentu)'
          }
        },
        required: ['dashboard_id']
      }
    },
    {
      name: 'get_widget_query',
      description: 'Meracik query SQL analitik ground-truth untuk widget tertentu di dashboard berdasarkan definisi metrik, formula calculated fields (chart & data level), serta parameter filter/rentang tanggal yang siap dieksekusi oleh tool BigQuery MCP Anda (misal: custom-bigquery-mcp.execute_query).',
      inputSchema: {
        type: 'object',
        properties: {
          dashboard_id: {
            type: 'string',
            description: 'ID dashboard Google Data Studio (contoh: "56f29b51-79b3-4ee6-a820-a1999e238ac5")'
          },
          widget_id: {
            type: 'string',
            description: 'ID widget target (contoh: "cd-bya47jdl8d" atau "cd-kcg72eel8d")'
          },
          start_date: {
            type: 'string',
            description: 'Tanggal awal filter rentang (format: "YYYY-MM-DD", contoh: "2026-10-01")'
          },
          end_date: {
            type: 'string',
            description: 'Tanggal akhir filter rentang (format: "YYYY-MM-DD", contoh: "2026-10-22")'
          },
          filter_params: {
            type: 'object',
            description: 'Parameter filter kontrol tambahan (contoh: {"event_type": "TOOL_ERROR"} atau {"df5": "TOOL_ERROR"})'
          },
          dataset_override: {
            type: 'string',
            description: 'Nama dataset BigQuery jika ingin menggantikan placeholder <DATASET> (opsional)'
          }
        },
        required: ['dashboard_id', 'widget_id']
      }
    },
    {
      name: 'generate_report_url',
      description: 'Membentuk URL resmi Looker Studio Linking API (?params={"alias":"value"}) dengan pemetaan otomatis dari nama kolom ke alias kontrol internal dashboard.',
      inputSchema: {
        type: 'object',
        properties: {
          dashboard_id: {
            type: 'string',
            description: 'ID dashboard Google Data Studio'
          },
          page_id: {
            type: 'string',
            description: 'ID halaman spesifik jika ingin langsung mengarahkan ke halaman tertentu'
          },
          filters: {
            type: 'object',
            description: 'Pasangan parameter filter (contoh: {"event_type": "TOOL_ERROR"} atau {"df5": "TOOL_ERROR"})'
          }
        },
        required: ['dashboard_id', 'filters']
      }
    },
    {
      name: 'capture_dashboard_snapshot',
      description: 'Mengambil tangkapan layar (screenshot) beresolusi tinggi dari dashboard menggunakan Playwright untuk memvalidasi tata letak visual dan posisi chart.',
      inputSchema: {
        type: 'object',
        properties: {
          dashboard_id: {
            type: 'string',
            description: 'ID dashboard yang ingin di-screenshot'
          },
          url: {
            type: 'string',
            description: 'URL dashboard langsung jika dashboard_id tidak disertakan'
          },
          page_id: {
            type: 'string',
            description: 'ID halaman spesifik (opsional)'
          },
          filters: {
            type: 'object',
            description: 'Parameter filter opsional untuk diterapkan sebelum snapshot diambil'
          },
          output_filename: {
            type: 'string',
            description: 'Nama file output (default: snapshot-<id>-<timestamp>.png)'
          }
        }
      }
    }
  ];

  // Handler List Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handler Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    logger.info(`Menerima pemanggilan tool MCP: "${name}"`);

    try {
      switch (name) {
        case 'search_reports':
          return await searchReportsHandler(args as any);
        case 'inspect_dashboard_structure':
          return await inspectDashboardHandler(args as any);
        case 'get_dashboard_context':
          return await getDashboardContextHandler(args as any);
        case 'get_widget_query':
          return await getWidgetQueryHandler(args as any);
        case 'generate_report_url':
          return await generateReportUrlHandler(args as any);
        case 'capture_dashboard_snapshot':
          return await captureSnapshotHandler(args as any);
        default:
          throw new Error(`Tool "${name}" tidak dikenal oleh server data-studio-mcp.`);
      }
    } catch (err: any) {
      logger.error(`Error saat menjalankan tool "${name}":`, err.message);
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Terjadi kesalahan saat mengeksekusi tool "${name}": ${err.message}`
          }
        ]
      };
    }
  });

  // Hubungkan ke Transport Stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Server data-studio-mcp siap dan terhubung ke Stdio transport.');

  // Tangani sinyal terminasi secara elegan
  process.on('SIGINT', async () => {
    logger.info('Menerima SIGINT, mematikan server secara elegan...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Menerima SIGTERM, mematikan server secara elegan...');
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('Fatal error di server data-studio-mcp:', err);
  process.exit(1);
});
