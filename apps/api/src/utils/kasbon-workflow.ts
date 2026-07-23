// Dual-write & rekonsiliasi kasbon ↔ workflow_instances (Sub-Fase 1C, migrasi modul).
//
// STRATEGI (disetujui founder): DUAL-WRITE, expand-contract.
//   - `kasbons.status` TETAP sumber kebenaran (otoritatif).
//   - `workflow_instances` adalah BAYANGAN (shadow) — tak pernah menjatuhkan operasi.
//   - Perpindahan sumber kebenaran = fase CONTRACT = Red-Line TERPISAH (DANGER GATE).
//
// Sejak migrasi modul kedua (change_order), mekanik dual-write+reconcile DIEKSTRAK ke
// utils/workflow-sync.ts (generik). File ini = adapter tipis kasbon: pemetaan status
// fail-loud + delegasi ke generik. Bukti pola menggeneralisasi (n=2, satu engine).

import type { FastifyRequest } from 'fastify'
import { mapKasbonStatusToWorkflowState } from '../lib/kasbon-workflow.js'
import { syncWorkflowInstance, reconcileWorkflow, type ReconcileResult } from './workflow-sync.js'

const WORKFLOW_KEY = 'kasbon_approval'
const ENTITY_TYPE = 'kasbon'

/**
 * Tulis-bayangan state kasbon. Fail-loud pemetaan (R7) ditangani di sini; sisanya
 * (upsert idempoten, guard correlation_id, log keras) didelegasikan ke generik.
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
    request.log.error({ err, kasbonId, status }, 'dual-write kasbon: status tak terpetakan (R7)')
    return
  }
  await syncWorkflowInstance(request, {
    workflowKey: WORKFLOW_KEY,
    entityType: ENTITY_TYPE,
    entityId: kasbonId,
    state,
  })
}

/** Deteksi divergensi kasbons.status ↔ workflow_instances.current_state. */
export function reconcileKasbonWorkflow(): Promise<ReconcileResult> {
  return reconcileWorkflow({ entityType: ENTITY_TYPE, table: 'kasbons' })
}
