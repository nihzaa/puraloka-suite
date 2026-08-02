import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// ═════════════════════════════════════════════════════════════════════════════
// ALUR UANG — pembayaran ke MANDOR memotong saldo kas.
//
// ── Kelas cacat yang sama, kali ketiga
//
// Migrasi 161 & 162 menutup dua fungsi yang ada di `pg_proc` tapi tak punya
// trigger yang memanggilnya. Penelusuran menyeluruh sesudahnya (2026-08-02)
// menemukan itu bukan dua kasus terpencil: TUJUH fungsi `RETURNS trigger` di
// dev tak dipakai trigger mana pun, dan EMPAT menyentuh uang.
//
// Dampaknya nyata: 16 kasbon approved (Rp 46.600.000) dan 3 pembayaran progress
// (Rp 21.000.000) tak pernah memotong saldo. Uangnya sudah keluar di lapangan;
// saldo di aplikasi masih menampilkannya sebagai uang yang ada.
//
// ── Kenapa test kasbon yang sudah ada tak menangkapnya
//
// `kasbons.test.ts` memeriksa status berubah jadi 'approved', notifikasi
// terkirim, dan isolasi PM bekerja. Semuanya benar. Tak satu pun memeriksa
// apakah UANGNYA berpindah — dan di situlah cacatnya bersembunyi.
//
// ── Kenapa lewat SQL, bukan endpoint
//
// Yang diuji TRIGGER DATABASE. Siapa pun yang menulis ke tabel ini — API,
// skrip migrasi, perbaikan manual — harus menghasilkan potongan saldo yang
// sama. Menguji lewat endpoint hanya membuktikan satu jalur dari beberapa.
// ═════════════════════════════════════════════════════════════════════════════

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '078_users_role_id_expand.sql',
  '154_guard_regclass_schema_aware.sql',
  '003_projects_and_contracts.sql',
  '004_expense_categories.sql',
  '007_mandor_workscopes_kasbons.sql',
  '016_cash_management.sql',
  '020_expenses_main_cash_id.sql',
  // 018 dulu: 022 memasang trigger pada `worker_kasbons` yang lahir di sana.
  '018_mandor_workers_wages.sql',
  '022_kasbon_cash_account.sql',
  '051_mandor_portal_improvements.sql',
  '056_kasbon_scope_optional.sql',            // work_scope_id nullable + project_id
  '100_fix_kasbon_expense_trigger_on_conflict.sql',
  // 165 SEBELUM 164: ia memperbaiki fungsi yang migrasi 100 tulis ke schema
  // `public` (skema dipaku), sehingga versi rusak dari 051 tak pernah
  // tergantikan di schema test.
  '165_fungsi_kasbon_expense_sadar_schema.sql',
  '164_pasang_trigger_uang_mandor.sql',
]

let client: Client
let ctx: SeedProjectContext
let scopeId: string

async function saldo(id: string): Promise<number> {
  const { rows } = await client.query('SELECT balance::float8 b FROM cash_accounts WHERE id=$1', [id])
  return rows[0].b
}

async function buatAkun(saldoAwal: number): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO cash_accounts (name, type, balance, owner_id, project_id, created_by)
     VALUES ('[TEST] Kas Mandor', 'main', $1, $2, $3, $2) RETURNING id`,
    [saldoAwal, ctx.adminId, ctx.projectId],
  )
  return rows[0].id
}

async function buatKasbon(akunId: string, jumlah: number): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO kasbons (work_scope_id, project_id, amount, purpose, kasbon_date,
                          status, cash_account_id, requested_by, fund_source)
     VALUES ($1, $2, $3, 'operasional', CURRENT_DATE, 'pending', $4, $5, 'owner_advance') RETURNING id`,
    [scopeId, ctx.projectId, jumlah, akunId, ctx.adminId],
  )
  return rows[0].id
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  ctx = await seedProjectContext(client)

  const { rows: asg } = await client.query(
    `INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by)
     VALUES ($1, $2, $2) RETURNING id`,
    [ctx.projectId, ctx.adminId],
  )
  const { rows: sc } = await client.query(
    `INSERT INTO work_scopes (assignment_id, scope_name, payment_system, borongan_value)
     VALUES ($1, '[TEST] Scope', 'harian', 100000000) RETURNING id`,
    [asg[0].id],
  )
  scopeId = sc[0].id

  // Trigger beban (`fn_kasbon_approved_create_expense`) `RETURN NEW` diam-diam
  // kalau proyek tak punya satu pun kategori pengeluaran — ia butuh
  // `category_id` yang NOT NULL. Tanpa baris ini, test beban di bawah gagal
  // karena PRASYARATNYA tak terpenuhi, bukan karena trigger-nya salah.
  await client.query(
    `INSERT INTO project_expense_categories (project_id, name, type)
     VALUES ($1, '[TEST] Kasbon Mandor', 'labor')`,
    [ctx.projectId],
  )
})

