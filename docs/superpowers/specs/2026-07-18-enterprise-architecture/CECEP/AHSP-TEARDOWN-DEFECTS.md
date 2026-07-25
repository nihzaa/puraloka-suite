# AHSP Workbook — Teardown Total + Daftar Cacat Excel

> **Read-only teardown. Belum ada yang dibangun.** Target: tiap perhitungan workbook
> punya padanan di Puraloka Suite, sama sampai rupiah, cacat Excel diperbaiki SADAR &
> TERCATAT. Sumber `_source/ahsp/` (gitignored). Angka dibaca dari file.

## 1. Teardown per file

### 1.1 VBA — TUNTAS: nol logika bisnis di makro
Ketiga file **punya** `vbaProject.bin`, tapi isinya **100% UI**:
- `Module1` (`Macro11/12/13`) + `TextBox1_Change` (Sheet3/4/63) = **AutoFilter** — filter tabel by
  isi textbox pencarian. Contoh utuh:
  `ActiveSheet.ListObjects("Table1").Range.AutoFilter Field:=3, Criteria1:="*" & Range("d1") & "*"`.
- Sisa ~43 modul = kelas sheet kosong (8 baris atribut, tanpa kode).
- **Tak ada** Worksheet_Change/Workbook_Open/fungsi hitung. **Seluruh perhitungan hidup di formula sel.**
  → Risiko "logika bisnis tersembunyi di VBA" = **NIHIL**.

### 1.2 Sheet tersembunyi
Hanya 1 `hidden` per file, **nol `veryHidden`**: main `Pembesian Plat Lantai 1`; Control
`ITEM PEKERJAAN (3)` (duplikat hidden dari `ITEM PEKERJAAN`). Bukan master lookup rahasia —
master ada di sheet visible (`Upah Bahan`, `HARGA BAHAN`).

### 1.3 Defined names / named ranges
| File | Total | Valid (dipakai) | `#REF!` | Eksternal `[N]` phantom |
|---|--:|--:|--:|--:|
| AHSP CIPTA KARYA | 5.590 | 70 | 59 | **5.461** |
| Khusus Gedung | 5.585 | 72 | 57 | 5.456 |
| Control 2026 | 191 | 128 | 56 | 7 |

- **Valid = named range lookup** yang benar dipakai VLOOKUP: `upahbahan`/`bahanhargasatuan`→'Upah Bahan';
  `beton`/`pasangdinding`/`galiantanah`→sheet domain; Control `bahan`/`alat`/`besi`→'HARGA BAHAN', +
  per-work (`bekistingkolomlt1`, `besifootplat`, …).
- **`[N]` phantom = cruft** dari workbook sumber yang di-copy (mis. `[2]4-Basic Price`, `[3]Analisa`).
  **Diverifikasi: NOL formula memakainya** (lihat §1.5) → dampak numerik nol; tetap defect kebersihan.

### 1.4 Konstanta hardcoded di dalam formula
| Konstanta | Frek | Arti (dugaan) | Harusnya jadi |
|---|--:|---|---|
| `50` | 162× (Control) | 1 sak semen = 50 kg (kg→Zak) | config `sak_size_kg` |
| `0.006165` | 165× (Khusus) | berat besi kg/m = 0,006165 × d² (mm) — BBS | konstanta fisika bernama `rebar_kg_per_m_coef` |
| `3.14` | 2× | π (volume lingkaran/pipa) | π presisi penuh (Math.PI) |
| `1400`/`1600`/`1800` | 22–99× | densitas beton/baja/adukan (kg/m³) | tabel `material_density` |
| `0.1` (L5/L37 inline) | tiap blok | BUK 10% | config BUK effective-date |
| `12` | 6× (Control) | (PPN 12%? / bulan?) — ambigu | perjelas → config |

### 1.5 Silent-failure & rounding (scan 174 rb formula)
> **Klaim "NOL" diverifikasi DUA metode berbeda** (disiplin: "tidak ada" butuh ≥2 metode). Metode A =
> scan formula-string openpyxl; Metode B = grep XML mentah elemen `<f>` (bypass openpyxl). Pola diperluas
> case-insensitive: `IFERROR|IFNA|ISERROR|ISERR|ISNA|ISBLANK`; external `[N]` + path `C:\`/`\\` + `.xls*`.
- **error-func = 0** di SEMUA file (kedua metode) → **tak ada error yang ditelan**. Kegagalan VLOOKUP
  justru **TAMPAK** sebagai `#N/A` dan merambat ke SUM (rapuh, tapi bukan "gagal senyap").
