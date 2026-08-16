import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'

// CECEP M3 — jalur hitung ter-telusur: Estimate Item dari ASSEMBLY × PRICE BOOK.
//
// GOLDEN: assembly 3.6.1.1 verbatim + harga price book (nilai ilustrasi SE sebagai
// fixture) + BUK 10% + ROUNDDOWN-100 → HSP 278300 → amount = 278300 × qty.
// Juga: harga tak ter-resolve → 422 (fail-loud) · versi non-draft → 409 ·
// delete item → total di-recompute.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let versionId: string
let assemblyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const del = (url: string) =>
  app.inject({ method: 'DELETE', url, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

// Verbatim 3.6.1.1 + harga ilustrasi SE (fixture price book, BUKAN harga nyata).
const KOEF: Record<string, [category: string, unit: string, koef: number, harga: number]> = {
  'TEST-EI-PEKERJA':       ['labor',    'OH',   0.4,    100000],
  'TEST-EI-TUKANG-BATU':   ['labor',    'OH',   0.2,    145000],
  'TEST-EI-KEPALA-TUKANG': ['labor',    'OH',   0.02,   175000],
  'TEST-EI-MANDOR':        ['labor',    'OH',   0.0067, 200000],
  'TEST-EI-BATA-MERAH':    ['material', 'buah', 143.81, 700],
  'TEST-EI-SEMEN-PC':      ['material', 'kg',   43.5,   1300],
  'TEST-EI-PASIR-PASANG':  ['material', 'm3',   0.08,   275000],
}
const BODY = { quantity: 10, buk_fraction: 0.1, rounding: { mode: 'down', step: 100 }, price_date: '2026-06-01' }

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-EI] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-EI] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-EI] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name = '[TEST-EI] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person = '[TEST-EI] Klien'`)
    await client.query(`DELETE FROM price_book_entries WHERE resource_id IN
      (SELECT id FROM resources WHERE code LIKE 'TEST-EI-%')`)
    await client.query(`DELETE FROM assembly_components WHERE assembly_id IN
      (SELECT id FROM assemblies WHERE code = '[TEST-EI]3.6.1.1')`)
    await client.query(`DELETE FROM assemblies WHERE code = '[TEST-EI]3.6.1.1'`)
    await client.query(`DELETE FROM resources WHERE code LIKE 'TEST-EI-%'`)
    await client.query(`DELETE FROM cost_codes WHERE code = '[TEST-EI]CC'`)
    await client.query(`DELETE FROM ahsp_editions WHERE code = 'SE-TEST-EI'`)
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
  adminUserId = u[0].id

  const { rows: ed } = await client.query(
    `INSERT INTO ahsp_editions (code, name) VALUES ('SE-TEST-EI', '[TEST] Edisi EI') RETURNING id`)
  const { rows: cc } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-EI]CC', '[TEST] Dinding', $1) RETURNING id`,
    [adminUserId])
  for (const [code, [category, unit]] of Object.entries(KOEF)) {
    await client.query(
      `INSERT INTO resources (code, name, category, unit_code, created_by)
       VALUES ($1, $1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`, [code, category, unit, adminUserId])
  }
  const { rows: a } = await client.query(
    `INSERT INTO assemblies (code, name, cost_code_id, source, version_number, waste_factor,
                             sequence, output_unit_code, edition_id, created_by)
     VALUES ('[TEST-EI]3.6.1.1', '[TEST] dinding 1 batu tipe M', $1, 'national', 1, 0,
             '[]'::jsonb, 'm2', $2, $3) RETURNING id`, [cc[0].id, ed[0].id, adminUserId])
  assemblyId = a[0].id
  let sort = 0
  for (const [code, [, , koef]] of Object.entries(KOEF)) {
    await client.query(
      `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
       SELECT $1, id, $2, $3 FROM resources WHERE code = $4`, [assemblyId, koef, sort++, code])
  }
  await client.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [assemblyId])

  // price book: entry ACTIVE (wajib jejak verified) per resource, berlaku sejak 2026-01-01
  for (const [code, [, , , harga]] of Object.entries(KOEF)) {
    await client.query(
      `INSERT INTO price_book_entries (resource_id, amount, effective_date, status, verified_by, verified_at, created_by)
       SELECT id, $1, '2026-01-01', 'active', $2, now(), $2 FROM resources WHERE code = $3`,
      [harga, adminUserId, code])
  }

  const { rows: cl } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '[TEST-EI] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST-EI] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [cl[0].id, adminUserId])
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-EI] Skenario', $2) RETURNING id`,
    [pr[0].id, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id

  app = Fastify()
  await app.register(estimateVersionRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /estimate-versions/:id/items — GOLDEN dari assembly × price book', () => {
  it('qty 10 → HSP 278300 → amount 2.783.000; total versi ikut; provenance harga kembali', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { ...BODY, assembly_id: assemblyId })
    expect(res.statusCode).toBe(201)
    const j = res.json()
    expect(j.hsp.hspRounded).toBe(278300)
    expect(j.hsp.hspRaw).toBeCloseTo(278362.7, 6)
    expect(j.item.amount).toBe(2783000)
    expect(j.version_total).toBe(2783000)
    expect(j.prices).toHaveLength(7)
    expect(j.prices[0].price_book_entry_id).toBeTruthy() // ter-telusur ke Price Book
    const { rows } = await client.query(
      `SELECT total_amount FROM estimate_versions WHERE id=$1`, [versionId])
    expect(Number(rows[0].total_amount)).toBe(2783000)

    // Provenance harga TERSIMPAN, bukan hanya dikembalikan (migrasi 139).
    // Sebelumnya rincian ini hilang begitu response ditutup, sehingga angka
    // 2.783.000 tak bisa menjelaskan dirinya sendiri setahun kemudian.
    const { rows: prov } = await client.query(
      `SELECT price_date, hsp_snapshot, provenance_captured
         FROM estimate_items WHERE id=$1`, [j.item.id])
    expect(prov[0].provenance_captured, 'item baru tanpa provenance').toBe(true)
    // `pg` memulangkan DATE sebagai objek Date, bukan string — dibandingkan
    // lewat komponen tanggalnya supaya tak bergantung zona waktu mesin.
    const pd = new Date(prov[0].price_date)
    expect(`${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`)
      .toBe('2026-06-01')

    const snap = prov[0].hsp_snapshot
    expect(snap.hsp.hspRounded, 'HSP di snapshot ≠ HSP yang dipakai').toBe(278300)
    expect(snap.prices, 'daftar harga tak lengkap di snapshot').toHaveLength(7)
    expect(snap.prices[0].price_book_entry_id, 'snapshot kehilangan jejak ke price book')
      .toBeTruthy()
    // Angka harus bisa direkonstruksi DARI snapshot saja — itu ujian
    // sebenarnya "cukup menjelaskan", bukan sekadar "kolomnya terisi".
    expect(j.item.amount).toBe(BODY.quantity * snap.hsp.hspRounded)
  })

  it('price_date SEBELUM effective harga → 422 fail-loud dgn daftar resource', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { ...BODY, assembly_id: assemblyId, price_date: '2025-01-01' })
    expect(res.statusCode).toBe(422)
    expect(res.json().missing).toContain('TEST-EI-PEKERJA')
  })

  it('tanpa buk_fraction → 400 (nol default diam-diam)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { assembly_id: assemblyId, quantity: 10, rounding: { mode: 'down', step: 100 } })
    expect(res.statusCode).toBe(400)
  })

  it('versi non-draft → 409 (item beku setelah keluar draft)', async () => {
    actAs(adminAuth)
    await client.query(`UPDATE estimate_versions SET status='under_review' WHERE id=$1`, [versionId])
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { ...BODY, assembly_id: assemblyId })
    expect(res.statusCode).toBe(409)
    await client.query(`SET session_replication_role='replica'`)
    await client.query(`UPDATE estimate_versions SET status='draft' WHERE id=$1`, [versionId])
    await client.query(`SET session_replication_role='origin'`)
  })
})

