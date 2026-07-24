import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 2 — Formula Engine / Formula Definition (migration 106).
//
// Aggregate Root = Formula Definition (Formula+Version+Variable+Parameter+
// Expression). Generik, tak bergantung domain lain — dibangun sebelum Assembly
// yang mengonsumsinya. Terhadap Postgres NYATA di schema `test`.
//
// Invariant: formula yang sudah keluar dari draft IMMUTABLE — mengubahnya = mengubah
// angka Estimate Item lama secara retroaktif.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string

async function newFormula(over: Record<string, unknown> = {}): Promise<string> {
  const cols: Record<string, unknown> = {
    code: 'F-WASTE', name: 'Waste Factor', version_number: 1,
    expression: 'qty * (1 + waste)', created_by: userId, ...over,
  }
  const keys = Object.keys(cols)
  const { rows } = await client.query(
    `INSERT INTO formula_definitions (${keys.join(',')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    keys.map(k => cols[k]),
  )
  return rows[0].id
}

const setStatus = (id: string, status: string) =>
  client.query(`UPDATE formula_definitions SET status = $1 WHERE id = $2`, [status, id])

const read = async (id: string) => {
  const { rows } = await client.query(
    `SELECT status, expression, tested_at, activated_at FROM formula_definitions WHERE id = $1`, [id])
  return rows[0] as { status: string; expression: string; tested_at: Date | null; activated_at: Date | null }
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, ['106_cecep_formula_definitions.sql'])
  const { rows } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('formula-uji@puraloka.test', 'Uji Formula', 'admin') RETURNING id`)
  userId = rows[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Formula Definition — struktur', () => {
  it('formula baru berstatus draft; variables/parameters default array kosong', async () => {
    const id = await newFormula({ code: 'F-A' })
    const { rows } = await client.query(
      `SELECT status, variables, parameters FROM formula_definitions WHERE id = $1`, [id])
    expect(rows[0].status).toBe('draft')
    expect(rows[0].variables).toEqual([])
    expect(rows[0].parameters).toEqual([])
  }, 30_000)

  it('variables/parameters menerima JSON array', async () => {
    const id = await newFormula({
      code: 'F-B',
      variables: JSON.stringify([{ name: 'qty' }]),
      parameters: JSON.stringify([{ name: 'waste', default: 0.05 }]),
    })
    const { rows } = await client.query(`SELECT variables, parameters FROM formula_definitions WHERE id = $1`, [id])
    expect(rows[0].variables).toEqual([{ name: 'qty' }])
    expect(rows[0].parameters).toEqual([{ name: 'waste', default: 0.05 }])
  }, 30_000)

  it('variables non-array (objek) ditolak', async () => {
    await expect(newFormula({ code: 'F-C', variables: JSON.stringify({ not: 'array' }) }))
      .rejects.toThrow(/variables_is_array|check/i)
  }, 30_000)

  it('identitas (code, versi) UNIK', async () => {
    await newFormula({ code: 'F-DUP', version_number: 1 })
    await expect(newFormula({ code: 'F-DUP', version_number: 1 }))
      .rejects.toThrow(/formula_identity|unique|duplicate/i)
  }, 30_000)
})

describe('Lifecycle draft → tested → active → superseded', () => {
  it('draft → tested → active: cap waktu terisi otomatis', async () => {
    const id = await newFormula({ code: 'F-LIFE' })
    await setStatus(id, 'tested')
    expect((await read(id)).tested_at, 'tested_at harus tercap').not.toBeNull()
    await setStatus(id, 'active')
    const row = await read(id)
    expect(row.status).toBe('active')
    expect(row.activated_at, 'FormulaActivated harus tercap').not.toBeNull()
  }, 30_000)

  it('rantai sampai superseded jalan', async () => {
    const id = await newFormula({ code: 'F-SUP' })
    await setStatus(id, 'tested'); await setStatus(id, 'active'); await setStatus(id, 'superseded')
    expect((await read(id)).status).toBe('superseded')
  }, 30_000)

  it('NEGATIF: draft → active (lompat tested) ditolak', async () => {
    const id = await newFormula({ code: 'F-SKIP' })
    await expect(setStatus(id, 'active')).rejects.toThrow(/tidak sah/)
  }, 30_000)

  it('NEGATIF: active → draft (mundur) ditolak', async () => {
    const id = await newFormula({ code: 'F-BACK' })
    await setStatus(id, 'tested'); await setStatus(id, 'active')
    await expect(setStatus(id, 'draft')).rejects.toThrow(/tidak sah/)
  }, 30_000)
})

describe('HARD GUARD: immutable begitu keluar dari draft', () => {
  it('mengubah expression SETELAH tested DITOLAK', async () => {
    const id = await newFormula({ code: 'F-IMM', expression: 'a + b' })
    await setStatus(id, 'tested')
    await expect(client.query(`UPDATE formula_definitions SET expression = 'a * b' WHERE id = $1`, [id]))
      .rejects.toThrow(/tak bisa diubah|retroaktif|check_violation/i)
    expect((await read(id)).expression).toBe('a + b')
  }, 30_000)

  it('mengubah expression saat draft diperbolehkan', async () => {
    const id = await newFormula({ code: 'F-EDIT', expression: 'a + b' })
    await client.query(`UPDATE formula_definitions SET expression = 'a - b' WHERE id = $1`, [id])
    expect((await read(id)).expression).toBe('a - b')
  }, 30_000)
})

describe('HARD GUARD: formula non-draft tidak boleh dihapus', () => {
  it('DELETE formula active DITOLAK', async () => {
    const id = await newFormula({ code: 'F-DEL' })
    await setStatus(id, 'tested'); await setStatus(id, 'active')
    await expect(client.query(`DELETE FROM formula_definitions WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)

  it('DELETE formula draft diperbolehkan', async () => {
    const id = await newFormula({ code: 'F-DELDRAFT' })
    await client.query(`DELETE FROM formula_definitions WHERE id = $1`, [id])
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM formula_definitions WHERE id = $1`, [id])
    expect(rows[0].n).toBe(0)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:formula:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:formula:manage']).toEqual(['admin'])
    expect(byKey['cecep:formula:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
