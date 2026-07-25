# AHSP Workbook Recon — SE Bina Konstruksi No. 47/SE/Dk/2026

> **Read-only recon. Belum ada parser/seed yang dibangun.** Sumber di `_source/ahsp/`
> (gitignored, ~97 MB). Semua angka di sini dibaca dari file, bukan diketik ulang.

## Provenance sumber (SHA256 — dasar tabel provenance di bawah)

| File | Peran | SHA256 |
|---|---|---|
| `AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm` (6,8 MB) | **DB AHSP nasional** — sumber seed koefisien | `25c3e3bb93d63326f8359d90e6966f3ed68b6c95a667ae1e88b609d38ea5dcea` |
| `Format RAB Khusus Bangunan Gedung AHSP NO 47Tahun 2026.xlsm` (9,6 MB) | DB AHSP (duplikat) + wrapper output RAB gedung | `73a3294b108eaf1019782ed014e7ed3cb0dd10e69eec0c338629dc78593da6ee` |
| `Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm` (23 MB) | Template RAB proyek (metodologi produktivitas) | `603cfa89f7bc1fc8ed66c1d2aab753eead40e6b89f8107f073f166375039ee6f` |
| `Lampiran-VI-...pdf` (56 MB) | Acuan otoritatif (cross-check, tak diparse) | — |
| `Spesifikasi Teknis.xlsx` (85 KB) | Spek teknis struktur/arsitektur/MEP/sanitari | `4345e3bb41b186ee8e8ae6e99b8f21efed3318aaf0bd97f5a63082068db9f806` |

---

## a. Inventaris sheet

- **AHSP CIPTA KARYA** (42 sheet): 2 master (`Upah Bahan` 4188r = harga dasar upah/bahan/alat;
  `Daftar Harga Satuan Pekerjaan` 3688r = indeks pekerjaan) + 1 hidden + **~39 sheet domain**
  (Persiapan, Galian Tanah, Beton, Pondasi, Pasangan Dinding, Plesteran Dan Acian, Penutup Lantai,
  Jaringan Listrik, Perpipaan, dst) yang memuat blok-blok AHSP.
- **Format RAB Khusus Bangunan Gedung** (62 sheet): memuat `Upah Bahan`+`Daftar Harga`+39 sheet domain
  **yang sama** dengan file utama (row count ≈ identik) **plus** wrapper output: `LAPORAN RAB`,
  `Hitungan Volume`, `Kebutuhan Bahan Gedung`, `Kebutuhan Tukang`, 22 sheet BBS (Bar Bending Schedule).
- **Format RAB Control** (117 sheet): **BUKAN** DB AHSP mentah — template proyek: `HOME` (dashboard makro),
  `ITEM PEKERJAAN`, `HARGA BAHAN` (harga proyek), `LAPORAN RAB`, `REKAPITULASI`, `KURVA S`, lalu ~100 sheet
  kalkulator per-elemen bangunan contoh (FOOT PLAT, SLOOFE, KOLOM LT1/LT2, DINDING BATA MERAH, dst).

## b. Anatomi satu blok AHSP (mentah — `Pasangan Dinding` 3.6.1.1)

```
r5   3.6.1.1  Pemasangan 1 m2 dinding bata merah tebal 1 batu ... (1SP:2PP)   I5=ROUNDDOWN(I22,-2)=278300   L5=0.1
r6   No | Uraian | Sat. | Koefisien | Harga Satuan (Rp) | Jumlah Harga (Rp)      ← header (kolom C D F G H I)
r7   A  TENAGA KERJA
r8   1  Pekerja        OH  0.4     H=VLOOKUP(D8,upahbahan,..)=100000   I=G8*H8=40000
r9   2  Tukang batu    OH  0.2     =145000                              =29000
r10  3  Kepala tukang  OH  0.02    =175000                              =3500
r11  4  Mandor         OH  0.0067  =200000                              =1340
r12     JUMLAH TENAGA KERJA                                    I=SUM(I8:I11)=73840
r13  B  BAHAN
r14  1  Bata merah     buah 143.81 =700     =100667
r15  2  Semen (PC)     kg   43.5   =1300    =56550
r16  3  Pasir pasang   m3   0.08   =275000  =22000
r17     JUMLAH HARGA BAHAN                                     I=SUM=179217
r18  C  PERALATAN
r19     JUMLAH HARGA ALAT = 0
r20  D  Jumlah (A+B+C)                    I=I19+I17+I12=253057
r21  E  Biaya Umum dan Keuntungan 10-15% x D   H=$L$5=0.1   I=I20*0.1=25305.7
r22  F  Harga Satuan Pekerjaan (D+E)      I=SUM(I20:I21)=278362.7
```

