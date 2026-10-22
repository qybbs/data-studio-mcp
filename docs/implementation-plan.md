# Rencana Implementasi: Data Studio MCP (`data-studio-mcp`)

Dokumen ini merinci rencana teknis dan arsitektur untuk membangun **`data-studio-mcp`** berdasarkan spesifikasi pada [prd.md](file:///Users/OUT2305/Repo/data-studio-mcp/docs/prd.md) serta temuan empiris tervalidasi pada **Fase 0 (Spike & Validasi AST)**.

---

## Deskripsi Sasaran (*Goal Description*)

Membangun server **Model Context Protocol (MCP)** berbasis Node.js & TypeScript yang berfungsi sebagai jembatan cerdas antara AI Agent (Claude Desktop, Antigravity IDE, Cursor) dengan dashboard Google Data Studio (Looker Studio). 

Server ini menerapkan arsitektur **Triad Hibrida**:
1. **Penemuan Aset:** Menggunakan Google Data Studio / Drive API untuk mencari laporan.
2. **Inspeksi Struktural Otomatis (Network RPC Interception):** Perayap Playwright yang mengintersepsi RPC resmi Google (`getReport`, `getSchema`, `batchedDataV2`) untuk mengekstrak AST komponen, formula calculated field, URL parameter alias, dan metadata sumber data BigQuery (Project, Region, Dataset, Tabel, SQL) secara deterministik ke dalam Manifest YAML.
3. **Mesin Manifest Semantik:** Penyimpan definisi metrik, formula kalkulasi, dimensi, dan rentang tanggal tanpa halusinasi.
4. **Eksekusi Data Ground-Truth:** Menjalankan query SQL *read-only* langsung ke BigQuery.
5. **Validator Visual & Linking:** Screenshot Playwright dan generator URL parameter filter berbasis alias kontrol (`params={...}`).

---

## Tinjauan Pengguna & Sesi Browser (*Auth & Session Guardrails*)

> [!IMPORTANT]
> **Kredensial Google Cloud & Sesi Browser Terisolasi:**
> 1. **BigQuery & Google API:** Menggunakan Application Default Credentials (ADC) atau file `service-account.json`. Kredensial GCP lokal dapat disiapkan via `gcloud auth application-default login`.
> 2. **Sesi Browser Terisolasi (`.auth/storageState.json`):**
>    - Login dilakukan sekali melalui helper script `npm run auth:login` yang meluncurkan Google Chrome sistem (`channel: 'chrome'`) dengan bypass deteksi bot (`--disable-blink-features=AutomationControlled` dan `ignoreDefaultArgs: ['--enable-automation']`).
>    - Sesi cookies tersimpan secara terisolasi di `.auth/storageState.json` tanpa menyentuh profil browser Chrome harian.
>    - Sesi ini dapat digunakan secara headless oleh Playwright untuk mengakses dashboard internal secara berkelanjutan tanpa terbentur login wall Google.

> [!NOTE]
> **Protokol Stdio Logging:**
> Pada server MCP berbasis stdio, `stdout` khusus digunakan untuk pesan protokol JSON-RPC. Semua logging aplikasi wajib diarahkan ke `stderr` (`console.error` / `utils/logger.ts`) agar tidak merusak komunikasi klien MCP.

---

## Keputusan Arsitektur (*Agreed Decisions*)

1. **Ekstraksi Berbasis Network RPC Interception (Bukan Scraping DOM Rentan):**
   - **`getReport`:** Menyediakan seluruh AST kanvas (daftar halaman, komponen `simple-table`, `kpi-metric`, `dimension-filter`, `simple-daterangepicker`, `simple-description`, bounding box, serta formula kalkulasi chart-level).
   - **`getSchema`:** Menyediakan seluruh skema data source BigQuery, tipe data kolom, dan field kalkulasi data-level (`calc_...`).
   - **`batchedDataV2`:** Menyediakan Project ID BigQuery, Region, serta query metadata aktual (`biJobUrl`).
   *Pendekatan ini 100% deterministik, berbasis payload JSON Google, dan kebal terhadap perubahan CSS selector/DOM.*

2. **Jaminan Read-Only Berlapis:**
   - Playwright context beroperasi dalam mode pembacaan (*read-only*).
   - BigQuery Service memvalidasi query SQL dan secara ketat menolak mutasi (`INSERT`, `UPDATE`, `DROP`, `DELETE`, `ALTER`).

3. **Penanganan Formula Dua Tingkat (Calculated Fields):**
   - **Chart-Level:** Diekstrak dari `getReport` $\rightarrow$ `conceptDefs[].queryTimeTransformation.dataTransformation.textFormula` (contoh: `UPPER(t0._event_type_)`).
   - **Data Source-Level:** Diekstrak dari `getSchema` $\rightarrow$ `dimensions[]` (contoh: ID `calc_j0l5kfel8d`, nama `event_status`, `isAutoField: false`).

4. **Deep-Linking Otomatis Berbasis Alias Kontrol:**
   - Komponen kontrol seperti dropdown (`dimension-filter`) menyediakan properti `alias` internal (misalnya `df5`).
   - Tool `generate_report_url` menyusun parameter resmi Looker Studio Linking API:
     `https://datastudio.google.com/reporting/<id>?params={"df5":"<VALUE>"}`.

---

## Rencana Perubahan (*Proposed Changes*)

### Fase 0: Eksperimen Spike & Validasi AST (STATUS: SELESAI / 100% VALIDATED)
- Telah berhasil menguji dashboard live `https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5`.
- Berhasil melewati bot detection Google dan menyimpan sesi aktif di `.auth/storageState.json`.
- Menangkap payload lengkap di `screenshots/getReport-dump.json` dan `screenshots/all-rpc-dump.json`:
  - 5 komponen kanvas terdeteksi secara presisi (Table, Scorecard, Dropdown Filter, Date Picker, Title).
  - Calculated field chart-level (`upper_event_type`) dan data-level (`event_status`) berhasil dibedah.
  - Project BigQuery (`devfest-workshop-479805`), region (`asia-southeast2`), dan tabel (`agent_events`) terkonfirmasi via `batchedDataV2`.
- Telah tersusun file manifest acuan nyata di [56f29b51-79b3-4ee6-a820-a1999e238ac5.yaml](file:///Users/OUT2305/Repo/data-studio-mcp/manifests/56f29b51-79b3-4ee6-a820-a1999e238ac5.yaml).

---

### Fase 1: Inisialisasi Proyek & Konfigurasi TypeScript

Menginisialisasi repositori dengan struktur TypeScript modern (ESM, Node 20 LTS) dan dependensi MCP standar.

#### `package.json`
- Menentukan `"type": "module"`.
- Dependensi utama:
  - `@modelcontextprotocol/sdk`: Protokol inti MCP (stdio server).
  - `playwright`: Otomasi browser untuk intercept RPC dan snapshot visual.
  - `@google-cloud/bigquery`: Eksekusi query *read-only* ground truth.
  - `googleapis`: Integrasi Data Studio / Google Drive API.
  - `yaml`: Parser dan dumper YAML untuk file manifest.
  - `zod`: Validasi skema runtime untuk manifest dan input argumen MCP tool.
  - `dotenv`: Pengelolaan environment variables.
- Dev dependensi: `typescript`, `@types/node`, `tsx` (development), `vitest` (unit testing).

#### `tsconfig.json`
- Target `ES2022`, module `NodeNext`, moduleResolution `NodeNext`.
- Strict mode aktif (`"strict": true`).

---

### Fase 2: Modul Tipe & Skema Manifest (`src/types/`)

#### [NEW] [src/types/manifest.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/types/manifest.ts)
- Mendefinisikan Zod Schema & TypeScript Interface untuk file `manifests/{dashboard_id}.yaml`:
  - `DashboardManifestSchema`: Dashboard ID, judul, URL, `data_source` (project, dataset, table, region, `schema`, `extracted_via`), `global_style`.
  - `PageSchema`: `page_id`, `page_number`, `title`, `description`, `widgets`.
  - `WidgetSchema`: `widget_id`, `title`, `type` (`table`, `scorecard`, `dropdown_filter`, `date_range_picker`, `text_box`, dll.), `alias` (untuk kontrol), `dimensions`, `metrics`, `sort`, `limit`, `sql_query`, dan blok `style` (posisi x, y, width, height, border, font).

---

### Fase 3: Layanan Inti (*Core Services*) (`src/services/`)

#### [NEW] [src/services/manifestService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/manifestService.ts)
- `loadManifest(dashboardId: string)`: Membaca dan memvalidasi file YAML manifest dari folder `manifests/`.
- `saveManifest(manifest: DashboardManifest)`: Menyimpan atau memperbarui file YAML manifest dengan formatting rapi.
- `listManifests()`: Me-list semua dashboard yang sudah memiliki manifest lokal.

#### [NEW] [src/services/bigqueryService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/bigqueryService.ts)
- Wrapper klien `@google-cloud/bigquery`.
- `executeMetricQuery(sql: string, params: Record<string, any>)`: Menjalankan query dengan parameter sanitasi tanggal (`@start_date`, `@end_date`) dan parameter kontrol filter (misal `@df5`).
- Menerapkan pengaman *read-only* (mencegah `INSERT`, `UPDATE`, `DROP`, `DELETE`, `ALTER`).

#### [NEW] [src/services/browserService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/browserService.ts)
- Mengelola Playwright Chromium dengan sesi `.auth/storageState.json`.
- **`inspectDashboard(url: string)` (Network RPC Interceptor):**
  - Mengunjungi URL dashboard secara headless.
  - Mengintersepsi `getReport`, `getSchema`, dan `batchedDataV2`.
  - Memetakan AST komponen kanvas, alias filter, formula calculated fields, dan BigQuery connection metadata ke dalam objek `DashboardManifest`.
- **`captureSnapshot(url: string, pageId?: string, params?: Record<string, any>)`:**
  - Mengambil tangkapan layar beresolusi tinggi (PNG) untuk validasi visual layout.

#### [NEW] [src/services/googleApiService.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/services/googleApiService.ts)
- Integrasi Google Drive API & Data Studio API untuk mencari laporan (`/assets:search`) dan membaca izin akses.

---

### Fase 4: Implementasi Tool MCP (`src/tools/`)

Setiap tool mengimplementasikan protokol MCP resmi (nama, deskripsi, input schema Zod, dan handler):

1. **`search_reports` ([src/tools/searchReports.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/searchReports.ts)):**
   - Mencari laporan Data Studio berdasarkan kata kunci judul/pemilik melalui API atau katalog manifest lokal.
2. **`inspect_dashboard_structure` ([src/tools/inspectDashboard.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/inspectDashboard.ts)):**
   - Menjalankan Playwright RPC interceptor untuk membedah dashboard live, mengekstrak struktur AST & BigQuery data source otomatis, dan menyimpan draf file `manifests/{id}.yaml`.
3. **`get_dashboard_context` ([src/tools/getDashboardContext.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/getDashboardContext.ts)):**
   - Mengembalikan seluruh konteks semantik dashboard: jumlah halaman, widget, formula kalkulasi, kolom tanggal, filter alias, dan style visual dari manifest YAML.
4. **`query_dashboard_metric` ([src/tools/queryDashboardMetric.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/queryDashboardMetric.ts)):**
   - Mengambil template query SQL dari manifest widget, menyuntikkan parameter tanggal/filter, mengeksekusi ke BigQuery, dan mengembalikan data angka presisi tinggi (Zero Numerical Hallucination).
5. **`generate_report_url` ([src/tools/generateReportUrl.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/generateReportUrl.ts)):**
   - Membentuk URL Linking API resmi dengan parameter filter terstruktur (`?params={"<alias>":"<value>"}`) berbasis alias kontrol yang tersimpan di manifest.
6. **`capture_dashboard_snapshot` ([src/tools/captureSnapshot.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/tools/captureSnapshot.ts)):**
   - Menghasilkan tangkapan layar visual untuk keperluan validasi tata letak.

---

### Fase 5: Server Entry Point & Utilitas (`src/`)

#### [NEW] [src/index.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/index.ts)
- Inisialisasi `Server` dari `@modelcontextprotocol/sdk/server/index.js`.
- Registrasi semua tool (ListToolsRequestSchema, CallToolRequestSchema).
- Menghubungkan ke `StdioServerTransport`.
- Penanganan sinyal terminasi (`SIGINT`, `SIGTERM`) untuk membersihkan instance browser secara elegan.

#### [NEW] [src/utils/logger.ts](file:///Users/OUT2305/Repo/data-studio-mcp/src/utils/logger.ts)
- Utilitas logging yang secara ketat hanya menulis ke `process.stderr` agar format JSON-RPC pada `stdout` tetap bersih dan valid.

---

## Rencana Verifikasi (*Verification Plan*)

### 1. Pengujian Otomatis (*Automated Tests*)

- **Validasi Skema YAML Manifest:**
  Menjalankan test suite Vitest untuk memastikan `DashboardManifestSchema` memvalidasi file `manifests/56f29b51-79b3-4ee6-a820-a1999e238ac5.yaml` secara sempurna:
  ```bash
  npm test
  ```
- **Build & Kompilasi TypeScript:**
  Memastikan kompilasi bersih tanpa error:
  ```bash
  npm run build
  ```
- **Validasi Sanitasi Query SQL:**
  Unit test pada `bigqueryService` untuk memastikan query mutasi berbahaya (`DELETE`, `DROP`, `ALTER`) ditolak sebelum dieksekusi.

### 2. Verifikasi Manual (*Manual Verification*)

1. **Uji Coba Server via Inspector MCP:**
   ```bash
   npx @modelcontextprotocol/inspector node dist/index.js
   ```
2. **Uji Coba Tool `get_dashboard_context`:**
   Memanggil tool dengan ID `56f29b51-79b3-4ee6-a820-a1999e238ac5` dan memastikan konteks (5 widget, formula calculated fields, style, alias `df5`) kembali instan (< 50ms).
3. **Uji Coba Tool `generate_report_url`:**
   Memanggil tool dengan filter `event_type = 'TOOL_ERROR'` dan memverifikasi terbentuknya URL:
   `https://datastudio.google.com/reporting/56f29b51-79b3-4ee6-a820-a1999e238ac5?params={"df5":"TOOL_ERROR"}`.
4. **Uji Coba Tool `inspect_dashboard_structure`:**
   Menjalankan tool terhadap live URL untuk memverifikasi kemampuan perayap Playwright memperbarui manifest secara otomatis.
