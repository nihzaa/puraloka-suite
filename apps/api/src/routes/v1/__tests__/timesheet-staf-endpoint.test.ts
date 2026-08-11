import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import timesheetStafRoutes from '../timesheet-staf.js'

/**
 * TIMESHEET STAF terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 21 test di `lib/__tests__/timesheet-staf.test.ts`
 * (12 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `timesheet_staf` lewat `pegawai_id` benar-benar menempuh
 *     jalannya — BUKAN `project_id`
 *   • mengisi hari yang SAMA dua kali MEMPERBARUI, bukan menambah baris kedua
 *     (constraint `timesheet_pegawai_tanggal_unik`) — dua baris membuat total
 *     jam berlipat tanpa satu pun galat
 *   • constraint DB menolak (jam > 24, negatif, ditolak tanpa alasan)
 *   • penyetuju diisi dari SESI, bukan dari klien
 *   • keputusan atas baris yang BUKAN `diajukan` ditolak — dan dua keputusan
 *     bersamaan hanya satu yang berhasil
 *   • mengubah baris yang SUDAH disetujui ditolak
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let userId: string
let pegawaiId: string
let projectId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM timesheet_staf WHERE pegawai_id IN
       (SELECT id FROM pegawai WHERE nomor_induk LIKE '[TEST]%')`)
  await client.query(`DELETE FROM pegawai WHERE nomor_induk LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id, company_id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id
  companyId = p[0].company_id

  // User yang BELUM punya baris pegawai — constraint `pegawai_user_unik`
  // menolak yang sudah ada, dan basis bersama bisa berisi sisa sesi lain.
  const { rows: u } = await client.query(
    `SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM pegawai g WHERE g.user_id = u.id AND g.company_id = $1)
      LIMIT 1`, [companyId])
  userId = u[0].id

  await purge()

  const { rows: g } = await client.query(
    `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan, jam_standar, gaji_pokok)
     VALUES ($1, $2, '[TEST]P-01', 'Staf uji', 8, 5000000)
     RETURNING id`, [userId, companyId])
  pegawaiId = g[0].id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(timesheetStafRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /sdm/pegawai/:id/timesheet', () => {
  it('tanggal WAJIB berformat YYYY-MM-DD', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
      tanggal: '3 Agustus 2026', jam_kerja: 8,
    })
    expect(r.statusCode).toBe(400)
  })

  it('baris pertama tersimpan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
      tanggal: '2026-08-03', jam_kerja: 8, project_id: projectId,
      kegiatan: 'Rapat koordinasi & penyiapan RAB',
    })
    expect(r.statusCode).toBe(201)
  })

  it('mengisi hari yang SAMA MEMPERBARUI, tidak menambah baris kedua', async () => {
    // ── Invarian paling penting di berkas ini ─────────────────────────────
    //
    // Dua baris untuk hari yang sama membuat total jam BERLIPAT tanpa satu
    // pun galat: yang membacanya melihat angka masuk akal (16 jam seminggu
    // jadi 32) tanpa cara tahu sebabnya.
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
      tanggal: '2026-08-03', jam_kerja: 6, jam_lembur: 2, project_id: projectId,
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT count(*)::int n, sum(jam_kerja) jk FROM timesheet_staf
        WHERE pegawai_id = $1 AND tanggal = '2026-08-03'`, [pegawaiId])
    expect(rows[0].n).toBe(1)
    expect(Number(rows[0].jk)).toBe(6)
  })

  it('jam total > 24 ditolak BASIS', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
      tanggal: '2026-08-04', jam_kerja: 80,
    })
    expect(r.statusCode).toBe(400)
  })

  it('jam negatif ditolak BASIS', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
      tanggal: '2026-08-04', jam_kerja: -2,
    })
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk pegawai yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/sdm/pegawai/00000000-0000-0000-0000-0000000000ff/timesheet',
      { tanggal: '2026-08-03', jam_kerja: 8 })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /sdm/pegawai/:id/timesheet', () => {
  it('baris terbaca lewat rantai tenancy-nya sendiri', async () => {
    // `timesheet_staf` mewarisi lewat `pegawai_id`. Memberi id proyek ke
    // `viaProject` menyusun `.eq('pegawai_id', <id proyek>)` — nol baris,
    // NOL GALAT.
    const r = await get(`/api/v1/sdm/pegawai/${pegawaiId}/timesheet?bulan=2026-08`)
    expect(r.statusCode).toBe(200)
    expect(r.json().ringkasan.baris.length).toBeGreaterThan(0)
  })

  it('bulan berformat salah ditolak', async () => {
    const r = await get(`/api/v1/sdm/pegawai/${pegawaiId}/timesheet?bulan=Agustus`)
    expect(r.statusCode).toBe(400)
  })

  it('rentang bulan berakhir di hari terakhir yang BENAR', async () => {
    // Februari 2026 punya 28 hari; tabel panjang-bulan yang ditulis tangan
    // adalah sumber galat kabisat yang klasik.
    const r = await get(`/api/v1/sdm/pegawai/${pegawaiId}/timesheet?bulan=2026-02`)
    expect(r.json().rentang).toEqual({ awal: '2026-02-01', akhir: '2026-02-28' })
  })

  it('hari kerja yang belum diisi dilaporkan, akhir pekan tidak', async () => {
    const j = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/timesheet?bulan=2026-08`)).json()
    const kosong: string[] = j.ringkasan.hari_kosong
    // 2026-08-01 Sabtu, 08-02 Minggu — tak boleh masuk.
    expect(kosong).not.toContain('2026-08-01')
    expect(kosong).not.toContain('2026-08-02')
    // 2026-08-04 Selasa belum diisi (insert-nya ditolak constraint) — harus masuk.
    expect(kosong).toContain('2026-08-04')
  })
})

describe('POST /sdm/pegawai/:id/timesheet/ajukan', () => {
  it('mengajukan draf bulan itu', async () => {
    const r = await kirim('POST',
      `/api/v1/sdm/pegawai/${pegawaiId}/timesheet/ajukan?bulan=2026-08`)
    expect(r.statusCode).toBe(200)
    expect(r.json().diajukan).toBeGreaterThan(0)
  })

  it('pengajuan KEDUA ditolak — tak ada draf tersisa', async () => {
    const r = await kirim('POST',
      `/api/v1/sdm/pegawai/${pegawaiId}/timesheet/ajukan?bulan=2026-08`)
    // Nol baris terubah BUKAN keberhasilan.
    expect(r.statusCode).toBe(409)
  })
})

describe('POST /sdm/timesheet/:id/putuskan', () => {
  let barisId: string

  beforeAll(async () => {
    const { rows } = await client.query(
      `SELECT id FROM timesheet_staf WHERE pegawai_id = $1 AND status = 'diajukan' LIMIT 1`,
      [pegawaiId])
    barisId = rows[0].id
  })

  it('penolakan WAJIB beralasan, dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', `/api/v1/sdm/timesheet/${barisId}/putuskan`, {
      setujui: false,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/alasan|diperbaiki/i)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('penyetuju diisi dari SESI, bukan dari klien', async () => {
    const r = await kirim('POST', `/api/v1/sdm/timesheet/${barisId}/putuskan`, {
      setujui: true,
      disetujui_oleh: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT disetujui_oleh, disetujui_pada FROM timesheet_staf WHERE id = $1`, [barisId])
    expect(rows[0].disetujui_oleh).not.toBe('00000000-0000-0000-0000-0000000000ff')
    expect(rows[0].disetujui_pada).not.toBeNull()
  })

  it('mengubah baris yang SUDAH disetujui ditolak', async () => {
    // `to_char`, bukan `new Date(rows[0].tanggal).toISOString()`.
    //
    // Kolom `date` tiba di driver `pg` sebagai objek Date pada tengah malam
    // WAKTU LOKAL; `toISOString()` mengubahnya ke UTC dan menggesernya SEHARI
    // di zona timur (mesin ini UTC+7). Test versi pertama gagal dengan
    // "expected 201 to be 409" — 201 karena tanggal yang dikirim bergeser,
    // jadi server membuat baris BARU alih-alih menemukan yang sudah ada.
    //
    // Kelas cacat yang sama dijaga di `hariDalamMinggu` (lib) dengan
    // `Date.UTC`; di sisi test, yang paling jujur adalah meminta teksnya
    // langsung dari Postgres.
    //
    // ⚠ DIUKUR, supaya tak salah didiagnosis lagi: balasan API **tidak**
    // terkena pergeseran ini. PostgREST mengembalikan kolom `date` sebagai
    // TEKS (`"2026-08-03"`) tanpa melewati objek Date sama sekali. Yang
    // menggeser hanya driver `pg`, yang dipakai test dan skrip — bukan
    // jalur produksi.
    const { rows } = await client.query(
      `SELECT to_char(tanggal, 'YYYY-MM-DD') AS tgl FROM timesheet_staf WHERE id = $1`,
      [barisId])
    const tgl = rows[0].tgl

    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
      tanggal: tgl, jam_kerja: 12,
    })
    // Persetujuan mengikat pada isi yang disetujui; mengubahnya sesudahnya
    // membuat yang menyetujui menandatangani sesuatu yang lain.
    expect(r.statusCode).toBe(409)
  })

  it('keputusan KEDUA ditolak — status lama ikut di WHERE', async () => {
    const r = await kirim('POST', `/api/v1/sdm/timesheet/${barisId}/putuskan`, {
      setujui: true,
    })
    expect(r.statusCode).toBe(409)
  })

  it('dua keputusan BERSAMAAN: tepat satu berhasil', async () => {
    // Pelajaran G1e & G1f, diterapkan sejak awal di sini: test berurutan
    // menguji pemeriksaan aplikasi, bukan penjaga basis. Yang membedakannya
    // adalah membuat keduanya berlomba.
    await client.query(
      `INSERT INTO timesheet_staf (pegawai_id, tanggal, jam_kerja, status)
       VALUES ($1, '2026-08-06', 8, 'diajukan')`, [pegawaiId])
    const { rows } = await client.query(
      `SELECT id FROM timesheet_staf WHERE pegawai_id = $1 AND tanggal = '2026-08-06'`,
      [pegawaiId])

    const url = `/api/v1/sdm/timesheet/${rows[0].id}/putuskan`
    const [a, b] = await Promise.all([
      kirim('POST', url, { setujui: true }),
      kirim('POST', url, { setujui: true }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })
})
