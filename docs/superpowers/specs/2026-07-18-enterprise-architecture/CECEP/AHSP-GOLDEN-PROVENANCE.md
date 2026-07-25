# Provenance Angka Golden — 21 test engine CECEP

> Kenapa dokumen ini ada: saya menulis engine, membaca angka acuan dari Excel, DAN
> menulis test-nya. Kalau saya salah baca satu sel, kode & test salah bersama dan 21
> hijau tak membuktikan apa pun. Tabel ini memetakan SETIAP angka golden ke sel aslinya
> supaya **Anda bisa verifikasi independen** (buka Excel, cek sel, bandingkan).
>
> File sumber (SHA256 di [AHSP-RECON-REPORT.md](AHSP-RECON-REPORT.md)):
> - **MAIN** = `AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm`
> - **CTRL** = `Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm`
>
> Semua nilai di kolom "cache" = nilai ter-cache terakhir Excel; buka file & recalc untuk
> melihat nilai live. Semua sudah dibaca ulang dari sel (bukan dari memori script recon).

## A. `ahsp-engine.test.ts` (10 test)

### Blok 3.6.1.1 — MAIN, sheet `Pasangan Dinding` (Pemasangan 1 m² bata 1 batu, 1SP:2PP)
| Nilai | Sel | Rumus asli | Peran | Test |
|---|---|---|---|---|
| `3.6.1.1` | `C5` | (literal) | kode blok | — |
| 0.4 | `G8` | (literal) | koef Pekerja — **INPUT** | computeAhsp 3.6.1.1 |
| 100000 | `H8` | `=VLOOKUP(D8,upahbahan,3,FALSE)` | HSD Pekerja — **INPUT** | ″ |
| 0.2 | `G9` | (literal) | koef Tukang batu | ″ |
| 145000 | `H9` | `=VLOOKUP(D9,upahbahan,3,FALSE)` | HSD Tukang batu | ″ |
| 0.02 | `G10` | (literal) | koef Kepala tukang | ″ |
| 175000 | `H10` | `=VLOOKUP(D10,upahbahan,3,FALSE)` | HSD Kepala tukang | ″ |
| 0.0067 | `G11` | (literal) | koef Mandor | ″ |
| 200000 | `H11` | `=VLOOKUP(D11,upahbahan,3,FALSE)` | HSD Mandor | ″ |
| 143.81 | `G14` | (literal) | koef Bata merah | ″ |
| 700 | `H14` | `=VLOOKUP(D14,upahbahan,3,FALSE)` | HSD Bata merah | ″ |
| 43.5 | `G15` | (literal) | koef Semen | ″ |
| 1300 | `H15` | `=VLOOKUP(D15,upahbahan,3,FALSE)` | HSD Semen | ″ |
| 0.08 | `G16` | (literal) | koef Pasir | ″ |
| 275000 | `H16` | `=VLOOKUP(D16,upahbahan,3,FALSE)` | HSD Pasir | ″ |
| 0.1 | `L5` | (literal) | BUK 10% — **INPUT** | ″ |
| **73840** | `I12` | `=SUM(I8:I11)` | ΣA Tenaga — **EXPECTED** | ″ |
| **179217** | `I17` | `=SUM(I14:I16)` | ΣB Bahan — **EXPECTED** | ″ |
| **253057** | `I20` | `=I19+I17+I12` | D (A+B+C) — **EXPECTED** | ″ |
| **25305.7** | `I21` | `=I20*H21` (H21=$L$5) | E (BUK) — **EXPECTED** | ″ |
| **278362.7** | `I22` | `=SUM(I20:I21)` | F (hspRaw) — **EXPECTED** | ″ |
| **278300** | `I5` | `=ROUNDDOWN(I22,-2)` | HSP rounded — **EXPECTED** ⭐ | computeAhsp + applyRounding |

### Blok 3.6.1.2 — MAIN, `Pasangan Dinding` (1SP:3PP; tenaga sama, bahan beda)
| Nilai | Sel | Rumus asli | Peran | Test |
|---|---|---|---|---|
| `3.6.1.2` | `C24` | (literal) | kode blok | — |
| 143.81 | `G33` | (literal) | koef Bata | INPUT |
| 32.95 | `G34` | (literal) | koef Semen | INPUT |
| 0.091 | `G35` | (literal) | koef Pasir | INPUT |
| 73840 | `I31` | `=SUM(I27:I30)` | ΣA (identik 3.6.1.1) | (implisit) |
| **168527** | `I36` | `=SUM(I33:I35)` | ΣB — EXPECTED | computeAhsp 3.6.1.2 |
| **242367** | `I39` | `=I38+I36+I31` | D — EXPECTED | ″ |
| **266603.7** | `I41` | `=SUM(I39:I40)` | F (hspRaw) — EXPECTED | ″ |
| **266600** | `I24` | `=ROUNDDOWN(I41,-2)` | HSP rounded — EXPECTED ⭐ | ″ + applyRounding |

### PPN & rekap — CTRL, sheet `REKAPITULASI`
| Nilai | Sel | Rumus asli | Peran | Test |
|---|---|---|---|---|
| **1657839590.3853106** | `E18` | `=SUM(E10:E17)` (tiap E = `'LAPORAN RAB'!Jxx`) | TOTAL BIAYA — INPUT ⭐ | computePpn PARITAS |
| 0.12 | `D19` | (literal) | tarif — **INPUT** (label C19 = "PPN 11%" → cacat D1) | ″ |
| **198940750.84623727** | `E19` | `=E18*D19` | PPN — EXPECTED | ″ |
| **1856780341.2315478** | `E20` | `=E19+E18` | grand total — EXPECTED | ″ |

