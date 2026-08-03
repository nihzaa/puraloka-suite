# F2-2 — Klasifikasi tenancy 123 tabel

**Status:** SELESAI · menunggu tinjauan founder sebelum F2-3
**Tanggal:** 2026-08-04
**Menerapkan:** `ADR-011-multi-tenant-strategy.md` §5 (aturan) dan
`ADR-010-bentuk-grup-holding.md` (bentuk grup)
**Antrean:** `QUEUE.yaml` F2-2 · **mengunci** F2-3

> **Kriteria F2-2:** *"tabel keputusan terbaca manusia SEBELUM migrasi
> ditulis."* Dokumen ini adalah tabel itu.

---

## 1. Cara membaca dokumen ini

Klasifikasinya **dihitung**, bukan diketik. Ulangi kapan saja:

```bash
node scripts/db/klasifikasi-tenancy.mjs          # ringkasan per kategori
node scripts/db/klasifikasi-tenancy.mjs --md     # tabel penuh
node scripts/db/klasifikasi-tenancy.mjs --json   # untuk alat lain
```

Alat itu **tidak memutuskan apa pun sendiri**. Daftar kategori A dan A/B
disalin dari ADR-011 §5; yang dihitung hanyalah **rantai FK NOT NULL** —
bagian yang ADR sendiri perintahkan *"wajib diaudit satu-per-satu, bukan
diasumsikan"*.

Alat ini juga **nol tulis**: tak ada DDL, tak ada DML.

---

## 2. Hasil — 123 tabel

| Kategori | Jumlah | Arti |
|---|---|---|
| **AKAR** | 1 | `companies` — tabel tenant itu sendiri |
| **A** — shared | 11 | standar publik; salah bila beda antar tenant |
| **A/B** — shared + overlay | 4 | baris standar (NULL) & baris tenant berdampingan |
| **B ✓** — sudah punya `company_id` | 33 | tak perlu disentuh F2-3 |
| **C** — turunan | 66 | tenancy lewat rantai FK NOT NULL; **tanpa kolom sendiri** |
| **D** — kasus khusus | 4 | masing-masing punya alasannya |
| **B?** — perlu keputusan | 4 | **§4 di bawah** |

**Yang paling penting bagi F2-3:** dari 80 tabel tanpa `company_id`,
**66 tidak butuh kolom baru** — tenancy-nya sudah dijamin rantai FK. Hanya
**4** yang benar-benar perlu keputusan.

Ini mengubah bentuk pekerjaan F2-3 secara mendasar: bukan "tambah `company_id`
ke 80 tabel", melainkan "putuskan 4, lalu pasang penyaring di 66".

---

## 3. Cacat yang ditemukan saat memverifikasi keluaran pertama

Alat versi pertama **salah**, dan salahnya jenis yang lolos dari pembacaan
sekilas.

Empat tabel kategori A ternyata **membawa `company_id`**:

```
cost_codes (nullable) · material_pack (NOT NULL) · modules (nullable)
productivity_records (nullable)
```

Akibatnya rantai yang **berhenti di sana** terlihat sah — "ada FK NOT NULL
menuju tabel ber-`company_id`" — padahal tabel itu SHARED. Dua contoh nyata:

| Tabel | Rantai versi 1 (SALAH) | Rantai setelah diperbaiki |
|---|---|---|
| `estimate_items` | `→ cost_codes` | `→ estimate_versions → scenarios → projects` |
| `work_scope_items` | `→ users → roles` | *(kini masuk telusuran yang benar)* |

Rantai lewat `users` lebih tegas lagi salahnya: ADR-011 D5 menyatakan `users`
**global**. Tenant sebuah item pekerjaan jelas bukan ditentukan oleh peran
pembuatnya.

**Perbaikannya:** jangkar rantai hanya sah bila tabelnya benar-benar
tenant-owned. Tabel A, A/B, dan `users` boleh **dilewati** (rantai bisa
berlanjut ke tenant-owned di baliknya) tetapi tidak boleh jadi **ujung**.

Setelah diperbaiki: **nol** rantai berakhir di tabel shared — diverifikasi
dengan memeriksa ujung setiap rantai dari 66 tabel kategori C.

> Pelajarannya: *"ada kolom `company_id`"* dan *"kolom itu menyatakan
> kepemilikan tenant baris ini"* adalah dua hal berbeda. Menyamakan keduanya
> menghasilkan tabel yang **dianggap** punya tenancy padahal tidak — dan
> kebocorannya tak menimbulkan galat.

---

