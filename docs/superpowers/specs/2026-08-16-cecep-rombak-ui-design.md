# CECEP — Rombak UI & Alur Kerja (Estimasi/RAB/RAP)

> **Status:** spec, menunggu review founder sebelum kode ditulis.
> **Cabang:** `feat/cecep-ui-rombak` (worktree `.claude/worktrees/cecep-ui`)
> **Diminta founder 2026-08-16:** *"rombak lagi ui-ux dan alur kerja di modul
> cecep, masih kurang intuitif"* · *"rombak total dan buat lagi dengan visual
> terbaik, dari sisi UX pun mudah digunakan"* · *"sesuai standar ERP profesional
> dan dipakai di perusahaan konstruksi besar"*.

---

## 0. Article 6 CECEP Constitution — dijawab lebih dulu

Constitution mewajibkan tiap dokumen CECEP menjawab ini **sebelum** isinya
ditulis: *bagaimana ini membantu Tender/Estimating/AHSP/BOQ/RAB/RAP/Procurement/
Cashflow/Forecast/Knowledge/AI?*

Dokumen ini menyentuh **RAB, RAP, Estimating, AHSP, Cashflow, dan BOQ** — bukan
menambah kapabilitas baru, melainkan **membuat kapabilitas yang SUDAH ADA bisa
dipakai**. Bukti bahwa ia belum bisa dipakai ada di §1.

Article 7 (*apakah phase ini mengurangi ketidakpastian implementasi?*) dijawab
§4–§7: daftar berkas, rute, dan penjaga yang konkret.

---

## 1. Bukti — diukur, bukan dikira

Diukur 2026-08-16 lewat **sesi ber-login sungguhan** (Playwright, akun admin),
bukan dari membaca kode.

### 1a. Enam tab, empat di antaranya merender nol tabel

Tiap tab dibuka, lalu **dipilihkan proyek nyata**, lalu diukur ulang:

| Tab | `<table>` | Baris | Keadaan |
|---|---|---|---|
| Komposer | 0 | 0 | isinya **panduan "cara pakai"**, bukan alat kerja |
| Katalog AHSP | 0 | 0 | 3.043 analisa, daftar datar tanpa pengelompokan |
| Harga | 1 | 30 | ✅ **satu-satunya yang matang** — 3.212 harga |
| Material & RAP | 0 | 0 | **halaman putih**, tanpa empty state |
| Proyeksi Kas | 0 | 0 | kosong |
| Varians Biaya | 0 | 0 | kosong |

Memilih proyek **tidak** mengubah keempat tab kosong itu — tetap 0 tabel.

### 1b. Ketimpangan backend vs frontend

```
backend CECEP : 47 endpoint · 9 modul · 22 permission cecep:*
                3.043 analisa AHSP · 3.212 harga · 208 skenario · 2.221 versi
frontend CECEP: 1 halaman · 4.070 baris
```

Pembanding di repo yang sama: **procurement 13 halaman · keuangan 9 · gudang 6**.
Modul paling kompleks justru punya halaman paling sedikit.

### 1c. Data ADA — yang tak ada jalan masuknya

Dihitung langsung ke basis:

```
scenarios          208 baris   (3 milik company aktif)
estimate_versions  2.221       (5 milik company aktif)
estimate_items     2.417
rap_budget             1       ← yang benar-benar nyaris kosong
```

> **Koreksi yang perlu dicatat:** laporan awal saya menyebut *"nol skenario di
> seluruh 17 proyek"*. **Salah** — saya menguji 3 proyek pertama, ketiganya
> kebetulan kosong, lalu menggeneralisasi. Nol hasil dari sampel kecil bukan
> bukti ketiadaan.
>
> Koreksi ini **memperkuat** diagnosis, bukan melemahkan: skenario & versi
> TERPAKAI (208/2.221) tetapi UI tak menampilkan apa pun dari keduanya. Jadi ini
> murni kegagalan **lapis tampilan**, bukan "datanya belum ada".

### 1d. Halaman CECEP yang tercecer di menu lain

