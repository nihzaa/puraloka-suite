/**
 * Test rute kredensial — yang diuji adalah KONTRAKNYA, bukan CRUD-nya.
 *
 * Kontrak itu satu kalimat: nilai kredensial boleh MASUK ke server, tidak
 * pernah keluar. Test di bawah menyerangnya dari beberapa arah — daftar,
 * simpan, hapus, uji koneksi — dan memeriksa bahwa TAK SATU PUN respons
 * memuat nilainya.
 *
 * Penjaga statis `audit-kredensial-tak-bocor.mjs` sudah menjaga bentuk KODE;
 * test ini menjaga bentuk RESPONS. Keduanya perlu: penjaga tak bisa melihat
 * nilai yang bocor lewat jalur yang tak dikenalinya, dan test tak bisa
 * melihat `select('*')` di rute yang tak dipanggilnya.
 *
 * ISOLASI: memakai kunci nyata dari katalog (`RESEND_API_KEY`) tetapi selalu
 * membersihkannya di `afterAll`. Enam shard CI berbagi satu basis data, jadi
 * baris yang tertinggal akan membuat shard lain melihat "sudah tersetel"
 * padahal tidak.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import kredensialRoutes from '../kredensial.js'

let app: FastifyInstance
let client: Client
let adminAuth = ''
let pmAuth = ''

const KUNCI_UJI = 'RESEND_API_KEY'
const NILAI_UJI = 're_uji_palsu_0123456789abcdef'

function actAs(a: string) {
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
}

const req = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await client.query(`DELETE FROM app_credentials WHERE kunci = $1`, [KUNCI_UJI])
}

beforeAll(async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY ||= 'kunci-uji-integrasi-yang-cukup-panjang'
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(kredensialRoutes)
  await app.ready()
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  pmAuth = (await authIdForRole(client, 'pm')) ?? ''
  await bersihkan()
}, 60_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  await bersihkan()
  await app.close()
  await client.end()
})

describe('kredensial — nilai TIDAK PERNAH keluar', () => {
  it('GET tak memuat nilai, hanya 4 karakter terakhir', async () => {
    actAs(adminAuth)
    await req('PUT', `/api/v1/kredensial/${KUNCI_UJI}`, { nilai: NILAI_UJI })

    const r = await req('GET', '/api/v1/kredensial')
    expect(r.statusCode).toBe(200)

    // Serangan paling langsung: cari nilainya di SELURUH badan respons.
    expect(r.body).not.toContain(NILAI_UJI)
    expect(r.body).not.toContain('nilai_enc')

    const baris = JSON.parse(r.body).data.find((d: { kunci: string }) => d.kunci === KUNCI_UJI)
    expect(baris.empat_akhir).toBe('cdef')
    expect(baris.sumber).toBe('tenant')
    expect(baris).not.toHaveProperty('nilai')
  })

  it('PUT membalas metadata saja', async () => {
    actAs(adminAuth)
    const r = await req('PUT', `/api/v1/kredensial/${KUNCI_UJI}`, { nilai: NILAI_UJI })
    expect(r.statusCode).toBe(200)
    expect(r.body).not.toContain(NILAI_UJI)
    expect(JSON.parse(r.body).empat_akhir).toBe('cdef')
  })

  it('yang tersimpan di basis TERENKRIPSI, bukan plaintext', async () => {
    actAs(adminAuth)
    await req('PUT', `/api/v1/kredensial/${KUNCI_UJI}`, { nilai: NILAI_UJI })

    const { rows } = await client.query(
      `SELECT nilai_enc FROM app_credentials WHERE kunci = $1`, [KUNCI_UJI])
    expect(rows).toHaveLength(1)
    expect(rows[0].nilai_enc).not.toContain(NILAI_UJI)
    expect(rows[0].nilai_enc.startsWith('v1:')).toBe(true)
  })
})

describe('kredensial — katalog & sumber', () => {
  it('menampilkan SELURUH katalog, termasuk yang belum disetel', async () => {
    actAs(adminAuth)
    await bersihkan()
    const body = JSON.parse((await req('GET', '/api/v1/kredensial')).body)

    // Tanpa ini, admin tak punya cara tahu kunci apa yang dibutuhkan sistem
    // sampai sesuatu gagal — dan kegagalan integrasi biasanya senyap.
    expect(body.data.length).toBeGreaterThan(3)
    const belum = body.data.find((d: { kunci: string }) => d.kunci === 'OPENAI_API_KEY')
    expect(belum.empat_akhir).toBeNull()
    expect(['tidak-ada', 'env']).toContain(belum.sumber)
  })

  it('menyimpan lalu menghapus mengembalikan sumber ke semula', async () => {
    actAs(adminAuth)
    await req('PUT', `/api/v1/kredensial/${KUNCI_UJI}`, { nilai: NILAI_UJI })

    const hapus = await req('DELETE', `/api/v1/kredensial/${KUNCI_UJI}`)
    expect(hapus.statusCode).toBe(200)
    // Menghapus kredensial tenant BUKAN berarti integrasinya mati — kalau env
    // server terisi, sistem jatuh ke sana. Respons menyatakannya eksplisit.
    expect(JSON.parse(hapus.body)).toHaveProperty('jatuh_ke_env')

    const body = JSON.parse((await req('GET', '/api/v1/kredensial')).body)
    const baris = body.data.find((d: { kunci: string }) => d.kunci === KUNCI_UJI)
    expect(baris.empat_akhir).toBeNull()
    expect(baris.sumber).not.toBe('tenant')
  })

  it('menghapus yang belum disetel → 404, bukan sukses palsu', async () => {
    actAs(adminAuth)
    await bersihkan()
    const r = await req('DELETE', `/api/v1/kredensial/${KUNCI_UJI}`)
    expect(r.statusCode).toBe(404)
  })
})

describe('kredensial — validasi', () => {
  it('menolak kunci yang tak dikenal katalog', async () => {
    actAs(adminAuth)
    const r = await req('PUT', '/api/v1/kredensial/KUNCI_KARANGAN', { nilai: 'x' })
    expect(r.statusCode).toBe(422)
  })

  it('menolak nilai kosong', async () => {
    actAs(adminAuth)
    const r = await req('PUT', `/api/v1/kredensial/${KUNCI_UJI}`, { nilai: '   ' })
    expect(r.statusCode).toBe(422)
  })
})

describe('kredensial — otorisasi (ADR-004: permission, bukan peran)', () => {
  it('tanpa permission manage: PUT ditolak', async () => {
    actAs(pmAuth)
    const r = await req('PUT', `/api/v1/kredensial/${KUNCI_UJI}`, { nilai: NILAI_UJI })
    expect([403, 401]).toContain(r.statusCode)
  })

  it('tanpa permission manage: DELETE ditolak', async () => {
    actAs(pmAuth)
    const r = await req('DELETE', `/api/v1/kredensial/${KUNCI_UJI}`)
    expect([403, 401]).toContain(r.statusCode)
  })

  it('tanpa autentikasi: ditolak', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/kredensial' })
    expect([401, 403]).toContain(r.statusCode)
  })
})

describe('kredensial — uji koneksi', () => {
  it('membalas 200 walau kredensialnya belum ada', async () => {
    actAs(adminAuth)
    await bersihkan()
    const r = await req('POST', `/api/v1/kredensial/${KUNCI_UJI}/uji`, {})
    // Hasil uji yang "gagal" adalah INFORMASI yang diminta, bukan kegagalan
    // permintaan. 5xx akan membuat UI menampilkan galat jaringan alih-alih
    // pesan yang bisa ditindaklanjuti.
    expect(r.statusCode).toBe(200)
    const b = JSON.parse(r.body)
    expect(b.ok).toBe(false)
    expect(b.yang_diuji).toBe('tidak-ada')
  })

  it('menandai apakah yang diuji nilai ketikan atau tersimpan', async () => {
    actAs(adminAuth)
    const r = await req('POST', `/api/v1/kredensial/${KUNCI_UJI}/uji`, { nilai: 'palsu-tak-berlaku' })
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body).yang_diuji).toBe('nilai-yang-diketik')
    // Diuji TANPA disimpan — inilah yang membuat "uji dulu sebelum menimpa
    // kunci lama" mungkin.
    const { rows } = await client.query(
      `SELECT 1 FROM app_credentials WHERE kunci = $1`, [KUNCI_UJI])
    expect(rows).toHaveLength(0)
  })

  it('respons uji tak pernah memuat nilainya', async () => {
    actAs(adminAuth)
    const r = await req('POST', `/api/v1/kredensial/${KUNCI_UJI}/uji`, { nilai: NILAI_UJI })
    expect(r.body).not.toContain(NILAI_UJI)
  })
})