**Pemetaan ke CECEP:** blok = **assembly** (`code`=3.6.1.1, `name`=uraian, `output_unit`=m2, `source='national'`);
baris A/B/C = **assembly_components** (`resource`=uraian, `unit`=Sat., `coefficient`=Koefisien angka polos).
Faktor E (BUK 10%) = **config overhead/profit**, bukan data. Harga (H) = **ilustrasi**, tak diseed.

## c. NILAI vs FORMULA (jebakan `data_only`)

- **Koefisien = LITERAL** di 16.126 baris; **hanya 43 baris koefisien-formula** (0,27%) — semuanya
  `=<sel lain>` (koefisien berulang), cache **terisi**, terkonsentrasi di `Persiapan`(2), `Jaringan Listrik`(5),
  `Perpipaan`(banyak). **Nol** di sheet struktur/pasangan (thin-slice → 100% literal, tanpa risiko cache).
- **Harga (H) & Jumlah (I) = FORMULA** (`VLOOKUP`, `SUM`) dengan cache terisi — tapi tak kita pakai.
- **Aturan parser:** baca koefisien via `data_only=False` (angka literal). Bila sel koefisien ternyata
  string diawali `=` → **HARD FAIL + lapor baris**, jangan pernah diam-diam `None`.

## d. Kamus satuan (diturunkan dari DATA, bukan tebakan)

**Satuan RESOURCE** (kolom Sat., 39 sheet, distinct 41). Kanonik + frekuensi:
`OH`(9714) `m3`(1207) `kg`(955) `buah`(883) `m'`(598) `unit`(527) `hari`(451) **`OJ`(315)** `m`(239)
`jam`(178) `m2`(138) `liter`(114) `lembar`(79) `lot`(48) `tube`(17) `batang`(16) `set`(6) `pohon`(8)
`Polybag`(8) `ikat`(2) `daun`(1) `dus`(1) `cm`(1).

**Varian kapitalisasi** (butuh alias→kanonik, BUKAN unit baru): `M3→m3`(5) `Kg→kg`(10) `Buah/Bh/bh→buah`(158)
`Unit→unit`(204) `Hari→hari`(150) `Jam→jam`(53) `M2→m2`(2) `Gulung/gulung→rol`(13) `Pohon→pohon`(3).

**Kompon sewa** (rate alat): `unit hari`(9) `buah hari`(5) `unit/hari`(1) → sewa alat per unit·hari.

**Typo → TOLAK (jangan auto-create):** `bauh`(1) `loat`(2) `lkg`(1) `unir`/`titk`/`sey`/`n2`/`m 2` (di indeks).

**Satuan PEKERJAAN/output** (indeks `Daftar Harga`, distinct 33): `buah`(735) `unit`(501) `m'`(499) `m2`(477)
`m3`(167) `m`(109) `titik`(24) `kg`(18) `set`(10) `btg`(4) `hari`(2) `Ha`(1) + varian/typo (`unir`,`titk`,`hari/m2`…).

### Dampak ke migration 115 (fondasi unit)

Migration 115 sudah menambah **OH**(labor_day) + **jam**(time). Data menunjukkan **masih perlu**:
1. **`OJ`** (orang-jam / man-hour, 315×) — dimension `labor_hour` (baru) atau `time`. **Keputusan Anda.**
2. Konfirmasi **`m'`** (598×, meter-lari) = alias ke `m_linear` existing (090), atau kode kanonik `m1`.
3. **Tabel alias** yang bisa Anda review (varian kapitalisasi + `m²→m2`) — turunan, bukan tebakan.
4. Typo di-**tolak** saat import (bukan diseed).

## e. Kolom harga = ILUSTRASI

`Upah Bahan` H terisi (Pekerja=100000, Bata=700, Semen=1300, Pasir=275000) dengan catatan eksplisit di sel:
*"HARGA UPAH DAN MATERIAL INI DI UBAH SESUAI HARGA DI DAERAH MASING-MASING"*. **Tegas: tak pernah diseed
sebagai `price_book` produksi.** Resource master (`Upah Bahan`) punya **kode** (`L.01` Pekerja, prefix
`L.`=Upah; material/alat berprefiks sendiri) — kode+nama+satuan diseed sebagai **resources**, harganya tidak.

## f. Total item & thin-slice

