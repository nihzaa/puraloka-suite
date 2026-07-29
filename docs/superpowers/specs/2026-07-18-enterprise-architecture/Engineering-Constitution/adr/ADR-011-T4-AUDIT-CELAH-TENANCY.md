# T4 — Audit Celah Isolasi Tenant (temuan audit keamanan 2026-07-29)

**Status:** 🔴 **T4 BELUM SELESAI.** Dokumen ini mengoreksi klaim saya sendiri
sebelumnya bahwa T4 "sebagian besar selesai".
**Metode:** audit keamanan menyeluruh seluruh `apps/api/src/routes/v1/*.ts` +
`apps/api/src/utils/*.ts`, dijalankan terpisah dari yang mengerjakan migrasinya.

> **Kenapa dokumen ini ada:** saya memigrasi ±160 call-site dan melaporkan "kebocoran
> besar sudah ditutup". Audit independen menemukan permukaan yang jauh lebih luas —
> termasuk **dua kelas cacat yang tidak akan tertutup oleh migrasi call-site sama
> sekali** (§3). Melaporkan progres tanpa dokumen ini akan menyesatkan.

---

## 0. Ringkasan

| | |
|---|---|
| Sudah dimigrasi | ±160 call-site, 25 file |
| **Masih bocor** | **478 akses `supabase` mentah** di routes (dari 584 awal) |
| Kelas cacat yang **tak tertutup migrasi call-site** | **2** (§3) — butuh perubahan data/fungsi DB |
| Modul yang seluruh filenya belum tersentuh scoping | `clients` · `audit` · `users` · `roles` · `settings` · `estimate-versions` · `documents` · `termin-payment` · `lessons-learned` |

**Kesimpulan jujur:** yang selesai adalah **fondasi** (wrapper, peta, penegak,
gerbang di jalur yang sudah disentuh). Yang belum: mayoritas permukaan API.

---

## 1. Empat pola cacat yang berulang

| Pola | Bentuk | Kenapa lolos |
|---|---|---|
| **(a)** | `project_id` dari URL/body dipakai langsung menyaring tabel kategori C | Terlihat "sudah difilter" — padahal filternya milik penyerang |
| **(b)** | `.eq('id', id)` tanpa saringan tenant sama sekali | Paling banyak. Jalur by-id tak punya `project_id` untuk difilter, jadi mudah terlewat |
| **(c)** | Agregat lintas-proyek tanpa filter apa pun | Dulu benar (satu tenant), sekarang salah |
| **(d)** | Menerima id entitas anak (`invoice_id`, `mr_id`, `scope_id`, `assignment_id`) tanpa memverifikasi rantai sampai `projects` | Rantai FK-nya panjang; verifikasinya butuh ≥1 query tambahan |

**Jalur TULIS sama berbahayanya dengan baca** — dan lebih sering terlewat.
Menulis ke proyek tenant lain mencemari datanya secara permanen.

---

## 2. Temuan per modul — KRITIS

Diurutkan dari yang paling merugikan bila dieksploitasi.

### 2.1 `settings.ts` — konfigurasi finansial DIPAKAI BERSAMA semua tenant
Seluruh endpoint (`/settings/company`, `/config`, `/finance`, `/project-defaults`,
`/kasbon-limit`) query `.limit(1).single()` atau `.eq('key', …)` **tanpa
`company_id`**. Artinya semua tenant berbagi **satu baris** `company_profile`,
`company_settings`, dan `financial_config`.

**Ini bukan kebocoran baca — ini korupsi data aktif.** Tenant A mengubah tarif
PPN, syarat denda, prefix invoice, atau rekening bank akan **menimpa milik tenant
B**. Nilai invoice tenant B ikut berubah.

### 2.2 `approval-chains.ts` + `utils/approval.ts` — rantai approval bersama
Query di-key hanya oleh `entity_type` (`'kasbon'`, `'change_order'`, …) **tanpa
menyaring `company_id`**. Tenant A mengubah/menghapus langkah approval akan
mengubah alur approval **semua tenant**, termasuk melumpuhkannya (fail-closed →
nol orang bisa approve di seluruh sistem).

