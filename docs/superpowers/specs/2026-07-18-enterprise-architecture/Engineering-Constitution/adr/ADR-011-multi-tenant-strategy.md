# ADR-011 — Strategi Multi-Tenant Puraloka Suite

**Status:** ACCEPTED (keputusan founder 2026-07-28, direvisi hari yang sama: 'ditunda' bukan 'dibekukan')
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
| D1 | **CECEP DITUNDA (bukan dibekukan)** — multi-tenant diselesaikan **tuntas, tidak setengah matang**, baru CECEP dilanjutkan | Langkah 7 (RAP/Pagu) & seterusnya ditahan sampai T7 selesai. **Rasionalisasi founder 2026-07-28: sistem belum dipakai operasional nyata (masih development)** → titik-bocor #1 belum menimbulkan kerugian aktual, dan retrofit pondasi saat nol data produksi adalah waktu termurah. CECEP langkah 1–6 yang sudah selesai TETAP UTUH & dipakai. |
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
4. **198 policy RLS sudah ditulis** (dihitung ulang di audit T1). Menambah satu axis jauh lebih murah daripada
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

**Strategi: komposisi, bukan mengedit 198 policy.** Menyunting 198 policy tak bisa
direview manusia dan tak bisa di-rollback sebagian.

**Kuncinya:** Postgres membedakan `PERMISSIVE` (di-OR) dan `RESTRICTIVE` (di-AND).
Seluruh **198** policy existing bersifat permissive (angka dikoreksi oleh audit T1 — sebelumnya tertulis 293).
```sql
CREATE POLICY "tenant_isolation" ON <table>
  AS RESTRICTIVE FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());
```
Satu policy restriktif per tabel di-AND dengan seluruh policy permissive existing,
**tanpa menyentuh satu pun dari 198**. Axis role dipegang policy lama; axis company
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
| **T1** ✅ | Audit klasifikasi 94 tabel; verifikasi rantai FK NOT NULL tiap kandidat C → **`ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md`** (3 temuan: F1 rantai lemah, F2 policy 198≠293, F3 8 tabel nol-policy) | M | [G] |
| **T2** ✅ | Migration **124**: `companies`, `company_members`, `document_number_series`, `auth_company_id()`, `is_member_of()`; seed tenant pertama dari `company_profile` (dibaca, bukan hardcoded); FK `feature_flags.company_id`. `project_company_id()` **ditunda ke T3** (butuh `projects.company_id`). 20 test hijau | M | [G] additive murni |
| **T3** | `company_id` pada tabel B: ADD nullable [G] → backfill **[R]** → SET NOT NULL **[R]** + index | L | **[R]** |
| **T4** | Wrapper + migrasi 53 file bergelombang (4a fondasi+cache fix · 4b search/dashboard/projects · 4c finansial · 4d operasional · 4e sisanya · 4f lint aktif) | XL | [G] |
| **T5** | **5a-0 policy permissive dasar utk 8 tabel ber-nol-policy** [G] · 5a policy restriktif [G] · 5b test isolasi 2 company + kill-switch [G] · 5c pindah dari service_role **[R]** | L | sebagian **[R]** |
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
| `company_id` seluruh tabel transaksional, audit lengkap | T1 ✅ (32 tabel teridentifikasi) + T3 |
| Dual-axis RLS aktif | T5a + T5c |
| Isolasi 2 company diverifikasi **manual** | T5b |
| User A tak lihat data B lewat jalur manapun | T4 (khususnya `search.ts`, `reports.ts`) + T5 |
| Menu Registry per-company | T7 |
| ≥2 kontributor review | **DIGANTI** ack tertulis + Dokumen Audit Pra-Eksekusi (T3 & T5) — §10 R7 |

---

### 9.5 Tiga penajaman (agar rancangan tidak "cukup baik" tapi benar)

Tiga hal di bawah bukan fitur tambahan — mereka menutup celah yang, tanpa
ditulis eksplisit, hampir pasti terlewat karena hari ini sistem cuma berisi
**satu** company sehingga semua bug isolasi tampak "tidak terjadi".

**P1 — Company pertama diperlakukan sebagai tenant biasa, BUKAN kasus khusus.**
Godaan terbesar retrofit single→multi adalah menulis jalan pintas untuk tenant
yang sudah ada ("kalau cuma satu company, lewati resolusi"). Jalan pintas itu
menjadi lubang permanen: jalur yang tak pernah dieksekusi di dev adalah jalur
yang tak pernah diuji, dan ia baru dijalankan pertama kali **di produksi, oleh
tenant kedua**.

