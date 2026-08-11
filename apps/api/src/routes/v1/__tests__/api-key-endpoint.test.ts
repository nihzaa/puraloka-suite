import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import apiKeyRoutes from '../api-key.js'
import { hashKunci } from '../../../lib/api-key.js'

/**
 * API KEY terhadap Postgres NYATA (G6c).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Pembuatan & pemeriksaan kunci sudah dikunci 37 test di
 * `lib/__tests__/api-key.test.ts` (17/18 mutasi MERAH). Yang tersisa:
 *
 *   • nilai kunci muncul TEPAT SEKALI dan tak pernah lagi — inti seluruh
 *     modul ini, dan satu-satunya cara membuktikannya adalah memanggil GET
 *     sesudah POST lalu memastikan nilainya tak ada di mana pun
 *   • hash yang tersimpan cocok dengan nilai yang dikembalikan
 *   • `trg_api_key_hash_beku` menolak penggantian hash — lewat SQL LANGSUNG,
 *     karena skrip impor tak melewati satu pun preHandler
 *   • dua pencabutan BERSAMAAN: alasan yang pertama tak tertimpa
 *   • izin karangan ditolak sebelum tersimpan
 *
 * Fixture berprefiks [TEST-AK] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: 'Bearer t' } })

const isi = (o: Record<string, unknown> = {}) => ({
  nama: '[TEST-AK] Kunci uji',
  keperluan: 'sinkron data ke sistem akuntansi luar',
  hari_berlaku: 30,
  ...o,
})

async function purge() {
  await client.query(
    `DELETE FROM api_key_pakai WHERE api_key_id IN
       (SELECT id FROM api_key WHERE nama LIKE '[TEST-AK]%')`)
  await client.query(`DELETE FROM api_key WHERE nama LIKE '[TEST-AK]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(apiKeyRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  try { await purge() } finally {
    await app?.close()
    await client?.end()
  }
})

describe('POST /api-key — nilai muncul SEKALI', () => {
  it('mengembalikan nilai kunci beserta peringatannya', async () => {
    await purge()
    const r = await kirim('/api/v1/api-key', isi())
    expect(r.statusCode).toBe(201)
    expect(r.json().nilai).toMatch(/^plk_[A-Za-z0-9_-]{43}$/)
    expect(r.json().peringatan).toMatch(/tidak akan pernah ditampilkan lagi/)
  })

  it('nilai TIDAK muncul lagi di GET — inti seluruh modul ini', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const nilai = c.json().nilai

    const r = await get('/api/v1/api-key')
    expect(r.statusCode).toBe(200)
    // Diperiksa terhadap SELURUH badan balasan, bukan satu medan: kalau
    // nilainya bocor lewat medan yang tak terpikir, cara ini tetap menangkap.
    expect(r.payload).not.toContain(nilai)
    // Dan bagian acaknya pun tidak — bukan hanya kunci utuhnya.
    expect(r.payload).not.toContain(nilai.slice(4))
  })

  it('yang tersimpan HASH, bukan kuncinya', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const { rows } = await client.query(
      `SELECT hash_kunci, awalan FROM api_key WHERE id = $1`, [c.json().kunci.id])
    expect(rows[0].hash_kunci).toBe(hashKunci(c.json().nilai))
    expect(rows[0].hash_kunci).not.toContain(c.json().nilai)
    // Awalan boleh terang — 8 karakter terlalu pendek untuk dipakai.
    expect(rows[0].awalan).toHaveLength(8)
  })

  it('HASH tak pernah ikut keluar lewat GET', async () => {
    // Ditemukan mutasi: menambahkan `hash_kunci` ke SELECT tak membuat satu
    // test pun merah, karena test kebocoran hanya memeriksa NILAI kunci.
    //
    // Hash memang bukan kunci — ia tak bisa dibalik. Tapi ia cukup untuk
    // memverifikasi tebakan secara OFFLINE: siapa pun yang memegangnya bisa
    // menguji jutaan calon kunci tanpa menyentuh server kami, tanpa satu pun
    // permintaan yang bisa dibatasi laju atau dicatat.
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const r = await get('/api/v1/api-key')
    expect(r.payload).not.toContain(hashKunci(c.json().nilai))
    expect(r.payload).not.toContain('hash_kunci')
  })

  it('hash juga tak keluar lewat balasan POST', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    expect(c.payload).not.toContain(hashKunci(c.json().nilai))
    expect(c.payload).not.toContain('hash_kunci')
  })

  it('kunci baru lahir TANPA izin apa pun', async () => {
    await purge()
    const r = await kirim('/api/v1/api-key', isi())
    expect(r.json().kunci.izin).toEqual([])
  })

  it('izin yang SAH diterima', async () => {
    await purge()
    const r = await kirim('/api/v1/api-key', isi({ izin: ['projects:view'] }))
    expect(r.statusCode).toBe(201)
    expect(r.json().kunci.izin).toEqual(['projects:view'])
  })

  it('izin KARANGAN ditolak sebelum tersimpan', async () => {
    // Izin karangan lolos INSERT lalu tak pernah cocok dengan apa pun —
    // kunci yang terlihat berwenang di layar dan menolak semua permintaan.
    const r = await kirim('/api/v1/api-key', isi({ izin: ['projects:view', 'ngawur:sekali'] }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/ngawur:sekali/)
  })

  it('keperluan terlalu pendek ditolak', async () => {
    const r = await kirim('/api/v1/api-key', isi({ keperluan: 'sinkron' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/10 huruf/)
  })

  it('masa berlaku KOSONG ditolak — Number("") adalah 0', async () => {
    const r = await kirim('/api/v1/api-key', isi({ hari_berlaku: '' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib diisi/)
  })

  it('masa berlaku di atas 2 tahun ditolak', async () => {
    const r = await kirim('/api/v1/api-key', isi({ hari_berlaku: 731 }))
    expect(r.statusCode).toBe(400)
  })

  it('audit log TIDAK memuat kunci maupun hash-nya', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const nilai = c.json().nilai
    const { rows } = await client.query(
      `SELECT new_values::text t FROM audit_logs
        WHERE table_name = 'api_key' AND record_id = $1`, [c.json().kunci.id])
    // Audit log dibaca banyak orang dan diekspor — kredensial di sana
    // memindahkan rahasia ke tempat yang justru paling mudah dibaca.
    for (const r of rows) {
      expect(r.t).not.toContain(nilai)
      expect(r.t).not.toContain(hashKunci(nilai))
    }
  })
})

describe('hash BEKU — ditegakkan basis, bukan rute', () => {
  it('mengganti hash lewat SQL langsung DITOLAK', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    let lolos = false
    try {
      await client.query(
        `UPDATE api_key SET hash_kunci = $1 WHERE id = $2`,
        ['e'.repeat(64), c.json().kunci.id])
      lolos = true
    } catch { /* ditolak: benar */ }
    expect(lolos).toBe(false)
  })

  it('kunci yang dicabut tak bisa dihidupkan lagi', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    await kirim(`/api/v1/api-key/${c.json().kunci.id}/cabut`,
      { alasan: 'kunci uji, dicabut untuk pengujian' })

    let lolos = false
    try {
      await client.query(
        `UPDATE api_key SET dicabut_pada = NULL WHERE id = $1`, [c.json().kunci.id])
      lolos = true
    } catch { /* ditolak: benar */ }
    // Pencabutan adalah pernyataan bahwa kunci bocor atau tak dipercaya;
    // menghidupkannya kembali menghapus arti pernyataan itu.
    expect(lolos).toBe(false)
  })
})

