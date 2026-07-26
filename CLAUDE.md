# Puraloka Suite — Context for Claude Code

> **WAJIB baca AUTOPILOT.md di awal setiap sesi sebelum tindakan apa pun.**
>
> **Lalu baca `STATUS.md` (root)** — penunjuk satu-pintu: fase aktif, keputusan terbuka menunggu founder, dan peta "ke mana membaca apa". Dokumen induk prioritas + registry semua dokumen rencana (mana AKTIF/STALE): `docs/PETA-PRIORITAS-ERP.md`. Status per-menu ERP terverifikasi kode: `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`. ⚠️ Angka "migration 001-058" di bawah SUDAH BASI — migration nyata s.d. 116; dev nyata 90 tabel; jangan percaya klaim skala di file ini tanpa cek `STATUS.md`.
>
> **Tripwire arsitektur (2026-07-26):** modul ber-ledger apa pun (WIP/PSAK, commitment ledger, GL, `financial_events`) WAJIB didahului keputusan multi-company — lihat `docs/KEPUTUSAN-MULTI-COMPANY.md`.
>
> **Status Phase 1 (rollup + verdict):** `docs/superpowers/specs/2026-07-18-enterprise-architecture/PHASE-1-STATUS.md` (peta 1A/1B/1C/1D + config-first) & `…/PHASE-1-COMPLETION-AUDIT.md` (verdict + hasil jujur RLS table-dormant / storage-fixed / otorisasi). Phase 1 = Program A. **Phase 2 = Program B SELESAI** — approval berjenjang + routing notifikasi kini konfigurasi UI; rollup: `…/PHASE-2-STATUS.md`.

## AUTONOMOUS EXECUTION MODE

Ketika sudah ada roadmap/ADR/Epic/execution plan yang disetujui, **lanjutkan mengerjakan dependency berikutnya secara otomatis**. Jangan berhenti hanya untuk bertanya "mau lanjut?". Bertindaklah seperti senior engineer yang membaca sprint lalu jalan sendiri, lapor progres secara asynchronous — bukan minta izin tiap langkah.

**BOLEH otonom** (implement → test → commit → push → buka PR → merge jika prasyarat terpenuhi → update dokumentasi/STATUS → lanjut task berikutnya) bila SEMUA benar:
- ada ADR/Epic/execution plan yang jelas · tidak mengubah requirement bisnis · tidak menambah scope · bukan breaking change · tidak menyentuh production · dapat diverifikasi CI/test · dapat di-revert via git.

Merge policy proyek ini: branch + PR (bukan langsung `main` untuk kode), CI hijau wajib, urutan **Review → Migration → Verification → Merge** (migration di-apply ke dev SETELAH PR logic-nya benar, sebelum merge). Update `STATUS.md` adalah bagian Definition of Done — lakukan tanpa diminta.

**WAJIB berhenti & tanya** hanya bila:
1. **Production** — deploy production, apply migration production, rotate secret, delete data.
2. **Requirement berubah** — ADR/workflow/business logic perlu diubah.
3. **Trade-off produk** — ≥2 desain sama-sama valid, butuh keputusan produk.
4. **CI merah** — perbaiki dulu, jangan lanjut sprint (ini "berhenti untuk fix", bukan "berhenti untuk tanya").
5. **Blocker kredensial/eksternal** — password, API key, Supabase Auth login, approval eksternal.
6. User eksplisit minta review sebelum lanjut.

Di luar keenam itu: jangan tanya, kerjakan. Laporkan hasil, bukan minta izin melangkah.

**Engineering Default Rule:** kalau ada beberapa pendekatan implementasi dan tidak ada ADR yang memilih salah satu, **pilih sendiri** yang: (1) paling maintainable jangka panjang, (2) menambah verifikasi otomatis, (3) mengurangi technical debt, (4) behavior-preserving, (5) tidak memperluas scope sprint. Dokumentasikan alasannya di commit/PR, lalu lanjut. **Adanya beberapa alternatif teknis bukan alasan berhenti bertanya** — hanya berhenti kalau alternatif itu mengubah business behavior, product requirement, security model, atau deployment risk. Bila sebuah subsistem belum punya test harness, membangunnya adalah task pertama sprint (bukan alasan menunda verifikasi).

**Engineering Default Rule #3 — derivasi capability yang hilang:** kalau permission model tidak lengkap TAPI capability yang hilang bisa diturunkan mekanis dari scope yang sudah ada (mis. policy lama `auth_role() IN ('admin','pm')` = requirement bisnis sudah jelas, hanya representasinya yang kurang), **jangan berhenti** — buat capability baru yang paling tepat secara domain (mis. `progress:manage`, `workers:manage`), seed ke role yang menjaga scope identik, update migration/test/ADR, lalu lanjut. Ini identik dengan `audit:view`/`finance:tax:submit` di Epic 3. Berhenti HANYA kalau: ada ≥2 makna bisnis yang sama-sama valid, ATAU capability itu mengubah SIAPA yang boleh (memperluas ke role baru di luar scope lama). Menjaga scope lama = behavior-preserving = tidak perlu izin.

**Engineering Default Rule #2 — blocker teknis diselesaikan sendiri:** kalau blocker disebabkan keterbatasan/perilaku teknis — PostgreSQL/Supabase/framework/compiler, RLS recursion, deadlock, locking, transaction semantics, query planner, migration conflict — **jangan berhenti bertanya**. Wajib: (1) root-cause analysis, (2) bandingkan dengan best practice resmi, (3) implementasikan solusi kanonik, (4) verifikasi dengan test otomatis, lalu lanjut sprint. Tulis ADR bila solusinya berdampak arsitektur lintas-modul (dokumentasi, bukan minta izin). Berhenti HANYA bila ada ≥2 solusi kanonik dengan konsekuensi arsitektur yang berbeda material (mis. SECURITY DEFINER helper vs denormalisasi ownership vs JWT-claim cache) — itu baru keputusan arsitektur. "Bug teknis tanpa ADR" bukan alasan berhenti; bug bukan keputusan produk.

## Mission Continuity Rule

Jangan optimalkan penyelesaian tiket/epic tunggal — optimalkan penyelesaian **seluruh misi** (mis. seluruh Phase/Sub-Fase). Kalau menyelesaikan satu akar masalah sekarang menghapus pekerjaan di beberapa epic ke depan, selesaikan segera. Selalu lihat ke depan; hindari optimasi lokal; optimalkan global lintas seluruh scope.

**Git strategy untuk misi multi-epic:** kalau diberi mandat menyelesaikan sebuah Phase/scope penuh secara otonom, kerjakan **lokal** sampai seluruh scope Done — jangan PR/push per-epic (mahal: CI berkali-kali, context-switch, branch kecil-kecil). Setelah seluruh scope mencapai Done + semua audit hijau (typecheck, lint, test, architecture, permission, migration, RLS, regression, docs), baru: commit (boleh beberapa commit logis) → push sekali → **satu PR** → tunggu CI → merge → update STATUS. Pengecualian: kalau perubahan menyentuh DB live tunggal, tetap verifikasi jaring pengaman sebelum operasi destruktif. Default per-epic-PR tetap berlaku untuk kerja normal (bukan mandat scope-penuh).

## Tentang Project
Aplikasi manajemen konstruksi untuk **Puraloka Persada** milik Nizar (nihzaa).
Platform bernama **Puraloka Suite** — web dashboard admin + mobile app + backend API.

## Repository
- GitHub: `https://github.com/nihzaa/puraloka-suite` (Private)
- Local: `E:\Project\puraloka-suite`

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Backend API | Node.js + Fastify + TypeScript |
| Web Dashboard | Next.js 16 + Tailwind CSS v4 + TypeScript |
| Mobile | React Native + Expo (belum disetup) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password + Google OAuth aktif) |
| Storage | Supabase Storage |
| Package Manager | pnpm (monorepo dengan pnpm workspaces) |
| Language | TypeScript semua layer |

## Monorepo Structure
```
puraloka-suite/
├── apps/
│   ├── api/          → Fastify backend (port 3001)
│   ├── web/          → Next.js dashboard (port 3000)
│   └── mobile/       → React Native Expo (Fase 1 selesai — auth, role-based nav, 7 screens)
├── packages/
│   └── shared/       → Types & constants bersama
├── db/
│   ├── migrations/   → SQL migration files (001-058)
│   └── seeds/        → Seed data dummy
├── supabase/
│   └── migrations/   → Copy dari db/migrations (untuk supabase db push)
└── CLAUDE.md
```

---

## Supabase Configuration
- Project name: `puraloka-suite-dev`
- Project URL: `https://tgozokxyvwmyvajgqfxw.supabase.co`
- Region: Southeast Asia (Singapore)
- Auth providers aktif: Email/Password, Google OAuth
- **RLS: AKTIF & 100% permission-based** (Epic 4, Sub-Fase 1A). Policy membaca `has_permission()` (dari `role_permissions`) + helper ownership `SECURITY DEFINER` (ADR-005) — bukan literal role. Migration 049 (RLS awal literal-role) sudah di-contract/dihapus (migration 071). API tetap pakai service_role (bypass RLS) — RLS adalah lapis pertahanan kedua untuk akses non-service-role.

