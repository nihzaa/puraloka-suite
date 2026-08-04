import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import procurementRoutes from '../procurement.js'

// BUG LAPANGAN (2026-08-04) — modal "Catat Penerimaan Barang (GR)" di web SELALU
// gagal dengan galat Postgres mentah:
//   null value in column "material_id" of relation "goods_receipt_items"
//   violates not-null constraint
// Sebabnya: form hanya mengirim { po_item_id, qty_received }, sementara endpoint
// dulu membaca material_id/unit/unit_price DARI BODY. Ketiganya undefined →
// material_id NULL → INSERT ditolak.
//
// Perbaikan: ketiga kolom itu diturunkan dari PO item di SERVER. Selain
// menutup bug, ini memindahkan penentuan HARGA dari browser ke server —
// `unit_price ? ... : 0` yang lama diam-diam menulis 0 dan merusak nilai
// 3-way match tanpa pesan galat.
//
// Test ini mengunci keduanya: GR bisa dicatat dengan body minimal, DAN harga
// yang tersimpan adalah harga PO meski klien mencoba mengirim harga lain.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let projectId: string
let supplierId: string
let materialId: string
let poId: string
let poItemId: string

const PREFIX = '[TEST-GR-BODY]'
const PO_PRICE = 65000
const PO_QTY = 100
const PO_UNIT = 'sak'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM stock_movements WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '${PREFIX}%')`)
    await client.query(`DELETE FROM project_stocks WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '${PREFIX}%')`)
    await client.query(`DELETE FROM goods_receipt_items WHERE gr_id IN
      (SELECT id FROM goods_receipts WHERE supplier_id IN
        (SELECT id FROM suppliers WHERE name LIKE '${PREFIX}%'))`)
    await client.query(`DELETE FROM goods_receipts WHERE supplier_id IN
      (SELECT id FROM suppliers WHERE name LIKE '${PREFIX}%')`)
    await client.query(`DELETE FROM purchase_order_items WHERE po_id IN
      (SELECT id FROM purchase_orders WHERE supplier_id IN
        (SELECT id FROM suppliers WHERE name LIKE '${PREFIX}%'))`)
    await client.query(`DELETE FROM purchase_orders WHERE supplier_id IN
      (SELECT id FROM suppliers WHERE name LIKE '${PREFIX}%')`)
    await client.query(`DELETE FROM materials WHERE name LIKE '${PREFIX}%'`)
    await client.query(`DELETE FROM suppliers WHERE name LIKE '${PREFIX}%'`)
    await client.query(`DELETE FROM projects WHERE name LIKE '${PREFIX}%'`)
    await client.query(`DELETE FROM clients WHERE contact_person LIKE '${PREFIX}%'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

const COMPANY = `(SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1)`

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.auth_id IS NOT NULL LIMIT 1`)
  adminUserId = u[0].id

  const { rows: cl } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES (${COMPANY}, '${PREFIX} Klien', '0800000000', $1) RETURNING id`, [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES (${COMPANY}, $1, $2, '${PREFIX} Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $2) RETURNING id`,
    [cl[0].id, adminUserId])
  projectId = pr[0].id

  const { rows: sup } = await client.query(
    `INSERT INTO suppliers (company_id, name, payment_terms, created_by)
     VALUES (${COMPANY}, '${PREFIX} Toko Besi', 'net_14', $1) RETURNING id`, [adminUserId])
  supplierId = sup[0].id

  const { rows: mat } = await client.query(
    `INSERT INTO materials (name, unit, unit_price, created_by)
     VALUES ('${PREFIX} Besi Beton 10mm', '${PO_UNIT}', $1, $2) RETURNING id`, [PO_PRICE, adminUserId])
  materialId = mat[0].id

  const { rows: po } = await client.query(
    `INSERT INTO purchase_orders (project_id, supplier_id, created_by, total_amount, payment_terms, status, po_number)
     VALUES ($1, $2, $3, $4, 'net_14', 'confirmed', '') RETURNING id`,
    [projectId, supplierId, adminUserId, PO_QTY * PO_PRICE])
  poId = po[0].id

  const { rows: poi } = await client.query(
    `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit, unit_price)
     VALUES ($1, $2, $3, '${PO_UNIT}', $4) RETURNING id`,
    [poId, materialId, PO_QTY, PO_PRICE])
  poItemId = poi[0].id

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

const grItems = async (grId: string) => {
  const { rows } = await client.query(
    `SELECT material_id, unit, unit_price, qty_received FROM goods_receipt_items WHERE gr_id = $1`, [grId])
  return rows
}

describe('POST goods-receipts — body minimal, atribut material dari PO', () => {
  it('REGRESI: body hanya po_item_id + qty_received → 201 (dulu 500 material_id NULL)', async () => {
    const res = await post('/api/v1/procurement/goods-receipts', {
      po_id: poId,
      receipt_date: '2026-08-05',
      notes: `${PREFIX} dari form web`,
      items: [{ po_item_id: poItemId, qty_received: 4 }],
    })
    expect(res.statusCode).toBe(201)

    const rows = await grItems(res.json().goods_receipt.id)
    expect(rows).toHaveLength(1)
    // Ketiga kolom NOT NULL terisi dari PO item, bukan dari body.
    expect(rows[0].material_id).toBe(materialId)
    expect(rows[0].unit).toBe(PO_UNIT)
    expect(Number(rows[0].unit_price)).toBe(PO_PRICE)
    expect(Number(rows[0].qty_received)).toBe(4)
  })

  it('UANG: harga yang dikirim klien DIABAIKAN — yang tersimpan harga PO', async () => {
    const res = await post('/api/v1/procurement/goods-receipts', {
      po_id: poId,
      items: [{
        po_item_id: poItemId, qty_received: 5,
        // Klien nakal mencoba menyetir angka uang dan atribut material:
        unit_price: 1, unit: 'karung', material_id: '00000000-0000-0000-0000-000000000009',
      }],
    })
    expect(res.statusCode).toBe(201)

    const rows = await grItems(res.json().goods_receipt.id)
    expect(Number(rows[0].unit_price)).toBe(PO_PRICE)   // BUKAN 1
    expect(rows[0].unit).toBe(PO_UNIT)                  // BUKAN 'karung'
    expect(rows[0].material_id).toBe(materialId)        // BUKAN uuid kiriman klien
  })

  it('over-receipt tetap ditolak 400 dan menyebut nama material', async () => {
    const res = await post('/api/v1/procurement/goods-receipts', {
      po_id: poId,
      items: [{ po_item_id: poItemId, qty_received: PO_QTY + 1 }],
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Over-receipt')
    expect(res.json().error).toContain('Besi Beton')
  })

  it('po_item_id asing → 404, bukan galat Postgres mentah', async () => {
    const res = await post('/api/v1/procurement/goods-receipts', {
      po_id: poId,
      items: [{ po_item_id: '00000000-0000-0000-0000-000000000001', qty_received: 1 }],
    })
    expect(res.statusCode).toBe(404)
  })

  it('body tanpa items → 400', async () => {
    const res = await post('/api/v1/procurement/goods-receipts', { po_id: poId })
    expect(res.statusCode).toBe(400)
  })
})