afterAll(async () => { await closeTestClient(client) })

describe('Alur uang — kasbon disetujui memotong saldo kas', () => {
  it('approve mengurangi saldo sebesar nilai kasbon', async () => {
    const akun = await buatAkun(10_000_000)
    const id = await buatKasbon(akun, 2_000_000)

    expect(await saldo(akun), 'saldo berkurang SEBELUM disetujui').toBe(10_000_000)

    await client.query(`UPDATE kasbons SET status='approved', approved_by=$2 WHERE id=$1`, [id, ctx.adminId])

    expect(
      await saldo(akun),
      'kasbon disetujui tapi saldo TIDAK berkurang — ini cacat yang ditemukan ' +
        '2026-08-02: fungsinya ada di pg_proc, trigger-nya hilang. Uang sudah ' +
        'diterima mandor di lapangan tapi kas masih menampilkannya sebagai ada.',
    ).toBe(8_000_000)
  })

  it('membatalkan persetujuan MENGEMBALIKAN saldo', async () => {
    const akun = await buatAkun(5_000_000)
    const id = await buatKasbon(akun, 1_500_000)

    await client.query(`UPDATE kasbons SET status='approved', approved_by=$2 WHERE id=$1`, [id, ctx.adminId])
    expect(await saldo(akun)).toBe(3_500_000)

    await client.query(`UPDATE kasbons SET status='rejected' WHERE id=$1`, [id])

    expect(
      await saldo(akun),
      'pembatalan tak mengembalikan saldo — uang yang tak jadi keluar tetap hilang dari kas',
    ).toBe(5_000_000)
  })

  it('approve DUA KALI tak memotong dua kali', async () => {
    // Guard-nya `OLD.status <> 'approved'`. Menyimpan ulang persetujuan —
    // misalnya karena PM mengubah catatan — tak boleh memotong lagi.
    const akun = await buatAkun(6_000_000)
    const id = await buatKasbon(akun, 1_000_000)

    await client.query(`UPDATE kasbons SET status='approved', approved_by=$2 WHERE id=$1`, [id, ctx.adminId])
    await client.query(`UPDATE kasbons SET status='approved', notes='disimpan ulang' WHERE id=$1`, [id])

    expect(
      await saldo(akun),
      'potongan ganda — menyimpan ulang persetujuan mengurangi saldo lagi',
    ).toBe(5_000_000)
  })

  it('kasbon TANPA akun kas tak menyentuh saldo mana pun', async () => {
    // Sebagian kasbon dibayar tunai dari kantong, tanpa menunjuk akun. Itu sah
    // — yang tak boleh: menebak akun mana yang dipotong.
    const akun = await buatAkun(4_000_000)
    const { rows } = await client.query(
      `INSERT INTO kasbons (work_scope_id, project_id, amount, purpose, kasbon_date,
                            status, cash_account_id, requested_by, fund_source)
       VALUES ($1, $2, 900000, 'operasional', CURRENT_DATE, 'pending', NULL, $3, 'owner_advance') RETURNING id`,
      [scopeId, ctx.projectId, ctx.adminId],
    )
    await client.query(`UPDATE kasbons SET status='approved', approved_by=$2 WHERE id=$1`, [rows[0].id, ctx.adminId])

    expect(await saldo(akun), 'kasbon tanpa akun kas tetap memotong saldo akun lain').toBe(4_000_000)
  })
})

