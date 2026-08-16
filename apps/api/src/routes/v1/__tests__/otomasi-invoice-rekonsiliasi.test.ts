/**
 * Invoice melenceng dari buku pembayaran — TANPA nomor katalog.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA CACAT INI TAK TERLIHAT DARI LAYAR MANA PUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Terukur di basis dev: INV/PRL/2026/016 mencatat Rp 19.200.000 sudah
 * diterima, sementara jumlah seluruh baris `payments`-nya NOL.
 *
 * Dan pemeriksaan `total_amount = amount_paid + amount_due` LULUS SEMPURNA di
 * seluruh 26 invoice. Invoice itu konsisten dengan DIRINYA SENDIRI; yang tak
 * konsisten hubungannya dengan buku pembayaran.
 *
 * Test pertama di bawah menjaga persis pemisahan itu — ia sengaja membuat
 * invoice yang konsisten-secara-internal tetapi melenceng terhadap bukunya,
 * karena itulah satu-satunya bentuk yang bisa lolos dari semua pemeriksaan
 * lain.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-REKON'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let olehId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/invoice-ringkasan-melenceng${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(`DELETE FROM payments WHERE invoice_id IN
                    (SELECT id FROM invoices WHERE invoice_number LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM invoices WHERE invoice_number LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE company_id = $1
      AND type IN ('invoice_ringkasan_melenceng', 'invoice_status_melenceng')`,
    [companyId])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  // `invoices` TIDAK punya `client_id` — kliennya diturunkan lewat proyek.
  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyId])
  proyek = p[0].id

  const { rows: u } = await db.query(`SELECT id FROM users WHERE auth_id = $1`, [auth])
  olehId = u[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

/**
 * Satu invoice yang KONSISTEN SECARA INTERNAL: `total = dibayar + sisa`.
 *
 * Itu disengaja — bentuk inilah yang lolos dari tiap pemeriksaan satu-tabel,
 * dan hanya kelihatan saat dibandingkan dengan buku pembayaran.
 */
async function buatInvoice(nomor: string, opsi: {
  total: number; ringkas: number; status: string
}) {
  /*
    `commission_fee`, bukan `termin_billing`.

    `chk_invoice_termin_billing` menuntut invoice bertipe termin punya
    `termin_schedule_id` — invarian yang benar: tagihan termin yang tak bisa
    menunjuk termin mana yang ditagih bukan tagihan termin. Test ini tak
    sedang menguji penjadwalan termin, jadi ia memakai tipe yang tak menuntut
    kaitan itu.
  */
  const { rows } = await db.query(
    `INSERT INTO invoices
       (project_id, invoice_number, invoice_type, issued_date, due_date,
        base_amount, tax_amount, total_amount, amount_paid, amount_due,
        status, created_by)
     VALUES ($1,$2,'commission_fee',CURRENT_DATE,CURRENT_DATE + 30,$3,0,$3,$4,$5,$6,$7)
     RETURNING id`,
    [proyek, nomor, opsi.total, opsi.ringkas,
     opsi.total - opsi.ringkas, opsi.status, olehId])
  return rows[0].id as string
}

async function buatPembayaran(invoiceId: string, jumlah: number) {
  await db.query(
    `INSERT INTO payments
       (invoice_id, amount_paid, payment_method, paid_at, recorded_by, cash_account_id)
     VALUES ($1,$2,'transfer_bank',now(),$3,NULL)`,
    [invoiceId, jumlah, olehId])
}

async function ditegur(tipe: string, id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, id])
  return (rows[0].n as number) > 0
}