| Halaman | Rumah sekarang | Seharusnya |
|---|---|---|
| `pengaturan/markup` | Pengaturan | Estimasi (markup = keputusan estimasi) |
| `master/wbs` | Master Data | Master (tetap) — tapi ditautkan dari Estimasi |
| `mutu/pelajaran` | Mutu | Estimasi (lessons = write-back harga) |

---

## 2. Keputusan struktur — tab vs halaman

### 2a. Konflik dokumen yang harus diselesaikan

`ARAH-VISUAL-2026.md` menyebut estimasi **dua kali dengan arah berbeda**:

- **§6b:** *"estimasi · 7 tab · **tetap tab — tahapan satu alur kerja ✅**"*
- **§1c:** *"estimasi **3.713 baris** kini memegang rekor... Alasan itu mungkin
  masih benar; **ukurannya tidak lagi bisa diabaikan**. Ini **pekerjaan terbuka,
  bukan keputusan yang sudah turun**."*

Diukur hari ini: **4.070 baris** — naik dari 3.713, terus bertambah.

### 2b. Aturan §6a dijalankan jujur

> **Tab** = sudut pandang berbeda atas **data yang sama**
> **Halaman** = **entitas berbeda**
> Uji: *"kalau saya kirim tautan ini ke rekan, apa yang ia lihat?"*

| Isi tab | Entitasnya | Uji §6a |
|---|---|---|
| Katalog AHSP | master **nasional**, lintas proyek | entitas lain → **halaman** |
| Harga (price book) | master **perusahaan**, lintas proyek | entitas lain → **halaman** |
| Komposer (RAB) | dokumen **per proyek** | entitas lain → **halaman** |
| Material & RAP | anggaran **per proyek** | entitas lain → **halaman** |
| Proyeksi Kas | turunan RAB, per versi | turunan → **halaman** |
| Varians | realisasi vs anggaran | entitas lain → **halaman** |

Katalog AHSP nasional dan RAP satu proyek **bukan** dua sudut pandang atas data
yang sama. Menurut aturan founder sendiri, keduanya halaman.

### 2c. Keputusan

**Dipecah jadi halaman** — dan §6b diperbarui (bukan dilanggar diam-diam),
dengan mencatat alasannya: klasifikasi "tetap tab" dibuat saat ukurannya belum
terukur, dan §1c dokumen yang sama sudah menandainya *pekerjaan terbuka*.

