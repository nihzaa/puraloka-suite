/**
 * TJS-D1 — rute pendaftaran & verifikasi nomor WhatsApp.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: JALUR YANG PALING MUDAH DISALAHPAHAMI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Verifikasi 6 digit terlihat sederhana, dan justru itu bahayanya. Tiga hal
 * yang lolos "status 200" tetapi membuat verifikasinya tak berarti:
 *
 *   KODE BOCOR       kode yang dikembalikan lewat API membuat siapa pun yang
 *                    bisa membuka halaman ini memverifikasi nomor siapa pun
 *   TANPA BATAS      6 digit bisa ditebak habis kalau percobaannya tak
 *                    dibatasi
 *   KODE ABADI       kode yang tak kedaluwarsa tetap sah berbulan-bulan
 *                    setelah pesannya terbaca orang lain
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import waNomorRoutes from '../wa-nomor.js'

const NOMOR = '628777111001'

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string

const post = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  /*
    Company diambil dari keanggotaan DEFAULT admin sesi, bukan company
    beranggota mana pun.

    `LIMIT 1` tanpa ORDER BY atas seluruh companies beranggota memilih tenant
    yang belum tentu sama dengan `auth_company_id()` — dan RLS menyaring lewat
    yang kedua. Begitu keduanya berbeda, baris yang BARU SAJA disisipkan test
    tak terlihat oleh rute, dan gejalanya `expected 404 to be 200`.

    Pola diambil dari `ai-chat.test.ts` yang sudah diperbaiki lebih dulu.
  */
  const { rows } = await db.query(
    `SELECT m.company_id AS id
       FROM company_members m
       JOIN users u ON u.id = m.user_id
      WHERE u.auth_id = $1 AND m.is_default AND m.is_active
      LIMIT 1`,
    [auth],
  )
  if (!rows.length) throw new Error('admin uji tak punya keanggotaan default')
  companyId = rows[0].id
  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = u[0].user_id

  app = Fastify()
  // Rate limit didaftarkan karena rutenya memakai `config.rateLimit`; tanpa
  // plugin-nya Fastify mengabaikan config itu diam-diam, dan test tak akan
  // pernah melihat batasnya bekerja.
  //
  // `max` DINAIKKAN untuk test: rutenya membatasi 10/menit per user, dan
  // seluruh test di berkas ini memakai pengguna yang sama. Tanpa ini, test
  // ke-11 dan seterusnya kena 429 dan gagal karena alasan yang tak ada
  // hubungannya dengan yang diuji — bentuk kegagalan yang menyesatkan
  // ("kenapa 404 jadi 429?").
  //
  // Rate limit-nya sendiri diuji terpisah di `ai-rate-limit.test.ts`, yang
  // memeriksa KUNCInya (per user, bukan per IP) — bukan penghitungannya.
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: '1 minute',
  })
  await app.register(waNomorRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor = $1`, [NOMOR])
  await db.query(`DELETE FROM wa_pesan_log WHERE company_id = $1 AND nomor = $2`, [companyId, NOMOR])
  await app.close()
  await db.end()
})

beforeEach(async () => {
  await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor = $1`, [NOMOR])
})

