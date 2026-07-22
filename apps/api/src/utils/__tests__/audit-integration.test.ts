import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { FastifyRequest } from 'fastify'
import { logAuditEvent } from '../audit.js'

// Integration: logAuditEvent benar-benar menulis ke public.audit_logs dengan
// ip_address/user_agent/diff/severity terisi otomatis. Baris uji dibersihkan
// setelahnya (record_id acak unik → aman dihapus).

function pgClient() {
  return new Client({ connectionString: process.env.DIRECT_URL })
}

// Mock FastifyRequest minimal — hanya field yang dibaca logAuditEvent.
function mockRequest(): FastifyRequest {
  return {
    ip: '203.0.113.7',
    headers: { 'user-agent': 'vitest-audit-probe' },
    log: { error: () => {} },
  } as unknown as FastifyRequest
}

let lastRecordId: string | null = null

afterEach(async () => {
  if (!lastRecordId) return
  const c = pgClient()
  await c.connect()
  await c.query('DELETE FROM public.audit_logs WHERE record_id = $1', [lastRecordId])
  await c.end()
  lastRecordId = null
})

describe('logAuditEvent (integration)', () => {
  it('inserts a row with auto ip/user_agent, computed diff, and severity', async () => {
    const recordId = randomUUID()
    // actorId harus user nyata (audit_logs.user_id FK → users.id)
    const c0 = pgClient()
    await c0.connect()
    const actorId = (await c0.query("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows[0]?.id
    await c0.end()
    if (!actorId) return // dev seed tanpa admin — skip
    lastRecordId = recordId

    await logAuditEvent(mockRequest(), {
      tableName: 'kasbons',
      recordId,
      action: 'kasbon.status',
      actorId,
      oldValues: { status: 'pending' },
      newValues: { status: 'approved' },
      severity: 'critical',
      reason: 'probe',
    })

    const c = pgClient()
    await c.connect()
    const { rows } = await c.query(
      'SELECT * FROM public.audit_logs WHERE record_id = $1',
      [recordId]
    )
    await c.end()

    expect(rows.length).toBe(1)
    const row = rows[0]
    expect(row.action).toBe('kasbon.status')
    expect(row.severity).toBe('critical')
    expect(row.ip_address).toBe('203.0.113.7')
    expect(row.user_agent).toBe('vitest-audit-probe')
    expect(row.reason).toBe('probe')
    expect(row.diff).toEqual({ status: { from: 'pending', to: 'approved' } })
  })

  it('never throws even if actorId is not a valid FK (fire-and-forget)', async () => {
    const recordId = randomUUID()
    lastRecordId = recordId
    // user_id FK invalid → insert gagal di DB, tapi logAuditEvent MUST NOT throw.
    await expect(
      logAuditEvent(mockRequest(), {
        tableName: 'x',
        recordId,
        action: 'probe.fail',
        actorId: '00000000-0000-0000-0000-000000000000',
        severity: 'info',
      })
    ).resolves.toBeUndefined()
  })
})
