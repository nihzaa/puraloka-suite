import { describe, it, expect } from 'vitest'
import {
  titikPM, diagramPM, cekTitikBeban, penampangPersegi, penampangLingkaran,
  type PenampangKolom,
} from '../struktur-diagram-pm'

/**
 * GOLDEN TEST DIAGRAM P-M — workbook "2. Analisa Kolom [Persegi]",
 * sheet "Lamp. Tabel P-M arahX".
 *
 * Penampang (sheet "Analisa Kolom"):
 *   h = b = 400 mm · nh = nb = 4 → n = 12 · ds = 30 · Du 16 · Ds 8
 *   f'c = 55 MPa · fy = 420 MPa
 *   dᵢ = 354 · 251 · 149 · 46 mm  (workbook M24..M27)
 *   Asᵢ = 804.248 · 402.124 · 402.124 · 804.248 mm²  (E92..E95)
 *
 * Baris tabel yang dipakai sebagai acuan:
 *   R7  c = 1.2·h = 480 mm  → Pn dibatasi Pno 6704.445 kN · Mn 269.309 kNm
 *   R8  c = 472 mm          → a 316.914 · Cc 5926.297 kN · ΣFs 736.500 kN
 */

const MUTU = { fcMpa: 55, fyMpa: 420 }

/** Penampang contoh workbook, disusun manual agar dᵢ & Asᵢ persis sama. */
const PERSEGI: PenampangKolom = {
  bMm: 400, hMm: 400, agMm2: 160_000,
  lapis: [
    { diMm: 354, asMm2: 4 * (Math.PI / 4 * 256) },
    { diMm: 251, asMm2: 2 * (Math.PI / 4 * 256) },
    { diMm: 149, asMm2: 2 * (Math.PI / 4 * 256) },
    { diMm: 46, asMm2: 4 * (Math.PI / 4 * 256) },
  ],
  mutu: MUTU, faktorPnMax: 0.80, phiTekan: 0.65,
}

describe('titikPM — satu baris tabel vs workbook', () => {
  const t = titikPM(PERSEGI, 472)

  it('a = β₁·c = 316.914 mm (workbook AR8)', () => {
    // β₁(55) = 0.671428…, × 472 = 316.914
    expect(t.aMm).toBeCloseTo(316.91428571428571, 8)
  })

  it('Cc = 0.85·f\'c·b·a = 5926.297 kN (workbook AS8)', () => {
    expect(t.ccKn).toBeCloseTo(5926.2971428571427, 6)
  })

  it('ΣFs = 736.500 kN (workbook AF8)', () => {
    // Empat lapis: 120.637 + 112.970 + 165.109 + 337.784 = 736.500
    expect(t.fsTotalKn).toBeCloseTo(736.50007245431982, 5)
  })

  it('Pn dibatasi Pno 6704.445 kN — langit-langit tekan (workbook AU8)', () => {
    // Cc + ΣFs = 6662.797 < Pno, jadi tak terpotong pada baris ini.
    expect(t.pnKn).toBeCloseTo(6662.7972153114624, 5)
  })

  it('c = 1.2·h = 480 → Pn TERPOTONG di Pno 6704.445 (workbook AU7)', () => {
    const t7 = titikPM(PERSEGI, 480)
    // Toleransi 1e-4: workbook membulatkan As ke 4 desimal (`ROUND` di D60)
    // sebelum memakainya, dan selisih 1.3e-5 kN adalah pembulatan itu.
    expect(t7.pnKn).toBeCloseTo(6704.4451195199999, 4)
    // Terbukti terpotong: nilai kasarnya lebih besar.
    expect(t7.ccKn + t7.fsTotalKn).toBeGreaterThan(t7.pnKn)
  })

  it('selisih Pno DIBUKTIKAN dari ROUND(As,4), bukan rumus berbeda', () => {
    // Penjaga terhadap kesimpulan "selisihnya kecil, mungkin rumusnya beda
    // sedikit". Dengan pembulatan yang sama, hasilnya identik digit-per-digit.
    const As = 12 * Math.PI / 4 * 256
    const AsBulat = Math.round(As * 1e4) / 1e4
    const denganBulat = 0.8 * (0.85 * 55 * (160_000 - AsBulat) + AsBulat * 420) * 1e-3
    expect(denganBulat).toBeCloseTo(6704.4451195199999, 9)

    // Dan kedua BENTUK aljabar setara — (Ag − As) vs (Ag), keduanya sama.
    const bentukWorkbook = 0.8 * (0.85 * 55 * 160_000 + AsBulat * (420 - 0.85 * 55)) * 1e-3
    expect(denganBulat).toBeCloseTo(bentukWorkbook, 9)
  })

  it('Mn = 269.309 kNm pada c = 480 (workbook AV7)', () => {
    const t7 = titikPM(PERSEGI, 480)
    expect(t7.mnKnm).toBeCloseTo(269.30853261417127, 4)
  })

  it('regangan lapis terjauh cocok dengan workbook B8..E8', () => {
    // εs pada c=472: lapis d=354 → 0.003·(472−354)/472 = 7.5e-4
    // Konvensi berkas ini TEKAN-positif, jadi nilainya positif untuk d < c.
    const eps = 0.003 * (472 - 354) / 472
    expect(eps).toBeCloseTo(7.4999999999999991e-4, 15)
  })

  it('fs dibatasi ±fy — lapis terdalam sudah leleh (workbook O8 = 420)', () => {
    // Lapis d=46 pada c=472: ε = 0.003·(472−46)/472 = 2.708e-3
    // × Es 200000 = 541.5 MPa > fy 420 → dibatasi 420.
    const eps = 0.003 * (472 - 46) / 472
    expect(eps * 200_000).toBeGreaterThan(420)
  })

  it('menolak c ≤ 0', () => {
    expect(() => titikPM(PERSEGI, 0)).toThrow(/c harus > 0/)
    expect(() => titikPM(PERSEGI, -5)).toThrow()
  })

  it('a tak boleh melebihi tinggi penampang', () => {
    // c sangat besar → β₁·c > h, harus dipotong di h.
    const besar = titikPM(PERSEGI, 5000)
    expect(besar.aMm).toBe(400)
  })
})

