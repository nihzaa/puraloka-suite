import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// Sub-Fase 1C — Integration: backfill change_order → workflow_instances (migration 083)
// + rekonsiliasi. Modul kedua di infra workflow yang sama (kasbon = pertama).

const BASE_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '078_users_role_id_expand.sql',
  '080_users_role_contract.sql',
  '003_projects_and_contracts.sql',
  '007_mandor_workscopes_kasbons.sql',
  '013_rab_and_termin_trigger.sql',
  '053_change_orders.sql',
]

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../../../db/migrations')
const backfillSql = readFileSync(join(MIGRATIONS_DIR, '083_backfill_change_order_workflow.sql'), 'utf-8')

const RECONCILE_SQL = `
  SELECT co.id, co.status AS source_status, wi.current_state,
         CASE WHEN wi.id IS NULL THEN 'missing_instance' ELSE 'state_mismatch' END AS problem
  FROM change_orders co
  LEFT JOIN workflow_instances wi
    ON wi.entity_type = 'change_order' AND wi.entity_id = co.id
  WHERE wi.id IS NULL OR wi.current_state <> co.status`

let coSeq = 0
async function insertCO(client: Client, ctx: SeedProjectContext, status: string): Promise<string> {
  coSeq++
  const { rows } = await client.query(
    `INSERT INTO change_orders (project_id, co_number, title, status, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [ctx.projectId, `CO-TEST-${coSeq}`, `CO ${status}`, status, ctx.adminId],
  )
  return rows[0].id
}

describe('backfill change_order → workflow_instances (integration)', () => {
  let client: Client
  let ctx: SeedProjectContext

  beforeAll(async () => {
    await resetTestSchema()
    client = await createTestClient()
    await client.query('SET client_min_messages TO WARNING')
    await runMigrations(client, BASE_SUBSET)
    await client.query(`CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
    await client.query(`CREATE OR REPLACE FUNCTION auth_user_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$`)
    await runMigrations(client, ['081_workflow_foundation.sql'])
    ctx = await seedProjectContext(client)
  }, 60_000)

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('backfill: setiap change_order dapat TEPAT SATU instance dengan state cocok', async () => {
    await insertCO(client, ctx, 'draft')
    await insertCO(client, ctx, 'submitted')
    await insertCO(client, ctx, 'approved')
    await insertCO(client, ctx, 'rejected')

    await client.query(backfillSql)

    const coCount = Number((await client.query('SELECT count(*)::int n FROM change_orders')).rows[0].n)
    const instCount = Number((await client.query(
      `SELECT count(*)::int n FROM workflow_instances WHERE entity_type='change_order'`)).rows[0].n)
    expect(instCount).toBe(coCount)

    const recon = await client.query(RECONCILE_SQL)
    expect(recon.rows).toHaveLength(0)

    const dup = await client.query(
      `SELECT entity_id, count(*) c FROM workflow_instances WHERE entity_type='change_order' GROUP BY entity_id HAVING count(*) > 1`)
    expect(dup.rows).toHaveLength(0)
  })

  it('IDEMPOTEN: jalankan lagi → jumlah tetap, nol duplikat', async () => {
    const before = Number((await client.query(
      `SELECT count(*)::int n FROM workflow_instances WHERE entity_type='change_order'`)).rows[0].n)
    await client.query(backfillSql)
    await client.query(backfillSql)
    const after = Number((await client.query(
      `SELECT count(*)::int n FROM workflow_instances WHERE entity_type='change_order'`)).rows[0].n)
    expect(after).toBe(before)
    expect((await client.query(RECONCILE_SQL)).rows).toHaveLength(0)
  })

  it('DIVERGENSI terdeteksi: ubah status langsung → reconcile menangkap', async () => {
    const id = await insertCO(client, ctx, 'draft')
    await client.query(backfillSql)
    await client.query(`UPDATE change_orders SET status='submitted' WHERE id=$1`, [id])
    const recon = await client.query(RECONCILE_SQL)
    const row = recon.rows.find(r => r.id === id)
    expect(row).toBeDefined()
    expect(row.problem).toBe('state_mismatch')
    expect(row.source_status).toBe('submitted')
    expect(row.current_state).toBe('draft')
    await client.query(backfillSql) // rapikan
  })

  it('FAIL-LOUD: status di luar peta → backfill RAISE (R7). CHECK di-drop dulu utk uji.', async () => {
    // status change_order = TEXT + CHECK. Drop CHECK di schema test lalu masukkan status asing.
    await client.query(`ALTER TABLE change_orders DROP CONSTRAINT change_orders_status_check`)
    await insertCO(client, ctx, 'cancelled')
    await expect(client.query(backfillSql)).rejects.toThrow(/tak dikenal|DIBATALKAN/)
  })
})
