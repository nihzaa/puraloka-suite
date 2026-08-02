import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// ═════════════════════════════════════════════════════════════════════════════
// `created_at` TAK BOLEH DIGESER — dan sampai 2026-08-02 ia bisa.
//
// ── Yang ditemukan, dan koreksinya
//
// `protect_created_at()` ada di `pg_proc` DEV tapi nol tabel memakainya.
// Diuji langsung di transaksi yang di-ROLLBACK:
//
//     UPDATE invoices SET created_at = '2000-01-01' → BERHASIL
//
// Dugaan pertama: migrasi `037_security_hardening.sql` gagal. Itu SALAH —
// dibuktikan dengan menjalankan rantai migrasi di schema yang benar-benar
// bersih: dengan 037 saja, 10/10 tabel terlindungi.
//
// Jadi yang menyimpang bukan migrasi, melainkan database **dev** (riwayatnya
// memuat operasi di luar migrasi). Migrasi 166 memulihkan dev; test ini
// menjaga agar rantainya tetap menghasilkan perlindungan itu di mana pun.
//
// Catatan uji mutasi: menghapus `projects` dari daftar migrasi 166 TIDAK
// memerahkan test ini — dan itu benar, karena 037 sudah memasangnya lebih
// dulu. Yang dijaga di sini HASIL AKHIR rantai, bukan kontribusi satu migrasi.
//
// ── Kenapa ini penting melebihi "kerapian data"
//
// `audit_logs` yang tanggalnya bisa digeser berhenti jadi bukti. Ia memang
// masih append-only lewat `trg_audit_logs_no_update`, tapi itu penjaga yang
// BERBEDA — dan urutan kejadian yang direkamnya tetap rusak kalau stempel
// waktunya bisa dipindah.
//
// Bukan hanya soal niat jahat: skrip perbaikan data, migrasi salah tulis, atau
// `UPDATE` yang meleset semuanya bisa menggesernya tanpa ada yang sadar.
//
// ── Kenapa lewat SQL, bukan endpoint
//
// Yang dijaga TRIGGER DATABASE. Siapa pun yang menulis — API, migrasi,
// perbaikan manual, skrip sekali-pakai — harus ditolak dengan cara yang sama.
// Menguji lewat endpoint hanya membuktikan satu jalur dari beberapa, dan
// justru jalur-jalur LAIN yang paling mungkin menggeser stempel waktu.
// ═════════════════════════════════════════════════════════════════════════════

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
  '078_users_role_id_expand.sql',
  '154_guard_regclass_schema_aware.sql',
  '003_projects_and_contracts.sql',
  // 037 menyentuh audit_logs & invoices — keduanya harus ada dulu. Rantai
  // ini dibawa serta bukan karena diuji, melainkan karena 037 menuntutnya.
  '004_expense_categories.sql',
  '005_expense_reports_and_items.sql',
  '006_invoices_payments_taxes.sql',
  '007_mandor_workscopes_kasbons.sql',
  '008_monitoring_photos_documents.sql',
  '009_notifications_audit_logs.sql',
  '016_cash_management.sql',
  '037_security_hardening.sql',   // mendefinisikan `protect_created_at()`
  '020_expenses_main_cash_id.sql',
  '166_pulihkan_protect_created_at.sql',
]

let client: Client
let ctx: SeedProjectContext

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  ctx = await seedProjectContext(client)
})

afterAll(async () => { await closeTestClient(client) })

