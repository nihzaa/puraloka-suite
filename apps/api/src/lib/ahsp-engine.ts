// AHSP Calculation Engine (CECEP) — PURE, tanpa I/O.
//
// Mereproduksi rantai perhitungan workbook AHSP SE 47/2026 SAMPAI RUPIAH. Referensi:
// AHSP-RECON-REPORT §i (peta paritas) + AHSP-TEARDOWN-DEFECTS §1.6/§j (pembulatan).
//
// PARITAS DULU (disiplin founder): default meniru file AHSP utama — HSP dibulatkan
// `ROUNDDOWN` ke Rp100, agregat desimal penuh. SEMUA parameter (BUK, aturan pembulatan,
// PPN) di-INJECT, bukan hardcode — supaya config effective-date & flag koreksi (D1/D2)
// mengatur nilainya di lapisan pemanggil. Fungsi di sini tetap murni & ber-test.
//
// DUA nilai HSP: `hspRaw` (desimal penuh — internal/analisis/RAP) + `hspRounded` (rantai
// dokumen resmi). "Rantai dokumen dari rounded, jangan dicampur" (founder, §j/D2).

export type ResourceGroup = 'tenaga' | 'bahan' | 'alat' // A / B / C

export interface AhspComponent {
  group: ResourceGroup
  name: string
  unit: string        // satuan resource (OH, kg, m3, …) — hanya jejak, tak dipakai hitung
  coefficient: number // koefisien angka polos (qty resource.unit per 1 output_unit)
  hsd: number         // Harga Satuan Dasar (Rp), di-inject dari price book/HSD
}

export interface RoundingRule {
  // 'down' = ROUNDDOWN Excel (truncate MENUJU NOL). 'none' = tanpa pembulatan (metode Control).
  mode: 'down' | 'up' | 'nearest' | 'none'
  step: number // mis. 100 → ke ratusan (setara arg -2 di ROUNDDOWN). Diabaikan bila 'none'.
}

export interface AhspResult {
  groupTotals: Record<ResourceGroup, number> // ΣA, ΣB, ΣC = Σ(koef×HSD) per grup
  subtotalD: number   // D = A + B + C
  bukAmount: number   // E = D × bukFraction (Biaya Umum & Keuntungan)
  hspRaw: number      // F = D + E (desimal penuh)
  hspRounded: number  // pembulatan HSP → rantai dokumen
}

/**
 * ROUNDDOWN ala Excel = truncate MENUJU NOL ke kelipatan `step` (ROUNDDOWN(x,-2) → step 100).
 * `up`/`nearest` disediakan untuk aturan penyajian lain (config), default paritas = `down`.
 */
export function applyRounding(x: number, rule: RoundingRule): number {
  if (rule.mode === 'none' || rule.step <= 0) return x
  const q = x / rule.step
  const n =
    rule.mode === 'down' ? Math.trunc(q) // menuju nol (sama utk positif; benar utk negatif spt Excel)
    : rule.mode === 'up' ? Math.sign(q) * Math.ceil(Math.abs(q))
    : Math.round(q)
  return n * rule.step
}

/**
 * Analisa Harga Satuan Pekerjaan untuk 1 unit output. Urutan operasi MENIRU Excel
 * (per komponen `koef×HSD`, lalu SUM per grup) demi paritas bit — bukan optimasi ulang.
 */
export function computeAhsp(
  components: AhspComponent[],
  bukFraction: number,
  rounding: RoundingRule,
): AhspResult {
  const groupTotals: Record<ResourceGroup, number> = { tenaga: 0, bahan: 0, alat: 0 }
  for (const c of components) {
    groupTotals[c.group] += c.coefficient * c.hsd // = Excel: I = G × H
  }
  const subtotalD = groupTotals.tenaga + groupTotals.bahan + groupTotals.alat
  const bukAmount = subtotalD * bukFraction
  const hspRaw = subtotalD + bukAmount
  const hspRounded = applyRounding(hspRaw, rounding)
  return { groupTotals, subtotalD, bukAmount, hspRaw, hspRounded }
}

/** Total baris RAB = Volume × HSP. Pakai HSP **rounded** (rantai dokumen, §j). */
export function computeRabLineTotal(volume: number, hspRounded: number): number {
  return volume * hspRounded
}

export interface PpnConfig {
  rate: number   // tarif statutory (mis. 0,12 per PMK 131/2024)
  dppNum: number // pembilang faktor DPP nilai lain (konstruksi/JKP = 11; barang mewah = 1)
  dppDen: number // penyebut (konstruksi = 12; mewah = 1)
}

/**
 * PPN = rate × (dppNum/dppDen) × DPP, dihitung RASIONAL: **kali dulu, bagi belakangan**
 * — supaya 11/12 TAK PERNAH menjadi 0,9167 (D10; drift +Rp66 dibuktikan). Paritas Excel:
 * `dppNum=dppDen=1` → `rate × DPP` (operasi identik file Control: E18×0,12).
 */
export function computePpn(dpp: number, cfg: PpnConfig): number {
  return (dpp * cfg.rate * cfg.dppNum) / cfg.dppDen
}

export interface RabGroupInput { name: string; lineTotals: number[] }
export interface RabRollup {
  groups: { name: string; subtotal: number }[]
  totalBiaya: number
  ppn: number
  grandTotal: number
}

/**
 * Rekapitulasi RAB: subtotal per kelompok (SUM baris) → TOTAL BIAYA (SUM kelompok) →
 * PPN → GRAND TOTAL. Meniru REKAPITULASI Excel. Agregat desimal penuh (§j).
 */
export function computeRabRollup(groups: RabGroupInput[], ppnCfg: PpnConfig): RabRollup {
  const g = groups.map(x => ({ name: x.name, subtotal: x.lineTotals.reduce((a, b) => a + b, 0) }))
  const totalBiaya = g.reduce((a, b) => a + b.subtotal, 0)
  const ppn = computePpn(totalBiaya, ppnCfg)
  return { groups: g, totalBiaya, ppn, grandTotal: totalBiaya + ppn }
}
