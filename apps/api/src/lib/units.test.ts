import { describe, it, expect } from 'vitest'
import { normalizeUnitCode, validateUnitInput, sortUnits, UNIT_CATEGORIES } from './units.js'

describe('normalizeUnitCode', () => {
  it('lowercases and trims', () => {
    expect(normalizeUnitCode('  M2 ')).toBe('m2')
  })
  it('replaces spaces and foreign chars with underscore', () => {
    expect(normalizeUnitCode('meter lari')).toBe('meter_lari')
    expect(normalizeUnitCode("m'")).toBe('m')
    expect(normalizeUnitCode('m³')).toBe('m')
  })
  it('collapses repeated underscores and trims edges', () => {
    expect(normalizeUnitCode('__a  b__')).toBe('a_b')
    expect(normalizeUnitCode('m___linear')).toBe('m_linear')
  })
  it('keeps existing valid codes stable', () => {
    for (const c of ['m2', 'm3', 'm_linear', 'kg', 'ton', 'unit', 'ls', 'hari']) {
      expect(normalizeUnitCode(c)).toBe(c)
    }
  })
  it('handles empty/nullish', () => {
    expect(normalizeUnitCode('')).toBe('')
    // @ts-expect-error runtime guard for undefined
    expect(normalizeUnitCode(undefined)).toBe('')
  })
})

describe('validateUnitInput', () => {
  const good = { code: 'dus', symbol: 'dus', label: 'Dus', category: 'count', sort_order: 5 }

  it('accepts a well-formed unit', () => {
    expect(validateUnitInput(good, { requireCode: true })).toEqual({ ok: true })
  })
  it('rejects empty code when required', () => {
    expect(validateUnitInput({ ...good, code: '   ' }, { requireCode: true }).ok).toBe(false)
    expect(validateUnitInput({ ...good, code: '³' }, { requireCode: true }).ok).toBe(false)
  })
  it('does not require code on edit (partial)', () => {
    expect(validateUnitInput({ symbol: 'x', label: 'X' }).ok).toBe(true)
  })
  it('rejects blank symbol/label', () => {
    expect(validateUnitInput({ symbol: '  ' }).ok).toBe(false)
    expect(validateUnitInput({ label: '' }).ok).toBe(false)
  })
  it('rejects unknown category', () => {
    expect(validateUnitInput({ category: 'weird' }).ok).toBe(false)
    for (const c of UNIT_CATEGORIES) expect(validateUnitInput({ category: c }).ok).toBe(true)
  })
  it('rejects negative or non-integer sort_order', () => {
    expect(validateUnitInput({ sort_order: -1 }).ok).toBe(false)
    expect(validateUnitInput({ sort_order: 1.5 }).ok).toBe(false)
    expect(validateUnitInput({ sort_order: 0 }).ok).toBe(true)
  })
})

describe('sortUnits', () => {
  it('orders by sort_order then code, stable', () => {
    const rows = [
      { code: 'b', sort_order: 20 },
      { code: 'a', sort_order: 10 },
      { code: 'd', sort_order: 10 },
      { code: 'c', sort_order: 20 },
    ]
    expect(sortUnits(rows).map(r => r.code)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('does not mutate input', () => {
    const rows = [{ code: 'b', sort_order: 2 }, { code: 'a', sort_order: 1 }]
    const copy = [...rows]
    sortUnits(rows)
    expect(rows).toEqual(copy)
  })
})
