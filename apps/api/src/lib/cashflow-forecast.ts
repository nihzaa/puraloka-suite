import { normalCDF } from './evm-calculation.js'

// CECEP Milestone 4 — Cashflow Forecast (murni, ber-test angka).
//
// `52` Gap 1: "Cashflow Forecast memproyeksikan kas KE DEPAN berbasis rencana
// (Estimate/RAP), BEDA dari cashflow AKTUAL existing (cash_accounts)." Read-model —
// tidak ada tabel baru. `52` mewajibkan MEWARISI pola normal-CDF `kurva-s.ts`
// (Zero-Invention: pakai model terbukti, bukan rumus baru), jadi memakai
// `normalCDF` (mu=0.5, sigma=0.2) yang SAMA.
//
// ── SATU penyimpangan dari kurva-s, diturunkan & dilaporkan ─────────────────
// kurva-s memakai CDF mentah (prevCdf mulai 0), sehingga total kurva berhenti di
// ~99.4% (normalCDF(1)≈0.9938) — truncation ekor yang tak masalah untuk KURVA
// PROGRES visual. Tapi Cashflow FORECAST memproyeksikan PENCAIRAN KAS: total yang
// dicairkan HARUS = baseline penuh (100% budget dibelanjakan sepanjang proyek),
// bukan 99.4%. Maka di sini distribusi DINORMALISASI ke massa CDF total, sehingga
// Σ pencairan = baseline PERSIS. Ini bukan model baru — hanya normalisasi lurus
// terhadap pola yang sama, agar angka forecast tak "bocor" 0,6% budget diam-diam.

export interface CashflowPeriod {
  period: number       // 1..periods
  disbursement: number // pencairan pada periode ini
  cumulative: number   // kumulatif s/d periode ini
}

/**
 * Distribusikan `baselineTotal` ke `periods` periode mengikuti kurva-S normal-CDF.
 *
 * INVARIANT yang diuji: Σ disbursement = baselineTotal PERSIS (dinormalisasi);
 * bentuk S-curve (pencairan kecil di awal & akhir, besar di tengah); cumulative
 * naik monoton berakhir di baselineTotal.
 */
export function forecastCashflow(baselineTotal: number, periods: number): CashflowPeriod[] {
  if (periods <= 0) return []
  if (baselineTotal <= 0) {
    return Array.from({ length: periods }, (_, i) => ({ period: i + 1, disbursement: 0, cumulative: 0 }))
  }

  // Massa CDF total pada rentang [0,1] — pembagi normalisasi.
  const cdfAt = (i: number) => normalCDF(i / periods)
  const totalMass = cdfAt(periods) - cdfAt(0)

  const out: CashflowPeriod[] = []
  let cumulative = 0
  for (let i = 1; i <= periods; i++) {
    const share = (cdfAt(i) - cdfAt(i - 1)) / totalMass
    // Periode terakhir menyerap sisa pembulatan → cumulative berakhir PERSIS di total.
    const disbursement = i < periods ? baselineTotal * share : baselineTotal - cumulative
    cumulative += disbursement
    out.push({ period: i, disbursement, cumulative })
  }
  return out
}
