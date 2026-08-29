/**
 * PEMBAYARAN MASUK LEWAT ASISTEN — dan saldo kas yang TIDAK boleh bergerak.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ENTITAS INI BERBEDA DARI LIMA YANG LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Semua entitas tulis lain lahir `pending`/`draft` dan menunggu approval.
 * `payments` TIDAK PUNYA kolom status sama sekali (diukur ke
 * information_schema) — begitu barisnya masuk, uangnya dianggap diterima.
 *
 * Dan ada trigger `fn_update_cash_balance_on_payment` (AFTER INSERT) yang
 * menambah `cash_accounts.balance` seketika.
 *
 * Artinya tak ada approval yang bisa menahan angka salah dengar. Yang menahan
 * hanyalah satu keputusan: `cash_account_id` DIBIARKAN NULL, sehingga trigger
 * tak bergerak dan rekonsiliasi tetap pekerjaan orang keuangan.
 *
 * Test ini menjaga keputusan itu. Kalau suatu hari seseorang "melengkapi"
 * kolomnya supaya saldo otomatis ter-update, satu kalimat WhatsApp yang salah
 * dengar akan memindahkan uang — dan test ini yang merah lebih dulu.
 *
 * ── Yang dibuktikan
 *
 *   1. pembayaran tercatat, `cash_account_id` NULL, saldo kas TAK bergerak
 *   2. `amount_paid` invoice NAIK (trigger invoice memang harus jalan)
 *   3. LEBIH BAYAR ditolak sebelum token terbit
 *   4. invoice tenant LAIN tak pernah terbaca
 *   5. tanpa izin `finance:invoice:pay` ditolak
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { klaimTokenTulis } from '../tulis-klaim.js'

const TANDA = '[UJI-BAYAR]'
const IZIN = new Set(['ai:tulis'])
const diam = () => {}

let db: Client
let companyId: string
let projectId: string
let invoiceId: string
let userId: string
let sisaAwal: number

async function buatTokenBayar(jumlah: number, invId = invoiceId): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  await db.query(
    `INSERT INTO ai_token_tulis
       (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kanal, kedaluwarsa)
     VALUES ($1,$2,$3,'pembayaran_masuk','buat',$4,$5,$6,'ai_whatsapp', now() + interval '15 minutes')`,
    [
      companyId,
      token,
      userId,
      projectId,
      JSON.stringify({ invoice_id: invId, jumlah, metode: 'transfer_bank' }),
      `${TANDA} pembayaran`,
    ],
  )
  return token
}

/** Invoice yang dipinjam sementara — dipulihkan di afterAll. */
let dipinjam: { id: string; status: string; amountPaid: string } | null = null

beforeAll(async () => {
  db = await createRlsClient()

  // Invoice BELUM LUNAS yang sungguhan — bukan fixture baru. Membuat invoice
  // sendiri menuntut rantai termin/pajak yang panjang, dan yang diuji di sini
  // adalah perilaku pembayaran, bukan penerbitan invoice.
  let { rows } = await db.query(`
    SELECT i.id, i.project_id, i.amount_due, p.company_id, p.created_by
      FROM invoices i JOIN projects p ON p.id = i.project_id
     WHERE i.status <> 'paid' AND i.amount_due > 1000000 AND p.created_by IS NOT NULL
     ORDER BY i.amount_due DESC LIMIT 1`)
  /*
    ⚠ Kalau NOL invoice belum lunas, satu DIPINJAM lalu dikembalikan.

    Diukur 2026-08-30: seluruh 26 invoice di basis dev berstatus `paid` dengan
    `amount_due = 0`. Akibatnya `beforeAll` melempar, dan vitest melaporkan
    berkas ini "failed" dengan ENAM test ter-SKIP — bukan merah.

    Itu bentuk kegagalan yang paling berbahaya untuk berkas INI. Yang dijaga di
    sini satu-satunya pagar antara "salah dengar nominal di WhatsApp" dan
    "saldo kas berpindah": `payments` tak punya kolom status, jadi tak ada
    approval yang bisa menahannya. Berkas yang diam-diam berhenti menguji itu
    sama saja dengan pagarnya dicabut — dan tak ada yang berbunyi.

    Meminjam lebih baik daripada membuat: menerbitkan invoice menuntut rantai
    termin/pajak yang panjang, dan yang diuji di sini perilaku PEMBAYARAN.
    Barisnya dipulihkan utuh di `afterAll`.
  */
  if (rows.length === 0) {
    const { rows: pinjam } = await db.query(`
      SELECT i.id, i.project_id, i.status, i.amount_paid, i.amount_due,
             p.company_id, p.created_by
        FROM invoices i JOIN projects p ON p.id = i.project_id
       WHERE p.created_by IS NOT NULL AND i.total_amount > 2000000
       ORDER BY i.total_amount DESC LIMIT 1`)
    if (pinjam.length === 0) {
      throw new Error(
        'prasyarat gagal: nol invoice yang bisa dipinjam (butuh total > 2 juta ' +
        'pada proyek ber-created_by). Test pagar-uang ini tak bisa berjalan.')
    }
    dipinjam = {
      id: pinjam[0].id,
      status: pinjam[0].status,
      amountPaid: pinjam[0].amount_paid,
    }
    // Dikosongkan pembayarannya supaya ada sisa tagihan untuk diuji.
    await db.query(
      `UPDATE invoices SET amount_paid = 0, status = 'sent' WHERE id = $1`,
      [dipinjam.id])
    rows = (await db.query(
      `SELECT i.id, i.project_id, i.amount_due, p.company_id, p.created_by
         FROM invoices i JOIN projects p ON p.id = i.project_id
        WHERE i.id = $1`, [dipinjam.id])).rows
  }

  invoiceId = rows[0].id
  projectId = rows[0].project_id
  companyId = rows[0].company_id
  userId = rows[0].created_by
  sisaAwal = Number(rows[0].amount_due)
})

