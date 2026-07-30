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

### 2026-07-25 — Fix — Rekonsiliasi drift tracking schema_migrations (059 & 101)
**Status**: Done
**Files affected**:
- `supabase_migrations.schema_migrations` (dev DB — 059 & 101 ditandai applied, tidak ada SQL baru dijalankan)
**Notes**: **CATATAN GAP:** log ini berhenti di 058 (Juni); migration 059–101 dikerjakan di era enterprise-architecture (Phase 1/2) dan dicatat di spec docs + deskripsi PR, bukan di sini. Entry ini menghidupkan lagi DEVELOPMENT_LOG sebagai jejak drift migration project-wide.

**Drift yang direkonsiliasi** (ditemukan saat mau apply migration 102 / Program C): `supabase db push` akan mencoba apply **059, 101, dan 102** — bukan hanya 102, karena 059 & 101 sudah ter-apply di dev tapi TIDAK tercatat di `schema_migrations`.
- **059 `seed_dummy_data`** — 🔴 BAHAYA kalau dijalankan ulang: menulis kolom `users.role` yang sudah di-DROP di Sub-Fase 1B.4 → pasti gagal `42703`, dan push berhenti separuh jalan sebelum sampai 102. Bukti sudah ter-apply: 20 baris user seed `a0000000-%` ADA di dev.
- **101 `notification_routing_rules`** — di-apply manual saat Sub-Fase 2B (idempoten). Bukti: tabel `notification_rules` ada dengan 14 aturan ter-seed.
- **Tindakan:** `INSERT ... ON CONFLICT DO NOTHING` menandai 059 & 101 applied di `schema_migrations`. **Nol SQL schema dijalankan** — murni koreksi tracking, sama pola seperti rekonsiliasi 073 (Sub-Fase 1B, `Implementation-Kickoff-Sub-Fase-1B/04-database-migration-plan.md`) dan drift 058.
- **Sesudahnya:** `db push`/`db diff` hanya menyisakan 102 (sudah di-apply via DIRECT_URL, dicatat manual — lihat entry migration 102 di bawah). Verifikasi drift lewat objek NYATA di DB, bukan asumsi.

**Akar berulang:** dua jalur apply (`supabase db push` yang butuh SUPABASE_ACCESS_TOKEN vs `DIRECT_URL` via pg manual) + tidak ada `config.toml`. Setiap migration yang di-apply manual WAJIB langsung dicatat di `schema_migrations` di transaksi yang sama, supaya `db push` berikutnya tidak menabrak seed lama.

---

### 2026-07-25 — Feature — CECEP Cost Code Registry (Migration 102, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/102_cecep_cost_code_registry.sql` + kembar `supabase/migrations/` (applied ke dev via DIRECT_URL, dicatat di schema_migrations)
- `apps/api/src/routes/v1/__tests__/cost-code-registry.test.ts` (16 test)
- `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-009-cecep-persistence-derivation.md`
**Notes**: Tabel CECEP PERTAMA (Program C = Phase 3, Milestone 1). Cost Code = Shared Kernel lintas 17 domain. Hard guard di DB: (1) baris tak boleh dihapus (deprecate, bukan delete), (2) transisi lifecycle draft→active→deprecated + deprecated→active (reaktivasi, keputusan founder — dipensiunkan = status operasional bukan hapus permanen), kembali ke draft ditolak. Kolom sengaja di-exclude (ADR-009): parent_id (CBS domain terpisah), unit (kandidat Assembly/AHSP), company_id (Phase 7). Otorisasi capability ADR-004: `cecep:cost_code:manage` (admin) + `:view` (admin+pm). Guard mutation-proof (5 mutasi → merah, dipulihkan → 16/16 hijau). Verifikasi pasca-apply lewat koneksi baru (quirk pooler).

---

