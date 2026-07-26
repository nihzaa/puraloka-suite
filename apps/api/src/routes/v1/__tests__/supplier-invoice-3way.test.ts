import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import procurementRoutes from '../procurement.js'

// 3-way match PO–GR–Invoice (PETA-PRIORITAS §3 #2) — test route-level:
// (a) invoice manual WAJIB ter-link GR, (b) total invoice divalidasi terhadap
// nilai GR pada HARGA PO (bukan harga aktual GR), (c) anti-dobel: satu GR satu
// invoice + nomor faktur unik per supplier + auto-invoice saat confirm GR
// mengalah bila invoice manual sudah ada.
//
// Pola rumah (ahsp-endpoint.test.ts): fixture [TEST-3WAY] di schema public
// (dev lokal / project CI), route diuji via app.inject, purge sebelum+sesudah.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string

let supplierId: string
let supplierBId: string
let projectId: string
let materialId: string
let poItemId: string
// GR1 = manual invoice happy/negatif · GR2 = manual-lalu-confirm (auto mengalah)
// GR3 = confirm tanpa manual (auto jalan) · GR4 = uji duplikat nomor faktur
let gr1: string, gr2: string, gr3: string, gr4: string

const PO_PRICE = 65000
const GR1_QTY = 30 // nilai match GR1 = 1.950.000
const GR2_QTY = 25
const GR3_QTY = 20
const GR4_QTY = 10

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string) =>
  app.inject({ method: 'PATCH', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  // Trigger dimatikan hanya di sesi ini (pola cleanup rumah) — data produksi
  // tak tersentuh; hanya baris berprefiks [TEST-3WAY] yang dihapus.
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM supplier_invoices WHERE supplier_id IN
      (SELECT id FROM suppliers WHERE name LIKE '[TEST-3WAY]%')`)
    await client.query(`DELETE FROM stock_movements WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '[TEST-3WAY]%')`)
    await client.query(`DELETE FROM project_stocks WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '[TEST-3WAY]%')`)
    await client.query(`DELETE FROM goods_receipt_items WHERE gr_id IN
      (SELECT id FROM goods_receipts WHERE supplier_id IN
        (SELECT id FROM suppliers WHERE name LIKE '[TEST-3WAY]%'))`)
    await client.query(`DELETE FROM goods_receipts WHERE supplier_id IN
      (SELECT id FROM suppliers WHERE name LIKE '[TEST-3WAY]%')`)
    await client.query(`DELETE FROM purchase_order_items WHERE po_id IN
      (SELECT id FROM purchase_orders WHERE supplier_id IN
        (SELECT id FROM suppliers WHERE name LIKE '[TEST-3WAY]%'))`)
    await client.query(`DELETE FROM purchase_orders WHERE supplier_id IN
      (SELECT id FROM suppliers WHERE name LIKE '[TEST-3WAY]%')`)
    await client.query(`DELETE FROM materials WHERE name LIKE '[TEST-3WAY]%'`)
    await client.query(`DELETE FROM suppliers WHERE name LIKE '[TEST-3WAY]%'`)
    await client.query(`DELETE FROM projects WHERE name LIKE '[TEST-3WAY]%'`)
    await client.query(`DELETE FROM clients WHERE contact_person LIKE '[TEST-3WAY]%'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

async function makeGr(qty: number, actualUnitPrice: number): Promise<string> {
  const { rows: grRows } = await client.query(
    `INSERT INTO goods_receipts (po_id, project_id, supplier_id, received_by, gr_number)
     SELECT po.id, po.project_id, po.supplier_id, $1, ''
     FROM purchase_orders po WHERE po.supplier_id = $2 LIMIT 1
     RETURNING id`,
    [adminUserId, supplierId]
  )
  const grId = grRows[0].id
  await client.query(
    `INSERT INTO goods_receipt_items (gr_id, po_item_id, material_id, qty_received, unit, unit_price)
     VALUES ($1, $2, $3, $4, 'sak', $5)`,
    [grId, poItemId, materialId, qty, actualUnitPrice]
  )
  return grId
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.auth_id IS NOT NULL LIMIT 1`)
  adminUserId = u[0].id

  const { rows: cl } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('[TEST-3WAY] Klien', '0800000000', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, '[TEST-3WAY] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $2) RETURNING id`,
    [cl[0].id, adminUserId])
  projectId = pr[0].id

  const { rows: sup } = await client.query(
    `INSERT INTO suppliers (name, payment_terms, created_by) VALUES ('[TEST-3WAY] Toko A', 'net_14', $1) RETURNING id`,
    [adminUserId])
  supplierId = sup[0].id
  const { rows: supB } = await client.query(
    `INSERT INTO suppliers (name, payment_terms, created_by) VALUES ('[TEST-3WAY] Toko B', 'cod', $1) RETURNING id`,
    [adminUserId])
  supplierBId = supB[0].id

  const { rows: mat } = await client.query(
    `INSERT INTO materials (name, unit, unit_price, created_by) VALUES ('[TEST-3WAY] Semen', 'sak', $1, $2) RETURNING id`,
    [PO_PRICE, adminUserId])
  materialId = mat[0].id

  const { rows: po } = await client.query(
    `INSERT INTO purchase_orders (project_id, supplier_id, created_by, total_amount, payment_terms, po_number)
     VALUES ($1, $2, $3, $4, 'net_14', '') RETURNING id`,
    [projectId, supplierId, adminUserId, 100 * PO_PRICE])
  const { rows: poi } = await client.query(
    `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit, unit_price)
     VALUES ($1, $2, 100, 'sak', $3) RETURNING id`,
    [po[0].id, materialId, PO_PRICE])
  poItemId = poi[0].id

  // Harga aktual GR SENGAJA dibuat lebih tinggi dari PO (72.000 vs 65.000) di GR1
  // untuk membuktikan basis validasi = harga PO, bukan harga tulisan surat jalan.
  gr1 = await makeGr(GR1_QTY, 72000)
  gr2 = await makeGr(GR2_QTY, PO_PRICE)
  gr3 = await makeGr(GR3_QTY, PO_PRICE)
  gr4 = await makeGr(GR4_QTY, PO_PRICE)

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

