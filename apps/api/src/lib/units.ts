// Pure-logic satuan (unit of measure) — validasi & normalisasi untuk master `units`.
// Zero I/O: fungsi murni, mudah diuji (unit test tanpa DB). Dipakai routes/v1/units.ts.

export const UNIT_CATEGORIES = ['area', 'length', 'volume', 'weight', 'count', 'set', 'time'] as const
export type UnitCategory = (typeof UNIT_CATEGORIES)[number]

export interface UnitInput {
  code: string
  symbol: string
  label: string
  category: string
  sort_order?: number
}

export interface UnitRow extends UnitInput {
  sort_order: number
  is_active: boolean
}

/**
 * Normalisasi `code` menjadi kunci stabil: lowercase, trim, spasi/karakter asing → underscore,
 * hanya sisakan [a-z0-9_], rapikan underscore ganda/tepi. `code` = kunci konvensi nilai mandor,
 * jadi harus deterministik & bebas ambiguitas casing.
 */
export function normalizeUnitCode(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

/**
 * Validasi input satuan baru/edit. `code` dinormalisasi lebih dulu oleh pemanggil.
 * symbol & label WAJIB terisi (dropdown butuh tampilan); category dari daftar tetap.
 */
export function validateUnitInput(input: Partial<UnitInput>, opts: { requireCode?: boolean } = {}): ValidationResult {
  if (opts.requireCode) {
    const code = normalizeUnitCode(input.code ?? '')
    if (!code) return { ok: false, error: 'code wajib (huruf/angka)' }
  }
  if (input.symbol !== undefined && !String(input.symbol).trim()) {
    return { ok: false, error: 'symbol tidak boleh kosong' }
  }
  if (input.label !== undefined && !String(input.label).trim()) {
    return { ok: false, error: 'label tidak boleh kosong' }
  }
  if (input.category !== undefined && !UNIT_CATEGORIES.includes(input.category as UnitCategory)) {
    return { ok: false, error: `category harus salah satu: ${UNIT_CATEGORIES.join(', ')}` }
  }
  if (input.sort_order !== undefined) {
    if (!Number.isInteger(input.sort_order) || (input.sort_order as number) < 0) {
      return { ok: false, error: 'sort_order harus bilangan bulat ≥ 0' }
    }
  }
  return { ok: true }
}

/** Urutan tampilan deterministik: sort_order asc, lalu code asc (tie-break stabil). */
export function sortUnits<T extends { code: string; sort_order: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
}