> **KOREKSI terhadap laporan audit asli.** Audit menyatakan tabel ini "belum punya
> `company_id` sama sekali" dan menyebutnya cacat SKEMA. **Itu keliru** —
> diverifikasi langsung ke DB dev 2026-07-29: `approval_chains`, `approval_steps`,
> dan `approval_progress` **SUDAH punya `company_id`** (ditambahkan migration 127).
> Auditor tampaknya membaca migration pembuat tabelnya, bukan skema saat ini.
> Jadi ini **cacat call-site biasa** — bisa ditutup dengan `request.db`, tanpa
> migration baru. Temuan kebocorannya tetap sah; klasifikasi penyebabnya yang
> salah.

### 2.3 `notification-routing.ts` + `notifications.ts` — kebocoran AKTIF
`usersWithRoles`/`usersWithPermissions` meresolusi penerima **lintas semua tenant**.
Digabung `check-deadlines`/`check-milestones` yang query `termin_schedules`/
`projects`/`kasbons`/`invoices` tanpa filter tenant → **admin tenant A menerima
notifikasi dan email berisi nama proyek, nomor invoice, nominal, dan nama mandor
tenant B.** Ini mendorong data keluar, bukan menunggu diminta.

### 2.4 `finance.ts` — modul paling sensitif, sebagian besar masih terbuka
Yang sudah ditutup: dashboard, AR aging, DP recoupment, arus kas.
Yang **masih bocor**: `GET /finance/invoices` · `/payments` · `/kasbon-summary` ·
`/kasbons` · `/profitability` (semua pola c) · `POST /finance/invoices` (membuat
invoice di proyek tenant lain) · `PATCH /invoices/:id/status` · `POST
/invoice/:id/pay` (mencatat pembayaran + upload bukti ke folder tenant lain) ·
`PATCH /invoice/:id/waive-penalty` (memutihkan denda tenant lain).

### 2.5 `users.ts` + `roles.ts` — mendekati account-takeover
`PATCH /users/:id` dan `/toggle-active`: `.eq('id', id)` tanpa cek keanggotaan
company → **admin tenant A mengubah role atau menonaktifkan akun user tenant B.**
`roles.ts` `PATCH`/`DELETE`/`PUT /:id/permissions`: role custom tenant A bisa
diedit/dihapus oleh tenant B.

### 2.6 `clients.ts` — seluruh file, termasuk PII
Semua endpoint raw `supabase` tanpa scoping, padahal `clients` kategori **B**.
Tenant A melihat/mengedit/menonaktifkan klien tenant B — termasuk NPWP, telepon,
alamat, email.

### 2.7 `audit.ts` — jejak audit lintas-tenant
`GET /audit` tanpa scoping: admin tenant A membaca seluruh audit trail semua
tenant, termasuk diff finansial (nilai kontrak, waive denda, perubahan role).

### 2.8 `documents.ts` — file, bukan sekadar baris
`GET /projects/:projectId/documents` tanpa `proyekMilikTenant`. Karena `file_url`
adalah **signed URL berlaku 10 tahun**, ini membocorkan akses file langsung ke
kontrak/SPK/berita acara tenant lain. `POST .../upload` menulis ke folder storage
tenant lain; `PATCH`/`DELETE .../:documentId` mengubah/menghapus dokumennya.

### 2.9 `estimate-versions.ts` — seluruh modul CECEP estimasi
±15 endpoint, **tidak satu pun** memverifikasi kepemilikan terhadap
`scenario_id`/`estimate_version_id`/`item_id`.

### 2.10 `change-orders.ts` · `termin-payment.ts` · `cash.ts`
CO: `approve` mengubah `projects.contract_value` — tenant A menyetujui CO tenant B
dan mengubah nilai kontraknya. · Termin: memverifikasi `termin.project_id ===
projectId` tapi tak pernah memverifikasi `projectId` milik tenant. · Cash:
`POST /cash/expenses` auto-approve ke proyek tenant lain + upload nota ke
foldernya.

---

## 3. DUA CACAT YANG TIDAK AKAN TERTUTUP OLEH MIGRASI CALL-SITE

Ini yang paling penting dari audit, dan yang paling mudah terlewat kalau hanya
mengejar angka ratchet turun.

1. **Config de-facto single-row** (§2.1) — **terverifikasi di DB dev**:
   `company_settings` 5 baris / **1 company**, `financial_config` 9 baris /
   **1 company**, `company_profile` 1 baris tanpa kolom company sama sekali.
   Kolom `company_id` ADA di dua yang pertama (kategori B), tapi seluruh kode
   membacanya dengan `.limit(1)` / `.eq('key', …)` tanpa menyaringnya.
   **Memigrasi call-site saja TIDAK CUKUP**: begitu query mulai menyaring
   `company_id`, tenant kedua membaca **nol baris** dan jatuh ke fallback statis
   diam-diam — tarif pajak salah tanpa ada yang tahu. Datanya harus digandakan
   per tenant lebih dulu, atau pembacaannya harus fail-loud saat kosong.