const invoiceCountForGr = async (grId: string): Promise<number> => {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM supplier_invoices WHERE goods_receipt_id = $1`, [grId])
  return rows[0].n
}

describe('supplier invoice manual — wajib link GR (celah a)', () => {
  it('NEGATIF: tanpa goods_receipt_id → 400 + tidak ada baris masuk', async () => {
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: 1_000_000,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('goods_receipt_id')
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM supplier_invoices WHERE supplier_id = $1`, [supplierId])
    expect(rows[0].n).toBe(0)
  })

  it('NEGATIF: GR tidak ada → 404', async () => {
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: 1_000_000,
      goods_receipt_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(404)
  })

  it('NEGATIF: supplier_id bukan supplier GR → 400', async () => {
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierBId, total_amount: 1_000_000, goods_receipt_id: gr1,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('tidak cocok')
  })
})

describe('validasi harga vs PO (celah b)', () => {
  it('NEGATIF: total sesuai harga aktual GR (72rb) tapi MELEBIHI harga PO (65rb) → 400', async () => {
    // 30 × 72.000 = 2.160.000 > plafon 30 × 65.000 = 1.950.000 → overbilling tertangkap
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: GR1_QTY * 72000, goods_receipt_id: gr1,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('melebihi nilai GR pada harga PO')
    expect(await invoiceCountForGr(gr1)).toBe(0)
  })

  it('POSITIF: total = qty GR × harga PO → 201, project_id ikut GR', async () => {
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: GR1_QTY * PO_PRICE,
      goods_receipt_id: gr1, invoice_number: 'INV-3WAY-001',
    })
    expect(res.statusCode).toBe(201)
    const { rows } = await client.query(
      `SELECT project_id, goods_receipt_id, total_amount FROM supplier_invoices WHERE goods_receipt_id = $1`, [gr1])
    expect(rows).toHaveLength(1)
    expect(rows[0].project_id).toBe(projectId)
    expect(Number(rows[0].total_amount)).toBe(GR1_QTY * PO_PRICE)
  })
})

describe('anti invoice dobel (celah c)', () => {
  it('NEGATIF: invoice kedua untuk GR yang sama → 409', async () => {
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: 100_000, goods_receipt_id: gr1,
    })
    expect(res.statusCode).toBe(409)
    expect(await invoiceCountForGr(gr1)).toBe(1)
  })

  it('NEGATIF: nomor faktur sama untuk supplier sama (GR berbeda) → 409', async () => {
    const res = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: GR4_QTY * PO_PRICE,
      goods_receipt_id: gr4, invoice_number: 'INV-3WAY-001',
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('INV-3WAY-001')
    expect(await invoiceCountForGr(gr4)).toBe(0)
  })

  it('auto-invoice MENGALAH: GR dengan invoice manual di-confirm → tetap 1 invoice', async () => {
    const manual = await post('/api/v1/procurement/supplier-invoices', {
      supplier_id: supplierId, total_amount: GR2_QTY * PO_PRICE,
      goods_receipt_id: gr2, invoice_number: 'INV-3WAY-002',
    })
    expect(manual.statusCode).toBe(201)

    const confirm = await patch(`/api/v1/procurement/goods-receipts/${gr2}/confirm`)
    expect(confirm.statusCode).toBe(200)

    expect(await invoiceCountForGr(gr2)).toBe(1)
    const { rows } = await client.query(
      `SELECT invoice_number FROM supplier_invoices WHERE goods_receipt_id = $1`, [gr2])
    expect(rows[0].invoice_number).toBe('INV-3WAY-002') // yang manual yang bertahan
  })

  it('POSITIF: GR tanpa invoice manual di-confirm → auto-invoice tetap dibuat (perilaku lama utuh)', async () => {
    const confirm = await patch(`/api/v1/procurement/goods-receipts/${gr3}/confirm`)
    expect(confirm.statusCode).toBe(200)
    expect(await invoiceCountForGr(gr3)).toBe(1)
  })
})
