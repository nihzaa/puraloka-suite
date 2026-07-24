import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient, runMigrations } from '../../../test-utils/test-db'

// CECEP Milestone 2 — Versioned Price Book (migration 104).
//
// Aggregate Root per entry (`44` §5, `03b` §A.6). Terhadap Postgres NYATA di
// schema `test`, migration verbatim — `public`/dev tidak disentuh.
//
// Invariant paling mahal kalau jebol: HARGA YANG SUDAH DI-VERIFY TAK BOLEH BERUBAH.
// Kalau bisa, Estimate Item lama diam-diam berubah nilainya (retroaktif) — persis
// hal yang Price Book ada untuk mencegahnya (`44` §5).

const MIGRATION_SUBSET = [
  '001_extensions_and_enums.sql',
  '002_users_and_clients.sql',
  '050_rbac_foundation.sql',
]

let client: Client
let userId: string
let resourceId: string

async function newEntry(over: Record<string, unknown> = {}): Promise<string> {
  const cols = {
    resource_id: resourceId, amount: 50000, currency: 'IDR', effective_date: '2026-01-01',
    location: 'Bandung', supplier: 'PT Uji', confidence_level: 'high', created_by: userId,
    ...over,
  }
  const keys = Object.keys(cols)
  const { rows } = await client.query(
    `INSERT INTO price_book_entries (${keys.join(',')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    keys.map(k => (cols as Record<string, unknown>)[k]),
  )
  return rows[0].id
}

const setStatus = (id: string, status: string, extra = '') =>
  client.query(`UPDATE price_book_entries SET status = $1 ${extra} WHERE id = $2`, [status, id])

/** Bawa entry ke 'verified' dengan jejak pengesahan lengkap. */
const verify = (id: string) =>
  client.query(
    `UPDATE price_book_entries SET status = 'verified', verified_by = $1 WHERE id = $2`,
    [userId, id])

const read = async (id: string) => {
  const { rows } = await client.query(
    `SELECT status, amount::float8 AS amount, verified_at FROM price_book_entries WHERE id = $1`, [id])
  return rows[0] as { status: string; amount: number; verified_at: Date | null }
}

beforeAll(async () => {
  await resetTestSchema()
  client = await createTestClient()
  await client.query('SET client_min_messages TO WARNING')
  await runMigrations(client, MIGRATION_SUBSET)
  await client.query(
    `CREATE OR REPLACE FUNCTION has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`)
  await runMigrations(client, ['103_cecep_resource_registry.sql', '104_cecep_price_book.sql'])

  const { rows: u } = await client.query(
    `INSERT INTO users (email, name, role) VALUES ('price-uji@puraloka.test', 'Uji Harga', 'admin') RETURNING id`)
  userId = u[0].id
  const { rows: r } = await client.query(
    `INSERT INTO resources (code, name, category, created_by) VALUES ('RBS-SEMEN', 'Semen', 'material', $1) RETURNING id`,
    [userId])
  resourceId = r[0].id
}, 90_000)

afterAll(async () => { await closeTestClient(client) })

describe('Price Book Entry — struktur & referensi', () => {
  it('entry baru berstatus draft', async () => {
    const id = await newEntry()
    expect((await read(id)).status).toBe('draft')
  }, 30_000)

  it('resource_id WAJIB referensi RBS yang ada (FK ditegakkan)', async () => {
    await expect(newEntry({ resource_id: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toThrow(/foreign key|violates/i)
  }, 30_000)

  it('confidence_level di luar High/Medium/Low ditolak', async () => {
    await expect(newEntry({ confidence_level: 'sangat_tinggi' }))
      .rejects.toThrow(/confidence_level|check/i)
  }, 30_000)

  it('amount negatif ditolak', async () => {
    await expect(newEntry({ amount: -1 })).rejects.toThrow(/amount|check/i)
  }, 30_000)

  it('expired_date sebelum effective_date ditolak', async () => {
    await expect(newEntry({ effective_date: '2026-06-01', expired_date: '2026-01-01' }))
      .rejects.toThrow(/date_range|check/i)
  }, 30_000)

  it('status "verified" tanpa verified_by/at ditolak (attestation tak boleh kosong)', async () => {
    await expect(newEntry({ status: 'verified' }))
      .rejects.toThrow(/verified_trace|check/i)
  }, 30_000)
})

describe('Lifecycle draft → verified → active → expired', () => {
  it('draft → verified: verified_at terisi otomatis', async () => {
    const id = await newEntry()
    await verify(id)
    const row = await read(id)
    expect(row.status).toBe('verified')
    expect(row.verified_at, 'event PriceBookEntryVerified harus tercap').not.toBeNull()
  }, 30_000)

  it('rantai penuh verified → active → expired jalan', async () => {
    const id = await newEntry()
    await verify(id)
    await setStatus(id, 'active')
    await setStatus(id, 'expired')
    expect((await read(id)).status).toBe('expired')
  }, 30_000)

  it('NEGATIF: draft → active (lompat verifikasi) ditolak', async () => {
    const id = await newEntry()
    await expect(setStatus(id, 'active', ', verified_by = null'))
      .rejects.toThrow(/tidak sah|verified_trace/)
  }, 30_000)

  it('NEGATIF: active → verified (mundur) ditolak', async () => {
    const id = await newEntry()
    await verify(id)
    await setStatus(id, 'active')
    await expect(setStatus(id, 'verified')).rejects.toThrow(/tidak sah/)
  }, 30_000)
})

describe('HARD GUARD: immutable begitu di-verify (anti perubahan retroaktif)', () => {
  it('mengubah amount SETELAH verified DITOLAK', async () => {
    const id = await newEntry({ amount: 50000 })
    await verify(id)
    await expect(client.query(`UPDATE price_book_entries SET amount = 99999 WHERE id = $1`, [id]))
      .rejects.toThrow(/tak bisa diubah|check_violation|Estimate Item/i)
    expect((await read(id)).amount, 'harga harus tetap').toBe(50000)
  }, 30_000)

  it('mengubah amount saat MASIH draft diperbolehkan', async () => {
    const id = await newEntry({ amount: 50000 })
    await client.query(`UPDATE price_book_entries SET amount = 60000 WHERE id = $1`, [id])
    expect((await read(id)).amount).toBe(60000)
  }, 30_000)

  it('harga baru = entry BARU (version berikutnya), bukan edit di tempat', async () => {
    const v1 = await newEntry({ amount: 50000, version_number: 1 })
    await verify(v1)
    const v2 = await newEntry({ amount: 55000, version_number: 2 })
    await verify(v2)
    const { rows } = await client.query(
      `SELECT version_number, amount::float8 AS amount FROM price_book_entries
        WHERE resource_id = $1 ORDER BY version_number`, [resourceId])
    // (baris lain dari test sebelumnya bisa ada; cek v1 & v2 hadir utuh)
    const byV = new Map(rows.map((r: {version_number:number;amount:number}) => [r.version_number, r.amount]))
    expect(byV.get(1)).toBe(50000)
    expect(byV.get(2)).toBe(55000)
  }, 30_000)
})

describe('HARD GUARD: entry non-draft tidak boleh dihapus', () => {
  it('DELETE entry verified DITOLAK', async () => {
    const id = await newEntry()
    await verify(id)
    await expect(client.query(`DELETE FROM price_book_entries WHERE id = $1`, [id]))
      .rejects.toThrow(/tidak boleh dihapus/i)
  }, 30_000)

  it('DELETE entry draft DIPERBOLEHKAN (belum pernah dirujuk)', async () => {
    const id = await newEntry()
    await client.query(`DELETE FROM price_book_entries WHERE id = $1`, [id])
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM price_book_entries WHERE id = $1`, [id])
    expect(rows[0].n).toBe(0)
  }, 30_000)
})

describe('Otorisasi capability (ADR-004)', () => {
  it('dua capability: baca & tulis dipisah', async () => {
    const { rows } = await client.query(
      `SELECT key FROM permissions WHERE key LIKE 'cecep:price:%' ORDER BY key`)
    expect(rows.map(r => r.key)).toEqual(['cecep:price:manage', 'cecep:price:view'])
  }, 30_000)

  it('tulis admin; baca admin + pm', async () => {
    const { rows } = await client.query(`
      SELECT p.key, r.name AS role FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key LIKE 'cecep:price:%' ORDER BY p.key, r.name`)
    const byKey = rows.reduce<Record<string, string[]>>((a, r) => {
      (a[r.key] ??= []).push(r.role); return a
    }, {})
    expect(byKey['cecep:price:manage']).toEqual(['admin'])
    expect(byKey['cecep:price:view']).toEqual(['admin', 'pm'])
  }, 30_000)
})
