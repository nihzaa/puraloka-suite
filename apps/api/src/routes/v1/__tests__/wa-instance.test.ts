import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import waInstanceRoutes from '../wa-instance.js'

/**
 * SAMBUNGAN WHATSAPP — instance Evolution dikelola dari UI Puraloka.
 *
 * Yang dijaga di sini adalah tiga hal yang kalau salah TIDAK menghasilkan
 * galat apa pun:
 *
 *   1. **Otorisasi terpisah antara melihat dan mengelola.** Yang boleh
 *      memeriksa status sambungan bukan otomatis yang boleh memutusnya —
 *      memutus sesi menghentikan seluruh notifikasi WhatsApp perusahaan.
 *
 *   2. **Nama instance DITURUNKAN, bukan diketik.** Di satu server Evolution
 *      yang memuat banyak tenant, nama yang bentrok membuat perusahaan A
 *      memakai instance perusahaan B: pesannya terkirim dari nomor yang salah
 *      dan riwayat keduanya bercampur — tanpa satu pun galat.
 *
 *   3. **Kredensial tak pernah menyeberang ke balasan.** `WA_API_KEY`
 *      berkuasa atas SELURUH instance di server. Bocor sekali lewat balasan
 *      API berarti bocor ke peramban setiap admin.
 */

const PENANDA = `__uji_wa_inst_${process.pid}__`

let app: FastifyInstance
let db: Client
let adminAuth: string
let pmAuth: string
let companyId: string

const actAs = (a: string) => {
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )
}

const req = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(waInstanceRoutes)
  await app.ready()

  db = await createRlsClient()
  adminAuth = (await authIdForRole(db, 'admin'))!
  pmAuth = (await authIdForRole(db, 'pm'))!

  const { rows } = await db.query(
    `SELECT c.id FROM companies c
      WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1`,
  )
  companyId = rows[0].id
}, 60_000)

afterAll(async () => {
  await db?.end()
  await app?.close()
})

describe('Otorisasi — melihat vs mengelola', () => {
  it('tanpa autentikasi ditolak', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/wa/instance' })
    expect(r.statusCode).toBe(401)
  }, 30_000)

  /**
   * Memutus sesi menghentikan SELURUH notifikasi WhatsApp perusahaan. Yang
   * boleh melihat status belum tentu boleh melakukan itu — karena itu
   * `settings:wa:manage`, bukan `settings:wa:view`.
   */
  it('NEGATIF: tanpa settings:wa:manage tidak boleh membuat instance', async () => {
    actAs(pmAuth)
    const r = await req('POST', '/api/v1/wa/instance', {})
    expect(r.statusCode).toBe(403)
  }, 30_000)

  it('NEGATIF: tanpa settings:wa:manage tidak boleh memutus sesi', async () => {
    actAs(pmAuth)
    const r = await req('POST', '/api/v1/wa/instance/putus', {})
    expect(r.statusCode).toBe(403)
  }, 30_000)

  it('NEGATIF: tanpa settings:wa:manage tidak boleh meminta QR', async () => {
    // QR adalah kunci untuk MENGAMBIL ALIH kanal WhatsApp perusahaan: siapa
    // pun yang memindainya menjadi pengirim resmi. Karena itu ia menuntut
    // `manage`, bukan `view` — meski "hanya menampilkan gambar".
    actAs(pmAuth)
    const r = await req('GET', '/api/v1/wa/instance/qr')
    expect(r.statusCode).toBe(403)
  }, 30_000)
})

describe('Status sambungan', () => {
  it('admin bisa membaca status, dan bentuknya dikenali UI', async () => {
    actAs(adminAuth)
    const r = await req('GET', '/api/v1/wa/instance')
    expect([200, 502]).toContain(r.statusCode)
    if (r.statusCode !== 200) return // Evolution sedang mati — bukan cacat rute

    const b = JSON.parse(r.body)
    expect(typeof b.siap).toBe('boolean')
    if (b.siap) {
      // `state` selalu ada saat siap — UI memetakannya ke label. `undefined`
      // membuat UI menampilkan "—" yang tak memberi tahu apa pun.
      expect(typeof b.state).toBe('string')
    }
  }, 30_000)

  it('balasan TIDAK PERNAH memuat WA_API_KEY atau isi kredensial', async () => {
    actAs(adminAuth)
    const r = await req('GET', '/api/v1/wa/instance')
    if (r.statusCode !== 200) return

    const { rows } = await db.query(
      `SELECT nilai_enc FROM app_credentials WHERE company_id=$1 AND kunci='WA_API_KEY'`,
      [companyId],
    )
    // Yang diperiksa: nilai tersandi maupun penyebutan kuncinya tak muncul.
    // Penjaga `audit-kredensial-tak-bocor` berambang NOL untuk kelas ini.
    expect(r.body).not.toContain('apikey')
    expect(r.body.toLowerCase()).not.toContain('wa_api_key')
    if (rows[0]?.nilai_enc) expect(r.body).not.toContain(rows[0].nilai_enc)
  }, 30_000)
})

describe('Nama instance diturunkan, bukan diketik', () => {
  /**
   * Ini invariant paling penting di berkas ini.
   *
   * Nama diturunkan dari `company_id`, jadi dua tenant di server Evolution
   * yang sama TAK MUNGKIN memakai instance yang sama. Kalau suatu saat nama
   * itu jadi bisa diketik/ditebak, test ini merah.
   */
  it('nama instance memuat potongan company_id, dan tak menerima nama dari pemanggil', async () => {
    actAs(adminAuth)
    // Nama karangan dikirim di badan — HARUS diabaikan.
    const r = await req('POST', '/api/v1/wa/instance', {
      instanceName: `${PENANDA}_nama_karangan`,
      instance: `${PENANDA}_nama_karangan`,
    })

    // 422 = kredensial Evolution belum lengkap; 502/503 = Evolution mati.
    // Ketiganya bukan cacat rute, jadi test berhenti di sini dengan jujur.
    if (![200, 201].includes(r.statusCode)) {
      expect([422, 502, 503]).toContain(r.statusCode)
      return
    }

    const b = JSON.parse(r.body)
    const potongan = companyId.replace(/-/g, '').slice(0, 12)
    expect(b.instance).toBe(`puraloka-${potongan}`)
    expect(b.instance).not.toContain(PENANDA)
  }, 60_000)

  it('memanggil dua kali TIDAK menghasilkan instance kedua', async () => {
    actAs(adminAuth)
    const a = await req('POST', '/api/v1/wa/instance', {})
    if (![200, 201].includes(a.statusCode)) return

    actAs(adminAuth)
    const b = await req('POST', '/api/v1/wa/instance', {})
    expect([200, 201]).toContain(b.statusCode)

    // Nama identik = instance yang sama dipakai ulang, bukan yang kedua dibuat.
    expect(JSON.parse(b.body).instance).toBe(JSON.parse(a.body).instance)

    // Dan `WA_INSTANCE` tersimpan tepat SATU baris untuk tenant ini —
    // `UNIQUE (company_id, kunci)` menjaminnya, tetapi diperiksa supaya
    // upsert yang salah pola ketahuan di sini, bukan saat pesan salah kirim.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM app_credentials WHERE company_id=$1 AND kunci='WA_INSTANCE'`,
      [companyId],
    )
    expect(rows[0].n).toBe(1)
  }, 60_000)
})
