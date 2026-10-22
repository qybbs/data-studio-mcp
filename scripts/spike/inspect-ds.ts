import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const targetUrl = 'https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5';
const AUTH_FILE = path.resolve('.auth/storageState.json');

async function inspectDataSources() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const dsResponses: any[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('datastudio.google.com') && (url.includes('Datasource') || url.includes('datasource') || url.includes('batched'))) {
      try {
        const text = await response.text();
        const clean = text.replace(/^\)\]\}'\s*/, '');
        if (clean.includes('agent_events') || clean.includes('843d3814')) {
          dsResponses.push({ url, body: clean });
          console.error(`🎯 Menemukan response datasource di: ${url}`);
        }
      } catch {}
    }
  });

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  if (dsResponses.length > 0) {
    fs.writeFileSync('screenshots/datasource-dump.json', JSON.stringify(dsResponses, null, 2));
    console.error(`✅ Berhasil menyimpan datasource dump (${dsResponses.length} item)`);
  } else {
    console.error('ℹ️ Tidak menemukan response khusus datasource di network, cek getReport atau batched');
  }

  await browser.close();
}

inspectDataSources().catch(console.error);
