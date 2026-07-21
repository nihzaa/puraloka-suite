/**
 * Cumulative Distribution Function (CDF) distribusi normal — diekstrak dari
 * kurva-s.ts:186-193, identik perilaku (approximation Zelen & Severo, bukan
 * closed-form). Dipakai sebagai fallback distribusi rencana S-curve saat
 * rab_schedule (input manual PM) belum ada.
 */
export function normalCDF(x: number, mu = 0.5, sigma = 0.2): number {
  const z = (x - mu) / sigma
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
  const cdf = 1 - phi * poly
  return z >= 0 ? cdf : 1 - cdf
}

export interface EVMInput {
  /** Budget At Completion — total nilai RAB (fallback: contract_value) */
  bac: number
  /** Actual Cost — total serapan aktual kas */
  ac: number
  /** Earned Value — bac × progress_pct / 100 */
  ev: number
  /** Planned Value — bac × rencana_pct_saat_ini / 100 */
  pv: number
}

export interface EVMResult {
  cpi: number | null
  spi: number | null
  sv: number
  cv: number
  eac: number | null
  etc: number | null
  vac: number | null
  tcpi: number | null
}

/**
 * Kalkulasi EVM standar — diekstrak dari kurva-s.ts:358-365, formula dan
 * null-safety identik (mis. cpi null jika ac<=0, bukan Infinity/NaN diam-diam).
 */
export function calculateEVM({ bac, ac, ev, pv }: EVMInput): EVMResult {
  const cpi = ac > 0 ? parseFloat((ev / ac).toFixed(4)) : null
  const spi = pv > 0 ? parseFloat((ev / pv).toFixed(4)) : null
  const sv = parseFloat((ev - pv).toFixed(2))
  const cv = parseFloat((ev - ac).toFixed(2))
  const eac = cpi && cpi > 0 ? parseFloat((ac + (bac - ev) / cpi).toFixed(2)) : null
  const etc = eac !== null ? parseFloat((eac - ac).toFixed(2)) : null
  const vac = eac !== null ? parseFloat((bac - eac).toFixed(2)) : null
  const tcpi = bac - ev > 0 && bac - ac > 0 ? parseFloat(((bac - ev) / (bac - ac)).toFixed(4)) : null

  return { cpi, spi, sv, cv, eac, etc, vac, tcpi }
}
