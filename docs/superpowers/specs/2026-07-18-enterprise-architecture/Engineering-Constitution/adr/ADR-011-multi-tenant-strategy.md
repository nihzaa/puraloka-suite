# ADR-011 — Strategi Multi-Tenant Puraloka Suite

**Status:** ACCEPTED (keputusan founder 2026-07-28)
**Tanggal:** 2026-07-28
**Pengambil keputusan:** Nizar (founder)
**Mengamandemen:** `docs/KEPUTUSAN-MULTI-COMPANY.md` §2 ("JANGAN tambahkan `company_id` sekarang")

---

## 1. Konteks — kenapa keputusan ini dibuka sekarang

`docs/KEPUTUSAN-MULTI-COMPANY.md` §2 menetapkan **dua tripwire** — kondisi yang
mewajibkan keputusan multi-company dibuka ulang lebih awal:

1. Sebelum modul finansial ber-ledger berikutnya dibangun.
2. Entitas hukum kedua (PT/CV) menjadi rencana nyata.

**Keduanya kini aktif** (2026-07-28):

- **Tripwire #2 terjawab founder:** sistem akan dijual sebagai SaaS ke perusahaan
  lain (**calon pelanggan konkret sudah ada**), DAN founder akan membentuk badan
  usaha kedua dan seterusnya.
- **Tripwire #1 akan tersentuh:** CECEP langkah 7 (RAP/Pagu) adalah *commitment
  ledger* — persis jenis modul yang dimaksud tripwire.

Dokumen lama tidak salah; kondisinya berubah persis lewat mekanisme yang ia
rancang sendiri. Gerbang L3 di `Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md`
§3 ("pelanggan eksternal committed — kondisi mutlak") **terpenuhi**.

---

## 2. Keputusan founder (final, tidak ditawar ulang)

| # | Keputusan | Konsekuensi |
|---|---|---|
| D1 | **Bekukan CECEP** — multi-tenant dikerjakan tuntas dulu | Langkah 7 (RAP/Pagu) & seterusnya ditahan sampai Tahap 7 selesai. Titik-bocor #1 sengaja dibiarkan terbuka sementara, sadar. |
| D2 | Katalog AHSP nasional **dipakai bersama** semua tenant | 2.620 assembly `source='national'` → `company_id NULL` |
| D3 | Salinan AHSP company **privat** — hanya pemiliknya | 418 assembly Cibuluh → `company_id` tenant pertama |
| D4 | Harga: **acuan bersama + boleh ditimpa per perusahaan** | `price_book_entries.company_id NULLABLE`; resolusi berlapis |
| D5 | **1 email = 1 akun** + tabel keanggotaan | `users.email UNIQUE` **TETAP**; multi-company lewat `company_members`. Menghapus satu operasi Red-Line dari roadmap. |
| D6 | Isolasi **dua lapis**: wrapper aplikasi dulu, RLS menyusul | Perlindungan cepat + jaring pengaman database |

---

## 3. Model tenancy — DIPILIH

**Shared-database + shared-schema + `company_id` row-level, dengan `projects`
sebagai jangkar tenancy.**

### Alasan (spesifik kasus ini, bukan generik)

1. **D2 (katalog bersama) mendiskualifikasi isolasi fisik.** Schema-per-tenant
   membuat FK `assembly_components → resources` melintasi schema, dan tiap tenant
   baru butuh replay 123 migration. Database-per-tenant membuat katalog bersama
   **mustahil** tanpa replikasi.
2. **`projects` sudah jadi batas tenant alami.** 28 dari 94 tabel punya
   `project_id`; mayoritas sisanya turunannya. Kita menaikkan satu tingkat sumbu
   yang sudah ada (`project_id → projects.company_id`), bukan menciptakan sumbu baru.
3. **Skala puluhan tenant, tim 1–4 orang.** Database-per-tenant = N koneksi pool,
   N migration run, N backup, N monitoring — kegagalan operasional yang pasti.
4. **293 policy RLS sudah ditulis.** Menambah satu axis jauh lebih murah daripada
   membuang semuanya.

### Ditolak (agar tidak dibahas ulang)

