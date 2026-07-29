# ADR-011 T9 — Rencana: L2 Penuh dari UI (kelola badan usaha tanpa SQL)

**Tanggal:** 2026-07-29
**Status:** ✅ SELESAI — dieksekusi 2026-07-29 (migrasi 137)
**Keputusan founder pada §3: OPSI B** — hanya pemilik grup. Rekomendasi saya
(Opsi A, permission baru) **tidak** dipakai; founder memilih yang lebih ketat.
**Prasyarat:** T7 selesai (PR #108, #109) — semua terpenuhi

---

## 1. Masalah yang ditutup

Program D (T0–T7) membuat sistem **secara arsitektur** siap menampung beberapa
badan usaha: `company_id` di 31 tabel, 79 policy RLS, penomoran dokumen
terpisah, switcher di topbar, menu per-company. Diverifikasi dengan simulasi
langsung di dev — badan usaha kedua dibuat, proyeknya terisolasi, nomor MR-nya
mulai dari 001 sendiri, dan katalog AHSP nasional 2.620 analisa tetap diwarisi.

**Tapi tak ada satu pun jalur di aplikasi untuk membuatnya.** Nol endpoint
`POST /companies`, nol endpoint kelola keanggotaan. Diverifikasi dengan
pencarian ke seluruh `routes/` — nihil.

Konsekuensi praktisnya: mendirikan PT/CV kedua hari ini butuh `INSERT` manual ke
database. Artinya bergantung pada orang yang paham SQL, tanpa jejak audit, tanpa
validasi, dan tanpa jaminan langkah-langkahnya lengkap (company dibuat tapi lupa
membuat keanggotaan = perusahaan yang tak bisa dimasuki siapa pun).

**Lingkup dokumen ini:** menutup jarak antara "arsitekturnya siap" dan "founder
bisa melakukannya sendiri". Ini melengkapi **L2**, bukan memulai L3 — lihat §6.

---

## 2. Yang sudah ada vs yang kurang

| Kemampuan | Status | Bukti |
|---|---|---|
| Isolasi data antar badan usaha | ✅ | 79 policy RLS + wrapper; uji kill-switch |
| Nomor dokumen terpisah per badan usaha | ✅ | migrasi 135; `MR-2026-001` di PT baru |
| Berpindah badan usaha di UI | ✅ | `CompanySwitcher` (PR #108) |
| Menu berbeda per badan usaha | ✅ | migrasi 136 |
| Katalog AHSP diwarisi badan usaha baru | ✅ | 2.620 analisa `company_id IS NULL` |
| Profil/logo/prefix invoice per badan usaha | ✅ | T4i |
| **Membuat badan usaha baru** | ❌ | nol endpoint |
| **Menambah/mencabut anggota** | ❌ | nol endpoint |
| **Mengatur badan usaha default seseorang** | ❌ | nol endpoint |
| **Permission untuk mengelola badan usaha** | ❌ | nol permission (lihat §3) |

---

## 3. SATU KEPUTUSAN YANG DIBUTUHKAN: siapa yang boleh membuat badan usaha?

Ini bukan pilihan teknis — ia menentukan siapa di organisasi Anda yang bisa
mendirikan entitas hukum baru di dalam sistem. Karena itu ditanyakan, bukan
diputuskan sendiri.

### Temuan yang membuat pertanyaan ini penting

Diverifikasi ke database:

1. **Nol permission yang menyerempet pengelolaan company.** Yang ada hanya
   `settings:manage` ("Mengedit profil dan pengaturan perusahaan") dan
   `settings:finance:manage`. Keduanya tentang mengedit perusahaan **yang sudah
   ada**, bukan membuat yang baru.

2. **`settings:manage` dipegang `admin` DAN `direktur`.** Kalau endpoint baru
   memakai permission ini, maka **direktur di PT anak bisa mendirikan badan
   usaha baru** atas nama grup. Hampir pasti bukan yang diinginkan.

3. **Semua permission bersifat per-company.** `has_permission()` dievaluasi
   dalam konteks company aktif. Tak ada konsep "permission lintas-grup" hari
   ini. Membuat badan usaha adalah tindakan **di atas** semua company —
   satu-satunya tindakan berkarakter demikian di sistem ini.

### Tiga opsi

| | Opsi A — permission baru `company:create` | Opsi B — hanya pemilik grup | Opsi C — pakai `settings:manage` |
|---|---|---|---|
| **Siapa yang bisa** | Role mana pun yang diberi permission itu (awalnya `admin` saja) | Hanya orang yang tercatat sebagai pemilik grup | `admin` + `direktur` (keduanya, sekarang) |
| **Konsisten ADR-004?** | Ya — capability, bukan jabatan | Perlu konsep baru (owner grup) di luar model permission | Ya, tapi maknanya melar |
| **Risiko** | Kalau permission diberikan ke role lain tanpa sadar, mereka bisa bikin badan usaha | Paling ketat; perlu tabel/kolom baru | **Direktur PT anak bisa bikin badan usaha baru** |
| **Usaha** | Kecil — pola yang sudah dipakai 89 permission lain | Sedang — model baru | Nol |

**Rekomendasi: Opsi A.** Alasannya bukan kenyamanan:
- ADR-004 mewajibkan kode memeriksa **capability**, bukan nama jabatan. Membuat
  badan usaha adalah capability yang berbeda dari mengedit profil, jadi ia layak
  punya key sendiri.
- Ia **reversibel dan terlihat**: siapa yang boleh diatur dari UI Roles, dan
  perubahannya tercatat. Opsi C menyembunyikan keputusan ini di dalam arti
  `settings:manage` yang sudah terlanjur luas.
- Awalnya diberikan **hanya ke `admin`** — jadi secara praktik hari ini sama
  dengan "hanya Anda", tapi tanpa mengunci keputusan itu ke dalam kode.

Opsi B lebih ketat, tapi ia memperkenalkan konsep "pemilik grup" yang belum ada
di model manapun — dan Opsi A bisa berkembang ke sana nanti tanpa membuang
pekerjaan.

### ✅ Keputusan founder 2026-07-29: **Opsi B**

Rekomendasi saya (Opsi A) tidak dipakai. Opsi B lebih ketat dan itu yang dipilih.

**Cara Opsi B diwujudkan** (migrasi 137) — tanpa tabel `group_owners` yang
sempat saya bayangkan:

- Grup **tidak** diberi tabel sendiri. `companies.parent_company_id` sudah ada
  (migrasi 126) dan sudah bermakna "induk"; grup = satu pohon yang akarnya
  `parent_company_id IS NULL`.
- Kepemilikan ditaruh di akar pohon: kolom `companies.owner_user_id`. Perusahaan
  anak mewarisi pemilik dari akarnya — tak ada dua sumber kebenaran.
- `is_group_owner(user_id)` → gerbang pendirian. Fail-closed.
- `company_group_root(company_id)` → naik ke akar, batas 10 tingkat agar siklus
  `parent_company_id` tak membuat query berputar selamanya.
- Backfill: akar yang sudah ada → `created_by` (jatuh ke admin aktif tertua bila
  kosong). Terverifikasi: Nizar tercatat pemilik grup.

Tabel `group_owners` ditolak karena ia entitas yang tak punya atribut selain
daftar pemilik — relasinya sudah terwakili pohon `parent_company_id`.

**Batas yang dijaga:** kepemilikan grup **bukan** gerbang akses data. Tidak ada
policy RLS yang membaca `owner_user_id` — pemilik grup tidak dengan sendirinya
bisa membaca data seluruh badan usaha. Ada test yang merah kalau suatu saat ada
policy semacam itu muncul.

---

## 4. Rencana kerja

Satu PR. Migrasi 137 + endpoint + UI.

### 4.1 Migrasi 137 — permission & jejak kepemilikan

- Permission baru: `company:create`, `company:members:manage`
  (+ deskripsi Indonesia, mengikuti pola 89 permission lain)
- Seed: keduanya ke role `admin` saja
- `companies.parent_company_id` **sudah ada** (migrasi 126) — dipakai menandai
  badan usaha anak dalam satu grup; tidak perlu kolom baru

### 4.2 Endpoint

| Method | Path | Permission | Catatan |
|---|---|---|---|
| `POST` | `/api/v1/companies` | `company:create` | Buat badan usaha + **otomatis jadikan pembuatnya anggota admin** |
| `GET` | `/api/v1/companies/:id/members` | `company:members:manage` | Daftar anggota badan usaha |
| `POST` | `/api/v1/companies/:id/members` | `company:members:manage` | Tambah anggota + role-nya di badan usaha itu |
| `PATCH` | `/api/v1/companies/:id/members/:userId` | `company:members:manage` | Ubah role / nonaktifkan |
| `PATCH` | `/api/v1/my/companies/:id/default` | *(pemilik akun sendiri)* | Set badan usaha default saya |

**Aturan yang WAJIB ditegakkan di `POST /companies`** — ini yang membuat jalur
UI lebih aman daripada SQL manual:

1. **Company + keanggotaan pembuat dibuat dalam SATU transaksi.** Kegagalan
   paling mungkin dari `INSERT` manual adalah membuat company lalu lupa
   keanggotaannya — hasilnya perusahaan yang tak bisa dimasuki siapa pun,
   termasuk pembuatnya. Endpoint harus mustahil menghasilkan keadaan itu.
2. **`code` divalidasi** terhadap `companies_code_format`
   (`^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`) dengan pesan berbahasa manusia, bukan
   melempar error constraint mentah.
3. **Tidak menyalin data apa pun** dari badan usaha lain. Badan usaha baru lahir
   kosong dan mewarisi katalog nasional lewat `company_id IS NULL` — itu sudah
   berjalan, tak perlu penyalinan.
4. **Audit log** — pembuatan badan usaha masuk `audit_logs`.

**Yang TIDAK dikerjakan:** menghapus badan usaha. Menghapus tenant berisi data
proyek/invoice/pembayaran adalah operasi yang tak bisa dibatalkan dan bukan
kebutuhan L2. Kalau salah buat, nonaktifkan (`is_active=false`) — dan itu pun
belum diperlukan sekarang.

### 4.3 UI — `/pengaturan/perusahaan`

Halaman baru, muncul hanya bagi pemegang `company:create`:
- Daftar badan usaha dalam grup + jumlah anggota masing-masing
- Tombol "Tambah badan usaha" → form (nama, nama badan hukum, kode, prefix
  invoice, NPWP opsional)
- Per badan usaha: kelola anggota (tambah user existing + pilih role, cabut)
- Setelah dibuat, tawarkan langsung "Pindah ke badan usaha ini" (memakai
  `CompanySwitcher` yang sudah ada)

**Catatan UI:** switcher di topbar sekarang muncul hanya bila user punya >1
badan usaha. Setelah badan usaha kedua dibuat, ia otomatis muncul — tanpa
perubahan kode.

### 4.4 Test

- `company:create` ditolak untuk role tanpa permission (403)
- Company + keanggotaan pembuat lahir bersama — **uji dengan menggagalkan di
  tengah**, pastikan tak ada company yatim tanpa anggota
- `code` duplikat/format salah ditolak dengan pesan yang bisa dibaca
- Badan usaha baru **tidak** melihat data badan usaha lain (isolasi tetap)
- Badan usaha baru **mewarisi** katalog AHSP nasional
- Nomor dokumen badan usaha baru mulai dari 001
- Anggota yang dicabut kehilangan akses (dan hilang dari `/my/companies`)

---

## 5. Temuan yang ditemukan saat merencanakan (dicatat, TIDAK dikerjakan di sini)

**`auth_role()` membaca `users.role_id`, bukan `company_members.role_id`.**

Kolom `company_members.role_id` sudah ada sejak migrasi 126 — niatnya jelas:
satu orang bisa punya peran berbeda di tiap badan usaha (mis. `admin` di CV
induk, `pm` di PT anak). Tapi `auth_role()` masih membaca role **global** dari
`users`, sehingga kolom per-company itu belum berpengaruh.

Hari ini tak bergejala (satu badan usaha, dan peran orang sama di mana-mana). Ia
menjadi masalah saat seseorang seharusnya punya wewenang berbeda di badan usaha
berbeda.

**Sengaja tidak dikerjakan dalam PR ini** karena mengubah `auth_role()`
menyentuh evaluasi otorisasi **seluruh sistem** — 89 permission, 218 policy —
dan itu perubahan yang layak berdiri sendiri dengan audit pra-eksekusinya
sendiri. Menyelipkannya ke PR pembuatan company berarti dua perubahan berisiko
dalam satu PR, dan kalau ada yang rusak sulit tahu yang mana.

Dicatat sebagai **T10** (kandidat), bukan pekerjaan tersembunyi.

---

## 6. Kenapa ini L2, bukan L3

Pembedaan yang mudah tertukar, dan penting supaya tidak terjadi *enterprise
theater* yang dilarang eksplisit oleh dokumen visi:

| | **L2 — dokumen ini** | **L3 / T8** |
|---|---|---|
| Penggunanya | Badan usaha milik grup sendiri | Kontraktor **lain** yang berlangganan |
| Yang membuat tenant | Founder, dari UI, sesekali | Pelanggan sendiri, kapan saja, tanpa Anda |
| Ancaman yang dijaga | Salah lihat data antar badan usaha sendiri | Pelanggan mencuri data pelanggan lain |
| Butuh billing? | Tidak | Ya |
| Butuh SLA & support? | Tidak | Ya |

Membuat badan usaha dari UI **tidak** membuat sistem ini SaaS. Ia hanya
memindahkan operasi yang hari ini butuh SQL ke tempat yang benar. Gerbang L3
(`docs/.../09-saas-and-tenancy-readiness.md` §3) tetap tertutup, dan syarat
pertamanya tetap: **pelanggan eksternal committed**.

---

## 7. Perkiraan

Satu PR: migrasi 137 (permission), 5 endpoint, satu halaman UI, ~8 test.
Setara dengan T6 atau T7 — bukan pekerjaan besar. Yang membuatnya berharga
bukan ukurannya, melainkan bahwa setelah ini mendirikan badan usaha kedua tidak
lagi butuh siapa pun yang bisa menulis SQL.
