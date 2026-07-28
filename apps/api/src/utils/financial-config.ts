// Config finansial effective-dated — pengambilan + tulis (config-first, AKTA 3).
// ⚠️ Red-Line §5#2: menyediakan tarif untuk perhitungan pajak. Delegasi keputusan
// "tarif mana berlaku" ke lib/financial-config.ts (murni).
//
// ⚠️ MENYENTUH RED-LINE §5#2 (logika finansial) — disebut eksplisit, bukan
// ditafsirkan diam-diam. Yang ditambahkan T4 di sini HANYA penyaringan tenancy
// (`company_id`), NOL perubahan pada: rumus tarif, urutan effective-date,
// guard 0..1, maupun perilaku fallback berisik C6. `financial_config` adalah
// tabel kategori B (audit T1) — tarif BUK/pembulatan adalah kebijakan tiap
// perusahaan, jadi membacanya tanpa scope = memakai tarif perusahaan lain.
// Semua test pajak existing tetap hijau tanpa diubah (bukti behavior-preserving).
//
// Syarat founder:
//   C6 FALLBACK BERISIK: bila config hilang/korup → log level ERROR + fallback statis.
//      Tarif pajak salah di dokumen = masalah kepatuhan, tak boleh diam.

import { supabase } from './supabase.js'
import { selectEffectiveValue, todayWIB, type EffectiveRow } from '../lib/financial-config.js'

// Fallback statis kanonik (identik lib/tax-calculation.ts). Dipakai HANYA bila DB
// tak terjangkau / config hilang — dan SELALU dengan log error (C6).
const STATIC_FALLBACK: Record<string, number> = {
  'tax.ppn_rate': 0.11,
  'tax.pph_final_rate': 0.02,
  'retention.default_pct': 0.05,   // fraksi (5%); kolom projects.retention_pct = ×100
}

function loudFallback(key: string, reason: string): number | undefined {
  const fb = STATIC_FALLBACK[key]
  // C6: BERISIK — level error, greppable. Bukan console.log/warn.
  console.error(JSON.stringify({
    level: 'error', event: 'financial_config_fallback', key, reason,
    fallback: fb ?? null,
    msg: `KEPATUHAN: config finansial '${key}' tak terbaca (${reason}) → pakai fallback statis ${fb}. Perbaiki config!`,
  }))
  return fb
}

/**
 * Ambil nilai config finansial yang BERLAKU pada `atDate` ('YYYY-MM-DD', default hari
 * ini WIB). Fail-safe + BERISIK: bila tak ada config/DB error → fallback statis + log error.
 */
export async function getEffectiveFinancialValue(
  key: string,
  atDate?: string,
  companyId?: string
): Promise<unknown> {
  const date = atDate ?? todayWIB()
  try {
    let q = supabase
      .from('financial_config')
      .select('value, effective_from, effective_to')
      .eq('key', key)
    // Scoping tenancy. companyId sengaja OPSIONAL selama T4 berjalan: 240
    // call-site dimigrasi bergelombang, dan memaksanya sekarang akan mematikan
    // jalur yang belum sempat diperbarui. Baris milik bersama (company_id NULL)
    // tetap terbaca — itu yang membuat fallback config global masih berfungsi.
    // T4f menutup celah ini: setelah semua pemanggil menyertakan companyId,
    // parameter ini menjadi wajib.
    if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`)
    const { data, error } = await q
    if (error) return loudFallback(key, `db error: ${error.message}`)

    const rows: EffectiveRow[] = (data ?? []).map(r => ({
      value: r.value,
      effectiveFrom: r.effective_from as string,
      effectiveTo: (r.effective_to as string | null) ?? null,
    }))
    const val = selectEffectiveValue(rows, date)
    if (val === undefined) return loudFallback(key, `tak ada nilai berlaku pada ${date}`)
    return val
  } catch (e) {
    return loudFallback(key, `exception: ${(e as Error).message}`)
  }
}

/**
 * Tarif pajak (fraksi 0..1) per skema, EFFECTIVE-DATED pada `atDate`.
 * C1/C2: atDate = tanggal dokumen (issued_date invoice). Guard 0..1 → fallback berisik.
 */
export async function getTaxRate(
  scheme: string | null | undefined,
  atDate?: string,
  companyId?: string
): Promise<number> {
  const key = scheme === 'ppn' ? 'tax.ppn_rate' : 'tax.pph_final_rate'
  const raw = await getEffectiveFinancialValue(key, atDate, companyId)
  const rate = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return loudFallback(key, `nilai korup/di luar 0..1: ${JSON.stringify(raw)}`) ?? STATIC_FALLBACK[key]
  }
  return rate
}

/**
 * Set nilai config finansial baru berlaku sejak `effectiveFrom` (close-then-insert,
 * anti-gap C4): tutup rentang terbuka lama tepat di effectiveFrom, lalu sisip baru.
 * Dipanggil governance endpoint (settings:finance:manage). Return baris baru.
 */
export async function setFinancialConfig(params: {
  key: string
  value: unknown
  valueType?: 'number' | 'string' | 'boolean' | 'json'
  effectiveFrom: string       // 'YYYY-MM-DD'
  note?: string
  updatedBy?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { key, value, effectiveFrom, note } = params
  const valueType = params.valueType ?? 'number'

  // Tutup rentang terbuka lama (effective_to NULL) TEPAT di effectiveFrom → nol gap.
  // Half-open [) berarti rentang lama berlaku sampai < effectiveFrom, baru mulai di
  // effectiveFrom → transisi mulus tanpa overlap.
  const { error: closeErr } = await supabase
    .from('financial_config')
    .update({ effective_to: effectiveFrom })
    .eq('key', key)
    .is('effective_to', null)
    .lt('effective_from', effectiveFrom)   // jangan tutup baris yg mulai == effectiveFrom
  if (closeErr) return { ok: false, error: `gagal menutup rentang lama: ${closeErr.message}` }

  const { error: insErr } = await supabase
    .from('financial_config')
    .insert({
      key, value: value as never, value_type: valueType,
      effective_from: effectiveFrom, effective_to: null,
      note: note ?? null, updated_by: params.updatedBy ?? null,
    })
  if (insErr) return { ok: false, error: insErr.message }   // termasuk 23P01 anti-overlap

  return { ok: true }
}
