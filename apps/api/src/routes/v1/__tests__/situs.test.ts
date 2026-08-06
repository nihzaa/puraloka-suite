import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import situsRoutes from '../situs.js'

// ============================================================================
// Endpoint konten situs publik (compro).
//
// ── Yang dijaga test ini
//
//   1. **Kontras ditolak di PINTU MASUK.** Warna yang gagal WCAG tak boleh
//      tersimpan lalu merusak halaman diam-diam. Ini rem kedua dari tiga
//      (spec §4.2) — dua lainnya CHECK constraint di DB dan budget dpr di 3D.
//
//   2. **Validator harus sadar konteks.** Kuning merek #FFD600 lulus di navy
//      (11,77:1) dan gagal di putih (1,41:1). Test memastikan API menerima
//      warna merek Puraloka sendiri — validator naif akan menolaknya.
//
//   3. **Endpoint publik tak membocorkan kolom internal.** Ia berjalan TANPA
//      auth, jadi RLS tak punya konteks apa pun untuk menyaring. Satu-satunya
//      yang menahan adalah daftar kolom di `select` — dan itu mudah longgar
//      saat seseorang menambah field nanti.
//
// ── Kenapa transaksi + ROLLBACK
//
// Sama dengan `companies-otorisasi.test.ts`: test ini menulis ke schema
// `public` bersama. Tanpa transaksi, sisanya terlihat shard lain di CI.
//
// ── Yang di-stub: HANYA verifikasi token
//
// `supabaseAuth.auth.getUser` — itu autentikasi, bukan otorisasi. Permission
// `situs:view`/`situs:manage`, RLS, dan tabel semuanya asli.
// ============================================================================

let app: FastifyInstance
let c: Client
let authAdmin: string

const actAs = (authId: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: authId } }, error: null } as never,
  )

const kirim = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
) =>
  app.inject({
    method,
    url,
    payload: payload as never,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(situsRoutes)
  await app.ready()

  c = await createRlsClient()
  await c.query('BEGIN')

  // User yang benar-benar punya situs:manage — dicari, bukan dibuat. User
  // buatan bisa kebetulan lolos lewat jalur seed yang tak terduga.
  const { rows } = await c.query(
    `SELECT u.auth_id
       FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE u.is_active AND u.auth_id IS NOT NULL
        AND p.key = 'situs:manage'
      LIMIT 1`,
  )
  if (!rows[0]) {
    throw new Error(
      'prasyarat gagal: tak ada user aktif dengan permission situs:manage. ' +
        'Migrasi 205 membuat permission-nya; ia masih harus di-assign ke role.',
    )
  }
  authAdmin = rows[0].auth_id
}, 120_000)

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await app?.close()
  await c?.end()
})

describe('PUT /api/v1/situs/merek — kontras ditolak di pintu masuk', () => {
  it('menolak aksen yang tenggelam di latar landing', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/merek', {
      warna_utama: '#003366',
      warna_aksen: '#0A2A4A',
    })
    expect(r.statusCode).toBe(422)
    const b = r.json()
    expect(b.error).toMatch(/kontras/i)
    // Pesannya harus menyebut angka dan latar — admin perlu tahu apa yang salah.
    expect(Array.isArray(b.detail)).toBe(true)
    expect(b.detail.join(' ')).toMatch(/:1/)
  })

  it('MENERIMA kuning merek Puraloka — validator naif akan menolaknya', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/merek', {
      warna_utama: '#003366',
      warna_aksen: '#FFD600',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().data.warna_aksen).toBe('#FFD600')
  })

  it('menolak hex yang bentuknya salah sebelum menyentuh DB', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/merek', {
      warna_utama: 'biru',
      warna_aksen: '#FFD600',
    })
    expect(r.statusCode).toBe(422)
  })

  it('menolak tanpa auth', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/situs/merek',
      payload: { warna_utama: '#003366', warna_aksen: '#FFD600' },
    })
    expect(r.statusCode).toBe(401)
  })
})

describe('PUT /api/v1/situs/konten', () => {
  it('menyimpan lalu mengembalikan nilainya', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/konten', {
      kunci: 'uji.kontak',
      nilai: '081311081813',
    })
    expect(r.statusCode).toBe(200)

    actAs(authAdmin)
    const b = await kirim('GET', '/api/v1/situs/konten')
    expect(b.statusCode).toBe(200)
    expect(b.json().data['uji.kontak']).toBe('081311081813')
  })

  it('upsert: kunci sama menimpa, bukan menggandakan', async () => {
    for (const v of ['satu', 'dua']) {
      actAs(authAdmin)
      await kirim('PUT', '/api/v1/situs/konten', { kunci: 'uji.upsert', nilai: v })
    }
    actAs(authAdmin)
    const b = await kirim('GET', '/api/v1/situs/konten')
    expect(b.json().data['uji.upsert']).toBe('dua')
  })

  it('menerima nilai objek, bukan hanya teks', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/konten', {
      kunci: 'uji.tautan',
      nilai: { label: 'Lihat proyek', url: '/portofolio' },
    })
    expect(r.statusCode).toBe(200)

    actAs(authAdmin)
    const b = await kirim('GET', '/api/v1/situs/konten')
    expect(b.json().data['uji.tautan']).toEqual({
      label: 'Lihat proyek',
      url: '/portofolio',
    })
  })

  it('menolak kunci kosong', async () => {
    actAs(authAdmin)
    const r = await kirim('PUT', '/api/v1/situs/konten', { nilai: 'x' })
    expect(r.statusCode).toBe(422)
  })
})

describe('PATCH /api/v1/situs/seksi — rem varian', () => {
  it('menolak varian di luar daftar yang dirancang', async () => {
    actAs(authAdmin)
    const r = await kirim('PATCH', '/api/v1/situs/seksi', {
      kunci: 'portofolio',
      varian: 'apa-saja',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/varian/i)
  })

  it('membalas 404 untuk seksi yang tak ada, bukan 200 senyap', async () => {
    actAs(authAdmin)
    const r = await kirim('PATCH', '/api/v1/situs/seksi', {
      kunci: 'seksi-yang-tidak-pernah-ada',
      aktif: false,
    })
    expect(r.statusCode).toBe(404)
  })
})
