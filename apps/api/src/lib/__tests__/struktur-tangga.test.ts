import { describe, it, expect } from 'vitest'
import {
  analisaTangga, BEBAN_HIDUP_KN_M2, BERAT_BETON_KN_M3, FINISHING_KN_M2,
  BLONDEL_MIN, BLONDEL_MAKS, OPTREDE_MAKS, ANTREDE_MIN,
  type InputTangga,
} from '../struktur-tangga'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TANGGA BETON — bentang MIRING, beban anak tangga, beban hidup tangga
 *
 * Angka pembanding dihitung tangan, bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const DASAR: InputTangga = {
  tebalPelatMm: 120, lebarM: 1.2, tinggiM: 3.2,
  optredeMm: 175, antredeMm: 280,
  selimutMm: 20, dUtamaMm: 10, jarakUtamaMm: 150,
  dBagiMm: 8, jarakBagiMm: 200,
  mutu: { fcMpa: 25, fyMpa: 400 },
  pemakaian: 'hunian',
}

describe('geometri — bentang MIRING, bukan proyeksi datar', () => {
  it('jumlah optrede dibulatkan KE ATAS', () => {
    /* 3,2 m ÷ 0,175 m = 18,29 → 19 anak tangga */
    expect(analisaTangga(DASAR).geometri.jumlahOptrede).toBe(19)
  })

  it('optrede disesuaikan supaya anak tangga terakhir TIDAK berbeda', () => {
    /*
      3200 ÷ 19 = 168,42 mm. Anak tangga terakhir yang tingginya berbeda adalah
      penyebab tersandung paling sering — orang yang menuruni tangga tidak
      melihat kakinya.
    */
    const h = analisaTangga(DASAR)
    expect(h.antara.optredeNyataMm).toBeCloseTo(168.42, 1)
    expect(h.catatan.join(' ')).toMatch(/Optrede disesuaikan/i)
  })

  it('panjang datar = (jumlahOptrede − 1) × antrede', () => {
    /* 18 × 0,28 = 5,04 m — bukan 19, karena injakan terakhir adalah lantai */
    expect(analisaTangga(DASAR).geometri.panjangDatarM).toBeCloseTo(5.04, 4)
  })

  it('panjang MIRING = √(datar² + tinggi²) dan LEBIH BESAR daripada datar', () => {
    /*
      √(5,04² + 3,2²) = √(25,4016 + 10,24) = √35,6416 = 5,9701 m

      Menghitung tangga sebagai pelat datar sepanjang proyeksinya kekurangan
      beban DAN kekurangan beton — dua kesalahan sekaligus, ke arah yang sama.
    */
    const g = analisaTangga(DASAR).geometri
    expect(g.panjangMiringM).toBeCloseTo(5.9701, 3)
    expect(g.panjangMiringM).toBeGreaterThan(g.panjangDatarM)
  })

  it('kemiringan dihitung dari tinggi terhadap datar', () => {
    /* atan(3,2 / 5,04) = 32,4° */
    expect(analisaTangga(DASAR).geometri.kemiringanDerajat).toBeCloseTo(32.42, 1)
  })
})