---

## Database — 27+ Tabel

### Core Tables
- `users` — semua user (admin, pm, mandor, client). Auth dihandle Supabase, kolom `auth_id` FK ke `auth.users`. Kolom tambahan: `push_subscription JSONB` (Web Push)
- `clients` — data klien (mayoritas perorangan, bukan perusahaan)
- `projects` — master proyek konstruksi. Kolom tambahan: `is_deleted`, `deleted_at`, `deleted_by` (soft-delete)

### Finance Tables
- `termin_schedules` — jadwal penagihan untuk model termin
- `expense_category_templates` — template kategori pengeluaran global
- `project_expense_categories` — kategori per proyek (clone dari template)
- `expense_reports` — laporan pengeluaran untuk model komisi
- `expense_items` — detail item per laporan pengeluaran
- `invoices` — invoice ke klien
- `payments` — pembayaran masuk dari klien
- `tax_records` — rekap pajak per invoice

### Mandor Tables
- `mandor_assignments` — kontainer penugasan mandor ke proyek
- `work_scopes` — unit pekerjaan per mandor (tiap scope punya payment_system sendiri). Kolom tambahan (migration 052): `rab_category_id UUID FK rab_items` (opsional, link ke sub-kategori RAB)
- `workers` — daftar tukang/pekerja (global, kolom `skills TEXT[]`)
- `daily_wage_logs` — log upah harian
- `kasbons` — kasbon mandor (berlaku semua payment_system)
- `worker_kasbons` — kasbon untuk pekerja individual
- `progress_payments` — pembayaran per persentase progress
- `borongan_settlements` — settlement akhir pekerjaan borongan

### Monitoring Tables
- `milestones` — target pencapaian proyek
- `progress_logs` — log progress harian. Kolom tambahan (migration 052): `mode TEXT ('daily'|'detail')`, `rab_item_id UUID FK rab_items`, `pct_completion NUMERIC(5,2)` (null jika mode daily), `pct_overall` nullable
- `project_photos` — foto dokumentasi lapangan
- `documents` — dokumen proyek

### Cash Management Tables
- `cash_accounts` — akun kas (main cash, bank, petty cash)
- `cash_transfers` — transfer antar akun kas
- `project_expenses` — pengeluaran proyek dengan nota

### System Tables
- `notifications` — notifikasi ke user. Kolom tambahan (migration 038): `type`, `action_type`, `action_data JSONB`, `is_actioned`, `actioned_at`, `priority`
- `audit_logs` — rekam jejak perubahan data. `user_id` ON DELETE SET NULL (trail survives user deletion)

---

## Business Logic Kritis

### Contract Models
- `termin` — tagih klien per tahap sesuai `termin_schedules`
- `komisi` — lapor pengeluaran via `expense_reports`, tagih total + `commission_pct`

### Tax Schemes
- `pph_final` — default untuk klien perorangan, PPh final pasal 4(2) tarif 2%
- `ppn` — untuk B2B, PPN 11%

### Mandor Payment Systems
- `harian` — bayar per minggu, input total upah langsung (tidak dirinci per tukang)
- `borongan` — bayar setelah selesai, ada settlement akhir
- `progress_pct` — bayar per persentase progress

### Kasbon Rules (Migration 056)
- Berlaku untuk SEMUA payment_system
- Selalu di level mandor (bukan per tukang individual)
- Tujuan: `gaji_tukang`, `uang_makan`, `pembelian_alat`, `operasional`, `lain_lain`
- Fund source: `owner_advance` atau `client_fund`
- **`work_scope_id` opsional (nullable)** — kasbon bisa umum (terikat proyek langsung) tanpa scope tertentu
- **`project_id` wajib** — diisi langsung atau di-backfill dari scope assignment
- **Tidak ada limit 80%** — `kasbon_limit_pct` dihapus dari `work_scopes`
- Mandor kasbon umum harus punya `mandor_assignment` aktif di proyek tersebut
- GET `/api/v1/kasbons` untuk mandor: filter by `project_id IN [proyek yang di-assign]` (bukan scope-based)
- PATCH `/api/v1/kasbons/:id/status` PM isolation: baca `kasbons.project_id` langsung (fallback resolve dari scope jika null/data lama)

### RAB Komponen Biaya (Migration 052)
Setiap `rab_items` punya 4 kolom persentase biaya:
- `material_pct`, `upah_pct`, `alat_pct`, `other_pct` — semua DEFAULT 0
- **Constraint** `rab_items_pct_sum`: total harus 0 (belum diisi) ATAU antara 99.9–100.1 (sudah set)
- `komponen_set: boolean` — computed di API, true jika total ≈ 100
- Juga menambahkan `planned_start DATE`, `planned_end DATE`, `gantt_dependencies UUID[]` ke `rab_items`

**Gantt fields** di `rab_items`: `planned_start`, `planned_end`, `gantt_dependencies UUID[]` (dependency antar item RAB, untuk Gantt Chart Phase 4)

### Progress Log — Dua Mode (Migration 052)
`progress_logs` sekarang punya kolom tambahan:
- `mode TEXT DEFAULT 'daily'` — `'daily'` atau `'detail'`
- `rab_item_id UUID` — FK ke `rab_items`, wajib jika mode=detail, null jika daily
- `pct_completion NUMERIC(5,2)` — % selesai per item RAB, null jika daily
- `pct_overall` sekarang **nullable** (null valid untuk mode=detail)

**Mode detail**: pilih RAB item → isi % completion → API:
1. Insert `progress_logs` dengan `mode='detail'`, `rab_item_id`, `pct_completion`
2. Update `rab_items.progress_pct = pct_completion` untuk item yang dipilih
3. **Bubble-up lapis 1**: recalculate `progress_pct` setiap parent category/subcategory = weighted average item di bawahnya (bobot item-level)
4. **Bubble-up lapis 2**: recalculate `projects.progress_pct = SUM(category.weight_pct × category.progress_pct / 100)`
5. Return `{ data: log, new_overall_pct: number }`

**Mode daily**: log umum (cuaca, pekerja, foto, catatan). Tidak mengubah `projects.progress_pct`. `pct_overall` sekarang **opsional** (nullable di DB dan opsional di API).

**Endpoint:** `POST /api/v1/projects/:id/progress-logs` (sama, body berbeda per mode)

### Kurva S & EVM — Sumber Data
**AC (Actual Cost / Serapan Aktual Kas)** mencakup SEMUA pengeluaran proyek:
- `kasbons` status=approved (operasional mandor)
- `project_expenses` status=approved/paid (material, sewa alat, dll)
- `daily_wage_logs` status=paid (upah mandor mingguan)
- `progress_payments` (bayar per % ke mandor)
- `borongan_settlements` (settlement akhir borongan)

**EVM values** tersedia di `meta.evm` dari endpoint `GET /api/v1/projects/:id/kurva-s`:
- `bac`: Budget At Completion = total RAB value (fallback: contract_value)
- `ac`: Actual Cost = total semua pengeluaran
- `ev`: Earned Value = `projects.progress_pct × bac / 100`
- `pv`: Planned Value = rencana S-curve saat ini × bac / 100
- `cpi`, `spi`, `sv`, `cv`, `eac`, `etc`, `vac`, `tcpi` — standard EVM metrics

**Scatter progress**: hanya dari `progress_logs` dengan `mode='daily'` dan `pct_overall NOT NULL`. Mode detail tidak muncul di scatter (nilainya sudah terekap di `projects.progress_pct`).

### Mandor ↔ RAB Link (Migration 052)
`work_scopes.rab_category_id UUID FK rab_items` — opsional, link ke sub-kategori RAB saat membuat scope mandor baru. Memungkinkan tracing: pekerjaan mandor mana yang merupakan bagian dari sub-kategori RAB mana.

### Notification System
- **Role-based**: admin & PM dapat notif proyek/invoice/kasbon; mandor dapat notif kasbon approved/rejected; semua role dapat notif relevan
- **Priority levels**: `low`, `normal`, `high`, `urgent`
- **Interactive**: notifikasi kasbon & laporan upah bisa di-approve/reject langsung dari panel notif atau halaman history
- **Web Push**: VAPID-based device push via `web-push` package (lazy-init, graceful jika VAPID tidak dikonfigurasi)
- **Fire-and-forget**: semua insert notifikasi non-blocking (tidak pernah throw error ke main request)
- **Milestone polling**: `GET /api/v1/notifications/check-milestones` (admin only, idempotent, dedup 24h)

### Roles & Access
- `admin` — akses penuh, bisa register user baru
- `pm` — kelola proyek yang di-assign
- `mandor` — lihat scope sendiri, input progress, lihat kasbon sendiri
- `client` — read-only portal proyek mereka

---

## API Endpoints (yang sudah ada)

**Base URL:** `http://localhost:3001`

