import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor } from '../../../test-utils/rls-harness.js'

// Security regression for the 2 endpoints migrated off role-literal authorization
// (cash.ts GET /cash/accounts/:id, progress.ts DELETE /progress-logs/:logId).
// Guards the permission gate: if someone reverts to role-literal or removes the
// permission grants, these turn red. Verified via has_permission (the exact
// function requirePermission/hasPermission call), matching runtime authorization.

let client: Client
let adminId: string | null
let pmId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
  pmId = await authIdForRole(client, 'pm')
})

afterAll(async () => {
  await client.end()
})

describe('cash.ts GET /cash/accounts/:id — requirePermission(cash:view)', () => {
  it('admin has cash:view (gate allows)', async () => {
    const r = await asUser(client, adminId, (c) => c.query("SELECT has_permission('cash:view') AS ok"))
    expect(r.rows[0].ok).toBe(true)
  })
  it('mandor does NOT have cash:view (gate denies)', async () => {
    const m = await assignedMandor(client)
    if (!m) return
    const r = await asUser(client, m.authId, (c) => c.query("SELECT has_permission('cash:view') AS ok"))
    expect(r.rows[0].ok).toBe(false)
  })
})

describe('progress.ts DELETE /progress-logs/:logId — hasPermission(progress:manage) OR owner', () => {
  it('admin has progress:manage (gate allows)', async () => {
    const r = await asUser(client, adminId, (c) => c.query("SELECT has_permission('progress:manage') AS ok"))
    expect(r.rows[0].ok).toBe(true)
  })
  it('pm has progress:manage (gate allows)', async () => {
    if (!pmId) return
    const r = await asUser(client, pmId, (c) => c.query("SELECT has_permission('progress:manage') AS ok"))
    expect(r.rows[0].ok).toBe(true)
  })
  it('mandor does NOT have progress:manage (delete only via owner-path, not blanket)', async () => {
    const m = await assignedMandor(client)
    if (!m) return
    const r = await asUser(client, m.authId, (c) => c.query("SELECT has_permission('progress:manage') AS ok"))
    expect(r.rows[0].ok).toBe(false)
  })
})
