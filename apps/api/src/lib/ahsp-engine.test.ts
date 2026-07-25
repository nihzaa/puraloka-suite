import { describe, it, expect } from 'vitest'
import {
  computeAhsp, applyRounding, computePpn, computeRabLineTotal, computeRabRollup,
  type AhspComponent, type RoundingRule,
} from './ahsp-engine.js'

// GOLDEN-NUMBER PARITAS — angka diambil PERSIS dari workbook AHSP SE 47/2026
// (sheet 'Pasangan Dinding' + 'REKAPITULASI'), bukan diketik ulang bebas. Disiplin M4:
// hasil engine dibandingkan dgn hitungan manual yang di-hardcode di sini.
//
// PARITAS DULU: default meniru file utama (ROUNDDOWN Rp100; agregat desimal penuh).
// Rantai dokumen (dari hspRounded) HARUS eksak sampai rupiah.

// SNI/SE-baku: HSP dibulatkan ROUNDDOWN ke Rp100.
const ROUND_100: RoundingRule = { mode: 'down', step: 100 }
const BUK = 0.1 // Biaya Umum & Keuntungan 10% (L5 di blok)

// ── Blok 3.6.1.1 — Pasangan bata merah 1 batu, mortar M (1SP:2PP), output m2 ──
// Angka mentah dari 'Pasangan Dinding' r8-r22 (koef G, HSD hasil VLOOKUP upahbahan).
const BATA_M: AhspComponent[] = [
  { group: 'tenaga', name: 'Pekerja',       unit: 'OH',   coefficient: 0.4,    hsd: 100000 }, // 40000
  { group: 'tenaga', name: 'Tukang batu',   unit: 'OH',   coefficient: 0.2,    hsd: 145000 }, // 29000
  { group: 'tenaga', name: 'Kepala tukang', unit: 'OH',   coefficient: 0.02,   hsd: 175000 }, // 3500
  { group: 'tenaga', name: 'Mandor',        unit: 'OH',   coefficient: 0.0067, hsd: 200000 }, // 1340
  { group: 'bahan',  name: 'Bata merah',    unit: 'buah', coefficient: 143.81, hsd: 700 },    // 100667
  { group: 'bahan',  name: 'Semen (PC)',    unit: 'kg',   coefficient: 43.5,   hsd: 1300 },   // 56550
  { group: 'bahan',  name: 'Pasir pasang',  unit: 'm3',   coefficient: 0.08,   hsd: 275000 }, // 22000
]

// ── Blok 3.6.1.2 — mortar S (1SP:3PP) — beda koef bahan (Semen 32.95, Pasir 0.091) ──
const BATA_S: AhspComponent[] = [
  { group: 'tenaga', name: 'Pekerja',       unit: 'OH',   coefficient: 0.4,    hsd: 100000 },
  { group: 'tenaga', name: 'Tukang batu',   unit: 'OH',   coefficient: 0.2,    hsd: 145000 },
  { group: 'tenaga', name: 'Kepala tukang', unit: 'OH',   coefficient: 0.02,   hsd: 175000 },
  { group: 'tenaga', name: 'Mandor',        unit: 'OH',   coefficient: 0.0067, hsd: 200000 },
  { group: 'bahan',  name: 'Bata merah',    unit: 'buah', coefficient: 143.81, hsd: 700 },    // 100667
  { group: 'bahan',  name: 'Semen (PC)',    unit: 'kg',   coefficient: 32.95,  hsd: 1300 },   // 42835
  { group: 'bahan',  name: 'Pasir pasang',  unit: 'm3',   coefficient: 0.091,  hsd: 275000 }, // 25025
]

