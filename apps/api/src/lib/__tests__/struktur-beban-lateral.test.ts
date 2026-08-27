import { describe, it, expect } from 'vitest'
import {
  analisaGempaStatik, analisaAngin, analisaDrift,
  SISTEM_STRUKTUR, KATEGORI_RISIKO, KOEF_PERIODA, BATAS_DRIFT,
  EKSPOSUR, KD_GEDUNG, G_KAKU, TINGGI_MAKS_STATIK_M,
  type InputGempa, type InputAngin, type InputDrift,
} from '../struktur-beban-lateral'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BEBAN LATERAL — gempa, angin, simpangan
 *
 * Angka pembanding dihitung tangan mengikuti SNI 1726:2019 dan SNI 1727:2020,
 * bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Ruko 3 lantai, rangka beton menengah, Bandung (SDS ~0,7 · SD1 ~0,4). */
const GEMPA: InputGempa = {
  tingkat: [
    { nama: 'Lantai 2', tinggiM: 4, beratKn: 600 },
    { nama: 'Lantai 3', tinggiM: 8, beratKn: 600 },
    { nama: 'Atap', tinggiM: 12, beratKn: 400 },
  ],
  sds: 0.7, sd1: 0.4,
  sistem: 'rangka_pemikul_momen_menengah',
  risiko: 'II', tipeRangka: 'rangka_beton', kategoriSeismik: 'D',
}

describe('gempa — geser dasar', () => {
  it('perioda pendekatan Ta = Ct·hn^x', () => {
    /*
      0,0466 × 12^0,9 = 0,436163 s

      ⚠ Versi pertama test ini menulis 0,4372 — hasil membulatkan 12^0,9 jadi
      9,3813 di tengah jalan. Membulatkan sebelum akhir menggeser hasilnya
      0,2%, dan test yang mengunci angka bulat memaksa kode ikut membulat.
    */
    expect(analisaGempaStatik(GEMPA).taDetik).toBeCloseTo(0.4362, 4)
  })

  it('Cs dasar = SDS / (R/Ie)', () => {
    /* 0,7 / (5/1,0) = 0,14 */
    const h = analisaGempaStatik(GEMPA)
    expect(h.antara.csHitung).toBeCloseTo(0.14, 5)
  })

  it('Cs dibatasi ATAS oleh perioda', () => {
    /*
      Cs_maks = SD1 / (T·R/Ie) = 0,4 / (0,436163 × 5) = 0,183418
      Di sini batas atas LEBIH BESAR daripada rumus dasar, jadi yang berlaku
      rumus dasar 0,14.
    */
    const h = analisaGempaStatik(GEMPA)
    expect(h.antara.csMaks).toBeCloseTo(0.183418, 5)
    expect(h.cs).toBeCloseTo(0.14, 5)
  })

  it('bangunan TINGGI dibatasi Cs maksimum, bukan rumus dasar', () => {
    /*
      Bangunan berperioda panjang tak menerima percepatan sebesar bangunan
      pendek. Batas inilah yang membuat gedung tinggi tidak dirancang untuk
      gaya yang mustahil.
    */
    const tinggi: InputGempa = {
      ...GEMPA,
      tingkat: Array.from({ length: 10 }, (_, i) => ({
        nama: `L${i + 2}`, tinggiM: (i + 1) * 3.5, beratKn: 500,
      })),
    }
    const h = analisaGempaStatik(tinggi)
    expect(h.antara.csMaks).toBeLessThan(h.antara.csHitung)
    expect(h.cs).toBeCloseTo(h.antara.csMaks, 5)
  })

  it('Cs dibatasi BAWAH — tak ada bangunan tanpa ketahanan lateral', () => {
    /*
      SDS sangat kecil → rumus dasar mendekati nol. Batas bawah
      0,044·SDS·Ie ≥ 0,01 menahannya.
    */
    const lemah = analisaGempaStatik({ ...GEMPA, sds: 0.05, sd1: 0.02 })
    expect(lemah.cs).toBeGreaterThanOrEqual(0.01)
    expect(lemah.cs).toBeCloseTo(lemah.antara.csMin, 6)
  })

  it('geser dasar V = Cs · W total', () => {
    /* W = 600+600+400 = 1600 kN; V = 0,14 × 1600 = 224 kN */
    const h = analisaGempaStatik(GEMPA)
    expect(h.antara.wTotalKn).toBe(1600)
    expect(h.vKn).toBeCloseTo(224, 2)
  })

  it('memilih R yang salah mengecilkan gaya — dan itu terlihat', () => {
    /*
      R = 8 (khusus) vs R = 3 (biasa): gaya rencana berbeda 2,7×. Ini
      kesalahan paling mahal di seluruh perhitungan gempa, karena bangunannya
      tetap berdiri sampai gempa datang.
    */
    const khusus = analisaGempaStatik({ ...GEMPA, sistem: 'rangka_pemikul_momen_khusus' })
    const biasa = analisaGempaStatik({ ...GEMPA, sistem: 'rangka_pemikul_momen_biasa' })
    expect(biasa.vKn / khusus.vKn).toBeCloseTo(8 / 3, 2)
    expect(khusus.catatan.join(' ')).toMatch(/R = 8/)
  })

  it('kategori risiko IV menaikkan gaya 1,5×', () => {
    /* Rumah sakit harus TETAP BERFUNGSI sesudah gempa. */
    const biasa = analisaGempaStatik(GEMPA)
    const rs = analisaGempaStatik({ ...GEMPA, risiko: 'IV' })
    expect(rs.vKn / biasa.vKn).toBeCloseTo(1.5, 3)
  })
})

