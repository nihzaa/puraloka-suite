import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// ═════════════════════════════════════════════════════════════════════════════
// ALUR UANG — pembayaran klien MASUK, saldo kas BERTAMBAH & invoice LUNAS.
//
// ── Cacat yang ditemukan saat menulis test ini (2026-08-02)
//
// `fn_update_cash_balance_on_payment()` ADA di database tapi TRIGGER-nya
// TIDAK. Jadi pembayaran klien tak pernah menambah saldo akun kas tujuannya.
//
// Berbeda dari cacat kembarannya di `project_expenses` (migrasi 161, tabel
// masih kosong), yang ini SUDAH punya dampak: 5 dari 23 pembayaran membawa
// `cash_account_id` dengan total Rp 627.075.000 yang tak pernah masuk saldo.
//
// Trigger dipasang (migrasi 162). Koreksi saldo retroaktif SENGAJA tidak
// dilakukan — itu keputusan akuntansi yang harus dicocokkan ke rekening bank,
// bukan perbaikan teknis. Test ini menjaga agar pembayaran BERIKUTNYA benar.
//
// ── Dua invarian yang dijaga
//
//   1. Uang masuk → saldo naik (trigger `trg_update_cash_on_payment`)
//   2. Uang masuk → sisa tagihan turun (kolom terhitung `amount_due`)
//
// Keduanya bekerja pada tabel berbeda lewat mekanisme berbeda, dan keduanya
// bisa rusak sendiri-sendiri. Kalau (1) mati: kas terlihat lebih kecil dari
// uang yang benar-benar ada. Kalau (2) mati: klien ditagih untuk yang sudah
// dibayar.
// ═════════════════════════════════════════════════════════════════════════════

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '078_users_role_id_expand.sql',
  '154_guard_regclass_schema_aware.sql',
  '003_projects_and_contracts.sql',
  '004_expense_categories.sql',
  '005_expense_reports_and_items.sql',  // 006 merujuknya (FK expense_report_id)
  '006_invoices_payments_taxes.sql',
  '007_mandor_workscopes_kasbons.sql',
  // 008 & 009 tak dipakai test ini secara langsung — keduanya ada supaya 010
  // bisa dijalankan UTUH. 010 memasang trigger pada tabel dari kedua migrasi
  // itu (`milestones`, `audit_logs`), jadi menjalankannya sebagian akan gagal.
  //
  // Alternatifnya: menyalin definisi trigger ke test. Ditolak — test yang
  // memuat salinannya sendiri akan tetap hijau saat yang produksi berubah,
  // dan itu persis kelas cacat yang sedang ditutup di sini.
  '008_monitoring_photos_documents.sql',
  '009_notifications_audit_logs.sql',
  // Yang dibutuhkan dari 010: `calc_invoice_amount_due` — `amount_due`
  // dihitung BEFORE INSERT/UPDATE dari `total_amount - amount_paid`.
  '010_triggers.sql',
  '016_cash_management.sql',
  '019_payments_cash_account.sql',
  '162_pasang_trigger_payment_cash.sql',
  '163_amount_due_tak_boleh_negatif.sql',
]

let client: Client
let ctx: SeedProjectContext
let akunKas: string

async function saldo(id: string): Promise<number> {
  const { rows } = await client.query('SELECT balance::float8 b FROM cash_accounts WHERE id=$1', [id])
  return rows[0].b
}

// `chk_invoice_termin_or_komisi`: invoice `termin_billing` WAJIB menunjuk satu
// `termin_schedule`. Tiap invoice di test ini dapat termin sendiri supaya tak
// ada test yang bergantung pada sisa keadaan test lain.
let nomorTermin = 0

async function buatTermin(jumlah: number): Promise<string> {
  nomorTermin += 1
  const { rows } = await client.query(
    `INSERT INTO termin_schedules (project_id, termin_number, label, amount, pct_of_contract)
     VALUES ($1, $2, $3, $4, 10) RETURNING id`,
    [ctx.projectId, nomorTermin, `[TEST] Termin ${nomorTermin}`, jumlah],
  )
  return rows[0].id
}

async function buatInvoice(total: number): Promise<string> {
  const terminId = await buatTermin(total)
  const { rows } = await client.query(
    `INSERT INTO invoices
       (project_id, termin_schedule_id, invoice_number, invoice_type,
        issued_date, due_date, base_amount, total_amount, amount_paid,
        amount_due, status, created_by)
     VALUES ($1, $2, $3, 'termin_billing', CURRENT_DATE, CURRENT_DATE + 30,
             $4, $4, 0, $4, 'sent', $5)
     RETURNING id`,
    [ctx.projectId, terminId, `[TEST]-INV-${nomorTermin}`, total, ctx.adminId],
  )
  return rows[0].id
}

