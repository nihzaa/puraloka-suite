# RATIFIKASI — Satu-satunya Berkas yang Perlu Dibaca Founder

**Cara membaca:** tiap entri adalah keputusan yang sudah diambil dan/atau sudah
dijalankan. **Diam berarti setuju.** Untuk membatalkan, tulis `TOLAK` + alasan di
bawah entrinya.

---

# 📋 R-013 · SELURUH YANG MENUNGGU ANDA — dipisah: bisa saya jawab vs tidak (2026-08-12)

> **Diminta founder:** *"apa yg menunggu keputusan sayaa? coba kamu cari
> jawabannya sendiri sesuai standar ERP profesional dan perusahaan konstruksi
> besar."*

Saya periksa seluruh yang tercatat menunggu Anda, lalu memisahkannya jadi dua
tumpukan. Pemisahnya satu pertanyaan: **apakah jawabannya ada di standar, atau
hanya ada di kepala Anda?**

Yang mengejutkan dari pemeriksaan ini: **tumpukan pertama jauh lebih besar dari
yang saya kira.** Beberapa hal yang bertahun-tahun tercatat "menunggu founder"
sebenarnya menunggu saya mencarinya — persis kekeliruan yang saya akui di R-012.

## Tumpukan A — SUDAH SAYA JAWAB dari standar (Anda tinggal menolak bila salah)

| Perkara | Jawaban dari standar | Dasar |
|---|---|---|
| **R-012** penjurnalan otomatis (4 pertanyaan) | akrual PSAK 72 · retensi = aset `1124` · uang muka = liabilitas `2150` · PPh final = beban (bukan PPN) | PSAK 72 + `lib/wip-psak.ts` yang sudah jalan + 16/16 proyek terukur `pph_final` |
| **F4-2** pilih pustaka lapis data | **TanStack Query** | invalidasi terarah dibutuhkan sesudah approval berjenjang; devtools membuat "kenapa data ini basi" bisa dijawab pada 93 halaman |
| **R-006** `pg_dump` mati | buka tiket Support dengan teks yang sudah disiapkan; **jangan tunda pekerjaan lain** | cadangan terbukti jalan (147 tabel, 58.430 baris) — yang mustahil hanya jalur resmi |
| **F7-1** bentuk langganan | lihat §R-013.1 di bawah — **saya jawab keempatnya** | praktik SaaS B2B + kenyataan segmen kontraktor Indonesia |
| **R-007** bentuk grup/holding | tunda sampai pelanggan multi-PT PERTAMA, dengan tripwire | membangun eliminasi antar-entitas tanpa satu pun kasus nyata menghasilkan bentuk yang salah dan harus dirawat selamanya |

## Tumpukan B — HANYA ANDA yang tahu (saya tak akan menebaknya)

| Perkara | Kenapa saya tak bisa menjawabnya |
|---|---|
| **SITUS-2** materi jual: harga, cerita proyek, screenshot | Harga adalah keputusan bisnis, bukan turunan standar. Cerita proyek adalah fakta tentang pekerjaan Anda. Mengarang keduanya = janji yang tak bisa ditepati. |
| **SITUS-3** foto 2 kategori | Berkas aslinya tak ada di mana pun (nol kecocokan pHash dari 4 sumber). **Bisa diekstrak dari PDF compro hal. 17 & 19 kalau Anda izinkan** — kualitas turun tapi ada. |
| **E9** 19 harga AHSP bentrok | Dua sumber sah memberi angka berbeda untuk pekerjaan yang sama. Memilih salah satunya = memutuskan harga penawaran Anda. |
| **E10** 81 harga draft | Sama: mengaktifkannya berarti harga itu dipakai menawar pekerjaan nyata. |

## R-013.1 · F7-1 — keempat pertanyaan langganan, saya jawab

Diukur ulang 2026-08-12: **nol tabel langganan** di skema aplikasi.

**1. Paket apa saja? → SATU paket berbayar, plus masa coba.**
Praktik SaaS B2B yang dijual ke segmen ini hampir selalu dimulai satu paket.
Tiga paket sejak awal menuntut Anda tahu fitur mana yang orang bayar lebih —
dan itu tak bisa diketahui sebelum ada yang membayar. Menambah paket kedua
nanti adalah satu migrasi; membongkar tiga paket yang salah bentuk adalah
membongkar seluruh gerbang fitur yang sudah tersebar di kode.

**2. Batas apa yang ditegakkan? → JUMLAH PROYEK AKTIF.**
Bukan pengguna, bukan penyimpanan. Alasannya khas konstruksi: nilai yang
kontraktor peroleh dari ERP tumbuh sebanding jumlah proyek yang ia kelola,
sementara jumlah pengguna tidak — proyek yang sama bisa melibatkan 5 atau 50
orang tergantung apakah mandornya diberi akun. Membatasi pengguna justru
mendorong pelanggan berbagi akun, dan akun bersama menghancurkan audit trail
yang jadi nilai jual produk ini.

Penyimpanan juga salah: foto lapangan adalah bukti pekerjaan, dan pelanggan
yang menahan diri mengunggah foto karena kuota sedang merusak datanya sendiri.

**3. Siklus tagih? → BULANAN, dengan diskon tahunan.**
Kontraktor segmen ini punya arus kas bergelombang mengikuti termin. Memaksa
tahunan di muka menaikkan penghalang masuk tepat di titik mereka paling ragu.

**4. Saat lewat batas? → PERINGATKAN, JANGAN TOLAK.**
Ini yang paling menentukan dan paling mudah salah. Menolak pembuatan proyek
karena batas berarti menghentikan pekerjaan pelanggan pada hari mereka paling
sibuk — dan yang mereka ingat bukan "saya lupa upgrade", melainkan "software
ini menghalangi saya kerja".

Yang ditegakkan keras HANYA satu hal: **data tak pernah disandera.** Langganan
berakhir → akun jadi baca-saja dan ekspor tetap jalan, tak pernah dihapus.
Menyandera data pelanggan konstruksi berarti menyandera bukti hukum proyek
mereka, dan itu bukan model bisnis, itu risiko tuntutan.

**Bentuk teknisnya:** kolom `paket`, `langganan_mulai`, `langganan_akhir`,
`batas_proyek` di `companies` — nol tabel baru. Penghitung proyek aktif sudah
bisa dihitung dari `projects`. Spanduk peringatan saat mendekati dan melewati
batas.

**Yang saya TIDAK bangun tanpa Anda:** angka harganya. Struktur boleh saya
tetapkan dari standar; berapa rupiah per bulan adalah keputusan Anda.

---

# ✅ R-012 · PENJURNALAN OTOMATIS — DIJAWAB dari standar, bukan ditebak (2026-08-12)

> **Diminta founder:** *"apa yg menunggu keputusan saya? coba kamu cari
> jawabannya sendiri sesuai standar ERP profesional dan perusahaan konstruksi
> besar."*
>
> Saya cari, dan ternyata **keempatnya punya jawaban baku** — tiga dari PSAK,
> satu dari kenyataan yang sudah terukur di basis. Yang tadinya saya sebut
> "tak boleh ditebak" sebenarnya "belum saya cari". Itu keliru, dan ini
> koreksinya.
>
> **Tetap bisa Anda tolak.** Tiap jawaban di bawah menyebut dasarnya, jadi
> yang Anda tolak adalah dasarnya — bukan selera saya.

## Yang berubah dari perumusan awal

Perumusan awal menempatkan keempatnya sebagai "pilihan bebas". Sesudah
diukur ke basis dan kode yang sudah ada, tiga di antaranya **sudah terjawab
oleh keputusan yang pernah diambil** — menanyakannya lagi justru berisiko
menghasilkan dua modul yang bercerita berbeda tentang bulan yang sama.

---

## 1. Pendapatan diakui KAPAN? → **AKRUAL** (saat invoice terbit)

**Dasar:** PSAK 72 (Pendapatan dari Kontrak dengan Pelanggan), metode
persentase penyelesaian.

**Dan ini bukan pilihan terbuka lagi:** `lib/wip-psak.ts` sudah dibangun
2026-08-01 memakai PSAK 72 cost-to-cost, dan halaman `/laporan` sudah
menampilkannya. Memilih basis kas untuk jurnal berarti neraca dan laporan WIP
akan **berbeda angkanya untuk bulan yang sama** — dan yang menemukan bukan
sistem, melainkan orang yang membandingkan dua cetakan.

Praktik kontraktor besar: seluruhnya akrual. Basis kas hanya dipakai UMKM
di bawah ambang pembukuan, dan Puraloka sudah jauh di atas itu.

## 2. Retensi 5% → **`1124 Retensi Belum Ditagih`** (aset), bukan `4130`

**Dasar:** retensi adalah **hak tagih yang tertunda**, bukan pengurang
pendapatan. Pekerjaannya sudah dilakukan dan pendapatannya sudah diakui penuh;
yang belum adalah haknya menagih sampai masa pemeliharaan berakhir.

Jurnalnya saat invoice terbit:

```
Dr  1121 Piutang Usaha            (yang boleh ditagih sekarang)
Dr  1124 Retensi Belum Ditagih    (5% yang ditahan klien)
    Cr  4120 Pendapatan Termin    (nilai penuh)
```

Kalau retensi dicatat sebagai `4130 Retensi` (akun pendapatan), pendapatan
periode ini berkurang — padahal pekerjaannya sudah selesai. Itu menyesatkan
justru pada angka yang dipakai menilai kinerja proyek.

Saat retensi cair kelak: `Dr 1113 Bank / Cr 1124`.

**Akun `4130 Retensi` tetap ada tetapi TIDAK dipakai penjurnalan otomatis.**
Saya tidak menghapusnya — bagan akun milik Anda, dan menghapus akun yang
mungkin dipakai manual adalah keputusan lain.

## 3. Uang muka klien → **`2150 Uang Muka Klien`** (liabilitas), diakui bertahap

**Dasar:** PSAK 72 — uang yang diterima sebelum kewajiban kinerja terpenuhi
adalah **liabilitas kontrak**, bukan pendapatan. Kontraktor yang mencatatnya
langsung sebagai pendapatan akan melaporkan laba di bulan uang muka masuk,
lalu rugi di bulan-bulan pekerjaannya benar-benar dikerjakan.

Terima uang muka: `Dr 1113 Bank / Cr 2150 Uang Muka Klien`.
Tiap invoice termin yang memotong uang muka (`dp_deduction_amount` — kolomnya
**sudah ada**): `Dr 2150 / Cr 1121 Piutang Usaha`.

## 4. Akun PPN keluaran → **pertanyaannya salah sasaran**

Diukur 2026-08-12: **16 dari 16 proyek memakai `tax_scheme = 'pph_final'`,
nol memakai PPN.** Dan `lib/tax-calculation.ts` sudah menetapkan tarifnya:
PPh final 2%, PPN 11%.

Jadi yang mendesak bukan akun PPN, melainkan pembedaan yang lebih dasar:

| | PPh final 2% | PPN 11% |
|---|---|---|
| Sifat | **BEBAN** perusahaan | **TITIPAN** dari pelanggan |
| Akun | beban pajak | utang pajak |
| Boleh dicampur? | **Tidak** — mencampurnya membuat laba terlihat lebih besar dari yang sebenarnya |

Bagan sekarang hanya punya `2130 Utang Pajak`, dan itu benar untuk PPN tetapi
**salah untuk PPh final** — PPh final mengurangi laba, bukan menambah utang.

**Yang saya lakukan:** migrasi menambah dua akun,
`5950 Beban PPh Final` dan `2131 PPN Keluaran`, dan membiarkan `2130` untuk
PPh 21 karyawan yang memang utang. Penambahan akun tak menghapus apa pun.

Jurnal invoice ber-PPh final:

```
Dr  1121 Piutang Usaha        nilai + PPh (yang ditagih ke klien)
    Cr  4120 Pendapatan Termin    nilai pekerjaan
    Cr  2131 PPN Keluaran /
        atau 5950 Beban PPh Final  tergantung skema proyek
```

⚠️ Satu hal yang saya temukan sambil mengukur dan **perlu Anda periksa**:
`tax_amount` saat ini **DITAMBAHKAN** ke `base_amount` (`total = base + tax`).
Itu perilaku PPN yang benar. Untuk PPh final jasa konstruksi, praktik yang
lazim justru **dipotong pemberi kerja** dari nilai tagihan — bukan ditambahkan
di atasnya. Yang mana yang benar bergantung isi kontrak Anda, dan itu
**tak bisa saya tentukan dari data**. Penjurnalan otomatis mengikuti angka
yang sudah ada di invoice, jadi ia tetap konsisten apa pun jawabannya.

---

## Yang dibangun atas jawaban ini

**Peta akun jadi DATA, bukan konstanta di kode** (pelajaran G2a tarif payroll):
tabel `peta_akun_jurnal` yang bisa Anda ubah dari halaman pengaturan. Kalau
jawaban di atas salah untuk cara kerja Anda, yang berubah cukup satu baris
data — bukan deploy.

Sampai petanya diisi, penjurnalan otomatis **menolak berjalan** dan layarnya
menyatakan "peta akun belum ditetapkan" — bukan menebak akun yang kelihatan
masuk akal.

**Yang TIDAK dijurnalkan otomatis** dan tetap manual: penyusutan, koreksi
audit, jurnal penutup, dan apa pun yang butuh pertimbangan. Otomatisasi
berhenti di tempat yang jawabannya tunggal.

---

# 🔓 R-011 · SCOPE DIBUKA PENUH — tak ada lagi "jangan dibangun" (2026-08-11)

> **Keputusan founder, diucapkan langsung:** *"saya mau semuanya dimasukkan ke
> lingkup dan semuanya dikerjakan, gaada lagi yg 'jangan dibangun'."*

