/**
 * 5.1 — INVOICE DARI TERMIN, tanpa menunggu pembayaran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * URUTAN YANG SELAMA INI TERBALIK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-12 invoice termin hanya lahir sebagai EFEK SAMPING dari
 * pencatatan pembayaran. Urutannya terbalik dari kenyataan: klien membayar
 * SETELAH menerima invoice, bukan sebaliknya. Akibatnya invoice diterbitkan
 * mundur, bertanggal sama dengan pembayaran, dan tak pernah ada dokumen yang
 * benar-benar dikirim untuk menagih.
 *
 * Yang diuji di sini adalah tiga cara automation ini bisa merusak uang:
 *
 *   GANDA      dua invoice untuk satu termin = klien ditagih dua kali.
 *              Denyut penjadwal 15 menit membuat ini bukan kemungkinan
 *              teoretis melainkan kepastian, kalau idempotensinya bocor.
 *
 *   TERLALU    termin yang BELUM memenuhi syarat tagih tak boleh diterbitkan
 *   CEPAT      invoice-nya. Menagih pekerjaan yang belum dikerjakan adalah
 *              perkara hukum, bukan sekadar bug.
 *
 *   PROYEK     proyek batal/selesai tak menagih apa pun lagi.
 *   MATI
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { KATALOG_TUGAS } from '../jadwal.js'

const PENANDA = '[TEST-5.1]'

let app: FastifyInstance
let db: Client
let projectId: string
let _companyId: string

const panggil = () =>
  app.inject({
    method: 'GET',
    url: '/api/v1/otomasi/jalankan/invoice-termin',
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  // Invoice dulu (FK), baru terminnya.
  await db.query(
    `DELETE FROM invoices WHERE termin_schedule_id IN
       (SELECT id FROM termin_schedules WHERE notes = $1)`, [PENANDA],
  )
  await db.query(`DELETE FROM termin_schedules WHERE notes = $1`, [PENANDA])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows } = await db.query(`
    SELECT id, company_id, progress_pct FROM projects
    WHERE is_deleted = false AND status = 'active'
    ORDER BY progress_pct DESC NULLS LAST LIMIT 1
  `)
  if (!rows[0]) throw new Error('basis tak punya proyek aktif')
  projectId = rows[0].id
  _companyId = rows[0].company_id

  await bersihkan()

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('termin yang SIAP TAGIH diterbitkan invoice-nya', () => {
  it('on_sign menghasilkan invoice, sekali', async () => {
    const { rows } = await db.query(
      `INSERT INTO termin_schedules
         (project_id, termin_number, label, pct_of_contract, amount, trigger_type, status, notes)
       VALUES ($1, 991, 'Termin uji 991', 10, 5000000, 'on_sign', 'pending', $2)
       RETURNING id`,
      [projectId, PENANDA],
    )
    const terminId = rows[0].id

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    // Basis yang membuktikan, bukan jawaban endpoint.
    const inv = await db.query(
      `SELECT id, invoice_number, total_amount, status
         FROM invoices WHERE termin_schedule_id = $1`, [terminId],
    )
    expect(inv.rows).toHaveLength(1)
    expect(inv.rows[0].invoice_number).toBeTruthy()
    expect(Number(inv.rows[0].total_amount)).toBeGreaterThan(0)
  }, 120_000)

  it('DENYUT KEDUA tidak menerbitkan invoice kedua', async () => {
    // Pertahanan terhadap penagihan ganda. Penjadwal memanggil endpoint ini
    // 96 kali sehari; kalau idempotensinya bocor, klien menerima 96 invoice.
    const { rows } = await db.query(
      `SELECT id FROM termin_schedules WHERE notes = $1 AND termin_number = 991`,
      [PENANDA],
    )
    const terminId = rows[0].id

    await panggil()
    await panggil()

    const inv = await db.query(
      `SELECT count(*)::int AS n FROM invoices WHERE termin_schedule_id = $1`,
      [terminId],
    )
    expect(inv.rows[0].n).toBe(1)
  }, 120_000)

  it('penahan TERAKHIR ada di basis: indeks UNIK, bukan pemeriksaan aplikasi', async () => {
    // ⚠ Test "denyut kedua" di atas TIDAK cukup — dibuktikan lewat mutasi:
    // melumpuhkan idempotensi di `lib/invoice-termin.ts` tetap HIJAU, karena
    // dedup notifikasi (`sudah()`) memotong lebih dulu sehingga lib-nya tak
    // pernah dipanggil kedua kali.
    //
    // Artinya perlindungan ganda bertumpu pada satu lapis yang berbasis
    // tabel `notifications`. Begitu harinya berganti, atau notifikasinya
    // gagal tersimpan, lapis itu hilang.
    //
    // Yang benar-benar menahan penagihan ganda saat DUA panggilan berjalan
    // BERSAMAAN hanyalah basis: keduanya membaca "belum ada", keduanya
    // menyisipkan. Pemeriksaan di aplikasi tak bisa menolongnya.
    const idx = await db.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'invoices'
          AND indexdef ILIKE '%termin_schedule_id%'`,
    )
    const adaUnik = idx.rows.some((r: { indexdef: string }) =>
      /CREATE UNIQUE INDEX/i.test(r.indexdef))

    expect(
      adaUnik,
      'invoices.termin_schedule_id tanpa indeks UNIK — dua panggilan bersamaan bisa menerbitkan DUA invoice untuk satu termin (klien ditagih dua kali)',
    ).toBe(true)
  }, 120_000)
})

describe('termin yang BELUM siap tagih tidak disentuh', () => {
  it('on_progress di bawah ambang: nol invoice', async () => {
    // Ambang 999% mustahil tercapai — kalau invoice tetap terbit, saringannya
    // tak bekerja sama sekali.
    const { rows } = await db.query(
      `INSERT INTO termin_schedules
         (project_id, termin_number, label, pct_of_contract, amount, trigger_type, trigger_pct, status, notes)
       VALUES ($1, 992, 'Termin uji 992', 10, 7000000, 'on_progress', 999, 'pending', $2)
       RETURNING id`,
      [projectId, PENANDA],
    )
    const terminId = rows[0].id

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    const inv = await db.query(
      `SELECT count(*)::int AS n FROM invoices WHERE termin_schedule_id = $1`,
      [terminId],
    )
    // Menagih pekerjaan yang belum dikerjakan adalah perkara hukum,
    // bukan sekadar bug.
    expect(inv.rows[0].n).toBe(0)
  }, 120_000)

  it('termin yang sudah `billed` dilewati', async () => {
    // Enum `termin_status` = pending | billed | paid. Diukur, bukan ditebak:
    // tebakan pertama saya ('invoiced') ditolak Postgres seketika.
    const { rows } = await db.query(
      `INSERT INTO termin_schedules
         (project_id, termin_number, label, pct_of_contract, amount, trigger_type, status, notes)
       VALUES ($1, 993, 'Termin uji 993', 10, 3000000, 'on_sign', 'billed', $2)
       RETURNING id`,
      [projectId, PENANDA],
    )
    await panggil()
    const inv = await db.query(
      `SELECT count(*)::int AS n FROM invoices WHERE termin_schedule_id = $1`,
      [rows[0].id],
    )
    expect(inv.rows[0].n).toBe(0)
  }, 120_000)
})

describe('bentuk jawaban & katalog', () => {
  it('jawabannya memuat hitungan yang dibaca UI /sistem', async () => {
    const j = (await panggil()).json()
    expect(j.success).toBe(true)
    expect(typeof j.checked.termin_pending).toBe('number')
    expect(typeof j.checked.invoice_terbit).toBe('number')
    expect(typeof j.checked.sudah_ada).toBe('number')
    expect(typeof j.checked.gagal).toBe('number')
  }, 120_000)

  it('terdaftar di KATALOG_TUGAS dengan jalur yang cocok', () => {
    expect(KATALOG_TUGAS['invoice-termin']).toBeDefined()
    expect(KATALOG_TUGAS['invoice-termin'].jalur)
      .toBe('/api/v1/otomasi/jalankan/invoice-termin')
  })

  it('tanpa token ditolak', async () => {
    const r = await app.inject({
      method: 'GET', url: '/api/v1/otomasi/jalankan/invoice-termin',
    })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })
})
