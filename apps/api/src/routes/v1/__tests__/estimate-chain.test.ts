import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 3 — Estimate Aggregate Chain (migration 110):
// Scenario → Estimate Version → Estimate Item. Terhadap Postgres NYATA di `test`.
//
// LINGKUP struktur (bukan alur approval). Yang diuji:
//   - Estimate Item = pertemuan Cost Code+Assembly+CBS+WBS (child of Version).
//   - Invariant "perubahan Item lewat Version": begitu Version ≠ draft, item beku.
//   - total & identitas Version beku begitu ≠ draft (angka disetujui tak retroaktif).
// Alur SIAPA-boleh-approve TIDAK diuji di sini (belum di-wire — discovery step 2).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '003_projects_and_contracts.sql',
]

let client: Client
let userId: string
let projectId: string
let costCodeId: string

async function seedProject(): Promise<string> {
  const { rows: cl } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('C', '08', $1) RETURNING id`, [userId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, 'Proyek Est', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [cl[0].id, userId])
  return pr[0].id
}
const newScenario = async (over: Record<string, unknown> = {}): Promise<string> => {
  const { rows } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [over.project_id ?? projectId, over.name ?? 'Skenario A', userId])
  return rows[0].id
}
const newVersion = async (scenarioId: string, over: Record<string, unknown> = {}): Promise<string> => {
  const { rows } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [scenarioId, over.version_number ?? 1, over.total_amount ?? 0, userId])
  return rows[0].id
}
const addItem = (versionId: string, over: Record<string, unknown> = {}) => {
  // 'cost_code_id' in over → hormati nilai eksplisit (termasuk null) untuk uji NOT NULL
  const cc = 'cost_code_id' in over ? over.cost_code_id : costCodeId
  return client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [versionId, cc, over.quantity ?? 10, over.amount ?? 1000000])
}
const setVStatus = (id: string, status: string) =>
  client.query(`UPDATE estimate_versions SET status = $1 WHERE id = $2`, [status, id])

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, [
    '102_cecep_cost_code_registry.sql', '103_cecep_resource_registry.sql',
    '107_cecep_assembly.sql', '108_cecep_cbs.sql', '109_cecep_wbs.sql',
    '110_cecep_estimate_chain.sql',
  ])
  const { rows: u } = await client.query(
    `INSERT INTO users (name, email, role) VALUES ('Uji Est', 'est-uji@puraloka.test', 'admin') RETURNING id`)
  userId = u[0].id
  projectId = await seedProject()
  const { rows: c } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-EST', 'Pekerjaan', $1) RETURNING id`, [userId])
  costCodeId = c[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Scenario — wadah perbandingan', () => {
  it('scenario baru = active; lifecycle active→branched→archived', async () => {
    const s = await newScenario()
    await client.query(`UPDATE scenarios SET status = 'branched' WHERE id = $1`, [s])
    await client.query(`UPDATE scenarios SET status = 'archived' WHERE id = $1`, [s])
    const { rows } = await client.query(`SELECT status FROM scenarios WHERE id = $1`, [s])
    expect(rows[0].status).toBe('archived')
  }, 30_000)

  it('NEGATIF: archived → active ditolak', async () => {
    const s = await newScenario()
    await client.query(`UPDATE scenarios SET status = 'archived' WHERE id = $1`, [s])
    await expect(client.query(`UPDATE scenarios SET status = 'active' WHERE id = $1`, [s]))
      .rejects.toThrow(/tidak sah/)
  }, 30_000)
})

