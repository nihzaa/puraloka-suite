import { describe, it, expect } from 'vitest'
import { analisaBalokT, beta1, type InputBalokT } from '../struktur-balok-t'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BALOK T / BALOK ANAK — flens efektif, momen dua arah, geser pakai badan
 *
 * Angka pembanding dihitung tangan, bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const DASAR: InputBalokT = {
  bwMm: 200, hMm: 400, hfMm: 120,
  bentangBersihM: 4, jarakAsAsM: 3,
  selimutMm: 30, dUtamaMm: 16, nTarik: 3, nAtas: 2,
  dSengkangMm: 8, jarakSengkangMm: 150,
  mutu: { fcMpa: 25, fyMpa: 400 },
  muPositifKnm: 60, muNegatifKnm: 40, vuKn: 70,
}

describe('lebar flens efektif — yang TERKECIL dari tiga batas', () => {
  it('batas 8×tebal pelat', () => {
    /* 200 + 2 × (8 × 120) = 200 + 1920 = 2120 mm */
    expect(analisaBalokT(DASAR).flens.batasTebalMm).toBeCloseTo(2120, 1)
  })

  it('batas bentang/8', () => {
    /* 200 + 2 × (4000/8) = 200 + 1000 = 1200 mm */
    expect(analisaBalokT(DASAR).flens.batasBentangMm).toBeCloseTo(1200, 1)
  })

  it('batas jarak as-as', () => {
    /* 3000 mm — tak boleh tumpang tindih dengan balok sebelah */
    expect(analisaBalokT(DASAR).flens.batasJarakMm).toBeCloseTo(3000, 1)
  })

  it('yang DIPAKAI adalah yang terkecil, dan penentunya disebutkan', () => {
    /*
      min(2120, 1200, 3000) = 1200 mm. Memakai yang terbesar melebihkan
      kapasitas lentur, dan kelebihannya tak terlihat karena hasilnya tetap
      "aman".
    */
    const f = analisaBalokT(DASAR).flens
    expect(f.beMm).toBeCloseTo(1200, 1)
    expect(f.penentu).toBe('bentang/8')
  })

  it('bentang panjang → yang menentukan tebal pelat', () => {
    /* Ln 20 m → batas bentang 5200; batas tebal 2120 yang menang */
    const f = analisaBalokT({ ...DASAR, bentangBersihM: 20, jarakAsAsM: 6 }).flens
    expect(f.beMm).toBeCloseTo(2120, 1)
    expect(f.penentu).toBe('8×tebal pelat')
  })

  it('balok berdekatan → yang menentukan jarak as-as', () => {
    const f = analisaBalokT({ ...DASAR, jarakAsAsM: 0.8 }).flens
    expect(f.beMm).toBeCloseTo(800, 1)
    expect(f.penentu).toBe('jarak as-as balok')
  })

  it('balok TEPI hanya punya flens satu sisi', () => {
    /*
      Balok tepi yang dihitung sebagai balok tengah melebihkan kapasitas justru
      pada balok yang paling sering memikul dinding luar.
    */
    const tengah = analisaBalokT(DASAR).flens.beMm
    const tepi = analisaBalokT({ ...DASAR, balokTepi: true }).flens.beMm
    expect(tepi).toBeLessThan(tengah)
    /* 200 + 1 × 500 = 700 mm */
    expect(tepi).toBeCloseTo(700, 1)
  })
})

