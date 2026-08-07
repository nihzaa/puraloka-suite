import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import cashRoutes from '../cash.js'

/**
 * KAS — nominal cacat tak boleh masuk basis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * RANTAI CACAT YANG DITUTUP TEST INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08 di Node DAN di Postgres, bukan diperkirakan:
 *
 *   1. `parseFloat('abc')` → NaN
 *   2. `Number(saldo) < NaN` = **false** → cek saldo LOLOS, berapa pun saldonya
 *   3. Postgres `numeric` **MENERIMA NaN** — kolom NOT NULL tak menahannya
 *   4. `CHECK (qty > 0)` juga lolos — perbandingan NaN di Postgres true
 *   5. `SELECT sum(v)` atas (100, 250, NaN) = **NaN**
 *
 * Langkah 5 yang paling mahal: satu baris rusak membuat total SELURUH laporan
 * tak punya angka, dan request-nya membalas 201 seolah sukses.
 *
 * Test ini menembak jalur HTTP-nya, karena itu satu-satunya yang membuktikan
 * pemeriksaan benar-benar terpasang di tempat yang dilewati permintaan nyata.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let kategoriId: string
let akunKecil: string
let akunA: string
let akunB: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

/**
 * `Idempotency-Key` WAJIB unik per kasus uji.
 *
 * `POST /cash/transfers` melewati `gerbangIdempotensi` sebelum apa pun
 * divalidasi — dan gerbang itu MENGULANG balasan pertama untuk kunci yang
 * sama. Percobaan pertama test ini tak mengirim kunci sama sekali, dan
 * seluruh kasus transfer membalas 200: itu balasan replay, bukan handler.
 *
 * Gerbangnya benar (satu baris ganda menggeser saldo dua rekening dua kali).
 * Yang keliru adalah test yang mengira 200 berarti "diterima".
 */
let nomorUji = 0
const post = (url: string, payload: unknown) =>
  app.inject({
    method: 'POST', url, payload: payload as never,
    headers: {
      authorization: 'Bearer t',
      'idempotency-key': `uji-nominal-${++nomorUji}-${process.pid}`,
    },
  })

/**
 * `POST /cash/expenses` menerima **multipart**, bukan JSON — nota pengeluaran
 * diunggah bersama datanya. Percobaan pertama test ini mengirim JSON dan
 * seluruhnya membalas 200: `request.parts()` tak menemukan apa pun dan handler
 * keluar sebelum satu pun pemeriksaan berjalan.
 *
 * Itu bukan cacat endpoint — itu test yang menembak jalur yang salah, dan
 * kalau tak diperiksa ia akan "hijau" untuk alasan yang keliru.
 */
const BATAS = '----ujiNominal'
function multipart(fields: Record<string, string | null | undefined>) {
  const potong = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) =>
      `--${BATAS}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
    .join('')
  return {
    payload: `${potong}--${BATAS}--\r\n`,
    headers: {
      authorization: 'Bearer t',
      'content-type': `multipart/form-data; boundary=${BATAS}`,
    },
  }
}

const postForm = (url: string, fields: Record<string, string | null | undefined>) =>
  app.inject({ method: 'POST', url, ...multipart(fields) })

/** Berapa baris bernilai NaN yang ada di kolom uang? Harus SELALU nol. */
async function jumlahNaN() {
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*) FROM project_expenses WHERE total_amount = 'NaN'::numeric)::int e,
      (SELECT count(*) FROM cash_transfers   WHERE amount       = 'NaN'::numeric)::int t`)
  return rows[0].e + rows[0].t
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id

  // Basis dev punya NOL kategori pengeluaran (diukur 2026-08-08), jadi
  // fixture-nya dibuat di sini. Tanpa ini handler menolak lebih dulu dengan
  // "category_id wajib diisi" — 400 yang benar untuk alasan yang SALAH, dan
  // test akan terlihat hijau tanpa pernah menyentuh pemeriksaan nominal.
  // `type` NOT NULL tanpa default, enum `expense_category_type`.
  const { rows: k } = await client.query(
    `INSERT INTO project_expense_categories (project_id, name, type)
     VALUES ($1, '[TEST-NAN] kategori uji', 'material')
     ON CONFLICT DO NOTHING
     RETURNING id`, [projectId])
  kategoriId = k[0]?.id
    ?? (await client.query(
      `SELECT id FROM project_expense_categories WHERE project_id = $1 LIMIT 1`,
      [projectId])).rows[0]?.id

  const { rows: a } = await client.query(
    `SELECT id, type FROM cash_accounts WHERE is_active ORDER BY created_at LIMIT 3`)
  akunA = a[0]?.id
  akunB = a[1]?.id
  akunKecil = a.find((x) => x.type === 'petty_cash')?.id ?? a[0]?.id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  // WAJIB: endpoint pengeluaran memanggil `request.parts()`.
  await app.register(await import('@fastify/multipart'))
  await app.register(cashRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await client.query(`DELETE FROM project_expenses WHERE description LIKE '[TEST-NAN]%'`)
  await client.query(`DELETE FROM project_expense_categories WHERE name LIKE '[TEST-NAN]%'`)
  await client.query(`DELETE FROM cash_transfers WHERE notes LIKE '[TEST-NAN]%'`)
  await app?.close()
  await client?.end()
})

