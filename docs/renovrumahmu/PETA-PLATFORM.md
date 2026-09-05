# Renovrumahmu — Peta Platform

> **Status: BRAINSTORMING, belum spec.**
>
> Dokumen ini hasil percakapan founder ↔ Claude 2026-09-04/05. Ia belum
> melewati gerbang mana pun: belum ada spec, belum ada rencana implementasi,
> belum ada satu baris kode. Yang ditandai ✅ sudah diputuskan founder; yang
> ditandai ⏳ masih rekomendasi yang bisa dibantah.
>
> **Cara membaca angka di sini.** Angka tentang puraloka-suite (36 modul, 133
> berkas rute, 541 migrasi) diukur 2026-09-04 dengan perintah yang ditulis di
> §7. Angka itu akan basi. Jalankan perintahnya, jangan percaya angkanya —
> aturan yang sama dengan pembuka `CLAUDE.md`.
>
> Angka tentang platform LAIN (Gojek, Angi, Housecall Pro) berasal dari
> pengetahuan umum model bahasa per Mei 2026, **bukan dari riset terverifikasi**.
> Pola strukturalnya cukup mantap; angka komisi/nominal jangan dipakai untuk
> hitungan bisnis tanpa diverifikasi ulang ke sumber primer.

---

## 1. Apa ini

**Renovrumahmu** adalah platform/aplikasi yang mempertemukan pemilik rumah
dengan penyedia jasa konstruksi — renovasi, bangun dari nol, interior, desain,
arsitektur, dan pekerjaan kecil — plus marketplace material.

Unit bisnis / merek milik **Puraloka Persada**.

Fase awal penyedia jasanya hanya Puraloka Persada, tampil sebagai **mitra
terverifikasi pertama** (customer tahu, tidak disamarkan). Berikutnya dibuka
kemitraan untuk kontraktor, mandor beserta timnya, kepala tukang, dan tukang
perorangan. Material: kerja sama dengan toko material per wilayah, dan nanti
Puraloka bisa punya toko sendiri. **Pembelian material tidak wajib lewat
platform.**

---

## 2. Keputusan yang sudah diambil

| # | Keputusan | Status |
|---|---|---|
| 1 | Puraloka Persada = mitra terverifikasi pertama; customer tahu | ✅ founder |
| 2 | Scope lengkap — tidak ada fitur yang disunat | ✅ founder |
| 3 | Proyek dari platform: ERP mitra **lengkap**, tanpa batas jumlah, tanpa potong fitur | ✅ founder |
| 4 | Proyek luar mitra: dibatasi **3–5 aktif** | ✅ founder |
| 5 | Penayangan modul diatur dari dashboard pusat per jenjang — data, bukan kode | ✅ founder |
| 6 | Job platform didorong ke puraloka-suite (fase awal, Puraloka) | ✅ founder |
| 7 | Mobile: **React Native/Expo** | ✅ founder |
| 8 | Database terpisah dari puraloka-suite | ⏳ rekomendasi |
| 9 | Repo terpisah (`renovrumahmu`) | ⏳ rekomendasi |
| 10 | Domain sendiri (`renovrumahmu.com` + subdomain per peran) | ⏳ rekomendasi |
| 11 | Uang: escrow bertahap via payment gateway berlisensi | ⏳ belum dibahas |

### 2.1 Kenapa nomor 3 dan 4 — sumbu pembatasnya

Rancangan awal Claude membatasi ERP mitra berdasarkan *besar-kecilnya fitur*.
Founder mengoreksi: batasnya **asal proyek**, bukan besar fitur.

```
PROYEK DARI RENOVRUMAHMU
  → LENGKAP. Tanpa batas jumlah, tanpa potong fitur proyek.
    Kurva-S, serapan dana, RAB, progres, termin, foto — semua ada.

PROYEK LUAR (dari kenalan mitra sendiri)
  → di sinilah batas berada: maks 3–5 aktif.
```

Alasannya kuat dan bukan sekadar kemurahan hati: kalau customer membayar lewat
escrow untuk proyek ratusan juta, **customer berhak melihat progres yang
jujur**. Kurva-S dan serapan dana bukan fitur mewah untuk mitra — itu alat
kepercayaan platform. Memotongnya = memotong kemampuan platform meyakinkan
customer, dan mitra tak bisa melaporkan progres benar dengan alat yang dipotong.

### 2.2 Kenapa nomor 4 ada sama sekali — konflik dengan produk SaaS sendiri

⚠ **Ini ditemukan founder, bukan Claude.** Claude sempat merekomendasikan "ERP
mitra gratis untuk semua proyek termasuk job luar" tanpa memeriksa `CLAUDE.md`
§2 dengan cukup teliti — padahal di sana tertulis hitam di atas putih bahwa
**puraloka-suite sedang bertransformasi jadi ERP konstruksi SaaS multi-tenant
yang dijual ke banyak perusahaan.**