| Model | Ditolak karena | Boleh dibuka ulang saat |
|---|---|---|
| Schema-per-tenant | Katalog bersama jadi cross-schema; `search_path` per-request = state global yang bocor di connection pool | Satu pelanggan mensyaratkan isolasi fisik secara kontraktual (hybrid) |
| Database-per-tenant | Katalog bersama mustahil tanpa replikasi; ops O(N) dengan tim O(1) | L4 / data residency regional |
| `company_id` di SEMUA 94 tabel | 66 tabel turunan bisa kontradiksi dengan induknya → kelas bug "company_id mismatch" | Profiling membuktikan join ke `projects` jadi bottleneck |
| `tenants` terpisah dari `companies` sekarang | Dua level hierarki sekaligus melipatgandakan permukaan bug | Pelanggan pertama benar-benar punya >1 badan usaha |

### Invarian yang dipegang seluruh sistem

> Sebuah baris data operasional milik **tepat satu** company. Company itu ditentukan
> oleh `company_id` pada baris, atau — jika baris tidak punya kolom itu — oleh
> `company_id` agregat root-nya lewat rantai FK yang **NOT NULL sepanjang jalan**.

Klausa "NOT NULL sepanjang jalan" load-bearing: rantai nullable → baris tenant-yatim
→ terlihat semua orang atau tidak terlihat siapa pun. Keduanya bug.

---

## 4. Skema inti

### `companies`
```
id, slug UNIQUE, legal_name, display_name, npwp,
parent_company_id NULL REFERENCES companies(id),   -- holding; TANPA pewarisan data
status ∈ active|suspended|archived,
plan_tier NULL,                                     -- menyambung modules.min_plan_tier (077)
created_at/updated_at TIMESTAMPTZ
```
`parent_company_id` **tidak** memberi akses otomatis ke anak perusahaan. Holding
melihat anak hanya lewat keanggotaan eksplisit. Pewarisan implisit lewat rekursi =
cara paling halus membocorkan data, dan tak bisa diuji exhaustive.

`company_profile` (032) **tidak dihapus** — diberi `company_id`, backfill ke tenant
pertama, lalu `UNIQUE(company_id)`. Utang "tabel single-row" lunas tanpa DROP.

### `company_members` — keanggotaan + peran per-company
```
id, company_id NOT NULL, user_id NOT NULL, role_id NOT NULL,
is_default BOOLEAN, status ∈ active|invited|suspended, joined_at,
UNIQUE (company_id, user_id)
+ partial unique: satu default per user
```

**Pemindahan otoritas peran paling penting:** peran menjadi properti *keanggotaan*,
bukan properti user. Satu orang bisa `admin` di PT A dan `pm` di PT B.
`users.role_id` **tidak di-drop** (additive-first) — jadi fallback + sumber backfill.

### Pemilihan company aktif per-request
Header `X-Company-Id` + **validasi server terhadap `company_members`**.

Alur di `apps/api/src/plugins/auth.ts`:
1. Verifikasi token (tak berubah) → 2. ambil `users` (tak berubah) →
3. **baru:** ambil keanggotaan aktif → 4. resolusi:
   - header ada → **harus** cocok keanggotaan; kalau tidak **403** (bukan fallback
     diam-diam — itu pintu belakang)
   - header tak ada → pakai `is_default`; kalau >1 tanpa default → **400 "pilih
     perusahaan"** (fail-closed, bukan tebak)
   - keanggotaan kosong → 403
5. `request.currentUser` += `company_id`, `company_role`, `memberships`
6. **Peran di-resolve dari `company_members.role_id`** → `requirePermission` otomatis
   benar per-company tanpa ubah tanda tangan.

**Bukan JWT claim**, karena claim hanya berubah saat token refresh: user yang
dikeluarkan dari company tetap punya akses sampai token expire — jendela kebocoran
yang tak bisa ditutup. Biaya: satu query keanggotaan/request (bisa di-join dengan
query `users` yang sudah ada).

### `auth_company_id()` — dua sumber, presedens tetap
```
1. current_setting('app.company_id', true)    -- di-set API per transaksi
2. fallback: company_members WHERE is_default AND status='active'
3. NULL                                        -- FAIL-CLOSED
```
`NULL` fail-closed otomatis: `company_id = NULL` → NULL → tidak lolos USING.
**Ditulis di komentar fungsi** supaya tak ada yang "memperbaiki" jadi `COALESCE(...,true)`.

Pendamping (pola 065/ADR-005, **wajib SECURITY DEFINER** karena `company_members`
sendiri ber-RLS): `is_member_of(company_id)`, `project_company_id(project_id)`.

---

## 5. Klasifikasi 94 tabel — aturan, bukan daftar

Terapkan berurutan; kategori pertama yang cocok menang.

**A — SHARED (tanpa `company_id`)**
> Isinya standar publik / invariant sistem yang salah kalau beda antar tenant.

