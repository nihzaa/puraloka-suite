// Workflow Engine — keputusan MURNI (Sub-Fase 1C.2).
//
// Menggantikan status-logic yang hari ini terduplikasi di 3+ file (kasbons.ts,
// change-orders.ts, procurement.ts) dengan SATU sumber kebenaran: aturan transisi
// dari tabel workflow_transitions.
//
// File ini SENGAJA bebas I/O. Konvensi repo: `src/lib/` = fungsi murni (punya
// coverage gate 90%); pengambilan data ada di `src/utils/workflow.ts`. Pemisahan
// ini membuat SELURUH keputusan approval bisa diuji deterministik tanpa DB —
// penting karena ini logic finansial-kritis.
//
// ⚠️ STATUS PEMAKAIAN: engine SIAP tapi BELUM dipasang ke modul mana pun. Migrasi
// modul (kasbon → CO → procurement) adalah strangler-fig yang butuh keputusan
// founder: jendela waktu + strategi backfill approval in-flight (risk register R7).
// Sampai itu, modul memakai logic hardcode lama dan engine ini nol dampak.

export type ApprovalMode = 'sequential' | 'parallel' | 'any_one'

export interface TransitionRule {
  fromState: string
  toState: string
  label: string
  requiredPermission: string | null
  slaHours: number | null
  escalationRole: string | null
  approvalMode: ApprovalMode
}

export type TransitionDecision =
  | { allowed: true; rule: TransitionRule }
  | { allowed: false; reason: 'unknown_workflow' | 'invalid_transition' | 'missing_permission'; message: string }

/**
 * Keputusan transisi — MURNI. Diberi daftar aturan + permission user, memutuskan
 * boleh/tidak. Inti yang menggantikan `if (status !== 'draft')` yang tersebar.
 *
 * FAIL-CLOSED di semua jalur: transisi tak terdaftar, workflow tanpa aturan, dan
 * permission kurang semuanya DITOLAK. Tidak pernah "izinkan karena tidak tahu".
 */
export function evaluateTransition(
  rules: readonly TransitionRule[],
  fromState: string,
  toState: string,
  userPermissions: ReadonlySet<string>,
): TransitionDecision {
  if (rules.length === 0) {
    return {
      allowed: false,
      reason: 'unknown_workflow',
      message: 'Workflow tidak dikenal atau belum punya transisi terdaftar',
    }
  }

  const rule = rules.find(r => r.fromState === fromState && r.toState === toState)
  if (!rule) {
    return {
      allowed: false,
      reason: 'invalid_transition',
      message: `Transisi ${fromState} → ${toState} tidak diizinkan`,
    }
  }

  // requiredPermission null = transisi tanpa syarat capability (aksi sistem).
  if (rule.requiredPermission && !userPermissions.has(rule.requiredPermission)) {
    return {
      allowed: false,
      reason: 'missing_permission',
      message: `Butuh permission ${rule.requiredPermission}`,
    }
  }

  return { allowed: true, rule }
}

/** Daftar transisi yang tersedia dari sebuah state untuk user tertentu (untuk UI). */
export function availableTransitions(
  rules: readonly TransitionRule[],
  fromState: string,
  userPermissions: ReadonlySet<string>,
): TransitionRule[] {
  return rules.filter(r =>
    r.fromState === fromState &&
    (!r.requiredPermission || userPermissions.has(r.requiredPermission)))
}

/** Hitung deadline SLA dari aturan transisi. Null bila transisi tanpa SLA. */
export function computeSlaDeadline(rule: TransitionRule, from: Date = new Date()): Date | null {
  if (rule.slaHours == null) return null
  return new Date(from.getTime() + rule.slaHours * 60 * 60 * 1000)
}

/** Apakah instance sudah melewati SLA dan belum dieskalasi? (dipakai job eskalasi) */
export function isSlaBreached(
  slaDeadline: Date | null,
  escalatedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!slaDeadline) return false
  if (escalatedAt) return false
  return now.getTime() > slaDeadline.getTime()
}
