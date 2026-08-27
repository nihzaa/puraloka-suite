import { describe, it, expect } from 'vitest'
import {
  analisaDindingPenahan, analisaDindingGeser,
  SF_GULING_MIN, SF_GESER_MIN, FAKTOR_GESEK_DASAR, BERAT_BETON_KN_M3,
  type InputDindingPenahan, type InputDindingGeser,
} from '../struktur-dinding'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DINDING PENAHAN TANAH & DINDING GESER
 *
 * Angka pembanding dihitung tangan, bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Dinding penahan kantilever 3 m — ukuran lazim untuk terasering. */
const PENAHAN: InputDindingPenahan = {
  tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
  panjangTelapakM: 2, tebalTelapakM: 0.4, kakiM: 0.5,
  gammaTanahKnM3: 18, phiDerajat: 30, qaKnM2: 200,
  panjangDindingM: 20,
  selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150,
  mutu: { fcMpa: 25, fyMpa: 400 },
}

describe('dinding penahan — tekanan tanah aktif (Rankine)', () => {
  it('Ka = tan²(45° − φ/2)', () => {
    /* tan²(45 − 15) = tan²30 = 0,3333 */
    expect(analisaDindingPenahan(PENAHAN).stabilitas.ka).toBeCloseTo(0.3333, 4)
  })

  it('gaya dorong = ½·Ka·γ·H²', () => {
    /* 0,5 × 0,3333 × 18 × 9 = 27 kN/m */
    expect(analisaDindingPenahan(PENAHAN).stabilitas.paKnPerM).toBeCloseTo(27, 1)
  })

  it('surcharge menambah dorongan dan bekerja di lengan BERBEDA', () => {
    /*
      Segitiga tanah bekerja di H/3, surcharge persegi di H/2. Menggabungkannya
      jadi satu resultan menggeser titik tangkapnya dan mengubah momen guling.
    */
    const tanpa = analisaDindingPenahan(PENAHAN)
    const dengan = analisaDindingPenahan({ ...PENAHAN, surchargeKpa: 10 })
    expect(dengan.stabilitas.paKnPerM).toBeCloseTo(27 + 0.3333 * 10 * 3, 1)
    /* momen guling naik LEBIH dari sekadar rasio gayanya, karena lengannya lebih panjang */
    const rasioGaya = dengan.stabilitas.paKnPerM / tanpa.stabilitas.paKnPerM
    const rasioMomen = dengan.antara.momenGulingKnm / tanpa.antara.momenGulingKnm
    expect(rasioMomen).toBeGreaterThan(rasioGaya)
  })

  it('sudut geser besar → Ka kecil → dorongan kecil', () => {
    const pasir = analisaDindingPenahan({ ...PENAHAN, phiDerajat: 40 })
    expect(pasir.stabilitas.ka).toBeLessThan(analisaDindingPenahan(PENAHAN).stabilitas.ka)
  })
})

