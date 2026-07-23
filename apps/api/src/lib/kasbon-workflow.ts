// Pemetaan status kasbon → state workflow (Sub-Fase 1C, migrasi modul kasbon).
//
// MURNI & FAIL-LOUD. Ini adalah inti mekanisme R7: pemetaan status ke state harus
// EKSPLISIT dan menolak nilai tak dikenal, bukan default diam-diam (approval hilang
// jejak). Nilai HARUS sinkron dengan:
//   - enum kasbon_status (migration 001): pending/approved/rejected/settled
//   - workflow_states 'kasbon_approval' (migration 081)
//   - CASE mapping di backfill (migration 082)
//
// Bila enum kasbon_status bertambah nilai kelak, fungsi ini akan throw → memaksa
// pemetaan sadar ditambahkan, bukan lolos diam-diam.

/** Pemetaan eksplisit status enum → workflow state key. Identitas hari ini
 *  (state mencerminkan enum), tapi ditulis sadar agar penambahan status baru
 *  ketahuan (bukan pass-through). */
export const KASBON_STATUS_TO_STATE: Readonly<Record<string, string>> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  settled: 'settled',
}

/** Semua status yang dikenal — sumber kebenaran tunggal untuk validasi. */
export const KNOWN_KASBON_STATUSES: readonly string[] = Object.keys(KASBON_STATUS_TO_STATE)

/**
 * Petakan status kasbon → workflow state. THROW bila status tak dikenal (fail-loud,
 * R7). Pemanggil di jalur shadow (dual-write) menangkap throw ini dan mencatatnya
 * keras tanpa menggagalkan operasi primer — tapi keputusan pemetaannya tetap
 * eksplisit di satu tempat.
 */
export function mapKasbonStatusToWorkflowState(status: string): string {
  const state = KASBON_STATUS_TO_STATE[status]
  if (!state) {
    throw new Error(
      `Status kasbon tak dikenal: '${status}' — tidak bisa dipetakan ke workflow state. ` +
      `Tambahkan pemetaan eksplisit di KASBON_STATUS_TO_STATE (jangan default diam-diam, R7).`,
    )
  }
  return state
}