2. **`auth_client_id()` tanpa saringan company** (ADR-011 §10 R5, diverifikasi
   terpisah dari kode migration 049:23-28). Fungsi DB, bukan call-site.

3. ~~`approval_chains` tak punya `company_id`~~ — **KLAIM AUDIT SALAH**, lihat
   koreksi di §2.2. Kolomnya ada sejak migration 127; ini cacat call-site biasa.
   Dicatat di sini justru sebagai pengingat: **temuan audit pun wajib
   diverifikasi ke sumber, bukan diteruskan apa adanya.**

---

## 4. Apa artinya untuk urutan tahap

**T5 (RLS) TIDAK BOLEH dimulai sebelum §3 selesai.** Alasannya bukan kerapian:
RLS akan menegakkan `company_id` di lapis DB, dan tabel yang `company_id`-nya
tidak ada (§3.1) atau tidak terisi per-tenant (§3.2) akan **mati total** begitu
policy aktif — persis kelas kegagalan T1-F3 (restrictive tanpa permissive).

Urutan yang benar:
1. **T4g** — gandakan `company_settings`/`financial_config` per tenant (atau
   buat pembacaannya fail-loud saat kosong) + perbaiki `auth_client_id()`.
   Menyentuh data → **Red-Line, butuh Dokumen Audit Pra-Eksekusi + ack founder.**
2. **T4h** — tutup pola (b) dan (d) di seluruh jalur by-id. Terbesar sisanya.
3. **T4i** — turunkan ratchet ke mendekati nol, lalu ubah jadi lint error.
4. Baru **T5**.

---

## 5. Yang sudah benar (pola rujukan)

`search.ts` (wrapper + `hasPermission` + `unsafe()` beralasan) · bagian utama
`projects.ts` · `dashboard.ts` · `ahsp.ts POST /cecep/assemblies` (mengisi
`company_id` eksplisit) · bagian `finance.ts` yang memakai `db.projectIds()`.
Pakai ini sebagai template, bukan menulis pola baru.

---

## 6. Batas audit ini

- Audit **membaca kode**, tidak menjalankan eksploit. Tiap temuan perlu
  dikonfirmasi ulang saat diperbaiki (beberapa mungkin sudah tertutup oleh gate
  role/permission yang ada).
- Tidak mencakup `apps/web` (frontend) — kalau ada query langsung dari browser,
  itu permukaan terpisah.
- Tidak mencakup Storage policy (bucket) selain yang tersirat di §2.8.
- Angka 478 adalah **baris ber-`supabase` mentah**, bukan jumlah kerentanan;
  sebagian di antaranya aman (tabel kategori A, atau sudah ada gate lain).


---

## 11. Ronde kedua — audit VERIFIKASI ULANG (2026-07-29 sore)

Audit kedua dijalankan **setelah** perbaikan ronde pertama, oleh agen terpisah,
untuk memeriksa mana yang benar-benar tertutup. Ia menemukan **pola yang saya
lewatkan secara sistematis**, bukan sekadar sisa acak.

### 11.1 Pola yang terlewat: "gerbang di GET, hilang di PATCH/DELETE"

Berulang identik di **empat** modul terpisah: `milestones` · `change-orders` ·
`estimate-versions` · `mandor`. Penyebabnya cara kerja saya sendiri: memperbaiki
**endpoint-demi-endpoint** mengikuti daftar temuan, bukan **file-demi-file
dengan checklist**. Endpoint baca lebih menonjol di laporan audit, jadi jalur
tulis di file yang sama ikut terlewat.

**Yang ditutup di ronde kedua (19 endpoint tulis):**

