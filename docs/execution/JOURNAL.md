# JOURNAL — Catatan Sesi

Satu blok per sesi. **Ditambahkan, tidak pernah ditulis ulang.**
Entri terbaru di ATAS.

---

## 2026-08-07 (lanjutan 9) — TUNDA kelompok E: kepatuhan & K3, dan constraint yang menolak seed saya sendiri

Tiga item TUNDA: evaluasi kinerja subkontraktor, kepatuhan izin/asuransi/pajak,
izin kerja (work permit). **TUNDA: 8 → 5.**

### Yang terbukti, dengan angka

```
migrasi 218      3 tabel · 9 policy · 5 permission · RLS dipaksa · InitPlan
invarian         52 terjaga, 0 bocor (uji-invarian-kepatuhan.mjs)
mutasi invarian  10/10 tertangkap, termasuk mutasi PENCABUTAN permission
pustaka          29 test · 17/17 mutasi tertangkap
API              176 berkas · 1916 test HIJAU, 2 skip, NOL gagal
web              lint 0 error, 334 warning · build /kepatuhan terdaftar
penjaga          9 audit arsitektural + 13 ratchet UI + 3 rute: LULUS
a11y             axe-core WCAG 2.1 AA: 0 pelanggaran, terang DAN gelap
seed             9 dokumen · 4 evaluasi · 4 izin kerja — dijalankan 2×,
                 angka tak bergerak
```

### Cacat inti yang ditutup: jawaban benar yang saling bertentangan

Tiga sudut — kinerja, dokumen, izin kerja — dijawab **bersamaan**, bukan di
layar terpisah. Data nyata di dev membuktikan kenapa itu penting:

```
PT Baja Perkasa   skor 89,1 (TERTINGGI)  →  TIDAK boleh bekerja
                                            (asuransi CAR mati 98 hari lalu,
                                             kolom `terverifikasi` masih hijau)
CV Karya Mandiri  skor 73,7              →  TIDAK boleh bekerja
                                            (1 kecelakaan kerja)
PT Sinar          skor 44,4              →  TIDAK boleh bekerja
                                            (daftar hitam, 6 pelanggaran K3)
```

Layar yang hanya membaca skor akan merekomendasikan PT Baja Perkasa. Itulah
cacat yang modul ini ada untuk menutupnya.

### Constraint menolak seed saya sendiri — dan itu kabar baik

`izin_pemutus_bukan_pengaju` menolak seed pada percobaan pertama. Penyebabnya
bukan constraint yang terlalu ketat, melainkan seed saya:

```sql
SELECT id INTO v_u1 FROM users ORDER BY created_at LIMIT 1;
SELECT id INTO v_u2 FROM users ORDER BY created_at OFFSET 1 LIMIT 1;
```

Seluruh pengguna seed punya `created_at` **identik**, sehingga urutannya tak
stabil dan kedua kueri mengembalikan **baris yang sama**. Diperbaiki jadi
`ORDER BY created_at, id`. Constraint-nya bekerja persis seperti maunya:
izin kerja yang disetujui sendiri oleh pengajunya bukan pengendalian apa pun.

Pemisahan tugas ini dijaga **dua lapis** — constraint DB *dan* permission
terpisah `k3:permit:decide` — karena inilah yang pertama ditanya saat ada
kecelakaan.

### Dua cacat yang hanya ketahuan dengan MELIHAT layarnya

**1. `ASURANSI_CAR kedaluwarsa`** — kunci mentah ber-garis-bawah, padahal
tabel di bawahnya menulis "Asuransi CAR" dengan rapi. Pemetaan label
dipindah ke **pustaka**, bukan layar: alasan larangan dirakit di sana dan
ikut terkirim ke notifikasi & ekspor. Kalau pemetaannya cuma di satu layar,
konsumen lain menampilkan nama mentah.

**2. Kartu kesiapan tak terurut** — semuanya "TIDAK boleh bekerja", tapi
PT Baja (89,1) di tengah. Diperbaiki: skor tertinggi lebih awal, karena
pihak berskor 89 yang terhalang **satu dokumen kedaluwarsa** adalah yang
paling mudah dipulihkan — perbarui polisnya, ia bisa bekerja besok. Yang
berskor 44 dan masuk daftar hitam tak pulih dengan mengurus berkas.

Perbaikan kedua sempat **tidak berpengaruh** meski pustakanya sudah benar:
rute punya pengurutannya sendiri yang menimpanya (tak-boleh-bekerja dulu,
lalu ABJAD). Ketahuan lagi-lagi dari memotret. Pengurutan ganda dibuang —
dua tempat mengurutkan hal yang sama berarti yang belakangan menang
diam-diam.

### Penjaga yang memeriksa PERMISSION, bukan cuma tabel

`uji-invarian-kepatuhan.mjs` ikut memastikan kelima permission baru
benar-benar terpasang ke setidaknya satu peran. Permission yang tak dimiliki
siapa pun membuat halamannya **lahir terkunci**, dan gejalanya layar kosong —
bukan "akses ditolak". Dibuktikan bisa merah dengan mencabut
`k3:permit:decide` dari semua peran, lalu memulihkannya.

---

## 2026-08-07 (lanjutan 8) — TUNDA kelompok D: kendali dokumen, dan CACAT P1 penomoran yang saya sempat sebut "tak bisa diperbaiki"

Enam item TUNDA sekaligus: transmittal, register gambar, notulen rapat,
matriks distribusi, tanda tangan elektronik, distribusi laporan terjadwal.
**TUNDA: 14 → 8.**

### Yang terbukti, dengan angka

```
migrasi 215      8 tabel · 24 policy · RLS aktif+dipaksa · InitPlan sejak awal
migrasi 216      13 policy diseragamkan jadi `tenant_isolation`
migrasi 217      CACAT P1 — LPAD memangkas nomor MR/PO/GR
invarian         76 terjaga, 0 bocor (uji-invarian-dokumen.mjs)
mutasi invarian  9/9 tertangkap, termasuk mutasi RLS-telanjang
pustaka          23 test · 11/11 mutasi tertangkap (2 mutan terbukti SETARA)
penjaga baru     audit-lpad-memangkas.mjs — mutation-tested MERAH lalu HIJAU
API              175 berkas · 1887 test HIJAU, 2 skip, NOL gagal
web              389 test hijau · lint 0 error, 334 warning
penjaga          16 audit arsitektural + 13 ratchet UI + 3 rute: LULUS
build            /dokumen/kendali terdaftar
a11y             axe-core WCAG 2.1 AA: 0 pelanggaran, terang DAN gelap
seed             5 gambar · 3 transmittal · 5 tindakan · 5 distribusi · 3 jadwal
                 — dijalankan 2×, angka tak bergerak
```

### SAYA SALAH — dan koreksinya penting

Di entri sebelumnya (lanjutan 7) saya menulis bahwa
`gr-create-kontrak-body.test.ts` gagal karena cacat "PRA-ADA dan FLAKY", lalu
menyimpulkan **"penyebab sebenarnya belum ketemu"** dan meninggalkannya sebagai
temuan terbuka. Itu benar soal *pra-ada*, tapi salah soal *tak bisa dicari*.

Penyebabnya ketemu hari ini, dan ini **cacat P1 di produksi**:

```
LPAD('646',  3, '0') → '646'    ✓
LPAD('1001', 3, '0') → '100'    ✗ Postgres MEMANGKAS, bukan cuma menambal
```

`generate_mr_number`, `generate_po_number`, dan `generate_gr_number`
membentuk nomor dengan `LPAD(counter::TEXT, 3, '0')`. Begitu counter sebuah
tenant melewati 999, nomor dokumen mulai **BERULANG** — 1001, 1002, 1003
semuanya jadi `…-100` — dan unique index menolak setiap INSERT berikutnya.

**Tenant mana pun yang mencatat lebih dari seribu dokumen setahun berhenti
bisa menerima barang, tanpa satu baris kode pun berubah.** Basis dev sudah di
counter 1021; itu sebabnya kegagalannya terlihat "flaky" — ia hanya muncul
saat counter kebetulan melewati ambang di tengah run.

Gejalanya menyesatkan sempurna: yang muncul `duplicate key value violates
unique constraint`, bukan "nomor terpangkas". Yang membacanya akan mencari
data ganda dan tak menemukan apa pun — nomornya memang belum pernah dipakai,
ia baru saja DIBUAT bertabrakan.

Diperbaiki migrasi 217 (`CASE WHEN v_urut < 1000 THEN LPAD(...) ELSE ... END`
— nomor lama `001`–`999` tak berubah bentuk), plus penjaga
`audit-lpad-memangkas.mjs` yang menguji PERILAKUNYA (urut 7 → `007`,
1001 → `1001`), bukan bentuk kodenya. Dibuktikan bisa merah dengan
mengembalikan satu fungsi ke LPAD telanjang.

**Pelajarannya bukan "saya salah menyimpulkan", melainkan: "belum ketemu"
tak sama dengan "tak bisa ketemu", dan menandai sesuatu sebagai flaky adalah
cara berhenti mencari.** Yang menemukan: menjejaki nomor GR yang benar-benar
ada di basis, bukan menerima label flaky.

### Cacat kedua: nama policy yang menyimpang

`t5a-policy-tenant.test.ts` dan `t7-exit-criteria-l2.test.ts` merah: 13 tabel
dari migrasi 212 & 215 menamai policy RESTRICTIVE-nya `<tabel>_tenant`,
sementara **142 tabel lain** memakai `tenant_isolation`. Isolasinya sendiri
tidak bocor — tapi penjaga lintas-repo hanya bisa diandalkan kalau ada SATU
nama yang dicari; nama bervariasi memaksa penjaganya menebak pola, dan
penjaga yang menebak akan melewatkan tabel yang polanya sedikit berbeda.
Diperbaiki migrasi 216 **dan** di berkas 212/215 supaya lingkungan baru tak
mengulanginya.

Kelompok B (211) ternyata sudah benar; yang menyimpang hanya C dan D.

### Yang layar temukan, lagi

Tabel butir tindakan mengurutkan butir **selesai di atas** butir yang sudah
lewat tenggat — kebalikan dari yang dibutuhkan pembacanya. Ketahuan dari
memotret halamannya. Pengurutan (lewat tenggat → terbuka → selesai)
dipindahkan ke API, bukan ke layar, supaya konsumen lain (ekspor, notifikasi)
mendapat urutan yang sama. Register gambar juga: yang USANG naik ke atas.

### Dua mutan terbukti SETARA, bukan celah test

Mutasi "revisi tertinggi lintas seluruh proyek" awalnya lolos — ternyata
karena data test-nya terurut naik, sehingga "nilai terakhir" dan "nilai
maksimum" kebetulan sama. Test diperkuat dengan urutan MENURUN (register
nyata jarang urut), dan mutan itu tertangkap.

Mutasi "NUMERIC string tak dikonversi" juga lolos, dan itu **memang setara**:
`>=` di JavaScript selalu memaksa string jadi angka, jadi menghapus
konversinya menghasilkan perilaku identik untuk semua masukan. Dikeluarkan
dari daftar mutasi dengan alasan tertulis, bukan dibiarkan terlihat seperti
celah. Komentar test yang salah (mengklaim `'10' < 3`) ikut dikoreksi.

---

## 2026-08-07 (lanjutan 7) — TUNDA kelompok C: CPM & kalender kerja, dan lima cacat yang test/build/layar temukan

Empat item TUNDA sekaligus: jalur kritis (CPM), histogram & leveling sumber
daya, method statement, kalender kerja. **TUNDA: 18 → 14.**

### Yang terbukti, dengan angka

```
migrasi 212      5 tabel · 15 policy · RLS aktif+dipaksa · 0 literal peran
migrasi 213      menutup cacat UNIQUE yang tak mengikat saat project_id NULL
migrasi 214      15 policy dibungkus (SELECT ...) -> InitPlan
invarian         44 terjaga, 0 bocor (uji-invarian-jadwal.mjs)
mutasi invarian  6/6 tertangkap — DROP constraint -> MERAH, pulihkan -> HIJAU
pustaka cpm.ts   33 test · 14/14 mutasi tertangkap
API              174 berkas · 1863 test hijau, 2 skip, 1 gagal (pra-ada, §bawah)
web              29 berkas · 389 test hijau
penjaga          14 audit arsitektural + 12 ratchet UI + 3 rute: LULUS
lint             web 0 error, 334 warning (di bawah ambang)
build            /jadwal terdaftar, prerender lolos
a11y             axe-core WCAG 2.1 AA: 0 pelanggaran, terang DAN gelap
seed             4 dependensi · 18 libur · 1 pola · 9 sumber daya · 2 MS
                 — dijalankan 2x, angka tak bergerak
```

### Lima cacat, masing-masing ditemukan alat yang berbeda

**1. `UNIQUE` yang tak mengikat — ditemukan skrip invarian, percobaan pertama.**
Migrasi 212 menulis `UNIQUE (company_id, project_id, tanggal)` dan saya kira
itu mencegah libur ganda. Tidak: di Postgres NULL tak pernah sama dengan NULL,
sehingga SELURUH libur nasional (yang `project_id`-nya NULL — dan itu
mayoritasnya) lolos berkali-kali tanpa satu pun galat. Diperbaiki migrasi 213
dengan `NULLS NOT DISTINCT`. Constraint yang "terlihat benar" dan constraint
yang MENOLAK adalah dua hal berbeda — itu justru alasan skrip invarian ada.

**2. Helper RLS dipanggil per-BARIS — ditemukan test yang sudah ada.**
`rls-initplan.test.ts` dan `t7-exit-criteria-l2.test.ts` merah: 15 policy
migrasi 212 memanggil `has_permission()`/`auth_company_id()` telanjang, jadi
dievaluasi sekali per baris. Pada tabel 50.000 baris itu 50.000 pemanggilan
untuk pertanyaan yang jawabannya sama sepanjang query. Migrasi 211 (alat)
sudah membungkusnya; 212 luput. Diperbaiki migrasi 214. Ini bukan sekadar
optimasi: RLS yang lambat berakhir **dimatikan**.

**3. Deteksi lingkaran menelusuri arah TERBALIK — ditemukan test baru.**
`menutupLingkaran(RANTAI, 'A', 'C')` untuk A→B→C menjawab `false` — lingkaran
paling jelas yang ada. Saya menelusuri penerus, seharusnya pendahulu. Kalau
lolos, setiap lingkaran panjang masuk ke basis dan seluruh jadwal berhenti
bisa dihitung, tanpa pesan galat.

**4. Float −1 untuk proyek telat lima minggu — ditemukan saat menjalankan
atas DATA NYATA.** `hitungHariKerja(ms, lm) - 1` mengembalikan 0 untuk rentang
terbalik, sehingga SETIAP proyek yang melewati tenggat melaporkan float −1.
Terbaca "telat sehari", dan tak ada yang panik. Sekaligus: "kritis" yang
berarti `float === 0` membuat proyek yang PALING genting menampilkan jalur
kritis KOSONG — layarnya paling tenang saat keadaannya paling buruk. Kini
`float <= 0`.

**5. `useSearchParams` tanpa Suspense — ditemukan `pnpm build`.** Typecheck
lolos, dev server jalan, build gagal saat prerender. Dibungkus `<Suspense>`.

### Saya salah — tiga kali, dan dua di antaranya soal menebak angka

**Menebak tanggal, dua kali berturut-turut.** Ekspektasi test kalender saya
tulis 22 Agustus, lalu 26, lalu 24 — dua yang pertama salah. Kodenya benar
sejak awal; saya yang salah berhitung "hari kerja ke-9". Baru berhenti
setelah MENGUKUR deretnya (`n=0..10`) dan memakai angka hasil ukur.

**Menebak nilai `status` proyek.** Saya membuat default halaman memilih
proyek `'in_progress'` supaya layar pertama tidak kosong. Diukur: nilainya
`'active'`, dan 11 dari 15 proyek memakainya — jadi penyaringan itu tak
membedakan apa pun. Yang menentukan informatif-tidaknya ternyata ADA-TIDAKNYA
dependensi, dan itu baru diketahui SESUDAH data diambil. Default dikembalikan;
yang diperbaiki akhirnya kejujuran layarnya: banner yang menyatakan "0
pekerjaan kritis" **bukan kabar baik** melainkan tanda dependensinya belum
dicatat.

**Skrip invarian saya sendiri rapuh.** Ia mengambil dua milestone tertua
begitu saja, lalu gagal 23505 begitu seed mengisi relasi di antara keduanya —
yang gagal INSERT penyiapannya, bukan invariannya, dan pesan galatnya menunjuk
ke tempat yang salah. Kini memilih milestone yang belum berelasi.

### Satu test gagal, dan itu BUKAN dari pekerjaan ini

`gr-create-kontrak-body.test.ts` › "harga yang dikirim klien DIABAIKAN" gagal
500 `duplicate key ... uq_gr_number_per_project`. Ditelusuri:

- Saya tidak menyentuh satu pun berkas procurement (`git diff --name-only`).
- Gagal juga pada pohon BERSIH (`git stash`), tanpa perubahan kelompok C.
- **Flaky**: 3 kali dijalankan berturut — lolos, gagal, gagal.
- Counter `document_number_series` monoton naik dan tak bentrok dengan nomor
  mana pun yang ada; penyebab sebenarnya belum ketemu.

Dicatat apa adanya sebagai temuan terbuka, bukan diklaim hijau dan bukan
diklaim akibat kelompok ini. Perbaikannya butuh penelusuran modul procurement
tersendiri.

> **KOREKSI (lanjutan 8, hari yang sama).** Kalimat "penyebab sebenarnya
> belum ketemu" di atas benar saat ditulis, tapi kesimpulan praktisnya salah:
> saya memperlakukan label *flaky* sebagai titik berhenti. Penyebabnya ketemu
> beberapa jam kemudian dan ternyata **cacat P1** — `LPAD('1001',3,'0')`
> mengembalikan `'100'` karena Postgres MEMANGKAS, sehingga nomor MR/PO/GR
> berulang begitu counter melewati 999. Rinciannya di entri lanjutan 8.
>
> Yang menemukan: menjejaki nomor GR yang benar-benar ada di basis. Yang
> menghalangi: menerima "flaky" sebagai penjelasan.

---

## 2026-08-07 (lanjutan 6) — TUNDA kelompok B: operasional alat, dan tiga cacat yang hanya ketahuan dengan MELIHAT

Founder: *"kerjakan aja semuanya sekalian sekaligus, termasuk yg ditunda. jika
butuh data silahkan masukkan ke db karena ini belum berjalan secara operasional."*
Kelompok A (vendor) selesai lebih dulu; ini kelompok B — 4 item TUNDA sekaligus:
log pemakaian alat, maintenance terjadwal, biaya operasional per alat,
integrasi penyusutan → GL.

### Yang terbukti, dengan angka

```
migrasi 211      5 tabel · 15 policy · RLS aktif+dipaksa di kelimanya
invarian         42 terjaga, 0 bocor (uji-invarian-alat.mjs)
mutasi invarian  4/4 tertangkap — DROP constraint -> MERAH, pulihkan -> HIJAU
pustaka          20 test · 8/8 mutasi tertangkap
API              173 berkas · 1831 test hijau, 2 skip
web              29 berkas · 389 test hijau
penjaga          14 audit arsitektural + 12 ratchet UI: semua LULUS
lint             web 0 error, 334 warning (di bawah ambang)
build            96 halaman · /aset/operasional terdaftar
a11y             axe-core WCAG 2.1 AA: 0 pelanggaran, mode terang DAN gelap
seed             4 alat · 30 pemakaian · 5 jadwal · 11 riwayat · 24 biaya
                 · 12 penyusutan — dijalankan 3x, angka tak bergerak
```

### Tiga cacat yang tak satu pun penjaga bisa temukan

Ketiganya baru terlihat sesudah **memotret halamannya dan melihat gambarnya**.
Semua test hijau, semua ratchet di lantai, axe-core nol pelanggaran.

**1. Rp 0 untuk alat yang paling mahal perawatannya.** Dump truck dengan empat
kerusakan mendadak senilai Rp 19,85 juta tampil "Rp 0" — biaya servis tinggal
di `riwayat_perawatan`, sedangkan `ringkasBiayaAlat` hanya membaca
`biaya_operasional_alat`. Alat yang paling sering rusak jadi terlihat PALING
MURAH; peringkatnya terbalik. Total halaman Rp 33,2 juta, seharusnya Rp 66,2.
Diperbaiki di pustaka + 3 test + 1 mutasi.

**2. Kolom kosong justru di baris terpenting.** Excavator EXC-001 — contoh
utama "jam mengalahkan kalender" di seluruh halaman — menampilkan "belum ada
servis" karena seed saya lalai memberinya riwayat.

**3. Seed saya mengaku idempoten, dan tidak.** Header berkasnya menulis
"idempoten: aman dijalankan berulang", padahal `ON CONFLICT DO NOTHING` pada
`riwayat_perawatan`/`biaya_operasional_alat` tak mengikat apa pun: kedua tabel
sengaja TIDAK punya unique constraint (satu alat memang boleh diisi BBM dua
kali sehari). Menjalankannya dua kali menggandakan 24 baris jadi 48, dan biaya
per jam ikut berlipat — tanpa satu pun pesan galat. Diganti penjaga blok
`IF EXISTS ... RETURN`, dibuktikan dengan menjalankannya 2× berturut-turut.

### Saya salah — empat kali

**Menyalahkan test padahal mutasinya yang meleset.** Mutasi "NUMERIC string
digabung sebagai teks" dilaporkan LOLOS. Alih-alih langsung memperkuat test,
saya periksa dulu apakah mutasinya benar-benar mengubah perilaku — ternyata
tidak: `Math.round("01000000")` tetap `1000000` karena hanya ada SATU elemen.
Percobaan kedua (`jam` tak dikonversi) juga mutan setara: JavaScript memaksa
string jadi angka pada `/` dan `>`, jadi `'50'` dan `50` identik. Yang
benar-benar butuh konversi hanyalah `+`. Test diperkuat jadi dua baris, mutasi
diarahkan ke sana, tertangkap. *(Pelajaran ini persis kasus `useToastOtomatis`
di sesi sebelumnya — saat itu saya menulis ulang test tiga kali sebelum sadar
skrip mutasinya yang salah. Kali ini memeriksa lebih dulu.)*

**Menulis penjaga yang memeriksa error lewat loop.** `for (const r of [aset,
pemakaian, ...]) if (r.error)` terlihat ringkas dan LULUS logika saya, tapi
`audit-kegagalan-senyap.mjs` merahkannya (192 > ambang 186). Penjaganya benar:
query ketujuh yang ditambahkan nanti dan lupa dimasukkan ke array akan gagal
tanpa suara, lalu `?? []` mengubahnya jadi "nol baris" yang sah. Diganti enam
`if` yang menyebut namanya masing-masing.

**Membuat `db/seed/` padahal repo memakai `db/seeds/`.** Konvensi kedua yang
tak perlu; dipindahkan sebelum sempat menyebar.

**Mengira `@/components/dasar` tak ada.** Mencarinya sebagai direktori, padahal
itu berkas `dasar.tsx`. Juga menebak propnya `baris`, nyatanya `data` —
diperbaiki dengan membaca tanda tangannya, bukan menebak lagi.

### Penjaga baru: `uji-invarian-alat.mjs` (42 invarian)

Dibuktikan bisa MERAH lewat mutasi sengaja terhadap schema — DROP constraint,
jalankan, harap merah, pulihkan, harap hijau. Empat constraint diuji begitu:
meter mundur · jadwal tanpa interval · akumulasi < nilai · biaya nol.

Didaftarkan ke CI. **Dan CI diberi seed `assets`** — tanpa itu skrip ini
melewati dirinya sendiri ("butuh minimal 1 baris di assets — dilewati") lalu
exit 0. Penjaga yang selalu hijau karena tak pernah punya bahan uji adalah
hiasan, dan itu lebih buruk daripada tak ada penjaga: ia memberi rasa aman
yang salah.

### Yang TIDAK saya klaim selesai

`Integrasi penyusutan → GL` ditandai **🟡 sebagian**, bukan ✅. Tabel
`penyusutan_alat` hidup, `journal_entry_id` ada, constraint menolak jurnal
setengah jadi — tapi penjurnalan OTOMATIS ke GL masih terblokir **R-001**
(bentrok definisi `accounts`/`journal_entries` migrasi 047 vs 167). Menandainya
hijau akan jadi persis cacat yang CLAUDE.md §8a.4 peringatkan.

Sekalian mengoreksi daftar "TAHAN sampai ada pemicu" di taksonomi: tertulis
"18 item" lalu memuat 26 nama, dan 13 di antaranya sudah hidup berbulan-bulan
(tender subkon, transfer stok, material klien, rekonsiliasi material, eskalasi
harga, backup & restore, absensi...). Diukur ulang ke kode — tiap ✅ punya
route DAN halaman. Angka di depan daftar dibuang; yang mengikat tanda per-nama.

**TUNDA: 22 → 18.**

---

## 2026-08-07 (lanjutan 5) — compro publik terbit, dan empat kali saya salah mendiagnosis warna

Founder meminta landing page compro + halaman jual ERP, konten 100% dari
dashboard. Tahap 1 (compro) selesai. Spec `2026-08-06-landing-publik-design.md`,
plan `2026-08-07-landing-publik-tahap-1.md`.

