import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import mandorRoutes from '../mandor.js'

// ============================================================
// GET /mandor/wage-reports — batas, total, dan bentuk balasan.
//
// ── Kenapa ada
//
// Endpoint ini dulu mengembalikan SELURUH riwayat laporan upah tenant tanpa
// batas apa pun, dan `/mandor` merendernya sekaligus. Di basis dev (50
// laporan) itu sudah 37 KB, 1,2 detik, dan halaman setinggi 4.584px — 4,6
// layar gulir, dengan baris yang menunggu persetujuan tenggelam di antara
// puluhan baris yang sudah dibayar. Ongkosnya tumbuh terus seiring pemakaian
// dan tak pernah membaik sendiri.
//
// ── Kenapa diuji di sini, bukan diandalkan ke penjaga bentuk
//
// `uji-bentuk-balasan.mjs` menangkap kunci yang dibaca web tapi tak dikirim
// API. Ia SENGAJA melewati panggilan di dalam `Promise.all` (alasannya
// panjang, ada di kepala berkas itu: memasangkan hasil destructured ke
// panggilannya butuh analisis alur yang tak andal dengan regex, dan versi
// luasnya memberi 25 alarm palsu).
//
// `/mandor` memuat delapan endpoint dalam satu `Promise.all` — termasuk yang
// ini. Diverifikasi dengan mutasi: menghapus `total` dari balasan TIDAK
// membuat penjaga itu merah. Jadi kalau bentuknya tak diuji di sini, ia tak
// terjaga oleh apa pun.
// ============================================================

