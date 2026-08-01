import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor, wajibAda } from '../../../test-utils/rls-harness.js'

// RLS verification — Financial group (invoices, payments, tax_records, kasbons,
// cash_accounts, cash_transfers, expense_reports, project_expenses), migrations
// 069+070. Highest-risk group. EXPAND only — old policies still live (contract
// gated on maintenance-window + PITR).

const FINANCIAL_TABLES = [
  'invoices', 'payments', 'tax_records', 'kasbons',
  'cash_accounts', 'cash_transfers', 'expense_reports', 'project_expenses',
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

describe('RLS financial: query without recursion, all roles', () => {
  for (const table of FINANCIAL_TABLES) {
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

describe('RLS financial: manage capabilities are admin+pm scope (no leak to mandor)', () => {
  it('finance:manage and cash:manage are NOT held by mandor', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")
    const r = await asUser(client, m.authId, (c) =>
      c.query(
        "SELECT has_permission('finance:manage') AS fin, has_permission('cash:manage') AS cash"
      )
    )
    expect(r.rows[0].fin).toBe(false)
    expect(r.rows[0].cash).toBe(false)
  })
})

describe('RLS financial: mandor kasbon ownership isolation', () => {
  it('mandor sees kasbons only for own work scopes, no leak', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")
    const leak = await asUser(client, m.authId, (c) =>
      c.query(
        `SELECT count(*)::int AS n FROM kasbons
         WHERE work_scope_id IS NOT NULL
           AND work_scope_id NOT IN (
             SELECT ws.id FROM work_scopes ws
             JOIN mandor_assignments ma ON ws.assignment_id = ma.id
             WHERE ma.mandor_id = $1
           )`,
        [m.userId]
      )
    )
    expect(leak.rows[0].n).toBe(0)
  })
})
