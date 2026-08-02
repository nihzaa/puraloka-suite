# Investigasi Golden File — Angka Jangkar (C-5 / R-005)

**Dibuat:** 2026-08-02 · **Diselesaikan:** 2026-08-03 setelah founder meminta sapuan
diperluas ke luar berkas Cibuluh. **Status: TERJAWAB PENUH.**

---

## 0. Ringkas — kelima angka jangkar ditemukan

| Angka | Berkas | Lokasi | Makna |
|---|---|---|---|
| `278300` | AHSP SE-47 + RAB Khusus Gedung | `Daftar Harga Satuan Pekerjaan!E539` | HSP satuan pekerjaan |
| `266600` | idem | `Daftar Harga Satuan Pekerjaan!E540` | HSP satuan pekerjaan |
| `1.657.839.590,39` | **Format RAB Control 2026** | `REKAPITULASI!E15` · `LAPORAN RAB!J239` · `KURVA S!F19` | **TOTAL BIAYA proyek (sebelum PPN)** |
| `109,5` | **Format RAB Control 2026** | `LAPORAN RAB!H114` | **volume m²** pasangan bata merah ½ batu 1SP:3PP |
| `7875` | **Format RAB Control 2026** | `DINDING BATA MERAH!L41` | **jumlah buah** bata merah (koefisien kebutuhan) |

**Saya salah pada laporan 2026-08-02.** Saya menyimpulkan ketiga angka terakhir
"hampir pasti bukan berasal dari berkas Cibuluh" lalu berhenti — padahal
kesimpulan yang benar adalah *"belum saya cari di berkas lain"*. Sapuan hanya
menyentuh `_source/ahsp/golden/`, bukan `_source/ahsp/` secara keseluruhan.

---

## 1. Hipotesis yang GUGUR

**"Selisih berasal dari dua berkas Cibuluh yang berbeda."** Salah.
`.xls` (6,9 MB) dan `.xlsx` (3,5 MB) **isinya identik** — 22 sheet sama, nilai di
sel sama. `.xlsx` hanya hasil simpan-ulang. Byte berbeda, kandungan tidak.

---

## 2. Kenapa `1.657.839.590,39` ≠ `3.629.860.295,31`

Pertanyaan mandat terjawab: **keduanya proyek yang berbeda**, bukan dua versi
dari satu angka.

| | Cibuluh | RAB Control 2026 |
|---|---|---|
| Berkas | `golden/RAB Gudang Cibuluh Sumedang bobot.xlsx` | `Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm` |
| Total | **Rp 3.629.860.295,31** (`BoQ!Q154`) | **Rp 1.657.839.590,39** (`REKAPITULASI!E15`) |
| Struktur | 9 divisi, 55 item | 8 divisi (A–H) |
| Sifat | RAB proyek nyata (gudang, Sumedang) | **Engineering Estimate** — template SE-47 |
| Sheet | 22 | **117** |

Bukan beda edisi AHSP, bukan subtotal-vs-total, bukan sudah/belum PPN.
**Dua dokumen proyek yang sama sekali berbeda.**

Rekapitulasi RAB Control 2026 selengkapnya:

```
A PEKERJAAN PERSIAPAN              53.805.651,37
B PEKERJAAN STRUKTUR BAWAH        256.176.304,91
C PEKERJAAN STRUKTUR ATAS LT1     476.248.496,17
D PEKERJAAN STRUKTUR ATAS LT2     442.235.652,84
E PEKERJAAN ARSITEKSTUR           276.773.095,63
F PEKERJAAN PLUMBING               37.583.832,31
G PEKERJAAN MEKANIKAL ELEKTRIKAL   91.238.965,40
H PEKERJAAN FINISHING              23.777.591,75
  TOTAL BIAYA                   1.657.839.590,39   ← angka jangkar
  PPN 11%                         198.940.750,85
  TOTAL                         1.856.780.341,23
```

## 3. Temuan sampingan yang penting — PPN dua-angka, di dokumen sumber

Baris PPN di `REKAPITULASI` **berlabel "PPN 11%" tetapi pengalinya `0,12`**:

```
E16 (label) = "PPN  11%"    F16 (tarif) = 0.12    G16 = 198.940.750,85
```

