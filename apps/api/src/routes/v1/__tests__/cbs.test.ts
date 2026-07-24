import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 2 — CBS / Cost Breakdown Structure (migration 108). Menutup M2.
//
// Company CBS Template (parent) + cbs_nodes (hierarki kategori biaya). Terhadap
// Postgres NYATA di schema `test`.
//
// Dua keputusan founder yang diuji di sini:
//   1. versioning immutable-per-versi (pola Price Book) — template active beku.
//   2. source label (standard/company/project) — bukan FK Reference Library.
// Plus: hierarki (parent_id) yang di-EXCLUDE dari Cost Code kini ada di sini.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string
let costCodeId: string

async function newTemplate(over: Record<string, unknown> = {}): Promise<string> {
  const cols: Record<string, unknown> = {
    code: 'CBS-BUILDING', name: 'CBS Gedung', source: 'company', version_number: 1, created_by: userId, ...over,
  }
  const keys = Object.keys(cols)
  const { rows } = await client.query(
    `INSERT INTO cbs_templates (${keys.join(',')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    keys.map(k => cols[k]),
  )
  return rows[0].id
}

const addNode = (templateId: string, name: string, over: Record<string, unknown> = {}) =>
  client.query(
    `INSERT INTO cbs_nodes (template_id, name, parent_id, cost_code_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [templateId, name, over.parent_id ?? null, over.cost_code_id ?? null])

const setStatus = (id: string, status: string) =>
  client.query(`UPDATE cbs_templates SET status = $1 WHERE id = $2`, [status, id])

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, ['102_cecep_cost_code_registry.sql', '108_cecep_cbs.sql'])

  const { rows: u } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('cbs-uji@puraloka.test', 'Uji CBS', 'admin') RETURNING id`)
  userId = u[0].id
  const { rows: c } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-CBS', 'Struktur', $1) RETURNING id`, [userId])
  costCodeId = c[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('CBS Template — source & identitas', () => {
  it('template baru = draft; source 3 nilai valid (standard/company/project)', async () => {
    for (const src of ['standard', 'company', 'project']) {
      const id = await newTemplate({ code: `CBS-${src}`, source: src })
      const { rows } = await client.query(`SELECT status, source FROM cbs_templates WHERE id = $1`, [id])
      expect(rows[0].status).toBe('draft')
      expect(rows[0].source).toBe(src)
    }
  }, 30_000)

  it('source di luar himpunan ditolak', async () => {
    await expect(newTemplate({ code: 'CBS-BAD', source: 'nasional' }))
      .rejects.toThrow(/cbs_templates_source_check|check/i)
  }, 30_000)

  it('identitas (code, versi) UNIK — immutable per versi', async () => {
    await newTemplate({ code: 'CBS-DUP', version_number: 1 })
    await expect(newTemplate({ code: 'CBS-DUP', version_number: 1 }))
      .rejects.toThrow(/cbs_template_identity|unique|duplicate/i)
  }, 30_000)
})

describe('CBS Node — hierarki (yang di-exclude dari Cost Code)', () => {
  it('node akar + node anak; anak menunjuk parent + cost_code', async () => {
    const t = await newTemplate({ code: 'CBS-H' })
    const { rows: root } = await addNode(t, 'Struktur')
    const { rows: child } = await addNode(t, 'Pondasi', { parent_id: root[0].id, cost_code_id: costCodeId })
    const { rows } = await client.query(
      `SELECT parent_id, cost_code_id FROM cbs_nodes WHERE id = $1`, [child[0].id])
    expect(rows[0].parent_id).toBe(root[0].id)
    expect(rows[0].cost_code_id).toBe(costCodeId)
  }, 30_000)

  it('node tak boleh jadi parent dirinya sendiri', async () => {
    const t = await newTemplate({ code: 'CBS-SELF' })
    const { rows: n } = await addNode(t, 'X')
    await expect(client.query(`UPDATE cbs_nodes SET parent_id = id WHERE id = $1`, [n[0].id]))
      .rejects.toThrow(/not_self_parent|check/i)
  }, 30_000)

  it('parent WAJIB di template yang sama (integritas hierarki)', async () => {
    const t1 = await newTemplate({ code: 'CBS-T1' })
    const t2 = await newTemplate({ code: 'CBS-T2' })
    const { rows: n1 } = await addNode(t1, 'di T1')
    await expect(addNode(t2, 'di T2', { parent_id: n1[0].id }))
      .rejects.toThrow(/template yang sama|hierarki/i)
  }, 30_000)

  it('cost_code_id WAJIB referensi Cost Code yang ada bila diisi', async () => {
    const t = await newTemplate({ code: 'CBS-FK' })
    await expect(addNode(t, 'Bad', { cost_code_id: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toThrow(/foreign key|violates/i)
  }, 30_000)

  it('menghapus template draft ikut menghapus node (CASCADE)', async () => {
    const t = await newTemplate({ code: 'CBS-CAS' })
    await addNode(t, 'A')
    await client.query(`DELETE FROM cbs_templates WHERE id = $1`, [t])
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM cbs_nodes WHERE template_id = $1`, [t])
    expect(rows[0].n).toBe(0)
  }, 30_000)
})

describe('Lifecycle draft → active → superseded', () => {
  it('draft → active: activated_at terisi', async () => {
    const id = await newTemplate({ code: 'CBS-LIFE' })
    await setStatus(id, 'active')
    const { rows } = await client.query(`SELECT status, activated_at FROM cbs_templates WHERE id = $1`, [id])
    expect(rows[0].status).toBe('active')
    expect(rows[0].activated_at).not.toBeNull()
  }, 30_000)

  it('NEGATIF: draft → superseded (lompat) ditolak', async () => {
    const id = await newTemplate({ code: 'CBS-SKIP' })
    await expect(setStatus(id, 'superseded')).rejects.toThrow(/tidak sah/)
  }, 30_000)
})

describe('HARD GUARD: kategori beku begitu active (keputusan founder: immutable per versi)', () => {
  it('mengubah source SETELAH active DITOLAK', async () => {
    const id = await newTemplate({ code: 'CBS-IMM', source: 'company' })
    await setStatus(id, 'active')
    await expect(client.query(`UPDATE cbs_templates SET source = 'standard' WHERE id = $1`, [id]))
      .rejects.toThrow(/tak bisa diubah|retroaktif|check_violation/i)
  }, 30_000)

  it('menambah node SETELAH template active DITOLAK', async () => {
    const id = await newTemplate({ code: 'CBS-NODELOCK' })
    await addNode(id, 'awal')
    await setStatus(id, 'active')
    await expect(addNode(id, 'baru')).rejects.toThrow(/hanya bisa diubah saat.*draft|check_violation/i)
  }, 30_000)

  it('DELETE template active DITOLAK', async () => {
    const id = await newTemplate({ code: 'CBS-DEL' })
    await setStatus(id, 'active')
    await expect(client.query(`DELETE FROM cbs_templates WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:cbs:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:cbs:manage']).toEqual(['admin'])
    expect(byKey['cecep:cbs:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
