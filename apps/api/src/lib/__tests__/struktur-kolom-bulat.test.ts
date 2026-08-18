import { describe, it, expect } from 'vitest'
import {
  analisaKolomBulat, batangLingkaran, FAKTOR_PN_MAX, PHI_TEKAN,
  type InputKolomBulat,
} from '../struktur-kolom-bulat'

/**
 * GOLDEN TEST KOLOM LINGKARAN — workbook "3. Analisa Kolom Beton Bertulang
 * [Lingkaran]".
 *
 * Parameter (sheet "Analisa Kolom"):
 *   D = 500 mm · n = 12 · ds = 35 mm · Du = 19 mm · Ds = 10 mm
 *   f'c = 35 MPa · fy = 400 MPa
 */

const INPUT: InputKolomBulat = {
  diameterMm: 500, tinggiM: 3.5, nTulangan: 12, selimutMm: 35,
  dUtamaMm: 19, dPengekangMm: 10, jarakPengekangMm: 75,
  pengekang: 'sengkang',   // ← lihat catatan faktor 0.80 di bawah
  mutu: { fcMpa: 35, fyMpa: 400 },
  puKn: 2000, muKnm: 100,
}

describe('geometri tulangan melingkar — vs workbook', () => {
  const h = analisaKolomBulat(INPUT)

  it('θ₀ = 2π/n = 0.5236 rad (workbook D13)', () => {
    expect(h.antara.theta0Rad).toBeCloseTo(0.52359877559829882, 12)
  })

  it('As = 3402.3448 mm² (workbook D37)', () => {
    expect(h.antara.asMm2).toBeCloseTo(3402.3447999999999, 4)
  })

  it('Ag = 196349.5408 mm² (workbook D38)', () => {
    expect(h.antara.agMm2).toBeCloseTo(196349.54079999999, 4)
  })

  /**
   * ρ = 0.017328 PERSIS — dan angka workbook justru yang "kotor".
   *
   * Workbook menulis 0.017327999781092434 karena ia membulatkan As dan Ag ke
   * 4 desimal LEBIH DULU (`ROUND(…,4)` di D37 & D38), baru membaginya.
   * Dibuktikan: memakai nilai bulat yang sama menghasilkan angka workbook
   * sampai digit terakhir.
   *
   * Implementasi ini membawa presisi penuh, jadi hasilnya 0.017328 bulat —
   * lebih tepat, bukan berbeda. Pembulatan di tengah rantai adalah artefak
   * spreadsheet, sama seperti `ROUND(φ,5)` pada Terzaghi.
   */
  it('ρ = 0.017328 (workbook D39 = 0.0173279997… karena ROUND As & Ag)', () => {
    expect(h.antara.rho).toBeCloseTo(0.017328, 12)

    const asBulat = Math.round(12 * Math.PI / 4 * 19 * 19 * 1e4) / 1e4
    const agBulat = Math.round(0.25 * Math.PI * 500 * 500 * 1e4) / 1e4
    expect(asBulat / agBulat).toBeCloseTo(0.017327999781092434, 15)
  })

  it('d₁ = 450.5 mm (workbook N18)', () => {
    expect(h.antara.d1Mm).toBeCloseTo(450.5, 10)
  })

  it('cb = 270.3 mm (workbook D57)', () => {
    expect(h.antara.cbMm).toBeCloseTo(270.3, 10)
  })

  it('β₁ = 0.814286 untuk f\'c 35 (workbook D59)', () => {
    expect(h.antara.beta1).toBeCloseTo(0.81428571428571428, 12)
  })

  /**
   * dᵢ tiap batang — inilah yang membedakan lingkaran dari persegi.
   *
   * Workbook N18..N24 untuk n=12: 450.5, 423.638, 350.25, 250, 149.75,
   * 76.362, 49.5 — lalu simetris menurun.
   */
  it('dᵢ tiap batang cocok dengan workbook N18..N24', () => {
    const b = batangLingkaran(INPUT, 270.3)
    const harap = [450.5, 423.63809345877996, 350.25, 250,
      149.75000000000006, 76.361906541220094, 49.5]
    for (const [i, d] of harap.entries()) {
      expect(b[i].diMm, `batang ${i + 1}`).toBeCloseTo(d, 8)
    }
  })

  it('θ mulai 0 bila n kelipatan 4 (workbook Q18), setengah bila tidak', () => {
    expect(batangLingkaran(INPUT, 270.3)[0].thetaRad).toBe(0)
    const n10 = batangLingkaran({ ...INPUT, nTulangan: 10 }, 270.3)
    expect(n10[0].thetaRad).toBeCloseTo(0.5 * (2 * Math.PI / 10), 12)
  })

  it('batang tersebar simetris — dᵢ turun lalu naik lagi', () => {
    const b = batangLingkaran(INPUT, 270.3)
    expect(b).toHaveLength(12)
    // Batang 1 terjauh dari serat tekan (d terbesar), batang 7 terdekat.
    expect(b[0].diMm).toBeCloseTo(450.5, 8)
    expect(b[6].diMm).toBeCloseTo(49.5, 8)
    // Simetri: batang 2 dan 12 berjarak sama.
    expect(b[1].diMm).toBeCloseTo(b[11].diMm, 8)
  })

  it('regangan: batang jauh TARIK (+), batang dekat TEKAN (−)', () => {
    const b = batangLingkaran(INPUT, 270.3)
    expect(b[0].epsilon).toBeLessThan(0)     // d 450.5 > c 270.3 → tarik…
    expect(b[6].epsilon).toBeGreaterThan(0)  // d 49.5 < c → tekan
    // Tanda mengikuti konvensi ε = 0.003·(c − d)/c, sama dengan kolom persegi.
  })

  it('fs dibatasi ±fy — baja tak bisa melampaui lelehnya', () => {
    const b = batangLingkaran(INPUT, 270.3)
    for (const x of b) {
      expect(Math.abs(x.fsMpa)).toBeLessThanOrEqual(400)
    }
  })
})

