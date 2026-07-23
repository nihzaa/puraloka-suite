import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test kontrak gating helper (Sub-Fase 1B.3): fail-open untuk modules,
// fail-closed untuk feature_flags. Mock supabase — tanpa DB nyata.

// Mock chain: supabase.from(t).select(c).eq(k,v)[.is(...)].single() -> { data, error }
const singleResult = { data: null as unknown, error: null as unknown }
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  single: vi.fn(async () => singleResult),
}
vi.mock('../supabase.js', () => ({
  supabase: { from: vi.fn(() => chain) },
}))

import { isModuleEnabled, isFeatureEnabled, clearModuleCache } from '../modules.js'

beforeEach(() => {
  clearModuleCache()
  singleResult.data = null
  singleResult.error = null
})

describe('isModuleEnabled (fail-OPEN, additive-first)', () => {
  it('modul terdaftar & enabled → true', async () => {
    singleResult.data = { is_enabled: true }
    expect(await isModuleEnabled('procurement')).toBe(true)
  })

  it('modul terdaftar & disabled → false (keputusan admin eksplisit dihormati)', async () => {
    singleResult.data = { is_enabled: false }
    expect(await isModuleEnabled('procurement')).toBe(false)
  })

  it('modul TIDAK terdaftar → true (fail-open, tak mematikan fitur existing)', async () => {
    singleResult.data = null
    singleResult.error = { code: 'PGRST116' }
    expect(await isModuleEnabled('unknown_module')).toBe(true)
  })

  it('DB error → true (fail-open)', async () => {
    singleResult.data = null
    singleResult.error = { message: 'connection lost' }
    expect(await isModuleEnabled('anything')).toBe(true)
  })
})

describe('isFeatureEnabled (fail-CLOSED, opt-in)', () => {
  it('flag terdaftar & enabled → true', async () => {
    singleResult.data = { is_enabled: true }
    expect(await isFeatureEnabled('experimental_x')).toBe(true)
  })

  it('flag TIDAK terdaftar → false (opt-in, default OFF)', async () => {
    singleResult.data = null
    singleResult.error = { code: 'PGRST116' }
    expect(await isFeatureEnabled('undefined_flag')).toBe(false)
  })

  it('DB error → false (fail-closed)', async () => {
    singleResult.data = null
    singleResult.error = { message: 'boom' }
    expect(await isFeatureEnabled('any')).toBe(false)
  })
})
