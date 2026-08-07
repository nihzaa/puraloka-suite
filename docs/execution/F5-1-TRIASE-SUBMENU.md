# F5-1 — Triase sub-menu: INTI / PEMBEDA / TUNDA

> **Dokumen hidup.** Diperbarui saat status sub-menu berubah, bukan ditulis
> sekali lalu ditinggalkan. Cara mengukurnya ada di §6 — jangan menyalin angka
> dari sini ke dokumen lain tanpa mengukur ulang.

| | |
|---|---|
| Item QUEUE | F5-1 (Fase 5) |
| Risiko yang dijawab | **C-7 — yang paling mungkin membunuh proyek** |
| Ditulis | 2026-08-04 |
| Sumber data | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`, diukur ulang §6 |

---

## 0. Dua koreksi terhadap judul item ini

**Angkanya bukan 93, melainkan 54.** Judul F5-1 menyebut "93 sub-menu". Hitung
ulang dari **kolom Status** taksonomi (§6) menghasilkan **57 baris 🔴**, dan
**54** sesudah tiga koreksi status di §2b.

> **Saya salah dulu di dokumen ini.** Versi pertama menulis **64**, karena
> skrip hitungnya memakai `baris.includes('🔴')` — mencari tanda merah **di
> mana pun di baris**, termasuk kolom *Catatan*. Itu persis kesalahan yang
> taksonomi peringatkan sendiri ("ikut menghitungnya menggelembungkan angka
> ±12%"), dan saya mengulanginya sambil mengutip peringatannya.
>
> Sembilan baris 🟡 memuat 🔴 di Catatan sebagai keterangan *sebagian sudah
> hidup* — misalnya `Laporan keuangan` (arus kas ✅, neraca & L/R 🔴) dan
> `KPI` (CPI/SPI/margin ✅, DSO/backlog 🔴). Menghitungnya sebagai "belum
> dimulai" akan membuat dua item INTI di §3 tampak jauh lebih besar daripada
> kenyataannya. Skrip di §6 sudah diperbaiki agar memeriksa kolom Status saja.

**Triase "kerjakan / tidak" SUDAH ADA dan tidak diulang.** Bagian *"KEPUTUSAN
ATAS 68 SUB-MENU MERAH — 2026-08-01"* di taksonomi menjawab pertanyaan itu
(🟢 kerjakan 23 · 🟡 tahan 18 · 🔴 jangan bangun 12 · ⚪ tercakup 5).

Dokumen ini menjawab pertanyaan **yang berbeda**, dan itulah kenapa ia tetap
perlu ada:

| Dokumen | Menjawab |
|---|---|
| Taksonomi §KEPUTUSAN (2026-08-01) | *Apakah ini layak dibangun sama sekali?* |
| **F5-1 (dokumen ini)** | *Dari yang layak, mana yang harus habis LEBIH DULU?* |

Menjawab yang kedua tanpa yang pertama akan mengurutkan barang yang seharusnya
tak dibangun. Menjawab yang pertama saja meninggalkan 41 item layak-bangun
tanpa urutan — dan itulah bentuk nyata risiko C-7: bukan salah memilih fitur,
melainkan **mengerjakannya dalam urutan yang salah sampai kehabisan tenaga
sebelum produknya bisa dijual**.

---

## 1. Definisi tiga golongan

CHARTER menyebut INTI / PEMBEDA / TUNDA tanpa mendefinisikannya. Definisi di
bawah **sudah diratifikasi founder 2026-08-04** — `RATIFIKASI.md` **R-010** —
dan karenanya mengikat, bukan lagi usulan.

### INTI — tanpa ini produk tidak bisa dijual

Sub-menu yang ketiadaannya membuat **calon pelanggan pertama menolak**, bukan
sekadar mengeluh. Ujinya satu kalimat:

> *Kalau demo berhenti di sini, apakah calon pelanggan pergi?*

INTI **bukan** "yang paling banyak dipakai". Fitur yang dipakai tiap hari tapi
punya jalan memutar (ekspor Excel, WhatsApp) bukan INTI — ia menyakitkan, tapi
tak mematikan transaksi.

### PEMBEDA — alasan memilih kita, bukan pesaing

Sub-menu yang menaikkan salah satu dari **Lima Pembeda ERP kontraktor**
(`PETA-PRIORITAS-ERP.md` §6): cost control berlapis · EVM · WIP/PSAK ·
rekonsiliasi material · rantai kontrak.

Tanpa PEMBEDA produk **tetap bisa dijual**, tapi bersaing pada harga melawan
software akuntansi umum — pertarungan yang tak bisa dimenangkan aplikasi baru.

### TUNDA — berguna, tapi tak ada yang menunggunya

Berguna dan mungkin diminta suatu hari, tapi **belum ada pemakai nyata yang
menunggunya sekarang**. Membangunnya berarti menebak bentuknya, dan bentuk yang
salah lebih mahal daripada belum ada — ia harus dirawat selamanya sambil
menghalangi bentuk yang benar.

> **Aturan urutan (CHARTER):** INTI habis dulu, baru PEMBEDA. TUNDA tak
> dikerjakan sampai ada pemicu tertulis.

---

## 2. Yang dikeluarkan lebih dulu — 11 dari 54

Ketiga golongan hanya berlaku untuk yang **layak dibangun**. Berikut yang sudah
diputuskan tidak, atau ternyata sudah hidup.

### 2a. Sudah diputuskan JANGAN DIBANGUN — 11 item

Keputusan 2026-08-01 menyebut **12**; satu di antaranya (`multi-tenant`) sudah
tak berstatus 🔴 lagi setelah koreksi §2b, jadi yang tersisa di daftar merah
adalah 11.

Keputusan 2026-08-01, tidak dibuka ulang di sini:

| Item | Alasan singkat |
|---|---|
| Payroll staf · Potongan statutori (BPJS) · PPh 21 | Aturan pajak berubah tiap tahun; salah hitung = urusan hukum, bukan bug |
| Rekonsiliasi bank · Tutup buku periode | Software akuntansi mengerjakannya lebih baik; integrasi lebih murah |
| Report builder | Taksonomi sendiri menandainya "jangan dibangun" — membangun Excel di dalam ERP |
| Rekrutmen & onboarding · Cuti & izin · Penilaian kinerja · Sertifikasi & kompetensi | Ini HRIS, bukan ERP kontraktor |
| Absensi & timesheet (staf kantor) | Sama — beda dari absensi LAPANGAN, yang tetap dihitung |

### 2b. Status taksonomi ternyata sudah basi — 3 item, dikoreksi 2026-08-04

Ketiganya **sudah dikeluarkan** dari angka 54 di atas (57 → 54).

Kenyataan diukur, dokumen menyesuaikan (CLAUDE.md §0):

| Item | Sebelum | Sesudah | Bukti |
|---|---|---|---|
| Backup & restore | 🔴 | ✅ | F0-13/F0-14 · latihan pemulihan mingguan, **RTO terukur 61 detik**, 124/124 tabel · 377/377 policy |
| Mode offline | 🔴 | 🟡 | F4-3 · antrean di 6 jalur tulis mandor · 4 jaminan + mutation-test 6/6 |
| Multi-tenant | 🔴 | 🟡 | 45/123 tabel ber-`company_id` (sisanya lewat rantai FK, klasifikasi F2-2) · RLS 123/123 · 5 kebocoran nyata ditutup di Fase 2 · ADR-010 |

### 2c. Sembilan baris 🟡 yang sebagian sudah hidup — TIDAK dihitung merah

Ini yang membuat versi pertama dokumen ini salah (§0). Kesembilannya berstatus
🟡, jadi **tak masuk angka 54** — tapi bagian yang masih 🔴 di dalamnya tetap
pekerjaan nyata, dan diperlakukan sebagai **penyempurnaan item hidup**, bukan
item baru:

| Baris 🟡 | Yang sudah hidup | Yang masih 🔴 |
|---|---|---|
| Laporan keuangan | Arus kas | Neraca & L/R — **INTI #1** |
| KPI: CPI, SPI, margin, DSO, backlog | CPI/SPI per proyek · margin | DSO · backlog |
| Profitabilitas per proyek / cost code | per proyek (`/finance/profitability`) | per cost code — **PEMBEDA** |
| Foto + geotag | Foto | geotag (0 kolom GPS) — **INTI #8** |
| Dokumentasi foto | Migrasi 097/098, bucket privat | geotag (sama dengan di atas) |
| Master Subkontraktor | Sistem mandor (padanan lokal) | subkon formal ber-kontrak |
| e-Faktur / e-Bupot | Pencatatan nomor · rekap pajak · status | generate → pakai Coretax (jangan dibangun) |
| Mode offline | Antrean tulis 6 jalur (F4-3) | foto · pembacaan offline |
| Multi-tenant | Isolasi data · RLS · ADR-010 | penyediaan tenant · langganan (F7-1) |

**Sisa yang ditriase: 54 − 11 = 43 item merah**, ditambah bagian-🔴 dari
sembilan baris 🟡 di atas yang masuk INTI/PEMBEDA sebagai penyempurnaan.

Pembagiannya: **INTI 7 · PEMBEDA 11 · TUNDA 25** = 43. Ditambah dua
penyempurnaan 🟡 di INTI (laporan keuangan, geotag) dan satu di PEMBEDA
(profitabilitas per cost code), daftar kerjanya menjadi **INTI 9 · PEMBEDA 12 ·
TUNDA 25**.

---

## 3. INTI — 9 item

Diurutkan sesuai ketergantungan, bukan besarnya pekerjaan.

Kolom **Mulai dari** menjelaskan apakah item ini dibangun dari nol atau
menyempurnakan yang sudah hidup — dua item INTI ternyata yang kedua (§2c).

| # | Sub-menu | Kelompok | Rusak kalau tak ada | Mulai dari | Prasyarat data | Bobot |
|---|---|---|---|---|---|---|
| 1 | **Laporan keuangan** — neraca & L/R | 14 Keuangan | Owner tak bisa melihat posisi perusahaan; ini pertanyaan pertama tiap calon pelanggan | 🟡 arus kas ✅ · **GL sudah sehat** (§3a) | akun diklasifikasi neraca/L-R | **M** |
| 2 | **Interim Payment Certificate (IPC)** | 15 Penagihan | Termin tak bisa ditagih secara formal ke owner proyek; ini pintu masuk UANG | ✅ **SELESAI 2026-08-07** (§3b) | progress terverifikasi + retensi | L |
| 3 | **Retensi subkontrak** | 8 Subkontraktor | Retensi mandor/subkon tak terlacak → dibayar penuh padahal harus ditahan; kebocoran uang langsung | 🟡 UI hidup (2026-08-06) | kontrak subkon + termin | M |
| 4 | **Claims management** | 3 Kontrak | Klaim tambah-kurang tak punya jejak; saat sengketa, tak ada bukti | 🟡 UI hidup (2026-08-06) | kontrak + variation order | L |
| 5 | **Surat masuk/keluar (correspondence)** | 3 Kontrak | Korespondensi kontraktual tak terdaftar → notifikasi keterlambatan tak bisa dibuktikan | 🟡 UI hidup (2026-08-06) | register dokumen | M |
| 6 | **Instruksi lapangan** | 9 Lapangan | Perintah lisan tak berjejak; dasar klaim biaya tambahan hilang | 🟡 UI hidup (2026-08-06) | proyek + scope | S |
| 7 | **Non-Conformance Report (NCR)** | 9 Lapangan | Ketidaksesuaian mutu tak punya siklus tutup; tender pemerintah mensyaratkannya | 🟡 UI hidup (2026-08-06) | punch list (✅ ada) | M |
| 8 | **Geotag foto** | 20 Mobile | Foto tanpa koordinat tak membuktikan pekerjaan dilakukan **di lokasi itu** — dasar sengketa progres | 🟡 UI + migrasi 190 | kolom GPS (0 kolom hari ini) | S |
| 9 | **Absensi lapangan** | 20 Mobile | Upah harian dihitung dari ingatan mandor; ini sumber selisih paling sering | 🟡 UI hidup (2026-08-06) | worker + assignment (✅ ada) | M |

### 3a. INTI #1 TIDAK terblokir — koreksi, saya salah menyatakannya

Versi pertama dokumen ini menulis bahwa laporan keuangan **terblokir R-001**
(cacat P0 migrasi 047 vs 167). **Itu salah, dan salahnya cukup besar untuk
mengubah rencana kerja** — ia membuat item paling penting tampak tak bisa
disentuh sama sekali.

Diukur 2026-08-04, bukan dibaca dari dokumen:

| Yang diperiksa | Hasil |
|---|---|
| `RATIFIKASI.md` R-001 | **SELESAI** — 047 dipensiunkan jadi no-op berkomentar, penegas bentuk `175` terpasang, terbukti bekerja di lingkungan bersih |
| `accounts` · `journal_entries` · `journal_entry_lines` | ketiganya **punya `company_id`** (`introspect.mjs`) — bentuk 167 yang menang, bukan 047 |
| `apps/api/src/routes/v1/gl.ts` | **7 endpoint hidup**: bagan akun · jurnal · posting · void · buku besar · **neraca saldo** |
| `apps/web/app/(dashboard)/akuntansi/page.tsx` | halaman hidup: Bagan Akun · Jurnal · Neraca Saldo (dengan pemeriksaan seimbang) |

**Fondasinya sehat dan sudah dipakai.** Yang benar-benar belum ada hanya dua
laporan turunan di atasnya — **neraca (balance sheet)** dan **laba/rugi** —
plus klasifikasi akun mana masuk neraca dan mana masuk L/R.

Karena itu bobotnya turun **L → M**, dan tak ada satu pun INTI yang terblokir.

**Kenapa hanya 9.** Uji "calon pelanggan pergi" sengaja ketat. Item seperti
CPM, resource histogram, atau tanda tangan elektronik memang membuat produk
lebih baik — tapi tak ada kontraktor yang membatalkan pembelian karena
ketiadaannya. Menaruhnya di INTI membuat kata "INTI" kehilangan arti, dan
daftar yang semuanya prioritas sama dengan tidak punya prioritas.

### 3b. Koreksi kedua — enam item, 2026-08-06

§3a mencatat satu item salah status. Diukur ulang 2026-08-06: **enam item lagi**
(#3,4,5,6,7,9) ditulis "🔴 nol" padahal UI-nya hidup, dan #8 sudah punya migrasi
190 + `penanda-lokasi.tsx`.

Sekali adalah kekeliruan; tujuh kali adalah cacat sistemik tanpa penjaga.
`audit-taksonomi-vs-kode.mjs` sebenarnya bisa mendeteksinya, tetapi keenam modul
itu **tak punya entri `PETA`** sehingga tak pernah diperiksa — ia melaporkan
"status BASI: 0" dengan percaya diri. F8-1 menutup lubang itu.

---

## 4. PEMBEDA — 12 item

Tiap item dipetakan ke pembeda yang dinaikkannya. Angka dalam kurung adalah
skor hari ini (`PETA-PRIORITAS-ERP.md` §6).

### Cost control berlapis (3/5) — 5 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **Cost Value Reconciliation (CVR)** | Membandingkan biaya terpakai vs nilai terpasang; inilah yang membedakan ERP kontraktor dari pencatat biaya | L |
| **Profitabilitas per cost code** (🟡 per proyek sudah hidup di `/finance/profitability`) | Laba per **cost code**, bukan hanya per proyek — inilah yang menunjukkan pekerjaan mana yang merugi | S |
| **Manajemen contingency** | Cadangan risiko terlacak, bukan hilang ke dalam "biaya lain-lain" | M |

#### DITUNDA berdasar ukuran — CVR (diukur ulang 2026-08-07)

CVR mengadu **biaya terpakai** vs **nilai terpasang**. Sisi kanan sudah ada
(373 `rab_items`). Sisi kiri belum:

```
project_expenses      0 baris    ← sumber biaya yang seharusnya dipakai
goods_receipts        8 baris    ┐ biaya nyata tersebar di sini,
progress_payments     5 baris    ┘ tanpa satu pun cost code yang mengikat
cost_codes           44 baris    ← kerangkanya ada, isinya belum
```

Membangun layar CVR di atas `project_expenses` yang kosong menghasilkan
halaman yang **selalu menampilkan nol** — dan nol di layar rekonsiliasi biaya
tak terbaca sebagai "belum ada data", melainkan sebagai "tidak ada selisih".
Itu kabar baik palsu tentang angka yang paling menentukan untung-rugi proyek.

**Prasyaratnya bukan kode, melainkan pemakaian**: biaya proyek harus benar-
benar dicatat ke `project_expenses` dengan cost code. Sampai itu terjadi, yang
bisa dibangun hanya cangkang.

Diukur ulang 2026-08-07 — angkanya **tidak berubah** sejak penundaan pertama.

**SELESAI** (`/keuangan/contingency`, migrasi 200). Diukur: NOL kolom
contingency di seluruh basis, padahal CO-001 sudah menyetujui Rp 50 juta pada
kontrak Rp 570 juta tanpa jejak cadangan mana yang berkurang.

Dua tabel, bukan satu kolom: `pos_contingency` (berapa disisihkan) +
`penggunaan_contingency` (tiap penarikan, alasannya WAJIB). Sisa **dihitung**,
tidak disimpan — kolom sisa yang basi dipakai menyetujui pengeluaran
berikutnya. Penarikan melebihi cadangan tetap diterima basis lalu ditandai
`terlampaui`: menolaknya akan menyembunyikan kejadian yang paling perlu
dilihat. 9 mutasi perhitungan + 5 mutasi skema, seluruhnya tertangkap.
| **Analisa keterlambatan** | Menghubungkan keterlambatan ke biaya — dasar klaim EOT | M |

**SELESAI** (`/proyek/keterlambatan`, migrasi 198) — **tanpa tabel baru.**
Ketiga bahannya sudah ada dan tak pernah diadu: `milestones.target_date`,
`contract_eot.days_approved`, `projects.penalty_*`.

Diukur: 16 milestone telat (12 berjalan, 4 selesai-terlambat), terparah 67
hari. Yang paling dijaga: **EOT yang disetujui MEMBEBASKAN** — menuduh atas
keterlambatan yang sudah dimaafkan bisa dibantah dengan satu lembar surat.
Delapan mutasi, delapan tertangkap.
| **Eskalasi harga** → dibangun sebagai **Riwayat Harga Material** | Pergerakan harga material sepanjang waktu | S |

**SELESAI** (`/procurement/riwayat-harga`, migrasi 197) — **dengan nama yang
diganti, dan itu bagian dari temuannya.**

Diukur pada data nyata, arah pergerakannya KEBALIKAN dari yang saya klaim:

```
Besi Beton Ø12mm SNI   17 Mar 120.000 → 04 Agu 100.000   TURUN 16,7%
Besi Beton Ø10mm SNI   17 Mar  85.000 → 04 Agu  80.000   TURUN  5,9%
```

Saya sempat melaporkan "+20%" karena menghitung `max − min` tanpa
memperhatikan urutan waktu. Layar bernama "Eskalasi" menjanjikan kenaikan;
pembacanya akan menyimpulkan kenaikan bahkan saat angkanya turun.

Dua jebakan lain yang ditemukan saat mengukur:

- **`materials.unit_price` bukan acuan kontrak** — ia harga TERKINI, ditimpa
  tiap kali diperbarui. Membandingkan PO terhadapnya akan selalu melaporkan
  0%: layar yang selamanya bilang "aman".
- **Beda harga bisa berarti beda VENDOR** — `Pasir Pasang` punya dua harga di
  tanggal yang SAMA dari dua supplier. Itu rentang penawaran (urusan RFQ),
  bukan pergerakan harga.

### Rekonsiliasi material (1,5/5 — paling lemah) — 3 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **Tracking waste / susut** | Selisih material dibeli vs terpasang — kebocoran terbesar di proyek konstruksi | M |
| **Transfer stok antar proyek** | Material pindah proyek tanpa jejak = selisih yang tak pernah terjelaskan | M |
| **Material milik klien (free issue)** | Material owner tercampur material sendiri | S |

#### Kemajuan & satu penundaan berdasar ukuran — 2026-08-06

**SELESAI — "Tracking waste / susut"** dibangun sebagai halaman
**Rekonsiliasi Material** (`/gudang/rekonsiliasi`, commit `3d5a38b`). Ia
mengadu keempat sumber angka yang selama ini tak pernah dibandingkan: RAB,
penerimaan barang, pemakaian lapangan, sisa gudang.

**DITUNDA — "rencana susut vs susut nyata".** Rencananya melengkapi halaman di
atas dengan pembanding: bukan sekadar "12% hilang", tapi "12% hilang padahal
yang dianggarkan 5%". Diukur lebih dulu, dan datanya belum ada:

```
assemblies                              3.043 baris
  waste_factor > 0                          1 baris   ← 1 dari 3.043
