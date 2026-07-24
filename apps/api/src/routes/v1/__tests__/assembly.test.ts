import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 2 — Assembly / AHSP (migration 107), domain terakhir M2.
//
// Aggregate Root Assembly (parent) + assembly_components (resource requirement
// lines). Terhadap Postgres NYATA di schema `test`, migration verbatim.
//
// Invariant "berubah BERSAMA sebagai satu paket": begitu Assembly active, seluruh
// paket (parent + komponen) beku; revisi = versi baru.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string
let costCodeId: string
let resourceId: string
let resource2Id: string

async function newAssembly(over: Record<string, unknown> = {}): Promise<string> {
  const cols: Record<string, unknown> = {
    code: 'ASM-PEMBESIAN', name: 'Pembesian per m2', cost_code_id: costCodeId,
    source: 'company', version_number: 1, waste_factor: 0.05, created_by: userId, ...over,
  }
  const keys = Object.keys(cols)
  const { rows } = await client.query(
    `INSERT INTO assemblies (${keys.join(',')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    keys.map(k => cols[k]),
  )
  return rows[0].id
}

const addComponent = (assemblyId: string, resId: string, coef: number) =>
  client.query(
    `INSERT INTO assembly_components (assembly_id, resource_id, coefficient) VALUES ($1, $2, $3) RETURNING id`,
    [assemblyId, resId, coef])

const setStatus = (id: string, status: string) =>
  client.query(`UPDATE assemblies SET status = $1 WHERE id = $2`, [status, id])

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
    '107_cecep_assembly.sql',
  ])

  const { rows: u } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('asm-uji@puraloka.test', 'Uji Asm', 'admin') RETURNING id`)
  userId = u[0].id
  const { rows: c } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-ASM', 'Pembesian', $1) RETURNING id`, [userId])
  costCodeId = c[0].id
  const { rows: r1 } = await client.query(
    `INSERT INTO resources (code, name, category, created_by) VALUES ('RBS-TK', 'Tukang Besi', 'labor', $1) RETURNING id`, [userId])
  resourceId = r1[0].id
  const { rows: r2 } = await client.query(
    `INSERT INTO resources (code, name, category, created_by) VALUES ('RBS-BESI', 'Besi', 'material', $1) RETURNING id`, [userId])
  resource2Id = r2[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Assembly — paket metode kerja', () => {
  it('assembly baru = draft; source 4 nilai valid', async () => {
    for (const src of ['national', 'company', 'project', 'custom']) {
      const id = await newAssembly({ code: `ASM-${src}`, source: src })
      const { rows } = await client.query(`SELECT status, source FROM assemblies WHERE id = $1`, [id])
      expect(rows[0].status).toBe('draft')
      expect(rows[0].source).toBe(src)
    }
  }, 30_000)

  it('source di luar himpunan ditolak', async () => {
    await expect(newAssembly({ code: 'ASM-BAD', source: 'lokal' }))
      .rejects.toThrow(/assemblies_source_check|check/i)
  }, 30_000)

  it('cost_code_id WAJIB referensi Cost Code yang ada', async () => {
    await expect(newAssembly({ code: 'ASM-NOCC', cost_code_id: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toThrow(/foreign key|violates/i)
  }, 30_000)

  it('sequence non-array ditolak; array diterima', async () => {
    await expect(newAssembly({ code: 'ASM-SEQBAD', sequence: JSON.stringify({ x: 1 }) }))
      .rejects.toThrow(/sequence_is_array|check/i)
    const id = await newAssembly({ code: 'ASM-SEQOK', sequence: JSON.stringify(['Bekisting', 'Pembesian']) })
    const { rows } = await client.query(`SELECT sequence FROM assemblies WHERE id = $1`, [id])
    expect(rows[0].sequence).toEqual(['Bekisting', 'Pembesian'])
  }, 30_000)

  it('identitas (code, versi) UNIK', async () => {
    await newAssembly({ code: 'ASM-DUP', version_number: 1 })
    await expect(newAssembly({ code: 'ASM-DUP', version_number: 1 }))
      .rejects.toThrow(/assembly_identity|unique|duplicate/i)
  }, 30_000)
})

describe('assembly_components — resource requirement (koefisien AHSP)', () => {
  it('komponen merujuk RBS + koefisien > 0', async () => {
    const id = await newAssembly({ code: 'ASM-COMP' })
    await addComponent(id, resourceId, 0.7)   // 0.7 OH Tukang Besi
    await addComponent(id, resource2Id, 10.5) // 10.5 kg Besi
    const { rows } = await client.query(
      `SELECT coefficient::float8 AS c FROM assembly_components WHERE assembly_id = $1 ORDER BY coefficient`, [id])
    expect(rows.map((r: {c:number}) => r.c)).toEqual([0.7, 10.5])
  }, 30_000)

  it('koefisien <= 0 ditolak', async () => {
    const id = await newAssembly({ code: 'ASM-COEF0' })
    await expect(addComponent(id, resourceId, 0)).rejects.toThrow(/coefficient|check/i)
  }, 30_000)

  it('resource kembar dalam satu assembly ditolak', async () => {
    const id = await newAssembly({ code: 'ASM-DUPRES' })
    await addComponent(id, resourceId, 0.7)
    await expect(addComponent(id, resourceId, 0.8)).rejects.toThrow(/assembly_component_unik|unique|duplicate/i)
  }, 30_000)

  it('menghapus assembly draft ikut menghapus komponennya (CASCADE)', async () => {
    const id = await newAssembly({ code: 'ASM-CASCADE' })
    await addComponent(id, resourceId, 0.7)
    await client.query(`DELETE FROM assemblies WHERE id = $1`, [id])
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM assembly_components WHERE assembly_id = $1`, [id])
    expect(rows[0].n).toBe(0)
  }, 30_000)
})

describe('Lifecycle draft → active → superseded', () => {
  it('draft → active: activated_at terisi', async () => {
    const id = await newAssembly({ code: 'ASM-LIFE' })
    await setStatus(id, 'active')
    const { rows } = await client.query(`SELECT status, activated_at FROM assemblies WHERE id = $1`, [id])
    expect(rows[0].status).toBe('active')
    expect(rows[0].activated_at).not.toBeNull()
  }, 30_000)

  it('NEGATIF: draft → superseded (lompat active) ditolak', async () => {
    const id = await newAssembly({ code: 'ASM-SKIP' })
    await expect(setStatus(id, 'superseded')).rejects.toThrow(/tidak sah/)
  }, 30_000)
})

describe('HARD GUARD: paket beku begitu active', () => {
  it('mengubah waste_factor SETELAH active DITOLAK', async () => {
    const id = await newAssembly({ code: 'ASM-IMM', waste_factor: 0.05 })
    await setStatus(id, 'active')
    await expect(client.query(`UPDATE assemblies SET waste_factor = 0.1 WHERE id = $1`, [id]))
      .rejects.toThrow(/tak bisa diubah|retroaktif|check_violation/i)
  }, 30_000)

  it('menambah komponen SETELAH active DITOLAK (paket beku)', async () => {
    const id = await newAssembly({ code: 'ASM-COMPLOCK' })
    await addComponent(id, resourceId, 0.7)
    await setStatus(id, 'active')
    await expect(addComponent(id, resource2Id, 10.5))
      .rejects.toThrow(/hanya bisa diubah saat.*draft|check_violation/i)
  }, 30_000)

  it('mengubah komponen saat parent DRAFT diperbolehkan', async () => {
    const id = await newAssembly({ code: 'ASM-COMPEDIT' })
    const { rows } = await addComponent(id, resourceId, 0.7)
    const compId = rows[0].id
    await client.query(`UPDATE assembly_components SET coefficient = 0.8 WHERE id = $1`, [compId])
    const { rows: chk } = await client.query(`SELECT coefficient::float8 AS c FROM assembly_components WHERE id = $1`, [compId])
    expect(chk[0].c).toBe(0.8)
  }, 30_000)

  it('DELETE assembly active DITOLAK', async () => {
    const id = await newAssembly({ code: 'ASM-DEL' })
    await setStatus(id, 'active')
    await expect(client.query(`DELETE FROM assemblies WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:assembly:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:assembly:manage']).toEqual(['admin'])
    expect(byKey['cecep:assembly:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
