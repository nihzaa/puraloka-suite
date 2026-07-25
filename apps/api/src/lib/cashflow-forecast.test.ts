import { describe, it, expect } from 'vitest'
import { forecastCashflow } from './cashflow-forecast.js'

// CECEP Milestone 4 — Cashflow Forecast: uji ANGKA, bukan "fungsi jalan".
// Forecast salah = proyeksi kas bohong. Invariant utama: Σ pencairan = baseline PERSIS.

describe('forecastCashflow — Σ pencairan = baseline (100% budget, bukan 99,4%)', () => {
  it('total 1.000.000 / 4 periode → jumlah PERSIS 1.000.000', () => {
    const f = forecastCashflow(1_000_000, 4)
    expect(f).toHaveLength(4)
    const sum = f.reduce((s, p) => s + p.disbursement, 0)
    expect(sum).toBe(1_000_000)                         // PERSIS, bukan ~993.800
    expect(f[3].cumulative).toBe(1_000_000)             // kumulatif berakhir tepat di baseline
  })

  it('total 500.000.000 / 12 periode → jumlah PERSIS baseline', () => {
    const f = forecastCashflow(500_000_000, 12)
    const sum = f.reduce((s, p) => s + p.disbursement, 0)
    expect(sum).toBeCloseTo(500_000_000, 6)
    expect(f[11].cumulative).toBe(500_000_000)
  })

  it('bentuk S-curve: pencairan tengah > pencairan awal & akhir', () => {
    const f = forecastCashflow(1_000_000, 10)
    const mid = f[4].disbursement + f[5].disbursement   // periode 5-6 (tengah)
    const edges = f[0].disbursement + f[9].disbursement  // periode 1 & 10 (ujung)
    expect(mid, 'pencairan tengah harus lebih besar dari ujung (kurva-S)').toBeGreaterThan(edges)
  })

  it('cumulative naik monoton', () => {
    const f = forecastCashflow(1_000_000, 8)
    for (let i = 1; i < f.length; i++) {
      expect(f[i].cumulative).toBeGreaterThanOrEqual(f[i - 1].cumulative)
    }
  })

  it('setiap periode simetris terhadap tengah (mu=0.5): periode-1 ≈ periode-terakhir', () => {
    // normalCDF simetris di mu=0.5 → distribusi simetris. Periode pertama ≈ terakhir
    // (kecuali sisa pembulatan yang diserap periode akhir).
    const f = forecastCashflow(1_000_000, 6)
    expect(f[0].disbursement).toBeCloseTo(f[5].disbursement, 0)
  })

  it('baseline 0 → semua periode 0 (bukan NaN)', () => {
    const f = forecastCashflow(0, 4)
    expect(f.every(p => p.disbursement === 0 && p.cumulative === 0)).toBe(true)
  })

  it('periods 0 → array kosong (bukan divide-by-zero)', () => {
    expect(forecastCashflow(1_000_000, 0)).toEqual([])
  })

  it('1 periode → seluruh baseline cair sekaligus', () => {
    const f = forecastCashflow(1_000_000, 1)
    expect(f).toHaveLength(1)
    expect(f[0].disbursement).toBe(1_000_000)
  })
})
