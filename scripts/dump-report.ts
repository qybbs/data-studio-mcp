import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const targetUrl = 'https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5';
const AUTH_FILE = path.resolve('.auth/storageState.json');

async function dumpGetReport() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let reportConfigJson: any = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('getReport')) {
      try {
        const raw = await response.text();
        // Google prefixes json with )]}'
        const clean = raw.replace(/^\)\]\}'\s*/, '');
        reportConfigJson = JSON.parse(clean);
        console.error('✅ Berhasil menangkap getReport payload!');
      } catch (e: any) {
        console.error('Error parsing getReport:', e.message);
      }
    }
  });

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  if (reportConfigJson) {
    const dumpPath = path.resolve('screenshots/getReport-dump.json');
    fs.writeFileSync(dumpPath, JSON.stringify(reportConfigJson, null, 2));
    console.error(`📁 getReport berhasil disimpan di: ${dumpPath}`);

    // Print top-level keys
    console.error('🔑 Top-level keys:', Object.keys(reportConfigJson));
    if (reportConfigJson.reportConfig) {
      console.error('🔑 reportConfig keys:', Object.keys(reportConfigJson.reportConfig));
      console.error('📊 Name:', reportConfigJson.reportConfig.shareable?.name);
      console.error('📊 ID:', reportConfigJson.reportConfig.shareable?.id);
    }
    if (reportConfigJson.dataSources) {
      console.error('📦 Data Sources count:', reportConfigJson.dataSources.length);
      console.error('📦 Data Sources:', JSON.stringify(reportConfigJson.dataSources, null, 2).slice(0, 1000));
    }
  } else {
    console.error('❌ Tidak berhasil menangkap getReport');
  }

  await browser.close();
}

dumpGetReport().catch(console.error);