**Di luar QUEUE, dan itu disengaja.** Keputusan founder, bukan kelalaian
perencanaan. Tidak menyentuh GL sehingga tak melanggar larangan R-001. Item
SITUS-1/2/3 ditambahkan ke `QUEUE.yaml` supaya antrean merefleksikan kenyataan.

### Yang terbukti, dengan angka

```
migrasi 205-208 · 7 tabel situs_*, rls_aktif=true, 3 policy masing-masing
schema_hash      8c3c196dbac9e983 (134 -> 147 tabel)
test             36 API hijau + 8 web-publik hijau
penjaga          5 audit arsitektural LULUS · lint:ratchet 0 error, 234 warning
konten           24 teks · 11 milestone · 7 kategori · 13 KBLI · 28 foto
a11y             desktop & mobile: 0 gulir-horizontal, 0 img tanpa alt,
                 0 img gagal, 1 h1, 0 pageerror
fallback         reduced-motion: canvas=0, seluruh tahap tetap terbaca
```

### Empat percobaan salah sasaran untuk satu cacat warna

Massing 3D tampil sebagai tumpukan hitam. Saya menaikkan hex warna pelat TIGA
KALI (`#0A3A6B` -> `#2F4F73` -> `#4E7098` -> `#5F80A6`) dan menambah
`hemisphereLight`, semuanya dari kesimpulan "adegannya kurang cahaya" yang saya
tarik dengan melihat potret HALAMAN.

Yang akhirnya menemukannya: memotret CANVAS-nya sendiri — lantai bawah ternyata
sudah biru terang, jadi pencahayaan tak pernah bermasalah. Lalu mengganti
seluruh material dengan `meshBasicMaterial` yang mengabaikan cahaya sepenuhnya.
Pelat TETAP gelap.

Penyebabnya `convertSRGBToLinear()`: Three.js r152+ sudah mengonversi sRGB
otomatis, jadi panggilan itu membuatnya terjadi dua kali. **Spec §5.1 yang
menyuruhnya** — spec-nya salah, dan sudah dikoreksi di tempat.

Pelajarannya sudah ditulis di header berkasnya: kalau perbaikan ketiga masih
tidak bekerja, berhenti menebak dan matikan variabelnya satu per satu.

### Revalidate: dua cacat berlapis yang sama-sama membalas SUKSES

Rantai "admin simpan -> halaman publik berubah" diuji end-to-end, bukan
diasumsikan. Dua kali ia membalas `{direvalidasi:true}` sementara halaman tak
bergerak sedikit pun:

1. `export const revalidate = 300` memberi halaman jadwal kedaluwarsanya
   SENDIRI, yang tak disentuh `revalidateTag`.
2. Setelah itu pun gagal. Headernya yang menjawab — `x-nextjs-cache: HIT`,
   `s-maxage=31536000`: halaman di-prerender penuh, dan HTML-nya duduk di
   lapisan cache yang BERBEDA dari cache fetch. Ditambahkan
   `revalidatePath('/')`.

Bukti akhir: DB diubah -> halaman masih lama -> revalidate -> halaman berubah.

### Tiga penjaga repo menangkap kelalaian saya

Semuanya bekerja persis seperti maksudnya, dan tak satu pun dilemahkan:

- **`has_permission` vs `auth_role`.** Rancangan awal migrasi 205 memakai
  `auth_role() = 'admin'` — pelanggaran ADR-004 yang sama dengan pelajaran
  migrasi 202. Ketahuan saat membaca pola migrasi 204 sebelum menulis.
- **Permission dibuat tapi tak di-assign.** Migrasi 205 membuat
  `situs:view`/`situs:manage`; tanpa 206, `has_permission()` menolak SEMUA
  orang termasuk admin, tanpa satu pun galat. Gejalanya cuma "layar kosong".
- **`audit-kegagalan-senyap.mjs`** menandai 6 baris `data ?? []` di situs.ts,
  dan ia benar: fallback itu mengubah kegagalan query jadi "nol baris yang
  sah". Ambang ratchet TIDAK dinaikkan; kodenya yang diperbaiki (G-5).

Ditambah `TenantDbError`: tujuh tabel `situs_*` belum terklasifikasi tenancy,
lima test merah 500 sampai `gen-tenant-map.mjs` dijalankan. Semua kategori B.

### Empat cacat UI yang hanya ketahuan dengan MELIHAT

1. progress selalu 0 — rumusnya berasumsi seksi lebih tinggi dari viewport.
2. massing gelap (di atas).
3. bangunan seperti piramida — penyusutan 0,15/lantai terlalu agresif.
4. kuning dipakai 18 kali dalam satu gulir (13 kode KBLI + 5 garis kategori),
   melanggar aturan "satu elemen kuning per layar" yang **saya tetapkan
   sendiri** di spec §5.1.

Satu koreksi penilaian: "19 dari 28 gambar gagal" pada potret pertama BUKAN
cacat — itu `loading="lazy"` bekerja. Setelah digulir, 28/28 memuat.

### Temuan yang mengubah desain

Compro PDF disampling pikselnya: **merek Puraloka dua warna, bukan satu.**
`#FFD600` (19.944 piksel) memikul logo dan seluruh aksen, dan sama sekali tak
ada di dashboard. Terjawab kenapa: kuning GAGAL di atas putih (1,41:1) tapi
11,77:1 di atas navy pekat. Dashboard berlatar terang — landing berlatar navy
adalah satu-satunya permukaan tempat warna merek ini aman sebagai teks.

Portofolio juga bukan per proyek bernama melainkan **per jenis pekerjaan**
(galeri compro hal. 13-19), dan 28 fotonya **sudah dikurasi founder** untuk
compro cetak. Pemetaannya dibuktikan dengan perceptual hash, jarak Hamming 0 —
byte-hash gagal total karena PDF mengompres ulang saat menyisipkan.

### Yang belum selesai

- **SITUS-2** halaman jual ERP: menunggu materi jual dikurasi founder.
- **SITUS-3** Renovasi Rumah & Beton Pracetak nol foto — berkas aslinya tak
  ada di mesin ini (ditelusuri 4 folder, nol kecocokan). Gambar di PDF-nya
  nyata dan bagus; bisa diekstrak dari PDF bila founder setuju.

---

## 2026-08-07 (lanjutan 16) — TUNDA mulai dikerjakan: kelompok A (vendor) 25 → 22

### Keputusan founder mengubah aturan mainnya

25 item TUNDA menunggu **pemicu bisnis**, dan 24 di antaranya belum menyala.
Founder memutuskan membangun semuanya sekarang dengan data dummy — basis ini
belum operasional sama sekali, jadi tak ada risiko merusak apa pun.

Yang berubah karena itu: bentuk modul diturunkan dari **praktik pengadaan
konstruksi**, bukan dari kasus nyata di basis. Konsekuensinya dicatat di
migrasi 210 terang-terangan — begitu vendor nyata masuk, bentuknya WAJIB
ditinjau ulang.

### Kelompok A — tiga item vendor

`prakualifikasi_vendor` · `dokumen_prakualifikasi` · `evaluasi_vendor`.

Prakualifikasi dan evaluasi **sengaja dipisah** meski keduanya "menilai
vendor": yang pertama menjawab *"boleh ikut tender?"* sekali di depan, yang
kedua *"masih layak dipakai lagi?"* berulang sesudah tiap pekerjaan.
Menyatukannya berarti satu skor untuk dua pertanyaan berbeda — dan vendor
yang lulus lalu mengecewakan akan terlihat sama dengan yang belum pernah
dinilai.

### Tiga hal yang layar tolak tampilkan sebagai kabar baik

**1. Vendor "lolos" yang izinnya sudah mati.** Diukur pada data uji: UD Besi
Kuat Mandiri berstatus hijau dengan skor 72, dan SIUJK-nya habis Maret 2026.
Tanpa kolom "Boleh diundang?", ia akan diundang tender — lalu penawarannya
gugur di meja panitia, dan itu baru ketahuan sesudah berkas dikirim.

**2. Rata-rata yang menyembunyikan satu dimensi nol.** Vendor dengan mutu 100
dan ketepatan waktu 0 punya rata-rata sama dengan yang serba-75. Layar
menampilkan **skor berbobot bersanding dengan rata polos**, plus lencana
titik lemah per-dimensi.

**3. Daftar hitam yang tenggelam di skor rendah.** Skor 46 karena sekali telat
berbeda dari 46 karena mengirim barang palsu lalu menolak retur. Daftar hitam
punya lencana sendiri dan **mengalahkan skor berapa pun** — vendor 95 yang
masuk daftar hitam tetap tak boleh dipakai.

### Yang saya revisi sendiri sesudah melihat layar

Potret pertama menunjukkan KPI "Izin segera habis" bernilai **0** — jalur
peringatan kuning tak pernah teruji. Saya tambahkan satu vendor dengan SBU
yang habis 42 hari lagi, supaya ketiga jalur peringatan (merah/kuning/hitam)
punya kasusnya masing-masing.

### Bukti

    26 invarian skema, 0 bocor · mutasi constraint TERTANGKAP
    14 test pustaka · 4 dari 4 mutasi perhitungan TERTANGKAP
    API: 172 berkas test, 1811 lulus, 2 dilewati, 0 gagal
    web: 389 lulus · 6 penjaga UI hijau
    axe-core: nol pelanggaran terang & gelap
    pnpm build lolos — /procurement/kualifikasi terdaftar

    TUNDA: 25 → 22 · taksonomi: 3 baris 🔴 → ✅

---

## 2026-08-07 (lanjutan 15) — `any` 99 → 59, dan TIGA field yang tak pernah tampil di layar

### Yang dikerjakan, dan kenapa ini bukan kerapian

43 dari 99 `any` tersisa ada di `mandor-portal`, hampir seluruhnya turunan
dari `useState<any[]>`. Tipe bersama dibuat di `_bersama/tipe.ts` — sekali
akarnya bertipe, belasan `.map((a: any) => …)` hilang sendiri.

Yang tak saya duga: **compiler langsung menemukan tiga cacat nyata** yang
selama ini disembunyikan `any`.

### 1. `workers_count` — jumlah pekerja tak pernah tampil

Halaman progres membaca `log.workers_count`. API mengirim **`worker_count`**
(tanpa `s`). Nilainya selalu `undefined`, jadi
`{log.workers_count && <span>… pekerja</span>}` **tak pernah merender apa
pun**. Tak ada galat — `any` membuat salah ketik itu tak terlihat compiler.

### 2. `work_scope` — nama lingkup kerja di kartu kasbon selalu "—"

Ringkasan portal membaca `k.work_scope?.scope_name`. Embed API bernama
**`work_scopes`** (jamak). Setiap kartu kasbon menampilkan `"—"` alih-alih
nama lingkupnya, dan tak ada yang tahu.

### 3. `filter(Boolean)` tidak menyempitkan tipe

`assignments.map(a => a.project).filter(Boolean)` tetap bertipe
`(ProyekRingkas | null | undefined)[]` di TypeScript. Baris berikutnya
memakai `p.id` — akan meledak pada penugasan tanpa proyek. Selama akarnya
`any[]`, hal itu tak pernah terlihat.

### Yang juga ketahuan: NUMERIC datang sebagai string

Belasan galat `Operator '+' cannot be applied to 'number' and 'string |
number'`. Postgres mengirim `numeric` sebagai string, dan `any` membuat
`total + kasbon.amount` menghasilkan penggabungan teks alih-alih penjumlahan
— diam-diam, tanpa gejala, sampai nominalnya cukup ganjil untuk dicurigai.

Seluruhnya kini `Number(x ?? 0)` eksplisit.

### Ratchet

    no-explicit-any                      99 -> 59  (lantai dikencangkan)
    click-events-have-key-events         61 -> 59
    no-static-element-interactions       66 -> 64

### Yang saya ukur dan TIDAK kerjakan

**#14 utang adopsi supabase mentah.** Diukur: 366 akses, dan
`audit-gerbang-tenancy` melaporkan 6 rute tanpa gerbang. Diperiksa satu per
satu — **keenamnya SAH**: `notifications` disaring `id = user.id`, `roles`
membaca katalog global `permissions`, `auth` memang pra-sesi.

Jadi **nol celah tenancy nyata**. Sisanya murni utang adopsi wrapper, dan
menurunkannya lebih jauh butuh menyentuh 166 rute — pekerjaan tersendiri,
bukan tambalan.

Sempat saya kira `user.role === 'mandor'` di `mandor.ts` adalah pelanggaran
ADR-004. **Saya salah**: di sana peran memilih KOLOM mana yang dibandingkan
(`mandor_id` vs `pm_id`), bukan memutuskan akses — capability-nya sudah
dijaga `requirePermission` di preHandler. Penjaganya benar tidak menandainya.

### Bukti

    API: 171 berkas test, 1797 lulus, 2 dilewati, 0 gagal
    web:  29 berkas test,  389 lulus, 0 gagal
    73 penjaga CI dijalankan — nol gagal
    pnpm build web lolos · nol galat runtime di portal

---

## 2026-08-07 (lanjutan 14) — F7-1: tenant yang lahir dengan alur persetujuan MATI

### Celah yang paling menentukan "tenant baru sekali klik"

Provisioning ternyata sudah matang: buat badan usaha (validasi kode, cek
keunikan global, penjagaan grup), tambah anggota, atur peran, ganti company
aktif, plus UI `/pengaturan/perusahaan`. Endpoint-nya bahkan sudah punya pola
yang benar — kalau keanggotaan gagal, company-nya dibatalkan: *"lebih baik tak
jadi dibuat daripada lahir mati"*.

Tapi satu langkah hilang. **Company baru tidak mendapat rantai approval.**

Diukur: company kedua di basis ini punya **0 dari 7** jenis rantai. Ia lahir
tanpa satu pun, dan pengajuan tetap masuk — lalu tak pernah bisa diputuskan
siapa pun karena tak ada yang menentukan siapa berwenang. Tak ada galat, tak
ada log; hanya antrean yang tak bergerak.

Ketahuannya pun **kebetulan**: `submittal-aturan.test.ts` merah untuk satu
jenis dari tujuh, karena hanya `submittal` yang punya test. Enam sisanya tak
akan pernah berteriak.

### Disalin dari basis, bukan dari daftar di kode

`siapkanRantaiApproval` menyalin dari company contoh yang sudah ada, bukan
dari konstanta. Menuliskan rantai bawaan di kode berarti dua sumber kebenaran
— dan yang di kode membusuk diam-diam begitu ada jenis rantai baru
ditambahkan lewat migrasi.

Kegagalannya **tidak** membatalkan company, berbeda dari keanggotaan. Company
tanpa anggota tak bisa dimasuki sama sekali; company tanpa rantai masih bisa
dipakai untuk hal lain dan rantainya bisa disusulkan. Yang tak boleh adalah
kegagalan itu lewat tanpa jejak — jadi ia dicatat sebagai audit `critical`.

### Yang TIDAK saya bangun, dan kenapa

**Langganan dan batas paket: nol tabel.** Ada `subscription` di statistik,
tapi itu milik skema `realtime` bawaan Supabase — bukan aplikasi. Sempat
terlihat seperti "sudah ada sebagian"; pengukuran kolomnya (nol kolom di
`public`) yang membongkar.

Membangunnya sekarang berarti menebak bentuk: paket apa saja, batas apa yang
ditegakkan, siklus tagih, dan apa yang terjadi saat lewat batas. Keempatnya
keputusan produk. Dicatat di `RATIFIKASI.md` beserta rekomendasi konkret
(satu paket, satu batas, peringatkan-jangan-tolak) — bukan pertanyaan
terbuka.

Alasan rekomendasi itu: menolak pembuatan proyek karena batas membuat
pelanggan berhenti bekerja, dan itu perlu diuji dengan pelanggan nyata lebih
dulu. Menagih kelebihan tanpa pernah menolak jauh lebih mudah diperbaiki
daripada sebaliknya.

### Bukti

    API: 171 berkas test, 1797 lulus, 2 dilewati, 0 gagal
    pendirian-tenant-lengkap.test.ts   3 test · 2 mutasi TERTANGKAP
    audit-pendirian-tenant.mjs         statis · mutasi TERTANGKAP
    73 penjaga CI dijalankan — nol gagal
    pnpm build web lolos

---

## 2026-08-07 (lanjutan 13) — F6-1 SELESAI, F7-1 terbuka; dan skrip saya diam-diam mengubah 8 berkas jadi CRLF

### `workflow_id`: 0 dari 21.005 jadi terikat di 12 langkah

Sisa terakhir F6-1. `correlation_id` mengikat event dalam SATU request —
tapi persetujuan berjenjang bukan satu request: level 1 hari ini, level 2
besok, oleh orang berbeda.

Diukur: **tiga estimasi punya dua langkah persetujuan** masing-masing, dan
tiga event tiap alurnya (`submitted` → `approval.level` → `approved`) tak
punya satu pun penanda bersama. Merunutnya berarti menebak dari `record_id`
dan waktu.

`idAlurPersetujuan(entityId)` memakai id entitas apa adanya — deterministik,
unik per-alur, sudah bertipe uuid. Membuat uuid baru berarti menambah tabel
pemetaan yang tak menjawab pertanyaan tambahan apa pun.

Konsekuensi yang disengaja: entitas yang ditolak lalu diajukan ulang memakai
`workflow_id` sama. Itu benar — pengajuan ulang adalah kelanjutan alur yang
sama, dan justru itu yang ingin dilihat saat menanyakan "kenapa dokumen ini
bolak-balik".

### Penjaga menemukan dua titik yang pencarian tangan saya lewatkan

Saya memasang `workflowId` di 10 titik dari pencarian sendiri. Penjaga
`audit-alur-persetujuan-terikat.mjs` melaporkan **12 langkah, 2 tanpa
workflowId** — `procurement.ts` dan `submittal.ts`.

Keduanya tak muncul di grep saya karena pola aksinya berbeda. Inilah gunanya
penjaga ditulis dari aturan, bukan dari daftar yang saya ketik.

### SAYA SALAH: skrip Python mengubah 8 berkas jadi CRLF

`submittal-aturan.test.ts` merah sesudah suntingan saya. Ia memeriksa TEKS
SUMBER dengan `toContain("...(request, {
        entityType: 'submittal'")`
— memakai `
`.

Berkasnya di HEAD ber-LF. Skrip `io.open(f,'w')` saya menulis dengan akhir
baris platform (CRLF di Windows), jadi seluruh berkas berubah — dan pola
ber-`
` tak akan pernah cocok lagi.

Diukur, dan bukan cuma satu: **delapan berkas** berubah LF → CRLF. Selain
memecahkan test, itu membuat seluruh berkas tampak berubah di diff —
menyembunyikan perubahan sebenarnya di antara ratusan baris palsu.

Dipulihkan dengan menulis ulang `
` → `
` secara biner, tanpa
membatalkan perubahan isinya. Lalu terjadi **ketiga kalinya** pada
`JOURNAL.md`, `QUEUE.yaml`, dan `ci.yml`.

Karena itu penjaganya dibuat: `audit-akhir-baris.mjs` membandingkan pohon
kerja vs HEAD dan merah kalau ada yang berubah LF → CRLF. Mutation-tested.
Dan sejak itu tiap penulisan lewat skrip memakai mode BINER
(`io.open(f,'wb')`), bukan `'w'` yang mengikuti akhir baris platform.

Yang menyelamatkan: peringatan git
"CRLF will be replaced by LF" yang selama ini saya lewati sebagai kebisingan.

### F6-1 `done`, F7-1 `todo`

Ketiga kriteria terpenuhi dan masing-masing punya penjaga yang terbukti bisa
merah. F7-1 — provisioning tenant + penagihan, item yang menentukan produk
bisa dijual — kini tak lagi terblokir.

### Bukti

    API: 170 berkas test, 1794 lulus, 2 dilewati, 0 gagal
    alur-persetujuan.test.ts            4 test · mutasi randomUUID TERTANGKAP
    audit-alur-persetujuan-terikat.mjs  12/12 langkah · mutasi TERTANGKAP
    seluruh penjaga CI hijau — nol gagal
    pnpm build web lolos

---

## 2026-08-07 (lanjutan 12) — F6-1 tak pernah terblokir, dan 1.260 keputusan yang alasannya tak bisa dicari

### Status yang usang, bukan pekerjaan yang mustahil

`QUEUE.yaml` menandai F6-1 `blocked` oleh F5-1 — padahal **F5-1 sudah
`done`**. Pemblokirnya lepas entah sejak kapan, dan status yang bertahan
membuat item XL ini tampak tak bisa disentuh. F7-1 (yang menentukan produk
bisa dijual) menunggu di belakangnya.

Persis cacat yang §8a.4 larang: dokumen tertinggal dari kenyataan.

### Diukur ke basis, bukan dibaca dari dokumen

    public.audit_logs        21.005 baris, 14 Jun - 5 Agu
    company_id terisi        21.005 / 21.005
    correlation_id terisi        30 / 21.005
    reason terisi             2.559 / 21.005
    workflow_id terisi            0 / 21.005

Angka 30 itu sempat terlihat seperti kegagalan. Ditelusuri: **seluruhnya
event yang lewat `logAuditEvent`** (`estimate.version_created` dst), dan
helper-nya memang mengisi `correlation_id` otomatis dari `request.id`.
20.975 sisanya data seed yang ditulis langsung ke tabel. **Pipanya benar.**

### Kriteria 1 — jejak tersimpan tapi tak bisa dirunut

`GET /api/v1/audit` tak mengambil `reason`, `severity`, maupun
`correlation_id`, dan tak punya saringan untuk keduanya. Satu request
menghasilkan banyak event yang berbagi id — tapi tak ada cara memakainya.
Yang terbaca cuma daftar datar 21 ribu baris.

Kolom yang terisi dan tak pernah terbaca sama saja dengan kolom kosong —
hanya lebih menyesatkan, karena pemeriksaan skema melaporkannya "ada".

Ditutup: ketiganya ikut di balasan, plus saringan `correlation_id` dan
`severity`. Dijaga `audit-jejak-terbaca.test.ts` — 4 test, dan **3 dari 3
mutasi tertangkap** (kolom dibuang, tiap saringan dilepas).

### Kriteria 2 — 1.260 keputusan yang alasannya tak bisa dicari

    estimate.rejected          0 dari 636 punya reason
    estimate.approved          0 dari 624
    approval.step.create       0 dari 368
    change_order_approved    358 dari 359   <- yang benar

Sebabnya bukan alasannya tak dicatat, melainkan **dicatat di tempat yang
salah**: `newValues: { reason: ... }`, di dalam JSON. Tiga pemanggil
melakukannya — penolakan estimasi, pemaafan denda, penolakan lessons.

Bedanya menentukan. Kolom `reason` ada supaya "keputusan mana yang tak
beralasan" bisa dijawab satu kueri. Dengan alasan terkubur di JSON, jawabannya
SELALU "semuanya" — dan laporan kepatuhan yang membacanya melaporkan nol
kepatuhan pada sistem yang sebenarnya patuh.

Ketiganya diperbaiki (kolom DAN `newValues`, supaya riwayat lama tak berubah
bentuk), dan `audit-alasan-di-kolomnya.mjs` mencegah terulang —
mutation-tested.

### UI — dan satu hal yang hampir terlewat

Kolom yang sampai ke API tapi tak tampil di layar sama saja tak ada. Halaman
audit kini menampilkan alasan (huruf miring, di bawah aksinya) dan penanda
**KRITIS**.

Hanya `critical` yang diberi penanda, bukan ketiga tingkat: ARAH-VISUAL §3d —
kalau tiga hal berwarna, tak ada yang menonjol. Dan `info` adalah mayoritas
mutlak.

Diverifikasi lewat potret kedua mode, bukan diklaim. axe-core: **nol
pelanggaran terang dan gelap**.

### Satu kekeliruan cara kerja yang berulang

Instance API uji yang saya jalankan di latar **dua kali** memuat kode lama,
dan dua kali saya menyimpulkan "kolomnya tak sampai" dari situ. `pkill -f
"PORT=3099"` tak mengenai prosesnya karena pola itu tak ada di command
line-nya. Yang menyelesaikan: menjalankan di port yang belum pernah dipakai.

Kalau saja saya berhenti di kesimpulan pertama, saya akan "memperbaiki" kode
yang sudah benar.

### Status F6-1 sesudah ini: `wip`, bukan `done`

`workflow_id` masih **nol pemakaian** — belum ada konsep alur multi-langkah
yang mengikatnya. Itu pekerjaan tersendiri, bukan tambalan, dan menandai
F6-1 `done` tanpa itu berarti mengulangi persis kesalahan yang entri ini
perbaiki.

### Bukti

    API: 169 berkas test, 1790 lulus, 2 dilewati, 0 gagal
    web:  29 berkas test,  389 lulus, 0 gagal
    seluruh penjaga CI hijau — nol gagal
    axe-core halaman audit: nol pelanggaran, terang & gelap
    pnpm build web lolos

---

## 2026-08-07 (lanjutan 11) — padding dipaku 358 → 307, dan ekor panjang yang sengaja ditinggal

### Yang dikerjakan

