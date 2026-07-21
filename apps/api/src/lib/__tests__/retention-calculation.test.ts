import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, ensureTestSchema, closeTestClient } from '../../test-utils/test-db'
import {
  setupRetentionProbeTable,
  teardownRetentionProbeTable,
  insertRetentionProbe,
} from '../retention-calculation'

// Task 1.2.4 — integration test (BUKAN unit test), karena logic retensi ada
// di trigger database, bukan TypeScript. Test case wajib per
// Phase1/06-test-strategy.md § Unit Test poin 4: "berbagai retention_pct".

describe('retention calculation (trigger database, via probe table di schema test)', () => {
  let client: Client

  beforeAll(async () => {
    await ensureTestSchema()
    client = await createTestClient()
    await setupRetentionProbeTable(client)
  })

  afterAll(async () => {
    await teardownRetentionProbeTable(client)
    await closeTestClient(client)
  })

  it('retention_pct default (5%) — trigger menghitung otomatis saat insert', async () => {
    const row = await insertRetentionProbe(client, 1000000, 5)
    expect(Number(row.retention_amount)).toBe(50000)
  })

  it('retention_pct 10% — proporsional terhadap contract_value', async () => {
    const row = await insertRetentionProbe(client, 2000000, 10)
    expect(Number(row.retention_amount)).toBe(200000)
  })

  it('retention_pct 0% — retention_amount = 0, bukan error', async () => {
    const row = await insertRetentionProbe(client, 5000000, 0)
    expect(Number(row.retention_amount)).toBe(0)
  })

  it('retention_pct 100% — retention_amount = contract_value penuh', async () => {
    const row = await insertRetentionProbe(client, 750000, 100)
    expect(Number(row.retention_amount)).toBe(750000)
  })

  it('membulatkan ke 2 desimal (ROUND di trigger, bukan truncate)', async () => {
    const row = await insertRetentionProbe(client, 333333.33, 5)
    // 333333.33 * 5 / 100 = 16666.6665 -> ROUND ke 16666.67 (bukan 16666.66)
    expect(Number(row.retention_amount)).toBe(16666.67)
  })

  it('trigger re-fire saat UPDATE contract_value — retention_amount ikut ter-update', async () => {
    const row = await insertRetentionProbe(client, 1000000, 5)
    const { rows: updated } = await client.query(
      'UPDATE projects_retention_probe SET contract_value = $1 WHERE id = $2 RETURNING *',
      [2000000, row.id]
    )
    expect(Number(updated[0].retention_amount)).toBe(100000)
  })

  it('UPDATE contract_value ke nilai yang sama — trigger tetap fire (kolom termasuk watch list), hasil tidak berubah', async () => {
    const row = await insertRetentionProbe(client, 1000000, 5)
    const { rows: unchanged } = await client.query(
      'UPDATE projects_retention_probe SET contract_value = contract_value WHERE id = $1 RETURNING *',
      [row.id]
    )
    expect(Number(unchanged[0].retention_amount)).toBe(50000)
  })
})
