// apps/api/src/lib/__tests__/rangka-model.test.ts
import { describe, it, expect } from 'vitest'
import { analisaRangka2D, type Simpul, type BatangModel } from '../rangka-model.js'

/* Baja: E = 200.000 MPa. Beton dipakai di Task 4; di sini angka bebas. */
const E = 200_000
/** Penampang uji: 300×500 mm → A = 150.000 mm², I = bh³/12 = 3,125e9 mm⁴. */
const A = 150_000
const I = 300 * 500 ** 3 / 12

describe('analisaRangka2D — kasus tangan lapis 1', () => {
  /*
    KANTILEVER beban merata w, panjang L.
      M jepit = wL²/2      ← DIVERIFIKASI numerik 2026-09-01: 0,5 wL²
      δ ujung = wL⁴/(8EI)  ← DIVERIFIKASI: 0,125 wL⁴/EI
    Sumber: Gere & Timoshenko, Mechanics of Materials, tabel lendutan balok.
  */
  it('kantilever beban merata: M jepit = wL²/2', () => {
    const L = 4, w = 10  // kN/m
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'bebas' },
    ]
    const batang: BatangModel[] = [
      { nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w },
    ]
    const h = analisaRangka2D(simpul, batang, [])
    const b = h.batang[0]!

    // |M| terbesar = wL²/2 = 10·16/2 = 80 kNm
    const mMaks = Math.max(Math.abs(b.momenKnm.maks), Math.abs(b.momenKnm.min))
    expect(mMaks).toBeCloseTo(w * L ** 2 / 2, 4)
  })

  it('kantilever: lendutan ujung = wL⁴/(8EI)', () => {
    const L = 4, w = 10
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'bebas' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w }], [])

    // w kN/m, L m, E MPa, I mm⁴ → δ dalam mm:
    //   wL⁴/(8EI) dengan w N/mm = w, L mm, E N/mm², I mm⁴
    const wNmm = w                      // kN/m === N/mm
    const Lmm = L * 1000
    const dHarap = wNmm * Lmm ** 4 / (8 * E * I)
    expect(h.batang[0]!.lendutanMm.maks).toBeCloseTo(dHarap, 2)
  })

  /*
    BALOK JEPIT-JEPIT beban merata:
      M tumpuan = wL²/12   ← DIVERIFIKASI: 0,083333 wL²
      M tengah  = wL²/24   ← DIVERIFIKASI: 0,041667 wL²
  */
  it('jepit-jepit: M tumpuan wL²/12 dan M tengah wL²/24', () => {
    const L = 6, w = 12
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'jepit' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w }], [])
    const b = h.batang[0]!

    const mTumpuan = Math.max(Math.abs(b.momenKnm.maks), Math.abs(b.momenKnm.min))
    expect(mTumpuan).toBeCloseTo(w * L ** 2 / 12, 3)

    // Momen di tengah bentang — diambil dari deret titik.
    const tengah = b.momenKnm.di.reduce((p, c) =>
      Math.abs(c.xM - L / 2) < Math.abs(p.xM - L / 2) ? c : p)
    expect(Math.abs(tengah.nilai)).toBeCloseTo(w * L ** 2 / 24, 3)
  })

  /*
    BALOK SEDERHANA beban merata:
      M tengah = wL²/8         ← DIVERIFIKASI: 0,125 wL²
      δ tengah = 5wL⁴/(384EI)  ← DIVERIFIKASI: 0,013021 wL⁴/EI
  */
  it('sederhana: M tengah wL²/8 dan lendutan 5wL⁴/384EI', () => {
    const L = 6, w = 12
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w }], [])
    const b = h.batang[0]!

    expect(b.momenKnm.maks).toBeCloseTo(w * L ** 2 / 8, 3)

    const dHarap = 5 * w * (L * 1000) ** 4 / (384 * E * I)
    expect(b.lendutanMm.maks).toBeCloseTo(dHarap, 1)
  })

  it('MENOLAK struktur labil dengan menyebut sebabnya', () => {
    /*
      Dua simpul, keduanya bebas — tak ada yang menahan. Solver harus
      MENOLAK, bukan memulangkan angka raksasa yang terlihat seperti hasil.
    */
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'bebas' },
      { nama: 'B', xM: 4, yM: 0, tumpuan: 'bebas' },
    ]
    expect(() => analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: 10 }], []))
      .toThrow(/labil|singular|tumpuan/i)
  })

  it('membawa catatan batas — bukan angka telanjang', () => {
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: 4, yM: 0, tumpuan: 'bebas' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: 10 }], [])
    const gabung = h.catatan.join(' ')
    expect(gabung).toMatch(/elastis linier/i)
    expect(gabung).toMatch(/P-Δ|torsi/i)
  })
})
