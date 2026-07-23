// Enforcement batas kasbon — pengambilan data + keputusan (config-first, AKTA 3 Q2).
// Delegasi keputusan ke lib/kasbon-limit.ts (murni).

import { supabase } from './supabase.js'
import { checkKasbonLimit, type KasbonLimitResult } from '../lib/kasbon-limit.js'

/** Baca toggle enforcement dari company_settings. Default FALSE (opt-in). */
async function isEnforcementEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('company_settings').select('value').eq('key', 'kasbon.limit.enabled').maybeSingle()
    return data?.value === true
  } catch {
    return false  // gagal baca → OFF (fail-open: batas opt-in, bukan keamanan)
  }
}

/**
 * Cek apakah approve kasbon `kasbonId` melanggar batas. Return hasil (allowed +
 * reason bila tidak). FAIL-OPEN saat toggle OFF / data tak lengkap — batas adalah
 * fitur opt-in; kegagalan tak boleh memblokir approval yang hari ini boleh.
 */
export async function enforceKasbonLimit(kasbonId: string, newAmount: number): Promise<KasbonLimitResult> {
  const enabled = await isEnforcementEnabled()
  if (!enabled) return { allowed: true }

  // Kasbon → scope. Batas hanya untuk scope progress_pct.
  const { data: kasbon } = await supabase
    .from('kasbons').select('work_scope_id, project_id').eq('id', kasbonId).single()
  if (!kasbon?.work_scope_id) return { allowed: true } // kasbon umum (tanpa scope) → tak dibatasi

  const { data: scope } = await supabase
    .from('work_scopes')
    .select('payment_system, borongan_value, progress_pct_done')
    .eq('id', kasbon.work_scope_id).single()
  if (!scope || scope.payment_system !== 'progress_pct') return { allowed: true }

  // Earned value = borongan_value × progress% / 100.
  const earnedValue = (Number(scope.borongan_value) || 0) * (Number(scope.progress_pct_done) || 0) / 100

  // Total kasbon approved untuk scope ini (tidak termasuk yang sedang di-approve).
  const { data: existing } = await supabase
    .from('kasbons').select('amount').eq('work_scope_id', kasbon.work_scope_id).eq('status', 'approved')
  const existingApprovedSum = (existing ?? []).reduce((s, k) => s + (Number(k.amount) || 0), 0)

  // Limit % per proyek (kolom projects.kasbon_limit_pct, default 80).
  const { data: project } = await supabase
    .from('projects').select('kasbon_limit_pct').eq('id', kasbon.project_id).single()
  const limitPct = Number(project?.kasbon_limit_pct) || 80

  return checkKasbonLimit({
    enabled: true,
    paymentSystem: scope.payment_system as string,
    earnedValue,
    existingApprovedSum,
    newAmount,
    limitPct,
  })
}
