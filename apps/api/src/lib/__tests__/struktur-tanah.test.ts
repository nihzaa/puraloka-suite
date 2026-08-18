import { describe, it, expect } from 'vitest'
import {
  terzaghiPeck, meyerhof, skempton, dayaDukungTanah,
  type GeometriPondasi, type DataTanah,
} from '../struktur-tanah'

/**
 * GOLDEN TEST DAYA DUKUNG TANAH — workbook "8. Analisa Daya Dukung Tapak".
 *
 * Parameter (sheet "Analisa Daya Dukung Tapak"):
 *   Lx = 1.8 m · Ly = 1.5 m · Df = 2.5 m · γ = 17.6 kN/m³
 *   Terzaghi : c = 5 kPa · φ = 34°
 *   Meyerhof : qc = 95 kg/cm²
 *   Skempton : N = 18
 */

const GEO: GeometriPondasi = { lxM: 1.8, lyM: 1.5, dfM: 2.5 }
const TANAH: DataTanah = {
  gammaKnM3: 17.6, kohesiKpa: 5, sudutGeserDeg: 34, qcKgCm2: 95, nSpt: 18,
}

/**
 * ── SELISIH TERHADAP WORKBOOK: pembulatan, BUKAN rumus
 *
 * Workbook membulatkan dua nilai antara di tengah rantai:
 *
 *     D72  φ = ROUND(34/180·π, 5)  → 0.59341     (penuh: 0.593411945678072)
 *     D73  a = ROUND(e^(…), 5)     → 4.01139     (penuh: 4.011408976416814)
 *
 * Pembulatan itu merambat: Nq meleset 0.0005, dan di ujung rantai qu meleset
 * 0.027 kN/m² (0.001%). Dibuktikan — memasukkan pembulatan yang sama ke
 * implementasi ini menghasilkan angka workbook SAMPAI DIGIT TERAKHIR:
 *
 *     ROUND(φ,5) → ROUND(a,5) → Nq = 36.503928762607856  ✓ identik
 *
 * Implementasi ini SENGAJA tidak meniru pembulatannya. Alasannya bukan
 * kesombongan presisi: `ROUND` di tengah rantai adalah artefak spreadsheet
 * (agar sel terbaca rapi), dan menyalinnya ke kode berarti menanam kesalahan
 * yang tak punya alasan teknis. Selisih 0.001% jauh di bawah ketidakpastian
 * data tanah itu sendiri — φ hasil uji lab jarang lebih akurat dari ±1°.
 *
 * Toleransi test karena itu 0.01%, cukup ketat untuk menangkap rumus yang
 * salah, cukup longgar untuk pembulatan yang disengaja.
 */
const dekat = (a: number, b: number, persen = 0.01) =>
  Math.abs(a - b) / Math.abs(b) * 100 <= persen

describe('Terzaghi-Peck 1943 — vs workbook', () => {
  const h = terzaghiPeck(GEO, TANAH)

  it('φ rad = 0.593412 (workbook D72 membulatkannya ke 0.59341)', () => {
    expect(h.antara.phi).toBeCloseTo(34 / 180 * Math.PI, 12)
    expect(dekat(h.antara.phi, 0.59341)).toBe(true)
  })

  it('a = 4.011409 (workbook D73: 4.01139)', () => {
    expect(dekat(h.antara.a, 4.01139)).toBe(true)
  })

  it('Kpγ = 72.4763 (workbook D74) — TIDAK dibulatkan, cocok persis', () => {
    // Sel ini tak memakai ROUND, jadi di sini pembandingnya ketat.
    expect(h.antara.kpg).toBeCloseTo(72.4763059202661, 9)
  })

  it('Nq = 36.5044 (workbook D76: 36.5039 — beda pembulatan φ & a)', () => {
    expect(dekat(h.antara.nq, 36.503928762607856)).toBe(true)
  })

  it('Nc = 52.6374 (workbook D77: 52.6370)', () => {
    expect(dekat(h.antara.nc, 52.636959927371912)).toBe(true)
  })

  it('Nγ = 35.2263 (workbook D78: 35.2261)', () => {
    expect(dekat(h.antara.ng, 35.226051132341631)).toBe(true)
  })

  it('qu = 2388.20 kN/m² (workbook D81: 2388.17) — selisih 0.001%', () => {
    expect(dekat(h.quKnM2!, 2388.1694870124561)).toBe(true)
  })

  it('qa = qu/3 (workbook D83)', () => {
    expect(h.qaKnM2).toBeCloseTo(h.quKnM2! / 3, 12)
    expect(dekat(h.qaKnM2, 796.05649567081866)).toBe(true)
  })

  it('MENIRU pembulatan workbook menghasilkan angka IDENTIK — bukti rumusnya sama', () => {
    // Penjaga terhadap kesimpulan "ah, selisihnya kecil, mungkin rumusnya
    // beda sedikit". Ia BUKAN beda: dengan pembulatan yang sama, hasilnya
    // sama sampai digit terakhir.
    const phiB = Math.round(34 / 180 * Math.PI * 1e5) / 1e5
    const aB = Math.round(Math.exp((3 * Math.PI / 4 - phiB / 2) * Math.tan(phiB)) * 1e5) / 1e5
    const nqB = aB * aB / (2 * Math.pow(Math.cos(Math.PI / 4 + phiB / 2), 2))
    expect(nqB).toBeCloseTo(36.503928762607856, 12)
  })

  it('φ = 0 MELEMPAR, bukan memulangkan Infinity', () => {
    // tan(0) = 0 jadi Nc = (Nq−1)/0. Tanpa penjagaan ini hasilnya Infinity
    // yang terlihat seperti "daya dukung tak terbatas".
    expect(() => terzaghiPeck(GEO, { ...TANAH, sudutGeserDeg: 0 }))
      .toThrow(/φ harus > 0/)
  })

  it('tanpa data lab → melempar dengan saran metode lain', () => {
    expect(() => terzaghiPeck(GEO, { gammaKnM3: 17.6 }))
      .toThrow(/Meyerhof|Skempton/)
  })
})

