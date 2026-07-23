export type TaxScheme = 'pph_final' | 'ppn'

export const TAX_RATE_BY_SCHEME: Record<TaxScheme, number> = {
  ppn: 0.11,
  pph_final: 0.02,
}

export interface TaxCalculationResult {
  baseAmount: number
  taxRate: number
  taxAmount: number
  totalAmount: number
}

/**
 * Kalkulasi pajak termin — diekstrak dari termin-payment.ts:174-177 (perilaku
 * identik, termasuk pembulatan parseFloat/toFixed(2)). Skema selain 'ppn'
 * diperlakukan sebagai 'pph_final' (0.02), sama seperti kode asal
 * (`project.tax_scheme === 'ppn' ? 0.11 : 0.02`).
 *
 * Fail-closed pada input tidak valid: nominal nol/negatif ditolak (throw),
 * bukan dihitung diam-diam menjadi 0 atau negatif — Phase1/06-test-strategy.md
 * § Unit Test eksplisit mensyaratkan ini sebagai test case wajib.
 *
 * `rate` opsional (Sub-Fase 1B.1 — rate injection): jika diberikan, dipakai
 * sebagai tarif; jika tidak, jatuh ke konstanta TAX_RATE_BY_SCHEME (perilaku
 * lama, identik). Fungsi tetap PURE & sinkron — caller yang membaca config
 * (async) lalu meng-inject tarif. Sumber tarif = config, tetapi kalkulasinya
 * tidak berubah dan tetap dapat diuji tanpa I/O.
 */
export function calculateTax(
  baseAmount: number,
  taxScheme: string | null | undefined,
  rate?: number,
): TaxCalculationResult {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    throw new Error(`calculateTax: baseAmount harus angka positif, diterima: ${baseAmount}`)
  }

  const fallbackRate = taxScheme === 'ppn' ? TAX_RATE_BY_SCHEME.ppn : TAX_RATE_BY_SCHEME.pph_final
  // Inject rate hanya jika valid (fraksi 0..1); selain itu pakai konstanta (fail-safe).
  const taxRate = (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1)
    ? rate
    : fallbackRate
  const taxAmount = parseFloat((baseAmount * taxRate).toFixed(2))
  const totalAmount = parseFloat((baseAmount + taxAmount).toFixed(2))

  return { baseAmount, taxRate, taxAmount, totalAmount }
}
