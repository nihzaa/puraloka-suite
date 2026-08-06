# Landing Publik — Compro Puraloka Persada + Halaman Jual ERP

**Tanggal:** 2026-08-06
**Status:** DESAIN — menunggu review founder
**Fase:** Di luar QUEUE.yaml (lihat §12 — Posisi terhadap CHARTER)

---

## 1. Ringkasan

Dua permukaan publik baru, dibangun sebagai satu aplikasi Next.js terpisah
(`apps/web-publik`):

1. **Compro Puraloka Persada** — halaman perusahaan konstruksi. Menjual jasa
   kontraktor. Punya pembeli hari ini.
2. **Halaman jual ERP** — menjual Puraloka Suite sebagai perangkat lunak.
   **Tahap 2**, tidak dikerjakan di spec ini (lihat §11).

Seluruh konten kedua halaman berasal dari database dan dikelola lewat dashboard
admin. **Nol string konten di dalam berkas `.tsx`.**

### Yang membuat halaman ini bukan template

Tiga hal, dan semuanya berakar pada aset yang sudah ada, bukan pada gaya visual:

- **Fakta keras, bukan klaim.** Tol Cipali, Tol Cisumdawu, sub-kontraktor PT PP,
  PT Jaya Cemerlang (dua proyek — klien yang kembali), PT Top Torch, PT Kijang
  Mas, GOR Pencak Silat Garut, digitalisasi SPBU Jabar–Jateng, berdiri 2009.
  Tidak ada kompetitor yang bisa menyalin daftar ini.
- **Foto proses lapangan yang sebenarnya**, bukan render mengkilap atau foto
  stok. Baja WF diukur manual, gording bertumpuk, tabung las. Pembeli konstruksi
  mengenali bedanya.
- **Suara yang sudah ada di dashboard.** Contoh nyata dari repo ini:
  > "Selisihnya adalah material yang tak bisa dipertanggungjawabkan — dan tanpa
  > layar ini, ia terlihat persis sama dengan material yang habis terpakai."

  Tajam, spesifik, menyebut masalah dengan nama aslinya. Itu register copy
  landing page — **bukan** bahasa brosur.

---

## 2. Kondisi nyata yang diukur (bukan dibaca dari dokumen)

Diukur 2026-08-06, metode sesuai `CLAUDE.md` §1:

```
Endpoint API      : 340
Halaman web       : 71
Route file        : 56 domain
Migrasi (berkas)  : 192
Test file         : 160
Tabel DB          : 134
Kolom             : 1.759
schema_hash       : adfebb76d25f77b9
server            : PostgreSQL 17.6 (Supabase, pooler ap-southeast-1)
RLS               : aktif pada tabel yang tersampel, 2–5 policy per tabel
```

**Koreksi yang harus dicatat.** Draf awal desain ini menyatakan ERP "belum siap
dijual" berdasarkan nada peringatan di `STATUS.md`. Setelah diukur, itu salah —
340 endpoint dan 134 tabel bukan produk setengah jadi. Halaman jual ERP tetap
tahap 2, tapi **alasannya materi jual belum dikurasi**, bukan produknya belum
ada. Dokumen mengalahkan asumsi; pengukuran mengalahkan dokumen.

### Aset yang tersedia

| Aset | Lokasi | Catatan |
|---|---|---|
| Foto proyek | `E:\PURALOKA PERSADA\Foto Proyek` | 75 foto + 6 video, 661 MB, 2021-08 → 2024-09 |
| Compro PDF | `E:\PURALOKA PERSADA\Company Profile (WHITE)…pdf` | Sumber fakta & milestone |
| Dokumen legal | `E:\PURALOKA PERSADA\CV PURALOKA PERSADA` | KBLI bersertifikat |
| Model SketchUp | `E:\PURALOKA PERSADA\File Sketchup` | `Desain+Gudang+Baja.skp`, `detail+join+s8.skp`, `TANGGA.skp` |
| Logo | `E:\PURALOKA PERSADA\Logo\Color.png` | + `apps/web/public/puraloka-lambang.svg` |

---

## 3. Keputusan arsitektur

### 3.1 Aplikasi terpisah: `apps/web-publik`

Satu repo (`puraloka-suite`), aplikasi terpisah dari `apps/web`.

**Kenapa satu repo:** konten dari API dan DB yang sama, migrasi masuk ke
`db/migrations/` bernomor yang sama, token merek dari sumber yang sama. Repo
terpisah menuntut publish paket token dan dua alur migrasi — biaya koordinasi
tanpa manfaat penyeimbang.

**Kenapa bukan di dalam `apps/web`:** sifatnya bertentangan.

| | `apps/web` (dashboard) | `apps/web-publik` |
|---|---|---|
| Pengunjung | terautentikasi | anonim |
| Rendering | client-side, data segar | ISR, di-cache |
| Bundle | boleh besar | harus kecil (SEO, 3 detik pertama) |
| Three.js | tidak dipakai | inti |

