import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test kontrak gating helper (Sub-Fase 1B.3): fail-open untuk modules,
// fail-closed untuk feature_flags. Mock supabase — tanpa DB nyata.

// Mock chain. Sejak migrasi 155, `modules` & `feature_flags` berkategori AB:
// satu `key` bisa punya BEBERAPA baris — katalog bersama (company_id NULL) plus
// pengecualian per-perusahaan. Karena itu chain-nya kini `await`-able langsung
// (mengembalikan daftar), bukan `.single()`.
//
// `.single()` dipertahankan supaya pemanggil lain yang masih memakainya tak
// pecah — tapi jalur modules/feature_flags tak lagi lewat situ.
const hasil = { data: null as unknown, error: null as unknown }
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  single: vi.fn(async () => hasil),
  then: (r: (v: unknown) => unknown) => Promise.resolve(hasil).then(r),
}
vi.mock('../supabase.js', () => ({
  supabase: { from: vi.fn(() => chain) },
}))

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-000000000002'

import { isModuleEnabled, isFeatureEnabled, clearModuleCache } from '../modules.js'

beforeEach(() => {
  clearModuleCache()
  hasil.data = null
  hasil.error = null
})

describe('isModuleEnabled (fail-OPEN, additive-first)', () => {
  it('modul terdaftar & enabled → true', async () => {
    hasil.data = [{ is_enabled: true, company_id: null }]
    expect(await isModuleEnabled('procurement')).toBe(true)
  })

  it('modul terdaftar & disabled → false (keputusan admin eksplisit dihormati)', async () => {
    hasil.data = [{ is_enabled: false, company_id: null }]
    expect(await isModuleEnabled('procurement')).toBe(false)
  })

  it('modul TIDAK terdaftar → true (fail-open, tak mematikan fitur existing)', async () => {
    hasil.data = []
    hasil.error = { code: 'PGRST116' }
    expect(await isModuleEnabled('unknown_module')).toBe(true)
  })

  it('DB error → true (fail-open)', async () => {
    hasil.data = null
    hasil.error = { message: 'connection lost' }
    expect(await isModuleEnabled('anything')).toBe(true)
  })
})

describe('isModuleEnabled — isolasi antar perusahaan (migrasi 155)', () => {
  it('pengecualian perusahaan MENANG atas katalog bersama', async () => {
    // Katalog bilang aktif; perusahaan A mematikannya untuk dirinya sendiri.
    hasil.data = [
      { is_enabled: true, company_id: null },
      { is_enabled: false, company_id: COMPANY_A },
    ]
    expect(await isModuleEnabled('procurement', COMPANY_A)).toBe(false)
  })

  it('perusahaan LAIN tidak ikut terpengaruh', async () => {
    // Inti celah yang ditutup 155: sebelum ini `is_enabled` tersimpan di baris
    // katalog global, jadi A mematikan modul → mati untuk B, C, dan setiap
    // pelanggan SaaS. Endpointnya sudah bergerbang permission; yang salah
    // adalah CAKUPAN akibatnya.
    hasil.data = [
      { is_enabled: true, company_id: null },
      { is_enabled: false, company_id: COMPANY_A },
    ]
    expect(await isModuleEnabled('procurement', COMPANY_B)).toBe(true)
  })

  it('cache TIDAK menyeberang antar perusahaan', async () => {
    // Cache lama ber-kunci `key` saja, jadi jawaban A disajikan ke B selama
    // TTL 60 detik. Kebocoran yang tak meninggalkan jejak di query log mana
    // pun — karena querynya memang tak pernah dijalankan.
    hasil.data = [
      { is_enabled: true, company_id: null },
      { is_enabled: false, company_id: COMPANY_A },
    ]
    expect(await isModuleEnabled('procurement', COMPANY_A)).toBe(false)
    expect(await isModuleEnabled('procurement', COMPANY_B)).toBe(true)
  })

  it('tanpa companyId → jatuh ke katalog bersama', async () => {
    hasil.data = [
      { is_enabled: true, company_id: null },
      { is_enabled: false, company_id: COMPANY_A },
    ]
    expect(await isModuleEnabled('procurement')).toBe(true)
  })
})

describe('isFeatureEnabled (fail-CLOSED, opt-in)', () => {
  it('flag terdaftar & enabled → true', async () => {
    hasil.data = [{ is_enabled: true, company_id: null }]
    expect(await isFeatureEnabled('experimental_x')).toBe(true)
  })

  it('flag TIDAK terdaftar → false (opt-in, default OFF)', async () => {
    hasil.data = []
    hasil.error = { code: 'PGRST116' }
    expect(await isFeatureEnabled('undefined_flag')).toBe(false)
  })

  it('DB error → false (fail-closed)', async () => {
    hasil.data = null
    hasil.error = { message: 'boom' }
    expect(await isFeatureEnabled('any')).toBe(false)
  })

  it('override perusahaan AKHIRNYA terbaca', async () => {
    // Komentar lama: "company-scoped override menyusul di L2". L2 sudah selesai
    // (migrasi 146), tapi fungsinya masih memaksa `company_id IS NULL` — jadi
    // override yang sudah bisa disimpan tak pernah terbaca. Tak ada gejalanya,
    // karena flag defaultnya memang OFF.
    hasil.data = [
      { is_enabled: false, company_id: null },
      { is_enabled: true, company_id: COMPANY_A },
    ]
    expect(await isFeatureEnabled('experimental_x', COMPANY_A)).toBe(true)
    expect(await isFeatureEnabled('experimental_x', COMPANY_B)).toBe(false)
  })
})
