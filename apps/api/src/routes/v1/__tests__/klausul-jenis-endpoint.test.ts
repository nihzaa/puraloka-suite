/**
 * KLAUSUL PER JENIS DOKUMEN — rute CRUD-nya, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ketiga rute `/api/v1/klausul-kontrak` (GET, PUT, DELETE) hidup sejak
 * migrasi 450 dan **tak punya satu pun test endpoint** — diukur 2026-08-19,
 * satu-satunya yang menyebutnya adalah `kontrak-pdf-kop.test.ts`, dan itu
 * menguji KOP-nya.
 *
 * Yang tak terjaga karenanya, dan baru terlihat saat migrasi 465 menambah
 * `jenis_dokumen`:
 *
 *   DELETE menyaring HANYA `nomor`. Sesudah 465, "pulihkan bawaan Pasal 2
 *   SPK" akan menonaktifkan **Pasal 2 KONTRAK** — kertas yang sudah terbit
 *   dan ditandatangani orang — tanpa satu pun galat. Index unik 465 memang
 *   membolehkan keduanya hidup bersamaan.
 *
 * Itu bukan cacat yang bisa ditangkap test pustaka: ia hidup di klausa
 * `.eq()` sebuah query.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import contractRoutes from '../contracts.js'

let app: FastifyInstance
let db: Client
let companyId: string

const TANDA = '[UJI-KLAUSUL-JENIS]'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const put = (url: string, payload: unknown) =>
  app.inject({ method: 'PUT', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const del = (url: string) =>
  app.inject({ method: 'DELETE', url, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(`DELETE FROM klausul_kontrak WHERE judul LIKE $1 OR isi LIKE $1`, [`${TANDA}%`])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  companyId = await companyBerisi(db, auth, ['projects'])

  await bersihkan()
  app = Fastify({ logger: false })
  await app.register(contractRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('GET — bawaan per jenis', () => {
  it('tanpa ?jenis berperilaku PERSIS seperti sebelum migrasi 465', async () => {
    /*
      Kompatibilitas mundur, dan ini bukan kesopanan: layar
      `/pengaturan/klausul-kontrak` sudah dipakai orang dan memanggil rute ini
      tanpa parameter. Bawaan yang bergeser diam-diam akan menampilkan pasal
      SPK di layar berjudul "Klausul Kontrak".
    */
    const r = await get('/api/v1/klausul-kontrak')
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json()
    expect(j.jenis).toBe('kontrak')
    // Pasal yang dirakit kode HANYA ada pada kontrak.
    expect(j.dirakit_kode.length).toBeGreaterThan(0)
    expect(j.catatan_dirakit).toBeTruthy()
  })

  it('?jenis=spk memulangkan bawaan SPK, BUKAN bawaan kontrak', async () => {
    const spk = (await get('/api/v1/klausul-kontrak?jenis=spk')).json()
    const kontrak = (await get('/api/v1/klausul-kontrak')).json()

    expect(spk.jenis).toBe('spk')
    expect(spk.klausul.length).toBeGreaterThan(0)

    const judulSpk = spk.klausul.map((k: { judul: string }) => k.judul)
    expect(judulSpk.some((x: string) => /PERINTAH KERJA/i.test(x))).toBe(true)

    // Tak satu pun judul kontrak muncul di daftar SPK.
    const judulKontrak = new Set(kontrak.klausul.map((k: { judul: string }) => k.judul))
    expect(judulSpk.every((x: string) => !judulKontrak.has(x))).toBe(true)
  })

  it('SPK & berita acara: SELURUH pasal boleh disunting', async () => {
    // `NOMOR_DIRAKIT_KODE` hanya berlaku untuk kontrak — lima pasalnya
    // menganyam data hidup. Menerapkan pagar itu ke SPK akan melarang tenant
    // menyunting syarat yang memang miliknya, dan layarnya berbunyi "tak bisa
    // diubah" tanpa alasan yang bisa dijelaskan.
    for (const jenis of ['spk', 'berita_acara']) {
      const j = (await get(`/api/v1/klausul-kontrak?jenis=${jenis}`)).json()
      expect(j.dirakit_kode).toEqual([])
      expect(j.catatan_dirakit).toBeNull()
      expect(j.klausul.every((k: { bisa_diubah: boolean }) => k.bisa_diubah)).toBe(true)
    }
  })

  it('jenis TAK DIKENAL ditolak 400 — tidak jatuh diam-diam ke kontrak', async () => {
    /*
      Kalau `?jenis=SPK` (huruf besar, salah ketik) senyap-jatuh ke `kontrak`,
      yang menyuntingnya mengira sedang mengubah syarat SPK — lalu mengubah
      pasal KONTRAK yang sudah ditandatangani orang.
    */
    for (const jenis of ['SPK', 'invoice', 'kontrak ']) {
      const r = await get(`/api/v1/klausul-kontrak?jenis=${encodeURIComponent(jenis)}`)
      if (jenis === 'kontrak ') {
        // Spasi di ujung DI-trim — itu salah ketik yang tak mengubah maksud.
        expect(r.statusCode, `"${jenis}" seharusnya diterima sesudah trim`).toBe(200)
        continue
      }
      expect(r.statusCode, `"${jenis}" lolos sebagai jenis yang sah`).toBe(400)
    }
  })
})

