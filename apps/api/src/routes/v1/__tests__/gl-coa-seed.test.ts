import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, closeTestClient } from '../../../test-utils/test-db'

// ═════════════════════════════════════════════════════════════════════════════
// GL-1b — CoA standar kontraktor.
//
// ── Yang dijaga, dan kenapa
//
// Peta auto-jurnal GL-2 (`ERP_MASTER_PLAN` §Modul 10) merujuk kode akun
// sebagai STRING harfiah:
//
//   Kasbon approved      1122 Uang Muka Mandor  ←→  1112 Kas Proyek
//   Invoice klien dibayar 1111 Kas Kantor       ←→  1121 Piutang Usaha
//   PO supplier lunas    1310 Persediaan        ←→  2110 Utang Supplier
//
// Kalau salah satu kode itu berubah atau hilang dari seed, GL-2 tak akan
// menemukan akunnya — dan kegagalan seperti itu DIAM: jurnal tak terbentuk,
// tapi transaksinya tetap tersimpan. Persis kelas cacat yang menahan
// Rp 627 juta di migrasi 162.
//
// Test ini mengunci kontrak itu SEBELUM GL-2 dibangun, bukan sesudah.
//
// ── Kenapa langsung ke `public`
//
// Sama dengan `gl-invarian.test.ts`: yang diuji keadaan NYATA database yang
// dipakai. Rantai migrasi penuh tak bisa dijalankan di schema test (132/137
// memverifikasi keadaan yang hanya sah di `public`, 049 bentrok dengan 071).
// ═════════════════════════════════════════════════════════════════════════════

let client: Client
let companyId: string

/** Kode akun yang DIRUJUK peta auto-jurnal GL-2 — tak boleh hilang. */
const DIPAKAI_GL2 = [
  ['1111', 'Kas Kantor'],
  ['1112', 'Kas Proyek'],
  ['1121', 'Piutang Usaha'],
  ['1122', 'Uang Muka Mandor'],
  ['1310', 'Persediaan Material'],
  ['2110', 'Utang Supplier'],
  ['5110', 'Biaya Upah Mandor'],
  ['5210', 'Biaya Material'],
] as const

beforeAll(async () => {
  client = await createTestClient()
  await client.query('SET search_path TO public')
  await client.query('SET client_min_messages TO WARNING')

  const { rows } = await client.query('SELECT id FROM companies ORDER BY created_at LIMIT 1')
  companyId = rows[0].id
})

afterAll(async () => { await closeTestClient(client) })

describe('CoA — kontrak dengan peta auto-jurnal GL-2', () => {
  it.each(DIPAKAI_GL2)('akun %s (%s) ADA', async (kode, nama) => {
    const { rows } = await client.query(
      'SELECT name, type FROM accounts WHERE company_id=$1 AND code=$2', [companyId, kode])

    expect(
      rows.length,
      `Akun ${kode} hilang dari CoA. Peta auto-jurnal GL-2 merujuknya sebagai ` +
        'string harfiah — tanpa akun ini, jurnal otomatis tak terbentuk dan ' +
        'kegagalannya DIAM: transaksi tetap tersimpan, pembukuannya tidak.',
    ).toBe(1)
    expect(rows[0].name).toBe(nama)
  })
})

describe('CoA — bentuk bagan akun', () => {
  it('punya kelima tipe akun', async () => {
    // Neraca butuh asset/liability/equity; laba-rugi butuh revenue/expense.
    // Bagan yang kehilangan satu tipe menghasilkan laporan yang tak lengkap
    // tanpa error apa pun.
    const { rows } = await client.query(
      'SELECT DISTINCT type FROM accounts WHERE company_id=$1 ORDER BY 1', [companyId])
    expect(rows.map(r => r.type)).toEqual(
      ['asset', 'equity', 'expense', 'liability', 'revenue'])
  })

  it('akun anak menunjuk induk yang tipenya SAMA', async () => {
    // `1111 Kas Kantor` (asset) di bawah `1110 Kas & Bank` (asset). Induk
    // bertipe beda membuat laporan menjumlahkan aset ke dalam beban —
    // angkanya keluar, dan salah.
    const { rows } = await client.query(`
      SELECT a.code, a.type AS tipe_anak, p.code AS induk, p.type AS tipe_induk
        FROM accounts a
        JOIN accounts p ON p.id = a.parent_id
       WHERE a.company_id = $1 AND a.type <> p.type
    `, [companyId])

    expect(
      rows,
      `Akun bertipe beda dari induknya: ${rows.map(r => `${r.code}→${r.induk}`).join(', ')}`,
    ).toEqual([])
  })

  it('tiap akun induk punya anak, tiap anak punya induk yang ada', async () => {
    const { rows } = await client.query(`
      SELECT code FROM accounts
       WHERE company_id = $1 AND parent_id IS NOT NULL
         AND parent_id NOT IN (SELECT id FROM accounts WHERE company_id = $1)
    `, [companyId])
    expect(rows, 'ada akun yang induknya milik company lain / tak ada').toEqual([])
  })

  it('minimal 30 akun — bagan yang terlalu tipis tak bisa dipakai', async () => {
    const { rows } = await client.query(
      'SELECT count(*)::int n FROM accounts WHERE company_id=$1', [companyId])
    expect(rows[0].n).toBeGreaterThanOrEqual(30)
  })
})

describe('CoA — seed idempoten & per-company', () => {
  it('memanggil seed DUA KALI tak menggandakan akun', async () => {
    // Fungsi seed dipanggil saat company dibuat DAN bisa dipanggil manual
    // untuk memulihkan bagan yang terlanjur kosong. Kalau tak idempoten,
    // pemanggilan kedua menghasilkan bagan akun ganda.
    const sebelum = await client.query(
      'SELECT count(*)::int n FROM accounts WHERE company_id=$1', [companyId])

    await client.query('SELECT fn_seed_coa_kontraktor($1)', [companyId])

    const sesudah = await client.query(
      'SELECT count(*)::int n FROM accounts WHERE company_id=$1', [companyId])
    expect(sesudah.rows[0].n, 'seed tak idempoten — akun tergandakan').toBe(sebelum.rows[0].n)
  })

  it('badan usaha BARU mendapat bagan akun lengkap', async () => {
    // Inti kenapa seed dibuat sebagai FUNGSI, bukan INSERT sekali jalan:
    // badan usaha kedua lahir sesudah migrasi dijalankan.
    const { rows: co } = await client.query(
      `INSERT INTO companies (code, name) VALUES ('coa-test', '[TEST] CoA Co') RETURNING id`)
    try {
      const { rows: n } = await client.query(
        'SELECT fn_seed_coa_kontraktor($1) AS n', [co[0].id])
      expect(n[0].n, 'badan usaha baru tak dapat akun sama sekali').toBeGreaterThanOrEqual(30)

      // Kode yang sama boleh ada di dua company — itu inti unique per-company.
      const { rows: kas } = await client.query(
        'SELECT count(*)::int n FROM accounts WHERE code=$1', ['1111'])
      expect(kas[0].n).toBeGreaterThanOrEqual(2)
    } finally {
      await client.query('DELETE FROM accounts WHERE company_id=$1', [co[0].id])
      await client.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
      await client.query('DELETE FROM companies WHERE id=$1', [co[0].id])
      await client.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
    }
  })
})