Founder menyetujui arah ini 2026-08-16 (*"saya coba percaya denganmu, mulai
kerjakan"*), setelah melihat mockup.

---

## 3. Struktur baru

### 3a. Peta rute

```
/estimasi                    ← dashboard modul (KPI + jalan masuk)
├── /estimasi/rab            ← INTI: susun RAB per proyek  (Komposer)
├── /estimasi/rap            ← anggaran pelaksanaan + pagu
├── /estimasi/kas            ← proyeksi pencairan
├── /estimasi/varians        ← anggaran vs komitmen vs aktual
└── /estimasi/markup         ← dipindah dari /pengaturan/markup

/master/ahsp                 ← Katalog AHSP  (master nasional, dari tab katalog)
/master/harga                ← Price Book    (master perusahaan, dari tab harga)
```

**Kenapa Katalog & Harga pindah ke `/master`:** keduanya master data lintas
proyek, bukan pekerjaan per proyek. Menaruhnya di alur "susun RAB" adalah salah
satu sebab alurnya terasa berbelit — pengguna harus melewati dua layar master
sebelum sampai ke pekerjaannya. `peta-menu.ts` sudah menggolongkannya `md-*`
(master data), jadi pemindahan ini **menyelaraskan UI dengan taksonomi yang
sudah ada**, bukan menciptakan yang baru.

### 3b. Alur kerja yang terbaca

```
      MASTER (sekali siapkan)              KERJA PER PROYEK (harian)
  ┌─────────────┬─────────────┐   ┌──────┬──────┬──────┬─────────┐
  │ Katalog AHSP│  Price Book │ → │ RAB  │ RAP  │ Kas  │ Varians │
  └─────────────┴─────────────┘   └──────┴──────┴──────┴─────────┘
       /master/ahsp  /master/harga    ← /estimasi/* →
```

Ini yang sekarang tidak terlihat: enam tab sejajar menyembunyikan bahwa dua di
antaranya master dan empat sisanya berurutan.

---

## 3c. Ikhtisar `/estimasi` — DAFTAR RAB (opsi C, diputuskan 2026-08-17)

> Founder memilih **C** setelah dua opsi pertama (A: sembunyikan skenario di
> balik satu tombol · B: wizard bertahap) dinilai sama-sama menjawab pertanyaan
> yang salah.

**Kenapa A dan B keduanya meleset.** Keduanya bertengkar soal berapa banyak
struktur yang ditampilkan **saat membuat** RAB. Tetapi audit §1 tidak
menemukan masalah di situ: yang ditemukan adalah 208 skenario + 2.221 versi
yang **sudah ada** dan tak pernah tampil. Orang bukan gagal *membuat* — mereka
gagal *menemukan kembali apa yang sudah dibuat*. A dan B mengoptimalkan pintu
masuk yang dilewati sekali, sambil membiarkan layar harian tetap kosong.

**Bentuknya.** Satu baris per RAB, dikelompokkan per proyek:

```
Ruko Pak Eko — Pasteur                                    + RAB baru
  RAB                  Edisi AHSP     Nilai            Keadaan
  Tes · revisi 4       belum dipilih  Rp 0             Masih disusun
  Tes · revisi 1       SE-47-2026     Rp 20.056.000    Masih disusun
```

Tiga keputusan yang mengikat, masing-masing dengan alasannya:

| Keputusan | Kenapa |
|---|---|
| dikelompokkan per proyek, bukan tabel rata | membandingkan dua penawaran untuk proyek yang SAMA adalah pekerjaan nyata (itu guna `scenarios`); tabel rata mengurutkan menurut waktu dan memisahkan keduanya puluhan baris |
| `total_amount` null tetap **"—"**, bukan Rp 0 | "belum dihitung" ≠ "nol rupiah"; keduanya menuntut tindakan berbeda |
| edisi AHSP jadi **kolom**, tak disembunyikan | selisih antar-edisi terukur **−13,47%** (`SE47-VS-CIBULUH-ANALYSIS.md`), jadi dua RAB berbeda nilai bisa sama-sama benar — asal edisinya terbaca. Menyembunyikannya membuat selisih itu tampak seperti salah hitung |
| lencana `draft` **netral**, bukan kuning | separuh daftar ini draft; layar penuh peringatan menenggelamkan yang benar-benar mendesak |

**Proyek tanpa RAB tetap ditampilkan** di bawah (kartu bergaris putus + "+"),
bukan disembunyikan: kalau hilang dari layar, "belum ada RAB" jadi keadaan tak
terlihat dan orang mengira proyeknya yang hilang.

**Satu endpoint baru** — `GET /api/v1/estimate-versions`. Ke-16 endpoint
estimasi lain semuanya di-key oleh id (buka versi X, ubah item Y), jadi tak
satu pun bisa menjawab *"RAB apa saja yang kami punya?"*. Bergerbang
`skenarioIdsTenant()` (T4g) — tanpa itu daftar membocorkan seluruh RAB tenant
lain sekaligus, kebocoran terluas yang mungkin di modul ini.

---

## 4. Layar inti — `/estimasi/rab`

### 4a. Dua pintu (opsi D)

Saat proyek belum punya RAB, tampil **dua kartu setara**:

| Pintu | Isi | Catatan |
|---|---|---|
| **Susun di sini** ← utama | pilih dari katalog, isi volume, harga jalan | ditandai *paling sering*, latar aksen |
| **Unggah dari Excel** | cocokkan tiap baris ke analisa AHSP | jalur ini **sudah ada** tapi terletak di halaman Proyek — dipindah ke sini |

Founder eksplisit: *"saya mau bisa langsung membuat RAB nya di halaman itu juga,
ga hanya import RAB dari Excel"* → **"Susun di sini" adalah jalur utama**, Excel
pintu kedua.

### 4b. Skenario & versi — progresif, bukan di depan

Sekarang: pilih proyek → buat skenario → buat versi → pilih edisi → baru kerja.
**Empat pertanyaan jargon sebelum boleh mulai.**

Sesudah: satu tombol **"Buat RAB baru"**. Skenario `Utama` + versi `v1` dibuat
otomatis di belakang layar. Konsep aslinya **muncul saat dibutuhkan**:

| Kebutuhan nyata | Tombol | Yang terjadi di DB |
|---|---|---|
| tunjukkan 2 pilihan harga ke klien | **+ Buat pilihan lain** | skenario baru |
| kunci angka penawaran | **Kunci & kirim ke klien** | versi → `submitted` |
| klien minta revisi | **Revisi** | versi baru, v1 tetap utuh |

Kata "skenario"/"versi"/"assembly" **tidak muncul sebagai istilah** di layar
utama. Mekanismenya utuh — hanya namanya yang diganti bahasa lapangan.

**Yang TIDAK berubah:** immutability versi terkunci, rantai approval,
`ahsp_edition_id` terkunci saat keluar draft. Ember [C] tidak disentuh.

### 4c. Tabel kerja

Kolom: `Kode · Uraian · Volume (input) · HSP · Jumlah`.
Volume diedit **inline** — total bergerak seketika, tanpa tombol simpan.
Panel ringkasan **sticky** di kanan: biaya langsung → overhead → PPN → total,
plus jejak (`4 item · edisi SE-47/2026 · 100% harga terpetakan`).

---

## 5. Empty state yang mengajari

Kegagalan terparah sekarang: **Material & RAP = halaman putih**. Tak ada
penjelasan, tak ada jalan keluar.

Aturan baru — tiap layar kosong **wajib** memuat tiga hal:

1. **apa** ini (satu kalimat, bahasa lapangan)
2. **kenapa** kosong (prasyarat yang belum terpenuhi)
3. **tombol** ke prasyarat itu

Contoh RAP:

> **Belum ada RAP untuk proyek ini**
> RAP adalah anggaran **biaya pelaksanaan** — dibuat dari RAB yang sudah
> terkunci. Kunci RAB dulu, lalu RAP bisa dibentuk otomatis dari itemnya.
> `[ Lihat RAB — Utama v1 ]`

Ditegakkan penjaga baru (§7).

---

## 6. Visual

Tunduk penuh `ARAH-VISUAL-2026.md`. Tidak ada warna/font/token baru:

- aksen **navy `#003366`** (indigo sudah ditolak §10d — jangan diusulkan lagi)
- Bricolage Grotesque (display) + Plus Jakarta Sans (body)
- token kerapatan `--pad-*`, `--teks-*`, `--radius-*` dari `globals.css`
- **dark mode wajib ikut** — diuji di kedua mode, bukan terang saja

Mockup sudah dibangun & dilihat founder: `scratchpad/mockup/rab-{terang,gelap}.png`.

---

## 7. Penjaga & pengujian

### 7a. Penjaga yang WAJIB tetap hijau

| Penjaga | Risiko dari pekerjaan ini |
|---|---|
| `uji-judul-halaman-ada` | tiap halaman BARU wajib `<h1>` (ambang NOL) |
| `uji-remah-lengkap` | tiap modul baru wajib nama breadcrumb (ambang NOL) |
| `uji-token-css-ada` | dilarang `var(--token)` yang tak ada (ambang NOL) |
| `uji-tabel-seragam` | sel tabel pakai token padding, bukan angka dipaku |
| `audit-halaman-pakai-cache` | halaman baru wajib `useData()` — **lantai 69** |
| `audit-taksonomi-vs-kode` | status menu wajib ikut diperbarui |

### 7b. Penjaga BARU — `uji-layar-kosong-menjelaskan.mjs`

Menegakkan §5: layar yang bisa kosong **wajib** punya empty state ber-tombol.
Ambang NOL. **Wajib dibuktikan bisa merah** lewat mutasi sengaja
(suntik pelanggaran → MERAH → pulihkan → HIJAU) — CLAUDE.md §8a.2.

### 7c. Tautan yang akan patah kalau lalai

**9 rujukan** `/estimasi?tab=…` di `peta-menu.ts` + `use-tab-url.ts`. Semuanya
wajib diperbarui di commit yang sama. Rencana: `/estimasi?tab=x` **dialihkan**
(redirect) ke rute baru — tautan lama yang sudah dibagikan tidak mati.

---

## 8. Urutan kerja

| # | Langkah | Selesai bila | Status |
|---|---|---|---|
| 1 | Kerangka: `layout.tsx` + `_bersama/` | rute baru bisa dibuka, guard hijau | ✅ |
| 2 | `/estimasi/rab` — dua pintu + tabel kerja | RAB bisa disusun tanpa jargon | ✅ |
| 3 | `/estimasi/rap` + empty state | tak ada lagi halaman putih | ✅ 2026-08-17 |
| 4 | `/estimasi/kas` + `/estimasi/varians` | keduanya berisi | ✅ |
| 5 | `/master/ahsp` + `/master/harga` | pindah, tautan lama dialihkan | ✅ |
| 6 | `/estimasi/markup` | pindah dari Pengaturan | ✅ **jalan masuknya saja** |
| 7 | Penjaga baru + mutation test | terbukti bisa merah | ✅ |
| 8 | Dokumen: `ARAH-VISUAL §6b`, taksonomi, QUEUE, JOURNAL | penjaga docs hijau | ✅ 2026-08-17 |

Tiap langkah = satu commit dengan penjaga dijalankan, exit code ditempel.

### 8a. Langkah 6 — yang dipindah JALAN MASUKNYA, bukan halamannya

Markup **tidak** dijadikan rute bersarang `/estimasi/markup`. Sempat dicoba
sebagai re-export, dan hasilnya terlihat di tangkapan layar: **dua `<h1>`** di
satu halaman ("Estimasi & RAB" dari layout + "Markup & Margin" dari
halamannya) plus padding ganda karena halaman itu membawa `<Halaman>` sendiri.

`uji-judul-halaman-ada` tetap hijau selama itu — ia memastikan judul **ADA**,
bukan memastikan judulnya **tunggal**. Hijaunya penjaga bukan bukti benarnya
hierarki.

Yang dipindah cukup jalan masuknya: `/pengaturan/markup` muncul sebagai
bagian "Markup & PPN" di navigasi modul (`luar: true` — ditandai supaya tak
pernah tampak aktif). Orang yang sedang menyusun RAB menemukannya dari sini,
tanpa halaman itu digandakan atau dibedah.

### 8b. Langkah 3 — halaman putihnya SEMPAT KEMBALI, dan cara ia lolos

Ditutup pada gelombang pertama, lalu terbuka lagi: `/estimasi/rap` merender
halaman putih **sebelum proyek dipilih** — keadaan pertama yang dilihat setiap
orang. Seluruh isinya bersyarat `projectId`, jadi tanpa proyek tak satu pun
blok dirender: tak ada tabel, tak ada empty state, tak ada penjelasan.

Penjaga `uji-layar-kosong-menjelaskan` hijau sepanjang itu, dan itu bukan
kesalahannya: ia memeriksa apakah berkas **punya** empty state, bukan apakah
**setiap jalan kosong** sampai ke sana. `/estimasi/rab` dan `/estimasi/varians`
menanganinya sejak awal lewat early-return `if (!proyekId)`; RAP tertinggal
karena memakai state lokal, bukan `?proyek=` di URL.

**Pelajaran untuk penjaga berikutnya:** "berkas ini punya X" jauh lebih murah
diperiksa daripada "setiap jalan menuju keadaan Y melewati X" — dan yang murah
itulah yang biasanya ditulis, lalu disangka membuktikan yang kedua.

---

## 9. Yang SENGAJA tidak dikerjakan di sini

- **Auto Structure Pro** (analisa SNI 2847 + gambar kerja, opsi 1c founder) —
  spec terpisah, dikerjakan sesudah CECEP. Jembatannya sudah separuh ada
  (`/estimate-versions/:id/rebar-takeoff`, `/material-takeoff`,
  `/cecep/steel-profiles`).
- **Perubahan engine hitung** — AHSP/PPN/BUK tidak disentuh. Ini pekerjaan
  tampilan; angka yang dihasilkan wajib identik.
- **Skema DB** — nol migrasi. Semua endpoint yang dibutuhkan sudah ada.