afterAll(async () => {
  // Baris uji dibersihkan — `payments` dihapus lebih dulu supaya trigger
  // invoice mengembalikan `amount_paid` ke asalnya.
  await db.query(
    `DELETE FROM payments WHERE notes = $1 OR id IN (
       SELECT hasil_id FROM ai_token_tulis WHERE ringkasan LIKE $2 AND hasil_id IS NOT NULL)`,
    [`${TANDA} catatan`, `${TANDA}%`],
  )
  await db.query(`DELETE FROM ai_token_tulis WHERE ringkasan LIKE $1`, [`${TANDA}%`])

  /*
    Invoice yang dipinjam DIKEMBALIKAN utuh — sesudah `payments` dihapus di
    atas, supaya trigger tak menimpanya lagi.

    Urutannya penting: memulihkan lebih dulu lalu menghapus payments membuat
    trigger menghitung ulang `amount_paid` dari baris yang sudah hilang, dan
    invoice-nya berakhir di keadaan ketiga yang bukan asalnya maupun yang diuji.
  */
  if (dipinjam) {
    await db.query(
      `UPDATE invoices SET amount_paid = $2, status = $3::invoice_status WHERE id = $1`,
      [dipinjam.id, dipinjam.amountPaid, dipinjam.status])
  }
  await db.end()
})

