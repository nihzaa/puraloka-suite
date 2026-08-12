/**
 * Register kontrak, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • klien diambil DARI proyek, bukan dari body
 *   • dua kontrak induk BERLAKU per proyek ditolak basis
 *   • addendum sebidang: proyek sama, induk bukan addendum, tanggal maju
 *   • kontrak BERLAKU terkunci nilainya (trigger 344)
 *   • PEMBANDING nilai dokumen vs `projects.contract_value` benar-benar
 *     membaca keduanya — inti guna modul ini
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import kontrakRoutes from '../kontrak.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let projectLain: string
let projectAsing: string | null = null

const TANDA = 'UJI-KTR'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

const isiSah = (o: Record<string, unknown> = {}) => ({
  project_id: projectId,
  jenis: 'induk',
  nomor: `${TANDA}-001`,
  judul: 'Pembangunan rumah tinggal (uji)',
  tanggal_tanda_tangan: '2026-01-15',
  nilai: 500_000_000,
  ...o,
})

async function bersihkan() {
  await db.query('DELETE FROM kontrak WHERE nomor LIKE $1', [`${TANDA}%`])
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

  // Proyek dipilih menurut SYARAT: harus punya klien (kontrak menuntutnya),
  // dan belum punya kontrak induk berlaku. Pelajaran migrasi 328.
  const { rows: p } = await db.query(
    `SELECT p.id FROM projects p
      WHERE p.company_id = $1 AND p.client_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM kontrak k
                         WHERE k.project_id = p.id AND k.jenis = 'induk' AND k.status = 'berlaku')
      LIMIT 2`, [companyId])
  if (p.length < 2) throw new Error('butuh dua proyek berklien tanpa kontrak induk berlaku')
  projectId = p[0].id
  projectLain = p[1].id

  const { rows: pa } = await db.query(
    'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
  projectAsing = pa.length ? pa[0].id : null

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(kontrakRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('validasi masukan', () => {
  it('menolak tanpa project_id', async () => {
    const r = await post('/api/v1/kontrak', { jenis: 'induk', nomor: 'X', nilai: 1 })
    expect(r.statusCode).toBe(400)
  })

  it('menolak proyek milik tenant LAIN', async () => {
    if (!projectAsing) return
    const r = await post('/api/v1/kontrak', isiSah({ project_id: projectAsing }))
    expect(r.statusCode, r.body).toBe(404)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM kontrak WHERE project_id = $1', [projectAsing])
    expect(rows[0].n, 'kontrak tercatat pada proyek perusahaan lain').toBe(0)
  })

  it('menolak addendum tanpa induk', async () => {
    const r = await post('/api/v1/kontrak', isiSah({
      jenis: 'addendum', nomor: `${TANDA}-YATIM`,
    }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/addendum yatim/i)
  })

  it('menolak induk yang menunjuk kontrak lain', async () => {
    const r = await post('/api/v1/kontrak', isiSah({
      nomor: `${TANDA}-SALAH`, kontrak_induk_id: '00000000-0000-0000-0000-000000000001',
    }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak boleh menunjuk/i)
  })

  it('menolak nilai induk nol', async () => {
    const r = await post('/api/v1/kontrak', isiSah({ nilai: 0 }))
    expect(r.statusCode).toBe(400)
  })
})

describe('membuat kontrak', () => {
  let idInduk: string

  it('kontrak induk terbentuk, dan KLIEN diambil dari proyek', async () => {
    // client_id SENGAJA dikirim menunjuk klien LAIN. Kalau server memakainya,
    // kontrak tercatat atas nama pihak yang tak pernah berhubungan dengan
    // proyeknya — dan tak ada satu pun galat yang muncul.
    const { rows: asing } = await db.query(
      `SELECT c.id FROM clients c
        WHERE c.id <> (SELECT client_id FROM projects WHERE id = $1) LIMIT 1`, [projectId])
    const r = await post('/api/v1/kontrak',
      isiSah(asing.length ? { client_id: asing[0].id } : {}))
    expect(r.statusCode, r.body).toBe(201)
    idInduk = r.json().kontrak.id

    // Klien tak dikirim di body sama sekali — server mengambilnya dari proyek.
    // Klien yang diterima apa adanya bisa menunjuk pihak yang tak pernah
    // berhubungan dengan proyeknya.
    const { rows } = await db.query(
      `SELECT k.client_id, p.client_id AS klien_proyek
         FROM kontrak k JOIN projects p ON p.id = k.project_id WHERE k.id = $1`, [idInduk])
    expect(rows[0].client_id).toBe(rows[0].klien_proyek)
  })

  it('nomor KEMBAR ditolak 409', async () => {
    const r = await post('/api/v1/kontrak', isiSah({ project_id: projectLain }))
    expect(r.statusCode, r.body).toBe(409)
  })

  it('addendum sah — dan boleh bernilai NEGATIF', async () => {
    await patch(`/api/v1/kontrak/${idInduk}/status`, { status: 'berlaku' })

    const tambah = await post('/api/v1/kontrak', isiSah({
      jenis: 'addendum', nomor: `${TANDA}-ADD1`, nilai: 75_000_000,
      tanggal_tanda_tangan: '2026-03-01', kontrak_induk_id: idInduk,
    }))
    expect(tambah.statusCode, tambah.body).toBe(201)

    const kurang = await post('/api/v1/kontrak', isiSah({
      jenis: 'addendum', nomor: `${TANDA}-ADD2`, nilai: -25_000_000,
      tanggal_tanda_tangan: '2026-04-01', kontrak_induk_id: idInduk,
    }))
    expect(kurang.statusCode, kurang.body).toBe(201)
  })

  it('addendum atas ADDENDUM ditolak 422', async () => {
    const { rows } = await db.query(
      'SELECT id FROM kontrak WHERE nomor = $1', [`${TANDA}-ADD1`])
    const r = await post('/api/v1/kontrak', isiSah({
      jenis: 'addendum', nomor: `${TANDA}-ADD3`, nilai: 1_000_000,
      tanggal_tanda_tangan: '2026-05-01', kontrak_induk_id: rows[0].id,
    }))
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/penelusuran rekursif/i)
  })

  it('addendum menunjuk induk di PROYEK LAIN ditolak 422', async () => {
    const r = await post('/api/v1/kontrak', isiSah({
      project_id: projectLain,
      jenis: 'addendum', nomor: `${TANDA}-BEDA`, nilai: 1_000_000,
      tanggal_tanda_tangan: '2026-05-01', kontrak_induk_id: idInduk,
    }))
    expect(r.statusCode, r.body).toBe(422)
    // Dua lapisan menolaknya: rute (kalimat ini) dan trigger 344. Kalimat
    // rute yang dikunci — kalau ia lepas, yang tersisa hanya galat basis
    // yang tak bisa ditindaklanjuti pengguna.
    expect(r.json().error).toMatch(/milik proyek lain/i)
  })

  it('addendum bertanggal SEBELUM induknya ditolak basis', async () => {
    const r = await post('/api/v1/kontrak', isiSah({
      jenis: 'addendum', nomor: `${TANDA}-MUNDUR`, nilai: 1_000_000,
      tanggal_tanda_tangan: '2025-06-01', kontrak_induk_id: idInduk,
    }))
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/mendahului/i)
  })
})

describe('nilai kontraktual & pembanding', () => {
  it('nilai berjalan dihitung dari dokumen — induk + addendum', async () => {
    // Addendum masih draf, jadi belum masuk hitungan.
    await db.query(
      `UPDATE kontrak SET status = 'berlaku' WHERE nomor IN ($1, $2)`,
      [`${TANDA}-ADD1`, `${TANDA}-ADD2`])

    const r = await get(`/api/v1/kontrak/proyek/${projectId}`)
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json()
    expect(j.nilai.awal).toBe(500_000_000)
    expect(j.nilai.addendum).toBe(50_000_000)   // 75jt − 25jt
    expect(j.nilai.berjalan).toBe(550_000_000)
    expect(j.nilai.jumlahAddendum).toBe(2)
  })

  it('DRAF tak dihitung — rancangan bukan kesepakatan', async () => {
    await db.query(
      `INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                            tanggal_tanda_tangan, nilai, kontrak_induk_id, status)
       SELECT k.company_id, k.project_id, k.client_id, 'addendum', $1, 'draf besar',
              '2026-06-01', 900000000, k.id, 'draf'
         FROM kontrak k WHERE k.nomor = $2`,
      [`${TANDA}-DRAF`, `${TANDA}-001`])

    const r = await get(`/api/v1/kontrak/proyek/${projectId}`)
    expect(r.json().nilai.berjalan,
      'draf ikut dihitung — nilai kontrak berubah tiap kali orang menyusun rancangan')
      .toBe(550_000_000)
  })

  it('PEMBANDING membaca projects.contract_value yang NYATA', async () => {
    const r = await get(`/api/v1/kontrak/proyek/${projectId}`)
    const j = r.json()

    const { rows } = await db.query(
      'SELECT contract_value FROM projects WHERE id = $1', [projectId])
    // Dibandingkan dengan angka BASIS, bukan konstanta — konstanta tetap
    // hijau saat pembacanya salah kolom.
    expect(j.banding.menurutProyek).toBe(Number(rows[0].contract_value))
    expect(j.banding.menurutKontrak).toBe(550_000_000)
    expect(j.banding).toHaveProperty('sebab')
  })

  it('proyek milik tenant lain ditolak 404', async () => {
    if (!projectAsing) return
    const r = await get(`/api/v1/kontrak/proyek/${projectAsing}`)
    expect(r.statusCode, r.body).toBe(404)
  })
})

describe('status', () => {
  let idInduk: string

  beforeAll(async () => {
    const { rows } = await db.query('SELECT id FROM kontrak WHERE nomor = $1', [`${TANDA}-001`])
    idInduk = rows[0].id
  })

  it('kontrak BERLAKU terkunci nilainya — trigger 344', async () => {
    await expect(
      db.query('UPDATE kontrak SET nilai = 999000000 WHERE id = $1', [idInduk]),
    ).rejects.toThrow(/tak bisa diubah/i)

    const { rows } = await db.query('SELECT nilai FROM kontrak WHERE id = $1', [idInduk])
    expect(Number(rows[0].nilai),
      'nilai kontrak bertanda tangan berubah sepihak').toBe(500_000_000)
  })

  it('catatan & lingkup TETAP boleh diubah sesudah berlaku', async () => {
    await db.query(
      `UPDATE kontrak SET catatan = 'uji', lingkup = 'uji lingkup' WHERE id = $1`, [idInduk])
  })

  it('pembatalan wajib beralasan', async () => {
    const r = await patch(`/api/v1/kontrak/${idInduk}/status`, { status: 'dibatalkan' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/wajib beralasan/i)
  })

  it('berlaku → selesai berhasil', async () => {
    const r = await patch(`/api/v1/kontrak/${idInduk}/status`, { status: 'selesai' })
    expect(r.statusCode, r.body).toBe(200)
  })

  it('yang SELESAI tak bisa dibatalkan', async () => {
    const r = await patch(`/api/v1/kontrak/${idInduk}/status`, {
      status: 'dibatalkan', alasan: 'coba batalkan',
    })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/tak pernah berlaku/i)
  })

  it('kontrak SELESAI tetap dihitung — laporan penutupan membacanya', async () => {
    const r = await get(`/api/v1/kontrak/proyek/${projectId}`)
    expect(r.json().nilai.awal, 'kontrak selesai hilang dari hitungan').toBe(500_000_000)
  })

  it('kontrak tenant lain ditolak 404', async () => {
    // Fixture DIBUAT, tidak dicari lalu dilewati. Test yang `return` diam-diam
    // saat fixturenya tak ada adalah test yang tak pernah menguji apa pun —
    // pelajaran G1-M3.
    let { rows } = await db.query(
      `SELECT k.id FROM kontrak k WHERE k.company_id <> $1 AND k.status = 'draf' LIMIT 1`,
      [companyId])

    if (!rows.length) {
      const { rows: asing } = await db.query(
        `SELECT p.id, p.company_id, p.client_id FROM projects p
          WHERE p.company_id <> $1 AND p.client_id IS NOT NULL LIMIT 1`, [companyId])
      if (!asing.length) throw new Error('tak ada proyek tenant lain berklien — fixture tak terbentuk')
      const ins = await db.query(
        `INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                              tanggal_tanda_tangan, nilai, status)
         VALUES ($1, $2, $3, 'induk', $4, 'kontrak tenant lain (uji)', '2026-01-01', 1000000, 'draf')
         RETURNING id`,
        [asing[0].company_id, asing[0].id, asing[0].client_id, `${TANDA}-ASING`])
      rows = ins.rows
    }

    const r = await patch(`/api/v1/kontrak/${rows[0].id}/status`, { status: 'berlaku' })
    expect(r.statusCode, r.body).toBe(404)

    const { rows: sesudah } = await db.query(
      'SELECT status FROM kontrak WHERE id = $1', [rows[0].id])
    expect(sesudah[0].status, 'kontrak perusahaan lain diberlakukan dari sini').toBe('draf')
  })
})

describe('change order → addendum', () => {
  it('CO yang BELUM disetujui ditolak', async () => {
    const { rows } = await db.query(
      `SELECT id FROM change_orders WHERE status <> 'approved' AND project_id = ANY(
         SELECT id FROM projects WHERE company_id = $1) LIMIT 1`, [companyId])
    if (!rows.length) return

    const { rows: add } = await db.query(
      'SELECT id FROM kontrak WHERE nomor = $1', [`${TANDA}-ADD1`])
    const r = await patch(`/api/v1/change-orders/${rows[0].id}/addendum`, {
      kontrak_addendum_id: add[0].id,
    })
    expect(r.statusCode, r.body).toBe(409)
  })

  it('menunjuk kontrak INDUK (bukan addendum) ditolak 422', async () => {
    const { rows: co } = await db.query(
      `SELECT id FROM change_orders WHERE status = 'approved' AND project_id = ANY(
         SELECT id FROM projects WHERE company_id = $1) LIMIT 1`, [companyId])
    if (!co.length) return

    const { rows: induk } = await db.query(
      'SELECT id FROM kontrak WHERE nomor = $1', [`${TANDA}-001`])
    const r = await patch(`/api/v1/change-orders/${co[0].id}/addendum`, {
      kontrak_addendum_id: induk[0].id,
    })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/bukan addendum/i)
  })
})