describe('POST /api/v1/cash/expenses — nominal cacat', () => {
  const dasar = () => ({
    project_id: projectId,
    category_id: kategoriId,
    description: '[TEST-NAN] percobaan nominal',
    expense_source: 'petty_cash',
    petty_cash_id: akunKecil,
  })

  // Inti cacatnya. Sebelum diperbaiki: 201, tersimpan NaN, laporan rusak.
  it('menolak qty yang bukan angka — 400, dan TIDAK menyimpan apa pun', async () => {
    const sebelum = await jumlahNaN()
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: 'abc', unit_price: '100000',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/qty/i)
    expect(await jumlahNaN()).toBe(sebelum)
  })

  it('menolak unit_price yang bukan angka', async () => {
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: '1', unit_price: 'seratus ribu',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/unit_price/i)
  })

  // `parseFloat('12abc')` = 12 — ia membaca sejauh yang bisa lalu berhenti
  // diam-diam, jadi salah ketik jadi ANGKA YANG SALAH, bukan penolakan.
  it('menolak angka yang diikuti teks, tidak membacanya separuh', async () => {
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: '12abc', unit_price: '1000',
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak qty nol — pengeluaran nol satuan tak berarti apa pun', async () => {
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: '0', unit_price: '1000',
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak harga negatif', async () => {
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: '1', unit_price: '-5000',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/negatif/i)
  })

  // Salah ketik nol beruntun jauh lebih sering daripada transaksi triliunan.
  it('menolak nominal di luar batas wajar', async () => {
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: '1', unit_price: '1e18',
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak Infinity', async () => {
    const r = await postForm('/api/v1/cash/expenses', {
      ...dasar(), qty: '1', unit_price: 'Infinity',
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('POST /api/v1/cash/transfers — nominal cacat', () => {
  it('menolak amount berupa teks — dan TIDAK menyimpan NaN', async () => {
    if (!akunA || !akunB) return
    const sebelum = await jumlahNaN()

    // Sebelum diperbaiki: `!body.amount` melewatkan string tak kosong, lalu
    // `Number(saldo) < "abc"` bernilai false — cek saldo ikut lolos, dan
    // trigger memindahkan NaN ke saldo KEDUA rekening.
    const r = await post('/api/v1/cash/transfers', {
      from_account_id: akunA, to_account_id: akunB,
      amount: 'abc', status: 'confirmed', notes: '[TEST-NAN] transfer',
    })
    expect(r.statusCode).toBe(400)
    expect(await jumlahNaN()).toBe(sebelum)
  })

  it('menolak amount nol — transfer nol tak memindahkan apa pun', async () => {
    if (!akunA || !akunB) return
    const r = await post('/api/v1/cash/transfers', {
      from_account_id: akunA, to_account_id: akunB,
      amount: 0, notes: '[TEST-NAN] nol',
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak amount negatif — pembalikan punya jalurnya sendiri', async () => {
    if (!akunA || !akunB) return
    const r = await post('/api/v1/cash/transfers', {
      from_account_id: akunA, to_account_id: akunB,
      amount: -1000, notes: '[TEST-NAN] negatif',
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('basis tetap bersih dari NaN', () => {
  // Penjaga tingkat data: apa pun yang terjadi di test-test di atas, tak boleh
  // ada satu pun NaN yang tertinggal. Ini yang paling penting — sebab NaN yang
  // sudah masuk akan meracuni SUM setiap laporan yang membacanya.
  it('nol baris NaN di project_expenses dan cash_transfers', async () => {
    expect(await jumlahNaN()).toBe(0)
  })
})
