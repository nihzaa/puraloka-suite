# Puraloka Suite — Development Log

## Format Entry
```
### [YYYY-MM-DD HH:MM] — [Kategori] — [Deskripsi singkat]
**Status**: [Planning | In Progress | Done | Blocked]
**Files affected**: [list file]
**Notes**: [catatan penting]
---
```

---

## Log Entries

### 2026-06-15 — Planning — ERP Master Plan dibuat (Megaprompt Session)
**Status**: Done  
**Files affected**:
- `docs/ERP_MASTER_PLAN.md` (baru)
- `docs/DEVELOPMENT_LOG.md` (baru)
- `docs/MODULE_STATUS.md` (baru)
- `docs/API_ENDPOINTS.md` (baru)
- `docs/DATABASE_SCHEMA.md` (baru)
**Notes**: Megaprompt dieksekusi. Struktur ERP 8 modul ditetapkan. Auto token refresh sudah ada di `apps/web/lib/api.ts`. Google OAuth button UI sudah ada tapi belum di-wire ke Supabase. Dashboard hydration concern ada di line 325 (`new Date().toLocaleDateString`).

---

### 2026-06-15 — Fix — Google OAuth wired ke Supabase
**Status**: Done  
**Files affected**:
- `apps/web/app/login/page.tsx`
**Notes**: Tambahkan `supabase.auth.signInWithOAuth({ provider: 'google' })` + state `oauthLoading`. Supabase sudah dikonfigurasi Google provider — tidak perlu setup tambahan di Supabase dashboard.

---

### 2026-06-15 — Fix — Dashboard hydration warning
**Status**: Done  
**Files affected**:
- `apps/web/app/(dashboard)/dashboard/page.tsx`
**Notes**: `new Date().toLocaleDateString(...)` di line 325 dipindahkan ke state dengan `useState` + `useEffect` agar server dan client render string yang sama. Ini menghilangkan React hydration mismatch warning.

---

### 2026-06-15 — Planning — Addendum v2.0 diproses (Modul 9–13)
**Status**: Done  
**Files affected**:
- `docs/ERP_MASTER_PLAN.md` — Tambah Modul 9–13, Fase 5–7, tabel ringkasan 13 modul
- `docs/MODULE_STATUS.md` — Tambah tracker Modul 9–13
- `docs/API_ENDPOINTS.md` — Tambah endpoint Fase 5 (SCM, opname, asset, audit, GL)
- `docs/DATABASE_SCHEMA.md` — Tambah schema migration 043–047
- `db/migrations/043_rab_material_tracking.sql` (baru)
- `db/migrations/044_field_opname_reports.sql` (baru)
- `db/migrations/045_asset_management.sql` (baru)
- `db/migrations/046_audit_trail_enhancement.sql` (baru)
- `db/migrations/047_general_ledger.sql` (baru)
**Notes**: Migration 043–047 sudah dibuat tetapi BELUM dieksekusi ke Supabase. Keputusan penting: (1) Migration file addendum menggunakan nomor 043+ (bukan 015–022 seperti di addendum asli) untuk menghindari konflik dengan migration existing. (2) Kolom tambahan di purchase_orders (whatsapp_sent_at, dll) di-comment-out di 043 karena purchase_orders baru ada di migration 041 yang belum dieksekusi — diimplementasikan bersamaan saat 041 jalan. (3) General Ledger (047) JANGAN dieksekusi sebelum CoA divalidasi akuntan.

---

### 2026-06-15 — Migrations — E-Procurement DB schema (planned)
**Status**: Planning  
**Files affected**:
- `db/migrations/039_material_management.sql` (planned)
- `db/migrations/040_supplier_management.sql` (planned)
- `db/migrations/041_procurement_workflow.sql` (planned)
**Notes**: Migration files direncanakan untuk Fase 2. Belum dieksekusi ke Supabase.

---

### 2026-06-15 — Feature — E-Procurement selesai (migrations 039–041 applied)
**Status**: Done  
**Files affected**:
- `db/migrations/039_material_management.sql` (applied ke Supabase)
- `db/migrations/040_supplier_management.sql` (applied ke Supabase)
- `db/migrations/041_procurement_workflow.sql` (applied ke Supabase)
- `apps/api/src/routes/v1/procurement.ts` (baru, 20+ endpoint)
- `apps/web/app/(dashboard)/procurement/page.tsx` (baru, 7 tab UI)
- `apps/web/components/sidebar.tsx` (tambah menu Pengadaan, admin/pm only)
**Notes**: 14 tabel baru (material catalog, suppliers, MR, PO, GR, stocks, AP). FIFO auto-allocation untuk supplier payment. DB trigger chain GR → update project_stocks. Auto-numbering MR/PO/GR. WA deep-link untuk kirim PO ke supplier. Menu di sidebar diberi label "Pengadaan" (bukan "Procurement") atas permintaan user.