Rekomendasi itu, kalau diikuti mentah, berarti membangun pesaing produk sendiri.

Analisis setelah dikoreksi:

```
tukang ─── kepala tukang ─── mandor+tim ─── kontraktor kecil ─── PT besar
   │             │                │                │                │
   └── jelas Renovrumahmu ────────┘         └─ ZONA ABU ─┘  └ puraloka-suite ┘
```

- Tukang & kepala tukang **bukan** pelanggan puraloka-suite yang hilang —
  mereka tidak akan pernah jadi pelanggannya dengan harga berapa pun.
- Yang benar-benar tumpang tindih hanya **kontraktor kecil**.
- Batas 3–5 proyek luar adalah gerbang komersial di zona abu itu: mitra yang
  bisnisnya tumbuh di luar platform diarahkan naik ke puraloka-suite.

Nilai Renovrumahmu bagi puraloka-suite bukan kanibalisasi, tapi **corong**:
mitra yang tumbuh tukang → mandor → CV adalah calon pelanggan yang datang
sendiri, sudah percaya, dan datanya sudah ada di ekosistem.

### 2.3 Kenapa nomor 5 — gerbang modul sudah ada, jangan bangun ulang

Founder bertanya: *"kalau menu/modul itu bisa dikontrol dari dashboard pusat
gimana?"* — dan ternyata **puraloka-suite sudah punya mekanismenya.**

Diukur 2026-09-04:

| Bagian | Apa | Di mana |
|---|---|---|
| Katalog modul | 22 modul + 3 kuota, tiap modul berkunci (`modul.proyek`, …) | migrasi `538_katalog_fitur_paket.sql` |
| Kuota | `kuota.proyek_aktif`, `kuota.pengguna`, `kuota.penyimpanan_gb` | migrasi 538 |
| Buka/tutup per perusahaan | tabel `modules`: baris `company_id NULL` = katalog, baris ber-company = pengecualian | migrasi `155_modules_per_company.sql` |
| Konsol vendor | paket, harga, kuota, penayangan diatur dari layar | repo `admin-saas` |
| Snapshot entitlement | DB produk menyimpan salinan hak akses, supaya DB vendor bukan titik kegagalan tunggal | migrasi `544_gerbang_modul.sql` |
| Menu ikut modul | menu terikat modul, ikut mati saat modulnya ditutup | migrasi 548, 552, 557 |

Kunci fitur **sudah disamakan** antara konsol vendor dan ERP (538 menjelaskan
kenapa dua sistem berkunci beda akan diam-diam tak sepakat soal apa yang
didapat pelanggan).

⚠ **Yang belum jalan — ukur sendiri sebelum mengandalkannya.** Migrasi 544
mencatat `bolehPakaiFitur()` di `apps/api/src/utils/batas-paket.ts` punya
**nol pemanggil** per 2026-08-31 — 22 kunci terdaftar, tak pernah ditegakkan.
Yang benar-benar bekerja baru `kuota.proyek_aktif` di `POST /api/v1/projects`.

```bash
# Ukur ulang sebelum percaya kalimat di atas
grep -rn "bolehPakaiFitur" apps/api/src --include=*.ts | grep -v __tests__
```

**Konsekuensi rancangan:** jangan memutuskan modul mana yang ada di ERP mitra
dengan cara memotongnya di kode. Bangun semua, atur penayangannya dari layar.

| Dipotong di kode | Dikontrol dari dashboard pusat |
|---|---|
| Salah tebak = tulis ulang | Salah tebak = ubah satu baris di layar |
| Semua mitra sama | Bisa beda per jenjang / per mitra |
| Butuh migrasi + ratifikasi | Cukup diatur admin |

Bawaan yang **disarankan** (bukan keputusan — diubah dari layar kapan saja,
dan sebaiknya diukur dari pemakaian nyata, bukan ditebak sekarang):

```
                            Tukang  Kepala   Mandor  Kontraktor
                                    tukang   +tim    kecil
proyek, rab, progres          ✓       ✓        ✓        ✓
kurva-s, serapan dana         ✓       ✓        ✓        ✓
jadwal, termin, dokumen       ✓       ✓        ✓        ✓
lapangan (foto, harian)       ✓       ✓        ✓        ✓
tim & upah harian             ·       ✓        ✓        ✓
kas & belanja bahan           ·       ✓        ✓        ✓
klien (untuk proyek luar)     ·       ·        ✓        ✓
procurement, approval         ·       ·        ·        ✓
gl, tutup buku, payroll       ·       ·        ·        ·   ← ke puraloka-suite
```

