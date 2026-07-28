# T4 — Audit Celah Isolasi Tenant (temuan audit keamanan 2026-07-29)

**Status:** 🔴 **T4 BELUM SELESAI.** Dokumen ini mengoreksi klaim saya sendiri
sebelumnya bahwa T4 "sebagian besar selesai".
**Metode:** audit keamanan menyeluruh seluruh `apps/api/src/routes/v1/*.ts` +
`apps/api/src/utils/*.ts`, dijalankan terpisah dari yang mengerjakan migrasinya.

> **Kenapa dokumen ini ada:** saya memigrasi ±160 call-site dan melaporkan "kebocoran
> besar sudah ditutup". Audit independen menemukan permukaan yang jauh lebih luas —
> termasuk **tiga kelas cacat yang tidak akan tertutup oleh migrasi call-site sama
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

## 3. TIGA CACAT YANG TIDAK AKAN TERTUTUP OLEH MIGRASI CALL-SITE

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
