# Puraloka Suite — ERP Master Plan
**Versi**: 2.0  
**Dibuat**: 2026-06-15  
**Diupdate**: 2026-06-17  
**Status**: Active — Phase 1–6 selesai, Phase 7 (GL) dan Modul 9–13 belum dimulai

---

## Visi

ERP konstruksi terintegrasi untuk kontraktor menengah Indonesia, mencakup project management, mandor payroll, client invoicing, procurement, inventory, reporting, dan mobile field operations — semuanya dalam satu platform terpadu untuk **CV Puraloka Persada**.

---

## 8 Modul ERP

### Modul 1 — Project Management
**Priority**: MUST HAVE | **Effort**: L | **Status**: ✅ SELESAI  
**Dependencies**: -

**Must Have**:
- CRUD proyek (tambah, edit, detail, ubah status)
- List proyek: filter status & search
- Detail proyek: info kontrak, klien, PM, nilai kontrak
- Termin management: list, update status, catat pembayaran
- Milestone tracking: tambah, update, tandai selesai
- Progress log harian: input progress % dan foto
- Upload dokumen proyek
- Invoice generation dari termin/komisi
- Catat pembayaran masuk dari klien
- Approve/tolak kasbon mandor dari view proyek

**Nice to Have**:
- S-Curve chart (planned vs actual progress)
- Gantt chart sederhana
- Before/after photo comparison
- Berita acara digital (PDF)
- Duplicate proyek sebagai template
- Client portal link unik per proyek

**DB**: `projects`, `termin_schedules`, `invoices`, `payments`, `milestones`, `progress_logs`, `project_photos`, `documents` — semua sudah ada

---

### Modul 2 — Financial Management
**Priority**: MUST HAVE | **Effort**: M | **Status**: ✅ SELESAI  
**Dependencies**: Modul 1

**Must Have**:
- Dashboard keuangan: total kontrak, kas masuk, kas keluar, outstanding
- Invoice list dengan filter status (draft/sent/paid/overdue)
- Generate & kirim invoice (PDF)
- Catat pembayaran masuk
- Expense report per proyek (model komisi)
- Tax records (PPh Final 2%, PPN 11%)
- Cashflow projection sederhana
- RAB (Rencana Anggaran Biaya) per proyek
- Realisasi vs RAB comparison

**Nice to Have**:
- Retention tracking
- Profit margin per proyek
- Export laporan ke Excel / PDF
- Integrasi ke supplier invoice (dari modul procurement)

**DB**: Semua tabel Finance sudah ada. RAB mungkin perlu tabel `rab_items` baru.

---

### Modul 3 — Mandor & Workforce
**Priority**: MUST HAVE | **Effort**: M | **Status**: ✅ SELESAI  
**Dependencies**: Modul 1

**Must Have**:
- List mandor assignments per proyek
- Work scopes per mandor (harian/borongan/progress_pct)
- Input upah mingguan (harian)
- Log progress kerja per scope (untuk progress_pct)
- Kasbon: ajukan, approve/tolak, list per mandor
- Borongan settlement: input nilai, konfirmasi selesai
- History pembayaran per mandor

**Nice to Have**:
- Mandor performance tracking
- Multi-proyek mandor view
- Notifikasi kasbon mendekati limit 80%
- Export rekap upah ke PDF/Excel

**DB**: Semua tabel Mandor sudah ada

---

### Modul 4 — E-Procurement & Inventory
**Priority**: MUST HAVE (modul baru dari BRD) | **Effort**: XL | **Status**: ✅ SELESAI (Migrations 039-042, 058 applied)  
**Dependencies**: Modul 1, Modul 2

**Must Have**:
- Material catalog: master daftar material dengan satuan & kategori
- Stock per proyek: saldo stok material per site
- Stock opname digital (web + mobile)
- Material Request (MR): pengajuan kebutuhan material dengan workflow approval
- Approval workflow: Keuangan verifikasi anggaran → Direktur approve jika besar
- Purchase Order (PO) digital: auto-generate setelah approved, nomor unik
- Goods receipt: konfirmasi penerimaan material + upload foto surat jalan
- Auto-update stok setelah goods receipt dikonfirmasi
- Supplier management: data toko bangunan, mekanisme pembayaran
- Supplier invoice tracking: bon, transfer, COD — dengan status lunas/outstanding
- Alert jatuh tempo bon supplier (H-3 dan H-1)
- Konfirmasi pembayaran ke supplier

