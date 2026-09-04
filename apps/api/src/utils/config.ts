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

// MULTI-TENANT (ADR-011 §6): `company_settings` kategori B — isinya BEDA per
// perusahaan. Cache key WAJIB memuat companyId; kalau tidak, perusahaan yang
// query duluan "menanam" nilainya dan perusahaan lain membaca config milik
// orang lain selama 60 detik. ADR menyebut ini "bug yang AKAN terjadi, bukan
// yang mungkin" — jadi companyId dibuat WAJIB, bukan opsional dengan default.
const cacheKey = (companyId: string, key: string) => `${companyId}::${key}`

/**
 * Ambil satu nilai config milik SATU perusahaan. Return fallback statis jika key
 * tak ada / DB error — fail-safe, tidak pernah throw. Cache 60 dtk per (company, key).
 */
export async function getConfig<T = unknown>(companyId: string, key: string): Promise<T> {
  if (!companyId) {
    // Nol default diam-diam: config finansial milik siapa harus jelas.
    throw new Error(`getConfig('${key}') butuh companyId — config bersifat per-perusahaan.`)
  }
  const now = Date.now()
  const cached = cache.get(cacheKey(companyId, key))
  if (cached && now - cached.at < TTL_MS) return cached.value as T

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('value')
      .eq('key', key)
      .eq('company_id', companyId)
      .single()

    if (error || !data) {
      const fb = DEFAULTS[key]
      if (fb === undefined) throw new Error(`Config key tidak dikenal dan tidak punya fallback: ${key}`)
      cache.set(cacheKey(companyId, key), { value: fb, at: now })
      return fb as T
    }

    cache.set(cacheKey(companyId, key), { value: data.value, at: now })
    return data.value as T
  } catch {
    const fb = DEFAULTS[key]
    if (fb === undefined) throw new Error(`Config key tidak dikenal dan tidak punya fallback: ${key}`)
    return fb as T
  }
}

/** Ambil tarif pajak (fraksi 0..1) per skema milik satu perusahaan. */
export async function getTaxRate(
  companyId: string,
  scheme: string | null | undefined
): Promise<number> {
  /*
    `tanpa_pajak` → tarif NOL, dan ini harus di sini bukan di pemanggil.

    Ditambahkan bersama migrasi 566 atas permintaan founder ("pas bikin
    proyek juga bisa gapake pajak"). Tanpa cabang ini, pola lama
    `scheme === 'ppn' ? ppn : pph_final` memperlakukan `tanpa_pajak`
    sebagai PPh FINAL — proyek yang pajaknya sengaja dimatikan tetap
    dipotong 2%, dan tak ada satu pun galat karena angkanya sah.

    Ditaruh di fungsi tarif, bukan di tiap pemanggil: ada dua `getTaxRate`
    dan belasan tempat yang memakainya. Satu yang terlewat = pajak yang
    tak pernah ditagihkan muncul di invoice klien.
  */
  if (scheme === 'tanpa_pajak') return 0

  const key = scheme === 'ppn' ? 'tax.ppn_rate' : 'tax.pph_final_rate'
  const raw = await getConfig<number>(companyId, key)
  const rate = typeof raw === 'number' ? raw : Number(raw)
  // Guard: jika config korup (di luar 0..1), jatuh ke fallback statis.
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return DEFAULTS[key] as number
  }
  return rate
}

/**
 * Buang cache. Tanpa argumen = seluruhnya (dipakai test).
 * Dengan companyId = hanya milik perusahaan itu — setelah PUT config, tenant
 * lain tak perlu ikut kehilangan cache-nya.
 */
export function clearConfigCache(companyId?: string): void {
  if (!companyId) { cache.clear(); return }
  const prefix = `${companyId}::`
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}