describe('dinding penahan — tiga cara gagal', () => {
  it('guling: momen penahan / momen guling ≥ 2', () => {
    const s = analisaDindingPenahan(PENAHAN).stabilitas
    expect(s.sfGuling).toBeGreaterThan(0)
    expect(analisaDindingPenahan(PENAHAN).periksa.find((p) => p.nama.includes('guling'))!.syarat)
      .toBe(SF_GULING_MIN)
  })

  it('tanah DI ATAS TUMIT ikut menahan, dan porsinya besar', () => {
    /*
      Tumit = 2 − 0,5 − 0,4 = 1,1 m; tinggi badan = 3 − 0,4 = 2,6 m
      W_tanah = 1,1 × 2,6 × 18 = 51,48 kN/m — jauh lebih besar daripada
      berat badan dindingnya sendiri.
    */
    expect(analisaDindingPenahan(PENAHAN).antara.wTanah).toBeCloseTo(51.48, 1)
  })

  it('geser memakai ⅔φ, BUKAN φ penuh', () => {
    /*
      Yang menahan geser bukan berat dinding melainkan gesekan dasar. Memakai
      tan(φ) penuh melebihkan tahanan geser 55% pada φ = 30°.
    */
    const s = analisaDindingPenahan(PENAHAN).stabilitas
    const phiRad = (30 * Math.PI) / 180
    const tahananBenar = s.wKnPerM * Math.tan(FAKTOR_GESEK_DASAR * phiRad)
    expect(s.sfGeser).toBeCloseTo(tahananBenar / s.paKnPerM, 3)
    /* dengan φ penuh hasilnya jauh lebih besar */
    expect(s.wKnPerM * Math.tan(phiRad) / s.paKnPerM).toBeGreaterThan(s.sfGeser * 1.4)
  })

  it('kohesi menambah tahanan geser', () => {
    const tanpa = analisaDindingPenahan(PENAHAN).stabilitas.sfGeser
    const dengan = analisaDindingPenahan({ ...PENAHAN, kohesiKpa: 20 }).stabilitas.sfGeser
    expect(dengan).toBeGreaterThan(tanpa)
  })

  it('dinding BERAT tapi di tanah licin: guling aman, GESER gagal', () => {
    /*
      Inilah yang paling sering dilewatkan. Dinding boleh sangat berat sehingga
      tak mungkin guling, dan tetap meluncur — karena yang menahan geser bukan
      beratnya melainkan gesekan dasar.
    */
    const h = analisaDindingPenahan({ ...PENAHAN, phiDerajat: 12, qaKnM2: 400 })
    const guling = h.periksa.find((p) => p.nama.includes('guling'))!
    const geser = h.periksa.find((p) => p.nama.includes('geser'))!
    expect(guling.aman).toBe(true)
    expect(geser.aman).toBe(false)
  })

  it('tekanan tanah di bawah telapak memakai eksentrisitas', () => {
    const s = analisaDindingPenahan(PENAHAN).stabilitas
    expect(s.qMaksKnM2).toBeGreaterThan(s.qMinKnM2)
    expect(s.qMaksKnM2).toBeGreaterThan(s.wKnPerM / PENAHAN.panjangTelapakM)
  })

  it('menandai resultan yang jatuh DI LUAR sepertiga tengah', () => {
    /*
      Telapak pendek → eksentrisitas besar. Sebagian telapak TERANGKAT, dan
      rumus tekanan tak lagi berlaku — tekanan nyatanya lebih besar.
    */
    const h = analisaDindingPenahan({ ...PENAHAN, panjangTelapakM: 1.1, kakiM: 0.2 })
    expect(h.stabilitas.diLuarInti).toBe(true)
    expect(h.catatan.join(' ')).toMatch(/tak lagi berlaku/i)
    expect(h.aman).toBe(false)
  })
})

describe('dinding penahan — volume & masukan', () => {
  it('beton = badan trapesium + telapak', () => {
    /*
      badan  = (0,25 + 0,4)/2 × 2,6 = 0,845 m²
      telapak= 2 × 0,4 = 0,8 m²
      total  = 1,645 × 20 = 32,9 m³
    */
    expect(analisaDindingPenahan(PENAHAN).volume.betonM3).toBeCloseTo(32.9, 2)
  })

  it('MENOLAK kaki + badan yang melebihi panjang telapak', () => {
    expect(() => analisaDindingPenahan({ ...PENAHAN, kakiM: 1.8 }))
      .toThrow(/tak ada ruang untuk tumit/i)
  })

  it('MENOLAK telapak setebal dindingnya', () => {
    expect(() => analisaDindingPenahan({ ...PENAHAN, tebalTelapakM: 3 }))
      .toThrow(/periksa masukannya/i)
  })

  it('menolak sudut geser tak masuk akal', () => {
    expect(() => analisaDindingPenahan({ ...PENAHAN, phiDerajat: 95 })).toThrow()
  })

  it('menyebut tekanan air pori & gempa yang BELUM diperiksa', () => {
    const c = analisaDindingPenahan(PENAHAN).catatan.join(' ')
    expect(c).toMatch(/air pori/i)
    expect(c).toMatch(/Mononobe-Okabe|gempa/i)
    expect(c).toMatch(/drainase/i)
  })

  it('konstanta angka keamanan', () => {
    expect(SF_GULING_MIN).toBe(2.0)
    expect(SF_GESER_MIN).toBe(1.5)
    expect(BERAT_BETON_KN_M3).toBe(24)
  })
})

