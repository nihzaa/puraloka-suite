import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor } from '../../../test-utils/rls-harness.js'

// RLS verification — Field ops group (progress_logs, work_scopes,
// work_scope_items, workers), migrations 067+068.

let client: Client
let adminId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
})

afterAll(async () => {
  await client.end()
})

describe('RLS field ops: query without recursion, all roles', () => {
  for (const table of ['progress_logs', 'work_scopes', 'work_scope_items', 'workers']) {
    it(`admin queries ${table} ok`, async () => {
      const r = await asUser(client, adminId, (c) => c.query(`SELECT count(*)::int AS n FROM ${table}`))
      expect(r.rows[0].n).toBeGreaterThanOrEqual(0)
    })
    it(`anon sees no ${table}`, async () => {
      const r = await asUser(client, null, (c) => c.query(`SELECT count(*)::int AS n FROM ${table}`))
      expect(r.rows[0].n).toBe(0)
    })
  }
})

describe('RLS field ops: progress:manage scope (admin+pm only, not mandor)', () => {
  it('progress:manage is NOT held by mandor (no manage leak)', async () => {
    const m = await assignedMandor(client)
    if (!m) return
    const r = await asUser(client, m.authId, (c) =>
      c.query("SELECT has_permission('progress:manage') AS ok")
    )
    expect(r.rows[0].ok).toBe(false)
  })
})

describe('RLS field ops: mandor ownership isolation', () => {
  it('mandor sees progress_logs only for assigned projects, no leak', async () => {
    const m = await assignedMandor(client)
    if (!m) return
    const leak = await asUser(client, m.authId, (c) =>
      c.query(
        `SELECT count(*)::int AS n FROM progress_logs
         WHERE project_id NOT IN (SELECT project_id FROM mandor_assignments WHERE mandor_id = $1)`,
        [m.userId]
      )
    )
    expect(leak.rows[0].n).toBe(0)
  })

  it('mandor sees work_scopes only for own assignments, no leak', async () => {
    const m = await assignedMandor(client)
    if (!m) return
    const leak = await asUser(client, m.authId, (c) =>
      c.query(
        `SELECT count(*)::int AS n FROM work_scopes
         WHERE assignment_id NOT IN (SELECT id FROM mandor_assignments WHERE mandor_id = $1)`,
        [m.userId]
      )
    )
    expect(leak.rows[0].n).toBe(0)
  })
})
