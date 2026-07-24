import { describe, it, expect } from 'vitest'
import {
  resolvePenaltyTerms, daysLateWIB, computePenalty, PENALTY_BASES,
  type PenaltyTerms,
} from './penalty.js'

const GLOBAL: PenaltyTerms = { enabled: true, basis: 'invoice_telat', ratePerDay: 0.001, capPct: 0.05, graceDays: 0 }

describe('resolvePenaltyTerms', () => {
  it('pakai global saat override kosong', () => {
    expect(resolvePenaltyTerms(null, GLOBAL)).toEqual(GLOBAL)
    expect(resolvePenaltyTerms({}, GLOBAL)).toEqual(GLOBAL)
  })
  it('override per-field menang (COALESCE, seperti retensi)', () => {
    const r = resolvePenaltyTerms({ ratePerDay: 0.002, graceDays: 7 }, GLOBAL)
    expect(r.ratePerDay).toBe(0.002)
    expect(r.graceDays).toBe(7)
    expect(r.capPct).toBe(0.05) // tak di-override → global
    expect(r.enabled).toBe(true)
  })
  it('override enabled=false mematikan denda utk proyek itu', () => {
    expect(resolvePenaltyTerms({ enabled: false }, GLOBAL).enabled).toBe(false)
  })
  it('override basis dihormati', () => {
    expect(resolvePenaltyTerms({ basis: 'kontrak_total' }, GLOBAL).basis).toBe('kontrak_total')
  })
})

describe('daysLateWIB (batas tanggal — C5)', () => {
  it('bayar tepat due_date = 0 hari telat (H+1, grace 0)', () => {
    expect(daysLateWIB('2026-08-01', '2026-08-01', 0)).toBe(0)
  })
  it('H+1 = 1 hari telat', () => {
    expect(daysLateWIB('2026-08-01', '2026-08-02', 0)).toBe(1)
  })
  it('bayar sebelum jatuh tempo = 0 (tak pernah negatif)', () => {
    expect(daysLateWIB('2026-08-10', '2026-08-01', 0)).toBe(0)
  })
  it('grace menyerap keterlambatan', () => {
    expect(daysLateWIB('2026-08-01', '2026-08-06', 7)).toBe(0) // 5 telat, grace 7
    expect(daysLateWIB('2026-08-01', '2026-08-09', 7)).toBe(1) // 8 telat - 7 grace = 1
  })
  it('lintas bulan & tahun akurat', () => {
    expect(daysLateWIB('2026-12-31', '2027-01-10', 0)).toBe(10)
    expect(daysLateWIB('2026-01-31', '2026-03-01', 0)).toBe(29) // 2026 non-kabisat
  })
  it('mengabaikan komponen waktu (slice ke tanggal)', () => {
    expect(daysLateWIB('2026-08-01', '2026-08-21T23:59:59+07:00', 0)).toBe(20)
  })
})

describe('computePenalty', () => {
  it('OFF → 0 (nol perubahan perilaku saat default OFF)', () => {
    const r = computePenalty({ terms: { ...GLOBAL, enabled: false }, waived: false, baseAmount: 1e8, dueDate: '2026-08-01', atDate: '2026-09-01' })
    expect(r.applicable).toBe(false); expect(r.reason).toBe('disabled'); expect(r.penaltyAmount).toBe(0)
  })
  it('waived → 0 (pemutihan menang, jangan akali tanggal)', () => {
    const r = computePenalty({ terms: GLOBAL, waived: true, baseAmount: 1e8, dueDate: '2026-08-01', atDate: '2026-09-01' })
    expect(r.reason).toBe('waived'); expect(r.penaltyAmount).toBe(0)
  })
  it('belum telat → 0', () => {
    const r = computePenalty({ terms: GLOBAL, waived: false, baseAmount: 1e8, dueDate: '2026-08-01', atDate: '2026-08-01' })
    expect(r.reason).toBe('not_late'); expect(r.penaltyAmount).toBe(0)
  })
  it('basis 0/negatif → 0', () => {
    const r = computePenalty({ terms: GLOBAL, waived: false, baseAmount: 0, dueDate: '2026-08-01', atDate: '2026-09-01' })
    expect(r.reason).toBe('no_base'); expect(r.penaltyAmount).toBe(0)
  })
  it('contoh founder: invoice 100jt telat 20 hari, 1‰/hari = 2jt (di bawah cap 5%)', () => {
    const r = computePenalty({ terms: GLOBAL, waived: false, baseAmount: 100_000_000, dueDate: '2026-08-01', atDate: '2026-08-21' })
    expect(r.daysLate).toBe(20)
    expect(r.rawAmount).toBe(2_000_000)
    expect(r.capAmount).toBe(5_000_000)
    expect(r.penaltyAmount).toBe(2_000_000)
    expect(r.applicable).toBe(true)
  })
  it('cap 5% mengunci saat telat sangat lama (100 hari → cap, bukan 10jt)', () => {
    const r = computePenalty({ terms: GLOBAL, waived: false, baseAmount: 100_000_000, dueDate: '2026-08-01', atDate: '2026-11-09' })
    expect(r.daysLate).toBe(100)
    expect(r.rawAmount).toBe(10_000_000) // 100jt × 0.001 × 100
    expect(r.penaltyAmount).toBe(5_000_000) // dikunci cap 5%
  })
  it('tepat di titik cap (50 hari → raw = cap)', () => {
    const r = computePenalty({ terms: GLOBAL, waived: false, baseAmount: 100_000_000, dueDate: '2026-08-01', atDate: '2026-09-20' })
    expect(r.daysLate).toBe(50)
    expect(r.rawAmount).toBe(5_000_000)
    expect(r.penaltyAmount).toBe(5_000_000)
  })
  it('rate berbeda via terms (efek effective-dating/override) mengubah hasil', () => {
    const backdated = computePenalty({ terms: { ...GLOBAL, ratePerDay: 0.0005 }, waived: false, baseAmount: 100_000_000, dueDate: '2026-08-01', atDate: '2026-08-21' })
    expect(backdated.penaltyAmount).toBe(1_000_000) // 0.5‰ → separuh
  })
})

describe('PENALTY_BASES', () => {
  it('tiga basis valid', () => {
    expect(PENALTY_BASES).toEqual(['invoice_telat', 'outstanding_proyek', 'kontrak_total'])
  })
})