- **`external` di formula = 0** (kedua metode) → link eksternal phantom **tak** dipakai perhitungan.
  Catatan: file **punya** part `xl/externalLinks/` (476/38/484 — target 5.461 defined-name mati + cache),
  tapi **nol `<f>` merujuknya** → nol stale-cache di angka. **D3/D7 tetap kelas rendah** (terkonfirmasi 2×).
- **ROUND inventory:** main/Khusus **2.759× `ROUNDDOWN(x,−2)`** (HSP→Rp100) + `ROUNDUP(x,0)` (take-off
  pekerja/bahan bulat ke atas). **Control: 0 `ROUNDDOWN`** (HSP TAK dibulatkan) + 1.585× `ROUNDUP(0)`.

### 1.6 Peta dependensi (DAG kalkulasi)
```
Upah Bahan / HARGA BAHAN (HSD dasar)
      │  VLOOKUP named range 'upahbahan'/'bahan'/'alat'
      ▼
39 sheet domain AHSP (Beton, Pasangan Dinding, …)   ← blok: Σ(koef×HSD)=D; E=D×BUK; HSP=ROUNDDOWN(D+E,−2)
      │  VLOOKUP by kode
      ▼
Daftar Harga Satuan Pekerjaan (indeks HSP 3.143 item)   [refs: Jaringan Listrik 2549, Lansekap 1355, Beton 306…]
      │
      ▼
LAPORAN RAB (Total=Volume×HSP; subtotal grup=SUM; Bobot=grup/grand×100)   ← Hitungan Volume (←22 BBS rebar)
      │
      ├─► Kebutuhan Bahan/Tukang (take-off: ROUNDUP(koef×Vol))
      ├─► KURVA S (bobot per item → jadwal mingguan)         [Control]
      ▼
REKAPITULASI (Σ divisi) → PPN (×rate) → GRAND TOTAL          [Control]
```

## 2. DAFTAR CACAT EXCEL

Paritas dulu (repro apa adanya), perbaikan = **config flag DEFAULT OFF + ADR** kalau **mengubah angka**;
langsung kalau **tak** mengubah angka.

