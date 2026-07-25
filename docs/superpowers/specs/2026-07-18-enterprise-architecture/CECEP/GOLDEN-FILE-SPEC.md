# Golden-File Paritas — Kebutuhan dari Founder

> Alat ukur tunggal untuk klaim "kemampuan sistem = Excel". Sistem hitung dari INPUT
> yang sama → harus **sama sampai rupiah** di tiap level. Belum dibangun; ini daftar
> yang saya butuh supaya tidak bolak-balik.

## A. Format file yang paling saya sukai
**Kirim file Excel RAB asli itu apa adanya** (`.xlsx`/`.xlsm`). Saya sudah bisa membaca
workbook langsung (lihat teardown) — dari satu file saya ambil **input DAN angka expected**
sekaligus (angka Excel = nilai golden). Tidak perlu Anda ketik ulang ke CSV/JSON.
Kalau file itu rahasia/berat, alternatif: ekspor sheet RAB + sheet HSD + sheet volume ke
satu `.xlsx` yang lebih kecil. **Taruh di `_source/ahsp/golden/`** (sudah otomatis gitignored
lewat `_source/`).

## B. Deklarasi METODE (wajib — supaya beda = beda-metode, bukan bug)
Sebut di mana file itu dibuat / asumsinya, karena ini menentukan mode paritas:
1. **Template/metode**: file **Control** (HSP `F/Volume` **tanpa** pembulatan) atau **Khusus/utama**
   (per-unit `ROUNDDOWN(D+E,−2)`)? — menentukan mode rounding golden.
2. **BUK (overhead+profit)** yang dipakai: 10% / 15% / lain?
3. **PPN**: dihitung `12% × DPP penuh` (seperti file Control, D1) atau `11% efektif`? Berapa nilai yang tercetak?
4. **SE/tahun**: 47/2026 atau 68/2024 (memengaruhi koefisien & tarif berlaku saat itu).
5. **Tanggal dokumen** (untuk effective-date pajak & harga).

## C. INPUT yang harus ada di file (agar sistem hitung dari sumber sama)
1. **HSD (Harga Satuan Dasar)** yang Anda pakai saat itu — **bukan** harga ilustrasi SE. Per resource:
   nama (persis seperti di AHSP), satuan, harga. Ini yang membuat angka bisa direproduksi; tanpa ini
   mustahil sama. (Idealnya sheet "Upah Bahan"/"HARGA BAHAN" versi yang Anda isi.)
2. **Daftar item pekerjaan** + **kode AHSP** yang dipakai. Kalau ada item **non-SE** (analisa buatan
   sendiri / `source='company'`), sertakan **koefisien A/B/C**-nya — itu tak ada di file SE.
3. **Volume/BOQ per item** — angka final per item cukup; kalau volume Anda hitung dgn pengurang
   (bukaan pintu/jendela), lampirkan rincian `P×L×Qty − pengurang` bila ingin paritas sampai level BOQ.
4. **Item lump-sum** (SMKK/K3, preliminaries) beserta harganya — ini di luar AHSP, dimasukkan apa adanya.

## D. LEVEL yang akan dibandingkan (assert sama-sampai-rupiah)
Golden-file test akan mengecek, per level, dari bawah ke atas:
1. **HSP per item** (`hsp_raw` desimal penuh + `hsp_rounded`). — inti engine
2. **Total per item** = Volume × HSP.
3. **Subtotal per kelompok/divisi** (SUM item).
4. **TOTAL BIAYA** (SUM divisi).
5. **PPN** (nilai tercetak).
6. **GRAND TOTAL** (Total Biaya + PPN).
7. (opsional) **Bobot %** per item/grup.

## E. Cara golden-file menyatakan metode (rancangan, belum dibangun)
Fixture menyimpan header metode → harness memilih mode yang cocok, jadi selisih yang
diharapkan (mis. Control-unrounded vs sistem-ROUNDDOWN) **dinyatakan eksplisit**, bukan
dianggap bug:
```
golden:
  method:      "control_unrounded" | "sni_rounddown_100"
  buk_pct:     0.10
  ppn_mode:    "excel_12pct_full" | "effective_11pct"
  se_version:  "47/2026"
  doc_date:    "YYYY-MM-DD"
expected:
  items:  [{ code, volume, hsp_raw, hsp_rounded, total }]
  groups: [{ name, subtotal }]
  total_biaya, ppn, grand_total
```
Test assert per level; header `method` menentukan aturan pembulatan/PPN yang dipakai sistem →
lulus berarti "sistem mereproduksi Excel PADA metode itu". Perbaikan pengubah-angka (D1/D2/D4)
diuji terpisah di belakang flag DEFAULT OFF (dengan flag OFF, golden ini harus lulus).

## F. Ukuran ideal
Satu RAB **kecil–sedang** lebih baik untuk iterasi (bukan yang 5 miliar/ratusan item), TAPI
apa pun ukurannya diterima. Usahakan memuat **minimal satu item tiap jalur**: AHSP-tenaga+bahan,
AHSP dengan alat (koef `OJ`/`jam`), dan satu lump-sum — supaya semua cabang engine teruji.