---

### 2026-06-15 — Feature — Integrasi Pengadaan → Kas (migration 042)
**Status**: Done  
**Files affected**:
- `db/migrations/042_supplier_payment_cash_integration.sql` (baru, applied ke Supabase)
- `apps/api/src/routes/v1/procurement.ts` (update POST supplier-payments + tambah GET supplier-payments)
- `apps/api/src/routes/v1/dashboard.ts` (tambah supplierPayments ke cashflow + Promise.allSettled)
- `apps/web/app/(dashboard)/procurement/page.tsx` (dropdown sumber kas di modal bayar hutang)
- `apps/web/app/(dashboard)/kas/page.tsx` (tampilkan riwayat "Bayar Supplier" di tab Pengeluaran)
**Notes**: Migration 042: ALTER supplier_payments ADD cash_account_id FK ke cash_accounts + DB trigger fn_update_cash_on_supplier_payment (deduct on INSERT, refund on DELETE). API: POST /supplier-payments terima optional cash_account_id + validasi saldo cukup. Dashboard cashflow memasukkan supplier payments (yg punya cash_account_id) sebagai outflow per minggu. /kas tab Pengeluaran menampilkan "Bayar Supplier" section terpisah.

---

### 2026-06-15 — Feature — Pengurangan Stok Material + Opname + Log Arus
**Status**: Done  
**Files affected**:
- `apps/api/src/routes/v1/procurement.ts` (tambah POST /stocks/usage + POST /stocks/opname)
- `apps/web/app/(dashboard)/procurement/page.tsx` (rewrite StocksTab: UsageModal, OpnameModal, log arus)
**Notes**: Tidak butuh migration baru — tabel project_stocks + stock_movements sudah ada dari migration 039. POST /stocks/usage: tipe usage (stok berkurang)/return (stok naik)/adjustment (nilai absolut), validasi stok tidak bisa negatif, INSERT stock_movements dengan created_by. POST /stocks/opname: bulk reconciliation per proyek, skip jika selisih=0, INSERT adjustment movement jika ada selisih, return ringkasan. UI StocksTab diubah total: tambah toolbar (Catat Pemakaian / Opname Stok / Lihat Log), UsageModal (project→material dropdown dengan stok saat ini→type→qty→notes), OpnameModal (auto-load semua stok proyek→tabel stok sistem vs input fisik→real-time selisih→result summary screen), log arus mutasi dengan badge warna per movement type + nama pencatat. Motivasi log arus: "biar ga saling tuduh kalo ada selisih" (kata user).

---

### 2026-06-15 — Security — Security Hardening (batch 1–6)
**Status**: Done  
**Files affected**:
- `apps/api/src/index.ts`, `apps/api/src/plugins/auth.ts`
- `apps/api/src/utils/mime.ts` (baru)
- `apps/api/src/routes/v1/auth.ts`, `cash.ts`, `documents.ts`, `finance.ts`, `mandor.ts`
- `apps/web/lib/api.ts`, `apps/web/app/(dashboard)/proyek/page.tsx`
- `db/migrations/036_soft_delete_projects.sql`, `037_audit_hardening.sql`
- `.gitignore`
**Notes**: Batch 1-6 dari AUDIT_REPORT.md. CRITICAL-1 (RLS) pending — dikerjakan di migration 049. CRITICAL-8 HttpOnly cookie via @fastify/cookie. CRITICAL-6 magic bytes MIME validation. CRITICAL-9 soft-delete projects. HIGH-8 N+1 query fix. HIGH-9 XLSX cap 2MB. MEDIUM-2 AbortController. MEDIUM-10 Promise.allSettled. Full changelog di AUDIT_REPORT.md.

---

### 2026-06-16 — Security — Migration 049 RLS Policies
**Status**: Done  
**Files affected**:
- `db/migrations/049_rls_policies.sql` (baru, applied ke Supabase)
**Notes**: RLS enable di ~46 tabel. 3 helper functions: auth_role(), auth_user_id(), auth_client_id(). Defense-in-depth: service_role bypass untuk API layer, anon/JWT enforce untuk direct Supabase access. Test manual per role masih diperlukan.

---

