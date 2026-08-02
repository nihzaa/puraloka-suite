# RATIFIKASI — Satu-satunya Berkas yang Perlu Dibaca Founder

**Cara membaca:** tiap entri adalah keputusan yang **sudah diambil dan/atau sudah
dijalankan**, menunggu konfirmasi. **Diam berarti setuju.** Kalau tidak setuju,
tulis `TOLAK` + alasan di bawah entri; saya akan membatalkannya dengan cara yang
tercantum di baris "cara membatalkan".

Entri berstatus **MENUNGGU-GERBANG** adalah satu-satunya yang benar-benar berhenti
menunggu Anda — karena menyentuh Gerbang Keras. Pekerjaan lain tetap jalan.

---

## R-001 · 🔴 P0 · MENUNGGU-GERBANG (G-2)
### Tabrakan definisi General Ledger: migrasi 047 vs 167

**Status:** ditemukan 2026-08-02, **belum diperbaiki**. Menunggu izin.

**Apa yang terjadi.**
Ada dua migrasi yang sama-sama membuat tabel `accounts` dan `journal_entries`
dengan bentuk yang **tidak kompatibel**:

| | Migrasi 047 (lama) | Migrasi 167 (baru) |
|---|---|---|
| Tercatat "sudah jalan" di buku | **YA** | tidak |
| Artefaknya nyata ada di dev | **TIDAK** | **YA** |
| Sadar perusahaan (`company_id`) | **tidak ada sama sekali** | ada, 18 tempat |
| Nama kolom jenis akun | `account_type` | `type` |

Database dev sekarang memakai bentuk **167** (yang benar, sadar perusahaan).

**Apa yang rusak kalau dibiarkan.**
Saat sistem dipasang di lingkungan baru — CI hari ini, **produksi nanti** —
migrasi dijalankan berurutan dari nol. Maka:

1. Migrasi **047** jalan lebih dulu dan membuat tabel akun versi **lama yang tidak
   mengenal perusahaan**. SQL-nya sah, jadi tidak ada pesan galat apa pun.
2. Migrasi **167** menyusul, melihat tabelnya sudah ada, lalu **diam saja** dan
   tidak mengubah apa-apa.
3. Hasilnya: **buku besar di produksi tidak bisa memisahkan perusahaan.**

Tidak ada gejala. Tidak ada test merah. Baru ketahuan ketika perusahaan kedua
membuka jurnal dan **melihat angka perusahaan pertama**. Ini persis skenario yang
`ADR-011` sebut sebagai titik-tanpa-jalan-kembali.

**Kenapa saya berhenti dan tidak langsung memperbaiki.**
Perbaikannya menyentuh berkas migrasi yang **sudah tercatat di buku migrasi** —
itu Gerbang Keras **G-2**. Menulis atau mengubah buku migrasi berdasarkan
penilaian saya sendiri adalah persis kesalahan yang saya buat di audit kemarin
(cacat C-3), dan konsekuensinya permanen serta senyap.

**Usul saya (pilih satu, atau diam = setuju opsi A).**

- **Opsi A — pensiunkan 047 (rekomendasi).** Ubah isi 047 menjadi tanpa-operasi
  yang menjelaskan bahwa GL dipindahkan ke 167, dan biarkan catatan bukunya apa
  adanya. Bentuk 167 menjadi satu-satunya definisi GL.
  *Kelebihan:* satu sumber kebenaran, cocok dengan dev hari ini.
  *Risiko:* mengubah berkas migrasi bernomor yang sudah tercatat — hanya aman
  justru karena artefak 047 terbukti **tidak pernah terbentuk**.

- **Opsi B — biarkan 047, buat 167 memaksa bentuk yang benar.** Tambahkan migrasi
  baru yang mengoreksi tabel bikinan 047 (ubah kolom, tambah `company_id`).
  *Kelebihan:* tidak menyentuh berkas lama sama sekali.
  *Risiko:* menyimpan dua definisi selamanya; setiap pembaca berikutnya harus
  memahami keduanya. Utang pemahaman permanen.