Verifikasi: `1.657.839.590,39 × 0,12 = 198.940.750,85` ✅ — jadi yang dipakai
memang **0,12**, bukan 0,11.

Ini persis model dua-angka yang dijaga `src/lib/__tests__/ppn-dpp-guardrail.test.ts`
(`ppn_rate 0.12 × dpp_factor 11/12`), dan membuktikan **model itu memang berasal
dari praktik dokumen nyata**, bukan karangan. Guardrail-nya sendiri masih
melaporkan dirinya *vacuous* (0 record ber-PPN di lingkungan uji) — jadi angka
ini adalah kandidat kuat untuk mengisi kekosongan itu.

Dicatat sebagai kandidat pekerjaan, bukan diklaim selesai.

## 4. Konteks dua angka kecil

**`109,5` — volume, bukan koefisien.** `LAPORAN RAB` baris 114:

| Kolom | Nilai |
|---|---|
| F (uraian) | `Bata Merah ½ Batu Campuran 1SP : 3PP` |
| G (satuan) | `M2` |
| **H (volume)** | **`109,5`** |
| I (harga satuan) | `146.308,162` |
| J (jumlah) | `16.020.743,739` |

Verifikasi: `109,5 × 146.308,162 = 16.020.743,74` ✅

**`7875` — jumlah buah bata.** `DINDING BATA MERAH!L41`, bersebelahan dengan
label `Bata Merah` (I41) dan satuan `Buah` (M41). Muncul di 4 sel (L41/L65/L89/L113)
— pola koefisien kebutuhan bahan yang berulang per varian.

## 5. Sebaran lengkap hasil sapuan

| Berkas | 1.657.839.590,39 | 109,5 | 7875 | 278300 | 266600 |
|---|---|---|---|---|---|
| `golden/…Cibuluh…xlsx` & `.xls` | — | — | — | — | — |
| **`Format RAB Control 2026`** | **✅ 3 sel** | **✅ 18 sel** | **✅ 4 sel** | — | — |
| `Format RAB Khusus Gedung` | — | ✅ 2 | ✅ 14 | ✅ 3 | ✅ 2 |
| `AHSP CIPTA KARYA SE-47` | — | ✅ 2 | ✅ 14 | ✅ 3 | ✅ 2 |
| `Spesifikasi Teknis` | — | — | — | — | — |

`278300`/`266600` berasal dari **katalog AHSP SE-47**, bukan dari RAB proyek —
konsisten dengan perannya di `ahsp-engine.test.ts` sebagai uji mesin perhitungan
HSP, bukan uji total proyek.

## 6. Status assertion

| Angka | Sudah diuji? | Di mana |
|---|---|---|
| `278300` | ✅ EKSAK | `ahsp-engine.test.ts:42,50,69` |
| `266600` | ✅ EKSAK | `ahsp-engine.test.ts:53,58,70` |
| `3.629.860.295,31` | ✅ | `golden-cibuluh.test.ts` (`totalBiaya`) |
| `1.657.839.590,39` | ❌ **belum** | — |
| `109,5` | ❌ **belum** | — |
| `7875` | ❌ **belum** | — |

Ketiganya kini **memenuhi syarat** untuk dijadikan assertion: sumbernya
teridentifikasi, lokasinya pasti, dan maknanya terverifikasi lewat perkalian silang.

**Belum ditambahkan di sesi ini.** Alasannya bukan keraguan melainkan urutan:
menambah golden file kedua berarti menulis harness pembacanya (`.xlsm` 117 sheet,
bermakro) dan itu pekerjaan tersendiri. Masuk antrean sebagai **F0-10**, bukan
diklaim selesai.

## 7. Mesin AHSP tidak terbukti salah

Kriteria mandat: *"kalau mesin AHSP-nya yang salah, itu P0"*. Tidak ada bukti itu.
Kedua angka HSP yang bisa diuji cocok EKSAK, dan total golden Cibuluh cocok.
Yang keliru adalah **cakupan pencarian saya**, bukan mesinnya.

## 8. Bukti run

```
✓ src/lib/ahsp-engine.test.ts (10 tests) 3ms
✓ src/lib/__tests__/golden-cibuluh.test.ts (6 tests | 1 skipped) 5ms
 Test Files  2 passed (2)
      Tests  15 passed | 1 skipped (16)
   Duration  938ms
```
