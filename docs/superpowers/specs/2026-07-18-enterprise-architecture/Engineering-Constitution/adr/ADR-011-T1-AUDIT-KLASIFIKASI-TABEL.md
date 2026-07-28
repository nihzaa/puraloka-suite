# T1 — Audit Klasifikasi 94 Tabel (lampiran ADR-011)

**Tanggal:** 2026-07-29 · **Status:** SELESAI · **Tahap:** T1 (gerbang [G] otonom)
**Sumber angka:** query langsung ke DB dev `tgozokxyvwmyvajgqfxw`, bukan pembacaan
migration. Skrip audit: `apps/api/scripts/tmp/t1-classify.mjs` (BFS rantai FK).

> **Kenapa dari DB, bukan dari migration:** migration mencatat *niat*; DB mencatat
> *kenyataan*. Beda keduanya persis jenis kesalahan yang audit ini harus temukan.

---

## 0. Ringkasan eksekutif — tiga temuan yang mengubah rencana

| # | Temuan | Dampak ke ADR-011 |
|---|---|---|
| **T1-F1** | **9 tabel tidak bisa mewarisi tenancy** karena FK di jalurnya nullable. ADR menaksir "±62 mewarisi via `project_id`" — nyatanya **48** yang aman. | Klasifikasi final: **32 tabel dapat kolom `company_id`** di T3 (1 anchor + 11 AB + 17 B + 3 dari D), bukan ±37 seperti taksiran awal. |
| **T1-F2** | Jumlah policy RLS **198**, bukan 293 seperti tertulis di ADR §7. | Strategi RESTRICTIVE tidak berubah (tetap benar), tapi angka di ADR harus dikoreksi supaya klaim "tanpa menyentuh satu pun dari N" bisa diverifikasi. |
| **T1-F3** | **8 tabel punya NOL policy RLS** (RLS-nya **aktif** — jadi hari ini mereka hanya terbaca karena API pakai `service_role`) — termasuk `rab_items`, `rab_schedule`, `rab_absorption_log`, `change_orders`, `change_order_items`, `work_scope_item_specs`, `document_access_logs`, `company_profile`. | Untuk tabel ini, policy restriktif tenant **tidak cukup**: RESTRICTIVE di-AND dengan PERMISSIVE, dan **tanpa satu pun policy permissive, hasil AND selalu kosong**. Perlu policy permissive dasar lebih dulu. Ini jebakan halus yang akan bikin T5 "berhasil" tapi memutus akses. |

Ketiganya adalah alasan T1 dibuat sebagai tahap tersendiri, bukan digabung ke T3.

---

## 1. Inventaris dasar (terverifikasi)

```
Total tabel public (BASE TABLE)      : 94
Punya kolom project_id               : 28  (23 NOT NULL · 5 NULLABLE)
Punya kolom company_id hari ini      : 1   (feature_flags — yatim, tanpa FK)
Total policy RLS                     : 198
```

---

## 2. Aturan klasifikasi (dipakai konsisten, bukan per-tabel selera)

| Kat | Arti | Perlakuan |
|---|---|---|
| **ANCHOR** | akar tenancy | `projects` — `company_id` lahir di sini, NOT NULL |
| **A** | katalog/standar **bersama** semua tenant | tanpa `company_id`; `.shared()` di wrapper |
| **AB** | katalog bersama **boleh ditimpa** tenant | `company_id` NULLABLE — NULL = baris acuan bersama, terisi = milik tenant. Keputusan founder D5: "ada harga acuan bersama + boleh ditimpa sendiri" |
| **B** | milik tenant, **tak punya jalur `project_id` yang bisa dipercaya** | `company_id` NOT NULL |
| **C** | milik tenant, **mewarisi** lewat rantai FK yang seluruhnya NOT NULL | tanpa kolom sendiri; RLS pakai `project_company_id()` |
| **D** | khusus (platform/audit/identitas lintas-tenant) | ditangani satu-satu, lihat §6 |

**Uji kategori C (keras, tidak boleh dilonggarkan):** sebuah tabel hanya C kalau
**SELURUH** FK di jalurnya menuju `projects` bersifat `NOT NULL`. Satu FK nullable
di mana pun di rantai = baris bisa yatim = tenancy tak dapat ditentukan = **bukan C**.

---

## 3. Kategori C — 48 tabel (warisan AMAN, terverifikasi rantai NOT NULL)

Ini yang dimaksud "verifikasi rantai FK NOT NULL tiap kandidat C" di roadmap T1.
Angka `[n]` = jumlah hop ke `projects`.