Baris terakhir adalah garis komersialnya: mitra yang benar-benar butuh buku
besar dan payroll ber-BPJS sudah jadi perusahaan — itu pelanggan puraloka-suite.

### 2.4 Kenapa nomor 7 — React Native, dan kenapa bukan yang lain

Gojek memakai React Native sejak 2018 (sebagian besar layar RN, sebagian modul
native untuk peta/pembayaran). Shopee, Discord, Coinbase juga. Grab dan
Tokopedia native murni — keduanya mulai sebelum RN matang.

Yang memutuskan untuk Renovrumahmu:

- Founder minta **layar muncul langsung di VS Code** → hanya RN dan Flutter bisa.
- Android **dan** iOS tanpa dibatasi → native murni = 4 basis kode (2 aplikasi
  × 2 platform), dan Xcode **wajib Mac** sementara mesin founder Windows 11.
- Seluruh repo TypeScript → tipe kontrak API bisa dibagi web ↔ mobile. Flutter
  (Dart) memutus itu total.
- Pengalaman Expo yang sudah dibayar mahal di puraloka-suite (`CLAUDE.md` §7a:
  11 build APK gagal, rantai versi Expo, celah pnpm 9 vs 11) **terpakai lagi**.
  Pindah ke Flutter/native membuang pelajaran itu.

⚠ Catatan istilah: **React Native itu native sungguhan.** Tombolnya `UIButton`
di iOS dan `android.widget.Button` di Android — bukan HTML dalam WebView. Beda
total dari Cordova/Ionic.

---

## 3. Gambar besar

```
┌────────────────────────────── SISI PUBLIK ──────────────────────────────┐
│  renovrumahmu.com                                                       │
│  landing · katalog jasa · portofolio · estimasi cepat · daftar mitra     │
└─────────────────────────────────────────────────────────────────────────┘
              │                                        │
              ▼                                        ▼
┌──────────────────────────┐            ┌──────────────────────────────────┐
│      CUSTOMER            │            │            MITRA                 │
│  app.renovrumahmu.com    │            │      mitra.renovrumahmu.com      │
│  + aplikasi HP (RN)      │            │      + aplikasi HP (RN)          │
│                          │            │                                  │
│  · ajukan kebutuhan      │            │  · terima undangan tawar         │
│  · terima penawaran      │            │  · survei & ajukan penawaran     │
│  · pilih mitra           │            │  · ERP: proyek, RAB, kurva-S,    │
│  · pantau progres + foto │            │    serapan, termin, tim, kas     │
│  · bayar per termin      │            │  · tarik dana                    │
│  · ulas & garansi        │            │  · katalog material              │
└──────────────────────────┘            └──────────────────────────────────┘
              │                                        │
              └───────────────────┬────────────────────┘
                                  ▼
              ┌───────────────────────────────────────┐
              │       DASHBOARD PUSAT                 │
              │       pusat.renovrumahmu.com          │
              │  · verifikasi mitra & jenjang         │
              │  · gerbang modul per jenjang          │
              │  · escrow, pencairan, sengketa        │
              │  · kurasi harga wajar (AHSP)          │
              │  · kemitraan toko material            │
              └───────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  puraloka-suite       │   │  Payment Gateway      │
        │  (dorong job Puraloka)│   │  (Midtrans/Xendit)    │
        │  pinjam AHSP,         │   │  escrow & pencairan   │
        │  price-book, struktur │   │                       │
        └───────────────────────┘   └───────────────────────┘
```

---

## 4. Sembilan subsistem

### S1 · Identitas & Akun

Login/daftar (**WhatsApp OTP**, bukan cuma email — pengguna berliterasi digital
rendah), peran (customer / mitra / staf pusat), sesi untuk web dan mobile.

⚠ **Rancang kontrak auth web + mobile sekali, benar, di awal.** puraloka-suite
baru membayar mahal untuk ini: token hanya lewat cookie HttpOnly membuat
aplikasi native **tak pernah bisa login** (`audit-auth-mobile-utuh.mjs`), dan
header `X-Client` yang tak didaftarkan ke CORS memblokir mobile lewat peramban
selama tiga hari tanpa satu pun gejala — preflight menjawab 204 (sukses) dan
`curl` menjawab 200, karena `curl` tak menegakkan CORS.

### S2 · Mitra: pendaftaran, verifikasi, jenjang

Pendaftaran **berbantuan** (staf bisa mendaftarkan mitra — mitra kelas bawah
tidak akan menyelesaikan formulir panjang sendiri), unggah berkas, verifikasi
berjenjang, kenaikan jenjang, penangguhan. **Gerbang modul (§2.3) ada di sini.**

Jenjang yang disarankan:

