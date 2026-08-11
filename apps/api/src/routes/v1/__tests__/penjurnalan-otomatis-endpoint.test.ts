import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import penjurnalanRoutes from '../penjurnalan-otomatis.js'

/**
 * PETA AKUN & PENJURNALAN OTOMATIS terhadap Postgres NYATA (R-012).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Susunan jurnalnya sudah dikunci 39 test di
 * `lib/__tests__/penjurnalan-otomatis.test.ts` (23 mutasi MERAH). Yang tersisa:
 *
 *   • jurnal yang dihasilkan benar-benar LOLOS `trg_gl_wajib_seimbang` —
 *     perhitungan yang seimbang di pustaka belum tentu seimbang setelah
 *     dibulatkan `numeric(18,2)` di basis
 *   • `uq_jurnal_satu_per_rujukan` menolak invoice dijurnalkan DUA KALI, dan
 *     itu bukan kerapian: jurnal ganda TETAP SEIMBANG, jadi tak ada invariant
 *     lain yang menangkapnya
 *   • trigger `trg_peta_akun_sah` menolak akun milik company lain / akun mati
 *   • peta akun benar-benar KOSONG setelah migrasi (tak ter-seed diam-diam)
 *
 * Fixture berprefiks [TEST-PJ] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let userId: string
let projectId: string
let akun: Record<string, string> = {}
/** Termin wajib untuk invoice `termin_billing` (`chk_invoice_termin_billing`). */
let terminId: string
/** Peta akun asli (kalau founder sudah mengisinya) — dikembalikan di akhir. */
let petaAsli: Array<{ jenis: string; account_id: string }> = []

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'PUT', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

const POLA_UJI = `entry_number LIKE 'JU-INV-[TEST-PJ]%' OR description LIKE '%[TEST-PJ]%'`

/**
 * Membersihkan jejak test.
 *
 * ── Kenapa ada `UPDATE … SET status='void'` sebelum DELETE
 *
 * Salah satu test memposting jurnalnya, dan jurnal posted IMMUTABLE
 * (`trg_gl_baris_posted_immutable`, migrasi 168) — barisnya menolak dihapus.
 * Versi pertama `purge()` langsung DELETE, jadi ia berhasil pada run pertama
 * (belum ada yang posted saat `beforeAll`) lalu GAGAL selamanya sesudahnya:
 * residu satu jurnal posted membuat berkas test ini tak bisa dijalankan ulang
 * di mesin yang sama.
 *
 * Itu bentuk paling menjengkelkan dari test yang rapuh — ia hijau saat ditulis
 * dan merah pada orang berikutnya, dengan pesan galat yang menunjuk trigger
 * pembukuan, bukan ke test-nya.
 *
 * Yang TIDAK dilakukan: melemahkan trigger-nya. Immutability jurnal posted
 * adalah Ember [C]. Jalan sahnya sudah disediakan basis — batalkan (`void`)
 * lalu hapus, persis pola yang dipakai blok verifikasi migrasi 169.
 */
