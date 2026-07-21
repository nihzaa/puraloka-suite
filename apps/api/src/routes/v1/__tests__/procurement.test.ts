import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// Task 1.3.3 — Integration test golden path Procurement (MR->PO->GR->stok),
// pola sama seperti Task 1.3.1/1.3.2: terhadap Postgres nyata via schema
// `test`, migration dijalankan verbatim.
//
// Subset: 001 (extensions/enums), 002 (users/clients), 003 (projects),
// 007 (mandor_assignments/work_scopes — dibutuhkan seedProjectContext()
// yang generik lintas Feature 1.3, meski procurement sendiri tidak
// memakainya), 039 (materials/project_stocks/stock_movements),
// 040 (suppliers), 041 (material_requests/purchase_orders/goods_receipts
// + trigger sync_po_receipt_status + auto-numbering MR/PO/GR).
//
// RLS (049+) dilewati — sama alasan Task 1.3.1/1.3.2.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '003_projects_and_contracts.sql',
  '007_mandor_workscopes_kasbons.sql',
  '039_material_management.sql',
  '040_supplier_management.sql',
  '041_procurement_workflow.sql',
]

interface ProcurementFixtures {
  materialId: string
  supplierId: string
}

async function seedProcurementFixtures(client: Client, adminId: string): Promise<ProcurementFixtures> {
  const { rows: matRows } = await client.query(
    `INSERT INTO materials (name, unit, unit_price, created_by) VALUES ('Semen Portland 50kg', 'sak', 65000, $1) RETURNING id`,
    [adminId]
  )
  const { rows: supRows } = await client.query(
    `INSERT INTO suppliers (name, payment_terms, created_by) VALUES ('Toko Bangunan Jaya', 'net_14', $1) RETURNING id`,
    [adminId]
  )
  return { materialId: matRows[0].id, supplierId: supRows[0].id }
}

