import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, closeTestClient } from '../../../test-utils/test-db'
import type { SeedProjectContext } from './_seed-helpers'

// ═════════════════════════════════════════════════════════════════════════════
// GL — dua invarian buku besar, ditegakkan DATABASE.
//
// ── Kenapa diuji di level SQL, bukan endpoint
//
// Yang dijaga trigger, dan trigger berlaku untuk SIAPA PUN yang menulis: API,
// skrip migrasi, perbaikan manual, seed. Menguji lewat endpoint hanya
// membuktikan satu jalur — dan justru jalur LAIN yang paling mungkin merusak
// pembukuan (skrip perbaikan data yang dijalankan sekali lalu dilupakan).
//
// Pelajaran termahal repo ini (2026-08-02): `fn_update_cash_balance_on_payment`
// ada di `pg_proc` tapi trigger-nya hilang, dan Rp 627 juta tak pernah masuk
// saldo tanpa satu pun gejala. Buku besar tak boleh mengulanginya.
//
// ── Empat invarian yang dijaga
//
//   1. Jurnal posted WAJIB seimbang (Σ debit = Σ kredit), minimal 2 baris
//   2. Jurnal posted TAK BOLEH diubah — koreksi lewat jurnal balik
//   3. BARIS jurnal posted juga terkunci (pintu belakang invarian #2)
//   4. Baris jurnal tak boleh menunjuk akun milik badan usaha lain
// ═════════════════════════════════════════════════════════════════════════════

// ── Diuji langsung ke schema `public`, BUKAN lewat rantai migrasi
//
// Membangun ulang rantai di schema test dicoba lebih dulu dan tak bisa:
// sebagian migrasi memverifikasi keadaan RLS/data yang menurut desain hanya
// benar di `public` (132 InitPlan, 137 pemilik grup), dan migrasi 049 (RLS
// awal, sudah di-contract migrasi 071) bentrok dengan yang menggantikannya.
//
// Pola ini sama dengan `trigger-yatim.test.ts`: yang diuji keadaan NYATA
// database yang dipakai. Untuk invarian buku besar itu justru lebih tepat —
// pertanyaannya bukan "apakah migrasi menghasilkan trigger yang benar"
// melainkan "apakah buku besar di database ini benar-benar terlindungi".
//
// Data uji dibersihkan sendiri (prefiks `[TEST]`/`gl-test`), dan seluruh
// company uji dihapus di `afterAll`.

let client: Client
let ctx: SeedProjectContext
let companyId: string
let akunKas: string
let akunBeban: string
let nomor = 0

/** Jurnal baru dalam keadaan draft. */
async function buatJurnal(keterangan = '[TEST] jurnal'): Promise<string> {
  nomor += 1
  const { rows } = await client.query(
    `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, created_by)
     VALUES ($1, $2, CURRENT_DATE, $3, $4) RETURNING id`,
    [companyId, `[TEST]-JV-${nomor}`, keterangan, ctx.adminId],
  )
  return rows[0].id
}

async function tambahBaris(entryId: string, accountId: string, debit: number, credit: number) {
  await client.query(
    `INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit)
     VALUES ($1, $2, $3, $4)`,
    [entryId, accountId, debit, credit],
  )
}

async function posting(entryId: string) {
  await client.query(
    `UPDATE journal_entries SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
    [entryId, ctx.adminId],
  )
}

beforeAll(async () => {
  // TANPA resetTestSchema/runMigrations — yang diuji `public`.
  client = await createTestClient()
  await client.query('SET search_path TO public')
  await client.query('SET client_min_messages TO WARNING')
  await bersihkan()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' ORDER BY u.created_at LIMIT 1`)
  ctx = { adminId: u[0].id } as SeedProjectContext

  const { rows: co } = await client.query(
    `INSERT INTO companies (code, name) VALUES ('gl-test', '[TEST] GL Co') RETURNING id`)
  companyId = co[0].id

  const akun = async (code: string, name: string, type: string) => {
    const { rows } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, code, name, type, ctx.adminId])
    return rows[0].id
  }
  akunKas = await akun('1111', 'Kas Kantor', 'asset')
  akunBeban = await akun('5110', 'Biaya Upah', 'expense')
})

