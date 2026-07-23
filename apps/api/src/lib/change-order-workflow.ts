// Pemetaan status change_order → state workflow (Sub-Fase 1C, migrasi modul kedua).
//
// MURNI & FAIL-LOUD (R7). Berbeda dari kasbon: KEEMPAT status change_order punya
// code path nyata (draft/submitted/approved/rejected) — tidak ada state mati.
// Nilai HARUS sinkron dengan:
//   - CHECK constraint change_orders.status (migration 053)
//   - workflow_states 'change_order_approval' (migration 081)
//   - CASE mapping di backfill (migration 083)

export const CHANGE_ORDER_STATUS_TO_STATE: Readonly<Record<string, string>> = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
}

export const KNOWN_CHANGE_ORDER_STATUSES: readonly string[] = Object.keys(CHANGE_ORDER_STATUS_TO_STATE)

/**
 * Petakan status change_order → workflow state. THROW pada status tak dikenal
 * (fail-loud, R7). Pemanggil shadow menangkap throw + log keras tanpa menjatuhkan
 * operasi primer.
 */
export function mapChangeOrderStatusToWorkflowState(status: string): string {
  const state = CHANGE_ORDER_STATUS_TO_STATE[status]
  if (!state) {
    throw new Error(
      `Status change_order tak dikenal: '${status}' — tidak bisa dipetakan ke workflow state. ` +
      `Tambahkan pemetaan eksplisit di CHANGE_ORDER_STATUS_TO_STATE (jangan default diam-diam, R7).`,
    )
  }
  return state
}