| # | Cacat | Lokasi | Dampak angka | Usul perbaikan | Kelas |
|---|---|---|---|---|---|
| **D1** | **PPN: rumus LUPA faktor DPP nilai lain 11/12** (bukan salah label). Per PMK 131/2024: tarif 12%, tapi BKP non-mewah & JKP (jasa konstruksi) pakai **DPP nilai lain 11/12** → efektif 11%. Excel hitung `0,12 × DPP penuh` = **12%** (kelebihan 1 poin). Label "11%" **BENAR** (tarif efektif); rumusnya yang cacat. | REKAPITULASI Control D19 | Excel over-charge **12% vs 11% efektif** → contoh 1,66 M = **+Rp16,6 jt** | Model **DUA angka + effective-date**: `ppn_rate` (0,12) × `dpp_factor` (11/12; mewah=1) + `dasar_hukum`. Formula tunggal PPN = `ppn_rate × dpp_factor × DPP` (tanpa cabang mewah di kode). Simpan 11/12 **presisi penuh** (bukan 0,9167) → e-Faktur/Coretax bisa tampil "DPP nilai lain + tarif 12%". **Pakai config PPN EXISTING** (`financial_config`), JANGAN bikin setting kedua. | ubah-angka → **flag DEFAULT OFF per-PROYEK + ADR** (proyek lama kontrak-tanda-tangan tak berubah); split dpp_factor invoice tanpa flag HANYA jika 3 syarat §5 lulus (rasional+regresi+historis-beku) |
| **D2** | **Pembulatan HSP inkonsisten antar file resmi** | main/Khusus `ROUNDDOWN(−2)` vs Control tanpa bulat | <Rp100/item × ribuan item → selisih total jutaan | Adopsi SE-baku `ROUNDDOWN(−2)` (founder). Simpan `hsp_raw`+`hsp_rounded`; rantai dokumen dari rounded | ubah-angka → **flag+ADR** |
| **D3** | 5.461 defined name eksternal phantom + 59 `#REF!` | semua file | **NOL** (tak dipakai formula) | Abaikan saat import; sistem pakai FK eksplisit, bukan named range | tak ubah-angka → langsung |
| **D4** | Konstanta hardcoded (50, 0,006165, 3,14, densitas) | ratusan formula | tergantung asumsi; π=3,14 bias ~0,05% | Parameter bernama (sak_size, rebar_coef, π penuh, density table) | ubah-angka (π) → **flag+ADR**; sisanya config |
| **D5** | BUK 10% inline per blok (bukan satu sumber) | tiap blok AHSP (L5/L37) | ganti BUK = edit ratusan sel, rawan tak seragam | Satu config BUK effective-date | tak ubah-angka (kalau tetap 10%) → langsung; ubah nilai → flag |
| **D6** | Sel hasil hitung bisa ditimpa manual tanpa jejak | seluruh sel | penawaran bisa dimanipulasi diam-diam | Hasil=derived; override=field terpisah (nilai/siapa/alasan) | tak ubah-angka → langsung |
| **D7** | VLOOKUP tanpa guard → `#N/A` merambat ke total | tiap blok (VLOOKUP nama resource) | 1 typo nama bahan → total `#N/A` | Import HARD FAIL kalau nama tak dikenal; FK wajib match | tak ubah-angka → langsung |
| **D8** | Kapabilitas tak lengkap per file | Khusus: tak ada REKAP/PPN/Kurva-S; Control: tak ada take-off/DB penuh; **eskalasi tak dihitung** (ESCON broken); analisa alat berat tak ada blok khusus | cakupan | Satukan semua di sistem (rekap+PPN+kurva-s+take-off+eskalasi+alat) | fitur baru, di luar paritas dasar |
| **D9** | Range VLOOKUP statis `$C$5:$J$672` + 43 koefisien-formula `=<sel lain>` di tengah kolom | domain sheets | item baru di luar range → `#N/A`-ish | Relasi tabel, bukan range statis | tak ubah-angka → langsung |

> **D1 SUDAH diputus founder (PMK 131/2024): dua angka `ppn_rate×dpp_factor`, lihat §5.**

### Discovery — jalur PPN existing (single source of truth) + temuan model

Diminta founder: "cek di mana PPN hidup sekarang; jangan bikin setting kedua; lapor kalau hardcode."

- **SUDAH ADA & effective-dated (bagus):** `financial_config` (key/value/effective_from/effective_to,
  half-open, anti-gap close-then-insert, anti-overlap 23P01) → `getTaxRate(scheme, atDate)` →
  `calculateTax()`. `termin-payment.ts:183-184` memanggilnya dengan **anchor tanggal dokumen**
  (`getTaxRate(project.tax_scheme, paid_at)`). Governance: `PUT /settings/finance`
  (`settings:finance:manage`), guard rate 0..1. **CECEP WAJIB pakai ini, bukan config PPN kedua.**
- **TEMUAN (deficiency, D10):** model menyimpan PPN sebagai **satu fraksi terkolaps `tax.ppn_rate=0,11`**,
  BUKAN dua angka `ppn_rate(0,12) × dpp_factor(11/12)`. Akibat: **angka invoice existing BENAR** (11% efektif —
  bukan bug), TAPI **penyajian DPP nilai lain HILANG** (e-Faktur butuh "DPP×11/12 + tarif 12%", tak
  terwakili oleh 0,11 tunggal). `STATIC_FALLBACK`/`TAX_RATE_BY_SCHEME` meng-hardcode 0,11 sebagai fallback
  (loud, dapat diterima); `settings.ts` bahkan menuliskan asumsi "0.11 untuk 11%" di pesan guard.
