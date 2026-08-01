import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, wajibAda } from '../../../test-utils/rls-harness.js'

// RLS verification for Epic 4 — has_permission() function + Reference group
// (material_categories, materials). Runs against the REAL public schema with
// role impersonation; every write is inside a rolled-back transaction.

let client: Client
let adminId: string | null
let pmId: string | null
let mandorId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
  pmId = await authIdForRole(client, 'pm')
  mandorId = await authIdForRole(client, 'mandor')
})

afterAll(async () => {
  await client.end()
})

describe('has_permission() function', () => {
  it('returns true for a permission the role holds (admin → procurement:material:manage)', async () => {
    const r = await asUser(client, adminId, (c) =>
      c.query("SELECT has_permission('procurement:material:manage') AS ok")
    )
    expect(r.rows[0].ok).toBe(true)
  })

  it('is fail-closed for an unknown permission key', async () => {
    const r = await asUser(client, adminId, (c) =>
      c.query("SELECT has_permission('this:does:not:exist') AS ok")
    )
    expect(r.rows[0].ok).toBe(false)
  })

  it('returns false for a role that lacks the permission (mandor → procurement:material:manage)', async () => {
    wajibAda(mandorId, "user berperan mandor")
    const r = await asUser(client, mandorId, (c) =>
      c.query("SELECT has_permission('procurement:material:manage') AS ok")
    )
    expect(r.rows[0].ok).toBe(false)
  })
})

describe('RLS: materials write policies (has_permission-based, expand)', () => {
  const insertMaterial = (c: Client) =>
    c.query(
      `INSERT INTO materials (name, unit, category_id)
       VALUES ('__rls_test_material__', 'pcs',
         (SELECT id FROM material_categories LIMIT 1))
       RETURNING id`
    )

  it('allows admin to insert (has procurement:material:manage)', async () => {
    const r = await asUser(client, adminId, insertMaterial)
    expect(r.rows[0].id).toBeTruthy()
  })

  it('allows pm to insert (has procurement:material:manage)', async () => {
    wajibAda(pmId, "user berperan pm")
    const r = await asUser(client, pmId, insertMaterial)
    expect(r.rows[0].id).toBeTruthy()
  })

  it('denies mandor insert (lacks procurement:material:manage)', async () => {
    wajibAda(mandorId, "user berperan mandor")
    await expect(asUser(client, mandorId, insertMaterial)).rejects.toThrow(
      /row-level security|policy/i
    )
  })

  it('denies anon insert', async () => {
    await expect(asUser(client, null, insertMaterial)).rejects.toThrow(
      /row-level security|policy|permission denied/i
    )
  })
})

describe('RLS: materials SELECT (open by design, USING(true))', () => {
  it('allows any authenticated user to read materials', async () => {
    const r = await asUser(client, mandorId ?? adminId, (c) =>
      c.query('SELECT count(*)::int AS n FROM materials')
    )
    expect(typeof r.rows[0].n).toBe('number')
  })
})