describe('POST /api-key/:id/cabut', () => {
  it('mencabut dengan alasan berhasil', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const r = await kirim(`/api/v1/api-key/${c.json().kunci.id}/cabut`,
      { alasan: 'integrasi lama sudah dimatikan' })
    expect(r.statusCode).toBe(200)
    expect(r.json().kunci.dicabut_pada).toBeTruthy()
  })

  it('tanpa alasan ditolak', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const r = await kirim(`/api/v1/api-key/${c.json().kunci.id}/cabut`, {})
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/kenapa integrasi kami mati/)
  })

  it('mencabut dua kali menjawab 409, bukan menimpa alasan pertama', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    await kirim(`/api/v1/api-key/${c.json().kunci.id}/cabut`,
      { alasan: 'alasan yang pertama' })
    const r = await kirim(`/api/v1/api-key/${c.json().kunci.id}/cabut`,
      { alasan: 'alasan yang kedua' })
    expect(r.statusCode).toBe(409)

    const { rows } = await client.query(
      `SELECT alasan_cabut FROM api_key WHERE id = $1`, [c.json().kunci.id])
    // Alasan pertama TETAP — ia keterangan yang dicari saat ditelusuri.
    expect(rows[0].alasan_cabut).toBe('alasan yang pertama')
  })

  it('DUA pencabutan BERSAMAAN: tepat satu berhasil', async () => {
    // Alasan berbeda supaya keduanya lolos pemeriksaan aplikasi dan benar-
    // benar berlomba di `.is('dicabut_pada', null)` pada WHERE.
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const id = c.json().kunci.id
    const [a, b] = await Promise.all([
      kirim(`/api/v1/api-key/${id}/cabut`, { alasan: 'pencabutan jalur pertama' }),
      kirim(`/api/v1/api-key/${id}/cabut`, { alasan: 'pencabutan jalur kedua' }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })

  it('kunci yang tak ada menjawab 404', async () => {
    const r = await kirim(
      '/api/v1/api-key/00000000-0000-0000-0000-0000000000ff/cabut',
      { alasan: 'menguji kunci yang tak ada' })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /api-key — keadaan dihitung server', () => {
  it('kunci hidup berkeadaan aktif', async () => {
    await purge()
    await kirim('/api/v1/api-key', isi())
    const r = await get('/api/v1/api-key')
    const uji = r.json().kunci.find((k: { nama: string }) => k.nama.startsWith('[TEST-AK]'))
    expect(uji.keadaan).toBe('aktif')
  })

  it('kunci KEDALUWARSA dibedakan dari dicabut', async () => {
    // Keadaan dihitung server supaya layar tak mengulang logikanya — dan
    // supaya "kedaluwarsa" tak jadi keadaan yang lupa ditampilkan.
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    await client.query(
      `UPDATE api_key SET kedaluwarsa_pada = now() - INTERVAL '1 day' WHERE id = $1`,
      [c.json().kunci.id])

    const r = await get('/api/v1/api-key')
    const uji = r.json().kunci.find((k: { nama: string }) => k.nama.startsWith('[TEST-AK]'))
    expect(uji.keadaan).toBe('kedaluwarsa')
  })

  it('kunci dicabut berkeadaan dicabut', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    await kirim(`/api/v1/api-key/${c.json().kunci.id}/cabut`,
      { alasan: 'menguji keadaan dicabut' })
    const r = await get('/api/v1/api-key')
    const uji = r.json().kunci.find((k: { nama: string }) => k.nama.startsWith('[TEST-AK]'))
    expect(uji.keadaan).toBe('dicabut')
  })
})

describe('GET /api-key/:id/pemakaian', () => {
  it('kunci milik tenant lain menjawab 404, bukan daftar kosong', async () => {
    // Daftar kosong terbaca sebagai "kunci ini belum pernah dipakai" — dan
    // itu mengkonfirmasi id-nya ada.
    const r = await get(
      '/api/v1/api-key/00000000-0000-0000-0000-0000000000ff/pemakaian')
    expect(r.statusCode).toBe(404)
  })

  it('kunci sendiri menjawab daftar (awalnya kosong)', async () => {
    await purge()
    const c = await kirim('/api/v1/api-key', isi())
    const r = await get(`/api/v1/api-key/${c.json().kunci.id}/pemakaian`)
    expect(r.statusCode).toBe(200)
    expect(Array.isArray(r.json().pemakaian)).toBe(true)
  })
})
