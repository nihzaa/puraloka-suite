import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import kendaliDokumenRoutes from '../kendali-dokumen.js'

/**
 * VERIFIKASI TANDA TANGAN ELEKTRONIK terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ENDPOINT INI ADA, DAN KENAPA TEST-NYA BEGINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `tanda_tangan_elektronik` menyimpan SHA-256 isi dokumen justru supaya bisa
 * dibuktikan dokumennya tak berubah sesudah ditandatangani (migrasi 215
 * menulis alasannya sendiri: "gambar coretan bisa disalin-tempel ke dokumen
 * mana pun; sidik tidak").
 *
 * Diukur 2026-08-16: tak ada satu pun jalan membandingkannya. Sidiknya
 * disimpan, dibaca dashboard sebagai keberadaan belaka, dan tak pernah diadu
 * dengan apa pun.
 *
 * Sidik yang tak pernah bisa dibandingkan tidak membuktikan apa-apa — dan
 * lebih buruk daripada tidak ada, karena orang melihat "ditandatangani
 * elektronik" lalu menyimpulkan keasliannya terjamin.
 *
 * Yang dijaga di sini, dan tak satu pun bisa dijawab tanpa basis:
 *
 *   • isi yang SAMA PERSIS → `utuh`
 *   • isi yang berubah SATU HURUF → `berubah` (inti seluruh mekanisme)
 *   • dokumen yang belum pernah ditandatangani DIBEDAKAN dari yang tak cocok
 *   • tanda tangan tenant lain tak ikut terbaca
 *
 * Fixture berprefiks [TEST-TTD] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string

const OBJEK = '00000000-0000-4000-8000-0000000ttd01'.replace('ttd', '111')
const ISI = 'Berita acara serah terima pekerjaan [TEST-TTD] — volume 120 m2.'

const post = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await db.query(`DELETE FROM tanda_tangan_elektronik WHERE objek_id = $1`, [OBJEK])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  userId = u[0].id
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 AND is_default AND is_active LIMIT 1', [userId])
  companyId = co[0].company_id

  await purge()

  app = Fastify({ logger: false })
  await app.register(kendaliDokumenRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  try { await purge() } finally {
    vi.restoreAllMocks()
    if (app) await app.close()
    await db.end()
  }
})

describe('verifikasi tanda tangan', () => {
  it('dokumen yang BELUM ditandatangani dibedakan dari yang tak cocok', async () => {
    // Menyamakan keduanya membuat yang kedua — satu-satunya yang benar-benar
    // gawat — tenggelam di antara dokumen yang memang belum ditandatangani.
    const r = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: ISI,
    })
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)
    expect(r.json().keadaan).toBe('belum_ditandatangani')
    expect(r.json().tanda_tangan).toHaveLength(0)
  })

  it('isi yang SAMA PERSIS dinyatakan utuh', async () => {
    const t = await post('/api/v1/kendali-dokumen/tanda-tangan', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: ISI,
      peran_penanda: 'pengawas',
    })
    expect(t.statusCode, t.body.slice(0, 300)).toBe(201)

    const r = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: ISI,
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().keadaan).toBe('utuh')
    expect(r.json().tanda_tangan[0].cocok).toBe(true)
  })

  it('berubah SATU HURUF sudah terdeteksi', async () => {
    // Inti seluruh mekanisme. Kalau ini lolos, sidiknya tak menjaga apa pun.
    const r = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK,
      isi: ISI.replace('120 m2', '128 m2'),
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().keadaan, 'volume diubah tapi dokumen dinyatakan utuh').toBe('berubah')
    expect(r.json().tanda_tangan[0].cocok).toBe(false)
    expect(r.json().pesan).toMatch(/BERBEDA/)
  })

  it('spasi di akhir pun mengubah vonis — sidik tak menoleransi apa pun', async () => {
    const r = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: `${ISI} `,
    })
    expect(r.json().keadaan).toBe('berubah')
  })

  it('sidik dihitung SERVER — dua permintaan isi sama menghasilkan sidik sama', async () => {
    const a = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: ISI,
    })
    const b = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: ISI,
    })
    expect(a.json().sidik_sekarang).toBe(b.json().sidik_sekarang)
    expect(a.json().sidik_sekarang).toMatch(/^[0-9a-f]{64}$/)
  })

  it('tanda tangan tenant LAIN tidak ikut terbaca', async () => {
    const { rows } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return

    // Penanda tangan HARUS orang lain: `ttd_unik` adalah
    // (jenis_objek, objek_id, penanda_tangan) TANPA company — jadi pengguna
    // yang sama tak bisa menandatangani objek yang sama dua kali, bahkan
    // lintas tenant. Itu perilaku yang benar dan bukan yang sedang diuji di
    // sini; yang diuji apakah barisnya IKUT TERBACA.
    const { rows: lain } = await db.query(
      'SELECT id FROM users WHERE id <> $1 LIMIT 1', [userId])
    if (!lain.length) return

    await db.query(
      `INSERT INTO tanda_tangan_elektronik
         (company_id, jenis_objek, objek_id, penanda_tangan, sidik_isi)
       VALUES ($1,'berita_acara',$2,$3,$4)`,
      [rows[0].id, OBJEK, lain[0].id,
        '0000000000000000000000000000000000000000000000000000000000000000'])

    const r = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK, isi: ISI,
    })
    // Hanya tanda tangan milik company sesi — yang tenant lain tak ikut.
    expect(r.json().tanda_tangan).toHaveLength(1)
    expect(r.json().keadaan).toBe('utuh')
  })

  it('isi kosong ditolak 400, bukan dianggap sah', async () => {
    const r = await post('/api/v1/kendali-dokumen/tanda-tangan/verifikasi', {
      jenis_objek: 'berita_acara', objek_id: OBJEK,
    })
    expect(r.statusCode).toBe(400)
  })
})
