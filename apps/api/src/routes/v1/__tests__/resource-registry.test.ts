import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 1 — RBS / Resource Identity Registry (migration 103).
//
// Aggregate Root kedua, "shared kernel kedua terpenting setelah Cost Code"
// (`03b` §A.5). Terhadap Postgres NYATA di schema `test`, migration verbatim —
// `public`/dev tidak disentuh.
//
// Beda dari Cost Code yang diuji di sini (bukan disamakan buta):
//   · lifecycle 2 status active↔inactive (tak ada draft); reaktivasi diizinkan
//   · category WAJIB dari himpunan tetap Labor/Equipment/Material/Subcontract
// Sama: hard guard larangan hapus (riwayat lintas domain merujuknya).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string

async function newResource(code: string, category = 'labor'): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO resources (code, name, category, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
    [code, `Uji ${code}`, category, userId],
  )
  return rows[0].id
}

const setStatus = (id: string, status: string) =>
  client.query(`UPDATE resources SET status = $1 WHERE id = $2`, [status, id])

const readResource = async (id: string) => {
  const { rows } = await client.query(
    `SELECT status, category, deactivated_at FROM resources WHERE id = $1`, [id])
  return rows[0] as { status: string; category: string; deactivated_at: Date | null }
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, ['103_cecep_resource_registry.sql'])

  const { rows } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('rbs-uji@puraloka.test', 'Uji RBS', 'admin')
     RETURNING id`)
  userId = rows[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Resource — identitas lintas domain', () => {
  it('baris baru langsung AKTIF (tak ada draft), tanpa cap deaktivasi', async () => {
    const id = await newResource('RBS-001')
    const row = await readResource(id)
    expect(row.status, 'resource aktif sejak dibuat — RBS tak punya draft').toBe('active')
    expect(row.deactivated_at).toBeNull()
  }, 30_000)

  it('code UNIK — dua identitas dengan code sama ditolak', async () => {
    await newResource('RBS-DUP')
    await expect(newResource('RBS-DUP')).rejects.toThrow(/duplicate key|unique/i)
  }, 30_000)

  it('keempat kategori sah diterima', async () => {
    for (const cat of ['labor', 'equipment', 'material', 'subcontract']) {
      const id = await newResource(`RBS-CAT-${cat}`, cat)
      expect((await readResource(id)).category).toBe(cat)
    }
  }, 30_000)

  it('kategori di luar himpunan DITOLAK (bukan disimpan diam-diam)', async () => {
    await expect(newResource('RBS-BAD', 'tenaga_ahli'))
      .rejects.toThrow(/resources_category_check|violates check/i)
  }, 30_000)

  it('kategori WAJIB — resource tanpa kategori ditolak', async () => {
    await expect(
      client.query(`INSERT INTO resources (code, name) VALUES ('RBS-NOCAT', 'x')`),
    ).rejects.toThrow(/category|not-null|null value/i)
  }, 30_000)
})

describe('Lifecycle active ↔ inactive', () => {
  it('active → inactive: deactivated_at terisi otomatis', async () => {
    const id = await newResource('RBS-100')
    await setStatus(id, 'inactive')
    const row = await readResource(id)
    expect(row.status).toBe('inactive')
    expect(row.deactivated_at, 'event ResourceDeactivated harus tercap').not.toBeNull()
  }, 30_000)

  it('inactive → active (reaktivasi): jejak deaktivasi dihapus', async () => {
    // Prinsip founder (ADR-009, ditransfer dari Cost Code): dinonaktifkan = status
    // operasional, bukan hapus permanen. Reaktivasi TIDAK memaksa identitas baru —
    // identitas baru justru memecah No Data Duplication yang RBS jaga.
    const id = await newResource('RBS-101')
    await setStatus(id, 'inactive')
    expect((await readResource(id)).deactivated_at).not.toBeNull()

    await setStatus(id, 'active')
    const row = await readResource(id)
    expect(row.status).toBe('active')
    expect(row.deactivated_at, 'reaktivasi harus mengosongkan jejak deaktivasi').toBeNull()
  }, 30_000)

  it('siklus aktif→nonaktif→aktif berulang tidak merusak constraint', async () => {
    const id = await newResource('RBS-102')
    for (let i = 0; i < 3; i++) {
      await setStatus(id, 'inactive')
      await setStatus(id, 'active')
    }
    const row = await readResource(id)
    expect(row.status).toBe('active')
    expect(row.deactivated_at).toBeNull()
  }, 30_000)

  it('status di luar himpunan (mis. deprecated) DITOLAK — RBS bukan Cost Code', async () => {
    const id = await newResource('RBS-103')
    await expect(setStatus(id, 'deprecated'))
      .rejects.toThrow(/resources_status_check|violates check/i)
  }, 30_000)

  it('ubah deskriptif (nama) tidak menyentuh status/identitas', async () => {
    const id = await newResource('RBS-104')
    await setStatus(id, 'inactive')
    await client.query(`UPDATE resources SET name = 'Nama Revisi' WHERE id = $1`, [id])
    const { rows } = await client.query(`SELECT name, status FROM resources WHERE id = $1`, [id])
    expect(rows[0].name).toBe('Nama Revisi')
    expect(rows[0].status, 'status tak ikut berubah saat deskripsi berubah').toBe('inactive')
  }, 30_000)
})

describe('HARD GUARD: Resource tidak boleh dihapus', () => {
  it('DELETE satu baris DITOLAK dengan pesan yang menyebut jalan keluarnya', async () => {
    const id = await newResource('RBS-200')
    await expect(client.query(`DELETE FROM resources WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM resources WHERE id = $1`, [id])
    expect(rows[0].n).toBe(1)
  }, 30_000)

  it('DELETE massal (tanpa WHERE) juga DITOLAK', async () => {
    const before = await client.query(`SELECT COUNT(*)::int AS n FROM resources`)
    await expect(client.query(`DELETE FROM resources`)).rejects.toThrow(/tidak boleh dihapus/i)
    const after = await client.query(`SELECT COUNT(*)::int AS n FROM resources`)
    expect(after.rows[0].n).toBe(before.rows[0].n)
  }, 30_000)

  it('resource yang sudah inactive pun tetap tak boleh dihapus', async () => {
    const id = await newResource('RBS-201')
    await setStatus(id, 'inactive')
    await expect(client.query(`DELETE FROM resources WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('dua capability terdaftar: baca dan tulis dipisah', async () => {
    const { rows } = await client.query(
      `SELECT key FROM permissions WHERE key LIKE 'cecep:resource:%' ORDER BY key`)
    expect(rows.map(r => r.key)).toEqual(['cecep:resource:manage', 'cecep:resource:view'])
  }, 30_000)

  it('tulis hanya admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:resource:%'
       ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:resource:manage']).toEqual(['admin'])
    expect(byKey['cecep:resource:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
