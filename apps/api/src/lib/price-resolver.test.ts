import { describe, it, expect } from 'vitest'
import { resolvePrice, resolvePrices, type PriceBookEntryRow } from './price-resolver.js'

// Resolusi harga Price Book — pure. Aturan: active-only, berlaku-pada-T,
// lokasi persis > umum (NULL), lokasi LAIN tak pernah dipakai, tie-break
// effective_date terbaru lalu versi tertinggi, tak ketemu = null (fail-loud).

const R = 'res-1'
const e = (over: Partial<PriceBookEntryRow>): PriceBookEntryRow => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  resource_id: R, amount: 1000, currency: 'IDR', version_number: 1,
  effective_date: '2026-01-01', expired_date: null, location: null, status: 'active',
  ...over,
})

describe('resolvePrice', () => {
  it('hanya status active yang dipakai (draft/verified/expired diabaikan)', () => {
    const entries = [e({ status: 'draft' }), e({ status: 'verified' }), e({ status: 'expired' })]
    expect(resolvePrice(entries, R, '2026-06-01')).toBeNull()
  })

  it('entry belum berlaku (effective_date > T) tidak dipakai', () => {
    expect(resolvePrice([e({ effective_date: '2026-07-01' })], R, '2026-06-01')).toBeNull()
  })

  it('entry kedaluwarsa (expired_date < T) tidak dipakai; batas inklusif dipakai', () => {
    expect(resolvePrice([e({ expired_date: '2026-05-31' })], R, '2026-06-01')).toBeNull()
    expect(resolvePrice([e({ expired_date: '2026-06-01' })], R, '2026-06-01')).not.toBeNull()
  })

  it('lokasi persis MENANG atas entry umum (NULL)', () => {
    const umum = e({ id: 'umum', amount: 100 })
    const bdg  = e({ id: 'bdg', amount: 200, location: 'Bandung' })
    const r = resolvePrice([umum, bdg], R, '2026-06-01', 'Bandung')
    expect(r?.entry.id).toBe('bdg')
    expect(r?.matched_location).toBe(true)
  })

  it('lokasi LAIN tidak pernah dipakai — fallback ke entry umum', () => {
    const jkt  = e({ id: 'jkt', location: 'Jakarta' })
    const umum = e({ id: 'umum' })
    const r = resolvePrice([jkt, umum], R, '2026-06-01', 'Bandung')
    expect(r?.entry.id).toBe('umum')
    expect(r?.matched_location).toBe(false)
  })

  it('tanpa location param: entry berlokasi diabaikan (hanya umum yang sah)', () => {
    const jkt = e({ id: 'jkt', location: 'Jakarta' })
    expect(resolvePrice([jkt], R, '2026-06-01')).toBeNull()
  })

  it('tie-break: effective_date terbaru menang; sama → version tertinggi', () => {
    const lama = e({ id: 'lama', effective_date: '2026-01-01' })
    const baru = e({ id: 'baru', effective_date: '2026-05-01' })
    expect(resolvePrice([lama, baru], R, '2026-06-01')?.entry.id).toBe('baru')
    const v1 = e({ id: 'v1', version_number: 1 })
    const v2 = e({ id: 'v2', version_number: 2 })
    expect(resolvePrice([v1, v2], R, '2026-06-01')?.entry.id).toBe('v2')
  })
})

describe('resolvePrices (batch)', () => {
  it('memisahkan resolved vs missing — caller fail-loud', () => {
    const entries = [e({})]
    const { resolved, missing } = resolvePrices(entries, [R, 'res-tak-ada'], '2026-06-01')
    expect(resolved.has(R)).toBe(true)
    expect(missing).toEqual(['res-tak-ada'])
  })
})