### Auth & Users
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/auth/login` | Login, return token |
| POST | `/api/v1/auth/register` | Daftarkan user baru (admin only) |
| GET | `/api/v1/auth/me` | Data user yang login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| GET | `/api/v1/users?all=true` | List semua user (admin: all=true termasuk nonaktif) |
| PATCH | `/api/v1/users/:id` | Update nama/telepon/role user (admin only) |
| PATCH | `/api/v1/users/:id/toggle-active` | Aktifkan/nonaktifkan user (admin only) |

### Projects & Dashboard
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/projects` | List semua proyek + join clients & PM (exclude soft-deleted) |
| POST | `/api/v1/projects` | Buat proyek baru + clone expense categories + notif PM |
| PUT | `/api/v1/projects/:id` | Update proyek (cek is_deleted guard) |
| PATCH | `/api/v1/projects/:id/status` | Update status (cek is_deleted guard + notif admin+PM) |
| DELETE | `/api/v1/projects/:id` | Soft-delete proyek (set is_deleted=true, status=cancelled) |
| GET | `/api/v1/projects/:id` | Detail proyek + semua nested data + ownership check per role |
| GET | `/api/v1/dashboard?period=` | Dashboard aggregation data (Promise.allSettled, partial failure safe) |

**Period params:** `last_30_days`, `last_3_months`, `last_6_months`, `this_year`, `all_time`

### Notifications
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/notifications` | List notifikasi (filter: is_read, priority; max 100) |
| GET | `/api/v1/notifications/count` | Unread count untuk badge |
| PATCH | `/api/v1/notifications/:id/read` | Tandai satu notif sudah dibaca |
| PATCH | `/api/v1/notifications/read-all` | Tandai semua sudah dibaca |
| DELETE | `/api/v1/notifications/:id` | Hapus notif (ownership enforced) |
| POST | `/api/v1/notifications/:id/action` | Interactive: approve/reject kasbon atau wage report |
| GET | `/api/v1/notifications/check-milestones` | Polling milestone approaching/overdue (admin only) |
| POST | `/api/v1/notifications/subscribe` | Simpan push_subscription untuk Web Push |
| DELETE | `/api/v1/notifications/subscribe` | Hapus push_subscription |

### Keuangan (Finance)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/finance/kasbons` | List kasbon lintas proyek + mandor info (pagination cap 200) |
| GET | `/api/v1/finance/kasbon-summary` | Summary kasbon per mandor |
| GET | `/api/v1/finance/invoices` | List invoice (pagination cap 200) |
| POST | `/api/v1/finance/invoices` | Buat invoice baru + notif semua admin |
| POST | `/api/v1/finance/invoice/:id/pay` | Catat pembayaran + notif admin+PM |

### Kas (Cash Management)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/cash/accounts` | List akun kas |
| POST | `/api/v1/cash/accounts` | Buat akun kas baru |
| PATCH | `/api/v1/cash/accounts/:id` | Edit akun kas |
| GET | `/api/v1/cash/transfers` | List transfer dana (pagination cap 200) |
| POST | `/api/v1/cash/transfers` | Catat transfer baru |
| PATCH | `/api/v1/cash/transfers/:id/confirm` | Konfirmasi transfer |
| GET | `/api/v1/cash/expenses` | List pengeluaran proyek (pagination cap 200) |
| POST | `/api/v1/cash/expenses` | Catat pengeluaran baru (multipart, bisa upload nota) |
| PATCH | `/api/v1/cash/expenses/:id/status` | Approve/reject pengeluaran |
| DELETE | `/api/v1/cash/expenses/:id` | Hapus pengeluaran (admin, hanya draft/submitted) |
| GET | `/api/v1/cash/summary` | Ringkasan saldo semua kas |
| GET | `/api/v1/cash/categories?project_id=` | Kategori pengeluaran (auto-clone template ke project jika belum ada) |

### Mandor
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/mandor/summary` | Ringkasan mandor & kasbon |
| GET | `/api/v1/mandor/rekapitulasi` | Keuangan mandor: earned/paid/outstanding/kasbon_beredar/sisa_bersih (mandor: hanya milik sendiri) |
| GET | `/api/v1/mandor/assignments` | List semua assignment |
| POST | `/api/v1/mandor/assignments` | Assign mandor ke proyek |
| GET | `/api/v1/mandor/work-scopes/:id` | Detail scope + items + specs |
| POST | `/api/v1/mandor/work-scopes` | Buat scope pekerjaan baru |
| POST | `/api/v1/mandor/work-scopes/:id/items` | Tambah item rincian pekerjaan |
| PATCH | `/api/v1/mandor/scope-items/:id` | Update item (replace specs) |
| DELETE | `/api/v1/mandor/scope-items/:id` | Hapus item |
| PATCH | `/api/v1/mandor/scope-items/:id/progress` | Update volume_done realisasi |
| GET | `/api/v1/mandor/list` | Daftar user mandor untuk dropdown |
| GET | `/api/v1/mandor/wage-reports` | List laporan upah mingguan |
| POST | `/api/v1/mandor/wage-reports` | Buat laporan upah + notif admin+PM |
| GET | `/api/v1/kasbons` | List kasbon (mandor: semua proyek sendiri; admin/pm: semua; filter: status, work_scope_id) |
| POST | `/api/v1/kasbons` | Ajukan kasbon — `project_id` ATAU `work_scope_id` wajib; scope opsional; notif admin+PM |
| PATCH | `/api/v1/kasbons/:id/status` | Approve/reject kasbon + notif mandor (PM isolation via kasbons.project_id) |

### RAB & Progress (Phase 1 ERP Upgrade)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/projects/:id/rab` | RAB tree + `komponen_set` per item (material_pct, upah_pct, alat_pct, other_pct) |
| GET | `/api/v1/projects/:id/rab/categories` | Sub-kategori RAB untuk dropdown assign mandor scope |
| GET | `/api/v1/projects/:id/rab/items` | Item-level RAB untuk dropdown mode detail di progress log |
| GET | `/api/v1/projects/:id/rab/gantt` | Semua items dengan gantt fields (planned_start, planned_end, dependencies) |
| PATCH | `/api/v1/projects/:id/rab/:itemId` | Update komponen biaya (material/upah/alat/other pct) atau progress_pct |
| PATCH | `/api/v1/projects/:id/rab/bulk-komponen` | Bulk update komponen biaya beberapa items sekaligus |
| PATCH | `/api/v1/projects/:id/rab/:itemId/gantt` | Update planned_start, planned_end, gantt_dependencies |
| POST | `/api/v1/projects/:id/progress-logs` | Buat log (mode=daily: general; mode=detail: per RAB item + recalculate project %) |
| GET | `/api/v1/projects/:id/progress-logs` | List logs; termasuk `mode`, `pct_completion`, `rab_item` jika detail |

### RAB Schedule & Absorption Log (Migration 057)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/projects/:projectId/rab-schedule` | Semua jadwal rencana dikelompokkan per item |
| GET | `/api/v1/projects/:projectId/rab-schedule/:itemId` | Jadwal rencana satu item RAB |
| POST | `/api/v1/projects/:projectId/rab-schedule` | Upsert jadwal rencana per minggu (admin/pm) |
| DELETE | `/api/v1/projects/:projectId/rab-schedule/:id` | Hapus jadwal rencana |
| GET | `/api/v1/projects/:projectId/absorption` | Semua log serapan aktual proyek |
| GET | `/api/v1/projects/:projectId/absorption/:itemId` | Log serapan satu item RAB |
| GET | `/api/v1/projects/:projectId/absorption/summary` | Serapan kumulatif per item (total %) — untuk kolom di RAB section |
| POST | `/api/v1/projects/:projectId/absorption` | Upsert log serapan: Mode A (total_pct absolut, distribusikan proporsional) atau Mode B (per komponen langsung) |
| DELETE | `/api/v1/projects/:projectId/absorption/:id` | Hapus log serapan |

### Search Global
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/search?q=&limit=` | Cari proyek/klien/invoice/kasbon/milestone/user; role-aware (client tidak bisa search) |

### Audit Trail
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/audit` | List audit logs (admin only); filter: table_name, action, user_id, project_id, from, to; pagination |
| GET | `/api/v1/audit/meta` | Distinct table names + action types untuk filter dropdown |

### Change Order (Phase 3 ERP Upgrade)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/projects/:projectId/change-orders` | List CO per proyek (filter: ?status=) |
| POST | `/api/v1/projects/:projectId/change-orders` | Buat CO baru (draft) |
| GET | `/api/v1/change-orders/:id` | Detail CO + items |
| PUT | `/api/v1/change-orders/:id` | Update CO (hanya draft) |
| DELETE | `/api/v1/change-orders/:id` | Hapus CO (hanya draft) |
| POST | `/api/v1/change-orders/:id/items` | Tambah item ke CO |
| PUT | `/api/v1/change-orders/:id/items/:itemId` | Update item |
| DELETE | `/api/v1/change-orders/:id/items/:itemId` | Hapus item |
| PATCH | `/api/v1/change-orders/:id/submit` | Submit CO untuk approval (min 1 item) |
| PATCH | `/api/v1/change-orders/:id/approve` | Approve CO (admin only) — update contract_value + audit log + notif |
| PATCH | `/api/v1/change-orders/:id/reject` | Reject CO (admin only) — notif submitter |

**Auth header:** `Authorization: Bearer <token>`

---

