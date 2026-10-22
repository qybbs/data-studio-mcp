import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const targetUrl = 'https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5';
const AUTH_FILE = path.resolve('.auth/storageState.json');

async function dumpAllRpc() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const allRpc: Array<{ url: string; data: any }> = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('datastudio.google.com') || url.includes('lookerstudio.google.com')) {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('json') || url.includes('get') || url.includes('batched') || url.includes('bindData')) {
        try {
          const raw = await response.text();
          const clean = raw.replace(/^\)\]\}'\s*/, '');
          const parsed = JSON.parse(clean);
          allRpc.push({ url, data: parsed });
          console.error(` Captured RPC: ${url.split('?')[0]}`);
        } catch {}
      }
    }
  });

  console.error(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const outPath = path.resolve('screenshots/all-rpc-dump.json');
  fs.writeFileSync(outPath, JSON.stringify(allRpc, null, 2));
  console.error(`Dumped ${allRpc.length} RPCs to ${outPath}`);

  await browser.close();
}

dumpAllRpc().catch(console.error);