**[1] hop — `project_id` langsung NOT NULL (23):**
`change_orders` · `documents` · `expense_reports` · `goods_receipts` · `invoices` ·
`lessons_learned_records` · `mandor_assignments` · `material_requests` ·
`milestones` · `progress_logs` · `project_expense_categories` · `project_expenses` ·
`project_photos` · `project_stocks` · `purchase_orders` · `rab_absorption_log` ·
`rab_items` · `rab_schedule` · `scenarios` · `stock_movements` · `termin_schedules` ·
`wbs_nodes` · `worker_kasbons`

**[2] hop (16):**
`change_order_items` · `cost_code_category_map` · `document_access_logs` ·
`estimate_versions` · `expense_items` · `goods_receipt_items` · `invoice_line_items` ·
`invoice_penalties` · `lesson_propagation_proposals` · `material_request_items` ·
`payments` · `purchase_order_items` · `root_cause_analyses` · `tax_records` ·
`weekly_wage_reports` · `work_scopes`

**[3] hop (7):** `borongan_settlements` · `daily_wage_logs` · `estimate_items` ·
`progress_payments` · `wage_deductions` · `wage_items` · `work_scope_items`

**[4] hop (2):** `rebar_takeoff` · `work_scope_item_specs`

> **Catatan metodologi (koreksi terhadap analisis awal saya sendiri):** BFS versi
> pertama memilih jalur *terpendek*, bukan jalur *terkuat*. Akibatnya `estimate_items`
> sempat terklasifikasi lemah lewat `wbs_node_id` (nullable, 100% NULL di data)
> padahal ia punya jalur kuat lewat `estimate_version_id` (NOT NULL, 0% NULL).
> Algoritma diperbaiki: **cari jalur seluruhnya-NOT-NULL dulu; baru jatuh ke jalur
> lemah kalau tidak ada.** **Lima** tabel pindah dari "lemah" ke C karena koreksi ini
> — `estimate_items`, `rebar_takeoff`, `wage_deductions`, `borongan_settlements`,
> `progress_payments` — plus `invoice_penalties` yang jalur kuatnya lewat
> `invoice_id`, bukan `project_id`-nya sendiri yang nullable.
> Tanpa koreksi ini, 6 tabel akan dapat kolom `company_id` yang tak perlu, dan
> beban backfill T3 naik sia-sia.

---

## 4. Kategori B karena rantai LEMAH — 9 tabel (temuan T1-F1)

Semua ini **punya** jalur ke `projects`, tapi jalurnya melewati FK nullable →
tenancy tidak dapat dijamin → **wajib `company_id` sendiri**.

| Tabel | Baris | Jalur | Kolom lemah | NULL nyata di dev |
|---|---:|---|---|---|
| `cash_accounts` | 5 | `.project_id` | `project_id` | **2 dari 5 (40%)** — kas umum perusahaan memang bukan milik proyek |
| `kasbons` | 56 | `.project_id` | `project_id` | **9 dari 56 (16%)** |
| `notifications` | 28 | `.project_id` | `project_id` | 1 dari 28 (4%) |
| `supplier_invoices` | 2 | `.project_id` | `project_id` | 0 (tapi skema izinkan) |
| `assemblies` | 3.038 | via `created_in_estimate_id` | `created_in_estimate_id` | **3.038 dari 3.038 (100%)** |
| `assembly_components` | 17.853 | via `assemblies` | idem | 100% (turunan) |
| `cash_transfers` | 8 | via `cash_accounts` | `cash_accounts.project_id` | mewarisi kelemahan |
| `supplier_payments` | 2 | via `cash_accounts` | idem | mewarisi kelemahan |
| `supplier_payment_allocations` | 0 | via `supplier_invoices` | idem | mewarisi kelemahan |

**Ini bukan cacat skema yang harus "diperbaiki" jadi NOT NULL.** `cash_accounts.project_id`
nullable **karena memang ada kas tingkat perusahaan** (40% datanya begitu) — memaksa
NOT NULL akan merusak model bisnis. Yang benar: tabel-tabel ini memang milik
**company**, bukan milik **project**. Rantai lemah adalah *gejala*, dan klasifikasi B
adalah *diagnosis yang tepat*, bukan tambalan.

**`assemblies` = kasus paling penting.** 100% barisnya `created_in_estimate_id IS NULL`
karena keduanya katalog (2.620 national + 418 company Cibuluh), bukan analisa
mid-estimasi. Maka `assemblies` sebenarnya **AB**, bukan B — lihat §5.

---

## 5. 36 tabel tanpa jalur — klasifikasi domain