`units`, `work_categories`, `permissions`, `modules`, `ahsp_editions`, `cost_codes`,
`resources`, `steel_profiles`, `material_pack`, `formula_definitions`, `productivity_records`.

**A/B — SHARED + overlay per-company (`company_id NULLABLE`)**
> Baris "standar publik" (NULL = milik semua) dan baris "milik satu tenant" hidup
> berdampingan di tabel yang sama.

- **`assemblies` (107)** — sumbu `source ∈ national/company/project/custom` yang
  SUDAH ADA adalah tempat `company_id` seharusnya hidup; slotnya menunggu sejak
  awal (komentar 107 menulis eksplisit "`company_id` → Phase 7").
  **D2+D3:** `source='national'` → NULL (2.620 baris); `source='company'` →
  tenant pemilik (418 baris Cibuluh, **privat**).
- **`price_book_entries` (104)** — **D4:** harga acuan bersama → NULL; harga nego
  per perusahaan → `company_id` terisi. Resolusi berlapis: company-specific menang
  atas NULL. Terlokalisasi di `apps/api/src/lib/price-resolver.ts`.
- `cbs_templates` (108), `feature_flags` (077, kolomnya sudah ada).

Aturan resolusi seragam: `WHERE company_id IS NULL OR company_id = auth_company_id()`,
preferensi ke baris non-NULL saat bentrok kunci. Ditulis **sekali** di wrapper (§6).

**B — TENANT-OWNED langsung (`company_id NOT NULL`)**
> (i) agregat root, ATAU (ii) tak punya rantai FK NOT NULL ke agregat root manapun.

**`projects`** (akar — satu-satunya yang benar-benar wajib), `clients`, `suppliers`,
`cash_accounts` (016), `workers` (029, global), `company_profile`, `company_settings`,
`financial_config`, `menu_items`, `approval_chains`, `notification_rules`, roles
custom, `accounts`/`journal_entries` (047, bila diaktifkan), **`rap_budget` dkk
(CECEP langkah 7, belum ada — lahir dengan `company_id` sejak baris pertama)**.
≈30–37 tabel.

**C — TENANT-OWNED turunan (tanpa kolom sendiri)**
> Ada rantai FK **NOT NULL** ke tabel kategori B, dan rantainya immutable.

`rab_items`, `termin_schedules`, `invoices`, `payments`, `expense_*`, `mandor_assignments`,
`work_scopes`, `kasbons`, `wage_*`, `progress_logs`, `milestones`, `documents`,
`material_requests`, `purchase_orders`, `goods_receipts`, `change_orders`,
`scenarios`, `estimate_versions`, `estimate_items`, `rebar_takeoff`. ≈50–60 tabel.

⚠️ **Syarat mutlak C: rantai FK NOT NULL.** Contoh nyata yang wajib diaudit
satu-per-satu (bukan diasumsikan): `kasbons.work_scope_id` dibuat *optional* oleh
migration 056 — tapi `kasbons.project_id` NOT NULL, jadi rantainya sehat lewat
jalur lain. **Kandidat C yang rantainya nullable → naik ke B.**

**D — kasus khusus**

| Tabel | Masalah | Penanganan |
|---|---|---|
| `audit_logs` | Append-only (073) — backfill melanggar | `company_id NULLABLE`, isi hanya baris baru. Historis NULL = "era pra-multi-company", jujur. |
| `notifications` | User bisa lintas-company | `company_id NOT NULL` — notifikasi selalu *tentang* sesuatu di satu company |
| `users` | Global (D5) | **Tanpa** `company_id` |
| `workflow_*` | Definisi shared, instance tenant | definitions = A/B; instances = B |
| `lessons_learned_records` (113/114) | Berisi data proyek nyata | **B** — berbagi antar tenant = fitur produk butuh consent, bukan default |

---

## 6. Lapis 1 — Repository wrapper (perlindungan cepat)

**Masalah:** 719 call-site `supabase.from(...)` di 53 file. Konvensi tidak akan
berhasil — satu kelupaan adalah kepastian statistik, bukan risiko.

**File baru:** `apps/api/src/utils/tenant-db.ts`
```
createTenantDb(companyId) → TenantDb
  .from(table)     → scoping OTOMATIS per kategori (B: eq company_id;
                     C: filter via project; A/B: or(null, eq))
  .shared(table)   → katalog bersama, TANPA scoping. Hanya menerima tabel A/AB.
                     Namanya sengaja mencolok di code review.
  .unsafe(table, reason)  → escape hatch, WAJIB alasan, di-log, di-grep CI
```