Delapan berkas penyumbang terbesar dialihkan ke token kerapatan:
`--pad-kartu`, `--pad-kartu-lega`, `--gap-grid`, `--gap-bagian`.

    358 → 307   (lantai ikut turun, terkunci)

### Yang TIDAK dikerjakan, dan kenapa

Sisa 307 tersebar di **112 berkas** — rata-rata kurang dari 3 per berkas.
Menghabiskannya berarti menyunting 112 berkas dengan nilai per suntingan yang
kecil dan risiko regresi visual yang nyata di tiap satu.

Dan sebagian memang **bukan** kerapatan kartu:
`portal/proyek/[id]` didominasi `padding: 40/60/80` untuk keadaan kosong dan
pemuatan — token kartu tak berlaku di sana, dan memaksakannya justru membuat
layar kosong jadi sempit.

Ratchet-nya sudah menjaga sisanya: angka hari ini adalah lantai, dan halaman
baru tak bisa menambah.

### Verifikasi visual, karena mengganti padding tanpa melihat itu ceroboh

Potret dashboard di 1500px menampilkan kartu KPI keempat terpotong, dan saya
sempat menyimpulkan tata letaknya rusak. **Diukur, bukan disimpulkan**:
`scrollWidth === innerWidth` dengan maupun tanpa perubahan saya — nol geseran
horizontal di kedua keadaan.

Potret ulang di 1920px menunjukkan keempat KPI muat dan panel Status &
Progress lengkap dengan angkanya. Yang terlihat terpotong adalah batas
viewport potretnya, bukan cacat.

### Bukti

    kerapatan: 358 → 307, lantai terkunci
    web: 29 berkas test, 389 lulus, 0 gagal
    seluruh penjaga CI hijau — nol gagal
    pnpm build web lolos

---

## 2026-08-07 (lanjutan 10) — audit a11y runtime: 9 pelanggaran yang audit manual saya lewatkan

### Audit manual saya sendiri melewatkannya

Saya memindai 7 dashboard baru dengan axe, kedua mode: **14 dari 14 bersih**.
Lalu menjalankan `audit-a11y-runtime.mjs` yang memindai **69 halaman** —
dan menemukan **9 pelanggaran serius** yang tak masuk pilihan saya.

Pelajarannya bukan "audit lebih banyak halaman", melainkan: alat yang
menemukan halamannya sendiri dari berkas tak bisa lupa, sedangkan daftar yang
saya ketik bisa.

### `nested-interactive` — kontrol di dalam kontrol

`/procurement/permintaan` dan `/procurement/pesanan`: kartu ber-`onClick`
untuk membuka detail, berisi tombol Submit/Setujui/Tolak.

`stopPropagation` menangani tetikus dengan benar, jadi **tak ada gejala yang
terlihat**. Tapi pembaca layar mengumumkan kontrol bertumpuk, dan pengguna
papan tik menemukan fokus berpindah ke tempat yang tak diumumkan sama sekali
(WCAG 4.1.2).

Diperbaiki dengan memindahkan pemicu: kartu berhenti jadi tombol, nomor
dokumen yang jadi tombol pembuka. "Buka MR-001" jauh lebih jelas diumumkan
daripada "tombol" untuk seluruh kartu. `stopPropagation` ikut dihapus — tak
ada lagi handler induk yang perlu ditahan.

Peringatannya ditulis di komponen `Card` supaya pemakaian berikutnya tak
mengulanginya.

### Enam halaman yang tak pernah dipindai siapa pun

Audit melaporkan `rute dinamis TERLEWAT: 6` — dan tetap menutup dengan
**"pelanggaran: 0"**. Skripnya jujur; yang tidak jujur adalah cara angka itu
terbaca. "0 pelanggaran" di baris terakhir mengalahkan daftar terlewat di
baris keenam.

Keenamnya diberi contoh id dari data nyata. Hasil akhirnya:

    72 halaman × 2 mode = 144 pemindaian
    nol rute terlewat
    0 pelanggaran

Dua di antaranya (`/m/[key]`, `/verify/invoice/[id]`) memang bersih — tapi itu
baru diketahui SESUDAH dipindai.

### Penjaga baru: `uji-rute-dinamis-teraudit.mjs`

Audit runtime butuh server web dan peramban; CI belum punya keduanya, jadi
mendaftarkannya di sana adalah pekerjaan infrastruktur tersendiri.

Yang bisa dijaga hari ini murni statis: **tiap rute dinamis wajib punya entri
`CONTOH_ID`**. Halaman dinamis baru tanpa contoh id akan merah di CI, bukan
diam-diam tak pernah dipindai.

Aturan penelusuran berkasnya sengaja disamakan dengan `halamanDariBerkas()`
di audit-nya — kalau keduanya menyimpang, penjaga ini menjaga daftar yang
berbeda dari yang benar-benar dipindai, dan itu lebih buruk daripada tak ada
penjaga.

Mutation-test, dua arah:

    contoh id dihapus              -> MERAH
    halaman dinamis BARU tanpa id  -> MERAH

### Bukti

    a11y runtime: 72 halaman, terang & gelap, 0 pelanggaran, 0 rute terlewat
    web: 29 berkas test, 389 lulus, 0 gagal
    seluruh penjaga CI hijau — nol gagal
    pnpm build web lolos

---

## 2026-08-07 (lanjutan 9) — antrean UI, dan hook yang saya bangun lalu batalkan sendiri

### Tabel mentah 8 → 7 halaman

`mandor-portal/scope` dikonversi ke `<Tabel>` — 32 baris, nol fitur khusus,
plus satu `any[]` hilang jadi tipe eksplisit.

Empat halaman lain **sengaja tetap tabel mentah**, dan kini semuanya punya
alasan tertulis (dua sudah punya, dua saya tambahkan):

- **profitabilitas** — sel Margin dan baris TOTAL memuat logika
  `margin-tepercaya` yang BERBEDA satu sama lain: baris memakai ambangnya
  sendiri, total ditandai ragu kalau ADA SATU baris yang ragu. Aturan kedua
  lahir dari cacat nyata (total 94,1% hijau di atas tabel yang 8 dari 15
  barisnya "belum lengkap"). Memisahkannya ke `total={[...]}` mengembalikan
  bentuk yang membuat keduanya bisa berselisih diam-diam.
- **absensi** — ini formulir dalam bentuk tabel: tiap sel berisi tombol
  ber-`aria-pressed` yang menulis langsung ke absensi hari itu. Salah render
  satu status = upah hari itu tercatat salah tanpa gejala.

### Satu panggilan API ganda yang ketahuan lewat lint

`absorption-log-table.tsx` punya dua efek yang sama-sama memanggil `load`,
dan `load` ada di kedua daftar dependensi. Tiap `projectId` berganti,
keduanya menyala: dua panggilan API untuk satu perubahan, yang kedua menimpa
yang pertama. Tak ada gejala — datanya sama, hanya diminta dua kali.

Digabung jadi satu efek dengan pola `void load()`. Ratchet turun 59 → 58.

### SAYA SALAH: hook `useToastOtomatis` tak menyelesaikan masalahnya

Pola toast-auto-tutup disalin di 17 halaman dan `set-state-in-effect`
menandai semuanya. Saya bangun hook bersama untuk menggantikannya — lengkap
dengan 5 test dan 4 mutasi tertangkap.

Lalu diukur: **59 dengan maupun tanpa konversi.** Lint menandai pemanggilan
hook apa pun yang setter-nya bisa dilacak balik ke `setState`, terlepas dari
bentuknya. Saya menebak tiga bentuk yang "akan lolos" — argumen inline,
`useCallback`, fungsi biasa — dan ketiganya ditandai.

Konversi 8 halaman itu dibatalkan. Hook dan test-nya tetap ada: perilakunya
benar dan terbukti (termasuk closure basi dan timer yang bocor saat unmount),
jadi ia berguna untuk halaman baru. Yang tidak benar adalah klaim bahwa ia
membayar utang lint.

### Dan satu kesalahan cara mengukur

Mutation test hook itu tiga kali melaporkan "LOLOS", dan saya tiga kali
menyimpulkan test-nya lemah lalu menulis ulang. Sebenarnya **skrip mutasinya**
yang salah: `replace(..., 1)` mengganti kemunculan PERTAMA, yang ada di
komentar, bukan kode. Mutasinya tak pernah menyentuh apa pun.

Versi ketiga test (`vi.getTimerCount()`) sudah benar sejak awal. Dua penulisan
ulang sebelumnya tak perlu — tapi keduanya meninggalkan catatan tentang
kenapa versi sebelumnya gagal menjaga, dan itu tetap berguna.

### Bukti

    web: 29 berkas test, 389 lulus (naik 5 dari hook baru), 0 gagal
    seluruh penjaga CI hijau (API + web) — nol gagal
    pnpm build web lolos

---

## 2026-08-07 (lanjutan 8) — R-011 diselesaikan tanpa menaikkan plafon, dan dua cacat di generator peta tenancy

### VIEW `v_situs_publik` — 7 query jadi 1

Sesi compro berhenti, jadi tiga temuan yang tak bisa saya sentuh jadi milik
saya. Yang terbesar: ratchet supabase mentah **373 vs plafon 366**.

Founder memilih membangun VIEW (bukan mengecualikan endpoint publik dari
hitungan, bukan menaikkan plafon). Migrasi 209:

    query di endpoint publik      7 → 1
    akses supabase mentah repo  373 → 366   (plafon TIDAK dinaikkan)

Satu akses terakhir dihabiskan di tempat lain: `menu.ts` membaca `menu_items`
(kategori A) di belakang `authenticate` → `db.shared('menu_items')`, yang
hanya menerima kategori A/AB sehingga "ini memang katalog global" jadi
diperiksa compiler, bukan diyakini pembaca.

Yang didapat selain angka: penyaringan `tampil`/`aktif` pindah ke skema
(dulu tiap query mengingatnya sendiri; satu yang lupa menerbitkan draf ke
publik), dan daftar kolom publik terkunci di definisi view — kolom baru yang
ditambahkan besok tidak ikut terbit.

### Dua cacat di `gen-tenant-map.mjs`, ketahuan karena view pertama

**1. Generator tak pernah melihat VIEW.** `table_type='BASE TABLE'`
mengecualikannya. Tapi `tenancy-ratchet` memeriksa setiap nama yang dibaca
lewat `.from()`, dan itu termasuk view — jadi view apa pun akan merah selamanya
tanpa cara memperbaikinya lewat generator.

**2. Dan klasifikasinya salah begitu ikut.** View tak punya constraint, jadi
`information_schema` melaporkan `is_nullable = YES` untuk seluruh kolomnya —
yang oleh aturan lama berarti **AB, katalog bersama**. Setiap view akan
diklasifikasi sebagai data yang boleh dibaca lintas tenant.

Sekarang: view ber-`company_id` → B, tanpa → D. `critical_audit_events` yang
sudah ada sejak lama ikut terklasifikasi untuk pertama kalinya (D — butuh
keputusan sadar).

**Salah kategori di gerbang tenancy lebih berbahaya daripada tak
terklasifikasi**: yang kedua merah di CI, yang pertama diam.

### Penanda `view: true`, dan kenapa itu bukan pelemahan

Kategori B menuntut policy `tenant_isolation` (T5a, T7-L2). View **tidak bisa**
punya policy RLS — jadi satu-satunya "perbaikan" yang tersedia tanpa penanda
ini adalah menurunkan kategorinya, yaitu berbohong tentang tenancy-nya.

Peta kini menuliskan `view: true`, dan kedua test menyaringnya. Dibuktikan
tidak melemahkan lewat mutasi: melepas `tenant_isolation` dari `sertifikat_ipc`
(tabel nyata) tetap merah.

### Tiga penjaga web — dan hex yang ternyata bukan soal token

`pengaturan/situs/page.tsx`: container tanpa token lebar, 5 padding dipaku,
dan 2 hex literal.

Yang hex menarik: keduanya **nilai default warna merek yang menduplikasi
`DEFAULT` kolom di migrasi 205**. Dua sumber kebenaran untuk satu nilai, dan
yang salah adalah yang terlihat pengguna. Menggantinya jadi token juga salah —
token adalah warna aplikasi, ini warna perusahaan pelanggan. Diganti string
kosong; defaultnya kini hanya ada di skema.

### Bukti

    168 berkas test, 1786 lulus, 2 dilewati, 0 gagal
    seluruh penjaga CI hijau (API + web) — nol gagal
    pnpm build web lolos
    mutasi policy tenant: TERTANGKAP

---

## 2026-08-07 (lanjutan 7) — merge `feat/ui-lanjutan`, dan perbaikan dari arah yang salah

### Merge: bukan fast-forward, dan gabungannya tidak hijau

Laporan sesi UI menyebut "fast-forward, tanpa konflik, 384 test lulus".
Diukur sebelum menjalankan: **bukan fast-forward** — 2 commit sisi ini belum
ada di sana (endpoint situs + jurnal IPC), 10 commit mereka belum ada di sini.
Merge tetap bersih, tapi menghasilkan commit gabungan.

Yang lebih penting: **gabungannya tidak hijau**, dan itu tak terlihat dari
sisi mana pun secara terpisah. Sesi UI tak punya pekerjaan IPC saya; saya tak
punya penjaga baru mereka.

### SAYA SALAH: memperbaiki rantai approval dari arah yang salah

`submittal-aturan.test.ts` merah — ada company tanpa rantai approval.
Company itu `[UJI] Tenant Kedua`, dan saya menyimpulkan terlalu cepat bahwa
yang kurang adalah rantainya.

Saya menulis migrasi 208 (menyalin rantai), lalu menemukan level 2 tak ikut
tersalin, lalu menulis 209 untuk memperbaikinya. Hasilnya: test submittal
hijau, dan **dua test lain rusak**.

Sebabnya baru terlihat sesudah membaca test-nya sendiri:
`approval-chain-berjenjang.test.ts` menghitung level lintas SELURUH company
dan mengharapkan `[1, 2]`. Dengan dua rantai, ia membaca `[1, 1, 2, 2]`.

Dan akar sebenarnya ada di tempat lain lagi: `[UJI] Tenant Kedua` dibuat
`situs.test.ts` dan **sengaja ditinggalkan nonaktif** — penjaga repo melarang
menghapus company, jadi ia dimatikan. Company nonaktif tak menerima pengajuan
apa pun.

Perbaikan yang benar satu baris: saring `is_active` di test itu. Kedua migrasi
dibatalkan, beserta 7 rantai + 7 langkah yang terlanjur masuk.

**Pelajarannya**: saya memperbaiki gejala (test merah) sebelum memahami
sebabnya, dua kali berturut-turut, dan tiap "perbaikan" menambah kerusakan.
Yang menghentikannya adalah membaca test yang gagal — bukan menebak apa yang
dimaui angkanya.

### Tiga temuan yang TIDAK saya perbaiki

Semuanya di `situs.ts` dan `pengaturan/situs/`, berkas yang sedang ditulis
sesi compro. Menyuntingnya berarti menimpa pekerjaan berjalan
(CLAUDE.md §8a.1 poin 1). Dicatat di RATIFIKASI.md paling atas, lengkap
dengan jalan keluarnya:

1. **6 kegagalan senyap** — `?? []` tanpa memeriksa `error` di enam query
   `/api/v1/public/situs`. Halaman publik tetap terbit tanpa milestone,
   legalitas, atau seksi, tanpa satu pun gejala. 192 vs ambang 186.
2. **Ratchet supabase mentah 373 vs plafon 366.** Plafon ini `PLAFON_R011`,
   diratifikasi founder sebagai satu-satunya kenaikan, dengan tripwire yang
   merah kalau angkanya sendiri diubah — G-5. Jalan keluarnya sudah tertulis
   di header test: VIEW yang menjamin tenancy di lapisan SQL.
3. **Tiga penjaga web** dari `pengaturan/situs/page.tsx` (tata letak, hex,
   kerapatan).

### Yang saya perbaiki

- `kerapatan-ratchet` (penjaga baru dari cabang yang di-merge) naik 2 karena
  dua halaman sesi ini → token `--gap-bagian` dan `--gap-grid`
- kode baru sesi ini sudah patuh ketiga standar baru tanpa penyesuaian:
  nol `<table>` mentah, nol `any`, nol `set-state-in-effect`

### Bukti

    1785 dari 1788 test lulus, 2 dilewati, 1 merah (ratchet supabase situs.ts)
    seluruh penjaga API hijau kecuali audit-kegagalan-senyap (situs.ts)
    seluruh penjaga web hijau kecuali tiga di atas (pengaturan/situs)
    typecheck web bersih

---

## 2026-08-07 (lanjutan 6) — catatan riwayat: pekerjaan IPC masuk lewat commit sesi lain

Pekerjaan INTI #2 (migrasi 204, `lib/sertifikat-ipc.ts`, rute, penjaga,
`/keuangan/ipc`, dan seluruh pembaruan dokumen) **ter-commit oleh sesi lain**
yang berjalan paralel, tercakup di `6e4fd66 feat(situs): endpoint admin konten`
dan dua commit `feat(situs)` sebelumnya.

Isinya utuh — diverifikasi satu per satu ada di HEAD, termasuk entri jurnal
lanjutan 5 dan pendaftaran penjaga di `ci.yml`. Yang hilang hanya pesan
commit yang menjelaskan **kenapa** IPC dibangun; entri lanjutan 5 di atas
adalah catatan lengkapnya.

Riwayat sesi lain **tidak ditulis ulang**. Menyunting commit yang sudah dibuat
sesi paralel berisiko membuang pekerjaan yang belum saya lihat — biayanya jauh
lebih besar daripada pesan commit yang kurang tepat.

Pelajarannya untuk sesi berikutnya: dengan dua sesi menulis ke satu pohon
kerja, `git add -A` bukan milik siapa pun. Stage berkas **dengan nama**, dan
periksa `git log` sebelum menyimpulkan pekerjaan sendiri belum ter-commit.

---

## 2026-08-07 (lanjutan 5) — INTI #2 IPC: gerbangnya sudah ada, angkanya tak pernah disimpan

### Celah yang ditutup — dan kenapa ia tak pernah menimbulkan galat

Gerbang progres SUDAH ADA dan SUDAH terpasang: `lib/ipc-progres.ts` dipanggil
di `finance.ts:560`, menolak termin `on_progress` yang ditagih sebelum
ambangnya tercapai. Bagian itu benar.

Yang hilang: **hasilnya dibuang.** Gerbang menghitung "progres 47%, ambang
40% → lolos", lalu tak menyimpan apa pun. Enam bulan kemudian
`projects.progress_pct` sudah bergerak, dan saat owner mempersoalkan sebuah
termin, yang tersedia hanya progres HARI INI.

Header `lib/ipc-progres.ts` sendiri sudah menuliskan alasannya — "sekadar
menolak-atau-meloloskan tak meninggalkan jejak apa pun" — tapi sertifikatnya
tak pernah dibangun.

Diukur: **40 termin (18 dibayar · 7 tertagih), 26 invoice, 271 log progres,
Rp 4,88 miliar nilai kontrak — nol sertifikat.** Ketujuh termin tertagih itu
tak punya jejak dasar penagihannya.

### Yang DIBEKUKAN vs yang DIHITUNG

`progres_diakui_pct`, `nilai_kontrak`, `retensi_pct` **dibekukan** di barisnya
— itulah yang membuat sertifikat ini sertifikat, bukan laporan hari ini.

`nilai_bersih` **tidak punya kolom**. Kolom hasil yang basi adalah cara paling
sunyi untuk membayar angka yang salah: ia terlihat benar sampai salah satu
komponennya berubah, dan tak ada yang memeriksa ulang angka yang sudah final.

### Invarian perhitungan yang paling mudah salah

**Retensi dihitung dari nilai PERIODE, bukan prestasi kumulatif.** Dari
kumulatif, retensi yang sudah ditahan periode-periode lalu akan ditahan lagi
setiap periode, dan kontraktor kehilangan uang yang sebenarnya sudah dipotong.

Test-nya sengaja memakai kasus di mana kedua rumus memberi jawaban BERBEDA
(prestasi 300jt, periode 100jt → 15jt vs 5jt). Kalau memakai IPC pertama,
kumulatif dan periode kebetulan sama dan test-nya tak membuktikan apa pun.

### Tiga hal yang layar tolak tampilkan sebagai kabar baik

Terbukti lewat potret pada empat sertifikat uji, terang dan gelap:

1. **Progres 100% bukan pelunasan** — IPC-002 menampilkan Rp 237.500.000,
   bukan Rp 650.000.000. Retensi tetap ditahan.
2. **Nilai periode negatif tidak dibulatkan ke nol** — IPC-004 menampilkan
   −Rp 52.500.000 dengan kalimat yang menyebut dua sebab yang mungkin.
3. **Nilai bersih negatif tidak disembunyikan** — IPC-003 −Rp 19.000.000;
   kelebihan potongan harus dibawa ke periode berikutnya, bukan lenyap.

### Cacat yang hanya ketahuan dengan MELIHAT

Layar membuka pada IPC-004 — sertifikat paling bermasalah — hanya karena
urutan `tanggal DESC` kebetulan menaruhnya paling atas. Kebetulan bukan
alasan yang bisa diandalkan: begitu ada sertifikat baru yang sehat, yang
bermasalah tenggelam dan tak ada yang membukanya lagi.

Diperbaiki jadi urutan berdasar BERAT masalahnya, plus pita yang menyebut
"2 sertifikat menuntut pemeriksaan — layar dibuka pada yang paling berat
lebih dulu, bukan yang paling baru". Tanpa kalimat itu, sertifikat bermasalah
yang terbuka lebih dulu terbaca sebagai keadaan biasa.

### Satu kesalahan yang tertangkap sebelum diterapkan

Migrasi 204 versi pertama memakai permission `finance:invoice:manage` — **key
yang tidak ada**. Policy-nya akan menolak setiap orang tanpa satu pun galat,
dan gejalanya cuma "layar IPC kosong". Ketahuan karena key-nya diverifikasi
ke tabel `permissions` sebelum migrasi dijalankan, bukan ditebak dari pola
namanya. Yang benar: `finance:invoice:create`.

### Tentang tiga perubahan sesi lain yang dilaporkan

Diukur di pohon kerja ini: `--navy` gelap masih `#5FA9FF` (bukan `#4D9FFF`),
ambang ratchet masih 180/68/68/22 (bukan 100/58/66/21), dan
`tabel-mentah-ratchet.mjs` sudah ada sejak sebelumnya. Ketujuh commit yang
disebut sudah ada di riwayat, nol commit tertinggal di remote.

Terlepas dari itu, ketiga standar itu benar, dan kode baru sesi ini sudah
patuh tanpa penyesuaian: **nol `<table>` mentah** (memakai `<Tabel>`),
**nol `any`**, **nol `set-state-in-effect`**.

### Bukti

    166 berkas test, 1750 lulus, 2 dilewati, 0 gagal (281s)
    22 invarian skema IPC terjaga, 0 bocor · mutation-test skema TERTANGKAP
    15 test pustaka · 7 dari 7 mutasi perhitungan TERTANGKAP
    axe-core WCAG 2.1 AA — terang & gelap: NOL pelanggaran
    seluruh penjaga web ✅ · seluruh penjaga API ✅ · kedua ratchet ✅
    pnpm build web ✅ — /keuangan/ipc terdaftar

---

## 2026-08-07 (lanjutan 4) — UI tender subkon: PEMBEDA 10/12 tuntas, dan tiga angka yang menolak jadi kabar baik

### Halaman `/mandor/tender` — dinilai lewat POTRET, bukan diklaim

Backend sudah ada sejak migrasi 201. Yang dibangun hari ini layarnya, plus
migrasi 203 yang mengarahkan menu `sk-tender` dari `/m/sk-tender` (rute
"belum dibangun") ke halaman nyata.

Data uji dibuat lebih dulu — **tiga skenario yang sengaja menyulitkan**, bukan
tiga baris rapi yang membuat setiap kesalahan tampilan tak terlihat:

| Tender | Kasus yang diuji |
|---|---|
| TND-001 | pemenang BUKAN termurah (selisih Rp 12jt, ada alasan tertulis) |
| TND-002 | penawaran −28,5% dari perkiraan — termurah TAPI berbahaya |
| TND-003 | tender sah tanpa satu pun penawaran |

Terbukti di potret (terang **dan** gelap):

- Bebeng tampil **"tidak menawar"**, bukan "Rp 0" — ia tidak menang sebagai
  termurah
- Rp 118jt ditandai **"Terlalu rendah"** meski ia yang termurah
- **pemenang bukan termurah** dinyatakan + alasan tertulisnya ditampilkan

### Tiga cacat yang hanya ketahuan dengan MELIHAT

Ketiganya tak akan pernah muncul dari membaca kode sendiri:

1. **Layar membuka pada tender KOSONG.** API mengurutkan `tanggal DESC`, jadi
   tender termuda menang — dan yang termuda justru paling mungkin belum ada
   penawarannya. Layar perbandingan yang disambut "belum ada penawaran"
   terbaca seperti fiturnya belum jalan. Diperbaiki: API mengirim
   `penawaran_subkon(count)`, halaman memilih tender yang PUNYA isi.

2. **"PENAWARAN MASUK 2" padahal 3 baris.** Benar secara definisi (2 menawar,
   1 tidak) tapi pembacanya mengira ada yang belum termuat. Diganti
   **"MENGAJUKAN HARGA 3 dari 3"**.