### 2026-06-16 — Feature — ERP Phase 1: RAB Revamp (Migration 052)
**Status**: Done  
**Files affected**:
- `db/migrations/052_erp_phase1.sql` (applied ke Supabase)
- `apps/api/src/routes/v1/rab.ts` (tambah GET categories/items/gantt, PATCH komponen, bulk, gantt)
- `apps/api/src/routes/v1/progress.ts` (update POST dual mode daily/detail + recalculate)
- `apps/api/src/routes/v1/mandor.ts` (tambah rab_category_id di work scopes)
- `apps/web/components/rab-section.tsx` (kolom komponen, KomponenBar, inline edit)
- `apps/web/components/progress-log-modal.tsx` (mode toggle, RAB item picker, preview dampak %)
- `apps/web/components/mandor-section.tsx` (dropdown RAB sub-kategori di AddScopeModal)
**Notes**: 4 pct kolom per rab_item (material/upah/alat/other) + constraint total=0 atau 99.9-100.1. Progress log dual mode: daily (general, tidak update %) vs detail (per RAB item, recalculate project % via bubble-up 2 lapis). work_scopes.rab_category_id opsional FK ke sub-kategori RAB.

---

### 2026-06-16 — Feature — ERP Phase 2: Kurva S 3 Garis + EVM
**Status**: Done  
**Files affected**:
- `apps/api/src/routes/v1/kurva-s.ts` (AC dari 5 sumber, scatter filter mode=daily, meta.evm)
- `apps/web/components/kurva-s-section.tsx` (3 garis chart, 6 EVM cards, KPI strip, basis data bar)
**Notes**: 3 garis: Rencana (dashed-area navy), Serapan Aktual Kas (solid blue), Progress Fisik (green dashed). EVM: CPI/SPI/EAC/ETC/VAC/TCPI dengan traffic-light color (CPI/SPI ≥1 hijau, 0.8-1 kuning, <0.8 merah). AC dari 5 sumber: kasbons+project_expenses+daily_wage_logs+progress_payments+borongan_settlements. Scatter hanya mode=daily AND pct_overall NOT NULL.

---

### 2026-06-16 — Feature — ERP Phase 3: Change Order System (Migration 053)
**Status**: Done  
**Files affected**:
- `db/migrations/053_change_orders.sql` (applied ke Supabase)
- `apps/api/src/routes/v1/change-orders.ts` (baru, 11 endpoints)
- `apps/api/src/index.ts` (register change-orders route)
- `apps/web/app/(dashboard)/proyek/[id]/page.tsx` (tambah ChangeOrderSection)
- `apps/web/components/change-order-section.tsx` (baru)
**Notes**: Container model: CO → CO items (kerja tambah/kurang/perubahan). Auto-number CO-001. Approve → update contract_value + audit_log + notif PM+admin. Reject → notif submitter. UI: card expandable per CO, inline CRUD items, approve/reject inline untuk admin.

---

### 2026-06-16 — Feature — ERP Phase 4: Gantt Chart WBS
**Status**: Done  
**Files affected**:
- `db/migrations/054_gantt_dep_rules.sql` (applied ke Supabase — gantt_dep_rules JSONB)
- `apps/api/src/routes/v1/rab.ts` (GET /rab/gantt update + PATCH /rab/:itemId/gantt)
- `apps/web/components/gantt-section.tsx` (baru, custom renderer)
- `apps/web/app/(dashboard)/proyek/[id]/page.tsx` (tambah GanttSection)
**Notes**: Custom Gantt renderer (tidak pakai library external). Dual-bar per item: rencana (dashed outline) + aktual (solid, dari progress logs mode=detail). Collapse/expand WBS tree. SVG dependency arrows berwarna (normal/kuning/merah). Warning panel: list semua potensi overlap severity + advisory. Today line merah vertikal. Edit modal per item: planned_start/end + dependency checkbox. View mode Bulan/Minggu. Phase 4B: threshold-based dependency via gantt_dep_rules JSONB.

---

### 2026-06-17 — Feature — ERP Phase 5: Document System + Photo Gallery (Migration 055)
**Status**: Done  
**Files affected**:
- `db/migrations/055_document_photo_system.sql` (applied ke Supabase)
- `apps/api/src/routes/v1/documents.ts` (role-based filter + PATCH visibility + access-log)
- `apps/api/src/routes/v1/progress.ts` (GET/PATCH photos endpoints)
- `apps/web/components/document-section.tsx` (filter tabs, badge, toggle visibility, access-log)
- `apps/web/components/photo-gallery.tsx` (baru: grid, lightbox, keyboard nav, kategori tab)
**Notes**: project_photos.category (progress/defect/serah_terima/other). document_access_logs tabel baru (audit trail). Role-based doc filter: admin/pm semua, mandor hanya gambar_kerja/spk/berita_acara, client hanya visible_to_client=true. Photo gallery: grid 3-col responsive, lightbox fullscreen keyboard nav (←/→/Esc), ganti kategori dari lightbox.

