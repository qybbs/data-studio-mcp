# The Reality Check: Laporan Audit Kodebase (`audit.md`)

> **Tanggal Audit:** 23 Oktober 2026  
> **Status Audit:** Fase 1 (Core TypeScript MCP Server) Selesai  
> **Target Analisis:** Kesesuaian antara [implementation-plan.md](file:///Users/OUT2305/Repo/data-studio-mcp/docs/implementation-plan.md), [prd.md](file:///Users/OUT2305/Repo/data-studio-mcp/docs/prd.md), dan kode sumber aktual di direktori `src/`, `tests/`, `scripts/`, dan `manifests/`.

---

## 1. Eksekutif Ringkasan (*Executive Summary*)

Audit independen ini dilakukan untuk memeriksa secara objektif apa yang **benar-benar terbangun (*reality*)** dibandingkan apa yang **direncanakan (*plan*)**, mengidentifikasi berkas yatim piatu (*orphaned files*), nilai yang tertanam (*hardcoded values*), utang teknis (*technical debt*), dan celah pengujian (*testing gaps*).

### Skor Kesehatan Proyek
| Metrik | Skor / Status | Keterangan |
|---|---|---|
| **Kesesuaian Fitur Pokok** | **95%** | 6 MCP Tools dan Stdio Server terimplementasi dan berfungsi penuh. |
| **Kerapian Arsitektur Gateway** | **100%** | Orthogonal, tidak bentrok dengan `custom-bigquery-mcp`. |
| **Kebersihan Kredensial & Git** | **100%** | `.auth/` dan `screenshots/` terisolasi ketat di `.gitignore`. |
| **Kompilasi & Build TypeScript** | **100%** | `npm run build` sukses tanpa error tipe. |
| **Cakupan Pengujian Unit (Unit Test Coverage)** | **60%** | 10 unit test lulus, namun tool browser/drive belum memiliki mock test. |
| **Integritas Kode (Bebas Hardcode)** | **70%** | Ditemukan ID & fallback nama tabel hardcoded di `browserService.ts`. |

---

## 2. Matriks Rencana vs Realitas (*Plan vs Reality Matrix*)

| Komponen / Fitur di Plan | Realitas di Kode Sumber | Status | Catatan Audit |
|---|---|---|---|
| **Inisialisasi Git** | Repositori aktif di branch `main`, 4 commit bersih. | ✅ Selesai | Kredensial `.auth/storageState.json` terlindungi. |
| **Skema Manifest Zod** ([src/types/manifest.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/types/manifest.ts)) | Lengkap (Dashboard, Page, Widget, Style, DataSource, 2-tier calc fields). | ✅ Selesai | Mendukung `alias` (`df5`) dan tipe widget baru. |
| **Manifest Service** ([src/services/manifestService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/manifestService.ts)) | Implementasi load, save, dan list manifest YAML. | ✅ Selesai | Teruji via unit test `tests/manifest.test.ts`. |
| **Playwright RPC Crawler** ([src/services/browserService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/browserService.ts)) | Intersepsi `getReport`, `getSchema`, `batchedDataV2`. | ⚠️ Utang Teknis | Berjalan sukses, namun ada ID & nama tabel hardcoded (lihat Bagian 3). |
| **Google Drive API Search** ([src/services/googleApiService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/googleApiService.ts)) | Pencarian via Drive API + fallback lokal. | ✅ Selesai | Fallback ke manifest lokal bekerja jika ADC belum disetup. |
| **Tool: `search_reports`** | Terpasang di `src/tools/searchReports.ts`. | ✅ Selesai | Dual output Markdown + JSON. |
| **Tool: `inspect_dashboard_structure`** | Terpasang di `src/tools/inspectDashboard.ts`. | ✅ Selesai | Otomatis memperbarui manifest YAML. |
| **Tool: `get_dashboard_context`** | Terpasang di `src/tools/getDashboardContext.ts`. | ✅ Selesai | Respon kilat (< 50ms) dari berkas lokal. |
| **Tool: `query_dashboard_metric`** | **Diganti** menjadi `get_widget_query` di [src/tools/getWidgetQuery.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/getWidgetQuery.ts). | 🔄 Modifikasi Strategis | Disesuaikan agar tidak bentrok dengan `custom-bigquery-mcp`. |
| **Tool: `generate_report_url`** | Terpasang di `src/tools/generateReportUrl.ts`. | ✅ Selesai | Pemetaan otomatis kolom `event_type` $\rightarrow$ `df5`. |
| **Tool: `capture_dashboard_snapshot`** | Terpasang di `src/tools/captureSnapshot.ts`. | ✅ Selesai | Menghasilkan tangkapan layar PNG. |
| **Server Stdio Entry Point** ([src/index.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/index.ts)) | Server MCP aktif dengan transport Stdio resmi. | ✅ Selesai | Logging khusus `stderr` terverifikasi. |

---

## 3. Temuan Kritis: Apa yang Dibangun Kurang Tepat? (*What Did We Build Wrong?*)

### ⚠️ Temuan 1: Nilai Tertanam (*Hardcoded Values*) pada `browserService.ts`
Di dalam berkas [src/services/browserService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/browserService.ts), ditemukan nilai hardcoded yang berisiko jika crawler membedah dashboard lain di luar `56f29b51-79b3-4ee6-a820-a1999e238ac5`:
1. **Baris 106-110:**
   ```typescript
   let bqProject = 'unknown_project';
   let bqRegion = 'asia-southeast2';
   let bqDataset = 'default';
   let bqTable = 'agent_events'; // <--- HARDCODED DEFAULT
   ```
   *Dampak:* Jika RPC `batchedDataV2` tidak menyertakan URL job, nama tabel akan selalu dianggap `agent_events`.
2. **Baris 196:**
   ```typescript
   data_source_id: '843d3814-fda1-4bea-a94b-603fd3aa29af', // <--- HARDCODED ID
   ```
   *Dampak:* ID sumber data tidak diambil secara dinamis dari `reportConfig.report.resource.datasourceAlias` atau konfigurasi komponen, melainkan dipatok ke ID dataset workshop Devfest.

### ⚠️ Temuan 2: Berkas Yatim Piatu (*Orphaned File*) `sqlSanitizer.ts`
- Berkas [src/utils/sqlSanitizer.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/utils/sqlSanitizer.ts) dibuat untuk memproteksi eksekusi BigQuery langsung di server ini.
- Setelah kita mencopot `bigqueryService.ts` dan mengubah tool menjadi `get_widget_query`, `sqlSanitizer.ts` **tidak lagi diimpor oleh berkas manapun di `src/`**.
- Satu-satunya yang mengimpor berkas ini adalah test fixture [tests/sqlSanitizer.test.ts](file:///Users/OUT2305/Repo/data-studio-mcp/tests/sqlSanitizer.test.ts).
- *Rekomendasi:* Entah manfaatkan `validateReadOnlySql` di dalam `getWidgetQuery.ts` sebelum mengembalikan SQL ke user/gateway, atau hapus berkas ini agar tidak menjadi dead-code.

### ⚠️ Temuan 3: Akumulasi Skrip Percobaan (*Scratch Scripts Sprawl*)
Direktori `scripts/` memuat 8 berkas skrip:
- `auth-login.ts` *(Penting & Aktif: digunakan untuk login Google)*.
- `spike-inspect.ts`, `test-editor.ts`, `dump-report.ts`, `dump-all-rpc.ts`, `parse-components.ts`, `inspect-ds.ts`, `inspect-ds-list.ts` *(Skrip percobaan Fase 0)*.
- *Dampak:* Skrip-skrip ini tidak berdampak buruk pada build `dist/` karena sudah dikecualikan di `tsconfig.json`, namun berpotensi membingungkan developer lain yang membaca repositori jika tidak dirapikan atau dipindahkan ke folder `scripts/spike/`.

---

## 4. Kesenjangan Cakupan Pengujian (*Test Coverage Gap*)

Saat ini terdapat **10 test case** yang berjalan sukses di `tests/`:
* `tests/manifest.test.ts` (2 tests) — Validasi skema Zod dan parser YAML.
* `tests/sqlSanitizer.test.ts` (4 tests) — Validasi query read-only.
* `tests/getWidgetQuery.test.ts` (2 tests) — Validasi peracikan SQL dan substitusi alias.
* `tests/generateReportUrl.test.ts` (2 tests) — Validasi URL Linking API.

### Yang Belum Memiliki Unit Test Otomatis:
1. `src/tools/searchReports.ts`: Belum ada unit test mock untuk verifikasi fallback katalog saat Drive API offline.
2. `src/tools/inspectDashboard.ts`: Belum ada unit test mock untuk verifikasi respons tool saat `browserService` melempar exception.
3. `src/tools/captureSnapshot.ts`: Belum ada unit test mock untuk verifikasi parameter generator URL screenshot.
4. `src/tools/getDashboardContext.ts`: Belum memiliki file `getDashboardContext.test.ts` tersendiri (meskipun sudah diverifikasi sukses lewat live stdio).

---

## 5. Rencana Perbaikan Prioritas (*Actionable Remediation Plan*)

Untuk menutup kesenjangan hasil audit di atas, langkah-langkah perbaikan yang disarankan adalah:

1. **Refactor `src/services/browserService.ts`:**
   - Ambil `data_source_id` secara dinamis dari `reportConfig.report?.resource?.datasourceAlias?.[0]?.datasourceId` atau `c.propertyConfig?.componentProperty?.datasourceId`.
   - Gunakan nama sumber data aktual dari `getClaimedDatasources` alih-alih fallback hardcoded `agent_events`.
2. **Koneksikan `sqlSanitizer.ts`:**
   - Pasang `validateReadOnlySql(sql)` di dalam `getWidgetQuery.ts` sebelum mengembalikan query. Ini memberi nilai tambah keamanan (*defense in depth*) agar query yang diserahkan ke `custom-bigquery-mcp` dipastikan 100% read-only.
3. **Tambahkan Mock Unit Tests:**
   - Buat unit test untuk `getDashboardContext.ts` dan `searchReports.ts` menggunakan mock `ManifestService`.
4. **Organisasi Direktori `scripts/`:**
   - Pindahkan skrip uji coba Fase 0 ke folder `scripts/spike/` dan pertahankan `scripts/auth-login.ts` di root `scripts/`.