describe('momen POSITIF — penampang T', () => {
  it('blok tekan di dalam flens untuk tulangan sedang', () => {
    /*
      As = 3 × π/4 × 16² = 603,19 mm²
      a  = 603,19 × 400 / (0,85 × 25 × 1200) = 9,46 mm  → jauh di bawah hf 120
    */
    const k = analisaBalokT(DASAR).kapasitas
    expect(k.blokDiFlens).toBe(true)
    expect(k.aMm).toBeCloseTo(9.46, 1)
  })

  it('φMn positif = 0,9·As·fy·(d − a/2)', () => {
    /*
      d = 400 − 30 − 8 − 8 = 354 mm
      φMn = 0,9 × 603,19 × 400 × (354 − 4,73) / 1e6 = 75,86 kNm
    */
    expect(analisaBalokT(DASAR).kapasitas.phiMnPositifKnm).toBeCloseTo(75.86, 1)
  })

  it('kapasitas T LEBIH BESAR daripada persegi selebar badan', () => {
    /*
      Inilah alasan modul ini ada: balok anak 200×400 yang sebenarnya cukup
      akan "gagal" di atas kertas kalau dihitung persegi, lalu diperbesar pada
      SETIAP balok anak di proyek.
    */
    const k = analisaBalokT(DASAR).kapasitas
    expect(k.phiMnPositifKnm).toBeGreaterThan(k.phiMnNegatifKnm)
  })

  it('tulangan BANYAK + pelat TIPIS → blok menembus flens', () => {
    /*
      Rumusnya berubah: gaya tekan dipecah jadi bagian flens menonjol dan
      bagian badan. Memakai rumus persegi di sini melebihkan kapasitas.
    */
    const h = analisaBalokT({
      ...DASAR, hfMm: 60, nTarik: 8, dUtamaMm: 25,
      bentangBersihM: 3, jarakAsAsM: 0.6,
    })
    expect(h.kapasitas.blokDiFlens).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/MENEMBUS tebal pelat/i)
  })
})