describe('Meyerhof 1956 — vs workbook', () => {
  const h = meyerhof(GEO, TANAH)

  it('B = sisi terpendek = 1.5 m (workbook D89 pakai MIN)', () => {
    expect(h.antara.bM).toBe(1.5)
  })

  it('Kd dibatasi 1.33 — mentahnya 1.55 (workbook D90→D92)', () => {
    expect(h.antara.kdMentah).toBeCloseTo(1.55, 10)
    expect(h.antara.kd).toBe(1.33)
  })

  it('qa = 5.51345 kg/cm² (workbook D95)', () => {
    expect(h.antara.qaKgCm2).toBeCloseTo(5.5134545454545458, 8)
  })

  it('qa = 540.704 kN/m² (workbook D96)', () => {
    expect(h.qaKnM2).toBeCloseTo(540.70448727272731, 5)
  })
})

describe('Skempton 1986 — vs workbook', () => {
  const h = skempton(GEO, TANAH)

  it('po = Df·γ = 44 kN/m² (workbook D105)', () => {
    expect(h.antara.po).toBeCloseTo(44, 10)
  })

  it('CN = 1.38889 (workbook D107)', () => {
    expect(h.antara.cn).toBeCloseTo(1.3888888888888888, 10)
  })

  it("N' = 25 (workbook D108)", () => {
    expect(h.antara.nAksen).toBeCloseTo(25, 10)
  })

  it('qa = 598.5 kN/m² (workbook D114)', () => {
    expect(h.qaKnM2).toBeCloseTo(598.5, 6)
  })
})

describe('dayaDukungTanah — gabungan', () => {
  it('ketiga metode jalan bila datanya lengkap', () => {
    const h = dayaDukungTanah(GEO, TANAH)
    expect(h.metode).toHaveLength(3)
    expect(h.metode.map((m) => m.metode)).toEqual([
      'Terzaghi-Peck 1943', 'Meyerhof 1956', 'Skempton 1986',
    ])
  })

  /**
   * qa desain = TERKECIL, bukan rata-rata.
   *
   * Rata-rata akan menaikkan angka desain di atas metode paling konservatif,
   * dan tak ada dasar untuk itu: metode mana yang paling sesuai kondisi tanah
   * tak bisa diketahui dari angkanya saja.
   */
  it('qa desain = TERKECIL di antara metode', () => {
    const h = dayaDukungTanah(GEO, TANAH)
    const semua = h.metode.map((m) => m.qaKnM2)
    expect(h.qaDesainKnM2).toBe(Math.min(...semua))
    // Meyerhof paling konservatif untuk data ini (540.7 vs 598.5 vs 796.1).
    expect(h.qaDesainKnM2).toBeCloseTo(540.70448727272731, 5)
  })

  it('hanya data sondir → satu metode + catatan tak ada pembanding', () => {
    const h = dayaDukungTanah(GEO, { gammaKnM3: 17.6, qcKgCm2: 95 })
    expect(h.metode).toHaveLength(1)
    expect(h.catatan.some((c) => /tak ada pembanding/i.test(c))).toBe(true)
  })

  it('selisih antar-metode > 50% → ditandai, bukan didiamkan', () => {
    // qc kecil + N besar membuat dua metode berselisih jauh.
    const h = dayaDukungTanah(GEO, { gammaKnM3: 17.6, qcKgCm2: 20, nSpt: 60 })
    expect(h.sebaran).toBeGreaterThan(0.5)
    expect(h.catatan.some((c) => /terlalu jauh/i.test(c))).toBe(true)
    // Yang dipakai tetap yang terkecil.
    expect(h.qaDesainKnM2).toBe(Math.min(...h.metode.map((m) => m.qaKnM2)))
  })

  it('nol data uji → qa null + catatan, BUKAN nol diam-diam', () => {
    // qa = 0 akan terbaca sebagai "tanah tak mampu menahan apa pun"; null
    // menyatakan "belum bisa dihitung". Dua hal yang berbeda.
    const h = dayaDukungTanah(GEO, { gammaKnM3: 17.6 })
    expect(h.metode).toHaveLength(0)
    expect(h.qaDesainKnM2).toBeNull()
    expect(h.catatan.some((c) => /tak satu pun data/i.test(c))).toBe(true)
  })

  it('menolak geometri mustahil', () => {
    expect(() => dayaDukungTanah({ ...GEO, dfM: 0 }, TANAH)).toThrow()
    expect(() => dayaDukungTanah({ ...GEO, lxM: 0 }, TANAH)).toThrow()
    expect(() => dayaDukungTanah(GEO, { gammaKnM3: 0 })).toThrow()
  })

  it('pondasi lebih dalam → daya dukung naik (arah hubungan benar)', () => {
    const dangkal = dayaDukungTanah({ ...GEO, dfM: 1 }, TANAH)
    const dalam = dayaDukungTanah({ ...GEO, dfM: 4 }, TANAH)
    expect(dalam.qaDesainKnM2!).toBeGreaterThan(dangkal.qaDesainKnM2!)
  })
})
