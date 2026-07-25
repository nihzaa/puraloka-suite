import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 4 — Lessons Learned STRUKTUR (migration 113). Terhadap Postgres
// NYATA di schema `test`. STRUKTUR SAJA — write-back (propagated) belum di-wire,
// dan test membuktikan transisi ke propagated MEMANG ditolak (titik STOP dijaga).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '003_projects_and_contracts.sql',
]

let client: Client
let userId: string
let projectId: string

async function newLesson(over: Record<string, unknown> = {}): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO lessons_learned_records (project_id, title, planned_amount, actual_amount, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [projectId, over.title ?? 'Lesson', over.planned_amount ?? 10_000_000, over.actual_amount ?? 12_000_000, userId])
  return rows[0].id
}
const setStatus = (id: string, s: string) =>
  client.query(`UPDATE lessons_learned_records SET status=$1 WHERE id=$2`, [s, id])

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  // 113 punya FK ke estimate_versions → butuh chain M1-M3 penuh.
  await runMigrations(client, [
    '102_cecep_cost_code_registry.sql', '103_cecep_resource_registry.sql',
    '107_cecep_assembly.sql', '108_cecep_cbs.sql', '109_cecep_wbs.sql',
    '110_cecep_estimate_chain.sql', '113_cecep_lessons_learned.sql',
  ])

  const { rows: u } = await client.query(
    `INSERT INTO users (name, email, role) VALUES ('Uji LL','ll-uji@puraloka.test','admin') RETURNING id`)
  userId = u[0].id
  const { rows: cl } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('C','08',$1) RETURNING id`, [userId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1,$2,'Proyek LL','Bandung',CURRENT_DATE,CURRENT_DATE+30,$2) RETURNING id`, [cl[0].id, userId])
  projectId = pr[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Variance = Value Object (delta dihitung DB, tak bisa bohong)', () => {
  it('variance_amount = actual - planned (GENERATED)', async () => {
    const id = await newLesson({ planned_amount: 10_000_000, actual_amount: 12_500_000 })
    const { rows } = await client.query(
      `SELECT variance_amount::float8 AS v FROM lessons_learned_records WHERE id=$1`, [id])
    expect(rows[0].v).toBe(2_500_000) // 12,5jt − 10jt (over budget)
  }, 30_000)

  it('variance negatif (under budget) juga benar', async () => {
    const id = await newLesson({ planned_amount: 10_000_000, actual_amount: 9_000_000 })
    const { rows } = await client.query(
      `SELECT variance_amount::float8 AS v FROM lessons_learned_records WHERE id=$1`, [id])
    expect(rows[0].v).toBe(-1_000_000)
  }, 30_000)

  it('variance_amount tak bisa di-set manual (GENERATED, bukan input)', async () => {
    await expect(client.query(
      `INSERT INTO lessons_learned_records (project_id, title, variance_amount, created_by) VALUES ($1,'x',999,$2)`,
      [projectId, userId])).rejects.toThrow(/generated|cannot insert/i)
  }, 30_000)
})

describe('Root Cause = child entity revisable saat draft', () => {
  it('root cause bisa ditambah & diedit saat lesson draft', async () => {
    const id = await newLesson()
    const { rows } = await client.query(
      `INSERT INTO root_cause_analyses (lesson_id, description) VALUES ($1,'estimasi terlalu optimis') RETURNING id`, [id])
    await client.query(`UPDATE root_cause_analyses SET description='harga material naik' WHERE id=$1`, [rows[0].id])
    const { rows: rc } = await client.query(`SELECT description FROM root_cause_analyses WHERE id=$1`, [rows[0].id])
    expect(rc[0].description).toBe('harga material naik')
  }, 30_000)

  it('root cause beku begitu lesson ≠ draft', async () => {
    const id = await newLesson()
    await client.query(`INSERT INTO root_cause_analyses (lesson_id, description) VALUES ($1,'awal')`, [id])
    await setStatus(id, 'under_review')
    await expect(client.query(`INSERT INTO root_cause_analyses (lesson_id, description) VALUES ($1,'baru')`, [id]))
      .rejects.toThrow(/hanya bisa diubah saat.*draft|check/i)
  }, 30_000)
})

describe('Lifecycle draft→under_review→approved (write-back BELUM aktif)', () => {
  it('draft→under_review→approved: approved_at terisi', async () => {
    const id = await newLesson()
    await setStatus(id, 'under_review')
    await setStatus(id, 'approved')
    const { rows } = await client.query(`SELECT status, approved_at FROM lessons_learned_records WHERE id=$1`, [id])
    expect(rows[0].status).toBe('approved')
    expect(rows[0].approved_at).not.toBeNull()
  }, 30_000)

  it('🛑 TITIK STOP: transisi approved→propagated DITOLAK (write-back belum di-wire)', async () => {
    const id = await newLesson()
    await setStatus(id, 'under_review'); await setStatus(id, 'approved')
    await expect(setStatus(id, 'propagated'))
      .rejects.toThrow(/propagated.*BELUM diaktifkan|write-back/i)
    expect((await client.query(`SELECT status FROM lessons_learned_records WHERE id=$1`, [id])).rows[0].status)
      .toBe('approved')
  }, 30_000)

  it('under_review→draft (reject) mengosongkan approved metadata', async () => {
    const id = await newLesson()
    await setStatus(id, 'under_review')
    await setStatus(id, 'draft')
    expect((await client.query(`SELECT status FROM lessons_learned_records WHERE id=$1`, [id])).rows[0].status).toBe('draft')
  }, 30_000)
})

describe('HARD GUARD: variance beku & no-delete non-draft', () => {
  it('mengubah planned/actual SETELAH under_review DITOLAK', async () => {
    const id = await newLesson({ planned_amount: 10_000_000, actual_amount: 11_000_000 })
    await setStatus(id, 'under_review')
    await expect(client.query(`UPDATE lessons_learned_records SET actual_amount=99 WHERE id=$1`, [id]))
      .rejects.toThrow(/beku|tak boleh berubah|check/i)
  }, 30_000)

  it('DELETE lesson non-draft DITOLAK', async () => {
    const id = await newLesson()
    await setStatus(id, 'under_review')
    await expect(client.query(`DELETE FROM lessons_learned_records WHERE id=$1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:lessons:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:lessons:manage']).toEqual(['admin'])
    expect(byKey['cecep:lessons:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
