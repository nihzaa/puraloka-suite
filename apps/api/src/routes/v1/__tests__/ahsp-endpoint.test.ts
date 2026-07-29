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
  'TEST-BATA-MERAH':    ['material', 'buah', 143.81, 700],
  'TEST-SEMEN-PC':      ['material', 'kg', 43.5,   1300],
  'TEST-PASIR-PASANG':  ['material', 'm3', 0.08,   275000],
}
const PRICES = Object.fromEntries(Object.entries(KOEF).map(([c, v]) => [c, v[3]]))

async function purge() {
  // Pola cleanup rumah (estimate-approval.test.ts): guard no-delete resources/edisi
  // benar untuk produksi; untuk bongkar fixture [TEST], trigger dimatikan HANYA di
  // sesi ini via session_replication_role — perilaku produksi tak tersentuh.
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM assembly_components WHERE assembly_id IN
      (SELECT id FROM assemblies WHERE code LIKE '[TEST-AHSP]%')`)
    await client.query(`DELETE FROM assemblies WHERE code LIKE '[TEST-AHSP]%'`)
    await client.query(`DELETE FROM resources WHERE code IN
      (${Object.keys(KOEF).map((_, i) => `$${i + 1}`).join(',')})`, Object.keys(KOEF))
    await client.query(`DELETE FROM cost_codes WHERE code = '[TEST-AHSP]CC'`)
    await client.query(`DELETE FROM ahsp_editions WHERE code = 'SE-TEST-AHSP'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
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

describe('GET /cecep/resources', () => {
  it('daftar resource + filter by nama (q)', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/cecep/resources?q=TEST-SEMEN')
    expect(res.statusCode).toBe(200)
    const rows = res.json().data
    expect(rows.some((r: { code: string }) => r.code === 'TEST-SEMEN-PC')).toBe(true)
  })

  it('filter by category', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/cecep/resources?category=labor&q=TEST-PEKERJA')
    expect(res.statusCode).toBe(200)
    const rows = res.json().data
    expect(rows.every((r: { category: string }) => r.category === 'labor')).toBe(true)
  })
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

// ── POST /cecep/assemblies/:id/edit — correction & deviation ────────────────
//
// Menutup janji pesan error /adopt ("sunting langsung selagi berstatus
// draft") + §1.1–1.2 AHSP-EDITION-BUILDER-DESIGN.md: versi baru dari assembly
// APA PUN, TANPA mutate baris lama.
describe('POST /cecep/assemblies/:id/edit', () => {
  it('correction: versi baru, source TETAP national (label dipertahankan)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/edit`, {
      edit_type: 'correction', reason: '[TEST] salah baca koefisien saat impor',
      components: [{ resource_code: 'TEST-MANDOR', coefficient: 0.01 }],
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.data.source).toBe('national')
    expect(body.data.version_number).toBe(2)
    expect(body.data.status).toBe('draft')
    expect(body.koefisien_diubah).toEqual([{ resource_code: 'TEST-MANDOR', dari: 0.0067, jadi: 0.01 }])

    const { rows } = await client.query(
      `SELECT edit_type, edited_from, edition_id FROM assemblies WHERE id = $1`, [body.data.id])
    expect(rows[0].edit_type).toBe('correction')
    expect(rows[0].edited_from).toBe(assemblyId)
    expect(rows[0].edition_id).toBe(editionId)

    // Assembly ASAL sama sekali tak tersentuh (immutability, bukan hanya nilai
    // koefisiennya) — versi & komponen lama tetap seperti sedia kala.
    const asal = await client.query(
      `SELECT version_number, source FROM assemblies WHERE id = $1`, [assemblyId])
    expect(asal.rows[0].version_number).toBe(1)
    expect(asal.rows[0].source).toBe('national')
    const koefAsal = await client.query(
      `SELECT ac.coefficient::float8 c FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 AND r.code = 'TEST-MANDOR'`, [assemblyId])
    expect(koefAsal.rows[0].c).toBe(0.0067)

    await client.query(`DELETE FROM assembly_components WHERE assembly_id = $1`, [body.data.id])
    await client.query(`DELETE FROM assemblies WHERE id = $1`, [body.data.id])
  })

  it('deviation dari national: FORK otomatis ke company + edition_id tetap provenance induk', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/edit`, {
      edit_type: 'deviation', reason: '[TEST] cara kerja tim ini beda',
      components: [{ resource_code: 'TEST-MANDOR', coefficient: 0.02 }],
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.data.source).toBe('company')

    const { rows } = await client.query(
      `SELECT edit_type, edited_from, edition_id, company_id FROM assemblies WHERE id = $1`, [body.data.id])
    expect(rows[0].edit_type).toBe('deviation')
    expect(rows[0].edited_from).toBe(assemblyId)
    expect(rows[0].edition_id).toBe(editionId) // provenance induk dipertahankan
    expect(rows[0].company_id).toBeTruthy()

    await client.query(`DELETE FROM assembly_components WHERE assembly_id = $1`, [body.data.id])
    await client.query(`DELETE FROM assemblies WHERE id = $1`, [body.data.id])
  })

  it('edit_type tak dikenal → 400', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/edit`, {
      edit_type: 'rewrite', reason: 'x', components: [{ resource_code: 'TEST-MANDOR', coefficient: 0.02 }],
    })
    expect(res.statusCode).toBe(400)
  })

  it('tanpa reason → 400 (alasan wajib, jejak audit)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/edit`, {
      edit_type: 'correction', components: [{ resource_code: 'TEST-MANDOR', coefficient: 0.02 }],
    })
    expect(res.statusCode).toBe(400)
  })

  it('tanpa koefisien yang diubah → 400 (versi identik tak dibuat)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/edit`, {
      edit_type: 'correction', reason: '[TEST] tanpa perubahan', components: [],
    })
    expect(res.statusCode).toBe(400)
  })

  it('resource_code di luar komponen assembly → 400', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/cecep/assemblies/${assemblyId}/edit`, {
      edit_type: 'correction', reason: '[TEST] resource asing',
      components: [{ resource_code: 'TIDAK-ADA-DI-ASSEMBLY', coefficient: 1 }],
    })
    expect(res.statusCode).toBe(400)
  })
})

// ── PATCH /cecep/assemblies/:id/activate — draft → active ───────────────────
describe('PATCH /cecep/assemblies/:id/activate', () => {
  it('draft → active: activated_at terisi; panggilan kedua (sudah active) → 400', async () => {
    actAs(adminAuth)
    const { rows: cc } = await client.query(`SELECT id FROM cost_codes WHERE code = '[TEST-AHSP]CC'`)
    const { rows: draftRow } = await client.query(
      `INSERT INTO assemblies (code, name, cost_code_id, source, version_number, waste_factor,
                               sequence, output_unit_code, edition_id, created_by)
       VALUES ('[TEST-AHSP]DRAFT-ACT', '[TEST] draft utk aktivasi', $1, 'national', 1, 0,
               '[]'::jsonb, 'm2', $2, (SELECT id FROM users LIMIT 1)) RETURNING id`,
      [cc[0].id, editionId])
    const draftId = draftRow[0].id

    const res1 = await app.inject({
      method: 'PATCH', url: `/api/v1/cecep/assemblies/${draftId}/activate`,
      headers: { authorization: 'Bearer t' },
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().data.status).toBe('active')
    expect(res1.json().data.activated_at).toBeTruthy()

    // Panggilan kedua: sudah 'active', bukan lagi 'draft' — endpoint menolak
    // (bukan guard DB no-op) sebelum mencoba UPDATE yang toh akan gagal.
    const res2 = await app.inject({
      method: 'PATCH', url: `/api/v1/cecep/assemblies/${draftId}/activate`,
      headers: { authorization: 'Bearer t' },
    })
    expect(res2.statusCode).toBe(400)

    // Cleanup: assembly SUDAH active tak boleh dihapus (guard no-delete, benar
    // untuk produksi) — bongkar fixture [TEST] via jalur yang sama dgn purge().
    await client.query(`SET session_replication_role = 'replica'`)
    await client.query(`DELETE FROM assemblies WHERE id = $1`, [draftId])
    await client.query(`SET session_replication_role = 'origin'`)
  })

  it('assembly tak ditemukan → 404', async () => {
    actAs(adminAuth)
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/cecep/assemblies/00000000-0000-0000-0000-000000000000/activate`,
      headers: { authorization: 'Bearer t' },
    })
    expect(res.statusCode).toBe(404)
  })
})
