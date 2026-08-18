import { describe, it, expect } from 'vitest'
import { analisaPlat, type InputPlat } from '../struktur-plat'

/**
 * GOLDEN TEST PELAT — diadu dengan workbook "5. Analisa Plat Beton Bertulang".
 *
 * Parameter workbook (sheet "Analisa Plat Beton"):
 *   Ly = 2.8 m · Lx = 2.5 m · h = 0.125 m
 *   tumpuan: Y1 & Y2 & X2 menerus, X1 bebas  → Kondisi 9
 *   D = 12 mm · ts = 40 mm · f'c = 24.43 MPa · fy = 280 MPa
 *   beban mati : sendiri 3.0 + finishing 1.1 + plafon 0 + ME 0.5 = 4.6 kN/m²
 *   beban hidup: 3.0 kN/m²
 *   → Qu = 1.2·4.6 + 1.6·3.0 = 10.32 kN/m²
 *   → Ly/Lx = 1.1 → Clx 48, Cly 39, Ctx 48, Cty 39   (kondisi 9)
 *   → Mulx = 48·0.001·10.32·2.5² = 3.096 kNm/m
 */

const INPUT: InputPlat = {
  lyM: 2.8, lxM: 2.5, hM: 0.125,
  tumpuan: { y1: 'menerus', y2: 'menerus', x1: 'bebas', x2: 'menerus' },
  dTulanganMm: 12, jarakTulanganMm: 150, selimutMm: 40,
  mutu: { fcMpa: 24.43, fyMpa: 280 },
  // ⚠ berat sendiri TIDAK diisi di sini — dihitung dari hM.
  // Workbook memintanya sebagai baris input (24 kN/m³ × 0.125 = 3.0 kN/m²);
  // di sini ia turunan tebal, jadi tak bisa lupa diperbarui.
  bebanMatiTambahan: [
    { nama: 'Finishing lantai', nilai: 22, tebalM: 0.05 },  // 1.1 kN/m²
    { nama: 'Plafon dan rangka', nilai: 0 },
    { nama: 'Instalasi ME', nilai: 0.5 },
  ],
  bebanHidupKnM2: 3,
}

describe('analisaPlat — beban & momen vs workbook', () => {
  const h = analisaPlat(INPUT)

  it('kondisi tumpuan → 9 (tiga menerus + satu bebas, bersebelahan)', () => {
    expect(h.kondisi).toBe(9)
  })

  it('rasio Ly/Lx = 1.1 (workbook D62)', () => {
    expect(h.antara.rasio).toBe(1.1)
  })

  it('koefisien dari tabel: Clx 48 · Cly 39 (workbook D63, D64)', () => {
    expect(h.antara.cLx).toBe(48)
    expect(h.antara.cLy).toBe(39)
  })

  /**
   * ⚠ SATU-SATUNYA selisih yang DISENGAJA terhadap workbook.
   *
   * Workbook memakai berat sendiri 3.0 kN/m² (24 kN/m³ × 0.125 m), sementara
   * di sini ia diturunkan dari ρ 2400 kg/m³ → 23.544 kN/m² × 0.125 = 2.943.
   *
   * Selisih 1.9% berasal dari pembulatan 24 vs 23.544 (2400 × 9.81/1000).
   * Yang dipakai di sini adalah nilai fisis; workbook memakai angka bulat
   * yang lazim dipakai insinyur. Keduanya sah — yang TIDAK boleh adalah
   * memakainya diam-diam, karena itu ia ditulis di sini.
   */
  it('Qu ≈ 10.32 kN/m² (workbook D59) — selisih hanya dari berat sendiri', () => {
    // Dengan berat sendiri versi workbook (3.0), Qu-nya persis 10.32.
    const quWorkbook = 1.2 * (3.0 + 1.1 + 0 + 0.5) + 1.6 * 3.0
    expect(quWorkbook).toBeCloseTo(10.32, 10)

    // Versi fisis: 2400 kg/m³ → 23.544 kN/m³
    expect(h.antara.beratSendiriKnM2).toBeCloseTo(0.125 * 2400 * 9.81 / 1000, 9)
    expect(h.antara.quKnM2).toBeGreaterThan(10.2)
    expect(h.antara.quKnM2).toBeLessThan(10.4)
  })

  it('Mulx = Clx · 0.001 · Qu · Lx² — rumus PBI, Lx = sisi PENDEK', () => {
    const harap = 48 * 0.001 * h.antara.quKnM2 * 2.5 * 2.5
    expect(h.momen.mulx).toBeCloseTo(harap, 9)
    // Dengan Qu workbook, hasilnya 3.096 persis.
    expect(48 * 0.001 * 10.32 * 6.25).toBeCloseTo(3.096, 9)
  })

  it('Mu maks diambil dari empat momen, bukan satu arah saja', () => {
    expect(h.momen.maks).toBe(Math.max(
      h.momen.mulx, h.momen.muly, h.momen.mutx, h.momen.muty))
  })
})

