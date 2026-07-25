# CECEP — Material Take-off · RAP/Pagu · AHSP Company · UI (RANCANGAN, belum dibangun)

> Laporan & rancangan (Bagian B–F). Tak ada yang dibangun. Bukti D3/D4 dibaca dari
> `_source/ahsp/` (bukan tebakan). Build order di akhir.

## B — Golden & Metode (konfirmasi)
Cibuluh = **alat ukur**, bukan sumber aturan. Ditegakkan:
- **B1 DEFAULT PRODUKSI = SE 47/2026**: BUK config, `ROUNDDOWN` Rp100, PPN aktif (`ppn_rate` 0,12 ×
  `dpp_factor` 11/12). SNI 2013 (BUK 10%, TRUNC-10, tanpa PPN) hanya aktif bila **diminta eksplisit**
  (mode golden Cibuluh). **Setuju & jadi invariant.**
- **B2 METODE WAJIB EKSPLISIT**: estimasi tanpa deklarasi metode **DITOLAK error jelas**, bukan diam-diam
  default. (RAB metode salah tetap kelihatan wajar → baru ketahuan setelah terkirim.) → jadi guard Lapis 3.
- **B3 METODE TERSIMPAN PER-ESTIMASI** (kolom di estimate_version: rounding_mode, rounding_step, buk basis,
  ppn basis, se_version), **bukan** setting global. Proyek lama reproduksi angka sama bertahun kemudian.

## C — Konfigurasi TIGA LAPIS (klasifikasi mengikat untuk SEMUA kerja ke depan)

| Lapis | Sifat | Contoh CECEP | Tempat |
|---|---|---|---|
| **1 — Parameter bisnis** | config **effective-date**, **editable UI**, +jejak siapa/kapan/lama-baru | BUK%, PPN+dpp_factor, mode&step pembulatan, harga supplier, upah, borongan mandor, fee, margin | `financial_config` (sudah ada) + tabel harga/upah |
| **2 — Data referensi** | tabel ter-seed; koreksi via **migration / admin beraudit**, BUKAN setting biasa | sak=50kg, densitas 1400/1600/1800, kg/m besi (0,006165), **berat profil baja**, definisi satuan (`units`), **koefisien AHSP nasional** | tabel seed (`units`, `resources`, `assemblies`, +`material_pack`, +`steel_profiles`) |
| **3 — Invarian struktural** | **di kode**, tak boleh dikonfig | ADANYA tahap pembulatan, urutan rantai hitung, guard immutability, aturan versi/approval, metode-wajib-eksplisit (B2) | kode + DB guard |

**Yang harus NOL: angka telanjang di rumus/kode** (cacat Excel: BUK 0,1 di ratusan sel, PPN 0,12 nempel).

**C1 audit engine yang SUDAH ditulis — BERSIH:** `ahsp-engine.ts`/`rab-compute.ts`/`golden-runner.ts`
meng-INJECT semua param (BUK, rounding, PPN) — nol angka bisnis telanjang. Satu-satunya literal =
`golden-runner` toleransi banding `0,005` rupiah (Lapis 3 struktural, bukan bisnis). **Tak ada salah lapis.**

## D — Material Take-off · Agregasi · Pagu/RAP (laporan + rancangan)

### D1 — Take-off per item (status PR #67)
`computeMaterialTakeoff(volume, coefficient, packSize)` = `ROUNDUP(volume×koef / packSize)` — SUDAH ADA,
per item, pure, golden-tested (Bata 7875, Semen 32 zak). **Kurang:** (i) agregasi lintas item (D2),
(ii) per-diameter besi (D3), (iii) dua-satuan tersimpan (D5), (iv) sumber koefisien dari DB seed (butuh seed).

### D2 — Agregasi lintas item (satu baris/material, tetap tertelusur)
Rancangan: `material_requirement` = hasil agregasi, **bukan disimpan mentah** melainkan view/komputasi dari
`estimate_item × assembly_component`:
```
per (resource_id): SUM(item.volume × component.coefficient)  → qty_ahsp
  + rincian: array {estimate_item_id, work_name, volume, coefficient, subqty}  ← "kenapa semennya sebanyak ini"
```
Satu resource dipakai N item (semen di kolom/balok/plesteran) → **satu baris**, drill-down ke item asal.
Ditelusuri, bukan angka buta. (Analog rollup RAB tapi sumbu = resource, bukan cost code.)