Ini **mencabut** keputusan 2026-08-01 (`F5-1` §2a) dan seluruh status `gerbang`
di `peta-menu.ts`. Yang dicabut, diukur 2026-08-11:

| Sumber | Jumlah | Isi |
|---|---|---|
| `F5-1` §2a JANGAN DIBANGUN | 11 | payroll · BPJS · PPh 21 · rekonsiliasi bank · tutup buku · report builder · rekrutmen · cuti · penilaian kinerja · sertifikasi · absensi staf |
| `peta-menu.ts` status `gerbang` | 21 | Mutu QA/QC (7) · K3 & Lingkungan (7) · Risiko & Kepatuhan (5) · Tracking Waste · lain-lain |
| **Total masuk lingkup** | **34** | dalam 10 kelompok |

## Urutan pengerjaan — diturunkan dari BAHAN, bukan dari selera

Diukur ke basis 2026-08-11, dan dua angkanya mengubah rencana:

```
inspection_requests   24 baris   ← sesi 2026-08-08 mengukurnya NOL
ncr_items             18 baris
absensi_harian     1.279 baris   (2026-07-10 … 2026-08-08)
workers               60 · users 26
izin_kerja             4 baris
accounts              38 · journal_entries 0
K3/HSE            NOL TABEL
```

| # | Kelompok | Item | Kenapa urutan ini |
|---|---|---|---|
| **G1** | Mutu (QA/QC) | 7 | Bahan terbanyak. Sekalian menutup sambungan `inspection_request_id` yang sudah tercatat sebagai kandidat kerja di `kolom-tersambung-lantai.json` |
| **G2** | SDM & Payroll | 8 | 1.279 baris absensi lapangan jadi fondasi timesheet — bukan mulai dari nol |
| **G3** | Risiko & Kepatuhan | 5 | `izin_kerja` sudah ada sebagai titik mula |
| **G4** | K3 & Lingkungan | 7 | Dari nol. SESUDAH G3 karena JSA ↔ izin kerja saling merujuk |
| **G5** | Tutup Buku + jurnal | 1 | `accounts` 38 ada, `journal_entries` 0. Paling berisiko — pembukuan berpasangan masuk Ember [C] |
| **G6** | Sisa | 6 | Tracking Waste · Markup & Margin · Dokumen Prakualifikasi · Baseline Schedule · Report Builder · API & Integrasi |

### G6 — daftarnya BASI, diukur ulang 2026-08-12

Enam item di atas diukur ke kode sebelum dibangun. Hasilnya mengubah rencana:

| Item | Terukur | Status |
|---|---|---|
| Dokumen Prakualifikasi | `vendor-kualifikasi.ts` + `/procurement/kualifikasi` | ✅ **sudah selesai** 2026-08-07 — daftar ini yang basi |
| **Markup & Margin** | nol kolom markup/margin/overhead di SELURUH skema | ✅ **SELESAI** — migrasi 301/302, lihat di bawah |
| Tracking Waste | `assemblies.waste_factor` ada; **3.042 dari 3.043 bernilai 0** | pemicunya belum menyala (sesuai triase F5-1) |
| **Baseline Schedule** | nol tabel `baseline*`; `jadwal_tugas` ternyata penjadwal cron | ✅ **SELESAI** — migrasi 303/304, lihat di bawah |
| Report Builder | 3 tabel laporan ada, semuanya laporan spesifik | belum |
| API & Integrasi | nol tabel `api_key`/`webhook` | belum |

**Markup & Margin (G6a)** menemukan cacat yang tak ada di daftar mana pun:
`buk_fraction` — angka yang menentukan **seluruh keuntungan perusahaan** —
tidak tersimpan di mana pun. Ia dikirim ulang tiap permintaan, jadi dua
estimator bisa menawar proyek yang sama dengan margin berbeda tanpa satu pun
tempat yang bisa ditanya "berapa margin kita?".