## API File Structure
```
apps/api/src/
├── index.ts              → Fastify entry point (port 3001)
├── utils/
│   ├── supabase.ts       → Supabase client (service role)
│   ├── notifications.ts  → createNotification, createNotifications, getProjectAdminsAndPM, getProjectMandors, getAllAdmins
│   ├── webpush.ts        → VAPID Web Push via web-push package (lazy-init)
│   └── terbilang.ts      → Konversi angka ke teks Indonesia (untuk kontrak)
├── plugins/
│   └── auth.ts           → authenticate middleware + requireRole guard
└── routes/
    └── v1/
        ├── auth.ts           → Auth + register user
        ├── users.ts          → User management (list/edit/toggle-active)
        ├── projects.ts       → Projects CRUD + soft-delete + notifikasi
        ├── dashboard.ts      → Dashboard aggregation (Promise.allSettled)
        ├── notifications.ts  → Notification CRUD + interactive action + Web Push subscribe
        ├── finance.ts        → Invoice, kasbon summary lintas proyek + notifikasi
        ├── cash.ts           → Kas management: accounts, transfers, expenses, categories
        ├── mandor.ts         → Mandor: assignments, work scopes, scope items, kasbon, wage reports + notifikasi
        ├── kasbons.ts        → Kasbon per proyek + notifikasi approve/reject
        ├── milestones.ts     → Milestone CRUD + notifikasi milestone completed
        ├── rab.ts            → RAB (Rencana Anggaran Biaya, file cap 2MB); GET /rab/categories, /rab/items, /rab/gantt; PATCH rab/:itemId (komponen biaya + progress_pct), bulk-komponen, gantt
        ├── progress.ts       → Progress logs per proyek: POST mode daily/detail; mode detail update rab_items.progress_pct + recalculate projects.progress_pct
        ├── kurva-s.ts        → Kurva S data points
        ├── documents.ts      → Dokumen proyek (upload ke Supabase Storage)
        ├── contracts.ts      → Generate kontrak PDF
        ├── reports.ts        → Laporan: rekap per proyek, mandor, ekspor Excel
        ├── termin-payment.ts → Bayar termin + upload bukti transfer
        ├── procurement.ts    → E-Procurement: materials, suppliers, MR, PO, GR, supplier invoices/payments, stocks; POST /stocks/usage + /stocks/opname + GET /supplier-payments
        ├── rab-schedule.ts   → RAB Schedule (rencana per item/minggu) + Absorption Log (serapan aktual manual); migration 057
        ├── audit.ts          → Audit trail viewer (admin only); GET /audit + /audit/meta; filter + pagination
        ├── search.ts         → Search global GET /search?q=; role-aware (proyek/klien/invoice/kasbon/milestone/user)
        ├── change-orders.ts  → Change Order: CRUD + submit + approve (Phase 3)
        ├── roles.ts          → RBAC: GET /roles, GET /permissions — roles & permissions list
        └── settings.ts       → Pengaturan perusahaan: GET/PUT /settings/company + POST /settings/company/logo
```

---

## Web App Structure
```
apps/web/
├── app/
│   ├── layout.tsx                    → Root layout (fonts: Bricolage Grotesque + Plus Jakarta Sans)
│   ├── globals.css                   → Design tokens (Tailwind v4 @theme)
│   ├── page.tsx                      → Root redirect ke /dashboard
│   ├── login/
│   │   └── page.tsx                  → Login page (berfungsi, email+password)
│   └── (dashboard)/
│       ├── layout.tsx                → Dashboard layout dengan sidebar
│       ├── dashboard/
│       │   └── page.tsx              → Dashboard home (data real, KPI, chart, period filter)
│       ├── proyek/
│       │   ├── page.tsx              → List proyek (abort controller pada fetch)
│       │   └── [id]/page.tsx         → Detail proyek (RAB, Kurva S, milestone, progress log, dokumen, kontrak PDF)
│       ├── keuangan/
│       │   └── page.tsx              → Invoice, kasbon lintas proyek, expense view
│       ├── kas/
│       │   └── page.tsx              → Manajemen kas: akun kas, transfer dana, pengeluaran proyek
│       ├── mandor/
│       │   └── page.tsx              → Mandor: ringkasan, laporan upah, kasbon, penugasan + scope items
│       ├── laporan/
│       │   └── page.tsx              → Laporan: rekap per proyek / mandor / keuangan, export Excel
│       ├── notifications/
│       │   └── page.tsx              → History notifikasi: timeline, filter, bulk action, inline approve/reject
│       ├── procurement/
│       │   └── page.tsx              → E-Procurement: 8 tab (Supplier, Material, MR, PO, GR, Hutang Supplier, Stok, Laporan)
│       ├── klien/
│       │   └── page.tsx              → Manajemen klien (admin only): CRUD klien + toggle aktif
│       ├── kalender/
│       │   └── page.tsx              → Kalender proyek: milestone, termin, progress log, project start/end; side panel; upcoming events
│       ├── audit/
│       │   └── page.tsx              → Audit trail (admin only): filter tabel/action/tanggal; diff view old→new; JSON raw; pagination
│       ├── sistem/
│       │   └── page.tsx              → Admin: run check-deadlines/milestones manual; panduan Resend email + cron job
│       ├── pengaturan/
│       │   ├── page.tsx              → Profil perusahaan: logo, nama, alamat, bank, invoice prefix, signature
│       │   └── roles/
│       │       └── page.tsx          → Roles & permissions viewer (admin only)
│       ├── mandor/
│       │   ├── page.tsx              → Mandor: ringkasan, laporan upah, kasbon, penugasan + scope items
│       │   └── [id]/page.tsx         → Detail profil mandor (halaman individual per mandor)
│       └── users/
│           └── page.tsx              → User management (admin only): tambah/edit/nonaktifkan user
├── components/
│   ├── sidebar.tsx                   → Sidebar navigasi (menu Klien, Procurement: admin/pm only; Users: admin only; Audit, Kalender, Sistem: semua role)
│   ├── topbar.tsx                    → Top navigation bar: search button (Ctrl+K), ThemeToggle, NotificationPanel
│   ├── command-palette.tsx           → Command palette: Ctrl+K; search proyek/klien/invoice/kasbon/milestone/user; quick actions; role-aware
│   ├── theme-toggle.tsx              → Toggle dark/light mode
│   ├── notification-panel.tsx        → Dropdown notif via createPortal: tabs, badge, approve/reject inline, 30s polling
│   ├── project-modal.tsx             → Modal tambah/edit proyek
│   ├── progress-log-modal.tsx        → Modal input progress: mode toggle (daily/detail); detail mode: dropdown RAB item + input % completion + preview dampak proyek %
│   ├── milestone-modal.tsx           → Modal tambah/edit milestone
│   ├── milestone-section.tsx         → Section milestone di detail proyek
│   ├── rab-section.tsx               → Section RAB + komponen biaya inline edit (material/upah/alat/lain %) + KomponenBar visual + toggle kolom + inline absorption log input
│   ├── rab-schedule-modal.tsx        → Modal input RAB Schedule (rencana per minggu) + Absorption Log (serapan aktual) per item RAB
│   ├── absorption-log-table.tsx      → Tabel log serapan aktual: grouped by week, collapsible, CRUD
│   ├── kurva-s-section.tsx           → Section Kurva S progress: 3 garis, EVM cards 2×3, KPI strip 4 cards
│   ├── document-section.tsx          → Section dokumen proyek (5MB cap)
│   ├── mandor-section.tsx            → Section mandor di detail proyek + dropdown RAB sub-kategori saat buat scope baru
│   ├── gantt-section.tsx             → Gantt chart WBS custom renderer: dual-bar, SVG arrows, dependency warnings, today line, edit modal
│   ├── change-order-section.tsx      → Section Change Order di detail proyek: CRUD + submit + approve/reject
│   ├── photo-gallery.tsx             → Gallery foto proyek: lightbox fullscreen, keyboard nav, tab kategori, badge overlay
│   ├── termin-payment-modal.tsx      → Modal bayar termin
│   └── contract-generator-modal.tsx  → Modal generate kontrak PDF
├── lib/
│   ├── supabase.ts                   → Supabase client (anon key)
│   ├── api.ts                        → Axios client + login/logout/cookie handling + auto token refresh + makeAbortController()
│   └── webpush.ts                    → subscribeToPush() / unsubscribeFromPush() (browser)
├── public/
│   └── sw.js                         → Service Worker: handle push event + notificationclick
└── middleware.ts                     → Auth guard (redirect berdasarkan cookie token)
```

---

## Design System

**Status:** Light theme modern (sudah diimplementasikan)

**Warna brand:**
- Aksen utama: `#003366` (navy deep) — tombol, active state, highlight
- Aksen sekunder: `#0066CC` untuk link dan icon aktif

**Color system:**
- Background: `#F8F9FA` warm white
- Surface/card: `#FFFFFF` dengan shadow tipis
- Text primary: `#111827`
- Text secondary: `#6B7280`
- Border: `#E5E7EB`
- Success: `#15803d`, Warning: `#D97706`, Danger: `#B91C1C`

**Fonts:**
- Display/Headings: `Bricolage Grotesque`
- Body: `Plus Jakarta Sans`