3. **KPI "Termurah" memajang angka berbahaya sebagai nilai netral.** Rp 118jt
   adalah termurah DAN −28,5% dari perkiraan; dipajang polos di antara tiga
   KPI lain, yang paling berisiko justru terbaca paling menarik — persis
   salah-baca yang banner di bawahnya berusaha cegah. Kini kartunya ikut
   oranye dengan keterangan "periksa lingkupnya".

### `catatan` tak pernah sampai ke layar — ditemukan sebelum ditampilkan

`BarisPenawaranSubkon` punya `catatan` sebagai input, tapi `PenawaranTerhitung`
tidak meneruskannya. Kolom "Catatan" akan **selalu kosong tanpa satu pun
galat** — dan yang hilang justru kalimat yang menjelaskan kenapa sebuah
penawaran jauh di bawah perkiraan ("harga tidak menyebut talang dan
flashing"). Diperbaiki + test + mutation-test (mengembalikan `catatan: null`
membuatnya merah).

### Penjaga potret yang tak pernah bisa jalan

`tangkap-layar.mjs` memakai `BASIS = http://localhost:3001` — itu **port API**,
bukan web. Setiap upaya memotret gagal dengan "menunggu #login-email", seolah
halaman loginnya rusak.

**Saya menebak tiga kali sebelum mengukur**: `networkidle`, `addInitScript`,
lalu `deviceScaleFactor`. Ketiganya diuji satu per satu dan ketiganya salah.
Yang menemukan adalah membaca nilai `BASIS`. Perubahan `networkidle` yang
terlanjur saya buat dikembalikan — ia bukan perbaikan, dan komentar
pembenarannya tidak terbukti.

### Bukti

    165 berkas test, 1735 lulus, 2 dilewati, 0 gagal (274s)
    axe-core WCAG 2.1 AA — tender & contingency, terang & gelap: NOL pelanggaran
    16 penjaga web ✅ · seluruh penjaga API ✅ · ratchet API & web ✅
    pnpm build web ✅ — /mandor/tender terdaftar

### Catatan jujur

API yang berjalan di terminal founder dijalankan `tsx src/index.ts` **tanpa
watch**, jadi perubahan endpoint (`penawaran_subkon(count)`) belum termuat
saat potret diambil. Dropdown masih menulis "belum ada penawaran" untuk tender
yang punya 3, dan kolom Catatan masih "—". Kodenya diverifikasi benar lewat
PostgREST langsung: `[{count:3},{count:3},{count:0}]`. **Keduanya akan benar
begitu API di-restart** — bukan diklaim sudah benar sekarang.

---

## 2026-08-07 (lanjutan 3) — SAYA SALAH: 9 migrasi PEMBEDA melanggar ADR-004 yang saya kutip sendiri

### Temuan utama: RLS literal peran 68 → 86, dan 18 dari 18 berasal dari saya

`audit-rls-literal-peran.mjs` merah. Bukan warisan lama — diukur per-tabel,
**seluruh 18 kenaikan** berasal dari sembilan migrasi PEMBEDA yang saya tulis
sendiri (193–201). Semuanya memakai bentuk:

    auth_role() = ANY (ARRAY['admin','pm'])

Itu melanggar ADR-004 Rule #2 — aturan yang `CLAUDE.md` §5.1 kutip, dan yang
saya sendiri rujuk saat menulis migrasi-migrasi itu. **Saya salah**: saya
menegakkan aturan permission-bukan-peran di lapisan rute (`requirePermission`)
tapi melanggarnya di lapisan RLS, di berkas yang sama.

Ini bukan pelanggaran teoretis. Diukur di database ini:

| peran | punya 5 permission? | policy lama `['admin','pm']` |
|---|---|---|
| admin | 5/5 | lolos |
| pm | 5/5 | lolos |
| **direktur** | **5/5** | **DIBLOKIR** |
| mandor | 2/5 | diblokir |
| client | 1/5 | diblokir |

Peran `direktur` sudah ada, sudah punya seluruh permission-nya, dan policy
saya memblokirnya total. Layar tender/contingency/RFQ akan **kosong** —
bukan galat, bukan "tidak berwenang", kosong. Persis kegagalan senyap yang
ADR-004 tulis untuk dicegah.

Perbaikan: migrasi `202_rls_permission_bukan_peran.sql` mengganti 18 policy.
Key permission-nya **disalin dari `requirePermission(...)` di rute masing-masing**,
bukan ditebak dari nama tabel. Sesudahnya: 86 → 68 (kembali ke lantai),
`has_permission()` 150 → 168. Policy `tenant_isolation` RESTRICTIVE tidak
disentuh — ia tetap di-AND-kan, permission tak pernah bisa menembus company.

### Utang lint yang masuk tanpa CI menangkapnya

`react-hooks/set-state-in-effect` di HEAD = **71**, ambang 68. Dibuktikan
dengan mengukur di pohon kerja bersih (stash penuh), bukan menebak: bukan dari
perubahan sesi ini, bukan dari sesi lain yang belum commit. Artinya penjaga ini
pernah dilewati.

Ketiganya diperbaiki di modul `mandor/`, dan **dua menutup bug nyata**:

1. `_bersama/komponen.tsx` — ganti mandor tidak mereset `workerId`. Tukang
   dari mandor lama tetap terpilih meski daftarnya sudah berganti.
2. `[id]/page.tsx` — `loading` sebagai bendera boolean membuat profil mandor
   **sebelumnya** tampil di bawah id yang baru. Nama, KPI, kasbon milik orang
   yang salah. Diganti menyimpan id yang datanya sudah tiba (`dimuat === id`),
   plus galat per-id (`gagal === id`) supaya satu kegagalan tak mewarisi ke
   mandor berikutnya.

Lima ambang lain ikut dikencangkan karena ratchet sendiri memintanya:
click-events 63→61, static-interactions 72→68, explicit-any 191→180,
exhaustive-deps 24→22, unescaped-entities 28→18.

### Kode mati `isMandor` dihapus (keputusan founder)

30 cabang di 5 berkas + halaman `kasbon-saya` yang tak ditautkan siapa pun.
Sebelum menghapus, dibuktikan dulu — bukan diasumsikan:

- nol tautan masuk ke `kasbon-saya`
- `/mandor-portal/kasbon` memakai endpoint **yang sama** (`/api/v1/kasbons`)
  dan bisa mengajukan, bahkan lewat `kirimLapangan` yang mendukung offline

`pm-portal/layout.tsx` punya `isMandor` juga tapi **tidak disentuh** — di sana
peran mandor memang bisa masuk, jadi cabangnya hidup.

Sisa penutup tak sengaja itu diganti penjaga yang disengaja:
`uji-peran-lihat-layar-admin.mjs` — peran yang bisa membuka layar admin wajib
punya permission-nya. Mutation-tested (peran kustom tanpa `mandor:assign` →
merah).

### Yang saya keliru sepanjang sesi ini, selain di atas

- Menyebut penjaga `uji-izin-rute-lengkap.mjs` "hilang". Ia ada — di
  `apps/web/scripts/`, bukan `apps/api/scripts/`. Loop saya menjalankan 64
  penjaga dari satu direktori. Diukur ulang per-workspace: **nol hilang**.

### Bukti

    165 berkas test, 1734 lulus, 2 dilewati, 0 gagal (285s)
    ratchet API ✅ 0 error 234 warning · ratchet web ✅ 0 error 472 warning
    61 penjaga CI hijau (3 alat CI butuh argumen, dikecualikan)
    pnpm build web ✅

---

## 2026-08-07 (lanjutan 2) — Tender subkon (backend), dan dokumen yang menandai "belum" padahal sudah

### PEMBEDA 10/12 — backend selesai, UI menyusul

`apps/web` sedang dipegang sesi lain, jadi sesi ini bekerja **backend penuh**:
migrasi, pustaka murni, endpoint, uji invarian. UI dan audit a11y menyusul
begitu berkas sesi lain selesai — dan itu dicatat terang-terangan, bukan
diklaim hijau.

Diukur: **20 lingkup kerja Rp 15jt–280jt, SELURUHNYA `unsigned`**, tanpa satu
pun jejak bagaimana mandornya dipilih. Kesenjangan yang persis sama dengan
yang ditutup RFQ, tapi di sisi subkontraktor.

Memakai `workers` (mandor = padanan lokal subkon), BUKAN tabel
`subcontractors` baru — daftar terpisah menciptakan dua sumber kebenaran
tentang siapa mengerjakan apa.

### Yang paling dijaga: penawaran terendah adalah RISIKO, bukan kemenangan

Dibuktikan e2e dengan data dummy yang realistis:

```
perkiraan  Rp 100.000.000
Agung       Rp  60.000.000   terlalu_rendah  (−40%)  ← BUKAN "termurah"
Bebeng      Rp  95.000.000   wajar           (−5%)
Suswoyo     tak menawar

pemenang Bebeng · BUKAN-termurah=true · selisih Rp 35.000.000
```

Penawaran 40% di bawah perkiraan biasanya berarti ada lingkup tak terhitung,
dan itu kembali sebagai klaim tambah atau pekerjaan mangkrak. Menandainya
"termurah" saja membuat yang paling berbahaya terlihat paling menarik.

`pemenang_bukan_termurah` dinyatakan terang-terangan: sering ada alasan sah
(rekam jejak, kapasitas), tapi alasan itu **tak pernah ditanyakan** kalau tak
ada yang menandainya.

Delapan mutasi perhitungan + lima mutasi skema, seluruhnya tertangkap.
**Uji urutan tertangkap sejak percobaan pertama** kali ini — pelajaran dari
dua kegagalan sebelumnya terpakai: tegaskan urutan PENUH
(`['murah','mahal','takmenawar','gugur']`), bukan satu posisi saja.

Dua invarian basis yang paling mahal kalau bocor, keduanya terbukti menolak:
**dua pemenang** (index unik parsial) dan **yang tak menawar bisa menang**.

### Dokumen yang menandai "belum" padahal sudah — permintaan founder

Founder minta memastikan tak ada dokumen yang menandai pekerjaan selesai
sebagai belum dikerjakan. Diperiksa, dan **lima ditemukan**:

```
Eskalasi harga              🔴 → ✅   (migrasi 197, sudah jalan)
Register asuransi           🔴 → ✅   (migrasi 199)
Analisa keterlambatan       🔴 → ✅   (migrasi 198)
Manajemen contingency       🔴 → ✅   (migrasi 200)
Tender & award subkon       🔴 → 🟡   (backend selesai, UI menyusul)
```

**Kenapa penjaga F8-1 tak menangkapnya?** Karena PETA-nya menebak nama tabel
yang tak pernah ada: `insurance_register`, `contingency`, `delay_analysis`,
`price_escalation`, `subcontract_tenders`. Nol dari lima cocok dengan tabel
yang sebenarnya dibangun — jadi penjaganya hijau abadi untuk kelimanya.

Ini pelajaran tentang penjaga: **memetakan sesuatu ke nama yang salah sama
saja dengan tidak memetakannya**, tapi lebih berbahaya — sebab ia terlihat
seperti sudah diperiksa.

PETA diperbaiki ke nama tabel yang nyata. Entri CVR sengaja DIPERTAHANKAN
walau modulnya belum ada, supaya ia terhitung sebagai "benar belum ada"
alih-alih hilang dari pemeriksaan — dan penjaga langsung menangkap saat saya
sempat membuangnya (`takDipetakan 29 → 30`).

Hasil akhir: 🔴 turun **46 → 41**, basi tetap 0, lantai ratchet utuh.

### CVR & Tracking Waste: diukur ulang, tetap ditunda

```
project_expenses         0 baris   ← CVR tetap tak punya "biaya terpakai"
assemblies.waste_factor  1 dari 3.043  ← Tracking Waste tetap kosong
```

Keduanya tak berubah sejak pengukuran pertama. Membangunnya sekarang
menghasilkan layar berwibawa yang tak mengatakan apa-apa.

---

## 2026-08-07 (lanjutan) — Contingency, dan jarak isi yang tak pernah seragam

### PEMBEDA 9/12 selesai

Diukur: **NOL kolom contingency** di seluruh basis. Cadangan risiko adalah
bagian nilai kontrak yang sengaja disisihkan; tanpa dilacak ia tak hilang —
ia terpakai diam-diam, dan baru ketahuan habis saat dibutuhkan.

Buktinya sudah ada: **CO-001 disetujui Rp 50.000.000** pada proyek berkontrak
Rp 570.000.000, tanpa satu pun catatan cadangan mana yang berkurang.

Dibuktikan e2e sesudah dibangun:

```
cadangan   Rp 28.500.000
terpakai   Rp 32.000.000  (112,3%)
sisa      −Rp  3.500.000  ← DEFISIT, dipertahankan negatif
porsi kontrak 5,0%
```

### Dua keputusan yang menentukan

**Sisa DIHITUNG, tidak disimpan.** Kolom sisa yang disimpan bisa basi
diam-diam saat satu penarikan disunting — dan angka "cadangan masih aman"
yang basi dipakai untuk menyetujui pengeluaran berikutnya.

**Penarikan melebihi cadangan TETAP diterima basis.** Secara fisik itu
mungkin: uang keluar sebelum ada yang memeriksa. Menolaknya di basis akan
MENYEMBUNYIKAN kejadian yang paling perlu dilihat; yang benar adalah
menandainya di lapis perhitungan sebagai `terlampaui` — dipisahkan dari
`kritis`, sebab 112% menuntut sumber dana lain sedangkan 95% cukup dijawab
dengan berhenti menarik.

Sembilan mutasi perhitungan + lima mutasi skema, seluruhnya tertangkap.

### Uji urutan yang lolos — untuk KEDUA kalinya

Mutasi "buang urutan status" lolos, persis seperti di register asuransi hari
sebelumnya. Sebabnya sama: uji saya memakai pasangan yang **searah** (101% vs
99%), sehingga urutannya sama entah ditentukan status atau persentase.

Percobaan perbaikan pertama juga salah — saya menulis 100,0001% dan 99,9%,
lalu menegaskan yang pertama LEBIH KECIL. Aritmetika saya keliru; testnya
merah di basis.

Yang akhirnya membedakan: pos **DITUTUP** dengan persentase TERTINGGI (200%).
Statusnya berperingkat terakhir sementara persentasenya terbesar — dua sinyal
berlawanan, dan hanya urutan-menurut-status yang menempatkannya di bawah.

**Pelajaran yang berulang:** uji urutan yang pembandingnya searah tidak
membuktikan apa pun. Ia harus memakai kasus di mana dua kriteria itu
BERTENTANGAN.

### Jarak isi yang tak pernah seragam — ditemukan founder

Founder melihat halaman contingency "mepet banget ke pinggir". Benar, dan itu
salah saya: saya membuang padding tanpa memeriksa dari mana padding isi
datang.

Diukur, ternyata bukan cuma halaman saya:

```
arus-kas        74px
profitabilitas  37px
contingency      1px   ← mepet
```

**Tiga bagian, tiga jarak berbeda.** `keuangan/layout.tsx` membungkus
`{children}` dalam kartu tanpa padding, jadi tiap halaman menyediakan
sendiri — dan tak ada yang menyamakannya.

Diperbaiki di SATU tempat: padding pindah ke layout, enam halaman
dibersihkan dari padding gandanya. Hasilnya seragam **25px**. Menambalnya
per halaman hanya akan melahirkan jarak keempat di halaman berikutnya.

### Tab atau halaman? — sudah dijawab dokumen, dan sudah benar

Founder bertanya apakah keuangan sebaiknya dipecah jadi halaman.
`ARAH-VISUAL-2026.md` §6 sudah menjawabnya, dan **sudah dikerjakan**:

```
7 berkas rute terpisah · 191–606 baris  (dulu monolit 3.449 baris)
```

Yang terlihat seperti tab sebenarnya navigasi antar-HALAMAN: URL-nya berubah,
`/keuangan/contingency` bisa dikirim sebagai tautan. Dokumen itu juga menyebut
dua yang sengaja TETAP tab (`laporan`, `estimasi`) — di sana tab memang benar.

### Bentrok sesi lain: build web merah, dan itu BUKAN dari saya

`mandor/_bersama/komponen.tsx` (berkas untracked, sesi lain sedang memecah
modul mandor) membuat typecheck merah, sehingga build dan audit a11y tak bisa
dijalankan dari sesi ini.

Diverifikasi: **nol berkas mandor yang saya ubah**, dan typecheck atas berkas
`keuangan/*` bersih. Yang bisa dijalankan tetap dijalankan — web suite 216
lulus, lint ratchet hijau (hutang `no-explicit-any` malah turun 191 → 189),
penjaga rute hijau, 21 invarian contingency hijau.

Audit a11y halaman baru menyusul begitu berkas sesi lain selesai.

---

## 2026-08-07 — Register asuransi: bukan daftar polis, melainkan CELAH-nya

### PEMBEDA 8/12 selesai

Diukur lebih dulu: **NOL tabel dan NOL kolom asuransi** di seluruh basis.
Kontrak konstruksi hampir selalu mensyaratkan polis (CAR/TPL/Jamsostek), dan
saat klaim yang ditanya pertama adalah nomor polis + masa berlakunya. Tanpa
register, jawabannya ada di map fisik seseorang.

### Kenapa TIDAK memakai `contract_bonds`

Tabel itu polanya mirip persis — `issuer`, `amount`, `issued_date`,
`expiry_date`, `status`, bahkan CHECK tanggalnya. Godaan untuk memakainya
ulang besar.

Tapi isinya **jaminan bank**: CHECK-nya membatasi `bond_type` ke
penawaran/pelaksanaan/uang_muka/pemeliharaan. Asuransi berbeda pihaknya
(perusahaan asuransi, bukan bank), berbeda gunanya (menanggung kerugian,
bukan menjamin kewajiban), dan berbeda yang ditanyakan saat klaim.

Memaksa polis ke sana berarti melonggarkan CHECK jaminan — dan sesudah itu
tak ada lagi yang membedakan "jaminan pelaksanaan cair" dari "polis CAR
kadaluarsa" pada laporan mana pun.

### Yang membuatnya berguna: CELAH, bukan daftar

Daftar polis hanya menjawab "punya atau tidak". Yang menentukan saat klaim
adalah **apakah tanggal kejadiannya tertanggung** — pertanyaan tentang
periode, bukan tentang keberadaan dokumen.

Dibuktikan e2e pada data nyata:

```
polis   1 Mar 2026 .. 30 Jun 2026
proyek  1 Feb 2026 .. 31 Jul 2026
        → celah 59 hari (28 di awal, 31 di akhir)
```

Dokumen itu terlihat sah di lemari dan tak berguna di dua ujungnya.

**Celah dihitung DUA ARAH, terpisah.** Ini jebakan yang paling mudah luput:
polis yang telat 10 hari di depan tapi lebih 10 hari di belakang akan terbaca
"pas" kalau dihitung sebagai satu selisih — padahal 10 hari pertama proyek
benar-benar tak tertanggung. Mutasi yang menggabungkannya langsung merah.

### `proyek tanpa polis` dinyatakan — kebalikan risiko yang sama

Diukur: **14 proyek belum punya satu polis pun**. Tanpa menyebutkannya,
"nol polis kadaluarsa" terbaca sebagai "semuanya aman".

Ini bentuk lain dari pola `null` ≠ `0` yang berulang sepanjang sesi ini:
angka yang secara teknis benar tapi menyesatkan karena yang tak ada tidak
ikut dihitung.

### Mutasi: 8 perhitungan + 5 skema

Delapan mutasi perhitungan, delapan tertangkap. Yang kedelapan sempat
**LOLOS**: uji urutan saya memakai dua polis yang celahnya sama, sehingga ia
lulus lewat pemecah seri berikutnya — bukan lewat status. Diperkuat dengan
memberi polis AKTIF celah yang jauh lebih besar; kalau urutannya tak lagi
menimbang status, ia naik ke atas.

Lima mutasi skema, lima tertangkap (periode, keunikan, nilai negatif,
`jenis_lain`, RLS).

### "AKTIF 0" berwarna hijau — untuk keempat kalinya

Potret memperlihatkan kartu **"AKTIF 0"** dengan hijau besar. Nol polis aktif
adalah kabar BURUK; hijau membuatnya terbaca sebagai capaian.

Kejadian keempat dari kelas yang sama dalam dua hari:

| # | Angka | Salah bacanya |
|---|---|---|
| 1 | susut −6% | "lebih baik dari nol" |
| 2 | selisih −92 merah | "92 hilang" |
| 3 | vendor "Rp 0" | "paling murah" |
| 4 | aktif 0 hijau | "aman" |

Semuanya angka yang benar secara aritmetika, dan menyesatkan secara warna
atau tanda.

---

## 2026-08-06 (lanjutan 5) — Analisa keterlambatan: menyambung, bukan membangun

### PEMBEDA 7/12 selesai

Ketiga bahannya SUDAH ADA di basis dan tak pernah diadu satu sama lain:

```
milestones.target_date / completed_at   kapan seharusnya vs kapan nyata
contract_eot.days_approved              perpanjangan waktu yang DISETUJUI
projects.penalty_*                      tarif/hari + grace + cap + basis
```

Diukur: **16 milestone telat** (12 masih berjalan, 4 selesai-terlambat),
terparah **67 hari**. Tak satu pun layar menghubungkannya ke EOT atau rupiah.

Pola yang sama dengan tiga fitur sebelumnya: yang kurang bukan datanya,
melainkan satu layar yang mengadunya. `lib/penalty.ts` yang sudah ada sengaja
TIDAK ditulis ulang — ia menghitung denda *invoice* telat, urusan berbeda.

### Yang paling dijaga: EOT membebaskan

Melaporkan "telat 67 hari" pada proyek yang EOT-nya disetujui 60 hari adalah
menuduh atas keterlambatan yang **secara kontrak tak pernah terjadi** — dan
tuduhan itu bisa dibantah dengan satu lembar surat.

Delapan mutasi disuntikkan, **delapan tertangkap**, termasuk:

| Mutasi | Akibat kalau lolos |
|---|---|
| EOT diabaikan | menuduh yang sudah dimaafkan |
| telat efektif boleh negatif | "lebih cepat 20 hari", mengurangi total proyek lain |
| denda mati tetap dihitung | "paparan Rp0" terbaca "tak ada risiko" |
| berjalan diukur dari target | keterlambatan berhenti tumbuh, padahal masih jalan |
| terparah pakai telat kotor | angka utama mengabaikan EOT |

Hanya EOT ber-status `disetujui` yang mengurangi. Yang masih `diajukan` belum
mengubah kewajiban apa pun — memakainya membuat proyek tampak bebas hanya
karena suratnya sudah dikirim.

### `null` ≠ `0` — untuk ketiga kalinya di sesi ini

Delapan proyek punya milestone telat tapi **dendanya tak aktif**. Paparannya
`null` ("tak bisa dihitung"), bukan `0` ("sudah dihitung, hasilnya nol").
Kalau ditulis 0, layarnya bilang "tak ada risiko" padahal yang benar
"tarifnya belum diisi" — dan itu dinyatakan sebagai banner, bukan disembunyikan.

### Revisi sesudah melihat potretnya

Versi pertama menampilkan **39 baris, 2.970px**. Dua puluh tiga di antaranya
"Tepat waktu"/"Belum jatuh tempo" — tak butuh tindakan apa pun, tapi berbagi
ruang dengan yang telat 67 hari. Kolom "Estimasi paparan" berbunyi "denda
belum aktif" **39 kali**, mengulang kalimat yang sudah ada di banner.

Diperbaiki: bawaan jadi **"Perlu tindakan"**, dan kolom paparan hilang
sendiri kalau tak satu pun bisa dihitung.

```
39 baris → 16 baris
2.970px → 1.613px   (−46%)
8 kolom → 7 kolom
```

Yang beres tetap bisa dilihat lewat saringan — hanya tak lagi jadi bawaan.

---

## 2026-08-06 (lanjutan 4) — Saya salah: besi TURUN, bukan naik

### Koreksi terhadap klaim saya sendiri, sebelum kodenya ditulis

Di commit RFQ dan di beberapa laporan sesi ini saya menulis:

> "Besi Beton Ø12mm SNI — 3 supplier, Rp100.000..Rp120.000, **+20%**"

Sebagai **rentang antar-vendor** itu benar, dan RFQ memang menjawabnya. Tapi
saya lalu memakai angka yang sama untuk mengusulkan **eskalasi harga**, seolah
harganya naik 20% dari Maret ke Agustus. **Itu salah arah.**

Diukur ulang, kali ini URUT WAKTU:

```
Besi Beton Ø12mm SNI
   17 Mar 2026   120.000   jangkar   Toko Bangunan Maju
   10 Mei 2026   120.000   jangkar   UD Besi Kuat Mandiri
   04 Agu 2026   100.000   −16,7%    CV Sinar Abadi Beton
```

Harganya **TURUN 16,7%**, bukan naik 20%. Yang saya lakukan adalah
`max − min` tanpa memperhatikan urutan — dan `min..max` memang "20%", tapi
arahnya kebalikan dari yang saya klaim.