describe('Alur uang — kasbon disetujui tercatat sebagai BEBAN proyek', () => {
  it('approve membuat baris di project_expenses', async () => {
    // Tanpa ini, kasbon memotong kas tapi tak pernah muncul sebagai biaya
    // proyek — serapan anggaran terlihat lebih kecil dari yang sebenarnya,
    // dan EVM (CPI/SPI) ikut salah.
    const akun = await buatAkun(8_000_000)
    const id = await buatKasbon(akun, 1_200_000)

    const sebelum = await client.query('SELECT count(*)::int n FROM project_expenses')

    await client.query(`UPDATE kasbons SET status='approved', approved_by=$2 WHERE id=$1`, [id, ctx.adminId])

    const sesudah = await client.query('SELECT count(*)::int n FROM project_expenses')
    expect(
      sesudah.rows[0].n,
      'kasbon disetujui tak tercatat sebagai beban — serapan anggaran terlihat ' +
        'lebih kecil dari yang sebenarnya dan CPI/SPI ikut salah',
    ).toBe(sebelum.rows[0].n + 1)
  })

  it('approve dua kali tak menggandakan bebannya', async () => {
    // Migrasi 100 adalah bugfix untuk trigger ini — `ON CONFLICT` dengan index
    // parsial selalu gagal. Test ini menjaga perbaikan itu tetap bekerja.
    const akun = await buatAkun(8_000_000)
    const id = await buatKasbon(akun, 700_000)

    await client.query(`UPDATE kasbons SET status='approved', approved_by=$2 WHERE id=$1`, [id, ctx.adminId])
    const sesudahSekali = await client.query('SELECT count(*)::int n FROM project_expenses')

    await client.query(`UPDATE kasbons SET status='approved', notes='ulang' WHERE id=$1`, [id])

    const sesudahDua = await client.query('SELECT count(*)::int n FROM project_expenses')
    expect(
      sesudahDua.rows[0].n,
      'beban tercatat dua kali — biaya proyek membengkak tanpa transaksi baru',
    ).toBe(sesudahSekali.rows[0].n)
  })
})

describe('Alur uang — pembayaran progress ke mandor', () => {
  async function buatProgressPayment(akunId: string, net: number): Promise<string> {
    const { rows } = await client.query(
      `INSERT INTO progress_payments
         (work_scope_id, pct_completed, earned_value, gross_payment, deducted_kasbon,
          net_payment, status, cash_account_id, requested_by, approved_by)
       VALUES ($1, 25, $2, $2, 0, $2, 'pending', $3, $4, $4) RETURNING id`,
      [scopeId, net, akunId, ctx.adminId],
    )
    return rows[0].id
  }

  it('approve mengurangi saldo sebesar net_payment', async () => {
    const akun = await buatAkun(20_000_000)
    const id = await buatProgressPayment(akun, 5_000_000)

    expect(await saldo(akun), 'saldo berkurang sebelum disetujui').toBe(20_000_000)

    await client.query(`UPDATE progress_payments SET status='approved' WHERE id=$1`, [id])

    expect(
      await saldo(akun),
      'pembayaran progress disetujui tapi saldo tak berkurang',
    ).toBe(15_000_000)
  })

  it('membatalkan persetujuan mengembalikan saldo', async () => {
    const akun = await buatAkun(12_000_000)
    const id = await buatProgressPayment(akun, 3_000_000)

    await client.query(`UPDATE progress_payments SET status='approved' WHERE id=$1`, [id])
    expect(await saldo(akun)).toBe(9_000_000)

    await client.query(`UPDATE progress_payments SET status='rejected' WHERE id=$1`, [id])

    expect(await saldo(akun), 'pembatalan tak mengembalikan saldo').toBe(12_000_000)
  })

  it('approve dua kali tak memotong dua kali', async () => {
    const akun = await buatAkun(15_000_000)
    const id = await buatProgressPayment(akun, 2_000_000)

    await client.query(`UPDATE progress_payments SET status='approved' WHERE id=$1`, [id])
    await client.query(`UPDATE progress_payments SET status='approved', notes='ulang' WHERE id=$1`, [id])

    expect(await saldo(akun), 'potongan ganda pada pembayaran progress').toBe(13_000_000)
  })
})
