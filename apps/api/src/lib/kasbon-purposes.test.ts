import { describe, it, expect } from 'vitest'
import { normalizePurposeCode, validatePurposeInput, sortPurposes } from './kasbon-purposes.js'

describe('normalizePurposeCode', () => {
  it('normalizes to stable key', () => {
    expect(normalizePurposeCode('  Sewa Alat ')).toBe('sewa_alat')
    expect(normalizePurposeCode('Transport/Ojek')).toBe('transport_ojek')
  })
  it('keeps existing codes stable', () => {
    for (const c of ['gaji_tukang', 'uang_makan', 'pembelian_alat', 'operasional', 'lain_lain']) expect(normalizePurposeCode(c)).toBe(c)
  })
  it('handles empty', () => {
    expect(normalizePurposeCode('')).toBe('')
    // @ts-expect-error runtime guard
    expect(normalizePurposeCode(undefined)).toBe('')
  })
})

describe('validatePurposeInput', () => {
  it('accepts well-formed', () => {
    expect(validatePurposeInput({ code: 'transport', label: 'Transport', sort_order: 5 }, { requireCode: true })).toEqual({ ok: true })
  })
  it('rejects empty code when required', () => {
    expect(validatePurposeInput({ code: ' ', label: 'X' }, { requireCode: true }).ok).toBe(false)
  })
  it('does not require code on edit', () => {
    expect(validatePurposeInput({ label: 'X' }).ok).toBe(true)
  })
  it('rejects blank label + bad sort_order', () => {
    expect(validatePurposeInput({ label: ' ' }).ok).toBe(false)
    expect(validatePurposeInput({ sort_order: -1 }).ok).toBe(false)
    expect(validatePurposeInput({ sort_order: 1.5 }).ok).toBe(false)
    expect(validatePurposeInput({ sort_order: 0 }).ok).toBe(true)
  })
})

describe('sortPurposes', () => {
  it('orders by sort_order then code, immutable', () => {
    const rows = [{ code: 'b', sort_order: 20 }, { code: 'a', sort_order: 10 }, { code: 'c', sort_order: 10 }]
    const copy = [...rows]
    expect(sortPurposes(rows).map(r => r.code)).toEqual(['a', 'c', 'b'])
    expect(rows).toEqual(copy)
  })
})
