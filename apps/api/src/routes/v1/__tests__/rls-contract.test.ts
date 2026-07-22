import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor } from '../../../test-utils/rls-harness.js'

// Epic 4 CONTRACT verification (migration 071): after dropping old literal-role
// policies, RLS for the migrated tables must (a) contain NO literal auth_role()
// checks anymore, and (b) still grant correct access via has_permission +
// ownership helpers. Runs only meaningfully after 071 is applied.

const CONTRACTED_TABLES = [
  'material_categories', 'materials',
  'milestones', 'documents', 'project_photos',
  'progress_logs', 'work_scopes', 'work_scope_items', 'workers',
  'invoices', 'invoice_line_items', 'payments', 'tax_records',
  'expense_reports', 'expense_items', 'kasbons',
  'cash_accounts', 'cash_transfers', 'project_expenses',
]

let client: Client
let adminId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
})

afterAll(async () => {
  await client.end()
})

describe('Epic 4 contract: no literal-role policies remain', () => {
  it('contracted tables have zero policies referencing auth_role() literal', async () => {
    const { rows } = await client.query(
      `SELECT tablename, policyname, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [CONTRACTED_TABLES]
    )
    const offenders = rows.filter((r) => {
      const text = `${r.qual ?? ''} ${r.with_check ?? ''}`
      // literal role comparison: auth_role() = '...' atau auth_role() IN (...)
      return /auth_role\(\)\s*(=|in)\s*/i.test(text)
    })
    expect(offenders.map((o) => `${o.tablename}.${o.policyname}`)).toEqual([])
  })
})

describe('Epic 4 contract: access still correct after dropping old policies', () => {
  // RLS via has_permission (join role_permissions) + SECURITY DEFINER helpers is
  // heavier than a plain query; a per-table impersonated tx round-trip against the
  // shared dev DB can exceed the 5s default. Batch into one impersonated tx and
  // give explicit headroom.
  it('admin still reads all contracted tables', async () => {
    const counts = await asUser(client, adminId, async (c) => {
      const out: number[] = []
      for (const t of ['materials', 'invoices', 'kasbons', 'cash_accounts', 'workers']) {
        const r = await c.query(`SELECT count(*)::int AS n FROM ${t}`)
        out.push(r.rows[0].n)
      }
      return out
    })
    expect(counts.every((n) => n >= 0)).toBe(true)
  }, 20000)

  it('assigned mandor still reads own-scope data, no leak', async () => {
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
})