Menggabung berarti Three.js masuk ke dependency tree aplikasi yang dipakai staf
delapan jam sehari. Selain itu `apps/web/app/page.tsx` sudah me-redirect `/` ke
dashboard — root publik akan bertabrakan.

### 3.2 Tenancy: perilaku single-tenant, skema siap multi-tenant

Sesuai gerbang mutlak di `STATUS.md` (tenant kedua dilarang sebelum Tahap 4 & 5):

- Setiap tabel konten punya `company_id NOT NULL` FK ke `companies`, **RLS aktif
  sejak migrasi pertama**. Ember [C]: isolasi tenant tidak boleh dikonfigurasi.
- Resolusi tenant lewat **satu fungsi di satu berkas** yang hari ini
  mengembalikan konstanta. Saat multi-tenant tiba, yang berubah isi fungsi itu —
  bukan call site.
- **Resolusi domain→tenant TIDAK dibangun sekarang.** Menulis kode untuk kondisi
  yang aturannya belum boleh terjadi menghasilkan kode yang diam-diam salah.
  Preseden di repo ini: `modules.is_enabled` di baris katalog bersama, dan
  `auth_role()` yang beda antara API dan RLS — keduanya berdampak nol sampai
  tenant kedua lahir.

**Halaman jual ERP dikecualikan.** Itu milik vendor, bukan tenant. Memaksakan
`company_id` ke situ memunculkan pertanyaan "company mana yang memiliki halaman
jualan?" yang tidak punya jawaban benar. Tabelnya terpisah, tanpa `company_id`.

### 3.3 Endpoint publik

Mengikuti pola yang **sudah ada**: `/api/v1/public/invoice/:id` di
`apps/api/src/routes/v1/settings.ts`. Sesuai `QUEUE.yaml` baris 434 — rute
publik adalah pengecualian bernama: field dibatasi, rate limit, tanpa auth.

Endpoint baru dibatasi ke: `/api/v1/public/site/*` (baca konten terbit saja).
**Tidak ada** endpoint publik yang membaca tabel operasional (proyek, RAB,
progress, keuangan).

### 3.4 Cache: ISR + revalidate-on-save

Konten dari DB berarti halaman tidak bisa sepenuhnya statis. Tanpa strategi
cache, tiap pengunjung memicu query dan compro jadi lebih lambat dari versi
hardcode.

- Halaman publik: ISR Next.js.
- Admin menyimpan perubahan → API memanggil revalidate → pengunjung melihat
  versi baru dalam hitungan detik.
- Pengunjung selalu menerima HTML yang sudah jadi.

---

## 4. CMS — empat tingkat, dengan rem

### Tingkat 1 — Teks & media
Semua string, angka, foto, logo, kontak, meta SEO.

### Tingkat 2 — Koleksi & urutan
Proyek portofolio, layanan, milestone, sertifikasi/KBLI, testimoni.
Tambah / hapus / urutkan / sembunyikan.

### Tingkat 3 — Seksi & komposisi terbatas
Nyalakan-matikan seksi, urutkan, pilih **varian tampilan yang sudah dirancang**
(mis. portofolio: grid / carousel / split).
**Bukan** page-builder drag-drop bebas — lihat §4.1.

### Tingkat 4 — Parameter adegan 3D
Jumlah lantai massing, palet material, intensitas cahaya, kecepatan scroll,
kepadatan elemen, warna aksen yang merambat ke shader.

### 4.1 Kenapa bukan page-builder bebas

Kalau semua bisa disusun bebas, tidak ada satu pun komposisi yang dirancang —
hasilnya selalu terbaca sebagai template. Aturannya:

> **Admin mengendalikan _apa_ yang tampil dan _seberapa banyak_.
> Kode mengendalikan _bagaimana_ ia bergerak.**

Yang **tidak** masuk CMS meski secara teknis bisa: geometri dan koreografi
animasi. Urutan "pondasi → kolom → pelat → fasad" punya timing dan easing yang
diuji. Bisa diedit dari dashboard = halaman yang suatu hari rusak tanpa ada yang
tahu sebabnya.

### 4.2 Tiga rem

1. **Rentang tertutup di level skema.** `CHECK` constraint di DB + pilihan
   diskrit di UI. Kepadatan: rendah/sedang/tinggi — bukan 0–10000.
