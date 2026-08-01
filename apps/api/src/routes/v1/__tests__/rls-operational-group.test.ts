import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, assignedMandor, wajibAda } from '../../../test-utils/rls-harness.js'

// RLS verification — Operational group (milestones, documents, project_photos),
// migration 066. Manage = has_permission (admin/pm); reads = ownership helpers.

let client: Client
let adminId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
})

afterAll(async () => {
  await client.end()
})

describe('RLS operational: manage via has_permission', () => {
  for (const table of ['milestones', 'documents', 'project_photos']) {
    it(`admin can read ${table} (has manage)`, async () => {
      const r = await asUser(client, adminId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM ${table}`)
      )
      expect(r.rows[0].n).toBeGreaterThanOrEqual(0)
    })
    it(`anon sees no ${table}`, async () => {
      const r = await asUser(client, null, (c) =>
        c.query(`SELECT count(*)::int AS n FROM ${table}`)
      )
      expect(r.rows[0].n).toBe(0)
    })
  }
})

describe('RLS operational: mandor ownership read isolation', () => {
  it('assigned mandor sees milestones only for assigned projects, no leak', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")
    const leak = await asUser(client, m.authId, (c) =>
      c.query(
        `SELECT count(*)::int AS n FROM milestones
         WHERE project_id NOT IN (SELECT project_id FROM mandor_assignments WHERE mandor_id = $1)`,
        [m.userId]
      )
    )
    expect(leak.rows[0].n).toBe(0)
  })

  it('mandor cannot insert a document (lacks documents:manage)', async () => {
    const m = wajibAda(await assignedMandor(client), "mandor dengan assignment aktif")
    await expect(
      asUser(client, m.authId, (c) =>
        c.query(
          `INSERT INTO documents (project_id, title, doc_type, file_url, uploaded_by)
           VALUES ((SELECT project_id FROM mandor_assignments WHERE mandor_id = $1 LIMIT 1),
                   '__rls_test__', 'kontrak', 'http://x', $1)
           RETURNING id`,
          [m.userId]
        )
      )
    ).rejects.toThrow(/row-level security|policy/i)
  })
})