| Jenjang | Boleh mengerjakan | Syarat |
|---|---|---|
| Tukang | pekerjaan kecil (cat, keramik, perbaikan) | KTP + foto + wawancara + 1 rujukan |
| Kepala tukang | renovasi ringan, satu ruang | + portofolio foto + 2 rujukan + uji keterampilan |
| Mandor + tim | renovasi menyeluruh | + bukti proyek selesai + daftar tim + rekening |
| Kontraktor | bangun dari nol, struktur | + badan usaha + NPWP + SIUJK/sertifikat + asuransi |

Berjenjang, bukan seragam: syarat seragam-berat menutup pintu bagi tukang
perorangan (padahal merekalah inti "pekerjaan kecil"); syarat seragam-ringan
membiarkan tukang mengerjakan struktur — berbahaya secara harfiah.

**Keunggulan tak tertandingi:** Puraloka kontraktor betulan, jadi verifikasi
keterampilan dilakukan orang yang benar-benar tahu — bukan staf yang mencocokkan
berkas. Tidak ada startup teknologi yang bisa meniru itu tanpa punya kontraktor.

### S3 · Katalog jasa & permintaan customer

Struktur layanan (bangun baru / renovasi / interior / desain / perbaikan kecil),
formulir kebutuhan yang bisa diisi orang awam, foto & lokasi, dan
**estimasi harga wajar otomatis dari AHSP**.

Yang terakhir adalah pembeda terbesar — lihat §6.

### S4 · Penawaran & kesepakatan

Sistem menyaring mitra cocok → **3–5 mitra** diundang menawar → survei lokasi →
penawaran masuk → perbandingan + rentang wajar → customer memilih → kontrak
digital → deal.

Kenapa 3–5, bukan semua: mitra yang menawar lalu kalah terus akan berhenti
menawar. Membatasi undangan menjaga tingkat kemenangan tetap masuk akal — ini
menghormati waktu mitra, dan itulah yang membedakannya dari model jual-lead
(§5.3, Angi).

### S5 · Pelaksanaan proyek (ERP mitra)

Yang **tidak boleh dipotong** untuk proyek platform: proyek, RAB, jadwal,
progres + foto, **kurva-S, serapan dana**, termin, dokumen, mutu. Plus tim &
upah harian, kas & belanja bahan.

Modul menyala/mati per jenjang dari dashboard pusat (§2.3).

### S6 · Uang: escrow, termin, pencairan

Customer bayar → ditahan → progres diverifikasi → termin cair ke mitra →
komisi platform terpotong. Plus uang muka bahan, sengketa, refund.

**Belum dibahas.** Arah yang disarankan:

- Escrow **bertahap**, bukan sekali di akhir — proyek 3 bulan tak bisa dibayar
  di akhir; mitra kecil tak punya modal menalangi.
- Pakai **payment gateway berlisensi** (Midtrans/Xendit) sebagai penampung —
  jangan menampung sendiri; menahan uang orang lain menyentuh aturan uang
  elektronik. **Wajib konsultasi hukum sebelum peluncuran.**
- Termin diikat ke **progres terverifikasi + foto**, bukan tanggal.
- **Uang muka bahan** — krusial; jangan sampai mitra harus menalangi.

### S7 · Material & toko mitra

Katalog, harga per wilayah, pesanan (**opsional** — tidak wajib lewat platform),
pengiriman, toko Puraloka sendiri nanti.

Kenapa tidak wajib: toko material punya hubungan lama dengan tukang, sering
dengan kredit/bon — itu tidak bisa digantikan platform. Memaksa akan ditolak
keduanya. Model pendapatan sebaiknya **komisi tipis atau biaya penempatan**,
bukan margin besar — kalau harga di platform lebih mahal, tak ada yang beli.

Toko material juga **saluran rekrutmen mitra**: toko tahu semua tukang di
wilayahnya — siapa yang bayar tepat waktu, siapa yang kerjanya rapi.

### S8 · Kepercayaan & kualitas

⚠ **Rating saja tidak cukup, dan ini struktural.** Customer Gojek naik 15×
sebulan sehingga rating terbentuk cepat. Customer Renovrumahmu merenovasi
sekali per beberapa tahun — mitra baru butuh bertahun-tahun mengumpulkan cukup
ulasan.

Berlapis:

- **Foto progres wajib** (mekanismenya sudah ada di puraloka-suite)
- **Titik pemeriksaan** — orang Puraloka mengecek di tahap kritis proyek besar.
  Bisa dijual sebagai jasa, sekaligus menjaga kualitas.
- **Garansi platform** — masa retensi, mitra memperbaiki cacat
- **Jalur sengketa** dengan penengah manusia
- Rating sebagai **pelengkap**, bukan tumpuan

