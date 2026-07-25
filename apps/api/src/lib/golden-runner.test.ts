import { describe, it, expect } from 'vitest'
import { runGolden, type GoldenFixture } from './golden-runner.js'
import type { RabItemInput } from './rab-compute.js'
import type { AhspComponent } from './ahsp-engine.js'

// Membuktikan HARNESS itu sendiri: menerima angka BENAR, MENOLAK angka salah (bukan
// stempel), dan menghormati deklarasi METODE (SNI-ROUNDDOWN vs Control-unrounded).

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
const ITEMS: RabItemInput[] = [
  { code: '3.6.1.1', name: 'Bata 1SP:2PP', group: 'Pasangan', volume: 100, outputUnit: 'm2', components: BATA_M },
  { code: '3.6.1.2', name: 'Bata 1SP:3PP', group: 'Pasangan', volume: 50,  outputUnit: 'm2', components: BATA_S },
  { code: 'SMKK-01', name: 'Dokumen RKK',  group: 'SMKK',     volume: 1,   outputUnit: 'Ls', lumpSumHsp: 1_000_000 },
]

// Metode SE-baku: ROUNDDOWN Rp100 + PPN 12% × DPP penuh (paritas Excel).
const SNI: GoldenFixture['method'] = {
  rounding: { mode: 'down', step: 100 }, bukFraction: 0.1, ppn: { rate: 0.12, dppNum: 1, dppDen: 1 },
}

describe('runGolden — MENERIMA angka benar (metode SNI ROUNDDOWN)', () => {
  const fixture: GoldenFixture = {
    name: 'RAB-sintetis-SNI', method: SNI, items: ITEMS,
    expected: {
      items: [
        { code: '3.6.1.1', hspRounded: 278300, total: 27_830_000 },
        { code: '3.6.1.2', hspRounded: 266600, total: 13_330_000 },
      ],
      groups: [{ name: 'Pasangan', subtotal: 41_160_000 }, { name: 'SMKK', subtotal: 1_000_000 }],
      totalBiaya: 42_160_000, ppn: 5_059_200, grandTotal: 47_219_200,
    },
  }
  it('semua level lolos → passed=true, failedCount=0', () => {
    const r = runGolden(fixture)
    expect(r.passed, JSON.stringify(r.checks.filter(c => !c.pass))).toBe(true)
    expect(r.failedCount).toBe(0)
    expect(r.checks.length).toBeGreaterThanOrEqual(7)
  })
})

describe('runGolden — MENOLAK angka salah (bukan stempel)', () => {
  it('totalBiaya meleset Rp1 → passed=false, diff terlihat', () => {
    const bad: GoldenFixture = {
      name: 'RAB-salah', method: SNI, items: ITEMS,
      expected: { totalBiaya: 42_160_001 }, // seharusnya 42.160.000
    }
    const r = runGolden(bad)
    expect(r.passed).toBe(false)
    const c = r.checks.find(c => c.level === 'totalBiaya')!
    expect(c.diff).toBe(-1)           // actual 42.160.000 − expected 42.160.001
    expect(c.pass).toBe(false)
  })
  it('item yang di-expect tapi tak ada → gagal (item.missing)', () => {
    const r = runGolden({ name: 'x', method: SNI, items: ITEMS, expected: { items: [{ code: 'GHOST', total: 1 }] } })
    expect(r.passed).toBe(false)
    expect(r.checks.some(c => c.level === 'item.missing')).toBe(true)
  })
})

describe('runGolden — METODE mengubah hasil (beda-metode, bukan bug)', () => {
  it('Control-unrounded: HSP tak dibulatkan (278362,7), beda dari SNI (278300)', () => {
    const control: GoldenFixture = {
      name: 'RAB-control', tolerance: 0.02,
      method: { rounding: { mode: 'none', step: 0 }, bukFraction: 0.1, ppn: { rate: 0.12, dppNum: 1, dppDen: 1 } },
      items: ITEMS,
      expected: { items: [{ code: '3.6.1.1', hspRounded: 278362.7, total: 27_836_270 }], totalBiaya: 42_166_455 },
    }
    const r = runGolden(control)
    expect(r.passed, JSON.stringify(r.checks.filter(c => !c.pass))).toBe(true)
    // Angka Control (278362,7) TIDAK sama dgn SNI (278300) → metode benar-benar membedakan.
    expect(runGolden({ ...control, expected: { items: [{ code: '3.6.1.1', hspRounded: 278300 }] } }).passed).toBe(false)
  })
})
