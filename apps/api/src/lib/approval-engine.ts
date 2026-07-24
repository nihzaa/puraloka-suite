// Pure-logic Approval Engine (ADR-007). Zero I/O — seluruh keputusan "berapa langkah
// & siapa boleh menyetujui" dihitung di sini, sehingga bisa diuji tanpa DB.
//
// Prinsip (ADR-007):
//   • Jumlah level = DATA (bukan kode). Satu langkah = perilaku hari ini.
//   • Approver = PERMISSION per langkah (ADR-004), bukan literal role.
//   • Syarat nominal = DATA (min_amount) → "PO di atas Rp X wajib Direktur" = konfigurasi.
//   • FAIL-CLOSED: konfigurasi kosong/tak berlaku → TOLAK (jangan diam-diam meloloskan).

export interface ApprovalStep {
  level: number
  required_permission: string
  min_amount: number | null
  label?: string | null
}

export type ApprovalReason =
  | 'ok'
  | 'no_steps'          // tak ada langkah berlaku → fail-closed
  | 'already_approved'  // semua langkah sudah disetujui
  | 'no_permission'     // user tak punya permission langkah berjalan

export interface ApprovalDecision {
  allowed: boolean
  reason: ApprovalReason
  /** Langkah yang sedang menunggu persetujuan (null bila tak ada). */
  step: ApprovalStep | null
  /** true bila langkah ini yang TERAKHIR → entitas jadi approved setelah disetujui. */
  isFinalStep: boolean
  /** Seluruh langkah yang berlaku untuk nilai entitas ini (urut level). */
  applicable: ApprovalStep[]
}

/**
 * Langkah yang BERLAKU untuk entitas bernilai `amount`.
 * `min_amount` null = selalu berlaku. Bila entitas tak punya nilai (amount null),
 * langkah bersyarat nominal TIDAK berlaku (tak bisa dibuktikan memenuhi syarat).
 */
export function applicableSteps(steps: ApprovalStep[], amount: number | null): ApprovalStep[] {
  return steps
    .filter(s => s.min_amount === null || s.min_amount === undefined
      ? true
      : amount !== null && amount !== undefined && amount >= s.min_amount)
    .sort((a, b) => a.level - b.level)
}

/** Langkah berikutnya yang belum disetujui (null bila semua sudah). */
export function nextPendingStep(applicable: ApprovalStep[], approvedLevels: number[]): ApprovalStep | null {
  const done = new Set(approvedLevels)
  return applicable.find(s => !done.has(s.level)) ?? null
}

/**
 * Bolehkah user menyetujui SEKARANG? Menentukan juga apakah ini langkah terakhir
 * (penentu apakah entitas berubah jadi `approved`).
 */
export function evaluateApproval(params: {
  steps: ApprovalStep[]
  amount: number | null
  approvedLevels: number[]
  userPermissions: Iterable<string>
}): ApprovalDecision {
  const applicable = applicableSteps(params.steps, params.amount)
  const base = { applicable, isFinalStep: false }

  if (applicable.length === 0) {
    // FAIL-CLOSED: tanpa langkah berlaku, tak ada dasar menyetujui.
    return { ...base, allowed: false, reason: 'no_steps', step: null }
  }

  const step = nextPendingStep(applicable, params.approvedLevels)
  if (!step) return { ...base, allowed: false, reason: 'already_approved', step: null }

  const isFinalStep = step.level === applicable[applicable.length - 1].level
  const perms = params.userPermissions instanceof Set
    ? params.userPermissions
    : new Set(params.userPermissions)

  if (!perms.has(step.required_permission)) {
    return { ...base, allowed: false, reason: 'no_permission', step, isFinalStep }
  }
  return { applicable, allowed: true, reason: 'ok', step, isFinalStep }
}
