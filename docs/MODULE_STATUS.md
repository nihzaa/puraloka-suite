# Module Status Tracker

> ## ⚠️ DOKUMEN INI SUDAH BASI — jangan dipakai sebagai acuan status
>
> **Terakhir disentuh 2026-07-16.** Sejak itu ada 40+ migrasi dan lusinan modul
> baru; angka & centang di bawah TIDAK mencerminkan keadaan sekarang.
>
> Status per-menu yang terverifikasi ke kode: **[`ERP-KONTRAKTOR-TAKSONOMI-MENU.md`](./ERP-KONTRAKTOR-TAKSONOMI-MENU.md)**
> Daftar pekerjaan & prioritas: **[`ROADMAP.md`](./ROADMAP.md)**
>
> Dibiarkan sebagai riwayat, bukan dihapus — tapi jangan mengutipnya sebagai bukti.

**Last updated**: 2026-06-17

## Status Legend
🔴 Not Started | 🟡 In Progress | 🟢 Done | ⚪ Nice to Have / Future

---

## Web (Next.js — apps/web)

### Auth & System
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Login page (email/password) | 🟢 Done | Must | Berfungsi |
| Google OAuth button | 🟢 Done | Must | Wired ke Supabase |
| Auto token refresh | 🟢 Done | Must | Via Supabase + axios interceptor |
| Auth guard middleware | 🟢 Done | Must | Cookie-based |
| Dashboard hydration fix | 🟢 Done | Must | `useState`+`useEffect` untuk `todayStr` |

### Dashboard
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| KPI cards (data real) | 🟢 Done | Must | 4 KPI utama |
| Cashflow area chart | 🟢 Done | Must | 8 minggu rolling |
| Donut chart status proyek | 🟢 Done | Must | |
| Progress bar per proyek | 🟢 Done | Must | |
| Tabel invoice belum lunas | 🟢 Done | Must | |
| Alert invoice overdue | 🟢 Done | Must | |
| Period filter (30d/3m/6m/year/all) | 🟢 Done | Must | |
| Approve/tolak kasbon inline | 🟢 Done | Must | |
| Draggable widgets | ⚪ Future | Nice | react-grid-layout, Fase 4 |

### Proyek
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| List proyek | 🟢 Done | Must | Filter status + AbortController |
| Tambah proyek | 🟢 Done | Must | Modal form |
| Edit proyek | 🟢 Done | Must | |
| Detail proyek | 🟢 Done | Must | Lengkap |
| RAB section | 🟢 Done | Must | |
| Kurva S section | 🟢 Done | Must | |
| Milestone section | 🟢 Done | Must | CRUD + tandai selesai |
| Progress log + foto | 🟢 Done | Must | |
| Dokumen upload | 🟢 Done | Must | 5MB cap |
| Generate kontrak PDF | 🟢 Done | Must | |
| Pembayaran termin | 🟢 Done | Must | Upload bukti bayar |
| Approve kasbon mandor | 🟢 Done | Must | |
| S-Curve Gantt | ⚪ Future | Nice | Fase 4 |
| Duplicate proyek | ⚪ Future | Nice | |

### Keuangan
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Invoice list + filter | 🟢 Done | Must | |
| Kasbon lintas proyek | 🟢 Done | Must | |
| Expense view | 🟢 Done | Must | |
| Tab Arus Kas | 🟢 Done | Must | Unified cashflow, chart, tabel mutasi |
| Generate invoice PDF | 🟢 Done | Must | Tombol Download PDF di tabel invoice; @react-pdf/renderer + InvoicePDF component; line items, company profile, QR code |

### Kas Management
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Akun kas CRUD | 🟢 Done | Must | |
| Transfer dana | 🟢 Done | Must | |
| Pengeluaran proyek (nota) | 🟢 Done | Must | Multipart, 5MB |
| Saldo otomatis via trigger | 🟢 Done | Must | Migration 016, 020, 025 |

