import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function inspectDsList() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ storageState: '.auth/storageState.json', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let dsListJson: any = null;
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('getDatasourceList')) {
      try {
        const txt = await res.text();
        const clean = txt.replace(/^\)\]\}'\s*/, '');
        dsListJson = JSON.parse(clean);
      } catch {}
    }
  });

  await page.goto('https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const editBtn = page.locator('button:has-text("Edit"), [aria-label*="Edit"]').first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await page.waitForTimeout(4000);
  }

  if (dsListJson) {
    fs.writeFileSync('screenshots/getDatasourceList-dump.json', JSON.stringify(dsListJson, null, 2));
    console.error('getDatasourceList saved to screenshots/getDatasourceList-dump.json');
    console.error('Datasources in list:');
    dsListJson.datasourceInfo?.forEach((x: any) => {
      console.error(`- ID: ${x.shareableConfig?.id}, Name: ${x.shareableConfig?.name}`);
    });
  }

  await browser.close();
}

inspectDsList().catch(console.error);
