import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest } from 'fastify'

// Sub-Fase 1D.2 — correlation_id diisi OTOMATIS dari request.id (Fastify genReqId).
// Supabase di-mock: yang diuji adalah PAYLOAD yang dikirim ke insert, bukan DB.

// Parameter di-tipe eksplisit supaya `mock.calls[0][0]` valid secara tipe
// (tanpa ini, calls bertipe tuple kosong → TS2493).
const insertMock = vi.fn(async (_payload: Record<string, unknown>) => ({
  error: null as { message: string } | null,
}))
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

const REQ_UUID = 'f415a0b6-4fe0-41c0-8290-0944b1e880ae'
const EXPLICIT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('logAuditEvent — correlation_id (1D.2 + guard uuid)', () => {
  it('mengisi correlation_id dari request.id (UUID) saat tidak diberikan eksplisit', async () => {
    await logAuditEvent(req(REQ_UUID), entry)
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: REQ_UUID })
  })

  it('correlationId eksplisit (UUID) MENANG atas request.id', async () => {
    await logAuditEvent(req(REQ_UUID), { ...entry, correlationId: EXPLICIT_UUID })
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: EXPLICIT_UUID })
  })

  it('null bila request.id tidak ada (bukan string "undefined")', async () => {
    await logAuditEvent(req(undefined), entry)
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: null })
  })

  it('null bila request.id BUKAN UUID (mis. request-id header proxy) — audit tak boleh gagal', async () => {
    await logAuditEvent(req('proxy-request-id-123'), entry)
    expect(insertMock.mock.calls[0][0]).toMatchObject({ correlation_id: null })
  })

  it('tetap fire-and-forget: tidak throw walau insert gagal', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(logAuditEvent(req('x'), entry)).resolves.toBeUndefined()
  })
})
