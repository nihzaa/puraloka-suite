import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// ═════════════════════════════════════════════════════════════════════════════
// ALUR UANG — pengeluaran disetujui, SALDO KAS BERKURANG.
//
// ── Kenapa test ini ada
//
// Test kasbon yang sudah ada berhenti di "status berubah jadi approved". Tak
// satu pun memeriksa apakah UANGNYA benar-benar berpindah. Itu celah yang
// paling mahal di seluruh sistem: seluruh rantai bisa "berhasil" sementara
// saldo tak pernah berkurang, dan tak ada gejala — request 200, pengeluaran
// tercatat, laporan terbit.
//
// ── Yang ditemukan saat menulisnya (2026-08-02)
//
// `fn_update_main_cash_on_expense()` ADA di database tapi TRIGGER-nya TIDAK.
// Jadi pengeluaran dari KAS UTAMA tak pernah memotong saldo — sementara
// kembarannya untuk kas kecil bekerja normal.
//
// Separuh jalur hidup, separuh mati. Itu lebih menyesatkan daripada kalau
// keduanya mati: orang melihat saldo petty cash berkurang dengan benar, lalu
// menyimpulkan mekanismenya berfungsi. Ditutup migrasi 161 — dan test ini
// yang menjaganya tetap tertutup.
//
// ── Kenapa lewat SQL, bukan lewat endpoint
//
// Yang diuji di sini adalah TRIGGER DATABASE, bukan handler. Trigger bekerja
// pada level baris: siapa pun yang menulis ke `project_expenses` — API,
// skrip migrasi, perbaikan manual lewat SQL — harus menghasilkan potongan
// saldo yang sama. Menguji lewat endpoint hanya membuktikan satu jalur dari
// beberapa yang ada.
// ═════════════════════════════════════════════════════════════════════════════

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '078_users_role_id_expand.sql',
  '154_guard_regclass_schema_aware.sql',
  '003_projects_and_contracts.sql',
  '004_expense_categories.sql',  // project_expenses merujuknya (FK kategori)
  '007_mandor_workscopes_kasbons.sql',
  '016_cash_management.sql',
  '020_expenses_main_cash_id.sql',
  '025_fix_main_cash_expense_trigger.sql',
  '161_pasang_trigger_main_cash_expense.sql',
]

let client: Client
let ctx: SeedProjectContext

/** Saldo terkini satu akun kas. */
async function saldo(id: string): Promise<number> {
  const { rows } = await client.query('SELECT balance::float8 b FROM cash_accounts WHERE id = $1', [id])
  return rows[0].b
}

async function buatAkun(tipe: 'main' | 'petty_cash', saldoAwal: number): Promise<string> {
  const { rows } = await client.query(
    // `petty_cash` punya constraint: WAJIB punya `owner_id` DAN `project_id`
    // (chk_petty_cash_has_owner / _has_project di migrasi 016). Diisi untuk
    // kedua tipe supaya helper ini tak punya cabang yang mudah lupa.
    `INSERT INTO cash_accounts (name, type, balance, owner_id, project_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $4) RETURNING id`,
    [`[TEST] ${tipe}`, tipe, saldoAwal, ctx.adminId, ctx.projectId],
  )
  return rows[0].id
}

/** Pengeluaran proyek. `status` awal bisa langsung 'approved' (jalur admin). */
/** Kategori pengeluaran — `project_expenses.category_id` NOT NULL. */
let kategoriId: string

async function buatPengeluaran(opts: {
  sumber: 'main_cash' | 'petty_cash'
  akunId: string
  jumlah: number
  status?: string
}): Promise<string> {
  const kolomAkun = opts.sumber === 'main_cash' ? 'main_cash_id' : 'petty_cash_id'
  const { rows } = await client.query(
    `INSERT INTO project_expenses
       (project_id, category_id, description, expense_date, qty, unit_price,
        total_amount, expense_source, ${kolomAkun}, status, submitted_by)
     VALUES ($1, $2, '[TEST] pengeluaran', CURRENT_DATE, 1, $3, $3, $4, $5, $6, $7)
     RETURNING id`,
    [ctx.projectId, kategoriId, opts.jumlah, opts.sumber, opts.akunId,
     opts.status ?? 'submitted', ctx.adminId],
  )
  return rows[0].id
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  ctx = await seedProjectContext(client)

  const { rows } = await client.query(
    `INSERT INTO project_expense_categories (project_id, name, type)
     VALUES ($1, '[TEST] Material', 'material') RETURNING id`,
    [ctx.projectId],
  )
  kategoriId = rows[0].id
})

afterAll(async () => { await closeTestClient(client) })

