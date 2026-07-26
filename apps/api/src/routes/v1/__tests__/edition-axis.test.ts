import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP — Sumbu EDISI AHSP (migration 117). Menyentuh gerbang immutability
// (assemblies + estimate_versions), disetujui di keputusan desain edisi
// (AHSP-EDITION-BUILDER-DESIGN §103–108). Terhadap Postgres NYATA, migration verbatim.
//
// Tiga sumbu ORTHOGONAL: EDISI (dokumen SE) vs SUMBER (source) vs VERSI (version_number).

const BASE = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '003_projects_and_contracts.sql',
]
const CECEP = [
  '076_menu_items.sql',   // 090 menyisipkan entri menu → butuh tabelnya
  '090_units_lookup.sql',
  '102_cecep_cost_code_registry.sql',
  '103_cecep_resource_registry.sql',
  '104_cecep_price_book.sql',
  '107_cecep_assembly.sql',
  '108_cecep_cbs.sql',
  '109_cecep_wbs.sql',
  '110_cecep_estimate_chain.sql',
  '115_cecep_unit_foundation.sql',
  '116_cecep_unit_labor_time.sql',
  '117_cecep_edition_axis.sql',
  '118_cecep_edition_provenance_write_once.sql',
]

let client: Client
let userId: string
let clientId: string
let projectId: string
let costCodeId: string
const edn: Record<string, string> = {} // code → id