/** Buang seluruh jejak uji — dijalankan sebelum DAN sesudah. */
async function bersihkan() {
  // Jurnal POSTED tak bisa dihapus barisnya — itu invarian yang diuji file ini
  // sendiri (migrasi 168). Pembersih menghormatinya: turunkan status ke 'void'
  // dulu, yang memang satu-satunya perubahan sah pada jurnal posted.
  //
  // Mematikan trigger-nya akan lebih mudah dan justru salah: pembersih yang
  // menyiasati penjaga melatih kebiasaan mematikannya di tempat lain.
  await client.query(
    `UPDATE journal_entries SET status='void' WHERE entry_number LIKE '[TEST]%' AND status='posted'`)
  await client.query(
    `DELETE FROM journal_entry_lines WHERE entry_id IN
       (SELECT id FROM journal_entries WHERE entry_number LIKE '[TEST]%')`)
  await client.query(`DELETE FROM journal_entries WHERE entry_number LIKE '[TEST]%'`)
  await client.query(
    `DELETE FROM accounts WHERE company_id IN (SELECT id FROM companies WHERE code LIKE 'gl-test%')`)
  await client.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
  await client.query(`DELETE FROM companies WHERE code LIKE 'gl-test%'`)
  await client.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
}

afterAll(async () => {
  await bersihkan().catch(() => {})
  await closeTestClient(client)
})

describe('GL · invarian 1 — jurnal posted wajib seimbang', () => {
  it('jurnal seimbang BISA di-posting', async () => {
    const j = await buatJurnal()
    await tambahBaris(j, akunBeban, 1_000_000, 0)
    await tambahBaris(j, akunKas, 0, 1_000_000)

    await posting(j)

    const { rows } = await client.query('SELECT status FROM journal_entries WHERE id=$1', [j])
    expect(rows[0].status).toBe('posted')
  })

  it('jurnal TAK seimbang DITOLAK saat posting', async () => {
    // Tanpa ini, neraca berhenti berarti: aktiva tak lagi sama dengan
    // pasiva, dan tak ada satu tempat pun yang memberi tahu.
    const j = await buatJurnal()
    await tambahBaris(j, akunBeban, 1_000_000, 0)
    await tambahBaris(j, akunKas, 0, 900_000)   // selisih 100rb

    await expect(
      posting(j),
      'jurnal tak seimbang bisa di-posting — neraca berhenti berarti',
    ).rejects.toThrow(/tak seimbang/i)
  })

  it('jurnal berbaris SATU ditolak — double-entry butuh minimal dua', async () => {
    // Jurnal satu baris "berhasil" muncul di daftar dan terlihat sah, padahal
    // secara akuntansi tak bermakna apa pun.
    const j = await buatJurnal()
    await tambahBaris(j, akunKas, 500_000, 0)

    await expect(posting(j)).rejects.toThrow(/minimal 2|hanya 1 baris/i)
  })

  it('jurnal TANPA baris ditolak', async () => {
    const j = await buatJurnal('[TEST] jurnal kosong')
    await expect(
      posting(j),
      'jurnal kosong bisa di-posting — muncul di buku besar tanpa isi',
    ).rejects.toThrow(/minimal 2|hanya 0 baris/i)
  })

  it('DRAFT boleh tak seimbang — jurnal dibangun bertahap', async () => {
    // Sisi sebaliknya: penjaga yang menuntut seimbang sejak baris pertama
    // membuat jurnal mustahil dibuat sama sekali.
    const j = await buatJurnal()
    await tambahBaris(j, akunBeban, 750_000, 0)

    const { rows } = await client.query('SELECT status FROM journal_entries WHERE id=$1', [j])
    expect(rows[0].status, 'draft ikut ditolak — jurnal tak bisa dibangun bertahap').toBe('draft')
  })
})

