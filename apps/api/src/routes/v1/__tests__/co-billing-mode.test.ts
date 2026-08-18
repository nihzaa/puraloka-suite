/**
 * `billing_mode` sekarang DIBACA — terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-13, `change_orders.billing_mode` ditulis rute dan diisi
 * formulir, tetapi tak satu pun baris kode membacanya. Approve menaikkan
 * `projects.contract_value` untuk SEMUA CO — termasuk yang ditandai
 * `separate_co`, yang justru berarti "jangan tagih lewat termin".
 *
 * Yang diuji di sini adalah AKIBATNYA pada basis, bukan bentuk balasannya:
 *
 *   • separate_co  → contract_value TIDAK berubah
 *   • include_termin → contract_value naik sebesar delta
 *   • tanpa cara tagih → approve DITOLAK, dan tak ada yang berubah
 *   • trigger 348: CO include_termin tak bisa ditagih terpisah
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import changeOrderRoutes from '../change-orders.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let userId: string
let pengajuId: string

const TANDA = 'UJI-CObm'

const post = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(
    `DELETE FROM invoices WHERE change_order_id IN
       (SELECT id FROM change_orders WHERE co_number LIKE $1)`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM change_order_items WHERE change_order_id IN
       (SELECT id FROM change_orders WHERE co_number LIKE $1)`, [`${TANDA}%`])
  await db.query('DELETE FROM change_orders WHERE co_number LIKE $1', [`${TANDA}%`])
}

/** CO `submitted` berisi satu item — keadaan tepat sebelum approve. */
async function buatCo(nomor: string, mode: string | null, delta: number) {
  const { rows } = await db.query(
    `INSERT INTO change_orders (project_id, co_number, title, status, billing_mode,
                                total_amount_delta, submitted_at, submitted_by, created_by)
     VALUES ($1, $2, 'Uji billing_mode', 'submitted', $3, $4, now(), $5, $5)
     RETURNING id`,
    [projectId, nomor, mode, delta, pengajuId])
  await db.query(
    `INSERT INTO change_order_items (change_order_id, item_type, description, amount_delta)
     VALUES ($1, 'kerja_tambah', 'Uji', $2)`, [rows[0].id, delta])
  return rows[0].id as string
}

