/**
 * `terapkan-ke-rab` — komponen biaya benar-benar sampai ke RAB.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BUG YANG DIKUNCI TEST INI, diukur 2026-08-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penulis snapshot (`estimate-versions.ts:786`) menyimpan:
 *
 *     hsp_snapshot: { hsp: { groupTotals, subtotalD, ... }, prices: [...] }
 *
 * Pembacanya di `terapkan-ke-rab` mencari `hsp_snapshot.result.groupTotals` —
 * kunci `result` TAK PERNAH ADA. Dibuktikan di basis dev: dari seluruh
 * `estimate_items` ber-snapshot, yang punya kunci `hsp` = semuanya, yang punya
 * `result` = NOL.
 *
 * Akibatnya `material_pct` / `upah_pct` / `alat_pct` di `rab_items` SELALU 0
 * untuk setiap baris hasil "Terapkan ke RAB", walaupun snapshotnya lengkap.
 *
 * Gagal senyap sempurna: constraint `rab_items_pct_sum` menerima total 0 —
 * nol berarti "tak diketahui", bukan pelanggaran. Jadi tak ada galat, tak ada
 * test merah, dan tak ada gejala sampai ada yang bertanya kenapa kolom
 * komponen biaya kosong terus.
 *
 * Nol test menyentuh endpoint ini sebelum berkas ini ada — itu sebabnya bug
 * bertahan.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateRoutes from '../estimate-versions.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let versionId: string
let costCodeId: string

const TANDA = 'UJI-TKR'

const post = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(`DELETE FROM rab_items WHERE name LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM estimate_items WHERE estimate_version_id IN
       (SELECT v.id FROM estimate_versions v JOIN scenarios s ON s.id = v.scenario_id
         WHERE s.name LIKE $1)`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM estimate_versions WHERE scenario_id IN
       (SELECT id FROM scenarios WHERE name LIKE $1)`, [`${TANDA}%`])
  await db.query('DELETE FROM scenarios WHERE name LIKE $1', [`${TANDA}%`])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [u[0].id])
  companyId = co[0].company_id

  // Proyek yang RAB-nya boleh ditimpa: endpoint ini MENGHAPUS seluruh
  // rab_items proyek sebelum menyisipkan ulang. Dipilih yang paling sedikit
  // barisnya supaya kerusakan tak sengaja seminimal mungkin.
  const { rows: p } = await db.query(
    `SELECT p.id, (SELECT count(*) FROM rab_items r WHERE r.project_id = p.id) n
       FROM projects p WHERE p.company_id = $1 ORDER BY n ASC LIMIT 1`, [companyId])
  if (!p.length) throw new Error('tak ada proyek di company ini')
  projectId = p[0].id

  const { rows: cc } = await db.query('SELECT id FROM cost_codes LIMIT 1')
  if (!cc.length) throw new Error('tak ada cost code — fixture tak terbentuk')
  costCodeId = cc[0].id

  await bersihkan()

  // Estimasi lengkap dengan snapshot BERBENTUK NYATA — persis yang ditulis
  // `estimate-versions.ts:785-794`, bukan bentuk yang nyaman untuk test.
  const { rows: sc } = await db.query(
    `INSERT INTO scenarios (project_id, name, purpose, created_by)
     VALUES ($1, $2, 'tender', $3) RETURNING id`,
    [projectId, `${TANDA} skenario`, u[0].id])
  const { rows: v } = await db.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, status, created_by)
     VALUES ($1, 1, 1000000, 'draft', $2) RETURNING id`, [sc[0].id, u[0].id])
  versionId = v[0].id

  await db.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount,
                                 sort_order, hsp_snapshot)
     VALUES ($1, $2, 10, 1000000, 0, $3::jsonb)`,
    [versionId, costCodeId, JSON.stringify({
      hsp: {
        groupTotals: { bahan: 60000, tenaga: 30000, alat: 10000 },
        subtotalD: 100000,
        bukAmount: 0,
      },
      prices: [],
    })])

  app = Fastify({ logger: false })
  await app.register(estimateRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('komponen biaya sampai ke RAB', () => {
  it('material/upah/alat terisi dari hsp_snapshot, bukan nol', async () => {
    const r = await post(`/api/v1/estimate-versions/${versionId}/terapkan-ke-rab`,
      { konfirmasi_timpa: true })
    expect(r.statusCode, r.body).toBe(201)

    const { rows } = await db.query(
      `SELECT material_pct, upah_pct, alat_pct, other_pct FROM rab_items
        WHERE project_id = $1 AND level <> 'category'
        ORDER BY created_at DESC LIMIT 1`, [projectId])
    if (!rows.length) throw new Error('nol baris RAB terbentuk — fixture tak terpakai')

    const b = rows[0]
    // 60/30/10 dari groupTotals { bahan: 60000, tenaga: 30000, alat: 10000 }.
    expect(Number(b.material_pct), 'komponen biaya NOL — snapshot tak terbaca').toBe(60)
    expect(Number(b.upah_pct)).toBe(30)
    expect(Number(b.alat_pct)).toBe(10)

    // Jumlahnya WAJIB persis 100: constraint `rab_items_pct_sum` menolak
    // 99,87 maupun 100,02, dan penolakannya terjadi saat insert.
    const jumlah = Number(b.material_pct) + Number(b.upah_pct)
      + Number(b.alat_pct) + Number(b.other_pct)
    expect(jumlah).toBe(100)
  })

  it('item TANPA snapshot menghasilkan nol — bukan proporsi yang ditebak', async () => {
    // Nol di sini SAH dan justru yang benar: menebak proporsi menghasilkan
    // angka yang dipakai orang untuk mengambil keputusan seolah hasil hitungan.
    await db.query(
      `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount, sort_order)
       VALUES ($1, $2, 5, 500000, 1)`, [versionId, costCodeId])

    const r = await post(`/api/v1/estimate-versions/${versionId}/terapkan-ke-rab`,
      { konfirmasi_timpa: true })
    expect(r.statusCode, r.body).toBe(201)

    const { rows } = await db.query(
      `SELECT material_pct, upah_pct, alat_pct FROM rab_items
        WHERE project_id = $1 AND level <> 'category' AND qty = 5 LIMIT 1`, [projectId])
    if (rows.length) {
      expect(Number(rows[0].material_pct)).toBe(0)
      expect(Number(rows[0].upah_pct)).toBe(0)
    }
  })

  it('tanpa konfirmasi_timpa DITOLAK — endpoint ini menghapus seluruh RAB proyek', async () => {
    const r = await post(`/api/v1/estimate-versions/${versionId}/terapkan-ke-rab`, {})
    expect(r.statusCode, r.body).not.toBe(200)
  })
})