let app: FastifyInstance
let c: Client
let authId: string
/** Baris yang DIBUAT berkas ini dan wajib dibongkar sendiri. */
const laporanBuatan: string[] = []
let scopeBuatan: string | null = null
let asgBuatan: string | null = null
let proyekBuatan: string | null = null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const ambil = (qs = '') =>
  app.inject({
    method: 'GET',
    url: '/api/v1/mandor/wage-reports' + qs,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  c = await createRlsClient()

  // Syarat kelayakan dari `resolveCompanyId()` + `authenticate()`, bukan
  // ditebak: `is_active` wajib true dan `users.role_id` wajib terisi.
  // Kandidat yang cuma "punya baris di company_members" dibalas 403.
  //
  // Dan yang lebih halus: user harus punya CAKUPAN PROYEK. Endpoint ini
  // menyaring lewat proyekBolehDibaca(), jadi user tanpa proyek (mis. peran
  // 'client') menerima balasan kosong yang sah. Versi pertama test ini
  // memakai `LIMIT 1` tanpa syarat itu, mendapat user 'client', dan
  // melaporkan "basis punya 0 laporan" — padahal ada 50. Kesimpulan yang
  // sepenuhnya salah, dari test yang berjalan tanpa galat.
  //
  // Dipilih user yang perusahaannya PUNYA proyek dengan laporan upah.
  const r = await c.query(
    `SELECT u.auth_id, cm.company_id
       FROM company_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN roles r2 ON r2.id = u.role_id
      WHERE u.auth_id IS NOT NULL AND cm.is_active AND u.role_id IS NOT NULL
      -- Peran 'client' DIKECUALIKAN.
      --
      -- proyekBolehDibaca() memfilter lewat request.db.projectIds(), dan
      -- untuk 'client' daftar itu kosong — endpoint membalas {reports: [],
      -- total: 0} yang SAH. Test yang kebetulan memilih user client
      -- melaporkan "basis punya 0 laporan" padahal ada 50: kesimpulan yang
      -- sepenuhnya salah, dari test yang berjalan tanpa satu pun galat.
      -- Terjadi sungguhan saat berkas ini ditulis.
      AND COALESCE(r2.name, '') <> 'client'
      -- Mandor ditaruh belakang: cabang user.role === 'mandor' mempersempit
      -- ke assignment miliknya sendiri, dan yang diuji di sini paginasi.
      ORDER BY (COALESCE(r2.name, '') = 'mandor'), u.email
      LIMIT 1`)
  if (!r.rows[0]) {
    throw new Error('Tak ada user aktif dengan peran — test tak bisa menguji apa pun.')
  }
  authId = r.rows[0].auth_id
  const companyId = r.rows[0].company_id

  // ── Fixture disiapkan SENDIRI, tidak menumpang data seed ────────────────
  //
  // Versi pertama menuntut basisnya sudah punya laporan upah. Itu benar di
  // dev (50 laporan) dan SALAH di CI, yang me-replay migrasi ke basis bersih:
  // seluruh berkas gugur dengan "tak ada user dengan cakupan proyek".
  //
  // Yang diuji di sini paginasi, bukan data seed. Jadi test membuat dua
  // laporan miliknya sendiri bila basisnya belum punya cukup — dan
  // membongkarnya di `afterAll`. Test yang bergantung pada data yang mungkin
  // tak ada bukan test yang lebih ketat, ia test yang kadang tak berjalan.
  const cukup = await c.query(
    `SELECT count(*)::int n FROM weekly_wage_reports w
       JOIN mandor_assignments ma ON ma.id = w.assignment_id
       JOIN projects p ON p.id = ma.project_id
      WHERE p.company_id = $1`, [companyId])

  if (cukup.rows[0].n < 2) {
    // `scope_id` ikut diambil: ia NOT NULL. Fixture tanpa kolom itu lolos di
    // dev semata karena basisnya sudah punya ≥2 laporan sehingga cabang ini
    // tak pernah jalan — lalu meledak di CI dengan
    // `null value in column "scope_id" violates not-null constraint`.
    // Cabang yang tak pernah dieksekusi di lokal adalah cabang yang belum diuji.
    let asg = (await c.query(
      `SELECT ma.id, ws.id AS scope_id
         FROM mandor_assignments ma
         JOIN projects p ON p.id = ma.project_id
         JOIN work_scopes ws ON ws.assignment_id = ma.id
        WHERE p.company_id = $1 LIMIT 1`, [companyId])).rows[0]

    // Rantai penugasan dibuat SENDIRI bila belum ada.
    //
    // Versi sebelumnya melempar di sini, dan CI merah: basisnya memang tak
    // punya `mandor_assignments` ber-`work_scopes`. Bergantung pada bentuk
    // seed adalah alasan berkas ini gugur dua kali berturut — dan tiap kali
    // "perbaikannya" cuma menggeser asumsi ke data lain yang juga bisa hilang.
    //
    // Yang diuji berkas ini paginasi. Ia tak butuh seed tertentu; ia butuh
    // dua baris. Jadi seluruh rantainya — proyek, penugasan, lingkup —
    // disediakan sendiri dan dibongkar di `afterAll`.
    if (!asg) {
      const pengguna = (await c.query(
        `SELECT id FROM users WHERE auth_id = $1`, [authId])).rows[0].id

      let proyek = (await c.query(
        `SELECT id FROM projects WHERE company_id = $1 AND is_deleted = false LIMIT 1`,
        [companyId])).rows[0]?.id
      if (!proyek) {
        proyek = (await c.query(
          `INSERT INTO projects (company_id, name, status)
           VALUES ($1, '[TEST] Proyek batas upah', 'active') RETURNING id`,
          [companyId])).rows[0].id
        proyekBuatan = proyek
      }

      const idAsg = (await c.query(
        `INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by)
         VALUES ($1, $2, $2) RETURNING id`, [proyek, pengguna])).rows[0].id
      asgBuatan = idAsg

      const idScope = (await c.query(
        `INSERT INTO work_scopes (assignment_id, scope_name, payment_system)
         VALUES ($1, '[TEST] Lingkup batas upah', 'harian') RETURNING id`,
        [idAsg])).rows[0].id
      scopeBuatan = idScope

      asg = { id: idAsg, scope_id: idScope }
    }

    for (let k = 0; k < 2; k++) {
      const w = (await c.query(
        `INSERT INTO weekly_wage_reports (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount)
         VALUES ($1, $2, DATE '2020-01-06' + ($3 * 7), DATE '2020-01-12' + ($3 * 7), 'draft', 0, 0, 0)
         RETURNING id`, [asg.id, asg.scope_id, k])).rows[0].id
      laporanBuatan.push(w)
    }
  }

  app = Fastify()
  await app.register(mandorRoutes)
  await app.ready()
}, 180_000)

afterAll(async () => {
  // Fixture yang tertinggal membuat test LAIN merah karena sebab yang tak
  // berhubungan — sudah terjadi di sesi ini (fixture perusahaan uji
  // menjatuhkan `submittal-aturan` dan `t9-kelola-badan-usaha`).
  // Urutan terbalik dari pembuatan — FK menuntutnya.
  for (const id of laporanBuatan) {
    await c?.query(`DELETE FROM weekly_wage_reports WHERE id = $1`, [id]).catch(() => {})
  }
  if (scopeBuatan) await c?.query(`DELETE FROM work_scopes WHERE id = $1`, [scopeBuatan]).catch(() => {})
  if (asgBuatan) await c?.query(`DELETE FROM mandor_assignments WHERE id = $1`, [asgBuatan]).catch(() => {})
  if (proyekBuatan) await c?.query(`DELETE FROM projects WHERE id = $1`, [proyekBuatan]).catch(() => {})
  await app?.close()
  await c?.end()
})

