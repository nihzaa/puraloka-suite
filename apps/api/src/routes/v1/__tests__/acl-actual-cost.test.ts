import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 4 — ACL Actual Cost (migration 112). Tabel translasi
// category_id ↔ cost_code_id. Terhadap Postgres NYATA di schema `test`.
//
// Yang dikunci: integritas FK (category & cost_code harus ada), resolusi
// deterministik (satu category → tepat satu cost code, UNIQUE), rollup (banyak
// category → satu cost code diizinkan).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '003_projects_and_contracts.sql',
  '004_expense_categories.sql',
]

let client: Client
let userId: string
let projectId: string
let catA: string
let catB: string
let costCode1: string
let costCode2: string

const map = (categoryId: string, costCodeId: string) =>
  client.query(
    `INSERT INTO cost_code_category_map (category_id, cost_code_id, created_by) VALUES ($1,$2,$3) RETURNING id`,
    [categoryId, costCodeId, userId])

async function newCategory(name: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO project_expense_categories (project_id, name, type) VALUES ($1,$2,'material') RETURNING id`,
    [projectId, name])
  return rows[0].id
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, ['102_cecep_cost_code_registry.sql', '112_cecep_acl_actual_cost.sql'])

  const { rows: u } = await client.query(
    `INSERT INTO users (name, email, role) VALUES ('Uji ACL', 'acl-uji@puraloka.test', 'admin') RETURNING id`)
  userId = u[0].id
  const { rows: cl } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('C','08',$1) RETURNING id`, [userId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1,$2,'Proyek ACL','Bandung',CURRENT_DATE,CURRENT_DATE+30,$2) RETURNING id`, [cl[0].id, userId])
  projectId = pr[0].id
  catA = await newCategory('Material Besi')
  catB = await newCategory('Material Semen')
  const { rows: c1 } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-BESI','Pembesian',$1) RETURNING id`, [userId])
  costCode1 = c1[0].id
  const { rows: c2 } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-BETON','Pengecoran',$1) RETURNING id`, [userId])
  costCode2 = c2[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('ACL — translasi category → cost code', () => {
  it('mapping valid tersimpan; resolusi mengembalikan cost code', async () => {
    await map(catA, costCode1)
    const { rows } = await client.query(
      `SELECT cost_code_id FROM cost_code_category_map WHERE category_id = $1`, [catA])
    expect(rows[0].cost_code_id).toBe(costCode1)
  }, 30_000)

  it('category_id UNIK — satu category tak boleh dua mapping (resolusi deterministik)', async () => {
    const { rows: cat } = await client.query(
      `INSERT INTO project_expense_categories (project_id, name, type) VALUES ($1,'Dup','material') RETURNING id`, [projectId])
    await map(cat[0].id, costCode1)
    await expect(map(cat[0].id, costCode2)).rejects.toThrow(/unique|duplicate|cost_code_category_map_category_id/i)
  }, 30_000)

  it('BANYAK category → cost code yang SAMA diizinkan (rollup)', async () => {
    await map(catB, costCode1) // catA sudah → costCode1 di test pertama; catB juga → costCode1
    const { rows } = await client.query(
      `SELECT COUNT(*)::int n FROM cost_code_category_map WHERE cost_code_id = $1`, [costCode1])
    expect(rows[0].n).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('category_id tak dikenal ditolak (FK)', async () => {
    await expect(map('00000000-0000-0000-0000-000000000000', costCode1))
      .rejects.toThrow(/foreign key|violates/i)
  }, 30_000)

  it('cost_code_id tak dikenal ditolak (FK)', async () => {
    const { rows: cat } = await client.query(
      `INSERT INTO project_expense_categories (project_id, name, type) VALUES ($1,'X','material') RETURNING id`, [projectId])
    await expect(map(cat[0].id, '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(/foreign key|violates/i)
  }, 30_000)

  it('menghapus kategori existing ikut menghapus mapping-nya (CASCADE, tak sentuh cost code)', async () => {
    const { rows: cat } = await client.query(
      `INSERT INTO project_expense_categories (project_id, name, type) VALUES ($1,'Hapus','material') RETURNING id`, [projectId])
    await map(cat[0].id, costCode2)
    await client.query(`DELETE FROM project_expense_categories WHERE id = $1`, [cat[0].id])
    const { rows: m } = await client.query(`SELECT COUNT(*)::int n FROM cost_code_category_map WHERE category_id = $1`, [cat[0].id])
    expect(m[0].n).toBe(0)
    // cost code tetap ada (ACL read-only, tak merusak CECEP)
    const { rows: cc } = await client.query(`SELECT COUNT(*)::int n FROM cost_codes WHERE id = $1`, [costCode2])
    expect(cc[0].n).toBe(1)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:cost_map:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:cost_map:manage']).toEqual(['admin'])
    expect(byKey['cecep:cost_map:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