describe('Estimate Item — pertemuan 4 domain', () => {
  it('cost_code WAJIB; assembly/cbs/wbs opsional', async () => {
    const v = await newVersion(await newScenario())
    const { rows } = await addItem(v)
    const { rows: it } = await client.query(
      `SELECT cost_code_id, assembly_id, cbs_node_id, wbs_node_id FROM estimate_items WHERE id = $1`, [rows[0].id])
    expect(it[0].cost_code_id).toBe(costCodeId)
    expect(it[0].assembly_id).toBeNull()
  }, 30_000)

  it('cost_code_id tak boleh null', async () => {
    const v = await newVersion(await newScenario())
    await expect(addItem(v, { cost_code_id: null })).rejects.toThrow(/cost_code_id|null/i)
  }, 30_000)

  it('identitas Version (scenario, versi) UNIK', async () => {
    const s = await newScenario()
    await newVersion(s, { version_number: 1 })
    await expect(newVersion(s, { version_number: 1 }))
      .rejects.toThrow(/estimate_version_identity|unique|duplicate/i)
  }, 30_000)

  it('menghapus Version draft ikut menghapus item (CASCADE)', async () => {
    const v = await newVersion(await newScenario())
    await addItem(v)
    await client.query(`DELETE FROM estimate_versions WHERE id = $1`, [v])
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM estimate_items WHERE estimate_version_id = $1`, [v])
    expect(rows[0].n).toBe(0)
  }, 30_000)
})

describe('Lifecycle Estimate Version (struktural, maju saja)', () => {
  it('draft→under_review→approved→frozen: cap waktu terisi', async () => {
    const v = await newVersion(await newScenario())
    await setVStatus(v, 'under_review')
    await client.query(`UPDATE estimate_versions SET approved_by = $1 WHERE id = $2`, [userId, v])
    await setVStatus(v, 'approved')
    await setVStatus(v, 'frozen')
    const { rows } = await client.query(`SELECT status, approved_at, frozen_at FROM estimate_versions WHERE id = $1`, [v])
    expect(rows[0].status).toBe('frozen')
    expect(rows[0].approved_at).not.toBeNull()
    expect(rows[0].frozen_at).not.toBeNull()
  }, 30_000)

  it('NEGATIF: draft → approved (lompat review) ditolak', async () => {
    const v = await newVersion(await newScenario())
    await expect(setVStatus(v, 'approved')).rejects.toThrow(/tidak sah/)
  }, 30_000)

  it('NEGATIF: approved → draft (mundur) ditolak', async () => {
    const v = await newVersion(await newScenario())
    await setVStatus(v, 'under_review'); await setVStatus(v, 'approved')
    await expect(setVStatus(v, 'draft')).rejects.toThrow(/tidak sah/)
  }, 30_000)
})

describe('HARD GUARD: angka beku begitu Version keluar dari draft', () => {
  it('mengubah total_amount SETELAH under_review DITOLAK', async () => {
    const v = await newVersion(await newScenario(), { total_amount: 5000000 })
    await setVStatus(v, 'under_review')
    await expect(client.query(`UPDATE estimate_versions SET total_amount = 9 WHERE id = $1`, [v]))
      .rejects.toThrow(/beku|tak boleh berubah|check_violation/i)
  }, 30_000)

  it('menambah item SETELAH under_review DITOLAK (perubahan lewat Version)', async () => {
    const v = await newVersion(await newScenario())
    await addItem(v)
    await setVStatus(v, 'under_review')
    await expect(addItem(v)).rejects.toThrow(/hanya bisa diubah saat.*draft|check_violation/i)
  }, 30_000)

  it('mengubah item saat Version DRAFT diperbolehkan', async () => {
    const v = await newVersion(await newScenario())
    const { rows } = await addItem(v, { amount: 1000 })
    await client.query(`UPDATE estimate_items SET amount = 2000 WHERE id = $1`, [rows[0].id])
    const { rows: chk } = await client.query(`SELECT amount::float8 AS a FROM estimate_items WHERE id = $1`, [rows[0].id])
    expect(chk[0].a).toBe(2000)
  }, 30_000)

  it('DELETE Version non-draft DITOLAK', async () => {
    const v = await newVersion(await newScenario())
    await setVStatus(v, 'under_review')
    await expect(client.query(`DELETE FROM estimate_versions WHERE id = $1`, [v]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('manage: admin + pm (pm menyusun draft); view: admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:estimate:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:estimate:manage'].sort()).toEqual(['admin', 'pm'])
    expect(byKey['cecep:estimate:view'].sort()).toEqual(['admin', 'pm'])
  }, 30_000)
})
