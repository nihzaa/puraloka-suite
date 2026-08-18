import { describe, it, expect } from 'vitest'
import { analisaFootplat, ALPHA_S, type InputFootplat } from '../struktur-footplat'

/**
 * GOLDEN TEST FOOTPLAT — workbook "9. Analisa Pondasi Footplate".
 *
 * Parameter (sheet "Analisa Pondasi Footplat"):
 *   Lx = Ly = 1.5 m · h = 0.35 m · bx = by = 0.4 m · px = py = 0.75 m
 *   z = 2.1 m · γtanah = 17.6 · γbeton = 24 kN/m³
 *   f'c = 38 MPa · fy = 420 MPa · αs = 40 (kolom tengah)
 *   Puk = 100 kN · Mux = Muy = 20 kNm · qa = 300 kN/m²
 *   d' = 0.075 m
 */

const INPUT: InputFootplat = {
  lxM: 1.5, lyM: 1.5, hM: 0.35,
  bxM: 0.4, byM: 0.4, pxM: 0.75, pyM: 0.75,
  zM: 2.1, gammaTanahKnM3: 17.6, gammaBetonKnM3: 24,
  letakKolom: 'tengah',
  mutu: { fcMpa: 38, fyMpa: 420 },
  dAksenM: 0.075, dTulanganMm: 16, jarakTulanganMm: 150,
  pukKn: 100, muxKnm: 20, muyKnm: 20, qaKnM2: 300,
}

describe('footplat — tegangan tanah vs workbook', () => {
  const h = analisaFootplat(INPUT)

  it('A = Lx·Ly = 2.25 m² (workbook D81)', () => {
    expect(h.antara.aM2).toBeCloseTo(2.25, 10)
  })

  it('Wx = Wy = 0.5625 m³ (workbook D82, D83)', () => {
    expect(h.antara.wxM3).toBeCloseTo(0.5625, 10)
    expect(h.antara.wyM3).toBeCloseTo(0.5625, 10)
  })

  it('q = h·γbeton + z·γtanah = 45.36 kN/m² (workbook D85)', () => {
    expect(h.antara.qKnM2).toBeCloseTo(45.360000000000007, 9)
  })

  it('ex = ey = Mu/Puk = 0.2 m (workbook D87, D89)', () => {
    expect(h.antara.exM).toBeCloseTo(0.2, 10)
    expect(h.antara.eyM).toBeCloseTo(0.2, 10)
  })

  it('qmax = 160.9156 kN/m² (workbook D92)', () => {
    expect(h.antara.qmax).toBeCloseTo(160.91555555555556, 8)
  })

  it('qmin = 18.6933 kN/m² (workbook D95)', () => {
    expect(h.antara.qmin).toBeCloseTo(18.693333333333335, 8)
  })

  it('ex 0.2 < Lx/6 = 0.25 → aman (workbook D88 "(O.K.) aman")', () => {
    expect(h.periksa.find((p) => p.nama === 'Eksentrisitas arah X')!.aman).toBe(true)
    expect(h.antara.exBatasM).toBeCloseTo(0.25, 10)
  })

  it('qmax 160.9 < qa 300 → aman (workbook D93)', () => {
    expect(h.periksa.find((p) => p.nama === 'Tegangan tanah maksimum')!.aman).toBe(true)
  })
})

describe('footplat — geser vs workbook', () => {
  const h = analisaFootplat(INPUT)

  it('d = h − d\' = 0.275 m (workbook D170)', () => {
    expect(h.antara.dM).toBeCloseTo(0.275, 10)
  })

  it('cx = Lx − px − (bx+d)/2 = 0.4125 m (workbook D171)', () => {
    expect(h.antara.cxM).toBeCloseTo(0.41249999999999998, 10)
  })

  it('qx di bidang kritis = 121.804 kN/m² (workbook D174)', () => {
    expect(h.antara.qxKritis).toBeCloseTo(121.80444444444444, 8)
  })

  it('Vux = 59.4 kN (workbook D175)', () => {
    expect(h.antara.vuxKn).toBeCloseTo(59.399999999999991, 8)
  })

  it('Vc TERKECIL dari tiga persamaan = 847.607 kN (workbook D182)', () => {
    // Tiga persamaan SNI menghasilkan 1271.41 · 1977.75 · 847.61;
    // yang dipakai yang terkecil. Memakai yang pertama saja (kesalahan yang
    // mudah dibuat) akan melebihkan kapasitas 50%.
    expect(h.antara.phiVcxKn / 0.75).toBeCloseTo(847.60692540823391, 6)
  })

  it('φVc = 635.705 kN ≥ Vux 59.4 → aman (workbook D184, D185)', () => {
    expect(h.antara.phiVcxKn).toBeCloseTo(635.7051940561754, 6)
    expect(h.periksa.find((p) => p.nama === 'Geser satu arah X')!.aman).toBe(true)
  })

  it('αs sesuai letak kolom — 40 tengah · 30 tepi · 20 sudut', () => {
    expect(ALPHA_S).toEqual({ tengah: 40, tepi: 30, sudut: 20 })
    expect(h.antara.alphaS).toBe(40)
    expect(analisaFootplat({ ...INPUT, letakKolom: 'sudut' }).antara.alphaS).toBe(20)
  })

  it('geser pons diperiksa TERPISAH — sering yang menentukan tebal', () => {
    const pons = h.periksa.find((p) => p.nama === 'Geser pons')!
    expect(pons).toBeDefined()
    expect(pons.rumus).toContain('αs=40')
    // b0 = keliling kotak sejarak d/2 dari muka kolom
    expect(h.antara.b0M).toBeCloseTo(2 * (0.4 + 0.275) + 2 * (0.4 + 0.275), 9)
  })
})