tabel ber-assembly_id DAN material_id   (tak ada)     ← tak ada jalur
                                                         assembly → material
```

`waste_factor` hidup di `assemblies` (AHSP) dan memang dipakai kode
(`routes/v1/ahsp.ts`), tapi **tak ada jalur** dari sana ke material di RAB
proyek. Membangun layar "rencana vs nyata" di atas kolom yang kosong pada
3.042 dari 3.043 baris menghasilkan layar yang tampak berwibawa dan tak
mengatakan apa-apa — persis jenis kepercayaan palsu yang paling mahal pada
angka yang menuduh orang.

**Pemicu untuk membangunnya:** `waste_factor` terisi pada bagian berarti dari
assembly yang dipakai proyek nyata, DAN ada relasi assembly→material. Sampai
itu ada, pembandingnya hanya bisa ditebak.

**SELESAI — "Transfer stok antar proyek"** (`/gudang/transfer`, migrasi 193).
Ia menutup cacat yang merusak halaman rekonsiliasi: material yang PINDAH
terbaca sebagai HILANG. Dibuktikan dengan angka — 10 batang besi mengubah
baris dari `susut 0%` jadi `susut 5%`, satu batang lagi dari "Susut tinggi".

**SELESAI — "Material milik klien (free issue)"** (`/gudang/material-klien`,
migrasi 194). Owner memasok sendiri material tertentu; tanpa jalur tersendiri
ia masuk lewat penerimaan pembelian dan merusak dua angka: penyebut susut,
DAN `lebih_beli` terhadap RAB (perusahaan tampak memborong material yang tak
pernah ia beli).

> Rancangan pertamanya menaruh penanda di `goods_receipts` dan **dibatalkan
> oleh uji invariannya sendiri**: `po_id`/`supplier_id` di sana NOT NULL, jadi
> jalur itu menuntut `DROP NOT NULL` pada tabel data finansial hidup —
> Gerbang Keras G-2. Diganti tabel tersendiri sebelum satu baris pun ditulis.
> Tripwire-nya permanen di CI.

Dengan keduanya, kelompok **rekonsiliasi material (1,5/5 — paling lemah)
tuntas 3/3**.

**Catatan atas item asal "Transfer stok antar proyek"** — dipilih karena bukan
hanya item tersendiri, tapi **cacat yang merusak halaman yang baru dibangun**:

```
stock_movements  punya project_id, TIDAK punya lawan-proyeknya
movement_type    dipakai: usage · goods_receipt · adjustment  (nol 'transfer')
material di >1 proyek                     4 material          ← sudah nyata
```

Material yang pindah proyek hanya bisa tercatat sebagai dua baris yang tak
saling mengenal — dan di Rekonsiliasi Material ia muncul sebagai **susut tak
terjelaskan di proyek asal**. Menuduh orang atas material yang sebenarnya
pindah, bukan hilang.

### Rantai kontrak (4/5) — 2 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **Tender & award subkontraktor** | Menutup rantai owner → kontraktor → subkon | L |

**SELESAI 2026-08-07** — backend (migrasi 201, 22 invarian) **dan** UI
(`/mandor/tender`, menu diarahkan migrasi 203).

Layar menolak menampilkan tiga hal sebagai kabar baik, dan ketiganya
diperiksa lewat potret pada data uji, bukan diklaim:

- yang menyatakan tidak menawar tampil **"tidak menawar"**, bukan "Rp 0" —
  nol adalah angka terkecil, dan di kolom yang sedang dibandingkan besarannya
  ia menang sebagai termurah sebelum satu kata pun dibaca
- penawaran **−28,5% dari perkiraan** ditandai "Terlalu rendah" oranye
  meski ia yang termurah; kartu KPI "Termurah" ikut berubah oranye dengan
  keterangan "periksa lingkupnya"
- **pemenang bukan termurah** dinyatakan terang-terangan beserta selisih
  rupiahnya, dan alasan tertulisnya ditampilkan — atau ketiadaannya ditagih

axe-core WCAG 2.1 AA: **nol pelanggaran, mode terang dan gelap**.

Diukur: 20 lingkup kerja Rp 15jt–280jt, SELURUHNYA `unsigned`, tanpa satu pun
jejak bagaimana mandornya dipilih.

Memakai `workers` (mandor = padanan lokal subkon), BUKAN tabel
`subcontractors` baru: membuat daftar terpisah menciptakan dua sumber
kebenaran tentang siapa mengerjakan apa.

Yang paling dijaga — dan dibuktikan e2e pada data nyata:

```
perkiraan  Rp 100.000.000
Agung       Rp  60.000.000   terlalu_rendah  (−40%)  ← BUKAN "termurah"
Bebeng      Rp  95.000.000   wajar           (−5%)
Suswoyo     tak menawar