**Nice to Have**:
- Minimum stock threshold dengan auto-notifikasi kritis
- Histori pemakaian material per fase pekerjaan
- Perbandingan harga antar supplier
- Export laporan pengadaan (PDF/Excel)
- Offline mode untuk input stok di lapangan (mobile)
- Kompresi foto otomatis sebelum upload
- Barcode scanner untuk material

**DB Baru (12 tabel)**:
```
material_categories, materials, project_stocks, stock_movements,
suppliers, material_requests, material_request_items,
purchase_orders, purchase_order_items,
goods_receipts, goods_receipt_items,
supplier_invoices, supplier_payments
```

**API Baru**: Lihat `docs/API_ENDPOINTS.md` — Phase 2

**Web Pages Baru**:
```
/procurement/materials
/procurement/requests
/procurement/requests/:id
/procurement/purchase-orders
/procurement/purchase-orders/:id
/procurement/suppliers
/procurement/invoices
/inventory/stocks
```

**Mobile Screens Baru**:
```
StockOpname, MaterialRequest, GoodsReceipt, StockAlert
```

---

### Modul 5 — Client Portal
**Priority**: NICE TO HAVE | **Effort**: M | **Status**: ✅ SELESAI  
**Dependencies**: Modul 1, Modul 2, RLS policies

**Must Have**:
- Portal read-only dengan link unik per proyek
- Lihat progress proyek secara real-time
- Lihat invoice dan status pembayaran
- Lihat foto dokumentasi lapangan
- Download dokumen (kontrak, berita acara)

**DB**: Tidak perlu tabel baru. Butuh RLS policies untuk role `client`.

---

### Modul 6 — Reporting & Analytics
**Priority**: MUST HAVE | **Effort**: M | **Status**: ✅ SELESAI  
**Dependencies**: Modul 1, 2, 3

**Must Have**:
- Dashboard home (sudah ada — pertahankan & enhance)
- Laporan proyek: progress, cashflow, expense
- Laporan keuangan: invoice, pembayaran, outstanding
- Laporan mandor: upah, kasbon per periode
- Laporan pengadaan: material usage, supplier performance
- Export PDF laporan mingguan proyek
- Export Excel semua laporan

**Nice to Have**:
- Draggable widget dashboard (react-grid-layout)
- Custom date range untuk semua laporan
- Email laporan otomatis (weekly digest)

---

### Modul 7 — System & Administration
**Priority**: MUST HAVE | **Effort**: S | **Status**: 🟡 Sebagian (auth + notifikasi + RLS selesai; audit trail viewer belum)  
**Dependencies**: -

**Must Have**:
- User management: list, tambah, edit role ✅
- Google OAuth login (provider aktif di Supabase, belum di-wire ke frontend)
- Auto token refresh ✅ (sudah diimplementasikan)
- Notification center ✅
- RLS policies (saat ini DISABLED — wajib aktifkan sebelum production)

**Nice to Have**:
- Remote config/CMS untuk mobile app
- Audit log viewer
- System health dashboard

---

### Modul 8 — Mobile App
**Priority**: MUST HAVE untuk Procurement | **Effort**: XL | **Status**: 🟡 Phase 1 Selesai (Expo 53 + expo-router + auth + 7 screens); Phase 2 belum  
**Dependencies**: Modul 4 (untuk Phase 1), Modul 1, 3 (untuk Phase 2)

**Phase 1 (terkait E-Procurement)**:
- Login screen
- Home/dashboard sederhana
- Stock opname harian
- Material request form
- Goods receipt + foto upload
- Push notification (stok kritis, MR approved/rejected)

**Phase 2 (field operations)**:
- Input progress lapangan
- Upload foto dokumentasi
- Lihat kasbon & status
- Lihat detail proyek yang di-assign

**Nice to Have**:
- Offline mode dengan auto-sync
- Barcode scanner untuk material
- Signature digital untuk berita acara

---

## Roadmap Timeline

