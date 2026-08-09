# Struktur Sidebar — standar ERP konstruksi

> Ditetapkan 2026-08-09 atas permintaan founder:
> *"apakah sudah benar semua sesuai standar ERP penempatannya seperti ini? yg
> saya lihat gaada data master"* dan *"untuk estimasi & Biaya itu ganti aja,
> dan untuk membuat RAB itu punya halaman tersendiri jangan campur dengan
> finance"*.
>
> Dokumen ini **mengikat**. Menambah menu baru wajib mengikuti aturan di
> §2 dan §3; penjaga CI `uji-sidebar-taksonomi.mjs` menahan sebagian di
> antaranya.

---

## 1. Apa yang salah sebelumnya — diukur, bukan dirasa

Audit 2026-08-09 terhadap `menu_items` (14 induk, 89 anak) menemukan tiga
cacat struktural:

### 1a. TIDAK ADA grup Master Data

`ERP-KONTRAKTOR-TAKSONOMI-MENU.md` menempatkan **§1 MASTER DATA & KONFIGURASI
INTI** sebagai kategori PERTAMA — 19 item. Sidebar tak punya grup itu sama
sekali, dan isinya tersebar ke lima tempat:

| Master data | Dulu di | Kenapa salah |
|---|---|---|
| Klien | Proyek | klien bukan bagian dari satu proyek; ia dipakai lintas proyek |
| Supplier | Pengadaan | supplier dipakai juga oleh kontrak & gudang |
| Daftar Tukang | Mandor & Subkon | tukang adalah master orang, bukan transaksi mandor |
| Aset & Alat | Alat & Dokumen | dicampur dengan dokumen yang tak berhubungan |
| Satuan · Kategori Pekerjaan · Tujuan Kasbon · Badan Usaha | Administrasi | tercampur dengan pengaturan sistem (audit log, notifikasi) |

Akibatnya nyata: orang yang ingin menambah klien baru harus menebak bahwa
ia ada di bawah "Proyek".

### 1b. "Estimasi & Biaya" isinya AKUNTANSI

Dari tujuh anaknya, **enam adalah akuntansi murni**:

```
Estimasi & RAB        ← §5 Budget & Cost Control   ✔ benar
Jurnal Umum           ← §14 Keuangan & Akuntansi   ✘
Bagan Akun            ← §14                        ✘
Neraca Saldo          ← §14                        ✘
Buku Besar            ← §14                        ✘
Neraca & Laba-Rugi    ← §14                        ✘
Laporan & BI          ← §18 Pelaporan & BI         ✘
```

Taksonomi sendiri menempatkan Jurnal Umum di §14, bukan §5. Grup itu
sebenarnya "Akuntansi" yang salah nama, dengan satu menu estimasi terjebak
di dalamnya.

### 1c. Nomor urut bertabrakan

`Ringkasan Gudang` diberi `sort_order` 1301 (migrasi 240) — sama dengan
`Pengguna & Role` di Administrasi. Kesalahan itu tak terlihat karena urutan
dihitung per-grup, tetapi ia melanggar pola blok-ratusan yang dipakai
seluruh menu lain.

---

## 2. Struktur baru — dan alasan tiap keputusan

Urutannya mengikuti **alur kerja kontraktor**, bukan abjad dan bukan
kelengkapan modul:

```
  0  Beranda
 50  Master Data          ← acuan yang dipakai semua modul
100  CRM & Tender         ← sebelum proyek ada
200  Proyek
300  Kontrak
400  Perencanaan & Jadwal
500  Estimasi & Anggaran  ← RAB/RAP, TANPA akuntansi
600  Pengadaan
700  Gudang & Material
800  Mandor & Subkon
900  Lapangan
1000 Mutu & K3
1100 Keuangan             ← invoice, pembayaran, kas
1200 Akuntansi            ← jurnal, buku besar, neraca
1300 Alat & Aset
1400 Dokumen
1500 Pelaporan & BI
1600 Administrasi         ← pengaturan sistem, BUKAN master data
```

### Kenapa Master Data di posisi 50, bukan paling bawah

Master data adalah **prasyarat**, bukan pengaturan. Klien harus ada sebelum
proyek dibuat; satuan harus ada sebelum RAB disusun. Menaruhnya di bawah
bersama audit log menyiratkan ia jarang disentuh — padahal ia yang pertama
diisi saat perusahaan baru mulai memakai sistem.