describe('Alur uang — pengeluaran KAS UTAMA', () => {
  it('approve mengurangi saldo sebesar total pengeluaran', async () => {
    const akun = await buatAkun('main', 10_000_000)
    const id = await buatPengeluaran({ sumber: 'main_cash', akunId: akun, jumlah: 2_500_000 })

    expect(await saldo(akun), 'saldo berkurang SEBELUM disetujui').toBe(10_000_000)

    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [id])

    expect(
      await saldo(akun),
      'pengeluaran kas utama disetujui tapi saldo TIDAK berkurang — ini cacat ' +
        'yang ditemukan 2026-08-02: fungsinya ada, trigger-nya hilang. Saldo ' +
        'akan terus menampilkan uang yang sudah dibelanjakan.',
    ).toBe(7_500_000)
  })

  it('INSERT langsung approved juga mengurangi — bukan hanya UPDATE', async () => {
    // Admin/PM bisa mencatat pengeluaran yang langsung disetujui. Kalau
    // trigger hanya menangani UPDATE, jalur itu lolos tanpa memotong saldo —
    // dan itu persis bug yang migrasi 025 perbaiki.
    const akun = await buatAkun('main', 5_000_000)
    await buatPengeluaran({ sumber: 'main_cash', akunId: akun, jumlah: 1_000_000, status: 'approved' })

    expect(
      await saldo(akun),
      'INSERT langsung approved tak memotong saldo — jalur admin lolos diam-diam',
    ).toBe(4_000_000)
  })

  it('reject sesudah approve MENGEMBALIKAN saldo', async () => {
    // Tanpa ini, membatalkan persetujuan meninggalkan uang yang "hilang":
    // pengeluaran ditolak tapi saldo tetap terpotong.
    const akun = await buatAkun('main', 8_000_000)
    const id = await buatPengeluaran({ sumber: 'main_cash', akunId: akun, jumlah: 3_000_000 })

    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [id])
    expect(await saldo(akun)).toBe(5_000_000)

    await client.query(`UPDATE project_expenses SET status='rejected' WHERE id=$1`, [id])

    expect(
      await saldo(akun),
      'penolakan tak mengembalikan saldo — uang yang tak jadi dibelanjakan tetap hilang dari kas',
    ).toBe(8_000_000)
  })

  it('approve DUA KALI tak memotong dua kali', async () => {
    // `UPDATE … SET status='approved'` pada baris yang SUDAH approved tak
    // boleh memotong lagi. Guard-nya `OLD.status != 'approved'`.
    const akun = await buatAkun('main', 6_000_000)
    const id = await buatPengeluaran({ sumber: 'main_cash', akunId: akun, jumlah: 1_500_000 })

    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [id])
    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [id])

    expect(
      await saldo(akun),
      'potongan ganda — menyimpan ulang persetujuan mengurangi saldo lagi',
    ).toBe(4_500_000)
  })

  it('pengeluaran yang TIDAK disetujui tak menyentuh saldo', async () => {
    const akun = await buatAkun('main', 4_000_000)
    await buatPengeluaran({ sumber: 'main_cash', akunId: akun, jumlah: 900_000 })
    await buatPengeluaran({ sumber: 'main_cash', akunId: akun, jumlah: 100_000, status: 'draft' })

    expect(await saldo(akun), 'pengeluaran belum disetujui sudah memotong saldo').toBe(4_000_000)
  })
})

describe('Alur uang — pengeluaran KAS KECIL', () => {
  it('approve mengurangi saldo kas kecil', async () => {
    const akun = await buatAkun('petty_cash', 3_000_000)
    const id = await buatPengeluaran({ sumber: 'petty_cash', akunId: akun, jumlah: 750_000 })

    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [id])

    expect(await saldo(akun)).toBe(2_250_000)
  })

  it('reject mengembalikan saldo kas kecil', async () => {
    const akun = await buatAkun('petty_cash', 2_000_000)
    const id = await buatPengeluaran({ sumber: 'petty_cash', akunId: akun, jumlah: 500_000 })

    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [id])
    await client.query(`UPDATE project_expenses SET status='rejected' WHERE id=$1`, [id])

    expect(await saldo(akun)).toBe(2_000_000)
  })
})

describe('Alur uang — dua jalur TIDAK saling mengganggu', () => {
  it('pengeluaran kas utama tak menyentuh saldo kas kecil, dan sebaliknya', async () => {
    // Kedua trigger terpasang pada tabel yang SAMA (`project_expenses`) dan
    // sama-sama berjalan setiap baris. Yang membedakan hanya `expense_source`.
    // Kalau salah satu guard-nya longgar, satu pengeluaran memotong DUA akun.
    const utama = await buatAkun('main', 10_000_000)
    const kecil = await buatAkun('petty_cash', 5_000_000)

    const idUtama = await buatPengeluaran({ sumber: 'main_cash', akunId: utama, jumlah: 2_000_000 })
    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [idUtama])

    expect(await saldo(utama)).toBe(8_000_000)
    expect(
      await saldo(kecil),
      'pengeluaran kas utama ikut memotong kas kecil — guard `expense_source` longgar',
    ).toBe(5_000_000)

    const idKecil = await buatPengeluaran({ sumber: 'petty_cash', akunId: kecil, jumlah: 1_000_000 })
    await client.query(`UPDATE project_expenses SET status='approved' WHERE id=$1`, [idKecil])

    expect(await saldo(kecil)).toBe(4_000_000)
    expect(
      await saldo(utama),
      'pengeluaran kas kecil ikut memotong kas utama',
    ).toBe(8_000_000)
  })
})
