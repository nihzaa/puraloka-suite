/**
 * Permission efektif dari NAMA PERAN — untuk jalur TANPA sesi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIANGKAT DARI `wa-webhook.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-15 fungsi ini hidup sebagai fungsi privat di dalam route
 * WhatsApp — benar selama hanya satu jalur yang membutuhkannya. Jalur
 * proaktif (`sapa-proaktif.ts`) butuh yang sama persis, dan ada dua pilihan:
 * mengimpor dari route lain, atau menyalinnya.
 *
 * Keduanya buruk. Impor antar-route mengikat dua jalur yang seharusnya
 * berdiri sendiri; salinan aturan IZIN adalah cacat yang menunggu waktu —
 * salinan aturan keamanan selalu berbeda pada akhirnya, biasanya karena satu
 * diperbaiki dan satunya lupa.
 *
 * Diangkat ke pustaka: satu implementasi, dua pemanggil, nol salinan.
 *
 * ── Kenapa RPC, bukan membaca tabel sendiri
 *
 * `get_role_permissions` adalah yang dipakai jalur web (`plugins/auth.ts`).
 * Dua cara membaca izin akan berbeda pada akhirnya, dan perbedaan izin
 * antar-kanal berarti seseorang bisa lewat WhatsApp melakukan hal yang di web
 * ditolak.
 */

import type { supabase as KlienSupabase } from '../utils/supabase.js'

export async function izinDariPeran(
  db: typeof KlienSupabase,
  peran: string,
): Promise<ReadonlySet<string>> {
  // Nama parameternya `role_name` — sama persis dengan `plugins/auth.ts`.
  // Nama yang salah tidak melempar; PostgREST menjawab "fungsi tak ditemukan",
  // dan itu jatuh ke set kosong yang terbaca seperti "orang ini tak punya izin".
  const { data, error } = await db.rpc('get_role_permissions', { role_name: peran })
  if (error || !Array.isArray(data)) {
    // Fail-closed: gagal membaca izin berarti NOL izin, bukan semua izin.
    return new Set<string>()
  }
  return new Set(
    (data as Array<{ permission_key?: string }>)
      .map((d) => d.permission_key ?? '')
      .filter(Boolean),
  )
}