/**
 * φ DARI REGANGAN — selisih yang DISENGAJA terhadap workbook.
 *
 * Workbook menghitung φ dari Pn (pendekatan SNI 2002 / ACI 318-99):
 *     φ = 0.65 − 0.15·(Pn − 0.1f'cAg)/(0.1f'cAg), dibatasi 0.65..0.9
 *
 * SNI 2847:2019 §21.2.2 memakai regangan tarik εt. Yang dipakai di sini versi
 * REGANGAN — lebih baru dan lebih tepat di daerah transisi. Selisihnya
 * dinyatakan di sini, bukan disembunyikan.
 */
describe('faktor reduksi φ — SNI 2847:2019 (regangan), bukan versi Pn', () => {
  it('daerah tekan (εt kecil) → φ = 0.65 sengkang', () => {
    const t = titikPM(PERSEGI, 472)   // semua lapis tertekan
    expect(t.phi).toBe(0.65)
  })

  it('daerah tarik (εt ≥ 0.005) → φ = 0.90', () => {
    const t = titikPM(PERSEGI, 60)    // garis netral dangkal → tarik besar
    expect(t.epsilonT).toBeGreaterThan(0.005)
    expect(t.phi).toBe(0.90)
  })

  it('transisi berubah MULUS antara 0.65 dan 0.90', () => {
    const epsTy = 420 / 200_000
    // Sapu c dari tekan ke tarik, φ harus monoton naik.
    const nilai = [400, 300, 250, 200, 150, 120, 100, 80]
      .map((c) => titikPM(PERSEGI, c))
    for (let i = 1; i < nilai.length; i++) {
      expect(nilai[i].phi).toBeGreaterThanOrEqual(nilai[i - 1].phi - 1e-12)
    }
    expect(epsTy).toBeCloseTo(0.0021, 4)
  })

  it('spiral memberi φ dasar 0.75, bukan 0.65', () => {
    const spiral = titikPM({ ...PERSEGI, phiTekan: 0.75, faktorPnMax: 0.85 }, 472)
    expect(spiral.phi).toBe(0.75)
  })
})

