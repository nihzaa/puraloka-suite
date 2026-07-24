// Pure-logic denda keterlambatan (late-payment penalty). Zero I/O — mudah diuji.
// Angka OTORITATIF (dipersist) & ESTIMASI (compute-on-read tampilan) pakai fungsi yang
// SAMA → konsisten. Perbedaannya hanya atDate: paidDate (otoritatif) vs today (estimasi).
//
// Konvensi: rate & cap = FRAKSI 0..1 (seragam financial_config). Tanggal = YYYY-MM-DD WIB
// (derivasi ke WIB dilakukan pemanggil; di sini murni aritmetika kalender).

export type PenaltyBasis = 'invoice_telat' | 'outstanding_proyek' | 'kontrak_total'
export const PENALTY_BASES: PenaltyBasis[] = ['invoice_telat', 'outstanding_proyek', 'kontrak_total']

export interface PenaltyTerms {
  enabled: boolean
  basis: PenaltyBasis
  ratePerDay: number
  capPct: number
  graceDays: number
}

/** Override per-field (null/undefined = pakai global). Pola COALESCE seperti retensi. */
export interface PenaltyOverride {
  enabled?: boolean | null
  basis?: PenaltyBasis | null
  ratePerDay?: number | null
  capPct?: number | null
  graceDays?: number | null
}

/** Terms efektif = override proyek per-field bila ada, selain itu global. */
export function resolvePenaltyTerms(override: PenaltyOverride | null | undefined, global: PenaltyTerms): PenaltyTerms {
  const o = override ?? {}
  return {
    enabled:    o.enabled    ?? global.enabled,
    basis:      o.basis      ?? global.basis,
    ratePerDay: o.ratePerDay ?? global.ratePerDay,
    capPct:     o.capPct     ?? global.capPct,
    graceDays:  o.graceDays  ?? global.graceDays,
  }
}

/** Ubah 'YYYY-MM-DD' (WIB) → nomor hari epoch (UTC midnight) tanpa jebakan timezone. */
function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000)
}

/**
 * Hari telat efektif = (atDate − dueDate) − graceDays, di-floor ke 0.
 * dueDate & atDate = tanggal kalender WIB. H+1 (grace 0): bayar tepat due_date = 0 hari telat.
 */
export function daysLateWIB(dueDate: string, atDate: string, graceDays: number): number {
  const raw = dayNumber(atDate) - dayNumber(dueDate)
  return Math.max(0, raw - Math.max(0, Math.trunc(graceDays || 0)))
}

export interface PenaltyInput {
  terms: PenaltyTerms
  waived: boolean
  baseAmount: number      // nilai basis (mis. total_amount invoice) — diresolusi pemanggil
  dueDate: string         // YYYY-MM-DD
  atDate: string          // YYYY-MM-DD WIB — paidDate (otoritatif) / today (estimasi)
}

export type PenaltyReason = 'ok' | 'disabled' | 'waived' | 'not_late' | 'no_base'

export interface PenaltyResult {
  applicable: boolean
  reason: PenaltyReason
  daysLate: number
  baseAmount: number
  rawAmount: number       // base × rate × days (sebelum cap)
  capAmount: number       // base × cap_pct
  penaltyAmount: number   // min(raw, cap) — dibulatkan 2 desimal
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Hitung denda. Fail-safe: OFF/waived/tidak-telat/tanpa-basis → penaltyAmount 0 dgn reason
 * eksplisit (tidak melempar). penaltyAmount = min(raw, cap).
 */
export function computePenalty(input: PenaltyInput): PenaltyResult {
  const zero = (reason: PenaltyReason, daysLate = 0): PenaltyResult => ({
    applicable: false, reason, daysLate,
    baseAmount: input.baseAmount, rawAmount: 0, capAmount: 0, penaltyAmount: 0,
  })
  if (!input.terms.enabled) return zero('disabled')
  if (input.waived) return zero('waived')
  const daysLate = daysLateWIB(input.dueDate, input.atDate, input.terms.graceDays)
  if (daysLate <= 0) return zero('not_late', daysLate)
  if (!(input.baseAmount > 0)) return zero('no_base', daysLate)

  const raw = input.baseAmount * input.terms.ratePerDay * daysLate
  const cap = input.baseAmount * input.terms.capPct
  const penalty = round2(Math.min(raw, cap))
  return {
    applicable: true, reason: 'ok', daysLate,
    baseAmount: input.baseAmount, rawAmount: round2(raw), capAmount: round2(cap), penaltyAmount: penalty,
  }
}