**Prinsip UI:**
- Clean, modern, enterprise-grade seperti Notion/Stripe/Linear light mode
- Tidak boleh terlihat seperti template generik
- Konsisten di web dan mobile nanti

---

## Auth Flow
1. User buka app → `middleware.ts` cek cookie `puraloka_token`
2. Tidak ada token → redirect ke `/login`
3. Login sukses → token disimpan di cookie + user data di localStorage
4. Semua API call otomatis sisipkan token via axios interceptor
5. Token expire → silent refresh via Supabase (auto, tidak perlu login ulang)

**Catatan penting:** Token Supabase expire setelah ~1 jam. Jika masih 401 padahal ada token, hapus cookie `puraloka_token` dan `puraloka_refresh` di DevTools → Application → Cookies, lalu login ulang.

---

## Environment Variables

**apps/api/.env:**
```
PORT=3001
SUPABASE_URL=https://tgozokxyvwmyvajgqfxw.supabase.co
SUPABASE_SECRET_KEY=<service role key>
JWT_SECRET=<secret>
VAPID_PUBLIC_KEY=<vapid public key>   # untuk Web Push
VAPID_PRIVATE_KEY=<vapid private key> # untuk Web Push
VAPID_SUBJECT=mailto:nizarzul16@gmail.com
```

**apps/web/.env.local:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://tgozokxyvwmyvajgqfxw.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=<publishable key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid public key>  # untuk browser push subscription
```

**Generate VAPID keys:**
```bash
node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
```

---

## Cara Menjalankan

**Backend API:**
```bash
cd E:\Project\puraloka-suite\apps\api
npx tsx src/index.ts
```

**Frontend Web:**
```bash
cd E:\Project\puraloka-suite\apps\web
pnpm dev
```

---

## Seed Data (sudah ada di database)
- 5 proyek (4 aktif, 1 selesai) di Bandung
- 12 users: 1 admin (nizarzul16@gmail.com), 2 PM, 4 mandor, 5 client
- Data lengkap: termin, invoice, kasbon, progress logs, milestones, payments
- Data periode: Februari - Mei 2026

---

## Status Dashboard (SUDAH BERFUNGSI)
Dashboard home page sudah menampilkan data real:
- ✅ KPI cards: proyek aktif, total kontrak, invoice outstanding, kas bersih
- ✅ Cashflow area chart 8 minggu
- ✅ Donut chart distribusi status proyek
- ✅ Progress bar per proyek aktif
- ✅ Tabel invoice belum lunas
- ✅ Alert banner invoice overdue
- ✅ Period filter: 30 hari, 3 bulan, 6 bulan, tahun ini, semua
- ✅ Auth guard (redirect ke login jika tidak ada token)

---

## Fitur & Halaman — Status Lengkap

| # | Fitur | Status | Catatan |
|---|---|---|---|
| 1 | Redesign UI ke light theme | ✅ SELESAI | |
| 2 | Dashboard home | ✅ SELESAI | KPI, chart, period filter, data real |
| 3 | Halaman Proyek | ✅ SELESAI | List + detail: RAB, Kurva S, dokumen, milestone, progress log+foto, kontrak PDF. ⚠️ **KOREKSI 2026-07-24:** upload **foto** sebelumnya TIDAK PERNAH berfungsi (bucket `project-photos`/`kasbon-photos` tak pernah ada → upload selalu gagal; 36 baris `project_photos` ternyata seed URL Unsplash, bukan upload nyata). Diperbaiki: bucket dibuat privat + policy service_role-only (migration 098), upload dialihkan lewat API, kegagalan tak lagi senyap. Lihat AUDIT_REPORT OPEN-4. |
| 4 | Pembayaran Termin | ✅ SELESAI | PM tandai terbayar + upload bukti |
| 5 | Halaman Keuangan | ✅ SELESAI | Invoice, kasbon lintas proyek, expense view |
| 6 | Manajemen Kas | ✅ SELESAI | Akun kas, transfer dana, pengeluaran; saldo via DB trigger |
| 7 | Halaman Mandor | ✅ SELESAI | Ringkasan, laporan upah, kasbon, penugasan + work scope + rincian item |
| 8 | User Management | ✅ SELESAI | Admin only; tambah/edit/nonaktifkan; sidebar entry tersembunyi untuk non-admin |
| 9 | Auto token refresh | ✅ SELESAI | Silent refresh via Supabase |
| 10 | Security hardening | ✅ SELESAI | Soft-delete, pagination caps, file size guards, protect_created_at triggers, AbortController |
| 11 | Halaman Laporan | ✅ SELESAI | Rekap per proyek/mandor/keuangan, export Excel |
| 12 | Sistem Notifikasi | ✅ SELESAI | Role-based, interactive (approve/reject), Web Push device (VAPID configured, lazy-init), history page |
| 13 | Halaman Laporan — export PDF | ✅ SELESAI | PDF via PDFKit: laporan proyek, mandor, keuangan — GET /api/v1/reports/export-pdf |
| 13b | Invoice PDF | ✅ SELESAI | Download PDF per invoice di halaman Keuangan — @react-pdf/renderer + InvoicePDF component + QR code + company profile |
| 14 | Portal Client | ✅ SELESAI | Layout responsif, 4 halaman: dashboard, proyek list+detail (4 tab: ringkasan/kurva-s/progress/invoice), notifikasi, profil. clients.user_id migration sudah applied |
| 15 | Google OAuth | ✅ SELESAI | Provider aktif + tombol "Masuk dengan Google" sudah diwire di login page via supabase.auth.signInWithOAuth |
| 16 | Mobile app | 🟡 FASE 1 | Expo + expo-router setup; auth, role-nav, 7 screens (dashboard, proyek list+detail, input progress+foto, kasbon list+ajukan, mandor summary, notifikasi+approve/reject) |
| 17 | RLS policies | ✅ SELESAI | Migration 049 applied: 46 tabel, 3 helper functions (auth_role/auth_user_id/auth_client_id), defense-in-depth strategy (service_role bypass, anon/JWT enforce) |
| 18 | Arus Kas tab keuangan | ✅ SELESAI | Unified cashflow view, filter bar, chart masuk/keluar, tabel mutasi |
| 19 | Draggable dashboard widgets | ⏳ BELUM | react-grid-layout, layout tersimpan per user |
| 34 | Audit Trail UI (`/audit`) | ✅ SELESAI | Admin only; filter tabel/action/tanggal; diff view old→new values; JSON raw toggle; pagination; GET /api/v1/audit + /audit/meta |
| 35 | Kalender Proyek (`/kalender`) | ✅ SELESAI | Grid kalender bulanan; event pills (milestone, termin, progress, project start/end); side panel selected day; upcoming events; legend |
| 36 | Halaman Sistem (`/sistem`) | ✅ SELESAI | Admin only; run manual check-deadlines + check-milestones; panduan config Resend email; panduan cron job otomasi |
| 37 | Pengaturan Perusahaan (`/pengaturan`) | ✅ SELESAI | Profil perusahaan, logo upload, bank info, invoice prefix, signature name; GET/PUT /api/v1/settings/company + POST /logo |
| 38 | Search Global (Command Palette) | ✅ SELESAI | command-palette.tsx via Ctrl+K / tombol search di topbar; search proyek, klien, invoice, kasbon, milestone, user; role-aware results; GET /api/v1/search |
| 39 | RAB Schedule + Absorption Log | ✅ SELESAI | Migration 057: rab_schedule (rencana per item/minggu) + rab_absorption_log (serapan aktual manual); API GET/POST/DELETE /rab-schedule + /absorption + /absorption/summary; UI: RabScheduleModal + AbsorptionLogTable di detail proyek; inline input dari rab-section.tsx |
| 40 | Security hardening — Mandor workers + scope-items | ✅ SELESAI | PATCH/DELETE /mandor/workers/:id: ownership check mandor_id; PATCH/DELETE /mandor/scope-items/:id: resolveScopeItemOwnership() helper → PM isolation by pm_id + mandor isolation by mandor_id |
| 41 | Check-deadlines endpoint | ✅ SELESAI | GET /api/v1/notifications/check-deadlines (admin only, idempotent 24h dedup): cek termin siap tagih, proyek mendekati selesai, kasbon pending lama, invoice overdue; fire-and-forget notif + optional Resend email |
| 20 | VAPID keys setup | ✅ SELESAI | VAPID keys sudah ada di apps/api/.env (public + private + subject) |
| 21 | Login page responsive | ✅ SELESAI | Brand panel hide di mobile, mobile-only logo, input box-sizing fix |
| 22 | HP/LAN access | ✅ SELESAI | Next.js proxy rewrites + HOST=0.0.0.0 + allowedDevOrigins; web & API akses dari HP via IP |
| 23 | Halaman Klien (`/clients`) | ✅ SELESAI | CRUD klien di dashboard admin |
| 24 | clients.user_id migration | ✅ SELESAI | Kolom + index + auto-link by email sudah dijalankan; 10 client ter-link ke user |
| 25 | E-Procurement (`/procurement`) | ✅ SELESAI | Migrations 039-041 + 058 applied; API /procurement/* semua endpoint + laporan aging/rekap/dashboard KPI; Web UI 8 tab: Supplier (+ edit), Material (+ min_stock), MR (+ form buat MR + detail + reject notes), PO (+ form buat PO dari MR + detail + batalkan), GR (+ form catat penerimaan + filter), Hutang Supplier, Stok (+ reorder alert badge), Laporan (aging hutang + rekap pembelian + export Excel) |
| 26 | Integrasi Pengadaan → Kas | ✅ SELESAI | Migration 042: supplier_payments.cash_account_id + DB trigger deduct/refund; API terima cash_account_id + balance check; UI dropdown sumber kas di modal bayar; dashboard cashflow include supplier outflow |
| 27 | Pengurangan Stok Material | ✅ SELESAI | POST /stocks/usage (pemakaian/return/adjustment, role: admin+pm+mandor); POST /stocks/opname (bulk reconciliation, role: admin+pm); UI: UsageModal, OpnameModal dengan result summary, log arus mutasi per proyek dengan nama pencatat |
| 28 | RAB Komponen Biaya | ✅ SELESAI | Migration 052: rab_items + material/upah/alat/other pct, constraint total=0 atau 99.9–100.1; API PATCH komponen biaya + bulk; UI kolom komponen toggle + KomponenBar visual + inline edit |
| 29 | Progress Log Dual Mode | ✅ SELESAI | Migration 052: progress_logs + mode + rab_item_id + pct_completion; API mode=daily (general) vs mode=detail (per RAB item, recalculate project %); UI modal mode toggle + RAB item picker |
| 30 | Mandor ↔ RAB Link | ✅ SELESAI | Migration 052: work_scopes.rab_category_id; API accept rab_category_id saat buat scope; UI dropdown sub-kategori RAB di AddScopeModal |
| 31 | ERP Phase 5: Document + Photo | ✅ SELESAI (foto diperbaiki 098) | Migration 055: project_photos.category + document_access_logs; API role-based doc filter + PATCH visibility + access-log; document-section.tsx upgrade; photo-gallery.tsx baru (lightbox, kategori). ⚠️ **Jalur UPLOAD foto baru benar-benar hidup sejak migration 098** (sebelumnya bucket tak ada → gagal senyap). |
| 32 | ERP Phase 6: Portal Upgrade | ✅ SELESAI | Client portal: Kurva S tab (2 garis, tanpa aktual kas). Mandor portal: halaman Rekapitulasi (earned/paid/outstanding/kasbon/sisa bersih) + nav item |
| 33 | Kasbon Redesign | ✅ SELESAI | Migration 056: work_scope_id nullable, project_id langsung, hapus kasbon_limit_pct. API fixes: GET filter project-based, PATCH PM isolation via project_id. UI: scope opsional di form, double bars per scope (progress + kasbon), project kasbon summary bar |

---

## Known Issues & TODO

### Harus diselesaikan sebelum production:
1. **RLS policies** — ✅ SELESAI (migration 049). Test manual dengan login berbeda role untuk verifikasi end-to-end
2. **VAPID keys** — Sudah di-set di .env + kode sudah berfungsi (lazy-init, graceful). Belum diverifikasi end-to-end push benar-benar masuk ke device (butuh test manual dengan HP nyata)

### Security (dari AUDIT_REPORT.md — sudah selesai batch 1-6):
- ✅ Soft-delete proyek (CASCADE protection)
- ✅ protect_created_at triggers (10 tabel kritis)
- ✅ audit_logs.user_id ON DELETE SET NULL
- ✅ Pagination caps (max 200) semua list endpoint
- ✅ File size guard (2MB XLSX, 5MB dokumen/nota/bukti bayar)
- ✅ AbortController untuk cancellation request di frontend
- ✅ Ownership check di notifikasi endpoints
- ✅ Role check + ownership di mandor worker endpoints (selesai — `mandor_id` check di PATCH/DELETE workers)
- ✅ Project isolation di scope-items endpoints (selesai — `resolveScopeItemOwnership()` + PM/mandor check di PATCH/DELETE/PATCH-progress scope-items)

---

## Naming Conventions
- Database: `snake_case`, plural
- TypeScript: `camelCase` variabel, `PascalCase` komponen/types
- Files: `kebab-case`
- Git branches: `feature/nama-fitur`
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`, dll)