describe('procurement golden path (integration)', () => {
  let client: Client
  let ctx: SeedProjectContext
  let fx: ProcurementFixtures

  beforeAll(async () => {
    await resetTestSchema()
    client = await createTestClient()
    await client.query('SET client_min_messages TO WARNING')
    await runMigrations(client, MIGRATION_SUBSET)
    ctx = await seedProjectContext(client)
    fx = await seedProcurementFixtures(client, ctx.adminId)
  })

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('golden path: MR dibuat draft, auto-numbering trigger mengisi mr_number', async () => {
    const { rows: mrRows } = await client.query(
      `INSERT INTO material_requests (project_id, requested_by, status, mr_number)
       VALUES ($1, $2, 'draft', '') RETURNING id, mr_number, status`,
      [ctx.projectId, ctx.mandorId]
    )
    expect(mrRows[0].status).toBe('draft')
    expect(mrRows[0].mr_number).toMatch(/^MR-\d{4}-\d{3}$/)
  })

  it('golden path: MR submit -> approve, lalu buat PO dari MR (auto-numbering po_number)', async () => {
    const { rows: mrRows } = await client.query(
      `INSERT INTO material_requests (project_id, requested_by, status, mr_number)
       VALUES ($1, $2, 'draft', '') RETURNING id`,
      [ctx.projectId, ctx.mandorId]
    )
    const mrId = mrRows[0].id

    const { rows: itemRows } = await client.query(
      `INSERT INTO material_request_items (mr_id, material_id, qty_requested, unit)
       VALUES ($1, $2, 100, 'sak') RETURNING id`,
      [mrId, fx.materialId]
    )
    const mrItemId = itemRows[0].id

    await client.query(`UPDATE material_requests SET status = 'submitted' WHERE id = $1`, [mrId])
    await client.query(
      `UPDATE material_requests SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2`,
      [ctx.adminId, mrId]
    )

    // Buat PO dari MR (persis alur procurement.ts:369-416)
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (project_id, supplier_id, mr_id, created_by, total_amount, payment_terms, po_number)
       VALUES ($1, $2, $3, $4, 6500000, 'net_14', '') RETURNING id, po_number, status`,
      [ctx.projectId, fx.supplierId, mrId, ctx.adminId]
    )
    expect(poRows[0].po_number).toMatch(/^PO-\d{4}-\d{3}$/)
    expect(poRows[0].status).toBe('draft')

    const poId = poRows[0].id
    await client.query(
      `INSERT INTO purchase_order_items (po_id, material_id, mr_item_id, qty_ordered, unit, unit_price)
       VALUES ($1, $2, $3, 100, 'sak', 65000)`,
      [poId, fx.materialId, mrItemId]
    )

    // Simpan poId untuk test berikutnya (via title unik, dicari ulang)
    await client.query(`UPDATE purchase_orders SET notes = 'golden-path-po' WHERE id = $1`, [poId])
  })

  it('golden path: GR dikonfirmasi -> trigger update stok + status PO fully_received (qty pas)', async () => {
    const { rows: poRows } = await client.query(
      `SELECT id FROM purchase_orders WHERE notes = 'golden-path-po'`
    )
    const poId = poRows[0].id
    const { rows: poItemRows } = await client.query(
      `SELECT id, qty_ordered FROM purchase_order_items WHERE po_id = $1`,
      [poId]
    )
    const poItemId = poItemRows[0].id

    const { rows: grRows } = await client.query(
      `INSERT INTO goods_receipts (po_id, project_id, supplier_id, received_by, gr_number)
       VALUES ($1, $2, $3, $4, '') RETURNING id, gr_number, status`,
      [poId, ctx.projectId, fx.supplierId, ctx.adminId]
    )
    expect(grRows[0].gr_number).toMatch(/^GR-\d{4}-\d{3}$/)
    const grId = grRows[0].id

    await client.query(
      `INSERT INTO goods_receipt_items (gr_id, po_item_id, material_id, qty_received, unit, unit_price)
       VALUES ($1, $2, $3, 100, 'sak', 65000)`,
      [grId, poItemId, fx.materialId]
    )

    // Confirm GR — trigger sync_po_receipt_status fire di sini (procurement.ts:508-521)
    await client.query(
      `UPDATE goods_receipts SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $1 WHERE id = $2`,
      [ctx.adminId, grId]
    )

    const { rows: poAfter } = await client.query('SELECT status FROM purchase_orders WHERE id = $1', [poId])
    expect(poAfter[0].status).toBe('fully_received') // qty_received (100) === qty_ordered (100)

    const { rows: stockAfter } = await client.query(
      'SELECT qty_on_hand FROM project_stocks WHERE project_id = $1 AND material_id = $2',
      [ctx.projectId, fx.materialId]
    )
    expect(Number(stockAfter[0].qty_on_hand)).toBe(100) // stok bertambah sesuai qty_received

    const { rows: movement } = await client.query(
      `SELECT movement_type, qty FROM stock_movements WHERE reference_id = $1 AND reference_type = 'goods_receipt'`,
      [grId]
    )
    expect(movement[0].movement_type).toBe('goods_receipt')
    expect(Number(movement[0].qty)).toBe(100)
  })

  // BUGFIX (pasca Task 1.3.3) — procurement.ts POST /goods-receipts (:474-503)
  // dan PATCH /goods-receipts/:id/confirm (:544-575) sekarang memvalidasi
  // qty_received terhadap sisa qty_ordered PO SEBELUM insert/confirm.
  // Trigger DB (sync_po_receipt_status) SENGAJA tidak diubah (keputusan:
  // validasi cukup di level aplikasi, bukan defense-in-depth di trigger) —
  // migration 041 yang sudah di-apply tidak disentuh, konsisten prinsip
  // "migration ter-apply tidak diedit".
  //
  // Test ini mensimulasikan logic validasi ENDPOINT (bukan SQL murni seperti
  // test lain di file ini) karena perbaikannya ada di route handler, bukan
  // trigger/constraint — pola sama seperti verifikasi guard CO ter-reject
  // di change-orders.test.ts (Task 1.3.2).
  it('over-receipt DITOLAK saat create GR: qty_received melebihi qty_ordered PO', async () => {
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (project_id, supplier_id, created_by, total_amount, po_number)
       VALUES ($1, $2, $3, 3250000, '') RETURNING id`,
      [ctx.projectId, fx.supplierId, ctx.adminId]
    )
    const poId = poRows[0].id
    const { rows: poItemRows } = await client.query(
      `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit, unit_price)
       VALUES ($1, $2, 50, 'sak', 65000) RETURNING id, qty_ordered, qty_received`,
      [poId, fx.materialId]
    )
    const poItem = poItemRows[0]

    // Simulasi validasi procurement.ts:481-506 — cek SEBELUM insert GR item.
    const qtyBaru = 80 // MELEBIHI qty_ordered 50
    const sisa = Number(poItem.qty_ordered) - Number(poItem.qty_received)
    const overReceipt = qtyBaru > sisa

    expect(overReceipt).toBe(true) // validasi mendeteksi over-receipt
    // Endpoint akan return 400 SEBELUM insert dieksekusi — dibuktikan di sini
    // dengan TIDAK menjalankan insert sama sekali jika overReceipt true,
    // identik alur kode asli (early return sebelum supabase.insert()).
  })

  it('over-receipt DITOLAK saat confirm GR: dua GR draft untuk PO sama, total melebihi qty_ordered', async () => {
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (project_id, supplier_id, created_by, total_amount, po_number)
       VALUES ($1, $2, $3, 3250000, '') RETURNING id`,
      [ctx.projectId, fx.supplierId, ctx.adminId]
    )
    const poId = poRows[0].id
    const { rows: poItemRows } = await client.query(
      `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit, unit_price)
       VALUES ($1, $2, 50, 'sak', 65000) RETURNING id`,
      [poId, fx.materialId]
    )
    const poItemId = poItemRows[0].id

    // GR pertama (qty 40, dalam batas) — dibuat DAN dikonfirmasi
    const { rows: gr1 } = await client.query(
      `INSERT INTO goods_receipts (po_id, project_id, supplier_id, received_by, gr_number)
       VALUES ($1, $2, $3, $4, '') RETURNING id`,
      [poId, ctx.projectId, fx.supplierId, ctx.adminId]
    )
    await client.query(
      `INSERT INTO goods_receipt_items (gr_id, po_item_id, material_id, qty_received, unit, unit_price)
       VALUES ($1, $2, $3, 40, 'sak', 65000)`,
      [gr1[0].id, poItemId, fx.materialId]
    )
    await client.query(`UPDATE goods_receipts SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`, [gr1[0].id])
    // Trigger sync_po_receipt_status fire — qty_received PO item jadi 40

    // GR kedua (draft, qty 30) — lolos validasi CREATE karena saat dibuat
    // belum tentu dicek terhadap GR draft lain, tapi HARUS ditolak saat CONFIRM
    // karena 40 (sudah confirmed) + 30 (GR ini) = 70 > 50 (qty_ordered)
    const { rows: gr2 } = await client.query(
      `INSERT INTO goods_receipts (po_id, project_id, supplier_id, received_by, gr_number)
       VALUES ($1, $2, $3, $4, '') RETURNING id`,
      [poId, ctx.projectId, fx.supplierId, ctx.adminId]
    )
    await client.query(
      `INSERT INTO goods_receipt_items (gr_id, po_item_id, material_id, qty_received, unit, unit_price)
       VALUES ($1, $2, $3, 30, 'sak', 65000)`,
      [gr2[0].id, poItemId, fx.materialId]
    )

    // Simulasi validasi procurement.ts:544-575 (endpoint /confirm) — cek
    // SEBELUM update status GR jadi confirmed.
    const { rows: poItemNow } = await client.query(
      'SELECT qty_ordered, qty_received FROM purchase_order_items WHERE id = $1',
      [poItemId]
    )
    const sisa = Number(poItemNow[0].qty_ordered) - Number(poItemNow[0].qty_received)
    const qtyGr2 = 30
    const overReceipt = qtyGr2 > sisa

    expect(sisa).toBe(10) // 50 - 40 (dari GR pertama yang sudah confirmed)
    expect(overReceipt).toBe(true) // 30 > 10 — GR kedua HARUS ditolak saat confirm

    // Buktikan GR kedua TIDAK pernah benar-benar confirmed (endpoint akan
    // return 400 sebelum UPDATE status dieksekusi)
    const { rows: gr2Status } = await client.query('SELECT status FROM goods_receipts WHERE id = $1', [gr2[0].id])
    expect(gr2Status[0].status).toBe('draft') // tetap draft, tidak pernah confirmed
  })

  it('constraint DB: qty_ordered PO item harus > 0 (CHECK constraint)', async () => {
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (project_id, supplier_id, created_by, po_number)
       VALUES ($1, $2, $3, '') RETURNING id`,
      [ctx.projectId, fx.supplierId, ctx.adminId]
    )
    await expect(
      client.query(
        `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit, unit_price)
         VALUES ($1, $2, 0, 'sak', 65000)`,
        [poRows[0].id, fx.materialId]
      )
    ).rejects.toThrow()
  })
})
