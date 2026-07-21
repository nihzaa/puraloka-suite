import { describe, it, expect } from 'vitest'
import { normalCDF, calculateEVM } from '../evm-calculation'

// Task 1.2.2 — test case wajib per Phase1/06-test-strategy.md § Unit Test
// (yang genuinely pure function — filter status approved/pending adalah
// logic query Supabase, bukan bagian normalCDF/calculateEVM, lihat commit).

describe('normalCDF', () => {
  it('mendekati 0.5 di titik tengah (x=mu=0.5)', () => {
    expect(normalCDF(0.5)).toBeCloseTo(0.5, 2)
  })

  it('mendekati 0 untuk x jauh di bawah mean (distribusi tidak simetris terhadap 0)', () => {
    expect(normalCDF(0)).toBeLessThan(0.01)
  })

  it('mendekati 1 untuk x jauh di atas mean', () => {
    expect(normalCDF(1)).toBeGreaterThan(0.99)
  })

  it('monoton naik — CDF x2 > CDF x1 untuk x2 > x1', () => {
    const a = normalCDF(0.2)
    const b = normalCDF(0.5)
    const c = normalCDF(0.8)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})

describe('calculateEVM', () => {
  it('proyek baru mulai (ev=0, ac=0, pv=0) — cpi/spi null, bukan NaN/Infinity', () => {
    const result = calculateEVM({ bac: 1000000, ac: 0, ev: 0, pv: 0 })
    expect(result.cpi).toBeNull()
    expect(result.spi).toBeNull()
    expect(result.sv).toBe(0)
    expect(result.cv).toBe(0)
    expect(result.eac).toBeNull()
  })

  it('proyek selesai (ev=bac, on-budget) — cpi=1, vac=0', () => {
    const result = calculateEVM({ bac: 1000000, ac: 1000000, ev: 1000000, pv: 1000000 })
    expect(result.cpi).toBe(1)
    expect(result.spi).toBe(1)
    expect(result.eac).toBe(1000000)
    expect(result.vac).toBe(0)
  })

  it('proyek over-budget (ac > ev) — cpi < 1, cv negatif', () => {
    const result = calculateEVM({ bac: 1000000, ac: 600000, ev: 500000, pv: 500000 })
    expect(result.cpi).toBeLessThan(1)
    expect(result.cv).toBeLessThan(0)
  })

  it('proyek under-budget (ac < ev) — cpi > 1, cv positif', () => {
    const result = calculateEVM({ bac: 1000000, ac: 400000, ev: 500000, pv: 500000 })
    expect(result.cpi).toBeGreaterThan(1)
    expect(result.cv).toBeGreaterThan(0)
  })

  it('proyek di belakang jadwal (ev < pv) — spi < 1, sv negatif', () => {
    const result = calculateEVM({ bac: 1000000, ac: 300000, ev: 300000, pv: 500000 })
    expect(result.spi).toBeLessThan(1)
    expect(result.sv).toBeLessThan(0)
  })

  it('tcpi null jika sisa budget habis tapi pekerjaan belum selesai (bac<=ac)', () => {
    const result = calculateEVM({ bac: 1000000, ac: 1000000, ev: 800000, pv: 800000 })
    expect(result.tcpi).toBeNull()
  })
})
