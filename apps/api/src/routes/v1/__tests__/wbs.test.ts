import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 3 — WBS / Work Breakdown Structure (migration 109).
//
// WBS Node = child dari Aggregate Project (`03b` §A.1), lensa Planning ("kapan &
// di mana"), paralel dengan CBS (Cost), bertemu di Cost Code. Terhadap Postgres
// NYATA di schema `test`, migration verbatim.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '003_projects_and_contracts.sql',
]

let client: Client
let userId: string
let projectId: string
let project2Id: string
let costCodeId: string

async function newNode(pid: string, name: string, over: Record<string, unknown> = {}): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO wbs_nodes (project_id, name, parent_id, cost_code_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [pid, name, over.parent_id ?? null, over.cost_code_id ?? null])
  return rows[0].id
}

const setStatus = (id: string, status: string) =>
  client.query(`UPDATE wbs_nodes SET status = $1 WHERE id = $2`, [status, id])

const read = async (id: string) => {
  const { rows } = await client.query(`SELECT status, baselined_at FROM wbs_nodes WHERE id = $1`, [id])
  return rows[0] as { status: string; baselined_at: Date | null }
}

async function seedProject(name: string): Promise<string> {
  const { rows: cl } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('C', '08', $1) RETURNING id`, [userId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, $3, 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [cl[0].id, userId, name])
  return pr[0].id
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, ['102_cecep_cost_code_registry.sql', '109_cecep_wbs.sql'])

  const { rows: u } = await client.query(
    `INSERT INTO users (name, email, role) VALUES ('Uji WBS', 'wbs-uji@puraloka.test', 'admin') RETURNING id`)
  userId = u[0].id
  projectId = await seedProject('Proyek WBS')
  project2Id = await seedProject('Proyek WBS 2')
  const { rows: c } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-WBS', 'Pekerjaan', $1) RETURNING id`, [userId])
  costCodeId = c[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('WBS Node — hierarki milik Project', () => {
  it('node akar + anak; anak menunjuk parent + cost_code', async () => {
    const root = await newNode(projectId, 'Fase 1')
    const child = await newNode(projectId, 'Galian', { parent_id: root, cost_code_id: costCodeId })
    const { rows } = await client.query(`SELECT parent_id, cost_code_id, status FROM wbs_nodes WHERE id = $1`, [child])
    expect(rows[0].parent_id).toBe(root)
    expect(rows[0].cost_code_id).toBe(costCodeId)
    expect(rows[0].status).toBe('draft')
  }, 30_000)

  it('node tak boleh jadi parent dirinya sendiri', async () => {
    const n = await newNode(projectId, 'X')
    await expect(client.query(`UPDATE wbs_nodes SET parent_id = id WHERE id = $1`, [n]))
      .rejects.toThrow(/not_self_parent|check/i)
  }, 30_000)

  it('parent WAJIB di Project yang sama', async () => {
    const n1 = await newNode(projectId, 'di P1')
    await expect(newNode(project2Id, 'di P2', { parent_id: n1 }))
      .rejects.toThrow(/Project yang sama|hierarki/i)
  }, 30_000)

  it('menghapus project ikut menghapus WBS node (CASCADE)', async () => {
    const pid = await seedProject('Proyek Hapus')
    await newNode(pid, 'akan hilang')
    await client.query(`DELETE FROM projects WHERE id = $1`, [pid])
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM wbs_nodes WHERE project_id = $1`, [pid])
    expect(rows[0].n).toBe(0)
  }, 30_000)

  it('cost_code_id opsional (node pengelompok boleh tanpa)', async () => {
    const n = await newNode(projectId, 'Fase tanpa cost code')
    const { rows } = await client.query(`SELECT cost_code_id FROM wbs_nodes WHERE id = $1`, [n])
    expect(rows[0].cost_code_id).toBeNull()
  }, 30_000)
})

describe('Lifecycle draft → baseline → revised (+ re-baseline)', () => {
  it('draft → baseline: baselined_at terisi (WbsNodeBaselined)', async () => {
    const n = await newNode(projectId, 'Baseline test')
    await setStatus(n, 'baseline')
    expect((await read(n)).baselined_at).not.toBeNull()
  }, 30_000)

  it('baseline → revised → baseline (re-baseline diizinkan — planning berulang)', async () => {
    const n = await newNode(projectId, 'Re-baseline')
    await setStatus(n, 'baseline')
    await setStatus(n, 'revised')
    await setStatus(n, 'baseline')
    expect((await read(n)).status).toBe('baseline')
  }, 30_000)

  it('NEGATIF: baseline → draft DITOLAK (sudah jadi acuan)', async () => {
    const n = await newNode(projectId, 'No back to draft')
    await setStatus(n, 'baseline')
    await expect(setStatus(n, 'draft')).rejects.toThrow(/tidak bisa kembali ke draft|check/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:wbs:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:wbs:manage']).toEqual(['admin'])
    expect(byKey['cecep:wbs:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
