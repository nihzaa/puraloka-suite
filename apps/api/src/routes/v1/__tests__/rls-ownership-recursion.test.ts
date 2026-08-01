import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor, wajibAda } from '../../../test-utils/rls-harness.js'

// Regression test for the RLS infinite-recursion bug (ADR-005, migration 065).
// projects_mandor_select <-> mandor_assignments_pm_select mutually subqueried
// each other's RLS-protected table. SECURITY DEFINER helpers break the cycle.
// This test would FAIL (recursion error) without migration 065.

let client: Client
let adminId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
})

afterAll(async () => {
  await client.end()
})

describe('RLS recursion is resolved (ADR-005)', () => {
  it('admin can query projects without recursion error', async () => {
    const r = await asUser(client, adminId, (c) => c.query('SELECT count(*)::int AS n FROM projects'))
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0)
  })

  it('admin can query mandor_assignments without recursion error', async () => {
    const r = await asUser(client, adminId, (c) => c.query('SELECT count(*)::int AS n FROM mandor_assignments'))
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0)
  })

  it('anon can query project-scoped tables without recursion error (returns 0 rows)', async () => {
    const r = await asUser(client, null, (c) => c.query('SELECT count(*)::int AS n FROM milestones'))
    expect(r.rows[0].n).toBe(0)
  })
})

describe('RLS ownership isolation via SECURITY DEFINER helpers', () => {
  it('assigned mandor sees exactly their assigned projects, no leak', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")

    const result = await asUser(client, m.authId, async (c) => {
      const visible = await c.query('SELECT count(*)::int AS n FROM projects')
      const leak = await c.query(
        `SELECT count(*)::int AS n FROM projects
         WHERE id NOT IN (SELECT project_id FROM mandor_assignments WHERE mandor_id = $1)`,
        [m.userId]
      )
      return { visible: visible.rows[0].n, leak: leak.rows[0].n }
    })

    expect(result.visible).toBe(m.assignedProjectCount)
    expect(result.leak).toBe(0) // no project outside assignment is visible
  })

  it('is_assigned_mandor() helper is true for own project, false for others', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")

    const r = await asUser(client, m.authId, (c) =>
      c.query(
        `SELECT
           is_assigned_mandor((SELECT project_id FROM mandor_assignments WHERE mandor_id = $1 LIMIT 1)) AS own,
           is_assigned_mandor((SELECT id FROM projects WHERE id NOT IN
             (SELECT project_id FROM mandor_assignments WHERE mandor_id = $1) LIMIT 1)) AS other`,
        [m.userId]
      )
    )
    expect(r.rows[0].own).toBe(true)
    expect(r.rows[0].other).toBe(false)
  })
})
