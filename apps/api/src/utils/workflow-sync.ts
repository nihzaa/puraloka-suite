// Dual-write & rekonsiliasi GENERIK untuk workflow engine (Sub-Fase 1C).
//
// Diekstrak saat migrasi modul KEDUA (change_order) supaya pola dual-write dipakai
// bersama, BUKAN diduplikasi per modul. Ini sekaligus menjawab pertanyaan generalisasi
// engine: bila modul kedua jalan di infra yang SAMA tanpa mengubah engine, itu bukti
// pola menggeneralisasi (input untuk kriteria fase CONTRACT).
//
// Prinsip identik dgn kasbon: shadow (best-effort, tak jatuhkan primer, gagal di-LOG
// KERAS), correlation_id di-guard uuid, upsert idempoten pada (entity_type,entity_id).

import type { FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'
import { asUuidOrNull } from './uuid.js'

export interface SyncWorkflowParams {
  workflowKey: string
  entityType: string
  entityId: string
  state: string
}

/**
 * Tulis-bayangan state entity ke workflow_instances (upsert idempoten). Fire-and-forget:
 * gagal di-LOG KERAS tapi tak di-throw (shadow tak boleh menjatuhkan operasi primer).
 * correlation_id di-guard: non-UUID → null (kolom uuid tak boleh gagalkan write).
 */
export async function syncWorkflowInstance(
  request: FastifyRequest,
  { workflowKey, entityType, entityId, state }: SyncWorkflowParams,
): Promise<void> {
  try {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('workflow_instances')
      .upsert({
        workflow_key: workflowKey,
        entity_type: entityType,
        entity_id: entityId,
        current_state: state,
        entered_state_at: nowIso,
        correlation_id: asUuidOrNull(request.id),
        updated_at: nowIso,
      }, { onConflict: 'entity_type,entity_id' })

    if (error) {
      request.log.error({ err: error, entityType, entityId, state },
        'dual-write: upsert workflow_instances GAGAL — potensi divergensi, cek reconcile')
    }
  } catch (err) {
    request.log.error({ err, entityType, entityId, state }, 'dual-write: exception saat upsert')
  }
}

export interface ReconcileRow {
  entityId: string
  sourceStatus: string
  workflowState: string | null
  problem: 'missing_instance' | 'state_mismatch'
}

export interface ReconcileResult {
  total: number
  totalInstances: number
  matched: number
  mismatches: ReconcileRow[]
  ok: boolean
}

export interface ReconcileParams {
  entityType: string
  table: string
  idColumn?: string
  statusColumn?: string
}

/**
 * Deteksi divergensi status entity (tabel sumber) vs workflow_instances.current_state.
 * Generik: bekerja untuk entity apa pun yang punya kolom status. Menemukan
 * missing_instance + state_mismatch. `ok=true` hanya bila semua cocok.
 */
export async function reconcileWorkflow(
  { entityType, table, idColumn = 'id', statusColumn = 'status' }: ReconcileParams,
): Promise<ReconcileResult> {
  // Dynamic select column names → bypass supabase compile-time select parser via cast.
  const srcRes = await supabase.from(table).select(`${idColumn}, ${statusColumn}`) as unknown as {
    data: Record<string, unknown>[] | null; error: { message: string } | null
  }
  const instRes = await supabase
    .from('workflow_instances').select('entity_id, current_state').eq('entity_type', entityType)

  if (srcRes.error) throw new Error(`reconcile ${entityType}: gagal baca ${table}: ${srcRes.error.message}`)
  if (instRes.error) throw new Error(`reconcile ${entityType}: gagal baca workflow_instances: ${instRes.error.message}`)

  const rows = srcRes.data
  const instances = instRes.data

  const stateByEntity = new Map<string, string>()
  for (const inst of instances ?? []) {
    stateByEntity.set(inst.entity_id as string, inst.current_state as string)
  }

  const mismatches: ReconcileRow[] = []
  let matched = 0

  for (const row of rows ?? []) {
    const id = row[idColumn] as string
    const status = row[statusColumn] as string
    const state = stateByEntity.get(id)
    if (state === undefined) {
      mismatches.push({ entityId: id, sourceStatus: status, workflowState: null, problem: 'missing_instance' })
    } else if (state !== status) {
      mismatches.push({ entityId: id, sourceStatus: status, workflowState: state, problem: 'state_mismatch' })
    } else {
      matched++
    }
  }

  return {
    total: (rows ?? []).length,
    totalInstances: (instances ?? []).length,
    matched,
    mismatches,
    ok: mismatches.length === 0,
  }
}