- **3.143 work item** di indeks (`Daftar Harga Satuan Pekerjaan`), tersebar di 39 domain (bidang Cipta Karya).
- **Usul thin-slice (±25, paling sering dipakai Puraloka — struktur/pasangan/tanah, hindari eksotis):**
  Galian tanah biasa + urugan (Galian Tanah); Beton fc' bertingkat + bekisting + pembesian (Beton, Pondasi);
  Pasangan bata merah 1SP:2/3/4/5PP (Pasangan Dinding); Plesteran + acian (Plesteran Dan Acian);
  Keramik lantai + dinding (Penutup Lantai dan Dinding). Semua koefisien 100% literal → thin-slice aman.

## g. Dua file Format RAB: duplikat atau beda?

- **Khusus Bangunan Gedung** = **duplikat DB AHSP** utama (`Daftar Harga` 3688=3688; 39 sheet domain nama+row
  ≈ identik; beda tipis: Beton 1414↔1412, Sistem Air Hujan 860↔108, Drainase 1776↔1777) **+ wrapper output**.
  Aman dianggap sumber yang sama untuk koefisien.
- **Control 2026** = **BEDA** — pakai `HARGA BAHAN` proyek sendiri (mis. Bata 1000 vs 700, Semen 1516 vs 1300) dan
  meng-**AHSP-ulang dengan metodologi produktivitas** (lihat h/i). Bukan sumber koefisien nasional; ini
  **referensi metodologi** untuk fitur produktivitas & crew-sizing.

## h. Bentuk output RAB resmi (spesifikasi gratis untuk read-model & UI)

`LAPORAN RAB` (Khusus): kolom **No | Uraian Pekerjaan | Volume (a) | Satuan (b) | Harga Satuan (c) |
Total Harga (d=a×c) | Bobot**. Subtotal grup = `SUM(item)`. Bobot% = `grup / grand_total × 100`.
Grand total = `SUM(subtotal grup)`. `REKAPITULASI` (Control): daftar divisi (A..H) → **TOTAL BIAYA =
SUM(divisi)** → **PPN** → **TOTAL = TOTAL BIAYA + PPN**. (Read-model RAB/BOQ kita — `rab-readmodel.ts` —
sudah mengikuti pola grup→bobot→total ini.)

---

## i. PETA PARITAS KAPABILITAS — *Definition of Done* engine kalkulasi

Setiap perhitungan di workbook, rumusnya, dan status di sistem kita.

| # | Perhitungan (sheet) | Rumus Excel (mentah) | Status sistem | Ukuran |
|---|---|---|---|---|
| 1 | **HSD upah/bahan/alat** (`Upah Bahan`) | input manual per daerah (VLOOKUP `upahbahan`) | **BELUM** (price_book/HSD track — sengaja terpisah dari seed) | sedang |
| 2 | **Analisa HSP: Σ koef×HSD per A/B/C** (blok domain) | `I=G*H` per baris; `JUMLAH=SUM(...)`; `D=A+B+C` | **BELUM** (engine kalkulasi inti) | **besar** |
| 3 | **BUK (overhead+profit)** (blok, baris E) | `E = D × L5` (L5=0,10; label "10%–15%") | **BELUM** — wajib **config**, bukan `0.1` inline | kecil |
| 4 | **HSP final + pembulatan** (blok, header) | `HSP = ROUNDDOWN(D+E, -2)` (turun ke Rp100) | **BELUM** (bagian engine) | kecil |
| 5 | **Volume/BOQ** (`Hitungan Volume`, Control) | `N=P×L×Qty`; `Total=SUM−ΣPengurang` (bukaan pintu/jendela) | **BELUM** (modul BOQ) | sedang |
| 6 | **RAB line total** (`LAPORAN RAB`) | `Total = Volume × HSP` | **SEBAGIAN** (`rab-readmodel.ts` hitung line×qty) | kecil |
| 7 | **Subtotal per kelompok** (`LAPORAN RAB`) | `SUM(item grup)` | **ADA** (`computeRab` grup) | kecil |
| 8 | **Bobot %** (`LAPORAN RAB`) | `grup / grand_total × 100` | **SEBAGIAN** (`rab-readmodel`) | kecil |
| 9 | **Rekap divisi** (`REKAPITULASI`) | `= 'LAPORAN RAB'!Jxx` per divisi; `TOTAL=SUM` | **SEBAGIAN** (rollup CBS) | kecil |
| 10 | **PPN** (`REKAPITULASI`) | `PPN = TOTAL × D19` ⚠️ `D19=0,12` tapi label **"11%"** | **BELUM** — rate **config** (per SE), perbaiki bug | kecil |
| 11 | **Grand total** (`REKAPITULASI`) | `= TOTAL_BIAYA + PPN` | **BELUM** (agregasi akhir) | kecil |
| 12 | **Produktivitas & crew** (Control blok A) | `J=(Vol×koef)/Waktu`; `Produktifitas=Vol/(pekerja+tukang)/Waktu` | **SEBAGIAN** (`productivity_records` ada) | sedang |
| 13 | **Take-off bahan/tukang** (`Kebutuhan Bahan/Tukang`) | `ROUNDUP(koef×Vol,0)`; Semen `ROUNDUP(kg/50)` Zak | **BELUM** | sedang |
| 14 | **Kurva S / bobot jadwal** (`KURVA S`) | distribusi bobot per minggu | **SEBAGIAN** (`kurva-s` + `cashflow-forecast`) | sedang |
| 15 | **Terbilang** (grand total) | tak ditemukan di file (manual/VBA) | **ADA** (`utils/terbilang.ts`) | — |
| 16 | **Analisa alat berat** (Galian/Angkut Material) | koefisien jam alat × HSD sewa (`OJ`,`jam`,`unit hari`) | **BELUM** (kasus khusus komponen alat) | sedang |