2. **Validasi kontras saat simpan.** Warna yang gagal WCAG AA **ditolak API**
   dengan pesan jelas — bukan disimpan lalu merusak halaman diam-diam.
   Diukur terhadap **latar sebenarnya di tiap konteks** (putih, navy pekat, di
   atas overlay 3D), bukan diasumsikan putih. Metode ini menegakkan disiplin
   yang sudah tertulis di `globals.css`:
   > `--warning` (#B45309) lolos di putih (5,02:1) dan `--warning-bg` (4,84:1),
   > tapi GAGAL di latar biru muda #ebf2ff: 4,46:1 — kurang 0,04 dari ambang,
   > dan itu 95 pelanggaran di satu halaman.

   **Validator harus sadar konteks, bukan menolak per-warna.** Kuning merek
   `#FFD600` lulus 11,77:1 di navy pekat tapi gagal 1,41:1 di putih — warna
   yang sama, dua verdikt. Yang divalidasi adalah **pasangan (warna, latar,
   peran)**, bukan warna tunggal. Validator naif akan menolak warna merek
   perusahaan sendiri.
3. **Budget performa yang tidak bisa dilanggar.** Berapa pun setelan admin,
   adegan tetap punya batas draw call dan turun otomatis di perangkat lemah.
   Setelan admin adalah **permintaan, bukan perintah**.

### 4.3 Batas untuk tenant (saat multi-tenant tiba)

| Boleh diganti tenant | Tidak boleh |
|---|---|
| Warna merek (tervalidasi kontras) | Tipografi |
| Logo | Skala spasi |
| Konten & foto | Koreografi animasi |

Warna aman karena bisa divalidasi matematis. Selera tipografi tidak bisa — satu
tenant memilih font yang salah dan seluruh halaman terlihat murah, sementara
vendor yang menanggung reputasinya.

---

## 5. Arah visual

### 5.1 Hubungan dengan dashboard

Landing **mewarisi identitas merek dan metode a11y**, bukan sistem visualnya.

**Diwarisi:**
- Gradasi merek: `#001F3D → #003366 → #0059B3` (token `--grad-navy`,
  `--grad-merek` di `globals.css:310-325`). Warna merek harus konsisten atau
  pengenalan rusak.
- **Metode** pengukuran kontras terhadap latar sebenarnya.

#### Kuning merek `#FFD600` — warna kedua yang wajib ada

Diekstrak terukur dari compro PDF (sampling piksel 6 halaman, dpi 40):

```
#FFFFFF  putih     146.458
#FFD600  KUNING     19.944   ← warna kedua merek
#000000  hitam       4.053
#003366  NAVY        2.879   ← identik dengan --navy di globals.css
```

Navy compro **persis sama** dengan `--navy` dashboard — identitas merek sudah
konsisten. Tapi kuning memikul logo, penanda tahun, dan seluruh aksen compro,
dan **tidak ada di dashboard**. Landing tanpa kuning tidak akan terasa seperti
Puraloka bagi siapa pun yang pernah melihat compro atau kartu nama.

Kontras terukur:

| Pasangan | Rasio | Verdikt |
|---|---|---|
| `#FFD600` di atas `#001F3D` | 11,77:1 | LULUS AA |
| `#FFD600` di atas `#003366` | 8,93:1 | LULUS AA |
| `#FFD600` di atas `#0059B3` | 4,83:1 | LULUS AA (tipis) |
| `#FFD600` di atas **putih** | **1,41:1** | **GAGAL** |
| `#001F3D` di atas `#FFD600` | 11,77:1 | LULUS AA |
| putih di atas `#FFD600` | 1,41:1 | GAGAL |

**Konsekuensi desain — kuning hanya hidup di gelap.** Landing berlatar navy
pekat adalah satu-satunya permukaan di seluruh produk tempat kuning merek bisa
dipakai sebagai teks dengan aman. Itu menjelaskan kenapa ia absen dari
dashboard yang berlatar terang, dan menjadikannya milik landing.

**Peran kuning: AKSEN TIPIS — bukan warna bidang.** (Keputusan founder.)

Warna utama landing adalah **gradasi navy** `#001F3D → #003366 → #0059B3`,
sama persis dengan dashboard. Kuning hanya menyentuh permukaan kecil:

| Boleh | Tidak boleh |
|---|---|
| Garis/rule penanda | Blok latar besar |
| Nomor tahap 01–05 | Panel atau kartu berlatar kuning |
| Satu angka kunci per layar | Latar seksi |
| Garis bawah tautan aktif | Logo (logo **putih**) |
| Titik penanda (pola "• • •" compro) | Tombol utama |

**Ambang pemakaian: satu elemen kuning per layar.** Kalau di satu layar ada dua
hal berwarna kuning, salah satunya salah.

**Aturan kontras (tetap mengikat):**
- Kuning **hanya** di atas navy `#003366` atau lebih gelap (≥ 8,93:1).
- Kuning **dilarang** di atas putih/permukaan terang (1,41:1).
- Bila kuning dipakai sebagai latar kecil (mis. pil nomor tahap), teksnya
  **navy pekat atau hitam** — tidak pernah putih.

**Kuning merek menggantikan amber `--warning` sebagai aksen landing.** Memakai
keduanya menghasilkan dua kuning yang bertabrakan.

#### Lambang — pakai yang sudah ada

`apps/web/public/puraloka-lambang.svg` sudah digambar ulang dari
`LOGO PURALOKA PERSADA.pdf`, proporsinya disetel setelah render dibandingkan
dengan PDF asli, dan memakai `currentColor` — bukan `#003366` mati. Salin apa
adanya; jangan buat ulang.

**Logo tampil PUTIH.** (Keputusan founder.) Cukup `color: #FFFFFF` — tidak
perlu berkas varian. Putih di atas navy pekat memberi 16,62:1, jauh di atas
kuning (11,77:1), dan menjaga kuning tetap langka sehingga aksennya bekerja.
Kuning **tidak** dipakai untuk logo.

**Perisai** — di sampul compro, lambang berdiri dalam perisai berujung membulat
(bahu lurus, dasar setengah lingkaran). Bentuk itu dipakai ulang di landing
sebagai pembungkus lambang dan penanda nomor tahap 01–05, tapi **diisi navy
dengan tepi kuning tipis**, bukan blok kuning penuh — konsisten dengan peran
kuning sebagai aksen.

**Milik landing sendiri, dari nol:**
skala tipografi, ritme spasi, radius, bayangan, komponen, motion.

Dashboard dirancang untuk dipelototi delapan jam — tenang, tidak menuntut
perhatian. Landing bertugas memenangkan tiga detik pertama. Memakai skala
dashboard di landing menghasilkan halaman yang sopan dan mudah dilupakan.

**Kelas token baru:** "di atas navy pekat". Token teks dashboard dirancang untuk
latar terang; adegan WebGL butuh latar pekat. Ini memperluas kelas yang sudah
dimulai `--pada-gelap-baik` / `--pada-gelap-perhatian` / `--pada-gelap-redup`,
yang komentarnya sudah menyatakan prinsipnya:
> "yang menentukan bukan tema yang dipilih pemakai, melainkan latar tempat
> teksnya berada."

**Catatan teknis — color space. ⚠️ KOREKSI 2026-08-07 (saat implementasi).**

Paragraf ini semula menyuruh "konversi linear eksplisit". **Itu salah, dan
mengikutinya menghasilkan cacat nyata.** Three.js r152+ sudah memakai manajemen
warna otomatis: `THREE.Color` menganggap hex sebagai sRGB dan mengonversinya
sendiri saat render. Memanggil `convertSRGBToLinear()` membuat konversinya
terjadi **dua kali**, dan warnanya jauh lebih gelap dari yang ditulis.

Biayanya nyata: empat percobaan perbaikan yang semuanya salah sasaran (menaikkan
hex tiga kali, menambah `hemisphereLight`) sebelum penyebabnya ketemu dengan
mengganti material ke `meshBasicMaterial` — yang mengabaikan cahaya sepenuhnya
dan membuktikan cahaya tak pernah jadi masalah.

**Aturan yang benar:** pakai hex sRGB apa adanya di `THREE.Color`, jangan
konversi manual. Yang tetap perlu diperhatikan: warna 3D **tidak** bisa disalin
mentah dari token CSS — material yang disinari terlihat berbeda dari bidang
datar, jadi nilainya disetel dengan melihat render, bukan diturunkan dari token.

### 5.2 Tipografi

Display bergaya **grotesk teknis**, lebar sempit, **angka tabular**. Bukan serif
mewah, bukan Inter. Alasannya bukan selera: dunia subjeknya adalah gambar kerja
dan tabel angka — tipografi teknis dengan angka berbaris presisi adalah bahasa
asli konstruksi, sama seperti tabel di dashboard. Angka tampil besar dan
berbaris, bukan sebagai "stat card dengan gradient".

Kandidat: Söhne / Neue Haas Grotesk Display; alternatif open-source: Archivo,
Roboto Condensed. Dikunci saat implementasi setelah uji render angka.

### 5.3 Signature element — massing yang tersusun

Massing bangunan **prosedural** (geometri dari kode, bukan file model) yang
tersusun mengikuti scroll. Tiap tahap mengunci satu baris data:

```
pondasi → struktur → arsitektur → MEP → serah terima
```

Yang bergerak bukan objek dekoratif berputar — yang bergerak adalah **urutan
membangun**. Struktur halaman = struktur pekerjaan.

Penomoran 01/02/03 **dipakai di sini** karena kontennya memang urutan sejati;
di seksi lain tidak dipakai.

**Kenapa prosedural, bukan `.glb`:** yang diceritakan adalah urutan, dan itu
butuh kontrol per-elemen yang tidak diberikan model statis. Bonus: nol MB
download, dan tidak ada aset yang bisa dikenali dari tempat lain.

**Opsional menyusul:** satu detail join baja dari `detail+join+s8.skp` di-export
ke glTF — objek yang benar-benar dirancang Puraloka.

### 5.4 Yang sengaja dibuang

Tidak ada partikel debu ambient, gradient mesh, atau blob berputar di hero.
Semua tersedia, semua akan membuat halaman ini terlihat seperti seribu halaman
lain. **3D-nya bekerja atau tidak ada.**

Foto nyata memikul beban meyakinkan; 3D menjelaskan proses. Halaman penuh WebGL
tanpa bukti nyata terbaca sebagai kompensasi.

---

## 6. Portofolio — dokumentasi proses

### 6.1 Temuan dari inspeksi foto

75 foto adalah **arsip lapangan, bukan portofolio siap tayang**. Sampel yang
diperiksa: tukang mengukur profil baja WF, gording biru bertumpuk, tabung las,
terpal. Satu foto **terbalik** (EXIF rotation tidak diterapkan).

Estimasi awal "15–25 layak tayang" **terkoreksi oleh §6.2**: 28 foto sudah
tervalidasi founder (dipakai di compro cetak), 47 sisanya jadi cadangan. Yang
tetap dibutuhkan hanya crop, koreksi rotasi, dan koreksi warna — bukan seleksi
dari nol.

**Ini kekuatan, bukan kelemahan.** Compro kontraktor kebanyakan memakai render
mengkilap atau foto stok. Halaman yang menampilkan proses lapangan sebenarnya
lebih dipercaya pembeli konstruksi — mereka mengenali bedanya. Dan itu menyatu
dengan konsep massing "urutan membangun": foto menjadi bukti untuk tiap tahap
yang diperagakan model 3D.

### 6.2 Pemetaan foto → kategori (TERBUKTI, bukan dugaan)

**Portofolio compro dikelompokkan per JENIS PEKERJAAN, bukan per proyek
bernama.** Halaman 13–19 PDF adalah galeri berisi 72 gambar dengan tujuh judul.
Ini menggantikan dugaan periode-waktu di draf sebelumnya — yang salah kerangka.

Pemetaan diperoleh dengan mencocokkan **perceptual hash** gambar galeri PDF
terhadap berkas di `Foto Proyek/`. Byte-hash gagal (0 kecocokan — PDF mengompres
ulang saat menyisipkan), pHash berhasil dengan **jarak Hamming 0** untuk
mayoritas: kecocokan sempurna, bukan kemiripan.

| Kategori (judul PDF) | Foto tercocok |
|---|---|
| Pembangunan Pabrik | 14 |
| Pematangan Lahan | 4 |
| Konstruksi Baja | 4 |
| Pembangunan Rumah Mewah | 3 |
| Pembangunan Perumahan | 3 |
| Renovasi Rumah | 0 |
| Beton Pracetak | 0 |
| **Terpakai di compro** | **28** |
| Tidak dipakai di compro | 47 |

Peta lengkap nama berkas: `scratchpad/peta-foto.json`.

**Konsekuensi:**

1. **28 foto sudah tervalidasi founder** — sudah dipilih untuk compro cetak,
   jadi tidak perlu kurasi ulang dari nol. Ini menghapus beban kurasi terbesar.
2. **Estimasi "15–25 layak tayang" di §6.1 terkoreksi jadi 28 tervalidasi**,
   plus 47 kandidat cadangan.
3. **Renovasi Rumah & Beton Pracetak: file asli TIDAK ADA di mesin ini.**
   Ditelusuri: `Renovrumahmu` (62 gambar), `Puraloka Panel` (2), `Proyek Lapang
   LPKIA`, `Dapur Makan Gratis` — **nol kecocokan**. Bukan soal ambang ukuran:
   gambar di hal. 17 dan 19 berukuran penuh (mis. 1529×3226, 1400×840).

   Halaman 19 (Beton Pracetak) diperiksa visual: **12 foto nyata dan kuat** —
   u-ditch, panel pagar precast diangkat crane, saluran terpasang, kanstin.
   Kualitasnya di atas rata-rata isi `Foto Proyek/`. Sayang kalau hilang.

   Tiga jalan, keputusan founder:
   - **Ekstrak dari PDF** — resolusi asli masih utuh di dalamnya (bukan versi
     layar). Paling cepat, dan cukup untuk web.
   - Founder menunjuk lokasi file asli (hard disk lain / HP).
   - Dua kategori dilewati di landing.

   **Rencana kerja memakai opsi ekstrak-dari-PDF** sebagai default, karena
   tidak memblokir dan hasilnya memadai. Bila file asli muncul, tinggal
   ditukar — pipeline media tidak berubah.
4. **Struktur portofolio mengikuti kategori pekerjaan**, dengan proyek bernama
   (Top Torch, Kijang Mas, Jaya Cemerlang) sebagai atribut di dalamnya. Ini juga
   lebih jujur: satu foto pemasangan baja bisa milik proyek pabrik mana pun,
   sementara kategori pekerjaannya pasti benar.

### 6.3 Pipeline media

Wajib, berurutan:

1. **Normalisasi orientasi EXIF** — terapkan rotasi (bukan hanya resize).
   Foto terbalik bukan kasus tunggal.
2. **Buang seluruh EXIF**, terutama GPS. Lokasi rumah klien tidak boleh terbit.
3. **Turunkan resolusi + AVIF/WebP berjenjang** (foto 4032px dari HP).
4. **Simpan di Supabase Storage**, bukan git. 661 MB tidak masuk repo.
5. **Alat bantu kurasi**: contact sheet agar founder memilih cepat.

---

## 7. Copy

### 7.1 Fakta yang dipakai (dari compro PDF)

Berdiri **2009** sebagai Gumilar Pramudya (Gugum Setiawan) → **Puraloka
Persada** 2020 (Nizar Ihza Zulkarnain).

| Tahun | Proyek |
|---|---|
| 2011 | Quarry tanah merah, Tol Cipali |
| 2012 | Tol Brebes (dengan PT Amanindo Perkasa Abadi) |
| 2013 | Retaining wall & saluran Tol Cipali (sub PT PP) |
| 2014 | GOR Pencak Silat, Garut |
| 2015 & 2020 | Pabrik + gudang PT Jaya Cemerlang, Bandung |
| 2018 | Landscape Apartemen Dhika, Bekasi |
| 2019 | Digitalisasi SPBU Jabar–Jateng |
| 2021–2024 | Gudang PT Sinarmaju, workshop Home 88, pabrik PT Top Torch, supermarket PT Kijang Mas |

Juga: dinding beton Tol Cisumdawu.

**PT Jaya Cemerlang muncul dua kali (2015 & 2020)** — klien yang kembali. Dalam
jasa konstruksi ini sinyal terkuat yang ada, dan harus ditonjolkan eksplisit.

### 7.2 Prosa PDF ditulis ulang

Prosa compro saat ini adalah persis nada yang harus dihindari: "mengutamakan
kualitas, inovasi, dan keberlanjutan", "mitra terpercaya", "solusi konstruksi
yang efisien, ramah lingkungan". Setiap kontraktor menulis kalimat yang sama.
Kalimat-kalimat itu **menenggelamkan fakta keras yang justru meyakinkan**.

**Aturan copy:**
- Verba aktif, kalimat pendek, sentence case.
- Spesifik selalu menang atas pintar.
- Nama proyek, tahun, dan lingkup — bukan kata sifat.
- Tidak ada kata: "solusi terintegrasi", "mitra terpercaya", "kualitas terbaik".

### 7.3 Typo di PDF (jangan diteruskan)

- Sampul: **"PURALOKA PERSDA"** → Puraloka Persada
- **"embangunan"** (2×) → Pembangunan

### 7.4 Identitas

- Nama publik: **Puraloka Persada**
- Narasi: **sejak 2009**
- Akta CV 2024 hanya di blok data legal, tanpa penjelasan berlebihan

---

## 8. Kontak & CTA

**WhatsApp sebagai CTA utama, email sebagai jalur formal.**

Klien konstruksi di Indonesia memulai lewat WhatsApp. Form punya masalah nyata:
pengirim tidak tahu pesannya sampai, dan menambah permukaan spam serta risiko
di API. WhatsApp memindahkan percakapan ke tempat yang sudah dipakai harian.

- **CTA utama:** WhatsApp dengan **pesan awal terisi sesuai konteks** — dari
  seksi pabrik, pesannya sudah menyebut pabrik. Menghilangkan beban "harus
  menulis apa".
- **Jalur formal:** `puralokapersada@gmail.com` untuk RFQ, tender, dokumen.
- **Tanpa form** di versi pertama.

### 8.1 Data yang tampil

```
Puraloka Persada
Puri Cipageran Indah 2 Blok D13/12
RT 002 / RW 022, Tanimulya, Ngamprah
Kabupaten Bandung Barat 40552

0813-1108-1813
puralokapersada@gmail.com
NIB 2110240218547
```

### 8.2 Dua keputusan privasi

**Nomor WhatsApp: `0813-1108-1813`** — dari halaman 20 compro PDF ("LET'S
CONNECT WITH US"), dikonfirmasi founder. Ekstraksi awal melewatkannya karena
hanya membaca 150 baris pertama; halaman kontak ada di akhir.

**Disimpan sebagai konten CMS, bukan konstanta di kode.** Nilai di atas adalah
isi seed awal — bisa diganti dari dashboard tanpa menyentuh kode, sesuai aturan
nol-hardcode.

**NPWP `27.924.367.9-421.000` sengaja TIDAK ditampilkan publik.** NIB cukup
sebagai bukti legalitas; NPWP lebih tepat di dokumen penawaran. Menyebarnya di
halaman terindeks tidak menambah kepercayaan tapi memperbesar permukaan
penyalahgunaan identitas usaha.

**Alamat:** ini alamat rumah (kompleks perumahan). Menampilkannya sah dan
menambah kredibilitas, tapi berarti alamat tinggal terindeks Google permanen.
Founder memilih menampilkan lengkap. Alternatif bila berubah pikiran: "Bandung
Barat, Jawa Barat" saja di publik, alamat lengkap hanya di dokumen.

---

## 9. Struktur halaman compro

```
┌──────────────────────────────────────────────────┐
│ HERO                                             │
│ Massing prosedural + pernyataan langsung         │
│ "Sejak 2009." + proyek yang bisa disebut namanya │
├──────────────────────────────────────────────────┤
│ BUKTI — deret proyek bernama                     │
│ Cipali · Cisumdawu · PT PP · Jaya Cemerlang (2×) │
├──────────────────────────────────────────────────┤
│ PROSES — 01→05, mengunci ke massing saat scroll  │
│ pondasi · struktur · arsitektur · MEP · serah    │
├──────────────────────────────────────────────────┤
│ PORTOFOLIO — foto proses lapangan per proyek     │
│ nama · tahun · klien · lingkup · lokasi          │
├──────────────────────────────────────────────────┤
│ LEGALITAS — KBLI bersertifikat sebagai data      │
│ mentah, tipografi teknis, bukan ikon "Layanan"   │
│ Kuning hanya sebagai rule tipis pemisah kolom    │
├──────────────────────────────────────────────────┤
│ KONTAK — WhatsApp kontekstual + email + alamat   │
└──────────────────────────────────────────────────┘
```

**KBLI sebagai signature kedua.** Deretan kode bersertifikat (41011, 43301,
43302, 43303, 43304, 43305, 43309, 43901, 68111, …) ditampilkan sebagai data
mentah dengan tipografi teknis — bukan diterjemahkan jadi ikon "Layanan Kami".
Kompetitor tidak menampilkannya karena kebanyakan tidak punya. Lebih meyakinkan
daripada animasi apa pun.

---

## 10. Skema data (garis besar)

Nomor migrasi **ditentukan saat implementasi** — migrasi terakhir 195, dan ada
pekerjaan belum ter-commit di working tree. Jangan dipaku di dokumen ini.

Tabel ber-`company_id` + RLS aktif:

| Tabel | Isi |
|---|---|
| `situs_konten` | key-value konten terbit (teks, angka, media) |
| `situs_proyek` | portofolio: nama, klien, tahun, lingkup, lokasi, urutan, tampil |
| `situs_media` | foto/video: ref storage, alt text, kredit, proyek |
| `situs_milestone` | linimasa 2009→sekarang |
| `situs_legalitas` | KBLI, NIB, sertifikat |
| `situs_seksi` | on/off, urutan, varian tampilan (tingkat 3) |
| `situs_adegan` | parameter 3D dengan `CHECK` constraint (tingkat 4) |
| `situs_merek` | warna + logo, tervalidasi kontras saat simpan |

Tanpa `company_id` (milik vendor): tabel halaman jual ERP — tahap 2.

Semua waktu `timestamptz`, semua nominal `numeric` (CLAUDE.md §5.4).

---

## 11. Ruang lingkup

### Masuk (tahap 1)
Fondasi CMS · pipeline media · compro lengkap sampai bisa terbit · massing 3D ·
endpoint publik · ISR + revalidate · validasi kontras · UI kurasi foto

### Tidak masuk (tahap 2, spec terpisah)
Halaman jual ERP · resolusi domain→tenant · form kontak · blog/artikel ·
multi-bahasa (sudah dicoret di scope owner 2026-07-26)

### Batas yang mengikat halaman jual ERP nanti
**Tidak boleh menjanjikan multi-company sebagai fitur yang bisa dipakai hari
ini.** Gerbang tenant kedua masih terkunci sampai Tahap 4 & 5. Menjual sesuatu
yang gerbangnya terkunci adalah cara tercepat kehilangan pelanggan pertama.

---

## 12. Posisi terhadap CHARTER

**Pekerjaan ini tidak ada di `QUEUE.yaml`.** Diverifikasi: tidak ada entri
landing/compro/marketing/publik di `QUEUE.yaml`, `CHARTER.md`, maupun
`PETA-PRIORITAS-ERP.md`.

Ini keputusan sadar founder, bukan kelalaian. Tindakan yang menyertainya:

1. Catat di `JOURNAL.md` sebagai keputusan di luar antrean, dengan alasannya.
2. Tambahkan item ke `QUEUE.yaml` agar antrean tetap merefleksikan kenyataan —
   sesuai prinsip "kalau kenyataan tidak cocok dengan dokumen, kenyataan yang
   menang".

**Tidak melanggar** larangan "jangan bangun apa pun di atas GL" (R-001):
landing page tidak menyentuh `accounts` / `journal_entries` sama sekali.

**Penjaga CI yang berlaku** (tidak boleh dilemahkan, G-5): `lint:ratchet`,
`audit-gerbang-tenancy.mjs`, `audit-kegagalan-senyap.mjs`,
`audit-tulis-tanpa-periksa.mjs`, `audit-catch-senyap.mjs`,
`audit-migrasi-skema-dipaku.mjs`, `gen-indeks-docs.mjs --check`.

---

## 13. Lantai kualitas

Dipenuhi tanpa diumumkan di UI:

- Responsif sampai mobile
- Fokus keyboard terlihat
- `prefers-reduced-motion` dihormati — **massing tetap bisa dibaca tanpa
  animasi**, bukan sekadar animasi dimatikan
- WCAG 2.1 AA, diukur terhadap latar sebenarnya di tiap konteks
- **Fallback tanpa WebGL**: perangkat tanpa dukungan atau lemah menerima versi
  statis yang tetap utuh maknanya. Foto memikul bukti, jadi halaman tetap
  bekerja tanpa 3D.
- Bundle 3D **lazy-load**, tidak memblokir LCP

---

## 14. Hal yang masih terbuka

| # | Hal | Butuh |
|---|---|---|
| 1 | ~~Nomor WhatsApp~~ | **Selesai** — `0813-1108-1813` (hal. 20 PDF) |
| 2 | ~~Kurasi foto~~ | **Selesai** — 28 foto terpetakan via pHash (§6.2); 47 sisanya cadangan |
| 2b | Renovasi Rumah & Beton Pracetak nol foto tercocok | Founder — sumber lain, atau kategori dilewati? |
| 2c | Lokasi & lingkup tiap kategori (mis. "gudang baja 1.200 m²") | Founder — menyusul, tak memblokir |
| 3 | Nomor migrasi & nama tabel final | Verifikasi saat implementasi |
| 4 | Display typeface final | Uji render angka |
| 5 | Alamat lengkap vs "Bandung Barat" | Diputuskan: tampil lengkap |
| 6 | ~~Compro PDF sebagai gambar~~ | **Selesai** — dirender via PyMuPDF (poppler tak perlu); temuan kuning merek §5.1 |
| 7 | ~~Logo perlu aset baru~~ | **Tidak perlu** — `apps/web/public/puraloka-lambang.svg` sudah digambar ulang dari `LOGO PURALOKA PERSADA.pdf`, proporsi disetel banding PDF asli, dan memakai `currentColor` sehingga bisa tampil kuning di atas navy. Salin apa adanya. |

---

## 15. Riwayat koreksi selama desain

Dicatat sesuai CHARTER §7 — dokumen desain yang menyembunyikan koreksinya
membuat pembaca berikutnya mengulangi kesalahan yang sama.

| Asumsi awal | Kenyataan | Sumber koreksi |
|---|---|---|
| Warna dashboard navy solid | Gradasi 3 titik henti, sudah jadi token | Founder |
| Tidak ada aset foto/3D | 75 foto, 6 video, model SketchUp, logo, KBLI | Founder |
| ERP belum siap dijual | 340 endpoint, 134 tabel, 160 test | Founder → diukur |
| Foto = galeri hasil akhir | Arsip proses lapangan; 15–25 layak tayang | Inspeksi foto |
| 3D sebagai bintang halaman | Foto memikul bukti; 3D menjelaskan proses | Konsekuensi aset |
| Landing mewarisi CSS dashboard | Hanya warna merek + metode a11y | Founder |
| Merek = navy saja | **Kuning `#FFD600` warna kedua** — memikul logo & aksen di seluruh compro, absen dari dashboard | Render + sampling piksel PDF |
| Aksen landing = amber `--warning` | Kuning merek menggantikannya — dua kuning akan bertabrakan | Konsekuensi temuan di atas |
| PDF tak bisa dirender (poppler hilang) | PyMuPDF sudah terpasang dan cukup | Dicoba, bukan diasumsikan |
| Portofolio dikelompokkan per **proyek bernama** | Compro mengelompokkan per **jenis pekerjaan** (7 kategori, hal. 13–19) | Founder → dibuktikan pHash |
| Kurasi 75 foto beban terbesar founder | 28 foto **sudah** dikurasi founder untuk compro cetak — tinggal dipetakan | pHash, jarak Hamming 0 |
| Nomor WhatsApp tak ada di PDF | Ada di hal. 20; ekstraksi awal berhenti di baris 150 | Founder |
