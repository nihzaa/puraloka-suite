import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import ahspRoutes from '../ahsp.js'

// CECEP 4e — endpoint AHSP: katalog edisi/assembly + kalkulator HSP (engine paritas).
//
// GOLDEN E2E: assembly 3.6.1.1 (verbatim SE 47/2026) + harga ilustrasi SE →
// HSP raw 278362.7 → ROUNDDOWN-100 → 278300 (angka golden dari workbook,
// AHSP-GOLDEN-PROVENANCE). Menguji rantai DB → route → engine, bukan engine saja.
//
// Fixture berprefiks [TEST]/TEST- di public + dibersihkan (assembly ditinggal draft
// supaya guard no-delete tidak menghalangi cleanup).

let app: FastifyInstance
let client: Client
let adminAuth: string
let editionId: string
let assemblyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

// Verbatim 3.6.1.1 (sheet Pasangan Dinding): koef + harga ilustrasi SE.
const KOEF: Record<string, [group: string, unit: string, koef: number, hargaSE: number]> = {
  'TEST-PEKERJA':       ['labor',    'OH', 0.4,    100000],
  'TEST-TUKANG-BATU':   ['labor',    'OH', 0.2,    145000],
  'TEST-KEPALA-TUKANG': ['labor',    'OH', 0.02,   175000],
  'TEST-MANDOR':        ['labor',    'OH', 0.0067, 200000],
  'TEST-BATA-MERAH':    ['material', 'bh', 143.81, 700],
  'TEST-SEMEN-PC':      ['material', 'kg', 43.5,   1300],
  'TEST-PASIR-PASANG':  ['material', 'm3', 0.08,   275000],
}
const PRICES = Object.fromEntries(Object.entries(KOEF).map(([c, v]) => [c, v[3]]))

async function purge() {
  await client.query(`DELETE FROM assembly_components WHERE assembly_id IN
    (SELECT id FROM assemblies WHERE code LIKE '[TEST-AHSP]%')`)
  await client.query(`DELETE FROM assemblies WHERE code LIKE '[TEST-AHSP]%'`)
  await client.query(`DELETE FROM resources WHERE code LIKE 'TEST-%' AND code IN
    (${Object.keys(KOEF).map((_, i) => `$${i + 1}`).join(',')})`, Object.keys(KOEF))
  await client.query(`DELETE FROM cost_codes WHERE code = '[TEST-AHSP]CC'`)
  await client.query(`DELETE FROM ahsp_editions WHERE code = 'SE-TEST-AHSP'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  const adminUserId = u[0].id

  const { rows: ed } = await client.query(
    `INSERT INTO ahsp_editions (code, name) VALUES ('SE-TEST-AHSP', '[TEST] Edisi AHSP') RETURNING id`)
  editionId = ed[0].id

  const { rows: cc } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-AHSP]CC', '[TEST] Pasangan Dinding', $1) RETURNING id`,
    [adminUserId])
  for (const [code, [category, unit]] of Object.entries(KOEF)) {
    await client.query(
      `INSERT INTO resources (code, name, category, unit_code, created_by)
       VALUES ($1, $1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
      [code, category, unit, adminUserId])
  }
  const { rows: a } = await client.query(
    `INSERT INTO assemblies (code, name, cost_code_id, source, version_number, waste_factor,
                             sequence, output_unit_code, edition_id, is_import_baseline, created_by)
     VALUES ('[TEST-AHSP]3.6.1.1', '[TEST] dinding bata 1 batu tipe M', $1, 'national', 1, 0,
             '[]'::jsonb, 'm2', $2, false, $3) RETURNING id`,
    [cc[0].id, editionId, adminUserId])
  assemblyId = a[0].id
  let sort = 0
  for (const [code, [, , koef]] of Object.entries(KOEF)) {
    await client.query(
      `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
       SELECT $1, id, $2, $3 FROM resources WHERE code = $4`,
      [assemblyId, koef, sort++, code])
  }

  app = Fastify()
  await app.register(ahspRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /cecep/editions', () => {
  it('registry edisi terbaca (berisi edisi test)', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/cecep/editions')
    expect(res.statusCode).toBe(200)
    const codes = res.json().data.map((e: { code: string }) => e.code)
    expect(codes).toContain('SE-TEST-AHSP')
  })
})

describe('GET /cecep/assemblies', () => {
  it('filter edisi: assembly test muncul lengkap dengan komponen+resource', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/cecep/assemblies?edition=SE-TEST-AHSP')
    expect(res.statusCode).toBe(200)
    const rows = res.json().data
    const asm = rows.find((r: { code: string }) => r.code === '[TEST-AHSP]3.6.1.1')
    expect(asm).toBeTruthy()
    expect(asm.components).toHaveLength(7)
    expect(asm.edition.code).toBe('SE-TEST-AHSP')
  })

  it('edisi tak dikenal → 404', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/cecep/assemblies?edition=TIDAK-ADA')
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /cecep/assemblies/:id/hsp — GOLDEN E2E', () => {
  it('3.6.1.1 @ harga SE, BUK 10%, ROUNDDOWN-100 → 278300 (golden workbook)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/hsp`, {
      prices: PRICES, buk_fraction: 0.1, rounding: { mode: 'down', step: 100 },
    })
    expect(res.statusCode).toBe(200)
    const { result } = res.json()
    expect(result.hspRounded).toBe(278300)          // golden: REKAP/HSP workbook
    expect(result.hspRaw).toBeCloseTo(278362.7, 6)  // F = D + E penuh presisi
    expect(result.subtotalD).toBeCloseTo(253057, 6) // D = A + B + C
  })

  it('harga kurang → 422 menyebut resource yang hilang (fail loud)', async () => {
    actAs(adminAuth)
    const { 'TEST-SEMEN-PC': _omit, ...partial } = PRICES
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/hsp`, {
      prices: partial, buk_fraction: 0.1, rounding: { mode: 'down', step: 100 },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().missing).toContain('TEST-SEMEN-PC')
  })

  it('tanpa buk_fraction → 400 (tidak ada default diam-diam)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/hsp`, {
      prices: PRICES, rounding: { mode: 'down', step: 100 },
    })
    expect(res.statusCode).toBe(400)
  })
})