describe('computeAhsp — analisa HSP cocok PERSIS dengan Excel', () => {
  it('3.6.1.1: ΣA=73840, ΣB=179217, D=253057, E=25305.7, F=278362.7, HSP=278300', () => {
    const r = computeAhsp(BATA_M, BUK, ROUND_100)
    expect(r.groupTotals.tenaga).toBeCloseTo(73840, 4)
    expect(r.groupTotals.bahan).toBeCloseTo(179217, 4)
    expect(r.groupTotals.alat).toBe(0)
    expect(r.subtotalD).toBeCloseTo(253057, 4)
    expect(r.bukAmount).toBeCloseTo(25305.7, 4)
    expect(r.hspRaw).toBeCloseTo(278362.7, 4)
    expect(r.hspRounded, 'HSP rantai dokumen = ROUNDDOWN(278362.7,-2)').toBe(278300) // EKSAK
  })

  it('3.6.1.2: D=242367, E=24236.7, F=266603.7, HSP=266600', () => {
    const r = computeAhsp(BATA_S, BUK, ROUND_100)
    expect(r.groupTotals.bahan).toBeCloseTo(168527, 4) // 100667+42835+25025
    expect(r.subtotalD).toBeCloseTo(242367, 4)
    expect(r.hspRaw).toBeCloseTo(266603.7, 4)
    expect(r.hspRounded).toBe(266600) // EKSAK
  })

  it('metode Control (tanpa pembulatan): hspRounded === hspRaw', () => {
    const r = computeAhsp(BATA_M, BUK, { mode: 'none', step: 0 })
    expect(r.hspRounded).toBe(r.hspRaw)
    expect(r.hspRounded).not.toBe(278300) // membuktikan pembulatan itu yang membedakan
  })
})

describe('applyRounding — ROUNDDOWN Excel (truncate menuju nol)', () => {
  it('278362.7 → 278300 (ke Rp100)', () => expect(applyRounding(278362.7, ROUND_100)).toBe(278300))
  it('266603.7 → 266600', () => expect(applyRounding(266603.7, ROUND_100)).toBe(266600))
  it("mode 'none' → tak berubah", () => expect(applyRounding(146308.162, { mode: 'none', step: 0 })).toBe(146308.162))
  it('ROUNDDOWN memangkas ke BAWAH (bukan pembulatan terdekat)', () =>
    expect(applyRounding(278399.99, ROUND_100)).toBe(278300))
})

describe('computePpn — paritas Excel + koreksi DPP nilai lain (D1) tanpa drift (D10)', () => {
  const TOTAL_BIAYA = 1657839590.3853106 // REKAPITULASI!E18

  it('PARITAS: dpp_factor 1/1 → PPN = TOTAL×0,12 = 198.940.750,846 (Excel E19)', () => {
    const ppn = computePpn(TOTAL_BIAYA, { rate: 0.12, dppNum: 1, dppDen: 1 })
    expect(ppn).toBeCloseTo(198940750.84623727, 3)
    expect(TOTAL_BIAYA + ppn).toBeCloseTo(1856780341.2315478, 3) // E20 grand total
  })

  it('KOREKSI (konstruksi 11/12): efektif 11%, dihitung rasional TANPA drift', () => {
    const correct = computePpn(TOTAL_BIAYA, { rate: 0.12, dppNum: 11, dppDen: 12 })
    // Nilai benar = efektif 11% (rasional 11/100).
    expect(correct).toBeCloseTo(TOTAL_BIAYA * 0.11, 2)
    // Pendekatan TERLARANG (dpp_factor dibulatkan 0,916667) melenceng ~Rp66 → bukti
    // kenapa 11/12 wajib rasional (D10), bukan desimal terbatas.
    const naiveTruncated = TOTAL_BIAYA * 0.12 * 0.916667
    expect(Math.abs(naiveTruncated - correct)).toBeGreaterThan(60)
    expect(Math.abs(naiveTruncated - correct)).toBeLessThan(75)
  })
})

describe('Rantai dokumen (dari HSP rounded) — EKSAK sampai rupiah', () => {
  it('mini-RAB 2 item → subtotal, total, PPN, grand total bilangan bulat eksak', () => {
    // HSP rounded (integer) × volume (integer) = rantai dokumen eksak (§j).
    const a = computeRabLineTotal(100, 278300) // 27.830.000
    const b = computeRabLineTotal(50, 266600)  // 13.330.000
    expect(a).toBe(27_830_000)
    expect(b).toBe(13_330_000)

    const roll = computeRabRollup(
      [{ name: 'Pasangan Dinding', lineTotals: [a, b] }],
      { rate: 0.12, dppNum: 1, dppDen: 1 }, // paritas Excel
    )
    expect(roll.groups[0].subtotal).toBe(41_160_000)
    expect(roll.totalBiaya).toBe(41_160_000)
    expect(roll.ppn).toBeCloseTo(4_939_200, 6) // 41.160.000 × 0,12
    expect(roll.grandTotal).toBeCloseTo(46_099_200, 6)
  })
})
