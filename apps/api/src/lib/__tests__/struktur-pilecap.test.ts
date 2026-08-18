import { describe, it, expect } from 'vitest'
import { analisaPilecap, bebanPerTiang, type InputPilecap } from '../struktur-pilecap'

/**
 * GOLDEN TEST PILECAP — workbook "7. Analisa Pondasi Tiang Pancang
 * (Pilecap; Pilegroup)".
 *
 * Parameter (sheet "Analisa Pondasi Pilecap"):
 *   nx = ny = 2 · dx = dy = 1 m · ax = ay = 0.5 m
 *   D tiang 0.4 m · bx = by = 0.4 m · h = 0.4 m · z = 0.9 m
 *   Puk = 30 kN · Mux = Muy = 20 kNm · αs = 40 (kolom tengah)
 *   → Lx = Ly = (2−1)·1 + 2·0.5 = 2 m
 *   → posisi tiang ±0.5 m dari pusat, Σx² = Σy² = 4 × 0.25 = 1
 */

const INPUT: InputPilecap = {
  nx: 2, ny: 2, dxM: 1, dyM: 1, axM: 0.5, ayM: 0.5,
  diameterTiangM: 0.4, bxM: 0.4, byM: 0.4, hM: 0.4, zM: 0.9,
  gammaTanahKnM3: 18, gammaBetonKnM3: 24,
  letakKolom: 'tengah',
  mutu: { fcMpa: 30, fyMpa: 400 },
  dAksenM: 0.075, dTulanganMm: 16, jarakTulanganMm: 150,
  pukKn: 30, muxKnm: 20, muyKnm: 20,
  pIjinTiangKn: 425,
}

describe('susunan tiang & rumus Rivet', () => {
  const t = bebanPerTiang(INPUT)

  it('4 tiang, posisi ±0.5 m dari pusat (workbook E83/E84)', () => {
    expect(t).toHaveLength(4)
    expect(t.map((x) => x.xM).sort()).toEqual([-0.5, -0.5, 0.5, 0.5])
    expect(t.map((x) => x.yM).sort()).toEqual([-0.5, -0.5, 0.5, 0.5])
  })

  it('Σx² = Σy² = 1 (workbook F83+F84 = 0.5+0.5)', () => {
    const h = analisaPilecap(INPUT)
    expect(h.antara.sumX2).toBeCloseTo(1, 10)
    expect(h.antara.sumY2).toBeCloseTo(1, 10)
  })

  /**
   * Pi = ΣP/n + Mux·xi/Σx² + Muy·yi/Σy²
   *
   * Untuk grup ini: 30/4 = 7.5 kN merata, ditambah/dikurangi 20·0.5/1 = 10 kN
   * dari tiap momen. Tiang sudut terjauh menanggung 7.5 + 10 + 10 = 27.5 kN,
   * yang terdekat 7.5 − 10 − 10 = −12.5 kN (TERTARIK).
   */
  it('beban per tiang sesuai rumus Rivet — sudut menanggung terbesar', () => {
    const nilai = t.map((x) => x.puKn).sort((a, b) => a - b)
    expect(nilai[0]).toBeCloseTo(7.5 - 10 - 10, 9)   // −12.5 tertarik
    expect(nilai[3]).toBeCloseTo(7.5 + 10 + 10, 9)   // +27.5 tekan
    // Jumlah seluruh tiang = beban kolom (momen tak menambah total).
    expect(t.reduce((s, x) => s + x.puKn, 0)).toBeCloseTo(30, 9)
  })

  /**
   * Penjaga terhadap kesalahan yang mudah dibuat: memakai ΣP/n saja.
   *
   * Rata-rata di sini 7.5 kN — jauh di bawah kapasitas tiang. Tetapi tiang
   * terkritis 27.5 kN (3.7× lipat), dan satu tiang TERTARIK. Modul yang
   * hanya melihat rata-rata melewatkan keduanya sepenuhnya.
   */
  it('rata-rata JAUH berbeda dari tiang terkritis — inilah kenapa Rivet perlu', () => {
    const h = analisaPilecap(INPUT)
    expect(h.antara.puRataKn).toBeCloseTo(7.5, 9)
    expect(h.antara.puMaksKn).toBeCloseTo(27.5, 9)
    expect(h.antara.puMaksKn / h.antara.puRataKn).toBeCloseTo(3.6667, 3)
  })

  it('grup satu baris (nx=1): momen arah itu tak dilawan, bukan Infinity', () => {
    // Σx² = 0 → suku Mux/Σx² harus dihilangkan, bukan jadi pembagian nol.
    const satuBaris = bebanPerTiang({ ...INPUT, nx: 1 })
    for (const x of satuBaris) {
      expect(Number.isFinite(x.puKn)).toBe(true)
    }
  })

  it('tanpa momen → seluruh tiang menanggung sama rata', () => {
    const rata = bebanPerTiang({ ...INPUT, muxKnm: 0, muyKnm: 0 })
    for (const x of rata) expect(x.puKn).toBeCloseTo(7.5, 9)
  })
})

