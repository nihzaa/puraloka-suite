import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest } from 'fastify'

// Sub-Fase 1C — dual-write shadow + rekonsiliasi. Supabase di-mock; yang diuji:
// (1) payload upsert per jalur status, (2) shadow tak pernah throw, (3) logika
// deteksi divergensi reconcile.

const upsertMock = vi.fn(async (_p: Record<string, unknown>) => ({ error: null as { message: string } | null }))

// reconcile membaca dua tabel; kita kontrol responsnya per test.
const kasbonsData: { value: Array<{ id: string; status: string }>; error: { message: string } | null } =
  { value: [], error: null }
const instancesData: { value: Array<{ entity_id: string; current_state: string }>; error: { message: string } | null } =
  { value: [], error: null }

vi.mock('../supabase.js', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: upsertMock,
      // reconcile: kasbons.select(...) → langsung resolve; instances.select(...).eq(...) → resolve
      select: (_cols: string) => {
        if (table === 'kasbons') {
          return Promise.resolve({ data: kasbonsData.value, error: kasbonsData.error })
        }
        // workflow_instances: select().eq() → thenable setelah eq
        return {
          eq: (_c: string, _v: string) =>
            Promise.resolve({ data: instancesData.value, error: instancesData.error }),
        }
      },
    }),
  },
}))

const { syncKasbonWorkflowInstance, reconcileKasbonWorkflow } = await import('../kasbon-workflow.js')

const REQ_UUID = 'f415a0b6-4fe0-41c0-8290-0944b1e880ae'
function req(id: string | undefined = REQ_UUID): FastifyRequest {
  return { id, log: { error: vi.fn() } } as unknown as FastifyRequest
}

beforeEach(() => {
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  kasbonsData.value = []; kasbonsData.error = null
  instancesData.value = []; instancesData.error = null
})

describe('syncKasbonWorkflowInstance — dual-write per jalur', () => {
  it.each([
    ['pending', 'pending'],
    ['approved', 'approved'],
    ['rejected', 'rejected'],
    ['settled', 'settled'],
  ])('status %s → upsert current_state=%s dengan kunci entity yang benar', async (status, state) => {
    await syncKasbonWorkflowInstance(req(), 'k-123', status)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    const [payload, opts] = upsertMock.mock.calls[0] as unknown as [Record<string, unknown>, { onConflict: string }]
    expect(payload).toMatchObject({
      workflow_key: 'kasbon_approval',
      entity_type: 'kasbon',
      entity_id: 'k-123',
      current_state: state,
      correlation_id: REQ_UUID,
    })
    expect(opts).toEqual({ onConflict: 'entity_type,entity_id' })
  })

  it('status tak dikenal: TIDAK upsert, TIDAK throw (shadow tak jatuhkan primer), log keras', async () => {
    const r = req()
    await expect(syncKasbonWorkflowInstance(r, 'k-1', 'bogus')).resolves.toBeUndefined()
    expect(upsertMock).not.toHaveBeenCalled()
    expect(r.log.error).toHaveBeenCalled()
  })

  it('upsert error: tetap tidak throw, tapi log keras (risiko divergensi terlihat)', async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: 'db down' } })
    const r = req()
    await expect(syncKasbonWorkflowInstance(r, 'k-1', 'approved')).resolves.toBeUndefined()
    expect(r.log.error).toHaveBeenCalled()
  })

  it('correlation_id null bila request.id tak ada / bukan UUID (guard kolom uuid)', async () => {
    await syncKasbonWorkflowInstance({ id: undefined, log: { error: vi.fn() } } as unknown as FastifyRequest, 'k', 'pending')
    expect((upsertMock.mock.calls[0][0] as Record<string, unknown>).correlation_id).toBeNull()
    upsertMock.mockClear()
    await syncKasbonWorkflowInstance({ id: 'proxy-abc', log: { error: vi.fn() } } as unknown as FastifyRequest, 'k', 'pending')
    expect((upsertMock.mock.calls[0][0] as Record<string, unknown>).correlation_id).toBeNull()
  })
})

describe('reconcileKasbonWorkflow — deteksi divergensi', () => {
  it('ok=true bila setiap kasbon punya instance dengan state cocok', async () => {
    kasbonsData.value = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'approved' }]
    instancesData.value = [{ entity_id: 'a', current_state: 'pending' }, { entity_id: 'b', current_state: 'approved' }]
    const r = await reconcileKasbonWorkflow()
    expect(r.ok).toBe(true)
    expect(r.matched).toBe(2)
    expect(r.mismatches).toHaveLength(0)
  })

  it('mendeteksi kasbon TANPA instance (missing_instance)', async () => {
    kasbonsData.value = [{ id: 'a', status: 'pending' }]
    instancesData.value = []
    const r = await reconcileKasbonWorkflow()
    expect(r.ok).toBe(false)
    expect(r.mismatches[0]).toMatchObject({ kasbonId: 'a', problem: 'missing_instance', workflowState: null })
  })

  it('mendeteksi state MISMATCH (kasbon approved tapi instance masih pending)', async () => {
    kasbonsData.value = [{ id: 'a', status: 'approved' }]
    instancesData.value = [{ entity_id: 'a', current_state: 'pending' }]
    const r = await reconcileKasbonWorkflow()
    expect(r.ok).toBe(false)
    expect(r.mismatches[0]).toMatchObject({ kasbonId: 'a', kasbonStatus: 'approved', workflowState: 'pending', problem: 'state_mismatch' })
  })

  it('throw bila baca kasbons gagal (jangan lapor ok palsu)', async () => {
    kasbonsData.error = { message: 'boom' }
    await expect(reconcileKasbonWorkflow()).rejects.toThrow(/kasbons/)
  })
})
