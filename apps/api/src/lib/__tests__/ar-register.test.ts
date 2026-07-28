import { describe, it, expect } from 'vitest'
import {
  daysPastDue, agingBucketFor, computeAging, retentionOutstanding,
  validateDpDeduction, AGING_BUCKET_LABELS, AGING_BUCKET_KEYS, DP_EPSILON,
} from '../ar-register.js'

// Register piutang — bucket 30/60/90, retensi, dan validasi potongan DP.

describe('daysPastDue', () => {
  it('0 hari tepat di tanggal jatuh tempo', () => {
    expect(daysPastDue('2026-07-01', '2026-07-01')).toBe(0)
  })
  it('positif setelah jatuh tempo, negatif sebelum', () => {
    expect(daysPastDue('2026-07-01', '2026-07-31')).toBe(30)
    expect(daysPastDue('2026-07-01', '2026-06-30')).toBe(-1)
  })
  it('lintas bulan/tahun dihitung kalender penuh', () => {
    expect(daysPastDue('2025-12-31', '2026-01-30')).toBe(30)
  })
})

describe('agingBucketFor — batas bucket 30/60/90 presisi', () => {
  it('jatuh tempo hari ini / belum lewat → current', () => {
    expect(agingBucketFor('2026-07-15', '2026-07-15')).toBe('current')
    expect(agingBucketFor('2026-07-20', '2026-07-15')).toBe('current')
  })
  it('hari ke-1 dan ke-30 → d1_30; hari ke-31 → d31_60', () => {
    expect(agingBucketFor('2026-07-01', '2026-07-02')).toBe('d1_30')
    expect(agingBucketFor('2026-06-01', '2026-07-01')).toBe('d1_30')   // tepat 30
    expect(agingBucketFor('2026-06-01', '2026-07-02')).toBe('d31_60')  // 31
  })
  it('tepat 60 → d31_60; 61 → d61_90; tepat 90 → d61_90; 91 → d90_plus', () => {
    expect(agingBucketFor('2026-05-01', '2026-06-30')).toBe('d31_60')  // 60
    expect(agingBucketFor('2026-05-01', '2026-07-01')).toBe('d61_90')  // 61
    expect(agingBucketFor('2026-04-01', '2026-06-30')).toBe('d61_90')  // 90
    expect(agingBucketFor('2026-04-01', '2026-07-01')).toBe('d90_plus')// 91
  })
})

describe('computeAging', () => {
  const inv = (id: string, due: string, amount: number, status = 'sent') =>
    ({ id, due_date: due, amount_due: amount, status })

  it('POSITIF: menjumlah per bucket + total + rows', () => {
    const r = computeAging([
      inv('a', '2026-07-20', 100),          // current
      inv('b', '2026-07-01', 200),          // 14 hari → d1_30
      inv('c', '2026-05-20', 300),          // 56 → d31_60
      inv('d', '2026-04-20', 400),          // 86 → d61_90
      inv('e', '2026-01-01', 500),          // 195 → d90_plus
    ], '2026-07-15')
    expect(r.buckets).toEqual({ current: 100, d1_30: 200, d31_60: 300, d61_90: 400, d90_plus: 500 })
    expect(r.total).toBe(1500)
    expect(r.count).toBe(5)
    expect(r.rows.find(x => x.id === 'e')?.days_past_due).toBe(195)
  })

  it('NEGATIF: draft/paid/cancelled dan amount_due 0 TIDAK dihitung', () => {
    const r = computeAging([
      inv('a', '2026-06-01', 100, 'draft'),
      inv('b', '2026-06-01', 100, 'paid'),
      inv('c', '2026-06-01', 100, 'cancelled'),
      inv('d', '2026-06-01', 0, 'sent'),
      inv('e', '2026-06-01', 100, 'partial'),
      inv('f', '2026-06-01', 100, 'overdue'),
    ], '2026-07-15')
    expect(r.count).toBe(2)
    expect(r.total).toBe(200)
  })

  it('menerima numerik string (representasi NUMERIC Postgres)', () => {
    const r = computeAging([{ id: 'a', due_date: '2026-07-01', amount_due: '150.50', status: 'sent' }], '2026-07-15')
    expect(r.total).toBe(150.5)
  })

  it('label & keys bucket konsisten', () => {
    expect(AGING_BUCKET_KEYS).toHaveLength(5)
    for (const k of AGING_BUCKET_KEYS) expect(AGING_BUCKET_LABELS[k]).toBeTruthy()
  })
})

describe('retentionOutstanding', () => {
  it('ditahan − dicairkan', () => {
    expect(retentionOutstanding(10_000_000, 4_000_000)).toBe(6_000_000)
    expect(retentionOutstanding(0, 0)).toBe(0)
  })
})

describe('validateDpDeduction', () => {
  const base = { dpPaid: 30_000_000, alreadyRecouped: 10_000_000, invoiceNet: 50_000_000 }

  it('POSITIF: potongan ≤ saldo & ≤ nilai tagihan → ok + saldo benar', () => {
    const v = validateDpDeduction({ ...base, deduction: 20_000_000 })
    expect(v).toEqual({ ok: true, available: 20_000_000 })
  })

  it('POSITIF: selisih pembulatan ≤ epsilon → ok', () => {
    const v = validateDpDeduction({ ...base, deduction: 20_000_000 + DP_EPSILON / 2 })
    expect(v.ok).toBe(true)
  })

  it('NEGATIF: potongan melebihi saldo DP → ditolak dengan pesan saldo', () => {
    const v = validateDpDeduction({ ...base, deduction: 20_000_001 })
    expect(v.ok).toBe(false)
    expect(v.error).toContain('melebihi saldo DP')
  })

  it('NEGATIF: potongan melebihi nilai tagihan invoice → ditolak', () => {
    const v = validateDpDeduction({ dpPaid: 100_000_000, alreadyRecouped: 0, invoiceNet: 5_000_000, deduction: 6_000_000 })
    expect(v.ok).toBe(false)
    expect(v.error).toContain('melebihi nilai tagihan')
  })

  it('NEGATIF: potongan 0/negatif → ditolak', () => {
    expect(validateDpDeduction({ ...base, deduction: 0 }).ok).toBe(false)
    expect(validateDpDeduction({ ...base, deduction: -5 }).ok).toBe(false)
  })

  it('NEGATIF: DP belum terbayar sama sekali (hanya ditagih) → saldo 0, ditolak', () => {
    const v = validateDpDeduction({ dpPaid: 0, alreadyRecouped: 0, invoiceNet: 10_000_000, deduction: 1 })
    expect(v.ok).toBe(false)
    expect(v.available).toBe(0)
  })
})