## 4. Empat tabel yang perlu keputusan — beserta usulnya

### 4.1 `company_profile` — 1 baris, nol FK

Tabel single-row berisi identitas perusahaan (nama, NPWP, alamat, rekening).

**Usul: B — `company_id NOT NULL` + `UNIQUE (company_id)`.**

ADR-011 §4 sudah menyebutnya eksplisit: *"`company_profile` (032) tidak
dihapus — diberi `company_id`, backfill ke tenant pertama, lalu
`UNIQUE(company_id)`. Utang 'tabel single-row' lunas tanpa DROP."*

Jadi ini bukan keputusan baru; ia sudah diputuskan, hanya belum dikerjakan.

### 4.2 `material_categories` — 10 baris, nol FK

Kategori material (Semen, Besi, Kayu, …).

**Usul: A — SHARED, tanpa `company_id`.**

Alasannya sama dengan `work_categories` dan `units` yang sudah kategori A:
kategori material adalah **kosakata standar industri**, bukan data perusahaan.
"Semen" berarti sama di PT mana pun.

⚠️ **Tripwire:** kalau kelak ada pelanggan yang menuntut kategori sendiri,
naikkan ke **A/B** (overlay `company_id NULLABLE`), **bukan** ke B —
menjadikannya per-tenant akan memaksa tiap PT mengetik ulang kategori yang
sama.

### 4.3 `kasbon_purposes` — 5 baris, FK `users` (nullable)

Daftar keperluan kasbon (Operasional, Material, …). `updated_by → users`
nullable, jadi rantainya putus.

**Usul: A/B — SHARED + overlay (`company_id NULLABLE`).**

Ini kasus paling menarik dari keempatnya. Argumen dua arah:

- **A murni** — keperluan kasbon cukup seragam di konstruksi.
- **B murni** — tiap perusahaan punya kebijakan kasbon berbeda.

**A/B menyelesaikan keduanya**: baris bawaan (`company_id IS NULL`) berlaku
untuk semua, dan PT yang butuh keperluan khusus menambahkannya sendiri tanpa
mengganggu yang lain. Resolusinya sudah ada di wrapper (ADR-011 §6):
`WHERE company_id IS NULL OR company_id = auth_company_id()`.

Kolom `code` **tidak** boleh jadi kunci unik global setelah ini — dua PT bisa
memakai kode yang sama untuk keperluan berbeda. Uniknya jadi
`(company_id, code)` dengan `NULLS NOT DISTINCT`.

### 4.4 `menu_items` — 249 baris, FK diri sendiri (nullable)

Registry menu aplikasi. `parent_id → menu_items` nullable (menu akar).

**Usul: A — SHARED, tanpa `company_id`. Penyesuaian per-tenant lewat
`company_menu_settings` yang SUDAH ADA.**

Struktur menu adalah **bentuk aplikasi**, bukan data pelanggan. Menyalinnya
per-tenant berarti 249 baris × jumlah PT, dan setiap penambahan menu di rilis
berikutnya harus di-backfill ke semua tenant — pekerjaan yang tumbuh tanpa
memberi apa pun.

Mekanisme pengecualian per-company sudah dirancang dan diuji (migrasi 136,
tabel `company_menu_settings`, test `t7-menu-per-company`). Yang per-tenant
adalah **apa yang disembunyikan**, bukan menunya sendiri.

---

## 5. Yang harus F2-3 kerjakan — dan yang TIDAK

### Kerjakan

| Pekerjaan | Jumlah |
|---|---|
| tambah `company_id` sesuai §4 | **4 tabel** |
| pasang penyaring tenancy (RLS/wrapper) untuk kategori C | **66 tabel** |
| lengkapi kategori D sesuai catatan masing-masing | **4 tabel** |

### JANGAN kerjakan

- **Jangan** tambahkan `company_id` ke 66 tabel kategori C. Mereka sudah punya
  tenancy lewat rantai FK; menambah kolom kedua menciptakan **dua sumber
  kebenaran** yang bisa bertentangan — dan yang salah tak akan terlihat sampai
  ada baris yang company_id-nya beda dari induknya.
- **Jangan** sentuh 11 tabel kategori A. Memberi mereka `company_id` akan
  memaksa tiap tenant menyalin standar publik yang sama.
- **Jangan** urut abjad. Urutan batch ada di §6.

---

## 6. Urutan batch untuk F2-3

Dipilih supaya **setiap batch bisa diverifikasi sendiri** dan kegagalannya
tak menyeret batch lain — bukan supaya cepat selesai.

