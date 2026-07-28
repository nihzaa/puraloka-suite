// Register piutang (PETA-PRIORITAS-ERP §3 item #3) — fungsi murni ber-test:
// AR aging bucket 30/60/90, register retensi, dan validasi potongan uang muka
// (DP recoupment). Rumus finansial tetap kode [C]; angka/parameter dari data.
//
// Semua tanggal berbasis string 'YYYY-MM-DD' dihitung di UTC (hari kalender,
// bebas timezone server) — konsisten dengan kolom DATE Postgres.

export const AGING_BUCKET_KEYS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const
export type AgingBucketKey = (typeof AGING_BUCKET_KEYS)[number]

export const AGING_BUCKET_LABELS: Record<AgingBucketKey, string> = {
  current: 'Belum jatuh tempo',
  d1_30: '1–30 hari',
  d31_60: '31–60 hari',
  d61_90: '61–90 hari',
  d90_plus: '>90 hari',
}

const MS_PER_DAY = 86_400_000

/** Hari lewat jatuh tempo (kalender, UTC). Negatif/0 = belum jatuh tempo. */
export function daysPastDue(dueDate: string, asOf: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const at = Date.parse(`${asOf}T00:00:00Z`)
  return Math.floor((at - due) / MS_PER_DAY)
}

/** Bucket aging 30/60/90 untuk satu jatuh tempo. */
export function agingBucketFor(dueDate: string, asOf: string): AgingBucketKey {
  const days = daysPastDue(dueDate, asOf)
  if (days <= 0) return 'current'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'd90_plus'
}

export interface AgingInvoiceInput {
  id: string
  due_date: string
  amount_due: number | string
  status: string
}

/** Status invoice yang DIHITUNG sebagai piutang berjalan. draft belum resmi
 *  ditagihkan; paid/cancelled bukan piutang. */
const RECEIVABLE_STATUSES = new Set(['sent', 'partial', 'overdue'])

export interface AgingRow {
  id: string
  due_date: string
  amount_due: number
  days_past_due: number
  bucket: AgingBucketKey
}

export interface AgingSummary {
  buckets: Record<AgingBucketKey, number>
  total: number
  count: number
  rows: AgingRow[]
}

/** Rekap aging: filter status piutang + amount_due > 0, kelompokkan per bucket. */
export function computeAging(invoices: AgingInvoiceInput[], asOf: string): AgingSummary {
  const buckets: Record<AgingBucketKey, number> = {
    current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0,
  }
  const rows: AgingRow[] = []
  for (const inv of invoices) {
    const due = Number(inv.amount_due)
    if (!RECEIVABLE_STATUSES.has(inv.status) || !(due > 0)) continue
    const bucket = agingBucketFor(inv.due_date, asOf)
    buckets[bucket] += due
    rows.push({
      id: inv.id,
      due_date: inv.due_date,
      amount_due: due,
      days_past_due: daysPastDue(inv.due_date, asOf),
      bucket,
    })
  }
  const total = rows.reduce((s, r) => s + r.amount_due, 0)
  return { buckets, total, count: rows.length, rows }
}

/** Sisa retensi yang masih ditahan klien: ditahan − sudah dicairkan. */
export function retentionOutstanding(withheld: number, released: number): number {
  return withheld - released
}

/** Toleransi pembulatan NUMERIC(15,2) — 1 sen, bukan parameter bisnis. */
export const DP_EPSILON = 0.01

export interface DpDeductionInput {
  /** Potongan DP yang diminta pada invoice ini. */
  deduction: number
  /** DP yang benar-benar sudah DIBAYAR klien (Σ amount_paid invoice termin on_sign, non-cancelled). */
  dpPaid: number
  /** DP yang sudah dipotong di invoice-invoice sebelumnya (non-cancelled). */
  alreadyRecouped: number
  /** Nilai tagihan invoice ini sebelum pajak & sebelum potongan DP (base + komisi − retensi). */
  invoiceNet: number
}

export interface DpDeductionVerdict {
  ok: boolean
  /** Saldo DP yang masih bisa dipotong. */
  available: number
  error?: string
}

/**
 * Potongan DP sah bila: > 0, tidak melebihi saldo DP tersedia (dpPaid −
 * alreadyRecouped), dan tidak melebihi nilai tagihan invoice itu sendiri.
 * Fail-closed: saldo hanya dari DP yang TERBAYAR, bukan yang baru ditagih.
 */
export function validateDpDeduction(input: DpDeductionInput): DpDeductionVerdict {
  const available = input.dpPaid - input.alreadyRecouped
  if (!(input.deduction > 0)) {
    return { ok: false, available, error: 'Potongan DP harus lebih dari 0' }
  }
  if (input.deduction > available + DP_EPSILON) {
    return {
      ok: false,
      available,
      error: `Potongan DP (${input.deduction}) melebihi saldo DP tersedia (${available}) — DP terbayar ${input.dpPaid}, sudah dipotong ${input.alreadyRecouped}`,
    }
  }
  if (input.deduction > input.invoiceNet + DP_EPSILON) {
    return {
      ok: false,
      available,
      error: `Potongan DP (${input.deduction}) melebihi nilai tagihan invoice (${input.invoiceNet})`,
    }
  }
  return { ok: true, available }
}
