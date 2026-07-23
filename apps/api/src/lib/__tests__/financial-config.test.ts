import { describe, it, expect } from 'vitest'
import { selectEffectiveValue, todayWIB, type EffectiveRow } from '../financial-config.js'

// Config finansial effective-dated — logika MURNI. Syarat founder C1 (date-aware nyata)
// + C3 (timezone WIB boundary) + C4 (half-open, tak overlap).

const row = (value: unknown, from: string, to: string | null): EffectiveRow => ({ value, effectiveFrom: from, effectiveTo: to })

describe('selectEffectiveValue — half-open [from, to)', () => {
  // Riwayat: 0.10 [epoch..2026-08-01), 0.11 [2026-08-01..∞)
  const history: EffectiveRow[] = [
    row(0.10, '2000-01-01', '2026-08-01'),
    row(0.11, '2026-08-01', null),
  ]

  it('C1 (date-aware NYATA): dokumen bertanggal MASA LALU pakai tarif LAMA meski tarif baru sudah ada', () => {
    // Ini yang membuktikan getTaxRate benar-benar date-aware (bukan lolos palsu karena persist):
    // invoice backdated 2026-07-31 → HARUS 0.10, walau 0.11 sudah berlaku sejak 2026-08-01.
    expect(selectEffectiveValue(history, '2026-07-31')).toBe(0.10)
  })

  it('dokumen pada/sesudah tanggal berlaku baru pakai tarif baru', () => {
    expect(selectEffectiveValue(history, '2026-08-01')).toBe(0.11) // batas bawah inklusif
    expect(selectEffectiveValue(history, '2026-12-31')).toBe(0.11)
  })

  it('batas atas EKSKLUSIF: tanggal == effective_to rentang lama = sudah masuk rentang baru', () => {
    // 2026-08-01 bukan lagi milik [.., 2026-08-01) → milik [2026-08-01, ∞)
    expect(selectEffectiveValue(history, '2026-08-01')).toBe(0.11)
    expect(selectEffectiveValue(history, '2026-07-31')).toBe(0.10)
  })

  it('sebelum semua rentang → undefined (pemanggil fallback berisik)', () => {
    expect(selectEffectiveValue([row(0.11, '2026-01-01', null)], '2025-12-31')).toBeUndefined()
  })

  it('memilih effective_from paling akhir bila (hipotetis) ada beberapa cocok', () => {
    const rows = [row('a', '2020-01-01', null), row('b', '2025-01-01', null)]
    expect(selectEffectiveValue(rows, '2026-01-01')).toBe('b')
  })
})

describe('todayWIB — C3 timezone Asia/Jakarta', () => {
  it('tengah malam UTC 1 Jan = sudah 1 Jan WIB (07:00)', () => {
    expect(todayWIB(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01')
  })

  it('malam 31 Des UTC 18:00 = SUDAH 1 Jan WIB (01:00) — boundary crossing', () => {
    // 2025-12-31T18:00Z + 7 jam = 2026-01-01T01:00 WIB → tanggal WIB = 2026-01-01
    expect(todayWIB(new Date('2025-12-31T18:00:00Z'))).toBe('2026-01-01')
  })

  it('siang UTC tetap tanggal sama di WIB', () => {
    expect(todayWIB(new Date('2026-06-15T05:00:00Z'))).toBe('2026-06-15') // 12:00 WIB
  })

  it('16:00 UTC 15 Juni = 23:00 WIB masih 15 Juni', () => {
    expect(todayWIB(new Date('2026-06-15T16:00:00Z'))).toBe('2026-06-15')
  })

  it('17:00 UTC 15 Juni = 00:00 WIB 16 Juni (tepat ganti hari)', () => {
    expect(todayWIB(new Date('2026-06-15T17:00:00Z'))).toBe('2026-06-16')
  })
})