### S9 · Dashboard pusat

Verifikasi mitra, gerbang modul, pemantauan proyek, escrow & pencairan,
sengketa, kurasi harga, laporan bisnis. **Tumbuh sepanjang semua tahap**, bukan
satu fase tersendiri.

---

## 5. Pelajaran dari platform lain

⚠ Sumber: pengetahuan umum model per Mei 2026. Pola struktural cukup mantap;
angka nominal belum diverifikasi.

### 5.1 Model Gojek TIDAK bisa disalin mentah

| | Gojek | Renovrumahmu |
|---|---|---|
| Durasi job | 20 menit | 2 minggu – 6 bulan |
| Nilai job | Rp 15–50 ribu | Rp 5 juta – 500 juta |
| Kalau salah | ulangi, rugi kecil | rumah rusak, ratusan juta hilang |
| Standar hasil | seragam (sampai = selesai) | subjektif (rapi menurut siapa?) |
| Mitra | 1 orang, 1 motor | tim 3–20 orang, alat, subkon |
| Frekuensi | 15×/hari | 1× per beberapa tahun |

Enam konsekuensi, tiap poin membalik satu keputusan:

1. **Rating tidak cukup** — frekuensi terlalu rendah (→ S8 berlapis).
2. **Verifikasi ringan itu bencana** — driver buruk = perjalanan tak nyaman;
   tukang buruk = struktur gagal. Tak bisa "coba dulu, rating menyaring";
   kerusakan sudah terjadi sebelum ulasan pertama.
3. **Algoritma penugasan tak akan diterima** — tak ada yang menyerahkan rumahnya
   ke tukang yang ditunjuk sistem. Customer **harus** memilih.
4. **Harga tak bisa dipatok platform** — "renovasi kamar mandi Rp 25 juta" bisa
   berarti sepuluh pekerjaan berbeda. Butuh survei dan penawaran.
5. **Pembayaran tak bisa sekali** — harus bertahap.
6. **Sengketa tak terhindarkan** — "catnya belang", "keramiknya tak lurus".
   Gojek nyaris tak punya masalah ini.

**Yang tetap bisa dipinjam:** tingkatan mitra, referral driver-ke-driver,
manfaat non-tunai (asuransi, pelatihan, sembako), komunitas & rasa memiliki,
pencairan cepat, onboarding berbantuan lewat kantor cabang fisik.

### 5.2 Kebocoran platform — masalah nomor satu

> Customer dan mitra bertemu lewat platform, lalu bertransaksi **di luar**
> platform untuk menghindari komisi.

Ini yang membunuh sebagian pesaing regional (mis. Kaodim, Malaysia/Singapura —
sudah tutup). Di jasa bernilai besar godaannya sangat kuat: komisi 10% dari
Rp 100 juta = Rp 10 juta, cukup untuk membuat keduanya sepakat "WhatsApp-an
saja". Dan mereka **memang akan bertemu langsung** — survei lokasi tak bisa
lewat aplikasi.

**Yang tidak berhasil:** menyembunyikan kontak (tetap bertukar nomor saat
survei) · larangan di syarat & ketentuan (tak bisa ditegakkan) · denda (mitra
kabur, bukan patuh).

**Yang berhasil — buat platform lebih berharga daripada komisinya:**

1. **Escrow melindungi keduanya** — di luar platform, customer bayar di muka
   tanpa jaminan, mitra tak punya pegangan kalau tak dibayar.
2. **Garansi** — ada cacat 6 bulan kemudian? Di luar platform tukangnya hilang.
3. **ERP mitra** — kalau seluruh data bisnisnya ada di sistem, dia tak pergi.
   **Inilah alasan sesungguhnya proyek luar boleh dikelola** (§2.2): bukan
   kemurahan hati, tapi senjata anti-kebocoran.
4. **Harga bahan lebih murah** lewat kemitraan toko — mitra rugi kalau keluar.
5. **Aliran job berkelanjutan** — satu job bocor hemat sekali; diputus dari
   platform kehilangan job berikutnya selamanya.
6. **Komisi yang wajar** — komisi mencekik membuat kebocoran jadi rasional.

**Kebocoran tidak dilawan dengan larangan, tapi dengan membuat keluar merugikan.**

### 5.3 Yang dipinjam dari siapa

| Dari | Yang dipinjam |
|---|---|
| Gojek | tingkatan mitra, referral, manfaat non-tunai, komunitas, pencairan cepat, onboarding berbantuan |
| Housecall Pro / Jobber / ServiceTitan | ERP mitra sebagai alat kelengketan; boleh untuk job luar |
| Houzz | portofolio visual sebagai alat akuisisi utama — orang memilih kontraktor **dari foto** |
| Angi / HomeAdvisor | ⚠ **apa yang TIDAK boleh** — jangan jual lead. Kontraktor bayar untuk lead yang sering tak jadi, dan lead sama dijual ke beberapa kontraktor. Reputasi mereka di kalangan kontraktor jelek karenanya. |
| Kaodim (tutup) | ⚠ pelajaran kebocoran platform |