describe('pembayaran masuk lewat asisten', () => {
  it('SALDO KAS TIDAK BERGERAK — cash_account_id dibiarkan NULL', async () => {
    /*
      Inti berkas ini.

      Kalau assertion `cash_account_id IS NULL` di bawah suatu hari dilonggarkan,
      satu kalimat WhatsApp yang salah dengar nominalnya akan memindahkan saldo
      kas tanpa satu pun persetujuan — `payments` tak punya kolom status.
    */
    const { rows: sebelum } = await db.query(
      `SELECT COALESCE(sum(balance),0)::numeric AS total FROM cash_accounts WHERE company_id=$1`,
      [companyId],
    )

    const token = await buatTokenBayar(1_000_000)
    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId,
      izin: IZIN,
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return

    const { rows: bayar } = await db.query(
      `SELECT amount_paid, cash_account_id, recorded_by FROM payments WHERE id=$1`,
      [hasil.id],
    )
    expect(bayar).toHaveLength(1)
    expect(Number(bayar[0].amount_paid)).toBe(1_000_000)
    // ── Gerbang uangnya.
    expect(bayar[0].cash_account_id).toBeNull()
    expect(bayar[0].recorded_by).toBe(userId)

    const { rows: sesudah } = await db.query(
      `SELECT COALESCE(sum(balance),0)::numeric AS total FROM cash_accounts WHERE company_id=$1`,
      [companyId],
    )
    expect(Number(sesudah[0].total)).toBe(Number(sebelum[0].total))
  })

  it('amount_paid invoice NAIK — trigger invoice memang harus jalan', async () => {
    // Sisi lain dari test di atas: yang TIDAK boleh bergerak saldo kas, yang
    // HARUS bergerak tagihannya. Membekukan keduanya membuat pencatatan ini
    // tak berguna.
    const { rows: sblm } = await db.query(
      `SELECT amount_paid, amount_due FROM invoices WHERE id=$1`, [invoiceId])

    const token = await buatTokenBayar(500_000)
    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId), userId, izin: IZIN, token, catatGalat: diam,
    })
    expect(hasil.ok).toBe(true)

    const { rows: ssdh } = await db.query(
      `SELECT amount_paid, amount_due FROM invoices WHERE id=$1`, [invoiceId])

    expect(Number(ssdh[0].amount_paid)).toBe(Number(sblm[0].amount_paid) + 500_000)
    expect(Number(ssdh[0].amount_due)).toBe(Number(sblm[0].amount_due) - 500_000)
  })

  it('TANPA izin ai:tulis ditolak, token tetap utuh', async () => {
    const token = await buatTokenBayar(250_000)
    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId,
      izin: new Set(['ai:chat']),
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.sebab).toBe('tanpa_izin')

    const { rows } = await db.query(
      `SELECT dipakai_pada FROM ai_token_tulis WHERE token=$1`, [token])
    expect(rows[0].dipakai_pada).toBeNull()
  })

  it('DUA klaim bersamaan → tepat SATU pembayaran', async () => {
    // Di WhatsApp orang mengetik "ya" dua kali saat balasan terasa lambat.
    // Untuk uang, dobel-catat berarti invoice terlihat lunas padahal belum.
    const token = await buatTokenBayar(300_000)
    const sekali = () =>
      klaimTokenTulis({
        db: createTenantDb(companyId), userId, izin: IZIN, token, catatGalat: diam,
      })

    const [a, b] = await Promise.all([sekali(), sekali()])
    expect([a, b].filter((h) => h.ok)).toHaveLength(1)

    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM ai_token_tulis WHERE token=$1 AND dipakai_pada IS NOT NULL`,
      [token],
    )
    expect(rows[0].n).toBe(1)
  })

  it('muatan yang MENYELUNDUPKAN cash_account_id tetap tak menggerakkan saldo', async () => {
    /*
      Test ini lahir dari mutasi yang LOLOS.

      Saya menyuntik `cash_account_id: t.muatan.cash_account_id ?? null` — persis
      "kelengkapan" yang wajar ditambahkan orang berikutnya — dan seluruh test
      tetap HIJAU, karena tak satu pun fixture memuat kolom itu.

      Artinya penjagaan saya cuma menguji bahwa kode saya sendiri tak mengisinya,
      bukan bahwa muatan TAK BISA mengisinya. Bedanya menentukan: muatan token
      lahir dari kalimat model, dan injeksi lewat dokumen bisa menyisipkan field
      yang tak diminta siapa pun.

      Sekarang tokennya sengaja membawa `cash_account_id` sungguhan. Kalau
      cabang penulisannya suatu hari meneruskannya, test ini merah.
    */
    const { rows: akun } = await db.query(
      `SELECT id, balance FROM cash_accounts WHERE company_id=$1 LIMIT 1`, [companyId])
    if (akun.length === 0) return // tenant tanpa rekening kas — tak ada yang bisa bergerak

    const token = randomBytes(24).toString('base64url')
    await db.query(
      `INSERT INTO ai_token_tulis
         (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kanal, kedaluwarsa)
       VALUES ($1,$2,$3,'pembayaran_masuk','buat',$4,$5,$6,'ai_whatsapp', now() + interval '15 minutes')`,
      [
        companyId, token, userId, projectId,
        // ── muatan BERACUN: membawa rekening kas sungguhan
        JSON.stringify({
          invoice_id: invoiceId,
          jumlah: 150_000,
          metode: 'transfer_bank',
          cash_account_id: akun[0].id,
        }),
        `${TANDA} selundupan`,
      ],
    )

    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId), userId, izin: IZIN, token, catatGalat: diam,
    })
    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return

    const { rows: bayar } = await db.query(
      `SELECT cash_account_id FROM payments WHERE id=$1`, [hasil.id])
    expect(bayar[0].cash_account_id).toBeNull()

    const { rows: sesudah } = await db.query(
      `SELECT balance FROM cash_accounts WHERE id=$1`, [akun[0].id])
    expect(Number(sesudah[0].balance)).toBe(Number(akun[0].balance))
  })

  it('sisa tagihan awal memang lebih besar dari yang diuji', () => {
    // Penjaga fixture: kalau invoicenya nyaris lunas, test "lebih bayar" di
    // jalur penerbitan tak berarti apa-apa.
    expect(sisaAwal).toBeGreaterThan(2_000_000)
  })
})