// ── DINDING GESER ────────────────────────────────────────────────────────────

const GESER: InputDindingGeser = {
  panjangM: 4, tebalMm: 250, tinggiM: 12,
  vuKn: 800, muKnm: 6000, puKn: 1500,
  rhoHorizontal: 0.003, rhoVertikal: 0.003,
  asUjungMm2: 2000,
  selimutMm: 40, dUtamaMm: 13, jarakUtamaMm: 200,
  mutu: { fcMpa: 30, fyMpa: 400 },
}

describe('dinding geser — rasio aspek menentukan perilaku', () => {
  it('hw/lw ≥ 2 → LANGSING, dikendalikan lentur', () => {
    /* 12 / 4 = 3 */
    const k = analisaDindingGeser(GESER).kapasitas
    expect(k.rasioAspek).toBeCloseTo(3, 3)
    expect(k.langsing).toBe(true)
  })

  it('dinding GEMUK punya αc lebih besar', () => {
    /*
      Dinding gemuk bekerja sebagai balok tinggi — tahanan betonnya lebih
      besar. αc 0,25 vs 0,17.
    */
    const gemuk = analisaDindingGeser({ ...GESER, tinggiM: 4 })
    expect(gemuk.kapasitas.langsing).toBe(false)
    expect(gemuk.antara.alphaC).toBeGreaterThan(analisaDindingGeser(GESER).antara.alphaC)
  })

  it('kapasitas geser naik dengan tulangan horizontal', () => {
    const sedikit = analisaDindingGeser({ ...GESER, rhoHorizontal: 0.0025 })
    const banyak = analisaDindingGeser({ ...GESER, rhoHorizontal: 0.008 })
    expect(banyak.kapasitas.phiVnKn).toBeGreaterThan(sedikit.kapasitas.phiVnKn)
  })

  it('kapasitas geser DIBATASI ATAS — beton hancur sebelum tulangan bekerja', () => {
    /*
      Tulangan horizontal sangat banyak tak menaikkan kapasitas tanpa batas:
      0,83√f'c·Acv adalah batas mutlak.
    */
    const ekstrem = analisaDindingGeser({ ...GESER, rhoHorizontal: 0.05 })
    expect(ekstrem.kapasitas.phiVnKn).toBeCloseTo(0.75 * ekstrem.antara.vnMaksKn, 1)
  })
})

