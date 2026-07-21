import { describe, it, expect } from 'vitest'
import { calculateTax, TAX_RATE_BY_SCHEME } from '../tax-calculation'

// Task 1.2.1 — test case wajib per Phase1/06-test-strategy.md § Unit Test:
// skema PPN, skema PPh-final, edge case nominal nol/negatif harus reject.

describe('calculateTax', () => {
  it('menghitung pajak PPN (0.11) dengan benar', () => {
    const result = calculateTax(1000000, 'ppn')
    expect(result.taxRate).toBe(0.11)
    expect(result.taxAmount).toBe(110000)
    expect(result.totalAmount).toBe(1110000)
  })

  it('menghitung pajak PPh-final (0.02) dengan benar', () => {
    const result = calculateTax(1000000, 'pph_final')
    expect(result.taxRate).toBe(0.02)
    expect(result.taxAmount).toBe(20000)
    expect(result.totalAmount).toBe(1020000)
  })

  it('skema selain "ppn" diperlakukan sebagai pph_final (identik perilaku kode asal)', () => {
    const result = calculateTax(1000000, null)
    expect(result.taxRate).toBe(TAX_RATE_BY_SCHEME.pph_final)
  })

  it('skema undefined diperlakukan sebagai pph_final', () => {
    const result = calculateTax(1000000, undefined)
    expect(result.taxRate).toBe(TAX_RATE_BY_SCHEME.pph_final)
  })

  it('menolak nominal nol (bukan menghitung diam-diam)', () => {
    expect(() => calculateTax(0, 'ppn')).toThrow()
  })

  it('menolak nominal negatif (bukan menghitung diam-diam)', () => {
    expect(() => calculateTax(-500000, 'ppn')).toThrow()
  })

  it('menolak NaN', () => {
    expect(() => calculateTax(NaN, 'ppn')).toThrow()
  })

  it('membulatkan ke 2 desimal, identik dengan parseFloat(toFixed(2)) di kode asal', () => {
    const result = calculateTax(333333.33, 'ppn')
    expect(result.taxAmount).toBe(36666.67)
    expect(result.totalAmount).toBe(370000) // 333333.33 + 36666.67, dibulatkan toFixed(2)
  })
})
