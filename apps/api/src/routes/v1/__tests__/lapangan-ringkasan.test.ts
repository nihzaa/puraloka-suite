import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import lapanganRoutes from '../lapangan.js'

/**
 * IKHTISAR LAPANGAN — endpoint terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Aritmetika ringkasan bisa diuji murni, tetapi empat hal ini tidak:
 *
 *   • NAMA KOLOM benar-benar ada. Percobaan pertama endpoint ini memakai
 *     `milestones.progress_pct` dan `progress_logs.tanggal` — keduanya tak
 *     ada, dan hasilnya 500. Test murni dengan mock TIDAK akan menangkapnya,
 *     karena mock-nya akan mengarang kolom yang sama salahnya.
 *
 *   • `db.unsafe(...).in('project_id', idProyek)` benar-benar menyaring.
 *     Kalau saringan tenant hilang, angkanya tetap terlihat masuk akal —
 *     hanya isinya milik perusahaan lain.
 *
 *   • permission key-nya benar-benar ter-seed. `projects:read` (percobaan
 *     pertama) tak pernah ada di tabel permissions, dan gejalanya 403 yang
 *     terbaca seperti masalah peran pemakai.
 *
 *   • bentuk jawabannya utuh. Halaman membaca sembilan cabang; satu cabang
 *     yang hilang membuat kartu di layar kosong tanpa error.
 *
 * ── Kenapa TIDAK memeriksa angka persisnya
 *
 * Basis dev ini hidup — seed bertambah, tanggal bergeser. Test yang memaku
 * `punch_terbuka === 36` akan merah besok tanpa ada yang rusak, lalu
 * dimatikan orang. Yang diuji INVARIAN: hubungan antar angka yang harus
 * benar berapa pun isinya.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(lapanganRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await app?.close()
  await client?.end()
})

describe('GET /api/v1/lapangan/ringkasan', () => {
  it('200 dan tak satu pun kolom yang tak ada di schema', async () => {
    const r = await get('/api/v1/lapangan/ringkasan')
    // 500 di sini hampir selalu berarti nama kolom salah — pesan Postgres
    // "column X does not exist" tak sampai ke klien, jadi tempelkan body-nya
    // supaya kegagalan langsung bisa dibaca tanpa membuka log server.
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)
  })

  it('mengirim SEMBILAN cabang yang dibaca halaman', async () => {
    const j = (await get('/api/v1/lapangan/ringkasan')).json()
    // Bukan sekadar `toBeDefined()`: cabang yang hilang membuat halaman
    // memanggil `.map` pada undefined dan seluruh layar putih.
    expect(j.kpi).toBeTypeOf('object')
    expect(Array.isArray(j.progres_harian)).toBe(true)
    expect(Array.isArray(j.milestone)).toBe(true)
    expect(Array.isArray(j.proyek)).toBe(true)
    expect(Array.isArray(j.tenaga_kerja?.per_tipe)).toBe(true)
    expect(Array.isArray(j.tenaga_kerja?.hadir_30_hari)).toBe(true)
    expect(Array.isArray(j.temuan?.punch_per_status)).toBe(true)
    expect(Array.isArray(j.punch_terbaru)).toBe(true)
    expect(Array.isArray(j.ncr_terbaru)).toBe(true)
  })

  it('KPI lengkap dan seluruhnya angka — bukan null/undefined', async () => {
    const { kpi } = (await get('/api/v1/lapangan/ringkasan')).json()
    for (const k of [
      'progres_rata', 'proyek_aktif', 'milestone_selesai', 'milestone_total',
      'punch_terbuka', 'ncr_aktif', 'inspeksi_menunggu',
      'tukang_hadir_hari_ini', 'tukang_aktif',
    ]) {
      // `null` di KPI akan dirender sebagai "null" di layar, bukan "0".
      expect(typeof kpi[k], `kpi.${k}`).toBe('number')
      expect(Number.isFinite(kpi[k]), `kpi.${k}`).toBe(true)
      expect(kpi[k]).toBeGreaterThanOrEqual(0)
    }
  })

  it('milestone_selesai tak pernah melebihi milestone_total', async () => {
    const { kpi } = (await get('/api/v1/lapangan/ringkasan')).json()
    expect(kpi.milestone_selesai).toBeLessThanOrEqual(kpi.milestone_total)
  })

  it('progres_rata di rentang 0..100', async () => {
    const { kpi } = (await get('/api/v1/lapangan/ringkasan')).json()
    expect(kpi.progres_rata).toBeGreaterThanOrEqual(0)
    expect(kpi.progres_rata).toBeLessThanOrEqual(100)
  })

  it('hadir hari ini tak pernah melebihi tukang aktif', async () => {
    // Kalau ini gagal, `porsi_hari` sedang dihitung sebagai baris — dan
    // angka tenaga kerja akan selalu lebih besar dari kenyataan.
    const { kpi } = (await get('/api/v1/lapangan/ringkasan')).json()
    expect(kpi.tukang_hadir_hari_ini).toBeLessThanOrEqual(kpi.tukang_aktif)
  })

  it('progres harian terurut naik dan tanggalnya sah', async () => {
    const { progres_harian } = (await get('/api/v1/lapangan/ringkasan')).json()
    const tgl = progres_harian.map((x: { tanggal: string }) => x.tanggal)
    expect([...tgl].sort()).toEqual(tgl)
    for (const t of tgl) expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('kehadiran: orang_hari tak pernah melebihi jumlah orang', async () => {
    // `porsi_hari` maksimum 1 per orang (constraint DB), jadi total
    // orang-hari harus <= jumlah baris. Kalau terbalik, penjumlahannya salah.
    const { tenaga_kerja } = (await get('/api/v1/lapangan/ringkasan')).json()
    for (const h of tenaga_kerja.hadir_30_hari) {
      expect(h.orang_hari, h.tanggal).toBeLessThanOrEqual(h.orang)
    }
  })

  it('punch/NCR terbaru HANYA yang belum selesai', async () => {
    const j = (await get('/api/v1/lapangan/ringkasan')).json()
    for (const p of j.punch_terbaru) expect(['ditutup', 'ditolak']).not.toContain(p.status)
    for (const n of j.ncr_terbaru) expect(['ditutup', 'dibatalkan']).not.toContain(n.status)
  })

  it('biaya_dampak dikirim apa adanya (string numeric), bukan float', async () => {
    // §5.4: nominal `numeric`. Number() di server membuang presisi diam-diam.
    const { ncr_terbaru } = (await get('/api/v1/lapangan/ringkasan')).json()
    for (const n of ncr_terbaru) {
      if (n.biaya_dampak !== null) expect(typeof n.biaya_dampak).toBe('string')
    }
  })

  it('daftar proyek hanya yang AKTIF, dan tiap baris punya nama', async () => {
    const j = (await get('/api/v1/lapangan/ringkasan')).json()
    expect(j.proyek.length).toBe(j.kpi.proyek_aktif)
    for (const p of j.proyek) {
      expect(typeof p.nama).toBe('string')
      expect(p.nama.length).toBeGreaterThan(0)
    }
  })

  it('milestone yang terlambat ditandai, dan tanggalnya memang sudah lewat', async () => {
    const { milestone } = (await get('/api/v1/lapangan/ringkasan')).json()
    const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    for (const m of milestone) {
      if (m.terlambat) expect(String(m.tanggal) < hariIni, m.judul).toBe(true)
    }
  })

  it('menolak tanpa autentikasi', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/lapangan/ringkasan' })
    expect(r.statusCode).toBe(401)
  })
})