### 2026-07-25 — Feature — CECEP RBS / Resource Identity Registry (Migration 103, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/103_cecep_resource_registry.sql` + kembar `supabase/migrations/` (applied ke dev via DIRECT_URL)
- `apps/api/src/routes/v1/__tests__/resource-registry.test.ts` (15 test)
- ADR-009 (penerapan kedua ditambahkan)
**Notes**: Aggregate Root KEDUA Milestone 1 — RBS "shared kernel kedua, dipakai 10 domain hilir". Bentuk beda dari Cost Code (diturunkan, bukan disamakan): lifecycle 2 status active↔inactive (TAK ada draft, resource aktif sejak dibuat); `category` WAJIB dari himpunan Labor/Equipment/Material/Subcontract (`35` #5). Reaktivasi inactive→active SAH — prinsip founder dari Cost Code ditransfer (wording lifecycle identik). Hard guard larangan hapus + mutation-proof (2 mutasi → 5 test merah, dipulihkan → 15/15). Exclude (ADR-009): `unit` (Price Book Entry pun tak memuatnya — resolusi di Assembly/AHSP Milestone 2), `company_id` (Phase 7). Verifikasi pasca-apply lewat koneksi baru.

---


### 2026-07-25 — Feature — CECEP Versioned Price Book (Migration 104, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/104_cecep_price_book.sql` + kembar `supabase/migrations/` (applied ke dev via DIRECT_URL)
- `apps/api/src/routes/v1/__tests__/price-book.test.ts` (17 test)
- ADR-009 (penerapan ketiga + bagian "CBS diblokir")
**Notes**: Milestone 2 domain #1 (dari 5). Aggregate Root per entry (`44` §5). 8-atribut wajib (version/effective/expired/location/currency/supplier/confidence/verified_by), confidence high/medium/low, Money VO (amount+currency), referensi RBS (migration 103). Hard guard: (1) IMMUTABLE begitu ≠ draft — harga tak berubah retroaktif (inti alasan Price Book ada), (2) lifecycle draft→verified→active→expired maju saja, (3) entry non-draft tak boleh dihapus (draft boleh). Mutation-proof: 3 mutasi → 3 test merah, dipulihkan → 17/17, diff kosong. Exclude: unit, company_id.

**KEPUTUSAN URUTAN:** Price Book dibangun SEBELUM CBS meski `49` mendaftar CBS dulu — Assembly TIDAK mereferensikan CBS (bukan rantai FK), dan CBS punya 2 keputusan domain BELUM DIAMBIL (`03b` B.4 rumah Standard CBS, B.5 pola versioning) yang tak ditutup di 44/45/46. Menulis CBS = ❌ Invented (dilarang DoD). CBS ditunda sampai keputusan versioning diambil; tak memblokir Milestone 2 (hanya Estimate Item/Milestone 3 butuh CBS). Detail di ADR-009 §"CBS diblokir".

---


### 2026-07-25 — Feature — CECEP Productivity Library (Migration 105, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/105_cecep_productivity_library.sql` + kembar (applied ke dev)
- `apps/api/src/routes/v1/__tests__/productivity-library.test.ts` (12 test)
- ADR-009 (penerapan keempat)
**Notes**: Milestone 2 domain #2. Aggregate Root = kombinasi (resource × cost_code × versi) — domain PERTAMA yang merujuk DUA Shared Kernel Milestone 1. productivity_value>0, source national_bootstrap/company_baseline/variance (label, bukan FK ke Reference Library yang tertunda). Immutable-entity-per-version DITURUNKAN dari "+ versi" sbg identitas AR (bukan keputusan tertunda seperti CBS). Hard guard: immutable + no-delete (fakta historis basis Variance Analysis). Mutation-proof: 2 mutasi → 2 test merah each, dipulihkan → 12/12. Exclude: unit, company_id.

---


### 2026-07-25 — Feature — CECEP Formula Engine / Formula Definition (Migration 106, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/106_cecep_formula_definitions.sql` + kembar (applied ke dev)
- `apps/api/src/routes/v1/__tests__/formula-definitions.test.ts` (13 test)
- ADR-009 (penerapan kelima)
**Notes**: Milestone 2 domain #3. Aggregate Root = Formula Definition (Formula+Version+Variable+Parameter+Expression). Formula Engine sendiri = Domain Service (lapisan aplikasi, bukan tabel). Generik — dibangun SEBELUM Assembly yang mengonsumsinya. Variable/parameter = JSONB (bagian komposisi, bukan tabel anak). Lifecycle draft→tested→active→superseded. Hard guard: immutable begitu ≠ draft (anti perubahan retroaktif ke Estimate Item), transisi maju saja, no-delete non-draft. Mutation-proof: 3 mutasi → merah, dipulihkan → 13/13. Calculation Strategy Contract SENGAJA bukan di sini (`42`: struktur bagian Estimate Item = Milestone 3). Exclude: company_id.

---


### 2026-07-25 — Feature — CECEP Assembly / AHSP (Migration 107, Program C) — capstone Milestone 2
**Status**: Done
**Files affected**:
- `db/migrations/107_cecep_assembly.sql` + kembar (applied ke dev) — 2 tabel: assemblies + assembly_components
- `apps/api/src/routes/v1/__tests__/assembly.test.ts` (16 test)
- ADR-009 (penerapan keenam + status Milestone 2)
**Notes**: Domain TERAKHIR Milestone 2 (kecuali CBS yang diblokir). Aggregate Root Assembly (parent) + assembly_components (resource requirement lines, koefisien AHSP "0,7 OH Tukang Besi"). Merujuk DUA Shared Kernel (Cost Code + RBS). 4 sumber (national/company/project/custom) dalam satu tabel. sequence = JSONB (Value Object). Formula TIDAK disimpan sbg FK (formula_reference milik Strategy Contract = M3). 4 hard guard: parent immutable begitu ≠ draft, transisi maju saja, no-delete non-draft, komponen beku saat parent non-draft ("berubah BERSAMA sebagai satu paket"). Mutation-proof: 4 guard → merah, dipulihkan → 16/16. Exclude: unit, formula_id, company_id.

**MILESTONE 2 STATUS**: 5 dari 6 domain SELESAI (Price Book 104, Productivity 105, Formula 106, Assembly 107 + Cost Code/RBS dari M1). CBS satu-satunya tersisa & DIBLOKIR (keputusan versioning B.5 + rumah Standard CBS B.4 belum diambil di artefak Frozen — perlu keputusan founder). Assembly (konsumen utama knowledge layer) sudah berdiri.

---


### 2026-07-25 — Feature — CECEP CBS / Cost Breakdown Structure (Migration 108) — MENUTUP Milestone 2
**Status**: Done
**Files affected**:
- `db/migrations/108_cecep_cbs.sql` + kembar (applied ke dev) — cbs_templates + cbs_nodes
- `apps/api/src/routes/v1/__tests__/cbs.test.ts` (14 test)
- ADR-009 (penerapan ketujuh + status Milestone 2 TUNTAS)
**Notes**: Domain ke-6 (TERAKHIR) Milestone 2. DUA keputusan founder membuka blokir: (1) versioning = immutable-per-versi (pola Price Book) — B.5 03b yang tadinya "belum diambil"; (2) Standard CBS = label source (standard/company/project, pola Assembly) — B.4 Reference Library ditunda. Company CBS Template (parent) + cbs_nodes (HIERARKI — parent_id yang sengaja di-exclude dari Cost Code kini tinggal di sini, memvalidasi keputusan itu). cbs_nodes.cost_code_id nullable (node pengelompok boleh tanpa). 5 hard guard: parent immutable begitu active, transisi maju saja, no-delete non-draft, node beku saat template non-draft, integritas hierarki (parent se-template + tak self). Mutation-proof: 5 guard → merah, dipulihkan → 14/14. Exclude: Project CBS snapshot (M3), company_id.

**✅ MILESTONE 2 TUNTAS 6/6**: Cost Code+RBS (M1) · Price Book (104) · Productivity (105) · Formula (106) · Assembly (107) · CBS (108). Semua Aggregate Root knowledge-layer CECEP berdiri. Berikutnya Milestone 3 (Estimate Item merujuk Cost Code/Assembly/CBS/WBS — semua prasyarat kini ada).

---


### 2026-07-25 — Feature — CECEP WBS / Work Breakdown Structure (Migration 109, Program C) — Milestone 3 dibuka
**Status**: Done
**Files affected**:
- `db/migrations/109_cecep_wbs.sql` + kembar (applied ke dev)
- `apps/api/src/routes/v1/__tests__/wbs.test.ts` (9 test)
- ADR-009 (penerapan kedelapan)
**Notes**: Milestone 3 domain #1 (non-approval). WBS Node = child dari Aggregate Project (bukan root), lensa Planning ("kapan & di mana"), paralel CBS (Cost), bertemu di Cost Code. Hierarki (parent_id) + cost_code_id nullable. Lifecycle draft→baseline→revised + re-baseline (revised→baseline diizinkan — planning berulang, WBS bukan basis-uang immutable; ⚠️ ringan dilaporkan, murah dibalik). Hard guard: lifecycle (tak bisa balik draft) + integritas hierarki (parent se-project). Mutation-proof: 2 guard → merah, dipulihkan → 9/9. Exclude: planned_start/end (integrasi Gantt keputusan tersendiri), company_id. 10 tabel CECEP di dev sekarang.

---


### 2026-07-25 — Feature — CECEP Estimate Aggregate Chain (Migration 110, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/110_cecep_estimate_chain.sql` + kembar (applied ke dev) — scenarios + estimate_versions + estimate_items
- `apps/api/src/routes/v1/__tests__/estimate-chain.test.ts` (14 test)
- ADR-009 (penerapan kesembilan)
**Notes**: Milestone 3 domain #2 (non-approval). Scenario→Estimate Version→Estimate Item ("derivasi terkuat di seluruh dokumen"). Estimate Item = child, pertemuan Cost Code(WAJIB)+Assembly+CBS+WBS(nullable) jadi satu angka. 5 hard guard: scenario transisi, version transisi maju saja, version total+identitas immutable begitu ≠ draft, version no-delete non-draft, item beku begitu version ≠ draft ("perubahan Item lewat Version"). Mutation-proof: 5 guard → merah, dipulihkan → 14/14.

⚠️ LINGKUP: STRUKTUR Estimate Version dibangun (status 5-nilai + guard struktural), TAPI ALUR APPROVAL BELUM DI-WIRE — siapa boleh approve via engine ADR-007 = discovery step 2, menunggu keputusan founder. Belum ada jalur API approval. Sinyal discovery: 44 §12 = "Approval Chain Definition configurable, jangan hardcode" (selaras ADR-007). Exclude: unit, Project CBS snapshot, company_id. 13 tabel CECEP di dev.

---


### 2026-07-25 — Feature — CECEP Estimate Version approval via engine ADR-007 (Migration 111, Program C)
**Status**: Done
**Files affected**:
- `db/migrations/111_cecep_estimate_approval.sql` + kembar (applied ke dev) — chain + capability + relaksasi transisi reject
- `apps/api/src/routes/v1/estimate-versions.ts` (baru) — submit/approve/reject via engine
- `apps/api/src/utils/approval.ts` (+ 'estimate_version' ke union type)
- `apps/api/src/index.ts` (registrasi route)
- `apps/api/src/routes/v1/__tests__/estimate-approval.test.ts` (8 test) + authz-endpoints.test.ts (+2 = 28)
- ADR-009 (penerapan kesepuluh)
**Notes**: Milestone 3 approval. Keputusan founder pasca-discovery: WIRE lewat engine ADR-007 yang SUDAH ADA (bukan jalur kelima) — selaras mandat CECEP 47 §3 ("reuse RBAC existing, satu mekanisme 3 titik"). Pola IDENTIK 4 modul: canParticipateInChain → evaluateEntityApproval → recordApproval. submit (draft→under_review, cecep:estimate:manage), approve (via engine, cecep:estimate:approve, total_amount=basis ambang opsional), reject (under_review→draft). Routing 7-dimensi sengaja DITUNDA (Fase 12, hindari over-engineering ADR-006). Mutation-proof: gerbang canParticipateInChain → 2 authz merah, penahapan isFinalStep (uji berjenjang 2-level) → 1 merah. Cleanup test dev pakai session_replication_role=replica (guard no-delete blokir CASCADE). Gate: tsc 0, lint 0, 465 test hijau (50 file).

**✅ MILESTONE 3 jalur Estimate + approval berdiri**: WBS (109) + Estimate chain (110) + approval (111). Sisa M3: Lessons Learned/Historical Cost Intelligence (§13), titik approval ke-2 & ke-3 (Price Book Verified By, Lessons Propagation).

---


### 2026-07-25 — Feature — CECEP RAB/BOQ read-model (Program C, Milestone 4 dibuka)
**Status**: Done
**Files affected**:
- `apps/api/src/lib/rab-readmodel.ts` + `.test.ts` (7 test angka) — fungsi murni computeRab/computeBoq
- `apps/api/src/routes/v1/estimate-versions.ts` (GET /rab, GET /boq)
- `apps/api/src/routes/v1/__tests__/estimate-approval.test.ts` (+2 test integrasi angka)
**Notes**: Milestone 4 read-model #1. RAB/BOQ = read-model dari Estimate Item (TIDAK ada tabel baru, `37` §3/`49` M4). computeRab: breakdown per CBS + subtotal + grand total = Σ amount. computeBoq: kuantitas per Cost Code TANPA harga (dokumen supplier). DISIPLIN M4: angka diuji terhadap hitungan MANUAL hardcoded (bukan "query jalan") — seed 3 item {1jt, 2,5jt, 500rb} → assert grand_total=4jt; string numeric dijumlah bukan konkat; desimal tanpa drift; BOQ tak bocorkan harga. Endpoint gate cecep:estimate:view. Gate: tsc 0, lint 0, 474 test hijau (51 file). No migration (read-model murni).

---


### 2026-07-25 — Feature — CECEP Cashflow Forecast read-model (Program C, Milestone 4)
**Status**: Done
**Files affected**:
- `apps/api/src/lib/cashflow-forecast.ts` + `.test.ts` (8 test angka) — fungsi murni forecastCashflow
- `apps/api/src/routes/v1/estimate-versions.ts` (GET /cashflow-forecast)
- `apps/api/src/routes/v1/__tests__/estimate-approval.test.ts` (+1 test integrasi)
**Notes**: Milestone 4 read-model #2. Cashflow Forecast = proyeksi pencairan kas ke depan (`52` Gap 1), read-model tanpa tabel baru. MEWARISI normalCDF (mu=0.5,sigma=0.2) dari kurva-s.ts (Zero-Invention). SATU penyimpangan dilaporkan: dinormalisasi ke massa CDF total supaya Σ pencairan = baseline PERSIS 100% (kurva-s pakai CDF mentah → truncate ~99,4%, wajar untuk kurva progres visual tapi salah untuk forecast pencairan yang harus habiskan 100% budget). Test angka manual: Σ=baseline persis, S-curve (tengah>ujung), monoton, simetris mu=0.5, edge 0/1 periode. Gate: tsc 0, lint 0, 483 test hijau (52 file). No migration.

---


### 2026-07-25 — Feature — CECEP ACL Actual Cost (Migration 112, Program C, Milestone 4)
**Status**: Done
**Files affected**:
- `db/migrations/112_cecep_acl_actual_cost.sql` + kembar (applied ke dev)
- `apps/api/src/routes/v1/__tests__/acl-actual-cost.test.ts` (7 test)
**Notes**: Milestone 4 — SATU-SATUNYA tabel baru M4. ACL Anti-Corruption Layer (doc 46): tabel translasi category_id (project_expenses existing) ↔ cost_code_id (CECEP). Dikonsumsi READ-ONLY oleh Cost Control + Historical Cost Intelligence; TIDAK mengubah project_expenses/kasbons (Zero-Invention). Keputusan modeling: category_id UNIK (resolusi deterministik, satu category→satu cost code); banyak category→satu cost code diizinkan (rollup). Test: FK integrity (category & cost_code harus ada), UNIQUE, rollup, CASCADE dari kategori (tak sentuh cost code). Gate: tsc 0, lint 0, 490 test hijau (53 file). 14 tabel CECEP di dev.

---


### 2026-07-25 — Feature — CECEP Lessons Learned STRUKTUR (Migration 113, Program C, Milestone 4)
**Status**: Done
**Files affected**:
- `db/migrations/113_cecep_lessons_learned.sql` + kembar (applied ke dev) — lessons_learned_records + root_cause_analyses
- `apps/api/src/routes/v1/__tests__/lessons-learned.test.ts` (11 test)
**Notes**: Milestone 4 — Lessons Learned STRUKTUR SAJA. Aggregate Root lessons_learned_records (Variance=VO embedded, variance_amount GENERATED = actual-planned tak bisa bohong), root_cause_analyses (child revisable saat draft). Lifecycle draft→under_review→approved DIBANGUN; approved→propagated (WRITE-BACK) SENGAJA DITOLAK guard (verbatim founder 03b §A.12: "AI tidak boleh langsung belajar. Harus ada approval."). 6 hard guard: transisi (propagated ditolak = titik STOP dijaga), variance beku begitu ≠ draft, root cause beku, no-delete non-draft. Mutation-proof: 3 guard → merah (termasuk guard STOP). Gate: tsc 0, lint 0, 501 test hijau (54 file). 16 tabel CECEP di dev.

**🛑 TITIK STOP TERCAPAI**: write-back Lessons Learned (propagasi ke Assembly/Price Book/Productivity) BELUM di-wire. Discovery + laporan ke founder sebelum wire (apa ditulis balik, approval gate, interaksi immutability M1-M2).

---


### 2026-07-25 — Feature — CECEP Lessons Learned WRITE-BACK via engine (Migration 114, Program C) — Company Intelligence Loop DITUTUP
**Status**: Done
**Files affected**:
- `db/migrations/114_cecep_lessons_writeback.sql` + kembar (applied ke dev) — proposals table + chain lessons_learned + fn_propagate_lesson + relaksasi approved→propagated
- `apps/api/src/routes/v1/lessons-learned.ts` (baru) — submit/approve(+propagate)/reject
- `apps/api/src/utils/approval.ts` (+ 'lessons_learned' union), index.ts (registrasi)
- `apps/api/src/routes/v1/__tests__/lessons-writeback.test.ts` (5) + authz (+2 = 34)
**Notes**: TITIK STOP DILEWATI dengan keputusan founder. Write-back Company Intelligence Loop via engine ADR-007 (titik ke-3, 47 §3). Keputusan founder: lesson simpan USULAN KONKRET (lesson_propagation_proposals: productivity/price_book, nilai + resource + cost_code), approve lesson via engine = commit usulan. Nilai apa adanya source='variance', blending nanti. fn_propagate_lesson ATOMIK: approve final → status approved → propagasi membuat VERSI BARU (productivity source=variance; price_book status verified verified_by=approver) PERSIS dari usulan → status propagated. Tak pernah mutate versi lama (immutability M1-M2 menegakkan). Traceability created_record_id terisi. Assembly propagation ditunda (multi-komponen). Mutation-proof: gerbang canParticipateInChain (vs jaring authz, 403-sebelum-404) → 2 merah; propagasi dilewati → 3 merah. Gate: tsc 0, lint 0, 510 test hijau (55 file). 17 tabel CECEP.

**✅ CECEP MILESTONE 4 SELESAI — Company Intelligence Loop hidup DENGAN gerbang manusia**: RAB/BOQ (#60), Cashflow (#61), ACL (#62), Lessons struktur (#63), write-back (ini). "AI tidak boleh langsung belajar. Harus ada approval." ditegakkan.

---


### 2026-07-25 — Feature — CECEP Fondasi UNIT (Migration 115, Program C) — prasyarat seed AHSP
**Status**: Done (applied ke dev) — 🛑 STOP untuk review founder sebelum seed
**Files affected**:
- `db/migrations/115_cecep_unit_foundation.sql` + kembar (applied ke dev)
- `apps/api/src/routes/v1/__tests__/unit-foundation.test.ts` (9 test, tx rollback → nol residu)
- `apps/api/src/routes/v1/__tests__/lessons-writeback.test.ts` (fix: resource insert + unit_code='OH')
- `apps/api/scripts/cleanup-cecep-residue.mjs` (item 1b — dry-run teruji, belum --execute)
- `docs/…/CECEP/CI-ISOLATION-SETUP.md` (item 1a — checklist provisioning founder)
**Notes**: Keputusan founder — EXTEND tabel `units` existing (090), BUKAN vocabulary kedua. Kode existing (m/buah/batang) dipertahankan (mandor menyimpannya sbg nilai). Ditambah: kolom `dimension` (backfill dari category: weight→mass, ls→lumpsum; NOT NULL + CHECK 8 nilai) + satuan tenaga AHSP OH(labor_day)/jam(time). `resources.unit_code` FK NOT NULL immutable begitu direferensikan komponen/harga (guard `trg_resources_unit_immutable`). `assemblies.output_unit_code` FK NOT NULL, ditambahkan ke guard immutability 107 (beku begitu ≠ draft). Coefficient tetap polos; price_book tanpa kolom unit (Zero-Invention ADR-006). Mutation-proof: disable→red→restore untuk KEDUA guard (tx rollback, dev utuh) + assertion berpasangan di test. Gate: tsc 0, lint 0, 519 test hijau (56 file). Item 0 (verifikasi nol create endpoint) + item 1a/1b (CI isolation) dilaporkan; 1a menunggu provisioning founder.

**🛑 TITIK STOP**: seed AHSP (20-30 pekerjaan kurasi) BELUM dimulai — menunggu founder review fondasi unit + verifikasi endpoint (perintah verbatim: "Jangan mulai (b) seed sebelum saya lihat…").

---


### 2026-07-25 — Feature — CECEP satuan OJ + dimensi labor_time (Migration 116) + AHSP recon
**Status**: Done (applied ke dev) — 🛑 STOP untuk review founder sebelum seed/engine
**Files affected**:
- `db/migrations/116_cecep_unit_labor_time.sql` + kembar (applied ke dev)
- `apps/api/src/routes/v1/__tests__/unit-foundation.test.ts` (OH→labor_time + OJ)
- `docs/…/CECEP/AHSP-RECON-REPORT.md` (recon a-j + keputusan founder terkunci)
- `.gitignore` (_source/ 97 MB + graphify artifacts)
**Notes**: Keputusan founder pasca-recon AHSP SE 47/2026. OH & OJ berbagi dimensi `labor_time` (orang×waktu, sebanding 1 OH=7 OJ per SNI — dok saja, TANPA converter; pembeda tenaga/alat/kalender via resources.category, bukan dimension). `labor_day` (115) di-rename `labor_time`; `jam`/`hari`=time. Aman rename langsung (labor_day cuma di CHECK+seed OH, nol baris hidup — diverifikasi). Recon read-only workbook: koef 16126 literal vs 43 formula-cache (nol di thin-slice); kamus satuan dari data; harga=ilustrasi; 3143 item; peta paritas 16 perhitungan (Definition of Done engine); pembulatan HANYA HSP ROUNDDOWN(-2). Keputusan terkunci: hsp_raw+hsp_rounded (rantai dokumen dari rounded, tak dicampur), rounding mode/step config effective-date tapi tahap=struktural Ember[C], PPN config effective-date, cacat Excel (PPN 11% vs 0,12; beda pembulatan antar file) TIDAK diselesaikan diam-diam → daftar cacat + tanya. Disiplin paritas: reproduksi Excel dulu, fix pengubah-angka = flag DEFAULT OFF + ADR. Gate: 9 test unit-foundation hijau (tx-rollback, nol residu). m'→alias m_linear.

**🛑 TITIK STOP**: teardown total workbook (VBA, defined names, hidden sheets, daftar cacat, Control vs Khusus) sedang dikerjakan sbg laporan; seed + engine belum dibangun — menunggu review founder.

---


### 2026-07-25 — Feature — CECEP AHSP Calculation Engine (PURE, paritas Excel) — inti kalkulasi
**Status**: Done — otonom (aba-aba founder "mulai saja kalo yakin"), paritas-dulu, DB-free
**Files affected**:
- `apps/api/src/lib/ahsp-engine.ts` (baru, murni tanpa I/O)
- `apps/api/src/lib/ahsp-engine.test.ts` (10 golden-number test dari sel Excel)
**Notes**: Inti engine kalkulasi AHSP dibangun sebagai FUNGSI MURNI (nol sentuh DB → nol residu dev → tak butuh CI isolation maupun golden-file, menghormati urutan founder: seed DB tetap menunggu CI isolation). Reproduksi rantai workbook SE 47/2026 sampai rupiah: `computeAhsp` (Σκoef×HSD per grup A/B/C → D → +BUK → hspRaw → applyRounding → hspRounded), `computeRabLineTotal`, `computePpn`, `computeRabRollup`. Paritas-dulu: default meniru file utama (ROUNDDOWN Rp100, agregat desimal penuh); semua param (BUK, rounding, PPN) di-INJECT. DUA nilai HSP (raw internal + rounded rantai-dokumen). PPN rasional (kali-dulu-bagi-belakangan) → 11/12 tak pernah 0,9167 (D10). Golden test angka PERSIS Excel: Pasangan Dinding 3.6.1.1 HSP=278300, 3.6.1.2 HSP=266600, REKAP PPN=198.940.750,846 grand=1.856.780.341,23, mini-RAB rantai bulat eksak; koreksi 11/12 terbukti tanpa drift (naif 0,916667 melenceng +Rp66). Gate: tsc 0, lint 0, 10 test hijau.

**Belum**: seed DB koefisien (menunggu CI isolation founder), engine↔config effective-date wiring (BUK/PPN/rounding + flag koreksi D1/D2 per-proyek), golden-file dari RAB nyata founder.

---


### 2026-07-25 — Feature — CECEP RAB Compute: BOQ + take-off + orchestrator (PURE) — jalur RAB tuntas
**Status**: Done — otonom, paritas-dulu, DB-free (lanjutan engine)
**Files affected**:
- `apps/api/src/lib/rab-compute.ts` (baru, murni; import ahsp-engine)
- `apps/api/src/lib/rab-compute.test.ts` (7 golden-number test)
**Notes**: Melengkapi jalur "hitung RAB" sisi murni: `computeVolume` (BOQ Σ(P×L×Qty) area − pengurang bukaan), `computeLaborCount`/`computeMaterialTakeoff` (ROUNDUP kebutuhan pekerja/bahan), `computeRabDocument` (orchestrator end-to-end: item AHSP/lump-sum → HSP → Vol×HSP-rounded → subtotal kelompok → bobot% base TOTAL BIAYA → PPN → grand total). Golden angka PERSIS Excel (Control DINDING BATA MERAH + rantai): Volume 164,5−55=109,5; Pekerja 4, Tukang 2, Bata 7875, Semen 32 Zak, Pasir 5; RAB 3 item (2 AHSP + 1 lump-sum SMKK) → HSP 278300/266600/1jt, total 27,83jt/13,33jt/1jt, subtotal 41,16jt, bobot 97,628%, PPN 12% 5.059.200, grand 47.219.200 — semua rantai dokumen bilangan bulat eksak. Gate: tsc 0, lint 0, 7 test hijau (total engine+rab = 17 golden test). Orchestrator = target yang akan dipanggil golden-file harness begitu RAB nyata datang.

**Belum**: parser Excel→RabItemInput (dibangun bersama golden-file nyata), seed DB (nunggu CI isolation), wiring config effective-date.

---


### 2026-07-27 — Feature — Procurement: tutup celah 3-way match PO–GR–Invoice (Migration 121)
**Status**: Done
**Files affected**:
- `apps/api/src/lib/three-way-match.ts` (baru) — nilai GR pada harga PO + ceiling invoice (murni, ber-test)
- `apps/api/src/routes/v1/procurement.ts` — POST supplier-invoices diperketat + auto-invoice cek existing
- `db/migrations/121_supplier_invoice_3way_guards.sql` + kembar — 2 partial unique index
- `apps/api/src/lib/__tests__/three-way-match.test.ts` (11) + `.../supplier-invoice-3way-db.test.ts` (4, schema-test verbatim 121) + `.../supplier-invoice-3way.test.ts` (9, route-level fixture [TEST-3WAY])
- `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` §6 (+ kembaran EA) 🟡→✅ · `docs/PETA-PRIORITAS-ERP.md` §3 #2 SELESAI
**Notes**: PETA-PRIORITAS §3 item #2, diselipkan saat jeda gate CECEP (sesuai catatan PETA — tidak menyela Option 2). Tiga celah: (a) invoice manual kini WAJIB `goods_receipt_id` + supplier dicek cocok GR + project_id diturunkan dari GR + insert whitelist (spread `...body` dihapus — mass-assignment tertutup); (b) total invoice ≤ nilai GR pada HARGA PO — harga aktual GR sengaja bukan basis (selisih harga justru yang harus tertangkap); tagihan di bawah plafon diizinkan (diskon); (c) anti-dobel 3 lapis: satu GR satu invoice (409), nomor faktur unik per supplier (409), auto-invoice saat GR confirm cek invoice existing (komentar lama `:659` akhirnya = kode) — backstop race: `uq_supplier_invoices_gr` + `uq_supplier_invoices_supplier_number` (partial, NULL bebas — auto-invoice & baris legacy pra-121 tetap sah). Prasyarat index diverifikasi dev: nol duplikat existing. Endpoint POST manual API-only (nol pemanggil web/mobile — additive-first aman). Mutation-proof: 3 guard dicabut → 4 test merah, dipulihkan → 9/9.

---


### 2026-07-28 — Feature — Register Piutang: AR aging 30/60/90 + retensi + DP recoupment (Migration 124–125)
**Status**: Done
**Files affected**:
- `db/migrations/124_invoice_dp_recoupment.sql` + kembar (applied dev, verifikasi pg_attribute) — `invoices.dp_deduction_amount/pct`, pola retensi (033)
- `db/migrations/125_menu_piutang.sql` + kembar (applied dev) — menu `keuangan-piutang` DB-driven (1B.2), gated `finance:view:all`
- `apps/api/src/lib/ar-register.ts` (baru, murni ber-test) — bucket aging presisi batas 30/60/90, filter status piutang, `validateDpDeduction` (saldo = DP TERBAYAR − sudah dipotong, fail-closed)
- `apps/api/src/routes/v1/finance.ts` — POST invoices terima potongan DP (hanya `termin_billing` non-`on_sign`); GET `/finance/ar-aging` (+`as_of`,`project_id`) + `/finance/retention-register` + `/finance/dp-register` (permission `finance:view:all`); **fix pra-eksisting**: penomoran invoice pindah dari COUNT `issued_date` bulan berjalan → MAX segmen nomor prefix bulan (basis lama tabrakan unique saat ada invoice terhapus/backdated; terpicu test)
- `apps/web/app/(dashboard)/piutang/page.tsx` (baru) — spektrum umur piutang (bar proporsional per bucket, klik = filter), tabel invoice terbuka, register retensi (+ badge "siap ditagih" bila estimasi lewat), register DP (+ progres pemotongan)
- `apps/web/app/(dashboard)/keuangan/page.tsx` — form invoice termin: toggle "Potong Uang Muka (DP)" + saldo dari dp-register + validasi + ringkasan
- `apps/web/components/sidebar.tsx` — dropdown Keuangan mengenali `/piutang` (active + auto-open + maxHeight 3 anak)
- Test: `lib/__tests__/ar-register.test.ts` (17) + `routes/v1/__tests__/ar-register.test.ts` (11 route-level, fixture `[TEST-AR]`, positif & negatif termasuk authz mandor 403)
**Notes**: PETA §3 item #3, disisipkan saat jeda gate CECEP (pola #2 — tidak menyela Option 2). Compute-on-read hanya untuk TAMPILAN register (pola estimasi penalty DOMAIN §7), bukan angka pembukuan persist — tripwire ledger TIDAK tersentuh (nol tabel ledger). Estimasi jatuh tempo retensi = `end_date + due_days` DILABELI estimasi (BAST formal belum ada). Mutation-proof: guard on_sign + guard saldo dicabut → 8 test merah, dipulihkan → 11/11. Gate: tsc 0 (api+web), lint 0 error, 677 test hijau (74 file), build api+web sukses (route `/piutang` ter-generate).

⚠️ **KEPUTUSAN TERBUKA (owner + konsultan pajak)**: pajak invoice progres saat ini dihitung dari nilai progres PENUH sebelum potongan DP (kalkulasi existing dipertahankan, tidak disentuh — Red-Line pajak). Porsi DP sudah kena pajak saat invoice DP terbit → potensi pajak dobel atas porsi DP. Bila diputuskan DPP = nilai progres − potongan DP, perubahan = satu rumus di form + validasi backend (kecil, terlokalisir).

---


### 2026-07-30 — Fix — Koreksi bug parser AHSP Cibuluh: 3 blok analisa tak terdeteksi (Migration 141, PR #117)
**Status**: Done · **PR**: #117 (squash-merged, CI hijau)
**Files affected**:
- `db/seeds/tools/extract-ahsp-cibuluh.py` — regex `HDR_RE`/`OUT_UNIT_RE`: `\b` diganti lookahead eksplisit
- `db/migrations/141_koreksi_cib_bgk_b3_koefisien.sql` + kembar (applied dev) — arsipkan baris lama `superseded`, baris baru `edit_type='correction'` + `edited_from`
- `db/seeds/ahsp-cibuluh-dataset.json` — regenerasi 417→420 analisa, 2.682→2.698 koefisien
- `apps/api/scripts/seed-ahsp-cibuluh.mjs` — isi `company_id` (constraint `assemblies_source_company_konsisten`)
**Notes**: Regex mensyaratkan spasi wajib antara "1" dan kode satuan; `\b` gagal cocok saat kode satuan langsung disambung huruf. Tiga baris workbook memakai format itu (`"1 M1BONGKARAN…"`, `"1M3 PASANGAN BALOK GORDING KY.KRUING/BORNEO"`) → parser tak pernah melihat blok baru dimulai, komponennya bocor ke blok B.3 sebelumnya, dedup resource menjumlahkan koefisien (Pekerja 0,05+0,043=0,093; Mandor 0,025+0,02=0,045). Diverifikasi manual thd baris mentah workbook: **0 regresi pada 433 blok lain**. Migrasi 141 punya safety check — berhenti (RAISE EXCEPTION) bila `estimate_items` sudah memakai assembly lama. **Ditemukan lewat pertanyaan founder soal selisih HSP, bukan audit terjadwal.**

---


### 2026-07-30 — Feature — CECEP langkah 8: Edit AHSP (correction/deviation) + Aktifkan draft (PR #118)
**Status**: Done · **PR**: #118 (squash-merged, CI hijau 16m28s)
**Files affected**:
- `apps/api/src/routes/v1/ahsp.ts` — `POST /cecep/assemblies/:id/edit` (correction: source+edition tetap; deviation: fork ke company bila asalnya national) + `PATCH /cecep/assemblies/:id/activate`
- `apps/web/app/(dashboard)/estimasi/page.tsx` — tombol "Edit (versi baru)", badge DRAFT, tombol "Aktifkan", `EditAssemblyModal`
- `apps/web/middleware.ts` — **fix bug pre-existing**: `/estimasi` tak pernah ada di `ROLE_ALLOWED` admin/pm
- `apps/api/src/routes/v1/__tests__/ahsp-endpoint.test.ts` — 8 test baru (869 total)
**Notes**: Baris asal TAK PERNAH di-mutate (immutability M1-M2) — hanya dibaca lalu disalin ke versi baru (`version_number+1`, `edited_from`). **Bug middleware ditemukan lewat verifikasi E2E Playwright dengan login admin nyata**: `/estimasi` tak ada di daftar role sejak halaman itu dibuat (PR #90) — artinya seluruh CECEP (langkah 1-8) tak bisa diakses dari UI sejak awal, hanya API yang pernah teruji. Kelas bug yang hanya bisa ditangkap uji end-to-end, bukan test handler.

---


### 2026-07-30 — Feature — CECEP langkah 10: UI Material & RAP + fix bug viaProject (PR #119)
**Status**: Done · **PR**: #119 (squash-merged, CI hijau 17m45s)
**Files affected**:
- `apps/web/app/(dashboard)/estimasi/page.tsx` — tab ke-4 "Material & RAP": picker proyek→RAP, tabel material (qty RAB beku vs qty disesuaikan, harga supplier, pagu computed), tabel borongan, tombol Kunci Pagu, badge draft/locked, Log Perubahan
- `apps/api/src/routes/v1/rap.ts` — **fix bug pre-existing** `viaProject(tabel, ID_SALAH)` di 8 titik
- `apps/api/src/routes/v1/__tests__/cecep-rap-endpoint.test.ts` (baru) — 9 test HTTP (878 total)
**Notes**: Bug: `rap_material_line`/`rap_labor_line`/`rap_change_log` terdaftar di peta tenancy dengan `lewat:'rap_budget_id'`, tapi kode lama mengirim `projectId`/`rap.project_id`. Akibatnya `POST /projects/:id/rap` melaporkan `baris_material` benar tapi **tabelnya selalu kosong** (gagal senyap, tetap 201), dan `GET /rap/:id` punya dua `.eq('rap_budget_id')` bernilai beda yang saling AND → selalu nol baris. Test existing hanya menguji trigger DB via INSERT manual, tak pernah lewat jalur HTTP — celah itu ditutup 9 test baru. Ditambah error handling berisik + rollback RAP yatim bila derivasi gagal.

---


### 2026-07-31 — Fix — Cost Baseline EVM: BAC dari pagu RAP terkunci, bukan RAB
**Status**: Done
**Files affected**:
- `apps/api/src/routes/v1/kurva-s.ts` — query `rap_budget` status `locked` via `viaProject`; BAC berjenjang: pagu RAP → RAB → `contract_value`; `bacSource` + `paguRAP` diekspos di `meta.evm`
- `apps/web/components/kurva-s-section.tsx` — label basis BAC eksplisit ("pagu RAP (biaya)" / "nilai RAB (termasuk margin)"), sub-label EAC ikut menyesuaikan, penjelasan di panel info EVM
- `apps/api/src/routes/v1/__tests__/kurva-s-bac-baseline.test.ts` (baru) — 5 test (883 total)
**Notes**: BAC lama = `totalRABValue`, yaitu nilai **JUAL** ke klien yang sudah mengandung margin/BUK. Memakainya sebagai "biaya yang dianggarkan" membuat **CPI/SPI sistematis terlalu optimistis** — pembengkakan biaya kecil tersembunyi di balik bantalan margin sampai margin itu habis. Ini akar masalah yang `CECEP/03` §6 catat sejak awal dan `CECEP/52` Gap-2 tetapkan solusinya (Cost Baseline = RAP Frozen); prasyaratnya baru lunas setelah RAP live (migrasi 138, PR #119). Hanya RAP `locked` yang dipakai — RAP draft masih berubah, dan baseline yang bergerak bukan baseline. **Regresi dijaga**: proyek tanpa RAP terkunci memakai perilaku lama persis (test khusus), supaya angka proyek berjalan tak berubah mendadak. Mutation-proof: fix dicabut → 2 test inti merah, test regresi tetap hijau; dipulihkan → 5/5. Ratchet tenancy sempat merah karena versi awal memakai `supabase` mentah → diperbaiki ke `viaProject` (query jadi ter-scope tenant sekalian). Gate: tsc 0 (api+web), lint API 0 error, 883 test hijau (95 file), build web sukses.

**Ditemukan saat**: pembacaan menyeluruh 233 file `docs/` atas permintaan founder — bukan dari laporan bug. Temuan lain dari pembacaan itu (belum dikerjakan): `apps/web` sama sekali di luar CI, nol dependency/secret scanning, `no-explicit-any` dimatikan tanpa amandemen, nol audit WCAG.

---


<!-- Template untuk entry baru:

### YYYY-MM-DD HH:MM — [Kategori] — [Deskripsi]
**Status**: Done
**Files affected**:
- path/ke/file.ts
**Notes**: catatan penting

---
-->