Ini juga alasan ia dipisah dari Administrasi: **Administrasi mengatur
SISTEM** (siapa boleh apa, log, notifikasi), **Master Data mengatur BISNIS**
(siapa kliennya, apa satuannya). Dua hal berbeda yang kebetulan sama-sama
"pengaturan".

### Kenapa Keuangan dan Akuntansi DIPISAH

Founder: *"untuk membuat RAB itu punya halaman tersendiri jangan campur
dengan finance"*.

Keduanya memang beda pekerjaan dan beda orang:

| | Keuangan | Akuntansi |
|---|---|---|
| Pertanyaan | "sudah ditagih? sudah dibayar?" | "bagaimana pembukuannya?" |
| Dipakai | admin proyek, PM | akuntan |
| Frekuensi | harian | bulanan/tutup buku |

Menyatukannya membuat PM harus melewati Buku Besar untuk mencapai Invoice.

### Kenapa Estimasi & Anggaran berdiri sendiri

RAB/RAP adalah **rencana biaya sebelum pekerjaan jalan** — beda dari
Keuangan (uang nyata yang bergerak) dan beda dari Akuntansi (pencatatan).
Taksonomi §5 memang kategori terpisah.

---

## 3. Aturan yang mengikat

### R-1 · Satu route, satu link (warisan migrasi 232)

Tidak berubah. Satu halaman dicapai dari tepat satu menu; penanda aktif
harus punya jawaban tunggal.

### R-2 · Grup induk boleh punya href lewat anak-ikhtisarnya

Diperbarui 2026-08-09. Migrasi 232 menetapkan `href` induk WAJIB NULL. Itu
masih berlaku **di database**, tetapi sidebar kini mengarahkan klik pada
baris induk ke href anak-ikhtisarnya (`lib/tujuan-grup.ts`) — satu klik
membuka halaman DAN meng-expand, tanpa melanggar R-1.

### R-3 · Menu hanya untuk halaman yang ADA — DICABUT sebagian

Migrasi 232 melarang menu tanpa halaman, karena "yang belum dibangun
mengecewakan saat diklik".

Founder 2026-08-09 meminta sebaliknya: *"untuk semua menu/submenu yg ada di
taksonomi juga daftarkan ada ke sidebar, dan untuk status kesiapan halamannya
berikan label dulu aja biar keliatan"*.

Kekhawatiran asli R-3 tetap sah, jadi ia dijawab bukan dengan menyembunyikan
melainkan dengan **menandai**: menu yang halamannya belum ada diberi
`kesiapan = 'rencana'`, dan sidebar menampilkan titik abu di sebelahnya.
Orang tahu sebelum mengklik.

### R-4 · Nomor urut memakai blok ratusan

Tiap grup induk mendapat satu blok 100. Anak diberi induk+1, induk+2, dst.
Nomor tak boleh melompat antar-grup — itu yang membuat `Ringkasan Gudang`
1301 bertabrakan dengan Administrasi.

### R-5 · Kesiapan halaman WAJIB diisi

Kolom `menu_items.kesiapan`:

| Nilai | Arti | Titik |
|---|---|---|
| `hidup` | halaman jadi & dipakai | hijau |
| `sebagian` | halaman ada, sebagian fitur belum | kuning |
| `rencana` | halaman belum dibangun | abu |

Bawaannya `hidup`. Menu baru yang halamannya belum ada WAJIB diberi
`rencana` — penjaga CI menolak menu ber-`hidup` yang berkasnya tak ada.

---

## 4. Kapan menu induk mendapat DASHBOARD

Founder: *"kalo ada yg bisa dikasih dashboard pada menu induknya, gimana biar
ga lupa?"*

Jawabannya bukan daftar melainkan **penjaga** —
`uji-induk-punya-ikhtisar.mjs` (ratchet). Tetapi penjaga hanya menahan
kemunduran; keputusan "layak atau tidak" tetap perlu aturan:

### Grup induk WAJIB punya halaman ikhtisar bila

1. anaknya **≥ 3**, DAN
2. ada pertanyaan lintas-anak yang tak terjawab satu pun anaknya

