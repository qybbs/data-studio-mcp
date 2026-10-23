import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getDefaultAuthPath } from '../utils/paths.js';

const LOGIN_URL = 'https://accounts.google.com/ServiceLogin?service=analytics&continue=https%3A%2F%2Fdatastudio.google.com%2Fnavigation%2Freporting';

export async function runLoginFlow(customPath?: string): Promise<void> {
  const storageStatePath = customPath ? path.resolve(customPath) : getDefaultAuthPath();
  const authDir = path.dirname(storageStatePath);
  const userDataDir = path.join(authDir, 'user_data');

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  console.error('\n🚀 [AUTH LOGIN] Membuka Google Chrome Asli (Bypass Deteksi Otomasi)...');
  console.error(`👉 Target penyimpanan sesi: ${storageStatePath}`);
  console.error('👉 Jendela Google Chrome akan terbuka tanpa flag automation.');
  console.error('👉 Silakan masukkan email, password, dan selesaikan verifikasi 2FA.');

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ],
    viewport: { width: 1280, height: 850 }
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(LOGIN_URL);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.error('\n⏳ Menunggu Anda menyelesaikan login di browser...');
  console.error('💡 Setelah berhasil masuk ke halaman beranda Looker Studio / Data Studio, tekan [ENTER] di terminal ini.\n');

  const autoDetectPromise = new Promise<void>((resolve) => {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        if (url.includes('datastudio.google.com/navigation') || url.includes('lookerstudio.google.com/navigation')) {
          console.error(`\n🎉 Terdeteksi: Berhasil masuk ke Data Studio Console!`);
          resolve();
        }
      }
    });
  });

  const enterPromise = new Promise<void>((resolve) => {
    rl.question('Tekan [ENTER] jika sudah selesai login: ', () => {
      rl.close();
      resolve();
    });
  });

  await Promise.race([autoDetectPromise, enterPromise]);

  await page.waitForTimeout(2000);

  console.error('\n💾 Menyimpan session state (cookies)...');
  await context.storageState({ path: storageStatePath });

  console.error(`✅ Sesi login berhasil disimpan di: ${storageStatePath}`);
  console.error('🔒 Anda sekarang dapat menjalankan MCP server tanpa perlu login kembali.');

  await context.close();
}