async function newAssembly(over: Record<string, unknown> = {}): Promise<string> {
  const cols: Record<string, unknown> = {
    code: 'ASM-EDN', name: 'Pembesian per m2', cost_code_id: costCodeId,
    source: 'company', version_number: 1, waste_factor: 0.05,
    output_unit_code: 'm2', created_by: userId, ...over,
  }
  const keys = Object.keys(cols)
  const { rows } = await client.query(
    `INSERT INTO assemblies (${keys.join(',')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    keys.map(k => cols[k]))
  return rows[0].id
}
const setStatus = (id: string, status: string) =>
  client.query(`UPDATE assemblies SET status = $1 WHERE id = $2`, [status, id])
const activate = (id: string) => setStatus(id, 'active')

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, BASE)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, CECEP)

  // unit m2 dijamin ada (dimension NOT NULL setelah 115).
  await client.query(
    `INSERT INTO units (code, symbol, label, category, dimension)
     VALUES ('m2','m²','Meter persegi','area','area') ON CONFLICT (code) DO NOTHING`)

  const u = await client.query(
    `INSERT INTO users (name, email, role) VALUES ('Uji Edn', 'edn-uji@puraloka.test', 'admin') RETURNING id`)
  userId = u.rows[0].id
  const cl = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('Klien Uji', '08', $1) RETURNING id`, [userId])
  clientId = cl.rows[0].id
  const p = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, 'Proyek Edn', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [clientId, userId])
  projectId = p.rows[0].id
  const c = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-EDN', 'Pembesian', $1) RETURNING id`, [userId])
  costCodeId = c.rows[0].id
  await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('RBS-EDN', 'Tukang Besi', 'labor', 'OH', $1)`, [userId])

  const eds = await client.query(`SELECT code, id FROM ahsp_editions`)
  for (const row of eds.rows) edn[row.code] = row.id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Registry EDISI — provenance & seed', () => {
  it('3 edisi acuan ter-seed (SNI-2013, SE-68-2024, SE-47-2026)', () => {
    expect(edn['SNI-2013']).toBeTruthy()
    expect(edn['SE-68-2024']).toBeTruthy()
    expect(edn['SE-47-2026']).toBeTruthy()
  })

  it('provenance WRITE-ONCE (118): isi source_file saat NULL BOLEH (impor pertama)', async () => {
    await expect(client.query(
      `UPDATE ahsp_editions SET source_file='se47.xlsm', source_sha256='abc', imported_at=now()
       WHERE code = 'SE-47-2026'`)).resolves.toBeTruthy()
  })

  it('provenance WRITE-ONCE (118): ubah nilai TERISI DITOLAK', async () => {
    await expect(client.query(
      `UPDATE ahsp_editions SET source_sha256 = 'DIGANTI' WHERE code = 'SE-47-2026'`))
      .rejects.toThrow(/write-once|sudah terisi/i)
  })

  it('identitas edisi (code/publish_date) tetap beku', async () => {
    await expect(client.query(
      `UPDATE ahsp_editions SET publish_date = '1999-01-01' WHERE code = 'SE-47-2026'`))
      .rejects.toThrow(/identitas.*immutable|immutable/i)
  })

  it('is_active BOLEH diubah (operasional, bukan provenance)', async () => {
    await expect(client.query(
      `UPDATE ahsp_editions SET is_active = false WHERE code = 'SNI-2013'`)).resolves.toBeTruthy()
    await client.query(`UPDATE ahsp_editions SET is_active = true WHERE code = 'SNI-2013'`)
  })
})

describe('assemblies × EDISI — identitas & constraint', () => {
  it('national WAJIB menyatakan edisi (source=national, edition_id NULL) DITOLAK', async () => {
    await expect(newAssembly({ code: 'ASM-NAT-A', source: 'national', edition_id: null }))
      .rejects.toThrow(/national_needs_edition|check/i)
  })

  it('national dengan edition_id diterima', async () => {
    await expect(newAssembly({ code: 'ASM-NAT-B', source: 'national', edition_id: edn['SE-47-2026'] }))
      .resolves.toBeTruthy()
  })

  it('identitas baru: code+versi SAMA tapi EDISI beda → DIPERBOLEHKAN', async () => {
    await newAssembly({ code: 'ASM-DUP-EDN', source: 'national', version_number: 1, edition_id: edn['SE-47-2026'] })
    await expect(newAssembly({ code: 'ASM-DUP-EDN', source: 'national', version_number: 1, edition_id: edn['SE-68-2024'] }))
      .resolves.toBeTruthy()
  })

  it('identitas: code+edisi+source+versi SAMA → DITOLAK', async () => {
    await newAssembly({ code: 'ASM-SAME', source: 'national', version_number: 1, edition_id: edn['SNI-2013'] })
    await expect(newAssembly({ code: 'ASM-SAME', source: 'national', version_number: 1, edition_id: edn['SNI-2013'] }))
      .rejects.toThrow(/assembly_identity|unique|duplicate/i)
  })
})

describe('HARD GUARD: edisi beku begitu assembly active', () => {
  it('mengubah edition_id SETELAH active DITOLAK', async () => {
    const id = await newAssembly({ code: 'ASM-ACT-EDN', source: 'national', edition_id: edn['SE-47-2026'] })
    await activate(id)
    await expect(client.query(
      `UPDATE assemblies SET edition_id = $1 WHERE id = $2`, [edn['SE-68-2024'], id]))
      .rejects.toThrow(/tak bisa diubah|retroaktif|check_violation/i)
  })
})

describe('Baseline impor IMMUTABLE (jejak "SE bilang apa")', () => {
  it('mengubah konten baris is_import_baseline DITOLAK — bahkan saat DRAFT', async () => {
    const id = await newAssembly({
      code: 'ASM-BASE', source: 'national', edition_id: edn['SE-47-2026'], is_import_baseline: true,
    })
    // masih draft, tapi baseline → konten beku
    await expect(client.query(
      `UPDATE assemblies SET waste_factor = 0.10 WHERE id = $1`, [id]))
      .rejects.toThrow(/Baseline impor.*IMMUTABLE|tak boleh ditimpa/i)
  })

  it('MUTATION-PROOF: nonaktifkan trigger baseline → mutasi baseline LOLOS → restore', async () => {
    const id = await newAssembly({
      code: 'ASM-BASE-MUT', source: 'national', edition_id: edn['SNI-2013'], is_import_baseline: true,
    })
    // Bukti guard load-bearing: tanpa trigger, mutasi yang tadinya ditolak jadi sukses.
    await client.query(`ALTER TABLE assemblies DISABLE TRIGGER trg_assembly_baseline_immutable`)
    await expect(client.query(
      `UPDATE assemblies SET waste_factor = 0.10 WHERE id = $1`, [id])).resolves.toBeTruthy()
    await client.query(`ALTER TABLE assemblies ENABLE TRIGGER trg_assembly_baseline_immutable`)
    // guard kembali menolak
    await expect(client.query(
      `UPDATE assemblies SET waste_factor = 0.20 WHERE id = $1`, [id]))
      .rejects.toThrow(/Baseline impor.*IMMUTABLE|tak boleh ditimpa/i)
  })
})

describe('EDISI no-delete-if-referenced', () => {
  it('hapus edisi yang dirujuk assembly DITOLAK', async () => {
    await newAssembly({ code: 'ASM-REF', source: 'national', edition_id: edn['SE-68-2024'] })
    await expect(client.query(`DELETE FROM ahsp_editions WHERE code = 'SE-68-2024'`))
      .rejects.toThrow(/tak boleh dihapus|masih dirujuk|Nonaktifkan/i)
  })
})

describe('estimate_versions × EDISI — permanen begitu ≠ draft', () => {
  async function newEstimateVersion(over: Record<string, unknown> = {}): Promise<string> {
    const sc = await client.query(
      `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [projectId, over.name ?? 'Skenario Edn', userId])
    const ev = await client.query(
      `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, edition_id, created_by)
       VALUES ($1, 1, 0, $2, $3) RETURNING id`,
      [sc.rows[0].id, over.edition_id ?? edn['SE-47-2026'], userId])
    return ev.rows[0].id
  }

  it('estimasi menyatakan edisi (edition_id tersimpan)', async () => {
    const id = await newEstimateVersion()
    const { rows } = await client.query(`SELECT edition_id FROM estimate_versions WHERE id = $1`, [id])
    expect(rows[0].edition_id).toBe(edn['SE-47-2026'])
  })

  it('mengubah edition_id SETELAH keluar draft DITOLAK', async () => {
    const id = await newEstimateVersion()
    await client.query(`UPDATE estimate_versions SET status = 'under_review' WHERE id = $1`, [id])
    await expect(client.query(
      `UPDATE estimate_versions SET edition_id = $1 WHERE id = $2`, [edn['SE-68-2024'], id]))
      .rejects.toThrow(/beku|tak boleh berubah|check_violation/i)
  })
})