**Belum ada & inti (urutan bangun):** #2 → #3 → #4 (engine HSP + BUK + pembulatan) → #5/#6/#11 (BOQ→RAB→total) →
#10 (PPN config) → #12/#13/#16 (produktivitas, take-off, alat). #1 (HSD) jalur harga terpisah.

## j. Pembulatan & presisi (penyebab #1 selisih rupiah — tiru PERSIS)

| Titik | File AHSP utama & Khusus | File Control | Keputusan sistem (usul) |
|---|---|---|---|
| Koefisien | literal apa adanya (mis. 0,0067; 143,81) | sama | simpan **NUMERIC apa adanya**, tak dibulatkan |
| HSD (harga dasar) | bulat (100000, 700) input | bulat input | apa adanya (config harga) |
| Σ koef×HSD, subtotal A/B/C, D | **tanpa pembulatan** (desimal penuh) | tanpa pembulatan | desimal penuh (NUMERIC) |
| BUK (E) | `D×0,10` tanpa bulat | `D×0,10` | desimal penuh |
| **HSP (harga satuan pekerjaan)** | **`ROUNDDOWN(D+E, -2)`** → turun ke **Rp100** | **F/Vol, TIDAK dibulatkan** ⚠️ inkonsistensi | **adopsi `ROUNDDOWN(-2)` (SE-baku file utama)** |
| RAB line, subtotal grup, grand total | **tanpa pembulatan** (mis. 5.269.861.528,325) | tanpa pembulatan | desimal penuh sampai penyajian |
| PPN | `TOTAL×0,12` (label 11% ⚠️) | sama | **rate config**, `ROUND` sesuai kebijakan |

> **Prinsip:** pembulatan HANYA di HSP (`ROUNDDOWN` ke ratusan). Semua agregat desimal penuh. Jangan
> pakai default DB/bahasa — kodekan `ROUNDDOWN(x,-2)` eksplisit. Dua file resmi berbeda di titik HSP →
> ini **inkonsistensi Excel** yang kita **rapikan** dengan memilih aturan SE-baku (file AHSP utama).

---

## PROVENANCE — rancangan tempat (diterapkan bersama fondasi unit, belum dibangun)

Setiap batch seed melacak asal-usulnya. Usul DDL (migration terpisah saat seed):

```sql
CREATE TABLE ahsp_import_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file    TEXT NOT NULL,             -- nama file .xlsm
  source_sha256  TEXT NOT NULL,             -- hash isi file (lihat tabel atas)
  se_number      TEXT NOT NULL,             -- 'SE 47/SE/Dk/2026'
  se_date        DATE,
  sheet_scope    TEXT,                      -- sheet/bidang yang diimpor batch ini
  row_count      INT NOT NULL,
  imported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by    UUID REFERENCES users(id),
  notes          TEXT
);
-- assemblies + resources: kolom import_batch_id UUID REFERENCES ahsp_import_batches(id)
--   (national-seeded → isi; company/custom → NULL). Tiap koefisien terlacak balik ke file+sha+SE.
```

## ACCEPTANCE TEST engine — rancangan pola (golden-file, belum dibangun)

- **Fixture golden**: satu RAB nyata dari Anda → simpan **INPUT** (ref AHSP + HSD + volume) dan **EXPECTED**
  di tiap level (HSP per item, subtotal grup, TOTAL BIAYA, PPN, grand total) sebagai angka hardcoded.
