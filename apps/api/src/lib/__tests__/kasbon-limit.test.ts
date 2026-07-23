import { describe, it, expect } from 'vitest'
import { checkKasbonLimit, type KasbonLimitCheck } from '../kasbon-limit.js'

// Batas kasbon — keputusan MURNI. Q2: toggle default OFF (fail-open), enforce hanya progress_pct.

const base: KasbonLimitCheck = {
  enabled: true, paymentSystem: 'progress_pct',
  earnedValue: 10_000_000, existingApprovedSum: 0, newAmount: 1_000_000, limitPct: 80,
}

describe('checkKasbonLimit — toggle OFF (default)', () => {
  it('selalu diizinkan saat enabled=false (nol perubahan perilaku hari ini)', () => {
    // Bahkan kasbon jauh melebihi earned → tetap allowed karena toggle OFF.
    const r = checkKasbonLimit({ ...base, enabled: false, newAmount: 999_000_000 })
    expect(r.allowed).toBe(true)
  })
})

describe('checkKasbonLimit — hanya progress_pct', () => {
  it('scope harian tak dibatasi walau enabled', () => {
    expect(checkKasbonLimit({ ...base, paymentSystem: 'harian', newAmount: 999_000_000 }).allowed).toBe(true)
  })
  it('scope borongan tak dibatasi', () => {
    expect(checkKasbonLimit({ ...base, paymentSystem: 'borongan', newAmount: 999_000_000 }).allowed).toBe(true)
  })
})

describe('checkKasbonLimit — enforcement progress_pct (enabled)', () => {
  it('izin bila di bawah batas (earned 10jt × 80% = 8jt; kasbon 1jt ≤ 8jt)', () => {
    expect(checkKasbonLimit(base).allowed).toBe(true)
  })

  it('izin tepat di batas (total = 8jt persis)', () => {
    expect(checkKasbonLimit({ ...base, newAmount: 8_000_000 }).allowed).toBe(true)
  })

  it('TOLAK bila melebihi batas (total 8.1jt > 8jt)', () => {
    const r = checkKasbonLimit({ ...base, newAmount: 8_100_000 })
    expect(r.allowed).toBe(false)
    if (!r.allowed) { expect(r.limit).toBe(8_000_000); expect(r.wouldBe).toBe(8_100_000); expect(r.reason).toContain('80%') }
  })

  it('memperhitungkan kasbon approved sebelumnya (existing 7.5jt + 1jt = 8.5jt > 8jt)', () => {
    expect(checkKasbonLimit({ ...base, existingApprovedSum: 7_500_000, newAmount: 1_000_000 }).allowed).toBe(false)
  })

  it('earned 0 (progress 0%) → batas 0 → kasbon apa pun ditolak', () => {
    const r = checkKasbonLimit({ ...base, earnedValue: 0, newAmount: 1 })
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.limit).toBe(0)
  })

  it('limitPct berbeda per proyek dihormati (limit 50% → batas 5jt)', () => {
    expect(checkKasbonLimit({ ...base, limitPct: 50, newAmount: 5_500_000 }).allowed).toBe(false)
    expect(checkKasbonLimit({ ...base, limitPct: 50, newAmount: 4_000_000 }).allowed).toBe(true)
  })
})
