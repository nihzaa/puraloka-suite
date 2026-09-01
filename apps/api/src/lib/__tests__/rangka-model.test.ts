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

describe('analisaRangka2D — reaksi tumpuan & gaya ujung batang', () => {
  /*
    ══════════════════════════════════════════════════════════════════════════
    KENAPA DUA MEDAN INI ADA — dua lubang verifikasi yang ditutupnya
    ══════════════════════════════════════════════════════════════════════════

    1. `gayaUjung` menutup lubang di `rangka-invarian.test.ts`. Sebelum ini,
       test invarian harus MEREKONSTRUKSI f[3], f[4], f[5] dari keseimbangan
       batang — dan keseimbangan batang adalah sifat bawaan `kLokal`, bukan
       hasil yang diukur. Akibatnya cacat yang HANYA merusak ujung kedua lolos
       seluruh test tanpa satu pun galat. Sekarang ujung kedua DIBACA.

    2. `reaksi` bukan cuma untuk test. Insinyur yang memeriksa hasil di layar
       juga tak bisa mencocokkan ΣFy tanpa menghitung ulang sendiri — dan yang
       tak bisa dicocokkan tak pernah diperiksa siapa pun.

    ══════════════════════════════════════════════════════════════════════════
    KONVENSI TANDA — DIUKUR, BUKAN DITEBAK
    ══════════════════════════════════════════════════════════════════════════

    `reaksi` adalah gaya yang TUMPUAN berikan kepada STRUKTUR, di sumbu
    GLOBAL. Konsekuensinya:

        Σ reaksi + Σ beban luar = 0   →   Σ reaksi = −Σ beban

    Untuk beban gravitasi (yang bertanda negatif di sumbu Y global) itu
    berarti reaksi tegak keluar POSITIF — ke atas, seperti yang memang
    dilakukan tumpuan. Balok sederhana q = 20 kN/m, L = 6 m memberi
    +60 kN di tiap tumpuan, Σ = +120 kN = qL.

    Untuk beban mendatar P ke arah −X, reaksi mendatarnya +P. Itu yang
    diuji pada portal berbeban lateral di bawah: bebannya −40 kN, jumlah
    reaksi mendatarnya +40 kN.

    ⚠ Tanda yang terbalik di sini TIDAK menimbulkan galat. Ia memberi ΣF
    yang meleset persis 2× beban — angka yang terbaca seperti cacat solver
    padahal cacat konvensi, dan itu benar-benar terjadi saat test invarian
    ditulis pertama kali.
  */

  it('balok sederhana q=20 L=6: dua reaksi +60 kN, Σ = +120 = qL', () => {
    const L = 6, q = 20
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: q }], [])

    // Hanya simpul BERTUMPU yang masuk; simpul bebas tak punya reaksi.
    expect(h.reaksi).toHaveLength(2)
    expect(h.reaksi.map((r) => r.nama)).toEqual(['A', 'B'])
    expect(h.reaksi.map((r) => r.simpul)).toEqual([0, 1])

    for (const r of h.reaksi) {
      expect(r.fyKn).toBeCloseTo(q * L / 2, 6)   // +60 kN, ke ATAS
    }
    const sFy = h.reaksi.reduce((s, r) => s + r.fyKn, 0)
    expect(sFy).toBeCloseTo(q * L, 6)            // +120 = qL, bukan −120

    // Sendi menahan X, rol tidak — tapi tanpa beban mendatar keduanya nol.
    expect(h.reaksi.reduce((s, r) => s + r.fxKn, 0)).toBeCloseTo(0, 6)
    // Keduanya tumpuan sederhana: tak ada momen jepit.
    for (const r of h.reaksi) expect(r.mKnm).toBeCloseTo(0, 6)
  })

  it('kantilever jepit q=20 L=6: satu reaksi, fy = +qL = +120, |m| = wL²/2 = 360', () => {
    const L = 6, q = 20
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'bebas' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: q }], [])

    expect(h.reaksi).toHaveLength(1)             // simpul bebas TIDAK masuk
    const r = h.reaksi[0]!
    expect(r.nama).toBe('A')
    expect(r.fyKn).toBeCloseTo(q * L, 6)         // +120 kN
    expect(r.fxKn).toBeCloseTo(0, 6)

    /*
      Besarnya wL²/2 = 360 kNm. TANDANYA positif dengan konvensi di sini:
      reaksi momen adalah momen yang TUMPUAN berikan kepada struktur, di
      sumbu global (berlawanan jarum jam positif). Beban gravitasi di sebelah
      KANAN jepit memutar batang searah jarum jam terhadap tumpuan, jadi
      tumpuan melawannya berlawanan jarum jam → POSITIF.

      Diperiksa dua-duanya: besarnya (yang punya rumus tabel) DAN tandanya
      (yang cuma bisa diturunkan dari konvensi, jadi ditulis eksplisit di
      sini supaya siapa pun yang membaliknya memerahkan test).
    */
    expect(Math.abs(r.mKnm)).toBeCloseTo(q * L ** 2 / 2, 6)
    expect(r.mKnm).toBeGreaterThan(0)

    // Keseimbangan momen keseluruhan terhadap tumpuan: momen reaksi MELAWAN
    // momen beban qL yang bekerja di L/2.
    expect(r.mKnm - q * L * (L / 2)).toBeCloseTo(0, 6)
  })

  it('portal berbeban lateral −40 kN: ΣfxKn reaksi = +40, ΣfyKn = beban gravitasi', () => {
    /*
      Portal satu lantai satu bentang, kedua kaki jepit. Beban:
        • lateral −40 kN di simpul kiri atas (mendorong ke arah −X)
        • merata q = 15 kN/m di baloknya, bentang 6 m → total gravitasi 90 kN

      Reaksi harus MENAHAN keduanya: ΣfxKn = +40 dan ΣfyKn = +90.
      Diukur 2026-09-01: +40,000000 dan +90,000000.
    */
    const bentang = 6, tinggi = 4, q = 15, P = -40
    const kb = 400, kh = 400, bb = 300, bh = 500
    const simpul: Simpul[] = [
      { nama: 'K1', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'K2', xM: bentang, yM: 0, tumpuan: 'jepit' },
      { nama: 'A1', xM: 0, yM: tinggi, tumpuan: 'bebas' },
      { nama: 'A2', xM: bentang, yM: tinggi, tumpuan: 'bebas' },
    ]
    const batang: BatangModel[] = [
      { nama: 'KKi', dari: 0, ke: 2, eMpa: E, aMm2: kb * kh, iMm4: kb * kh ** 3 / 12 },
      { nama: 'KKa', dari: 1, ke: 3, eMpa: E, aMm2: kb * kh, iMm4: kb * kh ** 3 / 12 },
      { nama: 'B1', dari: 2, ke: 3, eMpa: E, aMm2: bb * bh, iMm4: bb * bh ** 3 / 12, qKnM: q },
    ]
    const h = analisaRangka2D(simpul, batang, [{ simpul: 2, fxKn: P }])

    // Dua kaki jepit; dua simpul atas bebas dan TIDAK boleh muncul.
    expect(h.reaksi).toHaveLength(2)
    expect(h.reaksi.map((r) => r.nama).sort()).toEqual(['K1', 'K2'])

    const sFx = h.reaksi.reduce((s, r) => s + r.fxKn, 0)
    const sFy = h.reaksi.reduce((s, r) => s + r.fyKn, 0)
    expect(sFx).toBeCloseTo(-P, 6)              // +40 kN — menahan beban lateral
    expect(sFy).toBeCloseTo(q * bentang, 6)     // +90 kN — menahan gravitasi

    /*
      Momen guling: Σ(momen reaksi + lengan × gaya reaksi) terhadap titik
      acuan sembarang harus mengimbangi beban. Acuan sengaja BUKAN (0,0) —
      titik asal berimpit dengan tumpuan K1, dan tumpuan yang berimpit acuan
      tak menyumbang momen lengan sama sekali, jadi komponen mendatarnya bisa
      salah tanpa terlihat.
    */
    const xA = -3.7, yA = 2.9
    let sM = 0
    for (const r of h.reaksi) {
      const s = simpul[r.simpul]!
      sM += r.mKnm + (s.xM - xA) * r.fyKn - (s.yM - yA) * r.fxKn
    }
    // Beban titik lateral (fy-nya nol, jadi hanya suku −lengan-y × fx).
    sM -= (simpul[2]!.yM - yA) * P
    // Beban merata balok: resultan q·L ke bawah di tengah bentang.
    sM += (bentang / 2 - xA) * -(q * bentang)
    expect(Math.abs(sM) / (q * bentang * 10)).toBeLessThan(1e-9)
  })

  it('gayaUjung: satu per batang, enam angka, f[1] kantilever = +qL = +120', () => {
    const L = 6, q = 20
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'bebas' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: q }], [])

    expect(h.gayaUjung).toHaveLength(1)
    expect(h.gayaUjung[0]!.nama).toBe('AB')
    expect(h.gayaUjung[0]!.f).toHaveLength(6)
    for (const v of h.gayaUjung[0]!.f) expect(Number.isFinite(v)).toBe(true)

    /*
      PRASYARAT KONVENSI. `f` = gaya yang SIMPUL berikan kepada BATANG, di
      sumbu LOKAL, apa adanya dari solver. Kantilever jepit-kiri q = 20, L = 6
      memberi f[1] = +qL = +120 kN: tumpuan mendorong balok ke ATAS sebesar
      qL, dan tanda positif itu hanya konsisten bila `f` berarti simpul→batang.

      Kalau angka ini berubah, `gayaUjung` sudah bukan `f` mentah lagi —
      seseorang mengolahnya, dan seluruh penurunan reaksi di atasnya ikut
      salah tanpa satu pun galat.
    */
    expect(h.gayaUjung[0]!.f[1]).toBeCloseTo(q * L, 6)
    expect(h.gayaUjung[0]!.f[2]).toBeCloseTo(q * L ** 2 / 2, 6)   // momen jepit
    // Ujung bebas: tak ada gaya sisa di sana.
    expect(h.gayaUjung[0]!.f[4]).toBeCloseTo(0, 6)
    expect(h.gayaUjung[0]!.f[5]).toBeCloseTo(0, 6)
  })

  it('gayaUjung: jumlahnya = jumlah batang, urutannya sama dengan `batang`', () => {
    /*
      Portal tiga batang. Kalau urutannya tak sama dengan array masukan,
      pembaca yang memasangkannya lewat indeks mendapat gaya batang LAIN —
      dan itu tak menimbulkan galat, hanya angka yang salah tempat.
    */
    const simpul: Simpul[] = [
      { nama: 'K1', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'K2', xM: 6, yM: 0, tumpuan: 'jepit' },
      { nama: 'A1', xM: 0, yM: 4, tumpuan: 'bebas' },
      { nama: 'A2', xM: 6, yM: 4, tumpuan: 'bebas' },
    ]
    const batang: BatangModel[] = [
      { nama: 'KKi', dari: 0, ke: 2, eMpa: E, aMm2: 160_000, iMm4: 400 * 400 ** 3 / 12 },
      { nama: 'B1', dari: 2, ke: 3, eMpa: E, aMm2: A, iMm4: I, qKnM: 15 },
      { nama: 'KKa', dari: 1, ke: 3, eMpa: E, aMm2: 160_000, iMm4: 400 * 400 ** 3 / 12 },
    ]
    const h = analisaRangka2D(simpul, batang, [])

    expect(h.gayaUjung).toHaveLength(batang.length)
    expect(h.gayaUjung.map((g) => g.nama)).toEqual(['KKi', 'B1', 'KKa'])
    expect(h.gayaUjung.map((g) => g.nama)).toEqual(h.batang.map((b) => b.nama))
    for (const g of h.gayaUjung) expect(g.f).toHaveLength(6)
  })

  it('gayaUjung MENTAH: cocok dengan gaya dalam yang dilaporkan `batang`', () => {
    /*
      Jembatan antara dua medan keluaran. `gayaDalam` menurunkan V(x) dan M(x)
      dari `f`, jadi hubungannya harus tepat:

          f[1] = geserKn.di[0].nilai        f[2] = −momenKnm.di[0].nilai
          f[0] = −aksialKn

      Kalau `gayaUjung` diolah (dibalik tandanya, dikonversi ke "gaya batang
      kepada simpul", dsb.), ketiganya berhenti cocok. Diperiksa pada portal
      berbeban campur — bukan balok simetris, di mana banyak angka kebetulan
      nol dan perbedaan tanda tak terlihat.
    */
    const simpul: Simpul[] = [
      { nama: 'K1', xM: 0, yM: 0, tumpuan: 'jepit' },
      { nama: 'K2', xM: 7.3, yM: 0, tumpuan: 'sendi' },
      { nama: 'A1', xM: 0, yM: 4.2, tumpuan: 'bebas' },
      { nama: 'A2', xM: 7.3, yM: 4.2, tumpuan: 'bebas' },
    ]
    const batang: BatangModel[] = [
      { nama: 'KKi', dari: 0, ke: 2, eMpa: E, aMm2: 160_000, iMm4: 400 * 400 ** 3 / 12 },
      { nama: 'KKa', dari: 1, ke: 3, eMpa: E, aMm2: 160_000, iMm4: 400 * 400 ** 3 / 12 },
      { nama: 'B1', dari: 2, ke: 3, eMpa: E, aMm2: A, iMm4: I, qKnM: 23.7 },
    ]
    const h = analisaRangka2D(simpul, batang,
      [{ simpul: 2, fxKn: 37 }, { simpul: 3, fyKn: -11, mKnm: 5 }])

    h.batang.forEach((b, e) => {
      const f = h.gayaUjung[e]!.f
      expect(f[0]).toBeCloseTo(-b.aksialKn, 9)
      expect(f[1]).toBeCloseTo(b.geserKn.di[0]!.nilai, 9)
      expect(f[2]).toBeCloseTo(-b.momenKnm.di[0]!.nilai, 9)
    })
  })

  it('simpul TANPA tumpuan tak pernah muncul di `reaksi`', () => {
    /*
      Balok menerus tiga tumpuan dengan satu simpul dalam BEBAS di tengah
      bentang. Simpul bebas yang ikut terdaftar sebagai reaksi akan membuat
      ΣFy terhitung dua kali gaya dalam batang — angka yang besarnya masuk
      akal dan tandanya benar, jadi tak terlihat salah.
    */
    const simpul: Simpul[] = [
      { nama: 'T1', xM: 0, yM: 0, tumpuan: 'sendi' },
      { nama: 'D', xM: 3, yM: 0, tumpuan: 'bebas' },
      { nama: 'T2', xM: 6, yM: 0, tumpuan: 'rol-x' },
      { nama: 'T3', xM: 11, yM: 0, tumpuan: 'rol-x' },
    ]
    const q = 18
    const batang: BatangModel[] = [
      { nama: 'B1', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I, qKnM: q },
      { nama: 'B2', dari: 1, ke: 2, eMpa: E, aMm2: A, iMm4: I, qKnM: q },
      { nama: 'B3', dari: 2, ke: 3, eMpa: E, aMm2: A, iMm4: I, qKnM: q },
    ]
    const h = analisaRangka2D(simpul, batang, [])

    expect(h.reaksi.map((r) => r.nama)).toEqual(['T1', 'T2', 'T3'])
    const sFy = h.reaksi.reduce((s, r) => s + r.fyKn, 0)
    expect(sFy).toBeCloseTo(q * 11, 6)   // total beban 11 m × 18 kN/m

    // Rol-x tak menahan X; sendi menahan. Tanpa beban mendatar semuanya nol.
    expect(h.reaksi.reduce((s, r) => s + Math.abs(r.fxKn), 0)).toBeCloseTo(0, 6)
    // Tak satu pun tumpuan di sini jepit → momen reaksi nol semua.
    for (const r of h.reaksi) expect(r.mKnm).toBeCloseTo(0, 6)
  })

  it('rol-x hanya menahan Y — reaksi mendatarnya dipaku nol, bukan gaya sisa', () => {
    /*
      Balok sederhana berbeban MENDATAR di simpul rol. Rol tak bisa menahan X,
      jadi seluruh 25 kN itu harus ditahan sendi di ujung lain. Kalau reaksi
      diisi apa adanya dari gaya sisa TANPA menyaring arah yang ditahan, rol
      akan melaporkan fxKn bukan-nol — reaksi yang secara fisik tak bisa ada,
      dan ΣFx-nya lalu terhitung dua kali.
    */
    const L = 6, P = 25
    const simpul: Simpul[] = [
      { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
      { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
    ]
    const h = analisaRangka2D(simpul,
      [{ nama: 'AB', dari: 0, ke: 1, eMpa: E, aMm2: A, iMm4: I }],
      [{ simpul: 1, fxKn: P }])

    const rolB = h.reaksi.find((r) => r.nama === 'B')!
    const sendiA = h.reaksi.find((r) => r.nama === 'A')!
    expect(rolB.fxKn).toBe(0)                    // DIPAKU nol, bukan ~1e-14
    expect(rolB.mKnm).toBe(0)
    expect(sendiA.mKnm).toBe(0)
    expect(sendiA.fxKn).toBeCloseTo(-P, 6)       // menahan seluruhnya
  })
})