---

## Status Terbaru (Juni 2026)

### ERP Proyek Upgrade — Phase 1 (RAB Revamp) SELESAI ✅

**Migration 052** applied ke Supabase (Juni 2026):
- `rab_items`: `material_pct`, `upah_pct`, `alat_pct`, `other_pct` + constraint `rab_items_pct_sum` (total 0 atau 99.9–100.1) + `planned_start`, `planned_end`, `gantt_dependencies UUID[]`
- `progress_logs`: `mode TEXT DEFAULT 'daily'`, `rab_item_id UUID FK`, `pct_completion NUMERIC(5,2)`, `pct_overall` nullable
- `work_scopes`: `rab_category_id UUID FK rab_items`

**API baru** (Phase 1):
- `GET /projects/:id/rab/categories` — sub-kategori untuk mandor dropdown
- `GET /projects/:id/rab/items` — item-level untuk progress detail picker
- `GET /projects/:id/rab/gantt` — gantt fields per item
- `PATCH /projects/:id/rab/:itemId` — update komponen biaya + progress_pct
- `PATCH /projects/:id/rab/bulk-komponen` — bulk update
- `PATCH /projects/:id/rab/:itemId/gantt` — update gantt dates
- `POST /projects/:id/progress-logs` mode=detail — per RAB item + recalculate project %

**Frontend baru** (Phase 1):
- `rab-section.tsx`: toggle kolom komponen biaya + `KomponenBar` stacked visual + inline edit per item
- `progress-log-modal.tsx`: mode toggle daily/detail + RAB item picker + dampak preview + auto-close dengan new_overall_pct
- `mandor-section.tsx`: optional RAB sub-kategori dropdown di AddScopeModal

**Phase 2: Kurva S 3-Garis + EVM Cards — SELESAI ✅**
- `kurva-s.ts`: AC diperluas (kasbon + project_expenses + wage_reports + progress_payments + borongan_settlements); progress scatter filter `mode='daily'`; response tambah `meta.evm` (BAC, AC, EV, PV, CPI, SPI, EAC, ETC, VAC, TCPI, SV, CV)
- `kurva-s-section.tsx`: 3 garis chart (Rencana dashed-area, Serapan Aktual solid, Progress Fisik green-dashed); 6 EVM cards baris 2×3 dengan traffic-light color (CPI/SPI/EAC/ETC/VAC/TCPI); KPI strip 4 cards (AC, PV, EV, Deviasi); basis data bar (BAC/EV/PV/AC/CV/SV); info tooltip EVM; toggle show/hide EVM detail

**Perbaikan data model (pre-Phase 2):**
- Bubble-up 2 lapis: item → category (weighted avg) → project (weighted sum) di `progress.ts` dan `rab.ts`
- Mode daily `pct_overall` sekarang opsional; tidak mengubah `projects.progress_pct`
- Scatter plot hanya ambil `mode='daily'` + `pct_overall NOT NULL`

**Phase 3: Change Order System — SELESAI ✅**
Migration 053, API `change-orders.ts`, frontend `change-order-section.tsx` (di detail proyek setelah RAB section).
- DB: `change_orders` + `change_order_items`, auto-number CO-001, baseline snapshot saat approve
- API: CRUD + submit + approve (admin only, update contract_value + audit_log) + reject + notif
- UI: card expandable per CO, inline add/edit/delete items, approve/reject inline (admin), status badge

**Phase 4: Gantt Chart WBS — SELESAI ✅**
Migration tidak diperlukan (kolom `planned_start`, `planned_end`, `gantt_dependencies` sudah ada di migration 052). API `/rab/gantt` diupdate untuk include `actual_start`/`actual_end` dari progress_logs mode=detail. Frontend `gantt-section.tsx` custom renderer (bukan lib external) dengan:
- Dual-bar per item: bar rencana (dashed outline) + bar aktual (solid, dari progress log)
- Collapse/expand WBS tree di panel kiri
- SVG dependency arrows — warna normal/kuning (warning)/merah (danger)
- Warning panel: list semua potensi overlap dengan severity + pesan advisory
- Today line (garis merah vertikal)
- Edit modal per item: set planned_start/end + pilih soft dependency (checkbox)
- View mode: Bulan / Minggu
- Semua dependency bersifat soft/advisory only — tidak blocking, PM bisa override

