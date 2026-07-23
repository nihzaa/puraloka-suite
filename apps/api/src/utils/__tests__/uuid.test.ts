import { describe, it, expect } from 'vitest'
import { asUuidOrNull } from '../uuid.js'

// Guard UUID untuk kolom correlation_id (uuid). Fix 1C/1D.

describe('asUuidOrNull', () => {
  it('mengembalikan UUID valid apa adanya', () => {
    const u = 'f415a0b6-4fe0-41c0-8290-0944b1e880ae'
    expect(asUuidOrNull(u)).toBe(u)
  })

  it('menerima UUID uppercase', () => {
    const u = 'F415A0B6-4FE0-41C0-8290-0944B1E880AE'
    expect(asUuidOrNull(u)).toBe(u)
  })

  it('null untuk string non-UUID (mis. request-id header dari proxy)', () => {
    expect(asUuidOrNull('dwlive-1784830953515')).toBeNull()
    expect(asUuidOrNull('abc')).toBeNull()
    expect(asUuidOrNull('')).toBeNull()
    expect(asUuidOrNull('f415a0b6-4fe0-41c0-8290')).toBeNull() // terlalu pendek
  })

  it('null untuk non-string', () => {
    expect(asUuidOrNull(undefined)).toBeNull()
    expect(asUuidOrNull(null)).toBeNull()
    expect(asUuidOrNull(12345)).toBeNull()
  })
})
