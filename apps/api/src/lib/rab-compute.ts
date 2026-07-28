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

// ── D3 — BBS besi per DIAMETER (jalur geometri, TERPISAH dari koef AHSP) ──────
// Desain §D3: diameter hidup di level ITEM + BBS, BUKAN di analisa AHSP (yang
// per-kg). Take-off AHSP besi = kg KASAR anggaran; BBS = kg PRESISI per Ø.
//
// Faktor berat kg/m = REBAR_KG_PER_M_FACTOR × d²(mm). Konstanta 0,006165 adalah
// Lapis 2 (data referensi fisik): turunan ρ baja 7850 kg/m³ × π/4 ÷ 10⁶ =
// 0,0061654 — diverifikasi cocok tabel baku SNI (D10 0,617 · D16 1,578 · D25
// 3,853) sampai 3-4 desimal. BUKAN angka bisnis, BUKAN karangan.
export const REBAR_KG_PER_M_FACTOR = 0.006165

/** kg/m batang tulangan polos/sirip diameter d (mm). */
export function rebarWeightPerM(diameterMm: number, factor = REBAR_KG_PER_M_FACTOR): number {
  if (diameterMm <= 0) throw new Error('rebarWeightPerM: diameterMm harus > 0')
  return factor * diameterMm * diameterMm
}

export interface RebarBarInput {
  rebarType: 'BjTP' | 'BjTS'
  diameterMm: number
  barCount: number
  lengthPerBarM: number
  /** kg/m eksplisit (bila ingin override konstanta, mis. angka historis tersimpan). */
  weightKgPerM?: number
}
export interface RebarTakeoffLine {
  rebarType: 'BjTP' | 'BjTS'; diameterMm: number
  barCount: number; lengthPerBarM: number
  totalLengthM: number; weightKgPerM: number; totalWeightKg: number
}

/** Satu baris BBS: jumlah batang × panjang → meter → kg (geometri, tanpa waste AHSP). */
export function computeRebarBar(input: RebarBarInput): RebarTakeoffLine {
  if (input.barCount <= 0) throw new Error('computeRebarBar: barCount harus > 0')
  if (input.lengthPerBarM <= 0) throw new Error('computeRebarBar: lengthPerBarM harus > 0')
  const weightKgPerM = input.weightKgPerM ?? rebarWeightPerM(input.diameterMm)
  const totalLengthM = input.barCount * input.lengthPerBarM
  return {
    rebarType: input.rebarType, diameterMm: input.diameterMm,
    barCount: input.barCount, lengthPerBarM: input.lengthPerBarM,
    totalLengthM, weightKgPerM, totalWeightKg: totalLengthM * weightKgPerM,
  }
}

export interface RebarSummaryLine { rebarType: 'BjTP' | 'BjTS'; diameterMm: number; totalWeightKg: number; barCount: number }

/** Rekap "Total Besi <Ø>" ala BBS: gabung per (tipe, diameter) lintas baris/item. */
export function summarizeRebarByDiameter(lines: RebarTakeoffLine[]): RebarSummaryLine[] {
  const by = new Map<string, RebarSummaryLine>()
  for (const l of lines) {
    const key = `${l.rebarType}|${l.diameterMm}`
    const cur = by.get(key)
    if (cur) { cur.totalWeightKg += l.totalWeightKg; cur.barCount += l.barCount }
    else by.set(key, { rebarType: l.rebarType, diameterMm: l.diameterMm, totalWeightKg: l.totalWeightKg, barCount: l.barCount })
  }
  return [...by.values()].sort((a, b) => a.rebarType.localeCompare(b.rebarType) || a.diameterMm - b.diameterMm)
}

// ── D4 — Take-off baja profil (WF/H/siku) ────────────────────────────────────
// Desain §D4: analisa nasional 2.3 generik PER KG "Baja Profil"; katalog profil +
// berat/m TIDAK ADA di nasional → data referensi Lapis 2 (`steel_profiles`).
// Take-off = panjang × kg/m (dari tabel) → kg → feed analisa per-kg.
export interface SteelMemberInput {
  designation: string        // mis. 'WF 350x175x7x11'
  pieceCount: number
  lengthPerPieceM: number
  weightKgPerM: number       // dari katalog steel_profiles — DATA, bukan tebakan
}
export interface SteelTakeoffLine extends SteelMemberInput { totalLengthM: number; totalWeightKg: number }

export function computeSteelMember(input: SteelMemberInput): SteelTakeoffLine {
  if (input.pieceCount <= 0) throw new Error('computeSteelMember: pieceCount harus > 0')
  if (input.lengthPerPieceM <= 0) throw new Error('computeSteelMember: lengthPerPieceM harus > 0')
  if (input.weightKgPerM <= 0) throw new Error('computeSteelMember: weightKgPerM harus > 0')
  const totalLengthM = input.pieceCount * input.lengthPerPieceM
  return { ...input, totalLengthM, totalWeightKg: totalLengthM * input.weightKgPerM }
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