describe('dinding geser — URUTAN kegagalan, bukan hanya kuatnya', () => {
  it('memeriksa lentur leleh SEBELUM geser', () => {
    const h = analisaDindingGeser(GESER)
    expect(h.periksa.some((p) => p.nama.includes('sebelum geser'))).toBe(true)
  })

  it('menandai dinding yang gesernya lebih lemah — runtuh TIBA-TIBA', () => {
    /*
      Inilah yang membedakan dinding geser dari dinding biasa. Geser yang lebih
      lemah berarti runtuh tanpa retak yang memberi peringatan, tanpa waktu
      bagi orang untuk keluar.
    */
    /*
      ⚠ Fixture ini bukan sekadar "dinding tipis". Diukur: menipiskan dinding
      MENURUNKAN kapasitas geser tetapi tak mengubah urutan kegagalannya,
      karena Vu ikut tetap.

      Yang benar-benar memicu geser-duluan adalah kapasitas LENTUR yang jauh
      melebihi Mu — dinding kelebihan tulangan ujung. Saat lentur baru leleh
      pada geser 1.905 kN sementara kapasitas gesernya 1.598 kN, gesernya
      gagal lebih dulu.

      Ini keadaan yang nyata dan berbahaya justru karena tampak berlebihan:
      perencana menambah tulangan ujung "supaya aman", dan hasilnya dinding
      yang runtuh mendadak.
    */
    const h = analisaDindingGeser({ ...GESER, asUjungMm2: 8000 })
    expect(h.kapasitas.lenturDuluan).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/tiba-tiba/i)
    expect(h.aman).toBe(false)
  })

  it('menipiskan dinding TIDAK dengan sendirinya membalik urutan kegagalan', () => {
    /*
      Diukur saat menulis test di atas: tebal 250→150 menurunkan φVn dari 1.598
      ke 869 kN, tetapi geser saat lentur leleh tetap 776 kN — jadi lentur
      masih duluan. Perilaku ini benar dan patut dikunci: yang menentukan
      urutan adalah SELISIH kapasitas terhadap tuntutannya, bukan kekuatan
      mutlak salah satunya.
    */
    const tipis = analisaDindingGeser({ ...GESER, rhoHorizontal: 0.0025, tebalMm: 150 })
    expect(tipis.kapasitas.phiVnKn).toBeLessThan(analisaDindingGeser(GESER).kapasitas.phiVnKn)
    expect(tipis.kapasitas.lenturDuluan).toBe(true)
  })

  it('menyarankan perbaikan yang BENAR — bukan menambah tulangan ujung', () => {
    /*
      Menambah tulangan ujung justru MEMPERBURUK: ia menaikkan kapasitas
      lentur, sehingga geser makin tertinggal.
    */
    const h = analisaDindingGeser({ ...GESER, asUjungMm2: 8000 })
    expect(h.catatan.join(' ')).toMatch(/MEMPERBURUK/i)
  })
})

describe('dinding geser — tulangan & volume', () => {
  it('tulangan minimum ρ ≥ 0,0025 diperiksa dua arah', () => {
    const kurang = analisaDindingGeser({ ...GESER, rhoVertikal: 0.001 })
    expect(kurang.periksa.find((p) => p.nama === 'Tulangan minimum')!.aman).toBe(false)
  })

  it('dinding ≥ 200 mm bertulang DUA LAPIS', () => {
    /*
      Satu lapis di tengah membuat separuh penampang tak bertulang saat dinding
      melengkung ke salah satu arah.
    */
    expect(analisaDindingGeser(GESER).antara.lapisTulangan).toBe(2)
    expect(analisaDindingGeser({ ...GESER, tebalMm: 150 }).antara.lapisTulangan).toBe(1)
  })

  it('beton = panjang × tinggi × tebal', () => {
    /* 4 × 12 × 0,25 = 12 m³ */
    expect(analisaDindingGeser(GESER).volume.betonM3).toBeCloseTo(12, 3)
  })

  it('bekisting dua muka', () => {
    /* 2 × 4 × 12 = 96 m² */
    expect(analisaDindingGeser(GESER).volume.bekistingM2).toBeCloseTo(96, 2)
  })

  it('menyebut bukaan & elemen batas yang BELUM diperiksa', () => {
    const c = analisaDindingGeser(GESER).catatan.join(' ')
    expect(c).toMatch(/boundary element|elemen batas/i)
    expect(c).toMatch(/[Bb]ukaan/)
  })

  it('menolak rasio tulangan negatif', () => {
    expect(() => analisaDindingGeser({ ...GESER, rhoHorizontal: -0.001 })).toThrow()
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const satu = analisaDindingGeser(GESER)
    const tiga = analisaDindingGeser({ ...GESER, jumlah: 3 })
    expect(tiga.volume.betonM3).toBeCloseTo(satu.volume.betonM3 * 3, 3)
    expect(tiga.aman).toBe(satu.aman)
  })
})