### Pemaksaan STRUKTURAL (empat lapis; #1 dan #4 yang menentukan)

1. **Type-level** — peta tabel→kategori sebagai tipe TypeScript. `shared('projects')`
   **tidak compile**. Menggeser pertanyaan dari "apakah programmer ingat?" ke
   "apakah `tsc` lolos?" — dan `tsc` sudah jalan di CI.
   Peta ini **di-generate dari migration**, bukan diketik tangan → tabel baru yang
   lupa diklasifikasi jadi error, bukan lubang.
2. **Request-level** — `request.db` didekorasi setelah company diresolusi. Handler
   pakai `request.db`, bukan `import { supabase }`. Handler lama tetap jalan
   (additive) → migrasi 53 file bisa bertahap.
3. **Runtime assertion** — `companyId` wajib & wajib hasil validasi. Mengubah bug
   dari "diam-diam bocor" jadi "500 keras".
4. **Lint rule + ratchet test** — `no-restricted-imports`: import `{ supabase }`
   dilarang di `src/routes/**` (error). Allowlist per-file yang **menyusut** tiap
   tahap = daftar utang yang terlihat di setiap PR diff. Plus CI test: hitung
   `supabase.from(` di routes, **gagalkan build kalau naik**.

### Titik perhatian khusus
- **`search.ts`** — global search menyentuh banyak tabel; kebocoran cross-tenant
  struktural terbesar. **Gelombang pertama**, bukan terakhir.
- `reports.ts` (52 KB), `finance.ts` (77 KB), `mandor.ts` (85 KB), `procurement.ts`
  (65 KB) — butuh gelombang sendiri.
- **`utils/config.ts:26`** — `getConfig` punya **cache global 60 detik**. Cache key
  wajib jadi `${companyId}:${key}`, kalau tidak tenant A membaca config tenant B
  selama 60 detik. Ini bug yang **akan** terjadi, bukan yang mungkin.

---

## 7. Lapis 2 — RLS dual-axis

**Strategi: komposisi, bukan mengedit 293 policy.** Menyunting 293 policy tak bisa
direview manusia dan tak bisa di-rollback sebagian.

**Kuncinya:** Postgres membedakan `PERMISSIVE` (di-OR) dan `RESTRICTIVE` (di-AND).
Semua 293 policy existing permissive.
```sql
CREATE POLICY "tenant_isolation" ON <table>
  AS RESTRICTIVE FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());
```
Satu policy restriktif per tabel di-AND dengan seluruh policy permissive existing,
**tanpa menyentuh satu pun dari 293**. Axis role dipegang policy lama; axis company
policy baru. Rollback = `DROP POLICY tenant_isolation` — granular & instan.

- Kategori C: `USING (project_company_id(project_id) = auth_company_id())`
- Kategori A/B: `USING (company_id IS NULL OR company_id = auth_company_id())`
- Kategori A: tanpa policy tenant

### Pindah dari service_role — ya, tapi paling akhir
Selama API pakai service_role (`utils/supabase.ts:18-23`), RLS di-bypass total dan
lapis 2 adalah teater. Doc 09 §2 mensyaratkan "dual-axis RLS **aktif**" — dan
"aktif" tak bisa berarti "ada tapi tak pernah dievaluasi".

Mekanisme: **bukan** mengganti service_role dengan anon+user JWT (refactor besar,
kehilangan operasi admin). Tapi **impersonasi per-transaksi lewat koneksi Postgres
langsung** — pola yang **sudah terbukti jalan di repo ini**:
`apps/api/src/test-utils/rls-harness.ts:44-66` melakukan persis ini
(`set_config('role','authenticated',true)` + `request.jwt.claims`). Ketiga setting
`is_local=true` → hilang saat transaksi selesai → aman di connection pool.

### Performa `auth_role()` — jawaban jujur
`STABLE` berarti cache **per-statement, bukan per-row** → kekhawatiran "query per
baris" tidak berlaku. Yang nyata: `has_permission()` (3-way join) per statement.
`auth_company_id()` membaca `current_setting()` (**nol I/O**) di jalur utama → axis
baru **tidak menambah biaya**. Mitigasi kanonik: bungkus `(SELECT auth_company_id())`
di policy → InitPlan, evaluasi sekali. Index covering `projects(id, company_id)`.
**Baseline `EXPLAIN ANALYZE` dicatat sebelum pindah** — tanpa angka, "RLS bikin
lambat" jadi klaim yang tak bisa dibantah maupun dibuktikan.