**Cara membatalkan:** kedua opsi hanya menyentuh berkas migrasi, dapat di-revert
lewat `git revert` satu commit. Belum ada data produksi, jadi biaya pembatalan
hari ini **nol**.

**Biaya menunda:** naik tajam begitu ada tenant kedua atau data jurnal nyata.
Hari ini `journal_entries` berisi **0 baris** — ini jendela termurah.

---

## R-002 · MENUNGGU-GERBANG (G-2)
### Buku migrasi tertinggal 12 versi dari kenyataan

**Status:** terukur, **tidak diperbaiki**. Menunggu izin.

Buku migrasi (`schema_migrations`) mencatat sampai versi **162**, sementara
berkasnya sudah sampai **174**. Dua belas migrasi (163–174) sudah benar-benar
dijalankan ke dev — tabel `accounts` berisi 38 akun sesuai isi migrasi 170 —
tetapi tidak tercatat di buku.

**Kenapa berbahaya:** buku ini yang dipakai alat pemasangan untuk memutuskan
"migrasi mana yang perlu dijalankan". Buku yang tertinggal membuat alat itu
menjalankan ulang migrasi yang sudah jalan.

**Kenapa saya tidak langsung mencatatnya:** karena mencatat 167 sebagai "sudah
jalan" **sebelum R-001 selesai** justru mengunci cacat P0 itu selamanya. Urutannya
harus R-001 dulu, baru R-002.

**Cara membatalkan:** baris yang ditambahkan ke buku dapat dihapus dengan
`DELETE ... WHERE version IN (...)`. Reversibel penuh selama belum ada produksi.

---

## R-003 · SUDAH DIJALANKAN · tinggal dikonfirmasi
### Branch Fase 0 di-rebase ke `fix/search-proyek-gagal-senyap`, bukan `main`

**Apa yang saya lakukan:** memulai pekerjaan di atas branch
`fix/search-proyek-gagal-senyap` alih-alih `main`.

**Kenapa:** seluruh pekerjaan GL (8 commit, 3.890 baris, migrasi 167–174)
**belum ter-merge ke `main`**, padahal tabelnya sudah dipasang di database dev
bersama. Kalau saya bekerja di atas `main`, setiap pengukuran Fase 0 akan
dilakukan atas kode yang tidak memuat GL sementara databasenya memuat GL —
persis jenis ketidakcocokan yang membuat audit kemarin keliru.

**Yang perlu Anda ketahui:** ada 8 commit berisi pekerjaan selesai yang belum
masuk `main`, termasuk perbaikan bug **pencarian proyek yang selalu gagal senyap**.
Menurut saya itu layak di-merge lebih dulu, tapi itu keputusan Anda.

**Cara membatalkan:** `git rebase --onto main` — murni operasi git, tidak
menyentuh data.

---

## R-004 · SUDAH DIJALANKAN · tinggal dikonfirmasi
### Rekomendasi audit kemarin untuk menjalankan `rekonsiliasi --tulis` DITARIK

Audit 2026-08-02 (butir F-003) merekomendasikan menjalankan
`rekonsiliasi-schema-migrations.mjs --tulis`. **Saya tarik rekomendasi itu.**

Alat tersebut menebak isi sebuah migrasi dengan mencocokkan pola teks, dan pola
itu **tidak bisa melihat perintah yang dibungkus blok dinamis** — yang justru
dipakai seluruh migrasi 163–174. Akibatnya ia bisa menyatakan sebuah migrasi
"sudah jalan" padahal belum, dan migrasi itu **tidak akan pernah dijalankan lagi
di lingkungan mana pun**, tanpa gejala.

Penggantinya `scripts/db/ledger-diff.mjs` **tidak punya kemampuan menulis sama
sekali**, dan hanya menyatakan sesuatu terbukti bila artefak fisiknya ditemukan
di database.

**Cara membatalkan:** alat lama masih ada dan tidak saya ubah.