### 5.4 Hubungan hukum mitra

Mitra adalah **rekanan independen**, bukan karyawan: ada perjanjian kemitraan
tertulis (`apps/api/src/lib/klausul-kontrak.ts` bisa jadi dasar), mitra
menanggung alat/tim/pajaknya sendiri, platform tak mengatur jam kerja atau
memerintah cara kerja.

⚠ **Bukan formalitas.** Platform yang terlalu mengendalikan (menentukan harga
sepihak, mengatur jam, memberi sanksi seperti atasan) bisa dianggap
**hubungan kerja** secara hukum — dengan konsekuensi UU Ketenagakerjaan: upah
minimum, BPJS, pesangon. Sudah jadi sengketa nyata di berbagai negara, dan di
Indonesia belum sepenuhnya jelas.

**Wajib dikonsultasikan ke pengacara sebelum peluncuran.** Yang bisa dilakukan
dari sisi rancangan: memastikan sistem tidak menciptakan bukti pengendalian
yang tidak perlu.

---

## 6. Pembeda: estimasi harga wajar dari AHSP

Kesempatan terbesar, dan lahir dari fakta bahwa **Puraloka kontraktor yang
bikin platform, bukan perusahaan teknologi yang masuk konstruksi.**

puraloka-suite punya **AHSP** (analisa harga satuan pekerjaan), **price-book**
(harga bahan per wilayah), dan modul **struktur** (34 jenis elemen, diukur
2026-08-19). Itu berarti Renovrumahmu bisa memberi:

- **Estimasi harga wajar otomatis** begitu customer menjelaskan kebutuhan —
  sebelum ada satu pun mitra menawar.
- **Rentang wajar** saat penawaran masuk: *"Penawaran ini 15% di atas harga
  wajar untuk pekerjaan sejenis di wilayah Anda."*
- **Rincian yang terbaca**, bukan satu angka gelap.

Ini menjawab ketakutan terbesar customer: **"saya takut ditipu tukang"** —
alasan nomor satu orang ragu merenovasi.

Tak satu pun pesaing di Indonesia punya ini; membangun basis AHSP dari nol
butuh bertahun-tahun keahlian konstruksi.

**Cara pakainya:** pinjam lewat API dari puraloka-suite, jangan salin. AHSP,
price-book, dan struktur adalah pure function di `apps/api/src/lib/` — tidak
terikat tenancy. Dua salinan yang menyimpang tak mengeluarkan galat: platform
memperlihatkan satu angka, ERP memakai yang lain. (Repo ini sudah punya
`audit-takeoff-kembar-sepakat.mjs` untuk cacat berbentuk sama.)

---

## 7. Hubungan dengan puraloka-suite

### 7.1 Kenapa database dan repo terpisah ⏳

Diukur 2026-09-04:

```bash
grep -rEn "\.(get|post|put|patch|delete)\(" apps/api/src/routes --include=*.ts | grep -v __tests__ | wc -l
#   → 819 rute

ls apps/api/src/routes/v1/*.ts | grep -v test | wc -l
#   → 133 berkas rute domain

ls "apps/web/app/(dashboard)/" | wc -l
#   → 36 modul dashboard

ls db/migrations/*.sql | wc -l
#   → 541 migrasi

cd apps/api && node scripts/jalankan-semua-penjaga.mjs
#   → 206 penjaga CI
```

**Database terpisah** — model tenancy-nya bertentangan di lapisan marketplace:

| | puraloka-suite | Renovrumahmu (marketplace) |
|---|---|---|
| Unit isolasi | `company_id` — satu PT satu tenant | tak ada; customer & mitra saling melihat |
| Model akses | tenant tak boleh lihat tenant lain | customer **harus** lihat banyak mitra |
| RLS | menyaring habis lintas company | membuka lintas pihak dengan aturan berbeda |

Menambah model yang sengaja **membuka** ke dalam basis yang seluruh 541
migrasinya dibangun untuk **menutup** adalah cara membuat kebocoran yang tak
ada penjaganya. Repo ini sudah punya presedennya: `document_number_series`
membocorkan seluruh isinya ke admin tenant lain tanpa satu pun galat
(`audit-tabel-force-berpagar.mjs`).

⚠ **Koreksi terhadap analisis awal:** kalimat "model tenancy bertentangan"
hanya benar untuk lapisan **marketplace**. Lapisan **ERP mitra** justru
berbentuk sama dengan tenant puraloka-suite (tiap mitra = satu `company`).
Yang bertentangan cuma separuhnya.