describe('GL · invarian 2 — jurnal posted tak bisa diubah', () => {
  async function jurnalPosted(): Promise<string> {
    const j = await buatJurnal()
    await tambahBaris(j, akunBeban, 2_000_000, 0)
    await tambahBaris(j, akunKas, 0, 2_000_000)
    await posting(j)
    return j
  }

  it('mengubah tanggal jurnal posted DITOLAK', async () => {
    const j = await jurnalPosted()
    await expect(
      client.query(`UPDATE journal_entries SET entry_date='2000-01-01' WHERE id=$1`, [j]),
      'tanggal jurnal posted bisa digeser — laporan periode ikut salah',
    ).rejects.toThrow(/sudah di-posting/i)
  })

  it('mengubah keterangan jurnal posted DITOLAK', async () => {
    const j = await jurnalPosted()
    await expect(
      client.query(`UPDATE journal_entries SET description='diubah' WHERE id=$1`, [j]),
    ).rejects.toThrow(/sudah di-posting/i)
  })

  it('membatalkan (void) TETAP boleh — pembatalan itu tercatat', async () => {
    // Yang dilarang menyunting diam-diam, bukan membatalkan secara resmi.
    const j = await jurnalPosted()
    await client.query(`UPDATE journal_entries SET status='void' WHERE id=$1`, [j])

    const { rows } = await client.query('SELECT status FROM journal_entries WHERE id=$1', [j])
    expect(rows[0].status).toBe('void')
  })

  it('mengubah BARIS jurnal posted DITOLAK — pintu belakang tertutup', async () => {
    // Tanpa penjaga ini, kepala jurnal terkunci tapi angkanya bisa diganti —
    // buku besar berubah tanpa satu pun perubahan pada kepalanya.
    const j = await jurnalPosted()
    await expect(
      client.query(`UPDATE journal_entry_lines SET debit=9999999 WHERE entry_id=$1 AND debit>0`, [j]),
      'baris jurnal posted bisa diubah — angka buku besar berubah diam-diam',
    ).rejects.toThrow(/sudah di-posting/i)
  })

  it('MENGHAPUS baris jurnal posted DITOLAK', async () => {
    const j = await jurnalPosted()
    await expect(
      client.query(`DELETE FROM journal_entry_lines WHERE entry_id=$1`, [j]),
    ).rejects.toThrow(/sudah di-posting/i)
  })

  it('baris jurnal DRAFT tetap bisa disunting', async () => {
    const j = await buatJurnal()
    await tambahBaris(j, akunBeban, 100_000, 0)
    await client.query(
      `UPDATE journal_entry_lines SET debit=200000 WHERE entry_id=$1`, [j])

    const { rows } = await client.query(
      'SELECT debit::float8 d FROM journal_entry_lines WHERE entry_id=$1', [j])
    expect(rows[0].d, 'draft ikut terkunci — jurnal tak bisa dikoreksi sebelum posting').toBe(200000)
  })
})

describe('GL · invarian 3 — akun milik badan usaha lain', () => {
  it('baris jurnal TAK BISA menunjuk akun tenant lain', async () => {
    // Celah yang tak bisa dinyatakan FK: tenancy kepala jurnal benar, tapi
    // angkanya masuk ke bagan akun badan usaha lain.
    const { rows: co2 } = await client.query(
      `INSERT INTO companies (code, name) VALUES ('gl-test-b', '[TEST] GL Co B') RETURNING id`)
    const { rows: ak2 } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type, created_by)
       VALUES ($1, '1111', 'Kas Tenant B', 'asset', $2) RETURNING id`,
      [co2[0].id, ctx.adminId])

    const j = await buatJurnal()
    await expect(
      tambahBaris(j, ak2[0].id, 500_000, 0),
      'jurnal tenant A bisa memakai akun tenant B — angka masuk ke bagan akun orang lain',
    ).rejects.toThrow(/badan usaha lain/i)
  })
})

describe('GL · bentuk baris', () => {
  it('baris dengan debit DAN kredit sekaligus ditolak', async () => {
    const j = await buatJurnal()
    await expect(
      tambahBaris(j, akunKas, 100_000, 100_000),
    ).rejects.toThrow(/jel_debit_xor_credit|violates check/i)
  })

  it('baris NOL (debit=0 dan kredit=0) ditolak', async () => {
    const j = await buatJurnal()
    await expect(tambahBaris(j, akunKas, 0, 0)).rejects.toThrow(/jel_debit_xor_credit|violates check/i)
  })

  it('nilai negatif ditolak', async () => {
    const j = await buatJurnal()
    await expect(tambahBaris(j, akunKas, -100, 0)).rejects.toThrow(/violates check/i)
  })
})

describe('GL · Chart of Accounts', () => {
  it('kode akun unik PER company, bukan global', async () => {
    // Dua badan usaha boleh sama-sama punya '1111 Kas Kantor'. Kalau unik
    // global, badan usaha kedua tak bisa memakai bagan akun standar.
    const { rows: co3 } = await client.query(
      `INSERT INTO companies (code, name) VALUES ('gl-test-c', '[TEST] GL Co C') RETURNING id`)

    await expect(
      client.query(
        `INSERT INTO accounts (company_id, code, name, type, created_by)
         VALUES ($1, '1111', 'Kas Kantor', 'asset', $2)`,
        [co3[0].id, ctx.adminId]),
    ).resolves.toBeTruthy()
  })

  it('kode akun ganda DALAM company yang sama ditolak', async () => {
    await expect(
      client.query(
        `INSERT INTO accounts (company_id, code, name, type, created_by)
         VALUES ($1, '1111', 'Kas Duplikat', 'asset', $2)`,
        [companyId, ctx.adminId]),
    ).rejects.toThrow(/accounts_code_unik_per_company|duplicate key/i)
  })

  it('tipe akun di luar daftar ditolak', async () => {
    await expect(
      client.query(
        `INSERT INTO accounts (company_id, code, name, type, created_by)
         VALUES ($1, '9999', 'Akun Aneh', 'entah', $2)`,
        [companyId, ctx.adminId]),
    ).rejects.toThrow(/violates check/i)
  })
})