### Mandor
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Ringkasan mandor | 🟢 Done | Must | |
| Laporan upah mingguan | 🟢 Done | Must | |
| Kasbon ajukan/lihat | 🟢 Done | Must | |
| Penugasan + work scope | 🟢 Done | Must | |
| Rincian item pekerjaan | 🟢 Done | Must | 15 satuan, 12 kategori |
| Daftar tukang per mandor | 🟢 Done | Must | |
| Worker kasbon tracking | ⚪ Future | Nice | Fase lanjut |

### Laporan
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Rekap per proyek | 🟢 Done | Must | |
| Rekap per mandor | 🟢 Done | Must | |
| Rekap keuangan | 🟢 Done | Must | |
| Export Excel (XLSX) | 🟢 Done | Must | |
| Export PDF | 🟢 Done | Must | GET /api/v1/reports/export-pdf via PDFKit; laporan proyek, mandor, keuangan |

### Notifikasi
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| History page `/notifications` | 🟢 Done | Must | Timeline, filter, bulk |
| Dropdown panel (topbar) | 🟢 Done | Must | 30s polling badge |
| Approve/reject inline | 🟢 Done | Must | Kasbon & wage report |
| Web Push device | 🟢 Done | Must | VAPID keys sudah di-set di .env, lazy-init, graceful jika tidak ada subscription |

### User Management
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| List user | 🟢 Done | Must | Admin only |
| Tambah user (register) | 🟢 Done | Must | |
| Edit nama/telepon/role | 🟢 Done | Must | |
| Aktifkan/nonaktifkan | 🟢 Done | Must | |

### Klien (/klien)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| List klien + filter status | 🟢 Done | Must | Admin only |
| Tambah klien | 🟢 Done | Must | |
| Edit klien | 🟢 Done | Must | |
| Toggle aktif/nonaktif | 🟢 Done | Must | |
| clients.user_id auto-link by email | 🟢 Done | Must | Migration applied, 10 client ter-link ke user |

### Halaman Placeholder (sidebar)
| Halaman | Status | Priority | Notes |
|---------|--------|----------|-------|
| /kalender | 🟡 Placeholder | Should | Halaman kosong — kalender fungsional belum diimplementasikan |
| /audit | 🟡 Placeholder | Should | Halaman kosong — audit trail viewer belum diimplementasikan |
| /sistem | 🟡 Placeholder | Should | Halaman kosong — pengaturan sistem belum diimplementasikan |
| /pengaturan | 🟡 Placeholder | Must | Di sidebar, halaman ada tapi form belum diimplementasikan |

### E-Procurement / Pengadaan (Fase 2 — Done)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Material catalog | 🟢 Done | Must | Migration 039, API + UI tab Materials |
| Supplier management | 🟢 Done | Must | Migration 040, API + UI tab Supplier (detail + payment history) |
| Material Request workflow | 🟢 Done | Must | Migration 041, API + UI tab MR (submit/approve/reject) |
| Purchase Order | 🟢 Done | Must | Migration 041, API + UI tab PO (status flow + WA deep-link) |
| Goods receipt | 🟢 Done | Must | Migration 041, API + UI tab GR (confirm → trigger stok update) |
| Supplier invoice & payment | 🟢 Done | Must | Migration 040, API + UI tab Hutang Supplier (FIFO auto-alloc) |
| Stock per proyek | 🟢 Done | Must | Migration 039, API + UI tab Stok |
| Alert jatuh tempo supplier | 🟢 Done | Must | `/procurement/supplier-invoices/overdue` + banner di UI |
| Integrasi Pengadaan → Kas | 🟢 Done | Must | Migration 042: cash_account_id + DB trigger; UI dropdown sumber kas; dashboard cashflow include supplier outflow; /kas tampilkan "Bayar Supplier" |
| Catat pemakaian stok material | 🟢 Done | Must | POST /stocks/usage; tipe: usage/return/adjustment; validasi stok tidak negatif; role: admin+pm+mandor |
| Opname stok mingguan | 🟢 Done | Must | POST /stocks/opname; bulk reconciliation; skip selisih=0; role: admin+pm |
| Log arus mutasi per proyek | 🟢 Done | Must | UI: tabel log dengan badge warna per tipe, signed qty, nama pencatat |
| Laporan Pengadaan (tab ke-8) | 🟢 Done | Must | Sub-tab: Rekap Pembelian (date range, supplier/project filter, KPI, top supplier, PO table) + Aging Hutang (5 bucket, color-coded rows). Export Excel kedua sub-tab. |

