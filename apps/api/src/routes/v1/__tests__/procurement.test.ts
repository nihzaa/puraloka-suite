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

  // it.fails — SENGAJA dan DIHARAPKAN gagal, mendokumentasikan bug nyata:
  // trigger sync_po_receipt_status (db/migrations/041_procurement_workflow.sql:179-238)
  // dan endpoint POST /goods-receipts (procurement.ts:467-505) TIDAK PERNAH
  // memvalidasi qty_received terhadap sisa qty_ordered PO. GR kedua yang
  // melebihi PO tetap diterima tanpa penolakan, stok tetap bertambah penuh
  // (project_stocks.qty_on_hand tidak pernah di-cap), trigger hanya menghitung
  // status fully/partially_received TANPA cek batas atas — tidak ada CHECK
  // constraint atau RAISE EXCEPTION di manapun. Vitest menganggap suite ini
  // PASS selama assertion di bawah tetap gagal (exit 0, tidak blokir CI);
  // begitu bug diperbaiki dan assertion jadi lulus, it.fails() akan GAGAL,
  // sinyal eksplisit untuk hapus .fails() — bug TIDAK diperbaiki di task ini,
  // di luar scope (murni menulis test), keputusan menunggu approval terpisah.
  it.fails('KEGAGALAN — over-receipt GR: BUG NYATA, qty_received melebihi qty_ordered PO tetap diterima tanpa ditolak', async () => {
    // Setup: PO baru dengan qty_ordered = 50
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

    // GR dengan qty_received = 80 (MELEBIHI qty_ordered 50 — over-receipt)
    const { rows: grRows } = await client.query(
      `INSERT INTO goods_receipts (po_id, project_id, supplier_id, received_by, gr_number)
       VALUES ($1, $2, $3, $4, '') RETURNING id`,
      [poId, ctx.projectId, fx.supplierId, ctx.adminId]
    )
    const grId = grRows[0].id

    // ASSERTION INI SENGAJA GAGAL — over-receipt SEHARUSNYA ditolak (insert
    // gagal/di-flag) SEBELUM baris di bawah pernah tercapai, tapi kenyataannya
    // insert sukses tanpa hambatan apa pun.
    await expect(
      client.query(
        `INSERT INTO goods_receipt_items (gr_id, po_item_id, material_id, qty_received, unit, unit_price)
         VALUES ($1, $2, $3, 80, 'sak', 65000)`,
        [grId, poItemId, fx.materialId]
      )
    ).rejects.toThrow() // EXPECTED: insert ditolak — ACTUAL: insert sukses (bug)
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