describe('analisaPlat — kapasitas', () => {
  const h = analisaPlat(INPUT)

  it('d efektif = h − selimut − ½D', () => {
    expect(h.antara.dEfektifMm).toBeCloseTo(125 - 40 - 6, 9)
  })

  it('As terpasang = (1000/s) · ¼πD² — D12 @ 150', () => {
    const harap = (1000 / 150) * Math.PI / 4 * 144
    expect(h.antara.asAdaMm2).toBeCloseTo(harap, 6)
  })

  it('pelat contoh workbook → AMAN', () => {
    expect(h.aman).toBe(true)
    expect(h.periksa.find((p) => p.nama === 'Lentur')!.aman).toBe(true)
  })

  it('ρmin pelat 0.0020 untuk fy < 420 (susut & suhu SNI §7.6.1.1)', () => {
    expect(h.antara.rhoMin).toBe(0.0020)
    const h420 = analisaPlat({ ...INPUT, mutu: { fcMpa: 24.43, fyMpa: 420 } })
    expect(h420.antara.rhoMin).toBe(0.0018)
  })

  it('jarak tulangan > min(2h, 450) → merah', () => {
    const renggang = analisaPlat({ ...INPUT, jarakTulanganMm: 300 })
    expect(renggang.periksa.find((p) => p.nama === 'Jarak tulangan maksimum')!.aman).toBe(false)
    expect(renggang.aman).toBe(false)
  })

  /**
   * Pelat terlalu tipis: menambah tulangan TIDAK menolong.
   *
   * Ini verdict yang dipisah sendiri karena tindakannya berbeda — "As kurang"
   * dijawab dengan menambah besi, "pelat terlalu tipis" hanya bisa dijawab
   * dengan menebalkan. Menggabungkan keduanya jadi satu "tidak aman" membuat
   * orang menambah tulangan pada pelat yang tak akan pernah cukup.
   */
  it('pelat terlalu tipis → verdict TERPISAH + catatan yang menyebut tindakannya', () => {
    const tipis = analisaPlat({
      ...INPUT, hM: 0.06, lxM: 6, lyM: 7, bebanHidupKnM2: 10,
    })
    expect(tipis.periksa.find((p) => p.nama === 'Tebal pelat memadai')!.aman).toBe(false)
    expect(tipis.catatan.some((c) => /tebalkan pelat/i.test(c))).toBe(true)
  })

  it('beban naik → momen naik (arah hubungan benar)', () => {
    const berat = analisaPlat({ ...INPUT, bebanHidupKnM2: 10 })
    expect(berat.momen.maks).toBeGreaterThan(analisaPlat(INPUT).momen.maks)
  })

  it('menolak geometri mustahil', () => {
    expect(() => analisaPlat({ ...INPUT, hM: 0 })).toThrow()
    expect(() => analisaPlat({ ...INPUT, lxM: 0 })).toThrow()
    expect(() => analisaPlat({ ...INPUT, hM: 0.04, selimutMm: 40 })).toThrow(/melebihi tebal/)
  })
})

describe('analisaPlat — volume untuk RAP', () => {
  const h = analisaPlat(INPUT)

  it('beton = luas × tebal', () => {
    expect(h.volume.betonM3).toBeCloseTo(2.8 * 2.5 * 0.125, 9)
  })

  it('bekisting = luas bawah', () => {
    expect(h.volume.bekistingM2).toBeCloseTo(2.8 * 2.5, 9)
  })

  /**
   * DUA ARAH — penjaga terhadap kesalahan yang paling mahal di modul pelat.
   *
   * Pelat dua arah selalu bertulangan silang. Menghitung satu arah saja
   * membuat tonase kurang hampir setengah, dan tak ada angka yang terlihat
   * salah karenanya.
   */
  it('besi DUA ARAH — bukan satu', () => {
    expect(h.volume.besi).toHaveLength(2)
    const [x, y] = h.volume.besi
    expect(x.panjangPerBatangM).toBeCloseTo(2.8, 9)   // membentang sisi panjang
    expect(y.panjangPerBatangM).toBeCloseTo(2.5, 9)   // membentang sisi pendek
    expect(h.volume.besiTotalKg).toBeCloseTo(x.totalKg + y.totalKg, 9)
  })

  it('jumlah batang = ⌈bentang/jarak⌉ + 1 di tiap arah', () => {
    const [x, y] = h.volume.besi
    expect(x.jumlahBatang).toBe(Math.ceil(2500 / 150) + 1)
    expect(y.jumlahBatang).toBe(Math.ceil(2800 / 150) + 1)
  })

  it('luasM2 eksplisit menimpa lx×ly (pelat tak persegi)', () => {
    const h2 = analisaPlat({ ...INPUT, luasM2: 100 })
    expect(h2.volume.betonM3).toBeCloseTo(100 * 0.125, 9)
    // Kapasitas TIDAK berubah — luas hanya soal volume.
    expect(h2.momen.maks).toBeCloseTo(h.momen.maks, 9)
  })
})