### ERP Phase 1 — RAB Revamp (Migration 052)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| RAB komponen biaya (material/upah/alat/other %) | 🟢 Done | Must | Migration 052: kolom 4 pct + constraint total=0 atau 99.9-100.1 |
| Progress log dual mode (daily + detail) | 🟢 Done | Must | Migration 052: mode, rab_item_id, pct_completion; API recalculate project % pada mode=detail |
| Mandor ↔ RAB link (rab_category_id) | 🟢 Done | Must | Migration 052: work_scopes.rab_category_id optional FK |
| Gantt fields (planned_start/end, dependencies) | 🟢 Done | Must | Migration 052: rab_items kolom tambahan untuk Gantt Phase 4 |
| RAB section UI: kolom komponen + KomponenBar | 🟢 Done | Must | rab-section.tsx: toggle kolom, inline edit %, stacked bar visual |
| Progress log modal: mode toggle + RAB picker | 🟢 Done | Must | progress-log-modal.tsx: mode harian/detail, dropdown RAB item, preview dampak % |
| Mandor assign: dropdown RAB sub-kategori | 🟢 Done | Must | mandor-section.tsx: optional dropdown saat buat scope baru |

### ERP Phase 2 — Kurva S 3 Garis + EVM
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Kurva S 3 garis (Rencana, Serapan Aktual, Progress Fisik) | 🟢 Done | Must | kurva-s.ts: AC dari 5 sumber; scatter hanya mode=daily |
| EVM cards (CPI, SPI, EAC, ETC, VAC, TCPI) | 🟢 Done | Must | kurva-s-section.tsx: 6 cards 2×3, traffic-light color |
| KPI strip (AC, PV, EV, Deviasi) | 🟢 Done | Must | 4 cards horizontal |
| Basis data bar (BAC/EV/PV/AC/CV/SV) | 🟢 Done | Must | |

### ERP Phase 3 — Change Order System (Migration 053)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Tabel change_orders + change_order_items | 🟢 Done | Must | Migration 053 applied |
| API CRUD + submit + approve + reject | 🟢 Done | Must | change-orders.ts: auto-number CO-001; approve update contract_value + audit_log + notif |
| UI tab Change Order di detail proyek | 🟢 Done | Must | change-order-section.tsx: card expandable, inline CRUD items, approve/reject admin |

### ERP Phase 4 — Gantt Chart WBS
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| GET /rab/gantt (actual_start/end dari progress logs) | 🟢 Done | Must | Kolom sudah ada sejak migration 052 |
| Gantt chart custom renderer | 🟢 Done | Must | gantt-section.tsx: dual-bar (rencana dashed + aktual solid), collapse tree, today line |
| SVG dependency arrows + warning panel | 🟢 Done | Must | Normal/kuning/merah sesuai severity; >14 hari overlap = KRITIS |
| Edit dates modal | 🟢 Done | Must | planned_start/end + soft dependency checkbox |
| Threshold-based dependency (Phase 4B, Migration 054) | 🟢 Done | Must | gantt_dep_rules JSONB; warn jika dep.progress_pct < threshold |

