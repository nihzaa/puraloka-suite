// CECEP — resolusi harga dari Price Book (pure, tanpa I/O).
//
// Aturan pemilihan entry untuk satu resource pada tanggal T (deterministik):
//   1. Hanya status 'active' (lifecycle 104: draft→verified→active→expired;
//      hanya active yang sah dipakai menghitung dokumen).
//   2. Berlaku pada T: effective_date <= T dan (expired_date NULL atau >= T).
//   3. Preferensi lokasi: match lokasi persis > entry tanpa lokasi (NULL=umum).
//      Entry lokasi LAIN tidak pernah dipakai (harga wilayah lain ≠ harga sini).
//   4. Tie-break: effective_date terbaru, lalu version_number tertinggi.
// Tidak ketemu → null (caller WAJIB fail-loud, bukan menebak harga).

export interface PriceBookEntryRow {
  id: string
  resource_id: string
  amount: number
  currency: string
  version_number: number
  effective_date: string   // ISO date
  expired_date: string | null
  location: string | null
  status: string
}

export interface ResolvedPrice {
  entry: PriceBookEntryRow
  matched_location: boolean // true = lokasi persis; false = entry umum (NULL)
}

export function resolvePrice(
  entries: PriceBookEntryRow[],
  resourceId: string,
  atDate: string,
  location?: string | null,
): ResolvedPrice | null {
  const t = atDate
  const usable = entries.filter(e =>
    e.resource_id === resourceId
    && e.status === 'active'
    && e.effective_date <= t
    && (e.expired_date === null || e.expired_date >= t)
    && (e.location === null || (location != null && e.location === location)))
  if (!usable.length) return null

  const rank = (e: PriceBookEntryRow): [number, string, number] => [
    location != null && e.location === location ? 1 : 0, // lokasi persis menang
    e.effective_date,                                    // lalu paling baru
    e.version_number,                                    // lalu versi tertinggi
  ]
  let best = usable[0]
  for (const e of usable.slice(1)) {
    const [al, ad, av] = rank(e); const [bl, bd, bv] = rank(best)
    if (al > bl || (al === bl && (ad > bd || (ad === bd && av > bv)))) best = e
  }
  return { entry: best, matched_location: location != null && best.location === location }
}

/** Resolusi banyak resource sekaligus; kembalikan peta + daftar yang gagal (fail-loud di caller). */
export function resolvePrices(
  entries: PriceBookEntryRow[],
  resourceIds: string[],
  atDate: string,
  location?: string | null,
): { resolved: Map<string, ResolvedPrice>; missing: string[] } {
  const resolved = new Map<string, ResolvedPrice>()
  const missing: string[] = []
  for (const rid of resourceIds) {
    const r = resolvePrice(entries, rid, atDate, location)
    if (r) resolved.set(rid, r)
    else missing.push(rid)
  }
  return { resolved, missing }
}
