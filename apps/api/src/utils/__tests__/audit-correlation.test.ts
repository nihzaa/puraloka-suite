import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest } from 'fastify'

// Sub-Fase 1D.2 — correlation_id diisi OTOMATIS dari request.id (Fastify genReqId).
// Supabase di-mock: yang diuji adalah PAYLOAD yang dikirim ke insert, bukan DB.

const insertMock = vi.fn(async () => ({ error: null }))
vi.mock('../supabase.js', () => ({
  supabase: { from: vi.fn(() => ({ insert: insertMock })) },
}))

const { logAuditEvent } = await import('../audit.js')

function req(id?: string): FastifyRequest {
  return {
    id,
    ip: '203.0.113.7',
    headers: { 'user-agent': 'vitest' },
    log: { error: () => {} },
  } as unknown as FastifyRequest
}

const entry = { tableName: 'kasbons', recordId: 'r1', action: 'kasbon.status', actorId: 'u1' }

beforeEach(() => insertMock.mockClear())

describe('logAuditEvent — correlation_id (1D.2)', () => {
  it('mengisi correlation_id dari request.id saat tidak diberikan eksplisit', async () => {
    await logAuditEvent(req('req-uuid-123'), entry)
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: 'req-uuid-123' })
  })

  it('correlationId eksplisit MENANG atas request.id', async () => {
    await logAuditEvent(req('req-uuid-123'), { ...entry, correlationId: 'explicit-xyz' })
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: 'explicit-xyz' })
  })

  it('null bila request.id tidak ada (bukan string "undefined")', async () => {
    await logAuditEvent(req(undefined), entry)
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: null })
  })

  it('tetap fire-and-forget: tidak throw walau insert gagal', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'boom' } } as never)
    await expect(logAuditEvent(req('x'), entry)).resolves.toBeUndefined()
  })
})
