import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 1 — Cost Code Registry (migration 102).
//
// Dijalankan terhadap Postgres NYATA di schema `test` (migration dieksekusi
// verbatim, bukan skema yang ditulis ulang) — schema `public`/dev TIDAK disentuh.
//
// Yang dikunci di sini adalah dua HARD GUARD di DB, bukan sopan santun aplikasi:
//   1. Baris Cost Code TIDAK BOLEH dihapus (`03b` §A.3: "tidak dihapus, riwayat
//      historis tetap merujuknya"). Satu DELETE lewat SQL/tooling memutus jejak
//      RAB→Procurement→Progress→EVM tanpa cara memulihkannya.
//   2. Transisi lifecycle satu arah (draft→active→deprecated).
//
// Keduanya ditegakkan trigger, jadi diuji lewat SQL langsung — bukan lewat API,
// karena justru jalur non-API yang mau dijamin aman.

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string

/** Cost code baru berstatus draft; mengembalikan id. */
async function newCode(code: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [code, `Uji ${code}`, userId],
  )
  return rows[0].id
}

const setStatus = (id: string, status: string) =>
  client.query(`UPDATE cost_codes SET status = $1 WHERE id = $2`, [status, id])

const readCode = async (id: string) => {
  const { rows } = await client.query(
    `SELECT status, activated_at, deprecated_at FROM cost_codes WHERE id = $1`, [id])
  return rows[0] as { status: string; activated_at: Date | null; deprecated_at: Date | null }
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)

  // Migration 102 memasang RLS policy yang memanggil has_permission() (unqualified).
  // Di-stub supaya CREATE POLICY resolve; query test memakai koneksi owner (RLS tak
  // di-FORCE) sehingga stub tak pernah dievaluasi — pola sama seperti test integrasi
  // lain di repo ini yang memang menguji constraint/trigger, bukan RLS.
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)

  await runMigrations(client, ['102_cecep_cost_code_registry.sql'])

  const { rows } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('cecep-uji@puraloka.test', 'Uji CECEP', 'admin')
     RETURNING id`)
  userId = rows[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Cost Code — identitas lintas domain', () => {
  it('baris baru berstatus draft, tanpa cap waktu event', async () => {
    const id = await newCode('CC-001')
    const row = await readCode(id)
    expect(row.status).toBe('draft')
    expect(row.activated_at).toBeNull()
    expect(row.deprecated_at).toBeNull()
  }, 30_000)

  it('code UNIK — dua identitas dengan code sama ditolak', async () => {
    await newCode('CC-DUP')
    await expect(newCode('CC-DUP')).rejects.toThrow(/duplicate key|unique/i)
  }, 30_000)

  it('status "active" TIDAK bisa disisipkan tanpa activated_at (cap waktu tak boleh bohong)', async () => {
    await expect(
      client.query(
        `INSERT INTO cost_codes (code, name, status) VALUES ('CC-BOHONG', 'x', 'active')`),
    ).rejects.toThrow(/cost_codes_status_timestamps/)
  }, 30_000)
})

describe('Lifecycle draft → active → deprecated', () => {
  it('draft → active: diizinkan, activated_at terisi otomatis', async () => {
    const id = await newCode('CC-100')
    await setStatus(id, 'active')
    const row = await readCode(id)
    expect(row.status).toBe('active')
    expect(row.activated_at, 'activated_at wajib terisi — event CostCodeActivated').not.toBeNull()
    expect(row.deprecated_at).toBeNull()
  }, 30_000)

  it('active → deprecated: diizinkan, deprecated_at terisi otomatis', async () => {
    const id = await newCode('CC-101')
    await setStatus(id, 'active')
    await setStatus(id, 'deprecated')
    const row = await readCode(id)
    expect(row.status).toBe('deprecated')
    expect(row.deprecated_at, 'deprecated_at wajib terisi — event CostCodeDeprecated').not.toBeNull()
  }, 30_000)

  it('draft → deprecated: diizinkan (draft salah ketik butuh jalan keluar, karena hapus dilarang)', async () => {
    const id = await newCode('CC-102')
    await setStatus(id, 'deprecated')
    const row = await readCode(id)
    expect(row.status).toBe('deprecated')
    expect(row.activated_at, 'tak pernah aktif → activated_at tetap kosong').toBeNull()
    expect(row.deprecated_at).not.toBeNull()
  }, 30_000)

  it('NEGATIF: active → draft DITOLAK (identitas terbit tak bisa jadi draft lagi)', async () => {
    const id = await newCode('CC-103')
    await setStatus(id, 'active')
    await expect(setStatus(id, 'draft')).rejects.toThrow(/tidak bisa kembali jadi draft/)
    expect((await readCode(id)).status, 'status tak boleh berubah setelah ditolak').toBe('active')
  }, 30_000)

  it('deprecated → active DIIZINKAN: activated_at di-refresh, deprecated_at dikosongkan', async () => {
    // Keputusan founder (ADR-009): dipensiunkan = status OPERASIONAL, bukan
    // penghapusan permanen. Kode yang dipensiunkan karena salah paham harus bisa
    // dipakai lagi TANPA membuat identitas baru — identitas baru justru memecah
    // traceability lintas 17 domain, hal yang Cost Code ada untuk mencegahnya.
    const id = await newCode('CC-104')
    await setStatus(id, 'active')
    await setStatus(id, 'deprecated')
    const pensiun = await readCode(id)
    expect(pensiun.deprecated_at).not.toBeNull()

    await setStatus(id, 'active')
    const hidup = await readCode(id)
    expect(hidup.status).toBe('active')
    expect(hidup.deprecated_at, 'jejak pensiun harus hilang saat aktif kembali').toBeNull()
    expect(hidup.activated_at, 'activated_at wajib di-refresh, bukan yang lama').not.toBeNull()
    expect(
      hidup.activated_at!.getTime(),
      'activated_at harus >= waktu pensiun sebelumnya (di-refresh, bukan disimpan)',
    ).toBeGreaterThanOrEqual(pensiun.deprecated_at!.getTime())
  }, 30_000)

  it('NEGATIF: deprecated → draft DITOLAK (identitas terbit tak bisa jadi draft lagi)', async () => {
    const id = await newCode('CC-106')
    await setStatus(id, 'deprecated')
    await expect(setStatus(id, 'draft')).rejects.toThrow(/tidak bisa kembali jadi draft/)
    expect((await readCode(id)).status).toBe('deprecated')
  }, 30_000)

  it('siklus penuh aktif→pensiun→aktif lagi bisa berulang tanpa merusak constraint', async () => {
    const id = await newCode('CC-107')
    for (let i = 0; i < 2; i++) {
      await setStatus(id, 'active')
      await setStatus(id, 'deprecated')
    }
    await setStatus(id, 'active')
    const row = await readCode(id)
    expect(row.status).toBe('active')
    expect(row.deprecated_at).toBeNull()
  }, 30_000)

  it('update non-status (mis. ganti nama) tidak terpengaruh guard transisi', async () => {
    const id = await newCode('CC-105')
    await setStatus(id, 'active')
    await client.query(`UPDATE cost_codes SET name = 'Nama Baru' WHERE id = $1`, [id])
    const { rows } = await client.query(`SELECT name, status FROM cost_codes WHERE id = $1`, [id])
    expect(rows[0].name).toBe('Nama Baru')
    expect(rows[0].status, 'identitas & status tak ikut berubah saat deskripsi berubah').toBe('active')
  }, 30_000)
})

describe('HARD GUARD: Cost Code tidak boleh dihapus', () => {
  it('DELETE satu baris DITOLAK dengan pesan yang menyebut jalan keluarnya', async () => {
    const id = await newCode('CC-200')
    await expect(client.query(`DELETE FROM cost_codes WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM cost_codes WHERE id = $1`, [id])
    expect(rows[0].n, 'baris harus masih ada').toBe(1)
  }, 30_000)

  it('DELETE massal (tanpa WHERE) juga DITOLAK — bukan cuma per baris', async () => {
    const before = await client.query(`SELECT COUNT(*)::int AS n FROM cost_codes`)
    await expect(client.query(`DELETE FROM cost_codes`)).rejects.toThrow(/tidak boleh dihapus/i)
    const after = await client.query(`SELECT COUNT(*)::int AS n FROM cost_codes`)
    expect(after.rows[0].n, 'nol baris boleh hilang').toBe(before.rows[0].n)
  }, 30_000)

  it('baris yang sudah deprecated pun tetap tidak boleh dihapus', async () => {
    const id = await newCode('CC-201')
    await setStatus(id, 'deprecated')
    await expect(client.query(`DELETE FROM cost_codes WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004) — bukan literal role', () => {
  it('dua capability terdaftar: baca dan tulis dipisah', async () => {
    const { rows } = await client.query(
      `SELECT key FROM permissions WHERE key LIKE 'cecep:cost_code:%' ORDER BY key`)
    expect(rows.map(r => r.key)).toEqual(['cecep:cost_code:manage', 'cecep:cost_code:view'])
  }, 30_000)

  it('tulis hanya admin; baca admin + pm (domain hilir hanya mereferensikan)', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:cost_code:%'
       ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:cost_code:manage']).toEqual(['admin'])
    expect(byKey['cecep:cost_code:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