describe('PUT & DELETE — jenis tak boleh tertukar', () => {
  it('menimpa pasal SPK TIDAK menyentuh pasal kontrak bernomor sama', async () => {
    const r = await put('/api/v1/klausul-kontrak/2', {
      jenis: 'spk', judul: `${TANDA} K3 kami`, isi: `${TANDA} bunyi khusus perusahaan ini`,
    })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT jenis_dokumen, nomor FROM klausul_kontrak
        WHERE company_id = $1 AND aktif AND judul LIKE $2`, [companyId, `${TANDA}%`])
    expect(rows).toHaveLength(1)
    expect(rows[0].jenis_dokumen, 'klausul tersimpan dengan jenis yang SALAH').toBe('spk')

    // Dan GET kontrak tak ikut berubah.
    const kontrak = (await get('/api/v1/klausul-kontrak')).json()
    expect(kontrak.klausul.some((k: { judul: string }) => k.judul.includes(TANDA))).toBe(false)
  })

  it('DELETE pasal SPK tak menonaktifkan pasal KONTRAK bernomor sama', async () => {
    /*
      INTI berkas ini — cacat yang benar-benar ada di rute sebelum hari ini.

      DELETE menyaring hanya `nomor`. Dengan dua jenis hidup bersamaan
      (dibolehkan index unik migrasi 465), "pulihkan bawaan Pasal 6 SPK"
      akan menonaktifkan Pasal 6 KONTRAK — kertas yang sudah terbit dan
      ditandatangani orang — dan membalas 200.
    */
    await put('/api/v1/klausul-kontrak/6', {
      jenis: 'kontrak', judul: `${TANDA} Pasal 6 kontrak`, isi: `${TANDA} isi kontrak`,
    })
    await put('/api/v1/klausul-kontrak/6', {
      jenis: 'spk', judul: `${TANDA} Pasal 6 SPK`, isi: `${TANDA} isi spk`,
    })

    const r = await del('/api/v1/klausul-kontrak/6?jenis=spk')
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT jenis_dokumen, aktif FROM klausul_kontrak
        WHERE company_id = $1 AND nomor = '6' AND judul LIKE $2
        ORDER BY jenis_dokumen`, [companyId, `${TANDA}%`])

    const kontrak = rows.find((x) => x.jenis_dokumen === 'kontrak')
    const spk = rows.find((x) => x.jenis_dokumen === 'spk')
    expect(spk?.aktif, 'pasal SPK tak jadi dipulihkan').toBe(false)
    expect(kontrak?.aktif,
      'pasal KONTRAK ikut dinonaktifkan — kertas bertanda tangan berubah bunyi').toBe(true)
  })

  it('memulihkan yang belum pernah ditimpa membalas 404, bukan 200 senyap', async () => {
    // 200 untuk tindakan yang tak melakukan apa pun mengajarkan pemakainya
    // bahwa tombolnya bekerja — lalu ia berhenti memeriksa.
    const r = await del('/api/v1/klausul-kontrak/9?jenis=berita_acara')
    expect(r.statusCode, r.body).toBe(404)
  })

  it('pasal kontrak yang DIRAKIT KODE tetap ditolak; padanan SPK-nya boleh', async () => {
    /*
      Pasal 3 kontrak menganyam nilai + terbilang. Template yang salah tulis
      menghasilkan kontrak bernilai KOSONG yang tetap tercetak rapi.

      SPK tak punya pasal semacam itu — pagar yang sama di sana cuma melarang
      tanpa melindungi apa pun.
    */
    const rKontrak = await put('/api/v1/klausul-kontrak/3', {
      jenis: 'kontrak', judul: `${TANDA} coba`, isi: `${TANDA} coba`,
    })
    // 422, bukan 400: permintaannya berbentuk benar dan penggunanya berwenang —
    // isinya yang tak bisa diproses. Diukur ke rutenya, bukan ditebak.
    expect(rKontrak.statusCode, rKontrak.body).toBe(422)

    const rSpk = await put('/api/v1/klausul-kontrak/3', {
      jenis: 'spk', judul: `${TANDA} Mutu kami`, isi: `${TANDA} bunyi mutu`,
    })
    expect(rSpk.statusCode, rSpk.body).toBe(200)
  })
})
