// Dual-write & rekonsiliasi kasbon ↔ workflow_instances (Sub-Fase 1C, migrasi modul).
//
// STRATEGI (disetujui founder): DUAL-WRITE, expand-contract.
//   - `kasbons.status` TETAP sumber kebenaran (otoritatif).
//   - `workflow_instances` adalah BAYANGAN (shadow) — ditulis paralel, TIDAK PERNAH
//     menggagalkan operasi kasbon. Shadow yang bisa menjatuhkan primer bukan shadow.
//   - Perpindahan sumber kebenaran ke workflow_instances = fase CONTRACT = Red-Line
//     TERPISAH (DANGER GATE lagi), BUKAN kelanjutan otomatis file ini.
//
// Karena shadow best-effort, ia bisa menyimpang diam-diam → itulah kenapa ada
// reconcileKasbonWorkflow(): jaring pengaman yang mendeteksi divergensi.

import type { FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'
import { mapKasbonStatusToWorkflowState } from '../lib/kasbon-workflow.js'
import { asUuidOrNull } from './uuid.js'

const WORKFLOW_KEY = 'kasbon_approval'
const ENTITY_TYPE = 'kasbon'

/**
 * Tulis-bayangan state kasbon ke workflow_instances (upsert idempoten pada
 * (entity_type, entity_id)). Fire-and-forget: error di-log KERAS tapi tak di-throw.
 *
 * "Log keras" (bukan senyap) disengaja: dual-write yang gagal = risiko divergensi,
 * harus terlihat di log + tertangkap reconcileKasbonWorkflow(), bukan hilang.
 */
export async function syncKasbonWorkflowInstance(
  request: FastifyRequest,
  kasbonId: string,
  status: string,
): Promise<void> {
  let state: string
  try {
    state = mapKasbonStatusToWorkflowState(status)
  } catch (err) {
    // Fail-loud pada pemetaan — tapi tetap tidak menjatuhkan operasi kasbon.
    request.log.error({ err, kasbonId, status }, 'dual-write kasbon: status tak terpetakan (R7)')
    return
  }

  try {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('workflow_instances')
      .upsert({
        workflow_key: WORKFLOW_KEY,
        entity_type: ENTITY_TYPE,
        entity_id: kasbonId,
        current_state: state,
        entered_state_at: nowIso,
        // correlation_id kolom uuid — guard: null bila request.id bukan UUID valid.
        correlation_id: asUuidOrNull(request.id),
        updated_at: nowIso,
      }, { onConflict: 'entity_type,entity_id' })

    if (error) {
      request.log.error({ err: error, kasbonId, status, state },
        'dual-write kasbon: upsert workflow_instances GAGAL — potensi divergensi, cek reconcile')
    }
  } catch (err) {
    request.log.error({ err, kasbonId, status }, 'dual-write kasbon: exception saat upsert')
  }
}

export interface ReconcileRow {
  kasbonId: string
  kasbonStatus: string
  workflowState: string | null
  problem: 'missing_instance' | 'state_mismatch'
}

export interface ReconcileResult {
  totalKasbons: number
  totalInstances: number
  matched: number
  mismatches: ReconcileRow[]
  ok: boolean
}

/**
 * Deteksi divergensi kasbons.status ↔ workflow_instances.current_state.
 *
 * Menemukan: (1) kasbon TANPA workflow_instance (missing), (2) kasbon dengan
 * instance yang current_state-nya BEDA dari status (mismatch). `ok=true` hanya bila
 * setiap kasbon punya tepat satu instance dengan state cocok.
 *
 * Dipakai: test divergence-detection + bukti rekonsiliasi pasca-backfill +
 * monitoring berkala saat dual-write berjalan (bisa diwire ke endpoint admin/cron).
 */
export async function reconcileKasbonWorkflow(): Promise<ReconcileResult> {
  const [{ data: kasbons, error: kErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from('kasbons').select('id, status'),
    supabase.from('workflow_instances').select('entity_id, current_state').eq('entity_type', ENTITY_TYPE),
  ])

  if (kErr) throw new Error(`reconcile: gagal baca kasbons: ${kErr.message}`)
  if (iErr) throw new Error(`reconcile: gagal baca workflow_instances: ${iErr.message}`)

  const stateByEntity = new Map<string, string>()
  for (const row of instances ?? []) {
    stateByEntity.set(row.entity_id as string, row.current_state as string)
  }

  const mismatches: ReconcileRow[] = []
  let matched = 0

  for (const k of kasbons ?? []) {
    const id = k.id as string
    const status = k.status as string
    const state = stateByEntity.get(id)
    if (state === undefined) {
      mismatches.push({ kasbonId: id, kasbonStatus: status, workflowState: null, problem: 'missing_instance' })
    } else if (state !== status) {
      mismatches.push({ kasbonId: id, kasbonStatus: status, workflowState: state, problem: 'state_mismatch' })
    } else {
      matched++
    }
  }

  return {
    totalKasbons: (kasbons ?? []).length,
    totalInstances: (instances ?? []).length,
    matched,
    mismatches,
    ok: mismatches.length === 0,
  }
}