---

## 8. Numbering scope-able

**Cacat sekarang:** MR/PO/GR trigger `COUNT(*)+1` (041:247-304) + UNIQUE global;
invoice `COUNT` per bulan (`finance.ts:370-389`); CO regex MAX-parse
(`change-orders.ts:43-55`). Semua menurunkan nomor dari **membaca data**, bukan dari
**state penerbit** → race-prone dan tidak scope-able.

**Solusi:** tabel counter + `UPDATE ... RETURNING` (atomik, row-lock per seri).
```
document_number_series(company_id, doc_type, scope_key, prefix, format, last_number,
                       UNIQUE(company_id, doc_type, scope_key))
```
- **Bukan `SEQUENCE` per company:** sequence = objek DDL → tenant baru butuh DDL saat
  provisioning (gagal dengan cara sulit di-rollback), dan tidak transaksional
  (rollback tetap membakar nomor → gap tak terjelaskan = masalah audit dokumen legal).
- **Bukan advisory lock:** menyelesaikan race tapi bukan scoping, + lock bocor kalau
  koneksi mati.

**Migrasi tanpa mengubah nomor lama — syarat mutlak:**
> Dokumen historis **TIDAK DISENTUH**. Nol UPDATE pada kolom nomor manapun.

Yang dilakukan: seed `last_number` = nomor tertinggi yang sudah terpakai per
(company, doc_type, scope). Nomor berikutnya melanjutkan; nomor lama literal apa
adanya. Urutan **expand-contract**: tambah `UNIQUE(company_id, nomor)` → seed →
alihkan trigger → verifikasi berdampingan → **baru** lepas UNIQUE global (operasi
terpisah, ack sendiri).

---

## 9. Urutan eksekusi

**[G]** = green-light otonom · **[R]** = Red-Line, butuh ack founder

| Tahap | Isi | Ukuran | Gerbang |
|---|---|---|---|
| **T0** | ADR ini + amandemen KEPUTUSAN-MULTI-COMPANY §2 | S | [G] |
| **T1** | Audit klasifikasi 94 tabel; **verifikasi rantai FK NOT NULL** tiap kandidat C | M | [G] |
| **T2** | Migration: `companies`, `company_members`, `document_number_series`, fungsi auth; seed tenant pertama dari `company_profile` (dibaca, bukan hardcoded); FK untuk `feature_flags.company_id` | M | [G] additive murni |
| **T3** | `company_id` pada tabel B: ADD nullable [G] → backfill **[R]** → SET NOT NULL **[R]** + index | L | **[R]** |
| **T4** | Wrapper + migrasi 53 file bergelombang (4a fondasi+cache fix · 4b search/dashboard/projects · 4c finansial · 4d operasional · 4e sisanya · 4f lint aktif) | XL | [G] |
| **T5** | 5a policy restriktif [G] · 5b test isolasi 2 company [G] · 5c pindah dari service_role **[R]** | L | sebagian **[R]** |
| **T6** | Numbering (paralel T4): seed seri **[R]** · UNIQUE baru [G] · ganti trigger **[R]** · lepas UNIQUE lama **[R]** | M | **[R]** |
| **T7** | UI company switcher, Menu Registry per-company, exit criteria L2 | M | [G] |
| **T8** | L3 (Tenant Lifecycle, Billing, SLA) — **tidak dirinci sekarang** (doc 09 §5 #2: verifikasi ulang komitmen pelanggan sebelum **setiap** item) | — | — |

```
T0 → T1 → T2 → T3 → T4 → T5 → T7
             └→ T6 (paralel T4)
```

**CECEP langkah 7+ dilanjutkan setelah T7** (keputusan D1).

### Pemetaan ke checklist L2 (doc 09 §2)
| Checklist | Dipenuhi |
|---|---|
| `company_id` seluruh tabel transaksional, audit lengkap | T1 + T3 |
| Dual-axis RLS aktif | T5a + T5c |
| Isolasi 2 company diverifikasi **manual** | T5b |
| User A tak lihat data B lewat jalur manapun | T4 (khususnya `search.ts`, `reports.ts`) + T5 |
| Menu Registry per-company | T7 |
| ≥2 kontributor review | T7 — **butuh keputusan founder, tim = 1 orang** |

---

## 10. Risiko + mitigasi

### R1 — Kebocoran cross-tenant saat transisi (KRITIS)
> **GERBANG MUTLAK: tenant kedua TIDAK BOLEH dibuat di produksi sebelum T4 dan T5
> selesai penuh.** Selama T0–T5 sistem berisi tepat satu company → tidak ada apa
> pun untuk bocor.

Ini mengubah risiko dari "harus dimitigasi hati-hati" menjadi "tidak mungkin terjadi
secara konstruksi". Tenant kedua pertama kali dibuat di **staging** untuk T5b,
di produksi hanya setelah T7.

### R2 — Backfill data existing salah klasifikasi (TINGGI)
Kasus terburuk: 2.620 assembly nasional ikut ter-assign ke tenant pertama → tenant
baru tak punya katalog, melanggar D2.

**Mitigasi:** backfill `assemblies` **wajib** dikendalikan `source`, bukan blanket.
Angka yang harus cocok persis: **2.620 NULL** (`source='national'`), **418 tenant-1**
(`source='company'`). Verifikasi ini masuk **DANGER GATE T3 sebagai angka konkret
yang di-review founder**, bukan deskripsi.

`price_book_entries` (D4): default aman = semua ke tenant pertama, lalu promosikan
ke shared selektif. Salah arah ke privat → bisa diperbaiki; salah arah ke shared →
kebocoran harga, **tidak bisa ditarik kembali**.

### R3 — CECEP tertahan (TINGGI, sudah diputuskan)
Founder memilih **bekukan CECEP** (D1). Titik-bocor #1 (belanja material tanpa
pagu) sengaja dibiarkan terbuka selama T0–T7 — keputusan sadar, bukan kelalaian.
Kompensasi: RAP/Pagu nanti lahir dengan `company_id` sejak baris pertama → nol
backfill, nol Red-Line untuk modul itu.