> Nilai 278399.99→278300 (`applyRounding` ROUNDDOWN edge) = **sintetis buatan test**, bukan dari Excel.

## B. `rab-compute.test.ts` (7 test) — CTRL, sheet `DINDING BATA MERAH`

| Nilai | Sel | Rumus asli | Peran | Test |
|---|---|---|---|---|
| **164.5** | `N15` | `=SUM(N5:N14)` | Total Luas dinding — EXPECTED | computeVolume |
| **55** | `N19` | `=SUM(N16:N18)` | Total Pengurang bukaan — EXPECTED | ″ |
| **109.5** | `N20` | `=N15-N19` | Volume — EXPECTED ⭐ | computeVolume + semua take-off + orchestrator |
| 0.2 | `H24` | (literal) | koef Pekerja — INPUT | computeLaborCount |
| 0.1 | `H25` | (literal) | koef Tukang — INPUT | ″ |
| 6 | `I24` | (literal) | Waktu (hari) — INPUT | ″ |
| 71.91 | `H30` | (literal) | koef Bata — INPUT | computeMaterialTakeoff |
| 14.37 | `H31` | (literal) | koef Semen — INPUT | ″ |
| 0.04 | `H32` | (literal) | koef Pasir — INPUT | ″ |
| **4** | `G41` | `=ROUNDUP(J24,0)` (J24=`(N$20*H24)/I24`) | Jumlah Pekerja — EXPECTED | computeLaborCount |
| **2** | `G42` | `=ROUNDUP(J25,0)` | Jumlah Tukang — EXPECTED | ″ |
| **7875** | `L41` | `=ROUNDUP(J30,0)` (J30=`H30*I30`=71.91×109.5) | Bata — EXPECTED ⭐ | computeMaterialTakeoff |
| **32** | `L42` | `=ROUNDUP(J31/50,0)` (J31=14.37×109.5; /50 = zak) | Semen (Zak) — EXPECTED | ″ |
| **5** | `L43` | `=ROUNDUP(J32,0)` | Pasir — EXPECTED | ″ |

> **Orchestrator `computeRabDocument`** memakai HSP 278300/266600 (dari MAIN, §A) + input
> sintetis buatan test (volume 100/50/1, lump-sum 1.000.000, PPN 0,12). Hasilnya (total
> 27.830.000 / 13.330.000; subtotal 41.160.000; PPN 5.059.200; grand 47.219.200; bobot
> 97,628%) **diturunkan aritmatika** dari golden itu — bisa dicek kalkulator, bukan dibaca Excel.

## C. `golden-runner.test.ts` (4 test)
Memakai kembali **278300** & **278362.7** (MAIN `I5`/`I22`, §A) untuk fixture SNI vs Control;
sisanya sintetis (angka salah 42.160.001, item hantu) untuk membuktikan harness MENOLAK.

## D. Angka yang Anda sebut TAPI TIDAK dipakai test mana pun
| Nilai | Sel | Rumus | Catatan |
|---|---|---|---|
| 3.33 | `DINDING BATA MERAH!G43` | `=L24` (produktivitas m²/orang) | **produktivitas BELUM dibangun** — tak ada test yang memakainya |
| 18.25 | `DINDING BATA MERAH!G44` | `=N$20/I24` (m²/hari) | idem |

Jujur: saya **tidak** membangun modul produktivitas (sengaja ditunda), jadi 3,33 & 18,25
**bukan** golden number yang aktif. Kalau Anda mau produktivitas masuk paritas, sebut — saya bangun + golden-test.

---

## ⭐ LIMA angka PALING BERISIKO — mohon verifikasi manual di Excel
Dipilih karena **rantai terpanjang** (paling banyak langkah antara HSD mentah → nilai) dan/atau
**paling banyak dipakai** test lain. Kalau SATU meleset, semua test yang bergantung padanya
ditinjau ULANG (bukan ditambal).

| # | Nilai | Sel | Buka & cek | Kenapa paling berisiko |
|---|---|---|---|---|
| 1 | **278300** | `MAIN › Pasangan Dinding › I5` | `=ROUNDDOWN(I22,-2)`; I22=278362,7 | Rantai AHSP terpanjang (7 VLOOKUP → ΣA/ΣB → D → BUK → ROUNDDOWN). **Dipakai 3 file test** (engine, rab-compute, golden-runner). |
| 2 | **1.657.839.590,39** | `CTRL › REKAPITULASI › E18` | `=SUM(E10:E17)`, tiap E=`'LAPORAN RAB'!Jxx` | Rantai TERDALAM (seluruh RAB). Menyuapi PPN `E19` (198.940.750,85) & grand `E20` (1.856.780.341,23). |
| 3 | **109,5** | `CTRL › DINDING BATA MERAH › N20` | `=N15−N19` (164,5 − 55) | Dipakai SEMUA take-off (5 asersi) + volume orchestrator. |
| 4 | **7875** | `CTRL › DINDING BATA MERAH › L41` | `=ROUNDUP(J30,0)`; J30=71,91×109,5 | Bergantung koef `H30`=71,91 DAN volume `N20`=109,5 (dua-hop). |
| 5 | **266600** | `MAIN › Pasangan Dinding › I24` | `=ROUNDDOWN(I41,-2)`; I41=266603,7 | Blok AHSP KEDUA yang independen — cross-validasi jalur HSP dengan koefisien berbeda. |

Kalau ada satu saja yang tidak cocok saat Anda buka Excel, kabari sel mana — saya tinjau ulang
seluruh test yang bergantung padanya, tidak sekadar mengubah angka expected.