### A — katalog/standar bersama, TANPA `company_id` (12)
`units` (34) · `ahsp_editions` (3) · `steel_profiles` (58) · `resources` (2.827) ·
`material_categories` (10) · `work_categories` (12) · `kasbon_purposes` (5) ·
`permissions` (89) · `modules` (14) · `menu_items` (23) · `permission_scopes` (0) ·
`formula_definitions` (1)

Alasan: ini **kosakata sistem**. Satuan "m³" dan permission key `finance:view`
bermakna sama untuk semua tenant. Memberi mereka `company_id` = menduplikasi standar
nasional 50×, sekaligus memutus katalog AHSP nasional yang justru nilai jual produk.

### AB — bersama tapi boleh ditimpa: `company_id` NULLABLE (10)
`assemblies` (3.038) · `assembly_components` (17.853) · `cost_codes` (44) ·
`price_book_entries` (2) · `materials` (23) · `suppliers` (5) · `cbs_templates` (1) ·
`cbs_nodes` (2) · `expense_category_templates` (91) · `productivity_records` (1)

Aturan: **NULL = baris acuan bersama** (AHSP nasional SE-47, harga acuan,
template kategori) · **terisi = milik tenant itu** (AHSP company hasil edit/duplikat,
harga sendiri, supplier sendiri). Ini langsung menjawab pertanyaan founder
2026-07-28: *"kalau ada perusahaan mau copy AHSP nasional jadi AHSP company lalu
diubah — gimana?"* → duplikat lahir dengan `company_id` terisi, induknya
(`derived_from_assembly_id`, kolom sudah ada sejak migration 117) tetap NULL dan
tetap bersama. Nol duplikasi katalog nasional.

**Konsekuensi yang harus ditegakkan di T3:** `assemblies.source='national'` **wajib**
`company_id IS NULL`; `source='company'` **wajib** `company_id NOT NULL`. Ditegakkan
sebagai CHECK constraint, bukan konvensi — kalau tidak, katalog nasional bisa
"dicuri" satu tenant dan hilang dari tenant lain.

### B — milik tenant, `company_id` NOT NULL (10)
`clients` (10) · `workers` (3) · `company_settings` (5) · `financial_config` (9) ·
`approval_chains` (6) · `approval_steps` (6) · `approval_progress` (13) ·
`notification_rules` (14) · `notification_rule_targets` (25) · `material_pack` (0)

Alasan: klien, tukang, konfigurasi pajak/BUK, rantai approval, aturan notifikasi —
semuanya **jelas milik satu perusahaan** dan tidak masuk akal dibagi. `financial_config`
khususnya: tarif PPN boleh sama, tapi BUK & pembulatan adalah kebijakan perusahaan.

### D — khusus (4)
| Tabel | Perlakuan |
|---|---|
| `users` (23) | **Identitas lintas-tenant.** Satu orang bisa jadi anggota >1 company (D6: pakai `company_members`). `users` TIDAK dapat `company_id`. Keanggotaan hidup di `company_members`. |
| `roles` (5) + `role_permissions` (203) | Peran = konfigurasi per-company (ADR-004: role adalah data, bukan kode). `company_id` NULLABLE: NULL = peran bawaan sistem (admin/pm/mandor/client), terisi = peran custom tenant. Mencegah tenant A menghapus peran bawaan tenant B. |
| `audit_logs` (1.555) | `company_id` NOT NULL, **diisi saat tulis**, tak pernah lewat join. Audit trail harus tetap terbaca meski baris induknya dihapus. Tabel ini append-only (trigger 073 masih Red-Line, belum aktif). |
| `company_profile` (1) | **DIHAPUS sebagai konsep** — inilah tabel single-row yang dilarang guardrail. Isinya pindah jadi baris pertama `companies` di T2. Tabel lama dipertahankan sementara (nol breaking change), ditandai deprecated, dibuang setelah T4. |
| `feature_flags` (0) | Sudah punya `company_id` yatim sejak migration 077. T2 memberinya FK. NULL = flag global, terisi = override per-tenant. Klasifikasi: **AB**. |

---

## 6. Rekapitulasi

| Kategori | Jumlah | Aksi di T3 | Dapat kolom? |
|---|---:|---|---|
| ANCHOR (`projects`) | 1 | `company_id` NOT NULL | ✅ |
| A — bersama, tanpa kolom | 12 | — | — |
| AB — `company_id` NULLABLE | 11 | ADD nullable (+ CHECK utk `assemblies`) | ✅ |
| B — `company_id` NOT NULL | 17 | ADD → backfill → SET NOT NULL | ✅ |
| C — warisan via FK NOT NULL | 48 | — (RLS pakai `project_company_id()`) | — |
| D — khusus | 5 | per-tabel, lihat §5 | sebagian |
| **Total** | **94** | | **32 tabel** |