Kalau ini tak ketahuan, saya akan membangun layar "Eskalasi Harga" yang
memajang kenaikan yang tak pernah terjadi, di atas data yang membuktikan
sebaliknya.

### Dua temuan lain yang mengubah rancangan

**`materials.unit_price` bukan harga acuan kontrak — ia harga TERKINI.**
Besi Ø12mm: acuan 120.000, tertinggi dibeli 120.000 → "0% naik", padahal
riwayatnya jelas berubah. Master price sudah ditimpa ke harga baru, jadi
kenaikannya hilang. Membandingkan PO terhadap kolom itu akan **selalu**
melaporkan 0% — layar yang selamanya bilang "aman".

**Beda harga bisa berarti beda VENDOR, bukan eskalasi.** `Pasir Pasang`
punya dua harga (185.000 dan 195.000) di **tanggal yang sama** dari dua
supplier. Menghitungnya sebagai kenaikan 5,4% adalah salah baca: itu rentang
antar-vendor — urusan RFQ, bukan eskalasi.

### Akibatnya untuk rencana kerja

Eskalasi harga TIDAK bisa dibangun sebagai "PO vs harga acuan": acuannya
sudah tercemar, dan sebagian selisihnya bukan eskalasi. Yang bisa dipercaya
hanya **riwayat PO urut waktu, dipisahkan per vendor** — dan pada data hari
ini hanya **2 material** yang punya lebih dari satu tanggal beli.

### Keputusan: dibangun sebagai **Riwayat Harga Material**, bukan "Eskalasi"

Founder memilih membangunnya netral-arah daripada menundanya. Layar bernama
"Eskalasi" menjanjikan kenaikan, dan pembacanya akan menyimpulkan kenaikan
bahkan saat angkanya turun — jadi nama menunya ikut diganti (migrasi 197).

Selesai: `lib/riwayat-harga.ts` + 15 test, endpoint read-only, halaman
`/procurement/riwayat-harga`. TANPA tabel baru — seluruh datanya sudah ada di
`purchase_order_items` + `purchase_orders`, dan menyalinnya ke tabel riwayat
tersendiri menciptakan sumber kebenaran kedua yang bisa berselisih dengan
PO-nya.

Dibuktikan e2e pada data nyata:

```
naik=0  turun=2  satu-titik=5  beda-vendor=1

Besi Beton Ø12mm SNI   120.000 → 100.000   −16,7%   3 titik   tren=true
Besi Beton Ø10mm SNI    85.000 →  80.000    −5,9%   3 titik   tren=true
Pasir Pasang           (1 titik, 2 vendor — sebaran, BUKAN kenaikan)
```

Tujuh mutasi disuntikkan, enam tertangkap. Yang terpenting: **membalik urutan
tanggal** — persis kesalahan yang saya buat sendiri — langsung merah.

Satu mutasi (membuang `titik.length >= 2` dari `perubahan_pct`) **mutan
setara**: dengan satu titik `awal === akhir`, jadi rumusnya menghasilkan tepat
0 dengan atau tanpa syarat itu. Dibuktikan untuk harga 0, 1, dan 999.000. Tak
ada test yang bisa menangkapnya, dan ketiadaan testnya bukan lubang — yang
menjaga pembacanya adalah `jumlah_satu_titik` dan `cukup_untuk_tren`, keduanya
tertangkap saat dimutasi.

Uji pertama saya untuk kasus itu juga LOLOS mutasi: ia menegaskan
`perubahan_pct === 0`, yang benar tapi tak membedakan apa pun. Diperkuat jadi
menegaskan pencacahnya.

### Ambang tren: TIGA titik, bukan dua

Dua titik bisa berarti satu pembelian borongan yang kebetulan murah. Layar
menyatakan "baru 2 titik" alih-alih memajang persentase yang terlihat pasti —
pembaca berhak tahu seberapa jauh angkanya bisa dipercaya.

---

## 2026-08-06 (lanjutan 3) — RFQ, dan penjaga CI yang menggantung tanpa suara

### RFQ + perbandingan penawaran selesai (PEMBEDA 4/12)

Diukur lebih dulu pada data nyata — material yang SAMA dibeli dari beberapa
supplier dengan harga berbeda, tanpa satu pun jejak alasannya:

```
Besi Beton Ø12mm SNI   3 supplier   Rp100.000 .. Rp120.000   (+20%)
Pasir Pasang           2 supplier   Rp185.000 .. Rp195.000
Besi Beton Ø10mm SNI   3 supplier   Rp 80.000 .. Rp 85.000
```

5 dari 7 PO lahir langsung dari MR. Saat auditor bertanya "kenapa vendor
ini", yang tersedia hanya ingatan orang.

`bids` yang sudah ada ternyata **sisi JUAL** (`owner_name`, `bid_value` — kita
menawar KE owner), jadi tak ada yang bisa dipakai ulang.

Selesai: migrasi 195 (`rfq` + `rfq_penawaran`, RLS dua-duanya), pustaka murni
`tabulasi-penawaran.ts` + 14 test, endpoint, halaman `/procurement/rfq`,
uji invarian 19 hijau. Enam mutasi perhitungan + empat mutasi skema,
seluruhnya tertangkap.

Yang paling penting dari keenam mutasi itu: **membuang `angka()`** membuat
harga dibandingkan sebagai TEKS, dan `"100000" < "99000"` — vendor termahal
menang sebagai "termurah", dengan tabel yang tetap terlihat masuk akal.

### Penjaga CI yang menggantung — bukan lambat, TIDAK PERNAH SELESAI

`gen-tenant-map` mulai menggantung. Saya sempat menduga kontensi (lima proses
menumpuk), lalu BOM di `.env`, lalu perulangan tak berujung di klasifikasi.
**Ketiganya salah.** Diukur satu per satu:

```
kueri tables                      66 ms
kueri kolom company_id           202 ms
FK 3-join information_schema   6.505 ms
FK 4-join (yang dipakai)       TAK PERNAH SELESAI — lewat statement_timeout 90 s
```

Empat view `information_schema` digabung; tiap view itu sendiri kueri berat di
atas katalog. Diganti `pg_catalog`: **50 ms — 130× lebih cepat.**

Hasil keduanya DIBUKTIKAN IDENTIK sebelum ditukar (415 baris sama persis, nol
beda `nullable`). Penjaga yang dipercepat tapi hasilnya berubah lebih buruk
daripada penjaga yang lambat.

Ia sempat berhasil beberapa kali di awal sesi lalu berhenti sama sekali —
degradasi bertahap, bukan kegagalan yang jelas. Di CI ia akan mati kena
timeout job dan terlihat seperti masalah jaringan.

### `ORDER BY` yang bukan kosmetik

Empat tabel (`expense_items`, `journal_entry_lines`, `punch_item_photos`,
`submittal_documents`) berpindah kolom `lewat` bolak-balik DUA KALI hari ini
tanpa satu pun perubahan skema — keduanya punya dua jalur FK sama-sama sah,
dan Postgres bebas mengembalikannya dalam urutan berbeda.

Nol kode memakainya, jadi tak ada perilaku yang rusak. Tapi `gen-tenant-map
check` akan merah di CI tanpa sebab yang bisa dijelaskan siapa pun — dan
**penjaga yang merah tanpa sebab adalah penjaga yang akan dimatikan orang.**
Ditambah `ORDER BY`; dibuktikan stabil lewat 4 kali jalan berturut-turut,
byte-identik.

### Sorotan sidebar bocor ke rute berawalan sama

Membuka `/procurement/rfq` menyalakan grup **"Master Data"**. Sebabnya
`isActive` memakai `pathname.startsWith(href)` mentah, dan ada **12 menu
ber-href `/procurement`** tersebar di lima grup berbeda.

Cacat kelas yang sama sudah diperbaiki di `middleware.ts` (`cocokRute`,
`/proyek` vs `/proyeksi-kas`). Diterapkan gagasan yang sama di sidebar;
203 test web tetap hijau.

### "Rp 0" sebagai judul kartu vendor

Potret memperlihatkan vendor yang TIDAK menawar apa pun dipajang **"Rp 0"**
besar-besar, dengan peringatan kecil di bawahnya. Mata membaca angka besar
lebih dulu, dan nol terbaca sebagai PALING MURAH — persis salah-baca yang
peringatannya berusaha cegah. Diganti kata: "Belum menawar".

Ini kejadian KETIGA dalam sesi ini dari kelas yang sama (susut negatif,
selisih negatif, dan kini nol) — angka yang secara teknis benar tapi terbaca
sebagai kabar baik.

---

## 2026-08-06 (lanjutan 2) — Free issue, dan rancangan yang dibatalkan uji sendiri

### Material milik klien selesai (PEMBEDA 3/12)

Pada kontrak konstruksi, owner sering memasok sendiri material tertentu
(keramik, sanitair, lift) dan kontraktor hanya memasangnya. Diukur lebih dulu:
**NOL penanda kepemilikan** di seluruh tabel material.

Tanpa jalur tersendiri, barang itu hanya bisa masuk lewat penerimaan
pembelian — dan di `/gudang/rekonsiliasi` ia merusak DUA angka sekaligus:

1. **penyebut susut** — 100 sak milik owner membuat susut 8 sak dari 100 sak
   MILIK KITA terbaca 4% dari 200, bukan 8% dari 100
2. **`lebih_beli` terhadap RAB** — perusahaan tampak memborong material yang
   tak pernah ia beli sesen pun

Dibuktikan e2e setelah perbaikan, pada 50 m² material owner:

```
dibeli 0 · dari_klien 50 · sisa 50 · lebih_beli 0 · selisih 0 · wajar
```

Tanpa pemisahan, baris itu berbunyi `dibeli 50 / lebih_beli 50`.

### Rancangan pertama SALAH — dan uji invariannya yang membuktikan

Saya menaruh penanda `milik_klien` di `goods_receipts`. Sebelum itu saya
menulis, dengan yakin, bahwa "GR tanpa PO sudah mungkin secara struktur" —
setelah membaca definisi FK-nya.

**Definisi FK tidak menyatakan nullability.** Saya menyimpulkan yang tak
tertulis. `po_id` dan `supplier_id` keduanya **NOT NULL**, dan uji invarian
langsung merah pada percobaan pertama.

Melanjutkan jalur itu berarti `DROP NOT NULL` pada tabel berisi data
finansial hidup — **Gerbang Keras G-2** — dan `supplier-invoices` sudah
membandingkan `gr.supplier_id !== body.supplier_id`, jadi null di sana
merambat tanpa ada yang menyadarinya.

Rancangannya diganti jadi **tabel tersendiri** (`penerimaan_material_klien`)
sebelum satu baris pun ditulis. Kolom yang terlanjur saya tambahkan dihapus
setelah diverifikasi **nol baris memakainya**; `goods_receipts` kembali utuh
8 baris.

Tabel tersendiri juga lebih jujur: penerimaan material owner memang BUKAN
penerimaan pembelian — tak punya PO, tak punya supplier, tak pernah dibayar.

**Uji itu membayar ongkosnya sendiri di menit pertama.** Ia dipasang untuk
menjaga constraint, dan yang ia tangkap justru rancangannya.

Tripwire-nya kini permanen di CI: `po_id` dan `supplier_id` harus tetap
NOT NULL, supaya tak ada yang diam-diam menempuh jalur lama itu lagi.

### Persentase susut negatif berhenti ditampilkan

Potret memperlihatkan baris ber-`susut −6,0%`. Angka itu terbaca sebagai susut
yang LEBIH BAIK daripada nol — kabar baik palsu, persis yang komentar di
pustaka saya sendiri peringatkan. Yang sebenarnya terjadi: terpakai + sisa
melebihi barang yang masuk, yaitu pencatatan yang belum lengkap. Kolom
Selisih di sebelahnya sudah menyebutkannya; persentasenya kini "—".

### Tak ada kolom harga di layar material klien

Disengaja. Material owner tak pernah kita bayar; menyediakan kolom harganya
mengundang seseorang mengisinya, dan angka itu akan mengalir ke laporan biaya
sebagai pengeluaran yang tak pernah terjadi.

---

## 2026-08-06 (lanjutan) — Transfer stok, dan cacat yang saya buat sendiri kemarin

### Transfer stok antar proyek selesai (PEMBEDA 2/12)

`stock_movements` punya SATU `project_id`. Material yang pindah dari proyek A
ke B hanya bisa dicatat sebagai dua baris yang tak saling mengenal — tak ada
yang menjamin sisi lawannya ada, apalagi sama besar.

Selesai: migrasi 193 (`stock_transfers`, RLS RESTRICTIVE dua sisi), endpoint
POST/GET, halaman `/gudang/transfer`, uji invarian 11 hijau.

`transfer_in`/`transfer_out` ternyata **sudah ada** di CHECK `movement_type`
sejak awal — nol baris, tak pernah dipakai. Kosakatanya sudah ada; yang belum
ada kepalanya.

### Cacat yang saya BUAT SENDIRI kemarin, dan baru terlihat hari ini

Rekonsiliasi material (commit `3d5a38b`) menghitung susut dari
`dibeli − dipakai − sisa`. Transfer tak masuk hitungan, jadi material yang
PINDAH terbaca sebagai **hilang**.

Dibuktikan dengan angka, bukan dikira-kira — memindahkan 10 batang besi:

```
sebelum transfer : selisih  0  susut 0,0%  wajar
sesudah transfer : selisih 10  susut 5,0%  ← satu batang lagi = "Susut tinggi"
sesudah diperbaiki: selisih 0  susut 0,0%  pindah 10 "ke proyek lain"
```

Ini kesalahan paling mahal yang bisa dibuat layar itu: **menuduh mandor atas
barang yang ia kirim ke proyek sebelah atas perintah kantor.** Fiturnya sudah
"selesai" kemarin, ber-test, ber-mutasi, nol pelanggaran a11y — dan tetap
salah, karena yang belum ada bukan kodenya melainkan konsep "material bisa
pindah".

Perbaikannya di lapis perhitungan (`selisih` ikut mengurangi
`transfer_keluar`), + 6 test, + 4 mutasi seluruhnya tertangkap — termasuk
mutasi `Math.abs` pada transfer, yang akan membuat proyek bocor bisa
menyembunyikan susutnya cukup dengan MEMINTA kiriman dari proyek sebelah.

Kolom **Pindah** ditulis terpisah di tabel, bukan diam-diam dikurangkan:
pembaca yang menjumlah sendiri harus mendapat angka yang sama.

### Tracking Waste DITUNDA — diukur dulu, bukan dibangun dulu

Rencananya melengkapi rekonsiliasi dengan "rencana susut vs susut nyata".
Diukur lebih dulu:

```
assemblies                            3.043 baris
  waste_factor > 0                        1 baris   ← 1 dari 3.043
tabel ber-assembly_id DAN material_id  (tak ada)    ← tak ada jalur
```

Layar "rencana vs nyata" di atas kolom yang kosong pada 3.042 dari 3.043 baris
akan tampak berwibawa dan tak mengatakan apa-apa. Alasan + pemicunya dicatat
di `F5-1-TRIASE-SUBMENU.md`.

### Tiga penjaga menangkap saya hari ini

| Penjaga | Yang ditangkap |
|---|---|
| `gen-tenant-map check` | tabel baru lahir tanpa kategori tenancy |
| ratchet T4f | 9 akses `supabase` mentah baru (366 → 375) |
| `lint:ratchet` | `setState` sinkron di badan efek |

Ratchet T4f saya perbaiki dengan **memindahkan penulisan ke wrapper
sadar-tenant**, bukan menaikkan ambang — dan satu query yang memang tak bisa
(`viaProject` menyaring satu kolom, daftar transfer butuh dua) memakai
`unsafe()` dengan alasan tertulis di tempat kejadian.

### Saya salah — dan penjaganya yang benar

Saya sempat menulis `requirePermission('procurement:stock:manage')`. Permission
itu **tidak ada**. Gerbang gagal-tertutup akan menolak SEMUA orang, dan
endpoint yang sudah jadi tak bisa dipakai siapa pun tanpa satu pun pesan.
Ketahuan karena saya periksa ke tabel `permissions` sebelum lanjut, bukan
karena ada yang gagal.

Saya juga sempat memakai `s.material_id` untuk hasil `/procurement/stocks` —
endpoint itu tak mengembalikan kolom tersebut. Daftar material akan tetap
tampil, tapi tak satu pun bisa dipilih.

Keduanya jenis yang sama: **menebak bentuk sesuatu yang bisa dibaca.**

### Peta tenancy: tiga tabel berpindah `lewat` tanpa saya sentuh

`expense_items`, `journal_entry_lines`, `punch_item_photos` berganti kolom
`lewat` saat di-regenerate. Diperiksa: ketiganya punya DUA jalur FK yang
sama-sama NOT NULL, jadi generator memang punya dua pilihan sah tanpa pemecah
seri yang stabil. Nol kode memakai `viaProject` pada ketiganya, jadi tak ada
perilaku yang berubah. Dicatat di sini supaya diff-nya tak dikira kelalaian.

---

## 2026-08-06 — Halaman jadi yang tak bisa dibuka siapa pun, dan "Wajar" sebagai jawaban bawaan

### Rekonsiliasi material selesai (F5 PEMBEDA — pembeda terlemah, 1,5/5)

`PETA-PRIORITAS-ERP.md` menyebutnya "titik kebocoran terbesar kontraktor".
Keempat angkanya sudah tersimpan di basis bertahun-tahun dan **tak pernah
sekali pun diadu**: kebutuhan RAB, penerimaan barang, pemakaian lapangan,
sisa gudang.

Selesai: fungsi murni + 22 test, endpoint read-only bergerbang tenancy,
halaman `/gudang/rekonsiliasi`. Suite penuh **159 berkas, 1619 lulus, 2
dilewati**; a11y **41 halaman, nol pelanggaran, kedua mode**; 11 penjaga
hijau.

### Cacat kelas baru: halaman selesai yang diarahkan diam-diam ke home

Halaman rekonsiliasi selesai — endpoint jalan, tenancy terjaga, typecheck
hijau, menu terarah. Dibuka di browser: yang muncul `/dashboard`.

`middleware.ts` menyaring per-prefiks lewat daftar tulis-tangan, dan
`/gudang` tak pernah ditambahkan. **Tak ada 404, tak ada pesan, tak ada
log.** Membuat halaman baru menuntut menyentuh dua berkas berjauhan, dan
yang kedua tak punya satu pun sinyal kalau terlewat.

Diukur: 24 direktori rute, 23 sudah terdaftar — hanya `/gudang` yang
tertinggal. Bukan kelalaian besar, tapi **tak ada apa pun yang mencegahnya**.
Penjaga baru `uji-izin-rute-lengkap.mjs` (3 mutasi disuntik, 3 tertangkap)
menukar "harus ingat" dengan "tak bisa lupa".

### "Wajar" sebagai nilai bawaan — arah gagal yang salah

Pada data sungguhan: Batu Split direncanakan 200 m3, tak pernah dibeli
sebutir pun, dan laporan menyebutnya **"Wajar"**. Begitu pula material yang
nol di keempat sumber.

Sebabnya `wajar` adalah nilai awal yang dipakai kalau tak ada satu cabang pun
cocok. Pada laporan yang gunanya **memunculkan masalah**, gagal ke arah
"beres" berarti setiap keadaan yang tak dikenali kode tampil sebagai
sudah-diperiksa. Ditambah status `belum_dibeli` (label UI "Belum ada
transaksi" — sebab ia menampung dua keadaan, dan label yang menyebut RAB
akan berbohong untuk separuhnya).

### Kartu ringkasan yang menjumlahkan satuan tak sebanding

Versi pertama memajang "Total dibeli 437" — hasil menjumlahkan m3, batang,
sak, dan buah jadi satu angka. Angkanya berubah kalau semen dijual per ton,
tanpa ada yang berubah di lapangan. Diganti jadi **cacahan material per
keadaan**; kuantitas tetap ada di tabel, di samping satuannya.

Selisih negatif juga berhenti diwarnai merah: "-92" merah terbaca sebagai
"92 hilang", persis salah-baca yang kolom status berusaha cegah.

### Saya salah — dua kali

**Satu.** Saya jalankan audit a11y "mode gelap" lewat `colorScheme: 'dark'`
Playwright dan melaporkan nol pelanggaran. Aplikasi ini memakai kelas
`.dark` (next-themes), **bukan** `prefers-color-scheme` — jadi yang dipindai
adalah halaman terang. Ketahuan hanya karena potret "gelap"-nya identik
dengan yang terang. Penjaga resmi `audit-a11y-runtime.mjs` sejak awal sudah
benar (ia menyetel `localStorage.theme`); yang cacat skrip sekali-pakai saya.
**Angka dari alat yang saya rakit sendiri di tempat bukan bukti** — itulah
gunanya penjaga yang sudah ada.

**Dua.** Uji urutan `belum_dibeli` saya tulis dengan pembanding
`susut_tinggi`. Mutasi "naikkan `belum_dibeli` ke peringkat 0" **lolos** —
keduanya jadi seri, dan pemecah seri kebetulan mempertahankan urutan yang
sama. Testnya menegaskan hal yang benar tapi tak bisa membedakan dua
peringkat. Diganti pembanding `lebih_beli`; mutasi langsung tertangkap.

Dua mutasi lain yang lolos **diperiksa, bukan ditambal**: keduanya mutan
setara (membuangnya tak mengubah keluaran apa pun), dan alasannya ditulis di
kode supaya tak diperdebatkan ulang.

---

## 2026-08-04 — INTI #2–#4, dan CI yang membuat saya hampir salah diagnosis

### Tiga INTI selesai

| # | Isi | Celah yang ditutup |
|---|---|---|
| **#2** IPC | gerbang progres termin | `trigger_pct` tersimpan bertahun **tanpa pernah dibaca** — termin syarat 40% bisa ditagih di progres 0% |
| **#3** Retensi | potongan jaminan mandor | retensi rapi di sisi klien, **nol** di sisi mandor: `net_payment = gross_payment` |
| **#4** Klaim | biaya tambahan tanpa ubah lingkup | pilar ketiga rantai kontrak; memaksakannya ke `change_orders` membuat `baseline_contract_value` berbohong |

Semuanya: fungsi murni + endpoint + mutation test. **13 mutasi disuntikkan
seluruhnya, 13 tertangkap.**

### Yang paling berharga bukan fiturnya

**Alat mutasi saya berbohong, dan saya hampir mempercayainya.**

Mutasi pertama di INTI #3 "lolos". Kesimpulan cepatnya: test-nya lemah. Yang
benar: **mutasinya tak pernah tersuntik** — berkasnya CRLF, string pencarian
saya LF. Diulang dengan regex sadar-CRLF: langsung merah.

> Mutation test yang tak memverifikasi suntikannya sendiri adalah teater.

Sejak itu tiap suntikan saya cetak `tersuntik: true/false` lebih dulu.

### CI: empat PR terbuka, semuanya merah, dan penyebabnya bukan kodenya

Hampir saja saya mendiagnosis empat PR satu per satu. Yang menyelamatkan: F5-1
ikut merah — padahal ia **hijau dua jam sebelumnya dengan commit yang sama
persis**.

| Waktu | Branch | Hasil |
|---|---|---|
| 11:00 | `f5-1` | **HIJAU** (sendirian) |
| 12:03 | `f5-1` lagi | **MERAH** ← commit identik |

Test yang merah pun bukan milik saya: `role-guard`, `ppn-dpp-guardrail`,
`modules` — semuanya jauh lebih tua dari PR-PR ini.

**Akarnya: sebuah klaim yang tak akurat di komentar kode.**

Header `rls-harness.ts` berbunyi *"read-safe, tidak pernah mengubah data
public"*. Benar untuk `asUser()` (selalu ROLLBACK). **Salah sebagai
kesimpulan**: `createRlsClient()` mengembalikan client mentah, dan **42 berkas
test menulis lewatnya di luar transaksi**.

Klaim itu bukan sekadar salah tulis — **ia dipakai sebagai dasar** mengubah
`concurrency.group` CI jadi per-ref. Empat PR sekaligus = 24 job menulis ke
`public` yang sama.