### D3 — Besi beton per diameter (BUKTI dari file, bukan tebakan)
- **Analisa (MAIN `Beton` 2.2.1.1 Penulangan):** PER KG, dibedakan **TIPE** (BjTP polos / BjTS sirip) ×
  **ELEMEN** (slab / kolom-balok-ring), mis. "1 kg penulangan kolom untuk BjTS". **BUKAN per diameter.**
- **Master (`Upah Bahan`):** besi tulangan **DIPISAH** per tipe+diameter: "Baja Tulangan Polos (BjTP)
  diameter …", "Baja Tulangan Sirip (BjTS) diameter …", "Baja ulir U-39/U-48" — resource terpisah, harga/kg.
- **BBS (Khusus `BBS Bored Pile/Kolom/…`):** memecah **per diameter** — kolom "Diameter Tul. (mm)", "Jumlah
  Tul.", shapes, panjang; rumus geometri (`=E8-G8-G8` dst); rekap "Total Besi 19", "Total Besi 10" (per Ø).
- **Kesimpulan:** diameter hidup di **level ITEM + BBS**, bukan di analisa. **BBS = JALUR INPUT TERPISAH**
  (digerakkan geometri: dimensi × jumlah × panjang → kg per Ø), **bukan** turunan otomatis AHSP. `0,006165`
  = faktor berat kg/m = `0,006165 × d²(mm)` (Lapis 2), dipakai konversi panjang→kg.
- **Desain agregasi besi:** untuk pagu belanja per-Ø, sumbernya **jalur BBS/per-diameter** (geometri), BUKAN
  koef besi AHSP (yang per-kg). Take-off AHSP besi = **kg kasar anggaran**; BBS = **kg presisi per Ø**.
  Rancang tabel `rebar_takeoff` (per estimate_item × diameter → kg), input BBS-style, terpisah dari koef AHSP.

### D4 — Baja WF / struktur baja (jawab tegas)
- **Analisa nasional ADA** (MAIN sheet `BAJA`, **kode 2.3 Pekerjaan Struktur Baja**): `2.3.1.1` "1 kg
  Pabrikasi & Ereksi Baja Profil" (Baja Profil kg koef 1,15 waste, kawat las, **sewa crane**, alat las),
  `2.3.1.2` pemasangan angkur, dst. **Generik per KG "Baja Profil"** — bukan per profil WF/H-beam.
- **Master:** ada "Baja Profil" (kg), "Baja Profil Siku", "Besi siku 30x30x3/40x40x4" — TAPI **TIDAK ADA
  katalog WF/H-beam/CNP dengan berat/m** (yang ada cuma pipa baja + siku ukuran tertentu).
- **Cibuluh (company) PUNYA** pekerjaan baja: "IV. PEKERJAAN BAJA" (Tiang **WF 350** 595 kg/12m, Kuda-kuda
  **WF 300** 440, Balok **WF 250** 355, Balok Anak **WF 200** 256) + sheet **`DAFTAR BESI WIDE FLANGE BEAM`**
  (tabel WF: ukuran mm → Berat kg → Panjang m). **Itu tabel referensi milik proyek/company.**
- **Verdict tegas:** analisa struktur baja **ADA** di nasional (generik per-kg). **Katalog profil WF + berat/m
  TIDAK ADA di AHSP nasional** — itu **data referensi Lapis 2** yang harus di-seed (`steel_profiles`:
  profile, dim, kg/m), dan `DAFTAR BESI` Cibuluh = contoh nyata untuk seed. **Take-off baja** = daftar
  profil × panjang × (kg/m dari tabel) → kg → feed analisa 2.3 (per kg). Analog BBS untuk baja.

