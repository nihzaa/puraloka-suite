import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 2 — Productivity Library (migration 105).
//
// Aggregate Root = kombinasi (resource × cost_code × versi) (`44` §6). Domain
// pertama yang merujuk DUA Shared Kernel Milestone 1. Terhadap Postgres NYATA di
// schema `test`, migration verbatim — `public`/dev tidak disentuh.
//
// Invariant: tiap record adalah FAKTA immutable per versi. Perbaikan = versi baru,
// bukan edit di tempat — kalau bisa diedit, Variance Analysis kehilangan basisnya.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string
let resourceId: string
let costCodeId: string

async function newRecord(over: Record<string, unknown> = {}): Promise<string> {
  const cols = {
    resource_id: resourceId, cost_code_id: costCodeId, version_number: 1,
    productivity_value: 0.5, source: 'national_bootstrap', created_by: userId, ...over,
  }
  const keys = Object.keys(cols)
  const { rows } = await client.query(
    `INSERT INTO productivity_records (${keys.join(',')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    keys.map(k => (cols as Record<string, unknown>)[k]),
  )
  return rows[0].id
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, [
    '102_cecep_cost_code_registry.sql',
    '103_cecep_resource_registry.sql',
    '105_cecep_productivity_library.sql',
  ])

  const { rows: u } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('prod-uji@puraloka.test', 'Uji Prod', 'admin') RETURNING id`)
  userId = u[0].id
  const { rows: r } = await client.query(
    `INSERT INTO resources (code, name, category, created_by) VALUES ('RBS-TKB', 'Tukang Besi', 'labor', $1) RETURNING id`,
    [userId])
  resourceId = r[0].id
  const { rows: c } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-PEMBESIAN', 'Pembesian', $1) RETURNING id`,
    [userId])
  costCodeId = c[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Productivity Record — kombinasi resource × cost_code × versi', () => {
  it('record baru merujuk resource + cost_code (dua Shared Kernel)', async () => {
    const id = await newRecord()
    const { rows } = await client.query(
      `SELECT resource_id, cost_code_id, productivity_value::float8 AS v FROM productivity_records WHERE id = $1`, [id])
    expect(rows[0].resource_id).toBe(resourceId)
    expect(rows[0].cost_code_id).toBe(costCodeId)
    expect(rows[0].v).toBe(0.5)
  }, 30_000)

  it('resource_id / cost_code_id WAJIB referensi yang ada (FK ditegakkan)', async () => {
    await expect(newRecord({ resource_id: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toThrow(/foreign key|violates/i)
    await expect(newRecord({ cost_code_id: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toThrow(/foreign key|violates/i)
  }, 30_000)

  it('produktivitas <= 0 ditolak', async () => {
    await expect(newRecord({ productivity_value: 0 })).rejects.toThrow(/productivity_value|check/i)
  }, 30_000)

  it('source di luar bootstrap/baseline/variance ditolak', async () => {
    await expect(newRecord({ source: 'tebakan' })).rejects.toThrow(/source|check/i)
  }, 30_000)

  it('identitas (resource,cost_code,versi) UNIK — versi kembar ditolak', async () => {
    await newRecord({ version_number: 5 })
    await expect(newRecord({ version_number: 5 })).rejects.toThrow(/productivity_identity|unique|duplicate/i)
  }, 30_000)

  it('perbedaan produktivitas per pekerjaan tertangkap: resource sama, cost_code beda', async () => {
    // Tukang Besi untuk pembesian vs bekisting — inti alasan AR = kombinasi
    const { rows: cc2 } = await client.query(
      `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-BEKISTING', 'Bekisting', $1) RETURNING id`, [userId])
    const a = await newRecord({ cost_code_id: costCodeId, productivity_value: 0.5, version_number: 10 })
    const b = await newRecord({ cost_code_id: cc2[0].id, productivity_value: 0.8, version_number: 10 })
    expect(a).not.toBe(b) // dua record berbeda, bukan tabrakan identitas
  }, 30_000)
})

describe('Versioning: bootstrap → baseline → variance (versi baru, bukan edit)', () => {
  it('beberapa versi hidup berdampingan untuk kombinasi yang sama', async () => {
    const { rows: r2 } = await client.query(
      `INSERT INTO resources (code, name, category, created_by) VALUES ('RBS-V', 'V', 'labor', $1) RETURNING id`, [userId])
    const rid = r2[0].id
    await newRecord({ resource_id: rid, version_number: 1, productivity_value: 0.5, source: 'national_bootstrap' })
    await newRecord({ resource_id: rid, version_number: 2, productivity_value: 0.45, source: 'company_baseline' })
    await newRecord({ resource_id: rid, version_number: 3, productivity_value: 0.42, source: 'variance' })
    const { rows } = await client.query(
      `SELECT version_number, productivity_value::float8 AS v, source FROM productivity_records
        WHERE resource_id = $1 ORDER BY version_number`, [rid])
    expect(rows.map((r: {v:number}) => r.v)).toEqual([0.5, 0.45, 0.42])
    expect(rows.map((r: {source:string}) => r.source)).toEqual(['national_bootstrap', 'company_baseline', 'variance'])
  }, 30_000)
})

describe('HARD GUARD: Productivity Record immutable', () => {
  it('mengubah productivity_value DITOLAK (fakta historis)', async () => {
    const id = await newRecord({ version_number: 20, productivity_value: 0.5 })
    await expect(client.query(`UPDATE productivity_records SET productivity_value = 0.99 WHERE id = $1`, [id]))
      .rejects.toThrow(/immutable|versi baru/i)
    const { rows } = await client.query(`SELECT productivity_value::float8 AS v FROM productivity_records WHERE id = $1`, [id])
    expect(rows[0].v).toBe(0.5)
  }, 30_000)

  it('mengubah source atau version DITOLAK', async () => {
    const id = await newRecord({ version_number: 21 })
    await expect(client.query(`UPDATE productivity_records SET source = 'variance' WHERE id = $1`, [id]))
      .rejects.toThrow(/immutable/i)
  }, 30_000)
})

describe('HARD GUARD: Productivity Record tidak boleh dihapus', () => {
  it('DELETE satu record DITOLAK', async () => {
    const id = await newRecord({ version_number: 30 })
    await expect(client.query(`DELETE FROM productivity_records WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)

  it('DELETE massal (tanpa WHERE) DITOLAK', async () => {
    const before = await client.query(`SELECT COUNT(*)::int AS n FROM productivity_records`)
    await expect(client.query(`DELETE FROM productivity_records`)).rejects.toThrow(/tidak boleh dihapus/i)
    const after = await client.query(`SELECT COUNT(*)::int AS n FROM productivity_records`)
    expect(after.rows[0].n).toBe(before.rows[0].n)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:productivity:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:productivity:manage']).toEqual(['admin'])
    expect(byKey['cecep:productivity:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
