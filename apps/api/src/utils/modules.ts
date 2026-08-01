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

/**
 * Apakah modul aktif UNTUK PERUSAHAAN INI.
 *
 * ⚠️ `companyId` wajib disebut sejak migrasi 155. Versi sebelumnya membaca
 * `modules` tanpa konteks perusahaan sama sekali — dan karena `is_enabled`
 * dulu tersimpan di baris katalog global, jawabannya sama untuk semua tenant.
 *
 * Cache juga ber-kunci `key` saja, sehingga jawaban perusahaan A akan
 * disajikan ke perusahaan B selama TTL. Kunci kini menyertakan company —
 * cache lintas-tenant adalah kebocoran yang tak meninggalkan jejak di query
 * log mana pun, karena querynya memang tak pernah dijalankan.
 *
 * FAIL-OPEN dipertahankan (additive-first): DB error atau modul tak terdaftar
 * → dianggap AKTIF. Gating adalah lapisan tambahan yang tak boleh mematikan
 * fitur yang sudah jalan hanya karena registry belum tahu.
 */
export async function isModuleEnabled(key: string, companyId?: string | null): Promise<boolean> {
  const now = Date.now()
  const kunci = `${companyId ?? '-'}::${key}`
  const cached = cache.get(kunci)
  if (cached && now - cached.at < TTL_MS) return cached.enabled

  try {
    // Ambil katalog + pengecualian sekaligus, lalu pengecualian menang.
    // Dua query terpisah membuka jendela di antaranya; satu query juga lebih
    // murah pada jalur yang dipanggil per-request.
    const { data, error } = await supabase
      .from('modules')
      .select('is_enabled, company_id')
      .eq('key', key)

    if (error || !data || data.length === 0) {
      cache.set(kunci, { enabled: true, at: now })
      return true // fail-open
    }

    const baris = data as Array<{ is_enabled: boolean; company_id: string | null }>
    const khusus = companyId ? baris.find((b) => b.company_id === companyId) : undefined
    const katalog = baris.find((b) => b.company_id == null)
    const enabled = khusus?.is_enabled ?? katalog?.is_enabled ?? true

    cache.set(kunci, { enabled, at: now })
    return enabled
  } catch {
    return true // fail-open
  }
}

/**
 * Feature flag untuk perusahaan ini.
 *
 * ⚠️ Komentar lama berbunyi "company-scoped override menyusul di L2" — L2 sudah
 * selesai (migrasi 146 memberi `feature_flags` keunikan per-company), tapi
 * fungsi ini masih memaksa `company_id IS NULL`: override yang sudah bisa
 * disimpan tak pernah terbaca. Fitur yang dinyalakan untuk satu perusahaan
 * tetap mati di sana, dan tak ada gejalanya — flag memang defaultnya OFF.
 *
 * Flag tetap OPT-IN: tak terdaftar = OFF (kebalikan `modules` yang fail-open).
 * Bedanya disengaja — modul adalah fitur yang sudah jalan, flag adalah fitur
 * yang belum siap dirilis.
 */
export async function isFeatureEnabled(key: string, companyId?: string | null): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('is_enabled, company_id')
      .eq('key', key)
    if (error || !data || data.length === 0) return false

    const baris = data as Array<{ is_enabled: boolean; company_id: string | null }>
    const khusus = companyId ? baris.find((b) => b.company_id === companyId) : undefined
    const bersama = baris.find((b) => b.company_id == null)
    return khusus?.is_enabled ?? bersama?.is_enabled ?? false
  } catch {
    return false
  }
}

/** Buang cache modul (dipanggil setelah PATCH module). */
export function clearModuleCache(): void {
  cache.clear()
}
