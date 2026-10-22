import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const targetUrl = 'https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5';
const AUTH_FILE = path.resolve('.auth/storageState.json');

async function testEditorInspection() {
  console.error('\n🚀 [SPIKE TAHAP 2] Menguji Mode Edit & Ekstraksi Data Source...');
  console.error(`📍 Target URL: ${targetUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Koleksi response RPC dari backend Google
  const rpcData: Array<{ url: string; dataSnippet: string }> = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('batched') || url.includes('bindData') || url.includes('getReport')) {
      try {
        const text = await response.text();
        if (text.includes('event_type') || text.includes('Record Count') || text.includes('bigquery') || text.includes('dataset')) {
          rpcData.push({
            url: url.slice(0, 80),
            dataSnippet: text.slice(0, 300)
          });
        }
      } catch {}
    }
  });

  console.error('⏳ Membuka dashboard...');
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // 1. Periksa Elemen di Mode View
  const viewInfo = await page.evaluate(() => {
    // Ambil semua teks penting yang tampak di layar
    const allTexts = Array.from(document.querySelectorAll('div, span, h1, h2, h3, p'))
      .map(el => el.textContent?.trim() || '')
      .filter(t => t.length > 0 && t.length < 100);

    return {
      title: document.title,
      sampleTexts: Array.from(new Set(allTexts)).filter(t => 
        t.includes('event_type') || t.includes('Record Count') || t.includes('Tabel') || t.includes('rentang tanggal')
      )
    };
  });

  console.error('\n📋 [1. KONTEN MODE VIEW TERDETEKSI]');
  console.error(`   Judul Dokumen: "${viewInfo.title}"`);
  console.error(`   Elemen Teks Ditemukan:`, viewInfo.sampleTexts);

  // 2. Klik Tombol "Edit"
  console.error('\n✏️ [2. MENGUJI KLIK TOMBOL "EDIT"]');
  const editButton = page.locator('button:has-text("Edit"), [aria-label*="Edit"], .edit-button').first();
  const hasEdit = await editButton.isVisible().catch(() => false);

  if (hasEdit) {
    console.error('   Tombol "Edit" ditemukan! Mengklik tombol Edit...');
    await editButton.click();
    await page.waitForTimeout(4000);

    // Ambil screenshot mode edit
    const editScreenshotPath = path.resolve('screenshots/spike-editor-mode.png');
    await page.screenshot({ path: editScreenshotPath });
    console.error(`   📸 Screenshot Mode Edit tersimpan: ${editScreenshotPath}`);

    // Periksa menu bar editor yang muncul
    const editorMenus = await page.evaluate(() => {
      const menus = Array.from(document.querySelectorAll('[role="menubar"] [role="menuitem"], .goog-menubar-button, .menu-bar-item'))
        .map(el => el.textContent?.trim() || '')
        .filter(t => t.length > 0);
      return Array.from(new Set(menus));
    });

    console.error(`   Bilah Menu Editor:`, editorMenus);

    // 3. Coba Akses Menu Resource / Sumber Data
    console.error('\n🔍 [3. MENGUJI MENU "RESOURCE" / "SUMBER DATA"]');
    const resourceMenu = page.locator('text="Resource", text="Sumber data", [aria-label*="Resource"]').first();
    const hasResource = await resourceMenu.isVisible().catch(() => false);

    if (hasResource) {
      console.error('   Menu "Resource / Sumber data" terlihat! Mengklik menu...');
      await resourceMenu.click();
      await page.waitForTimeout(1500);

      // Cari submenu "Manage added data sources" / "Kelola sumber data yang ditambahkan"
      const manageSources = page.locator('text="Manage added data sources", text="Kelola sumber data yang ditambahkan"').first();
      if (await manageSources.isVisible().catch(() => false)) {
        console.error('   Submenu "Kelola sumber data yang ditambahkan" ditemukan! Mengklik...');
        await manageSources.click();
        await page.waitForTimeout(3000);

        // Ambil screenshot modal data source
        const modalScreenshotPath = path.resolve('screenshots/spike-datasource-modal.png');
        await page.screenshot({ path: modalScreenshotPath });
        console.error(`   📸 Screenshot Modal Data Source tersimpan: ${modalScreenshotPath}`);

        // Ekstrak teks di dalam modal popup
        const modalContent = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"], .modal-dialog, .glass-dialog');
          return dialog ? dialog.textContent?.trim().replace(/\s+/g, ' ') : 'Modal tidak terdeteksi via role dialog';
        });
        console.error(`   Isi Dialog Data Source: "${modalContent?.slice(0, 300)}"`);

        // Tutup modal secara aman (READ-ONLY GUARD)
        const closeBtn = page.locator('button:has-text("Close"), button:has-text("Tutup"), [aria-label*="Close"]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          console.error('   Menutup dialog secara aman (Read-Only Guard)...');
          await closeBtn.click();
        }
      }
    } else {
      console.error('   Menu Resource tidak langsung terlihat sebagai teks terpisah, memeriksa panel kanan...');
    }
  } else {
    console.error('   Tombol Edit tidak terlihat di layar.');
  }

  // 4. Periksa RPC Data yang Tertangkap
  console.error('\n🌐 [4. RPC DATA YANG TERTANGKAP]');
  console.error(`   Total RPC yang relevan: ${rpcData.length}`);
  rpcData.slice(0, 2).forEach((r, idx) => {
    console.error(`   [Payload ${idx + 1}] URL: ${r.url}`);
    console.error(`      Snippet: ${r.dataSnippet.slice(0, 200)}...`);
  });

  await browser.close();
  console.error('\n✅ [SPIKE TAHAP 2 SELESAI]');
}

testEditorInspection().catch((err) => {
  console.error('❌ Error during editor spike:', err);
  process.exit(1);
});