Dan lebih buruk: `ahsp.ts:411` menolak default dengan tegas (*"tidak ada
default"*), tetapi `estimasi/page.tsx:789` menulis `useState("10")` —
**penjaga di lapisan API dibatalkan satu nilai awal di UI**, dan 10% jadi
bawaan tanpa seorang pun memutuskannya. Komentar di atas baris itu bahkan
sudah menyatakan niat yang benar sementara kodenya melakukan kebalikannya.

Sekarang: `markup_periode` config-first (nol ter-seed), overhead/keuntungan/
kontinjensi dipisah, periode ditambah bukan ditimpa, dan angkanya ikut
tersalin ke `estimate_versions` supaya penawaran lama tetap bisa dijelaskan.
Layar estimasi mengisi BUK dari markup yang berlaku dan **menyatakan
asalnya**; kalau belum ditetapkan, kolomnya kosong dan layar mengatakannya.

⚠️ **Yang perlu Anda lakukan:** buka **Pengaturan → Markup & Margin** dan
tetapkan angkanya. Satu periode contoh sudah diisi saat pengujian (overhead
3%, keuntungan 7%, kontinjensi 2%, berlaku 2026-08-10) — **ganti dengan angka
Anda sendiri**, karena yang itu saya isi untuk menguji layarnya, bukan karena
saya tahu margin Puraloka.

**Baseline Schedule (G6b)** menemukan cacat yang paling halus dari seluruh
sesi ini — dan dokumen sudah mengklaim modulnya selesai.

`rab_items.planned_start/planned_end` dipakai Gantt, Kurva-S, look-ahead, dan
portal klien. Yang tak ada: **nol kolom baseline** di seluruh skema, sehingga
jadwal boleh digeser tanpa jejak. Yang membuatnya berbahaya: `spi = ev / pv`
dan PV diturunkan dari tanggal rencana itu — jadi **tiap penundaan ikut
memundurkan PV, dan SPI kembali mendekati 1.** Proyek yang terlambat tiga
bulan menampilkan SPI 0,98 tanpa satu pun galat.

Bentuk kegagalannya bukan angka yang salah, melainkan **angka yang selalu
benar** — dan itu jauh lebih sulit dilihat.

Taksonomi menulis ✅ *"Master schedule + baseline — `rab_schedule` … jadi
baseline PV berjenjang"*. Tabel itu diukur **nol baris**. Klaimnya membuat
modul yang benar-benar hilang terlihat sudah ada; sudah dikoreksi.

Sekarang: baseline disalin (bukan dirujuk), **append-only** ditegakkan trigger,
satu aktif per proyek dengan yang lama tetap jadi riwayat, dan rata-rata
pergeseran ditimbang bobot. Dijangkau dari bagian Gantt di halaman proyek.

⚠️ **Yang perlu Anda tahu:** satu baseline contoh sudah ditetapkan pada proyek
*Renovasi Rumah Pak Andi* saat pengujian (`#1 Kontrak awal`, dasar
`SPK/2026/014`). **Hapus atau ganti** kalau angkanya bukan yang Anda maksud —
ia sekarang dipakai menghitung SPI proyek itu.

## ⚠️ Yang MASIH butuh keputusan Anda — dan kenapa saya tak boleh menebaknya

Pencabutan ini menghapus larangan **membangun**, bukan kebutuhan akan **angka
yang benar**. Tiga item di G2 punya sifat yang berbeda dari sisanya:

**Payroll staf · BPJS · PPh 21.** Alasan penolakan aslinya bukan kemalasan —
*"aturan pajak berubah tiap tahun; salah hitung = urusan hukum, bukan bug."*
Itu masih benar. Yang berubah: sekarang saya bangun mesinnya.

Yang **tidak** akan saya lakukan: menuliskan tarif PTKP, lapisan PPh 21, atau
persentase BPJS ke dalam kode. Slip gaji yang salah keluar dengan tampilan
meyakinkan, dan penerimanya tak punya cara tahu.

Yang **akan** saya lakukan: struktur **config-first** — seluruh tarif jadi data
yang Anda isi lewat halaman pengaturan, dengan tanggal berlaku, sehingga
perubahan aturan tahun depan tak menuntut deploy. Perhitungannya ber-test dan
mutation-tested seperti modul finansial lain.

Sampai tarifnya Anda isi, layarnya menyatakan *"tarif belum ditetapkan"* —
bukan menghitung dengan angka bawaan yang kelihatan wajar.

**Rekonsiliasi bank** juga dicabut larangannya. Catatan lamanya berbunyi
*"software akuntansi mengerjakannya lebih baik"* — itu tetap benar sebagai
saran, tapi Anda yang memutuskan, dan keputusannya sudah turun.

---

# 🔗 APAKAH SEMUA DI `/docs` SUDAH TEREGISTER? — diukur 2026-08-07

> Menjawab dua pertanyaan sekaligus: *"apakah semua menu di taksonomi sudah
> terealisasikan?"* dan *"apakah semua yang ada di /docs sudah terimplementasi
> dan teregister ke semua roadmap?"*

## Menu taksonomi: BELUM semua, dan itu disengaja

**84 dari 191 selesai end-to-end.** Rinciannya di bagian berikutnya, tapi
angka pentingnya: dari 38 yang 🔴, **nol adalah INTI**. Sebelas sudah Anda
putuskan tidak dibangun, 25 menunggu pemicunya, 2 ditunda dengan angka.

## Dokumen ke ROADMAP: SUDAH, nol terlantar

`audit-docs-vs-roadmap.mjs` dijalankan hari ini:

    Dokumen .md di docs/       268
    disebut langsung ROADMAP    37
    acuan/riwayat/arsip        231  -> semuanya terdaftar di INDEKS-DOKUMEN.md
    RENCANA TERLANTAR            0

Tak ada rencana kerja yang terputus dari ROADMAP. Penjaga ini merah kalau ada
dokumen berisi rencana yang tak dirujuk — dan hari ini hijau.

## Satu celah yang perlu Anda tahu: 28 sub-menu tak terperiksa penjaga

`audit-taksonomi-vs-kode.mjs` melaporkan **28 sub-menu belum punya entri di
PETA**-nya. Artinya statusnya **tak diverifikasi ke kode oleh siapa pun** —
kalau suatu hari salah satunya dibangun, taksonomi bisa tetap menandainya 🔴
tanpa ada yang protes.

Itu bukan cacat teoretis: **tujuh sub-menu pernah ditandai 🔴 padahal UI-nya
sudah hidup berbulan-bulan** (F5-1 §3a/§3b), dan penjaga ini dibuat justru
untuk itu.

Diperiksa hari ini, ke-28 itu **persis irisan**:

- 11 yang **JANGAN DIBANGUN** — tak akan pernah punya tabel, jadi tak ada yang
  bisa diperiksa
- 17 **TUNDA** yang belum punya tabel sama sekali

Jadi tak ada yang tercecer. Tapi begitu salah satunya mulai dibangun, entrinya
**wajib ditambahkan ke PETA di commit yang sama** — kalau tidak, ia masuk ke
kelas cacat yang sudah pernah terjadi.

## Ringkas

| Pertanyaan | Jawaban |
|---|---|
| Semua menu taksonomi terealisasi? | **Belum** — 84/191. Tapi nol INTI tersisa. |
| Semua docs terimplementasi? | **Tidak semuanya**, dan itu benar: 231 dari 268 adalah acuan/riwayat/arsip, bukan rencana. |
| Semua teregister ke ROADMAP? | **Ya** — nol rencana terlantar, dijaga CI. |

---

# ✅ REKOMENDASI SAYA — urut prioritas, 2026-08-07

> Menjawab: *"hal yang menunggu saya itu bisa kamu rekomendasikan?"*
>
> Diurutkan bukan menurut besarnya, melainkan menurut **apa yang paling
> menahan yang lain**.

## 1. E10 — aktifkan 81 harga draft ⏱️ paling cepat, dampak paling besar

**Rekomendasi: AKTIFKAN SEMUANYA.**

81 harga hasil ekstraksi sheet Cibuluh masuk sebagai `draft` supaya bisa
dibedakan dari yang diverifikasi manusia. Begitu diaktifkan, **112 analisa
perusahaan langsung hidup**.

Kenapa saya yakin: harga draft **tidak dipakai menghitung HSP**, jadi
mengaktifkannya tak bisa merusak angka yang sudah ada — ia hanya menambah yang
tadinya kosong. Dan kalau ada satu-dua yang keliru, memperbaikinya satu baris.

Ini rasio hasil-per-usaha terbaik dari seluruh daftar.

## 2. E9 — 19 harga bentrok ⏱️ butuh Anda melihat, tak bisa ditebak

**Rekomendasi: putuskan 3 yang paling menyebar dulu, sisanya menyusul.**

Contoh nyata: `Kaso-Kaso 5/7` punya empat harga — Rp 3jt / 6jt / 9,7jt /
**16 juta** per m³. Selisih lima kali lipat itu jelas **jenis kayu berbeda
dengan nama sama**, bukan salah ketik.

Saya **tidak boleh menebaknya**: satu tebakan salah menyebar ke belasan
analisa, dan salahnya baru ketahuan saat penawaran kalah atau proyek rugi.

Yang saya butuhkan dari Anda cuma: untuk tiap nama yang bentrok, mana yang
dipakai — atau apakah namanya perlu dipecah (`Kaso 5/7 Meranti` vs
`Kaso 5/7 Borneo`). Datanya sudah tersaji lengkap.

## 3. F7-1 langganan ⏱️ satu-satunya penghalang produk bisa ditagih

**Rekomendasi: satu paket, satu batas, peringatkan-jangan-tolak.**

- kolom `paket` + `batas_proyek` di `companies` — tanpa tabel baru
- penghitung proyek aktif (sudah bisa dihitung dari `projects`)
- lewat batas → spanduk peringatan, **bukan** penolakan

Alasannya: menolak pembuatan proyek karena batas membuat pelanggan **berhenti
bekerja**, dan itu perlu diuji dengan pelanggan nyata lebih dulu. Menagih
kelebihan tanpa pernah menolak jauh lebih mudah diperbaiki daripada
sebaliknya.

Kalau Anda setuju, saya bangun lengkap dengan penjaganya — sehari.

## 4. F4-2 lapis data ⏱️ pilih pustaka, saya kerjakan sisanya

**Rekomendasi: TanStack Query.**

93 dari 96 halaman masih `useEffect`-fetch. Alasan memilihnya di atas SWR:
invalidasi terarah (`invalidateQueries`) yang justru dibutuhkan sesudah
approval berjenjang, dan devtools yang membuat cache bisa dilihat — pada 93
halaman, "kenapa data ini basi" harus bisa dijawab tanpa menebak.

Bukan pekerjaan sehari, tapi bisa bertahap: modul per modul, dengan ratchet
yang menurun.

## 5. SITUS-2 & SITUS-3 ⏱️ butuh materi dari Anda

- **SITUS-2**: screenshot, cerita proyek, harga. Saya tak bisa mengarang
  harga, dan screenshot palsu adalah janji yang tak bisa ditepati.
- **SITUS-3**: dua kategori tanpa foto. Berkas aslinya sudah ditelusuri ke
  empat sumber, nol kecocokan pHash. **Bisa diekstrak dari PDF compro hal.
  17 & 19** kalau Anda izinkan — kualitasnya turun tapi ada.

## 6. R-006 pg_dump ⏱️ tiket ke Supabase Support

**Rekomendasi: buka tiket, tapi jangan panik.**

Data Anda **punya cadangan** — diuji hari ini: 147 tabel, 58.430 baris, 105
detik. Yang mustahil hanyalah pemulihan lewat jalur resmi Supabase.

Yang perlu disampaikan ke Support: *"fungsi `trigger_calc_retention_amount_probe`
(oid 2840878) menunjuk namespace 2840025 yang sudah dihapus; `pg_dump` berhenti
di sana. Semua jalan DDL biasa sudah dicoba."*

## Yang TIDAK saya rekomendasikan sekarang

**AI/WhatsApp** — bukan karena tak bisa, tapi karena urutannya. Alasan
lengkapnya di bagian berikutnya; ringkasnya: AI di atas data yang bolong
menjawab dengan percaya diri dan salah.

Kalau Anda tetap ingin AI lebih dulu, katakan — saya kerjakan, dengan catatan
risiko itu tertulis.

---

# 🤖 KAPAN AI & ASISTEN WHATSAPP — diukur 2026-08-07

> Menjawab: *"apakah sudah masuk ke fase mengintegrasikan ai? saya mau ada
> asisten di WA saya."*

**Belum, dan itu keputusan Anda sendiri** (`KEPUTUSAN-SCOPE-ERP-AI.md` §4,
2026-08-01): *"selesaikan 8 item ROADMAP sisa lebih dulu, baru AI."*

## Kenapa urutan itu tepat, dan bukan sekadar preferensi

Dua dari delapan item itu adalah **data yang justru akan dibaca AI**:

- **#15 WIP/PSAK** — tanpa ini, L/R per proyek tak bermakna. AI yang ditanya
  *"proyek mana yang rugi?"* menjawab dari pembukuan yang belum benar:
  **percaya diri dan salah**, kelas kesalahan paling berbahaya untuk sistem
  pengambil keputusan.
- **#16 Rantai kontrak** — denda, EOT, jaminan. Uang nyata yang belum terekam
  berarti AI menghitung dari basis yang bolong.

Prinsip doc 06 *"AI tidak pernah mengarang jawaban saat tidak yakin"* tak bisa
ditegakkan kalau datanya sendiri bolong — AI tak punya cara tahu bahwa angka
yang dibacanya belum lengkap.

## Delapan item itu sekarang — diukur, bukan diperkirakan

| # | Item | Status |
|---|---|---|
| 15 | WIP / PSAK | ✅ SELESAI |
| 16 | Rantai kontrak (LD, EOT, jaminan) | ✅ SELESAI |
| 17 | Paritas golden RAB nyata | ✅ SELESAI |
| 23 | Aset & alat penuh | ✅ SELESAI |
| 20 | Laporan antar-edisi AHSP | ⛔ DICORET Anda 2026-08-01 |
| 14 | 468 akses supabase mentah | 🟡 celah nyata **tertutup**; sisa utang adopsi — turun lagi 373→366 hari ini |
| 24 | Capability Tier-2 | 🟡 **4 dari 5**; sisanya HSE, sengaja di Gelombang 2 |
| E9/E10/E12 | Harga & edisi AHSP | ❓ **MENUNGGU ANDA** — lihat di bawah |

**Jadi yang benar-benar menahan tinggal E9/E10/E12** — dan ketiganya keputusan
harga, bukan kode.

## Urutan sampai WhatsApp (dari §5 dokumen scope)

```
SEKARANG    → sisa 8 item (praktis: E9/E10/E12 + utang adopsi #14)
GELOMBANG 2 → GL in-app · QA/QC+HSE · payroll · aset
GELOMBANG 3 → mobile lapangan penuh + offline
GELOMBANG 4 → AI: pilot read-only → WhatsApp Gateway → 13 automation "Next"
              gerbang eksternal: akun WA Business + kredensial API (ANDA)
```

Di kode hari ini: **nol baris AI, nol dependensi** (`openai`/`anthropic`/
`langchain`/`pgvector` — nihil). Fase 6 yang saya selesaikan kemarin adalah
**prasyaratnya** (event log, jejak keputusan), bukan fiturnya — CHARTER
menyebutnya tegas: *"Prasyarat AI (bukan fitur AI)"*.

## Lima aturan yang sudah mengikat saat AI dibangun

Diwarisi dari doc 06, dicatat supaya tak perlu dibaca ulang:

1. **No silent write** — automation yang mengubah data finansial/kontraktual
   berhenti di approval manusia, tanpa kecuali.
2. **WhatsApp = client baru, bukan jalan pintas** — lewat API dan permission
   engine yang SAMA. Tak ada bypass otorisasi.
3. **Spending limit + rate limit per agent.**
4. **Explainability wajib** — tiap jawaban finansial menyebut sumbernya
   (*"berdasarkan 12 invoice bulan ini"*), bukan angka telanjang.
5. **Pilot pertama read-only** — boleh ditanya, tak boleh menulis.

## Kalau Anda ingin mempercepat

Satu-satunya yang mempercepat adalah **menjawab E9/E10/E12** (19 harga bentrok,
81 harga draft, 2 edisi AHSP kosong). Sesudah itu Gelombang 2 dan 3 adalah
pekerjaan saya, dan Gelombang 4 butuh akun WA Business Anda.

Kalau Anda mau AI lebih awal dari urutan ini, katakan — tapi saya sarankan
tidak, dengan alasan di bagian atas: AI di atas data yang bolong menjawab
dengan percaya diri dan salah.

---

# 📊 SELURUH `/docs`: apa yang belum dikerjakan — diukur 2026-08-07

> Menjawab "dari seluruh yang ada di /docs apa yang belum dikerjakan?".
> Dihitung dari **kolom Status** taksonomi (satu-satunya dokumen yang
> statusnya diverifikasi ke kode dan dijaga CI), lalu tiap item merah
> dicocokkan ke triase F5-1.

## Taksonomi: 191 baris menu

| Status | Jumlah |
|---|---|
| ✅ selesai end-to-end | **84** |
| 🟡 sebagian | 58 |
| 🔴 belum | **38** |
| 🔵 skema-mati | 5 |
| ⛔ dicoret | 6 |

## Ke-38 yang "belum" — nol di antaranya INTI

| Golongan | Jumlah | Artinya |
|---|---|---|
| **JANGAN DIBANGUN** | **11** | Keputusan 2026-08-01, bukan utang. Payroll/BPJS/PPh 21 (aturan pajak berubah tiap tahun; salah hitung = urusan hukum), rekonsiliasi bank & tutup buku (software akuntansi lebih baik), report builder (membangun Excel di dalam ERP), 4 item HRIS. |
| **TUNDA** | **25** | Berguna, tapi **belum ada pemakai nyata yang menunggunya**. Membangunnya berarti menebak bentuk — dan bentuk yang salah lebih mahal daripada belum ada. CHARTER: tak dikerjakan sampai ada pemicu tertulis. |
| **PEMBEDA** | **2** | CVR & tracking waste — ditunda dengan **angka**, bukan dengan diam (lihat di bawah). |
| **INTI** | **0** | Habis. Kesembilannya selesai. |

## Dua PEMBEDA yang ditunda, dan angkanya

**CVR** — sisi "nilai terpasang" sudah ada (373 `rab_items`), sisi "biaya
terpakai" belum:

    project_expenses      0 baris    <- sumber yang seharusnya dipakai
    goods_receipts        8 baris    biaya nyata tersebar di sini,
    progress_payments     5 baris    tanpa cost code yang mengikat

Layar CVR di atas nol baris akan **selalu menampilkan nol** — dan nol di layar
rekonsiliasi biaya tak terbaca "belum ada data", melainkan "tidak ada
selisih". Prasyaratnya bukan kode melainkan pemakaian.

**Tracking waste rencana-vs-nyata** — `waste_factor > 0` hanya **1 dari
3.043** assemblies, dan tak ada jalur dari sana ke material RAB proyek.

Keduanya diukur ulang 2026-08-07: **angkanya tidak berubah** sejak penundaan
pertama.

## Kesimpulan

Yang tersisa bukan "pekerjaan yang belum dikerjakan", melainkan **pekerjaan
yang menunggu keputusan atau pemakai**. Daftar yang benar-benar menunggu Anda
ada di bagian berikutnya.

---

# 📋 YANG MENUNGGU ANDA — daftar lengkap, diukur 2026-08-07

> Dibuat menjawab pertanyaan "apa yang menunggu saya? seluruh pekerjaan semua
> fase udah selesai?". Jawabannya: **belum**, tapi sisanya sedikit dan
> sebagian besar bukan pekerjaan saya.

**QUEUE: 47 dari 52 selesai.** Lima sisanya:

| Item | Status | Menunggu siapa |
|---|---|---|
| **F7-1** langganan & batas paket | wip | **ANDA** — 4 pertanyaan di bawah |
| **F4-2** lapis data terpusat | wip | **ANDA** — pilih pustaka (93 dari 96 halaman kena) |
| **F7-2** SSO | blocked | otomatis lepas begitu F7-1 selesai |
| **SITUS-2** halaman jual ERP | todo | **ANDA** — materi jual: screenshot, cerita, harga |
| **SITUS-3** foto 2 kategori | todo | **ANDA** — berkas asli tak ditemukan |

**Ratifikasi yang masih terbuka:**

| | Perkara | Mendesak? |
|---|---|---|
| **R-006** | `pg_dump` mati — butuh Supabase Support | Sedang. Data **ada cadangannya** (diuji hari ini: 147 tabel, 58.430 baris), tapi pemulihan lewat jalur resmi masih mustahil |
| **R-007** | Bentuk grup/holding: eliminasi, transfer alat, harga transfer | Rendah — belum ada pelanggan multi-PT |

**Yang TIDAK menunggu Anda** — sudah selesai dan terjaga:
Fase 0–6 penuh, INTI 9/9, PEMBEDA 10/12 (dua ditunda dengan angka: CVR butuh
`project_expenses` terisi, tracking-waste butuh `waste_factor` > 1 dari 3.043),
73 penjaga CI hijau, 1.797 test API + 389 web lulus.

---

# ❓ MENUNGGU ANDA — bentuk langganan & batas paket (F7-1)

> Satu-satunya hal yang tersisa sebelum produk bisa dijual. Sisa F7-1
> (provisioning tenant) sudah selesai dan diuji.

**Diukur 2026-08-07: NOL tabel langganan** di skema aplikasi. Yang muncul
sebagai `subscription` di statistik milik skema `realtime` bawaan Supabase —
bukan punya kita.

Saya **tidak membangunnya**, dan itu disengaja. Tabel langganan tanpa jawaban
atas empat pertanyaan di bawah berarti menebak bentuk — dan bentuk yang salah
lebih mahal daripada belum ada: ia harus dirawat selamanya sambil menghalangi
bentuk yang benar.

### Empat yang perlu Anda putuskan

| # | Pertanyaan | Kenapa ini menentukan skema |
|---|---|---|
| 1 | **Paket apa saja?** | Satu paket = kolom di `companies`. Banyak paket = tabel `paket` + `langganan` tersendiri. |
| 2 | **Batas apa yang DITEGAKKAN?** | Jumlah proyek? pengguna? penyimpanan? Tiap batas butuh penghitungnya sendiri, dan penghitung yang tak dipakai adalah beban. |
| 3 | **Siklus tagih** | Bulanan? tahunan? per-proyek? Ini menentukan apakah butuh tabel periode atau cukup tanggal di langganan. |
| 4 | **Apa yang terjadi saat lewat batas?** | Tolak? peringatkan? tagih kelebihan? Ini yang paling menentukan — dan yang paling mudah salah dibangun. |

### Rekomendasi saya, kalau Anda ingin yang paling murah dulu

Mulai dari **satu paket, satu batas, peringatkan-jangan-tolak**:

- kolom `paket` + `batas_proyek` di `companies` — tanpa tabel baru
- penghitung proyek aktif per company (sudah bisa dihitung dari `projects`)
- lewat batas → spanduk peringatan, bukan penolakan

Alasannya: menolak pembuatan proyek karena batas adalah keputusan yang
membuat pelanggan berhenti bekerja, dan itu perlu diuji dengan pelanggan
nyata lebih dulu. Menagih kelebihan tanpa pernah menolak jauh lebih mudah
diperbaiki daripada sebaliknya.

Kalau Anda setuju arah ini, saya bangun lengkap dengan penjaganya. Kalau
tidak, sebutkan jawaban keempat pertanyaan di atas dan saya ikuti.

**Diam berarti dibiarkan** — F7-1 tetap `wip` dan produk belum bisa ditagih.

---

# ✅ SELESAI 2026-08-07 — tiga temuan pasca-merge, dan R-011 tanpa menaikkan plafon

> Sesi compro berhenti; ketiga temuan yang tak bisa saya sentuh saat itu kini
> selesai. Dicatat di sini karena satu di antaranya menyentuh **Gerbang Keras
> G-5**, dan Anda yang memutuskan jalannya.

### 1. Ratchet supabase mentah 373 → **366** (tepat di plafon, plafon TIDAK dinaikkan)

`GET /api/v1/public/situs` memakai tujuh query mentah. Alasannya sah — endpoint
publik tak punya sesi, jadi `auth_company_id()` NULL dan wrapper tak punya
konteks. Tapi `PLAFON_R011` tak menerima alasan; itulah gunanya.

**Keputusan Anda: bangun VIEW.** Hasilnya `v_situs_publik` (migrasi 209):

| | Sebelum | Sesudah |
|---|---|---|
| Query di endpoint publik | 7 | **1** |
| Akses supabase mentah (total repo) | 373 | **366** |
| Penyaringan `tampil`/`aktif` | diulang tiap query | sekali, di skema |
| Kolom yang boleh publik | tersebar di 7 `select` | terkunci di definisi view |

Satu akses lagi dihabiskan di tempat terpisah: `menu.ts` membaca `menu_items`
(kategori A, katalog bersama) di belakang `authenticate` — diganti
`db.shared('menu_items')`, yang hanya menerima kategori A/AB sehingga niat
"ini memang global" jadi diperiksa compiler.

### 2. Enam kegagalan senyap di `situs.ts` — sudah Anda perbaiki sendiri

Commit `696acac`. Tak ada yang perlu dikerjakan lagi.

### 3. Tiga penjaga web dari `pengaturan/situs/page.tsx`

Ketiganya selesai. Yang `hex-ratchet` ternyata bukan soal token: dua hex itu
**nilai default warna merek yang menduplikasi `DEFAULT` kolom di migrasi 205**.
Dua sumber kebenaran untuk satu nilai, dan yang salah adalah yang terlihat
pengguna. Diganti string kosong — defaultnya kini hanya ada di skema.

### Dua cacat yang ikut ketahuan, dan diperbaiki di generatornya

**`gen-tenant-map.mjs` tak pernah melihat VIEW.** `table_type='BASE TABLE'`
mengecualikannya, jadi view apa pun tak akan pernah terklasifikasi — dan
`tenancy-ratchet` memeriksa setiap nama yang dibaca lewat `.from()`, termasuk
view. Sekarang view ikut.

**Dan klasifikasinya salah begitu ikut.** View tak punya constraint, jadi
`information_schema` selalu melaporkan `is_nullable = YES` — yang oleh aturan
lama berarti **AB (katalog bersama)**. Setiap view akan salah dikategorikan
sebagai data yang boleh dibaca lintas tenant. Sekarang: view ber-`company_id`
→ B, tanpa → D (butuh keputusan sadar). `critical_audit_events` yang sudah ada
sejak lama ikut terklasifikasi untuk pertama kalinya.

Salah kategori di gerbang tenancy lebih berbahaya daripada tak terklasifikasi:
yang kedua merah di CI, yang pertama diam.

### Keadaan sekarang

    168 berkas test, 1786 lulus, 2 dilewati, 0 gagal
    seluruh penjaga CI hijau (API + web)
    pnpm build web lolos

---

# 📌 SERAH-TERIMA SESI UI — 2026-08-07, dibaca SEBELUM melanjutkan

> **Untuk sesi mana pun yang melanjutkan di `feat/sumbu-ui-roadmap`.**
> Sesi UI selesai penuh dan sudah digabung. Tak ada pekerjaan menggantung,
> tak ada worktree yang perlu ditunggu. Tapi **tiga hal berubah** yang bisa
> membuat pekerjaan Anda merah kalau tak diketahui.

### 1. `globals.css` — token navy mode gelap berubah

```
--navy         #5FA9FF → #4D9FFF      (founder: "terlalu terang")
--navy-mid     #6EB3FF → #5FA9FF
--navy-light   alpha 0,12 → 0,06
--navy-glow    alpha 0,10 → 0,08
```

Kalau Anda sedang menggarap berkas ini dari salinan lama, **baca ulang
sebelum menulis**. Alasan lengkapnya ada di komentar di atas barisnya —
riwayatnya bolak-balik (`#4D9FFF` → `#5FA9FF` → `#4D9FFF`) dan tiap arah
punya sebab berbeda. Jangan menyimpulkan dari nilainya saja.

Yang menyelesaikan bukan terang teksnya, melainkan **alpha latarnya**:
pasangan paling ketat adalah teks `--navy` di atas lencana `--navy-light`,
yang warnanya komposit. Menipiskan lencana memberi cadangan setara (4,84
vs 4,88) sambil mengembalikan navy dua tingkat lebih gelap.

### 2. Empat ambang `lint-ratchet` DIKENCANGKAN

```
@typescript-eslint/no-explicit-any            180 → 100
react-hooks/set-state-in-effect                68 →  58
jsx-a11y/no-static-element-interactions        68 →  66
jsx-a11y/label-has-associated-control          22 →  21
```

Kode baru ber-`any` yang dulu lolos **sekarang merah**. Menaikkan ambang
kembali butuh ratifikasi (Gerbang Keras G-5).

`set-state-in-effect` turun 10 karena pola baru: **saringan dioper lewat
parameter**, bukan dibaca dari closure — `useEffect(() => { void load(f); },
[f])`. Itu membuat `set-state-in-effect` DAN `exhaustive-deps` sama-sama diam
tanpa satu pun `eslint-disable`. Pakai pola itu untuk halaman baru.

### 3. Dua penjaga BARU di CI

| Penjaga | Lantai | Yang dijaga |
|---|---|---|
| `tabel-mentah-ratchet.mjs` | 8 halaman | halaman baru wajib `<Tabel>` dari `@/components/dasar`, bukan `<table>` mentah |
| `kerapatan-ratchet.mjs` | 358 | padding/gap ≥16px wajib lewat token (`--pad-kartu`, `--gap-grid`, `--gap-bagian`) |

Keduanya sudah menangkap pelanggaran nyata: `tabel-mentah` menangkap
`keuangan/contingency/page.tsx` — halaman yang ditulis **sesudah** penjaganya
dipasang. Itu memang gunanya.

**Cara cepat memeriksa sebelum commit:**
```bash
cd apps/web
node scripts/kerapatan-ratchet.mjs
node scripts/tabel-mentah-ratchet.mjs
node scripts/lint-ratchet.mjs
```

---

# ✅ R-012 · DIPUTUSKAN 2026-08-07 — arah visual 2026 + roadmap UI terpisah

Dokumen lengkap: [`docs/design/ARAH-VISUAL-2026.md`](../design/ARAH-VISUAL-2026.md)
Antrean kerjanya: [`docs/execution/QUEUE-UI.yaml`](QUEUE-UI.yaml)

## Jawaban founder — dan dua usul saya yang ditolak

| # | Pertanyaan | Usul saya | **Keputusan founder** |
|---|---|---|---|
| 1 | Warna aksen | Indigo `#6366F1` | ❌ **DITOLAK** — *"sudah lumayan cocok dengan warna ini"*. Navy `#003366` tetap aksen tunggal. **UI-0-2 dicoret.** |
| 2 | Sidebar gelap `#0B1220` permanen | Ya | ❌ **DITOLAK** — *"tergantung pada mode-nya, dark atau light"*. Sidebar ikut tema, seperti sekarang. **UI-0-3 dicoret.** |
| 3 | Pecah tab jadi halaman | Ya untuk keuangan/mandor/kas | ✅ **SETUJU** — tapi keuangan **sudah dikerjakan** sesudah dokumen ditulis (3.449 → 523 baris, 5 sub-halaman). Sisa: mandor + kas. |
| 4 | Halaman contoh mana dulu | Dashboard | ✅ **SETUJU** |

Cara kerja: *"autopilot dan berurutan"* — seluruh antrean dijalankan tanpa
berhenti per item, tiap sektor ditest dan diaudit.

## Yang dikerjakan sesudah keputusan turun — 2026-08-07

| | Sebelum | Sesudah |
|---|---|---|
| halaman ber-`<table>` mentah | 28 | **13** |
| tabel mentah | 63 | **44** |
| `mandor/page.tsx` | 3.848 baris | **324** |
| `kas/page.tsx` | 1.537 baris | **398** |
| modal tanpa jalan keluar Esc | 2 | **0** |

Penjaga baru: `tabel-mentah-ratchet.mjs` (terbukti bisa merah lewat mutasi,
terdaftar di CI). Test baru: `dasar.test.tsx` — 13 test untuk berkas yang
memuat `Tabel<T>` dan sebelumnya **tak punya test sama sekali**, padahal
seluruh argumen UI-0-4 bersandar pada klaim komentarnya.

Verifikasi: `vitest` 21 berkas / 216 test lulus · `tsc --noEmit` bersih ·
8 dari 9 penjaga visual hijau. Yang merah `tata-letak-ratchet`, pelanggarnya
`keuangan/contingency/page.tsx` — halaman milik sesi lain, tidak disentuh.

### Cacat yang ketahuan justru karena dipindahkan

- `TabelSewa` di `/aset` **tak punya kepala baris sama sekali** — pembaca
  layar membacakan "Rp 12 jt" tanpa menyebut alat mana yang menagihnya
- Neraca saldo memakai kode akun `1122` sebagai nama baris, padahal halaman
  itu sendiri menulis *"kontraktor tak menghafal 1122"*
- `/procurement/rfq` memetakan harga ke kolom vendor lewat **urutan array**
  sementara headernya dari sumber lain — kalau API mengubah urutan, harga
  vendor A muncul di kolom vendor B tanpa satu pun tanda. Pada tabel
  pembanding penawaran, itu salah pilih pemenang tender
- `/proyek/keterlambatan` mendefinisikan kolom bersyarat di **dua tempat** —
  bentuk yang melahirkan header dan body berselisih diam-diam

### Cacat visual yang hanya ketahuan dengan MELIHAT

Tangkap layar dashboard (kedua mode) menunjukkan dua widget memotong isinya
di tengah huruf. Bukan sekadar jelek — baris terpenggal terbaca sebagai
halaman rusak, bukan "ada lagi di bawah", jadi orang berhenti menggulir.
Pada widget Milestone yang isinya semua tenggat mendekat, itu berarti
**menyembunyikan tenggat**.

## ✅ TERJAWAB 2026-08-07 — kode mati di `/mandor`

Founder memilih **opsi 1: hapus**, dengan alasan *"mandor sudah punya
portal"*. Dikerjakan hari itu juga: 30 cabang `isMandor` di 5 berkas +
`mandor/kasbon-saya/page.tsx`.

Sebelum menghapus, dua hal **dibuktikan** — bukan diasumsikan:

- nol tautan masuk ke `kasbon-saya` dari mana pun
- `/mandor-portal/kasbon` memakai endpoint yang **sama** (`/api/v1/kasbons`)
  dan bisa mengajukan, bahkan lewat `kirimLapangan` yang mendukung mode
  offline — jadi fungsinya tidak hilang, ia sudah ada di tempat yang benar

`pm-portal/layout.tsx` punya `isMandor` juga tapi **tidak disentuh**: di sana
peran mandor memang bisa masuk, jadi cabangnya hidup.

### Yang lebih penting, ditemukan saat membuktikan cabang itu mati

`middleware.ts` memperlakukan role **KUSTOM** berbeda: ia hanya memblokir
tiga portal (`/portal`, `/mandor-portal`, `/pm-portal`). Rute lain **bebas**,
termasuk `/mandor`.

Artinya peran kustom baru tanpa `mandor:assign` bisa membuka layar admin itu
dan melihat seluruh mandor, upah, dan kasbon lintas-proyek. Selama ini cabang
`isMandor` menutupinya **secara tak sengaja** — ia menyembunyikan bagian layar
dari yang tak punya permission itu. Menghapusnya melenyapkan penutup itu.

Penutup tak sengaja diganti yang disengaja:
`apps/api/scripts/uji-peran-lihat-layar-admin.mjs` — peran yang bisa membuka
layar admin wajib punya permission-nya. Di-mutation-test: peran kustom tanpa
`mandor:assign` membuatnya merah.

## Dua koreksi terhadap dokumen — saya salah, kenyataan menang

**1. Dark mode BUKAN pekerjaan baru. Ia sudah ada dan jalan.**

Saya sempat melapor "dark mode belum ada sama sekali" berdasar
`grep "dark:" apps/web/app` → 0 berkas. **Alat ukur itu salah**: ia mencari
utility class Tailwind, sementara repo ini memakai strategi CSS variable.
Yang sebenarnya ada, diukur 2026-08-07:

| Bagian | Bukti |
|---|---|
| Token gelap lengkap | `app/globals.css:471` — blok `.dark` |
| Provider | `components/theme-provider.tsx` (`next-themes`) |
| Terpasang di root | `app/layout.tsx:58` |
| Tombol toggle | `components/theme-toggle.tsx` → `components/topbar.tsx:199` |
| Sudah diaudit WCAG | `kontras-ratchet.mjs` — 38 pasangan lulus **di kedua mode** |

Bahkan ada riwayat perbaikan bug mode gelap (`--danger` `#EF4444` → `#F87171`
→ `#FB8585`) yang ditemukan penjaga karena axe hanya menguji mode terang.

**Konsekuensi mengikat:** tiap token baru yang ditambahkan pekerjaan ini
WAJIB punya pasangan `.dark`, dan `kontras-ratchet` wajib tetap hijau.

**2. `2026-08-06-sumbu-ui-roadmap.md` bukan dokumen perombakan visual.**

Judulnya menyebut "Sumbu UI/UX", tapi header dokumennya sendiri mengoreksi:
isinya penjaga CI untuk *status dokumen vs kode*. Ketiganya **sudah selesai**
(`869bc60`, `defb8c5`, `4b7df3b`). Perannya di pekerjaan ini adalah **penjaga
yang wajib tetap hijau**, bukan pedoman visual.

Pedoman visual yang mengikat hanya: `ARAH-VISUAL-2026.md` + `QUEUE-UI.yaml`.

## Diagnosis — angka, bukan perasaan

Founder: *"kurang dapet wah-nya, kurang punya taste"*. Diukur 2026-08-04:

**Masalahnya bukan warna atau font.** Yang ada sudah baik: navy `#003366`
adalah merek Anda, dan fontnya **bukan Inter** (Bricolage Grotesque + Plus
Jakarta Sans — lebih berkarakter daripada rekomendasi mesin desain).

Tiga hal yang terukur:

```
1. TERLALU LONGGAR, BUKAN KURANG TASTE
   padding kartu     24px  (standar data-dense: 12px)  ← 2x
   font tabel       9-11px (standar: 12-14px)          ← terlalu kecil
   → banyak ruang putih dengan tulisan kecil = terasa lemas

2. MONOTON KARENA TAK ADA LAPISAN
   20 dari 22 menu induk = SATU halaman saja
   → klik menu apa pun, langsung tabel. Semuanya terasa sama.

3. TAB MENYEMBUNYIKAN APLIKASI DI DALAM HALAMAN
   keuangan  3.449 baris · ~8 tab
   mandor    3.667 baris ·  7 tab
   → halaman 3.400 baris bukan halaman; itu aplikasi di balik tab
```

## Jawaban atas tiga pertanyaan roadmap Anda

**"Sudah sampai mana?"** — 38 dari 43 item selesai (88%). Sisa lima: F4-2
(`wip`), F6-1/F7-1/F7-2 (`blocked`, gerbangnya jelas), plus INTI #1/#7/#8/#9.

**"Sudah perfect?"** — **Tidak.** Tiga hal yang saya tahu belum beres:
1. **Coverage API 31,98%** — standar senior 70–80%. Ini yang paling jauh.
2. **F4-2 setengah jalan** — 56 halaman masih pakai pola data lama.
3. **R-006** — `pg_dump` rusak, menunggu tiket Supabase dari Anda.

**"Semua docs sudah masuk antrean?"** — **Ya, dan terjaga otomatis:**
```
263 dokumen · 33 disebut ROADMAP · 230 terdaftar di INDEKS-DOKUMEN
  0 RENCANA TERLANTAR   (penjaga audit-docs-vs-roadmap, merah kalau ada)
```

**"Kematangan perencanaannya perfect?"** — **Belum**, dan lubangnya:
- Fase 5 baru 4 item padahal triase mengidentifikasi **43 pekerjaan**
- **Nol item UI/UX di seluruh roadmap** ← ini yang membuat saya bisa
  membangun 5 modul tanpa UI tanpa satu pun penjaga protes
- Coverage tak punya item untuk dinaikkan dari 32%

Roadmap-nya matang untuk **fondasi**; ia **buta terhadap produk yang dilihat
orang**. `QUEUE-UI.yaml` + penjaga `UI-3-1` menutup lubang itu.

---

# ✅ R-011 · DIRATIFIKASI 2026-08-04 — ratchet akses mentah 364 → 366, **sekali saja**

Founder: **"okee saya setuju dengan mu, lanjutkan"**, menanggapi rekomendasi
"terima sekarang, bayar dengan tripwire".

## Yang mengikat sebagai akibatnya

**Ini kenaikan PERTAMA dan TERAKHIR.** Yang memastikan bukan ingatan siapa pun,
melainkan penjaga yang menjaga penjaga:

```
apps/api/src/routes/v1/__tests__/tenancy-ratchet.test.ts
  const PLAFON_R011 = 366
  it('TRIPWIRE R-011 — ambangnya sendiri tidak boleh dinaikkan lagi')
```

**Terbukti bisa merah** (mutasi 366 → 370):

```
× TRIPWIRE R-011 — ambangnya sendiri tidak boleh dinaikkan lagi
  → AMBANG_SUPABASE_MENTAH dinaikkan jadi 370, melewati plafon 366
    yang ditetapkan R-011.
```

Pesan galatnya menunjuk ke **jalan keluar**, bukan ke tombol "naikkan sedikit
lagi": bangun VIEW database yang mengagregasi + menjamin tenancy di lapisan SQL,
lalu baca lewat `request.db`. Query mentahnya hilang, dan angkanya justru
**turun**. Kandidat pertama sudah diketahui: `v_retensi_subkontrak` untuk
`GET /mandor/retensi-register`.

## Kenapa tripwire, bukan langsung dibangun view-nya

Dua sudut pandang memberi jawaban berbeda, dan keduanya sah:

| Sudut | Jawaban |
|---|---|
| **Engineer** | Tolak. Bukan karena dua angka itu besar, tapi karena presedennya — begitu satu kenaikan diterima dengan alasan bagus, berikutnya cuma perlu alasan yang sama bagusnya, dan alasan selalu ada |
| **Pengusaha** | Terima. Enam dari sembilan INTI masih terbuka, belum ada pelanggan membayar, dan 2 jam untuk kerapian yang tak dilihat pelanggan adalah salah prioritas |

Tripwire menggabungkan keduanya: bisnisnya jalan sekarang, dan disiplinnya
dijaga **mekanisme**, bukan niat.

---

**Isi usul aslinya, disimpan apa adanya:**

## Apa yang berubah

`AMBANG_SUPABASE_MENTAH` di `tenancy-ratchet.test.ts`: **364 → 366**.

Ratchet ini menghitung query `supabase` mentah (yang melewati wrapper sadar
tenant). Sejarahnya **hanya pernah turun**: 468 → 459 → … → 364. Ini kenaikan
pertama.

## Kenapa naik

Dua endpoint baru di `mandor.ts`, keduanya menyentuh tabel `work_scopes`:

| Endpoint | Guna |
|---|---|
| `GET /mandor/retensi-register` | melihat retensi mandor yang tertahan vs dicairkan |
| `POST /mandor/retensi-releases` | mencairkan retensi ke mandor |

`work_scopes` **kategori C** — tenancy-nya lewat rantai FK, bukan kolom
`company_id`. Versi pertama saya memakai `request.db!.from('work_scopes')` dan
**penjaga tenancy menolaknya dengan benar**:

> *"'work_scopes' mewarisi tenancy lewat project — pakai `db.viaProject(...)`.
> Tanpa project_id, query ini akan mengembalikan baris milik tenant lain."*

`viaProject()` juga tak bisa dipakai: kedua rute bekerja **per scope**, dan
`project_id`-nya justru yang sedang dicari lewat scope itu. Jalur yang tersisa
adalah akses mentah + gerbang eksplisit `scopeIdsTenant(request)` — pola yang
dokumentasi ratchet-nya sendiri sebut sah (`.in(...)` untuk rute lintas-proyek).

## Dua hal yang dicoba lebih dulu

Saya tidak langsung menaikkan angkanya:

1. **Query `progress_payments` tersendiri DIGABUNG** jadi embed di
   `work_scopes` — menghapus satu akses mentah (367 → 366). Bonusnya: rantai
   tenancy jadi satu, bukan dua yang masing-masing bisa lupa dipasang.
2. **Seluruh repo disapu** mencari query mentah pada tabel **kategori B** yang
   bisa dialihkan ke `request.db` sebagai penebus. Hasilnya **nol** — hutang
   kategori B sudah bersih; yang tersisa memang kategori C yang sah.

## Yang TIDAK dilakukan

- Gerbang tenant **tidak** dilonggarkan — `scopeIdsTenant` tetap dipanggil di
  kedua endpoint, dan test membuktikannya.
- Penjaga lain **tidak** disentuh. `lint:ratchet` dan `audit-kegagalan-senyap`
  sempat merah karena kode ini, dan **keduanya saya perbaiki di sumbernya**:
  `no-explicit-any` 234 → di bawah ambang, kegagalan senyap **187 → 184**
  (turun, karena satu cacat lama ikut ketemu dan diperbaiki).

**Cara membatalkan:** tulis `TOLAK R-011`. Saya rancang ulang kedua endpoint —
kemungkinan besar dengan memindahkan agregasinya ke view database, yang
menghilangkan query mentahnya sama sekali.
---

# ✅ R-010 · DIRATIFIKASI 2026-08-04 — definisi INTI / PEMBEDA / TUNDA

Founder: **"okee setujuuu"**, menanggapi usulan definisi di F5-1 §1.

CHARTER §3 menyebut ketiga golongan ini sebagai gerbang Fase 5 tanpa pernah
mendefinisikannya. Sejak sekarang **definisi di bawah yang berlaku**, dan
`docs/execution/F5-1-TRIASE-SUBMENU.md` adalah penerapannya.

## Definisi yang mengikat

**INTI — tanpa ini produk tidak bisa dijual.**
Ujinya satu kalimat: *kalau demo berhenti di sini, apakah calon pelanggan
pergi?* Bukan "yang paling sering dipakai" — fitur harian yang punya jalan
memutar (ekspor Excel, WhatsApp) menyakitkan tapi tak mematikan transaksi.

**PEMBEDA — alasan memilih kita, bukan pesaing.**
Menaikkan salah satu Lima Pembeda ERP kontraktor (`PETA-PRIORITAS-ERP.md` §6):
cost control berlapis · EVM · WIP/PSAK · rekonsiliasi material · rantai kontrak.
Tanpanya produk tetap bisa dijual, tapi bersaing pada harga melawan software
akuntansi umum — pertarungan yang tak bisa dimenangkan aplikasi baru.

**TUNDA — berguna, tapi tak ada yang menunggunya.**
Membangunnya berarti menebak bentuknya, dan bentuk yang salah lebih mahal
daripada belum ada: ia harus dirawat selamanya sambil menghalangi bentuk yang
benar. Tiap item TUNDA **wajib punya pemicu tertulis**.

**Aturan urutan:** INTI habis dulu, baru PEMBEDA. TUNDA tak dikerjakan sampai
pemicunya nyata.

## Yang mengikat sebagai akibatnya

| Golongan | Jml | |
|---|---|---|
| INTI | 7 (+2 penyempurnaan 🟡) | dikerjakan lebih dulu |
| PEMBEDA | 11 (+1 penyempurnaan 🟡) | sesudah INTI habis |
| TUNDA | 25 | menunggu pemicu masing-masing |
| JANGAN DIBANGUN | 11 | keputusan 2026-08-01 |
| **54** | | nol hilang, nol ganda — dijaga `audit-triase-submenu.mjs` tiap CI |

**Cara membatalkan:** tulis `TOLAK R-010` + definisi Anda. Isi ketiga daftar
akan disusun ulang; penjaganya tak perlu diubah.

## Koreksi yang menyertainya

Saat menyiapkan ratifikasi ini, dua klaim saya sebelumnya terbukti salah dan
sudah diperbaiki di dokumen — dicatat di sini supaya tak dicari lagi:

| Klaim saya | Kenyataan |
|---|---|
| *"INTI #1 terblokir R-001"* | **SALAH.** R-001 sudah SELESAI; ketiga tabel GL punya `company_id`; 7 endpoint + halaman akuntansi hidup. Yang belum hanya neraca & L/R — bobot turun L → M |
| *"93 sub-menu"* (judul QUEUE), lalu *"64"* (versi pertama triase) | Keduanya salah. Yang benar **54**, dihitung dari **kolom Status** |

---

# ✅ B-1 & B-2 SELESAI — repo dijadikan publik (keputusan founder 2026-08-03)

Anda memilih opsi B. **Keduanya langsung teratasi**, dan keduanya sudah terbukti
bekerja — bukan diasumsikan.

## Pemeriksaan keamanan SEBELUM repo dibuka

Menjadikan repo publik tak bisa dibatalkan secara praktis: seluruh histori jadi
permanen terlihat dan bisa disalin siapa pun. Audit sebelumnya hanya memindai
berkas ter-track di HEAD, **belum pernah** `git log -p`. Jadi itu dijalankan dulu:

| Yang dicari di SELURUH histori | Hasil |
|---|---|
| Berkas `.env` pernah ter-commit | **tidak pernah** (hanya `.env.example`) |
| Kunci JWT/Supabase (`eyJ…`) | **0** |
| `sb_secret_` / `sbp_` | **0** |
| Connection string ber-password | hanya placeholder `[YOUR-PASSWORD]` |
| VAPID private key | hanya `your_vapid_private_key_here` |
| Token GitHub/Slack/AWS/OpenAI | **0** |

Satu hal yang memang terbuka: **ref project Supabase dev** (`tgozokxyvwmyvajgqfxw`)
muncul di 13 berkas. Itu **bukan kredensial** — dan tidak bisa dipakai tanpa kunci:
anon/publishable key tidak pernah ter-commit, dan **RLS aktif di 122/122 tabel**.
Risikonya rendah; yang terekspos hanyalah *nama* infrastruktur, bukan aksesnya.

## B-1 — Actions kini benar-benar berjalan

Sebelum: job selesai 2–12 detik, `steps: []`, `runner_name: ""`, log 22 byte.
Sesudah (run 30759365545): berjalan **~2,5 menit**, runner ditugaskan
(`GitHub Actions 1000000967`), **32 langkah** dieksekusi.

**4 dari 5 job HIJAU** — Web, Dokumentasi, Keamanan, Browser. Satu gagal, dan
justru itu yang berharga (lihat R-001 di bawah).

## B-2 — Branch protection aktif dan TERBUKTI memblokir

```
strict: true · 5 check wajib · force_push: false · deletions: false
```

Bukti ia benar-benar bekerja, bukan sekadar terpasang: PR #133 yang CI-nya merah
berubah status dari `MERGEABLE` → **`BLOCKED`**.

Catatan: `enforce_admins` sengaja **false** — Anda tetap bisa menerobos bila
benar-benar perlu. Bilang saja kalau ingin dikencangkan.

---

# 💡 B-3 · USUL — pindahkan region project CI Supabase

**Bukan gerbang; ini usul berdasar pengukuran.** Pekerjaan lain jalan terus.

CI lambat, dan setelah diukur penyebabnya bukan yang saya duga maupun yang Anda
duga. Suite test = **91% durasi job** (1203s dari 1317s), dan isinya bukan
perhitungan berat melainkan **menunggu jaringan**:

```
1 round-trip ke database   : 0,02 detik
100 round-trip             : 2,12 detik   (≈21 ms per query)
≈6.000 round-trip per suite (integration test thd Postgres nyata, by design)
```

Yang membuatnya 10× lebih lambat di CI daripada di laptop Anda:

| | Lokal | CI |
|---|---|---|
| Durasi suite | ~230 detik | **1203 detik** |
| Lokasi database | Singapura (`ap-southeast-1`) | **Tokyo (`ap-northeast-1`)** |
| Lokasi mesin CI | Indonesia | **Amerika (US-East)** |

Setiap dari ~6.000 query di CI menyeberangi Samudra Pasifik, dua arah.

**Usul:** buat ulang project Supabase CI di region dekat runner GitHub
(mis. `us-east-1`), lalu perbarui secret `CI_*`. Perkiraan: **1203s → ~250s**,
**tanpa menyentuh satu baris test pun**.

Itu lebih besar daripada seluruh hasil sharding, dan tanpa risiko isolasi.

**Kenapa saya tidak mengerjakannya:** membuat/memindahkan project Supabase ada di
dashboard Anda, di luar repo. Kalau Anda setuju, saya siapkan langkahnya.

**Risiko:** project CI berisi **nol data berharga** — ia memang dibangun ulang
dari nol tiap kali (`setup-clean`). Jadi biaya pembatalannya nol.

---

# ✅ SUDAH DIJALANKAN — tinggal dikonfirmasi

## R-001 · P0 · SELESAI (opsi A + ketiga syarat)

**Migrasi 047 dipensiunkan** menjadi no-op berkomentar. Berkasnya sengaja tidak
dihapus — nomor 047 sudah tercatat di buku migrasi, menghapusnya membuat buku
menunjuk ke sesuatu yang tak ada.

**Syarat 1 — periksa DB CI lebih dulu. SUDAH DIJALANKAN.**

Begitu Actions hidup, `ci-periksa-bentuk-gl.mjs` dijalankan terhadap project CI
yang sesungguhnya. Hasilnya **membuktikan cacat P0 ini nyata, bukan teoretis**:

```
accounts               ADA · 0 baris · company_id=TIDAK · ⚠️ penanda 047 (account_type)
journal_entries        ADA · 0 baris · company_id=TIDAK
journal_entry_lines    ADA · 0 baris · company_id=TIDAK
buku migrasi: 047=TERCATAT · 167=tidak

VERDICT: C. ⚠️ `accounts` memakai bentuk 047 (TANPA company_id) — GL TENANT-BLIND.
```

Persis skenario yang saya perkirakan sesi lalu: **047 menang, 167 dilewati diam-diam.**
Dan CI utama gagal dengan galat yang sama akarnya:

```
HARD FAIL — migrasi GAGAL di LUAR allowlist: 167_gl_chart_of_accounts.sql
  column "company_id" does not exist
```

Karena verdict = kondisi C, fallback yang Anda tetapkan dijalankan:
**reset CI dari nol** (`-f action=setup-clean`). Aman — ketiga tabel berisi
**0 baris**, jadi nol data hilang.

Hasil reset: WIPE berhasil, replay berjalan, dan **047 + 167 + 175 LULUS
seluruhnya** (replay lolos melewati migrasi 125+). Perbaikan R-001 **terbukti
bekerja di lingkungan bersih** — bukan hanya di dev.

Replay kemudian berhenti di migrasi **137**, karena sebab yang sama sekali
berbeda dan sudah ada sebelum R-001 → lihat **F0-12** di bawah.

**Syarat 2 — migrasi penegas bentuk.** `175_gl_penegas_bentuk.sql`: gagal keras
bila `accounts` tanpa `company_id` atau masih punya `account_type`. Sengaja
**tidak menambal sendiri** — bila tabel sudah berisi baris dua perusahaan, tidak
ada cara mekanis memisahkannya (ADR-011).

Membangunnya menemukan **tiga cacat pada penegas itu sendiri**, semuanya ketahuan
karena diuji, bukan karena dibaca ulang:
1. Terlalu ketat — menuntut `company_id` di `journal_entry_lines`, padahal 167
   sengaja memberinya tenancy lewat induk. Penjaga yang salah melatih orang
   mengabaikan kegagalannya.
2. Buta schema — `to_regclass('public.…')` selalu memeriksa `public`. Uji negatif
   membuktikan ia **lolos** padahal bentuknya 047.
3. Pesan galat rusak (`malformed array literal`) sehingga diagnosisnya tertutup.

Uji akhir: positif (dev) LULUS · negatif (bentuk 047 di schema sementara) MENOLAK.

**Syarat 3 — sapu seluruh 171 migrasi.** `audit-tabrakan-definisi-tabel.mjs`
menemukan **13 tabel bertabrakan**. Kabar baiknya: **047↔167 satu-satunya yang
tak terjaga**. Yang lain sudah aman — dan `assets` (045↔149) menarik: repo ini
**sudah pernah** menyelesaikan cacat yang sama persis, lengkap dengan komentarnya.
Perbaikan R-001 mengikuti preseden itu.

Penjaga baru terpasang di CI: `CREATE TABLE IF NOT EXISTS` pada tabel yang punya
lebih dari satu pendefinisi wajib disertai penegas bentuk.

**Cara membatalkan:** `git revert` — hanya menyentuh berkas migrasi & skrip.
Belum ada data produksi, biaya pembatalan **nol**.

## R-003 · Rebase diterima; TIDAK merge ke main sebelum R-001 tuntas

Dipatuhi. Urutan yang Anda tetapkan (perbaiki pemicu CI → R-001 → baru merge)
diikuti. Rantai PR belum di-merge.

Catatan: langkah "baru merge" **tertahan B-1** — tanpa Actions, merge ke `main`
berarti menggabungkan tanpa verifikasi apa pun.

## R-004 · Penarikan rekomendasi `rekonsiliasi --tulis`

Berlaku. Penggantinya `ledger-diff.mjs` tanpa kemampuan menulis sama sekali.

## R-005 · TERJAWAB — saya salah, Anda benar menyuruh menyapu lebih luas

Sesi lalu saya menyimpulkan ketiga angka "hampir pasti bukan dari Cibuluh" lalu
berhenti. Kesimpulan yang benar: **belum saya cari di berkas lain.**

Disapu ke seluruh `_source/ahsp/`. **Ketiganya ketemu**, di
`Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm`:

| Angka | Lokasi | Makna |
|---|---|---|
| `1.657.839.590,39` | `REKAPITULASI!E15` | **TOTAL BIAYA** proyek (sebelum PPN) |
| `109,5` | `LAPORAN RAB!H114` | **volume m²** bata merah ½ batu |
| `7875` | `DINDING BATA MERAH!L41` | **jumlah buah** bata merah |

Terverifikasi silang: `109,5 × 146.308,162 = 16.020.743,74` ✅

**Kenapa berbeda dari Cibuluh:** dua proyek yang berbeda. Cibuluh = RAB gudang
nyata (Rp 3,63 M, 9 divisi). RAB Control = Engineering Estimate template SE-47
(Rp 1,66 M, 8 divisi). Bukan beda edisi, bukan subtotal-vs-total, bukan PPN.

**Temuan sampingan yang berguna:** baris PPN di dokumen itu berlabel **"PPN 11%"**
tapi pengalinya **0,12**, dan hasilnya cocok. Jadi model dua-angka yang dipakai
sistem memang **berasal dari praktik dokumen nyata** — bukan karangan.

Assertion belum ditambahkan (butuh harness `.xlsm` 117 sheet) → antrean F0-10.

## R-006 · `companies.ts` masuk gerbang Fase 1

Perintah Anda dilaksanakan: `F1-8` di `QUEUE.yaml`. **Fase 2 tidak dimulai
sebelum `companies.ts` punya coverage nyata**, termasuk uji 403 lintas-tenant.

---

# 🔴 TEMUAN BARU — F0-12 · rantai migrasi tak bisa di-replay dari nol

Ditemukan saat menjalankan `setup-clean` untuk R-001. **Bukan akibat perubahan
R-001** — justru sebaliknya, 047/167/175 lulus dengan bersih.

```
HARD FAIL — migrasi GAGAL di LUAR allowlist: 137_t9_pemilik_grup.sql
  137: 1 akar grup tanpa owner_user_id. Grup itu tak akan bisa menambah
       badan usaha baru dari UI.
```

**Akarnya, dilacak sampai selesai:**

1. Migrasi **126** membuat perusahaan pertama, mengisi `created_by` dari `v_admin`
   = "admin aktif tertua". Di database yang **baru di-wipe belum ada user sama
   sekali** — seed dijalankan **setelah** semua migrasi. Jadi `v_admin` = NULL.
2. Migrasi **137** mengisi `owner_user_id` dari `COALESCE(created_by, admin-tertua)`.
   Keduanya NULL.
3. Penjaga di 137 melempar — **dan itu benar**. Grup tanpa pemilik memang tak bisa
   menambah badan usaha lewat UI, dan tak ada jalan memperbaikinya dari dalam aplikasi.

**Penjaga 137 tidak boleh dilemahkan.** Yang salah bukan penjaganya, melainkan
urutan seed-vs-migrasi.

**Kelas cacatnya sama persis dengan 047:** hanya muncul di lingkungan yang dibangun
dari nol, tak pernah terlihat di dev yang tumbuh bertahap. Ini kedua kalinya dalam
satu sesi pola yang sama muncul — dan keduanya hanya ketahuan karena ada yang
benar-benar mencoba membangun ulang dari kosong.

**Belum saya perbaiki**: di luar cakupan yang Anda ratifikasi, dan perbaikannya
menyentuh urutan bootstrap yang punya beberapa pendekatan sah (seed user minimal
sebelum 126 · buat user sistem di 126 · longgarkan 137 untuk DB kosong). Masuk
antrean **F0-12**; saya kerjakan setelah ini kalau tak ada arahan lain.

---

# ✅ R-002 · SELESAI — 12 migrasi dicatat, semuanya terbukti fisik

Dijalankan setelah R-001 tuntas, persis urutan yang Anda tetapkan.

**Buku migrasi: 160 → 172 baris tercatat.**

Tiap baris dibuktikan dengan kueri katalog yang ditulis dan diperiksa **manusia**,
satu per satu, terhadap nama objek yang benar-benar ada di berkas migrasinya —
bukan diturunkan regex. Itu penting: seluruh migrasi 163–176 memakai DDL dinamis
(`DO $$`/`EXECUTE`), yang justru membuat parser lama menghasilkan verdict palsu
(cacat C-3).

Proses manual itu sendiri menangkap **dua kesalahan tebakan saya**: artefak 164
dan 174 sempat saya laporkan "tak ada" hanya karena saya menebak nama objeknya
salah. Kalau saya percaya tebakan pertama, dua migrasi yang nyata-nyata sudah
berjalan akan tercatat sebagai belum.

| Migrasi | Bukti fisik |
|---|---|
| 163 | body `trigger_calc_invoice_amount_due()` memuat `GREATEST(0,…)` |
| 164 | `trg_kasbon_approved_create_expense` + `trg_settle_borongan_deduct_cash` |
| 165 | fungsi kasbon→expense sadar-schema |
| 166 | trigger `protect_*_created_at` terpasang kembali |
| 167 | `accounts.company_id` (bentuk tenant-aware) |
| 168 | `fn_gl_wajib_seimbang()` + `trg_gl_wajib_seimbang` |
| 169 | constraint `posted_at` pada `journal_entries` |
| 170 | baris CoA ter-seed di `accounts` |
| 171 | permission ber-prefix `gl:` |
| 172 | policy pada `accounts` |
| 173 | policy **RESTRICTIVE** pada `accounts` |
| 174 | menu Buku Besar terdaftar |

**Dua migrasi SENGAJA tidak dicatat**, dan alasannya ditulis di alat supaya tak
dipertanyakan ulang:

- **175** — penegas bentuk. Hanya *memeriksa* dan melempar; **tidak membuat objek
  apa pun**. Tak ada artefak fisik yang bisa jadi bukti, jadi tak boleh diklaim terbukti.
- **176** — belum pernah dijalankan ke dev (`trg_isi_pemilik_grup_yatim` tidak ada
  di katalog). Mencatatnya berarti migrasi itu **dilewati selamanya**.

Alatnya (`scripts/db/catat-migrasi-terbukti.mjs`) **menolak menulis** bila ada
satu saja baris yang tak terbukti — bukan menulis sebagian lalu melapor.

**Cara membatalkan:** `DELETE FROM supabase_migrations.schema_migrations WHERE
version IN ('163',…,'174')`. Reversibel penuh; belum ada produksi.

---

## R-006 · P0 · Database TIDAK BISA dicadangkan — butuh tindakan Supabase

**Status:** menunggu founder · dibuka 2026-08-03
**Diukur ulang 2026-08-07:** fungsi yatimnya **MASIH ADA** (oid 2840878,
namespace 2840025 yang sudah hilang), jadi `pg_dump` tetap mati.

**Tapi datanya TIDAK tanpa cadangan.** `scripts/db/cadangan-darurat.mjs`
dijalankan hari ini dan berhasil:

    147 tabel · 58.430 baris · 105 detik

`COPY … TO STDOUT` tak pernah menelusuri `pg_depend`, jadi ia lolos dari
fungsi yatim itu. Yang TIDAK ikut: struktur — dipulihkan dari
`db/migrations/*.sql`.

Artinya ini **bukan lagi keadaan darurat tanpa jaring**, tapi tetap perlu
diselesaikan: perkakas pemulihan Supabase sendiri memakai `pg_dump`, jadi
pemulihan lewat jalur resmi masih mustahil.

### Yang terjadi

Database produksi **tidak bisa di-`pg_dump` sama sekali**:

```
pg_dump: error: schema with OID 2840025 does not exist
```

Lima varian diuji di CI (run 30839271860), **kelimanya gagal identik**: tanpa
filter, `--schema=public`, `--no-comments`, `--data-only`, `--schema-only`.

**Konsekuensinya melampaui cadangan harian.** Perkakas pemulihan Supabase juga
memakai `pg_dump`. Selama ini belum diperbaiki, pemulihan bencana **mustahil**.

Ini ketahuan **hanya karena F1-4 mengharuskan restore dijalankan sungguhan**,
bukan didokumentasikan. Kalau drill-nya cuma ditulis di runbook, kegagalan ini
baru terlihat pada hari yang paling buruk.

### Akarnya

Satu fungsi tertinggal di schema yang sudah dihapus:

| | |
|---|---|
| nama | `trigger_calc_retention_amount_probe()` |
| OID | 2840878 |
| `pronamespace` | 2840025 — **schema tak ada lagi** |
| isi | duplikat rumus retensi yang sudah hidup di `public` |
| dipakai | **nol** trigger · **nol** dependensi · **nol** referensi |

### Kenapa saya tidak bisa menyelesaikannya sendiri

Objeknya **tidak terjangkau DDL biasa** — semua jalan sudah diuji:

| Cara | Hasil |
|---|---|
| `DROP FUNCTION nama()` | ❌ `does not exist` |
| `DROP FUNCTION nama` (tanpa arg) | ❌ `could not find a function named` |
| `ALTER FUNCTION … SET SCHEMA` | ❌ `does not exist` |
| `DELETE FROM pg_proc` | ❌ `permission denied` — dan larangan ini **benar** |
| `DROP OWNED BY postgres CASCADE` | ⚠️ berhasil, **tetapi menghapus hampir seluruh database** — ditolak |

Peran `postgres` di Supabase **bukan superuser**, jadi katalog sistem tertutup.

> **Saya sempat salah dan mengoreksinya.** Uji awal saya memakai
> `DROP FUNCTION IF EXISTS`; ia tak menemukan fungsinya, tak melempar galat,
> dan saya membaca "tidak error" sebagai "berhasil". Migrasi 178 sempat ditulis
> atas kesimpulan keliru itu, lalu **dibatalkan sebelum dijalankan**.
> **Database tidak berubah sedikit pun.**

### Yang dibutuhkan dari founder

Hubungi **Supabase Support** — hanya mereka punya akses superuser:

> Orphaned function blocks `pg_dump` on our project.
> `pg_proc` OID **2840878** (`trigger_calc_retention_amount_probe`) has
> `pronamespace = 2840025`, a schema that no longer exists. Every `pg_dump`
> variant fails with `schema with OID 2840025 does not exist`, so backup and
> PITR are both impossible. The function has zero triggers, zero dependencies,
> and is a leftover test artifact. Please remove it (superuser required).

Tautan: https://supabase.com/dashboard/support/new

### Sampai itu beres

- ❌ Cadangan harian **tidak bisa jalan** — bukan karena workflow-nya rusak
- ❌ Pemulihan bencana **mustahil**
- ⚠️ **Jangan terima pelanggan** sebelum ini selesai. Data tanpa jalan pulih
  bukan risiko yang boleh ditanggung orang lain.

### Catatan pencegahan

Fungsi berakhiran `_probe` adalah artefak percobaan yang lolos ke produksi.
Ke depan, percobaan skema harus di schema terpisah yang dihapus **beserta
isinya** (`DROP SCHEMA … CASCADE`), bukan schema-nya saja.

---

## R-007 · F2-1 · ADR-010 bentuk grup/holding — minta ratifikasi

**Status:** menunggu founder · dibuka 2026-08-03
**Berkas:** `docs/adr/ADR-010-bentuk-grup-holding.md`

ADR-011 sudah memutuskan bentuk `companies`. Tiga pertanyaan F2-1 sisanya
**belum pernah diputuskan di dokumen mana pun** — diverifikasi: nol kecocokan
untuk `eliminasi`, `transfer alat`, `harga transfer`, `intercompany`,
`kebocoran terkendali` di seluruh berkas ADR.

### Empat keputusan yang diminta

| # | Keputusan | Ringkas |
|---|---|---|
| K1 | Bentuk grup | `companies.parent_company_id` — **konfirmasi** ADR-011, bukan hal baru |
| K2 | Chart of Accounts | **per-PT + peta konsolidasi**, bukan diwarisi dari induk |
| K3 | Konsolidasi & transfer | konsolidasi **dihitung** (tak disimpan) · eliminasi **eksplisit** · transfer **pindah kepemilikan** · harga transfer **wajib** |
| K4 | Pemilik grup | **tanpa** akses otomatis; agregat lewat `SECURITY DEFINER`, detail lewat keanggotaan |

### Yang paling perlu Anda cermati

**K2 — CoA per-PT.** Alasannya komersial, bukan teknis: PT yang sudah berjalan
punya bagan akun sendiri. Memaksakan CoA induk = memaksa mereka membuang
riwayat pembukuan, dan itu menghalangi penjualan.

**K4 — pemilik grup tak bisa "lihat semua".** Ini **akan terasa merepotkan**,
dan akan ada permintaan melonggarkannya nanti. Saya usulkan memasukkannya ke
**Ember [C]** (tak boleh dikonfigurasi dari UI) justru karena itu — satu
pemilik bisa menjual salah satu PT-nya besok, dan akses yang diberi lewat
tombol akan tertinggal tanpa ada yang ingat mencabutnya.

### Bukti (semua terverifikasi terhadap DB, 2026-08-03)

```
tabel public 123 · punya company_id 43 · companies 1 akar/0 anak
accounts 38 · company_members 23 · mandor_assignments 16 · workers 3
tabel groups/company_groups/holdings: TIDAK ADA
```

Ulangi: `node scripts/db/introspect.mjs tenancy-coverage`

### Kalau disetujui

F2-2 (klasifikasi 80 tabel sisa) dan F2-3 (sapuan `company_id`) terbuka.
Selama belum, keduanya tetap terkunci — struktural mendahului migrasi (C-2).

### R-007 revisi 2 — menjawab lima koreksi founder (2026-08-04)

Ratifikasi pertama: **SETUJU SEBAGIAN**. ADR-010 direvisi, dan revisinya
mengubah dua keputusan struktural — bukan sekadar menambah paragraf.

**Baca selengkapnya:** https://claude.ai/code/artifact/8f6555fd-bae4-4745-96b2-fe3ac69436fc

| # | Koreksi | Tindakan | Bagian |
|---|---|---|---|
| 1 | CoA per-PT setuju + alasan hukum | alasan hukum (badan hukum terpisah, SPT sendiri) jadi alasan UTAMA | §3.1 |
| 2 | konsolidasi tiga lapis | §3 ditulis ulang: statutori · bagan grup · peta wajib onboarding | §3.1–3.4 |
| 3 | template ≠ pewarisan | bagian baru: salinan sekali saat adopsi, nol tautan hidup | §3a |
| 4 | TOLAK penguncian mati | §5 ditulis ulang jadi lima pagar | §5 |
| 5 | jangan menimpa ADR-011 | diverifikasi, nol tabrakan | §10 |

**Butir 4 — saya salah, dan koreksi founder yang benar.** Revisi 1 mengunci
akses lintas-PT lewat Ember [C]. Alasan penolakannya tak terbantah: larangan
tanpa jalan keluar tidak menghapus kebutuhan, ia hanya memindahkan
pemenuhannya ke luar pengawasan. Diganti lima pagar — jalur konsolidasi saja,
grant eksplisit per-orang, audit log, mati bawaan, baca-saja.

**Butir 5 — bukti.** Audit 2026-08-02 sendiri mencatat "ADR-003 dan ADR-010
tidak ada". Riwayat git: satu-satunya berkas ADR-010 adalah commit 41b1179.
Pencarian topik di ADR-011: nol kecocokan untuk chart-of-account, konsolidasi,
pemilik grup, eliminasi, transfer alat, harga transfer, intercompany. Dua
penyebutan `accounts`/`cross-tenant` diperiksa satu per satu — keduanya
penggolongan tenancy & catatan risiko, bukan keputusan bentuk.

**Menunggu:** ratifikasi ulang. F2-2/F2-3 tetap terkunci sampai itu.
Nol migrasi dijalankan — seluruh tabel di ADR masih rancangan.

### R-007 revisi 3 — empat tambahan founder (2026-08-04)

**Berkas dipindah** ke `docs/adr/ADR-010-bentuk-grup-holding.md` atas permintaan
founder. Acuan jalur di RATIFIKASI & INDEKS-DOKUMEN ikut diperbarui; penjaga
`audit-no-stale-docs-path` bersih (270 berkas, nol duplikat).

| # | Tambahan | Jawaban | §  |
|---|---|---|---|
| A | siapa boleh memberi grant | **pemilik akar grup**, boleh ke diri sendiri — dan konsekuensinya dinyatakan terus terang | §5 |
| B | tegakkan di pembuatan akun | pindah dari gerbang onboarding ke `NOT NULL`/trigger pada `accounts` | §3.3-B |
| C | peta berversi | `berlaku_sejak`/`berlaku_sampai` + `EXCLUDE gist` — **diuji ke DB nyata** | §3.3-C |
| D | konfirmasi cakupan | ✅ ketiganya ada; **3 celah terbuka** dinyatakan | §4 |

**A — pengakuan yang diminta founder.** Karena pemberi boleh sama dengan
penerima, pagar "grant eksplisit" TIDAK MENCEGAH pemilik grup. Yang ia berikan
adalah **jejak + kedaluwarsa**. Ini pilihan sadar: pencegahan terhadap pemilik
adalah fiksi — ia punya akses dasbor Supabase, kredensial DB, dan seluruh kode.
Yang benar-benar dicegah: admin PT anak, dan **penerima grant** (hak tak bisa
memperpanjang dirinya) — tanpa itu satu grant bocor bisa berkembang biak.

**B — koreksi founder benar.** Gerbang onboarding hanya menjaga hari pertama;
akun ke-47 di bulan keenam lolos tanpa gejala, dan laporan gabungan
mengabaikannya diam-diam (tidak error, hanya kurang).

**C — TERUJI, bukan sekadar dirancang** (transaksi ber-ROLLBACK, nol perubahan):
tumpang-tindih DITOLAK constraint · periode bersambung diterima · riwayat 2
baris (lama tak ditimpa) · kueri "peta berlaku 2026-03-15" mengembalikan baris
LAMA. Laporan Maret memakai peta Maret.

**D — celah yang tetap terbuka:** eliminasi bertingkat (A→B→C) · kewajaran
harga transfer (nasihat pajak, bukan arsitektur) · eliminasi × versi peta.

**Menunggu:** ratifikasi final. Nol migrasi dijalankan; F2-2/F2-3 terkunci.

### R-007 · ✅ DIRATIFIKASI (2026-08-04) + revisi 4 menutup enam koreksi

**Ratifikasi diberikan** atas empat keputusan struktural: K1 `parent_company_id`
· K2 CoA tiga lapis + template · K3 konsolidasi-dihitung + eliminasi eksplisit
+ transfer berjejak · K4 lima pagar. **F2-3 ditahan** sampai enam koreksi masuk.

| # | Koreksi | Tindakan |
|---|---|---|
| K-1 | fungsi membatalkan §3.3-C | `p_per_tanggal` wajib + join menyaring masa berlaku |
| K-2 | eliminasi tak pernah dipakai | `intercompany_links` disambungkan; celah ke-4 dinyatakan |
| K-3 | unique memblokir pemberian ulang | unique **parsial** `WHERE revoked_at IS NULL` |
| K-4 | cakupan mengecualikan akar | `anggota_grup()` rekursif: akar + cucu |
| K-5 | predikat menyimpang | satu view `hak_lintas_pt_aktif` |
| K-6 | verifikasi kolom dulu | **menemukan 2 kolom yang tak ada** |

**Dua koreksi menemukan cacat NYATA, bukan sekadar memperjelas:**

**K-1 terbukti ke DB** (transaksi ber-ROLLBACK): akun yang dipetakan ulang
membuat saldo **100.000.000 → 200.000.000** tanpa saringan masa berlaku;
dengan saringan tetap 100.000.000. Tanpa galat, tanpa baris ganda yang
terlihat — hanya angka yang naik dan tampak wajar.

**K-6 menyelamatkan fungsi yang tak bisa jalan:** `journal_entry_lines.company_id`
dan `l.amount` **tidak ada**. Tenancy lewat induk `journal_entries.company_id`;
nilai dari `debit - credit`. Kalau lolos ke F2-3, ini jadi galat runtime di
jalur laporan keuangan.

**Celah terbuka** (diterima founder): eliminasi bertingkat · kewajaran harga
transfer (nasihat pajak, bukan fitur) · **eliminasi tingkat-baris** (celah ke-4
dari K-2 — sampai ada, jurnal campuran antar-PT tak boleh dibuat).

**F2-1 → done. F2-2 & F2-6 terbuka.** F2-3 menunggu penerimaan revisi 4.
Nol migrasi dijalankan.

---

## R-008 · ✅ SELESAI — seed CI tak lengkap (dibuka & ditutup 2026-08-04)

**Status:** SELESAI. Dijalankan `gh workflow run ci-isolation.yml -f action=setup`
(run 30863311325) — seed permission dilengkapi, lalu CI **11/11 HIJAU**.

**Tidak butuh tindakan founder.** Saya sempat mencatatnya sebagai butir
ratifikasi karena mengira perlu kredensial CI; ternyata sudah ada workflow
yang boleh saya jalankan sendiri. Diperiksa dulu sebelum meminta.

**BUKAN akibat Fase 2**

`material-takeoff-d345.test.ts` — 3 test gagal di CI dengan `expected 403 to
be 201`, sementara **9/9 hijau di dev**.

### Bukan dari perubahan Fase 2

Diperiksa: `has_permission()` **tidak** menyentuh `permission_scopes` (tabel
yang F2-3 batch 3 isolasi). Ia membaca `role_permissions → roles →
permissions`.

Di dev, `cecep:takeoff:manage` dan `cecep:takeoff:view` ada dan terpasang ke
2 peran. 403 di CI berarti keduanya **tidak ter-seed di sana**.

### Kenapa ini penting untuk diperbaiki

Ini kelas yang sama dengan dua celah yang F2-5 temukan: **dev dan CI adalah
dua kenyataan berbeda.** Selama seed CI tak lengkap, setiap test yang
bergantung permission akan merah di CI dan hijau di dev — dan lama-lama orang
berhenti memercayai CI, yang jauh lebih mahal daripada 3 test merah.

### Dampak ikutan

`Ratchet coverage (gabungan semua shard)` ikut merah — bukan karena coverage
turun, melainkan karena shard 5 gagal sehingga laporannya tak lengkap. **Satu
akar, dua job merah.**

### Yang dibutuhkan

Lengkapi seed permission di database CI (`apps/api/scripts/ci-project-setup.mjs`
atau seed yang setara), lalu jalankan ulang. Perlu akses `CI_DIRECT_URL` —
sama seperti R-006, ini menyentuh lingkungan yang kredensialnya hidup di
GitHub Secrets.

---

## R-009 · LANJUTAN 2026-08-04 — akarnya ditemukan, dan shim `auth.*` TERBUKTI murah

**Status:** obat sementara terpasang (PR #141) · **butuh keputusan Anda untuk
obat sesungguhnya**

### Yang berubah dari catatan lama

Catatan di bawah menyebut akarnya "enam shard berbagi satu database". Itu benar
tapi **belum lengkap**. Yang sebenarnya terjadi terungkap saat empat PR terbuka
bersamaan:

| Waktu | Branch | Hasil |
|---|---|---|
| 11:00 | `f5-1` | **HIJAU** (sendirian) |
| 11:40 | `inti-3` dibuka | merah |
| 12:03 | `f5-1` dijalankan lagi | **MERAH** ← commit IDENTIK |
| 12:29 | `inti-4` | merah |

Bukan hanya antar-shard. **Antar-BRANCH.**

`concurrency.group` sempat diubah jadi per-ref dengan alasan tertulis
*"`TEST_SCHEMA` per-run sudah mengisolasi"*. Itu benar untuk test yang memakai
`test-db.ts`, dan **salah** untuk `rls-harness.ts` — harness itu bekerja di
schema `public`, karena di situlah RLS policy dan `auth.uid()` hidup.

Header harness menyatakan dirinya *"read-safe, tidak pernah mengubah data
public"*. **Klaim itu tidak akurat**: benar untuk `asUser()` (selalu ROLLBACK),
tetapi `createRlsClient()` mengembalikan client mentah — dan **42 berkas test
menulis lewatnya di luar transaksi** (diukur 2026-08-04).

### Yang SUDAH dikerjakan — obat sementara

PR #141 mengembalikan `concurrency.group` jadi konstan. Terbukti bekerja: `main`
dan `f5-1` sama-sama hijau saat dijalankan ulang sendirian, nol perubahan kode.

Harganya: CI lebih lambat saat banyak PR terbuka. Itu dibayar sadar.

### Yang saya UKUR untuk obat sesungguhnya

Catatan lama menolak Postgres lokal karena *"butuh shim `auth.*`"*. Saya ukur
seberapa besar shim itu sebenarnya:

```
auth.role()   dipakai 60x di migrasi — hanya dibandingkan dengan
              'authenticated' dan 'service_role'
auth.uid()    dipakai 13x
auth.users    NOL query — hanya disebut di komentar
```

**Permukaannya dua fungsi.** Dan seluruh pembungkus repo ini
(`auth_role()`, `auth_user_id()`, `auth_company_id()`) bermuara ke `auth.uid()`
saja.

Shim-nya saya tulis dan **UJI terhadap Postgres nyata**:

```
impersonasi : uid OK · role OK
anon        : uid NULL OK · role = anon
```

Dua cacat ketahuan justru karena diuji, bukan dibaca:
1. `''::json` melempar galat — `NULLIF(...,'')` harus DULU, baru `::json`.
2. `current_setting('role')` mengembalikan **`'none'`**, bukan NULL. Tanpa
   ditangani, `auth.role() = 'authenticated'` putus dan seluruh policy menolak.

### Kenapa saya BERHENTI di sini, bukan langsung membangunnya

Shim murah. Yang mahal adalah **datanya**:

```
32 berkas test bergantung pada user seed NYATA (authIdForRole/assignedMandor)
25 berkas membuat fixture-nya sendiri
```

Postgres lokal berarti membangun ulang seluruh seed itu — pekerjaan besar,
risiko besar, dan **tak ada satu pun pelanggan menunggunya**. Menurut disiplin
TUNDA yang Anda ratifikasi sendiri (R-010), ini belum punya pemicu.

### Tiga pilihan — angkanya, bukan perasaannya

| | Biaya | Hasil |
|---|---|---|
| **A. Biarkan serialisasi** (obat sementara) | nol | CI benar, tapi makin lambat tiap PR bertambah |
| **B. Project Supabase CI kedua** | biaya Supabase + ubah secret | dua PR bisa jalan paralel; tak menyelesaikan shard |
| **C. Postgres lokal + shim** | shim SUDAH TERBUKTI · sisanya seed 32 berkas | isolasi sejati per shard, CI jauh lebih cepat |

**Rekomendasi saya: A sekarang, C saat pemicunya tiba.**

Pemicunya jelas dan bisa ditulis: *"begitu antrean CI melewati 30 menit, atau
begitu ada dua orang mengerjakan repo ini bersamaan."* Hari ini keduanya belum
terjadi — Anda bekerja sendiri, dan antreannya masih belasan menit.

Shim yang sudah terbukti itu disimpan di catatan ini supaya saat pemicunya tiba,
pekerjaannya mulai dari yang sudah diuji, bukan dari nol.

**Kalau Anda mau C sekarang**, bilang saja — saya kerjakan seed-nya bertahap
supaya bisa dihentikan kapan pun tanpa meninggalkan setengah jadi.

---

## R-009 · P1 · FLAKE antar-shard: CI merah berpindah-pindah, hijau saat diulang

**Status:** terbuka · dibuka 2026-08-04 · **bukan cacat kode**

### Bukti bahwa ini flake, bukan cacat

Empat run berturut, shard yang merah **berpindah-pindah**, dan satu run hijau
penuh tanpa perubahan apa pun:

| Commit | Shard merah |
|---|---|
| `babe250` | shard 1/6 |
| `1904142` | shard 5/6 |
| `8200897` | shard 2/6 |
| `0d06d63` | **nol — hijau penuh** |

**Rerun tanpa mengubah satu baris pun → 11/11 hijau.** Itu bukti definitif:
kodenya benar, lingkungannya yang berebut.

Ketiga test yang merah (T6 penomoran, search-isolation, approval-berjenjang)
**hijau di dev** setiap kali dijalankan.

### Akar bersamanya

Enam shard berbagi SATU database CI, dan schema `test` bukan pemisah yang
sempurna:

- `storage.objects` GLOBAL — sudah ditemukan & diperbaiki di F2-5
- data seed bersama — baris shard lain ikut cocok dengan penyaring test
- urutan eksekusi tak dijamin — test yang bersandar pada "berapa banyak yang
  ada" jadi bergantung siapa yang jalan duluan

Tiga perbaikan sudah dilakukan di sumbernya (TAG unik per-run, T6 membuat
sendiri kondisinya, klasifikasi tenancy), dan ketiganya benar. Tetapi
menambal per-test **tak akan pernah selesai** — akan selalu ada test
berikutnya.

### Yang dibutuhkan — dan kenapa belum dikerjakan

Isolasi sungguhan antar-shard: satu database (atau schema yang benar-benar
terpisah) per shard.

Belum dikerjakan karena ia menyentuh lingkungan CI, bukan kode — sama kelasnya
dengan R-006 dan R-008. Perlu keputusan: menambah project Supabase CI, atau
memakai Postgres lokal di runner (yang dulu ditolak karena butuh shim
`auth.*` — lihat catatan Fase 0).

### Sementara itu

**Rerun job yang merah sebelum mendiagnosis.** Kalau hijau saat diulang, itu
flake ini — bukan regresi. Menambal test yang sebenarnya benar justru
melemahkan assertion-nya.

Yang **tidak boleh** dilakukan: melonggarkan assertion agar hijau. Test
`search-tenant-isolation` punya sejarahnya sendiri — assertion positif yang
dipertahankan meski merah justru yang mengungkap `clients.name` yang tak
pernah ada.

---

## R-010 · P1 · Pelanggan baru lahir TANPA rantai approval — pengajuannya tak bisa diputuskan siapa pun

**Status:** terbuka · dibuka 2026-08-05 · **cacat produksi, ditemukan lewat test**

### Yang terjadi

Migrasi `159_submittal_register.sql` mengisi rantai approval `submittal`
untuk company yang **ada saat migrasi dijalankan**:

```sql
INSERT INTO approval_chains (company_id, entity_type, label, is_active)
SELECT c.id, 'submittal', 'Persetujuan Submittal', true
  FROM companies c
 WHERE NOT EXISTS (…);
```

Tidak ada mekanisme apa pun yang melakukan hal sama untuk company yang lahir
**sesudahnya**. Diverifikasi ke `pg_trigger`, bukan dibaca dari migrasi:

```
trigger di companies : trg_company_no_casual_delete
```

Satu-satunya trigger adalah pelindung penghapusan. Tak ada yang menyediakan
rantai approval.

### Kenapa ini penting untuk SaaS

Puraloka sedang menjadi ERP multi-tenant yang dijual ke banyak perusahaan.
Pelanggan **kedua dan seterusnya** — yang didaftarkan lewat UI, bukan lewat
migrasi — akan lahir tanpa rantai `submittal`.

Akibatnya, menurut ADR-007 (fail-closed): rantai yang tidak ada berarti
**nol orang** bisa menyetujui. Submittal yang diajukan tak bisa diputuskan
siapa pun, dan gejalanya bukan pesan yang menjelaskan — melainkan `403`
untuk semua orang, termasuk pemilik perusahaannya sendiri.

Fail-closed itu **benar** (ember [C], jangan dilonggarkan). Yang salah adalah
tenant baru tak pernah diberi rantainya.

### Bagaimana ditemukan

Bukan dari audit skema. Sebuah fixture test membuat perusahaan kedua, dan
`submittal-aturan.test.ts` langsung merah:

> ada company tanpa rantai submittal — pengajuannya tak bisa diputuskan

Test itu menegakkan invariant yang benar. Yang ia ungkap: satu-satunya alasan
invariant itu selama ini terpenuhi adalah **tak pernah ada company baru**.

### Cakupannya mungkin lebih luas dari submittal

`approval_chains` memuat beberapa `entity_type` (estimate, lessons, dan lain
-lain — lihat migrasi 099, 111, 114, 158). Perlu diperiksa mana saja yang
di-seed per-company lewat migrasi dan karena itu punya lubang yang sama.
**Belum diperiksa** — jangan diasumsikan hanya submittal.

### Usul perbaikan (butuh keputusan founder — menyentuh skema)

1. **Trigger `AFTER INSERT ON companies`** yang menyalin rantai + langkah
   bawaan. Otomatis dan tak bisa terlupa, tapi menambah perilaku implisit
   pada tabel inti.
2. **Provisioning eksplisit di jalur pembuatan company** (kode aplikasi).
   Lebih terlihat, tapi jalur pembuatan lain (skrip, seed) bisa melewatinya.
3. **Penjaga CI** yang menuntut setiap company punya rantai untuk tiap
   `entity_type` wajib — ini sudah ADA untuk submittal (`submittal-aturan`),
   dan justru itu yang menemukan cacat ini. Perlu diperluas ke entity lain.

Rekomendasi: **1 + 3**. Trigger menutup lubangnya untuk semua jalur
pembuatan; penjaga memastikan trigger itu tak pernah diam-diam berhenti
bekerja.

### Yang SUDAH dikerjakan (tidak menunggu ratifikasi)

Fixture `menu-etag.test.ts` kini membuat rantai + langkahnya sendiri, jadi
ia sah menurut seluruh invariant dan tak menjatuhkan test lain meski
tertinggal. Itu memperbaiki CI — **bukan** memperbaiki cacat produksinya.
