import { describe, it, expect } from 'vitest'
import { computeRab, computeBoq, type EstimateItemRow } from './rab-readmodel.js'

// CECEP Milestone 4 — RAB/BOQ read-model: uji ANGKA terhadap hitungan manual.
// Read-model yang salah hitung = bohong senyap. Angka di sini dihitung tangan.

const CBS_A = 'cbs-aaaa'
const CBS_B = 'cbs-bbbb'
const CC1 = 'cc-1', CC2 = 'cc-2', CC3 = 'cc-3'

describe('computeRab — grand total & subtotal = hitungan manual', () => {
  it('3 item, 2 grup CBS: subtotal & grand total persis', () => {
    const items: EstimateItemRow[] = [
      { cost_code_id: CC1, cbs_node_id: CBS_A, quantity: 10, amount: 1_000_000 },
      { cost_code_id: CC2, cbs_node_id: CBS_A, quantity: 5, amount: 2_500_000 },
      { cost_code_id: CC3, cbs_node_id: CBS_B, quantity: 2, amount: 500_000 },
    ]
    const rab = computeRab(items)
    // MANUAL: grup A = 1.000.000 + 2.500.000 = 3.500.000; grup B = 500.000
    //         grand total = 3.500.000 + 500.000 = 4.000.000
    expect(rab.grand_total).toBe(4_000_000)
    const a = rab.groups.find(g => g.cbs_node_id === CBS_A)!
    const b = rab.groups.find(g => g.cbs_node_id === CBS_B)!
    expect(a.subtotal).toBe(3_500_000)
    expect(b.subtotal).toBe(500_000)
    expect(a.lines).toHaveLength(2)
    expect(b.lines).toHaveLength(1)
    // invariant: grand_total = Σ subtotal
    expect(rab.groups.reduce((s, g) => s + g.subtotal, 0)).toBe(rab.grand_total)
  })

  it('item tanpa CBS masuk grup null, tetap dihitung di grand total', () => {
    const items: EstimateItemRow[] = [
      { cost_code_id: CC1, cbs_node_id: CBS_A, quantity: 1, amount: 750_000 },
      { cost_code_id: CC2, cbs_node_id: null, quantity: 1, amount: 250_000 },
    ]
    const rab = computeRab(items)
    expect(rab.grand_total).toBe(1_000_000) // 750rb + 250rb
    expect(rab.groups.find(g => g.cbs_node_id === null)!.subtotal).toBe(250_000)
  })

  it('amount berbentuk string (numeric pg) dijumlahkan benar, bukan konkatenasi', () => {
    const items: EstimateItemRow[] = [
      { cost_code_id: CC1, cbs_node_id: CBS_A, quantity: '3', amount: '1500000' },
      { cost_code_id: CC2, cbs_node_id: CBS_A, quantity: '2', amount: '500000.50' },
    ]
    const rab = computeRab(items)
    // MANUAL: 1.500.000 + 500.000,50 = 2.000.000,50 (BUKAN "1500000500000.50")
    expect(rab.grand_total).toBe(2_000_000.5)
  })

  it('RAB kosong → grand total 0, nol grup', () => {
    const rab = computeRab([])
    expect(rab.grand_total).toBe(0)
    expect(rab.groups).toHaveLength(0)
  })

  it('nilai desimal Rupiah dijumlahkan tanpa drift', () => {
    const items: EstimateItemRow[] = [
      { cost_code_id: CC1, cbs_node_id: CBS_A, quantity: 1, amount: 333_333.33 },
      { cost_code_id: CC2, cbs_node_id: CBS_A, quantity: 1, amount: 333_333.33 },
      { cost_code_id: CC3, cbs_node_id: CBS_A, quantity: 1, amount: 333_333.34 },
    ]
    // MANUAL: 333333.33 + 333333.33 + 333333.34 = 1.000.000,00
    expect(computeRab(items).grand_total).toBeCloseTo(1_000_000, 2)
  })
})

describe('computeBoq — kuantitas per Cost Code, TANPA harga', () => {
  it('kuantitas Cost Code yang muncul berulang dijumlahkan', () => {
    const items: EstimateItemRow[] = [
      { cost_code_id: CC1, cbs_node_id: CBS_A, quantity: 10, amount: 1_000_000 },
      { cost_code_id: CC1, cbs_node_id: CBS_B, quantity: 15, amount: 1_500_000 }, // CC1 lagi, CBS beda
      { cost_code_id: CC2, cbs_node_id: CBS_A, quantity: 4, amount: 800_000 },
    ]
    const boq = computeBoq(items)
    // MANUAL: CC1 = 10 + 15 = 25; CC2 = 4
    expect(boq.find(l => l.cost_code_id === CC1)!.quantity).toBe(25)
    expect(boq.find(l => l.cost_code_id === CC2)!.quantity).toBe(4)
  })

  it('BOQ tidak pernah memuat field harga (dokumen supplier)', () => {
    const boq = computeBoq([{ cost_code_id: CC1, cbs_node_id: CBS_A, quantity: 5, amount: 999_999 }])
    expect(Object.keys(boq[0]).sort()).toEqual(['cost_code_id', 'quantity'])
    expect(JSON.stringify(boq)).not.toContain('999999')
  })
})