describe('invoice melenceng dari buku pembayaran', () => {
  it('invoice yang KONSISTEN SECARA INTERNAL tetap tertangkap', async () => {
    /*
      `total 100 jt = dibayar 30 jt + sisa 70 jt` — konsisten sempurna. Tetapi
      buku pembayarannya NOL.

      Kalau otomasi ini hanya memeriksa aritmetika di dalam satu baris
      invoice, cacat semacam ini tak akan pernah terlihat — dan itulah bentuk
      yang sungguh terjadi di basis: Rp 19,2 juta diakui masuk tanpa satu pun
      bukti penerimaan.
    */
    await bersihkan()
    const inv = await buatInvoice(`${TANDA}-KOSONG`, {
      total: 100_000_000, ringkas: 30_000_000, status: 'partial',
    })

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur('invoice_ringkasan_melenceng', inv),
      'invoice yang konsisten secara internal tetapi bukunya kosong TIDAK '
      + 'tertangkap — yang diperiksa cuma aritmetika di dalam satu baris')
      .toBe(true)
  }, 120_000)

  it('invoice yang buku dan ringkasannya COCOK tidak ditegur', async () => {
    /*
      Pasangan wajib. Tanpa ini, "semuanya tertangkap" bisa berarti benar atau
      berarti otomasinya menegur segalanya.
    */
    await bersihkan()
    const inv = await buatInvoice(`${TANDA}-COCOK`, {
      total: 100_000_000, ringkas: 40_000_000, status: 'partial',
    })
    await buatPembayaran(inv, 25_000_000)
    await buatPembayaran(inv, 15_000_000)

    await panggil()
    expect(await ditegur('invoice_ringkasan_melenceng', inv),
      'invoice yang ringkasannya SAMA dengan jumlah dua pembayarannya ikut '
      + 'ditegur — otomasinya menegur segalanya')
      .toBe(false)
  }, 120_000)

  it('LUNAS yang bukunya belum penuh ditegur terpisah dan paling mendesak', async () => {
    /*
      Selisih rupiah dilihat bagian keuangan; STATUS dilihat semua orang,
      termasuk klien di portal. Dan selama sesuatu berstatus lunas, penagihan
      berhenti mengejarnya — itu yang membuatnya paling mendesak.
    */
    await bersihkan()
    const inv = await buatInvoice(`${TANDA}-LUNAS`, {
      total: 100_000_000, ringkas: 100_000_000, status: 'paid',
    })
    await buatPembayaran(inv, 100_000_000)

    // Ringkasan COCOK dengan buku, jadi temuan pertama tak berbunyi…
    await panggil()
    expect(await ditegur('invoice_ringkasan_melenceng', inv)).toBe(false)
    expect(await ditegur('invoice_status_melenceng', inv),
      'invoice yang benar-benar lunas ikut ditegur statusnya')
      .toBe(false)

    // …lalu satu pembayaran dihapus: buku jadi kurang, status masih `paid`.
    await db.query(`DELETE FROM payments WHERE invoice_id = $1`, [inv])
    await db.query(
      `DELETE FROM notifications WHERE company_id = $1
        AND type IN ('invoice_ringkasan_melenceng', 'invoice_status_melenceng')`,
      [companyId])

    await panggil()
    expect(await ditegur('invoice_status_melenceng', inv),
      'invoice berstatus LUNAS yang bukunya kosong tak ditegur — penagihan '
      + 'berhenti mengejarnya tanpa ada yang tahu')
      .toBe(true)

    const { rows } = await db.query(
      `SELECT priority FROM notifications
        WHERE type = 'invoice_status_melenceng' AND company_id = $1
          AND action_data->>'record_id' = $2`, [companyId, inv])
    expect(rows[0]?.priority,
      'status LUNAS yang salah tak berprioritas tertinggi')
      .toBe('urgent')
  }, 120_000)

  it('ambang rupiah benar-benar menyaring', async () => {
    /*
      Ambangnya Rp 1 — pengaman pembulatan, bukan ambang kewajaran. Diuji
      dengan selisih Rp 500.000 terhadap ambang Rp 1.000.000.
    */
    await bersihkan()
    const inv = await buatInvoice(`${TANDA}-TIPIS`, {
      total: 100_000_000, ringkas: 50_500_000, status: 'partial',
    })
    await buatPembayaran(inv, 50_000_000)

    await panggil('?rupiah=1000000')
    expect(await ditegur('invoice_ringkasan_melenceng', inv),
      'selisih Rp 500.000 ditegur pada ambang Rp 1.000.000')
      .toBe(false)

    await panggil()
    expect(await ditegur('invoice_ringkasan_melenceng', inv),
      'selisih Rp 500.000 tak ditegur pada ambang bawaan Rp 1 — nilainya tak '
      + 'dipakai menyaring')
      .toBe(true)
  }, 120_000)

  it('pembayaran uji tidak menggerakkan saldo kas', async () => {
    /*
      `payments.cash_account_id` DIPAKU NULL — disiplin yang sama dengan
      `lib/tulis-klaim.ts`, tempat kolom itu dipaku supaya satu kalimat
      WhatsApp yang salah dengar tak memindahkan uang.

      Diperiksa PERILAKUNYA: kalau kelak seseorang "melengkapi" kolom itu,
      saldo perusahaan akan bergeser tiap kali test ini dijalankan.
    */
    const saldo = async () => {
      const { rows } = await db.query(
        `SELECT coalesce(sum(balance), 0)::numeric t FROM cash_accounts
          WHERE company_id = $1`, [companyId])
      return String(rows[0].t)
    }

    await bersihkan()
    const sebelum = await saldo()
    const inv = await buatInvoice(`${TANDA}-SALDO`, {
      total: 50_000_000, ringkas: 50_000_000, status: 'paid',
    })
    await buatPembayaran(inv, 50_000_000)

    expect(await saldo(),
      'saldo kas bergeser saat pembayaran uji disisipkan')
      .toBe(sebelum)
  }, 120_000)
})