describe('gempa — distribusi vertikal', () => {
  it('gaya terbesar di tingkat ATAS', () => {
    /*
      Bukan karena beratnya (atap justru paling ringan) melainkan karena
      tingginya: Fi ∝ wi·hi^k.
    */
    const g = analisaGempaStatik(GEMPA).gaya
    expect(g[g.length - 1].gayaKn).toBeGreaterThan(g[0].gayaKn)
  })

  it('jumlah gaya tiap tingkat = geser dasar', () => {
    const h = analisaGempaStatik(GEMPA)
    const total = h.gaya.reduce((s, g) => s + g.gayaKn, 0)
    expect(total).toBeCloseTo(h.vKn, 2)
  })

  it('geser tingkat PALING BAWAH = geser dasar', () => {
    const h = analisaGempaStatik(GEMPA)
    expect(h.gaya[0].geserKn).toBeCloseTo(h.vKn, 2)
  })

  it('geser tingkat teratas = gayanya sendiri', () => {
    const h = analisaGempaStatik(GEMPA)
    const atas = h.gaya[h.gaya.length - 1]
    expect(atas.geserKn).toBeCloseTo(atas.gayaKn, 3)
  })

  it('porsi tiap tingkat berjumlah 1', () => {
    const h = analisaGempaStatik(GEMPA)
    expect(h.gaya.reduce((s, g) => s + g.porsi, 0)).toBeCloseTo(1, 4)
  })

  it('k = 1 untuk perioda pendek, 2 untuk perioda panjang', () => {
    /*
      Eksponen k memiringkan distribusi ke atas. Memakai k = 1 untuk semua
      bangunan mengecilkan gaya di tingkat atas — tempat yang paling banyak
      bergerak.
    */
    const pendek = analisaGempaStatik({
      ...GEMPA,
      tingkat: [{ nama: 'Atap', tinggiM: 4, beratKn: 500 }],
    })
    expect(pendek.k).toBe(1)

    const panjang = analisaGempaStatik({
      ...GEMPA,
      tingkat: Array.from({ length: 20 }, (_, i) => ({
        nama: `L${i + 2}`, tinggiM: (i + 1) * 3.5, beratKn: 500,
      })),
    })
    expect(panjang.k).toBeGreaterThan(1)
  })

  it('MENOLAK tingkat yang tidak urut bawah ke atas', () => {
    /*
      Urutan acak menghasilkan distribusi gaya TERBALIK — terbesar di lantai
      bawah alih-alih di atap — dan hasilnya tetap "masuk akal" bagi yang tak
      memeriksa.
    */
    expect(() => analisaGempaStatik({
      ...GEMPA,
      tingkat: [
        { nama: 'Atap', tinggiM: 12, beratKn: 400 },
        { nama: 'Lantai 2', tinggiM: 4, beratKn: 600 },
      ],
    })).toThrow(/urut dari bawah ke atas/i)
  })
})

