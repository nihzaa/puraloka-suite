import { describe, it, expect } from 'vitest'
import { normalizeCategoryCode, validateCategoryInput, sortCategories } from './work-categories.js'

describe('normalizeCategoryCode', () => {
  it('lowercases, trims, underscores', () => {
    expect(normalizeCategoryCode('  Kusen Pintu ')).toBe('kusen_pintu')
    expect(normalizeCategoryCode('Pagar/Carport')).toBe('pagar_carport')
  })
  it('keeps existing codes stable', () => {
    for (const c of ['struktur', 'baja', 'kusen_pintu', 'lain_lain']) expect(normalizeCategoryCode(c)).toBe(c)
  })
  it('collapses underscores, trims edges', () => {
    expect(normalizeCategoryCode('__a  b__')).toBe('a_b')
  })
  it('handles empty', () => {
    expect(normalizeCategoryCode('')).toBe('')
    // @ts-expect-error runtime guard
    expect(normalizeCategoryCode(undefined)).toBe('')
  })
})

describe('validateCategoryInput', () => {
  it('accepts well-formed', () => {
    expect(validateCategoryInput({ code: 'mep', label: 'MEP', sort_order: 5 }, { requireCode: true })).toEqual({ ok: true })
  })
  it('rejects empty code when required', () => {
    expect(validateCategoryInput({ code: '  ', label: 'X' }, { requireCode: true }).ok).toBe(false)
  })
  it('does not require code on edit', () => {
    expect(validateCategoryInput({ label: 'X' }).ok).toBe(true)
  })
  it('rejects blank label', () => {
    expect(validateCategoryInput({ label: ' ' }).ok).toBe(false)
  })
  it('rejects bad sort_order', () => {
    expect(validateCategoryInput({ sort_order: -1 }).ok).toBe(false)
    expect(validateCategoryInput({ sort_order: 2.5 }).ok).toBe(false)
    expect(validateCategoryInput({ sort_order: 0 }).ok).toBe(true)
  })
})

describe('sortCategories', () => {
  it('orders by sort_order then code, immutable', () => {
    const rows = [{ code: 'b', sort_order: 20 }, { code: 'a', sort_order: 10 }, { code: 'c', sort_order: 10 }]
    const copy = [...rows]
    expect(sortCategories(rows).map(r => r.code)).toEqual(['a', 'c', 'b'])
    expect(rows).toEqual(copy)
  })
})