### ERP Phase 5 — Document + Photo System (Migration 055)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| project_photos.category (progress/defect/serah_terima/other) | 🟢 Done | Must | Migration 055 applied |
| document_access_logs (audit trail view/download) | 🟢 Done | Must | Migration 055 applied |
| Role-based document filter | 🟢 Done | Must | documents.ts: admin/pm=semua; mandor=gambar_kerja/spk/berita_acara/foto; client=contract+visible |
| PATCH toggle is_visible_to_client | 🟢 Done | Must | Admin/pm only |
| Photo gallery component | 🟢 Done | Must | photo-gallery.tsx: grid 3-col, lightbox, keyboard nav, tab filter kategori |

### ERP Phase 6 — Portal Upgrade
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Client portal Kurva S tab (2 garis saja) | 🟢 Done | Must | Tanpa serapan aktual kas |
| Mandor portal Rekapitulasi halaman | 🟢 Done | Must | GET /mandor/rekapitulasi; earned/paid/outstanding/kasbon/sisa bersih |

### Kasbon Redesign (Migration 056)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| kasbons.work_scope_id nullable (scope opsional) | 🟢 Done | Must | Migration 056 applied |
| kasbons.project_id wajib (backfill dari scope) | 🟢 Done | Must | Migration 056 applied |
| Hapus kasbon_limit_pct dari work_scopes | 🟢 Done | Must | Migration 056 applied |
| Scope opsional di form kasbon (mandor portal) | 🟢 Done | Must | kasbon/page.tsx |
| ScopeBars: dual bar (progress + kasbon per scope) | 🟢 Done | Must | mandor-section.tsx |

### Client Portal (/portal)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Layout responsif (top nav + bottom nav mobile) | 🟢 Done | Must | 4 halaman aktif |
| Dashboard KPI (progress, invoice, status) | 🟢 Done | Must | |
| Proyek list | 🟢 Done | Must | |
| Proyek detail — 4 tab: Ringkasan, Kurva S, Progress, Invoice | 🟢 Done | Must | Kurva S hanya 2 garis (tanpa serapan aktual kas) |
| Notifikasi | 🟢 Done | Must | |
| Profil + logout | 🟢 Done | Must | |
| Upload bukti bayar | ⚪ Future | Nice | |

---

## API (Fastify — apps/api)

### Existing (sudah berfungsi)
| Endpoint Group | Status | Notes |
|----------------|--------|-------|
| Auth (login/register/me/refresh/logout) | 🟢 Done | |
| Users CRUD | 🟢 Done | |
| Projects CRUD + soft-delete | 🟢 Done | |
| Dashboard aggregation | 🟢 Done | |
| Notifications (full CRUD + interactive + Web Push) | 🟢 Done | |
| Finance (invoices, kasbon summary) | 🟢 Done | |
| Cash management | 🟢 Done | |
| Mandor (assignments, scopes, items, kasbon, wage reports) | 🟢 Done | |
| Milestones CRUD | 🟢 Done | |
| RAB | 🟢 Done | |
| Kurva S | 🟢 Done | |
| Documents | 🟢 Done | |
| Contracts PDF | 🟢 Done | |
| Reports + Export Excel | 🟢 Done | |
| Termin payment | 🟢 Done | |
| Progress logs + photos | 🟢 Done | |

### E-Procurement / Pengadaan (Fase 2 — Done)
| Endpoint Group | Status | Notes |
|----------------|--------|-------|
| Materials (catalog + categories) | 🟢 Done | GET/POST/PATCH /procurement/materials |
| Suppliers | 🟢 Done | GET/POST/PATCH /procurement/suppliers |
| Project stocks + movements | 🟢 Done | GET /procurement/stocks + /stocks/:project_id/movements (limit param) |
| Material Requests (MR) | 🟢 Done | GET/POST + submit/approve actions |
| Purchase Orders (PO) | 🟢 Done | GET/POST + status flow |
| Goods receipts | 🟢 Done | GET/POST + confirm (triggers DB chain) |
| Supplier invoices & payments | 🟢 Done | GET/POST + overdue endpoint + FIFO payment; POST terima optional cash_account_id |
| GET supplier-payments | 🟢 Done | GET /procurement/supplier-payments (filter: cash_account_id, supplier_id) |
| Stock usage / return / adjustment | 🟢 Done | POST /procurement/stocks/usage; role: admin+pm+mandor |
| Stock opname bulk | 🟢 Done | POST /procurement/stocks/opname; role: admin+pm |

