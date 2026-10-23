import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// URL login Google yang mengarah ke dashboard Data Studio
const LOGIN_URL = 'https://accounts.google.com/ServiceLogin?service=analytics&continue=https%3A%2F%2Fdatastudio.google.com%2Fnavigation%2Freporting';

async function authLogin() {
  const authDir = path.resolve('.auth');
  const targetArg = process.argv[2] || process.env.DATA_STUDIO_AUTH_FILE;
  const storageStatePath = targetArg ? path.resolve(targetArg) : path.join(authDir, 'storageState.json');
  const userDataDir = path.join(authDir, 'user_data');

  const targetDir = path.dirname(storageStatePath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.error('\n🚀 [AUTH LOGIN] Membuka Google Chrome Asli (Bypass Deteksi Otomasi)...');
  console.error('👉 Jendela Google Chrome akan terbuka tanpa flag automation.');
  console.error('👉 Silakan masukkan email, password, dan selesaikan verifikasi 2FA.');

  // Gunakan Google Chrome asli di Mac dengan flag anti-deteksi bot
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome', // Menggunakan Google Chrome resmi yang terinstall di Mac
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'], // Hilangkan banner "Chrome is controlled by automated test software"
    args: [
      '--disable-blink-features=AutomationControlled', // Sembunyikan flag navigator.webdriver
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
  console.error('💡 Setelah berhasil masuk ke halaman beranda Data Studio, tekan [ENTER] di terminal ini.\n');

  // Deteksi otomatis jika URL sudah masuk ke Data Studio
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

  // Selesai jika terdeteksi otomatis ATAU jika user tekan Enter
  await Promise.race([autoDetectPromise, enterPromise]);

  // Berikan waktu jeda 2 detik agar session cookies tersimpan
  await page.waitForTimeout(2000);

  console.error('\n💾 Menyimpan session state (cookies)...');
  await context.storageState({ path: storageStatePath });

  console.error(`✅ Sesi login berhasil disimpan di: ${storageStatePath}`);
  console.error('🔒 File ini aman dan terisolasi di folder .auth (di-ignore oleh git).');

  await context.close();
  process.exit(0);
}

authLogin().catch((err) => {
  console.error('❌ Error during login:', err);
  process.exit(1);
});