Contoh: grup Lapangan punya Punch List, Inspeksi, Submittal — tetapi
"bagaimana keadaan lapangan hari ini secara keseluruhan" tak terjawab satu
pun. Itu yang dijawab `/lapangan`.

### TIDAK perlu bila

- anaknya < 3 (mis. Piutang, satu anak) — ikhtisarnya akan menyalin anaknya
- seluruh anaknya halaman pengaturan (mis. Administrasi) — tak ada "keadaan"
  yang perlu diringkas

### Bentuk bakunya

Mengikuti tiga dashboard yang sudah dibangun (`/lapangan`, `/keuangan`,
`/gudang`) — lihat §5.

---

## 5. Bentuk baku halaman ikhtisar — supaya SEMUA konsisten

Founder: *"saat membuat halaman ui-ux nya agar konsisten dengan halaman yang
sudah dibuat sekarang ini gimana, saya mau semua halaman tampilannya
konsisten"*.

Urutan dari atas, dan **tak boleh ditukar**:

```
1. KepalaHalaman        judul + keterangan + ikon + aksi (Muat ulang)
2. KPI strip            4–6 kartu, kisi DIPAKSA + kelas `.kpi-strip`
3. Baris grafik         2 kolom: deret waktu + komposisi
4. Baris kartu          2–3 kolom: daftar yang menuntut tindakan
5. Daftar utama         tabel/daftar panjang
   RAIL (kanan)         2 kartu konteks + Asisten + Pengingat
```

### Aturan yang sudah dibayar mahal — jangan diulang

| Aturan | Kenapa |
|---|---|
| `<KepalaHalaman>`, jangan `<h1>` sendiri | dijaga `judul-ratchet`; dulu ada 27 varian gaya h1 |
| KPI: kisi DIPAKSA + `.kpi-strip` | `auto-fit` memilih 5 kolom, kartu keenam turun sendirian — terjadi 3× |
| Grafik: `margin.left: 0`, bukan negatif | label sumbu terpotong ("9%" alih-alih "100%") |
| Sumbu: ringkas ke jt/M | "1.972.965.000" tak muat di label mana pun |
| Donat: token CSS, **tanpa `--aksen`** | `--aksen` tampak sewarna `--navy` pada irisan kecil |
| Kartu rail: `flexShrink: 0` | tanpa itu kalender gepeng jadi 2px di laptop |
| Nilai kanan: `paddingInlineStart: 4` | judul ber-ellipsis menempel ke badge |
| Jarak: token `var(--gap-*)`, bukan angka | dijaga `kerapatan-ratchet` |
| Nominal: string dari server, `.toFixed(2)` | float membuang presisi rupiah (§5.4) |

### Komponen yang WAJIB dipakai ulang

| Kebutuhan | Komponen |
|---|---|
| Judul halaman | `KepalaHalaman` (`components/dasar`) |
| Kartu KPI | `KartuKPI` (`components/ui-dasar`) |
| Kartu berisi daftar | `Panel` (`components/ui-dasar`) |
| Keadaan kosong | `Kosong` — prop `sebab` WAJIB |
| Grafik deret + komposisi | `GrafikModul` (`components/shell/grafik-modul`) |
| Kartu rail | `KartuRail` + `BarisRail` |
| Rail (Asisten & Pengingat selalu ada) | `RailIsi` + `usePasangRail` |

Membuat versi sendiri dari salah satunya = menambah varian yang harus
diseragamkan lagi kelak. Itu persis pekerjaan yang UIR-2 lakukan pada 27
varian `<h1>`.

---

## 6. Yang TIDAK didaftarkan ke sidebar

- **⛔ dicoret owner** — multi-currency, impor & kepabeanan, i18n, SSO.
  Sudah diputuskan tak dibangun (`KEPUTUSAN-SCOPE-ERP-AI.md`).
- **Fitur di dalam halaman**, bukan halaman sendiri. Contoh: "Retensi" adalah
  kolom di Kontrak; "3-way match" adalah proses di Penerimaan Barang;
  "Termin & syarat pembayaran" adalah tab di detail proyek.

Membedakan keduanya: *bisakah seseorang membuka ini tanpa lebih dulu memilih
proyek/dokumen tertentu?* Kalau tidak, ia fitur — bukan menu.