**Keputusan desain Phase 4:**
- Dependency: soft only (warning jika overlap, bukan blocker)
- Warning severity: >14 hari overlap = KRITIS, ≤14 hari = PERHATIAN
- Dual bar: rencana (dashed) di atas, aktual (solid) di bawah/overlay
- Actual start = tanggal progress log pertama mode=detail untuk item tsb
- Actual end = tanggal log terakhir jika progress_pct ≥ 100, else null (still running)
**Phase 4B: Threshold-based Dependency — SELESAI ✅**
Migration 054 applied: `gantt_dep_rules JSONB` di `rab_items`. Format: `[{item_id, threshold_pct, label}]`. API GET `/rab/gantt` return `dep_rules` + `dependencies` (flat, backward compat). PATCH `/rab/:itemId/gantt` terima `dep_rules` (tulis ke `gantt_dep_rules` + sync ke `gantt_dependencies`). Frontend `gantt-section.tsx`:
- `GanttTask` interface tambah `dep_rules: DepRule[]`
- `detectWarnings()` dual-mode: threshold-based (warn jika `dep.progress_pct < threshold_pct`) atau date-based (overlap warning)
- `EditDateModal`: per-dependency input threshold % + label

**Phase 5: Document System + Photo Gallery — SELESAI ✅**
Migration 055 applied: `project_photos.category` (progress/defect/serah_terima/other) + tabel `document_access_logs` (audit trail view/download).
- `documents.ts` API update: role-based filter (admin/pm=semua; mandor=gambar_kerja/spk/berita_acara/foto_progress; client=kontrak/gambar_kerja/berita_acara/foto_progress/lainnya + `is_visible_to_client=true`); PATCH toggle `is_visible_to_client`; POST `/documents/:id/access-log` (fire-and-forget)
- `progress.ts` endpoint baru: GET `/projects/:id/photos?category=` (filter opsional); PATCH `/projects/:id/photos/:id` (update category/caption, admin/pm only)
- `document-section.tsx` update: filter tabs per `doc_type`; badge warna per kategori; toggle visibility per dokumen; download button; access-log di-call saat view/download
- `photo-gallery.tsx` (baru): grid 3-col responsive; lightbox fullscreen dengan keyboard nav (←/→/Esc); tab filter per kategori; category badge overlay; ganti kategori langsung dari lightbox; download button

**Phase 6: Portal Upgrade — SELESAI ✅**
**6A — Client Portal Kurva S:**
- `/portal/proyek/[id]/page.tsx`: tambah tab "Kurva S" (posisi ke-2, antara Ringkasan dan Progress)
- `KurvaSTab` component inline: fetch `/api/v1/projects/:id/kurva-s`, render **2 garis saja** (Rencana dashed-area + Progress Fisik solid green) — Serapan Aktual Kas **tidak ditampilkan** sesuai desain "transparansi kecuali data kas"
- KPI strip: Progress Fisik%, Target Rencana%, Deviasi, SPI (color-coded: hijau ≥1, kuning 0.8–1, merah <0.8)
- Caption: "Grafik menampilkan rencana progres proyek vs realisasi fisik di lapangan"
- Recharts `ComposedChart` + `Area` + `Line` — sama dengan admin tapi stripped-down (no EVM cards, no Serapan Aktual)

**6B — Mandor Portal Rekapitulasi:**
- API baru: `GET /api/v1/mandor/rekapitulasi?project_id=` — earned/paid/outstanding/kasbon_beredar/sisa_bersih per mandor; per-project breakdown juga dikembalikan
- Mandor hanya bisa lihat datanya sendiri; admin/pm bisa filter by project_id
- Sumber data: `weekly_wage_reports` (harian), `progress_payments` (progress_pct), `borongan_settlements` (borongan), `kasbons` (kasbon beredar = amount - amount_repaid)
- Page baru: `/mandor-portal/rekapitulasi/page.tsx` — hero gradient card (sisa bersih), grid KPI cards (earned/paid/outstanding/kasbon/sisa), visual progress bars komposisi, per-project breakdown (jika >1 proyek)
- Nav: "Rekapitulasi" (BarChart2 icon) ditambah ke `mandor-portal/layout.tsx` — muncul di desktop nav + mobile horizontal scroll nav (bottom nav hanya 5 slot pertama, rekapitulasi di slot ke-7)

**Kasbon Redesign — SELESAI ✅**
**Migration 056:**
- `kasbons.work_scope_id` jadi nullable (scope opsional)
- `kasbons.project_id UUID FK projects` — wajib (di-backfill dari scope jika ada, atau diisi langsung)
- `work_scopes.kasbon_limit_pct` DIHAPUS — tidak ada limit kasbon lagi

**API (`kasbons.ts`) perubahan:**
- GET: filter mandor berdasarkan `project_id IN [proyek yang di-assign]` + `requested_by = user.id`; include `project:projects!kasbons_project_id_fkey(id, name)` di select
- POST: `work_scope_id` opsional; `project_id` ATAU `work_scope_id` wajib; mandor tanpa scope cek `mandor_assignment` aktif
- PATCH status: PM isolation baca `kasbons.project_id` langsung (fallback resolve dari scope jika null/data lama)
- Notif PATCH: pakai `project.name` langsung (tidak lagi dari chain scope → assignment → project)

**API (`mandor.ts`) perubahan:**
- Hapus `kasbon_limit_pct` dari INSERT, PATCH, dan semua SELECT work_scopes
- `mandor/scopes` endpoint sudah return `assignment.project.{id, name}` untuk dipakai di form kasbon

**API (`projects.ts`) perubahan:**
- Hapus `kasbon_limit_pct` dari project + work_scopes SELECT
- Tambah parallel query `scopeless_kasbons` — kasbons dengan `project_id = id AND work_scope_id IS NULL`
- Return `scopeless_kasbons` di response project detail

**UI:**
- `mandor-section.tsx`: hapus `kasbon_limit_pct` dari WorkScope interface + AddScopeModal; tambah `ScopeBars` component (dual bar: progress fisik + kasbon beredar per scope); project-level kasbon summary banner (orange); kasbon per scope show di header mandor
- `kasbon/page.tsx` (mandor portal): Proyek dropdown wajib → Scope dropdown opsional (filtered by project); tampilkan `project.name` di kasbon list jika ada; list pakai `project.name + scope_name` sebagai context
- `proyek/[id]/page.tsx`: tambah `scopeless_kasbons` ke Project interface; pass ke MandorSection

### Sudah selesai:
- **Dashboard**: data real, light theme, period filter, KPI cards, chart cashflow & status proyek
- **Halaman Proyek**: list + detail lengkap — RAB, Kurva S, dokumen, milestone, progress log + foto, generate kontrak PDF, dua metrik progress (Serapan Anggaran vs Progress Fisik)
- **Halaman Keuangan**: invoice list, kasbon per mandor, expense view
- **Manajemen Kas** (`/kas`): akun kas, transfer dana, catat pengeluaran proyek (multipart + upload nota); saldo otomatis berkurang via DB trigger (migrations 016, 020, 025); auto-clone kategori template ke project saat pertama input
- **Halaman Mandor** (`/mandor`): ringkasan, laporan upah mingguan, kasbon (ajukan/lihat), tab Penugasan → work scope per mandor → rincian item pekerjaan (15 satuan fleksibel: m², m³, batang, kg, ton, dll; 12 kategori; spec teknis key-value)
- **User Management** (`/users`): hanya admin; tambah user (register), edit nama/telepon/role, aktifkan/nonaktifkan; sidebar entry tersembunyi untuk non-admin
- **Auto token refresh**: silent refresh via Supabase, tidak perlu login ulang
- **Security hardening**: soft-delete projects, protect_created_at triggers, pagination caps, file guards, AbortController, audit_logs ON DELETE SET NULL
- **Halaman Laporan** (`/laporan`): rekap per proyek/mandor/keuangan, export Excel via XLSX
- **Sistem Notifikasi**: role-based, interactive (approve/reject kasbon/wage report inline), Web Push device notifications via VAPID, history page `/notifications`, panel dropdown di topbar, 30s polling untuk badge
- **DB Migrations**: 058 total — terakhir: 058 (procurement enhancements: min_stock, rejection_notes, canceled_at). Sebelumnya: 057 (RAB Schedule + Absorption Log), 056 (kasbon redesign)
- **Audit Trail UI** (`/audit`): filter tabel/action/tanggal; diff view old→new; JSON raw toggle; pagination 50/hal
- **Kalender Proyek** (`/kalender`): grid bulanan; event pills (milestone/termin/progress/start/end); side panel; upcoming events
- **Halaman Sistem** (`/sistem`): admin only; run manual check-deadlines + check-milestones; panduan Resend email; panduan cron
- **Pengaturan Perusahaan** (`/pengaturan`): profil + logo + bank + invoice prefix + signature; CRUD via API settings.ts
- **Search Global**: command-palette.tsx via Ctrl+K; cari proyek/klien/invoice/kasbon/milestone/user; role-aware (mandor: scope+kasbon only; client: tidak bisa)
- **RAB Schedule + Absorption Log**: UI di detail proyek via rab-schedule-modal.tsx + absorption-log-table.tsx; Mode A (total_pct absolut) + Mode B (per komponen langsung); inline input dari rab-section.tsx
- **Security fixes**: workers ownership (mandor_id check), scope-items project isolation (resolveScopeItemOwnership helper)
- **Portal Client** (`/portal`): layout responsif (top nav desktop, bottom nav mobile), 4 halaman: dashboard KPI, proyek list, proyek detail (4 tab: ringkasan/kurva-s/progress/invoice — kurva S hanya tampilkan 2 garis, tanpa serapan aktual kas), notifikasi, profil + logout
- **Login page responsive**: brand panel hide di mobile, mobile-only logo, input box-sizing fix
- **HP/LAN access**: Next.js proxy rewrites + HOST=0.0.0.0 + allowedDevOrigins — web & API bisa diakses dari HP di jaringan yang sama
- **Mobile app Fase 1**: Expo 53 + expo-router 4, auth layer (AsyncStorage + Bearer token), role-based tab nav, 7 screens (dashboard, proyek list+detail, input progress+foto, kasbon list+ajukan, mandor summary, notifikasi+approve/reject inline)
- **E-Procurement** (`/procurement`): Migrations 039-041 applied ke Supabase; 14 tabel baru (material catalog, suppliers, MR, PO, GR, stocks, AP); API 20+ endpoint; Web UI 7 tab lengkap dengan FIFO auto-allocation, DB trigger chain GR→stok, auto-numbering MR/PO/GR, WA deep-link PO
- **Integrasi Pengadaan → Kas**: Migration 042 applied — `supplier_payments.cash_account_id` + DB trigger auto-deduct/refund balance; API POST supplier-payments terima optional cash_account_id + cek saldo cukup; UI dropdown sumber kas di modal bayar; dashboard cashflow memasukkan supplier payments sebagai outflow; `/kas` menampilkan riwayat "Bayar Supplier" per akun
- **Pengurangan Stok Material**: `POST /stocks/usage` (catat pemakaian/return/adjustment individual, validasi stok tidak negatif); `POST /stocks/opname` (bulk weekly reconciliation, skip jika tidak ada selisih); `StocksTab` UI dengan UsageModal (project→material→type→qty→notes), OpnameModal (auto-load semua stok proyek → input fisik → real-time selisih → result summary), log arus mutasi dengan badge warna per tipe + nama pencatat (siapa catat, siapa opname)