async function purge() {
  await client.query(
    `UPDATE journal_entries SET status = 'void'
      WHERE status = 'posted' AND (${POLA_UJI})`)
  await client.query(
    `DELETE FROM journal_entry_lines WHERE entry_id IN
       (SELECT id FROM journal_entries WHERE ${POLA_UJI})`)
  await client.query(`DELETE FROM journal_entries WHERE ${POLA_UJI}`)
  await client.query(`DELETE FROM invoices WHERE invoice_number LIKE '[TEST-PJ]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  // Proyek uji dipilih dari SYARAT yang test ini butuhkan, bukan dari
  // "yang pertama menurut created_at".
  //
  // Versi pertama mengambil proyek `pph_final` paling awal lalu MENGANDAIKAN
  // ia punya `termin_schedules`. Sendirian, berkas ini hijau. Dalam run
  // penuh ia GAGAL di `beforeAll` dengan "proyek uji tak punya
  // termin_schedules" — kegagalan yang tak menunjuk satu assertion pun,
  // sehingga terbaca seperti cacat kode padahal cacat pemilihan fixture.
  //
  // Syaratnya sekarang ikut di WHERE: punya termin, dan punya bagan akun.
  // Kalau tak ada satu pun proyek yang memenuhi, test BERHENTI dengan pesan
  // yang menyebut syaratnya — bukan gagal di baris acak berikutnya.
  const { rows: p } = await client.query(
    `SELECT pr.id, pr.company_id FROM projects pr
      WHERE pr.company_id IS NOT NULL AND pr.tax_scheme = 'pph_final'
        AND EXISTS (SELECT 1 FROM termin_schedules t WHERE t.project_id = pr.id)
        AND EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = pr.company_id)
      ORDER BY pr.created_at LIMIT 1`)
  if (p.length === 0) {
    throw new Error(
      'tak ada proyek pph_final yang punya termin_schedules DAN bagan akun — '
      + 'test ini butuh ketiganya')
  }
  projectId = p[0].id
  companyId = p[0].company_id

  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  const { rows: a } = await client.query(
    `SELECT code, id FROM accounts WHERE company_id = $1`, [companyId])
  akun = Object.fromEntries(a.map((r) => [r.code, r.id]))

  // Invoice `termin_billing` WAJIB menunjuk termin — constraint
  // `chk_invoice_termin_billing`, dan itu penjaga yang benar: tagihan termin
  // tanpa terminnya tak bisa ditelusuri ke jadwal pembayaran mana pun.
  // Ditemukan test ini pada percobaan pertama.
  const { rows: t } = await client.query(
    `SELECT id FROM termin_schedules WHERE project_id = $1 ORDER BY termin_number LIMIT 1`,
    [projectId])
  if (t.length === 0) throw new Error('proyek uji tak punya termin_schedules')
  terminId = t[0].id

  // Simpan peta asli lalu KOSONGKAN — test pertama memeriksa keadaan
  // "belum ditetapkan", dan itu tak bisa diuji kalau petanya sudah terisi.
  const { rows: pa } = await client.query(
    `SELECT jenis::text, account_id FROM peta_akun_jurnal WHERE company_id = $1`,
    [companyId])
  petaAsli = pa as Array<{ jenis: string; account_id: string }>
  await client.query(`DELETE FROM peta_akun_jurnal WHERE company_id = $1`, [companyId])

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(penjurnalanRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await client.query(`DELETE FROM peta_akun_jurnal WHERE company_id = $1`, [companyId])
  for (const r of petaAsli) {
    await client.query(
      `INSERT INTO peta_akun_jurnal (company_id, jenis, account_id)
       VALUES ($1, $2::jenis_peta_akun, $3) ON CONFLICT DO NOTHING`,
      [companyId, r.jenis, r.account_id])
  }
  await app?.close()
  await client?.end()
})

async function buatInvoice(over: Record<string, number> = {}) {
  const n = `[TEST-PJ]${Math.floor(Math.random() * 1e9)}`
  const { rows } = await client.query(
    `INSERT INTO invoices
       (project_id, termin_schedule_id, invoice_number, invoice_type,
        base_amount, commission_amount, tax_amount, retensi_amount,
        dp_deduction_amount, total_amount, issued_date, due_date, status, created_by)
     VALUES ($1,$2,$3,'termin_billing',$4,$5,$6,$7,$8,$9,'2026-08-01','2026-09-01','draft',$10)
     RETURNING id, invoice_number`,
    [projectId, terminId, n,
     over.base ?? 100_000_000, over.komisi ?? 0, over.pajak ?? 2_000_000,
     over.retensi ?? 0, over.dp ?? 0,
     (over.base ?? 100_000_000) + (over.komisi ?? 0) + (over.pajak ?? 2_000_000),
     userId])
  return rows[0] as { id: string; invoice_number: string }
}

async function isiPetaMinimum() {
  for (const [jenis, kode] of [
    ['pendapatan_termin', '4120'], ['piutang_usaha', '1121'],
    ['kas_bank', '1113'], ['pph_final', '5950'],
    ['retensi_ditahan', '1124'], ['uang_muka_klien', '2150'],
    ['ppn_keluaran', '2131'],
  ] as const) {
    await client.query(
      `INSERT INTO peta_akun_jurnal (company_id, jenis, account_id)
       VALUES ($1, $2::jenis_peta_akun, $3)
       ON CONFLICT (company_id, jenis) DO UPDATE SET account_id = EXCLUDED.account_id`,
      [companyId, jenis, akun[kode]])
  }
}

describe('peta akun KOSONG setelah migrasi — tak ter-seed diam-diam', () => {
  it('kesiapan menjawab null, bukan false', async () => {
    // `null` = belum pernah ditetapkan; `false` = ada yang tertinggal.
    // Layar mengatakan hal berbeda untuk keduanya.
    const r = await get('/api/v1/gl/peta-akun')
    expect(r.statusCode).toBe(200)
    expect(r.json().kesiapan.siap).toBeNull()
    expect(r.json().peta).toHaveLength(0)
  })

  it('penjurnalan MENOLAK selama peta kosong', async () => {
    const inv = await buatInvoice()
    const r = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/salah dengan meyakinkan/)
    expect(r.json().kurang).toContain('pendapatan_termin')
  })

  it('daftar invoice menandai mana yang belum bisa dijurnalkan', async () => {
    const r = await get('/api/v1/gl/jurnalkan/invoice')
    expect(r.statusCode).toBe(200)
    const uji = r.json().invoice.filter(
      (i: { invoice_number: string }) => i.invoice_number.startsWith('[TEST-PJ]'))
    expect(uji.length).toBeGreaterThan(0)
    for (const i of uji) {
      expect(i.bisa).toBe(false)
      expect(i.kurang.length).toBeGreaterThan(0)
    }
  })

  it('akun 2131 & 5950 SUDAH ada (ditambahkan migrasi 297)', async () => {
    const r = await get('/api/v1/gl/peta-akun')
    const kode = r.json().akun.map((a: { code: string }) => a.code)
    expect(kode).toContain('2131')
    expect(kode).toContain('5950')
  })
})

describe('PUT /gl/peta-akun/:jenis', () => {
  it('menetapkan akun berhasil dan terbaca kembali', async () => {
    const r = await kirim('PUT', '/api/v1/gl/peta-akun/pendapatan_termin', {
      account_id: akun['4120'],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().peta.jenis).toBe('pendapatan_termin')

    const g = await get('/api/v1/gl/peta-akun')
    expect(g.json().peta.some(
      (p: { jenis: string }) => p.jenis === 'pendapatan_termin')).toBe(true)
  })

  it('menetapkan ulang MENGGANTI, tak menambah baris kedua', async () => {
    // `uq_peta_akun_jenis` — dua akun untuk satu jenis membuat jurnal
    // bergantung urutan baris.
    await kirim('PUT', '/api/v1/gl/peta-akun/pendapatan_termin', {
      account_id: akun['4110'],
    })
    const g = await get('/api/v1/gl/peta-akun')
    const cocok = g.json().peta.filter(
      (p: { jenis: string }) => p.jenis === 'pendapatan_termin')
    expect(cocok).toHaveLength(1)

    // Kembalikan.
    await kirim('PUT', '/api/v1/gl/peta-akun/pendapatan_termin', {
      account_id: akun['4120'],
    })
  })

  it('jenis tak dikenal ditolak dengan daftar yang sah', async () => {
    const r = await kirim('PUT', '/api/v1/gl/peta-akun/pendapatan_lain', {
      account_id: akun['4120'],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/piutang_usaha/)
  })

  it('akun yang tak ada ditolak 404', async () => {
    const r = await kirim('PUT', '/api/v1/gl/peta-akun/piutang_usaha', {
      account_id: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(404)
  })

  it('akun TIDAK AKTIF ditolak dengan alasan yang menjelaskan', async () => {
    const { rows } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type, is_active)
       VALUES ($1, '[TEST-PJ]9999', 'Akun mati uji', 'asset', false) RETURNING id`,
      [companyId])
    const r = await kirim('PUT', '/api/v1/gl/peta-akun/piutang_usaha', {
      account_id: rows[0].id,
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/tak terbaca laporan/)
    await client.query(`DELETE FROM accounts WHERE id = $1`, [rows[0].id])
  })

  it('account_id kosong ditolak', async () => {
    const r = await kirim('PUT', '/api/v1/gl/peta-akun/piutang_usaha', {})
    expect(r.statusCode).toBe(400)
  })

  it('trigger BASIS menolak akun milik company lain', async () => {
    const { rows } = await client.query(
      `SELECT a.id FROM accounts a WHERE a.company_id <> $1 LIMIT 1`, [companyId])
    if (rows.length === 0) return   // basis satu-tenant — dilewati

    await expect(
      client.query(
        `INSERT INTO peta_akun_jurnal (company_id, jenis, account_id)
         VALUES ($1, 'piutang_usaha', $2)`, [companyId, rows[0].id]),
    ).rejects.toThrow(/perusahaan lain|not-null|violates/)
  })
})

