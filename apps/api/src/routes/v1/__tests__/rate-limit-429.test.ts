import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

// ============================================================
// RATE LIMIT harus membalas 429, BUKAN 500.
//
// ── Kenapa test ini ada
//
// Bug nyata (ditemukan 2026-07-31 dari pemakaian, bukan dari review): user yang
// salah password beberapa kali tertahan rate limiter, tapi yang diterima
// browser adalah **500 "Internal server error"** — bukan pesan "coba lagi dalam
// 1 menit" yang sudah susah payah ditulis di `errorResponseBuilder`.
//
// Sebabnya halus: @fastify/rate-limit v11 meneruskan objek POLOS hasil
// `errorResponseBuilder` ke `setErrorHandler` — bukan instance `Error`. Jadi
// `statusCode`, `code`, dan `message` semuanya `undefined`. Baris
// `err.statusCode ?? 500` karena itu jatuh ke 500, dan cabang `status >= 500`
// menelan pesan aslinya sebelum sempat dikirim.
//
// Kelas kegagalan yang persis dilarang AUTOPILOT §9a: kodenya "benar" (limiter
// memang menahan), test lama hijau, dan yang rusak justru **apa yang dilihat
// pengguna**. Dari sisi user, sistemnya tampak rusak — padahal ia hanya perlu
// menunggu semenit. Itu membuat orang mengira passwordnya yang bermasalah lalu
// mencoba lagi dan lagi, yang justru memperpanjang blokirnya.
//
// ── Kenapa error handler-nya disalin, bukan meng-import `index.ts`
//
// `src/index.ts` adalah entrypoint: meng-import-nya menyalakan seluruh server
// (listen ke port, buka koneksi DB, daftarkan 30+ route). Yang diuji di sini
// murni logika pemetaan error → status, jadi handler yang sama dipasang di app
// mini. Konsekuensinya jujur: kalau `index.ts` disunting tanpa menyunting sini,
// test ini bisa hijau sementara produksi rusak lagi. Penjaganya ada di bawah —
// `it('bentuk handler di index.ts masih sama')` membaca berkas aslinya dan
// gagal kalau penanda `isRateLimit` hilang dari sana.
// ============================================================

/** Handler yang sama persis dengan `src/index.ts` — lihat catatan di atas. */
type ErrorMasuk = Partial<Error> & {
  statusCode?: number
  code?: string
  isRateLimit?: boolean
  error?: string
}

function pasangHandler(app: FastifyInstance) {
  app.setErrorHandler((err: ErrorMasuk, _req, reply) => {
    const status = err.statusCode ?? 500
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({ error: 'Ukuran file terlalu besar untuk diunggah' })
    }
    if (err.isRateLimit) {
      return reply.status(429).send({ error: err.error })
    }
    if (status >= 500) {
      return reply.status(500).send({ error: 'Internal server error' })
    }
    return reply.status(status).send({ error: err.message })
  })
}

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  await app.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      isRateLimit: true,
      error: 'Terlalu banyak percobaan, coba lagi dalam 1 menit',
    }),
  })
  pasangHandler(app)

  app.post('/login', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } },
    async () => ({ ok: true }))

  // Pembanding: error biasa harus TETAP jadi 500 sesudah perbaikan. Tanpa ini,
  // "semua error jadi 429" akan lolos sebagai perbaikan yang benar.
  app.get('/meledak', async () => { throw new Error('kesalahan sungguhan') })

  // Pembanding kedua: error ber-statusCode (mis. 404 dari route) tak boleh
  // ikut tergeser jadi 429 atau 500.
  app.get('/tidak-ada', async () => {
    const e = new Error('Tidak ditemukan') as Error & { statusCode: number }
    e.statusCode = 404
    throw e
  })

  await app.ready()
})

afterAll(async () => { await app.close() })

const login = () => app.inject({ method: 'POST', url: '/login', payload: {} })

describe('rate limit → 429', () => {
  it('permintaan di bawah batas tetap lolos', async () => {
    expect((await login()).statusCode).toBe(200)
    expect((await login()).statusCode).toBe(200)
  })

  it('permintaan ke-3 dibalas 429 — bukan 500', async () => {
    const r = await login()
    // Inti bug-nya: SEBELUM perbaikan angka ini 500.
    expect(r.statusCode).toBe(429)
  })

  it('pesannya sampai ke user, tidak tertelan "Internal server error"', async () => {
    const r = await login()
    const body = r.json()
    expect(body.error).toBe('Terlalu banyak percobaan, coba lagi dalam 1 menit')
    // Penegasan terpisah: kalimat inilah yang dulu menggantikan pesan aslinya.
    expect(body.error).not.toBe('Internal server error')
  })

  it('error sungguhan TETAP 500 — perbaikan tidak melebar', async () => {
    const r = await app.inject({ method: 'GET', url: '/meledak' })
    expect(r.statusCode).toBe(500)
    expect(r.json().error).toBe('Internal server error')
  })

  it('error ber-statusCode tetap memakai statusCode-nya sendiri', async () => {
    const r = await app.inject({ method: 'GET', url: '/tidak-ada' })
    expect(r.statusCode).toBe(404)
    expect(r.json().error).toBe('Tidak ditemukan')
  })
})

describe('penjaga sinkronisasi dengan index.ts', () => {
  // Test di atas memakai SALINAN handler. Penjaga ini memastikan salinan itu
  // tidak diam-diam menyimpang dari aslinya — kalau `isRateLimit` dihapus dari
  // index.ts, bug-nya kembali sementara test di atas tetap hijau.
  it('index.ts masih menempelkan dan membaca penanda isRateLimit', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const isi = readFileSync(join(import.meta.dirname, '..', '..', '..', 'index.ts'), 'utf8')

    // Ditempelkan di errorResponseBuilder…
    expect(isi).toMatch(/isRateLimit:\s*true/)
    // …DAN dibaca di setErrorHandler untuk membalas 429.
    expect(isi).toMatch(/if\s*\(err\.isRateLimit\)/)
    expect(isi).toMatch(/reply\.status\(429\)/)
  })

  it('index.ts TIDAK memakai reply.statusCode sebagai fallback status', async () => {
    // Regresi nyata yang tertangkap test ini 2026-07-31, sebelum sempat
    // ter-commit: `err.statusCode ?? reply.statusCode ?? 500` terlihat lebih
    // aman ("pakai status yang sudah ada"), padahal untuk `throw new Error(...)`
    // biasa reply.statusCode masih 200 — kesalahan server sungguhan jadi
    // terkirim sebagai 200 SUKSES, lengkap dengan body `{error: ...}`.
    // Monitoring yang menghitung rasio 5xx tidak akan pernah melihatnya.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const isi = readFileSync(join(import.meta.dirname, '..', '..', '..', 'index.ts'), 'utf8')
    expect(isi).not.toMatch(/err\.statusCode\s*\?\?\s*reply\.statusCode/)
  })

  it('auth.ts (login) juga menempelkan penanda itu', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const isi = readFileSync(join(import.meta.dirname, '..', 'auth.ts'), 'utf8')
    // Route login punya errorResponseBuilder SENDIRI yang menimpa yang global —
    // kalau penanda hilang di sini, justru endpoint terpentingnya yang rusak.
    expect(isi).toMatch(/isRateLimit:\s*true/)
  })
})