describe('footplat — verdict arah sebaliknya', () => {
  it('beban berlebih → tegangan tanah melampaui qa', () => {
    const berat = analisaFootplat({ ...INPUT, pukKn: 2000 })
    expect(berat.periksa.find((p) => p.nama === 'Tegangan tanah maksimum')!.aman).toBe(false)
    expect(berat.aman).toBe(false)
  })

  /**
   * qmin < 0 = sebagian dasar TERANGKAT.
   *
   * Ini verdict terpisah karena akibatnya bukan sekadar "kurang aman":
   * rumus tegangan linier BERHENTI BERLAKU begitu tanah terangkat, jadi qmax
   * yang dihitung justru LEBIH KECIL dari kenyataan. Verdict yang menyatu
   * dengan "tegangan maksimum" akan menyembunyikan itu.
   */
  it('eksentrisitas besar → qmin negatif + catatan yang menjelaskan bahayanya', () => {
    const miring = analisaFootplat({ ...INPUT, muxKnm: 60, muyKnm: 60 })
    expect(miring.antara.qmin).toBeLessThan(0)
    expect(miring.periksa.find((p) => p.nama === 'Tanah tidak terangkat')!.aman).toBe(false)
    expect(miring.catatan.some((c) => /terangkat/i.test(c))).toBe(true)
    expect(miring.catatan.some((c) => /LEBIH BESAR/i.test(c))).toBe(true)
  })

  it('footplat tipis → geser pons merah', () => {
    const tipis = analisaFootplat({ ...INPUT, hM: 0.12, dAksenM: 0.05, pukKn: 800 })
    expect(tipis.periksa.find((p) => p.nama === 'Geser pons')!.aman).toBe(false)
  })

  it('menolak geometri mustahil', () => {
    expect(() => analisaFootplat({ ...INPUT, hM: 0.05, dAksenM: 0.075 }))
      .toThrow(/Selimut melebihi/)
    expect(() => analisaFootplat({ ...INPUT, lxM: 0 })).toThrow()
    expect(() => analisaFootplat({ ...INPUT, qaKnM2: 0 })).toThrow()
  })

  it('c ≤ d → geser satu arah tak menentukan, dicatat bukan didiamkan', () => {
    // Footplat kecil: bidang kritis jatuh di dalam kolom.
    const kecil = analisaFootplat({
      ...INPUT, lxM: 0.8, lyM: 0.8, pxM: 0.4, pyM: 0.4, muxKnm: 2, muyKnm: 2,
    })
    expect(kecil.antara.vuxKn).toBe(0)
    expect(kecil.catatan.some((c) => /tidak menentukan/i.test(c))).toBe(true)
  })
})

describe('footplat — volume untuk RAP', () => {
  const h = analisaFootplat(INPUT)

  it('beton = Lx · Ly · h', () => {
    expect(h.volume.betonM3).toBeCloseTo(1.5 * 1.5 * 0.35, 9)
  })

  it('bekisting = keliling × tebal (dasar & atas tidak dibekisting)', () => {
    expect(h.volume.bekistingM2).toBeCloseTo(2 * (1.5 + 1.5) * 0.35, 9)
  })

  it('tulangan DUA ARAH, panjang dikurangi selimut + kait', () => {
    expect(h.volume.besi).toHaveLength(2)
    const kait = 2 * 6 * 16 / 1000
    expect(h.volume.besi[0].panjangPerBatangM).toBeCloseTo(1.5 - 2 * 0.075 + kait, 9)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const lima = analisaFootplat({ ...INPUT, jumlah: 5 })
    expect(lima.volume.betonM3).toBeCloseTo(h.volume.betonM3 * 5, 9)
    expect(lima.antara.qmax).toBeCloseTo(h.antara.qmax, 9)
  })
})
