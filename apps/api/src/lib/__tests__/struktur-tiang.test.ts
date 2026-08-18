import { describe, it, expect } from 'vitest'
import {
  analisaTiang, kapasitasBahanTiang, dayaDukungSpt, dayaDukungSondir,
  type InputTiang, type LapisanTanah,
} from '../struktur-tiang'

/**
 * GOLDEN TEST TIANG PANCANG — workbook "6. Analisa Daya Dukung Tiang Pancang".
 *
 * Parameter (sheet "Daya Dukung Aksial (SPT)"):
 *   D = 0.4 m · L = 16 m · f'c = 36.6 MPa · γbeton = 24 kN/m³ · fr = 0.6
 *   Data SPT: 8 lapisan × 2 m, N = 6, 8, 10, 16, 25, 33, 46, 46
 *   → ΣL·N = 380 · N̄ = 380/16 = 23.75 · Nb = 46
 */

/** Delapan lapisan @2 m, sesuai tabel SPT workbook. */
const LAPISAN: LapisanTanah[] = [6, 8, 10, 16, 25, 33, 46, 46]
  .map((n) => ({ tebalM: 2, nSpt: n }))

const INPUT: InputTiang = {
  diameterM: 0.4, panjangM: 16, fcMpa: 36.6,
  gammaBetonKnM3: 24, faktorReduksiBahan: 0.6, faktorReduksiTanah: 0.6,
  lapisan: LAPISAN,
}

describe('kapasitas BAHAN tiang — vs workbook', () => {
  const b = kapasitasBahanTiang(INPUT)

  it('A = π/4·D² = 0.1256637 m² (workbook D12)', () => {
    expect(b.aM2).toBeCloseTo(0.12566370614359174, 12)
  })

  it('Wp = A·L·γ = 48.2549 kN (workbook D13)', () => {
    expect(b.wpKn).toBeCloseTo(48.254863159139227, 9)
  })

  it("Pn = 0.30·f'c·A − 1.2·Wp = 1321.88 kN (workbook D16)", () => {
    // Berat sendiri DIKURANGKAN — pada L=16 m nilainya 48 kN, bukan angka
    // yang bisa dibulatkan hilang.
    expect(b.pnKn).toBeCloseTo(1321.88165766567, 8)
  })

  it('P ijin bahan = Pn × 0.6 = 793.129 kN (workbook D18)', () => {
    expect(b.pIjinKn).toBeCloseTo(793.12899459940195, 8)
  })
})

describe('daya dukung TANAH (SPT) — vs workbook', () => {
  const t = dayaDukungSpt(INPUT)

  it('N̄ = ΣL·N / L = 380/16 = 23.75 (workbook D46)', () => {
    expect(t.antara.nRata).toBeCloseTo(23.75, 10)
  })

  it('Nb = N di UJUNG tiang = 46, bukan rata-rata (workbook D47)', () => {
    expect(t.antara.nb).toBe(46)
  })

  it('As = π·D·L = 20.1062 m² (workbook D51)', () => {
    expect(t.antara.asM2).toBeCloseTo(20.106192982974676, 9)
  })

  it('Qult = 40·Nb·Ab + N̄·As = 708.743 kN (workbook D57)', () => {
    expect(t.antara.qUltKn).toBeCloseTo(708.74330264985736, 8)
  })

  it('batas atas 380·N̄·Ab = 1134.115 kN (workbook I57) IKUT diperiksa', () => {
    expect(t.antara.batasAtasKn).toBeCloseTo(1134.1149479459154, 8)
    // Qult < batas → yang dipakai Qult (workbook: "O.K.")
    expect(t.pUltKn).toBeCloseTo(708.74330264985736, 8)
  })

  it('P ijin tanah = 425.246 kN (workbook D61)', () => {
    expect(t.pIjinKn).toBeCloseTo(425.24598158991438, 8)
  })

  it('batas atas MENGGIGIT bila tanah sangat keras di ujung', () => {
    // Nb besar tapi N̄ kecil → 40·Nb·Ab melambung, batas atas menahannya.
    const keras = dayaDukungSpt({
      ...INPUT,
      lapisan: [...Array(7).fill({ tebalM: 2, nSpt: 5 }), { tebalM: 2, nSpt: 200 }],
    })
    expect(keras.antara.qUltKn).toBeGreaterThan(keras.antara.batasAtasKn)
    expect(keras.pUltKn).toBe(keras.antara.batasAtasKn)
  })
})