/** Mendaftarkan langsung ke basis dengan kode yang diketahui test. */
async function siapkan(opsi: { kode?: string; umurMs?: number; gagal?: number } = {}) {
  const { rows } = await db.query(
    `INSERT INTO wa_nomor_pengguna
       (company_id, user_id, nomor, kode_verifikasi, kode_kedaluwarsa, percobaan_gagal)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      companyId, userId, NOMOR,
      opsi.kode ?? '123456',
      new Date(Date.now() + (opsi.umurMs ?? 600_000)).toISOString(),
      opsi.gagal ?? 0,
    ],
  )
  return rows[0].id as string
}

describe('validasi masukan', () => {
  it('nomor tak sah ditolak 422 dengan contoh bentuk yang benar', async () => {
    const r = await post('/api/v1/wa/nomor', { nomor: 'abc' })
    expect(r.statusCode).toBe(422)
    // Pesan yang cuma bilang "tidak sah" memaksa orang menebak bentuk apa
    // yang diterima.
    expect(r.json().error).toContain('08123456789')
  })

  it('kode bukan 6 digit ditolak sebelum menyentuh basis', async () => {
    const id = await siapkan()
    for (const kode of ['12345', '1234567', 'abcdef', '']) {
      const r = await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode })
      expect(r.statusCode, `kode '${kode}'`).toBe(422)
    }
  })
})

describe('KODE TIDAK PERNAH keluar lewat API', () => {
  it('daftar nomor tak memuat kode_verifikasi', async () => {
    await siapkan({ kode: '999888' })
    const r = await get('/api/v1/wa/nomor')
    const teks = JSON.stringify(r.json())
    // Kode yang bisa dibaca lewat API membuat verifikasi kehilangan artinya:
    // siapa pun yang bisa membuka halaman ini bisa memverifikasi nomor
    // siapa pun.
    expect(teks).not.toContain('999888')
    expect(teks).not.toContain('kode_verifikasi')
  })

  it('respons pendaftaran tak memuat kodenya', async () => {
    const r = await post('/api/v1/wa/nomor', { nomor: NOMOR })
    const teks = JSON.stringify(r.json())
    const { rows } = await db.query(
      `SELECT kode_verifikasi FROM wa_nomor_pengguna WHERE nomor = $1`, [NOMOR])
    const kode = rows[0]?.kode_verifikasi
    if (kode) expect(teks).not.toContain(kode)
  })
})

describe('verifikasi', () => {
  it('kode BENAR → terverifikasi, dan kodenya dihapus', async () => {
    const id = await siapkan({ kode: '246810' })
    const r = await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '246810' })
    expect(r.statusCode).toBe(200)

    const { rows } = await db.query(
      `SELECT terverifikasi_pada, kode_verifikasi, percobaan_gagal
         FROM wa_nomor_pengguna WHERE id = $1`, [id])
    expect(rows[0].terverifikasi_pada).toBeTruthy()
    // Kode yang tinggal di basis bisa dipakai ulang kalau verifikasinya kelak
    // di-reset.
    expect(rows[0].kode_verifikasi).toBeNull()
    expect(rows[0].percobaan_gagal).toBe(0)
  })

  it('kode SALAH → 422 dan penghitung naik', async () => {
    const id = await siapkan({ kode: '111111' })
    const r = await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '222222' })
    expect(r.statusCode).toBe(422)
    expect(r.json().alasan).toBe('kode_salah')
    // Sisa percobaan DIBERITAHU: orang yang tak tahu sisa jatahnya akan
    // mencoba sampai terkunci tanpa peringatan.
    expect(r.json().sisa_percobaan).toBe(4)

    const { rows } = await db.query(
      `SELECT percobaan_gagal FROM wa_nomor_pengguna WHERE id = $1`, [id])
    expect(rows[0].percobaan_gagal).toBe(1)
  })

  it('kode KEDALUWARSA ditolak 410, bukan diterima', async () => {
    const id = await siapkan({ kode: '333333', umurMs: -1000 })
    const r = await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '333333' })
    // Kode yang tak kedaluwarsa tetap sah berbulan-bulan setelah pesannya
    // terbaca orang lain.
    expect(r.statusCode).toBe(410)
    expect(r.json().alasan).toBe('kode_kedaluwarsa')
  })

  it('percobaan HABIS → 429, dan kode benar pun ditolak', async () => {
    const id = await siapkan({ kode: '444444', gagal: 5 })
    const r = await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '444444' })
    // Tanpa batas, 6 digit bisa ditebak habis. Yang tercapai batasnya harus
    // mendaftar ulang — itu memicu kode baru ke nomor ASLINYA, jadi penyerang
    // yang tak memegang nomor itu berhenti di sini.
    expect(r.statusCode).toBe(429)
    expect(r.json().alasan).toBe('percobaan_habis')

    const { rows } = await db.query(
      `SELECT terverifikasi_pada FROM wa_nomor_pengguna WHERE id = $1`, [id])
    expect(rows[0].terverifikasi_pada).toBeNull()
  })

  it('verifikasi ULANG pada nomor yang sudah terverifikasi tak mengubah apa pun', async () => {
    const id = await siapkan({ kode: '555555' })
    await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '555555' })
    const { rows: a } = await db.query(
      `SELECT terverifikasi_pada FROM wa_nomor_pengguna WHERE id = $1`, [id])

    const r = await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '000000' })
    expect(r.statusCode).toBe(200)
    expect(r.json().sudah).toBe(true)

    const { rows: b } = await db.query(
      `SELECT terverifikasi_pada FROM wa_nomor_pengguna WHERE id = $1`, [id])
    // Waktu verifikasinya tak boleh bergeser — kalau bergeser, jejak "kapan
    // nomor ini diverifikasi" jadi tak bisa dipercaya.
    expect(b[0].terverifikasi_pada.toISOString()).toBe(a[0].terverifikasi_pada.toISOString())
  })

  it('nomor tak ada → 404, bukan 500', async () => {
    // `app.inject` memakai IP yang sama untuk seluruh test, dan rutenya
    // membatasi 10/menit — jadi test ke-11 dan seterusnya kena 429 karena
    // alasan yang tak ada hubungannya dengan yang diuji.
    //
    // Instance TERPISAH tanpa plugin rate limit: `config.rateLimit` diabaikan
    // Fastify kalau plugin-nya tak terdaftar. Yang diuji di sini penanganan
    // "tak ditemukan", bukan penghitungan batas — dan batasnya sendiri diuji
    // di `ai-rate-limit.test.ts`.
    const bersih = Fastify()
    await bersih.register(waNomorRoutes)
    await bersih.ready()

    const r = await bersih.inject({
      method: 'POST',
      url: '/api/v1/wa/nomor/00000000-0000-0000-0000-000000000000/verifikasi',
      payload: { kode: '123456' } as never,
      headers: { authorization: 'Bearer t' },
    })
    await bersih.close()

    expect(r.statusCode).toBe(404)
  })
})

describe('pendaftaran ULANG mengulang verifikasi', () => {
  it('nomor yang sudah terverifikasi kembali jadi belum', async () => {
    const id = await siapkan({ kode: '666666' })
    await post(`/api/v1/wa/nomor/${id}/verifikasi`, { kode: '666666' })

    await post('/api/v1/wa/nomor', { nomor: NOMOR })

    const { rows } = await db.query(
      `SELECT terverifikasi_pada FROM wa_nomor_pengguna WHERE nomor = $1`, [NOMOR])
    // Kalau tidak, orang bisa memindahkan nomor terverifikasi ke akun lain
    // tanpa membuktikan apa pun.
    expect(rows[0].terverifikasi_pada).toBeNull()
  })
})

describe('aktif / nonaktif', () => {
  it('menonaktifkan lalu mengaktifkan kembali', async () => {
    const id = await siapkan()
    expect((await patch(`/api/v1/wa/nomor/${id}`, { aktif: false })).statusCode).toBe(200)
    let { rows } = await db.query(`SELECT aktif FROM wa_nomor_pengguna WHERE id = $1`, [id])
    expect(rows[0].aktif).toBe(false)

    await patch(`/api/v1/wa/nomor/${id}`, { aktif: true })
    ;({ rows } = await db.query(`SELECT aktif FROM wa_nomor_pengguna WHERE id = $1`, [id]))
    expect(rows[0].aktif).toBe(true)
  })

  it('field bukan boolean ditolak 422', async () => {
    const id = await siapkan()
    expect((await patch(`/api/v1/wa/nomor/${id}`, { aktif: 'ya' })).statusCode).toBe(422)
  })
})

describe('kesiapan kanal dilaporkan', () => {
  it('GET menyertakan kanal_siap', async () => {
    const r = await get('/api/v1/wa/nomor')
    // UI memakainya untuk menjelaskan kenapa "Kirim kode" tak berfungsi,
    // alih-alih menampilkan 503 telanjang setelah diklik.
    expect(r.json()).toHaveProperty('kanal_siap')
    expect(typeof r.json().kanal_siap).toBe('boolean')
  })
})