describe('gempa — batas keberlakuan', () => {
  it('menandai bangunan yang melewati batas prosedur statik', () => {
    const h = analisaGempaStatik({
      ...GEMPA,
      tingkat: Array.from({ length: 15 }, (_, i) => ({
        nama: `L${i + 2}`, tinggiM: (i + 1) * 3.5, beratKn: 500,
      })),
    })
    expect(h.periksa.find((p) => p.nama.includes('Tinggi'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/TIDAK SAH|analisa respons spektrum/i)
    expect(h.aman).toBe(false)
  })

  it('bangunan rendah lolos batas', () => {
    expect(analisaGempaStatik(GEMPA).periksa.find((p) => p.nama.includes('Tinggi'))!.aman)
      .toBe(true)
    expect(TINGGI_MAKS_STATIK_M).toBe(40)
  })

  it('KDS A ditandai tak menuntut perhitungan gempa', () => {
    const h = analisaGempaStatik({ ...GEMPA, kategoriSeismik: 'A' })
    expect(h.catatan.join(' ')).toMatch(/gaya ikatan minimum/i)
  })

  it('menyebut yang BELUM diperiksa: dua arah, torsi, Cu·Ta', () => {
    const c = analisaGempaStatik(GEMPA).catatan.join(' ')
    expect(c).toMatch(/dua arah ortogonal/i)
    expect(c).toMatch(/[Tt]orsi/)
    expect(c).toMatch(/Cu·Ta/)
  })

  it.each([
    ['sistem', { sistem: 'karangan' }],
    ['risiko', { risiko: 'V' }],
    ['tipe rangka', { tipeRangka: 'bambu' }],
  ])('menolak %s karangan', (_n, ubah) => {
    expect(() => analisaGempaStatik({ ...GEMPA, ...ubah } as InputGempa)).toThrow(/tak dikenal/i)
  })

  it('menolak daftar tingkat kosong', () => {
    expect(() => analisaGempaStatik({ ...GEMPA, tingkat: [] })).toThrow(/minimal satu tingkat/i)
  })
})

describe('angin', () => {
  const ANGIN: InputAngin = {
    vMs: 30, eksposur: 'C', tinggiM: 6, lebarM: 20,
  }

  it('Kz dihitung dari eksposur dan tinggi', () => {
    /* 2,01 × (6/274,32)^(2/9,5) = 0,898876 */
    expect(analisaAngin(ANGIN).kz).toBeCloseTo(0.8989, 4)
  })

  it('qz = 0,613·Kz·Kzt·Kd·V²', () => {
    /* 0,613 × 0,898876 × 1 × 0,85 × 30² = 421,52 N/m² */
    expect(analisaAngin(ANGIN).qzNPerM2).toBeCloseTo(421.52, 1)
  })

  it('tekanan menjumlahkan sisi TEKAN dan HISAP', () => {
    /*
      p = qz × G × (Cp_tekan − Cp_hisap) = 421,52 × 0,85 × (0,8 − (−0,5))
        = 421,52 × 0,85 × 1,3 = 465,78 N/m²

      Menghitung sisi tekan saja mengecilkan gaya 38% — dan sisi hisap itulah
      yang mencabut atap.
    */
    const h = analisaAngin(ANGIN)
    expect(h.pNPerM2).toBeCloseTo(465.78, 1)
    expect(h.pNPerM2 / (h.qzNPerM2 * G_KAKU * 0.8)).toBeCloseTo(1.625, 2)
  })

  it('gaya = tekanan × tinggi × lebar', () => {
    /* 465,78 × 6 × 20 / 1000 = 55,89 kN */
    expect(analisaAngin(ANGIN).gayaKn).toBeCloseTo(55.89, 1)
  })

  it('eksposur D (tepi pantai) memberi tekanan LEBIH BESAR daripada B', () => {
    /*
      Bangunan di tepi pantai yang dihitung sebagai perkotaan rapat menerima
      gaya jauh lebih kecil daripada seharusnya.
    */
    const b = analisaAngin({ ...ANGIN, eksposur: 'B' }).pNPerM2
    const d = analisaAngin({ ...ANGIN, eksposur: 'D' }).pNPerM2
    expect(d).toBeGreaterThan(b * 1.3)
  })

  it('tinggi di bawah 4,6 m dibatasi — rumus tak berlaku di bawahnya', () => {
    const rendah = analisaAngin({ ...ANGIN, tinggiM: 2 })
    const batas = analisaAngin({ ...ANGIN, tinggiM: 4.6 })
    expect(rendah.kz).toBeCloseTo(batas.kz, 6)
  })

  it('kecepatan dua kali lipat memberi tekanan EMPAT kali', () => {
    /* Tekanan ∝ V² — bukan linear. */
    const v30 = analisaAngin(ANGIN).qzNPerM2
    const v60 = analisaAngin({ ...ANGIN, vMs: 60 }).qzNPerM2
    expect(v60 / v30).toBeCloseTo(4, 3)
  })

  it('menyebut beban atap yang BELUM dihitung', () => {
    expect(analisaAngin(ANGIN).catatan.join(' ')).toMatch(/atap.*belum dihitung|hisap di tepi/i)
  })

  it('menolak eksposur karangan', () => {
    expect(() => analisaAngin({ ...ANGIN, eksposur: 'Z' as never })).toThrow(/tak dikenal/i)
  })

  it('konstanta sesuai SNI 1727', () => {
    expect(KD_GEDUNG).toBe(0.85)
    expect(G_KAKU).toBe(0.85)
    expect(EKSPOSUR.C.alpha).toBe(9.5)
  })
})

describe('simpangan antar tingkat', () => {
  const DRIFT: InputDrift = {
    simpanganElastisMm: [5, 12, 20],
    tinggiTingkatM: [4, 4, 4],
    cd: 4.5, ie: 1.0, risiko: 'II',
  }

  it('simpangan ANTAR tingkat, bukan total dari dasar', () => {
    /*
      Tingkat 2: (12 − 5) × 4,5 / 1 = 31,5 mm.
      Memakai 12 mm langsung (total dari dasar) melipatgandakan hasilnya.
    */
    expect(analisaDrift(DRIFT).tingkat[1].driftMm).toBeCloseTo(31.5, 2)
  })

  it('DIPERBESAR dengan Cd/Ie sebelum dibandingkan batas', () => {
    /*
      Tingkat 1: 5 × 4,5 = 22,5 mm. Melewatkan pembesaran ini membuat bangunan
      yang sebenarnya melewati batas beberapa kali lipat terlihat aman —
      kesalahan yang paling sering pada pemeriksaan simpangan.
    */
    const t = analisaDrift(DRIFT).tingkat[0]
    expect(t.driftMm).toBeCloseTo(22.5, 2)
    expect(t.driftMm).toBeCloseTo(5 * 4.5, 2)
  })

  it('rasio dibandingkan batas 0,020 untuk KR II', () => {
    /* 22,5 / 4000 = 0,005625 — jauh di bawah 0,020 */
    const t = analisaDrift(DRIFT).tingkat[0]
    expect(t.rasio).toBeCloseTo(0.005625, 5)
    expect(t.batas).toBe(0.020)
    expect(t.aman).toBe(true)
  })

  it('KR IV dibatasi lebih ketat (0,010)', () => {
    /*
      Rumah sakit harus tetap berfungsi: pipa gas putus dan pintu terjepit
      membuatnya tak bisa dipakai meski strukturnya utuh.
    */
    expect(BATAS_DRIFT.IV).toBe(0.010)
    expect(analisaDrift({ ...DRIFT, risiko: 'IV' }).tingkat[0].batas).toBe(0.010)
  })

  it('menandai tingkat yang melewati batas', () => {
    const h = analisaDrift({ ...DRIFT, simpanganElastisMm: [20, 60, 120] })
    expect(h.aman).toBe(false)
    expect(h.tingkat.some((t) => !t.aman)).toBe(true)
  })

  it('MENOLAK jumlah simpangan dan tinggi yang tak sepadan', () => {
    expect(() => analisaDrift({ ...DRIFT, tinggiTingkatM: [4, 4] }))
      .toThrow(/tak sama dengan/i)
  })

  it('menjelaskan kegagalannya bukan keruntuhan, melainkan kerusakan isi', () => {
    const c = analisaDrift(DRIFT).catatan.join(' ')
    expect(c).toMatch(/TIDAK meruntuhkan/i)
    expect(c).toMatch(/dinding|kusen|kaca|pipa/i)
    expect(c).toMatch(/gempa SEDANG/i)
  })
})

describe('konstanta SNI', () => {
  it('R dan Cd sesuai SNI 1726 Tabel 12', () => {
    expect(SISTEM_STRUKTUR.rangka_pemikul_momen_khusus.R).toBe(8)
    expect(SISTEM_STRUKTUR.rangka_pemikul_momen_menengah.R).toBe(5)
    expect(SISTEM_STRUKTUR.rangka_pemikul_momen_biasa.R).toBe(3)
    expect(SISTEM_STRUKTUR.rangka_pemikul_momen_menengah.Cd).toBe(4.5)
  })

  it('Ie sesuai SNI 1726 Tabel 4', () => {
    expect(KATEGORI_RISIKO.II.Ie).toBe(1.0)
    expect(KATEGORI_RISIKO.IV.Ie).toBe(1.5)
  })

  it('Ct dan x sesuai SNI 1726 §7.8.2.1', () => {
    expect(KOEF_PERIODA.rangka_beton.Ct).toBe(0.0466)
    expect(KOEF_PERIODA.rangka_beton.x).toBe(0.9)
    expect(KOEF_PERIODA.rangka_baja.Ct).toBe(0.0724)
  })
})
