import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'

// GUARDRAIL D10 — SYARAT WAJIB sebelum pemecahan PPN satu-fraksi (0,11) → dua-angka
// (rate 0,12 × dpp_factor 11/12) boleh jalan TANPA flag. Menegakkan 3 syarat founder:
//
//   (a) RASIONAL: dpp_factor 11/12 dihitung kali-dulu-bagi-belakangan (num/den integer),
//       TAK PERNAH disimpan 0,9167 → nol drift float (dibuktikan +Rp66 kalau dibulatkan).
//   (b) REGRESI: SEMUA tax_record existing HARUS internal-konsisten (tax = base × rate),
//       dan model dua-angka mereproduksi regime 11% PERSIS sampai rupiah. Satu meleset →
//       test MERAH (founder: "berhenti & lapor", jangan tambal, jangan bulatkan agar cocok).
//   (c) HISTORIS BEKU: guardrail READ-ONLY — HANYA SELECT, tak pernah UPDATE/recompute
//       nilai tersimpan. Dokumen historis = final & mengikat.
//
// Terhadap dev `public` (read-only). Tak menulis apa pun.

// Model PPN dua-angka, RASIONAL: PPN = (base × rateNum × dppNum) / (rateDen × dppDen).
// Kali SEMUA dulu, bagi TERAKHIR → 11/12 tak pernah jadi desimal terbatas.
const ppnTwoNumber = (
  base: number, rateNum = 12, rateDen = 100, dppNum = 11, dppDen = 12,
) => (base * rateNum * dppNum) / (rateDen * dppDen)
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

let client: Client
beforeAll(async () => { client = await createRlsClient() }, 60_000)
afterAll(async () => { if (client) await client.end() })

describe('D10 (a) — model dua-angka rasional ≡ 0,11 efektif, TANPA drift', () => {
  it('lintas banyak base (sintetis + edge + nilai nyata dev): dua-angka == single 0,11 sampai rupiah', async () => {
    const { rows } = await client.query(`SELECT DISTINCT base_amount::float8 AS b FROM tax_records WHERE base_amount > 0`)
    const bases = [
      ...rows.map(r => r.b as number),
      0.01, 1, 999, 12_345.67, 123_456_789.99, 1_657_839_590.39, 71_250_000, 9_999_999_999.99,
    ]
    for (const base of bases) {
      const twoNum = round2(ppnTwoNumber(base))   // 0,12 × 11/12 × base (rasional)
      const single = round2(base * 0.11)          // model existing (satu fraksi efektif)
      expect(twoNum, `base=${base}: dua-angka=${twoNum} != single=${single}`).toBe(single)
    }
  }, 60_000)

  it('pendekatan TERLARANG (dpp_factor dibulatkan 0,916667) MELENCENG — bukti wajib rasional', () => {
    const base = 1_657_839_590.39
    const rational = round2(ppnTwoNumber(base))
    const truncated = round2(base * 0.12 * 0.916667) // yang DILARANG founder
    expect(Math.abs(truncated - rational), 'dpp_factor terbatas menggeser rupiah').toBeGreaterThan(1)
  })
})

describe('D10 (b) — regresi SEMUA tax_record existing (internal-konsisten + regime 11%)', () => {
  it('setiap tax_record: tax_amount tersimpan == base × rate_pct (nol override/drift senyap)', async () => {
    const { rows } = await client.query(
      `SELECT id, tax_scheme, base_amount::float8 AS base, rate_pct::float8 AS rate,
              tax_amount::float8 AS tax
         FROM tax_records`)
    const mismatches = rows
      .map(r => ({ ...r, recomputed: round2((r.base * r.rate) / 100) }))
      .filter(r => r.recomputed !== round2(r.tax))
      .map(r => `id=${r.id} scheme=${r.tax_scheme} base=${r.base} rate=${r.rate}% stored=${r.tax} recomputed=${r.recomputed}`)
    // Satu saja bergeser → MERAH. JANGAN tambal, JANGAN bulatkan agar cocok — lapor.
    expect(mismatches, `tax_record tak konsisten (tax != base×rate):\n${mismatches.join('\n')}`).toEqual([])
  }, 60_000)

  it('regime 11% (ppn): model dua-angka mereproduksi tax tersimpan PERSIS; CAKUPAN dilaporkan eksplisit', async () => {
    const { rows } = await client.query(
      `SELECT id, base_amount::float8 AS base, rate_pct::float8 AS rate, tax_amount::float8 AS tax
         FROM tax_records WHERE tax_scheme = 'ppn'`)
    const ppn11 = rows.filter(r => Math.round(r.rate) === 11)

    // CAKUPAN WAJIB EKSPLISIT (founder): jangan hijau tanpa keterangan. Nol baris ber-PPN
    // = LULUS VACUOUS (tak ada yang diuji), BUKAN "terbukti aman untuk data PPN nyata".
    const banner = `[D10 GUARDRAIL] PPN records diperiksa: total=${rows.length}, regime-11%=${ppn11.length}`
    if (rows.length === 0) {
      console.warn(
        `${banner}\n  ⚠️  VACUOUS: 0 record ber-PPN di lingkungan ini → regresi (b) TIDAK menguji data nyata.\n` +
        `      Bukti number-preserving datang HANYA dari (a) model-equivalence.\n` +
        `      JANGAN nyalakan split dpp_factor pada lingkungan yang punya invoice PPN nyata\n` +
        `      sebelum guardrail ini dijalankan ULANG DI LINGKUNGAN ITU dan benar-benar memeriksa baris.`)
    } else {
      console.info(banner)
    }

    const shifted = ppn11
      .filter(r => round2(ppnTwoNumber(r.base)) !== round2(r.tax))
      .map(r => `id=${r.id} base=${r.base} stored=${r.tax} twoNumber=${round2(ppnTwoNumber(r.base))}`)
    // Regime 11%: split HARUS number-preserving. Kalau ada yang bergeser → berhenti & lapor.
    expect(shifted, `PPN 11% bergeser oleh model dua-angka:\n${shifted.join('\n')}`).toEqual([])
    // Assertion cakupan eksplisit: dokumentasikan berapa yang diregresi (0 = vacuous, tercatat).
    expect(ppn11.length, `regime-11% ppn diregresi = ${ppn11.length} (0 = vacuous, lihat peringatan di atas)`).toBeGreaterThanOrEqual(0)
  }, 60_000)
})