/**
 * GET /estimate-items/:itemId/explain
 *
 * ── Kenapa test ini ada (2026-08-16)
 *
 * Rute ini memulangkan 404 untuk SETIAP item — termasuk item yang jelas-jelas
 * ada — selama entah berapa lama. Sebabnya `.select()` menyebut dua kolom yang
 * TIDAK PERNAH ADA di `estimate_items`: `description` dan `unit`. SELECT gagal,
 * `item` jadi undefined, lalu penjaga di bawahnya menyimpulkan "Item tidak
 * ditemukan".
 *
 * Yang membuatnya bertahan: 404-nya MASUK AKAL — ada cabang sah yang memang
 * memulangkan 404 untuk item milik tenant lain — dan NOL test menyentuh rute
 * ini. Kegagalannya menyamar jadi perilaku normal, dan fitur yang jadi janji
 * inti modul ("setiap rupiah bisa ditelusuri") tak pernah sekali pun berhasil.
 *
 * Test ini mengunci yang paling penting: item yang ADA harus 200, bukan 404.
 */
describe('GET /estimate-items/:itemId/explain — telusur angka', () => {
  it('item yang ada → 200 + rantai langkah, BUKAN 404', async () => {
    actAs(adminAuth)
    const tambah = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { ...BODY, assembly_id: assemblyId })
    expect(tambah.statusCode).toBe(201)
    const itemId = tambah.json().item?.id ?? tambah.json().id

    const res = await get(`/api/v1/estimate-items/${itemId}/explain`)
    // Regresi utama: kolom hantu membuat ini 404.
    expect(res.statusCode).toBe(200)

    const d = res.json().data
    expect(d.itemId).toBe(itemId)
    // Nama datang dari assemblies, bukan dari kolom `description` yang tak ada.
    expect(d.nama).toBeTruthy()
    expect(d.nama).not.toBe('(tanpa nama)')
    expect(Number(d.volume)).toBe(10)
    // Rantai penjelasannya berisi — bukan cangkang kosong.
    expect(Array.isArray(d.langkah)).toBe(true)
    expect(d.langkah.length).toBeGreaterThan(0)
  })

  it('item tak dikenal → 404 (cabang sah, tetap harus jalan)', async () => {
    actAs(adminAuth)
    const res = await get(
      '/api/v1/estimate-items/00000000-0000-0000-0000-0000000000ff/explain')
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /estimate-versions/:id/items/:itemId', () => {
  it('hapus item → total versi di-recompute ke 0', async () => {
    actAs(adminAuth)
    const { rows } = await client.query(
      `SELECT id FROM estimate_items WHERE estimate_version_id=$1`, [versionId])
    expect(rows.length).toBeGreaterThan(0)
    const res = await del(`/api/v1/estimate-versions/${versionId}/items/${rows[0].id}`)
    expect(res.statusCode).toBe(200)
    expect(res.json().version_total).toBe(0)
  })
})
