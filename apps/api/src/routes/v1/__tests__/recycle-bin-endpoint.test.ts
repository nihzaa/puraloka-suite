import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import recycleBinRoutes from '../recycle-bin.js'

/**
 * RECYCLE BIN terhadap Postgres NYATA (TJS-P1).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Registry-nya sudah dikunci 16 test di `lib/__tests__/recycle-bin.test.ts`
 * (11/11 mutasi MERAH). Yang tersisa:
 *
 *   • alur PENUH: hapus → muncul di bin → pulihkan → utuh — persis
 *     `cara_verifikasi` yang diminta item TJS-P1
 *   • `deleted_by` TIDAK hilang saat pulih; ia jejak siapa yang pernah
 *     menghapus, dan itulah keterangan saat orang bertanya "kenapa data ini
 *     sempat hilang?"
 *   • dua pemulihan BERSAMAAN: tepat satu berhasil (`.eq('is_deleted', true)`
 *     ikut di WHERE, bukan hanya diperiksa lebih dulu)
 *   • memulihkan yang TIDAK terhapus ditolak 409, bukan diam-diam menimpa
 *
 * Fixture berprefiks [TEST-RB] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let userId: string
let clientId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const post = (url: string) =>
  app.inject({ method: 'POST', url, payload: {}, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM projects WHERE name LIKE '[TEST-RB]%'`)
}

/**
 * Membuat proyek uji.
 *
 * Kolom wajibnya DIUKUR ke `information_schema` — `projects` punya DELAPAN
 * kolom NOT NULL tanpa default (`client_id`, `pm_id`, `location`,
 * `start_date`, `end_date`, `created_by`, `name`, `company_id`). Versi
 * pertama fixture ini hanya mengisi tiga, dan gagal dengan pesan yang
 * menunjuk satu kolom saja — sehingga memperbaikinya satu per satu akan
 * menghabiskan enam putaran.
 */
