// Pure-logic kategori pekerjaan (work category) — validasi & normalisasi master `work_categories`.
// Zero I/O. Pola sama seperti lib/units.ts (census A7, sejajar unifikasi units #32).

export interface WorkCategoryInput {
  code: string
  label: string
  sort_order?: number
}

export interface WorkCategoryRow extends WorkCategoryInput {
  sort_order: number
  is_active: boolean
}

/** Normalisasi code → kunci stabil (= nilai tersimpan work_scope_items.category): lowercase, [a-z0-9_]. */
export function normalizeCategoryCode(raw: string): string {
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

export function validateCategoryInput(input: Partial<WorkCategoryInput>, opts: { requireCode?: boolean } = {}): ValidationResult {
  if (opts.requireCode) {
    const code = normalizeCategoryCode(input.code ?? '')
    if (!code) return { ok: false, error: 'code wajib (huruf/angka)' }
  }
  if (input.label !== undefined && !String(input.label).trim()) {
    return { ok: false, error: 'label tidak boleh kosong' }
  }
  if (input.sort_order !== undefined) {
    if (!Number.isInteger(input.sort_order) || (input.sort_order as number) < 0) {
      return { ok: false, error: 'sort_order harus bilangan bulat ≥ 0' }
    }
  }
  return { ok: true }
}

/** Urutan tampilan deterministik: sort_order asc, lalu code asc. */
export function sortCategories<T extends { code: string; sort_order: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
}
