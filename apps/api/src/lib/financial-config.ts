// Pemilihan nilai config finansial effective-dated — MURNI (config-first, AKTA 3).
//
// Dipisah dari I/O supaya logika "tarif mana yang berlaku pada tanggal X" bisa diuji
// deterministik tanpa DB — penting karena ini menentukan angka pajak di dokumen nyata.
//
// Tanggal dibandingkan sebagai STRING 'YYYY-MM-DD' (bukan Date) supaya BEBAS timezone
// pitfall: perbandingan leksikal string ISO = perbandingan kronologis. Konversi ke
// tanggal WIB dilakukan sekali di todayWIB().

export interface EffectiveRow {
  value: unknown
  effectiveFrom: string          // 'YYYY-MM-DD' inklusif
  effectiveTo: string | null     // 'YYYY-MM-DD' eksklusif; null = open-ended
}

/**
 * Tanggal hari ini di zona Asia/Jakarta (WIB) sebagai 'YYYY-MM-DD'.
 * C3: "tarif berlaku 1 Januari" = 00:00 WIB, bukan UTC. en-CA → format ISO.
 */
export function todayWIB(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

/**
 * Pilih nilai yang BERLAKU pada `atDate` (half-open [from, to)):
 *   effectiveFrom <= atDate  AND  (effectiveTo IS NULL OR atDate < effectiveTo)
 * Bila beberapa cocok (seharusnya tak terjadi — anti-overlap DB), ambil yang
 * effectiveFrom paling akhir. Return undefined bila tak ada yang berlaku.
 */
export function selectEffectiveValue(rows: readonly EffectiveRow[], atDate: string): unknown {
  let best: EffectiveRow | undefined
  for (const r of rows) {
    const inRange = r.effectiveFrom <= atDate && (r.effectiveTo === null || atDate < r.effectiveTo)
    if (!inRange) continue
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r
  }
  return best?.value
}
