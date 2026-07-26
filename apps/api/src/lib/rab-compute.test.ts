import { describe, it, expect } from 'vitest'
import {
  computeVolume, computeLaborCount, computeMaterialTakeoff, computeRabDocument,
  computeMaterialAggregation, computeDualUnit,
  type RabItemInput, type TakeoffLineInput,
} from './rab-compute.js'
import type { AhspComponent } from './ahsp-engine.js'

// GOLDEN-NUMBER PARITAS — angka PERSIS dari 'Format RAB Control' sheet DINDING BATA MERAH
// (volume r5-r20 + Kesimpulan r41-r43) & rantai LAPORAN RAB/REKAPITULASI.

describe('computeVolume — BOQ dgn pengurang bukaan (DINDING BATA MERAH)', () => {
  it('Total Luas 164,5 − Pengurang 55 = Volume 109,5 m2', () => {
    const areas = [
      { p: 20, l: 3.5, qty: 1 }, // 70
      { p: 10, l: 3.5, qty: 1 }, // 35
      { p: 2,  l: 3.5, qty: 5 }, // 35
      ...Array.from({ length: 7 }, () => ({ p: 1, l: 3.5, qty: 1 })), // 7 × 3.5 = 24.5
    ]
    const deductions = [
      { p: 2, l: 3,   qty: 1 }, // Jendela 6
      { p: 4, l: 3.5, qty: 1 }, // Pintu 14
      { p: 2, l: 3.5, qty: 5 }, // Ventilasi 35
    ]
    const r = computeVolume(areas, deductions)
    expect(r.grossArea).toBeCloseTo(164.5, 6)
    expect(r.deduction).toBeCloseTo(55, 6)
    expect(r.volume).toBeCloseTo(109.5, 6)
  })
})

describe('take-off — ROUNDUP kebutuhan (volume 109,5)', () => {
  it('Pekerja=4, Tukang=2 (ROUNDUP((vol×koef)/6 hari))', () => {
    expect(computeLaborCount(109.5, 0.2, 6)).toBe(4) // 3.65 → 4
    expect(computeLaborCount(109.5, 0.1, 6)).toBe(2) // 1.825 → 2
  })
  it('Bata=7875 buah, Semen=32 Zak (/50), Pasir=5 m3', () => {
    expect(computeMaterialTakeoff(109.5, 71.91)).toBe(7875)     // 7874.145 → 7875
    expect(computeMaterialTakeoff(109.5, 14.37, 50)).toBe(32)   // 31.4703 → 32
    expect(computeMaterialTakeoff(109.5, 0.04)).toBe(5)         // 4.38 → 5
  })
})

// Item AHSP untuk orchestrator (Pasangan bata, dari ahsp-engine golden).
const BATA_M: AhspComponent[] = [
  { group: 'tenaga', name: 'Pekerja',       unit: 'OH',   coefficient: 0.4,    hsd: 100000 },
  { group: 'tenaga', name: 'Tukang batu',   unit: 'OH',   coefficient: 0.2,    hsd: 145000 },
  { group: 'tenaga', name: 'Kepala tukang', unit: 'OH',   coefficient: 0.02,   hsd: 175000 },
  { group: 'tenaga', name: 'Mandor',        unit: 'OH',   coefficient: 0.0067, hsd: 200000 },
  { group: 'bahan',  name: 'Bata merah',    unit: 'buah', coefficient: 143.81, hsd: 700 },
  { group: 'bahan',  name: 'Semen (PC)',    unit: 'kg',   coefficient: 43.5,   hsd: 1300 },
  { group: 'bahan',  name: 'Pasir pasang',  unit: 'm3',   coefficient: 0.08,   hsd: 275000 },
]
const BATA_S: AhspComponent[] = [
  { group: 'tenaga', name: 'Pekerja',       unit: 'OH',   coefficient: 0.4,    hsd: 100000 },
  { group: 'tenaga', name: 'Tukang batu',   unit: 'OH',   coefficient: 0.2,    hsd: 145000 },
  { group: 'tenaga', name: 'Kepala tukang', unit: 'OH',   coefficient: 0.02,   hsd: 175000 },
  { group: 'tenaga', name: 'Mandor',        unit: 'OH',   coefficient: 0.0067, hsd: 200000 },
  { group: 'bahan',  name: 'Bata merah',    unit: 'buah', coefficient: 143.81, hsd: 700 },
  { group: 'bahan',  name: 'Semen (PC)',    unit: 'kg',   coefficient: 32.95,  hsd: 1300 },
  { group: 'bahan',  name: 'Pasir pasang',  unit: 'm3',   coefficient: 0.091,  hsd: 275000 },
]