describe('pilecap — dimensi & verdict', () => {
  const h = analisaPilecap(INPUT)

  it('Lx = Ly = (n−1)·d + 2a = 2 m', () => {
    expect(h.antara.lxM).toBeCloseTo(2, 10)
    expect(h.antara.lyM).toBeCloseTo(2, 10)
  })

  it('tiang TERTARIK ditandai catatan, bukan didiamkan', () => {
    // Pu min = −12.5 kN pada grup ini.
    expect(h.antara.puMinKn).toBeLessThan(0)
    expect(h.periksa.find((p) => p.nama === 'Tidak ada tiang tercabut')!.aman).toBe(false)
    expect(h.catatan.some((c) => /TARIK/i.test(c))).toBe(true)
    expect(h.catatan.some((c) => /kapasitas cabut TIDAK dihitung/i.test(c))).toBe(true)
  })

  it('beban tiang maks 27.5 ≤ P ijin 425 → bagian itu aman', () => {
    expect(h.periksa.find((p) => p.nama === 'Beban tiang maksimum')!.aman).toBe(true)
  })

  it('jarak antar tiang 1 m ≥ 2.5·D = 1 m → aman di batas', () => {
    expect(h.periksa.find((p) => p.nama === 'Jarak antar tiang minimum')!.aman).toBe(true)
  })

  it('tiang terlalu rapat → merah (zona tekanan tumpang tindih)', () => {
    const rapat = analisaPilecap({ ...INPUT, dxM: 0.6, dyM: 0.6 })
    expect(rapat.periksa.find((p) => p.nama === 'Jarak antar tiang minimum')!.aman).toBe(false)
  })

  it('momen besar → tiang terkritis melampaui kapasitas', () => {
    const berat = analisaPilecap({ ...INPUT, muxKnm: 500, muyKnm: 500 })
    expect(berat.periksa.find((p) => p.nama === 'Beban tiang maksimum')!.aman).toBe(false)
    expect(berat.aman).toBe(false)
  })

  it('tanpa momen → tak ada tiang tertarik', () => {
    const lurus = analisaPilecap({ ...INPUT, muxKnm: 0, muyKnm: 0 })
    expect(lurus.periksa.find((p) => p.nama === 'Tidak ada tiang tercabut')!.aman).toBe(true)
    expect(lurus.catatan.some((c) => /TARIK/i.test(c))).toBe(false)
  })

  it('geser pons dihitung pada keliling d/2 sekeliling kolom', () => {
    const dM = 0.4 - 0.075
    expect(h.antara.b0M).toBeCloseTo(2 * (0.4 + dM) + 2 * (0.4 + dM), 9)
    expect(h.antara.alphaS).toBe(40)
  })

  it('pilecap tipis → geser pons merah', () => {
    const tipis = analisaPilecap({
      ...INPUT, hM: 0.15, dAksenM: 0.05, pukKn: 3000,
    })
    expect(tipis.periksa.find((p) => p.nama === 'Geser pons kolom')!.aman).toBe(false)
  })

  it('menolak input mustahil', () => {
    expect(() => analisaPilecap({ ...INPUT, nx: 0 })).toThrow(/minimal 1/)
    expect(() => analisaPilecap({ ...INPUT, hM: 0.05, dAksenM: 0.075 }))
      .toThrow(/Selimut melebihi/)
    expect(() => analisaPilecap({ ...INPUT, pIjinTiangKn: 0 })).toThrow()
  })
})

describe('pilecap — volume untuk RAP', () => {
  const h = analisaPilecap(INPUT)

  it('beton = Lx · Ly · h', () => {
    expect(h.volume.betonM3).toBeCloseTo(2 * 2 * 0.4, 9)
  })

  it('bekisting keliling × tebal', () => {
    expect(h.volume.bekistingM2).toBeCloseTo(2 * (2 + 2) * 0.4, 9)
  })

  it('tulangan dua arah + kait', () => {
    expect(h.volume.besi).toHaveLength(2)
    const kait = 2 * 6 * 16 / 1000
    expect(h.volume.besi[0].panjangPerBatangM).toBeCloseTo(2 - 2 * 0.075 + kait, 9)
  })

  it('grup 3×3 menghasilkan pilecap lebih besar & besi lebih banyak', () => {
    const besar = analisaPilecap({ ...INPUT, nx: 3, ny: 3 })
    expect(besar.antara.lxM).toBeCloseTo(3, 10)   // (3−1)·1 + 1
    expect(besar.volume.besiTotalKg).toBeGreaterThan(h.volume.besiTotalKg)
    expect(besar.tiang).toHaveLength(9)
  })

  it('jumlah elemen mengalikan volume, bukan beban per tiang', () => {
    const tiga = analisaPilecap({ ...INPUT, jumlah: 3 })
    expect(tiga.volume.betonM3).toBeCloseTo(h.volume.betonM3 * 3, 9)
    expect(tiga.antara.puMaksKn).toBeCloseTo(h.antara.puMaksKn, 9)
  })
})
