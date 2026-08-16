# ARAH VISUAL 2026 — Puraloka Suite

> **Status: DIRATIFIKASI — 2026-08-07. Gerbang §10 TERTUTUP.**
>
> | §10 | Keputusan founder | Status |
> |---|---|---|
> | 1. Aksen indigo `#6366F1` | ❌ **DITOLAK sesudah dilihat** (`a38cb0d`) | perbandingan dibangun & dilihat; **navy tetap aksen tunggal** — §10d |
> | 2. Sidebar gelap permanen | ❌ **DITOLAK** — *"tergantung mode-nya, dark atau light"* | §5d dicoret |
> | 3. Tab dipecah jadi halaman | ✅ **SETUJU** | **selesai** — keuangan, mandor, kas ketiganya dipecah (ukur: §1c) |
> | 4. Halaman contoh = Dashboard | ✅ **SETUJU** | dikerjakan |
>
> **Jangan membaca dokumen ini sebagai "usulan yang menunggu persetujuan".**
> Keempatnya sudah dijawab (§10), dan **keempatnya sudah selesai** — termasuk
> nomor 1, yang sempat berumur pendek sebagai "pekerjaan": perbandingannya
> dibangun (`apps/web/scripts/banding-aksen.mjs`), dilihat, lalu ditolak.
> Founder 2026-08-07: *"jangan jadi penghalang karena terus minta keputusan
> saya terus"*.
>
> **⚠️ Batas wilayah:** token kerapatan (`--pad-kartu`, `--gap-grid`,
> `--teks-*`) di `globals.css` sedang digarap **sesi lain**. Founder memutuskan
> *"lewati kerapatan, garap sisanya"* — UI-0-1 tidak dikerjakan dari sini.
>
> **⚠️ Dua koreksi:** dark mode **sudah ada dan jalan** (bukan pekerjaan baru),
> dan `2026-08-06-sumbu-ui-roadmap.md` **bukan** dokumen visual. Rinciannya
> §10b — baca sebelum mengambil kesimpulan dari isi dokumen ini.
>
> ### ⚠️ Temuan 2026-08-07 — `--aksen` SUDAH ADA, dan isinya navy
>
> Diukur di `globals.css`:
>
> ```
> --aksen:         #003366   ← navy, BUKAN indigo
> --aksen-terang:  #0059B3   ← biru
> --aksen-pekat:   #001F3D
> --aksen-lembut:  #E8F0F8
> ```
>
> Inilah "biru-di-atas-biru" yang §3a sebut sebagai penyebab monoton — token
> bernama *aksen* yang nilainya sama keluarga dengan warna merek.
>
> **Dan tetap navy — bukan karena belum sempat, melainkan karena sudah diuji
> dan ditolak** (`a38cb0d`, §10d). Jangan menukarnya ke indigo. Empat langkah
> penerapan yang dulu tertulis di sini sudah dicabut bersama keputusannya.
>
> Yang **masih berlaku** dari temuan ini: token bernama *aksen* yang nilainya
> sekeluarga dengan warna merek memang tidak memberi kontras apa pun. Tetapi
> §10d membuktikan penyelesaiannya bukan menukar nilai token itu — melainkan
> memperbaiki **berapa banyak layar yang dikendalikannya**. Lihat §10d
> sebelum mengusulkan warna aksen apa pun lagi.
>
> Dokumen ini menjawab keluhan founder 2026-08-04:
> *"kurang dapet wah-nya, kurang punya taste desain"* dan
> *"tiap halaman terasa padat dan tidak kosong"*.
>
> Kalau arah di sini ditolak, biayanya nol — belum ada yang dibangun di atasnya.

---

## 0. Ringkasan satu halaman

| | |
|---|---|
| **Masalahnya** | Bukan "jelek". Halaman **2× lebih longgar** dari standar data-dense, font justru **lebih kecil**, dan **20 dari 22 menu induk hanya punya satu halaman** — langsung tabel, tanpa lapisan |
| **Yang dipertahankan** | Navy `#003366` (brand), Bricolage Grotesque + Plus Jakarta Sans (sudah bagus, bukan Inter), 105 token ber-riwayat WCAG |
| **Yang berubah** | Kerapatan (padding 24→12, *dipegang sesi lain*), **dashboard per menu induk**, tab dipecah jadi halaman. ~~sidebar gelap~~ **ditolak** · aksen **ditahan** (§10) |
| **Cara mengukurnya** | §8 — tiap klaim di dokumen ini punya perintahnya |

---

## 1. Diagnosis — angka, bukan perasaan

Semua diukur 2026-08-04 dari kode yang berjalan.

### 1a. Terlalu longgar, bukan kurang taste

| | Standar data-dense | Puraloka hari ini |
|---|---|---|
| Padding kartu | **12px** | **24px** ← 2× |
| Gap grid | **8px** | 16–20px |
| Tinggi baris tabel | **36px** | tak seragam |
| Font tabel | **12–14px** | **9–11px** ← terlalu kecil |

Padding besar mendorong konten menjauh; font mengecil supaya muat. Hasilnya:
**banyak ruang putih dengan tulisan kecil** — persis kebalikan dari "padat".

Data-dense yang benar: **padding rapat, font lebih besar, informasi lebih
banyak per layar**. Itu yang membuat Linear dan Ramp terasa mahal.

### 1b. Monoton karena tak ada lapisan

```
18 dari 28 menu induk = 1 halaman saja     ← diukur ulang 2026-08-08
```

> Angka lama di sini ("20 dari 22") ditulis 2026-08-04 dan sudah dua kali
> basi — `df6557d` mengoreksinya jadi "16 dari 24", dan itu pun kini keliru.
> Ukur sendiri, jangan percaya baris di atas:
> ```bash
> for d in "apps/web/app/(dashboard)"/*/; do
>   echo "$(basename $d) $(find $d -name page.tsx | wc -l)"; done
> ```

Klik "Keuangan" → langsung tabel. Klik "Kas" → langsung tabel. Tak ada
ringkasan, tak ada grafik, tak ada "keadaan hari ini". Tiap menu terasa sama
karena **memang** sama bentuknya.

### 1c. Tab menyembunyikan aplikasi di dalam halaman

Diukur 2026-08-04 (angka asli diagnosis), dan **diukur ulang 2026-08-08**:

| Halaman | Baris 08-04 | Baris 08-08 | Keterangan |
|---|---|---|---|
| **estimasi** | — | **3.713** | ← **terbesar sekarang**; §6b menyebutnya "tetap tab ✅" |
| laporan | 1.713 | 1.809 | naik sedikit |
| dashboard | — | 944 | |
| **keuangan** | 3.449 | **sudah dipecah** | UI-2-1 selesai — 5 sub-halaman |
| **mandor** | 3.667 | **sudah dipecah** | tak lagi di daftar terbesar |
| kas | 1.447 | **sudah dipecah** | |

