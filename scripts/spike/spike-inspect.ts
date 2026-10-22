import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// URL Dashboard Publik Resmi Data Studio (Google Merchandise Store Sample Report)
const DEFAULT_URL = 'https://datastudio.google.com/reporting/0B5FF6mBKbNJxOWI0ODFDN2YtNmY2OC00YjFmLTlkM2EtYzU1NTFmZWYxYWEy';
const targetUrl = process.argv[2] || DEFAULT_URL;

// Path file storageState (cookies) jika tersedia
const AUTH_FILE = path.resolve('.auth/storageState.json');

async function runSpike() {
  console.error(`\n🚀 [SPIKE] Memulai inspeksi langsung Data Studio...`);
  console.error(`📍 Target URL: ${targetUrl}`);

  // Pastikan folder screenshots ada
  const screenshotDir = path.resolve('screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true, // Berjalan tanpa GUI
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const locale = process.env.LOCALE || 'en-US';

  const contextOptions: any = {
    locale,
    timezoneId: 'Asia/Jakarta',
    extraHTTPHeaders: {
      'Accept-Language': `${locale},en-US;q=0.9,en;q=0.8`
    },
    viewport: { width: 1440, height: 900 }
  };

  // Gunakan storageState jika file cookies ada
  if (fs.existsSync(AUTH_FILE)) {
    console.error(`🔑 Menggunakan auth cookies dari: ${AUTH_FILE}`);
    contextOptions.storageState = AUTH_FILE;
  } else {
    console.error(`ℹ️ File ${AUTH_FILE} belum ada, berjalan dalam Mode View (Viewer/Publik).`);
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Koleksi data dari network
  const capturedResponses: Array<{ url: string; status: number; snippet?: string }> = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('datastudio.google.com') || url.includes('lookerstudio.google.com')) {
      const status = response.status();
      if (url.includes('batched') || url.includes('getReport') || url.includes('data')) {
        try {
          const text = await response.text();
          capturedResponses.push({
            url: url.slice(0, 100) + '...',
            status,
            snippet: text.slice(0, 200).replace(/\s+/g, ' ')
          });
        } catch {
          capturedResponses.push({ url: url.slice(0, 100) + '...', status });
        }
      }
    }
  });

  console.error(`⏳ Membuka halaman dan menunggu loading...`);
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (err: any) {
    console.error(`⚠️ Networkidle timeout atau lambat, melanjutkan inspeksi DOM yang sudah ter-render...`);
  }

  // Berikan waktu render 5 detik tambahan untuk SVG dan canvas
  await page.waitForTimeout(5000);

  // 1. Ekstraksi Metadata Dokumen
  const pageTitle = await page.title();
  const currentUrl = page.url();

  console.error(`\n📄 [1. METADATA HALAMAN]`);
  console.error(`   Judul Browser: "${pageTitle}"`);
  console.error(`   URL Akhir     : ${currentUrl}`);

  // 2. Ekstraksi Informasi Halaman & Navigasi
  const pageNavigationInfo = await page.evaluate(() => {
    // Cari elemen pagination atau drawer
    const navTextElements = Array.from(document.querySelectorAll('div, span, button'))
      .map(el => el.textContent?.trim() || '')
      .filter(txt => /halaman\s+\d+\s+dari\s+\d+/i.test(txt) || /page\s+\d+\s+of\s+\d+/i.test(txt));

    // Cari daftar nama halaman di drawer/menu jika ada
    const pageMenuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], .page-item, li'))
      .map(el => el.textContent?.trim() || '')
      .filter(txt => txt.length > 2 && txt.length < 50 && !txt.includes('\n'));

    return {
      paginationIndicator: navTextElements[0] || 'Tidak terdeteksi eksplisit di DOM',
      candidatePageTitles: Array.from(new Set(pageMenuItems)).slice(0, 8)
    };
  });

  console.error(`\n📑 [2. NAVIGASI HALAMAN]`);
  console.error(`   Indikator Pagination: "${pageNavigationInfo.paginationIndicator}"`);
  if (pageNavigationInfo.candidatePageTitles.length > 0) {
    console.error(`   Kandidat Menu Halaman: ${JSON.stringify(pageNavigationInfo.candidatePageTitles)}`);
  }

  // 3. Ekstraksi Komponen di Kanvas
  const componentsSummary = await page.evaluate(() => {
    const widgets: Array<{
      tag: string;
      role?: string | null;
      width: number;
      height: number;
      x: number;
      y: number;
      sampleText: string;
    }> = [];

    // Deteksi container chart (biasanya div dengan posisi absolut atau SVG container)
    const elements = Array.from(document.querySelectorAll('svg, table, [role="region"], [role="figure"], .lego-chart'));

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 60 && rect.height > 40) { // Filter icon kecil
        const textSnippet = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        widgets.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          sampleText: textSnippet
        });
      }
    });

    return {
      totalFound: widgets.length,
      sampleWidgets: widgets.slice(0, 10)
    };
  });

  console.error(`\n📊 [3. INVENTARIS KOMPONEN KANVAS]`);
  console.error(`   Total Komponen Terdeteksi: ${componentsSummary.totalFound}`);
  componentsSummary.sampleWidgets.forEach((w, idx) => {
    console.error(`   [Widget ${idx + 1}] Elemen: <${w.tag}> | Dimensi: ${w.width}x${w.height} di (${w.x}, ${w.y})`);
    if (w.sampleText) {
      console.error(`      Teks/Label: "${w.sampleText.slice(0, 60)}"`);
    }
  });

  // 4. Capture Screenshot
  const screenshotPath = path.resolve('screenshots/spike-result.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.error(`\n📸 [4. SCREENSHOT BERHASIL DISIMPAN]`);
  console.error(`   Lokasi: ${screenshotPath}`);

  // 5. Ringkasan Network
  console.error(`\n🌐 [5. REQUEST JARINGAN DATA STUDIO]`);
  console.error(`   Total Response RPC/Batched Ditangkap: ${capturedResponses.length}`);
  capturedResponses.slice(0, 3).forEach((r, idx) => {
    console.error(`   [RPC ${idx + 1}] Status ${r.status} | URL: ${r.url}`);
    if (r.snippet) {
      console.error(`      Snippet: ${r.snippet}`);
    }
  });

  await browser.close();
  console.error(`\n✅ [SPIKE SELESAI DENGAN SUKSES]`);
}

runSpike().catch((err) => {
  console.error(`❌ [SPIKE ERROR]:`, err);
  process.exit(1);
});
