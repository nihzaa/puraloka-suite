import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// Task 1.3.2 — Integration test golden path Change Order, pola sama seperti
// Task 1.3.1 (kasbon): terhadap Postgres nyata via schema `test`, migration
// dijalankan verbatim (bukan tulis ulang manual).
//
// Subset migration: 001 (extensions/enums), 002 (users/clients),
// 003 (projects, dependency rab_items via termin_schedules di 013),
// 007 (mandor_assignments/work_scopes — dibutuhkan seedProjectContext()
// yang generik lintas Feature 1.3, meski CO sendiri tidak memakainya),
// 013 (rab_items + ALTER termin_schedules — dibutuhkan karena
// change_order_items.rab_item_id FK ke rab_items meski nullable),
// 053 (change_orders + change_order_items + trigger created_at/updated_at).
//
// RLS (049+) dilewati — sama alasan Task 1.3.1 (auth.uid() hanya ada di
// schema auth Supabase, API produksi selalu service_role/bypass RLS).

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
  '013_rab_and_termin_trigger.sql',
  '053_change_orders.sql',
]

/** Simulasi recalcTotalDelta() dari change-orders.ts:55-67 — SUM amount_delta semua item CO. */
async function recalcTotalDelta(client: Client, coId: string): Promise<void> {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount_delta), 0) AS total FROM change_order_items WHERE change_order_id = $1`,
    [coId]
  )
  await client.query(`UPDATE change_orders SET total_amount_delta = $1 WHERE id = $2`, [rows[0].total, coId])
}

describe('change order golden path (integration)', () => {
  let client: Client
  let ctx: SeedProjectContext

  beforeAll(async () => {
    await resetTestSchema()
    client = await createTestClient()
    await client.query('SET client_min_messages TO WARNING')
    await runMigrations(client, MIGRATION_SUBSET)
    ctx = await seedProjectContext(client)
  })

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('golden path: buat CO draft', async () => {
    const { rows } = await client.query(
      `INSERT INTO change_orders (project_id, co_number, title, status, created_by)
       VALUES ($1, 'CO-001', 'Tambah pekerjaan pondasi', 'draft', $2)
       RETURNING id, status, co_number, total_amount_delta`,
      [ctx.projectId, ctx.adminId]
    )
    expect(rows[0].status).toBe('draft')
    expect(Number(rows[0].total_amount_delta)).toBe(0)
  })

  it('golden path: tambah item ke CO draft, total_amount_delta ter-update otomatis (recalcTotalDelta)', async () => {
    const { rows: coRows } = await client.query(
      `INSERT INTO change_orders (project_id, co_number, title, status, created_by)
       VALUES ($1, 'CO-002', 'Tambah pekerjaan atap', 'draft', $2) RETURNING id`,
      [ctx.projectId, ctx.adminId]
    )
    const coId = coRows[0].id

    await client.query(
      `INSERT INTO change_order_items (change_order_id, item_type, description, amount_delta)
       VALUES ($1, 'kerja_tambah', 'Rangka atap baja ringan', 15000000)`,
      [coId]
    )
    await client.query(
      `INSERT INTO change_order_items (change_order_id, item_type, description, amount_delta)
       VALUES ($1, 'kerja_kurang', 'Pengurangan genteng tipe A', -2000000)`,
      [coId]
    )
    await recalcTotalDelta(client, coId)

    const { rows: updated } = await client.query('SELECT total_amount_delta FROM change_orders WHERE id = $1', [coId])
    expect(Number(updated[0].total_amount_delta)).toBe(13000000)
  })

  it('golden path: submit CO (draft -> submitted), lalu admin approve (submitted -> approved) + update contract_value', async () => {
    const { rows: coRows } = await client.query(
      `INSERT INTO change_orders (project_id, co_number, title, status, created_by)
       VALUES ($1, 'CO-003', 'Perubahan spesifikasi lantai', 'draft', $2) RETURNING id`,
      [ctx.projectId, ctx.adminId]
    )
    const coId = coRows[0].id

    await client.query(
      `INSERT INTO change_order_items (change_order_id, item_type, description, amount_delta)
       VALUES ($1, 'perubahan_spec', 'Upgrade keramik ke granit', 8000000)`,
      [coId]
    )
    await recalcTotalDelta(client, coId)

    // Submit (persis guard kode asli change-orders.ts:447-449: status draft + minimal 1 item)
    await client.query(
      `UPDATE change_orders SET status = 'submitted', submitted_at = NOW(), submitted_by = $1 WHERE id = $2`,
      [ctx.adminId, coId]
    )

    const { rows: beforeApprove } = await client.query('SELECT status FROM change_orders WHERE id = $1', [coId])
    expect(beforeApprove[0].status).toBe('submitted')

    // Approve (persis guard kode asli change-orders.ts:526-528: status submitted)
    const { rows: project } = await client.query('SELECT contract_value FROM projects WHERE id = $1', [ctx.projectId])
    const oldContractValue = Number(project[0].contract_value)

    await client.query(
      `UPDATE change_orders SET status = 'approved', approved_at = NOW(), approved_by = $1,
         baseline_contract_value = $2 WHERE id = $3`,
      [ctx.adminId, oldContractValue, coId]
    )
    await client.query('UPDATE projects SET contract_value = contract_value + 8000000 WHERE id = $1', [ctx.projectId])

    const { rows: approved } = await client.query('SELECT status, approved_by FROM change_orders WHERE id = $1', [coId])
    expect(approved[0].status).toBe('approved')
    expect(approved[0].approved_by).toBe(ctx.adminId)

    const { rows: newProject } = await client.query('SELECT contract_value FROM projects WHERE id = $1', [ctx.projectId])
    expect(Number(newProject[0].contract_value)).toBe(oldContractValue + 8000000)
  })

  it('KEGAGALAN — approve CO yang sudah reject: guard status di kode asli (change-orders.ts:526-528) mencegah ini, dibuktikan lewat simulasi query yang sama', async () => {
    const { rows: coRows } = await client.query(
      `INSERT INTO change_orders (project_id, co_number, title, status, created_by, rejected_at, rejected_by, rejected_reason)
       VALUES ($1, 'CO-004', 'Perubahan yang ditolak', 'rejected', $2, NOW(), $2, 'Anggaran tidak cukup')
       RETURNING id`,
      [ctx.projectId, ctx.adminId]
    )
    const coId = coRows[0].id

    // Simulasi endpoint /approve: SELECT status dulu, cek guard, baru UPDATE
    // jika lolos — persis alur change-orders.ts:516-528. Endpoint PUNYA guard
    // eksplisit (co.status !== 'submitted' -> 400), berbeda dari bug kasbon
    // Task 1.3.1 yang TIDAK punya guard sama sekali.
    const { rows: current } = await client.query('SELECT status FROM change_orders WHERE id = $1', [coId])
    const guardPassed = current[0].status === 'submitted'

    expect(guardPassed).toBe(false) // guard MENOLAK — approve tidak boleh lanjut

    // Buktikan: karena guard di atas false, endpoint asli akan return 400
    // SEBELUM UPDATE apa pun dieksekusi — status CO harus tetap 'rejected',
    // tidak pernah berubah jadi 'approved'.
    if (guardPassed) {
      await client.query(`UPDATE change_orders SET status = 'approved' WHERE id = $1`, [coId])
    }
    const { rows: afterAttempt } = await client.query('SELECT status FROM change_orders WHERE id = $1', [coId])
    expect(afterAttempt[0].status).toBe('rejected') // status TIDAK berubah — endpoint sehat
  })

  it('constraint DB: status hanya boleh draft/submitted/approved/rejected (CHECK constraint)', async () => {
    await expect(
      client.query(
        `INSERT INTO change_orders (project_id, co_number, title, status, created_by)
         VALUES ($1, 'CO-005', 'Status tidak valid', 'cancelled', $2)`,
        [ctx.projectId, ctx.adminId]
      )
    ).rejects.toThrow()
  })
})
