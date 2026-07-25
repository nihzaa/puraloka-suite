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