describe('kapasitas aksial & faktor pengekang', () => {
  /**
   * ⚠ SELISIH TERHADAP WORKBOOK yang DISENGAJA — dan ini soal keselamatan.
   *
   * Workbook memberi label input "tulangan SPIRAL" tetapi memakai faktor
   * **0.80** di rumus Pno-nya (sel D77). SNI 2847 §22.4.2.1 memberi:
   *
   *     spiral   0.85 · Po   (φ 0.75)
   *     sengkang 0.80 · Po   (φ 0.65)
   *
   * Salah satu dari label atau rumusnya keliru. Di sini jenis pengekang jadi
   * INPUT EKSPLISIT, jadi angkanya selalu cocok dengan yang benar-benar
   * dipasang — dan `sengkang` memulangkan angka identik dengan workbook.
   */
  it('faktor & φ sesuai SNI, dibedakan per jenis pengekang', () => {
    expect(FAKTOR_PN_MAX).toEqual({ spiral: 0.85, sengkang: 0.80 })
    expect(PHI_TEKAN).toEqual({ spiral: 0.75, sengkang: 0.65 })
  })

  it('Pno = 5680.894 kN dengan faktor 0.80 (workbook D77)', () => {
    const h = analisaKolomBulat(INPUT)  // pengekang: 'sengkang' → 0.80
    // Workbook: 0.8·(0.85·35·Ag + As·(400 − 0.85·35))
    const pnoWorkbook = 0.8 * (0.85 * 35 * 196349.54079999999
      + 3402.3447999999999 * (400 - 0.85 * 35)) * 1e-3
    // Toleransi 1e-5, bukan 1e-6: As & Ag workbook sendiri sudah dibulatkan
    // ke 4 desimal (D37/D38), jadi selisih 1.2e-6 di sini adalah pembulatan
    // itu — bukan rumus yang berbeda.
    expect(pnoWorkbook).toBeCloseTo(5680.893601974818, 5)

    // Implementasi memakai bentuk (Ag − As), setara secara aljabar:
    //   0.85·f'c·Ag + As·fy − 0.85·f'c·As ≡ 0.85·f'c·(Ag − As) + As·fy
    // Selisih 1.4e-5 kN (2.5e-9 relatif) berasal dari As & Ag penuh vs bulat.
    expect(h.antara.pnMaxKn).toBeCloseTo(pnoWorkbook, 4)

    // Kesetaraan aljabarnya DIBUKTIKAN, bukan diasumsikan: dengan As & Ag
    // yang sama persis, kedua bentuk menghasilkan angka identik.
    const As = 12 * Math.PI / 4 * 19 * 19
    const Ag = 0.25 * Math.PI * 500 * 500
    const bentukWorkbook = 0.8 * (0.85 * 35 * Ag + As * (400 - 0.85 * 35)) * 1e-3
    const bentukSini = 0.8 * (0.85 * 35 * (Ag - As) + As * 400) * 1e-3
    expect(bentukSini).toBeCloseTo(bentukWorkbook, 9)
  })

  it('spiral memberi kapasitas LEBIH TINGGI dari sengkang — selisihnya nyata', () => {
    const sengkang = analisaKolomBulat(INPUT)
    const spiral = analisaKolomBulat({ ...INPUT, pengekang: 'spiral' })
    // 0.85/0.80 pada Pn, dan 0.75/0.65 pada φ → φPn naik ±22%.
    expect(spiral.antara.phiPnKn / sengkang.antara.phiPnKn).toBeCloseTo(
      (0.85 * 0.75) / (0.80 * 0.65), 9)
  })

  it('beban berlebih → TIDAK aman', () => {
    const berat = analisaKolomBulat({ ...INPUT, puKn: 99_999 })
    expect(berat.aman).toBe(false)
    expect(berat.periksa.find((p) => p.nama === 'Kapasitas aksial')!.aman).toBe(false)
  })

  it('ρ di luar 1%–8% tertangkap dua arah', () => {
    const kurus = analisaKolomBulat({ ...INPUT, diameterMm: 1200 })
    expect(kurus.periksa.find((p) => p.nama === 'Rasio tulangan')!.aman).toBe(false)
    const gemuk = analisaKolomBulat({ ...INPUT, diameterMm: 300, dUtamaMm: 25 })
    expect(gemuk.periksa.find((p) => p.nama === 'Rasio tulangan')!.aman).toBe(false)
  })

  it('pitch spiral > 75 mm → merah (§25.7.3.1)', () => {
    const renggang = analisaKolomBulat({
      ...INPUT, pengekang: 'spiral', jarakPengekangMm: 150,
    })
    expect(renggang.periksa.find((p) => p.nama === 'Pitch spiral maksimum')!.aman).toBe(false)
  })

  it('menolak n < 6 (SNI §10.7.3.1)', () => {
    expect(() => analisaKolomBulat({ ...INPUT, nTulangan: 4 })).toThrow(/minimal 6/)
  })

  it('menyatakan BATAS-nya — bukan diagram P-M penuh', () => {
    const h = analisaKolomBulat(INPUT)
    expect(h.catatan.some((c) => /BUKAN diagram interaksi P-M penuh/i.test(c))).toBe(true)
  })
})

