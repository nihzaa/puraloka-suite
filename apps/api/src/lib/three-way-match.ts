// 3-way match PO–GR–Invoice (PETA-PRIORITAS-ERP §3 item #2).
// Fungsi murni ber-test — rumus finansial tetap kode [C], bukan config.
//
// Prinsip: nilai tagihan supplier divalidasi terhadap NILAI GR PADA HARGA PO
// (qty yang benar-benar diterima × harga yang disepakati di PO). Harga aktual
// di goods_receipt_items sengaja TIDAK dipakai sebagai basis — selisih harga
// terima vs PO justru hal yang harus tertangkap, bukan diloloskan.

export interface GrItemForMatch {
  po_item_id: string
  qty_received: number | string
}

export interface PoItemForMatch {
  id: string
  unit_price: number | string
}

/** Toleransi pembulatan DECIMAL(15,2) — 1 sen, bukan parameter bisnis. */
export const MATCH_EPSILON = 0.01

/** Nilai GR pada harga PO: Σ qty_received × unit_price PO per item. */
export function grValueAtPoPrices(
  grItems: GrItemForMatch[],
  poItems: PoItemForMatch[]
): number {
  const priceByPoItem = new Map(poItems.map(p => [p.id, Number(p.unit_price)]))
  return grItems.reduce((sum, gi) => {
    const price = priceByPoItem.get(gi.po_item_id) ?? 0
    return sum + Number(gi.qty_received) * price
  }, 0)
}

export interface InvoiceCeilingVerdict {
  ok: boolean
  /** Selisih tagihan di atas nilai match (0 jika ok). */
  excess: number
}

/**
 * Invoice tidak boleh MELEBIHI nilai GR pada harga PO (overbilling = kebocoran
 * yang dijaga). Tagihan di bawah nilai match diizinkan (diskon/pembulatan turun
 * oleh supplier).
 */
export function validateInvoiceCeiling(
  totalAmount: number,
  matchValue: number,
  epsilon: number = MATCH_EPSILON
): InvoiceCeilingVerdict {
  const excess = totalAmount - matchValue
  if (excess > epsilon) return { ok: false, excess }
  return { ok: true, excess: 0 }
}