Aturan mengikat sejak T2:
- Tidak ada konstanta `DEFAULT_COMPANY_ID` di kode aplikasi. Company pertama
  lahir dari migration + dibaca dari DB, sama seperti company ke-50.
- Tidak ada cabang `if (companies.length === 1)` di mana pun.
- `auth_company_id()` yang mengembalikan NULL = **error keras**, bukan
  "ya sudah pakai satu-satunya yang ada".
- Konsekuensi diterima sadar: fase awal jadi sedikit lebih repot (setiap request
  harus benar-benar meresolusi company). Itu justru intinya — kerepotan itu yang
  membuat jalur multi-tenant teruji ribuan kali sebelum tenant kedua ada.

**P2 — Isolasi dibuktikan SEBELUM tenant kedua nyata (fixture "tenant hantu").**
Checklist L2 mensyaratkan "isolasi 2 company diverifikasi". Kalau menunggu
pelanggan kedua, verifikasinya terjadi saat data nyata sudah masuk — waktu
paling mahal dan paling tidak bisa di-rollback.

Karena itu di **T5b** dibuat dua company fixture (`TENANT-A`, `TENANT-B`) berisi
data lengkap **di lingkungan test**, dan test isolasi menyatakan yang negatif,
bukan yang positif:
- Untuk **setiap** tabel kategori B & C: user tenant A `SELECT` → 0 baris milik B.
- Untuk **setiap endpoint list** yang sudah dimigrasi: respons tenant A tak
  pernah memuat id milik B (dicek by-id, bukan by-count — count bisa kebetulan sama).
- Jalur agregat khusus: `search.ts`, `dashboard.ts`, `reports.ts` diuji terpisah
  karena merekalah yang menggabungkan banyak tabel sekaligus.
- **Uji kill-switch**: matikan wrapper (lapis 1) → test isolasi **harus tetap
  hijau** karena RLS (lapis 2) menahan; lalu matikan RLS → **harus tetap hijau**
  karena wrapper menahan. Kalau salah satu dimatikan lalu test langsung merah,
  artinya sistem hanya punya SATU lapis pertahanan yang nyata, bukan dua. Ini
  satu-satunya cara membedakan "defense-in-depth" sungguhan dari klaim.

**P3 — Tabel baru tidak bisa lahir tanpa klasifikasi (ratchet ke depan).**
Audit T1 mengklasifikasi 94 tabel **hari ini**. Tabel ke-95 lahir minggu depan
(RAP/Pagu CECEP langkah 7 adalah yang pertama) — dan tanpa penegak, ia lahir
tanpa `company_id`, persis mengulang masalah yang sedang diperbaiki.

