import { describe, it, expect } from 'vitest'
import {
  agregasiVarians, KUNCI_BELUM_DIPETAKAN,
  type CostCodeRef, type ExpenseInput,
} from '../varians-cost-code.js'

// ROADMAP #9 — test agregasi varians per Cost Code.
//
// Ini aritmetika uang: salah di sini menghasilkan laporan yang terlihat wajar
// tanpa satu pun error. Yang diuji bukan "fungsinya jalan", melainkan invariant
// yang kalau dilanggar membuat angkanya berbohong secara diam-diam.

const cc = (id: string, code: string, name = code): CostCodeRef =>
  ({ id, code, name, status: 'active' })

const beton = cc('cc-1', 'CC-SE47-beton', 'Beton')
const dinding = cc('cc-2', 'CC-SE47-pasangan-dinding', 'Pasangan Dinding')

/** Peta kategori → cost code, meniru hasil ACL migrasi 112. */
function peta(pasangan: Array<[string, CostCodeRef]>) {
  return new Map(pasangan)
}

describe('agregasiVarians', () => {
  it('tidak menghilangkan satu rupiah pun — Σ actual = Σ expense', () => {
    const expenses: ExpenseInput[] = [
      { category_id: 'kat-semen', total_amount: 1_000_000 },
      { category_id: 'kat-besi', total_amount: 2_500_000 },
      { category_id: 'kat-bata', total_amount: 750_000 },
      { category_id: null, total_amount: 300_000 },
    ]
    const baris = agregasiVarians(expenses, peta([
      ['kat-semen', beton], ['kat-besi', beton], ['kat-bata', dinding],
    ]))

    const total = baris.reduce((s, b) => s + b.actual, 0)
    expect(total).toBe(4_550_000)
  })

  it('merangkum beberapa kategori ke SATU baris cost code (rollup)', () => {
    // Migrasi 112 mengizinkan banyak kategori → satu cost code. Kalau rollup
    // gagal, "Beton" muncul dua kali dan pembaca menyimpulkan ada dua pos.
    const baris = agregasiVarians(
      [
        { category_id: 'kat-semen', total_amount: 1_000_000 },
        { category_id: 'kat-besi', total_amount: 2_500_000 },
      ],
      peta([['kat-semen', beton], ['kat-besi', beton]]),
    )

    expect(baris).toHaveLength(1)
    expect(baris[0].cost_code_id).toBe('cc-1')
    expect(baris[0].actual).toBe(3_500_000)
    expect(baris[0].jumlah_kategori).toBe(2)
  })

  it('belanja tanpa pemetaan MASUK sebagai baris tersendiri, tidak dibuang', () => {
    // Kegagalan paling berbahaya: belanja yang kategorinya belum dipetakan
    // hilang diam-diam, sehingga total laporan lebih kecil dari kenyataan dan
    // proyek tampak lebih hemat daripada aslinya.
    const baris = agregasiVarians(
      [
        { category_id: 'kat-semen', total_amount: 1_000_000 },
        { category_id: 'kat-entah', total_amount: 9_000_000 },
        { category_id: null, total_amount: 500_000 },
      ],
      peta([['kat-semen', beton]]),
    )

    const belum = baris.find((b) => b.cost_code_id === null)
    expect(belum).toBeDefined()
    expect(belum!.actual).toBe(9_500_000)
    expect(baris.reduce((s, b) => s + b.actual, 0)).toBe(10_500_000)
  })

  it('variance null saat pagu belum diketahui — BUKAN nol', () => {
    // Kalau pagu 0 diperlakukan sebagai angka nyata, variance = −exposure dan
    // SETIAP baris tampak jebol anggaran. Itu alarm palsu yang membuat laporan
    // ini diabaikan orang.
    const baris = agregasiVarians(
      [{ category_id: 'kat-semen', total_amount: 1_000_000 }],
      peta([['kat-semen', beton]]),
    )

    expect(baris[0].pagu).toBe(0)
    expect(baris[0].variance).toBeNull()
    expect(baris[0].serapan_pct).toBeNull()
  })

  it('menghitung variance & serapan saat pagu diketahui', () => {
    const baris = agregasiVarians(
      [{ category_id: 'kat-semen', total_amount: 7_500_000 }],
      peta([['kat-semen', beton]]),
      new Map([['cc-1', 10_000_000]]),
    )

    expect(baris[0].pagu).toBe(10_000_000)
    expect(baris[0].variance).toBe(2_500_000)
    expect(baris[0].serapan_pct).toBe(75)
  })

  it('variance NEGATIF saat pagu terlampaui — inti gunanya laporan ini', () => {
    const baris = agregasiVarians(
      [{ category_id: 'kat-semen', total_amount: 12_000_000 }],
      peta([['kat-semen', beton]]),
      new Map([['cc-1', 10_000_000]]),
    )

    expect(baris[0].variance).toBe(-2_000_000)
    expect(baris[0].serapan_pct).toBe(120)
  })

  it('nilai null/undefined/NaN dihitung 0, tidak meracuni seluruh baris', () => {
    // Satu NaN dalam penjumlahan membuat SELURUH total jadi NaN tanpa melempar
    // error — di UI muncul sebagai "Rp NaN" atau, lebih buruk, "Rp 0".
    const baris = agregasiVarians(
      [
        { category_id: 'kat-semen', total_amount: 1_000_000 },
        { category_id: 'kat-semen', total_amount: null },
        { category_id: 'kat-semen', total_amount: undefined as unknown as null },
        { category_id: 'kat-semen', total_amount: 'bukan-angka' as unknown as number },
      ],
      peta([['kat-semen', beton]]),
    )

    expect(baris[0].actual).toBe(1_000_000)
    expect(Number.isFinite(baris[0].actual)).toBe(true)
  })

  it('menerima angka dalam bentuk string (numeric Postgres lewat driver)', () => {
    // `NUMERIC` Postgres sampai ke JS sebagai string. Kalau tak ditangani,
    // '1000' + '2000' = '10002000' — kesalahan yang menghasilkan angka
    // besar dan meyakinkan.
    const baris = agregasiVarians(
      [
        { category_id: 'kat-semen', total_amount: '1000000' },
        { category_id: 'kat-semen', total_amount: '2000000' },
      ],
      peta([['kat-semen', beton]]),
    )

    expect(baris[0].actual).toBe(3_000_000)
  })

  it('mengurutkan dari exposure terbesar — yang paling berisiko di atas', () => {
    const baris = agregasiVarians(
      [
        { category_id: 'kat-bata', total_amount: 500_000 },
        { category_id: 'kat-semen', total_amount: 9_000_000 },
      ],
      peta([['kat-semen', beton], ['kat-bata', dinding]]),
    )

    expect(baris[0].code).toBe('CC-SE47-beton')
    expect(baris[1].code).toBe('CC-SE47-pasangan-dinding')
  })

  it('exposure = commitment + actual', () => {
    const baris = agregasiVarians(
      [{ category_id: 'kat-semen', total_amount: 4_000_000 }],
      peta([['kat-semen', beton]]),
    )
    expect(baris[0].exposure).toBe(baris[0].commitment + baris[0].actual)
  })

  it('daftar kosong menghasilkan nol baris, bukan error', () => {
    expect(agregasiVarians([], new Map())).toEqual([])
  })

  it('kunci "belum dipetakan" konsisten dengan yang diekspor', () => {
    const baris = agregasiVarians(
      [{ category_id: 'kat-asing', total_amount: 1 }], new Map())
    expect(baris[0].cost_code_id).toBeNull()
    expect(KUNCI_BELUM_DIPETAKAN).toBe('__belum_dipetakan__')
  })
})