describe('volume kolom bulat untuk RAP', () => {
  const h = analisaKolomBulat(INPUT)

  it('beton = ¼πD²·L, bekisting = πD·L', () => {
    expect(h.volume.betonM3).toBeCloseTo(0.25 * Math.PI * 0.5 * 0.5 * 3.5, 9)
    expect(h.volume.bekistingM2).toBeCloseTo(Math.PI * 0.5 * 3.5, 9)
  })

  it('12 batang utama setinggi kolom', () => {
    const u = h.volume.besi.find((b) => b.peran === 'utama')!
    expect(u.jumlahBatang).toBe(12)
    expect(u.panjangPerBatangM).toBe(3.5)
  })

  /**
   * Spiral dihitung sebagai HELIKS.
   *
   * Panjang satu putaran = √((π·Dinti)² + pitch²), bukan π·Dinti saja.
   * Selisihnya kecil per putaran tetapi kolom 3.5 m berpitch 75 mm punya
   * 47 putaran — dan kekurangan besi baru ketahuan di lapangan.
   */
  it('spiral memperhitungkan kemiringan heliks, sengkang tidak', () => {
    const spiral = analisaKolomBulat({ ...INPUT, pengekang: 'spiral' })
    const s = spiral.volume.besi.find((b) => b.peran === 'sengkang')!
    const dInti = (500 - 2 * 35 - 10) / 1000
    const keliling = Math.PI * dInti
    const pitch = 0.075
    expect(s.panjangPerBatangM).toBeCloseTo(
      Math.sqrt(keliling * keliling + pitch * pitch), 9)
    // Lebih panjang dari lingkaran datar — itu intinya.
    expect(s.panjangPerBatangM).toBeGreaterThan(keliling)
  })

  it('sengkang = cincin datar + kait 2×6db', () => {
    const s = h.volume.besi.find((b) => b.peran === 'sengkang')!
    const dInti = (500 - 2 * 35 - 10) / 1000
    expect(s.panjangPerBatangM).toBeCloseTo(Math.PI * dInti + 2 * 6 * 0.010, 9)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const lima = analisaKolomBulat({ ...INPUT, jumlah: 5 })
    expect(lima.volume.betonM3).toBeCloseTo(h.volume.betonM3 * 5, 9)
    expect(lima.antara.phiPnKn).toBeCloseTo(h.antara.phiPnKn, 9)
  })
})