### FASE 0 — Stabilisasi (sudah selesai / ongoing)
- [x] Fix dashboard API 401 (token expiry edge cases)
- [x] Implementasi auto token refresh
- [x] Redesign UI ke light theme (#003366 accent)
- [ ] Wire Google OAuth ke frontend button
- [x] Fix hydration concerns (todayStr server/client)

### FASE 1 — Core ERP (Project + Finance + Mandor)
- [x] CRUD Proyek lengkap
- [x] Detail proyek: RAB, Kurva S, dokumen, milestone, progress log + foto
- [x] Halaman Keuangan: invoice, kasbon, expense view
- [x] Halaman Mandor: ringkasan, upah, kasbon, work scopes
- [x] User Management
- [x] Sistem Notifikasi (role-based, interactive, Web Push)
- [x] Halaman Laporan: rekap per proyek/mandor/keuangan, export Excel
- [x] Manajemen Kas: akun kas, transfer, pengeluaran proyek
- [ ] Export PDF laporan
- [ ] Portal Klien (read-only)

### FASE 2 — E-Procurement (Modul Baru dari BRD)
- [ ] DB migrations: 039–044 (material, supplier, procurement workflow)
- [ ] Material catalog & master data
- [ ] Supplier management
- [ ] Material Request workflow (web)
- [ ] Purchase Order generation
- [ ] Goods receipt + foto upload (web)
- [ ] Supplier invoice & payment tracking
- [ ] Alert jatuh tempo supplier

### FASE 3 — Mobile App
- [ ] Setup React Native + Expo properly
- [ ] Auth flow mobile
- [ ] Stock opname screen
- [ ] Material request form
- [ ] Goods receipt + kamera
- [ ] Push notifications

### FASE 4 — Advanced Features
- [ ] S-Curve & Gantt chart enhancements
- [ ] Draggable dashboard widgets (react-grid-layout)
- [ ] Offline mode mobile dengan auto-sync
- [ ] VAPID keys setup (Web Push aktif)
- [ ] Export PDF laporan
- [ ] Portal Klien (read-only)

### FASE 5 — Supply Chain Enhancement + Governance
- [ ] RAB hard-guard pada Material Request (Modul 9a) — validasi kuota sebelum submit MR
- [ ] PO delivery ke WhatsApp / Email vendor (Modul 9b)
- [ ] Opname hard-lock sebelum rilis pembayaran borongan/progress_pct (Modul 11a)
- [ ] Digital contract signing internal — TTD mandor & PM (Modul 11b)
- [ ] RLS policies implementasi penuh semua tabel (Modul 13a)
- [ ] Audit trail enhancement: diff viewer, severity, IP logging (Modul 13b)
- [ ] Halaman `/admin/audit-log` — filter, timeline, export CSV

### FASE 6 — Asset & Tools Management
- [ ] Master data aset (alat berat, alat tangan, kendaraan, scaffolding) (Modul 12)
- [ ] Log mutasi alat antar proyek
- [ ] Kalkulasi amortisasi bulanan (cron job / Supabase Edge Function)
- [ ] Link ke General Ledger jika GL sudah ada

### FASE 7 — General Ledger (FASE PALING BESAR — kerjakan terakhir)
> ⚠️ Jangan mulai ini sebelum semua modul 1–12 stabil dan divalidasi oleh akuntan.

- [ ] Phase GL-1: Setup Chart of Accounts (CoA) + UI jurnal manual
- [ ] Phase GL-2: Auto-jurnal untuk transaksi baru (kasbon, payment, PO)
- [ ] Phase GL-3: Laporan finansial (Neraca, L/R, Arus Kas) sesuai PSAK
- [ ] Phase GL-4: Migrasi data historis + opening balance

---

## 13 Modul ERP — Ringkasan Lengkap

| # | Modul | Priority | Effort | Status |
|---|-------|----------|--------|--------|
| 1 | Project Management | Must | L | ✅ Done |
| 2 | Financial Management | Must | M | ✅ Done (kecuali PDF) |
| 3 | Mandor & Workforce | Must | M | ✅ Done |
| 4 | E-Procurement & Inventory | Must | XL | 🔴 Not Started |
| 5 | Client Portal | Nice | M | 🔴 Not Started |
| 6 | Reporting & Analytics | Must | M | ✅ Done (Excel), PDF pending |
| 7 | System & Administration | Must | S | ✅ Done |
| 8 | Mobile App | Must | XL | 🔴 Scaffolded |
| 9 | SCM Enhancement (RAB guard + PO delivery) | Must | M | 🔴 Not Started |
| 10 | Automated General Ledger | Must | XL | 🔴 Fase 7 — kerjakan terakhir |
| 11 | Subkontraktor Lifecycle (opname lock + e-sign) | Must | M | 🔴 Not Started |
| 12 | Asset & Tools Management | Nice | M | 🔴 Not Started |
| 13 | Enterprise Governance (RLS + Audit) | Must | M | 🔴 Not Started |

---

## Database Migration Plan

### Migrations yang sudah ada (001–038)
Lihat `docs/DATABASE_SCHEMA.md` untuk detail lengkap.

### Migrations baru yang dibutuhkan

| File | Tabel / Perubahan | Phase |
|------|-------------------|-------|
| `039_material_management.sql` | `material_categories`, `materials`, `project_stocks`, `stock_movements` | Fase 2 |
| `040_supplier_management.sql` | `suppliers`, `supplier_invoices`, `supplier_payments` | Fase 2 |
| `041_procurement_workflow.sql` | `material_requests`, `material_request_items`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items` | Fase 2 |
| `043_rab_material_tracking.sql` | `project_rab_materials`, ALTER `materials` + `purchase_orders` | Fase 5 |
| `044_field_opname_reports.sql` | `field_opname_reports`, ALTER `progress_payments` + `work_scopes` | Fase 5 |
| `045_asset_management.sql` | `assets`, `asset_movements`, `asset_depreciation_logs` | Fase 6 |
| `046_audit_trail_enhancement.sql` | ALTER `audit_logs` (diff, severity, ip, user_agent) | Fase 5 |
| `047_general_ledger.sql` | `accounts` (CoA), `journal_entries`, `journal_entry_lines` | Fase 7 |
| `042_rls_policies.sql` | RLS enable + policies semua tabel | Fase 5 |

---

## Modul 9 — SCM Enhancement (Perpanjangan Modul 4)
**Priority**: MUST HAVE | **Effort**: M | **Status**: NOT STARTED  
**Dependencies**: Modul 4 selesai

### 9a. RAB Hard-Guard pada Material Request
Saat PM membuat Material Request, sistem **TOLAK** submission jika:
```
total_yang_sudah_di_MR + volume_MR_baru > volume_RAB
```
Override hanya boleh oleh Admin dengan alasan tertulis → tercatat di audit log.

**DB Baru**: `project_rab_materials` + ALTER `materials` (kolom `rab_unit_cost`)  
**API Baru**: `GET /api/v1/projects/:id/rab-materials`, `POST /api/v1/projects/:id/rab-materials`, `GET /api/v1/material-requests/quota-check`

### 9b. PO Delivery ke WhatsApp / Email Vendor
- **WhatsApp**: generate `wa.me` deep-link dengan teks PO terformat + link public view PO
- **Email**: Supabase Edge Function + Resend API, attach PDF PO
- **DB**: ALTER `purchase_orders` tambah `whatsapp_sent_at`, `email_sent_at`, `public_view_token`

---

## Modul 10 — Automated General Ledger
**Priority**: MUST HAVE (untuk ERP profesional) | **Effort**: XL | **Status**: NOT STARTED  
**Dependencies**: SEMUA modul lain harus selesai dulu  
> ⚠️ Kerjakan di Fase 7 — TERAKHIR. Validasi CoA bersama akuntan/konsultan pajak sebelum implementasi.

### Chart of Accounts (CoA) Dasar
```
1000 Aset → 1100 Aset Lancar → 1110 Kas & Bank / 1120 Piutang & Uang Muka / 1310 Persediaan
1500 Aset Tetap → 1510 Peralatan / 1511 Akumulasi Penyusutan
2000 Liabilitas → 2110 Utang Supplier / 2120 Utang Upah / 2130 Utang Pajak
3000 Ekuitas → 3110 Modal / 3120 Laba Ditahan
4000 Pendapatan → 4110 Jasa Konstruksi / 4120 Termin / 4130 Retensi
5000 Beban Langsung → 5110 Upah Mandor / 5210 Material / 5310 Subkontraktor
5900 Overhead → 5910 Gaji Staf / 5920 Sewa / 5930 Utilitas
```

### Auto-Jurnal per Event Bisnis
| Event | Debit | Kredit |
|-------|-------|--------|
| Kasbon approved | 1122 Uang Muka Mandor | 1112 Kas Proyek |
| Kasbon settlement | 5110 Biaya Upah | 1122 Uang Muka Mandor |
| Invoice klien dibayar | 1111 Kas Kantor | 1121 Piutang Usaha |
| PO supplier lunas | 1310 Persediaan | 2110 Utang Supplier |
| Material dipakai | 5210 Biaya Material | 1310 Persediaan |

### Implementasi Bertahap (WAJIB urutan ini)
1. **GL-1**: CoA setup + UI jurnal manual + buku besar view
2. **GL-2**: Auto-jurnal kasbon, payment, PO — validasi debit = kredit
3. **GL-3**: Balance Sheet, P&L, Cash Flow sesuai PSAK
4. **GL-4**: Migrasi data historis + opening balance

**DB Baru**: `accounts`, `journal_entries`, `journal_entry_lines`  
**API Baru**: `GET /api/v1/accounting/balance-sheet`, `/profit-loss`, `/cash-flow`, `/general-ledger`, `/trial-balance`

---

## Modul 11 — Subkontraktor Lifecycle Enhancement
**Priority**: MUST HAVE | **Effort**: M | **Status**: NOT STARTED  
**Dependencies**: Modul 3 selesai

### 11a. Opname Hard-Lock sebelum Rilis Pembayaran
Untuk payment_system `borongan` dan `progress_pct`:
- PM WAJIB input Berita Acara Opname Fisik (foto + volume terukur) sebelum rilis dana
- API `POST /api/v1/mandor/progress-payments` akan reject jika tidak ada opname terverifikasi

**DB Baru**: `field_opname_reports` + ALTER `progress_payments` (kolom `opname_report_id`, `requires_opname`)

### 11b. Digital Contract Signing Internal
- Simpan gambar tanda tangan mandor & PM (canvas/touchscreen) sebagai PNG ke Supabase Storage
- Bukan integrasi PrivyID — cukup untuk kebutuhan internal
- PrivyID dipertimbangkan di Fase lanjut jika kontrak perlu kekuatan hukum formal

**DB**: ALTER `work_scopes` (kolom `contract_pdf_url`, `contract_signed_at`, `mandor_signature_url`, `pm_signature_url`, `contract_status`)

---

## Modul 12 — Asset & Tools Management
**Priority**: NICE TO HAVE | **Effort**: M | **Status**: NOT STARTED  
**Dependencies**: Tidak ada dependency kritis

**Fitur**:
- Master data aset: alat berat, alat tangan, kendaraan, scaffolding
- Log mutasi alat antar proyek (deploy/return/transfer/maintenance)
- Kalkulasi amortisasi bulanan via cron job (straight-line / double-declining)
- Link ke GL jika Modul 10 sudah ada
- Pastikan akuntan menyetujui metode penyusutan sebelum implementasi (implikasi pajak)

**DB Baru**: `assets`, `asset_movements`, `asset_depreciation_logs`

---

## Modul 13 — Enterprise Governance (Upgrade Modul 7)
**Priority**: MUST HAVE sebelum production | **Effort**: M | **Status**: NOT STARTED

### 13a. RLS Policies — Implementasi Penuh
Policy per role per tabel:
- **admin**: akses penuh semua tabel
- **pm**: hanya proyek yang di-assign + data turunannya
- **mandor**: hanya proyek + scope yang di-assign ke mereka
- **client**: hanya proyek milik client tersebut (via `clients.user_id`)

File: `db/migrations/042_rls_policies.sql`

### 13b. Audit Trail Enhancement
Upgrade tabel `audit_logs` yang sudah ada:
- Tambah `before_value`, `after_value`, `diff` (computed diff)
- Tambah `ip_address`, `user_agent`
- Tambah `severity` (`info` / `warning` / `critical`)
- Auto-notif ke admin jika severity = `critical`

Event CRITICAL yang wajib di-audit:
- Ubah nilai invoice/kontrak
- Hapus record pembayaran
- Approve/reject kasbon
- Ubah role user
- Override kuota RAB

### 13c. Audit Trail UI
Halaman `/admin/audit-log`:
- Filter by user, table, date range, severity
- Timeline view + diff viewer (before vs after)
- Export CSV/PDF untuk audit eksternal

---

## Non-Functional Requirements

| Item | Target |
|------|--------|
| API response time | < 500ms untuk semua GET |
| Mobile offline | Stok opname bisa diisi offline, sync saat online |
| File upload | Max 5MB dokumen, 2MB XLSX, kompresi foto di mobile |
| Auth token | Auto-refresh, 1 jam expiry |
| Pagination | Max 200 records per request |
| Concurrency | Semua list endpoints support AbortController |
