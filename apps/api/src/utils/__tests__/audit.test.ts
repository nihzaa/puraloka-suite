import { describe, it, expect } from 'vitest'
import { computeDiff } from '../audit.js'

// Unit test untuk computeDiff — pure function, tanpa DB/HTTP.

describe('computeDiff', () => {
  it('returns null when either side is missing', () => {
    expect(computeDiff(null, { a: 1 })).toBeNull()
    expect(computeDiff({ a: 1 }, null)).toBeNull()
    expect(computeDiff(undefined, undefined)).toBeNull()
  })

  it('returns null when nothing changed', () => {
    expect(computeDiff({ status: 'a', n: 1 }, { status: 'a', n: 1 })).toBeNull()
  })

  it('captures only changed keys as {from,to}', () => {
    const diff = computeDiff(
      { status: 'pending', amount: 100, note: 'x' },
      { status: 'approved', amount: 100, note: 'y' }
    )
    expect(diff).toEqual({
      status: { from: 'pending', to: 'approved' },
      note: { from: 'x', to: 'y' },
    })
  })

  it('detects keys added or removed between sides', () => {
    const diff = computeDiff({ a: 1 }, { a: 1, b: 2 })
    expect(diff).toEqual({ b: { from: undefined, to: 2 } })
  })

  it('compares nested values structurally, not by reference', () => {
    expect(computeDiff({ x: { k: 1 } }, { x: { k: 1 } })).toBeNull()
    expect(computeDiff({ x: { k: 1 } }, { x: { k: 2 } })).toEqual({
      x: { from: { k: 1 }, to: { k: 2 } },
    })
  })
})