const nilaiKontrak = async () => {
  const { rows } = await db.query('SELECT contract_value FROM projects WHERE id = $1', [projectId])
  return Number(rows[0].contract_value)
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  userId = u[0].id
  /*
    Company dipilih yang punya ANGGOTA KEDUA — bukan yang pertama ditemukan.

    Gerbang SoD di bawah menuntut pengaju yang berbeda dari penyetuju. Dengan
    `LIMIT 1` tanpa ORDER BY, pilihannya diserahkan ke Postgres — dan begitu
    yang terpilih cuma punya satu anggota, SELURUH berkas ini mati di setup
    dengan "butuh pengguna kedua di company ini untuk memenuhi SoD": pesan
    yang menuduh SEED, padahal seednya baik dan yang salah pilihan company.

    Diukur 2026-08-18: dari 3 company ber-anggota, dua di antaranya hanya
    punya SATU anggota.
  */
  const { rows: co } = await db.query(
    `SELECT m.company_id
       FROM company_members m
      WHERE m.user_id = $1
        AND (SELECT count(*) FROM company_members m2
              WHERE m2.company_id = m.company_id) >= 2
      ORDER BY m.created_at, m.company_id
      LIMIT 1`, [userId])
  if (!co.length) {
    throw new Error('tak ada company ber-anggota >= 2 untuk akun uji — '
      + 'periksa seed/keanggotaan, bukan berkas ini')
  }
  companyId = co[0].company_id

  // Proyek dipilih menurut SYARAT: harus punya contract_value > 0, karena
  // seluruh test ini membandingkan angka itu sebelum dan sesudah.
  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 AND contract_value > 0 LIMIT 1`, [companyId])
  if (!p.length) throw new Error('butuh proyek bernilai kontrak > 0')
  projectId = p[0].id

  // Pengaju HARUS orang lain: gerbang SoD melarang menyetujui pengajuan
  // sendiri, dan melemahkannya untuk memudahkan test berarti menguji jalur
  // yang tak pernah dipakai di produksi.
  const { rows: lain } = await db.query(
    `SELECT u.id FROM users u JOIN company_members m ON m.user_id = u.id
      WHERE m.company_id = $1 AND u.id <> $2 LIMIT 1`, [companyId, userId])
  if (!lain.length) throw new Error('butuh pengguna kedua di company ini untuk memenuhi SoD')
  pengajuId = lain[0].id

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(changeOrderRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('approve membaca billing_mode', () => {
  it('TANPA cara tagih: approve ditolak, dan nilai kontrak tak tersentuh', async () => {
    const sebelum = await nilaiKontrak()
    const id = await buatCo(`${TANDA}-NULL`, null, 10_000_000)

    const r = await post(`/api/v1/change-orders/${id}/approve`)
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/belum ditentukan/i)

    expect(await nilaiKontrak(), 'nilai kontrak berubah padahal approve ditolak').toBe(sebelum)

    const { rows } = await db.query('SELECT status FROM change_orders WHERE id = $1', [id])
    expect(rows[0].status, 'CO tercatat approved padahal ditolak').toBe('submitted')
  })

  it('separate_co: CO disetujui, nilai kontrak TIDAK naik', async () => {
    // Inti seluruh berkas ini. Sebelum perbaikan, angka ini naik — lalu IPC
    // menagihnya lewat progres, dan tagihan terpisahnya menagih hal yang sama.
    const sebelum = await nilaiKontrak()
    const id = await buatCo(`${TANDA}-SEP`, 'separate_co', 30_000_000)

    const r = await post(`/api/v1/change-orders/${id}/approve`)
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query('SELECT status FROM change_orders WHERE id = $1', [id])
    expect(rows[0].status).toBe('approved')

    expect(await nilaiKontrak(),
      'separate_co menaikkan nilai kontrak — pekerjaannya akan tertagih dua kali').toBe(sebelum)
  })

  it('final_account: disetujui, nilai kontrak juga tidak naik', async () => {
    const sebelum = await nilaiKontrak()
    const id = await buatCo(`${TANDA}-FIN`, 'final_account', 15_000_000)

    const r = await post(`/api/v1/change-orders/${id}/approve`)
    expect(r.statusCode, r.body).toBe(200)
    expect(await nilaiKontrak()).toBe(sebelum)
  })

  it('include_termin: nilai kontrak naik PERSIS sebesar deltanya', async () => {
    const sebelum = await nilaiKontrak()
    const id = await buatCo(`${TANDA}-INC`, 'include_termin', 25_000_000)

    const r = await post(`/api/v1/change-orders/${id}/approve`)
    expect(r.statusCode, r.body).toBe(200)

    expect(await nilaiKontrak()).toBe(sebelum + 25_000_000)

    // Baseline dibekukan ke nilai SEBELUM — tanpa itu, riwayatnya tak bisa
    // ditelusuri mundur.
    const { rows } = await db.query(
      'SELECT baseline_contract_value FROM change_orders WHERE id = $1', [id])
    expect(Number(rows[0].baseline_contract_value)).toBe(sebelum)
  })

  it('cara tagih ASING ditolak sebelum menyentuh apa pun', async () => {
    // CHECK basis juga menolaknya, jadi barisnya dibuat lewat mode sah lalu
    // diubah — meniru data yang masuk dari jalur lain.
    const sebelum = await nilaiKontrak()
    const id = await buatCo(`${TANDA}-ASING`, 'separate_co', 5_000_000)
    await db.query(
      'ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS change_orders_billing_mode_check')
    try {
      await db.query(`UPDATE change_orders SET billing_mode = 'nanti_saja' WHERE id = $1`, [id])
      const r = await post(`/api/v1/change-orders/${id}/approve`)
      expect(r.statusCode, r.body).toBe(422)
      expect(r.json().error).toMatch(/tidak dikenali/i)
      expect(await nilaiKontrak()).toBe(sebelum)
    } finally {
      // Nilai asing dipulihkan SEBELUM constraint dipasang lagi — kalau tidak,
      // ALTER-nya gagal dan constraint itu HILANG dari basis untuk seterusnya.
      // Melemahkan pagar produksi karena satu test adalah harga yang tak
      // sepadan dengan apa pun.
      await db.query(
        `UPDATE change_orders SET billing_mode = 'separate_co' WHERE id = $1`, [id])
      await db.query(
        `ALTER TABLE change_orders ADD CONSTRAINT change_orders_billing_mode_check
         CHECK (billing_mode IN ('include_termin','separate_co','final_account'))`)
    }
  })
})

describe('trigger 348 — tagihan CO', () => {
  it('CO include_termin TAK BISA ditagih terpisah', async () => {
    const { rows } = await db.query(
      'SELECT id, co_number FROM change_orders WHERE co_number = $1', [`${TANDA}-INC`])

    await expect(db.query(
      `INSERT INTO invoices (project_id, invoice_number, invoice_type, change_order_id,
                             base_amount, total_amount, issued_date, due_date, status, created_by)
       VALUES ($1, $2, 'change_order_billing', $3, 25000000, 25000000,
               '2026-08-13', '2026-09-13', 'draft', $4)`,
      [projectId, `${TANDA}-INV1`, rows[0].id, userId]),
    ).rejects.toThrow(/menyatu dengan termin/i)
  })

  it('CO separate_co BISA ditagih terpisah', async () => {
    const { rows } = await db.query(
      'SELECT id FROM change_orders WHERE co_number = $1', [`${TANDA}-SEP`])
    await db.query(
      `INSERT INTO invoices (project_id, invoice_number, invoice_type, change_order_id,
                             base_amount, total_amount, issued_date, due_date, status, created_by)
       VALUES ($1, $2, 'change_order_billing', $3, 30000000, 30000000,
               '2026-08-13', '2026-09-13', 'draft', $4)`,
      [projectId, `${TANDA}-INV2`, rows[0].id, userId])

    const { rows: inv } = await db.query(
      'SELECT count(*)::int n FROM invoices WHERE invoice_number = $1', [`${TANDA}-INV2`])
    expect(inv[0].n).toBe(1)
  })

  it('CO yang sama TAK BISA ditagih dua kali', async () => {
    const { rows } = await db.query(
      'SELECT id FROM change_orders WHERE co_number = $1', [`${TANDA}-SEP`])
    await expect(db.query(
      `INSERT INTO invoices (project_id, invoice_number, invoice_type, change_order_id,
                             base_amount, total_amount, issued_date, due_date, status, created_by)
       VALUES ($1, $2, 'change_order_billing', $3, 30000000, 30000000,
               '2026-08-13', '2026-09-13', 'draft', $4)`,
      [projectId, `${TANDA}-INV3`, rows[0].id, userId]),
    ).rejects.toThrow(/duplicate|unique/i)
  })

  it('CO yang BELUM disetujui tak bisa ditagih', async () => {
    const id = await buatCo(`${TANDA}-BELUM`, 'separate_co', 8_000_000)
    await expect(db.query(
      `INSERT INTO invoices (project_id, invoice_number, invoice_type, change_order_id,
                             base_amount, total_amount, issued_date, due_date, status, created_by)
       VALUES ($1, $2, 'change_order_billing', $3, 8000000, 8000000,
               '2026-08-13', '2026-09-13', 'draft', $4)`,
      [projectId, `${TANDA}-INV4`, id, userId]),
    ).rejects.toThrow(/hanya yang sudah disetujui/i)
  })

  it('tagihan bertipe CO tanpa menunjuk CO ditolak', async () => {
    await expect(db.query(
      `INSERT INTO invoices (project_id, invoice_number, invoice_type,
                             base_amount, total_amount, issued_date, due_date, status, created_by)
       VALUES ($1, $2, 'change_order_billing', 1000000, 1000000,
               '2026-08-13', '2026-09-13', 'draft', $3)`,
      [projectId, `${TANDA}-INV5`, userId]),
    ).rejects.toThrow(/wajib menunjuk change order/i)
  })

  it('tagihan biasa yang menunjuk CO juga ditolak', async () => {
    // Jalan masuk paling sunyi: menunjuk CO tapi bertipe lain akan luput dari
    // seluruh pemeriksaan di atas.
    const { rows } = await db.query(
      'SELECT id FROM change_orders WHERE co_number = $1', [`${TANDA}-SEP`])
    await expect(db.query(
      `INSERT INTO invoices (project_id, invoice_number, invoice_type, change_order_id,
                             base_amount, total_amount, issued_date, due_date, status, created_by)
       VALUES ($1, $2, 'retention_release', $3, 1000000, 1000000,
               '2026-08-13', '2026-09-13', 'draft', $4)`,
      [projectId, `${TANDA}-INV6`, rows[0].id, userId]),
    ).rejects.toThrow(/harus bertipe change_order_billing/i)
  })
})