describe('analisaTiang — yang MENENTUKAN adalah yang terkecil', () => {
  const h = analisaTiang(INPUT)

  it('P ijin = min(bahan 793.13, tanah 425.25) = 425.25 kN (workbook D65)', () => {
    expect(h.pIjinKn).toBeCloseTo(425.24598158991438, 8)
    expect(h.penentu).toBe('SPT (Meyerhof)')
  })

  it('kedua kapasitas dilaporkan, bukan cuma yang menang', () => {
    // Tanpa keduanya terlihat, orang tak tahu apakah menambah mutu beton
    // akan menolong (tidak, kalau tanah yang membatasi).
    expect(h.pIjinBahanKn).toBeCloseTo(793.12899459940195, 8)
    expect(h.tanah).toHaveLength(1)
  })

  /**
   * Kapan BAHAN yang membatasi — dan koreksi terhadap dugaan saya sendiri.
   *
   * Percobaan pertama memakai "tiang PENDEK di tanah keras" (L=4 m, N=60) dan
   * MERAH: tanah tetap yang menentukan. Dihitung ulang untuk lima kombinasi,
   * dan ternyata pada tiang pendek batas atas `380·N̄·Ab` selalu menggigit —
   * kapasitas tanah tak pernah melambung sampai melewati bahan.
   *
   * Yang sebenarnya membuat bahan membatasi: tiang PANJANG & RAMPING bermutu
   * RENDAH. Berat sendiri (dikurangkan 1.2×) tumbuh sebanding L, sementara
   * kapasitas penampang tetap — sedangkan tanah justru bertambah karena
   * selimutnya makin luas.
   *
   *     D 0.3 · L 20 · f'c 20 · N 50  →  bahan 230 kN vs tanah 650 kN
   *
   * Test ini menjaga pemahaman itu, sekaligus membuktikan `penentu` benar-benar
   * berubah dan bukan konstanta.
   */
  it('tiang PANJANG & RAMPING bermutu rendah → BAHAN yang menentukan', () => {
    const ramping = analisaTiang({
      ...INPUT, diameterM: 0.3, panjangM: 20, fcMpa: 20,
      lapisan: Array(10).fill(null).map(() => ({ tebalM: 2, nSpt: 50 })),
    })
    expect(ramping.penentu).toBe('bahan')
    expect(ramping.pIjinKn).toBeCloseTo(ramping.pIjinBahanKn, 9)
    // Dan tanahnya memang jauh lebih besar — bukan sekadar beda tipis.
    expect(ramping.tanah[0].pIjinKn).toBeGreaterThan(ramping.pIjinBahanKn * 2)
  })

  it('tiang pendek di tanah keras → TANAH tetap menentukan (batas atas menggigit)', () => {
    // Kebalikan dari dugaan awal, dan justru itu yang layak dikunci.
    const pendek = analisaTiang({
      ...INPUT, panjangM: 4, lapisan: [{ tebalM: 4, nSpt: 60 }],
    })
    expect(pendek.penentu).toBe('SPT (Meyerhof)')
  })

  it('beban rencana melebihi kapasitas → TIDAK aman', () => {
    const berat = analisaTiang({ ...INPUT, bebanRencanaKn: 600 })
    expect(berat.aman).toBe(false)
    expect(berat.periksa[0].rumus).toContain('SPT')
  })

  it('beban rencana di bawah kapasitas → aman', () => {
    expect(analisaTiang({ ...INPUT, bebanRencanaKn: 300 }).aman).toBe(true)
  })

  it('tanpa data tanah → catatan TEGAS, bukan angka bahan diam-diam', () => {
    const h2 = analisaTiang({ ...INPUT, lapisan: [] })
    expect(h2.tanah).toHaveLength(0)
    expect(h2.catatan.some((c) => /BUKAN daya dukung tiang/i.test(c))).toBe(true)
  })

  it('tiang terlalu panjang → kapasitas bahan habis oleh berat sendiri', () => {
    // Pn ≤ 0 MELEMPAR: memulangkan angka negatif akan terbaca sebagai
    // kapasitas yang "kecil" padahal artinya tiangnya mustahil.
    expect(() => analisaTiang({ ...INPUT, panjangM: 400 }))
      .toThrow(/berat sendiri tiang melebihi/)
  })

  it('menolak dimensi mustahil', () => {
    expect(() => analisaTiang({ ...INPUT, diameterM: 0 })).toThrow()
    expect(() => analisaTiang({ ...INPUT, fcMpa: 0 })).toThrow()
  })

  it('volume beton = A · L · jumlah', () => {
    const lima = analisaTiang({ ...INPUT, jumlah: 5 })
    expect(lima.volume.betonM3).toBeCloseTo(0.12566370614359174 * 16 * 5, 9)
    expect(lima.volume.totalPanjangM).toBe(80)
    // Kapasitas per tiang tak berubah.
    expect(lima.pIjinKn).toBeCloseTo(analisaTiang(INPUT).pIjinKn, 9)
  })
})

describe('daya dukung sondir', () => {
  const SONDIR: InputTiang = {
    ...INPUT,
    lapisan: Array(8).fill(null).map(() => ({ tebalM: 2, qcKgCm2: 50, jhpKgCm: 5 })),
  }

  it('qc ujung dikonversi kg/cm² → kPa (×98.0665)', () => {
    const s = dayaDukungSondir(SONDIR)
    expect(s.antara.qcUjungKpa).toBeCloseTo(50 * 98.0665, 6)
  })

  it('Qb = ω·Ab·qc (workbook D26 pola sama)', () => {
    const s = dayaDukungSondir(SONDIR)
    expect(s.antara.qbKn).toBeCloseTo(
      Math.PI / 4 * 0.16 * 50 * 98.0665, 6)
  })

  it('SPT & sondir berselisih jauh → ditandai, yang dipakai TERKECIL', () => {
    const dua = analisaTiang({
      ...INPUT,
      lapisan: LAPISAN.map((l, i) => ({ ...l, qcKgCm2: 250, jhpKgCm: 20 + i })),
    })
    expect(dua.tanah).toHaveLength(2)
    expect(dua.pIjinKn).toBe(Math.min(
      dua.pIjinBahanKn, ...dua.tanah.map((t) => t.pIjinKn)))
  })

  it('tanpa data qc → melempar, bukan memulangkan nol', () => {
    expect(() => dayaDukungSondir(INPUT)).toThrow(/tak ada lapisan ber-qc/)
  })
})