**Repo terpisah** — dua alasan yang langsung menjawab permintaan founder:

- *Paralel:* `CLAUDE.md` §8a.1 mencatat tiga perintah yang merusak kerja sesi
  lain di checkout yang sama (`git stash -u`, `pnpm install`, `git add .`), dan
  commit `5f3c9eda` yang tak sengaja menelan upgrade Expo milik sesi lain.
  Itu terjadi dengan 4 apps. Menambah 4–5 lagi memperbesar permukaan tabrakan.
- *Maintenance:* 206 penjaga CI hampir semuanya mengasumsikan model
  puraloka-suite (`requirePermission`, `company_id`, `request.db`). Renovrumahmu
  tak punya `company_id` di lapisan marketplace. Penjaga yang punya pengecualian
  adalah penjaga yang pelan-pelan berhenti menjaga — repo ini sudah punya
  catatannya (`continue` yang melompati 37 grup, nol yang pernah lolos).

`packages/shared` di repo ini **kosong** (diperiksa 2026-09-04), jadi tak ada
yang hilang dengan memisah. Preseden: `admin-saas` sudah dipisah.

### 7.2 Domain ⏳

```
renovrumahmu.com          → landing + marketplace publik (SEO — ini yang harus cepat)
app.renovrumahmu.com      → dashboard customer web
mitra.renovrumahmu.com    → dashboard mitra (jasa + toko material)
pusat.renovrumahmu.com    → dashboard internal Renovrumahmu
api.renovrumahmu.com      → API
```

Domain sendiri, bukan subdomain Puraloka: ini merek consumer-facing.
`renovrumahmu.puraloka.co.id` membuatnya terlihat seperti proyek sampingan dan
merusak SEO merek itu sendiri.

### 7.3 Yang dipinjam, yang tidak

| Dipinjam lewat API | Dibangun baru |
|---|---|
| AHSP (analisa harga satuan) | seluruh lapisan marketplace |
| price-book (harga bahan per wilayah) | pendaftaran & verifikasi mitra |
| struktur (34 jenis elemen) | escrow & pencairan |
| — | ERP mitra (bentuknya berbeda: satu orang, bukan organisasi) |

Job Puraloka yang deal di Renovrumahmu **didorong ke puraloka-suite** lewat API,
satu arah, kontrak eksplisit. Mitra lain bebas pakai ERP sendiri atau tidak.

---

## 8. Ketergantungan antar-subsistem

```
                    ┌─────────────────┐
                    │ S1 Identitas    │  ← semua butuh ini
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      ┌───────────┐  ┌─────────────┐  ┌──────────┐
      │ S2 Mitra  │  │ S3 Katalog  │  │ S9 Pusat │
      │ verifikasi│  │ + AHSP      │  │ (tumbuh  │
      └─────┬─────┘  └──────┬──────┘  │  terus)  │
            └────────┬──────┘         └──────────┘
                     ▼
            ┌─────────────────┐
            │ S4 Penawaran    │
            │    & deal       │
            └────────┬────────┘
                     ├──────────────────┐
                     ▼                  ▼
            ┌─────────────────┐  ┌──────────────┐
            │ S5 Pelaksanaan  │  │ S6 Uang      │
            │    (ERP mitra)  │◄─┤   escrow     │
            └────────┬────────┘  └──────────────┘
                     ├──────────────────┐
                     ▼                  ▼
            ┌─────────────────┐  ┌──────────────┐
            │ S8 Kepercayaan  │  │ S7 Material  │
            └─────────────────┘  └──────────────┘
```

Yang terbaca:

- **S1 tak bisa ditunda** — salah di sini merambat ke semuanya.
- **S5 ↔ S6 saling mengunci** — termin cair karena progres terverifikasi, jadi
  keduanya harus dirancang bersamaan. Pasangan paling berbahaya untuk
  dikerjakan terpisah.
- **S7 paling mandiri** — bisa paralel kapan saja.
- **S9 tumbuh terus** — menemani setiap subsistem, bukan satu fase.

---

## 9. Urutan bangun

