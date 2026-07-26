// RAB Compute (CECEP) — PURE, tanpa I/O. Melengkapi ahsp-engine dengan sisi VOLUME/BOQ,
// TAKE-OFF (kebutuhan bahan/tukang), dan ORCHESTRATOR RAB end-to-end.
//
// Referensi rumus: workbook 'Format RAB Control' sheet DINDING BATA MERAH (volume dgn
// pengurang bukaan + Kesimpulan ROUNDUP) + LAPORAN RAB/REKAPITULASI. Angka golden diuji
// di rab-compute.test.ts. Semua parameter di-INJECT (paritas-dulu).

import {
  applyRounding, computeAhsp, computeRabLineTotal, computePpn,
  type AhspComponent, type RoundingRule, type PpnConfig,
} from './ahsp-engine.js'

// ── BOQ / Volume ────────────────────────────────────────────────────────────
export interface VolumeSegment { p: number; l: number; qty: number } // Panjang × Lebar × Qty
export interface VolumeResult { grossArea: number; deduction: number; volume: number }

/**
 * Volume pekerjaan luasan = Σ(P×L×Qty) area − Σ(P×L×Qty) pengurang (bukaan pintu/jendela/
 * ventilasi). Meniru DINDING BATA MERAH r5-r20 (Total Luas − Total Pengurang).
 */
export function computeVolume(areas: VolumeSegment[], deductions: VolumeSegment[] = []): VolumeResult {
  const seg = (s: VolumeSegment) => s.p * s.l * s.qty
  const grossArea = areas.reduce((a, s) => a + seg(s), 0)
  const deduction = deductions.reduce((a, s) => a + seg(s), 0)
  return { grossArea, deduction, volume: grossArea - deduction }
}

// ── Take-off (kebutuhan) — ROUNDUP ke atas (Excel ROUNDUP(x,0)) ───────────────
const CEIL_1: RoundingRule = { mode: 'up', step: 1 }

/** Jumlah pekerja/tukang = ROUNDUP((volume × koef) / durasi hari). */
export function computeLaborCount(volume: number, coefficient: number, durationDays: number): number {
  if (durationDays <= 0) throw new Error('computeLaborCount: durationDays harus > 0')
  return applyRounding((volume * coefficient) / durationDays, CEIL_1)
}

/**
 * Kebutuhan material = ROUNDUP(volume × koef / packSize). `packSize` mengubah satuan
 * (mis. 50 kg → 1 zak semen). Default 1 (satuan resource langsung).
 */
export function computeMaterialTakeoff(volume: number, coefficient: number, packSize = 1): number {
  if (packSize <= 0) throw new Error('computeMaterialTakeoff: packSize harus > 0')
  return applyRounding((volume * coefficient) / packSize, CEIL_1)
}

// ── D2 — Agregasi material lintas item (satu baris/resource, tetap tertelusur) ─
// Rancangan MATERIAL-RAP-COMPANY-UI-DESIGN.md §D2: BUKAN disimpan mentah — view/
// komputasi dari (estimate_item × assembly_component). Satu resource dipakai N
// item (semen di kolom/balok/plesteran) → SATU baris teragregasi, dengan rincian
// drill-down "kenapa semennya sebanyak ini" (analog rollup RAB tapi sumbu =
// resource, bukan cost code).
export interface TakeoffLineInput {
  estimateItemId: string
  workName: string      // nama pekerjaan (assembly/cost_code) — utk drill-down
  volume: number         // quantity di estimate_items
  resourceId: string
  resourceName: string
  unitCode: string
  coefficient: number    // qty resource per 1 satuan-output assembly
}
export interface TakeoffDetail { estimateItemId: string; workName: string; volume: number; coefficient: number; subQty: number }
export interface MaterialAggregateLine {
  resourceId: string; resourceName: string; unitCode: string
  qtyAhsp: number         // Σ(volume × coefficient) — angka anggaran (D8: sudah mengandung waste)
  details: TakeoffDetail[]
}

export function computeMaterialAggregation(lines: TakeoffLineInput[]): MaterialAggregateLine[] {
  const byResource = new Map<string, MaterialAggregateLine>()
  for (const l of lines) {
    const subQty = l.volume * l.coefficient
    let agg = byResource.get(l.resourceId)
    if (!agg) {
      agg = { resourceId: l.resourceId, resourceName: l.resourceName, unitCode: l.unitCode, qtyAhsp: 0, details: [] }
      byResource.set(l.resourceId, agg)
    }
    agg.qtyAhsp += subQty
    agg.details.push({ estimateItemId: l.estimateItemId, workName: l.workName, volume: l.volume, coefficient: l.coefficient, subQty })
  }
  return [...byResource.values()]
}