describe('menjurnalkan invoice — jurnal LOLOS invariant basis', () => {
  it('jurnal tersusun, seimbang, dan berstatus DRAFT', async () => {
    await isiPetaMinimum()
    const inv = await buatInvoice()

    const r = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    expect(r.statusCode).toBe(201)
    // DRAFT, bukan posted: penjurnalan otomatis adalah tafsir, dan tafsir
    // bisa salah. Draft memberi kesempatan memeriksanya sebelum masuk neraca.
    expect(r.json().jurnal.status).toBe('draft')
    expect(r.json().total_debit).toBe(r.json().total_kredit)

    // Dan yang tersimpan di BASIS benar-benar seimbang — pembulatan
    // numeric(18,2) bisa saja mengubahnya.
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(debit),0)::float d, COALESCE(SUM(credit),0)::float k
         FROM journal_entry_lines WHERE entry_id = $1`, [r.json().jurnal.id])
    expect(rows[0].d).toBe(rows[0].k)
  })

  it('jurnal yang dihasilkan BISA DI-POSTING (lolos trg_gl_wajib_seimbang)', async () => {
    // Inilah yang tak bisa dibuktikan test pustaka: perhitungan yang seimbang
    // di JavaScript belum tentu lolos trigger setelah masuk numeric(18,2).
    const inv = await buatInvoice({ base: 33_333_333.33, pajak: 666_666.67 })
    const r = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    expect(r.statusCode).toBe(201)

    await client.query(
      `UPDATE journal_entries SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
      [r.json().jurnal.id, userId])
    const { rows } = await client.query(
      `SELECT status FROM journal_entries WHERE id=$1`, [r.json().jurnal.id])
    expect(rows[0].status).toBe('posted')
  })

  it('PPh final tercatat sebagai BEBAN (didebit ke 5950)', async () => {
    const inv = await buatInvoice()
    const r = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    const { rows } = await client.query(
      `SELECT a.code, l.debit::float d, l.credit::float k
         FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id
        WHERE l.entry_id = $1 ORDER BY a.code`, [r.json().jurnal.id])
    const pph = rows.find((x) => x.code === '5950')
    expect(pph).toBeTruthy()
    expect(pph!.d).toBe(2_000_000)
    expect(pph!.k).toBe(0)
  })

  it('retensi masuk 1124 sebagai ASET, pendapatan TETAP penuh', async () => {
    const inv = await buatInvoice({ retensi: 5_000_000, pajak: 0 })
    const r = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    const { rows } = await client.query(
      `SELECT a.code, l.debit::float d, l.credit::float k
         FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id
        WHERE l.entry_id = $1`, [r.json().jurnal.id])
    expect(rows.find((x) => x.code === '1124')!.d).toBe(5_000_000)
    // Pendapatan TIDAK berkurang — pekerjaannya sudah selesai.
    expect(rows.find((x) => x.code === '4120')!.k).toBe(100_000_000)
  })

  it('DUA KALI menjurnalkan invoice yang sama DITOLAK', async () => {
    // Jurnal ganda TETAP SEIMBANG — tak ada invariant lain yang
    // menangkapnya. Ini penggandaan pendapatan.
    const inv = await buatInvoice()
    const a = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    expect(a.statusCode).toBe(201)

    const b = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    expect(b.statusCode).toBe(409)
    expect(b.json().error).toMatch(/menggandakan pendapatan/)
    expect(b.json().error).not.toMatch(/duplicate key|uq_jurnal/)
  })

  it('DUA permintaan BERSAMAAN: hanya satu jurnal tercipta', async () => {
    const inv = await buatInvoice()
    const [a, b] = await Promise.all([
      kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`),
      kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409])

    const { rows } = await client.query(
      `SELECT count(*)::int n FROM journal_entries
        WHERE ref_type='invoice' AND ref_id=$1 AND status <> 'void'`, [inv.id])
    expect(rows[0].n).toBe(1)
  })

  it('daftar menandai invoice yang SUDAH dijurnalkan', async () => {
    const r = await get('/api/v1/gl/jurnalkan/invoice')
    const sudah = r.json().invoice.filter(
      (i: { jurnal: unknown }) => i.jurnal != null)
    expect(sudah.length).toBeGreaterThan(0)
  })

  it('404 untuk invoice yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/gl/jurnalkan/invoice/00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })

  it('invoice bernominal RUSAK ditolak, bukan dijurnalkan nol', async () => {
    // Kolom numeric tak bisa menyimpan teks, jadi yang diuji: base nol.
    const inv = await buatInvoice({ base: 0, pajak: 0 })
    const r = await kirim('POST', `/api/v1/gl/jurnalkan/invoice/${inv.id}`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/tak terbaca atau nol/)
  })
})

describe('kesiapan peta sesudah diisi', () => {
  it('menjawab true dan menyebut yang sudah ditetapkan', async () => {
    await isiPetaMinimum()
    const r = await get('/api/v1/gl/peta-akun')
    expect(r.json().kesiapan.siap).toBe(true)
    expect(r.json().kesiapan.kurang).toEqual([])
    expect(r.json().kesiapan.ditetapkan).toContain('pendapatan_termin')
  })

  it('label dan minimum ikut dikirim untuk layar', async () => {
    const r = await get('/api/v1/gl/peta-akun')
    expect(r.json().label.pendapatan_termin).toBe('Pendapatan termin')
    expect(r.json().minimum).toContain('kas_bank')
  })
})