| Modul | Endpoint | Kalau tidak ditutup |
|---|---|---|
| `mandor` | PATCH/DELETE `work-scopes/:id` | ubah/hapus pekerjaan proyek tenant lain — **nol pengecekan apa pun**, bahkan role |
| `mandor` | PATCH `progress-payments/:id/confirm` | **uang keluar** dari pembukuan tenant lain |
| `mandor` | PATCH `worker-kasbons/:id/status` & `/cicilan` | ubah catatan utang tukang mereka |
| `mandor` | PATCH `assignments/:id`, DELETE `wage-reports/:id`, POST `work-scopes/:id/items` | mencemari data operasional mereka |
| `change-orders` | PATCH `/:id/approve` | **mengubah `contract_value`** proyek tenant lain |
| `change-orders` | GET/PUT/DELETE `/:id`, CRUD items, submit, reject | seluruh siklus CO |
| `estimate-versions` | GET `/:id`, GET `/:id/rollup`, DELETE `items/:itemId` | baca detail+item, hapus item estimasi mereka |
| `milestones` | PATCH/DELETE `/:milestoneId` | ubah/hapus milestone mereka |
| `lessons-learned` | submit/approve/reject | approve memicu write-back ke katalog **bersama** |
| `utils/approval.ts` | 4 fungsi | rantai approval dipakai bersama → tenant A **melumpuhkan** approval tenant B (fail-closed) |

### 11.2 Kesalahan berulang saya: urutan 403-sebelum-404

**Dua kali** saya memasang gerbang tenant SEBELUM gerbang izin, padahal kode
yang saya sunting memuat komentar eksplisit *"Gerbang KASAR sebelum fetch
entitas → urutan 403-sebelum-404"*. Test otorisasi menangkap keduanya.

Akar penyebabnya sama: **regex bulk-edit yang hanya cocok di 1 dari 2 handler**
(komentar di keduanya beda panjang). Pelajarannya: untuk penempatan yang
**urutannya bermakna**, bulk-edit tidak cukup — tiap lokasi harus dilihat.

### 11.3 Dua klaim audit yang SALAH (diverifikasi ke sumber)

1. *"`approval_chains` tak punya `company_id`"* → **kolomnya ADA** sejak
   migration 127. Auditor membaca migration pembuat tabel, bukan skema kini.
2. *"`POST /finance/invoices` tak pernah memanggil gerbang"* → **sudah pakai
   `request.db!`** sejak commit sebelumnya. Auditor membaca keadaan lama.

Dicatat bukan untuk mendiskreditkan auditnya — sisanya akurat dan berharga —
tapi sebagai aturan kerja: **temuan audit wajib diverifikasi ke sumber sebelum
ditindaklanjuti**, sama seperti temuan sendiri.

### 11.4 Ratchet mengukur apa (klarifikasi penting)

Angka ratchet **tetap 478** setelah ronde kedua. Itu BUKAN berarti tak ada
kemajuan: perbaikan ronde ini menambahkan **saringan** pada query yang sudah
ada, bukan memindahkannya ke wrapper. **Ratchet mengukur adopsi wrapper, bukan
cakupan gerbang.** Keduanya metrik berbeda dan tidak boleh dikira sama —
kalau tertukar, "angka tidak turun" akan salah dibaca sebagai "tidak ada
perbaikan".

### 11.6 Status akhir: SELURUH temuan dua ronde audit DITUTUP (2026-07-29)

| Modul | Selesai |
|---|---|
| `procurement` | ✅ 11 titik — siklus MR/PO/GR + 3 jalur create ber-id-dari-body + dashboard KPI |
| `roles` GET list & `/:id/permissions` · `auth` register | ✅ |
| `notifications` cabang wage-report + `check-deadlines` | ✅ |
| `settings` + `finance` — `company_profile` | ✅ **ternyata bukan Red-Line** (lihat bawah) |

**`company_profile` — perkiraan saya salah, dan itu menguntungkan.** Saya sempat
merencanakan Dokumen Audit Pra-Eksekusi + ack founder karena mengira butuh
menggandakan data per tenant. Diverifikasi ke DB lebih dulu: **migration 126
sudah menyalin seluruh isinya ke `companies`** — nol kolom hilang, nol nilai
berbeda (dibandingkan kolom-per-kolom). Jadi cukup perubahan **kode**: baca/tulis
ke `companies` yang memang ter-scope. Nol migrasi data, nol sentuhan data
existing, tak perlu ack.

Pelajarannya: **verifikasi ke sumber sebelum mengeskalasi**, bukan hanya sebelum
mengerjakan. Kalau saya langsung menyiapkan dokumen Red-Line, founder akan
diminta menyetujui sesuatu yang sebenarnya tak berisiko.

### 11.5 Yang MASIH terbuka setelah ronde kedua ~~(sudah ditutup — lihat §11.6)~~

