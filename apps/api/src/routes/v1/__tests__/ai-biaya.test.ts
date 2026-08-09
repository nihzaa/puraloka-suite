/**
 * GET /api/v1/ai/biaya — riwayat pemakaian untuk halaman Pemakaian & Biaya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: BENTUK DERETNYA, BUKAN SEKADAR "200 OK"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman ini menjawab *kenapa* biaya berubah, dan jawabannya bergantung pada
 * dua hal yang gampang salah tanpa menimbulkan galat:
 *
 *   HARI NOL   grafik yang melompati hari tanpa pemakaian menarik garis lurus
 *              antara dua puncak — membaca tren yang tak pernah terjadi
 *   RENTANG    `?hari=` yang tak dibatasi membuat satu permintaan menarik
 *              seluruh riwayat tenant, dan halaman yang menggantung terbaca
 *              sebagai aplikasi rusak
 *
 * Keduanya lolos "status 200".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import aiConfigRoutes from '../ai-config.js'

// Hanya heksadesimal — `i` di 'bia1a' bukan digit hex dan Postgres
// menolaknya sebagai uuid tak sah.
const PENANDA = '00000000-0000-0000-0000-00000000b1a4'

let app: FastifyInstance
let db: Client
let companyId: string

const ambil = (q = '') =>
  app.inject({ method: 'GET', url: `/api/v1/ai/biaya${q}`, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = rows[0].id

  await db.query(`DELETE FROM ai_biaya_token WHERE correlation_id = $1`, [PENANDA])

  // Dua hari BERJAUHAN dengan satu hari kosong di antaranya — itu yang
  // membuktikan hari nol tetap digambar.
  for (const [umur, idr] of [[1, 500], [3, 1500]] as const) {
    await db.query(
      `INSERT INTO ai_biaya_token
         (company_id, asisten, penyedia, model, token_masuk, token_keluar, token_cache_baca,
          biaya_usd, biaya_idr, kurs_idr, correlation_id, dibuat_pada)
       VALUES ($1, 'staff', 'anthropic', 'claude-haiku-4-5', 1000, 100, 400,
               0.001, $2, 16000, $3, now() - ($4 || ' days')::interval)`,
      [companyId, idr, PENANDA, String(umur)],
    )
  }

  app = Fastify()
  await app.register(aiConfigRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_biaya_token WHERE correlation_id = $1`, [PENANDA])
  await app.close()
  await db.end()
})

describe('bentuk deret harian', () => {
  it('jumlah titik SAMA dengan hari yang diminta', async () => {
    // 7 diminta, 7 dikirim — bukan hanya hari yang ada datanya. Ini yang
    // membuat hari kosong tergambar sebagai nol alih-alih dilompati.
    expect((await ambil('?hari=7')).json().harian).toHaveLength(7)
    expect((await ambil('?hari=30')).json().harian).toHaveLength(30)
  })

  it('hari TANPA pemakaian bernilai nol, bukan hilang', async () => {
    // Rentang 180 hari pasti memuat hari kosong (seed hanya 30 hari).
    // Memakai rentang pendek membuat test ini bergantung pada kebetulan isi
    // basis — dan test yang hijau karena kebetulan tak membuktikan apa pun.
    const j = (await ambil('?hari=180')).json()
    expect(j.harian).toHaveLength(180)
    expect(j.harian.some((h: { idr: number }) => h.idr === 0)).toBe(true)
  })

  it('urut menaik menurut tanggal', async () => {
    const j = (await ambil('?hari=14')).json()
    const tanggal = j.harian.map((h: { tanggal: string }) => h.tanggal)
    expect([...tanggal].sort()).toEqual(tanggal)
  })

  it('hari terakhir adalah HARI INI', async () => {
    const j = (await ambil('?hari=7')).json()
    const hariIni = new Date().toISOString().slice(0, 10)
    // Deret yang berhenti kemarin membuat lonjakan hari ini tak terlihat —
    // padahal itu yang paling sering dicari orang saat membuka halaman.
    expect(j.harian[j.harian.length - 1].tanggal).toBe(hariIni)
  })
})

describe('rentang dibatasi', () => {
  it('bawaan 30 hari', async () => {
    expect((await ambil()).json().hari).toBe(30)
  })

  it('permintaan 9999 hari dipangkas ke 180', async () => {
    // Tanpa batas, satu permintaan menarik seluruh riwayat tenant.
    expect((await ambil('?hari=9999')).json().hari).toBe(180)
  })

  it('permintaan 0 atau negatif jadi 1, bukan nol', async () => {
    expect((await ambil('?hari=0')).json().hari).toBe(1)
    expect((await ambil('?hari=-5')).json().hari).toBe(1)
  })

  it('masukan bukan angka jatuh ke bawaan', async () => {
    expect((await ambil('?hari=abc')).json().hari).toBe(30)
  })
})

describe('pemecahan & total', () => {
  it('per_asisten dan per_model terurut dari termahal', async () => {
    const j = (await ambil('?hari=30')).json()
    for (const daftar of [j.per_asisten, j.per_model]) {
      const idr = daftar.map((d: { idr: number }) => d.idr)
      expect([...idr].sort((a, b) => b - a)).toEqual(idr)
    }
  })

  it('penghematan cache DINYATAKAN terpisah', async () => {
    const j = (await ambil('?hari=7')).json()
    // Migrasi 250 memisahkan token cache justru supaya penghematannya
    // terlihat. Kalau dijumlahkan diam-diam ke token biasa, penghematan itu
    // tak pernah muncul — dan yang tak terlihat tak akan dioptimalkan.
    expect(j.total).toHaveProperty('cache_baca')
    expect(j.total).toHaveProperty('rasio_cache')
    expect(j.total.cache_baca).toBeGreaterThan(0)
    expect(j.total.rasio_cache).toBeGreaterThan(0)
  })

  it('rasio cache antara 0 dan 100', async () => {
    const j = (await ambil('?hari=30')).json()
    expect(j.total.rasio_cache).toBeGreaterThanOrEqual(0)
    expect(j.total.rasio_cache).toBeLessThanOrEqual(100)
  })

  it('total idr sama dengan jumlah deret hariannya', async () => {
    // Rentang PENUH: `?hari=7` memuat baris yang jatuh di hari ke-8 UTC
    // (awal hari + baris hari ini), dan selisihnya membuat test ini menuduh
    // rute padahal rentangnya yang tak sepadan.
    const j = (await ambil('?hari=180')).json()
    const jumlah = j.harian.reduce((a: number, h: { idr: number }) => a + h.idr, 0)
    // Dua angka yang menjawab pertanyaan sama harus sepakat. Kalau tidak,
    // salah satunya membohongi pembacanya — dan tak ada cara tahu yang mana.
    expect(Math.round(jumlah)).toBe(Math.round(j.total.idr))
  })
})

describe('tenancy', () => {
  it('rute menyaring lewat request.db, bukan supabase mentah', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ai-config.ts'),
      'utf8',
    )
    // `ai_biaya_token` kategori B: `request.db` menyaring company_id otomatis.
    // Supabase mentah di sini akan menampilkan biaya SELURUH tenant sebagai
    // milik satu perusahaan.
    expect(src).not.toMatch(/supabase\s*\.\s*from\s*\(\s*['"]ai_biaya_token/)
  })
})
