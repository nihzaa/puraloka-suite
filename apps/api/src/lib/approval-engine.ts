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
  /** LANTAI: langkah berlaku bila nilai >= ini. NULL = tanpa batas bawah. */
  min_amount: number | null
  /**
   * PLAFON: langkah berlaku bila nilai <= ini. NULL = tanpa batas atas.
   *
   * Ditambahkan untuk fast-track (automation 4.6): "PO di bawah Rp 5 juta
   * cukup satu tanda tangan" mustahil dinyatakan dengan `min_amount` saja,
   * karena ia hanya bisa berkata "berlaku DI ATAS X".
   *
   * Opsional pada tipe supaya seluruh pemanggil lama — yang tak menyebutnya
   * sama sekali — tetap terkompilasi dan berperilaku persis sama.
   */
  max_amount?: number | null
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
 *
 *   min_amount NULL → tanpa batas bawah
 *   max_amount NULL → tanpa batas atas
 *   amount     NULL → langkah bersyarat nominal TIDAK berlaku, karena tak bisa
 *                     dibuktikan memenuhi syarat (fail-closed)
 *
 * ── Plafon dipakai untuk FAST-TRACK, dan arahnya penting
 *
 * "PO kecil cukup satu tanda tangan" dinyatakan dengan memberi PLAFON pada
 * langkah pertama:
 *
 *   level 1 · min NULL · max 5jt · staf     → hanya untuk PO <= 5jt
 *   level 2 · min NULL · max NULL · manajer → selalu berlaku
 *
 * PO 3 juta melewati keduanya; PO 50 juta melewati level 2 saja. Yang KECIL
 * mendapat langkah TAMBAHAN yang murah, bukan pengurangan pengawasan — dan
 * itu sebabnya plafon aman: ia tak pernah bisa MENGHAPUS langkah yang tak
 * berplafon.
 *
 * ⚠ Langkah berplafon yang berdiri SENDIRIAN adalah lubang: PO di atas
 * plafonnya tak punya langkah berlaku sama sekali → `no_steps` → fail-closed
 * TOLAK. Itu perilaku yang benar (menolak, bukan meloloskan), tetapi berarti
 * PO besar tak bisa disetujui siapa pun sampai konfigurasinya diperbaiki.
 * Karena itu UI konfigurasi rantai WAJIB memperingatkan bila seluruh langkah
 * berplafon — dicatat sebagai pekerjaan lanjutan, bukan diam-diam diabaikan.
 */
export function applicableSteps(steps: ApprovalStep[], amount: number | null): ApprovalStep[] {
  const adaNilai = amount !== null && amount !== undefined

  return steps
    .filter(s => {
      const lantai = s.min_amount === null || s.min_amount === undefined
        ? true
        : adaNilai && (amount as number) >= s.min_amount

      const plafon = s.max_amount === null || s.max_amount === undefined
        ? true
        : adaNilai && (amount as number) <= s.max_amount

      return lantai && plafon
    })
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