---

### SCM Enhancement (Modul 9 — Fase 5)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| RAB hard-guard di MR submission | 🔴 Not Started | Must | Tolak MR jika melebihi kuota RAB |
| Input volume RAB per material per proyek | 🔴 Not Started | Must | Tabel `project_rab_materials` |
| Admin override kuota RAB + audit log | 🔴 Not Started | Must | |
| PO delivery via WhatsApp deep-link | 🔴 Not Started | Must | wa.me URL generation |
| PO delivery via Email (Resend + PDF) | 🔴 Not Started | Nice | Butuh Resend API key |

### Subkontraktor Enhancement (Modul 11 — Fase 5)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Field opname report (BA opname fisik) | 🔴 Not Started | Must | Tabel `field_opname_reports` |
| Hard-lock progress payment tanpa opname | 🔴 Not Started | Must | Hanya untuk borongan & progress_pct |
| Digital signing UI (canvas TTD) | 🔴 Not Started | Must | Simpan PNG ke Supabase Storage |
| Contract PDF per work scope | 🔴 Not Started | Nice | |

### Asset Management (Modul 12 — Fase 6)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Master data aset & tools | 🔴 Not Started | Nice | Tabel `assets` |
| Log mutasi alat antar proyek | 🔴 Not Started | Nice | |
| Kalkulasi amortisasi bulanan | 🔴 Not Started | Nice | Cron job / Edge Function |
| Link ke GL (Modul 10) | ⚪ Future | Nice | Fase 7 |

### Enterprise Governance (Modul 13 — Fase 5)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| RLS policies — semua tabel | 🟢 Done | Must | Migration 049 applied — perlu test manual per role |
| Audit trail: diff + severity + IP | 🔴 Not Started | Must | ALTER audit_logs (migration 046) |
| Auto-notif admin severity = critical | 🔴 Not Started | Must | |
| Halaman /admin/audit-log | 🟡 Placeholder | Must | Route /audit ada di middleware tapi belum ada konten fungsional |

### General Ledger (Modul 10 — Fase 7 TERAKHIR)
| Fitur | Status | Priority | Notes |
|-------|--------|----------|-------|
| Chart of Accounts (CoA) setup | ⚪ Future | Must | GL-1 |
| UI jurnal manual + buku besar | ⚪ Future | Must | GL-1 |
| Auto-jurnal kasbon/payment/PO | ⚪ Future | Must | GL-2 |
| Balance Sheet / P&L / Cash Flow | ⚪ Future | Must | GL-3 |
| Migrasi data historis | ⚪ Future | Must | GL-4 |

---

## Database Migrations

