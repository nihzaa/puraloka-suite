// Configuration accessor (Sub-Fase 1B.1 Configuration Engine).
// Membaca company_settings key-value dari DB dengan cache TTL pendek + fallback aman.
//
// PENTING (governance): util ini ADDITIF. Belum ada financial calc yang memakainya.
// Menyambungkannya ke lib/tax-calculation.ts (mengganti sumber tarif pajak dari
// konstanta tertest ke config runtime) = Red-Line #2 (logika finansial) dan HANYA
// boleh dilakukan setelah DANGER GATE disetujui founder.

import { supabase } from './supabase.js'

// Fallback statis = nilai kanonik saat ini (identik dengan lib/tax-calculation.ts).
// Dipakai jika DB tak terjangkau / key hilang — kalkulasi tidak pernah gagal senyap.
const DEFAULTS: Record<string, number | string | boolean> = {
  'tax.ppn_rate': 0.11,
  'tax.pph_final_rate': 0.02,
}

interface CacheEntry { value: unknown; at: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000 // 60 dtk — perubahan config terlihat cepat tanpa hit DB tiap kalkulasi

/**
 * Ambil satu nilai config. Return fallback statis jika key tak ada / DB error —
 * fail-safe, tidak pernah throw. Cache 60 dtk.
 */
export async function getConfig<T = unknown>(key: string): Promise<T> {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.at < TTL_MS) return cached.value as T

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error || !data) {
      const fb = DEFAULTS[key]
      if (fb === undefined) throw new Error(`Config key tidak dikenal dan tidak punya fallback: ${key}`)
      cache.set(key, { value: fb, at: now })
      return fb as T
    }

    cache.set(key, { value: data.value, at: now })
    return data.value as T
  } catch {
    const fb = DEFAULTS[key]
    if (fb === undefined) throw new Error(`Config key tidak dikenal dan tidak punya fallback: ${key}`)
    return fb as T
  }
}

/** Ambil tarif pajak (fraksi 0..1) per skema, dengan fallback aman. */
export async function getTaxRate(scheme: string | null | undefined): Promise<number> {
  const key = scheme === 'ppn' ? 'tax.ppn_rate' : 'tax.pph_final_rate'
  const raw = await getConfig<number>(key)
  const rate = typeof raw === 'number' ? raw : Number(raw)
  // Guard: jika config korup (di luar 0..1), jatuh ke fallback statis.
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return DEFAULTS[key] as number
  }
  return rate
}

/** Untuk test / setelah PUT config: buang cache agar nilai baru langsung terbaca. */
export function clearConfigCache(): void {
  cache.clear()
}
