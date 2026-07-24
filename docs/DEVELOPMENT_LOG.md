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


<!-- Template untuk entry baru:

### YYYY-MM-DD HH:MM — [Kategori] — [Deskripsi]
**Status**: Done
**Files affected**:
- path/ke/file.ts
**Notes**: catatan penting

---
-->
