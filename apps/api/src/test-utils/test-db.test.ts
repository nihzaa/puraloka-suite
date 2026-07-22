import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, assertTestIsolation, ensureTestSchema, closeTestClient, TEST_SCHEMA } from './test-db'

// Task 1.1.2 — verifikasi infrastruktur test database, BUKAN test bisnis.
// Membuktikan: schema test bisa dibuat, koneksi terkunci ke schema test,
// dan search_path tidak pernah mengarah ke public secara diam-diam.

describe('test database isolation (Task 1.1.2)', () => {
  let client: Client

  beforeAll(async () => {
    await ensureTestSchema()
    client = await createTestClient()
  })

  afterAll(async () => {
    await closeTestClient(client)
  })

  it('terkoneksi ke instance Postgres yang benar', async () => {
    const { rows } = await client.query('SELECT current_database()')
    expect(rows[0].current_database).toBe('postgres')
  })

  it('search_path terkunci ke schema test, bukan public', async () => {
    await expect(assertTestIsolation(client)).resolves.not.toThrow()
  })

  it('bisa membuat dan menghapus tabel di schema test tanpa menyentuh public', async () => {
    await client.query('CREATE TABLE IF NOT EXISTS _isolation_probe (id serial primary key)')
    const { rows: tableCheck } = await client.query(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = '_isolation_probe'`
    )
    expect(tableCheck.every((r) => r.table_schema === TEST_SCHEMA)).toBe(true)
    await client.query('DROP TABLE _isolation_probe')
  })
})
