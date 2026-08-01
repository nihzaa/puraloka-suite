import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// Migration 121 — backstop DB untuk 3-way match: dua partial unique index di
// supplier_invoices. Diuji terhadap Postgres nyata via schema `test`, migration
// verbatim (pola procurement.test.ts). Index = jaring terakhir race-safe di
// bawah cek API-layer (supplier-invoice-3way.test.ts).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '078_users_role_id_expand.sql',
  // 080 DIGANTI 154 (bukan ditambah). Guard 080 memakai to_regclass('audit_logs')
  // TANPA skema, dan pencarian itu menembus ke public — jadi ia menemukan tabel
  // yang TIDAK ada di schema test, lalu membuat view yang gagal:
  // "column al.user_id does not exist". 154 memakai current_schema(), dan
  // menulis ulang bagian 080 lainnya secara idempoten.
  '154_guard_regclass_schema_aware.sql',
  '003_projects_and_contracts.sql',
  '007_mandor_workscopes_kasbons.sql',
  '039_material_management.sql',
  '040_supplier_management.sql',
  '041_procurement_workflow.sql',
  '121_supplier_invoice_3way_guards.sql',
]

describe('migration 121 — unique guards supplier_invoices (integration)', () => {
  let client: Client
  let ctx: SeedProjectContext
  let supplierId: string
  let grA: string
  let grB: string

  beforeAll(async () => {
    await resetTestSchema()
    client = await createTestClient()
    await client.query('SET client_min_messages TO WARNING')
    await runMigrations(client, MIGRATION_SUBSET)
    ctx = await seedProjectContext(client)

    const { rows: sup } = await client.query(
      `INSERT INTO suppliers (name, payment_terms, created_by) VALUES ('Toko Guard', 'cod', $1) RETURNING id`,
      [ctx.adminId])
    supplierId = sup[0].id

    const { rows: mat } = await client.query(
      `INSERT INTO materials (name, unit, unit_price, created_by) VALUES ('Semen Guard', 'sak', 65000, $1) RETURNING id`,
      [ctx.adminId])
    const { rows: po } = await client.query(
      `INSERT INTO purchase_orders (project_id, supplier_id, created_by, total_amount, po_number)
       VALUES ($1, $2, $3, 6500000, '') RETURNING id`,
      [ctx.projectId, supplierId, ctx.adminId])
    await client.query(
      `INSERT INTO purchase_order_items (po_id, material_id, qty_ordered, unit, unit_price)
       VALUES ($1, $2, 100, 'sak', 65000)`,
      [po[0].id, mat[0].id])

    const mkGr = async () => {
      const { rows } = await client.query(
        `INSERT INTO goods_receipts (po_id, project_id, supplier_id, received_by, gr_number)
         VALUES ($1, $2, $3, $4, '') RETURNING id`,
        [po[0].id, ctx.projectId, supplierId, ctx.adminId])
      return rows[0].id as string
    }
    grA = await mkGr()
    grB = await mkGr()
  })

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('POSITIF: satu invoice per GR + nomor faktur berbeda → masuk normal', async () => {
    await client.query(
      `INSERT INTO supplier_invoices (supplier_id, goods_receipt_id, invoice_number, total_amount)
       VALUES ($1, $2, 'INV-A', 1000000)`,
      [supplierId, grA])
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM supplier_invoices WHERE goods_receipt_id = $1`, [grA])
    expect(rows[0].n).toBe(1)
  })

  it('NEGATIF: invoice kedua untuk GR yang sama → unique_violation 23505', async () => {
    await expect(
      client.query(
        `INSERT INTO supplier_invoices (supplier_id, goods_receipt_id, total_amount)
         VALUES ($1, $2, 500000)`,
        [supplierId, grA])
    ).rejects.toMatchObject({ code: '23505', constraint: 'uq_supplier_invoices_gr' })
  })

  it('NEGATIF: nomor faktur sama untuk supplier sama → unique_violation 23505', async () => {
    await expect(
      client.query(
        `INSERT INTO supplier_invoices (supplier_id, goods_receipt_id, invoice_number, total_amount)
         VALUES ($1, $2, 'INV-A', 750000)`,
        [supplierId, grB])
    ).rejects.toMatchObject({ code: '23505', constraint: 'uq_supplier_invoices_supplier_number' })
  })

  it('POSITIF: dua invoice ber-invoice_number NULL (auto-invoice) tidak saling bentrok', async () => {
    // Index partial WHERE invoice_number IS NOT NULL — NULL bebas duplikat.
    // Baris kedua tanpa goods_receipt_id = pola invoice legacy pra-121 (tetap sah).
    await client.query(
      `INSERT INTO supplier_invoices (supplier_id, goods_receipt_id, total_amount)
       VALUES ($1, $2, 250000)`,
      [supplierId, grB])
    await client.query(
      `INSERT INTO supplier_invoices (supplier_id, total_amount) VALUES ($1, 100000)`,
      [supplierId])
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM supplier_invoices WHERE supplier_id = $1 AND invoice_number IS NULL`,
      [supplierId])
    expect(rows[0].n).toBe(2)
  })
})