Halaman 3.400 baris bukan halaman — itu aplikasi yang disembunyikan di balik
tab. Orang tak tahu ada apa di dalamnya sampai mengklik, dan mesin pencari
internal tak bisa menemukannya.

> **Yang berubah sejak diagnosis ditulis:** tiga halaman terbesar (keuangan,
> mandor, kas) sudah dipecah — §10 nomor 3 selesai seluruhnya, bukan "sisa
> mandor + kas" seperti tertulis di header. Tapi **estimasi 3.713 baris**
> kini memegang rekor, dan §6b menggolongkannya "tetap tab ✅" dengan alasan
> tahapan satu alur kerja. Alasan itu mungkin masih benar; **ukurannya tidak
> lagi bisa diabaikan**. Ini pekerjaan terbuka, bukan keputusan yang sudah turun.
>
> **→ SELESAI 2026-08-16.** Diukur ulang: 4.070 baris (naik lagi dari 3.713).
> Estimasi dipecah jadi 5 rute + 2 halaman master. Alasan lengkapnya, termasuk
> kenapa §6b berubah arah, ada di **§6d**.
>
> ```bash
> wc -l "apps/web/app/(dashboard)"/*/page.tsx | sort -rn | head -8
> ```

---

## 2. Yang DIPERTAHANKAN — dan kenapa

Merombak bukan berarti membuang. Tiga hal ini sudah benar, dan menggantinya
akan membuang kerja yang berharga:

**Navy `#003366`.** Ini identitas Puraloka — logonya (grafik batang naik)
memakai warna ini. Mengubahnya berarti mengubah merek, bukan UI.

**Bricolage Grotesque + Plus Jakarta Sans.** Diperiksa terhadap rekomendasi
mesin desain (Fira/Outfit/Poppins): pasangan yang ada **setara atau lebih
berkarakter**. Yang penting: **ini bukan Inter**. Font default AI-slop justru
yang dihindari, dan repo ini sudah lolos.

**105 token dengan riwayat WCAG tertulis.** Contohnya di `globals.css`:

> *`#9CA3AF` sampai 2026-07-31 — GAGAL WCAG AA: kontras 2,53:1 di atas putih…
> ditemukan axe-core pada halaman LOGIN, layar pertama yang dilihat setiap
> pengguna.*

Disiplin seperti itu jarang ada bahkan di produk berbayar. Arah baru
**menambah** di atasnya, bukan menghapusnya.

---

## 3. Palet — navy tetap raja, satu aksen berani

### 3a. Kenapa butuh aksen baru

Riset palet (mesin `ui-ux-pro-max`, domain `color`) mengembalikan empat
kandidat untuk "construction navy professional". **Semuanya biru-di-atas-biru**
— dan itu persis penyebab kesan monoton hari ini: navy untuk merek, biru untuk
info, biru untuk tautan, biru untuk grafik. Tak ada yang menonjol karena
semuanya menonjol.

Referensi Buildify yang founder kirim menyelesaikannya dengan cara berbeda:
**satu ungu pekat, sisanya abu-abu diam**. Keberaniannya dibelanjakan di SATU
tempat.

### 3b. Palet usulan — ⚠️ blok AKSEN di bawah **DITOLAK**, jangan disalin

> **Baca §10d sebelum blok ini.** Bagian `AKSEN BARU` adalah usul yang sudah
> dibangun, dilihat, dan **ditolak** (`a38cb0d`). Nilai `--aksen*` yang berlaku
> di `globals.css` adalah **navy**, bukan indigo. Blok ini disimpan sebagai
> catatan sejarah — menyalinnya ke kode berarti menerapkan keputusan yang
> sudah dicabut.

```
IDENTITAS (tak berubah)
  --navy            #003366   merek Puraloka, sidebar, tombol utama
  --navy-mid        #0050A0
  --navy-light      #EBF2FF

AKSEN BARU — ❌ DITOLAK 2026-08-07 (§10d), TIDAK dipakai
  --aksen           #6366F1   indigo
  --aksen-terang    #818CF8
  --aksen-lembut    #EEF0FF
  --aksen-pekat     #4338CA

DATA — ⚠️ blok di bawah TAK PERNAH DITERAPKAN; yang berlaku ada di kode
  --data-1          #003366   navy      (nilai utama)     ← ini saja yang cocok
  --data-2          #6366F1   indigo    (pembanding)      ← ditolak (§10d)
  --data-3          #0891B2   cyan      (deret ketiga)    ← nyatanya --data-2
  --data-4          #B45309   amber     (perhatian)
  --data-5          #7C3AED   ungu      (deret kelima)

SEMANTIK (tak berubah — sudah lolos WCAG)
  --success #15803d · --warning #B45309 · --danger #B91C1C · --info #1D4ED8
```

**Deret DATA yang sungguh berlaku** — diukur 2026-08-08 di `globals.css:353`
(terang) dan `:669` (gelap). Ia berbeda dari usul di atas, dan yang di kode
yang menang:

```
                 TERANG      GELAP
  --data-1       #003366     #7ABDFF     navy / biru terang
  --data-2       #0891B2     #34D399     cyan / hijau
  --data-3       #15803D     #FBBF24     hijau / amber
  --data-4       #A16207     #A3E635     amber / hijau-lime
  --data-5       #EA580C     #CBD5E1     oranye / abu
```

Ukur ulang kapan saja: `grep -nE "^\s*--data-[0-9]" apps/web/app/globals.css`

### 3c. ~~Kenapa indigo, bukan ungu seperti Buildify~~ — argumen yang kalah oleh render

> **Dipertahankan sebagai catatan sejarah.** Ketiga alasan di bawah terdengar
> masuk akal di atas kertas dan tetap tidak menyelamatkan usulnya begitu
> dirender (§10d). Itu justru gunanya disimpan: **argumen roda warna tidak
> memprediksi hasil di layar.**

1. **Bertetangga dengan navy** di roda warna — terasa satu keluarga, bukan
   tempelan.
2. **Cukup berbeda** untuk menonjol: navy pekat gelap, indigo terang berjenuh.
3. **Ungu Buildify (`#7C3AED`) terlalu jauh dari navy** — dipakai bersama, ia
   membuat navy terlihat kusam. Indigo menaikkan navy, bukan menenggelamkannya.