---

### 2026-06-17 — Feature — ERP Phase 6: Portal Upgrade
**Status**: Done  
**Files affected**:
- `apps/web/app/(portal)/proyek/[id]/page.tsx` (tambah tab Kurva S)
- `apps/api/src/routes/v1/mandor.ts` (tambah GET /mandor/rekapitulasi)
- `apps/web/app/mandor-portal/rekapitulasi/page.tsx` (baru)
- `apps/web/app/mandor-portal/layout.tsx` (tambah nav item Rekapitulasi)
**Notes**: Client portal Kurva S: 2 garis saja (Rencana + Progress Fisik) — Serapan Aktual Kas disembunyikan dari klien. Mandor Rekapitulasi: earned/paid/outstanding/kasbon_beredar/sisa_bersih; per-project breakdown. Hero gradient card sisa bersih.

---

### 2026-06-17 — Feature — Kasbon Redesign (Migration 056)
**Status**: Done  
**Files affected**:
- `db/migrations/056_kasbon_redesign.sql` (applied ke Supabase)
- `apps/api/src/routes/v1/kasbons.ts` (update GET filter + POST opsional scope + PATCH PM isolation)
- `apps/api/src/routes/v1/mandor.ts` (hapus kasbon_limit_pct dari semua query)
- `apps/api/src/routes/v1/projects.ts` (tambah scopeless_kasbons parallel query)
- `apps/web/components/mandor-section.tsx` (ScopeBars dual bar, hapus kasbon_limit_pct)
- `apps/web/app/mandor-portal/kasbon/page.tsx` (scope opsional, project dropdown wajib)
**Notes**: work_scope_id jadi nullable (scope opsional). project_id wajib langsung di kasbons. Hapus kasbon_limit_pct dari work_scopes. GET mandor filter berdasarkan project_id IN [proyek yang di-assign]. PATCH PM isolation baca project_id langsung (fallback resolve dari scope jika null/data lama).

---

### 2026-06-17 — Fix — Dashboard infinite reload + post-demo env issues
**Status**: Done  
**Files affected**:
- `apps/web/app/page.tsx` (useRef guard untuk infinite useEffect)
- `apps/web/app/portal/layout.tsx`, `mandor-portal/layout.tsx`, `pm-portal/layout.tsx`, `auth/callback/page.tsx` (fix [router] → [] dependency)
- `apps/web/.env.local` (hapus leading space di NEXT_PUBLIC_API_URL)
- `apps/web/middleware.ts` (tambah /kalender, /audit, /sistem ke admin ROLE_ALLOWED)
**Notes**: Root cause: useRouter() di Next.js 16 Turbopack return new reference tiap render → [router] dependency infinite loop. Fix: [] dependency + useRef guard. Space di .env.local disebabkan start-demo.ps1 restore tidak bersih. /kalender, /audit, /sistem tidak bisa diakses dari sidebar karena tidak ada di ROLE_ALLOWED admin.

---

### 2026-06-17 — Feature — Procurement Enhancement (Migration 058)
**Status**: Done  
**Files affected**:
- `db/migrations/058_procurement_enhancements.sql` (applied ke Supabase)
- `apps/api/src/routes/v1/procurement.ts` (dashboard KPI, aging, laporan, cancel PO, MR items CRUD)
- `apps/web/app/(dashboard)/procurement/page.tsx` (8 tab: +LaporanPengadaanTab)
**Notes**: Migration 058: min_stock, rejection_notes, approved_at, canceled_at, cancel_notes. API baru: dashboard KPI, aging hutang supplier, rekap pembelian, cancel PO, MR items CRUD, edit MR draft. UI: tab ke-8 Laporan Pengadaan — sub-tab Rekap Pembelian (date range, filter, KPI, top supplier, PO table) + Aging Hutang (5 bucket, color-coded). Export Excel kedua sub-tab.

---

<!-- Template untuk entry baru:

### YYYY-MM-DD HH:MM — [Kategori] — [Deskripsi]
**Status**: Done
**Files affected**:
- path/ke/file.ts
**Notes**: catatan penting

---
-->
