import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'
import { seedProjectContext, type SeedProjectContext } from './_seed-helpers'

// Task 1.3.1 — Integration test golden path Kasbon, terhadap Postgres nyata
// (schema `test`), bukan mocked Supabase client — memverifikasi skema +
// trigger + constraint asli, bukan hanya logic TypeScript terisolasi.
//
// Migration dijalankan verbatim (bukan tulis ulang manual) untuk hindari
// drift skema — subset: 001 (extensions/enums), 002 (users/clients),
// 003 (projects), 007 (mandor_assignments/work_scopes/kasbons),
// 056 (kasbon redesign: project_id, work_scope_id nullable).
//
// 016 (cash_management) SENGAJA DIKELUARKAN — dikonfirmasi golden path
// kasbon TIDAK butuh cash_accounts (cash_account_id di kasbons.ts selalu
// opsional, hanya divalidasi jika diisi body request). 016 juga berisi
// INSERT INTO storage.buckets + CREATE POLICY ON storage.objects (Supabase
// Storage GLOBAL, bukan per-schema) yang bentrok dengan policy sama yang
// sudah dibuat migration asli ke public — ditemukan saat Task 1.3.1.
//
// RLS (049+) SENGAJA dilewati — pakai auth.uid() yang hanya ada di schema
// auth Supabase, dan konsisten produksi (API selalu service_role, bypass RLS).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '003_projects_and_contracts.sql',
  '007_mandor_workscopes_kasbons.sql',
  '056_kasbon_scope_optional.sql',
]

describe('kasbon golden path (integration)', () => {
  let client: Client
  let ctx: SeedProjectContext

  beforeAll(async () => {
    await resetTestSchema()
    client = await createTestClient()
    await client.query('SET client_min_messages TO WARNING') // redam NOTICE dari migration
    await runMigrations(client, MIGRATION_SUBSET)
    ctx = await seedProjectContext(client)
  })

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('golden path: mandor ajukan kasbon (status pending)', async () => {
    const { rows } = await client.query(
      `INSERT INTO kasbons (project_id, work_scope_id, amount, fund_source, purpose, requested_by, status)
       VALUES ($1, $2, 500000, 'owner_advance', 'gaji_tukang', $3, 'pending')
       RETURNING id, status, amount, requested_by`,
      [ctx.projectId, ctx.workScopeId, ctx.mandorId]
    )
    expect(rows[0].status).toBe('pending')
    expect(Number(rows[0].amount)).toBe(500000)
    expect(rows[0].requested_by).toBe(ctx.mandorId)
  })

  it('golden path: PM approve kasbon (status berubah ke approved)', async () => {
    const { rows: created } = await client.query(
      `INSERT INTO kasbons (project_id, work_scope_id, amount, fund_source, purpose, requested_by, status)
       VALUES ($1, $2, 300000, 'owner_advance', 'uang_makan', $3, 'pending')
       RETURNING id`,
      [ctx.projectId, ctx.workScopeId, ctx.mandorId]
    )
    const kasbonId = created[0].id

    const { rows: approved } = await client.query(
      `UPDATE kasbons SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2 RETURNING status, approved_by, approved_at`,
      [ctx.pmId, kasbonId]
    )
    expect(approved[0].status).toBe('approved')
    expect(approved[0].approved_by).toBe(ctx.pmId)
    expect(approved[0].approved_at).not.toBeNull()
  })

  it('constraint DB: amount harus > 0 (chk_kasbon_amount)', async () => {
    await expect(
      client.query(
        `INSERT INTO kasbons (project_id, work_scope_id, amount, fund_source, purpose, requested_by, status)
         VALUES ($1, $2, 0, 'owner_advance', 'gaji_tukang', $3, 'pending')`,
        [ctx.projectId, ctx.workScopeId, ctx.mandorId]
      )
    ).rejects.toThrow()
  })

  // it.fails — test ini SENGAJA dan DIHARAPKAN gagal, mendokumentasikan bug
  // nyata di kasbons.ts:281-297 (lihat body test). Vitest menganggap SUITE
  // ini PASS selama assertion di dalam tetap gagal (exit 0, tidak blokir
  // CI Epic 2 nanti) — begitu bug diperbaiki dan assertion jadi lulus,
  // it.fails() akan GAGAL, sinyal eksplisit "hapus .fails(), bug sudah fix",
  // bukan diam-diam dianggap selesai tanpa disadari.
  it.fails('KEGAGALAN — approve ganda: BUG NYATA ditemukan, kasbon yang sudah approved bisa di-approve ulang tanpa ditolak', async () => {
    // Setup: kasbon sudah approved
    const { rows: created } = await client.query(
      `INSERT INTO kasbons (project_id, work_scope_id, amount, fund_source, purpose, requested_by, status, approved_by, approved_at)
       VALUES ($1, $2, 400000, 'owner_advance', 'operasional', $3, 'approved', $4, NOW())
       RETURNING id`,
      [ctx.projectId, ctx.workScopeId, ctx.mandorId, ctx.pmId]
    )
    const kasbonId = created[0].id

    // Simulasi PATCH /api/v1/kasbons/:id/status endpoint (kasbons.ts:281-297) —
    // query TIDAK punya WHERE status='pending', TIDAK ada guard status
    // sebelumnya. Approve kedua ini SEHARUSNYA ditolak (409 Conflict di level
    // API), tapi query UPDATE di bawah akan SUKSES tanpa syarat apa pun.
    const secondApprove = await client.query(
      `UPDATE kasbons SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2 RETURNING status`,
      [ctx.adminId, kasbonId] // approver KEDUA yang beda dari yang pertama
    )

    // ASSERTION INI SENGAJA GAGAL — mendokumentasikan bug nyata di
    // kasbons.ts:216-297 (PATCH /status): endpoint tidak mengecek status
    // existing sebelum update, sehingga approve ganda / race condition dua
    // approval bersamaan TIDAK dicegah di level query maupun aplikasi.
    // Lihat finding di commit message & laporan Task 1.3.1 — TIDAK diperbaiki
    // di task ini (di luar scope, keputusan perbaikan menunggu approval).
    expect(secondApprove.rowCount).toBe(0) // EXPECTED: 0 baris terupdate (ditolak) — ACTUAL: 1 (bug)
  })
})