describe('momen NEGATIF — penampang PERSEGI, flens tak membantu', () => {
  it('dihitung dengan lebar BADAN, bukan flens', () => {
    /*
      As atas = 2 × π/4 × 16² = 402,12 mm²
      a = 402,12 × 400 / (0,85 × 25 × 200) = 37,85 mm
      φMn = 0,9 × 402,12 × 400 × (354 − 18,92) / 1e6 = 48,52 kNm
    */
    expect(analisaBalokT(DASAR).kapasitas.phiMnNegatifKnm).toBeCloseTo(48.52, 1)
  })

  it('pemeriksaan negatif MUNCUL bila ada momen negatif', () => {
    const h = analisaBalokT(DASAR)
    expect(h.periksa.some((p) => p.nama.includes('negatif'))).toBe(true)
  })

  it('pemeriksaan negatif TIDAK muncul bila tumpuan sederhana', () => {
    /*
      Momen negatif nol berarti tumpuan sederhana — memaksakan pemeriksaan
      yang syaratnya nol menghasilkan baris yang selalu "aman" dan tak berarti.
    */
    const h = analisaBalokT({ ...DASAR, muNegatifKnm: 0 })
    expect(h.periksa.some((p) => p.nama.includes('negatif'))).toBe(false)
  })

  it('menandai tumpuan yang tulangan atasnya kurang', () => {
    const h = analisaBalokT({ ...DASAR, muNegatifKnm: 80 })
    expect(h.periksa.find((p) => p.nama.includes('negatif'))!.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('menjelaskan kenapa flens tak membantu di tumpuan', () => {
    expect(analisaBalokT(DASAR).catatan.join(' '))
      .toMatch(/sisi tarik dan tidak membantu/i)
  })
})

describe('geser — memakai lebar BADAN', () => {
  it('φVc memakai bw, bukan be', () => {
    /*
      0,75 × 0,17 × √25 × 200 × 354 / 1000 = 45,14 kN

      Memakai be (1200 mm) melebihkan kapasitas geser SIX kali lipat — dan
      kegagalan geser terjadi tiba-tiba tanpa peringatan.
    */
    expect(analisaBalokT(DASAR).antara.phiVc).toBeCloseTo(45.14, 1)
  })

  it('sengkang menambah kapasitas', () => {
    const rapat = analisaBalokT({ ...DASAR, jarakSengkangMm: 100 })
    const jarang = analisaBalokT({ ...DASAR, jarakSengkangMm: 250 })
    expect(rapat.antara.phiVs).toBeGreaterThan(jarang.antara.phiVs)
  })

  it('rumus geser menyebut BADAN secara eksplisit', () => {
    expect(analisaBalokT(DASAR).periksa.find((p) => p.nama === 'Geser')!.rumus)
      .toMatch(/BADAN/i)
  })
})

describe('volume — flens TIDAK dihitung dua kali', () => {
  it('beton = badan saja (h − hf), bukan tinggi penuh', () => {
    /*
      0,2 × (0,4 − 0,12) × 4 = 0,224 m³

      Menghitung tinggi penuh berarti beton pelat dihitung DUA KALI, dan RAB
      membengkak tanpa ada yang tahu dari mana.
    */
    expect(analisaBalokT(DASAR).volume.betonM3).toBeCloseTo(0.224, 4)
  })

  it('bekisting = dua sisi badan + dasar, sisi atas menyatu pelat', () => {
    /* 2 × 0,28 × 4 + 0,2 × 4 = 2,24 + 0,8 = 3,04 m² */
    expect(analisaBalokT(DASAR).volume.bekistingM2).toBeCloseTo(3.04, 3)
  })

  it('besi memuat tulangan utama (tarik + atas) dan sengkang', () => {
    const besi = analisaBalokT(DASAR).volume.besi
    expect(besi.map((b) => b.peran).sort()).toEqual(['sengkang', 'utama'])
    const utama = besi.find((b) => b.peran === 'utama')!
    expect(utama.jumlahBatang).toBe(5)   // 3 tarik + 2 atas
  })

  it('besiTotalKg = jumlah barisnya', () => {
    const v = analisaBalokT(DASAR).volume
    expect(v.besiTotalKg).toBeCloseTo(v.besi.reduce((s, b) => s + b.totalKg, 0), 3)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const satu = analisaBalokT(DASAR)
    const sepuluh = analisaBalokT({ ...DASAR, jumlah: 10 })
    expect(sepuluh.volume.betonM3).toBeCloseTo(satu.volume.betonM3 * 10, 4)
    expect(sepuluh.aman).toBe(satu.aman)
  })
})

describe('penjagaan masukan', () => {
  it('MENOLAK pelat setebal atau lebih tebal daripada baloknya', () => {
    /* Itu bukan balok T melainkan pelat — masukannya pasti salah. */
    expect(() => analisaBalokT({ ...DASAR, hfMm: 400 })).toThrow(/bukan balok T/i)
    expect(() => analisaBalokT({ ...DASAR, hfMm: 500 })).toThrow()
  })

  it('MENOLAK tulangan atas kurang dari 2 — sengkang harus digantung', () => {
    expect(() => analisaBalokT({ ...DASAR, nAtas: 1 })).toThrow(/digantung/i)
  })

  it('menolak tulangan tarik kurang dari 2', () => {
    expect(() => analisaBalokT({ ...DASAR, nTarik: 1 })).toThrow(/minimal 2/i)
  })

  it.each([
    ['bw', { bwMm: 0 }],
    ['h', { hMm: -1 }],
    ['hf', { hfMm: 0 }],
    ['bentang', { bentangBersihM: 0 }],
    ["f'c", { mutu: { fcMpa: 0, fyMpa: 400 } }],
  ])('menolak %s tak masuk akal', (_n, ubah) => {
    expect(() => analisaBalokT({ ...DASAR, ...ubah } as InputBalokT)).toThrow()
  })
})

describe('beta1 sesuai SNI 2847 §22.2.2.4.3', () => {
  it('0,85 untuk f\'c ≤ 28 MPa', () => {
    expect(beta1(20)).toBe(0.85)
    expect(beta1(28)).toBe(0.85)
  })

  it('turun bertahap di atas 28 MPa', () => {
    /* 0,85 − 0,05 × (35−28)/7 = 0,80 */
    expect(beta1(35)).toBeCloseTo(0.80, 4)
  })

  it('tak pernah di bawah 0,65', () => {
    expect(beta1(100)).toBe(0.65)
  })
})