- **Usul (belum dibangun):** tambah `tax.ppn_dpp_factor` (11/12) ke `financial_config`; `tax.ppn_rate` → 0,12
  statutory; `getTaxRate`→`getPpnComponents`; formula tunggal.
  **⚠️ KOREKSI founder: "0,12×11/12 = 0,11 persis" HANYA benar rasional, TIDAK di float** (dibuktikan node):
  `0,12*(11/12) = 0.109999999999999987`; `dpp_factor` dibulatkan 0,916667 → **drift +Rp66** pada invoice 1,66 M.
  Maka split boleh **tanpa flag HANYA jika 3 syarat**, kalau tidak → **flag DEFAULT OFF**:
    - **(a) Simpan 11/12 RASIONAL** (numerator+denominator integer) ATAU NUMERIC presisi penuh
      **kali-dulu-bagi-belakangan**. JANGAN pernah simpan 0,9167/0,916667 dalam bentuk apa pun.
    - **(b) REGRESSION TEST WAJIB:** hitung ulang SEMUA invoice + tax_records existing dgn model dua-angka,
      assert **identik sampai rupiah** dgn nilai tersimpan. Satu saja bergeser → **BERHENTI & lapor** (jangan
      perbaiki sendiri, jangan bulatkan agar cocok).
    - **(c) Invoice historis TAK PERNAH dihitung ulang** — nilai tersimpan = final & mengikat. Split hanya
      mengubah MODEL untuk dokumen BARU.
  Untuk CECEP RAB: paritas flag OFF = `0,12 × DPP penuh` (tiru Excel, 12%); flag ON = config bersama (11%),
  **per-proyek** (proyek lama kontrak-tanda-tangan tak berubah).

| **D10** | PPN model = satu fraksi terkolaps 0,11 (bukan rate×dpp_factor) → presentasi DPP nilai lain hilang | `financial-config.ts`, `tax-calculation.ts`, `settings.ts` | angka sama (11%) TAPI split naif drift **+Rp66** (float, dibuktikan); presentasi e-Faktur hilang | Dua angka rasional + 3 syarat §5 (rasional-exact, regresi semua invoice, historis beku) | tanpa flag HANYA jika 3 syarat lulus; jika tidak → **flag OFF** |

## 3. Control vs Khusus — bukan subset, tapi KOMPLEMENTER

| Aspek | Khusus Bangunan Gedung | Control 2026 |
|---|---|---|
| DB AHSP | **Lengkap** (39 domain, 3.143 item, `Upah Bahan`, `Daftar Harga`) | **Tidak** — hanya ~100 sheet kerja bangunan contoh + `HARGA BAHAN` proyek |
| Metode HSP | Per-unit: `ROUNDDOWN(Σκoef×HSD+BUK, −2)` | Total/volume: `F/Volume` **tanpa** pembulatan |
| BOQ volume | `Hitungan Volume` (←BBS) | Per-sheet (P×L×Qty − bukaan) + **produktivitas/crew** |
| Take-off | **`Kebutuhan Bahan/Tukang`** (ada) | Hanya "Kesimpulan" per sheet |
| Rekap + PPN | **Tidak** (berhenti di grand total EE) | **`REKAPITULASI` + PPN** (ada, tapi cacat D1) |
| Kurva S | Tidak | **`KURVA S`** (ada) |
| Formula cells | 78.495 | 25.152 |

**Kesimpulan:** keduanya **saling melengkapi**, bukan subset. Khusus = katalog AHSP + metode SE-baku +
take-off; Control = workflow proyek (rekap/PPN/kurva-s) + produktivitas, **tapi tanpa pembulatan HSP**.
**Untuk input sama, keduanya bisa beda angka** — akar: (a) HSD berbeda (national vs proyek), (b) basis
koefisien berbeda pada sebagian work, **(c) pembulatan HSP berbeda (D2)**. (c) = cacat murni; (a)/(b) =
memang input beda. Sistem harus reproduksi **kedua** (via config), lalu menyatukan kapabilitas.

## 4. Konsekuensi untuk sistem (catatan, belum dibangun)

- **Seed koefisien** dari file **utama/Khusus** (metode SE-baku), BUKAN Control (Control = referensi
  produktivitas + workflow, harga proyek, tanpa pembulatan).
- **Engine** wajib reproduksi rantai §1.6 sampai rupiah dengan aturan pembulatan D2 (default paritas =
  meniru file utama). Golden-file test = bukti.
- **`hsp_raw` + `hsp_rounded`** dua kolom; rantai dokumen dari `hsp_rounded` saja.
- **PPN & BUK & rounding-step = config effective-date**; **tahap pembulatan = struktural (Ember [C])**.
- **Override = field terpisah tercatat**, bukan menimpa hasil (D6). Import unknown unit/resource = HARD
  FAIL (D7). **source='company' & 'national' berdampingan** — struktur sudah mendukung (dikonfirmasi recon).