⚠ **Ini BUKAN pemotongan scope.** Founder sudah memutuskan scope lengkap
(keputusan #2). Yang berikut adalah urutan agar tak ada yang perlu dibongkar
belakangan — kode punya urutan ketergantungan (§8).

Yang membuat startup tidak matang bukan urutan, tapi lima subsistem digarap
paralel setengah-setengah, lalu ketahuan model datanya salah, lalu semuanya
dibongkar. Preseden di repo ini: cacat migrasi 047↔167 yang menahan pembangunan
GL berbulan-bulan.

**Tahap 0 — Fondasi** (tidak menghasilkan apa pun yang terlihat, dan itu wajar)

Repo, CI, penjaga, model data inti, kontrak auth web+mobile, kerangka design
system.

Inilah yang menjawab permintaan *"kode jangan berantakan, mudah maintenance,
UI-UX mudah dirombak, bisa paralel"*. Kalau dilewati, keempat permintaan itu tak
akan pernah tercapai.

**Tahap 1 — S1 + S2 + S3**

Orang bisa daftar, mitra diverifikasi, layanan terlihat, estimasi AHSP jalan,
landing tayang.

**Tahap 2 — S4 + S5**

Permintaan → penawaran → deal → pelaksanaan dengan ERP lengkap. Puraloka sebagai
mitra pertama. **Pembayaran masih di luar platform** di tahap ini.

**Tahap 3 — S6**

Escrow, termin, pencairan, komisi.

Kenapa uang **setelah** alur job: escrow yang mengikat termin ke progres butuh
definisi progres yang sudah terbukti benar di proyek nyata. Dibangun bersamaan,
aturan pencairannya dirancang untuk progres yang belum pernah diuji.

**Tahap 4 — S8 + buka pendaftaran mitra luar**

Ulasan, garansi, sengketa. Baru undang mitra di luar jaringan Puraloka.

**Tahap 5 — S7**

Katalog material, toko mitra, pesanan.

**Sepanjang semua tahap:** mobile (RN) dan dashboard pusat (S9) tumbuh
mengikuti, bukan ditumpuk di akhir.

---

## 10. Bagaimana dikerjakan paralel

Permintaan founder eksplisit: beberapa sesi Claude Code, dan nanti programmer
manusia. Jawabannya harus ada di **struktur**, bukan di niat baik.

Yang membuat paralel mungkin:

1. **Repo terpisah** → `pnpm install` Renovrumahmu tak bisa mengosongkan
   `node_modules` puraloka-suite. Itu benar-benar pernah terjadi (§7.1).
2. **Batas modul tegas** → subsistem tak saling membaca tabel; komunikasi lewat
   kontrak.
3. **Kontrak API ditulis lebih dulu** → dua orang bisa kerja di dua sisi tanpa
   saling menunggu.
4. **Worktree per pekerjaan** → sudah jadi praktik di repo ini.
5. **Penjaga CI sejak hari pertama** → inilah yang menjaga kode tak berantakan
   saat banyak tangan masuk.

Yang bisa jalan bersamaan **setelah Tahap 0**:

```
Jalur A: S1 identitas → S2 mitra → verifikasi
Jalur B: S3 katalog + AHSP → estimasi
Jalur C: design system + landing
Jalur D: kerangka mobile + kontrak auth
```

Empat jalur, empat sesi/orang, nol tabrakan — **asalkan Tahap 0 selesai lebih
dulu.** Itu alasan sesungguhnya Tahap 0 tak boleh dilewati.

---

## 11. Yang belum diputuskan

| # | Belum diputuskan | Kapan harus |
|---|---|---|
| 1 | **Alur uang & escrow** (S6) | sebelum Tahap 0 — memengaruhi model data |
| 2 | Model pendapatan: komisi berapa, dari siapa | sebelum Tahap 3 |
| 3 | Wilayah awal — satu kota dulu? | sebelum Tahap 1 |
| 4 | Nama & merek — domain sudah dipegang? | sebelum landing tayang |
| 5 | Badan hukum: unit Puraloka atau PT sendiri? | sebelum uang mengalir |
| 6 | Konfirmasi DB/repo/domain terpisah (⏳ #8–10 di §2) | sebelum Tahap 0 |

Nomor 1 dan 6 memblokir Tahap 0.

Founder juga menyatakan ada hal yang ingin disampaikan tapi belum terumuskan
(2026-09-04) — dokumen ini belum memuatnya.

---

## 12. Langkah berikutnya

Dokumen ini **peta, bukan spec.** Yang belum dilakukan:

1. Tutup §11 nomor 1 dan 6 (alur uang; konfirmasi DB/repo/domain).
2. Tulis spec per subsistem — masing-masing dapat siklus spec → rencana →
   implementasi sendiri. Satu spec untuk sembilan subsistem tak akan bisa
   dieksekusi siapa pun.
3. Mulai dari spec **Tahap 0**, karena ia memblokir semua jalur paralel.

Gerbang yang berlaku: `CHARTER.md` §5 Gerbang Keras, §7 Kejujuran, dan
`CLAUDE.md` §8a.

---

*Ditulis 2026-09-05 dari percakapan brainstorming founder ↔ Claude 2026-09-04/05.*
*Belum melewati gerbang mana pun. Angka puraloka-suite diukur 2026-09-04.*
