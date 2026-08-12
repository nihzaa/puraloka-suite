/**
 * B1 — Laporan Harian lewat HTTP terhadap Postgres NYATA.
 *
 * Test lib membuktikan penyusunannya benar; ia hijau meski endpointnya tak
 * pernah terdaftar. Yang hanya bisa dijawab di sini:
 *
 *   • endpointnya benar-benar ada (bukan 404) dan fail-closed tanpa izin
 *   • query-nya tak gagal pada schema sungguhan — nama kolom & relasi
 *     `users!progress_logs_reported_by_fkey` terbukti benar
 *   • saringan tanggal tak MENGHILANGKAN hari terakhir (timestamptz vs date)
 *   • `?project_id` milik tenant lain tak lolos
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import lapanganRoutes from '../lapangan.js'

let app: FastifyInstance
let db: Client
let hariBerdata: string | null = null

const get = (qs = '') =>
  app.inject({
    method: 'GET', url: `/api/v1/lapangan/laporan-harian${qs}`,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  // Hari yang PUNYA laporan `daily` — dipilih menurut syaratnya, bukan
  // posisi. Test yang mengambil "baris pertama" hijau/merah tergantung isi.
  const { rows } = await db.query(
    `SELECT logged_at::date::text AS tgl FROM progress_logs
      WHERE mode = 'daily' ORDER BY logged_at DESC LIMIT 1`)
  hariBerdata = rows[0]?.tgl ?? null

  app = Fastify({ logger: false })
  await app.register(lapanganRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('endpoint', () => {
  it('menjawab 200 dengan bentuk yang lengkap', async () => {
    const r = await get()
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json()
    expect(Array.isArray(j.hari)).toBe(true)
    expect(j.ringkasan).toHaveProperty('hariBerlaporan')
    expect(j.ringkasan).toHaveProperty('rerataPekerja')
    expect(Array.isArray(j.proyek)).toBe(true)
    expect(j.rentang).toHaveProperty('dari')
  })

  it('query relasi pelapor tak gagal pada schema sungguhan', async () => {
    // Nama relasi PostgREST diturunkan dari nama FK. Salah menebaknya
    // membuat SELURUH permintaan gagal 500 — dan itu sudah terjadi hari ini
    // pada `journal_entries(status)` yang FK-nya memang tak ada.
    const r = await get()
    expect(r.statusCode).toBe(200)
  })
})

describe('rentang tanggal', () => {
  it('hari terakhir TIDAK hilang saat dari = sampai', async () => {
    if (!hariBerdata) {
      console.warn('  ⏭  tak ada laporan mode=daily — dilewati')
      return
    }
    // `logged_at` timestamptz; `lte('2026-06-16')` memotong tepat tengah
    // malam sehingga seluruh laporan hari itu hilang tanpa satu pun galat.
    const r = await get(`?dari=${hariBerdata}&sampai=${hariBerdata}`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.hari.length).toBeGreaterThan(0)
    expect(j.hari[0].tanggal).toBe(hariBerdata)
  })

  it('laporan BERJAM pada hari terakhir tak hilang', async () => {
    // Data dev seluruhnya bertimestamp tepat tengah malam, jadi
    // `lte('<tanggal>')` kebetulan tetap menangkapnya — mutasi yang
    // mengembalikan `.lt(+1 hari)` jadi `.lte(sampai)` LOLOS di sini.
    //
    // Baris berjam disisipkan sementara supaya cacatnya benar-benar
    // terlihat: dengan `lte`, laporan pukul 08:00 pada hari `sampai` hilang
    // tanpa satu pun galat.
    const { rows: p } = await db.query(
      `SELECT project_id, reported_by FROM progress_logs WHERE mode='daily' LIMIT 1`)
    if (!p.length) return

    const tgl = '2026-06-20'
    const { rows: ins } = await db.query(
      `INSERT INTO progress_logs (project_id, reported_by, mode, pct_overall, weather, worker_count, notes, logged_at)
       VALUES ($1, $2, 'daily', 50, 'cerah', 7, '[TEST-DPR] laporan sore', $3::timestamptz)
       RETURNING id`,
      [p[0].project_id, p[0].reported_by, `${tgl}T08:30:00+07:00`])
    try {
      const r = await get(`?dari=${tgl}&sampai=${tgl}`)
      expect(r.statusCode).toBe(200)
      const hari = r.json().hari as Array<{ tanggal: string; catatan: Array<{ teks: string }> }>
      expect(hari.length, 'laporan berjam pada hari `sampai` HILANG').toBeGreaterThan(0)
      expect(hari[0].catatan.some(c => c.teks.includes('[TEST-DPR]'))).toBe(true)
    } finally {
      await db.query('DELETE FROM progress_logs WHERE id = $1', [ins[0].id])
    }
  })

  it('rentang tanpa data mengembalikan daftar kosong, bukan galat', async () => {
    const r = await get('?dari=1999-01-01&sampai=1999-01-31')
    expect(r.statusCode).toBe(200)
    expect(r.json().hari).toEqual([])
    expect(r.json().ringkasan.hariBerlaporan).toBe(0)
  })
})

describe('tenancy', () => {
  it('project_id di luar jangkauan tenant tak melebarkan hasil', async () => {
    // Dipakai apa adanya dari query, id milik tenant lain akan lolos ke
    // `.in('project_id', …)`. Di sini ia harus diabaikan — hasilnya sama
    // dengan tanpa saringan, bukan berisi data tenant itu.
    const asing = '00000000-0000-0000-0000-0000000000ff'
    const r = await get(`?project_id=${asing}`)
    expect(r.statusCode).toBe(200)

    const semua = await get()
    expect(r.json().hari.length).toBe(semua.json().hari.length)
  })

  it('project_id milik tenant ini MEMPERSEMPIT hasil', async () => {
    const { rows } = await db.query(
      `SELECT project_id FROM progress_logs WHERE mode='daily' GROUP BY 1 LIMIT 1`)
    if (!rows.length) return
    const r = await get(`?project_id=${rows[0].project_id}`)
    expect(r.statusCode).toBe(200)
    // Tiap hari yang dikembalikan hanya memuat proyek itu.
    for (const h of r.json().hari as Array<{ proyek: number }>) {
      expect(h.proyek).toBe(1)
    }
  })
})

describe('isi laporan', () => {
  it('hanya mode daily yang terhitung', async () => {
    if (!hariBerdata) return
    const r = await get(`?dari=${hariBerdata}&sampai=${hariBerdata}`)
    const hari = r.json().hari[0]

    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE mode='daily')::int AS daily,
              count(*)::int AS semua
         FROM progress_logs WHERE logged_at::date = $1`, [hariBerdata])

    // Kalau `detail` ikut terhitung, angkanya melonjak — 2026-06-16 punya
    // 48 baris yang hanya 3 di antaranya laporan harian sesungguhnya.
    expect(hari.laporan).toBeLessThanOrEqual(rows[0].daily)
    if (rows[0].semua > rows[0].daily) {
      expect(hari.laporan).toBeLessThan(rows[0].semua)
    }
  })
})