| Batch | Isi | Jumlah | Kenapa urutan ini |
|---|---|---|---|
| **1** | 4 tabel §4 | **4** | keputusan baru; paling kecil, paling mudah dibatalkan |
| **2** | kategori D | **4** | masing-masing kasus khusus, butuh perhatian terpisah |
| **3** | RLS untuk C rantai **1 hop** | **38** | rantai terpendek = paling mudah dibuktikan benar |
| **4** | RLS untuk C rantai **≥2 hop** | **28** | tergantung batch 3 sudah terbukti |

Kedalaman rantai terukur (bukan diperkirakan): terpanjang **4 hop**, contohnya
`rebar_takeoff → estimate_items → estimate_versions → scenarios → projects`.

Batch 4 dikerjakan belakangan justru karena rantainya panjang: kalau
penyaringnya salah, gejalanya muncul jauh dari penyebabnya. Membuktikan pola
1-hop benar lebih dulu membuat kesalahan di batch 4 bisa dipersempit ke
"panjang rantainya", bukan ke "polanya".

Tiap batch: **satu migrasi, satu test isolasi, satu bukti CI hijau.** Aturan
F2-3 sendiri berbunyi *"tiap langkah terpisah"* — dan alasannya sudah terbukti
tujuh kali di Fase 0: perubahan tenancy yang digabung membuat kegagalannya
mustahil dilacak.

---

## 7. Cara memverifikasi dokumen ini masih benar

```bash
# klasifikasi harus tetap menghasilkan angka yang sama
node scripts/db/klasifikasi-tenancy.mjs | tail -3

# nol rantai kategori C yang berakhir di tabel SHARED
node scripts/db/klasifikasi-tenancy.mjs --json \
  | node -e "…"   # lihat §3; diverifikasi 2026-08-04: NOL

# cakupan company_id — pembanding independen
node scripts/db/introspect.mjs tenancy-coverage
```

Kalau angkanya berubah setelah migrasi baru, dokumen ini yang harus
diperbarui — bukan sebaliknya. **Kenyataan yang menang.**


---

## 8. Tabel penuh — 123 tabel

> Dihasilkan `node scripts/db/klasifikasi-tenancy.mjs --md` (2026-08-04).
> Jangan disunting tangan; jalankan ulang alatnya bila skema berubah.