describe('kenyamanan — Blondel bukan soal selera', () => {
  it('2·optrede + antrede dihitung dari optrede NYATA', () => {
    /* 2 × 168,42 + 280 = 616,84 mm — di dalam rentang 600–650 */
    const h = analisaTangga(DASAR)
    expect(h.geometri.blondelMm).toBeCloseTo(616.8, 1)
    expect(h.periksa.find((p) => p.nama.includes('Blondel'))!.aman).toBe(true)
  })

  it('menandai tangga yang terlalu curam', () => {
    /*
      Optrede 200, antrede 200 → 2×200+200 = 600… tepat di batas bawah.
      Dibuat lebih curam: antrede 150 → 550 mm, di luar rentang.
    */
    const h = analisaTangga({ ...DASAR, tinggiM: 3.0, optredeMm: 200, antredeMm: 150 })
    expect(h.periksa.find((p) => p.nama.includes('Blondel'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/tersandung/i)
    expect(h.aman).toBe(false)
  })

  it('menandai injakan yang terlalu sempit', () => {
    const h = analisaTangga({ ...DASAR, antredeMm: 200 })
    const p = h.periksa.find((x) => x.nama === 'Lebar injakan')!
    expect(p.aman).toBe(false)
    expect(p.syarat).toBe(ANTREDE_MIN)
  })

  it('menandai anak tangga yang terlalu tinggi', () => {
    /* tinggi 3,2 m dengan optrede 250 → 13 anak, 246 mm per anak: terlalu tinggi */
    const h = analisaTangga({ ...DASAR, optredeMm: 250 })
    const p = h.periksa.find((x) => x.nama === 'Tinggi anak tangga')!
    expect(p.aman).toBe(false)
    expect(p.syarat).toBe(OPTREDE_MAKS)
  })
})

describe('beban — tiga hal yang sering dilewatkan', () => {
  it('berat pelat DIBAGI cos θ karena bidangnya miring', () => {
    /*
      Tebal 0,12 m × 24 kN/m³ = 2,88 kN/m² pada bidang miring.
      cos θ = 5,04 / 5,9701 = 0,8442 → 2,88 / 0,8442 = 3,4116 kN/m² datar.

      Melewatkan pembagian ini kekurangan beban 1/cos θ — 18% pada kemiringan
      32°.
    */
    const b = analisaTangga(DASAR).beban
    expect(b.pelatKnPerM2).toBeCloseTo(3.4116, 3)
    expect(b.pelatKnPerM2).toBeGreaterThan(0.12 * BERAT_BETON_KN_M3)
  })

  it('anak tangga = ½·optrede × berat jenis — bukan diabaikan', () => {
    /*
      0,16842 / 2 × 24 = 2,021 kN/m². Sekitar 59% berat pelatnya sendiri —
      melewatkannya membuat tangga terhitung jauh lebih ringan daripada
      kenyataannya.
    */
    expect(analisaTangga(DASAR).beban.anakTanggaKnPerM2).toBeCloseTo(2.021, 3)
  })

  it('beban hidup UMUM hampir dua kali lipat hunian', () => {
    /*
      4,79 vs 1,92 kN/m². Tangga kantor/sekolah/ruko yang dihitung dengan beban
      hunian lolos di atas kertas dan melendut di lapangan.
    */
    expect(analisaTangga(DASAR).beban.hidupKnPerM2).toBe(1.92)
    expect(analisaTangga({ ...DASAR, pemakaian: 'umum' }).beban.hidupKnPerM2).toBe(4.79)
    expect(BEBAN_HIDUP_KN_M2.umum / BEBAN_HIDUP_KN_M2.hunian).toBeGreaterThan(2.4)
  })

  it('wu = 1,2·mati + 1,6·hidup', () => {
    /*
      mati = 3,4116 + 2,021 + 1,2 = 6,6326
      wu   = 1,2 × 6,6326 + 1,6 × 1,92 = 7,9591 + 3,072 = 11,0311 kN/m
    */
    const b = analisaTangga(DASAR).beban
    const mati = b.pelatKnPerM2 + b.anakTanggaKnPerM2 + FINISHING_KN_M2
    expect(b.wuKnPerM).toBeCloseTo(1.2 * mati + 1.6 * 1.92, 3)
    expect(b.wuKnPerM).toBeCloseTo(11.031, 2)
  })

  it('momen memakai wL²/8 dengan L MIRING — bukan wL²/12, bukan L datar', () => {
    /*
      11,0311 × 5,9701² / 8 = 11,0311 × 35,6421 / 8 = 49,14 kNm/m

      wL²/12 akan mengurangi momen 33% berdasarkan kekangan yang belum tentu
      ada — arah yang salah untuk elemen yang kegagalannya melukai orang.
    */
    const h = analisaTangga(DASAR)
    expect(h.beban.muKnm).toBeCloseTo(49.14, 1)
    /* dengan L datar akan jadi 35,0 kNm — jauh lebih kecil */
    expect(h.beban.muKnm).toBeGreaterThan(11.0311 * 5.04 ** 2 / 8)
  })
})

describe('pemeriksaan struktural', () => {
  it('tebal minimum memakai bentang MIRING (L/20)', () => {
    /* 5970 / 20 = 298,5 mm — pelat 120 mm jauh di bawahnya */
    const p = analisaTangga(DASAR).periksa.find((x) => x.nama.includes('Tebal minimum'))!
    expect(p.syarat).toBe(299)
    expect(p.aman).toBe(false)
  })

  it('tangga bentang pendek bisa lolos tebal minimum', () => {
    const h = analisaTangga({ ...DASAR, tinggiM: 1.6, tebalPelatMm: 150 })
    const p = h.periksa.find((x) => x.nama.includes('Tebal minimum'))!
    expect(p.aman).toBe(true)
  })

  it('tulangan minimum 0,0018·b·h diperiksa', () => {
    /* 0,0018 × 1000 × 120 = 216 mm²/m */
    const p = analisaTangga(DASAR).periksa.find((x) => x.nama === 'Tulangan minimum')!
    expect(p.syarat).toBe(216)
    /* D10-150 → 78,54 × 6,67 = 523,6 mm²/m — cukup */
    expect(p.nilai).toBeCloseTo(523.6, 0)
    expect(p.aman).toBe(true)
  })

  it('aman hanya bila SELURUH pemeriksaan aman', () => {
    const h = analisaTangga(DASAR)
    expect(h.aman).toBe(h.periksa.every((p) => p.aman))
  })

  it('MENOLAK tebal pelat yang tak muat selimut + tulangan', () => {
    expect(() => analisaTangga({ ...DASAR, tebalPelatMm: 20 }))
      .toThrow(/terlalu kecil/i)
  })
})

describe('volume', () => {
  it('beton = pelat miring + anak tangga + bordes', () => {
    /*
      pelat  : 5,9701 × 1,2 × 0,12       = 0,8597
      anak   : 0,16842 × 0,28 / 2 × 18 × 1,2 = 0,5093
      total tanpa bordes                  ≈ 1,369 m³
    */
    const v = analisaTangga(DASAR).volume
    expect(v.betonM3).toBeCloseTo(1.369, 2)
  })

  it('bordes menambah beton dan bekisting', () => {
    const tanpa = analisaTangga(DASAR).volume
    const dengan = analisaTangga({ ...DASAR, panjangBordesM: 1.2 }).volume
    expect(dengan.betonM3).toBeGreaterThan(tanpa.betonM3)
    expect(dengan.bekistingM2).toBeGreaterThan(tanpa.bekistingM2)
  })

  it('bekisting memuat papan tegak tiap anak tangga', () => {
    /*
      Bidang atas tangga TIDAK dibekisting, tetapi papan tegak tiap optrede iya
      — dan itu yang membuat bekisting tangga jauh lebih mahal per m³ beton
      daripada pelat biasa. Bekisting tangga harus lebih besar daripada
      sekadar bidang bawahnya.
    */
    const v = analisaTangga(DASAR).volume
    const bidangBawah = 5.9701 * 1.2
    expect(v.bekistingM2).toBeGreaterThan(bidangBawah * 1.3)
  })

  it('besi memuat tulangan utama DAN bagi', () => {
    const besi = analisaTangga(DASAR).volume.besi
    expect(besi.map((b) => b.peran).sort()).toEqual(['bagi', 'utama'])
    expect(besi.every((b) => b.totalKg > 0)).toBe(true)
  })

  it('besiTotalKg = jumlah seluruh barisnya', () => {
    const v = analisaTangga(DASAR).volume
    expect(v.besiTotalKg).toBeCloseTo(v.besi.reduce((s, b) => s + b.totalKg, 0), 3)
  })

  it('berat sendiri memakai kerapatan 2400 kg/m³, bukan 24 kN/m³', () => {
    /*
      Menukar kerapatan dengan berat jenis menghasilkan angka yang meleset ~10×
      — dan kolom "berat sendiri" yang dipakai memeriksa pembebanan jadi tak
      berarti.
    */
    const v = analisaTangga(DASAR).volume
    expect(v.beratSendiriKg).toBeCloseTo(v.betonM3 * 2400, 1)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const satu = analisaTangga(DASAR)
    const tiga = analisaTangga({ ...DASAR, jumlah: 3 })
    expect(tiga.volume.betonM3).toBeCloseTo(satu.volume.betonM3 * 3, 3)
    expect(tiga.aman).toBe(satu.aman)
  })
})

describe('catatan batas', () => {
  it('menyebut bentang miring beserta angkanya', () => {
    const c = analisaTangga(DASAR).catatan.join(' ')
    expect(c).toMatch(/PANJANG MIRING/i)
    expect(c).toMatch(/5\.97|5,97/)
  })

  it('menyebut tumpuan sederhana dan model yang BELUM ada', () => {
    /*
      Tangga kantilever, putar, dan bordes menggantung butuh model lain.
      Menyebutkannya lebih jujur daripada mendiamkannya.
    */
    const c = analisaTangga(DASAR).catatan.join(' ')
    expect(c).toMatch(/bertumpu SEDERHANA/i)
    expect(c).toMatch(/kantilever|putar/i)
  })

  it('menyebut besi yang belum termasuk di lipatan', () => {
    expect(analisaTangga(DASAR).catatan.join(' ')).toMatch(/lipatan|penyaluran/i)
  })
})

describe('penjagaan masukan', () => {
  it.each([
    ['tebal', { tebalPelatMm: 0 }],
    ['lebar', { lebarM: -1 }],
    ['tinggi', { tinggiM: 0 }],
    ['optrede', { optredeMm: 0 }],
    ['antrede', { antredeMm: 0 }],
    ["f'c", { mutu: { fcMpa: 0, fyMpa: 400 } }],
  ])('menolak %s tak masuk akal', (_n, ubah) => {
    expect(() => analisaTangga({ ...DASAR, ...ubah } as InputTangga)).toThrow()
  })

  it('menolak pemakaian karangan', () => {
    expect(() => analisaTangga({ ...DASAR, pemakaian: 'gudang' as never }))
      .toThrow(/pemakaian tangga tak dikenal/i)
  })

  it('konstanta sesuai SNI 1727', () => {
    expect(BEBAN_HIDUP_KN_M2.umum).toBe(4.79)
    expect(BEBAN_HIDUP_KN_M2.hunian).toBe(1.92)
    expect(BERAT_BETON_KN_M3).toBe(24)
    expect(BLONDEL_MIN).toBe(600)
    expect(BLONDEL_MAKS).toBe(650)
  })
})
