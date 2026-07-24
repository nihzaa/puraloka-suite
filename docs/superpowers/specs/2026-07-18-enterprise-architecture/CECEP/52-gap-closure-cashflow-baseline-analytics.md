# CECEP — Gap Closure: Cashflow Forecast, Cost Baseline, Executive Analytics

**Mode:** Architecture Derivation Mode (`40`/`41`). Menutup 3 celah dari [`51-final-audit-and-main-roadmap-position.md`](51-final-audit-and-main-roadmap-position.md) § Bagian 2. Bukan fase baru — ADR kecil menambah kedalaman di titik yang SUDAH ada mapping-nya (`35`/`37`), pola sama seperti AHSP didalami di Fase 5.

## Evidence Contamination Check

```
01 §8 (Estimate Outputs, 12 output)     → bersih, evidence asli
kurva-s.ts / evm-calculation.ts existing → diverifikasi: bac = totalRABValue
44/35/37                                  → bersih, sudah Frozen
```

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 3 gap closures (Cashflow projection mechanism, Cost Baseline vs Budget
  Baseline distinction, Executive Analytics dashboard content)

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

---

## Gap 1 — Cashflow Forecast: Mekanisme Proyeksi

**Business Responsibility:** *"Cashflow Forecast harus memproyeksikan kas KE DEPAN berbasis rencana (Estimate+WBS), BEDA dari cashflow AKTUAL existing (`cash_accounts`) yang hanya mencatat yang sudah terjadi — `01` §8 eksplisit: 'Ada cashflow aktual, forecast proyeksi ke depan berbasis estimasi belum ada'."*

```
Level 6 ✓ — necessity dari 01 §8 output #9 + 37 §12 (Input: Estimate Version,
  WBS; Output: proyeksi kas per periode)
Trace Status: ✓ Fully Derived
```

**Mekanisme (diturunkan, bukan diciptakan bebas):** Existing `kurva-s.ts` sudah punya pola distribusi rencana yang RELEVAN — baris 164-185 (fallback ke normal CDF kalau belum ada jadwal manual). Cashflow Forecast MEWARISI pola yang SAMA, bukan pola baru:

```
Cashflow Forecast (per periode, mingguan/bulanan):
  planned_disbursement(t) = SUM per Cost Code aktif pada periode t dari:
    RAP Baseline (44 §Budget Baseline thin capability, bukan RAB — konsisten
    §6 kurva-s.ts existing yang pakai bac=totalRABValue, TAPI Cashflow
    Forecast CECEP secara sengaja pakai RAP bukan RAB, lihat Gap 2 di bawah
    untuk alasan pembeda ini)
  ÷ distribusi waktu dari WBS.planned_start/planned_end (44 §Domain Model,
    sudah ada kolom ini di rab_items existing — bukan struktur baru)
  fallback: kalau WBS belum diisi manual per Work Item → normal CDF
    (pola SAMA PERSIS existing kurva-s.ts baris 164-185, bukan rumus baru)
```

**Zero-Invention check:** Rumus proyeksi TIDAK diciptakan dari nol — ia adalah pola fallback normal-CDF yang SUDAH berjalan di `kurva-s.ts` untuk EVM, diterapkan ulang ke konteks Cashflow (basis RAP, bukan RAB — lihat Gap 2). Ini konsisten Simplicity Rule (`40`): pilih model paling sederhana yang sudah terbukti, jangan buat abstraksi baru untuk masalah yang sudah punya solusi.

## Gap 2 — Cost Baseline vs Budget Baseline: Pembeda Tegas

**Business Responsibility:** *"`01` §8 output #10 eksplisit menyebut Cost Baseline BERBEDA dari EVM's BAC (yang berbasis RAB). `44` hanya membahas Budget Baseline — tanpa pembeda tegas, risiko nyata: implementasi menganggap keduanya sama, padahal sumber aslinya sudah memperingatkan tidak."*

```
Level 6 ✓ — kutipan langsung 01 §8: "Cost Baseline: Tidak ada (berbeda dari
  EVM's BAC yang berbasis RAB)" + diverifikasi kurva-s.ts baris 344:
  bac = totalRABValue (CONFIRMED BAC memang berbasis RAB di kode existing)
Trace Status: ✓ Fully Derived
```

**Pembeda (diturunkan dari definisi masing-masing di `01`/`44`, bukan diciptakan):**

