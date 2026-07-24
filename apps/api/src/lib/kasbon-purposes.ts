// Pure-logic tujuan kasbon (kasbon purpose) — validasi & normalisasi master `kasbon_purposes`.
// Zero I/O. Pola sama lib/work-categories.ts (census A4).

export interface KasbonPurposeInput {
  code: string
  label: string
  sort_order?: number
}
export interface KasbonPurposeRow extends KasbonPurposeInput {
  sort_order: number
  is_active: boolean
}

/** Normalisasi code → kunci stabil (= nilai tersimpan kasbons.purpose): lowercase, [a-z0-9_]. */
export function normalizePurposeCode(raw: string): string {
  return String(raw ?? '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

export interface ValidationResult { ok: boolean; error?: string }

export function validatePurposeInput(input: Partial<KasbonPurposeInput>, opts: { requireCode?: boolean } = {}): ValidationResult {
  if (opts.requireCode) {
    if (!normalizePurposeCode(input.code ?? '')) return { ok: false, error: 'code wajib (huruf/angka)' }
  }
  if (input.label !== undefined && !String(input.label).trim()) return { ok: false, error: 'label tidak boleh kosong' }
  if (input.sort_order !== undefined) {
    if (!Number.isInteger(input.sort_order) || (input.sort_order as number) < 0) return { ok: false, error: 'sort_order harus bilangan bulat ≥ 0' }
  }
  return { ok: true }
}

export function sortPurposes<T extends { code: string; sort_order: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
}
