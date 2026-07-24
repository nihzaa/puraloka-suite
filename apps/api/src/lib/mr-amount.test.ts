import { describe, it, expect } from 'vitest'
import { computeMrAmount } from './mr-amount.js'
import { applicableSteps } from './approval-engine.js'

describe('computeMrAmount — dasar syarat nominal MR', () => {
  it('menjumlahkan qty × estimasi harga', () => {
    expect(computeMrAmount([
      { qty_requested: 10, unit_price_est: 50_000 },
      { qty_requested: 2, unit_price_est: 1_000_000 },
    ])).toBe(2_500_000)
  })

  it('menerima angka berbentuk string (numeric Postgres lewat pg → string)', () => {
    expect(computeMrAmount([{ qty_requested: '3', unit_price_est: '250000' }])).toBe(750_000)
  })

  it('MR tanpa item bernilai 0', () => {
    expect(computeMrAmount([])).toBe(0)
  })

  it('qty kosong dihitung nol (hanya HARGA yang tak diketahui bersifat fail-closed)', () => {
    expect(computeMrAmount([{ qty_requested: null, unit_price_est: 100 }])).toBe(0)
  })

  it('FAIL-CLOSED: satu item tanpa estimasi harga → nilai TAK DIKETAHUI (Infinity)', () => {
    expect(computeMrAmount([
      { qty_requested: 1, unit_price_est: 10_000 },
      { qty_requested: 5, unit_price_est: null },
    ])).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('Celah yang ditutup: mengosongkan harga TIDAK boleh melewati ambang', () => {
  const chain = [
    { level: 1, required_permission: 'procurement:mr:manage', min_amount: null },
    { level: 2, required_permission: 'settings:finance:manage', min_amount: 50_000_000 },
  ]

  it('MR besar berestimasi lengkap → butuh 2 level', () => {
    const amount = computeMrAmount([{ qty_requested: 100, unit_price_est: 1_000_000 }])
    expect(applicableSteps(chain, amount).map(s => s.level)).toEqual([1, 2])
  })

  it('MR SAMA tapi harga dikosongkan → TETAP butuh 2 level, bukan turun ke 1', () => {
    const amount = computeMrAmount([{ qty_requested: 100, unit_price_est: null }])
    expect(applicableSteps(chain, amount).map(s => s.level)).toEqual([1, 2])
  })

  it('MR kecil berestimasi lengkap → cukup 1 level (ambang tidak kena)', () => {
    const amount = computeMrAmount([{ qty_requested: 2, unit_price_est: 100_000 }])
    expect(applicableSteps(chain, amount).map(s => s.level)).toEqual([1])
  })
})
