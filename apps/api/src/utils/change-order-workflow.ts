// Dual-write & rekonsiliasi change_order ↔ workflow_instances (Sub-Fase 1C, modul kedua).
//
// Adapter tipis: pemetaan status fail-loud (R7) + delegasi ke utils/workflow-sync.ts
// (generik). change_orders.status TETAP otoritatif; workflow_instances = bayangan.
// Reuse infra kasbon (satu engine, n=2) — bukti pola menggeneralisasi.

import type { FastifyRequest } from 'fastify'
import { mapChangeOrderStatusToWorkflowState } from '../lib/change-order-workflow.js'
import { syncWorkflowInstance, reconcileWorkflow, type ReconcileResult } from './workflow-sync.js'

const WORKFLOW_KEY = 'change_order_approval'
const ENTITY_TYPE = 'change_order'

/** Tulis-bayangan state change_order. Fail-loud pemetaan; sisanya delegasi generik. */
export async function syncChangeOrderWorkflowInstance(
  request: FastifyRequest,
  changeOrderId: string,
  status: string,
): Promise<void> {
  let state: string
  try {
    state = mapChangeOrderStatusToWorkflowState(status)
  } catch (err) {
    request.log.error({ err, changeOrderId, status }, 'dual-write change_order: status tak terpetakan (R7)')
    return
  }
  await syncWorkflowInstance(request, {
    workflowKey: WORKFLOW_KEY,
    entityType: ENTITY_TYPE,
    entityId: changeOrderId,
    state,
  })
}

/** Deteksi divergensi change_orders.status ↔ workflow_instances.current_state. */
export function reconcileChangeOrderWorkflow(): Promise<ReconcileResult> {
  return reconcileWorkflow({ entityType: ENTITY_TYPE, table: 'change_orders' })
}