Penegaknya: peta tabel→kategori di-generate dari migration (sudah disebut §6 #1),
lalu **CI test** membandingkan daftar tabel di schema vs daftar terklasifikasi:
- tabel di DB tapi tak ada di peta → **build merah**, pesan: "tabel X belum
  diklasifikasi A/AB/B/C/D — lihat ADR-011 §5".
- Efeknya, klasifikasi jadi bagian dari menulis migration, bukan pekerjaan
  audit yang harus diulang tiap enam bulan.
- Berlaku juga mundur: menghapus klasifikasi tanpa menghapus tabel = merah.

Ketiganya masuk Definition of Done tahapnya masing-masing (P1→T2, P2→T5b,
P3→T4a), bukan "kalau sempat".

### 9.6 Aturan test untuk seluruh T3–T7 (dipelajari dari kegagalan CI T2)

Test T2 hijau di lokal tapi merah di CI. Bukan flaky — bug nyata: suite langsung
`createTestClient()` tanpa `resetTestSchema()`, jadi ia **menumpang** schema yang
kebetulan tertinggal dari run sebelumnya. Lokal punya sisa itu, CI tidak.

Kelas bug ini akan berulang di T3–T5 (semuanya menjalankan migration), jadi
aturannya ditulis di sini, bukan ditemukan ulang tiap tahap:

1. **Setiap suite yang menjalankan migration WAJIB `resetTestSchema()` sendiri
   sebelum `createTestClient()`.** Bergantung pada sisa suite lain = test yang
   lulusnya kebetulan.
2. **Jangan pernah merangkai nama schema ke dalam query.** Pakai
   `current_schema()` dan `'tabel'::regclass` — keduanya mengikuti `search_path`
   koneksi. Konstanta `TEST_SCHEMA` membuat assertion menguji hal yang berbeda
   dari yang sebenarnya terjadi.
3. **Verifikasi dari schema yang benar-benar baru sebelum push**, bukan dari
   schema lokal yang sudah terisi: `TEST_SCHEMA=test_sim_<n> pnpm vitest run <file>`.
   Ini mereproduksi kondisi CI dalam hitungan detik, jauh lebih murah daripada
   menunggu ~9 menit lalu membaca log.
4. **"Hijau di lokal" bukan bukti.** Bukti adalah run summary CI. Konsisten dengan
   AUTOPILOT §6 — dan T2 baru saja membuktikan kenapa aturan itu ada.

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

### R3 — CECEP tertunda (RENDAH setelah rasionalisasi founder)
Founder memilih **tunda CECEP** (D1), dengan alasan yang menurunkan risiko ini dari
TINGGI ke RENDAH: **sistem belum dipakai operasional nyata — masih development.**

Konsekuensi penting dari fakta itu:
- Titik-bocor #1 (belanja material tanpa pagu) **belum menimbulkan kerugian aktual**;
  ia risiko potensial, bukan kebocoran berjalan.
- **Nol data produksi = waktu termurah untuk retrofit pondasi.** Menunda multi-tenant
  sampai ada data operasional justru melipatgandakan biayanya.
- Mandat founder: multi-tenant harus **tuntas, tidak setengah matang** — tidak boleh
  ada tahap yang ditinggal separuh lalu ditinggal pindah ke CECEP.

Kompensasi tetap berlaku: RAP/Pagu nanti lahir dengan `company_id` sejak baris
pertama → nol backfill, nol Red-Line untuk modul itu.

**Konsekuensi operasional yang mengikat:** karena "tuntas" adalah syarat, setiap
tahap T1–T7 punya Exit Criteria eksplisit (§9) dan **tidak boleh dilewati sebagian**.
Definisi "tuntas" = seluruh checklist L2 doc 09 §2 tercentang, bukan "tahapnya sudah
dikerjakan".

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

### R7 — "≥2 kontributor" vs tim 1 orang — **TERJAWAB founder 2026-07-28**
Doc 09 §2 item 6 eksplisit: "migrasi ini tidak solo-safe". Tak bisa dipecahkan teknis.

**Keputusan founder: ack tertulis + audit rinci, BUKAN reviewer eksternal.**

Mekanisme pengganti yang mengikat (ini menggantikan "≥2 kontributor", jadi harus
lebih ketat dari review biasa — bukan sekadar dilewati):

Untuk **T3** (tambah `company_id` + backfill) dan **T5** (aktifkan RLS) — dua tahap
paling berisiko — WAJIB disiapkan **Dokumen Audit Pra-Eksekusi** berisi:
1. **Diff lengkap** SQL/kode yang akan dijalankan (bukan ringkasan).
2. **Angka sebelum/sesudah per tabel** hasil dry-run — mis. T3: "2.620 assembly →
   `company_id NULL`, 418 → tenant-1" (angka konkret, bukan deskripsi).
3. **Rencana rollback** yang sudah diuji, bukan diasumsikan.
4. **Daftar apa yang TIDAK diverifikasi** (batas pengetahuan yang jujur).

Founder me-review dokumen itu dan memberi **ack tertulis eksplisit** sebelum
eksekusi. Ack tersimpan di PR sebagai jejak.

**Pengecualian ini diakui sadar dan tercatat** — bukan syarat yang dilupakan.
Konsekuensi yang diterima: tidak ada mata kedua yang independen; mitigasinya adalah
kedalaman dokumentasi + reversibilitas (setiap tahap T3/T5 dirancang dapat
di-rollback granular).

---

## 11. Pertanyaan terbuka tersisa untuk founder

1. ~~**≥2 kontributor review**~~ — **TERJAWAB 2026-07-28**: ack tertulis founder +
   Dokumen Audit Pra-Eksekusi untuk T3 & T5 (lihat §10 R7).
2. **Pelanggan pertama punya >1 badan usaha?** Menentukan `tenants` vs `companies`
   sekarang atau nanti (§3, ditunda sampai terbukti perlu). **Tidak memblokir T1–T2.**

### Mandat eksekusi otonom (founder 2026-07-28)
Founder memberi green-light **T1 dan T2 dikerjakan otonom** tanpa tanya per-langkah
(keduanya additive murni, nol perubahan data existing). **Berhenti wajib lapor
sebelum T3** — di sanalah Dokumen Audit Pra-Eksekusi pertama disiapkan.

---

## Referensi

- `docs/KEPUTUSAN-MULTI-COMPANY.md` §2 (dokumen yang diamandemen; dua tripwire)
- `.../Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md` §2 (checklist L2), §3 (gerbang L3)
- `.../01-application-and-data-architecture.md` §Entity Strategy
- `AUTOPILOT.md` §5 (Red-Line), §12 (config-first)
- ADR-005 (SECURITY DEFINER anti-recursion), ADR-009 (persistence derived not invented)
