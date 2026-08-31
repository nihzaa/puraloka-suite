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

describe('analisaRangka2D — puncak momen di ANTARA titik cuplikan', () => {
  /*
    Deret `momenKnm.di[]` cuma 11 titik (0,1L). Kalau puncak M(x) jatuh di
    antara dua titik itu, maksimum atas cuplikan MEREMEHKAN momen sesungguhnya —
    dan selalu ke arah lebih kecil, yang membuat tulangan dipilih kurang.

    BALOK MENERUS DUA BENTANG, w = 20 kN/m, L = 6 m tiap bentang:
      reaksi ujung  R = 3wL/8 = 45 kN   → V1 = 45 kN
      x puncak      = V1/q = 45/20 = 2,25 m = 0,375L  ← BUKAN kelipatan 0,1L
      M puncak      = V1²/(2q) = 45²/40 = 50,625 kNm
      M tumpuan tengah = wL²/8 = 90 kNm
    Sumber: Gere & Timoshenko, tabel balok menerus dua bentang sama panjang.

    Cuplikan terdekat (0,4L = 2,4 m) memberi 50,400 kNm — meleset 0,44% ke bawah.
  */
  const L = 6, w = 20
  const simpul: Simpul[] = [
    { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
    { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
    { nama: 'C', xM: 2 * L, yM: 0, tumpuan: 'rol-x' },
  ]
  const batang: BatangModel[] = [
    { nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: w },
    { nama: 'BC', dari: 1, ke: 2, eMpa: E, aMm2: A, iMm4: I, qKnM: w },
  ]

  it('menerus dua bentang: M lapangan = V1²/2q, bukan nilai cuplikan terdekat', () => {
    const h = analisaRangka2D(simpul, batang, [])
    const b = h.batang[0]!

    // 3wL/8 = 45 kN → puncak 45²/(2·20) = 50,625 kNm di x = 2,25 m.
    expect(b.momenKnm.maks).toBeCloseTo(45 ** 2 / (2 * w), 6)

    // Deret penggambar diagram TETAP 11 titik — jangan ikut berubah.
    expect(b.momenKnm.di).toHaveLength(11)
    // Dan puncak analitis itu memang TIDAK ada di deret cuplikan.
    const maksCuplikan = Math.max(...b.momenKnm.di.map((p) => p.nilai))
    expect(maksCuplikan).toBeCloseTo(50.4, 6)
    expect(b.momenKnm.maks).toBeGreaterThan(maksCuplikan)
  })

  it('bentang kedua (cermin): puncak analitis ditangkap dari arah sebaliknya', () => {
    /*
      Di BC ujung awalnya justru tumpuan tengah: V1 = −45 kN, M1 = 90 kNm.
      x puncak = V1/q negatif → DI LUAR batang; yang menangkap puncaknya di
      sini adalah cabang yang sama dievaluasi ulang, dan hasilnya harus tetap
      50,625 kNm. Kalau cuma bentang pertama yang diperbaiki, ini merah.
    */
    const h = analisaRangka2D(simpul, batang, [])
    const b = h.batang[1]!
    expect(b.momenKnm.maks).toBeCloseTo(45 ** 2 / (2 * w), 6)
    expect(b.momenKnm.min).toBeCloseTo(-w * L ** 2 / 8, 6)
  })

  it('lendutan: puncak juga di antara cuplikan, bukan maksimum jaring', () => {
    /*
      Puncak lendutan bentang tepi balok menerus ini di 0,4215L, bukan di
      titik jaring mana pun. Maksimum cuplikan 0,223949 mm; sesungguhnya
      0,2246174 mm — 0,30% terlalu KECIL. Batas layan (L/240, L/360) diperiksa
      terhadap angka ini, jadi meremehkannya meluluskan balok yang tak lulus.

      Nilai acuan dihitung dari bentuk tertutup y(x) dengan syarat batas
      y(0) = y(L) = 0 (kedua ujung bentang ini duduk di tumpuan).
    */
    const h = analisaRangka2D(simpul, batang, [])
    const b = h.batang[0]!

    const M1 = -b.momenKnm.di[0]!.nilai
    const V1 = b.geserKn.di[0]!.nilai
    const EI = E * I
    const yMentah = (x: number) =>
      (-M1 * x ** 2 / 2 + V1 * x ** 3 / 6 - w * x ** 4 / 24) * 1e12 / EI
    const yL = yMentah(L)
    const y = (x: number) => yMentah(x) - yL * x / L

    // Sapuan halus 200.001 titik — acuan independen dari cara modul mencarinya.
    let acuan = 0
    for (let k = 0; k <= 200_000; k++) {
      acuan = Math.max(acuan, Math.abs(y(L * k / 200_000)))
    }

    expect(b.lendutanMm.maks).toBeCloseTo(acuan, 6)
    expect(b.lendutanMm.di).toHaveLength(11)
    const maksCuplikan = Math.max(...b.lendutanMm.di.map((p) => Math.abs(p.nilai)))
    expect(b.lendutanMm.maks).toBeGreaterThan(maksCuplikan)
  })

  it('beban merata + beban titik tak simetris: puncak tetap eksak', () => {
    /*
      Balok sederhana 9 m dengan simpul dalam di 6 m, w = 15 kN/m, dan
      P = 30 kN ke bawah di simpul dalam itu. Batang kiri A-D panjang 6 m;
      puncaknya di V1/q, angka yang tak jatuh di jaring 0,1L (0,6 m).
    */
    const s: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
      { nama: 'D', xM: 6, yM: 0, tumpuan: 'bebas' },
      { nama: 'B', xM: 9, yM: 0, tumpuan: 'rol-x' },
    ]
    const bt: BatangModel[] = [
      { nama: 'AD', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: 15 },
      { nama: 'DB', dari: 1, ke: 2, eMpa: E, aMm2: A, iMm4: I, qKnM: 15 },
    ]
    const h = analisaRangka2D(s, bt, [{ simpul: 1, fyKn: -30 }])
    const b = h.batang[0]!

    // Bandingkan terhadap bentuk tertutupnya, dihitung dari V1 & M1 yang
    // dipulangkan modul ini sendiri lewat deret cuplikan di x = 0.
    const M0 = b.momenKnm.di[0]!.nilai            // = −M1
    const V1 = b.geserKn.di[0]!.nilai
    const xP = V1 / 15
    expect(xP).toBeGreaterThan(0)
    expect(xP).toBeLessThan(6)
    // Puncaknya memang TIDAK jatuh di jaring 0,6 m — kalau jatuh, test ini
    // tak menguji apa pun.
    expect(Math.abs((xP / 0.6) - Math.round(xP / 0.6))).toBeGreaterThan(0.05)

    const mPuncak = M0 + V1 * xP - 15 * xP ** 2 / 2
    expect(b.momenKnm.maks).toBeCloseTo(mPuncak, 6)

    const maksCuplikan = Math.max(...b.momenKnm.di.map((p) => p.nilai))
    expect(b.momenKnm.maks).toBeGreaterThan(maksCuplikan)
  })
})