Catatan: langkah 8 CECEP (UI builder AHSP company) **jauh lebih bermakna**
pasca-multi-company — `source='company'` akhirnya punya arti "company yang mana",
dan "duplikat national→company" secara alami jadi "duplikat ke company saya" (D3).

### R4 — Peran per-company memecah `requirePermission` (SEDANG)
`_permissionCache` (auth.ts:18) di-key oleh role. Pasca per-company, resolusi company
**wajib terjadi sebelum** `loadPermissionCache` pertama — urutan di `plugins/auth.ts`
jadi load-bearing, **wajib diberi komentar**.

Turunan: `lib/role-guard.ts` (CRITICAL_PERMISSIONS + anti-lockout) menghitung holder
**secara global** → pasca multi-company harus per-company, kalau tidak admin tenant A
menghalangi perubahan role di tenant B. Masuk lingkup T4.

### R5 — `auth_client_id()` & portal klien (SEDANG)
`auth_client_id()` (049:23-28) memetakan user→client. Klien = entitas per-company.
Satu orang bisa jadi klien di dua company → fungsi ini harus menghormati
`auth_company_id()`, kalau tidak portal klien menampilkan proyek lintas company.
Sering terlewat karena portal jarang disentuh — **catat eksplisit di T5**.

### R6 — Regresi performa policy restriktif (RENDAH-SEDANG)
Mitigasi: index covering `projects(id, company_id)`, pola `(SELECT auth_company_id())`,
baseline EXPLAIN ANALYZE sebelum T5c.

### R7 — "≥2 kontributor" vs tim 1 orang (SEDANG, organisasional)
Doc 09 §2 item 6 eksplisit: "migrasi ini tidak solo-safe". Tak bisa dipecahkan
teknis. **Diangkat ke founder di T0**, bukan ditemukan di T7. Opsi: reviewer
eksternal untuk T3 & T5 saja (dua tahap paling berisiko), atau ack tertulis founder
yang mengakui pengecualian secara sadar.

---

## 11. Pertanyaan terbuka tersisa untuk founder

1. **≥2 kontributor review** (R7) — bagaimana dipenuhi dengan tim 1 orang?
2. **Pelanggan pertama punya >1 badan usaha?** Menentukan `tenants` vs `companies`
   sekarang atau nanti (§3, ditunda sampai terbukti perlu).

---

## Referensi

- `docs/KEPUTUSAN-MULTI-COMPANY.md` §2 (dokumen yang diamandemen; dua tripwire)
- `.../Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md` §2 (checklist L2), §3 (gerbang L3)
- `.../01-application-and-data-architecture.md` §Entity Strategy
- `AUTOPILOT.md` §5 (Red-Line), §12 (config-first)
- ADR-005 (SECURITY DEFINER anti-recursion), ADR-009 (persistence derived not invented)