pemenang Bebeng · BUKAN-termurah=true · selisih Rp 35.000.000
```

Penawaran terendah justru yang paling berisiko: 40% di bawah perkiraan
biasanya berarti ada lingkup tak terhitung, dan itu kembali sebagai klaim
tambah atau pekerjaan mangkrak. 8 mutasi perhitungan + 5 mutasi skema,
seluruhnya tertangkap; 22 invarian basis hijau (termasuk **dua pemenang
ditolak** lewat index unik parsial).
| **Register asuransi** | Bukti pertanggungan saat klaim; sering disyaratkan kontrak | S |

**SELESAI** (`/kontrak/asuransi`, migrasi 199). Diukur lebih dulu: NOL tabel
dan NOL kolom asuransi di seluruh basis.

SENGAJA tidak memakai `contract_bonds` walau polanya mirip — isinya jaminan
BANK (CHECK membatasi ke penawaran/pelaksanaan/uang_muka/pemeliharaan).
Memaksa polis ke sana berarti melonggarkan CHECK jaminan, dan sesudah itu tak
ada yang membedakan "jaminan cair" dari "polis kadaluarsa".

Yang membuatnya berguna bukan daftarnya, melainkan **celah pertanggungan**:
polis 1 Mar–30 Jun pada proyek 1 Feb–31 Jul meninggalkan **59 hari tanpa
penanggung** (28 awal, 31 akhir). Dihitung dua arah terpisah — telat di depan
tidak tertutup oleh lebih di belakang. 8 mutasi perhitungan + 5 mutasi skema,
seluruhnya tertangkap.

### Procurement berbasis penawaran — 2 item

**KEDUANYA SELESAI** (`/procurement/rfq`, migrasi 195). Diukur lebih dulu pada
data nyata: material yang sama dibeli dari 3 supplier dengan rentang 20%
(Rp100.000..Rp120.000), dan 5 dari 7 PO lahir langsung dari MR — harga datang
dari satu vendor langganan, bukan dari perbandingan.

RFQ dan tabulasi digabung dalam SATU layar: perbandingan tanpa RFQ-nya adalah
tabel angka tanpa konteks (tak terlihat kapan diminta, sampai kapan batasnya,
dan vendor mana yang diundang tapi diam).

> `bids` yang sudah ada ternyata sisi **JUAL** (kita menawar ke owner), bukan
> sisi beli — tak ada yang bisa dipakai ulang.

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **RFQ ke vendor** | Harga dari perbandingan, bukan dari satu vendor langganan | M |
| **Perbandingan penawaran (bid tabulation)** | Bukti pemilihan vendor — dasar audit pengadaan | M |

**Kenapa EVM dan WIP/PSAK tak muncul di sini.** Keduanya sudah 3,5/5 dan 4/5 —
sudah hidup, tinggal disempurnakan (WIP menunggu GL yang sama dengan INTI #1).
Yang butuh item baru adalah tiga pembeda yang masih rendah.

---

## 5a. Pemicu diukur ke DATA — 2026-08-07

> Menjawab *"sisa yang ditunda sekarang berapa? kenapa ditunda? gimana agar
> bisa lanjut?"*
>
> **Masih 25** — tak satu pun berubah, karena tak satu pun dikerjakan. Yang
> dikerjakan sejak triase ini ditulis datang dari daftar INTI/PEMBEDA/fase,
> bukan dari sini.

Tabel di §5 menyebut pemicunya. Berikut **jaraknya ke ambang**, diukur ke
basis hari ini — bukan diperkirakan:

| Pemicu | Ambang | Hari ini | Jarak |
|---|---|---|---|
| Vendor banyak | > 30 | **5 supplier** | jauh |
| Alat milik sendiri | > 5 unit | **0 aset** | belum mulai |
| Subkon formal ber-kontrak | ada 1 | **0** `work_scopes` ber-`contract_status='signed'` | belum mulai |
| Pengadaan berulang | vendor sama berkali-kali | **7 PO ke 5 vendor** | hampir tak berulang |
| Retur/koreksi tagihan | ada 1 | **0** — jenis invoice yang ada cuma `termin_billing`, `commission_billing` | belum pernah |
| Pertukaran dokumen formal | ada | **0 dokumen** | belum mulai |
| Syarat K3 formal owner | ada | **0 jaminan**, **0 polis** | belum mulai |
| Jadwal dinegosiasikan owner | ada | **39 milestone** di 15 proyek | **satu-satunya yang berisi** |
| Mode offline penuh | baca + tulis | F4-3 `done` — tapi **TULIS saja** (6 jalur) | separuh |

### Kesimpulan: 24 dari 25 belum terpicu, dan itu bukan kelambatan

Yang menahan bukan kapasitas kerja, melainkan **kenyataan bisnis**. Membangun
prakualifikasi vendor untuk 5 supplier, atau maintenance terjadwal untuk nol
alat, berarti menebak bentuk dari nol contoh nyata — dan bentuk yang salah
lebih mahal daripada belum ada: ia harus dirawat selamanya sambil menghalangi
bentuk yang benar.

### Dua yang PALING DEKAT, dan cara membangunkannya

**1. Dua item mobile (permintaan bahan & checklist mutu di lapangan)** —
pemicunya "setelah mode offline penuh". F4-3 sudah `done`, tapi ia menutup **jalur TULIS** saja
(progress, kasbon, kasbon-tukang, laporan-upah, penagihan, tukang). Yang
kurang: **membaca offline** — daftar material dan checklist harus bisa dibuka
tanpa sinyal, bukan cuma dikirim.

> **Cara melanjutkan:** perluas `antrean-offline` ke sisi baca (cache daftar
> material + checklist di IndexedDB). Ini pekerjaan yang bisa saya kerjakan
> tanpa keputusan founder — dan satu-satunya item TUNDA yang begitu.

**2. Jalur kritis & perataan sumber daya** — 39 milestone sudah ada, dan itu
bahan mentahnya. Yang belum: **ketergantungan antar-milestone** (A selesai
baru B mulai). Tanpa itu, perhitungan jalur kritis tak punya yang dihitung.

> **Cara melanjutkan:** butuh keputusan founder — apakah proyek Anda memang
> punya jadwal yang dinegosiasikan owner dengan denda keterlambatan per-
> milestone? Kalau tidak, CPM adalah alat untuk masalah yang belum ada.

### Sisanya: cara membangunkannya sama untuk semua

Pemicu itu **keadaan bisnis, bukan tombol**. Ia menyala sendiri saat:

- vendor ke-31 didaftarkan → prakualifikasi jadi masuk akal
- alat keenam dibeli → log pemakaian & maintenance punya yang dilacak
- satu subkon ditandatangani formal → evaluasi kinerja punya yang dinilai
- satu retur pertama terjadi → nota kredit punya kasus nyata

**Yang perlu Anda lakukan: tidak ada.** Kalau salah satu keadaan itu terjadi,
katakan — item terkait pindah dari TUNDA ke INTI/PEMBEDA (CHARTER: *"kalau
pemicu terjadi, item pindah — bukan langsung dikerjakan dari daftar ini"*),
dan saya kerjakan dengan bentuk yang diturunkan dari kasus nyata itu.

---

## 5. TUNDA — 25 item, dengan pemicunya (18 tersisa)

Tak dikerjakan sampai pemicunya nyata. **Kalau pemicu terjadi, item pindah ke
INTI atau PEMBEDA — bukan langsung dikerjakan** dari daftar ini.

| Sub-menu | Jml | Pemicu yang membangunkannya |
|---|---|---|
| ~~Prakualifikasi vendor · Dokumen prakualifikasi~~ | ~~2~~ | ✅ **SELESAI 2026-08-07** — dibangun atas keputusan founder meski pemicu (>30 vendor) belum menyala; basis belum operasional, jadi bentuknya diturunkan dari praktik pengadaan konstruksi |
| Evaluasi kinerja subkontraktor · Kepatuhan (izin, asuransi, pajak) | 2 | Subkon formal ber-kontrak mulai dipakai (hari ini sistemnya mandor) |
| Kalender kerja & hari libur | 1 | Penjadwalan mulai dipakai untuk komitmen kontraktual |
| Critical path (CPM) · Resource histogram / leveling · Method statement | 3 | Proyek dengan jadwal yang benar-benar dinegosiasikan owner |
| Kontrak payung / blanket order · Expediting & logistik | 2 | Volume pengadaan berulang dari vendor yang sama |
| ~~Evaluasi kinerja vendor~~ | ~~1~~ | ✅ **SELESAI 2026-08-07** — skor berbobot, titik lemah per-dimensi, daftar hitam beralasan |
| ~~Log pemakaian alat · Maintenance terjadwal · Biaya operasional per alat (BBM, operator)~~ | ~~3~~ | ✅ **SELESAI 2026-08-07** — dibangun atas keputusan founder meski pemicu (>5 alat milik sendiri) belum menyala. Interval ganda **jam ATAU hari**, mana yang lebih dulu; biaya per jam bernilai "—" saat jam operasi nol, bukan hasil bagi-nol |
| ~~Integrasi penyusutan → GL~~ | ~~1~~ | 🟡 **SEBAGIAN 2026-08-07** — tabel `penyusutan_alat` + `journal_entry_id` hidup dan terisi (migrasi 211), constraint menolak jurnal setengah jadi. Penjurnalan **otomatis** ke GL masih menunggu **R-001** (bentrok 047/167) — bukan menunggu aset |
| Izin kerja (work permit) | 1 | Proyek dengan syarat K3 formal dari owner |
| Transmittal · Register gambar · Notulen rapat · Matriks distribusi | 4 | Proyek dengan pertukaran dokumen formal berlapis |
| Tanda tangan elektronik | 1 | Dokumen mulai ditolak karena butuh tanda tangan sah |
| Distribusi laporan terjadwal | 1 | Ada penerima tetap yang memintanya |
| Nota kredit | 1 | Ada retur/koreksi tagihan pertama |
| Material request (mobile) · Checklist inspeksi (mobile) | 2 | Setelah mode offline penuh — F4-3 baru menutup jalur TULIS |
| | **18** | tiga item vendor + empat item alat selesai 2026-08-07 |

### Tiga yang TIDAK dihitung di sini — sudah 🟡, bukan merah

Ketiganya punya bagian yang masih 🔴 (§2c), tapi karena sebagian sudah hidup,
ia berjalan sebagai penyempurnaan — bukan item baru yang menunggu pemicu:

| Baris 🟡 | Pemicu penyempurnaannya |
|---|---|
| **KPI** (DSO · backlog) | Setelah PEMBEDA cost control jalan — KPI tanpa data di belakangnya adalah angka hiasan |
| **e-Faktur / e-Bupot** (generate) | Tidak ada — generate diputuskan pakai Coretax |
| **Master Subkontraktor** (subkon formal) | Subkon > 10 aktif bersamaan |

---

## 6. Cara mengukur ulang — jangan salin angka dari sini

```bash
# ⚠️ Perhatikan `sel[2] === '🔴'` — kolom Status, BUKAN `b.includes('🔴')`.
# Versi pertama dokumen ini memakai includes() dan mendapat 64, bukan 54:
# sembilan baris 🟡 memuat 🔴 di kolom Catatan sebagai keterangan "sebagian
# sudah hidup". Selisih 19% — cukup untuk salah memprioritaskan.
node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs'
const t = readFileSync('docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md','utf8').replace(/\r/g,'')
const atas = t.split('## KEPUTUSAN ATAS')[0]
let bagian = '?'; const merah = []
for (const b of atas.split('\n')) {
  const h = b.match(/^## (\d+\..+)$/); if (h) { bagian = h[1]; continue }
  if (!b.startsWith('|')) continue
  const sel = b.split('|').map(s => s.trim())
  if (sel[2] === '🔴') merah.push({ bagian, nama: sel[1] })   // ← kolom Status
}
console.log('MERAH (kolom Status):', merah.length)
JS

# Sub-menu yang digarap TANPA jejak rancangan (penjaga terpisah, item lain)
node apps/api/scripts/audit-rancangan-submenu.mjs
```

Dua alat itu menjawab pertanyaan berbeda: yang pertama *"apa yang belum
dikerjakan"*, yang kedua *"apa yang dikerjakan tanpa dirancang"*. Jangan
menukarnya.

---

## 7. Yang menunggu founder

**Nihil — semuanya sudah terjawab.**

1. ~~Definisi tiga golongan (§1) belum diratifikasi.~~
   ✅ **DIRATIFIKASI 2026-08-04** — founder: *"okee setujuuu"*.
   Tercatat sebagai **R-010** di `RATIFIKASI.md`. Definisi §1 sekarang
   **mengikat**, dan dokumen ini adalah penerapannya. Membatalkannya: tulis
   `TOLAK R-010` + definisi pengganti; isi ketiga daftar disusun ulang,
   penjaganya tak perlu diubah.

### Yang SUDAH terjawab — tak perlu ditunggu

| Butir versi pertama | Kenyataan |
|---|---|
| *"INTI #1 terblokir R-001"* | **SALAH.** R-001 sudah SELESAI; GL sehat dan tenant-aware; 7 endpoint + halaman akuntansi hidup. Yang belum hanya neraca & L/R. Bukti: §3a |
| *"Angka judul QUEUE (93) tak cocok kenyataan (64)"* | Angka **64 itu pun salah** (§0). Yang benar 54. Judul QUEUE sengaja **tidak** diubah — biar terlihat angkanya pernah salah dan kapan dikoreksi |