| | Budget Baseline (`44`, thin capability) | Cost Baseline (BARU ditutup di sini) |
|---|---|---|
| Basis | Estimate Version status Approved (bisa Tender ATAU RAP) | KHUSUS RAP Builder (`35` #4) — target biaya INTERNAL |
| Dipakai untuk | Flag "Estimate Version mana jadi acuan Project" (administratif) | Acuan EVM/Cost Control (`35` #11) — basis CPI/SPI |
| Beda dari BAC existing | Tidak — existing `bac=totalRABValue` MASIH memakai RAB, bukan RAP | **INI GAP-NYA:** BAC existing (RAB-basis) secara struktural SAMA dengan Cost Baseline lama yang `03` §6 root cause sudah tandai sebagai masalah ("baseline EVM harus dari RAP, bukan RAB — sebelum ini, bantalan margin RAB menyembunyikan pembengkakan kecil") |

**Keputusan konkret:** Cost Baseline BUKAN entity/Aggregate Root baru (konsisten `44` §Budget Baseline, prinsip yang sama berlaku) — ia adalah **RAP Version yang Frozen**, dipakai SEBAGAI PENGGANTI `bac=totalRABValue` di `kurva-s.ts` begitu RAP Builder (`35` #4) tersedia. Ini menutup root cause `03` §6 secara eksplisit: EVM existing akan migrasi dari basis RAB ke basis RAP, bukan tetap RAB selamanya.

```
Level 6 ✓ — necessity langsung dari 03 §6 root cause DAN 01 §8 pembeda eksplisit
Trace Status: ✓ Fully Derived
```

## Gap 3 — Executive Cost Analytics: Isi Dashboard Konkret

**Business Responsibility:** *"`35` menolak Executive Analytics sebagai capability berdiri sendiri (benar, sesuai Removal Test), tapi 'Presentation Layer' butuh isi konkret supaya Fase 12 (`50`) bisa jadi User Documentation yang lengkap — bukan sekadar label kosong."*

```
Level 6 ✓ — necessity dari 35 (Presentation Layer sudah dikonfirmasi ada,
  hanya isinya belum didalami) — bukan capability baru, murni agregasi
Trace Status: ✓ Fully Derived
```

**Isi (murni AGREGASI dari capability yang sudah Frozen, tidak ada data baru):**
```
Executive Cost Analytics = agregasi dari:
  - Cost Control (35 #11): CPI/SPI per Project, basis Cost Baseline (Gap 2)
  - Cashflow Forecast (35 #12, Gap 1): proyeksi kas 4-12 minggu ke depan
  - Historical Cost Intelligence (35 #13): akurasi estimasi historis
    (Variance rata-rata per kategori pekerjaan, dari Lessons Learned Record)
Target audiens: Direktur/Owner — level agregat lintas-Project, BUKAN
  level Estimate Item (itu domain RAB Builder/RAP Builder individual)
```

**Zero-Invention check:** Tidak ada metrik baru diciptakan — ketiganya SUDAH ada sebagai output capability lain, dashboard ini murni menampilkannya di satu layar teragregasi, konsisten `35` keputusan "Presentation Layer, bukan data owner sendiri".

---

## Business Uncertainty — After

Sesudah dokumen ini: tim build tahu Cashflow Forecast memakai pola normal-CDF existing (bukan rumus baru), tahu Cost Baseline = RAP Version Frozen yang menggantikan `bac=totalRABValue` (menutup root cause `03` §6 secara eksplisit), dan tahu Executive Analytics murni agregasi 3 capability tanpa data baru.

## Definition of Done Self-Check (`34`)

| Kriteria | Status |
|---|---|
| 1-7 | ✓ |
| 8. Trace Status | ✓ 3/3 gap closure Fully Derived, 0 ❌ Invented |

**Hasil:** 8/8 ✓.

## Derivation Trace

```
This document derives from:
✓ Mission (01/02) ✓ Principles (04) ✓ Confirmed Domain (44)
✓ Frozen Capability (35) ✓ Capability Interaction (37)
✓ Kode existing (kurva-s.ts, evm-calculation.ts) — diverifikasi bac=totalRABValue
No new business concepts introduced.
```

## 🔒 STATUS: FROZEN — Ketiga Celah dari `51` Ditutup

Setelah dokumen ini, `51` § Bagian 2 (tiga celah) dinyatakan RESOLVED — dicatat balik di `51` sebagai referensi silang.
