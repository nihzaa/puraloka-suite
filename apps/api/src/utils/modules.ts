// Module gating helper (Sub-Fase 1B.3).
// isModuleEnabled(key) — cek apakah modul aktif, dengan cache TTL pendek + FAIL-OPEN.
//
// FAIL-OPEN by design (additive-first): jika DB error / modul tak terdaftar, anggap
// ENABLED. Alasan: modul existing semua enabled; gating adalah lapisan tambahan yang
// TIDAK boleh mematikan fitur yang sudah jalan hanya karena registry belum tahu.
// Modul di-nonaktifkan hanya lewat keputusan eksplisit admin (is_enabled=false),
// bukan karena kegagalan lookup.

import { supabase } from './supabase.js'

interface CacheEntry { enabled: boolean; at: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000

export async function isModuleEnabled(key: string): Promise<boolean> {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.at < TTL_MS) return cached.enabled

  try {
    const { data, error } = await supabase
      .from('modules')
      .select('is_enabled')
      .eq('key', key)
      .single()

    // Modul tak terdaftar → fail-open (enabled). DB error → fail-open.
    const enabled = error || !data ? true : data.is_enabled
    cache.set(key, { enabled, at: now })
    return enabled
  } catch {
    return true // fail-open
  }
}

/** Feature flag global (company-scoped override menyusul di L2). Default OFF jika tak ada. */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('is_enabled')
      .eq('key', key)
      .is('company_id', null)
      .single()
    // Flag adalah opt-in: tak terdaftar = OFF (kebalikan modules yang fail-open).
    if (error || !data) return false
    return data.is_enabled
  } catch {
    return false
  }
}

/** Buang cache modul (dipanggil setelah PATCH module). */
export function clearModuleCache(): void {
  cache.clear()
}