// ── D5 — Dua satuan (satuan AHSP + satuan belanja) ───────────────────────────
// TANPA engine konversi (ADR-006): faktor kemasan = DATA EKSPLISIT per resource
// (material_pack: factor = qty-AHSP per 1 buy_unit; mis. semen 50kg/zak → factor=50).
// Pembulatan KE ATAS hanya di angka belanja — qty_ahsp TIDAK dibulatkan (kembali ke
// analisa kapan pun). Paralel pola hsp_raw/hsp_rounded: simpan KEDUA, jangan campur.
export interface DualUnitResult { qtyAhsp: number; buyUnitCode: string; qtyBuyRounded: number }

export function computeDualUnit(qtyAhsp: number, buyUnitCode: string, packFactor: number): DualUnitResult {
  if (packFactor <= 0) throw new Error('computeDualUnit: packFactor harus > 0')
  return { qtyAhsp, buyUnitCode, qtyBuyRounded: applyRounding(qtyAhsp / packFactor, CEIL_1) }
}

// ── Orchestrator RAB end-to-end ──────────────────────────────────────────────
export interface RabItemInput {
  code: string
  name: string
  group: string        // kelompok/divisi untuk rekap & bobot
  volume: number
  outputUnit: string
  components?: AhspComponent[] // item AHSP (dihitung Σκoef×HSD)
  lumpSumHsp?: number          // item lump-sum (SMKK/preliminaries) — HSP langsung, tanpa AHSP
}

export interface RabItemResult {
  code: string; name: string; group: string; volume: number; outputUnit: string
  hspRaw: number; hspRounded: number; total: number
}

export interface RabDocumentResult {
  items: RabItemResult[]
  groups: { name: string; subtotal: number; bobotPct: number }[]
  totalBiaya: number
  ppn: number
  grandTotal: number
}

export interface RabComputeOptions {
  bukFraction: number
  rounding: RoundingRule
  ppn: PpnConfig
}

/**
 * Hitung dokumen RAB penuh: tiap item → HSP (AHSP atau lump-sum) → total (Vol×HSP rounded)
 * → subtotal per kelompok → TOTAL BIAYA → PPN → GRAND TOTAL, plus bobot% per kelompok.
 * Bobot base = TOTAL BIAYA (sebelum PPN), sesuai `LAPORAN RAB` (`grup/$H$488×100`).
 * Rantai dokumen memakai `hspRounded` (§j) → eksak sampai rupiah.
 */
export function computeRabDocument(items: RabItemInput[], opts: RabComputeOptions): RabDocumentResult {
  const itemResults: RabItemResult[] = items.map(it => {
    let hspRaw: number
    let hspRounded: number
    if (it.lumpSumHsp !== undefined) {
      hspRaw = it.lumpSumHsp
      hspRounded = it.lumpSumHsp // lump-sum: harga apa adanya, tak lewat AHSP/pembulatan
    } else {
      const a = computeAhsp(it.components ?? [], opts.bukFraction, opts.rounding)
      hspRaw = a.hspRaw
      hspRounded = a.hspRounded
    }
    return {
      code: it.code, name: it.name, group: it.group, volume: it.volume, outputUnit: it.outputUnit,
      hspRaw, hspRounded, total: computeRabLineTotal(it.volume, hspRounded),
    }
  })

  // Subtotal per kelompok (urut kemunculan pertama, seperti sheet).
  const order: string[] = []
  const byGroup = new Map<string, number>()
  for (const r of itemResults) {
    if (!byGroup.has(r.group)) { byGroup.set(r.group, 0); order.push(r.group) }
    byGroup.set(r.group, byGroup.get(r.group)! + r.total)
  }
  const totalBiaya = itemResults.reduce((a, r) => a + r.total, 0)
  const ppn = computePpn(totalBiaya, opts.ppn)
  const groups = order.map(name => {
    const subtotal = byGroup.get(name)!
    return { name, subtotal, bobotPct: totalBiaya === 0 ? 0 : (subtotal / totalBiaya) * 100 }
  })

  return { items: itemResults, groups, totalBiaya, ppn, grandTotal: totalBiaya + ppn }
}