**Yang sebenarnya terjadi:** alasan 1 dan 2 saling meniadakan di layar — cukup
dekat untuk terbaca sebagai "navy yang salah", cukup jauh untuk tidak menyatu.
Ada pula sebab kedua yang independen dan terukur, tercatat di
[rfq/page.tsx:797](apps/web/app/(dashboard)/procurement/rfq/page.tsx#L797):
indigo `#6366F1` berkontras **4,47** — di bawah ambang teks 4,5.

### 3d. Aturan pemakaian aksen — ini yang paling mudah dilanggar

> **Satu aksen per layar.** Kalau tiga hal berwarna indigo, tak ada yang
> menonjol — dan halaman kembali monoton dengan warna yang berbeda.

| Boleh indigo | Tidak boleh |
|---|---|
| angka KPI **paling penting** di halaman | semua angka KPI |
| tombol aksi utama (satu per layar) | semua tombol |
| garis grafik **nilai utama** | seluruh deret grafik |
| indikator navigasi aktif | seluruh item navigasi |

---

## 4. Kerapatan — token spasi baru

Ini perubahan **paling berdampak** dan **paling murah**: ubah token, 59 halaman
ikut rapat sekaligus, tanpa menyentuh struktur.

```
                          SEKARANG    USULAN     ALASAN
--pad-kartu                 24px      12px       standar data-dense
--pad-kartu-longgar          —        16px       kartu KPI (butuh napas)
--gap-grid                16-20px      8px       standar data-dense
--gap-bagian                20px      16px
--tinggi-baris              auto      36px       baris tabel seragam
--radius-kartu              12px      14px       lebih lega, melunakkan rapat

TIPOGRAFI — NAIK, bukan turun
--teks-tabel              9-11px    12.5px       yang paling sering dibaca
--teks-label                11px      12px
--teks-badan                13px      14px
--teks-angka-kpi            17px      28px       angka besar = hierarki tegas
--teks-delta                 —        12px       "+2.3%" kecil di sebelahnya
```

**Yang mengejutkan:** font **naik** sementara padding **turun**. Itu bukan
kontradiksi — itu justru rahasianya. Ruang yang dihemat dari padding dipakai
untuk teks yang lebih terbaca.

### 4a. Lebar halaman — ikut layar, dengan langit-langit

> Ditetapkan 2026-08-08 sesudah founder melaporkan, memakai layar 2K:
> *"kanan kirinya ada jarak yg lumayan banyak"*. Diukur, dan benar.

```
                SEBELUM              SESUDAH
--w-form    min(900px, 100%)     (tetap)
--w-page    min(1280px, 100%)    min(clamp(1280px, 82vw, 1800px), 100%)
--w-luas    min(1500px, 100%)    min(clamp(1500px, 92vw, 2200px), 100%)
```

**Kenapa berubah.** Batas 1280 lahir dari aturan "±75 karakter per baris".
Aturan itu benar untuk **prosa satu kolom** dan tetap dipakai — `--w-form`
sengaja TIDAK ikut melebar, karena 900px adalah batas mata dan itu tak
berubah walau monitornya 4K. Tapi `--w-page` dan `--w-luas` dipakai halaman
**grid KPI dan tabel**, di mana tak ada "baris" untuk dijaga panjangnya.
Memaksakan batas baca ke grid hanya menyempitkan kolom tanpa satu pun
manfaat. Terukur di 2560px sebelum perbaikan:

```
/proyek      tersedia 2340 · isi 1280  → 1060px KOSONG
/dashboard   tersedia 2340 · isi 1500  →  840px KOSONG
```

**Kenapa tetap ada langit-langit** (1800 / 2200), bukan `100%`: di 4K tanpa
batas, satu baris tabel jadi 3600px dan mata kehilangan pasangan
kolom-kiri↔kolom-kanan. Yang dicari bukan "selebar mungkin", melainkan
"selebar yang masih bisa dipindai".

**Dua sumber lebar, dan yang kedua tak tersentuh CSS.** Dashboard memakai
`react-grid-layout`, yang menempatkan widget dengan **lebar piksel mutlak**
hasil hitungan JavaScript — melebarkan token CSS tak menyentuhnya sama
sekali. Cacatnya: lebar wadah diukur sekali saat halaman dimuat lalu tak
pernah diukur ulang, jadi seluruh widget mandek di 1280px sementara
wadahnya 2128px. Tak ada galat, halaman tampil utuh, hanya 848px yang
menganggur. Perbaikannya `ResizeObserver` di `components/dashboard-grid.tsx`
(`useLebarKontainer`).

**Dijaga oleh** `apps/web/scripts/uji-lebar-responsif.mjs`: 5 resolusi ×
3 halaman, membandingkan lebar terukur dengan `clamp()` yang dihitung ulang
di skripnya — bukan dengan ambang tebakan. Sudah dibuktikan bisa merah
(mutasi token → 3 merah; mutasi daftar kebergantungan efek → 3 merah).

---

## 5. Layout — dashboard per menu induk

### 5a. Gagasan founder, dan kenapa saya setuju

> *"tiap menu induk kayanya bagus ada semacam dashboard masing-masing gasii,
> dan punya KPI card, grafik, chart nya juga"*

**Ya.** Ini menyelesaikan §1b sekaligus §1c: halaman jadi padat (KPI + chart +
tabel, bukan tabel saja), dan orang tahu **keadaan** sebelum menyelam ke detail.

### 5b. Pola baku — tiga lapis

```
┌─────────────────────────────────────────────────────────────┐
│ LAPIS 1 — KEADAAN     4 kartu KPI                           │
│ "apa yang terjadi?"   angka besar + delta + spark kecil      │
├─────────────────────────────────────────────────────────────┤
│ LAPIS 2 — POLA        1-2 grafik                            │
│ "ke mana arahnya?"    tren waktu · perbandingan kategori     │
├─────────────────────────────────────────────────────────────┤
│ LAPIS 3 — DETAIL      tabel / daftar                        │
│ "apa yang harus       yang bisa disaring & diurutkan         │
│  saya kerjakan?"                                             │
└─────────────────────────────────────────────────────────────┘
```

Urutannya **bukan selera**: ia mengikuti pertanyaan yang dibawa orang saat
membuka halaman. Menaruh tabel di atas memaksa mereka memindai 40 baris untuk
menjawab pertanyaan yang bisa dijawab satu angka.

### 5c. KPI per menu induk — usulan konkret

| Menu | KPI 1 | KPI 2 | KPI 3 | KPI 4 |
|---|---|---|---|---|
| **Dashboard** | proyek aktif | nilai kontrak | kas hari ini | yang perlu keputusan |
| **Proyek** | aktif | progres rata-rata | telat | selesai bulan ini |
| **Keuangan** | kas | piutang | retensi tertahan | klaim terbuka |
| **Kas** | saldo total | masuk bulan ini | keluar bulan ini | selisih |
| **Mandor** | mandor aktif | kasbon beredar | penagihan menunggu | retensi tertahan |
| **Procurement** | PO terbuka | menunggu terima | nilai bulan ini | vendor aktif |
| **Lapangan** | RFI terbuka | punch belum tutup | instruksi belum konfirmasi | NCR aktif |
| **Kontrak** | kontrak aktif | EOT menggantung | klaim terbuka | jaminan mau habis |

Tiap angka di sini **sudah ada API-nya** — tak ada yang perlu dibangun dari nol.

### 5d. ~~Sidebar gelap~~ — ❌ DITOLAK 2026-08-07

> **Jangan kerjakan bagian ini.** Founder: *"sidebar itu tergantung pada
> mode-nya, dark atau light"* — sidebar mengikuti tema, bukan gelap permanen.
> Ini bukan penolakan estetika melainkan **koreksi faktual**: aplikasi sudah
> punya mode gelap yang berfungsi (§10b), jadi sidebar sudah gelap dengan
> sendirinya saat temanya gelap. Token `--sidebar-*` di bawah **tidak dibuat**.
>
> `QUEUE-UI.yaml` UI-0-3 dicoret. Teks di bawah disimpan sebagai catatan
> sejarah alasan usulnya, bukan instruksi.

Dari referensi Buildify: sidebar gelap + konten terang menciptakan **dua zona**
— navigasi "mundur", konten "maju". Itu yang membuat kontennya terasa naik ke
depan tanpa perlu bayangan tebal.

```
--sidebar-bg        #0B1220   navy nyaris hitam (bukan hitam murni)
--sidebar-teks      #94A3B8
--sidebar-aktif-bg  #1E293B
--sidebar-aktif-tx  #FFFFFF
--sidebar-aktif-bar #6366F1   ← garis aksen 3px di kiri item aktif
```

Bukan hitam murni: `#0B1220` menahan rona navy, jadi sidebar terasa satu
keluarga dengan merek — bukan tema gelap generik.

---

## 6. Tab vs halaman — aturan yang bisa diuji

### 6a. Aturannya

> **Tab** = sudut pandang berbeda atas **data yang sama**
> **Halaman** = **entitas berbeda**

Uji cepat: *"kalau saya kirim tautan ini ke rekan, apa yang ia lihat?"* Kalau
jawabannya bergantung tab mana yang terakhir dibuka, itu **seharusnya halaman**.

### 6b. Penerapan

| Halaman | Sekarang | Usulan |
|---|---|---|
| **keuangan** (3.449 baris) | ~8 tab | **dashboard** + `/keuangan/invoice` `/piutang` `/retensi` `/klaim` |
| **mandor** (3.667 baris) | 7 tab | **dashboard** + `/mandor/penugasan` `/upah` `/kasbon` `/penagihan` `/retensi` |
| **kas** (1.447 baris) | ~4 tab | **dashboard** + `/kas/transaksi` `/transfer` |
| **laporan** (1.713 baris) | ~5 tab | tetap tab — semuanya **laporan yang sama, periode berbeda** ✅ |
| ~~**estimasi**~~ | ~~7 tab~~ | ~~tetap tab — tahapan satu alur kerja ✅~~ → **DIPECAH 2026-08-16**, lihat §6d |

Yang tersisa **sengaja tak dipecah**: `laporan` — tab di sana memang benar.

### 6d. Estimasi akhirnya DIPECAH — 2026-08-16

Baris di atas menggolongkan estimasi "tetap tab" dengan alasan *tahapan satu
alur kerja*. Alasan itu **kalah oleh dua hal**, dan keduanya sudah tertulis di
dokumen ini sendiri.

**Pertama, §1c sudah menandainya sebagai pekerjaan terbuka**, bukan keputusan:

> estimasi **3.713 baris** kini memegang rekor, dan §6b menggolongkannya
> "tetap tab ✅"… Alasan itu mungkin masih benar; **ukurannya tidak lagi bisa
> diabaikan**. Ini **pekerjaan terbuka, bukan keputusan yang sudah turun.**

Diukur ulang 2026-08-16: **4.070 baris** — naik dari 3.713, masih bertambah.

**Kedua, aturan uji §6a menjawab "pecah" kalau dijalankan jujur.** Tab = sudut
pandang berbeda atas *data yang sama*. Tetapi:

| Isi tab | Entitasnya | Uji §6a |
|---|---|---|
| Katalog AHSP | master **nasional**, lintas proyek | entitas lain → halaman |
| Harga (price book) | master **perusahaan**, lintas proyek | entitas lain → halaman |
| Komposer / RAP / Kas / Varians | dokumen **per proyek** | entitas lain → halaman |

Katalog AHSP nasional dan RAP satu proyek bukan dua sudut pandang atas data
yang sama.

**Yang memicu pemeriksaan ulang** — diukur lewat sesi ber-login, bukan dibaca
dari kode: **empat dari enam tab merender NOL tabel**, dan "Material & RAP"
berupa halaman putih tanpa satu pun penjelasan. Backend-nya sementara itu punya
47 endpoint, 22 permission, 3.043 analisa, 3.212 harga, 208 skenario, 2.221
versi. Ketimpangan itu yang membuat modul ini terasa "kurang intuitif" — bukan
gaya visualnya.

**Hasilnya:**

```
/estimasi            ikhtisar (daftar proyek + jalan masuk)
/estimasi/rab        susun RAB          ← inti
/estimasi/rap        anggaran pelaksanaan
/estimasi/kas        proyeksi kas
/estimasi/varians    varians biaya
/master/ahsp         katalog AHSP    (master lintas proyek)
/master/harga        price book      (master lintas proyek)
```

Tautan lama `?tab=…` **dialihkan**, bukan dimatikan — 6 pengalihan diuji satu
per satu di peramban, lulus 6 gagal 0.

Founder menyetujui arah ini setelah melihat mockup berdampingan (pola §10d yang
sama, *"tunjukkan dulu, baru saya putuskan"*).

### 6c. Yang didapat

- Tautan bisa dibagikan (`/mandor/retensi` langsung terbuka)
- Halaman 3.667 baris jadi 5 berkas ±600 baris — bisa dibaca manusia
- Tiap halaman punya judul sendiri → mesin pencari internal menemukannya
- Muat lebih cepat: tak lagi memuat data 7 tab sekaligus

---

## 7. Gerak — hemat, dan tiap gerakan punya sebab

Skill `frontend-design` memperingatkan: animasi berlebih justru membuat desain
terasa **dihasilkan AI**. Karena itu daftarnya pendek dan tiap satunya menjawab
pertanyaan "apa yang berubah?".

| Di mana | Apa | Durasi |
|---|---|---|
| Baris tabel di-hover | latar `--surface-hover` | 150ms |
| Kartu KPI muncul | naik 8px + fade, bertahap 40ms antar-kartu | 300ms |
| Angka KPI berubah | hitung naik dari nilai lama | 400ms |
| Tab/halaman pindah | crossfade | 200ms |
| Tombol ditekan | skala 0.98 | 100ms |

**Tak ada** parallax, blob bergerak, gradient beranimasi, atau hero besar.
`prefers-reduced-motion` mematikan semuanya.

---

## 8. Cara mengukur — jangan percaya angka di dokumen ini

Tiap klaim di atas punya perintahnya. Jalankan ulang; kalau berbeda, **dokumen
ini yang salah**.

```bash
# Kerapatan yang dipakai sekarang
grep -ohE "padding: [0-9]+" "apps/web/app/(dashboard)/proyek/[id]/page.tsx" \
  | sort | uniq -c | sort -rn | head -5

# Ukuran font
grep -ohE "fontSize: [0-9]+" "apps/web/app/(dashboard)/proyek/[id]/page.tsx" \
  | sort | uniq -c | sort -rn | head -5

# Menu induk & jumlah halamannya
for d in "apps/web/app/(dashboard)"/*/; do
  echo "$(basename $d) $(find $d -name page.tsx | wc -l)"
done

# Halaman terbesar
wc -l "apps/web/app/(dashboard)"/*/page.tsx | sort -rn | head -6

# Penjaga visual yang sudah ada (semuanya harus tetap hijau)
cd apps/web && for g in a11y-ratchet kontras-hex-ratchet hex-ratchet \
  tata-letak-ratchet modal-esc-ratchet; do node scripts/$g.mjs; done
```

---

## 9. Risiko — dan kenapa saya tetap mengusulkannya

| Risiko | Mitigasi |
|---|---|
| **Rombak 59 halaman berhenti di tengah** → aplikasi setengah lama setengah baru, lebih buruk dari sekarang | Kerjakan **per token dulu** (§4). Ubah token = semua halaman ikut rapat serentak. Baru sesudahnya per-halaman |
| **Arah visualnya ternyata tak disukai** | **Satu halaman contoh dulu.** Biaya kalau salah: satu halaman, bukan 59 |
| **Penjaga WCAG jadi merah** | 9 penjaga visual sudah ada dan wajib tetap hijau — termasuk `kontras-hex-ratchet` yang memeriksa pasangan warna sebaris |
| **Fitur berhenti dibangun** selama rombak | Roadmap UI **terpisah** (`QUEUE-UI.yaml`), dikerjakan berselang dengan roadmap utama — bukan menggantikannya |

---

## 10. Keputusan founder — SUDAH TURUN 2026-08-07

> **Gerbang ini TERTUTUP. Jangan tanyakan ulang keempatnya.**
>
> Sesi sebelum ini berhenti bekerja karena membaca §10 sebagai "menunggu
> keputusan" dan bertanya lagi. Founder 2026-08-07: *"jangan jadi penghalang
> karena terus minta keputusan saya terus"*. Yang belum diputuskan tinggal
> **satu**, dan bentuknya bukan pertanyaan melainkan **pekerjaan** (nomor 1).

| # | Pertanyaan | Usul saya | Keputusan |
|---|---|---|---|
| 1 | Palet aksen indigo `#6366F1` | indigo | ❌ **DITOLAK** sesudah dilihat — lihat §10d. Navy tetap aksen tunggal |
| 2 | Sidebar gelap `#0B1220` permanen | ya | ❌ **DITOLAK** — *"tergantung pada mode-nya, dark atau light"*. Sidebar ikut tema. **§5d dicoret** |
| 3 | Tab dipecah jadi halaman | ya (keuangan/mandor/kas) | ✅ **SETUJU — dan sudah SELESAI ketiganya** (2026-08-08). Terbuka baru: estimasi 3.713 baris, §1c |
| 4 | Halaman contoh mana dulu | Dashboard | ✅ **SETUJU** |
| 5 | Sidebar: item aktif jadi **pill navy pekat** (kandidat B) | B | ✅ **SETUJU sesudah dilihat** 2026-08-08 — lihat §10e |
| 6 | Topbar: pencarian pindah ke **kiri**, lebar | ya | ✅ **SETUJU** 2026-08-08 — lihat §10e |

### 10g. Spanduk peringatan DIBUANG — jadi kartu, 2026-08-09

Founder: *"kayanya spanduk yg diatas apakah ngga lebih baik jadi critical
alerts aja kaya di referensi? jadi lebih clean, menurut mu gimana?"* — lalu
menunjuk referensinya langsung saat saya menawarkan tiga posisi.

**Referensi tidak punya spanduk sama sekali.** "Critical Issue Alerts" di sana
adalah KARTU di baris paling bawah, sejajar Recent Project Updates dan
Upcoming Deadlines. Saya sempat salah baca ini — catatan lama di
`dashboard-grid.tsx` menulis bahwa alerts "sudah punya rumahnya" berupa
spanduk. Itu keliru; spanduknya buatan kita sendiri.

**Diukur sebelum dibuang:** tiga spanduk 38px + jarak = ~150px, memakai tiga
warna yang berteriak bersamaan (merah · kuning · biru). Saat semuanya
menonjol, tak ada yang menonjol — dan bentuknya tak bisa tumbuh: enam jenis
peringatan berarti 300px.

**Baris bawah sekarang persis referensi:**

| Referensi | Kita |
|---|---|
| Recent Project Updates | Kabar Lapangan |
| Critical Issue Alerts | Peringatan Kritis |
| Upcoming Deadlines | Tenggat Mendatang |

**Yang menjaga urgensi tetap terlihat sesudah spanduk hilang** — diperiksa
sebelum membuang, bukan sesudah:

- `SidebarFokus` ("3 lewat tenggat · 3 menunggu putusan") hadir di **setiap**
  halaman, bukan cuma beranda.
- Kartu "Perlu keputusan" di rail — sejak 2026-08-09 **satu baris** (angka +
  tautan), bukan lagi lima baris terurai. Lihat §10h.

Kalau salah satunya dicabut kelak, peringatan mendesak kehilangan tempat
terakhirnya yang selalu terlihat.

### 10h. Rail dirampingkan — lima kartu, dua di antaranya satu baris, 2026-08-09

Founder menilai hasil §10f langsung dari layar, dan empat koreksinya berturut-turut
mengubah bentuk rail seluruhnya:

| Kata founder | Yang berubah |
|---|---|
| *"panel kanan jadinya pada gepeng gini"* | tiap `KartuRail` diberi `minHeight: 88` |
| *"milestone dan notifikasi hilangkan aja deh"* | dua kartu dicabut |
| *"bikin 1 baris aja, gausah kasih detail isinya apa aja nya"* | Peringatan Kritis + Perlu Keputusan → `RailRingkas` |
| *"yg warning ini paling atas ajaa taronya semua"* | dua kartu mendesak berdempet di puncak, kalender menyusul |

**Susunan rail sekarang** (dari atas): Peringatan Kritis · Perlu Keputusan ·
Kalender · Asisten · Pengingat. Dua kartu terakhir tetap **selalu** ada di
halaman mana pun rail hidup (§10f) — itu tak berubah.

**"Progres proyek aktif" ikut dicabut**, dan alasannya bukan permintaan
founder melainkan pengukuran: kartu itu merender
`active_progress.slice(0, 5)` — **lima proyek yang sama persis** dengan widget
progres di kolom tengah. Dua salinan daftar identik, terlihat bersamaan tanpa
scroll.

#### Cacat yang ditemukan saat mengukur: kalender gepeng jadi 2px

Founder: *"pastikan kalender itu jangan kepotong"*. Diukur di tiga tinggi
layar, dan kenyataannya lebih buruk daripada terpotong:

| Viewport | Tinggi kartu Kalender |
|---|---|
| 1600×1000 | 146px |
| 1600×800 | **2px** |
| 1600×720 | **2px** |

Rail adalah kolom flex, dan `flex-shrink` bernilai **1** secara bawaan. Begitu
isi rail melebihi tinggi layar, browser **mengecilkan** anak yang boleh
mengecil alih-alih menggulirkannya. Empat kartu rail lain kebetulan sudah
ber-`flexShrink: 0`; kalender satu-satunya yang tidak, sehingga seluruh
kelebihan tinggi ditimpakan kepadanya sendirian — kisi tanggalnya lenyap
seluruhnya.

**Cacat ini tak terlihat di layar besar.** Pada 1600×1000 rail masih muat, tak
ada yang perlu dikecilkan, dan kalender tampil normal. Ia hanya muncul di
laptop — tempat sebagian besar orang justru bekerja. Itu sebabnya ia lolos
dari setiap tangkapan layar sebelumnya.

Dijaga `apps/web/scripts/uji-rail-tak-gepeng.mjs` (CI). Penjaganya sendiri
butuh **dua putaran uji mutasi** sebelum benar-benar bisa merah:

1. Putaran pertama: properti dicabut, penjaga tetap hijau — komentar di berkas
   yang sama memuat frasa `flexShrink: 0` tiga kali. Pencarian teks menemukan
   *penjelasannya*, bukan kodenya. (Pola identik pernah terjadi pada
   `hex-ratchet`; arah salahnya berlawanan, sebabnya sama.)
2. Putaran kedua: komentar sudah dibuang, penjaga **masih** hijau — berkas yang
   sama punya `flexShrink: 0` sah di tempat lain (div tombol geser bulan).
   Pemeriksaan tingkat-berkas tak bisa membedakan kotak kartu dari elemen di
   dalamnya.

Versi final membaca **hanya blok gaya kotak terluar**, dan barulah merah pada
mutasi. Pelajarannya sama dengan §10d: penjaga yang belum pernah merah bukan
penjaga.

#### Skor kesehatan pindah ke dalam ring

Founder: *"angka 21/100 nya di dalam lingkaran aja kayanya"*. Ring progres
adalah gauge, dan gauge membaca nilainya di pusatnya. Versi sebelumnya menaruh
angka di samping, sehingga ring jadi hiasan tanpa label sementara kolom teks di
kanannya harus memuat dua hal dalam lebar yang cuma cukup untuk satu.

Ditulis sebagai `<text>` SVG, bukan `div` ber-`position:absolute` — satu
elemen, ikut menskala dengan `viewBox`, dan tak bisa bergeser dari pusat ring
saat ukuran kartu berubah. `aria-label` dipindah ke `<svg role="img">` supaya
pembaca layar mendengar "Skor kesehatan 21 dari 100", bukan dua angka lepas.

#### Topbar dan kepala sidebar disamakan 56px

Founder: *"ketinggian topbar dan area logo di sidebar ini berasa kurang
menyatu"*. Diukur: topbar 56px, kepala sidebar **65px**. Selisih 9px membuat
garis bawah keduanya tak sejajar — cukup untuk terasa salah, terlalu kecil
untuk langsung ketahuan sebabnya.

Dipatok `height: 56`, bukan diatur lewat padding: padding menghasilkan tinggi
**turunan** dari isinya, jadi ia akan menyimpang lagi begitu ukuran logo atau
font berubah.

#### Pintasan: kisi tetap, jumlah kelipatan empat

Founder: *"bagian ini kurang simetris"*. Sebabnya `flex-wrap` dengan tujuh pil
selebar labelnya masing-masing: tanpa kolom, ujung kanan tiap baris berhenti di
tempat acak, dan tiga pil di baris kedua menyisakan sel kosong.

Diganti kisi `repeat(4, minmax(0, 1fr))` dan ditambah satu tujuan nyata
(Klien) supaya jumlahnya delapan. **Kalau daftar ini diubah lagi, jaga
jumlahnya kelipatan empat** — atau kisinya ragged lagi.

**Tingkat ditulis, bukan cuma diwarnai** ("Tinggi"/"Sedang") — WCAG 1.4.1,
aturan yang sama dengan halaman aset dan lapangan. Beranda dibuka di HP di
bawah sinar matahari, tempat merah dan kuning praktis sama.

### 10f. Rail kanan permanen — cakupan & isi, 2026-08-08

Founder: rail harus **menempel di kanan, setinggi layar, dan tidak ikut
ter-scroll**; isinya kalender · My Task · notifikasi · AI · smart reminder,
dengan **AI dan reminder SELALU ada** dan tiga sisanya diganti sesuai halaman.

**Cakupan: 9 halaman dashboard, bukan 105.** Diputuskan sesudah menimbang —
rail 300px permanen menyisakan ~840px untuk tabel 12 kolom di laptop 1366px,
dan itu halaman kerja harian. Konsisten dengan `DESIGN-BRIEF` §C.0a.

**Rail pindah dari halaman ke shell.** `sticky` hanya menempel di dalam wadah
scroll-nya sendiri, jadi selama rail ada di dalam `<main>` ia mustahil diam.
Kini ia saudara `<main>` di `layout.tsx`; halaman mengisinya lewat
`lib/rail-context.tsx`. Kuncinya `height: 100dvh` + `overflow: hidden` pada
shell — dengan `minHeight: 100vh`, yang scroll adalah seluruh dokumen.

**Aturan "selalu ada" dipaksa oleh BENTUK, bukan ingatan.** `RailIsi` hanya
menerima bagian atas; AI + Pengingat ditambahkan komponen itu sendiri.

| Halaman | Isi atas rail |
|---|---|
| beranda | kalender · perlu keputusan · notifikasi |
| proyek | tenggat terdekat · belum bergerak |
| lapangan | paling tertinggal |
| kontrak | jaminan segera habis |
| tender | penawaran menunggu keputusan |
| klien | klien terbaru |
| kas | saldo per jenis |
| procurement | PO paling lama lewat janji kirim |
| aset | alat tak siap pakai |

**Pengingat**: angkanya DIHITUNG dari tenggat nyata (lewat + ≤14 hari),
bukan "7" seperti referensi.

**Quick Links**: ubin bertumpuk → pil mendatar, dan posisinya pindah dari
atas-KPI ke **bawah baris tiga widget** (urutan referensi).

**Materi referensi yang TIDAK diduplikasi**, karena sudah punya rumah:
*Critical Issue Alerts* = spanduk peringatan di atas · *Upcoming Deadlines* =
kartu milestone di rail. Yang memang belum ada dan kini dibangun:
*Recent Project Updates* → widget **Kabar Lapangan**.

### 10e. Sidebar & topbar — diputuskan dari gambar, 2026-08-08

Founder bertanya *"topbar dan sidebar sudah kamu samakan?"* dan jawabannya
saat itu **belum**: yang ditambahkan baru tombol "Buat" di topbar.

Perbedaan terhadap referensi diukur, lalu **dibangun sebagai perbandingan
berdampingan** (`apps/web/scripts/banding-shell.mjs` — 2 kandidat × 2 mode,
digabung jadi satu gambar oleh `gabung-banding.mjs`). Pola yang sama dengan
`banding-aksen.mjs`, dan alasannya sama: §10 mengikat, keputusan visual
diambil dari gambar.

**Yang disetujui:**

| Bagian | Sebelum | Sesudah |
|---|---|---|
| Item nav aktif | `--navy-light` + teks navy + garis kiri 3px | **pill `--navy` pekat + teks `--on-navy`**, tanpa garis |
| Tinggi item | 34/38px, margin 1px | 36/40px, margin 2px — lebih lega |
| Pencarian | menciut jadi ikon di gugus KANAN | **lebar di KIRI** dekat logo, maks 420px |
| Placeholder cari | "Cari..." | "Cari proyek, invoice, mandor, dokumen..." |

**Yang TIDAK diikuti, dan alasannya:**

- **Sidebar gelap permanen** — sudah ditolak (§5d). Tak dihidupkan lagi.
- **Ikon amplop & tanda tanya** di topbar — kita belum punya kotak masuk
  maupun pusat bantuan. Ikon yang tak melakukan apa pun adalah janji yang
  tak ditepati; itu justru cacat yang sedang dihindari (Aturan Emas §9).
- **Breadcrumb dibuang** — referensi tak punya, tapi ia hanya belasan
  halaman. Kita 105; "saya di mana" adalah pertanyaan nyata di sini.
- **Pill pada tombol GRUP** — sengaja tidak. Grup aktif berarti "salah satu
  anak saya terbuka", bukan "inilah halaman ini". Dua blok navy menyala
  sekaligus justru menghilangkan penanda halaman aktif.

**Kontras diukur, keduanya lulus AA:** 12,61:1 (terang) · 6,94:1 (gelap).
Token `--on-navy`, bukan `--on-merek` — hanya yang pertama ikut berbalik jadi
teks gelap di mode gelap tempat `--navy` menjadi biru terang.

### 10a. Nomor 1 — riwayat keputusannya, karena sempat tercatat tiga kali berbeda

Satu pertanyaan, tiga catatan berlawanan dalam 26 jam. Ditulis di sini supaya
tak ada sesi yang menghidupkannya kembali:

| Waktu | Catatan | Berlaku? |
|---|---|---|
| `4b199c2` 2026-08-07 00:29 | indigo **DISETUJUI** | ❌ dicabut — persetujuan dari membaca teks, bukan melihat |
| `df6557d` 2026-08-07 00:38 | indigo **DITAHAN** — *"tunjukkan dulu"* | ❌ sudah terlampaui — perbandingannya lalu dibangun |
| `a38cb0d` 2026-08-07 02:43 | indigo **DITOLAK sesudah dilihat** | ✅ **inilah yang berlaku** |

Founder benar menolak memutuskan warna dari teks: hex di tabel tak memberi tahu
apa pun tentang rasanya di layar. Perbandingannya dibangun, dilihat, diputuskan.
**Selesai — jangan tanyakan ulang, jangan terapkan diam-diam.**

### 10d. Kenapa indigo gagal — dan pelajaran yang berlaku untuk usul warna berikutnya

> Ini bagian yang sempat dirujuk §10 tetapi tak pernah ditulis, sehingga dokumen
> menunjuk ke ruang kosong selama sehari. Isinya dipulihkan dari `a38cb0d`.

Perbandingan dibangun dengan `apps/web/scripts/banding-aksen.mjs` — empat
tangkapan: navy × indigo, terang × gelap. Sesudah dilihat, indigo ditolak.

**Sebabnya terlihat begitu dirender:** indigo hanya menyentuh **empat tempat**
(garis grafik, sparkline, irisan donat, progress bar). Kartu KPI, sidebar,
lencana, dan tautan semuanya tetap navy karena memakai token `--navy`, **bukan**
`--aksen`. Hasilnya bukan "lebih hidup" melainkan **tidak menyatu** — garis ungu
di dalam kartu bertepi navy terbaca seperti komponen aplikasi lain.

Mode gelap lebih telak: di sana `--aksen` navy sudah biru terang, jadi indigo di
sebelahnya menjadi **dua biru yang berselisih sedikit** — persis gejala
"biru-di-atas-biru" yang §3a keluhkan, hanya dengan satu biru tambahan.

> **Pelajarannya bukan "indigo warna jelek".** Usulnya lahir dari membaca
> **daftar token**, bukan dari mengukur berapa banyak layar yang benar-benar
> dikendalikan token itu. Usul warna berikutnya — dari sesi mana pun, dari skill
> mana pun — harus lebih dulu menjawab: **token ini mengendalikan berapa persen
> permukaan yang terlihat?** Kalau jawabannya "empat tempat", warnanya tak akan
> menyelamatkan apa pun.

### 10b. Dua koreksi — dokumen ini sempat salah

**Dark mode bukan pekerjaan baru; ia sudah ada dan jalan.** Diukur 2026-08-07:
blok `.dark` di `globals.css:471`, `theme-provider.tsx` via `next-themes`,
terpasang di `layout.tsx:58`, tombolnya di `topbar.tsx:199`, dan
`kontras-ratchet.mjs` sudah menguji 38 pasangan **di kedua mode**.

Pengukuran `grep "dark:" apps/web/app` → 0 berkas yang sempat saya jadikan
bukti "dark mode belum ada" memakai **alat ukur yang salah**: ia mencari
utility Tailwind, sementara repo ini memakai CSS variable.

**Mengikat:** tiap token baru WAJIB punya pasangan `.dark`, dan
`kontras-ratchet` wajib tetap hijau.

**`2026-08-06-sumbu-ui-roadmap.md` bukan pedoman visual.** Judulnya menyebut
"Sumbu UI/UX", tapi isinya penjaga CI untuk status dokumen vs kode, dan
ketiganya sudah selesai (`869bc60`, `defb8c5`, `4b7df3b`). Perannya di sini:
**penjaga yang wajib tetap hijau**.

### 10c. Batas wilayah kerja — token kerapatan dipegang sesi lain

`--pad-kartu`, `--gap-grid`, `--teks-*` di `globals.css` sedang digarap sesi
lain. Founder 2026-08-07 memutuskan: **lewati kerapatan, garap sisanya.**

UI-0-1 karena itu **tidak dikerjakan dari sini**. Pekerjaan yang jalan hanya
yang tak menyentuh `globals.css`: komponen bersama, dashboard per menu,
pemecahan mandor & kas, penjaga CI.

---

## 11. Situs publik (`apps/web-publik`) — arah TERPISAH

> Ditetapkan 2026-08-08 sesudah founder melihat situsnya:
> *"terlalu generik, kurang interaktif"*.

**Dokumen ini sampai §10 hanya berlaku untuk dashboard.** Situs publik punya
tugas yang berbeda, dan menyalin arah dashboard ke sana akan salah:

| | Dashboard | Situs publik |
|---|---|---|
| Dipelototi | delapan jam | tiga detik |
| Tugasnya | kepadatan informasi | membuktikan "kami membangun ini" |
| Pembacanya | staf yang hafal | pembeli yang belum percaya |
| Yang dijual | kecepatan kerja | bukti fisik |

### 11a. Arah: industrial-documentary

Foto lapangan adalah **bahan desain**, bukan hiasan. Diukur 2026-08-08: 28 foto
pabrik, konstruksi baja, dan pematangan lahan sudah ada di basis dan termuat
sempurna — tapi tak satu pun muncul sebelum orang menggulir. Tiga detik pertama
dihabiskan untuk kalimat yang bisa ditulis kontraktor mana pun.

Aturan yang mengikat:

1. **Bukti sebelum klaim.** Foto asli lapangan muncul di layar pertama.
   Render, ilustrasi, dan stock photo dilarang — situs ini menjual pekerjaan
   nyata, dan gambar yang jelas bukan miliknya merusak persis itu.
2. **Interaksi punya alasan.** Saring dan perbesar ada karena orang datang
   bertanya *"pernahkah mereka bikin gudang sebesar punya saya"*. Animasi yang
   tak menjawab pertanyaan siapa pun tidak dibangun.
3. **Nol em-dash.** Dijaga `scripts/audit-em-dash.mjs` (berkas + 7 tabel DB).
   Situs ini menjual kredibilitas; kalimat yang berbunyi seperti keluaran mesin
   merusak yang sedang dijualnya.

### 11b. Ritme terang-gelap — satu tema, bukan dua

```
hero        navy    ← merek memimpin
bukti       navy
proses      navy    ← WebGL massing 3D
portofolio  TERANG  ← foto jadi subjek
legalitas   TERANG  ← daftar teknis, paling terbaca di terang
kontak      navy
```

Dikendalikan kolom `situs_seksi.nada` (migrasi 236), bukan hardcode: admin
menukarnya tanpa deploy. **`nada` terpisah dari `varian`** — yang satu WARNA,
yang lain BENTUK; keduanya sumbu ortogonal.

Caranya: `.seksi-terang` **menukar nilai token**, bukan menimpa warna per
elemen. Warna tersebar di 21 tempat lintas 6 berkas; mengganti satu per satu
berarti 21 kesempatan melewatkan satu, dan yang terlewat jadi teks putih di
latar terang tanpa berbunyi.

### 11c. Kuning tetap langka — dijaga fisika warna, bukan disiplin

`--aksen: #ffd600` hanya **1,30:1** di atas kanvas terang. Ia mustahil dipakai
di seksi terang tanpa memerahkan CI lebih dulu. Penjaga `kontras-situs.mjs`
justru **MENUNTUT ia tetap gagal** di sana — kalau suatu saat lolos, artinya
seseorang mencerahkan kuningnya dan aturan satu-aksen bocor.

### 11d. Cara mengukur — jangan percaya angka di bagian ini

```bash
node apps/web-publik/scripts/kontras-situs.mjs   # 11 pasangan + pagar aksen
node apps/web-publik/scripts/audit-em-dash.mjs   # berkas + seluruh tabel situs_*
cd apps/web-publik && npx vitest run             # logika saring & navigasi
```

**Angka kontras di komentar `globals.css` pernah salah tiga kali** (16,84 /
5,92 / 9,71 — semuanya taksiran, semuanya meleset). Itu sebabnya penjaga
menghitungnya lagi di CI: taksiran yang kebetulan lolos hari ini tak menjamin
apa pun besok.

### 11e. Satu hal yang TIDAK bisa dibangun jujur

**Sebelum-sesudah** diminta founder, dan saya tak membangunnya. Diukur: foto
pematangan lahan bertanggal 2022, foto pabrik 2021 dan 2023 — **bukan proyek
yang sama**, dan sebagian pematangan justru terjadi *sesudah* foto pabriknya.

Menyandingkannya sebagai "lahan ini → jadi pabrik ini" adalah klaim palsu di
situs perusahaan, dan itu jenis kebohongan yang paling mudah ketahuan oleh
calon klien yang bertanya. Yang disiapkan hanya mekanismenya; begitu ada
pasangan foto proyek yang sama, tinggal ditandai tanpa menulis kode lagi.