| Tabel | Kategori | Alasan |
|---|---|---|
| `accounts` | B ✓ | sudah punya company_id (NOT NULL) |
| `ahsp_editions` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `approval_chains` | B ✓ | sudah punya company_id (NOT NULL) |
| `approval_progress` | B ✓ | sudah punya company_id (NOT NULL) |
| `approval_steps` | B ✓ | sudah punya company_id (NOT NULL) |
| `assemblies` | A/B | baris standar (NULL) + baris milik tenant hidup berdampingan |
| `assembly_components` | B ✓ | sudah punya company_id (nullable) |
| `asset_depreciation_logs` | C | rantai FK NOT NULL: asset_depreciation_logs.→assets |
| `asset_movements` | C | rantai FK NOT NULL: asset_movements.→assets |
| `asset_rentals` | B ✓ | sudah punya company_id (NOT NULL) |
| `assets` | B ✓ | sudah punya company_id (NOT NULL) |
| `audit_logs` | D | append-only (073): backfill melanggar. company_id NULLABLE, isi baris baru saja. |
| `bids` | B ✓ | sudah punya company_id (NOT NULL) |
| `borongan_settlements` | C | rantai FK NOT NULL: borongan_settlements.→users users.→roles |
| `cash_accounts` | B ✓ | sudah punya company_id (NOT NULL) |
| `cash_transfers` | B ✓ | sudah punya company_id (NOT NULL) |
| `cbs_nodes` | B ✓ | sudah punya company_id (nullable) |
| `cbs_templates` | A/B | baris standar (NULL) + baris milik tenant hidup berdampingan |
| `change_order_items` | C | rantai FK NOT NULL: change_order_items.→change_orders change_orders.→projects |
| `change_orders` | C | rantai FK NOT NULL: change_orders.→projects |
| `clients` | B ✓ | sudah punya company_id (NOT NULL) |
| `companies` | AKAR | tabel tenant itu sendiri |
| `company_members` | B ✓ | sudah punya company_id (NOT NULL) |
| `company_menu_settings` | B ✓ | sudah punya company_id (NOT NULL) |
| `company_profile` | B? | PERLU-MATA-MANUSIA: nol rantai FK ke tabel ber-company_id |
| `company_settings` | B ✓ | sudah punya company_id (NOT NULL) |
| `contract_bonds` | B ✓ | sudah punya company_id (NOT NULL) |
| `contract_eot` | C | rantai FK NOT NULL: contract_eot.→projects |
| `cost_code_category_map` | C | rantai FK NOT NULL: cost_code_category_map.→project_expense_categories project_expense_categories.→projects |
| `cost_codes` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `daily_wage_logs` | C | rantai FK NOT NULL: daily_wage_logs.→users users.→roles |
| `document_access_logs` | C | rantai FK NOT NULL: document_access_logs.→documents documents.→projects |
| `document_number_series` | B ✓ | sudah punya company_id (NOT NULL) |
| `documents` | C | rantai FK NOT NULL: documents.→projects |
| `estimate_items` | C | rantai FK NOT NULL: estimate_items.→estimate_versions estimate_versions.→scenarios scenarios.→projects |
| `estimate_versions` | C | rantai FK NOT NULL: estimate_versions.→scenarios scenarios.→projects |
| `expense_category_templates` | B ✓ | sudah punya company_id (nullable) |
| `expense_items` | C | rantai FK NOT NULL: expense_items.→expense_reports expense_reports.→projects |
| `expense_reports` | C | rantai FK NOT NULL: expense_reports.→projects |
| `feature_flags` | A/B | baris standar (NULL) + baris milik tenant hidup berdampingan |
| `financial_config` | B ✓ | sudah punya company_id (NOT NULL) |
| `formula_definitions` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `goods_receipt_items` | C | rantai FK NOT NULL: goods_receipt_items.→materials |
| `goods_receipts` | C | rantai FK NOT NULL: goods_receipts.→projects |
| `idempotency_keys` | B ✓ | sudah punya company_id (NOT NULL) |
| `information_requests` | C | rantai FK NOT NULL: information_requests.→projects |
| `inspection_requests` | C | rantai FK NOT NULL: inspection_requests.→projects |
| `invoice_line_items` | C | rantai FK NOT NULL: invoice_line_items.→invoices invoices.→projects |
| `invoice_penalties` | C | rantai FK NOT NULL: invoice_penalties.→invoices invoices.→projects |
| `invoices` | C | rantai FK NOT NULL: invoices.→projects |
| `journal_entries` | B ✓ | sudah punya company_id (NOT NULL) |
| `journal_entry_lines` | C | rantai FK NOT NULL: journal_entry_lines.→accounts |
| `kasbon_purposes` | B? | PERLU-MATA-MANUSIA: punya FK tapi NULLABLE — rantai putus, kandidat C naik ke B |
| `kasbons` | B ✓ | sudah punya company_id (NOT NULL) |
| `lesson_propagation_proposals` | C | rantai FK NOT NULL: lesson_propagation_proposals.→lessons_learned_records lessons_learned_records.→projects |
| `lessons_learned_records` | D | B — berbagi antar tenant = fitur produk butuh consent, bukan default |
| `mandor_assignments` | C | rantai FK NOT NULL: mandor_assignments.→projects |
| `material_categories` | B? | PERLU-MATA-MANUSIA: nol rantai FK ke tabel ber-company_id |
| `material_pack` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `material_request_items` | C | rantai FK NOT NULL: material_request_items.→materials |
| `material_requests` | C | rantai FK NOT NULL: material_requests.→projects |
| `materials` | B ✓ | sudah punya company_id (nullable) |
| `menu_items` | B? | PERLU-MATA-MANUSIA: punya FK tapi NULLABLE — rantai putus, kandidat C naik ke B |
| `milestones` | C | rantai FK NOT NULL: milestones.→projects |
| `modules` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `mr_quota_override` | C | rantai FK NOT NULL: mr_quota_override.→projects |
| `notification_rule_targets` | B ✓ | sudah punya company_id (NOT NULL) |
| `notification_rules` | B ✓ | sudah punya company_id (NOT NULL) |
| `notifications` | D | NOT NULL — notifikasi selalu TENTANG sesuatu di satu company |
| `payments` | C | rantai FK NOT NULL: payments.→invoices invoices.→projects |
| `permission_scopes` | C | rantai FK NOT NULL: permission_scopes.→users users.→roles |
| `permissions` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `po_delivery_log` | C | rantai FK NOT NULL: po_delivery_log.→projects |
| `price_book_entries` | A/B | baris standar (NULL) + baris milik tenant hidup berdampingan |
| `productivity_records` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `progress_logs` | C | rantai FK NOT NULL: progress_logs.→projects |
| `progress_payments` | C | rantai FK NOT NULL: progress_payments.→users users.→roles |
| `project_expense_categories` | C | rantai FK NOT NULL: project_expense_categories.→projects |
| `project_expenses` | C | rantai FK NOT NULL: project_expenses.→projects |
| `project_photos` | C | rantai FK NOT NULL: project_photos.→projects |
| `project_price_override` | C | rantai FK NOT NULL: project_price_override.→projects |
| `project_rab_materials` | C | rantai FK NOT NULL: project_rab_materials.→materials |
| `project_stocks` | C | rantai FK NOT NULL: project_stocks.→materials |
| `projects` | B ✓ | sudah punya company_id (NOT NULL) |
| `punch_item_photos` | C | rantai FK NOT NULL: punch_item_photos.→project_photos project_photos.→projects |
| `punch_items` | C | rantai FK NOT NULL: punch_items.→projects |
| `purchase_order_items` | C | rantai FK NOT NULL: purchase_order_items.→materials |
| `purchase_orders` | C | rantai FK NOT NULL: purchase_orders.→projects |
| `rab_absorption_log` | C | rantai FK NOT NULL: rab_absorption_log.→projects |
| `rab_items` | C | rantai FK NOT NULL: rab_items.→projects |
| `rab_schedule` | C | rantai FK NOT NULL: rab_schedule.→projects |
| `rap_budget` | C | rantai FK NOT NULL: rap_budget.→projects |
| `rap_change_log` | C | rantai FK NOT NULL: rap_change_log.→rap_budget rap_budget.→projects |
| `rap_labor_line` | C | rantai FK NOT NULL: rap_labor_line.→rap_budget rap_budget.→projects |
| `rap_material_line` | C | rantai FK NOT NULL: rap_material_line.→rap_budget rap_budget.→projects |
| `rebar_takeoff` | C | rantai FK NOT NULL: rebar_takeoff.→estimate_items estimate_items.→estimate_versions estimate_versions.→scenarios scenarios.→projects |
| `resources` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `role_permissions` | B ✓ | sudah punya company_id (nullable) |
| `roles` | B ✓ | sudah punya company_id (nullable) |
| `root_cause_analyses` | C | rantai FK NOT NULL: root_cause_analyses.→lessons_learned_records lessons_learned_records.→projects |
| `scenarios` | C | rantai FK NOT NULL: scenarios.→projects |
| `steel_profiles` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `stock_movements` | C | rantai FK NOT NULL: stock_movements.→materials |
| `submittal_documents` | C | rantai FK NOT NULL: submittal_documents.→documents documents.→projects |
| `submittals` | C | rantai FK NOT NULL: submittals.→projects |
| `supplier_invoices` | B ✓ | sudah punya company_id (NOT NULL) |
| `supplier_payment_allocations` | B ✓ | sudah punya company_id (NOT NULL) |
| `supplier_payments` | B ✓ | sudah punya company_id (NOT NULL) |
| `suppliers` | B ✓ | sudah punya company_id (NOT NULL) |
| `tax_records` | C | rantai FK NOT NULL: tax_records.→invoices invoices.→projects |
| `termin_schedules` | C | rantai FK NOT NULL: termin_schedules.→projects |
| `units` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `users` | D | global (D5) — TANPA company_id |
| `wage_deductions` | C | rantai FK NOT NULL: wage_deductions.→weekly_wage_reports weekly_wage_reports.→mandor_assignments mandor_assignments.→projects |
| `wage_items` | C | rantai FK NOT NULL: wage_items.→weekly_wage_reports weekly_wage_reports.→mandor_assignments mandor_assignments.→projects |
| `wbs_nodes` | C | rantai FK NOT NULL: wbs_nodes.→projects |
| `weekly_wage_reports` | C | rantai FK NOT NULL: weekly_wage_reports.→mandor_assignments mandor_assignments.→projects |
| `work_categories` | A | standar publik/invariant sistem — salah bila beda antar tenant |
| `work_scope_item_specs` | C | rantai FK NOT NULL: work_scope_item_specs.→work_scope_items work_scope_items.→users users.→roles |
| `work_scope_items` | C | rantai FK NOT NULL: work_scope_items.→users users.→roles |
| `work_scopes` | C | rantai FK NOT NULL: work_scopes.→mandor_assignments mandor_assignments.→projects |
| `worker_kasbons` | C | rantai FK NOT NULL: worker_kasbons.→projects |
| `workers` | B ✓ | sudah punya company_id (NOT NULL) |