**Penjumlahan ditutup eksplisit** (1+12+11+17+48+5 = 94 ✓) supaya tak ada tabel yang
diam-diam tak terklasifikasi — persis kondisi yang penegak P3 (ADR §9.5) cegah ke depan.

Rincian:
- **B (17)** = 7 rantai-lemah (§4: `cash_accounts`, `kasbons`, `notifications`,
  `supplier_invoices`, `cash_transfers`, `supplier_payments`,
  `supplier_payment_allocations`) + 10 domain (§5).
  `assemblies` & `assembly_components` **tidak** di sini — keduanya AB.
- **AB (11)** = 10 domain (§5) + `feature_flags`.
- **D (5)** = `users`, `roles`, `role_permissions`, `audit_logs`, `company_profile`.
  Dari kelimanya: `roles` & `role_permissions` dapat `company_id` NULLABLE,
  `audit_logs` dapat NOT NULL, `users` **tidak** dapat kolom (keanggotaan lewat
  `company_members`), `company_profile` dibuang di T4.
- **32 tabel dapat kolom** = 1 (`projects`) + 11 (AB) + 17 (B) + 3 (`roles`,
  `role_permissions`, `audit_logs`). Diverifikasi nol duplikat antar-kategori.

---

## 7. Temuan T1-F3 — 8 tabel tanpa policy RLS (jebakan untuk T5)

`change_orders` · `change_order_items` · `rab_items` · `rab_schedule` ·
`rab_absorption_log` · `work_scope_item_specs` · `document_access_logs` ·
`company_profile`

Kedelapan tabel ini **RLS-nya sudah ENABLED**, hanya tak punya policy sama sekali.
(Nol tabel di seluruh skema yang RLS-nya off — jadi ini bukan tabel yang "terlewat
di-enable", tapi tabel yang di-enable lalu tak pernah diberi policy.)

**Kenapa berbahaya:** rencana T5 menambah satu policy `AS RESTRICTIVE` per tabel,
mengandalkan PERMISSIVE existing untuk axis role. Postgres meng-AND restrictive
dengan **hasil OR seluruh permissive**. Kalau permissive-nya **nol**, hasil OR =
FALSE, dan `FALSE AND apa pun` = FALSE → tabel jadi **tak terbaca sama sekali**.

**Dibuktikan empiris, bukan disimpulkan dari dokumentasi** (`t1-verify.mjs`,
tabel probe + role `authenticated` = jalur yang sama dipakai RLS nyata):

| Kondisi | Baris terlihat |
|---|---:|
| RLS on, nol policy | **0** |
| \+ `AS RESTRICTIVE ... USING (true)` | **0** ← restrictive saja tak pernah membuka |
| \+ `PERMISSIVE ... USING (true)` | **2** ← baru terbuka |

Hari ini tak terasa karena API pakai `service_role` (bypass total). Ia baru meledak
persis di T5c — tahap yang paling tidak boleh meledak.

**Aksi:** T5a wajib didahului sub-langkah **T5a-0**: pastikan tiap tabel punya
minimal satu policy permissive dasar berbasis permission. Ditambahkan ke ADR §9.

Catatan: `company_profile` tidak perlu diperbaiki — ia dibuang di T4 (§5 D).

---

## 8. Apa yang TIDAK diverifikasi di T1 (jujur, batas audit ini)

1. **Kebenaran semantik klasifikasi domain** (§5) — struktur FK bisa dibuktikan
   mekanis; "apakah `suppliers` sebaiknya bersama atau per-tenant" adalah keputusan
   produk. Saya memilih AB (bersama + boleh timpa) mengikuti keputusan founder D5.
   Kalau founder menghendaki supplier **selalu** privat, `suppliers` pindah A B → B.
2. **Data lintas-tenant yang sudah tercampur** — tidak relevan hari ini (satu tenant),
   tapi berarti backfill T3 belum diuji pada kasus ambigu. Itu tugas Dokumen Audit
   Pra-Eksekusi T3.
3. **Perilaku 719 call-site** terhadap klasifikasi ini — T4.
4. **Angka baris** adalah snapshot dev 2026-07-29, bukan produksi (produksi belum ada).

---

## 9. Koreksi yang harus masuk ke ADR-011

1. §7: "293 policy" → **198**.
2. §5: "±62 mewarisi" → **48 mewarisi aman; 9 tampak mewarisi tapi rantainya lemah**.
3. §9: tambah sub-langkah **T5a-0** (policy permissive dasar untuk 8 tabel §7).
4. §5: tambah aturan CHECK `assemblies.source` ↔ `company_id` (§5 AB).
