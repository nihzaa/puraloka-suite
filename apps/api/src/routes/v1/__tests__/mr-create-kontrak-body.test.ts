import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import procurementRoutes from '../procurement.js'

// BUG LAPANGAN (2026-08-04) — form "Buat Material Request" di web SELALU gagal
// dengan 400 `project_id dan items wajib diisi`, berapa pun material yang diisi
// pengguna. Sebabnya BUKAN data pengguna: form mengirim header saja lalu
// menyusulkan item satu per satu ke POST /{id}/items, sementara endpoint ini
// mewajibkan `items` menyatu di body yang sama (procurement.ts:322).
//
// Test ini mengunci KONTRAK BODY endpoint supaya mismatch itu tidak bisa
// kembali diam-diam: item wajib ikut di body, dan MR + item lahir bersama.
// Pola rumah (supplier-invoice-3way.test.ts): fixture berprefiks di schema
// public, route diuji via app.inject, purge sebelum+sesudah.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let projectId: string
let materialId: string

const PREFIX = '[TEST-MR-BODY]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM material_request_items WHERE mr_id IN
      (SELECT id FROM material_requests WHERE project_id IN
        (SELECT id FROM projects WHERE name LIKE '${PREFIX}%'))`)
    await client.query(`DELETE FROM material_requests WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '${PREFIX}%')`)
    await client.query(`DELETE FROM materials WHERE name LIKE '${PREFIX}%'`)
    await client.query(`DELETE FROM projects WHERE name LIKE '${PREFIX}%'`)
    await client.query(`DELETE FROM clients WHERE contact_person LIKE '${PREFIX}%'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

const mrCount = async (): Promise<number> => {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM material_requests WHERE project_id = $1`, [projectId])
  return rows[0].n
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.auth_id IS NOT NULL LIMIT 1`)
  adminUserId = u[0].id

  const { rows: cl } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '${PREFIX} Klien', '0800000000', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '${PREFIX} Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $2) RETURNING id`,
    [cl[0].id, adminUserId])
  projectId = pr[0].id

  const { rows: mat } = await client.query(
    `INSERT INTO materials (name, unit, unit_price, created_by)
     VALUES ('${PREFIX} Bata Merah', 'buah', 800, $1) RETURNING id`,
    [adminUserId])
  materialId = mat[0].id

  app = Fastify()
  await app.register(procurementRoutes)
  await app.ready()
  actAs(adminAuth)
}, 120_000)

afterAll(async () => {
  await purge()
  await client?.end()
  await app?.close()
})

describe('POST material-requests — kontrak body (header + items satu request)', () => {
  it('REGRESI: body TANPA items ditolak 400 dan tidak menyisakan MR yatim', async () => {
    const sebelum = await mrCount()
    const res = await post('/api/v1/procurement/material-requests', {
      project_id: projectId, needed_date: null, notes: 'header saja',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('items')
    // Penolakan terjadi SEBELUM insert — tak boleh ada MR draft kosong tertinggal.
    expect(await mrCount()).toBe(sebelum)
  })

  it('items KOSONG diperlakukan sama dengan tidak dikirim → 400', async () => {
    const res = await post('/api/v1/procurement/material-requests', {
      project_id: projectId, items: [],
    })
    expect(res.statusCode).toBe(400)
  })

  it('HAPPY: body berisi items → 201, MR dan item-nya tersimpan bersama', async () => {
    const res = await post('/api/v1/procurement/material-requests', {
      project_id: projectId,
      needed_date: null,
      notes: `${PREFIX} dari form web`,
      items: [
        { material_id: materialId, qty_requested: 800, unit: 'buah', unit_price_est: 800, notes: null },
      ],
    })
    expect(res.statusCode).toBe(201)
    const mrId = res.json().material_request.id
    expect(mrId).toBeTruthy()

    const { rows } = await client.query(
      `SELECT material_id, qty_requested, unit, unit_price_est
       FROM material_request_items WHERE mr_id = $1`, [mrId])
    expect(rows).toHaveLength(1)
    expect(rows[0].material_id).toBe(materialId)
    expect(Number(rows[0].qty_requested)).toBe(800)
    expect(rows[0].unit).toBe('buah')
    expect(Number(rows[0].unit_price_est)).toBe(800)
  })

  it('HAPPY: beberapa item sekaligus semuanya tersimpan', async () => {
    const res = await post('/api/v1/procurement/material-requests', {
      project_id: projectId,
      items: [
        { material_id: materialId, qty_requested: 100, unit: 'buah' },
        { material_id: materialId, qty_requested: 250, unit: 'buah' },
      ],
    })
    expect(res.statusCode).toBe(201)
    const { rows } = await client.query(
      `SELECT qty_requested FROM material_request_items WHERE mr_id = $1 ORDER BY qty_requested`,
      [res.json().material_request.id])
    expect(rows.map(r => Number(r.qty_requested))).toEqual([100, 250])
  })
})