Diperbaiki dua-duanya: serialisasi dikembalikan (PR #141), dan header yang
menyesatkan itu ditulis ulang beserta riwayat biayanya.

### Utang R-009: yang diasumsikan mahal ternyata murah

Catatan Fase 0 menolak "Postgres lokal per shard" karena *"butuh shim
`auth.*`"* — diterima bertahun **tanpa pernah diukur**. Saya ukur:

```
auth.role()   60x — HANYA dibanding 'authenticated' & 'service_role'
auth.uid()    13x
auth.users    NOL query — hanya disebut di komentar
```

**Dua fungsi.** Shim ditulis, diuji terhadap Postgres nyata, dan **dua cacat
ketahuan justru karena diuji**:

1. `''::json` melempar galat — `NULLIF(...,'')` harus dulu.
2. `current_setting('role')` mengembalikan **`'none'`**, bukan NULL. Tanpa
   ditangani, `auth.role() = 'authenticated'` putus dan **seluruh policy
   menolak** — tabel terlihat kosong **tanpa satu pun galat**.

Yang kedua persis kelas cacat paling berbahaya di repo ini: gagal senyap.

**Tapi saya berhenti membangunnya.** Shim murah; **datanya** yang mahal — 32
berkas test bergantung pada user seed nyata. Menurut disiplin TUNDA yang
diratifikasi sendiri (R-010), ini belum punya pemicu. Pemicunya ditulis supaya
tak perlu ditebak lagi: **antrean CI melewati 30 menit, atau dua orang
mengerjakan repo bersamaan.**

Shim disimpan sebagai `auth-shim.sql` — saat pemicunya tiba, mulai dari yang
teruji, bukan dari nol.

### Penjaga yang menangkap saya sesi ini

| Penjaga | Yang ditangkap |
|---|---|
| gerbang tenancy | 3× — `work_scopes` & `contract_claims` kategori C di-query langsung, di endpoint yang **memutuskan uang** |
| `audit-kegagalan-senyap` | 2× — dan sekali ikut membongkar **cacat lama**: mandor melihat ringkasan pendapatan kosong karena query gagal menyamar jadi "nol scope" |
| `lint:ratchet` | 2× — `no-explicit-any`, diperbaiki dengan tipe eksplisit |
| `audit-docs-vs-roadmap` | 1× — dokumen triase baru tak tersambung ROADMAP |

Nol ambang dinaikkan untuk melewatinya. Satu-satunya kenaikan (R-011) diajukan
ke founder lebih dulu, disetujui, dan langsung **dikunci tripwire**.

---

## 2026-08-04 — F5-1: triase sub-menu, dan saya mengulangi kesalahan yang saya kutip

### Saya salah

Versi pertama dokumen triase menghitung **64 sub-menu merah**. Angka yang benar
**54**.

Skrip hitung saya memakai `baris.includes('🔴')` — mencari tanda merah **di mana
pun di baris**, termasuk kolom *Catatan*. Taksonomi sendiri memperingatkan ini
di badan dokumennya:

> *"Dihitung dari kolom Status, bukan dari semua tanda yang muncul di baris —
> banyak baris memuat tanda tambahan di kolom Catatan sebagai keterangan
> ('Foto ✅, geotag 🔴'), dan ikut menghitungnya menggelembungkan angka ±12%."*

**Saya menyalin peringatan itu ke dokumen saya, lalu melanggarnya di skrip yang
saya tulis tepat di bawahnya.** Selisihnya 19%, bukan 12%.

Yang tertangkap hanya karena saya menjumlahkan ulang: 9 + 12 + 26 = 47, tapi
64 − 12 − 3 − 2 = 47 sementara detektor melaporkan 63. Dua angka tak cocok, dan
memeriksa selisihnya membuka sembilan baris 🟡 yang salah dihitung.

Kenapa ini penting, bukan sekadar salah ketik: sembilan baris itu berstatus
**🟡 sebagian sudah hidup**. `Laporan keuangan` — item **paling penting** di
seluruh daftar — punya arus kas yang sudah jalan; hanya neraca & L/R yang
merah. Menghitungnya "belum dimulai" membuat bobotnya XL padahal L, dan itu
persis jenis kesalahan yang membuat urutan kerja salah.

### Yang dibangun

`docs/execution/F5-1-TRIASE-SUBMENU.md` — 54 sub-menu, tiap satu punya
golongan, alasan, prasyarat data, dan bobot.

| Golongan | Jml | Definisinya |
|---|---|---|
| **INTI** | 7 (+2 penyempurnaan 🟡) | Calon pelanggan **pergi** kalau demo berhenti di sini |
| **PEMBEDA** | 11 (+1 penyempurnaan 🟡) | Menaikkan salah satu Lima Pembeda ERP kontraktor |
| **TUNDA** | 25 | Berguna, tapi **tak ada yang menunggunya**; tiap satu punya pemicu tertulis |
| **JANGAN DIBANGUN** | 11 | Keputusan 2026-08-01, tak dibuka ulang |

**54 — nol hilang, nol ganda.**

### Kenapa dokumen ini tetap perlu padahal triase 2026-08-01 sudah ada

Keduanya menjawab pertanyaan **berbeda**:

| Dokumen | Menjawab |
|---|---|
| Taksonomi §KEPUTUSAN (2026-08-01) | *Apakah ini layak dibangun sama sekali?* |
| F5-1 | *Dari yang layak, mana yang harus habis **lebih dulu**?* |

Risiko C-7 bukan salah memilih fitur. Ia adalah **mengerjakan fitur yang benar
dalam urutan yang salah sampai kehabisan tenaga sebelum produknya bisa dijual**.

### Penjaganya, dan bukti ia bisa merah

`apps/api/scripts/audit-triase-submenu.mjs` — tiap sub-menu 🔴 di taksonomi
wajib muncul **tepat satu kali** di salah satu golongan.

| Mutasi | Hasil |
|---|---|
| Satu item dihapus dari TUNDA | ❌ exit 1 — "Nota kredit BELUM ditriase" |
| Satu item ditaruh di dua golongan | ❌ exit 1 — "PEMBEDA + TUNDA, urutannya ambigu" |
| Dipulihkan | ✅ exit 0 |

Penjaganya memeriksa **sel Status**, dan header skripnya memuat peringatan
tentang kesalahan `includes()` di atas — supaya orang berikutnya (termasuk saya)
tak mengulanginya.

### Tiga status taksonomi ternyata basi — dikoreksi, bukan didiamkan

Kenyataan menang atas dokumen (CLAUDE.md §0):

| Item | Sebelum | Sesudah | Bukti |
|---|---|---|---|
| Backup & restore | 🔴 | ✅ | RTO terukur **61 detik**, 124/124 tabel, 377/377 policy |
| Mode offline | 🔴 | 🟡 | F4-3 — antrean 6 jalur, mutation-test 6/6 |
| Multi-tenant | 🔴 | 🟡 | 45/123 tabel ber-`company_id`, RLS 123/123, 5 kebocoran ditutup |

### Saya salah untuk kedua kalinya di sesi yang sama

Setelah triase selesai saya melaporkan tiga hal "menunggu founder". Founder
bertanya *"apa yang harus saya lakukan sebelum lanjut?"* — dan memeriksanya
membuktikan **dua dari tiga itu tidak menunggu apa-apa**.

**INTI #1 saya nyatakan terblokir R-001. Salah.** `RATIFIKASI.md` mencatat
R-001 **SELESAI** — 047 dipensiunkan jadi no-op, penegas bentuk `175`
terpasang dan terbukti bekerja di lingkungan bersih. Saya menulis "terblokir"
dari ingatan tentang cacat itu, tanpa membuka status penyelesaiannya.

Diukur, bukan dibaca:

| Yang diperiksa | Hasil |
|---|---|
| `accounts` · `journal_entries` · `journal_entry_lines` | **ketiganya punya `company_id`** — bentuk 167 yang menang, bukan 047 |
| `apps/api/src/routes/v1/gl.ts` | **7 endpoint hidup** — bagan akun · jurnal · posting · void · buku besar · neraca saldo |
| `app/(dashboard)/akuntansi/page.tsx` | halaman hidup: Bagan Akun · Jurnal · **Neraca Saldo** dengan pemeriksaan seimbang |

Yang benar-benar belum ada hanya **neraca** dan **laba/rugi** — dua laporan
turunan di atas fondasi yang sudah sehat dan sudah dipakai. Bobot INTI #1 turun
**L → M**, dan **tak ada satu pun INTI yang terblokir**.

Kesalahan ini lebih mahal daripada salah hitung 64-vs-54 di atas: yang itu
menggeser bobot satu item, yang ini membuat item **paling penting** tampak tak
bisa disentuh sama sekali — dan founder hampir mengejar tiket yang tak perlu.

**Butir ketiga juga meleset**: saya menulis "judul QUEUE menyebut 93,
kenyataannya 64" — padahal 64 itu sendiri angka yang salah. Yang benar 54.

### Yang menunggu founder — hanya satu

**Definisi INTI/PEMBEDA/TUNDA belum diratifikasi.** CHARTER menyebut ketiganya
tanpa mendefinisikan; §1 dokumen triase adalah usulan saya. Kalau ditolak, isi
ketiga daftar berubah.

R-006 (`pg_dump` rusak oleh fungsi yatim) tetap butuh tiket Supabase, tapi ia
**tidak memblokir apa pun** — cadangan darurat berbasis `COPY` sudah jalan
harian dan latihan pemulihannya hijau dengan RTO 61 detik.

---

## 2026-08-04 — F4-3: jalur lapangan berhenti kehilangan pekerjaan mandor

### Masalah yang sebenarnya

Enam jalur tulis di portal mandor memanggil `api.post` langsung. Bila sinyal
putus — **norma di lokasi proyek, bukan pengecualian** — mandor melihat pesan
galat dan pekerjaannya HILANG. Laporan upah 30 tukang diketik ulang dari nol.

Yang lebih merugikan lagi: ia mencoba berkali-kali, dan saat sinyal akhirnya
kembali, **kasbon terbayar dua kali**.

### Yang dibangun

| Berkas | Peran |
|---|---|
| `lib/antrean-offline.ts` | antrean localStorage + sinkron berurutan |
| `lib/kirim-lapangan.ts` | menerjemahkan 4 hasil → 2 keputusan halaman |
| `components/StatusAntrean.tsx` | pemicu sinkron + status yang terlihat mandor |

Terpasang di **enam** jalur: progress · kasbon · kasbon-tukang · laporan-upah ·
penagihan · tukang.

### Empat jaminan — semuanya dibuktikan bisa gagal

Mutation test: **6 mutasi disuntikkan, 6 tertangkap.**

| Mutasi | Tertangkap oleh |
|---|---|
| Idempotency-Key lahir baru tiap kirim | "kasbon terbayar dua kali" |
| `sinkronkan` abaikan kunci company | "data masuk perusahaan yang salah" |
| `penuh` dilaporkan aman | "isian mandor HILANG tanpa tersimpan" |
| `diantre` dilaporkan terkirim | "mandor mengirim ulang, jadinya DOBEL" |
| respons server dibuang | "foto tak bisa dilampirkan, id hilang" |
| `diantre` ikut membawa id | "foto dilampirkan ke id yang tak pernah dibuat" |

### Tiga kesalahan saya sendiri, dan yang menangkapnya

**1. Mock bocor ke tiga test berikutnya.** Saya mengganti `mockImplementation`
di tengah berkas untuk satu skenario. Tiga test sesudahnya gagal dengan
`Cannot read properties of undefined` — galat yang sama sekali tak
berhubungan dengan sebabnya. Diganti antrean status per-panggilan.

**2. `set-state-in-effect` 70 > ambang 69 — `lint:ratchet` menolak saya.**
`StatusAntrean` versi pertama memakai `useState` + `useEffect` untuk membaca
antrean. Penjaganya benar: pola itu merender dua kali tiap perubahan. Diganti
`useSyncExternalStore` — hook yang memang dirancang untuk sumber data di luar
React. **Ambangnya tidak saya naikkan.** Percobaan sinkron awal juga ditunda
satu tick, dan itu ternyata lebih benar perilakunya: render pertama tak perlu
tertahan menunggu jaringan yang mungkin memang mati.

**3. Saya hampir melewatkan halaman progress** — padahal ia disebut PERTAMA di
judul F4-3. Saya sudah menyambungkan lima halaman dan nyaris menutup item ini
saat memeriksa ulang kriteria dan menemukan kata "foto". `progress/page.tsx`
punya bentuk berbeda (upload storage lalu buat log), jadi ia tak muncul di
pencarian `api.post` yang saya pakai untuk menemukan jalur lain.

### Yang sengaja TIDAK dikerjakan — dinyatakan, bukan disembunyikan

**Foto tidak ikut diantre.** Halaman progress sudah punya jalur coba-ulang
sendiri untuk foto yang gagal, dan kegagalan foto memang tak membatalkan
laporan. Yang bocor selama ini adalah teks laporannya — itu yang ditutup.
Mengantrekan berkas butuh IndexedDB; batasnya ditulis di `BATAS_BYTE`.

**"Resolusi konflik" tidak diimplementasikan sebagai penggabungan versi.**
Kriteria F4-3 menyebutnya, tapi keenam jalur lapangan seluruhnya INSERT —
tak ada dua pihak yang menyunting baris yang sama. Yang benar-benar dibutuhkan
adalah pencegahan DUPLIKAT, dan itu tugas Idempotency-Key. Menulis mesin
resolusi konflik untuk konflik yang tak ada berarti menambah kerumitan yang
harus dirawat selamanya tanpa melindungi apa pun.

**`navigator.onLine` hanya untuk hiasan, tak pernah untuk memutuskan.**
Nilainya berbohong justru dalam keadaan yang paling lazim di lokasi
konstruksi: perangkat tersambung ke Wi-Fi proyek yang sendirinya tak punya
internet. Satu-satunya bukti sah bahwa jaringan hidup adalah percobaan kirim
yang berhasil.

### Bukti

```
Test Files  9 passed (9)
     Tests  88 passed (88)      ← 22 di antaranya F4-3
tsc --noEmit                    exit 0
lint:ratchet   ✅ 0 error, 528 warning (semua di bawah/sama dengan ambang)
hex-ratchet · catch-senyap · adr004 · modal-esc · medan-hantu · a11y ·
tata-letak · kontras-hex · sidebar   — semua hijau
build          ✓ Compiled successfully in 3.4s
```

---

## 2026-08-03 · Sesi 5 — FASE 0 SELESAI PENUH

### F0-8 — schema `mut6` dihapus (diratifikasi founder)

29 tabel salinan berisi 149 baris data uji, sisa sesi mutation testing.
`aktivitas terakhir: -Infinity` — tak pernah disentuh sejak dibuat.

Ketergantungan objek `public` ke `mut6` diperiksa **lebih dulu** (hasilnya 0),
baru `DROP SCHEMA CASCADE` dijalankan. Sesudahnya: `mut6` hilang, `public` tetap
122 tabel, dan **`schema_hash` TIDAK BERUBAH** (`7a4be5d7d87d9892`) — bukti
`public` tak tersentuh sama sekali, bukan sekadar klaim.

### 🎉 GERBANG FASE 0 HIJAU PENUH

Seluruh 18 item selesai: F0-1…F0-16, R-001, R-002. Nol yang menunggu.

| Ukuran | Hasil |
|---|---|
| CI | **11/11 check hijau**, 21,9 → **5,4 menit (4,1×)** |
| Suite | 131 berkas, 1313 lulus |
| Penjaga arsitektural | 16, dan **8 TERBUKTI bisa merah** |
| Branch protection | aktif & terbukti memblokir |
| Buku migrasi | selaras artefak fisik |
| Cacat P0 GL | diperbaiki & diverifikasi di CI sungguhan |

Yang paling berharga bukan angkanya, melainkan **empat cacat isolasi tenancy**
yang tersingkap saat sharding — semuanya kelas yang sama (test menulis ke schema
`public` bersama sambil berasumsi global), dan semuanya **nyata untuk
multi-tenant**, bukan sekadar penghalang CI. Satu di antaranya ada di **kode
produksi** (`utils/notifications.ts` tenant-blind).

Dan `fn_isi_company_id()` **tidak pernah dilonggarkan** — padahal itu jalan
pintas yang akan menghapus keempat gejala dalam satu baris.

**Fase 1 dibuka.** Delapan item, dan F1-8 (`companies.ts` coverage nol) adalah
gerbang yang founder tetapkan sebelum Fase 2 boleh dimulai.

---

## 2026-08-03 · Sesi 4 — CI dipercepat 2,7×, dan satu aturan ternyata tak dijaga

### Diukur dulu — dan hipotesis mandat gugur

Mandat menduga schema dibongkar-pasang per berkas, lalu menyarankan template
database. **Diukur, salah:** overhead hook **0,2s dari 125,6s (0%)**, `DROP
SCHEMA` 0,03s. Template DB akan menghemat ~6,5s dari 1203s.

Yang sebenarnya mahal: **~6.000 round-trip × 21ms**. Dan CI 10× lebih lambat
dari lokal karena **DB project CI di Tokyo, runner GitHub di US-East** — tiap
query menyeberangi Pasifik. Tak satu pun butir rencana mandat menyentuh ini.

Pelajaran yang layak diulang: optimasi tanpa pengukuran akan menghabiskan waktu
pada 0,5% masalah sambil merasa produktif.

### Temuan terpenting — ADR-004 tak dijaga sama sekali di sisi API

Langkah 5 mandat ("buktikan penjaga bisa merah") dimulai sebagai formalitas.
Menyisipkan `u.role === 'admin'` ke berkas route **lolos seluruh 14 penjaga**.

Penyebabnya: `apps/web/scripts/adr004-ratchet.mjs` memang ada, tapi hanya
mencakup **web**, dan header-nya menyatakan *"Sisi API sudah patuh
(requirePermission di mana-mana)"* — pengukuran membuktikan itu **tidak benar**:
**52 pelanggaran** di `apps/api/src`.

Aturan yang membuat SaaS multi-perusahaan mungkin, selama ini hanya konvensi.
Penjaga baru terpasang (ratchet, lantai 52), terbukti dua arah.

### F0-14 — sharding menyingkap cacat isolasi, lalu diperbaiki di tempat benar

Shard 4× memangkas 1317s → 434s, tapi shard 1 gagal: `projects.company_id`
NOT NULL dilanggar.

Akarnya **bukan** sharding dan **bukan** trigger. `fn_isi_company_id()` mengisi
otomatis hanya bila ada TEPAT SATU company, dan menolak menebak saat ambigu —
perilaku yang benar. Yang salah: belasan berkas test meng-INSERT ke tabel
ber-tenant tanpa menyebut `company_id`, mengandalkan fallback itu.

Berurutan, asumsinya kebetulan selalu benar. Paralel,
`search-tenant-isolation` meng-**commit** company kedua selama ~2 detik (ia
harus commit — memakai `app.inject` lewat koneksi terpisah), dan setiap INSERT
di shard lain dalam jendela itu ditolak.

Diperbaiki di test: **16 INSERT di 14 berkas** kini menyatakan `company_id`
eksplisit. **Trigger tidak disentuh sama sekali** — melemahkannya demi CI cepat
adalah G-5, tepat sebelum Fase 2.

**Satu berkas nyaris dirusak sapuan otomatis.** `tenant-isolation-nyata`
menghilangkan `company_id` sebagai **inti ujinya** (membuktikan trigger menolak
menebak). Sapuan ikut mengubahnya, test langsung merah, dipulihkan — dan diberi
peringatan eksplisit. Kalau lolos, ia akan hijau selamanya tanpa menguji apa pun.

Verifikasi: seluruh berkas terdampak **lulus saat ada dua company** — kondisi
persis yang menggagalkan shard 1.

### F0-16 — cacat tenancy NYATA di kode produksi

Yang paling berharga dari seluruh pekerjaan CI hari ini bukan kecepatannya,
melainkan **apa yang tersingkap saat mengejarnya**.

`utils/notifications.ts` meng-insert notifikasi **tanpa `company_id` sama
sekali** — nol kemunculan di seluruh berkas. Bekerja hari ini semata karena
fallback satu-tenant. Artinya pada hari perusahaan kedua lahir, **setiap
notifikasi ditolak** — dan kalau trigger dilonggarkan supaya "jalan", notifikasi
diam-diam masuk ke perusahaan yang salah.

Ditemukan lewat sharding, **bukan** lewat review dan bukan lewat test yang ada.

**Diperbaiki di tipe, bukan di trigger.** `company_id` jadi kolom **wajib** di
`NotificationParams` — sengaja bukan opsional-dengan-default. Satu user bisa
jadi anggota beberapa perusahaan (ADR-011 D5), jadi nilainya tak bisa diturunkan
dari penerima; ia harus datang dari **peristiwa** yang melahirkan notifikasi.
Default apa pun akan salah untuk sebagian kasus.

Hasilnya: TypeScript menemukan **38 error → 31 pemanggil** di 10 berkas route.
Dan ternyata konteksnya **sudah ada di tangan pemanggil selama ini** —
`request.companyId` diisi `authenticate()` tiap request, `resolveRecipients()`
bahkan sudah menerimanya. Hanya notifikasinya yang tak pernah diberi tahu.

Terverifikasi: notifikasi + kasbon + punch-list lulus **saat ada dua company**.

### Hasil akhir: 21,9 → 6,3 menit (3,5×), 11/11 hijau — TARGET TERCAPAI

Jalannya tidak lurus, dan itu bagian pentingnya. Tiga kali CI merah, tiga kali
akarnya **cacat isolasi nyata** — bukan cacat sharding:

| Kali | Gejala | Akar |
|---|---|---|
| 1 | `projects.company_id` NOT NULL | 16 INSERT di test tak menyatakan `company_id` (F0-14) |
| 2 | `notifications.company_id` NOT NULL | **kode aplikasi** `utils/notifications.ts` tenant-blind (F0-16) |
| 3 | "ada akar grup tanpa pemilik" | `iso-test-b` di-commit tanpa `owner_user_id` |

Polanya sama ketiga kalinya: **test menulis ke schema `public` bersama sambil
membuat asumsi global tentang isinya.** Paralelisme tak menciptakan cacatnya —
ia hanya membuatnya terlihat. Itu latihan yang tepat menjelang Fase 2, karena
kebocoran antar-test adalah versi kecil dari kebocoran antar-tenant.

Dan sekali pun trigger `fn_isi_company_id()` **tidak disentuh**. Melonggarkannya
akan membuat ketiga gejala hilang dalam satu baris — sambil menukar cacat yang
terlihat dengan cacat yang senyap, tepat sebelum migrasi tenancy 80 tabel (G-5).

**6 shard dicoba dan gagal** — bukan karena keseimbangan melainkan karena
menyingkap F0-16. Jadi 4 shard adalah angka tertinggi yang **terbukti**, bukan
angka optimal. F0-15 menunggu F0-16.

---

## 2026-08-03 · Sesi 3 — repo dibuka, CI hidup, P0 terbukti nyata

Founder memutuskan repo dijadikan **publik**. Dua blokir yang sesi lalu saya
laporkan di luar jangkauan (B-1 Actions mati, B-2 branch protection tak tersedia)
**keduanya langsung teratasi**.

### Pemeriksaan keamanan sebelum membuka repo

Membuka repo tak bisa dibatalkan secara praktis, dan audit sebelumnya hanya
memindai berkas ter-track di HEAD — **belum pernah `git log -p`**. Jadi itu
dijalankan lebih dulu atas SELURUH histori: `.env` tak pernah ter-commit, nol
kunci `eyJ…`, nol `sb_secret_`, nol token GitHub/AWS/Slack/OpenAI, connection
string hanya placeholder.

Satu hal memang terbuka: ref project Supabase dev di 13 berkas. Itu **bukan
kredensial** — anon key tak pernah ter-commit dan RLS aktif 122/122, jadi yang
terekspos hanya *nama* infrastruktur, bukan aksesnya. Risiko rendah, dicatat.

### B-1 & B-2 — terbukti bekerja, bukan diasumsikan

- **Actions hidup.** Sebelum: 2–12 detik, `steps: []`, `runner_name: ""`, log 22 byte.
  Sesudah: ~2,5 menit, runner ditugaskan, **32 langkah** dieksekusi.
  **4 dari 5 job HIJAU.**
- **Branch protection aktif**: 5 check wajib, `strict: true`, force-push & deletion
  ditutup. Buktinya bekerja: PR #133 (CI merah) berubah `MERGEABLE` → **`BLOCKED`**.

### R-001 — cacat P0 TERBUKTI NYATA di lingkungan sesungguhnya

Ini bagian terpenting sesi ini. Sesi lalu saya menyimpulkan cacatnya dari membaca
kode; hari ini **diukur langsung** di project CI:

```
accounts  ADA · 0 baris · company_id=TIDAK · ⚠️ penanda 047 (account_type)
buku migrasi: 047=TERCATAT · 167=tidak
VERDICT: C — GL TENANT-BLIND
```

Dan CI utama gagal dengan akar yang sama:
`HARD FAIL 167_gl_chart_of_accounts.sql — column "company_id" does not exist`.

Persis skenario yang saya perkirakan: **047 menang, 167 dilewati diam-diam.**
Prediksi dari pembacaan kode terkonfirmasi oleh pengukuran — dan andai repo tak
dibuka, ini tak akan pernah terlihat.

Fallback founder dijalankan: `setup-clean` (aman, ketiga tabel 0 baris). Hasilnya
**047 + 167 + 175 lulus seluruhnya** di replay bersih. Perbaikan R-001 bekerja di
lingkungan kosong, bukan hanya di dev.

### F0-13 SELESAI — CI HIJAU PENUH untuk pertama kalinya

163 test merah di CI, akarnya **satu** dan tak terlihat dari pesan mana pun:

```
"User belum terdaftar sebagai anggota perusahaan manapun"   (auth.ts:82)
```

`resolveCompanyId()` menolak SETIAP request dari user tanpa baris di
`company_members`, jadi seluruh endpoint ber-`preHandler` membalas 403 dan test
yang mengharapkan 200/201/400/422 gagal berjamaah. Gejalanya (`daftar admin
kosong`, `admin tidak menerima notifikasi`, puluhan `expected 403 to be 200`)
menyesatkan ke arah RBAC, padahal soalnya keanggotaan.

Kenapa barisnya tak ada: migrasi 126 mendaftarkan "semua user existing" ke tenant
pertama — tapi di CI yang di-wipe, migrasi jalan **sebelum** seed, jadi saat 126
berjalan belum ada user untuk didaftarkan.

**Ini kelas cacat yang sama persis dengan 047 dan 137** — ketiga kalinya dalam
rangkaian sesi ini. Semuanya: urutan seed-vs-migrasi, hanya muncul di lingkungan
yang dibangun dari nol, tak pernah terlihat di dev yang tumbuh bertahap.

Seed kini mendaftarkan seluruh user ber-`role_id` ke company akar (meniru persis
126) **dan memverifikasi hasilnya** — seed yang "berhasil" tapi nol baris adalah
kegagalan senyap yang paling lama didiagnosis.

**Hasil: run 30761368609 — KELIMA job CI HIJAU.**
Job API **130/130 berkas, 1301 lulus, 5 skipped, 0 gagal** (sebelumnya 1132/163).
Ratchet coverage lulus (31,76% vs lantai 31,98%, dalam toleransi 0,5%).

Ini juga yang akhirnya menutup **F0-3**: penjaga `docs-freshness` dan
`no-stale-docs-path` kini benar-benar menjaga, bukan sekadar terpasang.

### R-002 SELESAI — 12 migrasi dicatat, buku 160 → 172

Tiap baris dibuktikan kueri katalog yang ditulis & diperiksa **manusia**, satu per
satu, terhadap nama objek nyata di berkas migrasinya. Bukan regex — dan itu
memang perlu, karena seluruh 163–176 memakai DDL dinamis, penyebab verdict palsu
pada cacat C-3.

Prosesnya menangkap **dua kesalahan tebakan saya sendiri**: artefak 164 dan 174
sempat saya laporkan "tak ada" karena saya menebak nama objeknya salah. Kalau
saya percaya tebakan pertama, dua migrasi yang nyata sudah berjalan akan tercatat
sebagai belum — kebalikan dari cacat C-3, tapi sama-sama merusak buku.

**175 & 176 sengaja tidak dicatat**: 175 tak membuat objek apa pun (penegas
bentuk), 176 belum pernah dijalankan ke dev. Alatnya menolak menulis bila ada
satu saja baris tak terbukti.

### F0-4 SELESAI — tipe migrasi ke-4 (policy) akhirnya terjaga

Dua kriteria yang tersisa ditutup, satu dikerjakan dan satu **sengaja ditolak**.

**Rollback policy — dikerjakan.** `t5a-policy-rollback.test.ts` (6 test). Ini
tipe migrasi terakhir yang belum punya jaring: tiga lainnya (tambah kolom,
backfill, NOT NULL) sudah terjaga `multitenant-t3-rollback.test.ts`. Migrasi
131 menjanjikan di komentarnya *"Rollback granular & instan: DROP POLICY
tenant_isolation ON <tabel>"* — janji yang tak pernah diuji siapa pun, padahal
Fase 2 akan menambah policy tenant ke ~80 tabel. Janji rollback yang tak diuji
baru ketahuan salah pada saat ia paling dibutuhkan.

Yang dibuktikan: katalog kembali persis · policy PERMISSIVE existing **tidak**
ikut terhapus (inti komposisi ADR-011 §7) · tabel **hidup kembali**, bukan mati
total seperti peringatan T1-F3 di migrasi 131 · idempoten · bisa dipasang ulang.

**Dan test-nya sendiri di-mutation-test**: saat `DROP POLICY` sengaja dilewati,
test GAGAL (1 failed / 5 passed). Jadi ia benar-benar bisa gagal — bukan hijau
kosong. Disiplin itu datang dari repo ini sendiri (`tak-ada-test-nol.test.ts`).

**Isolasi schema per-berkas — DITOLAK, dan ini keputusan sadar.** Kriteria awal
menuntutnya, tapi setelah diukur arahnya keliru: `fileParallelism: false` membuat
berkas berjalan sequential, dan `test-db.ts` SUDAH memasang `lock_timeout 10s`
+ 3 retry + pesan diagnostik eksplisit. Diuji stres (5 berkas ber-`resetTestSchema`,
2 putaran): 45/45 lulus dua-duanya. Menambah schema unik per-berkas berarti 129
CREATE/DROP SCHEMA per run — memperlambat suite demi masalah yang mitigasinya
sudah terbukti bekerja. Dicatat supaya kalau flake muncul lagi, catatan ini yang
ditinjau lebih dulu, bukan diputuskan dari nol.

**Verifikasi:** suite penuh **130/130 berkas, 1305 lulus, 228,5s** — run hijau
**kelima berturut-turut**. Coverage tak bergerak. 7 penjaga + tsc exit 0.

### F0-12 SELESAI + F0-13 tersingkap

**F0-12 diperbaiki dan diverifikasi di CI sungguhan.** Penjaga 137 kini
membedakan "ada user tapi akar yatim" (cacat nyata → tetap melempar) dari
"belum ada user sama sekali" (sah → lanjut), dan migrasi **176** memasang trigger
yang mengisi kepemilikan begitu user aktif pertama lahir. Jaminannya ditegakkan
mesin, bukan harapan.

Perbaikannya sendiri sempat cacat, dan hanya ketahuan karena diuji: fungsi
SECURITY DEFINER-nya memakai `SET search_path = pg_catalog, public`, sehingga
trigger **diam-diam menulis ke `public`** alih-alih ke schema tempat migrasi
berjalan. Uji tiga langkah di schema sementara menangkapnya. Konvensi repo
(64 fungsi SECURITY DEFINER, **nol** memakai `SET search_path`) ternyata memang
sengaja demikian supaya migrasi portabel untuk test harness — diikuti.

**Hasilnya: replay dari nol BERHASIL untuk pertama kalinya.**
WIPE → 150+ migrasi → seluruh seed OK → `success`.

Dan `periksa-gl` sesudahnya membuktikan R-001 tuntas end-to-end:

| | Sebelum | Sesudah |
|---|---|---|
| `accounts` | `company_id=TIDAK`, penanda 047 | **`company_id=YA`, penanda 167, 38 akun** |
| Buku migrasi | 047=TERCATAT, **167=tidak** | **047 & 167 keduanya tercatat** |
| Verdict | **C — GL TENANT-BLIND** | **B — AMAN** |

**F0-13 (P1 baru) tersingkap justru karena replay berhasil.** CI utama: 4 dari 5
job **hijau**; job API gagal dengan **1132 lulus / 163 gagal** — padahal lokal
**1299 lulus / 0 gagal**.

Selisihnya **lingkungan, bukan kode**: DB CI baru di-wipe, jadi fixture yang
selama ini menumpuk di dev tidak ada. Pola kegagalannya konsisten dengan itu —
`expected 403 to be 200` berulang (permission belum ter-seed), "daftar admin
kosong", "admin tidak menerima notifikasi".

Ini utang yang **selama ini tersembunyi** karena tak seorang pun pernah berhasil
me-replay dari nol. Tiga cacat kelas ini dalam satu sesi (047, 137, seed CI),
dan ketiganya punya sifat sama: tak terlihat di lingkungan yang tumbuh bertahap.

### F0-12 — cacat kedua dari kelas yang sama, ditemukan karena replay bersih

Replay berhenti di migrasi **137**: *"1 akar grup tanpa owner_user_id"*.

Akarnya: migrasi **126** mengisi `created_by` dari admin-aktif-tertua, tetapi di
DB yang baru di-wipe **belum ada user sama sekali** (seed berjalan SETELAH semua
migrasi) → NULL. Lalu **137** mem-backfill `owner_user_id` dari
`COALESCE(created_by, admin-tertua)` — keduanya NULL — dan penjaganya melempar.

**Penjaga 137 benar dan tidak boleh dilemahkan.** Yang salah urutan seed-vs-migrasi.

Yang perlu dicatat: **ini kedua kalinya dalam satu sesi** pola yang sama muncul —
cacat yang hanya kelihatan saat sistem dibangun dari nol, tak pernah di dev yang
tumbuh bertahap. Belum diperbaiki: di luar cakupan ratifikasi, dan ada ≥2
pendekatan sah. Masuk antrean F0-12.

---

## 2026-08-03 · Sesi 2 — ratifikasi dieksekusi

Founder meratifikasi R-001 (opsi A + 3 syarat), R-002, R-003, R-004, memerintahkan
sapuan ulang untuk R-005, dan menaikkan dua item baru ke P0/gerbang.

### BARU-1 (P0) — CI tidak menjaga apa pun. Lebih buruk dari dugaan.

Founder benar: `ci.yml` disaring `branches: [main]`, sehingga **setiap PR bertumpuk
berjalan tanpa satu pun check**. 13 penjaga arsitektural yang dibangun sesi lalu
tidak menjaga apa pun pada rantai PR mana pun yang belum menyentuh `main`. Pemicu
sudah diubah ke `pull_request` tanpa filter.

Tetapi saat memverifikasi "status check benar-benar wajib", ditemukan dua hal yang
**lebih besar** dari cacat pemicunya:

1. **Branch protection TIDAK BISA diaktifkan.** `gh api …/branches/main/protection`
   → **403: "Upgrade to GitHub Pro or make this repository public"**. Begitu pula
   `…/rulesets`. Repo privat pada paket saat ini tidak mendukung keduanya. Artinya
   **tak ada mekanisme apa pun yang mewajibkan CI hijau sebelum merge** —
   diverifikasi: PR #133 `mergeStateStatus: UNSTABLE` tetapi `mergeable: MERGEABLE`.
2. **GitHub Actions tidak menjalankan job sama sekali.** Seluruh run terakhir gagal,
   termasuk push ke `main`. Bukti: job selesai dalam 3–12 detik, `steps: []` (nol
   langkah), `runner_name: ""` (runner tak pernah ditugaskan), dan zip log berukuran
   22 byte alias kosong. Ini bukan cacat kode — melainkan blokir tingkat akun
   (kuota/spending limit Actions).

Konsekuensi jujur: **CI belum bisa dipulihkan dari sisi saya.** Yang bisa saya
lakukan sudah dilakukan (pemicu diperbaiki); dua sisanya butuh tindakan founder di
setelan akun GitHub. Sampai itu beres, satu-satunya verifikasi yang nyata adalah
run lokal — dan itu yang saya tempel, bukan klaim CI hijau.

### R-001 — dieksekusi penuh, dengan ketiga syarat

**Syarat 1 — periksa DB CI sebelum eksekusi.** Kredensial `CI_*` memang write-only
di GitHub Secrets, jadi jalur "periksa dulu" hanya mungkin lewat workflow. Dibuat
`apps/api/scripts/ci-periksa-bentuk-gl.mjs` (read-only, tiga verdict A/B/C) +
action `periksa-gl` di `ci-isolation.yml`. **Belum dijalankan** karena Actions mati
(BARU-1) → maka fallback founder berlaku: **reset CI dari nol setelahnya**.

**047 dipensiunkan.** Isinya diganti no-op + penjelasan panjang. Berkasnya sengaja
TIDAK dihapus: nomor 047 sudah tercatat di buku migrasi, dan menghapusnya membuat
buku menunjuk ke sesuatu yang tak ada.

**Syarat 2 — migrasi penegas bentuk (175).** Gagal keras bila `accounts` tanpa
`company_id` atau masih punya `account_type`. **Membangunnya menemukan tiga cacat
pada penegas itu sendiri**, dan ketiganya hanya ketahuan karena diuji:

- **Terlalu ketat.** Versi pertama menuntut `company_id` di `journal_entry_lines`.
  Diuji ke dev → langsung melempar. Ternyata **penegasnya yang salah**: 167 sengaja
  memberi baris jurnal tenancy lewat induknya (`entry_id` → `journal_entries`),
  dinyatakan eksplisit di komentar 167 baris 155-156. Penjaga yang salah lebih
  berbahaya daripada tak ada penjaga — ia melatih orang mengabaikan kegagalannya.
  Diganti: cek FK ke induk, yang memang jalur tenancy sesungguhnya.
- **Buta schema.** Memakai `to_regclass('public.accounts')`, jadi selalu memeriksa
  `public` apa pun `search_path`-nya. **Uji negatif membuktikannya lolos padahal
  bentuknya 047.** Diganti `current_schema()` — idiom yang sudah dipakai 167 & 154.
- **Pesan galat rusak.** `array || text` yang teksnya memuat tanda kurung ditafsir
  Postgres sebagai array literal → `malformed array literal`, menutupi pesan
  sebenarnya. Dibungkus `ARRAY[...]`.

Uji akhir: **positif** (dev, bentuk 167) → LULUS; **negatif** (bentuk 047 dibangun
di schema sementara, transaksi di-ROLLBACK) → MENOLAK dengan pesan yang benar.

**Syarat 3 — sapu SELURUH 171 migrasi.** Dibuat
`audit-tabrakan-definisi-tabel.mjs`. Hasil sapuan: **13 tabel bertabrakan**, dan
ternyata **047↔167 bukan satu-satunya kelasnya** — tetapi satu-satunya yang tak
terjaga:

| Tabrakan | Status |
|---|---|
| `assets`, `asset_movements`, `asset_depreciation_logs` (045↔149) | **sudah terjaga** — 149 MEMBUANG bentuk 045 lebih dulu, dengan komentar yang menjelaskan cacat yang sama persis (baris 50-73) |
| `project_rab_materials` (043↔142), `po_delivery_log` (043↔143) | aman — definisi identik / ada `to_regclass` guard |
| 5 tabel workflow (081↔093) | aman — bentuk identik kolom demi kolom, dan ADR-006 sudah memensiunkannya (tabelnya nihil di dev) |
| **`accounts`, `journal_entries`, `journal_entry_lines` (047↔167)** | **satu-satunya yang tak terjaga → diperbaiki** |

Penemuan migrasi 149 penting: repo ini **sudah pernah** menyelesaikan cacat kelas
ini dengan benar. Jadi perbaikan R-001 mengikuti preseden yang ada (CHARTER §4
aturan 2), bukan mengarang pendekatan baru.

Penjaganya sendiri juga salah dua kali sebelum benar: (a) mendeteksi "penegas"
hanya dari ada-tidaknya `RAISE EXCEPTION` di berkas — terlalu longgar; (b) menuduh
**semua** pendefinisi, bukan yang **terakhir** — menghasilkan 18 tuduhan yang
hampir semuanya salah sasaran. Yang menanggung beban penjagaan adalah migrasi yang
datang belakangan; yang pertama tak punya apa pun untuk dijaga.

### R-005 — saya salah, dan founder benar menyuruh menyapu lebih luas

Sesi lalu saya menyimpulkan `1.657.839.590,39`, `109,5`, `7875` "hampir pasti bukan
dari berkas Cibuluh" lalu berhenti. Kesimpulan yang benar adalah **"belum saya cari
di berkas lain"** — sapuan saya hanya menyentuh `_source/ahsp/golden/`.

Disapu ke seluruh `_source/ahsp/`. **Ketiganya ketemu**, semuanya di
`Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm` (117 sheet):

- `1.657.839.590,39` = **TOTAL BIAYA** proyek (`REKAPITULASI!E15`, juga di
  `LAPORAN RAB!J239` dan `KURVA S!F19`)
- `109,5` = **volume m²** pasangan bata merah ½ batu (`LAPORAN RAB!H114`);
  terverifikasi silang: `109,5 × 146.308,162 = 16.020.743,74` = J114 ✅
- `7875` = **jumlah buah** bata merah (`DINDING BATA MERAH!L41`, satuan "Buah")

Jawaban atas pertanyaan mandat "kenapa 3.629.860.295,31 ≠ 1.657.839.590,39":
**dua proyek yang berbeda.** Cibuluh = RAB gudang nyata (9 divisi, 55 item);
RAB Control 2026 = Engineering Estimate template SE-47 (8 divisi A–H). Bukan beda
edisi, bukan subtotal-vs-total, bukan sudah/belum PPN.

**Temuan sampingan bernilai:** baris PPN di dokumen itu berlabel **"PPN 11%"**
tetapi pengalinya **0,12** (`F16`), dan hasilnya cocok
(`1.657.839.590,39 × 0,12 = 198.940.750,85`). Ini membuktikan model dua-angka yang
dijaga `ppn-dpp-guardrail.test.ts` **berasal dari praktik dokumen nyata**, bukan
karangan — dan menjadi kandidat kuat untuk mengisi guardrail yang selama ini
melaporkan dirinya *vacuous*.

Assertion belum ditambahkan → **F0-10**, karena butuh harness pembaca `.xlsm`
tersendiri. Itu pekerjaan, bukan keraguan.

### Yang belum & kenapa

- **R-002** (catat 12 migrasi ke buku) — menunggu R-001 benar-benar tuntas di
  lingkungan CI, sesuai urutan yang founder tetapkan.
- **F0-11** — pemeriksaan bentuk GL di project CI: terblokir BARU-1.
- **F1-8** — `companies.ts` coverage nol dinaikkan ke **gerbang Fase 1** sesuai
  perintah founder. Fase 2 tidak dimulai sebelum ini hijau.

### Verifikasi sesi ini

Suite penuh **129/129 berkas, 1299 lulus, 1 skipped, 228,9 s** — run hijau
**keempat berturut-turut**. Coverage tak berubah (31,98% / 68,49% / 81,96%).
**14 penjaga arsitektural exit 0.** `tsc --noEmit` exit 0.
`gen-indeks-docs --check` exit 0.

---

## 2026-08-02 · Sesi 1 — Fase 0 dimulai

### Pengakuan tujuh koreksi (tanpa pembelaan)

**C-1 — Introspeksi DB tidak stabil. Saya salah.**
Saya membalik kesimpulan soal GL empat kali dan membiarkan `process.cwd()`
melayang ke `apps/api` tanpa menyadarinya. Akar teknisnya saya temukan hari ini
dan lebih memalukan dari dugaan: setiap alat menulis ulang logika baca-`.env`
sendiri, dan salah satunya **tidak melucuti tanda kutip** pembungkus nilai
`DIRECT_URL` (`"postgresql://…"`). Driver `pg` gagal mem-parsing string berawalan
`"`, jatuh ke variabel lingkungan, lalu memakai `HOST=` dari `.env` sebagai
hostname — menghasilkan galat menyesatkan `getaddrinfo ENOTFOUND base`. Angka DB
di laporan audit saya **memang layak dicurigai**. Sudah diverifikasi ulang (§0.2).

**C-2 — Urutan kerja saya terbalik. Saya salah.**
Saya menaruh `company_id` di #7 dan keputusan grup/holding di #9. Bentuk grup
menentukan bentuk CoA dan jumlah tingkat kolom tenancy; mengerjakan `company_id`
lebih dulu berarti menyentuh 122 tabel dua kali. Urutan sudah dibalik di
`CHARTER.md` §3: **keputusan struktural mendahului migrasi struktural.**

**C-3 — Rekomendasi saya berbahaya. Saya salah, dan ini yang paling serius.**
Saya membuktikan sendiri parser `rekonsiliasi-schema-migrations.mjs` buta terhadap
DDL dinamis, lalu tetap merekomendasikan `--tulis` ke buku migrasi. Buku itu
menentukan apa yang di-replay CI; satu entri palsu = migrasi dilewati senyap
selamanya, tanpa gejala. Rekomendasi **ditarik**. Alat baru `ledger-diff.mjs`
dibuat, **tanpa flag tulis sama sekali**, dan menandai migrasi ber-DDL-dinamis
sebagai `PERLU-MATA-MANUSIA` alih-alih menghijaukannya.

**C-4 — Saya memvonis tanpa bukti. Saya salah.**
"Cacat bootstrap harness, bukan produksi" adalah hipotesis yang saya tulis sebagai
kesimpulan. Belum diselesaikan sesi ini; masuk antrean sebagai `F0-4` dan
**tidak** akan saya tutup sebelum ada bukti.

**C-5 — Golden file tidak cocok. Saya salah.**
`1.657.839.590,39`, `109,5`, `7875` tidak saya temukan, dan saya melaporkannya
sebagai "kemungkinan dari dokumen lain" alih-alih menyelidikinya. Ditemukan hari
ini: ada **dua** berkas Cibuluh (`.xls` 6,9 MB dan `.xlsx` 3,5 MB) — kandidat
penjelasan yang belum saya buka. Masuk antrean `F0-7`.

**C-6 — Skor Testing 80 belum dibayar. Saya salah.**
Coverage tidak diukur, jadi angka itu tidak punya dasar. Masuk antrean `F0-5`
sebagai ratchet, bukan target aspirasional.

**C-7 — Temuan terpenting saya kubur. Saya salah.**
93 dari 119 sub-menu tanpa rancangan saya taruh sebagai catatan kaki §10.6,
padahal itu risiko yang paling mungkin membunuh proyek. Dinaikkan menjadi Fase 5
tersendiri di `CHARTER.md`.

### Yang dikerjakan

- **0.1 SELESAI** — `scripts/db/introspect.mjs` + `scripts/db/_koneksi.mjs`.
  Satu metode koneksi (driver `pg`, alasan ditulis di header), identitas +
  `schema_hash` dicetak tiap run, penjaga cwd menolak jalan dari luar root repo.
- **0.2 SELESAI** — tujuh angka kepala diverifikasi ulang → `KOREKSI.md`.
- **0.6 SEBAGIAN** — `ledger-diff.mjs` jadi, `LEDGER-DIFF.md` terbit.
  Penulisan ke buku **tidak** dilakukan (G-2) → `RATIFIKASI.md` R-001.

### Yang ditemukan (tidak ada di audit kemarin)

1. **🔴 P0 — tabrakan definisi GL 047 ↔ 167.** Migrasi 047 **tercatat sudah jalan**
   dan mendefinisikan `accounts` **single-tenant** (`account_type`, nol `company_id`).
   Migrasi 167 mendefinisikan `accounts` **tenant-aware** (`company_id` 18×, kolom
   `type`) dengan `CREATE TABLE IF NOT EXISTS`. Dev memakai desain 167 (terverifikasi
   `introspect columns`). Di lingkungan baru, `ci-project-setup.mjs` menjalankan 047
   lebih dulu (SQL-nya valid → tidak error → tidak masuk `SKIP_ALLOWLIST` → tidak
   HARD FAIL), lalu 167 **no-op senyap**. Hasil: **GL tenant-blind di CI/produksi**
   tanpa satu pun pesan galat. Diajukan sebagai R-001.
2. **Seluruh seri GL (167–174) belum ter-merge ke `main`** — hanya ada di branch
   `fix/search-proyek-gagal-senyap` (8 commit, 3.890 baris), padahal tabelnya sudah
   di-apply ke DB dev bersama. Branch Fase 0 saya rebase ke sana agar tidak
   membangun di atas baseline palsu.
3. **Jumlah trigger: 156 (`public`), 175 (semua schema).** Angka 192 di audit saya
   tidak cocok dengan keduanya. Ada schema `mut6` berisi 14 trigger — sisa
   mutation-test yang menggantung di DB dev.
4. `.env` diawali **BOM** dan nilainya dibungkus tanda kutip — dua jebakan parser
   yang kini ditangani terpusat di `_koneksi.mjs`.

### Yang berubah dari rencana

Fase 0 ternyata harus mencakup **rebase ke branch yang benar** — tidak terduga,
tapi wajib: tanpa itu seluruh pengukuran Fase 0 dilakukan atas pohon kode yang
tidak memuat GL, sementara DB-nya memuat GL. Persis kelas kesalahan C-1.

### F0-4 — jaring pengaman rollback: saya salah DUA KALI, dengan cara berbeda

Audit saya menulis "cacat bootstrap harness, bukan produksi" sebagai kesimpulan
padahal itu hipotesis (C-4). Hari ini saya mengukurnya, dan hipotesis itu **salah** —
tapi kesimpulan turunannya ("bukan cacat produksi") ternyata **benar karena alasan
yang berbeda**. Keduanya perlu dicatat supaya tidak diklaim sebagai tebakan beruntung.

**Bukti yang dikumpulkan:**

1. Dijalankan sendirian, `multitenant-t3-rollback.test.ts` **LULUS 23/23**, tiga kali
   berturut-turut. Jadi bukan cacat bootstrap: tabel `assembly_components` memang
   terbentuk dengan benar oleh `bootstrap()`.
2. Dijalankan sebagai bagian suite penuh hari ini: **129/129 berkas lulus,
   1299 lulus, 0 gagal, 217,4 detik.** Kegagalan kemarin **tidak reproduksi**.
3. Akarnya ada di `test-utils/test-db.ts` dan **sudah terdokumentasi di sana**:
   27 berkas test berbagi satu schema `test`, dan `resetTestSchema()` melakukan
   `DROP SCHEMA … CASCADE` yang butuh ACCESS EXCLUSIVE lock. Koneksi berkas test
   sebelumnya kadang belum lepas di sisi server (pooler session-mode menutup
   asinkron), sehingga DROP menunggu dan hook timeout menembak duluan. Komentar di
   kode menyebut frekuensinya "intermiten, ~30-50% run penuh".

**Jadi:** ini **flake infrastruktur test yang sudah dikenal**, bukan cacat produksi
dan bukan cacat bootstrap. Yang salah dari audit saya bukan verdict akhirnya,
melainkan **saya menyatakannya tanpa mengukur** — dan kebetulan-benar adalah
kegagalan metode, bukan keberhasilan.

**Konsekuensi yang belum selesai:** `F0-4` TIDAK saya tutup. Suite yang lulus
sekali tidak membuktikan flake-nya hilang; ia hanya tidak muncul hari ini. Kriteria
selesainya diperketat menjadi: *lulus 3 run penuh berturut-turut* + *test rollback
untuk tiap tipe migrasi tenancy*. Sisanya dikerjakan sebelum Fase 2, karena Fase 2
justru yang paling bergantung pada jaring ini.

**Temuan turunan:** jumlah "skipped" ikut berubah antar-run (24 → 1). Dua puluh tiga
di antaranya adalah test milik berkas yang gagal, bukan test yang sengaja di-skip.
Angka "24 skipped" di laporan audit karenanya menyesatkan; yang benar-benar
di-skip secara sengaja hanya **1** (`golden-cibuluh` — pasangan `skipIf` yang memang
mati saat berkas golden-nya ada).

### F0-5 — coverage: skor Testing 80 akhirnya dibayar (C-6)

Diukur pertama kali: **statements/lines 31,98%**, branches 68,49%, functions 81,96%.
Yang mengkhawatirkan bukan angkanya melainkan **sebarannya**: 27 berkas route
ber-coverage NOL, termasuk `users.ts`, `notifications.ts`, `documents.ts`,
`audit.ts`, dan `companies.ts` (inti multi-tenant). Jalur uang tipis:
`penalty.ts` 4,2%, `kasbon-limit.ts` 5,3%.

Membangun ratchet-nya justru menemukan dua cacat pada penjaga itu sendiri:

1. **Tanpa toleransi, penjaga jadi cerewet.** v8 bergoyang antar-run
   (branches 68,49 → 68,48). Penjaga yang berteriak untuk 0,01% akan dimatikan orang.
2. **Penjaga bisa berbohong.** Run `src/lib` saja menghasilkan statements 8,57%
   terhadap lantai 31,98% → vonis "TURUN" **palsu**. Sidik cakupan yang benar
   adalah **baris tereksekusi** (1.821 vs 6.794), bukan jumlah berkas — v8 tetap
   mendaftar semua berkas yang di-`include` walau nol tercakup, sehingga jumlah
   berkas nyaris tak berubah. Ratchet kini MENOLAK membandingkan (exit 2) alih-alih
   memberi vonis palsu.

### F0-7 — golden file: hipotesis saya sendiri gugur (C-5)

Saya menduga selisih angka berasal dari "dua berkas Cibuluh berbeda". **Salah.**
`.xls` dan `.xlsx` isinya identik — 22 sheet sama, nilai di sel sama; `.xlsx` hanya
hasil simpan-ulang. Jadi bukan itu penjelasannya.

`1.657.839.590,39` **tidak ada** di kedua berkas, seluruh 22 sheet. Semua angka
1–9 miliar disapu; terdekat `1.642.531.571` (subtotal Pekerjaan Beton), selisih
15,3 juta — bukan PPN, bukan PPh, bukan pembulatan. `109,5` dan `7875` juga nihil.

**Yang sengaja tidak saya lakukan:** menambahkan assertion untuk ketiganya.
Mengunci angka yang sumbernya tak diketahui = menjadikan tebakan sebagai kebenaran,
persis kelas kesalahan yang Fase 0 ada untuk memberantasnya. → R-005.

### F0-9 — penjaga penomoran migrasi

171 berkas, nomor tertinggi 174, lompatan lama 30/59/64 (059 = `seed_dummy_data`;
030 & 064 tak pernah ada di histori git). Lompatan lama dikecualikan **beserta
alasannya**; yang dijaga lompatan baru dan nomor ganda. Diuji dua arah.

Alasan nomor ganda berbahaya bukan estetika: `ci-project-setup` mencatat keduanya
sebagai satu versi, sehingga yang kedua **dilewati senyap selamanya** — mekanisme
yang sama persis dengan cacat P0 047↔167.

### Temuan proses: CI tidak berjalan untuk PR bertumpuk

PR #134 dibuat menargetkan `fix/search-proyek-gagal-senyap` (PR #133), bukan `main`,
karena seri GL 167–174 belum ter-merge. Akibatnya **nol check berjalan**:
`ci.yml` hanya ter-trigger pada `pull_request.branches: [main]`.

Ini konsekuensi nyata dari R-003 yang tak saya antisipasi. Selama rantai PR belum
sampai ke `main`, **CI tidak memverifikasi apa pun** — dan mengklaim "CI hijau"
dalam kondisi itu akan jadi persis jenis klaim tak berdasar yang CHARTER §7 larang.

Sebagai ganti, seluruh langkah CI dijalankan **lokal**, dan hasilnya ditempel:
13 penjaga exit 0 · api `lint:ratchet` 0 error / `tsc` exit 0 / `build` exit 0 ·
web `lint:ratchet` 0 error / `tsc` exit 0 · suite penuh 3 run berturut hijau.

`F0-3` karenanya tetap **wip**, bukan done: kriteria "penjaga CI hijau" baru
benar-benar terpenuhi saat rantai PR di-merge ke `main`.

### Status gerbang Fase 0 — BELUM hijau penuh (dinyatakan jujur)

Selesai: F0-1, F0-2, F0-5, F0-6, F0-7, F0-9.
Belum: **F0-3** (penjaga docs jalan, CI penuh belum diverifikasi end-to-end),
**F0-4** (3 run berturut hijau, tapi isolasi schema per-berkas + rollback tiap
tipe migrasi tenancy belum dibangun).

Sesuai CHARTER §3, Fase 1 **tidak** dimulai sebelum keduanya tuntas.

### Menunggu di RATIFIKASI

- **R-001** 🔴 P0 — tabrakan GL 047↔167 (G-2). Memblokir pekerjaan GL apa pun.
- **R-002** — pencatatan 12 migrasi ke buku (G-2; harus SETELAH R-001).
- **R-003** — bekerja di atas `fix/search-proyek-gagal-senyap`, bukan `main`.
- **R-004** — penarikan rekomendasi `rekonsiliasi --tulis`.
- **R-005** — 3 angka jangkar golden file tak dikenali sumbernya (pertanyaan, tidak memblokir).
- **F0-8** — pembersihan schema `mut6` dari DB dev (G-2).

## 2026-08-03 — F1-1, F1-5, F1-4 (sebagian), + akar tujuh kegagalan shard

**F1-1 SELESAI.** Idempotency terpasang di tiga endpoint yang benar-benar
memindahkan kas. Endpointnya dipilih dari `pg_trigger` — tabel mana yang punya
trigger pengubah saldo — bukan dari nama. PATCH status sengaja tidak dipasangi:
sudah idempoten by state. Memasang di mana-mana akan membuat mekanismenya
terlihat seperti formalitas, dan yang benar-benar butuh jadi tak menonjol.

**F1-5 SELESAI, dan pengukurannya lebih berharga daripada hasilnya.** F1-5
mengharuskan waktu klon→siap DIUKUR. Pengukuran itu menyingkap tiga cacat yang
NOL-nya bergejala di mesin yang repo-nya sudah berjalan:

1. `apps/web/.env.example` **tak pernah ada di repo** — `.gitignore` punya
   `.env*` yang ikut menelannya. Setiap orang yang pernah mengklon tak menerima
   satu pun petunjuk konfigurasi web. Tak ada yang sadar karena di mesin lama
   berkasnya tertinggal secara lokal.
2. Klon di Windows **gagal checkout** — path absolut > 260 char. Klon dilaporkan
   BERHASIL, checkout-nya yang gagal: repo terlihat ada tapi tak lengkap.
3. Bootstrap saya sendiri **menuduh tersangka yang salah** — `pg` tak ada di
   root, tapi galatnya dilaporkan sebagai "koneksi DB gagal, periksa
   DIRECT_URL". DIRECT_URL tak bersalah.

Pelajarannya: cacat yang hanya muncul di lingkungan bersih tak akan pernah
ditemukan dengan membaca. Ia harus dijalankan di lingkungan bersih.

**Saya salah tentang cara membuktikan.** Dua kali hari ini saya menjalankan
mutation test yang mutasinya TIDAK PERNAH TERPASANG (escaping shell merusak
regex, 0 kecocokan) — dan dua kali saya nyaris menerima hijaunya sebagai bukti.
Hijau dari mutasi yang gagal terpasang adalah hijau palsu. Sejak itu saya
selalu menghitung kecocokan mutasi sebelum mempercayai hasilnya.

**Akar tujuh kegagalan shard, akhirnya ditutup.** CI merah lagi (t5b:
"expected 5 to be 6"). Bacaan pertama menuduh RLS bocor — bukan. Test
menghitung proyek company AKAR lewat dua jalur pada dua DETIK BERBEDA; satu
baris lahir di antaranya.

Ini kelas KETUJUH yang sama (F0-14, F0-16, iso-test-b, purge `[TEST]%` ×2,
cecep-rap `LIMIT 1`, t5b). Setelah keenam saya menambal satu per satu. Setelah
ketujuh jelas menambal bukan jawabannya, dan saya menulis penjaga yang
menolaknya otomatis — plus memperbaiki t5a yang memuat cacat laten yang sama
atas tiga tabel yang TERUKUR disisipi test lain.

RLS tidak disentuh sekali pun, walau melonggarkan satu predikat akan
menghijaukan semuanya dalam sepuluh detik. Itu G-5.

**F1-4 SEBAGIAN — dan blokirnya bukan pekerjaan yang kurang.** Perkakas,
runbook, dan drill terjadwal selesai. Kriteria "restore nyata" belum terpenuhi
karena GitHub menolak `workflow_dispatch` untuk workflow yang belum ada di
branch default (HTTP 404, diverifikasi lewat API). Drill baru bisa dijalankan
setelah rantai ini di-merge — dan R-003 melarang merge sebelum R-001 selesai.

Mesin lokal tak bisa menggantikan, dan itu diukur bukan ditebak: nol perkakas
klien Postgres, tanpa hak admin, WSL tanpa distro sehingga Docker tak bisa
hidup. Saya TIDAK menandai F1-4 selesai. Runbook §7 mencantumkan apa yang belum
terbukti dengan jujur, tanpa RTO untuk keduanya.

## 2026-08-03 (lanjutan) — F1-4 TERBUKTI. Delapan cacat sebelum sampai ke sana.

Merge ke `main` selesai, dan itu membuka drill pemulihan. Run 30832665736
hijau dengan bukti yang bisa dibaca:

    dump 60 dtk / 1,2 MB · restore 1 dtk · RTO siklus penuh 61 detik
    tabel 124/124 · RLS 123/123 · policy 377/377 · isi 124 tabel cocok

**Saya salah soal PR #134.** Saya merge tanpa memeriksa targetnya lebih dulu;
ternyata ia menunjuk branch perantara, bukan `main`. Tidak ada yang rusak, dan
saya lanjutkan lewat PR #133 — tapi memeriksa tujuan sebelum menekan merge itu
hal yang seharusnya otomatis.

**Kredensial pemilik sempat terbit di log publik.** Sandi mengandung `@`, yang
memecah URL di tempat salah; pesan galat `pg_dump` lalu MENCETAK potongannya.
GitHub me-mask nilai secret yang persis sama — potongan hasil parsing keliru
bukan nilai yang sama, jadi lolos. Run + log dihapus (terverifikasi 404).
Pemilik menimbang risikonya dan memilih tidak ganti sandi; itu keputusannya,
dan saya sudah menyampaikan konsekuensinya sebelum ia diambil.

Pelajaran yang berlaku seterusnya: **di repo publik, pesan galat adalah
permukaan kebocoran.**

### Delapan cacat, dan yang paling menakutkan bukan yang paling rumit

1. sandi ber-`@` merusak URL → kredensial bocor
2. `pg_dump` 17 terpasang tapi 16 yang jalan — **memasang bukan berarti memakai**
3. schema `extensions` tak ada → 753 galat berantai
4. schema `auth` tak ada → tepat 21 policy hilang
5. `btree_gist` tak ada → constraint anti-tumpang-tindih gagal
6. dump diambil sambil database bergerak → pelanggaran FK
7. membandingkan target dengan sumber yang berubah → alarm palsu
8. **`pg_restore` butuh `-f -`** → daftar kosong → **drill HIJAU tanpa memeriksa apa pun**

Nomor 8 yang paling berbahaya, dan ia yang paling sederhana. Run 30832061986
melaporkan `success` atas perbandingan yang tak pernah terjadi. Kalau saya
menerimanya, F1-4 akan ditandai selesai dengan bukti kosong — persis yang
CHARTER §7 larang. Sekarang dua penjaga terpisah membuat "tak ada yang
diperiksa" menjadi merah.

**Saya juga hampir salah dua kali karena memotong keluaran di ujung yang
salah.** `tail -20` atas 753 galat membuat saya melihat gejala (policy gagal
karena tabelnya tak ada) selama dua putaran, bukan sebab (schema `extensions`
hilang). Galat PERTAMA hampir selalu penyebab; sisanya akibat berantai.

Dan saat drill akhirnya hijau tetapi masih mencatat 5 pelanggaran FK pada
tabel inti, saya tidak menyimpulkan "berarti aman" — saya cetak angkanya.
`projects` 5=5, `scenarios` 4=4, `lesson_propagation_proposals` 192=192.
Hijau + galat FK adalah kombinasi yang harus dicurigai, bukan diterima.

### Cadangan harian terenkripsi

Paket Supabase free tak punya PITR, jadi kehilangan maksimal ~1 hari. Cadangan
harian AES-256 (artifact 30 hari) menutup risiko lain: cadangan yang hanya
hidup di dalam akun ikut hilang bila yang hilang justru AKSES ke akunnya.

Job MENOLAK jalan tanpa `SANDI_CADANGAN` — cadangan tak terenkripsi di repo
publik lebih berbahaya daripada tidak ada cadangan, karena ia terasa seperti
keamanan padahal justru kebocoran.

🔴 **Tripwire:** naikkan ke PITR SEBELUM pelanggan pertama.

## 2026-08-04 — FASE 2 SELESAI 6/6. Empat kebocoran ditemukan, semuanya ditutup.

Fase 2 dirancang sebagai "sapuan tenancy". Yang sebenarnya terjadi: ia jadi
audit yang menemukan **empat kebocoran lintas-tenant nyata** — dan tak satu
pun terlihat dari membaca kode.

| Ditemukan | Kebocoran | Bukti |
|---|---|---|
| F2-3 b2 | `audit_logs` — admin PT A membaca jejak PT B | 13.691 baris, mutation-tested |
| F2-3 b3 | `permission_scopes` — pembatasan izin terbaca semua tenant | policy `auth.role() IN (authenticated,…)` |
| F2-5 | `expense-receipts` — anon TANPA LOGIN membaca bukti pengeluaran | anon 1 baris terbaca |
| F2-5 | `project-photos` — anon membaca DAN MENGHAPUS foto proyek | sisa era anon-key |

**Alat saya sendiri meloloskan dua di antaranya.** Klasifikasi F2-2 punya dua
cacat berturut: (1) rantai berhenti di tabel SHARED yang kebetulan punya
`company_id`, (2) rantai MENEMBUS `users` yang global. Perbaikan pertama hanya
melarang users jadi UJUNG; `permission_scopes → users → roles` tetap lolos.

**Temuan struktural terbesar F2-2:** dari 80 tabel tanpa `company_id`, hanya
**4** yang perlu keputusan. 66 sudah punya tenancy lewat rantai FK — memberi
mereka kolom kedua akan menciptakan dua sumber kebenaran yang bisa
bertentangan.

**Pelajaran yang berulang, dan akhirnya jadi kebiasaan:** setiap test isolasi
harus punya assertion "penjaga berdaya" — memeriksa bahwa ia bisa MELIHAT
sesuatu sebelum menyimpulkan tak ada kebocoran. Tiga uji `audit_logs` saya
melaporkan "tertahan" padahal sesinya tak bisa melihat apa pun. Pola yang sama
menyelamatkan F2-4 (tiga percobaan penyamaran salah berturut-turut).

**F2-5 menyingkap arah cacat yang terbalik.** Tujuh kali di Fase 0, test
mengotori produksi. Kali ini MIGRASI LAMA mengotori hasil test:
`storage.objects` tabel GLOBAL, jadi migrasi 012/016 ikut ter-replay tiap
suite membangun schema `test` dan menghidupkan kembali policy yang baru
dihapus. Gejalanya "test kadang merah" — diperbaiki di sumbernya, bukan
ditambal di migrasi baru.

**F2-6 diputuskan dengan bukti, bukan selera.** `FORCE ROW LEVEL SECURITY`
menghasilkan NOL perubahan perilaku (diuji: 15 proyek sebelum & sesudah)
karena `postgres` ber-`rolbypassrls`. Memaksanya akan menambah properti yang
TERLIHAT seperti perlindungan tetapi tidak bekerja — dan itu lebih berbahaya
daripada tak ada perlindungan. Dua tripwire dijaga otomatis.

Fase 2: 6/6. 142 berkas / 1400 test hijau. 11 penjaga arsitektural.

---

## 2026-08-05 — Fixture test mengungkap cacat produksi multi-tenant (R-010)

**Saya salah dua kali di sesi ini, dan cara salahnya sama: fixture uji yang
tidak menganggap dirinya berbagi basis dengan 157 berkas lain.**

Fixture `menu-etag` membuat perusahaan kedua (dev hanya punya satu, jadi
pemeriksaan isolasi tenant tak akan pernah benar-benar berjalan tanpa itu).
Fixture itu lalu menjatuhkan `submittal-aturan` dan `t9-kelola-badan-usaha`
— dua kali, di CI, dengan pesan yang tak ada hubungannya dengan yang mereka uji.

Perbaikan pertama saya keliru arah: saya membersihkan fixture. Yang benar
adalah membuat fixture-nya **sah menurut invariant** — diberi `owner_user_id`
dan rantai approval — sehingga tertinggal pun tak melanggar apa pun.
Diverifikasi dengan sengaja meninggalkannya: 29 test hijau.

**Dan di situ cacat sungguhannya muncul.** `submittal-aturan` merah karena
perusahaan baru tak punya rantai approval `submittal`. Migrasi 159 mengisinya
untuk company yang ADA saat migrasi jalan; tak ada trigger untuk yang lahir
sesudahnya (diverifikasi ke `pg_trigger`, bukan dibaca dari migrasi).

Artinya: **pelanggan kedua dan seterusnya lahir tanpa rantai approval.**
Fail-closed (ADR-007) bekerja persis sebagaimana mestinya — nol orang bisa
menyetujui — jadi gejalanya `403` untuk semua orang termasuk pemilik
perusahaannya, tanpa satu pun pesan yang menjelaskan. Ini ERP yang sedang
dijual ke banyak perusahaan; cacat ini menunggu pelanggan kedua.

Satu-satunya alasan invariant itu selama ini terpenuhi: **tak pernah ada
company baru.** Test yang hijau karena keadaan, bukan karena kodenya benar.

Dicatat sebagai **R-010** (menyentuh skema → butuh ratifikasi). Cakupannya
mungkin lebih luas dari submittal — `approval_chains` punya beberapa
`entity_type`, dan belum diperiksa mana saja yang punya lubang yang sama.
Jangan diasumsikan hanya submittal.

**Pelajaran yang sama muncul tiga kali hari ini:** penjaga yang tak pernah
dibuat merah adalah teater. Tiga penjaga ternyata hijau tanpa memeriksa apa
pun — satu `exit(0)` saat tak menemukan targetnya, satu buta terhadap bentuk
ternary, satu membaca komentar sebagai kode. Semuanya ditemukan dengan
mencoba membuatnya merah, bukan dengan membaca kodenya.

---

## 2026-08-05 (lanjutan) — Audit yang melewati halaman terpenting, lalu melaporkan nol

**Akun uji portal dibuat**, dan 19 halaman portal akhirnya terlihat untuk
pertama kalinya. Temuan pertamanya sepele tapi tiap hari: `split(" ")[0]`
menyapa **lima dari enam mandor** dengan "Halo, Pak". Cacat yang sama ada di
lima tempat, termasuk dashboard utama.

**Yang lebih besar: penjaga a11y saya sendiri melewati rute dinamis.**
`/proyek/[id]` — 20 bagian, 12.554px, halaman terkaya di aplikasi — tak
pernah sekali pun dipindai, sementara laporan berbunyi "39 halaman, nol
pelanggaran". Begitu disertakan: **141 pelanggaran**, termasuk 85 input tanpa
label dan 19 tombol tanpa nama.

Saya sudah menulis "nol pelanggaran" tiga kali hari ini. Angka itu benar
untuk halaman yang dipindai, dan menyesatkan tentang aplikasinya. Audit yang
melewati halaman terpenting lalu melaporkan nol memberi rasa aman yang tidak
dibayar dengan pemeriksaan apa pun.

**`opacity` pada teks muncul EMPAT kali lagi** — lencana EVM, kartu
finansial, garis Gantt, judul milestone. Kelas yang dulu menyumbang 227 dari
235 pelanggaran lewat sidebar. Semuanya lolos setiap pemindai statis, karena
kontras hanya terlihat pada nilai terhitung.

**`--bg-rgb` yang tidak pernah didefinisikan.** Bilah navigasi memakai
`rgba(var(--bg-rgb, 248,249,250), 0.92)` — fallback nilai mode TERANG selalu
yang dipakai, jadi bilah tetap putih di mode gelap. 20 pelanggaran dari satu
baris, semuanya hanya terlihat di mode gelap.

**Fixture company yatim: tiga kali dalam satu hari.** `t9` menuntut setiap
akar grup punya pemilik. Ia memeriksa SELURUH tabel, dan enam shard berbagi
satu basis — jadi fixture berkas A menjatuhkan test berkas B. Dua kali saya
"memperbaikinya" dengan membersihkan fixture. Itu salah: `afterAll` tak
berjalan kalau prosesnya mati. Yang benar adalah membuat fixture SAH SEJAK
LAHIR, dan sekarang ada penjaga yang menolak yang ke-16.

**Saya salah menomori R-010.** Nomor itu sudah dipakai untuk definisi
INTI/PEMBEDA/TUNDA yang diratifikasi 2026-08-04; R-011 dan R-012 juga
terpakai. Temuan rantai approval kini **R-013**. Kesalahan yang sama persis
dengan yang berkali-kali saya temukan di kode hari ini: menulis angka tanpa
mengukur dulu.

**Dan INTI #1 ternyata sudah selesai.** QUEUE menyatakannya belum digarap.
Diukur di HEAD: `/gl/laporan` hidup, tab "Neraca & Laba-Rugi" ada di
`/akuntansi`, lengkap dengan penanda seimbang dan ekspor CSV. Dokumen yang
menyatakan pekerjaan penting "belum ada" sama merusaknya dengan yang
menyatakan pekerjaan "sudah selesai" padahal belum — keduanya membuat orang
mengerjakan hal yang salah.

---

## 2026-08-06 — INTI 9/9 selesai, dan dua kelas cacat akhirnya berpenjaga

**INTI #9 absensi lapangan dibangun dari nol.** `wage_items.days_worked` dulu
angka yang diketik mandor dari ingatan — triase menyebutnya "sumber selisih
paling sering". Sekarang ada catatan harian di baliknya, dan formulir upah
punya tombol "Ambil dari absensi". Diuji di peramban: Agung 2,5 hari
(setengah hari Selasa terbawa persis), subtotal terhitung sendiri.

Yang dijaga bukan sekadar tabelnya: 14 invarian, dan yang paling mahal adalah
**dobel-absen** — satu hari tercatat dua kali berarti upah ganda yang tak
terlihat di layar mana pun sampai seseorang menjumlahkan ulang. Mutasi
membuktikan constraint-nya nyata: mencopot CHECK + unique index → 4 bocor.

**INTI #8 geotag ternyata hanya butuh disambungkan.** Kolom, endpoint, dan
komponen `PenandaLokasi` semuanya sudah ada sejak migrasi 190. Yang hilang:
`select` tak mengambil kolomnya, dan komponennya tak pernah dipasang. Jadi
koordinat tersimpan rapi dan tak pernah sampai ke layar — bentuk paling halus
dari "kolom DB sudah ada bukan berarti selesai".

**Dua kelas cacat kontras akhirnya berpenjaga.** Token deret grafik dipakai
sebagai warna teks: LIMA kali. `opacity` pada teks: ENAM kali. Tiap perbaikan
benar, dan tiap kali yang berikutnya lahir lagi — karena tak ada yang
menolaknya di pintu masuk. Dua penjaga baru menemukan 16 pemakaian lagi yang
belum terlihat, termasuk di portal mandor yang baru bisa diperiksa kemarin.

**Yang paling saya ingat dari hari ini:** `--warning` lolos 5,02:1 di putih
dan 4,84:1 di `--warning-bg`, lalu GAGAL 4,46:1 di baris RAB berlatar biru
muda. Kurang 0,04, dan itu 95 pelanggaran di satu halaman. Latar yang benar
harus diukur, bukan diasumsikan putih — dan saya baru tahu itu setelah
meminta axe menyebutkan warna latar yang sebenarnya ia hitung.

**Dua dari sembilan INTI ternyata sudah selesai sebelum diperiksa.** Dokumen
yang menyatakan pekerjaan penting "belum ada" sama merusaknya dengan yang
menyatakan "sudah selesai" padahal belum. Ukur di HEAD sebelum mulai.
