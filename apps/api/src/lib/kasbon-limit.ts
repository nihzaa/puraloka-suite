// Enforcement batas kasbon — keputusan MURNI (config-first, AKTA 3 Q2).
//
// Q2 owner: hidupkan batas kasbon (kasbon max X% dari earned value) sebagai config,
// TOGGLE DEFAULT OFF. Additive-first: nol perubahan perilaku sampai owner menyalakan.
//
// Batas HANYA berlaku untuk scope payment_system='progress_pct' (per komentar migration
// 003: "Batas maksimal kasbon dari earned value untuk sistem progress_pct"). Scope lain
// (harian/borongan) tak dibatasi. Bila toggle OFF → selalu diizinkan (perilaku hari ini).

export interface KasbonLimitCheck {
  enabled: boolean          // company_settings kasbon.limit.enabled
  paymentSystem: string | null
  earnedValue: number       // borongan_value × progress_pct_done / 100
  existingApprovedSum: number  // total kasbon approved untuk scope ini
  newAmount: number         // kasbon yang mau di-approve
  limitPct: number          // projects.kasbon_limit_pct (persen, mis. 80)
}

export type KasbonLimitResult =
  | { allowed: true }
  | { allowed: false; reason: string; earnedValue: number; limit: number; wouldBe: number }

/**
 * Cek apakah approve kasbon melanggar batas. FAIL-OPEN saat toggle OFF (perilaku
 * hari ini) — bukan fail-closed, karena batas adalah fitur opt-in, bukan keamanan.
 * Hanya menegakkan untuk progress_pct.
 */
export function checkKasbonLimit(c: KasbonLimitCheck): KasbonLimitResult {
  // Toggle OFF → tak ada batas (default; nol perubahan perilaku).
  if (!c.enabled) return { allowed: true }
  // Batas hanya untuk progress_pct.
  if (c.paymentSystem !== 'progress_pct') return { allowed: true }
  // Earned value belum ada (progress 0) → limit 0; kasbon apa pun > 0 akan melanggar.
  const limit = Math.round((c.earnedValue * c.limitPct / 100) * 100) / 100
  const wouldBe = Math.round((c.existingApprovedSum + c.newAmount) * 100) / 100
  if (wouldBe > limit) {
    return {
      allowed: false,
      reason: `Kasbon melebihi batas ${c.limitPct}% dari earned value. ` +
        `Earned: Rp ${c.earnedValue.toLocaleString('id-ID')}, batas: Rp ${limit.toLocaleString('id-ID')}, ` +
        `total setelah kasbon ini: Rp ${wouldBe.toLocaleString('id-ID')}.`,
      earnedValue: c.earnedValue, limit, wouldBe,
    }
  }
  return { allowed: true }
}