- **`procurement.ts`** — siklus MR/PO/GR (submit/approve/reject/cancel/confirm),
  dashboard KPI lintas-tenant. **Belum dikerjakan.**
- **`settings.ts` `company_profile`** — profil perusahaan (nama, alamat, **nomor
  rekening bank**, logo, prefix invoice) dipakai bersama semua tenant; PUT satu
  tenant menimpa yang dipakai tenant lain **termasuk di PDF invoice mereka**.
  → butuh Dokumen Audit Pra-Eksekusi + ack founder (menyentuh data).
- **`roles.ts` GET list & GET `/:id/permissions`** · **`auth.ts` register**
  (`roles.name` UNIQUE global → role custom tenant lain bisa dirujuk).
- **`notifications.ts`** cabang `approve_wage_report` di `/:id/action`, dan
  `check-deadlines` yang membaca invoice/termin lintas tenant.
- **`estimate-versions` GET detail** — sudah ditutup di ronde ini, tapi modul
  CECEP lain belum diaudit ulang.


---

## 12. Ronde ketiga — audit final sebelum merge (2026-07-29 malam)

Dijalankan sebagai **verifikasi akhir**, bukan karena ada dugaan sisa. Ia
menemukan **19 celah lagi** — dan yang penting: **satu KELAS celah** yang dua
ronde sebelumnya tak sentuh sama sekali.

### 12.1 Kelas yang terlewat: id entitas datang dari BODY, bukan URL

Dua audit pertama (dan perbaikan saya) berfokus pada pola `.eq('id', param)` —
id dari URL. Akibatnya seluruh **jalur create** yang menyebut `project_id`,
`work_scope_id`, atau `assignment_id` **di body** lolos tanpa pernah diperiksa.

Yang paling berbahaya di antaranya: **`POST /mandor/assignments`**. Ia akar
subsistem mandor — `work_scopes`, `kasbons`, `weekly_wage_reports`,
`progress_payments`, dan `borongan_settlements` **semuanya** mewarisi tenancy
dari `mandor_assignments.project_id`. Satu celah di sini mencemari seluruh
rantai turunannya di pembukuan perusahaan lain, dan tak satu pun endpoint
turunan itu bisa mendeteksinya (mereka menyaring dengan benar — barisnya
memang "sah" menurut kolomnya).

### 12.2 Celah paling halus: gerbang benar, query salah

`PATCH /projects/:projectId/documents/:documentId` **sudah** memanggil
`proyekMilikTenant(request, projectId)` — gerbangnya ada dan benar. Tapi
`UPDATE`-nya hanya menyaring `documentId`:

```js
.update(updateFields).eq('id', documentId)   // tanpa .eq('project_id', projectId)
```

Artinya penyerang yang **memang punya satu proyek sah** lolos gerbang, lalu
menyebut `documentId` milik tenant lain dan tetap memutasinya.

**Pelajaran yang berlaku umum:** gerbang di parameter URL **tidak** membatasi
baris mana yang dimutasi. Saringan wajib ada **di query yang memutasi**, bukan
hanya di pemeriksaan sebelumnya.

### 12.3 Rekap tiga ronde

| Ronde | Temuan | Kelas yang ditemukan |
|---|---:|---|
| 1 | ±30 | agregat tanpa filter · by-id tanpa saringan · config dipakai bersama |
| 2 | ±25 | gerbang di GET hilang di PATCH/DELETE (4 modul) |
| 3 | 19 | **id dari BODY** · gerbang benar tapi query mutasi tak disaring |

Total ±74 celah di ±60 endpoint. Ratchet: 584 → **468**.

### 12.4 Kenapa tiga ronde, dan apakah ronde keempat perlu

Tiap ronde menemukan **kelas berbeda**, bukan sisa acak dari ronde sebelumnya —
itu tanda audit berhenti menemukan hal baru bukan karena habis, tapi karena
lensanya sama. Ronde 3 memakai instruksi yang eksplisit menyebut "id dari
body/params" sebagai pola yang dicari, dan itulah yang menemukan kelas baru.

Ronde keempat **layak dijalankan setelah T5 (RLS)**, dengan lensa berbeda lagi:
saat itu RLS jadi lapis kedua, dan yang perlu diuji adalah apakah dua lapis itu
benar-benar independen (uji kill-switch P2), bukan lagi mencari celah call-site.
