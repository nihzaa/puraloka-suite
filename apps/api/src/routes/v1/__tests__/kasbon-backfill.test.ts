import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// Sub-Fase 1C — Integration: backfill kasbon → workflow_instances (migration 082)
// + rekonsiliasi divergensi. Terhadap Postgres nyata (schema `test`).
//
// 081 (workflow) membundel RLS policy yang memanggil has_permission()/auth_user_id()
// (unqualified) → dibuat STUB di schema test sebelum menjalankan 081, supaya
// CREATE POLICY resolve. Query test pakai koneksi owner (RLS tak di-FORCE) sehingga
// stub tak pernah dievaluasi — konsisten dengan integration test lain yang bypass RLS.

const BASE_SUBSET = [
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
  '056_kasbon_scope_optional.sql',
]

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../../../db/migrations')
const backfillSql = readFileSync(join(MIGRATIONS_DIR, '082_backfill_kasbon_workflow.sql'), 'utf-8')

// Query rekonsiliasi kanonik — dipakai test DAN bukti pasca-backfill di dev DB.
// Menemukan kasbon tanpa instance (missing) ATAU dengan state tak cocok (mismatch).
const RECONCILE_SQL = `
  SELECT k.id, k.status::text AS kasbon_status, wi.current_state,
         CASE WHEN wi.id IS NULL THEN 'missing_instance' ELSE 'state_mismatch' END AS problem
  FROM kasbons k
  LEFT JOIN workflow_instances wi
    ON wi.entity_type = 'kasbon' AND wi.entity_id = k.id
  WHERE wi.id IS NULL OR wi.current_state <> k.status::text`

async function insertKasbon(client: Client, ctx: SeedProjectContext, status: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO kasbons (project_id, work_scope_id, amount, fund_source, purpose, requested_by, status)
     VALUES ($1, $2, 100000, 'owner_advance', 'operasional', $3, $4::kasbon_status) RETURNING id`,
    [ctx.projectId, ctx.workScopeId, ctx.mandorId, status],
  )
  return rows[0].id
}

describe('backfill kasbon → workflow_instances (integration)', () => {
  let client: Client
  let ctx: SeedProjectContext

  beforeAll(async () => {
    await resetTestSchema()
    client = await createTestClient()
    await client.query('SET client_min_messages TO WARNING')
    await runMigrations(client, BASE_SUBSET)
    // Stub fungsi RLS agar CREATE POLICY di 081 resolve (tak dievaluasi saat query owner).
    await client.query(`CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
    await client.query(`CREATE OR REPLACE FUNCTION auth_user_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$`)
    await runMigrations(client, ['081_workflow_foundation.sql'])
    ctx = await seedProjectContext(client)
  }, 60_000)

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('backfill: setiap kasbon dapat TEPAT SATU instance dengan state cocok', async () => {
    // Seed kasbon dengan semua status yang mungkin (termasuk settled yang tak punya code path).
    await insertKasbon(client, ctx, 'pending')
    await insertKasbon(client, ctx, 'approved')
    await insertKasbon(client, ctx, 'rejected')
    await insertKasbon(client, ctx, 'settled')

    await client.query(backfillSql)

    const kasbonCount = Number((await client.query('SELECT count(*)::int n FROM kasbons')).rows[0].n)
    const instCount = Number((await client.query(
      `SELECT count(*)::int n FROM workflow_instances WHERE entity_type='kasbon'`)).rows[0].n)
    expect(instCount).toBe(kasbonCount)

    // Rekonsiliasi bersih: nol ketidakcocokan.
    const recon = await client.query(RECONCILE_SQL)
    expect(recon.rows).toHaveLength(0)

    // TEPAT SATU instance per kasbon (tak ada duplikat).
    const dup = await client.query(
      `SELECT entity_id, count(*) c FROM workflow_instances WHERE entity_type='kasbon' GROUP BY entity_id HAVING count(*) > 1`)
    expect(dup.rows).toHaveLength(0)
  })

  it('IDEMPOTEN: jalankan backfill lagi → jumlah instance tetap, nol duplikat', async () => {
    const before = Number((await client.query(
      `SELECT count(*)::int n FROM workflow_instances WHERE entity_type='kasbon'`)).rows[0].n)
    await client.query(backfillSql)   // run kedua
    await client.query(backfillSql)   // run ketiga
    const after = Number((await client.query(
      `SELECT count(*)::int n FROM workflow_instances WHERE entity_type='kasbon'`)).rows[0].n)
    expect(after).toBe(before)
    const recon = await client.query(RECONCILE_SQL)
    expect(recon.rows).toHaveLength(0)
  })

  it('DIVERGENSI terdeteksi: ubah status kasbon langsung (tanpa dual-write) → reconcile menangkap', async () => {
    const id = await insertKasbon(client, ctx, 'pending')
    await client.query(backfillSql) // instance = pending
    // Simulasikan drift: status berubah tapi workflow_instance tidak (dual-write terlewat).
    await client.query(`UPDATE kasbons SET status='approved'::kasbon_status WHERE id=$1`, [id])
    const recon = await client.query(RECONCILE_SQL)
    const row = recon.rows.find(r => r.id === id)
    expect(row).toBeDefined()
    expect(row.problem).toBe('state_mismatch')
    expect(row.kasbon_status).toBe('approved')
    expect(row.current_state).toBe('pending')
  })

  it('MISSING terdeteksi: kasbon baru tanpa backfill/dual-write → reconcile menandai missing_instance', async () => {
    const id = await insertKasbon(client, ctx, 'pending')
    // sengaja TIDAK backfill
    const recon = await client.query(RECONCILE_SQL)
    const row = recon.rows.find(r => r.id === id)
    expect(row).toBeDefined()
    expect(row.problem).toBe('missing_instance')
    expect(row.current_state).toBeNull()
    // bersihkan agar tak mengganggu assertion test lain
    await client.query(backfillSql)
  })

  it('FAIL-LOUD: status enum baru yang tak terpetakan → backfill RAISE, bukan default diam-diam (R7)', async () => {
    // Tambah nilai enum baru di schema test (isolasi test.kasbon_status), lalu buat
    // kasbon dgn status itu → backfill harus BERHENTI keras.
    await client.query(`ALTER TYPE kasbon_status ADD VALUE IF NOT EXISTS 'void_test'`)
    await insertKasbon(client, ctx, 'void_test')
    await expect(client.query(backfillSql)).rejects.toThrow(/tak dikenal|DIBATALKAN/)
  })
})