async function bayar(invoiceId: string, jumlah: number, keKas = true): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO payments (invoice_id, amount_paid, payment_method, paid_at, cash_account_id, recorded_by)
     VALUES ($1, $2, 'transfer_bank', CURRENT_DATE, $3, $4) RETURNING id`,
    [invoiceId, jumlah, keKas ? akunKas : null, ctx.adminId],
  )
  return rows[0].id
}

async function invoiceInfo(id: string): Promise<{ paid: number; due: number }> {
  const { rows } = await client.query(
    'SELECT amount_paid::float8 p, amount_due::float8 d FROM invoices WHERE id=$1', [id])
  return { paid: rows[0].p, due: rows[0].d }
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  ctx = await seedProjectContext(client)

  const { rows } = await client.query(
    `INSERT INTO cash_accounts (name, type, balance, owner_id, project_id, created_by)
     VALUES ('[TEST] Kas Terima', 'main', 0, $1, $2, $1) RETURNING id`,
    [ctx.adminId, ctx.projectId],
  )
  akunKas = rows[0].id
})

afterAll(async () => { await closeTestClient(client) })

describe('Alur uang — pembayaran menambah saldo kas', () => {
  it('pembayaran dengan akun kas MENAMBAH saldo', async () => {
    const awal = await saldo(akunKas)
    const inv = await buatInvoice(10_000_000)

    await bayar(inv, 4_000_000)

    expect(
      await saldo(akunKas),
      'pembayaran klien tak menambah saldo kas — ini cacat yang ditemukan ' +
        '2026-08-02: fungsinya ada, trigger-nya hilang. Kas terlihat lebih ' +
        'kecil daripada uang yang benar-benar masuk.',
    ).toBe(awal + 4_000_000)
  })

  it('pembayaran TANPA akun kas tak menyentuh saldo mana pun', async () => {
    // Sebagian pembayaran dicatat tanpa menunjuk akun (mis. masuk rekening
    // yang belum terdaftar). Itu sah — yang tak boleh: menebak akun mana.
    const awal = await saldo(akunKas)
    const inv = await buatInvoice(5_000_000)

    await bayar(inv, 2_000_000, false)

    expect(await saldo(akunKas), 'pembayaran tanpa akun kas tetap memotong saldo').toBe(awal)
  })

  it('menghapus pembayaran MENGEMBALIKAN saldo', async () => {
    // Salah catat lalu dihapus. Tanpa cabang DELETE, uang yang tak pernah
    // benar-benar masuk tetap menempel di saldo.
    const awal = await saldo(akunKas)
    const inv = await buatInvoice(3_000_000)
    const bayarId = await bayar(inv, 1_500_000)

    expect(await saldo(akunKas)).toBe(awal + 1_500_000)

    await client.query('DELETE FROM payments WHERE id=$1', [bayarId])

    expect(
      await saldo(akunKas),
      'pembayaran dihapus tapi saldo tak dikembalikan — kas menyimpan uang hantu',
    ).toBe(awal)
  })

  it('mengubah jumlah pembayaran menyesuaikan saldo, bukan menambah lagi', async () => {
    // Koreksi angka salah ketik. Trigger UPDATE harus mengurangi nilai LAMA
    // lalu menambah yang BARU — bukan sekadar menambah selisih, dan bukan
    // menambah nilai baru di atas yang lama.
    const awal = await saldo(akunKas)
    const inv = await buatInvoice(9_000_000)
    const bayarId = await bayar(inv, 1_000_000)

    await client.query('UPDATE payments SET amount_paid = 3000000 WHERE id=$1', [bayarId])

    expect(
      await saldo(akunKas),
      'koreksi jumlah menambah dua kali — saldo naik melebihi uang yang masuk',
    ).toBe(awal + 3_000_000)
  })
})

describe('Alur uang — pembayaran mengurangi sisa tagihan', () => {
  it('bayar sebagian: `amount_due` turun sebesar yang dibayar', async () => {
    const inv = await buatInvoice(10_000_000)
    await client.query('UPDATE invoices SET amount_paid = 4000000 WHERE id=$1', [inv])

    const { paid, due } = await invoiceInfo(inv)
    expect(paid).toBe(4_000_000)
    expect(
      due,
      'sisa tagihan tak berkurang — klien ditagih untuk yang sudah dibayar',
    ).toBe(6_000_000)
  })

  it('bayar lunas: sisa tagihan NOL', async () => {
    const inv = await buatInvoice(7_500_000)
    await client.query('UPDATE invoices SET amount_paid = 7500000 WHERE id=$1', [inv])

    expect((await invoiceInfo(inv)).due, 'invoice lunas tapi masih menyisakan tagihan').toBe(0)
  })

  it('lebih bayar menghasilkan sisa NOL, bukan angka minus', async () => {
    // Kelebihan bayar wajar terjadi: pembulatan transfer, klien membayar dua
    // kali karena mengira yang pertama gagal, atau melunasi dengan angka bulat.
    //
    // Sisa negatif tak sekadar aneh dilihat — `clients.ts:78` dan
    // `dashboard.ts:190` MENJUMLAHKAN `amount_due` apa adanya, jadi satu klien
    // yang lebih bayar membuat total piutang perusahaan terlihat lebih kecil
    // dan menutupi tunggakan klien LAIN. Ditutup migrasi 163.
    const inv = await buatInvoice(2_000_000)
    await client.query('UPDATE invoices SET amount_paid = 2500000 WHERE id=$1', [inv])

    expect(
      (await invoiceInfo(inv)).due,
      'sisa tagihan negatif — total piutang perusahaan ikut berkurang dan ' +
        'menutupi tunggakan klien lain',
    ).toBe(0)
  })

  it('kelebihan bayar tetap TEREKAM di `amount_paid` — tak ada uang hilang', async () => {
    // Batas bawah pada `amount_due` tak boleh berarti kelebihannya dilupakan.
    // Kalau `amount_paid` ikut dipangkas ke `total_amount`, uang yang benar-
    // benar diterima hilang dari catatan dan selisihnya tak bisa dihitung
    // ulang saat rekonsiliasi ke rekening bank.
    const inv = await buatInvoice(2_000_000)
    await client.query('UPDATE invoices SET amount_paid = 2500000 WHERE id=$1', [inv])

    const { paid } = await invoiceInfo(inv)
    expect(
      paid,
      'jumlah dibayar ikut dipangkas — kelebihan bayar hilang dari catatan',
    ).toBe(2_500_000)
    expect(paid - 2_000_000, 'selisih lebih bayar tak bisa dihitung ulang').toBe(500_000)
  })
})