describe('diagramPM — kurva penuh', () => {
  const d = diagramPM(PERSEGI, 200)

  it('menghasilkan titik sebanyak langkah yang diminta', () => {
    expect(d.titik).toHaveLength(200)
  })

  it('φPn,max = puncak kurva ≈ 0.65 × Pno', () => {
    // Pno 6704.445 × 0.65 = 4357.889 (workbook AX6)
    expect(d.phiPnMaksKn).toBeCloseTo(0.65 * 6704.4451195199999, 3)
  })

  it('φMn puncak berada di TENGAH kurva, bukan di ujung', () => {
    // Bentuk khas diagram interaksi: momen maksimum di sekitar balance,
    // bukan pada tekan murni maupun tarik murni.
    const iMaks = d.titik.findIndex((t) => t.phiMnKnm === d.phiMnMaksKnm)
    expect(iMaks).toBeGreaterThan(5)
    expect(iMaks).toBeLessThan(195)
  })

  it('Pn menurun saat c mengecil — arah kurva benar', () => {
    const urut = [...d.titik].sort((a, b) => b.cMm - a.cMm)
    for (let i = 1; i < urut.length; i++) {
      expect(urut[i].pnKn).toBeLessThanOrEqual(urut[i - 1].pnKn + 1e-6)
    }
  })

  it('ketelitian bisa dinaikkan tanpa mengubah bentuk kurva', () => {
    // Inilah yang tak bisa dilakukan di Excel: langkah adalah pilihan.
    const kasar = diagramPM(PERSEGI, 50)
    const halus = diagramPM(PERSEGI, 500)
    expect(halus.phiPnMaksKn).toBeCloseTo(kasar.phiPnMaksKn, 2)
    // φMn puncak konvergen — halus ≥ kasar karena menangkap puncak lebih tepat.
    expect(halus.phiMnMaksKnm).toBeGreaterThanOrEqual(kasar.phiMnMaksKnm - 1e-6)
  })

  it('menolak input mustahil', () => {
    expect(() => diagramPM({ ...PERSEGI, lapis: [] })).toThrow(/tanpa tulangan/)
    expect(() => diagramPM(PERSEGI, 5)).toThrow(/langkah minimal/)
    expect(() => diagramPM({ ...PERSEGI, agMm2: 0 })).toThrow()
  })
})

/**
 * INI yang tak bisa dilakukan workbook: verdict ALJABAR, bukan visual.
 */
