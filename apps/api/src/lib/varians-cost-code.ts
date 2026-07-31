// ROADMAP #9 — agregasi varians per Cost Code. Fungsi MURNI, ber-test.
//
// Dipisah dari route bukan demi kerapian: ini aritmetika uang. Kesalahan di sini
// menghasilkan laporan yang terlihat wajar dan tak ada yang error — jenis
// kegagalan paling mahal karena tak pernah berbunyi. Fungsi murni bisa diuji
// dengan angka nyata tanpa DB, jadi ia benar-benar diuji.

export interface ExpenseInput {
  category_id: string | null
  total_amount: number | string | null
}

export interface CostCodeRef {
  id: string
  code: string
  name: string
  status: string
}

export interface BarisVarians {
  cost_code_id: string | null
  code: string
  name: string
  status: string
  /** Pagu per cost code. 0 = benar-benar nol; lihat `variance` untuk "belum diketahui". */
  pagu: number
  commitment: number
  actual: number
  exposure: number
  /**
   * `pagu − exposure`. **null saat pagu tak diketahui**, bukan 0.
   * Membedakan keduanya penting: "sisa pagu Rp 0" dan "pagunya belum diketahui"
   * adalah dua keadaan yang menuntut tindakan berbeda.
   */
  variance: number | null
  serapan_pct: number | null
  /** Berapa kategori belanja yang dirangkum baris ini (rollup migrasi 112). */
  jumlah_kategori: number
}

/** Kunci untuk belanja yang kategorinya belum dipetakan ke cost code mana pun. */
export const KUNCI_BELUM_DIPETAKAN = '__belum_dipetakan__'

/**
 * Agregasi belanja aktual ke baris per cost code.
 *
 * @param expenses  belanja berstatus terpakai (approved/paid)
 * @param katKeCc   peta category_id → cost code (hasil ACL migrasi 112)
 * @param paguPerCc pagu per cost_code_id; kosong = pagu belum diketahui
 *
 * INVARIANT yang diuji:
 *  - Σ actual seluruh baris = Σ total_amount seluruh expense (nol rupiah hilang)
 *  - belanja tanpa pemetaan MASUK sebagai baris "belum dipetakan", tidak dibuang
 *  - beberapa kategori → satu cost code menyatu jadi SATU baris (rollup)
 *  - `variance` null saat pagu tak diketahui, bukan 0
 *  - amount null/NaN dihitung 0, tidak membuat seluruh baris NaN
 */
export function agregasiVarians(
  expenses: ExpenseInput[],
  katKeCc: Map<string, CostCodeRef>,
  paguPerCc: Map<string, number> = new Map(),
): BarisVarians[] {
  const per = new Map<string, BarisVarians>()
  const katPer = new Map<string, Set<string>>()

  for (const e of expenses) {
    const cc = e.category_id ? katKeCc.get(e.category_id) : undefined
    const k = cc?.id ?? KUNCI_BELUM_DIPETAKAN

    if (!per.has(k)) {
      per.set(k, {
        cost_code_id: cc?.id ?? null,
        code: cc?.code ?? '—',
        name: cc?.name ?? 'Belum dipetakan ke Cost Code',
        status: cc?.status ?? 'unmapped',
        pagu: cc ? (paguPerCc.get(cc.id) ?? 0) : 0,
        commitment: 0, actual: 0, exposure: 0,
        variance: null, serapan_pct: null, jumlah_kategori: 0,
      })
      katPer.set(k, new Set())
    }

    // `Number(null)` = 0 tapi `Number(undefined)` = NaN — dan satu NaN merusak
    // seluruh penjumlahan tanpa melempar error. Dijaga eksplisit.
    const nilai = Number(e.total_amount)
    per.get(k)!.actual += Number.isFinite(nilai) ? nilai : 0
    if (e.category_id) katPer.get(k)!.add(e.category_id)
  }

  for (const [k, baris] of per) {
    baris.jumlah_kategori = katPer.get(k)?.size ?? 0
    baris.exposure = baris.commitment + baris.actual
    // Pagu 0 diperlakukan "belum diketahui": RAP belum bisa memasok pagu
    // per-cost-code (jembatan resource↔cost_code belum ada). Menampilkan
    // variance = −exposure di situ akan membuat SEMUA baris tampak jebol.
    baris.variance = baris.pagu > 0 ? baris.pagu - baris.exposure : null
    baris.serapan_pct = baris.pagu > 0
      ? Number(((baris.exposure / baris.pagu) * 100).toFixed(1))
      : null
  }

  return [...per.values()].sort((a, b) => b.exposure - a.exposure)
}
