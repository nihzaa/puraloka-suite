import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest } from 'fastify'

// Sub-Fase 1C — generic dual-write + reconcile (dipakai kasbon & change_order).
// Supabase di-mock; menguji payload upsert + logika deteksi divergensi generik.

const upsertMock = vi.fn(async (_p: Record<string, unknown>) => ({ error: null as { message: string } | null }))
const srcData: { value: Array<Record<string, unknown>>; error: { message: string } | null } = { value: [], error: null }
const instData: { value: Array<{ entity_id: string; current_state: string }>; error: { message: string } | null } = { value: [], error: null }

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: upsertMock,
      select: (_cols: string) => {
        if (table === 'workflow_instances') {
          return { eq: (_c: string, _v: string) => Promise.resolve({ data: instData.value, error: instData.error }) }
        }
        return Promise.resolve({ data: srcData.value, error: srcData.error })
      },
    }),
  },
}))

const { syncWorkflowInstance, reconcileWorkflow } = await import('../workflow-sync.js')

const REQ_UUID = 'f415a0b6-4fe0-41c0-8290-0944b1e880ae'
function req(id: string | undefined = REQ_UUID): FastifyRequest {
  return { id, log: { error: vi.fn() } } as unknown as FastifyRequest
}

beforeEach(() => {
  upsertMock.mockClear(); upsertMock.mockResolvedValue({ error: null })
  srcData.value = []; srcData.error = null
  instData.value = []; instData.error = null
})

describe('syncWorkflowInstance (generik)', () => {
  it('upsert payload benar + onConflict entity key', async () => {
    await syncWorkflowInstance(req(), { workflowKey: 'change_order_approval', entityType: 'change_order', entityId: 'co-1', state: 'submitted' })
    expect(upsertMock).toHaveBeenCalledTimes(1)
    const [payload, opts] = upsertMock.mock.calls[0] as unknown as [Record<string, unknown>, { onConflict: string }]
    expect(payload).toMatchObject({
      workflow_key: 'change_order_approval', entity_type: 'change_order',
      entity_id: 'co-1', current_state: 'submitted', correlation_id: REQ_UUID,
    })
    expect(opts).toEqual({ onConflict: 'entity_type,entity_id' })
  })

  it('correlation_id null bila request.id bukan UUID (guard)', async () => {
    await syncWorkflowInstance(req('proxy-abc'), { workflowKey: 'k', entityType: 'e', entityId: '1', state: 's' })
    expect((upsertMock.mock.calls[0][0] as Record<string, unknown>).correlation_id).toBeNull()
  })

  it('upsert error → tidak throw, log keras', async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: 'db down' } })
    const r = req()
    await expect(syncWorkflowInstance(r, { workflowKey: 'k', entityType: 'e', entityId: '1', state: 's' })).resolves.toBeUndefined()
    expect(r.log.error).toHaveBeenCalled()
  })
})

describe('reconcileWorkflow (generik)', () => {
  it('ok=true bila semua cocok', async () => {
    srcData.value = [{ id: 'a', status: 'draft' }, { id: 'b', status: 'approved' }]
    instData.value = [{ entity_id: 'a', current_state: 'draft' }, { entity_id: 'b', current_state: 'approved' }]
    const r = await reconcileWorkflow({ entityType: 'change_order', table: 'change_orders' })
    expect(r.ok).toBe(true); expect(r.matched).toBe(2); expect(r.total).toBe(2)
  })

  it('deteksi missing_instance', async () => {
    srcData.value = [{ id: 'a', status: 'draft' }]
    const r = await reconcileWorkflow({ entityType: 'change_order', table: 'change_orders' })
    expect(r.ok).toBe(false)
    expect(r.mismatches[0]).toMatchObject({ entityId: 'a', problem: 'missing_instance', workflowState: null })
  })

  it('deteksi state_mismatch', async () => {
    srcData.value = [{ id: 'a', status: 'approved' }]
    instData.value = [{ entity_id: 'a', current_state: 'submitted' }]
    const r = await reconcileWorkflow({ entityType: 'change_order', table: 'change_orders' })
    expect(r.mismatches[0]).toMatchObject({ entityId: 'a', sourceStatus: 'approved', workflowState: 'submitted', problem: 'state_mismatch' })
  })

  it('kolom kustom (idColumn/statusColumn) dihormati', async () => {
    srcData.value = [{ co_id: 'x', co_status: 'draft' }]
    instData.value = [{ entity_id: 'x', current_state: 'draft' }]
    const r = await reconcileWorkflow({ entityType: 'co', table: 't', idColumn: 'co_id', statusColumn: 'co_status' })
    expect(r.ok).toBe(true)
  })

  it('throw bila baca tabel sumber gagal (bukan ok palsu)', async () => {
    srcData.error = { message: 'boom' }
    await expect(reconcileWorkflow({ entityType: 'change_order', table: 'change_orders' })).rejects.toThrow(/change_orders/)
  })
})