describe('computeRabDocument — RAB end-to-end EKSAK (AHSP + lump-sum)', () => {
  const items: RabItemInput[] = [
    { code: '3.6.1.1', name: 'Bata merah 1SP:2PP', group: 'Pasangan', volume: 100, outputUnit: 'm2', components: BATA_M },
    { code: '3.6.1.2', name: 'Bata merah 1SP:3PP', group: 'Pasangan', volume: 50,  outputUnit: 'm2', components: BATA_S },
    { code: 'SMKK-01', name: 'Dokumen RKK',        group: 'SMKK',     volume: 1,   outputUnit: 'Ls', lumpSumHsp: 1_000_000 },
  ]
  const doc = computeRabDocument(items, {
    bukFraction: 0.1,
    rounding: { mode: 'down', step: 100 },      // SE-baku ROUNDDOWN Rp100
    ppn: { rate: 0.12, dppNum: 1, dppDen: 1 },  // paritas Excel (12% × DPP penuh)
  })

  it('HSP per item = rounded Excel; lump-sum apa adanya', () => {
    expect(doc.items[0].hspRounded).toBe(278300)
    expect(doc.items[1].hspRounded).toBe(266600)
    expect(doc.items[2].hspRounded).toBe(1_000_000)
  })
  it('total baris = Volume × HSP (rounded) — bilangan bulat eksak', () => {
    expect(doc.items[0].total).toBe(27_830_000)
    expect(doc.items[1].total).toBe(13_330_000)
    expect(doc.items[2].total).toBe(1_000_000)
  })
  it('subtotal kelompok + bobot% (base TOTAL BIAYA)', () => {
    expect(doc.groups[0]).toMatchObject({ name: 'Pasangan', subtotal: 41_160_000 })
    expect(doc.groups[1]).toMatchObject({ name: 'SMKK', subtotal: 1_000_000 })
    expect(doc.groups[0].bobotPct + doc.groups[1].bobotPct).toBeCloseTo(100, 9)
    expect(doc.groups[0].bobotPct).toBeCloseTo(97.62808, 4)
  })
  it('TOTAL BIAYA → PPN 12% → GRAND TOTAL eksak', () => {
    expect(doc.totalBiaya).toBe(42_160_000)
    expect(doc.ppn).toBeCloseTo(5_059_200, 6) // 42.160.000 × 0,12
    expect(doc.grandTotal).toBeCloseTo(47_219_200, 6)
  })
})

describe('computeMaterialAggregation — D2 (satu baris/resource, drill-down tertelusur)', () => {
  // Semen dipakai di 3 pekerjaan berbeda (kolom/balok/plesteran) → SATU baris teragregasi.
  const lines: TakeoffLineInput[] = [
    { estimateItemId: 'item-1', workName: 'Kolom K1', volume: 10, resourceId: 'r-semen', resourceName: 'Semen (PC)', unitCode: 'kg', coefficient: 43.5 },
    { estimateItemId: 'item-2', workName: 'Balok B1', volume: 20, resourceId: 'r-semen', resourceName: 'Semen (PC)', unitCode: 'kg', coefficient: 32.95 },
    { estimateItemId: 'item-3', workName: 'Plesteran', volume: 100, resourceId: 'r-semen', resourceName: 'Semen (PC)', unitCode: 'kg', coefficient: 7.776 },
    { estimateItemId: 'item-4', workName: 'Kolom K1', volume: 10, resourceId: 'r-bata', resourceName: 'Bata merah', unitCode: 'buah', coefficient: 143.81 },
  ]
  const agg = computeMaterialAggregation(lines)

  it('satu resource dipakai N item → SATU baris (bukan N baris)', () => {
    expect(agg).toHaveLength(2) // semen + bata, bukan 4
  })
  it('qtyAhsp = Σ(volume × coefficient) EKSAK', () => {
    const semen = agg.find(a => a.resourceId === 'r-semen')!
    // 10×43.5 + 20×32.95 + 100×7.776 = 435 + 659 + 777.6 = 1871.6
    expect(semen.qtyAhsp).toBeCloseTo(1871.6, 9)
  })
  it('drill-down: rincian per item asal tetap tertelusur ("kenapa semennya sebanyak ini")', () => {
    const semen = agg.find(a => a.resourceId === 'r-semen')!
    expect(semen.details).toHaveLength(3)
    expect(semen.details.find(d => d.estimateItemId === 'item-2')).toMatchObject({
      workName: 'Balok B1', volume: 20, coefficient: 32.95, subQty: 659,
    })
  })
  it('resource yang dipakai 1 item tetap 1 baris + 1 detail', () => {
    const bata = agg.find(a => a.resourceId === 'r-bata')!
    expect(bata.qtyAhsp).toBeCloseTo(1438.1, 9)
    expect(bata.details).toHaveLength(1)
  })
})

describe('computeDualUnit — D5 (satuan AHSP + satuan belanja, TANPA engine konversi)', () => {
  it('Semen 1.620 kg → 32,4 sak → ROUNDUP beli 33 sak (contoh desain persis)', () => {
    const r = computeDualUnit(1620, 'sak', 50) // factor 50kg/sak = data eksplisit Lapis 2
    expect(r.qtyAhsp).toBe(1620)       // TIDAK dibulatkan — kembali ke analisa kapan pun
    expect(r.qtyBuyRounded).toBe(33)   // ROUNDUP(1620/50) = ROUNDUP(32.4) = 33
  })
  it('pas habis (tanpa sisa) tidak dibulatkan naik palsu', () => {
    expect(computeDualUnit(1600, 'sak', 50).qtyBuyRounded).toBe(32)
  })
  it('packFactor <= 0 ditolak (nol tebak satuan tak valid)', () => {
    expect(() => computeDualUnit(100, 'sak', 0)).toThrow(/packFactor harus > 0/)
  })
})