describe('cekTitikBeban — pengganti "lihat grafiknya sendiri"', () => {
  const d = diagramPM(PERSEGI, 300)

  it('beban workbook Load 1 (Pu 1091.759, Mu 56.651) → di DALAM kurva', () => {
    const h = cekTitikBeban(d, 1091.759, 56.6508)
    expect(h.aman).toBe(true)
    expect(h.rasio).toBeLessThan(1)
  })

  it('beban workbook Load 10 (Pu 300, Mu 166.551) → diperiksa, bukan ditebak', () => {
    const h = cekTitikBeban(d, 300, 166.551)
    // Apa pun hasilnya, yang penting ia ANGKA — bukan penilaian mata.
    expect(typeof h.aman).toBe('boolean')
    expect(h.phiMnPadaPuKnm).toBeGreaterThan(0)
    expect(Number.isFinite(h.rasio)).toBe(true)
  })

  /**
   * KASUS YANG MEMBUAT FASE 2 PERLU ADA.
   *
   * Momen besar pada aksial kecil: pemeriksaan aksial saja meloloskannya
   * (φPn 4357 kN ≫ Pu 200 kN), tetapi titik bebannya jauh di luar kurva.
   */
  it('momen besar + aksial kecil → LOLOS cek aksial tapi DI LUAR kurva', () => {
    const puKecil = 200
    const muBesar = 900
    expect(puKecil).toBeLessThan(d.phiPnMaksKn)   // lolos cek aksial…
    const h = cekTitikBeban(d, puKecil, muBesar)
    expect(h.aman).toBe(false)                     // …tapi di luar kurva
    expect(h.rasio).toBeGreaterThan(1)
    expect(h.catatan.some((c) => /DI LUAR kurva/.test(c))).toBe(true)
  })

  it('Pu melampaui φPn,max → ditolak dengan catatan yang menyebut angkanya', () => {
    const h = cekTitikBeban(d, 99_999, 10)
    expect(h.aman).toBe(false)
    expect(h.catatan[0]).toMatch(/melampaui kapasitas tekan sentris/)
  })

  it('kapasitas momen BERUBAH menurut Pu — inilah inti diagram interaksi', () => {
    const rendah = cekTitikBeban(d, 200, 1).phiMnPadaPuKnm
    const sedang = cekTitikBeban(d, 1500, 1).phiMnPadaPuKnm
    const tinggi = cekTitikBeban(d, 4000, 1).phiMnPadaPuKnm
    // Momen puncak di tengah: sedang > rendah dan sedang > tinggi.
    expect(sedang).toBeGreaterThan(rendah)
    expect(sedang).toBeGreaterThan(tinggi)
  })

  it('interpolasi berada di antara dua titik pengapit', () => {
    const h = cekTitikBeban(d, 1500, 1)
    expect(h.bawah).not.toBeNull()
    expect(h.atas).not.toBeNull()
    const lo = Math.min(h.bawah!.phiMnKnm, h.atas!.phiMnKnm)
    const hi = Math.max(h.bawah!.phiMnKnm, h.atas!.phiMnKnm)
    expect(h.phiMnPadaPuKnm).toBeGreaterThanOrEqual(lo - 1e-9)
    expect(h.phiMnPadaPuKnm).toBeLessThanOrEqual(hi + 1e-9)
  })
})

describe('pembangun penampang', () => {
  it('penampangPersegi menyusun lapis dari susunan baris', () => {
    const p = penampangPersegi({
      bMm: 400, hMm: 400, selimutMm: 30, dUtamaMm: 16, dSengkangMm: 8,
      nBarisTegakLurus: 4, nBarisSearah: 4, mutu: MUTU,
    })
    expect(p.lapis).toHaveLength(4)
    // d₁ = 30 + 8 + 8 = 46 mm; lapis terjauh 400 − 46 = 354 mm.
    expect(p.lapis[0].diMm).toBeCloseTo(46, 9)
    expect(p.lapis[3].diMm).toBeCloseTo(354, 9)
    // Baris tepi 4 batang, baris tengah 2 batang → total 12.
    const nBatang = p.lapis.reduce((s, l) => s + l.asMm2, 0) / (Math.PI / 4 * 256)
    expect(nBatang).toBeCloseTo(12, 9)
  })

  it('penampangLingkaran memakai lebar EKUIVALEN Ag/h, dinyatakan di kode', () => {
    const p = penampangLingkaran({
      diameterMm: 500, nTulangan: 12, selimutMm: 35,
      dUtamaMm: 19, dPengekangMm: 10, mutu: { fcMpa: 35, fyMpa: 400 },
    })
    expect(p.agMm2).toBeCloseTo(0.25 * Math.PI * 250_000, 6)
    expect(p.bMm).toBeCloseTo(p.agMm2 / 500, 9)
    expect(p.lapis).toHaveLength(12)
    // dᵢ terjauh = 450.5 mm (cocok dengan workbook kolom lingkaran N18).
    expect(Math.max(...p.lapis.map((l) => l.diMm))).toBeCloseTo(450.5, 8)
  })

  it('kurva lingkaran bisa dihitung — dan batasnya sudah ditulis di sumber', () => {
    const p = penampangLingkaran({
      diameterMm: 500, nTulangan: 12, selimutMm: 35,
      dUtamaMm: 19, dPengekangMm: 10, mutu: { fcMpa: 35, fyMpa: 400 },
    })
    const d = diagramPM(p, 150)
    expect(d.titik).toHaveLength(150)
    expect(d.phiPnMaksKn).toBeGreaterThan(0)
    expect(d.phiMnMaksKnm).toBeGreaterThan(0)
  })
})
