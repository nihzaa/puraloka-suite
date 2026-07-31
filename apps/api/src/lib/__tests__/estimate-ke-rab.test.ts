import { describe, it, expect } from 'vitest'
import { petakanKeRab, type ItemEstimasi } from '../estimate-ke-rab.js'

// Test pemetaan Estimate → rab_items.
//
// Yang diuji adalah hal-hal yang kalau salah menghasilkan RAB proyek yang
// angkanya berbeda dari estimasi asalnya — tanpa satu pun error. Bobot yang
// tidak berjumlah 100 membuat progress proyek tak pernah mencapai 100%; harga
// satuan Infinity lolos ke DB sebagai nilai yang tak masuk akal.

const item = (nama: string, qty: number, amount: number, extra: Partial<ItemEstimasi> = {}): ItemEstimasi =>
  ({ id: nama, nama, kode: null, unit: 'm2', quantity: qty, amount, ...extra })

describe('petakanKeRab', () => {
  it('tidak mengubah satu rupiah pun — Σ total_price = Σ amount', () => {
    const baris = petakanKeRab([
      item('Pasangan bata', 100, 5_000_000),
      item('Plesteran', 200, 3_000_000),
      item('Pengecatan', 150, 1_500_000),
    ])
    expect(baris.reduce((s, b) => s + (b.total_price ?? 0), 0)).toBe(9_500_000)
  })

  it('Σ weight_pct PERSIS 100 — baris terakhir menyerap sisa pembulatan', () => {
    // Tiga bagian sama besar → 33,33 masing-masing = 99,99. Kalau sisanya tak
    // diserap, progress proyek mentok di 99,99% meski semua pekerjaan selesai.
    const baris = petakanKeRab([
      item('A', 1, 1_000_000), item('B', 1, 1_000_000), item('C', 1, 1_000_000),
    ])
    expect(baris.reduce((s, b) => s + b.weight_pct, 0)).toBe(100)
  })

  it('bobot proporsional terhadap nilai', () => {
    const baris = petakanKeRab([item('Besar', 1, 7_500_000), item('Kecil', 1, 2_500_000)])
    expect(baris[0].weight_pct).toBe(75)
    expect(baris[1].weight_pct).toBe(25)
  })

  it('unit_price = amount / quantity', () => {
    expect(petakanKeRab([item('X', 40, 2_600_000)])[0].unit_price).toBe(65_000)
  })

  it('quantity 0 → unit_price 0, BUKAN Infinity', () => {
    // Infinity lolos ke DB sebagai nilai tak masuk akal yang jauh lebih sulit
    // terdeteksi daripada nol.
    const b = petakanKeRab([item('X', 0, 1_000_000)])[0]
    expect(b.unit_price).toBe(null)
    expect(Number.isFinite(b.unit_price ?? 0)).toBe(true)
  })

  it('menerima NUMERIC berbentuk string dari Postgres', () => {
    const b = petakanKeRab([
      { id: '1', nama: 'X', kode: null, unit: 'm2', quantity: '40', amount: '2600000' },
    ])[0]
    expect(b.qty).toBe(40)
    expect(b.total_price).toBe(2_600_000)
    expect(b.unit_price).toBe(65_000)
  })

  it('komponen biaya dinormalisasi ke 100 saat groupTotals ada', () => {
    // Constraint DB `rab_items_pct_sum` menolak total di luar 0 atau 99.9–100.1,
    // dan penolakannya terjadi saat INSERT — seluruh penerapan gagal.
    const b = petakanKeRab([
      item('X', 1, 100_000, { group_totals: { bahan: 60_000, tenaga: 30_000, alat: 10_000 } }),
    ])[0]
    expect(b.material_pct + b.upah_pct + b.alat_pct + b.other_pct).toBe(100)
    expect(b.material_pct).toBe(60)
    expect(b.upah_pct).toBe(30)
  })

  it('komponen biaya NOL saat groupTotals tak ada — tidak menebak', () => {
    // Hanya 1 dari 1.591 estimate_items punya hsp_snapshot. Menebak proporsinya
    // akan menghasilkan angka yang dipakai orang seolah hasil hitungan.
    const b = petakanKeRab([item('X', 1, 100_000)])[0]
    expect(b.material_pct + b.upah_pct + b.alat_pct + b.other_pct).toBe(0)
  })

  it('groupTotals yang semuanya nol tetap menghasilkan nol (bukan NaN)', () => {
    const b = petakanKeRab([
      item('X', 1, 100_000, { group_totals: { bahan: 0, tenaga: 0, alat: 0 } }),
    ])[0]
    expect(b.material_pct).toBe(0)
    expect(Number.isNaN(b.upah_pct)).toBe(false)
  })

  it('groupTotals satu kelompok saja → 100% di kelompok itu', () => {
    const b = petakanKeRab([
      item('Upah borongan', 1, 79_200, { group_totals: { bahan: 0, tenaga: 79_200, alat: 0 } }),
    ])[0]
    expect(b.upah_pct).toBe(100)
    expect(b.material_pct + b.upah_pct + b.alat_pct + b.other_pct).toBe(100)
  })

  it('semua baris level "item" — bukan category', () => {
    // Kurva S & bubble-up progress hanya menjumlahkan level='item'. Menaruhnya
    // di level lain membuat progress proyek selalu nol.
    petakanKeRab([item('A', 1, 1), item('B', 1, 1)]).forEach((b) => {
      expect(b.level).toBe('item')
    })
  })

  it('mempertahankan urutan asli', () => {
    const baris = petakanKeRab([item('Pertama', 1, 1), item('Kedua', 1, 1)])
    expect(baris[0].name).toBe('Pertama')
    expect(baris[0].sort_order).toBe(0)
    expect(baris[1].sort_order).toBe(1)
  })

  it('total nol → semua bobot nol, tanpa pembagian dengan nol', () => {
    const baris = petakanKeRab([item('A', 1, 0), item('B', 1, 0)])
    expect(baris.every((b) => b.weight_pct === 0)).toBe(true)
  })

  it('daftar kosong menghasilkan nol baris', () => {
    expect(petakanKeRab([])).toEqual([])
  })
})
