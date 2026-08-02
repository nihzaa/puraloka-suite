# Investigasi Golden File — Angka Jangkar yang Tidak Cocok (C-5)

**Dibuat:** 2026-08-02 (Fase 0, butir 0.7) · **Status:** SEBAGIAN TERJAWAB, satu
pertanyaan terbuka menunggu founder.

## 1. Pertanyaan

Mandat menyebut lima angka jangkar: `278300`, `266600`, `1.657.839.590,39`,
`109,5`, `7875`. Audit hanya menemukan dua yang pertama, lalu menutupnya dengan
"kemungkinan berasal dari dokumen lain" — kesimpulan malas yang kini diselidiki.

## 2. Yang SUDAH terjawab (dengan bukti)

### 2.1 `278300` dan `266600` — ADA, eksak, dan diuji

Berada di `apps/api/src/lib/ahsp-engine.test.ts` sebagai assertion nyata:

| Baris | Assertion |
|---|---|
| `:42` | `ΣA=73840, ΣB=179217, D=253057, E=25305.7, F=278362.7, HSP=278300` |
| `:50` | `expect(r.hspRounded).toBe(278300)` — **EKSAK** |
| `:53,58` | `D=242367, E=24236.7, F=266603.7` → `toBe(266600)` — **EKSAK** |
| `:69,70` | `applyRounding(278362.7, ROUND_100) === 278300`; `266603.7 → 266600` |

Dijalankan 2026-08-02: **15 lulus, 1 skipped, 938 ms.** Mesin AHSP **tidak** salah
pada jalur ini.

### 2.2 Dua berkas Cibuluh — BUKAN dua sumber berbeda

| Berkas | Ukuran | SHA-256 (awal) |
|---|---:|---|
| `…bobot.xls` | 6.911.488 | `d34a35d1…` |
| `…bobot.xlsx` | 3.532.178 | `50c95da8…` |

Byte berbeda, tetapi **isinya identik**: nama sheet sama persis (22 sheet), dan
setiap angka yang diuji berada di sel yang sama. `.xlsx` adalah **hasil re-save**
dari `.xls`, bukan revisi. Jadi hipotesis "beda berkas" **gugur** — bukan itu
penjelasan selisihnya.

### 2.3 `3.629.860.295,31` — terverifikasi ada, di tiga tempat

`BoQ!Q154`, `bobot!Q154`, `kerja tambah!Q155`. Inilah yang dikunci
`golden-cibuluh.test.ts` sebagai `totalBiaya`, dan test-nya **berjalan** (berkas
golden-nya ada, sehingga `describe.skipIf(!ada)` aktif menguji).

## 3. Yang BELUM terjawab

### 3.1 `1.657.839.590,39` — TIDAK ADA di berkas Cibuluh mana pun

Dicari di **kedua** berkas, **seluruh 22 sheet**, dengan toleransi ±0,005.
**Nihil.**

Untuk memastikan ini bukan salah tulis digit, seluruh angka bernilai 1–9 miliar
disapu. Yang ada hanya lima:

| Nilai | Lokasi | Keterangan |
|---:|---|---|
| 3.629.860.295,31 | `BoQ!Q154` | total proyek (yang dipakai test) |
| 3.600.000.000,00 | `Pembayaran!G2` | nilai kontrak — angka bulat |
| 3.567.137.063,15 | `Pembayaran!J2` | nilai pembayaran |
| **1.642.531.571,00** | `Rekap!K16`, `BoQ!Q84` | **subtotal PEKERJAAN BETON** |
| 1.151.702.789,60 | `BoQ!Q67` | subtotal divisi lain |

Kandidat terdekat adalah **1.642.531.571** (subtotal Pekerjaan Beton) — selisihnya
~15,3 juta dari angka yang dicari. Bukan pembulatan, bukan PPN 11% (yang akan
memberi ~181 juta), bukan pula PPh 2%.

**Kesimpulan sementara:** `1.657.839.590,39` **hampir pasti bukan berasal dari
berkas Cibuluh**. Ia kemungkinan berasal dari proyek lain atau dari revisi
workbook yang tidak ada di repo.

### 3.2 `109,5` dan `7875` — tidak ditemukan sebagai nilai sel

Keduanya angka kecil yang mungkin muncul sebagai koefisien atau volume, bukan
sebagai nilai unik yang bisa dicari andal. Pencarian eksak di seluruh sheet: nihil.

## 4. Yang TIDAK saya lakukan, dan kenapa

**Tidak menambahkan assertion untuk `109,5` dan `7875`.** Kriteria selesai F0-7
berbunyi *"tambahkan assertion bila angka itu memang ada di berkas otoritatif"*.
Angkanya **tidak ada** di berkas otoritatif. Menambahkan assertion terhadap angka
yang sumbernya tak diketahui berarti mengunci tebakan sebagai kebenaran — persis
kelas kesalahan yang Fase 0 ada untuk memberantasnya.

**Tidak menaikkan ke P0.** Kriteria menyebut *"bila mesin AHSP-nya yang salah,
itu P0"*. Mesin AHSP terbukti **benar** pada jalur yang bisa diuji: dua angka
jangkar yang sumbernya jelas cocok EKSAK, dan total golden file cocok. Tidak ada
bukti mesin salah — yang ada hanyalah tiga angka yang sumbernya tak dikenali.

## 5. Pertanyaan terbuka untuk founder (tidak memblokir)

Dicatat di `RATIFIKASI.md` sebagai **R-005**, dan **tidak menghentikan pekerjaan**:

> Angka `1.657.839.590,39`, `109,5`, dan `7875` tidak ada di berkas Cibuluh.
> Apakah ketiganya berasal dari proyek/workbook lain yang belum masuk repo?
> Kalau ya, berkasnya perlu ditaruh di `_source/ahsp/golden/` supaya bisa dikunci
> sebagai jangkar. Kalau ketiganya ternyata salah ingat, cukup abaikan —
> jangkar yang sudah ada (`278300`, `266600`, `3.629.860.295,31`) tetap berlaku.

## 6. Verifikasi

```
✓ src/lib/ahsp-engine.test.ts (10 tests) 3ms
✓ src/lib/__tests__/golden-cibuluh.test.ts (6 tests | 1 skipped) 5ms
 Test Files  2 passed (2)
      Tests  15 passed | 1 skipped (16)
   Duration  938ms
```