describe('wage-reports — batas & bentuk', () => {
  it('membalas reports + total + limit + offset', async () => {
    actAs(authId)
    const r = await ambil()
    expect(r.statusCode).toBe(200)

    const b = JSON.parse(r.body)
    expect(Array.isArray(b.reports)).toBe(true)
    // `total` adalah jumlah SESUNGGUHNYA di server, bukan panjang halaman.
    // Tanpa itu klien tak bisa membedakan "50 laporan" dari "50 pertama dari
    // 4.000" — dan pemakainya menyimpulkan sisanya tidak ada.
    expect(typeof b.total, 'total hilang — klien tak bisa tahu ada berapa sebenarnya').toBe('number')
    expect(typeof b.limit).toBe('number')
    expect(typeof b.offset).toBe('number')
  })

  it('menghormati limit', async () => {
    actAs(authId)
    const r = await ambil('?limit=3')
    const b = JSON.parse(r.body)
    expect(b.reports.length).toBeLessThanOrEqual(3)
    expect(b.limit).toBe(3)
  })

  it('total TIDAK ikut menyusut saat limit mengecil', async () => {
    // Inti dari keberadaan `total`, dan pemeriksaan yang paling mudah palsu.
    //
    // `limit` bawaan 500 sementara basis dev punya ~50 laporan, jadi
    // membandingkan "tanpa limit" dengan "limit kecil" TIDAK membedakan
    // `total = count` dari `total = panjang halaman` — keduanya lolos.
    // Terbukti lewat mutasi: mengganti `count` dengan `data.length` sempat
    // tak membuat satu test pun merah.
    //
    // Yang membedakan adalah memaksa keadaan TERPOTONG: minta 1 baris, lalu
    // tuntut `total` melampauinya.
    actAs(authId)
    const penuh = JSON.parse((await ambil()).body)
    // `beforeAll` menjamin minimal 2 (membuatnya sendiri bila perlu). Kalau
    // masih kurang, yang rusak adalah cakupan tenant endpoint-nya — bukan
    // datanya — dan itu harus terlihat, bukan dilewati.
    expect(
      penuh.total,
      'endpoint mengembalikan <2 laporan padahal fixture menjamin minimal 2 — ' +
      'kemungkinan penyaringan tenant memotong lebih banyak dari seharusnya',
    ).toBeGreaterThanOrEqual(2)

    const satu = JSON.parse((await ambil('?limit=1')).body)
    expect(satu.reports.length).toBe(1)
    expect(
      satu.total,
      'total menyusut mengikuti limit — ia dihitung dari baris yang TERKIRIM, ' +
      'bukan dari yang ADA. Pemakai melihat "1 dari 1" padahal ada puluhan, ' +
      'dan paginasi berhenti di halaman pertama.',
    ).toBe(penuh.total)
    expect(satu.total).toBeGreaterThan(satu.reports.length)
  })

  it('offset menggeser jendela, bukan mengulang', async () => {
    actAs(authId)
    const h1 = JSON.parse((await ambil('?limit=2&offset=0')).body)
    const h2 = JSON.parse((await ambil('?limit=2&offset=2')).body)
    if (h1.total > 3) {
      const id1 = h1.reports.map((x: { id: string }) => x.id)
      const id2 = h2.reports.map((x: { id: string }) => x.id)
      expect(id1.some((x: string) => id2.includes(x)), 'jendela tumpang tindih').toBe(false)
    }
  })

  it('limit di luar akal dijepit, tidak diteruskan mentah', async () => {
    actAs(authId)
    // Tanpa penjepit, `limit=999999` mengembalikan seluruh riwayat tenant —
    // yaitu persis keadaan yang hendak dihentikan pagar ini.
    const b = JSON.parse((await ambil('?limit=999999')).body)
    expect(b.limit).toBeLessThanOrEqual(1000)

    const nol = JSON.parse((await ambil('?limit=0')).body)
    expect(nol.limit).toBeGreaterThanOrEqual(1)

    const sampah = JSON.parse((await ambil('?limit=abc')).body)
    expect(typeof sampah.limit).toBe('number')
    expect(Number.isNaN(sampah.limit)).toBe(false)
  })

  it('offset negatif tidak membuat balasan galat', async () => {
    actAs(authId)
    const r = await ambil('?offset=-5')
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body).offset).toBeGreaterThanOrEqual(0)
  })
})
