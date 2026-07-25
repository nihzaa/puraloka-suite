// CECEP Milestone 4 — RAB / BOQ read-model (murni, ber-test angka).
//
// RAB & BOQ adalah READ-MODEL (`37` §3, `49` M4): "merender Estimate Item jadi
// tampilan breakdown biaya — read-model, BUKAN tabel baru". Tidak ada persistensi;
// murni turunan dari Estimate Item (Milestone 3).
//
// Fungsi ini SENGAJA murni (tanpa DB) supaya angka finansialnya bisa diuji terhadap
// perhitungan manual — read-model yang salah hitung adalah "bohong senyap"
// (kelihatan benar, angkanya salah), dan itu yang harus dijaring.

export interface EstimateItemRow {
  cost_code_id: string
  cbs_node_id: string | null
  quantity: number | string
  amount: number | string
}

export interface RabLine {
  cost_code_id: string
  cbs_node_id: string | null
  quantity: number
  amount: number
}

export interface RabGroup {
  cbs_node_id: string | null   // null = belum terklasifikasi CBS
  subtotal: number
  lines: RabLine[]
}

export interface Rab {
  grand_total: number
  groups: RabGroup[]
}

const num = (v: number | string): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

/**
 * RAB = breakdown biaya dikelompokkan per CBS Node (kategori biaya), dengan
 * subtotal per grup dan grand total = Σ amount seluruh item.
 *
 * INVARIANT yang diuji: grand_total = Σ subtotal = Σ amount item. Tak ada
 * pembulatan tersembunyi; penjumlahan lurus (biaya konstruksi Rupiah, integer-ish).
 */
export function computeRab(items: EstimateItemRow[]): Rab {
  const byGroup = new Map<string, RabGroup>()

  for (const it of items) {
    const key = it.cbs_node_id ?? '__none__'
    let g = byGroup.get(key)
    if (!g) {
      g = { cbs_node_id: it.cbs_node_id ?? null, subtotal: 0, lines: [] }
      byGroup.set(key, g)
    }
    const amount = num(it.amount)
    g.lines.push({
      cost_code_id: it.cost_code_id,
      cbs_node_id: it.cbs_node_id ?? null,
      quantity: num(it.quantity),
      amount,
    })
    g.subtotal += amount
  }

  const groups = [...byGroup.values()]
  const grand_total = groups.reduce((s, g) => s + g.subtotal, 0)
  return { grand_total, groups }
}

export interface BoqLine {
  cost_code_id: string
  quantity: number
}

/**
 * BOQ = turunan RAB, KUANTITAS SAJA tanpa harga (`37` §3: "untuk dokumen tender ke
 * supplier"). Kuantitas per Cost Code diakumulasi (satu Cost Code bisa muncul di
 * beberapa item — mis. beda WBS/CBS — kuantitasnya dijumlahkan).
 *
 * SENGAJA tak memuat `amount` sama sekali — BOQ tak boleh membocorkan harga ke
 * dokumen supplier.
 */
export function computeBoq(items: EstimateItemRow[]): BoqLine[] {
  const byCode = new Map<string, number>()
  for (const it of items) {
    byCode.set(it.cost_code_id, (byCode.get(it.cost_code_id) ?? 0) + num(it.quantity))
  }
  return [...byCode.entries()].map(([cost_code_id, quantity]) => ({ cost_code_id, quantity }))
}