describe('`created_at` tak bisa digeser lewat UPDATE', () => {
  it('UPDATE yang mengubah created_at TIDAK berpengaruh', async () => {
    const { rows: awal } = await client.query(
      'SELECT created_at FROM projects WHERE id=$1', [ctx.projectId])

    await client.query(
      `UPDATE projects SET created_at = '2000-01-01T00:00:00Z' WHERE id=$1`, [ctx.projectId])

    const { rows: sesudah } = await client.query(
      'SELECT created_at FROM projects WHERE id=$1', [ctx.projectId])

    expect(
      String(sesudah[0].created_at),
      'created_at bisa ditulis ulang — stempel waktu berhenti bisa dipercaya, ' +
        'dan urutan kejadian yang direkamnya ikut rusak',
    ).toBe(String(awal[0].created_at))
  })

  it('kolom LAIN tetap bisa diubah pada UPDATE yang sama', async () => {
    // Sisi sebaliknya: penjaga yang terlalu galak akan memblokir seluruh UPDATE,
    // dan itu sama merusaknya. Yang benar — created_at dipulihkan diam-diam,
    // sisanya jalan.
    const { rows: awal } = await client.query(
      'SELECT created_at FROM projects WHERE id=$1', [ctx.projectId])

    await client.query(
      `UPDATE projects SET name='[TEST] nama baru', created_at='1999-01-01' WHERE id=$1`,
      [ctx.projectId])

    const { rows } = await client.query(
      'SELECT name, created_at FROM projects WHERE id=$1', [ctx.projectId])

    expect(rows[0].name, 'UPDATE ikut diblokir — penjaga terlalu galak').toBe('[TEST] nama baru')
    expect(String(rows[0].created_at)).toBe(String(awal[0].created_at))
  })

  it('UPDATE biasa tanpa menyentuh created_at tetap normal', async () => {
    await client.query(`UPDATE projects SET name='[TEST] nama lain' WHERE id=$1`, [ctx.projectId])
    const { rows } = await client.query('SELECT name FROM projects WHERE id=$1', [ctx.projectId])
    expect(rows[0].name).toBe('[TEST] nama lain')
  })

  it('kesepuluh tabel kritis terpasang penjaganya', async () => {
    // Migrasi 037 "berhasil" tanpa meninggalkan SATU trigger pun — jadi
    // memeriksa satu tabel saja tak membuktikan cakupannya. Yang dijaga di
    // sini: daftar 10 tabel itu utuh, bukan sebagian.
    const KRITIS = [
      'projects', 'invoices', 'payments', 'kasbons',
      'project_expenses', 'mandor_assignments', 'work_scopes',
      'audit_logs', 'users', 'clients',
    ]

    const { rows } = await client.query(`
      SELECT c.relname AS tabel
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal
         AND t.tgname = 'trg_protect_created_at'
         AND c.relnamespace = current_schema()::regnamespace
    `)
    const terpasang = new Set(rows.map(r => r.tabel as string))

    // Hanya tabel yang MEMANG ada di subset migrasi ini yang dituntut.
    const { rows: ada } = await client.query(`
      SELECT relname FROM pg_class
       WHERE relkind='r' AND relnamespace = current_schema()::regnamespace
    `)
    const adaSet = new Set(ada.map(r => r.relname as string))
    const wajib = KRITIS.filter(t => adaSet.has(t))
    const bolong = wajib.filter(t => !terpasang.has(t))

    // Uji mutasi menemukan test ini SEBELUMNYA lolos saat `projects` dihapus
    // dari daftar migrasi: subset ini kebetulan tak memuat semua 10 tabel,
    // sehingga `wajib` menyusut diam-diam dan `bolong` tetap kosong.
    //
    // Jumlahnya dikunci: kalau subset migrasi berubah sehingga tabel kritis
    // hilang, itu HARUS terlihat — bukan membuat cakupan yang diuji ikut
    // mengecil tanpa suara.
    expect(
      wajib.length,
      'jumlah tabel kritis yang diuji berubah — cakupan test menyusut diam-diam',
    ).toBe(10)

    expect(
      bolong,
      `Tabel tanpa penjaga created_at: ${bolong.join(', ')}. Migrasi 037 gagal ` +
        'dengan cara yang persis seperti ini — "berhasil" tanpa memasang satu pun.',
    ).toEqual([])
  })
})