| File | Tabel | Status | Notes |
|------|-------|--------|-------|
| 001–038 | Semua tabel existing | 🟢 Done | Applied ke Supabase |
| 039_material_management.sql | material_categories, materials, project_stocks, stock_movements | 🟢 Done | Applied ke Supabase |
| 040_supplier_management.sql | suppliers, supplier_invoices, supplier_payments, supplier_payment_allocations | 🟢 Done | Applied ke Supabase |
| 041_procurement_workflow.sql | material_requests, MR items, purchase_orders, PO items, goods_receipts, GR items | 🟢 Done | Applied ke Supabase |
| 042_supplier_payment_cash_integration.sql | ALTER supplier_payments + cash_account_id FK + DB trigger deduct/refund | 🟢 Done | Applied ke Supabase |
| 049_rls_policies.sql | RLS enable + 3 helper functions + policies ~46 tabel | 🟢 Done | Applied ke Supabase |
| 050–051 (dalam 052) | Digabung ke migration 052 | 🟢 Done | Applied ke Supabase |
| 052_erp_phase1.sql | ALTER rab_items (4 pct kolom + constraint + gantt fields), ALTER progress_logs (mode + rab_item_id + pct_completion), ALTER work_scopes (rab_category_id) | 🟢 Done | Applied ke Supabase (Juni 2026) |
| 053_change_orders.sql | change_orders + change_order_items | 🟢 Done | Applied ke Supabase |
| 054_gantt_dep_rules.sql | ALTER rab_items: gantt_dep_rules JSONB | 🟢 Done | Applied ke Supabase |
| 055_document_photo_system.sql | ALTER project_photos: category; CREATE document_access_logs | 🟢 Done | Applied ke Supabase |
| 056_kasbon_redesign.sql | ALTER kasbons: work_scope_id nullable + project_id wajib; DROP kasbon_limit_pct dari work_scopes | 🟢 Done | Applied ke Supabase |
| 057_clients_user_id.sql | ALTER clients: user_id FK + index + auto-link by email | 🟢 Done | Applied ke Supabase |
| 058_procurement_enhancements.sql | ALTER materials: min_stock; ALTER material_requests: rejection_notes + approved_at; ALTER purchase_orders: canceled_at + cancel_notes | 🟢 Done | Applied ke Supabase |
| 043_rab_material_tracking.sql | project_rab_materials, ALTER materials + purchase_orders | 🔴 Not Started | Fase 5 — belum dieksekusi |
| 044_field_opname_reports.sql | field_opname_reports, ALTER progress_payments + work_scopes | 🔴 Not Started | Fase 5 |
| 045_asset_management.sql | assets, asset_movements, asset_depreciation_logs | 🔴 Not Started | Fase 6 |
| 046_audit_trail_enhancement.sql | ALTER audit_logs (diff, severity, ip, user_agent) | 🔴 Not Started | Fase 5 |
| 047_general_ledger.sql | accounts (CoA), journal_entries, journal_entry_lines | 🔴 Not Started | Fase 7 |

---

## Mobile (React Native Expo — apps/mobile)

**Fase 1 SELESAI ✅** — Expo 53 + expo-router 4, auth layer (AsyncStorage + Bearer token), role-based tab nav

| Screen | Status | Priority | Notes |
|--------|--------|----------|-------|
| Setup Expo + navigation | 🟢 Done | Must | Fase 1 selesai — expo-router 4, role-based tab nav |
| Login screen | 🟢 Done | Must | Email/password + AsyncStorage token |
| Home dashboard | 🟢 Done | Must | KPI cards |
| Progress input lapangan + foto | 🟢 Done | Must | Fase 1 |
| Upload foto dokumentasi | 🟢 Done | Must | Fase 1 |
| Lihat kasbon & ajukan kasbon | 🟢 Done | Must | Fase 1 |
| Mandor summary | 🟢 Done | Must | Fase 1 |
| Notifikasi + approve/reject inline | 🟢 Done | Must | Fase 1 |
| Proyek list + detail | 🟢 Done | Must | Fase 1 |
| Stock opname | 🔴 Not Started | Must | Fase 2 |
| Material request form | 🔴 Not Started | Must | Fase 2 |
| Goods receipt + kamera | 🔴 Not Started | Must | Fase 2 |
| Push notifications (device) | 🔴 Not Started | Must | Fase 2 |
| Offline mode + auto-sync | ⚪ Future | Nice | Fase 3 |

---

## Infrastructure / Config

| Item | Status | Notes |
|------|--------|-------|
| VAPID keys setup | 🟢 Done | Keys di-set di apps/api/.env (public + private + subject). Lazy-init: graceful jika tidak ada subscription. End-to-end push ke device belum diverifikasi. |
| RLS policies | 🟢 Done | Migration 049 applied — 46 tabel, defense-in-depth, 3 helper functions |
| Google OAuth | 🟢 Done | Supabase configured + frontend wired |
| Supabase Storage buckets | 🟢 Done | documents, project-photos, payment-proofs |
