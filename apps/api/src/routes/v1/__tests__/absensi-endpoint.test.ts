import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import absensiRoutes from '../absensi.js'

/**
 * ABSENSI LAPANGAN — endpoint terhadap Postgres NYATA.
 *
 * ── Kenapa test ini ada
 *
 * Modul ini hidup sejak migrasi 191 dan diukur 2026-08-08: **nol test**. Yang
 * dijaganya bukan hal remeh — `porsi_hari` dan `jam_lembur` adalah dua besaran
 * yang menentukan UPAH TUKANG.
 *
 * Aritmetikanya kini di `lib/rekap-absensi.ts` (15 test, murni). Yang HANYA
 * bisa dijawab di sini:
 *
 *   • upsert benar-benar menimpa, bukan menggandakan — mandor sering
 *     memperbaiki absensi hari yang sama, dan baris ganda membayar dua kali
 *   • validasi porsi/lembur menolak lewat jalur HTTP dengan pesan yang bisa
 *     dibaca mandor, bukan pesan constraint Postgres
 *   • lingkup milik tenant lain membalas 404, bukan mengembalikan datanya
 *   • rekap membaca yang benar-benar tersimpan
 *
 * Fixture memakai tanggal **2020**, bukan lebih lama: constraint
 * `absensi_tanggal_masuk_akal` (migrasi 191) menolak apa pun sebelum
 * 2020-01-01. Percobaan pertama memakai 2019 dan seluruh POST membalas 500 —
 * dan itu justru bukti bahwa constraint-nya bekerja.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let scopeId: string
let workerA: string
let workerB: string

const TGL = '2020-03-04'
const TGL2 = '2020-03-05'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM absensi_harian WHERE tanggal BETWEEN '2020-01-01' AND '2020-12-31'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: s } = await client.query(
    `SELECT ws.id FROM work_scopes ws
       JOIN mandor_assignments ma ON ma.id = ws.assignment_id
       JOIN projects p ON p.id = ma.project_id
      WHERE p.company_id IS NOT NULL LIMIT 1`)
  if (!s.length) throw new Error('tak ada work_scope milik tenant untuk fixture')
  scopeId = s[0].id

  const { rows: w } = await client.query(`SELECT id FROM workers ORDER BY created_at LIMIT 2`)
  if (w.length < 2) throw new Error('butuh minimal 2 worker untuk fixture')
  workerA = w[0].id
  workerB = w[1].id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(absensiRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /api/v1/absensi — validasi', () => {
  it('menolak tanpa scope_id/tanggal/entri', async () => {
    const r = await post('/api/v1/absensi', { scope_id: scopeId })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib diisi/i)
  })

  it('404 untuk lingkup yang bukan milik tenant ini', async () => {
    const r = await post('/api/v1/absensi', {
      scope_id: '00000000-0000-0000-0000-0000000000ff',
      tanggal: TGL,
      entri: [{ worker_id: workerA, porsi_hari: 1 }],
    })
    // 404, bukan 403: membedakan "tidak ada" dari "bukan milik Anda"
    // memberi tahu penanya bahwa lingkup itu ADA di tenant lain.
    expect(r.statusCode).toBe(404)
  })

  // Porsi > 1 adalah cara paling mudah menggandakan upah tanpa terlihat
  // mencurigakan: satu baris "1,5 hari" terbaca wajar sekilas.
  it('menolak porsi_hari di luar 0..1 dengan pesan yang bisa dibaca mandor', async () => {
    const r = await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL,
      entri: [{ worker_id: workerA, porsi_hari: 1.5 }],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/Porsi hari harus antara 0 dan 1/i)
    // Pesannya menuntun ke tempat yang benar, bukan sekadar menolak.
    expect(r.json().error).toMatch(/lembur/i)
  })

  it('menolak porsi negatif', async () => {
    const r = await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL,
      entri: [{ worker_id: workerA, porsi_hari: -1 }],
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak jam lembur di luar 0..16', async () => {
    const r = await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL,
      entri: [{ worker_id: workerA, jam_lembur: 20 }],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/Jam lembur/i)
  })

  // Absensi masa depan = upah dibayar untuk kerja yang belum terjadi.
  it('menolak tanggal yang belum terjadi', async () => {
    const besok = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const r = await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: besok,
      entri: [{ worker_id: workerA, porsi_hari: 1 }],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/belum terjadi/i)
  })

  it('menolak entri tanpa worker_id', async () => {
    const r = await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL,
      entri: [{ porsi_hari: 1 } as unknown as { worker_id: string }],
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('POST /api/v1/absensi — simpan & perbaiki', () => {
  it('menyimpan absensi beberapa pekerja sekaligus', async () => {
    const r = await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL,
      entri: [
        { worker_id: workerA, porsi_hari: 1, jam_lembur: 2 },
        { worker_id: workerB, porsi_hari: 0.5 },
      ],
    })
    expect(r.statusCode).toBeLessThan(300)

    const { rows } = await client.query(
      `SELECT worker_id, porsi_hari::float8 p, jam_lembur::float8 j
         FROM absensi_harian WHERE scope_id = $1 AND tanggal = $2`, [scopeId, TGL])
    expect(rows).toHaveLength(2)
    const a = rows.find((x) => x.worker_id === workerA)!
    expect(a.p).toBe(1)
    expect(a.j).toBe(2)
  })

  // INVARIAN PALING MAHAL: mandor sering memperbaiki absensi hari yang sama.
  // Kalau upsert-nya justru menambah baris, pekerja dibayar dua kali dan tak
  // ada satu pun galat yang muncul.
  it('memperbaiki absensi hari yang sama MENIMPA, bukan menggandakan', async () => {
    await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL,
      entri: [{ worker_id: workerA, porsi_hari: 0.5, jam_lembur: 0 }],
    })

    const { rows } = await client.query(
      `SELECT porsi_hari::float8 p, jam_lembur::float8 j FROM absensi_harian
        WHERE scope_id = $1 AND tanggal = $2 AND worker_id = $3`, [scopeId, TGL, workerA])
    expect(rows).toHaveLength(1)
    expect(rows[0].p).toBe(0.5)
    expect(rows[0].j).toBe(0)
  })

  it('porsi_hari default 1 bila tak disebut', async () => {
    await post('/api/v1/absensi', {
      scope_id: scopeId, tanggal: TGL2,
      entri: [{ worker_id: workerB }],
    })
    const { rows } = await client.query(
      `SELECT porsi_hari::float8 p FROM absensi_harian
        WHERE scope_id = $1 AND tanggal = $2 AND worker_id = $3`, [scopeId, TGL2, workerB])
    expect(rows[0].p).toBe(1)
  })
})

describe('GET /api/v1/absensi/rekap', () => {
  it('menolak tanpa rentang tanggal', async () => {
    const r = await get(`/api/v1/absensi/rekap?scope_id=${scopeId}`)
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk lingkup bukan milik tenant', async () => {
    const r = await get(
      `/api/v1/absensi/rekap?scope_id=00000000-0000-0000-0000-0000000000ff&dari=2020-01-01&sampai=2020-12-31`)
    expect(r.statusCode).toBe(404)
  })

  // Menutup jalur penuh: yang tersimpan lewat POST benar-benar terbaca di
  // rekap, dengan angka yang sama. Pustaka murni sudah mengunci hitungannya;
  // yang diuji di sini adalah sambungannya ke basis.
  it('merekap yang benar-benar tersimpan, hari & lembur terpisah', async () => {
    const r = await get(
      `/api/v1/absensi/rekap?scope_id=${scopeId}&dari=2020-01-01&sampai=2020-12-31`)
    expect(r.statusCode).toBe(200)
    const j = r.json()

    const a = j.rekap.find((x: { worker_id: string }) => x.worker_id === workerA)
    const b = j.rekap.find((x: { worker_id: string }) => x.worker_id === workerB)

    // A: 0,5 hari di TGL (sesudah diperbaiki). B: 0,5 di TGL + 1 di TGL2.
    expect(a.hari).toBe(0.5)
    expect(b.hari).toBe(1.5)
    expect(b.jumlah_catatan).toBe(2)

    // Total diturunkan dari baris yang sama — bukan dihitung ulang dari query
    // lain yang bisa berselisih diam-diam.
    expect(j.total_hari).toBe(
      j.rekap.reduce((s: number, x: { hari: number }) => s + x.hari, 0))
  })

  it('rentang tanpa data mengembalikan rekap kosong, bukan galat', async () => {
    const r = await get(
      `/api/v1/absensi/rekap?scope_id=${scopeId}&dari=2020-06-01&sampai=2020-06-30`)
    expect(r.statusCode).toBe(200)
    expect(r.json().rekap).toEqual([])
    expect(r.json().total_hari).toBe(0)
  })
})