### Belum selesai:
- Draggable dashboard widgets
- Verifikasi end-to-end Web Push device notification (VAPID sudah set, belum ditest di HP nyata)
- Verifikasi RLS end-to-end: test manual login mandor/client/pm untuk pastikan data isolation benar
- Seed data procurement (untuk demo/presentasi)
- Email notifikasi via Resend (panduan config sudah ada di `/sistem`, API stub sudah ada di check-deadlines, tinggal integrasi)

### Next priority:
1. **Draggable dashboard widgets** — react-grid-layout, layout saved ke localStorage per user
2. **Seed data procurement** — supplier, material catalog, MR/PO/GR demo data
3. **Resend email integration** — sambungkan check-deadlines ke Resend API jika RESEND_API_KEY ada
4. **Verifikasi Web Push** — test end-to-end di HP nyata
5. **RLS manual testing** — login per role, pastikan data isolation benar

---

## Ide Fitur Baru (di luar roadmap saat ini)

Fitur-fitur ini belum pernah dibahas sebelumnya dan berpotensi menambah nilai signifikan:

### Tier 1 — High Value, Feasible Soon
- ✅ **Halaman Klien** (`/clients`): SELESAI
- ✅ **Search Global**: SELESAI — command palette (Ctrl+K) di topbar
- ✅ **Jadwal & Kalender**: SELESAI — `/kalender` dengan milestone, termin, progress log, start/end proyek
- **Email Notifikasi**: ⏳ panduan config sudah ada di `/sistem`; integrasi Resend API masih pending
- ✅ **Audit Trail UI**: SELESAI — `/audit` dengan filter, diff view, JSON raw, pagination

### Tier 2 — Medium Value, Perlu Perencanaan
- **Dashboard per Proyek**: halaman overview khusus satu proyek dengan semua KPI (serapan anggaran, progress fisik, kurva S, cashflow proyek, mandor aktif)
- **Reminder Otomatis**: cron job kirim notifikasi H-7, H-3, H-1 sebelum deadline termin/milestone
- **Template Proyek**: buat proyek baru dari template (termin schedule, kategori, milestone default) untuk mempercepat onboarding proyek baru
- **Rekap Pajak per Proyek**: view PPh final / PPN per proyek, ekspor ke format yang bisa dibawa ke konsultan pajak
- **Foto Geolocation**: saat mandor upload foto progress, simpan koordinat GPS (jika browser support) untuk verifikasi lokasi lapangan

### Tier 3 — Future / Complex
- **Portal Client** (ada di roadmap): read-only view proyek + upload bukti bayar + notifikasi status
- **Mobile App** (ada di roadmap): React Native Expo — view proyek, input progress, kasbon
- **Integrasi Akuntansi**: ekspor transaksi ke format yang kompatibel dengan software akuntansi (Jurnal, Accurate, Xero)
- **Multi-company**: satu platform bisa kelola beberapa entitas perusahaan konstruksi berbeda

---

## Update & Keputusan Desain Terbaru

### Worker System
- Tabel `workers` bersifat global (tidak terikat mandor), sudah ada kolom `skills TEXT[]` (migration 028)
- Field `tipe` pekerja: opsional, nilai: `'tukang' | 'laden' | 'kenek' | null` — **BELUM diimplementasikan**, masih pending
- Worker registry akan dijadikan global (lintas mandor) — implementasi pending di Worker System Redesign
- Daftar Tukang sudah grouped by mandor dengan full CRUD (add/edit/delete + `is_active` toggle)
- Nomor HP semua tukang sudah sebagai link WA (`wa.me/62xxx`)

### Kasbon
- Kasbon ada **DUA jenis yang berbeda secara fundamental**:
  1. **Kasbon Mandor** (`kasbons` table): untuk operasional mandor, dilunasi dari settlement scope/borongan
  2. **Kasbon Tukang** (`worker_kasbons` table): advance untuk pekerja, dilunasi via potongan upah minggu berikutnya
- Model kasbon di laporan upah: **DUAL MODE** (pending implementasi):
  - **Kolektif**: 1 baris total, owner tidak perlu tahu breakdown per orang
  - **Per-individu**: per worker dengan link ke kasbon aktif yang sedang dicicil

### KPI Mandor
- **"Tukang Aktif (30 Hari)"**: rolling 30-day window (`now - 30d` → `now`), bukan calendar month — agar tetap relevan awal bulan atau ada gap data
- **Sub-label "dan X tukang terdaftar"**: COUNT semua workers tanpa filter `is_active` (sebelumnya salah filter hanya active)

### Notifikasi
- Semua insert notifikasi adalah fire-and-forget — tidak pernah memblokir main request, error hanya di-log
- Interactive action endpoint baca `action_type` dari record notifikasi, eksekusi business logic (approve/reject kasbon atau wage report), mark `is_actioned=true`, kirim feedback notif ke mandor
- Web Push menggunakan lazy-init: jika VAPID env tidak ada, skip silently tanpa crash
- `check-milestones` endpoint idempotent: cek duplikat di 24 jam terakhir sebelum insert notif baru

### ERP Proyek Upgrade — Keputusan Desain

Desain keputusan dari Q&A sebelum implementasi Phase 1:

| Keputusan | Nilai |
|---|---|
| RAB komponen biaya | `material_pct + upah_pct + alat_pct + other_pct` total = 100 atau 0 |
| Progress mode | `daily` (general log, no % effect) vs `detail` (per RAB item, recalculate project %) |
| Weighted recalculation | `projects.progress_pct = SUM(item.weight_pct × item.progress_pct / 100)` — hanya level='item' |
| Kurva S (Phase 2) | 3 garis: Rencana S-curve, Serapan Rencana (EV), Serapan Aktual Kas (AC) |
| EVM (Phase 2) | CPI, SPI, EAC, ETC, VAC, TCPI — cards di atas chart |
| Mandor ↔ RAB | Opsional FK dari `work_scopes` ke `rab_items` level sub-kategori |
| Change Order (Phase 3) | Container model — CO items kerja tambah/kurang/perubahan; approve → update kontrak + RAB audit-safe |
| Gantt (Phase 4) | `frappe-gantt` (MIT); bar per RAB item; `planned_start/end` + `gantt_dependencies UUID[]` di `rab_items` |
| Dokumen permission (Phase 5) | Category-based (contract/drawing/rab/report/spk) + role-based di API layer, bukan DB |
| Foto kategori (Phase 5) | `progress`, `defect`, `serah_terima` — kolom `category` di `project_photos` |
| Client portal (Phase 6) | Full transparansi KECUALI: serapan aktual kas & cashflow kas disembunyikan |
| Mandor portal (Phase 6) | Tambah halaman "Rekapitulasi Keuangan" — earned vs paid vs outstanding vs kasbon |

### Pending Besar (jangan kerjakan tanpa prompt khusus)
- **Worker System Redesign**: global registry, field `tipe` (tukang/laden/kenek), flexible kasbon deduction di wage report
- **Grup B**: approve/tolak inline laporan upah dengan payment_method + catatan; running total kasbon per mandor dengan limit 80% earned value
- **Grup C**: halaman profil per mandor, budget vs aktual
- **Grup D**: export Excel laporan mandor, foto nota kasbon
- **Security fixes**: role check + ownership di `PATCH/DELETE /mandor/workers/:id`; project isolation di `PATCH/DELETE /mandor/scope-items/:id`