### D5 — DUA SATUAN (wajib)
Tiap kebutuhan material tampil dua satuan: **satuan AHSP** + **satuan belanja**. Contoh
"Semen 1.620 kg (32,4 sak) → beli **33 sak**". **TANPA engine konversi** (ADR-006): faktor kemasan =
**DATA EKSPLISIT per resource** (Lapis 2), bukan tebakan. Rancang `resources` + kolom/tabel
`material_pack`: `resource_id, buy_unit_code, factor (unit AHSP per 1 buy_unit), round_up (bool)`.
- **Pembulatan KE ATAS** terjadi HANYA di angka belanja (`ROUNDUP(qty_ahsp / factor)`).
- **SIMPAN KEDUA:** `qty_ahsp` (kembali ke analisa kapan pun) + `qty_buy_rounded` (untuk belanja). Jangan
  campur (paralel dgn hsp_raw/hsp_rounded).

### D6 — Pagu & RAP (bentuk data, bukan UI)
- **RAB take-off** pakai harga pasar + upah harian → `qty_ahsp` + nilai rencana.
- **RAP** pakai **harga supplier nyata + borongan mandor** (bukan upah harian). Rancangan tabel:
  - `rap_budget` (per project): status `draft|locked`, locked_by/at.
  - `rap_material_line`: resource_id, **qty (turun dari RAB take-off, bisa DISESUAIKAN)** `qty_adjusted`,
    `supplier_price`, `pagu = qty_adjusted × supplier_price`. Titik penyesuaian = sebelum lock.
  - `rap_labor_line`: scope, **borongan mandor** (bukan upah harian).
  - **Kunci pagu:** `locked_at` → line jadi immutable; perubahan sesudah lock = `rap_change_log`
    (siapa/kapan/alasan/nilai lama vs baru) — pola CO/audit.
- **Terlihat di UI (nanti):** harga supplier per material, borongan per scope, upah, **pagu vs realisasi**.

### D7 — Sambungan ke sistem lama (discovery, tak dibangun)
Pagu material (RENCANA) diadu dengan pembelian NYATA yang SUDAH ADA:
- `project_expenses` / `cash` / `procurement` (MR/PO/GR) = realisasi belanja.
- Titik sambung: `rap_material_line.resource_id` ↔ material procurement/`project_expenses.category`.
  Realisasi = SUM(PO/GR/expense per material) diadu `pagu`. **Discovery lanjut saat build RAP** — jangan bangun.

### D8 — Konfirmasi waste
**BENAR:** koefisien AHSP **sudah** mengandung faktor susut/waste (bukti: Baja Profil koef **1,15** =
15% waste; Bata 143,81 > teoretis). Maka take-off = **ANGKA ANGGARAN**, bukan volume fisik presisi lapangan.
Desain TIDAK memperlakukannya sebagai target akurasi lapangan; label UI "kebutuhan anggaran".

## E — AHSP Company (rancang; bangun setelah seed nasional)
- **E1 FORMAT SAMA PERSIS**: `assemblies` (code, uraian, output_unit, `source='company'`) +
  `assembly_components` (A tenaga/B bahan/C alat, koef per resource) — **struktur identik nasional**, engine
  tak bedakan. **Sudah didukung** skema sekarang.
- **E2 SEED AWAL company** (usul, berbasis bidang pabrik/gudang + Cibuluh): **struktur baja WF** (fabrikasi+
  ereksi per profil, sambungan baut HTB, las, cat dasar/finish zincromate), **atap spandek/metal + gording
  CNP**, **rangka baja ringan**, **pedestal/base-plate + angkur**, **lantai floor-hardener/trowel**, **pagar
  panel beton pracetak**. (Yang nasional generik/absen — WF per profil, base plate, HTB.)
- **E3 KONFIG ULANG UI**: buat analisa baru, ubah koef, **duplikat dari nasional lalu sesuaikan** (draft →
  active; versi baru saat revisi).
- **E4 ATURAN SAMA**: `source='company'` tunduk immutability + versioning sama `national` — analisa yang sudah
  dipakai estimasi **tak berubah diam-diam**, revisi = versi baru. **DIKONFIRMASI struktur sekarang mendukung**
  (`assemblies.source CHECK IN national/company/project/custom`; guard immutability 107 + output_unit 115
  **source-agnostic**).
- **E5 PROVENANCE**: tiap analisa company catat `created_by/at`, `derived_from_assembly_id` (kalau duplikat
  nasional) — analog `ahsp_import_batches` (recon report).