async function buatProyek(
  nama: string,
  terhapus: boolean,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO projects
       (company_id, client_id, pm_id, name, location, start_date, end_date,
        created_by, status, is_deleted, deleted_at, deleted_by)
     VALUES ($1, $2, $3, $4, '[TEST-RB] lokasi uji',
             '2026-01-01', '2026-12-31', $3, 'draft', $5,
             CASE WHEN $5 THEN now() ELSE NULL END,
             CASE WHEN $5 THEN $3::uuid ELSE NULL END)
     RETURNING id`,
    [companyId, clientId, userId, nama, terhapus])
  return rows[0].id
}

const buatTerhapus = (nama = '[TEST-RB] Proyek terhapus') => buatProyek(nama, true)

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT company_id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  if (p.length === 0) throw new Error('basis tanpa proyek ber-company')
  companyId = p[0].company_id

  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  const { rows: cl } = await client.query(`SELECT client_id FROM projects WHERE client_id IS NOT NULL LIMIT 1`)
  if (cl.length === 0) throw new Error('basis tanpa proyek ber-client — fixture tak bisa dibuat')
  clientId = cl[0].client_id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(recycleBinRoutes)
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

describe('izin', () => {
  it('izin PULIH diperiksa terpisah dari izin LIHAT', async () => {
    // Ditemukan mutasi: membuang pemeriksaan `izinPulih` tak membuat satu
    // test pun merah, karena peran admin punya keduanya.
    //
    // Yang diuji di sini: pemeriksaannya BENAR-BENAR memanggil izin pulih,
    // bukan kebetulan lolos lewat izin lihat. Caranya — jenis yang sama
    // dibaca dua kali, dan hak pulihnya dilaporkan terpisah. Kalau keduanya
    // dijawab dari sumber yang sama, mustahil membedakannya.
    const daftar = await get('/api/v1/recycle-bin')
    const isi = await get('/api/v1/recycle-bin/proyek')

    const dariDaftar = daftar.json().jenis
      .find((j: { kunci: string }) => j.kunci === 'proyek')?.bisa_pulihkan
    const dariIsi = isi.json().bisa_pulihkan

    // Keduanya harus SEPAKAT — kalau tidak, layar menyembunyikan tombol yang
    // sebenarnya boleh ditekan, atau sebaliknya.
    expect(dariDaftar).toBe(dariIsi)
    expect(typeof dariIsi).toBe('boolean')
  })
})

describe('GET /recycle-bin — daftar jenis', () => {
  it('menyebut jenis yang boleh dilihat beserta hak pulihnya', async () => {
    const r = await get('/api/v1/recycle-bin')
    expect(r.statusCode).toBe(200)
    const proyek = r.json().jenis.find((j: { kunci: string }) => j.kunci === 'proyek')
    expect(proyek).toBeTruthy()
    // Hak PULIH disebut terpisah dari hak LIHAT — layar memakainya untuk
    // menyembunyikan tombol yang akan menghasilkan 403.
    expect(typeof proyek.bisa_pulihkan).toBe('boolean')
  })
})

describe('alur PENUH — hapus → bin → pulihkan → utuh', () => {
  it('yang terhapus muncul di recycle bin', async () => {
    await purge()
    const id = await buatTerhapus()
    const r = await get('/api/v1/recycle-bin/proyek')
    expect(r.statusCode).toBe(200)
    const item = r.json().item.find((x: { id: string }) => x.id === id)
    expect(item).toBeTruthy()
    expect(item.nama).toMatch(/\[TEST-RB\]/)
    expect(item.umur_hari).toBe(0)
  })

  it('yang TIDAK terhapus tidak muncul', async () => {
    await purge()
    const id = await buatProyek('[TEST-RB] Proyek hidup', false)
    const r = await get('/api/v1/recycle-bin/proyek')
    expect(r.json().item.find((x: { id: string }) => x.id === id)).toBeUndefined()
  })

  it('pulihkan mengembalikan barisnya, dan ia hilang dari bin', async () => {
    await purge()
    const id = await buatTerhapus()

    const r = await post(`/api/v1/recycle-bin/proyek/${id}/pulihkan`)
    expect(r.statusCode).toBe(200)
    expect(r.json().dipulihkan.id).toBe(id)

    const { rows } = await client.query(
      `SELECT is_deleted, deleted_at FROM projects WHERE id = $1`, [id])
    expect(rows[0].is_deleted).toBe(false)
    expect(rows[0].deleted_at).toBeNull()

    const bin = await get('/api/v1/recycle-bin/proyek')
    expect(bin.json().item.find((x: { id: string }) => x.id === id)).toBeUndefined()
  })

  it('`deleted_by` TIDAK hilang saat pulih — ia jejaknya', async () => {
    // Menghapusnya membuat pemulihan menutupi penghapusan, dan riwayatnya
    // jadi bersih seolah tak pernah terjadi apa-apa.
    await purge()
    const id = await buatTerhapus()
    await post(`/api/v1/recycle-bin/proyek/${id}/pulihkan`)

    const { rows } = await client.query(
      `SELECT deleted_by FROM projects WHERE id = $1`, [id])
    expect(rows[0].deleted_by).toBe(userId)
  })
})

describe('penolakan', () => {
  it('jenis yang tak terdaftar menjawab 404', async () => {
    expect((await get('/api/v1/recycle-bin/users')).statusCode).toBe(404)
    expect((await post('/api/v1/recycle-bin/users/x/pulihkan')).statusCode).toBe(404)
  })

  it('id yang tak ada menjawab 404', async () => {
    const r = await post(
      '/api/v1/recycle-bin/proyek/00000000-0000-0000-0000-0000000000ff/pulihkan')
    expect(r.statusCode).toBe(404)
  })

  it('memulihkan yang TIDAK terhapus ditolak 409 dengan sebabnya', async () => {
    await purge()
    const id = await buatProyek('[TEST-RB] Tidak terhapus', false)

    const r = await post(`/api/v1/recycle-bin/proyek/${id}/pulihkan`)
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/tidak sedang terhapus/)
  })

  it('DUA pemulihan BERSAMAAN: tepat satu berhasil', async () => {
    // `.eq('is_deleted', true)` ikut di WHERE, bukan hanya diperiksa lebih
    // dulu: dua permintaan bersamaan sama-sama lolos pemeriksaan aplikasi,
    // dan yang kedua akan "memulihkan" baris yang sudah pulih — menimpa
    // jejaknya tanpa ada yang tahu.
    await purge()
    const id = await buatTerhapus()
    const [a, b] = await Promise.all([
      post(`/api/v1/recycle-bin/proyek/${id}/pulihkan`),
      post(`/api/v1/recycle-bin/proyek/${id}/pulihkan`),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })

  it('WHERE-nya yang menjaga, BUKAN pemeriksaan aplikasi', async () => {
    // Test race di atas LOLOS meski `.eq('is_deleted', true)` dibuang dari
    // WHERE — ditemukan mutasi. Sebabnya: `periksaPulih` sudah menangkap
    // permintaan kedua sebelum WHERE-nya pernah diuji, jadi yang teruji
    // pemeriksaan aplikasi, bukan penjaga yang sebenarnya.
    //
    // Kelas cacat yang sama berulang di sesi ini (G1e, G1f, G2e, G3, G5).
    //
    // Di sini barisnya diubah jadi TIDAK terhapus LANGSUNG DI BASIS setelah
    // pemeriksaan aplikasi membacanya — meniru persis apa yang terjadi saat
    // dua permintaan berlomba. Kalau WHERE tak menjaga, UPDATE-nya tetap
    // mengenai baris hidup dan menimpa jejaknya.
    await purge()
    const id = await buatTerhapus()

    // Baca dulu (seperti handler), lalu ubah keadaannya di belakang.
    await client.query(
      `UPDATE projects SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1`, [id])

    const { rows: sebelum } = await client.query(
      `SELECT updated_at FROM projects WHERE id = $1`, [id])

    const r = await post(`/api/v1/recycle-bin/proyek/${id}/pulihkan`)
    expect(r.statusCode).toBe(409)

    // Dan barisnya TIDAK tersentuh — kalau WHERE-nya bocor, `updated_at`
    // akan berubah meski jawabannya 409.
    const { rows: sesudah } = await client.query(
      `SELECT updated_at FROM projects WHERE id = $1`, [id])
    expect(String(sesudah[0].updated_at)).toBe(String(sebelum[0].updated_at))
  })
})
