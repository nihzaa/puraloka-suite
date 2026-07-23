// Workflow — lapisan pengambilan data (Sub-Fase 1C.2).
//
// Dipisah dari `src/lib/workflow.ts` (keputusan murni) mengikuti konvensi repo:
// lib/ = pure & bercoverage-gate, utils/ = ber-I/O. Semua keputusan tetap dibuat
// oleh evaluateTransition; file ini hanya menyuplai aturannya dari DB.

import { supabase } from './supabase.js'
import {
  evaluateTransition,
  type ApprovalMode,
  type TransitionDecision,
  type TransitionRule,
} from '../lib/workflow.js'

/** Ambil semua transisi terdaftar untuk sebuah workflow (by key). */
export async function getTransitions(workflowKey: string): Promise<TransitionRule[]> {
  const { data, error } = await supabase
    .from('workflow_transitions')
    .select('from_state, to_state, label, required_permission, sla_hours, escalation_role, approval_mode, workflow_definitions!inner(key)')
    .eq('workflow_definitions.key', workflowKey)

  if (error || !data) return []

  return data.map(r => ({
    fromState: r.from_state as string,
    toState: r.to_state as string,
    label: r.label as string,
    requiredPermission: (r.required_permission as string | null) ?? null,
    slaHours: (r.sla_hours as number | null) ?? null,
    escalationRole: (r.escalation_role as string | null) ?? null,
    approvalMode: (r.approval_mode as ApprovalMode) ?? 'sequential',
  }))
}

/**
 * Cek apakah transisi diizinkan: baca aturan dari DB → delegasikan ke
 * evaluateTransition (murni).
 *
 * FAIL-CLOSED: bila aturan tak terbaca (DB error), getTransitions mengembalikan
 * array kosong → evaluateTransition menolak dengan 'unknown_workflow'. Perubahan
 * state approval TIDAK PERNAH diizinkan karena kegagalan lookup.
 */
export async function canTransition(
  workflowKey: string,
  fromState: string,
  toState: string,
  userPermissions: ReadonlySet<string>,
): Promise<TransitionDecision> {
  const rules = await getTransitions(workflowKey)
  return evaluateTransition(rules, fromState, toState, userPermissions)
}

/**
 * Apakah `delegateId` sedang memegang delegasi aktif untuk workflow ini pada `at`?
 * Dipakai saat modul dimigrasi ke engine (belum dipanggil runtime sekarang).
 */
export async function hasActiveDelegation(
  delegateId: string,
  workflowKey: string,
  at: Date = new Date(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from('approval_delegations')
    .select('id')
    .eq('delegate_id', delegateId)
    .lte('starts_at', at.toISOString())
    .gte('ends_at', at.toISOString())
    .or(`workflow_key.is.null,workflow_key.eq.${workflowKey}`)
    .limit(1)

  if (error || !data) return false
  return data.length > 0
}
