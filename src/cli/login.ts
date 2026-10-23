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

  let detected = false;
  const autoDetectPromise = new Promise<void>((resolve) => {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && !detected) {
        try {
          const parsed = new URL(frame.url());
          const isLookerStudio = parsed.hostname === 'lookerstudio.google.com' || parsed.hostname === 'datastudio.google.com';
          const isNotAccounts = !parsed.hostname.includes('accounts.google.com');

          if (isLookerStudio && isNotAccounts && (parsed.pathname.includes('/navigation') || parsed.pathname.includes('/reporting'))) {
            detected = true;
            console.error(`\n🎉 Terdeteksi: Berhasil masuk ke konsol Looker Studio (${parsed.origin})!`);
            console.error('⏳ Menyimpan sesi dalam 3 detik (atau tekan [ENTER] untuk langsung simpan)...');
            setTimeout(() => {
              rl.close();
              resolve();
            }, 3000);
          }
        } catch {}
      }
    });
  });

  const enterPromise = new Promise<void>((resolve) => {
    rl.question('Tekan [ENTER] jika sudah selesai login: ', () => {
      rl.close();
      resolve();
    });
  });

  // Jika user menutup browser secara manual setelah login
  const pageClosePromise = new Promise<void>((resolve) => {
    page.on('close', () => {
      rl.close();
      resolve();
    });
  });

  await Promise.race([autoDetectPromise, enterPromise, pageClosePromise]);

  // Berikan waktu jeda 1 detik agar state cookies tersimpan sempurna
  await page.waitForTimeout(1000).catch(() => {});

  const cookies = await context.cookies().catch(() => []);
  const hasAuthCookies = cookies.some(c =>
    c.domain.includes('google.com') && ['SID', 'HSID', 'SSID', 'SAPISID', 'OSID', '__Secure-1PSID'].includes(c.name)
  );

  if (!hasAuthCookies) {
    console.error('\n⚠️ PERINGATAN: Cookie autentikasi Google tidak terdeteksi!');
    console.error('👉 Pastikan Anda telah menyelesaikan proses login email/password & 2FA sebelum menutup browser.');
  }

  console.error('\n💾 Menyimpan session state (cookies)...');
  await context.storageState({ path: storageStatePath });

  console.error(`✅ Sesi login berhasil disimpan di: ${storageStatePath}`);
  console.error('🔒 Anda sekarang dapat menjalankan MCP server tanpa perlu login kembali.');

  await context.close().catch(() => {});
}