- **Test**: engine hitung dari input → assert **== sampai rupiah** di setiap level. Rounding rules (tabel j)
  dikodekan sebagai config; test membuktikan `ROUNDDOWN(-2)` + agregat desimal penuh + PPN-rate cocok.
- **Disiplin M4** (financial): minimal satu test membandingkan hasil dengan hitungan manual hardcoded
  (sudah pola `rab-readmodel.test.ts` / `evm-calculation.test.ts`).

## Dua batas (konfirmasi)

1. **Derived-not-input**: hasil hitung = TURUNAN (snapshot reproducibility M4 sudah menyimpannya), bukan sel
   bebas-timpa ala Excel. Bila override manual perlu → **field terpisah** (`override_value`, `override_by`,
   `override_reason`) di samping `computed_value`, tercatat — bukan menimpa hasil.
2. **Bukan hanya AHSP nasional**: struktur **SUDAH mendukung** `source='company'` berdampingan `'national'` —
   `assemblies.source CHECK IN ('national','company','project','custom')` (107) & CBS `IN ('standard','company','project')`
   (108); guard immutability/versi **source-agnostic** (berlaku sama untuk company). Migration 115
   (output_unit immutable) juga source-agnostic. **Terkonfirmasi.**

## Konfirmasi RAB vs RAP

**Sebagian benar.** Workbook = sisi **RAB/penawaran**: AHSP (Σ koef×HSD) + BUK + PPN. **Namun** file juga
menghitung **BOQ** (`Hitungan Volume`), **produktivitas/crew**, dan **take-off bahan/tukang**
(`Kebutuhan Bahan/Tukang`) — itu perencanaan sisi-estimasi, masih memakai HARGA ESTIMASI, bukan
borongan/aktual. **RAP** (anggaran pelaksanaan: harga riil, borongan mandor, realisasi, settlement)
memang **TIDAK ada** di file ini → **jalur terpisah**, benar. Paritas Excel menuntaskan sisi RAB + BOQ +
produktivitas; RAP dibangun terpisah di atas fondasi yang sama (resources/units/CBS).

---

## Keputusan founder — TERKUNCI (2026-07-25)

1. **Satuan OJ & dimensi `labor_time`** (migration 116, applied dev): OH & OJ berbagi satu dimensi
   `labor_time` (orang×waktu, sebanding 1 OH=7 OJ per SNI — **dokumentasi saja, TANPA converter**).
   Pembeda tenaga/alat/kalender via `resources.category`, **bukan** diduplikasi di `unit.dimension`.
   `jam` & `hari` (alat/kalender) = `time`. (`labor_day` dari 115 → di-rename `labor_time`.)
2. **`m'` (meter-lari)** → **alias impor** ke `m_linear` existing (090), bukan kode baru. Masuk tabel
   alias yang bisa direview saat parser dibangun (belum).
3. **Pembulatan HSP** = **`ROUNDDOWN` ke Rp100 resmi (SE-baku)**, TAPI simpan **DUA nilai**:
   `hsp_raw` (desimal penuh) + `hsp_rounded`. **Aturan keras:** seluruh rantai dokumen resmi
   (HSP→subtotal→total→PPN→grand total) dihitung dari nilai **SUDAH dibulatkan** — supaya penjumlahan
   dokumen cetak selalu cocok; **jangan pernah dicampur**. `hsp_raw` hanya untuk analisis internal,
   margin, RAP — **tak pernah** masuk rantai dokumen. Mode + step pembulatan = **config ber-effective-date**
   (SE berubah 68/2024→47/2026; pemilik proyek kadang minta penyajian beda). Tapi **adanya tahap
   pembulatan = struktural (Ember [C]), tak bisa dimatikan dari UI**.
4. **PPN** = **config ber-effective-date**, bukan konstanta di mana pun.
5. **Inkonsistensi 11% vs 0,12** & **beda pembulatan HSP antar file** → **TIDAK diselesaikan diam-diam**.
   Masuk **Daftar Cacat Excel** (dokumen terpisah), lalu **tanya founder**.
6. **Disiplin paritas**: reproduksi angka Excel PERSIS **dulu** (termasuk yang cacat). Perbaikan yang
   **mengubah angka** → **config flag DEFAULT OFF** (pola denda keterlambatan) + **satu ADR per perbaikan**
   (cacat apa, kenapa, dampak angka). Dengan semua flag OFF, golden-file test vs Excel **harus lulus**.
   Perbaikan yang **tak mengubah angka** (validasi, audit, cegah override senyap, unit eksplisit) →
   boleh langsung tanpa flag.
