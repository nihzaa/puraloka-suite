import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { buatKunci } from '../../../lib/api-key.js'
import otomasiUmpanRoutes from '../otomasi-umpan.js'

/**
 * UMPAN n8n — pintu masuk read-only untuk workflow otomasi.
 *
 * Yang dijaga di sini bukan bentuk JSON-nya, melainkan hal yang kalau salah
 * TIDAK menghasilkan galat apa pun:
 *
 *   1. Kunci API benar-benar jadi gerbang. Rute yang lupa `requireApiKey`
 *      tetap menjawab 200 — dan seluruh data tenant terbuka ke siapa saja
 *      yang tahu URL-nya.
 *
 *   2. Jenis karangan ditolak. Alur yang salah ketik harus tahu sebabnya,
 *      bukan menerima daftar kosong yang terlihat sah.
 *
 * Sejak 8 resep jadwal generasi lama dipensiunkan (spec 2026-08-22 §5.5,
 * evidence: 6/8 nol eksekusi seumur hidup, 2/8 sekali & sudah lewat
 * seminggu), `JENIS_TERSEDIA` kosong — tak ada lagi business logic
 * (`bangunUmpan()` per-jenis, keamanan kolom `.select()`, isolasi tenant per
 * query) untuk diuji di sini. Rute tetap hidup sebagai infrastruktur dorman,
 * siap menerima `jenis` berikutnya yang butuh umpan n8n.
 */

const PENANDA = `__uji_umpan_${process.pid}__`

let app: FastifyInstance
let db: Client
let kunciSah: string
let idKunci: string
let companyId: string

const panggil = (jenis: string, kunci?: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/umpan/${jenis}`,
    headers: kunci ? { 'x-api-key': kunci } : {},
  })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register(otomasiUmpanRoutes)
  await app.ready()

  db = await createRlsClient()

  const { rows } = await db.query(
    `SELECT c.id FROM companies c
      WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1`,
  )
  companyId = rows[0].id

  const k = buatKunci()
  kunciSah = k.kunci
  const ins = await db.query(
    `INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, izin, kedaluwarsa_pada)
     VALUES ($1,$2,$3,$4,$5,$6, now() + interval '1 day') RETURNING id`,
    // `keperluan` wajib >= 10 karakter (`chk_api_key_keperluan`) — kunci
    // tanpa alasan yang bisa dibaca adalah kunci yang tak berani dicabut
    // siapa pun nanti.
    [companyId, PENANDA, 'kunci uji otomatis untuk umpan n8n', k.hash, k.awalan, ['otomasi:umpan:baca']],
  )
  idKunci = ins.rows[0].id
}, 60_000)

afterAll(async () => {
  if (idKunci) await db.query('DELETE FROM api_key WHERE id=$1', [idKunci])
  await db?.end()
  await app?.close()
})

describe('Gerbang kunci API', () => {
  // `'jenis-yang-tak-pernah-ada'` dipakai sebagai fixture di tiga test gerbang
  // ini SENGAJA — bukan kelalaian. `requireApiKey` adalah `preHandler`, yang
  // di Fastify berjalan SEBELUM badan handler (tempat `JENIS_TERSEDIA`
  // diperiksa). Ketiga test ini menguji gerbang kunci, bukan business logic
  // suatu `jenis` — jadi `jenis`-nya tak perlu valid untuk test ini tetap
  // membuktikan apa yang mereka buktikan. Sejak `JENIS_TERSEDIA` dikosongkan
  // (spec 2026-08-22 §5.5), tak ada lagi satu pun jenis "valid" yang bisa
  // dipinjam sebagai fixture.
  it('tanpa header X-API-Key ditolak 401', async () => {
    const r = await panggil('jenis-yang-tak-pernah-ada')
    expect(r.statusCode).toBe(401)
  }, 30_000)

  it('kunci karangan ditolak 401 — dan TIDAK membocorkan sebabnya', async () => {
    const r = await panggil('jenis-yang-tak-pernah-ada', 'plk_kunci_yang_tidak_pernah_ada')
    expect(r.statusCode).toBe(401)
    // Pesan penolakan seragam: membedakan "tak dikenal" dari "kedaluwarsa"
    // sudah mengkonfirmasi kunci itu pernah ada.
    expect(JSON.parse(r.body).error).not.toMatch(/kedaluwarsa|dicabut/i)
  }, 30_000)

  it('kunci yang DICABUT ditolak meski bentuknya benar', async () => {
    // Kunci SENDIRI, bukan `kunciSah`.
    //
    // Percobaan pertama mencabut `kunciSah` lalu menghidupkannya kembali, dan
    // basis menolak: trigger membuat pencabutan TAK BISA dibatalkan ("Kunci
    // yang sudah dicabut tak bisa dihidupkan kembali"). Itu perilaku yang
    // benar — kunci yang bisa dihidupkan ulang berarti pencabutan bukan
    // jaminan apa pun. Test yang menyesuaikan diri, bukan basisnya.
    //
    // Akibat percobaan itu: sembilan test lain ikut merah karena kunci
    // bersamanya tinggal mati. Kunci sekali-pakai menutup ketergantungan itu.
    const k = buatKunci()
    const ins = await db.query(
      `INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, izin, kedaluwarsa_pada)
       VALUES ($1,$2,$3,$4,$5,$6, now() + interval '1 day') RETURNING id`,
      [companyId, `${PENANDA}_cabut`, 'kunci sekali-pakai untuk uji pencabutan',
        k.hash, k.awalan, ['otomasi:umpan:baca']],
    )
    const idSekaliPakai = ins.rows[0].id

    try {
      // Sah dulu — supaya 401 sesudahnya terbukti berasal dari pencabutan,
      // bukan dari kunci yang memang tak pernah sah. Kunci yang sah tapi
      // BELUM dicabut menembus gerbang `requireApiKey` dan sampai ke badan
      // handler, yang membalas 404 (bukan 200) karena `JENIS_TERSEDIA`
      // sekarang kosong — itu tetap membuktikan "gerbang belum menutup".
      expect((await panggil('jenis-yang-tak-pernah-ada', k.kunci)).statusCode).toBe(404)

      // `alasan_cabut` wajib ikut (`chk_api_key_cabut_beralasan`).
      await db.query(
        `UPDATE api_key SET dicabut_pada=now(), alasan_cabut=$2 WHERE id=$1`,
        [idSekaliPakai, 'dicabut oleh test gerbang kunci'],
      )
      expect((await panggil('jenis-yang-tak-pernah-ada', k.kunci)).statusCode).toBe(401)
    } finally {
      await db.query('DELETE FROM api_key WHERE id=$1', [idSekaliPakai])
    }
  }, 30_000)
})

describe('Jenis umpan', () => {
  it('jenis karangan ditolak 404, daftar tersedia kosong (belum ada umpan aktif)', async () => {
    const r = await panggil('jenis-yang-tak-pernah-ada', kunciSah)
    expect(r.statusCode).toBe(404)
    const b = JSON.parse(r.body)
    expect(Array.isArray(b.tersedia)).toBe(true)
    expect(b.tersedia).toEqual([])
  }, 30_000)

  it('katalog jenis kosong sejak resep jadwal lama dipensiunkan (spec 2026-08-22 §5.5)', async () => {
    const r = await panggil('apa-saja', kunciSah)
    expect(r.statusCode).toBe(404)
    const b = JSON.parse(r.body)
    expect(b.tersedia).toEqual([])
  }, 30_000)
})