## F — UI/UX AHSP (SPESIFIKASI, jangan bangun; UI di atas engine belum lengkap = dibongkar ulang)
Prinsip: data AHSP bertingkat (pekerjaan → A/B/C → resource → harga); tampil apa adanya = spreadsheet raksasa.
- **F1 CARI DULU (bukan pohon):** 3.143 item → **search box** jadi jalan utama (kode/uraian/bidang), bukan
  menu bertingkat.
- **F2 SATU LAYAR SATU TUGAS:** pisah **Browse analisa** ⟂ **Edit koefisien** ⟂ **Atur harga (Lapis 1)**.
- **F3 RINCIAN DIBUKA, tak dipaksa:** default ringkasan (kode, uraian, output_unit, HSP); breakdown A/B/C
  di-expand saat diminta.
- **F4 HASIL HITUNG ≠ INPUT:** angka turunan (HSP, jumlah) gaya **read-only** jelas (mis. abu-abu/kunci ikon)
  vs field editable (koef, harga) — cegah kesan bisa ditimpa (D6/derived-not-input).
- **F5 DESIGN SYSTEM EKSISTING:** Bricolage Grotesque + Plus Jakarta Sans, aksen `#003366`, kartu putih,
  border `#E5E7EB`. **Jangan bahasa visual kedua.**
- **F6 NATIONAL vs COMPANY sekilas:** badge/warna di baris daftar (mis. chip "Nasional" navy vs "Company"
  aksen sekunder) tanpa buka detail.

**Daftar layar:** (1) **AHSP Search/Browse** (list + filter bidang/source + search), (2) **Analisa Detail**
(ringkasan + expand A/B/C, read-only hasil), (3) **Editor Analisa Company** (buat/duplikat/ubah koef, draft),
(4) **Harga & Upah (Lapis 1)** (config effective-date + jejak), (5) **Material Requirement** (agregasi D2,
dua-satuan D5, drill-down), (6) **RAP/Pagu** (turunan + adjust + lock + change log), (7) **Estimasi/RAB**
(pilih item, volume, metode eksplisit B2, read-model RAB/BOQ/Kurva-S).

## URUTAN PEMBANGUNAN (usulan) — tanda [SEED] = butuh seed AHSP nasional
> Gerbang keras: **tak ada seed/DB sampai CI terbukti terisolasi** (Bagian A).

1. **CI isolation tuntas** (A2–A5) → dev bersih. *(prasyarat semua yang sentuh DB)*
2. **Config Lapis 1/2 fondasi**: `financial_config` (BUK/PPN/rounding) + tabel Lapis 2 (`material_pack`,
   `steel_profiles`, konstanta fisik). *Tak butuh seed AHSP — bisa duluan.*
3. **Metode per-estimasi (B2/B3)** + wiring engine↔config effective-date. *Engine murni sudah ada; ini
   menyambungnya. Tak butuh seed.*
4. **[SEED] Seed AHSP nasional** (parser Excel→resources/assemblies/components, provenance batch). *Prasyarat
   CRUD/endpoint hitung nyata.*
5. **[SEED] Endpoint hitung RAB end-to-end** (pakai engine+seed) + **adapter golden-file** (Cibuluh method
   SNI + golden kedua Control PPN) → bukti paritas end-to-end.
6. **Material take-off + agregasi (D2) + dua-satuan (D5)** + **BBS besi per-Ø (D3)** + **take-off baja +
   `steel_profiles` (D4)**. *Butuh seed (koefisien).*
7. **RAP/Pagu (D6)** + sambung realisasi (D7). *Butuh take-off (6).*
8. **AHSP Company (E)**: CRUD company + duplikat + seed awal E2. *Struktur sudah dukung; setelah seed nasional
   agar bisa duplikat.*
9. **dpp_factor split (D10)** — kapan pun setelah guardrail di-run di env ber-PPN nyata + aba-aba founder.
   *Independen; tak butuh seed.*
10. **UI (F)** — terakhir, di atas engine+seed yang sudah stabil. Layar per urutan kebutuhan (Estimasi →
    Material → RAP).

**Bisa jalan duluan (tanpa seed):** 1, 2, 3, 9. **Butuh seed:** 4→8. **Terakhir:** 10 (UI).
