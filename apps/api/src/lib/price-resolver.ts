// CECEP — resolusi harga dari Price Book (pure, tanpa I/O).
//
// Aturan pemilihan entry untuk satu resource pada tanggal T (deterministik):
//   0. HARGA KHUSUS PROYEK menang atas semuanya (migrasi 140) — lihat di bawah.
//   1. Hanya status 'active' (lifecycle 104: draft→verified→active→expired;
//      hanya active yang sah dipakai menghitung dokumen).
//   2. Berlaku pada T: effective_date <= T dan (expired_date NULL atau >= T).
//   3. Preferensi lokasi: match lokasi persis > entry tanpa lokasi (NULL=umum).
//      Entry lokasi LAIN tidak pernah dipakai (harga wilayah lain ≠ harga sini).
//   4. Tie-break: effective_date terbaru, lalu version_number tertinggi.
// Tidak ketemu → null (caller WAJIB fail-loud, bukan menebak harga).
//
// ── Harga khusus proyek (lapis 0) ────────────────────────────────────────────
// Kebutuhan nyata: "cor lantai di acuan Rp 6,7 jt, tapi untuk proyek INI pakai
// Rp 5 jt — dan harga acuannya harus TETAP." Juga: dua proyek dalam periode
// berlaku yang SAMA boleh memakai harga berbeda untuk resource yang sama.
//
// Sumbu waktu dan lokasi tidak bisa menjawab itu: keduanya berlaku lintas
// proyek. Karena itu override hidup di tabelnya sendiri
// (`project_price_override`) dan dievaluasi LEBIH DULU — price book tak pernah
// tersentuh, sehingga proyek lain tidak ikut berubah.

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
  /** Harga khusus proyek yang dipakai — null bila memakai harga acuan. */
  override?: ProjectPriceOverrideRow | null
}

/** Harga khusus untuk satu proyek (migrasi 140). Menang atas price book. */
export interface ProjectPriceOverrideRow {
  id: string
  project_id: string
  resource_id: string
  amount: number
  currency: string
  effective_date: string | null
  expired_date: string | null
  reason: string
}

/**
 * Harga khusus proyek yang berlaku pada tanggal T untuk sebuah resource.
 *
 * Tanggal OPSIONAL di sisi override: `effective_date` NULL berarti "berlaku
 * selama proyek berjalan" — kasus terbanyak, dan sengaja tidak memaksa
 * pengguna mengisi tanggal untuk sesuatu yang memang tak bertanggal.
 *
 * Bila ada beberapa yang sama-sama berlaku, yang `effective_date`-nya paling
 * baru menang; yang tak bertanggal kalah dari yang bertanggal, karena
 * menyebutkan tanggal adalah pernyataan yang lebih spesifik.
 */
export function resolveProjectOverride(
  overrides: ProjectPriceOverrideRow[],
  resourceId: string,
  atDate: string,
): ProjectPriceOverrideRow | null {
  const usable = overrides.filter(
    (o) =>
      o.resource_id === resourceId &&
      (o.effective_date === null || o.effective_date <= atDate) &&
      (o.expired_date === null || o.expired_date >= atDate),
  )
  if (!usable.length) return null

  let best = usable[0]
  for (const o of usable.slice(1)) {
    const skor = (x: ProjectPriceOverrideRow) => x.effective_date ?? ''
    if (skor(o) > skor(best)) best = o
  }
  return best
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

/**
 * Resolusi banyak resource sekaligus; kembalikan peta + daftar yang gagal
 * (fail-loud di caller).
 *
 * `overrides` opsional — bila diberikan, harga khusus proyek MENANG atas price
 * book (migrasi 140). Parameter terakhir & opsional supaya seluruh pemanggil
 * lama tetap berlaku apa adanya: yang tak mengirim override berperilaku persis
 * seperti sebelumnya.
 *
 * Override juga menutup kasus "resource belum punya harga acuan": bila
 * override-nya ada, resource itu TIDAK dianggap missing — memang sengaja
 * diberi harga khusus untuk proyek ini.
 */
export function resolvePrices(
  entries: PriceBookEntryRow[],
  resourceIds: string[],
  atDate: string,
  location?: string | null,
  overrides?: ProjectPriceOverrideRow[],
): { resolved: Map<string, ResolvedPrice>; missing: string[] } {
  const resolved = new Map<string, ResolvedPrice>()
  const missing: string[] = []
  for (const rid of resourceIds) {
    const ov = overrides?.length ? resolveProjectOverride(overrides, rid, atDate) : null
    if (ov) {
      // Baris sintetis berbentuk PriceBookEntryRow supaya seluruh kode hilir
      // (snapshot, response, engine) tak perlu tahu asal harganya. Yang
      // membedakan hanya `override` — dan itulah yang dicatat di provenance.
      resolved.set(rid, {
        entry: {
          id: ov.id,
          resource_id: rid,
          amount: ov.amount,
          currency: ov.currency,
          version_number: 0,
          effective_date: ov.effective_date ?? atDate,
          expired_date: ov.expired_date,
          location: null,
          status: 'active',
        },
        matched_location: false,
        override: ov,
      })
      continue
    }
    const r = resolvePrice(entries, rid, atDate, location)
    if (r) resolved.set(rid, r)
    else missing.push(rid)
  }
  return { resolved, missing }
}
