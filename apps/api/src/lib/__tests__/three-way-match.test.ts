import { describe, it, expect } from 'vitest'
import { grValueAtPoPrices, validateInvoiceCeiling, MATCH_EPSILON } from '../three-way-match.js'

// 3-way match PO–GR–Invoice — basis validasi tagihan supplier.
// Angka mengikuti realita procurement: qty DECIMAL(15,3), uang DECIMAL(15,2).

describe('grValueAtPoPrices', () => {
  it('menilai GR pada HARGA PO, bukan harga aktual GR (inti 3-way match)', () => {
    // GR menerima 50 sak; PO menyepakati 65.000/sak — nilai match = 3.250.000
    // walau supplier menulis harga lain di surat jalan.
    const v = grValueAtPoPrices(
      [{ po_item_id: 'poi-1', qty_received: 50 }],
      [{ id: 'poi-1', unit_price: 65000 }]
    )
    expect(v).toBe(3_250_000)
  })

  it('menjumlahkan multi-item dengan harga PO masing-masing', () => {
    const v = grValueAtPoPrices(
      [
        { po_item_id: 'poi-1', qty_received: 10 },
        { po_item_id: 'poi-2', qty_received: 2.5 },
      ],
      [
        { id: 'poi-1', unit_price: 65000 },
        { id: 'poi-2', unit_price: 120000 },
      ]
    )
    expect(v).toBe(650_000 + 300_000)
  })

  it('menerima numerik string (representasi DECIMAL dari Postgres/Supabase)', () => {
    const v = grValueAtPoPrices(
      [{ po_item_id: 'poi-1', qty_received: '12.500' }],
      [{ id: 'poi-1', unit_price: '10000.00' }]
    )
    expect(v).toBe(125_000)
  })

  it('item GR tanpa pasangan PO item dinilai 0 (fail-closed: tidak menambah plafon)', () => {
    const v = grValueAtPoPrices(
      [{ po_item_id: 'poi-hilang', qty_received: 99 }],
      [{ id: 'poi-1', unit_price: 65000 }]
    )
    expect(v).toBe(0)
  })

  it('GR kosong bernilai 0', () => {
    expect(grValueAtPoPrices([], [])).toBe(0)
  })
})

describe('validateInvoiceCeiling', () => {
  it('POSITIF: tagihan sama persis dengan nilai match → lolos', () => {
    expect(validateInvoiceCeiling(3_250_000, 3_250_000)).toEqual({ ok: true, excess: 0 })
  })

  it('POSITIF: tagihan di bawah nilai match (diskon supplier) → lolos', () => {
    expect(validateInvoiceCeiling(3_000_000, 3_250_000).ok).toBe(true)
  })

  it('POSITIF: selisih pembulatan ≤ epsilon → lolos', () => {
    expect(validateInvoiceCeiling(100.009, 100, MATCH_EPSILON).ok).toBe(true)
  })

  it('NEGATIF: tagihan melebihi nilai match → ditolak dengan besaran selisih', () => {
    const r = validateInvoiceCeiling(3_600_000, 3_250_000)
    expect(r.ok).toBe(false)
    expect(r.excess).toBe(350_000)
  })

  it('NEGATIF: nilai match 0 (harga PO belum diisi) + tagihan positif → ditolak', () => {
    // Deny-by-default: tanpa harga PO tidak ada basis validasi, tagihan ditolak.
    expect(validateInvoiceCeiling(1_000, 0).ok).toBe(false)
  })

  it('epsilon custom dihormati', () => {
    expect(validateInvoiceCeiling(101, 100, 5).ok).toBe(true)
    expect(validateInvoiceCeiling(106, 100, 5).ok).toBe(false)
  })
})
