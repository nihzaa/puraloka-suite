import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import progressRoutes from '../progress.js'

/**
 * GEOTAG lewat jalur LAPORAN HARIAN, terhadap Postgres NYATA.
 *
 * ── Cacat yang ditutup
 *
 * Diukur 2026-08-08: **0 dari 36 foto punya geotag**, padahal
 *
 *   `lib/geotag.ts` (haversine) ber-test          ✅
 *   penjaga CI `uji-invarian-geotag.mjs`          ✅
 *   jalur PENAUTAN foto (progress.ts ~150) menulis ✅
 *   UI membaca & menampilkan penanda lokasi        ✅
 *
 * Yang hilang dua, di dua sisi:
 *   • klien tak pernah meminta koordinat dari perangkat (nol
 *     `getCurrentPosition` di seluruh kode aplikasi)
 *   • **jalur ini** — insert foto bersama laporan harian — menyalin `url`,
 *     `caption`, `taken_at` dan MEMBUANG koordinatnya. Dan justru inilah
 *     jalur yang dipakai setiap hari; jalur penautan hanya untuk foto yang
 *     menyusul saat sinyal buruk.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Penyaringannya sudah dikunci 9 test di `lib/geotag.test.ts` (5 mutasi
 * MERAH) tanpa menyentuh basis. Yang tersisa: apakah kolomnya benar-benar
 * SAMPAI ke tabel lewat jalur ini, dan apakah koordinat cacat menggagalkan
 * seluruh unggahan foto (yang tak boleh terjadi).
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const kirimLog = (photos: Array<Record<string, unknown>>, tanda: string) =>
  app.inject({
    method: 'POST', url: `/api/v1/projects/${projectId}/progress-logs`,
    payload: { pct_overall: 0, notes: tanda, photos },
    headers: { authorization: 'Bearer t' },
  })

async function purge() {
  await client.query(
    `DELETE FROM project_photos
      WHERE progress_log_id IN (SELECT id FROM progress_logs WHERE notes LIKE '[TEST]%')`)
  await client.query(`DELETE FROM progress_logs WHERE notes LIKE '[TEST]%'`)
}

/** Foto milik satu laporan uji, beserta kolom geotag-nya. */
async function fotoDari(tanda: string) {
  const { rows } = await client.query(
    `SELECT f.lintang, f.bujur, f.akurasi_m, f.sumber_lokasi, f.lokasi_dicatat_pada
       FROM project_photos f
       JOIN progress_logs l ON l.id = f.progress_log_id
      WHERE l.notes = $1`, [tanda])
  return rows
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  // Proyek yang PUNYA item RAB — bukan sekadar proyek pertama.
  //
  // Versi pertama memakai `ORDER BY created_at LIMIT 1` dan mendapat proyek
  // ber-NOL item, sehingga test mode `detail` `return` diam-diam tanpa pernah
  // menjalankan jalur yang diujinya. Ketahuan dari mutation testing: melucuti
  // geotag dari jalur detail tetap HIJAU.
  //
  // Test yang melewati dirinya sendiri terlihat sama persis dengan test yang
  // lulus — dan itu bentuk kegagalan yang paling mahal.
  const { rows: p } = await client.query(
    `SELECT p.id FROM projects p
      WHERE p.company_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM rab_items r WHERE r.project_id = p.id AND r.level = 'item')
      ORDER BY p.created_at LIMIT 1`)
  if (!p[0]) throw new Error('tak ada proyek ber-item RAB — test mode detail tak bisa dijalankan')
  projectId = p[0].id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(progressRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /projects/:id/progress-logs — geotag foto', () => {
  // INVARIAN INTI. Sebelum perbaikan ini, jalur ini membuang koordinatnya
  // tanpa gejala apa pun: foto masuk, laporan masuk, dan kolom geotag kosong.
  it('koordinat SAMPAI ke tabel lewat jalur laporan harian', async () => {
    const tanda = '[TEST] geotag sampai'
    const r = await kirimLog([{
      url: 'https://contoh/foto-1.jpg', caption: 'uji',
      lintang: -6.9024, bujur: 107.6186, akurasi_m: 12, sumber_lokasi: 'perangkat',
    }], tanda)
    expect(r.statusCode).toBeLessThan(300)

    const f = await fotoDari(tanda)
    expect(f).toHaveLength(1)
    expect(Number(f[0].lintang)).toBeCloseTo(-6.9024, 4)
    expect(Number(f[0].bujur)).toBeCloseTo(107.6186, 4)
    expect(Number(f[0].akurasi_m)).toBe(12)
    expect(f[0].sumber_lokasi).toBe('perangkat')
    // Waktu pencatatan dibedakan dari `taken_at`: yang satu kapan lokasinya
    // dibaca, yang lain kapan fotonya diambil.
    expect(f[0].lokasi_dicatat_pada).toBeTruthy()
  })

  // Foto tanpa geotag adalah keadaan NORMAL — izin ditolak, di dalam gedung,
  // perangkat lama. Ia harus tetap masuk.
  it('foto TANPA koordinat tetap masuk, kolom geotag kosong', async () => {
    const tanda = '[TEST] geotag kosong'
    const r = await kirimLog([{ url: 'https://contoh/foto-2.jpg' }], tanda)
    expect(r.statusCode).toBeLessThan(300)

    const f = await fotoDari(tanda)
    expect(f).toHaveLength(1)
    expect(f[0].lintang).toBeNull()
  })

  // Constraint migrasi 190 menolak koordinat di luar jangkauan. Kalau nilai
  // cacat diteruskan mentah, SELURUH insert foto gagal dan laporan kehilangan
  // fotonya — gara-gara GPS yang salah lapor. Fotonya jauh lebih berharga
  // daripada titiknya.
  it('koordinat CACAT tidak menggagalkan unggahan — foto tetap masuk tanpa titik', async () => {
    const tanda = '[TEST] geotag cacat'
    const r = await kirimLog([{
      url: 'https://contoh/foto-3.jpg', lintang: 999, bujur: 107.6, akurasi_m: 5,
    }], tanda)
    expect(r.statusCode).toBeLessThan(300)

    const f = await fotoDari(tanda)
    expect(f).toHaveLength(1)
    expect(f[0].lintang).toBeNull()
  })

  // Sumber yang tak dikenal akan ditolak constraint dan menggagalkan insert.
  // Gagal-tertutup ke 'perangkat'.
  it('sumber lokasi tak dikenal jatuh ke perangkat, bukan menggagalkan', async () => {
    const tanda = '[TEST] geotag sumber aneh'
    const r = await kirimLog([{
      url: 'https://contoh/foto-4.jpg',
      lintang: -6.9, bujur: 107.6, sumber_lokasi: 'entah-apa',
    }], tanda)
    expect(r.statusCode).toBeLessThan(300)

    const f = await fotoDari(tanda)
    expect(f[0].sumber_lokasi).toBe('perangkat')
  })

  // JALUR KEDUA. Rute ini punya DUA tempat insert foto — `mode: 'detail'`
  // (progres per item RAB) dan `mode: 'daily'` (laporan harian) — dan
  // keduanya menyalin kolomnya sendiri-sendiri.
  //
  // Test ini lahir dari mutation testing: melucuti geotag dari jalur `daily`
  // membuat test MERAH, tapi melucutinya dari jalur `detail` tetap HIJAU.
  // Jalur yang tak dilewati test tak terjaga, dan cacat yang sama bisa
  // kembali di sana tanpa ada yang tahu.
  it('mode DETAIL juga membawa geotag — jalur insert kedua', async () => {
    const { rows: item } = await client.query(
      `SELECT id FROM rab_items WHERE project_id = $1 AND level = 'item' LIMIT 1`,
      [projectId])
    // Tidak `return` diam-diam: `beforeAll` sudah menjamin proyeknya punya
    // item. Kalau tidak ada di sini, itu keadaan yang harus MERAH.
    expect(item[0]).toBeDefined()

    const tanda = '[TEST] geotag mode detail'
    const r = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/progress-logs`,
      payload: {
        mode: 'detail', rab_item_id: item[0].id, pct_completion: 10, notes: tanda,
        photos: [{
          url: 'https://contoh/detail.jpg',
          lintang: -6.9024, bujur: 107.6186, akurasi_m: 9,
        }],
      },
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBeLessThan(300)

    const f = await fotoDari(tanda)
    expect(f).toHaveLength(1)
    expect(Number(f[0].lintang)).toBeCloseTo(-6.9024, 4)
  })

  it('beberapa foto satu laporan semuanya bergeotag', async () => {
    const tanda = '[TEST] geotag banyak'
    const titik = { lintang: -6.9024, bujur: 107.6186, akurasi_m: 8 }
    const r = await kirimLog([
      { url: 'https://contoh/a.jpg', ...titik },
      { url: 'https://contoh/b.jpg', ...titik },
      { url: 'https://contoh/c.jpg', ...titik },
    ], tanda)
    expect(r.statusCode).toBeLessThan(300)

    const f = await fotoDari(tanda)
    expect(f).toHaveLength(3)
    expect(f.every((x) => x.lintang !== null)).toBe(true)
  })
})
