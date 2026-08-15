/**
 * `GET /api/v1/cost-analytics/portfolio` — rutenya, bukan rumusnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CELAH YANG DITUTUP TEST INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/cost-analytics.ts` punya testnya sendiri, dan rumusnya benar. Yang tak
 * pernah diuji: PERAKITAN masukannya dari basis — dan di situlah dua cacat
 * pernah hidup berdampingan tanpa gejala:
 *
 *   1. Endpoint ini SELALU 500 sejak ditulis, karena memakai `.from()` pada
 *      tabel kategori C. Komentarnya sendiri mencatatnya, lengkap dengan
 *      kalimat "dan tak ada test yang menangkapnya".
 *
 *   2. Tiga query dirakit lewat `Promise.all` dan hanya `.data`-nya yang
 *      dibaca — `.error` tak pernah disentuh. Query yang gagal memulangkan
 *      `data: null`, lalu `?? []` mengubahnya jadi peta kosong: RAB nol, pagu
 *      nol, serapan nol. Layar Portofolio Biaya menampilkannya seperti
 *      perusahaan yang belum membelanjakan apa pun.
 *
 * Cacat kedua ditemukan saat meriset otomasi 2.9, bukan oleh siapa pun yang
 * membuka layarnya. Keduanya sekelas: **laporan yang bohong lebih berbahaya
 * daripada laporan yang mati**, karena yang mati ketahuan.
 *
 * Test ini menjaga keduanya — 200 dengan bentuk yang benar, dan angka yang
 * bukan nol untuk data yang jelas-jelas ada.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import costControlRoutes from '../cost-control.js'

let app: FastifyInstance
let db: Client

const panggil = () =>
  app.inject({
    method: 'GET',
    url: '/api/v1/cost-analytics/portfolio',
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  app = Fastify()
  await app.register(costControlRoutes)
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  await db.end()
})

describe('portofolio biaya — rutenya', () => {
  it('membalas 200, bukan 500', async () => {
    /*
      Terlihat sepele, dan justru itu maksudnya: endpoint ini SELALU 500 sejak
      ditulis, berbulan-bulan, karena satu pilihan pemanggil tabel yang salah.
      Test sesederhana ini akan menangkapnya sejak hari pertama.
    */
    const r = await panggil()
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)
  }, 60_000)

  it('memulangkan angka NYATA, bukan nol yang lahir dari kegagalan senyap', async () => {
    /*
      Inti test ini.

      Kalau salah satu dari tiga query gagal dan errornya ditelan, hasilnya
      TETAP 200 — hanya saja tiap proyek berangka nol dan `dasarPembanding`
      jatuh ke `'tak_ada'`. Bentuk responsnya sah, isinya bohong.

      Prasyaratnya DIUKUR lebih dulu: kalau basis memang tak punya RAB sama
      sekali, test ini tak menguji apa pun dan harus mengatakannya, bukan
      lulus diam-diam.
    */
    const { rows: adaRab } = await db.query(
      `SELECT count(*)::int n FROM rab_items WHERE level = 'category'`)
    expect(adaRab[0].n,
      'basis tak punya satu pun rab_items level category — test ini tak menguji apa pun')
      .toBeGreaterThan(0)

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    /*
      Bentuk respons DIUKUR dari `reply.send()`-nya, bukan ditebak:

          { data: HasilProyek[], meta: RingkasanPortofolio }

      Tebakan pertama saya `{ proyek: [...] }` dan testnya merah dengan "nol
      proyek di respons" — kegagalan yang terbaca seperti endpoint rusak,
      padahal endpointnya benar dan testnya yang salah alamat. Ketujuh kalinya
      dalam sesi ini saya menebak nama alih-alih mengukurnya.
    */
    const badan = r.json() as {
      data?: Array<{ pagu?: number; dasarPembanding?: string }>
      meta?: unknown
    }

    const daftar = badan.data ?? []
    expect(daftar.length, 'nol proyek di respons').toBeGreaterThan(0)

    /*
      Setidaknya SATU proyek harus punya pagu bukan-nol.

      Bukan "semua": proyek tanpa RAB maupun kontrak memang sah berpagu nol,
      dan menuntut semuanya akan membuat test merah untuk data yang benar.
      Tetapi kalau TAK SATU PUN punya pagu, ketiga query pasti gagal — dan itu
      persis keadaan yang tak terlihat dari layar.
    */
    const adaPagu = daftar.some((p) => Number(p.pagu ?? 0) > 0)
    expect(adaPagu,
      'SEMUA proyek berpagu nol — tanda ketiga query gagal dan errornya ditelan')
      .toBe(true)

    // `dasarPembanding` wajib menyertai tiap baris: tanpa itu pembaca tak bisa
    // membedakan persentase terhadap pagu RAP (biaya) dari terhadap RAB
    // (harga jual), padahal keduanya terlihat sama meyakinkan.
    for (const p of daftar) {
      expect(p.dasarPembanding, 'baris tanpa dasarPembanding').toBeTruthy()
    }
  }, 60_000)
})
