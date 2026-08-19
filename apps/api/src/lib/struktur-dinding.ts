// DINDING PENAHAN TANAH & DINDING GESER — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// DUA DINDING YANG MEMIKUL GAYA MENDATAR, DENGAN KEGAGALAN YANG BERBEDA
// ══════════════════════════════════════════════════════════════════════════════
//
// DINDING PENAHAN TANAH menahan dorongan tanah di belakangnya — gaya yang
// bekerja setiap hari, bukan hanya saat gempa. Tiga cara ia gagal, dan
// ketiganya harus diperiksa terpisah:
//
//   GULING  — dinding berputar ke depan mengelilingi ujung kakinya
//   GESER   — dinding terdorong mendatar, meluncur di atas tanah
//   TEKANAN — tanah di bawah tumitnya hancur karena tekanan terpusat
//
// Yang paling sering dilewatkan bukan yang paling rumit melainkan yang paling
// membosankan: GESER. Dinding boleh sangat berat sehingga tak mungkin guling,
// dan tetap meluncur — karena yang menahan geser bukan beratnya melainkan
// gesekan dasar, dan gesekan itu kecil pada tanah lempung basah.
//
// DINDING GESER (shear wall) memikul gaya gempa, dan kegagalannya berlawanan
// sifat: ia harus DAKTAIL — boleh rusak asal tidak runtuh mendadak. Karena itu
// yang diperiksa bukan hanya kuat gesernya melainkan apakah lentur akan leleh
// LEBIH DULU daripada geser. Dinding yang gesernya lebih lemah runtuh
// tiba-tiba tanpa peringatan.
//
// ── Rankine, bukan Coulomb
//
// Tekanan tanah aktif memakai teori Rankine (Ka = tan²(45° − φ/2)). Coulomb
// memperhitungkan gesekan dinding-tanah dan memberi hasil lebih kecil — lebih
// ekonomis tetapi butuh sudut gesek antarmuka yang jarang diukur di proyek
// menengah. Rankine memberi hasil yang lebih besar, dan untuk elemen yang
// kegagalannya menimbun orang, itu arah yang benar.
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON } from './struktur-beton.js'
import type { HasilElemen, Periksa, VolumeElemen, BarisBesi } from './struktur-beton.js'

/** Berat volume beton bertulang, kN/m³. */
export const BERAT_BETON_KN_M3 = 24

/** Angka keamanan minimum — praktik geoteknik yang lazim. */
export const SF_GULING_MIN = 2.0
export const SF_GESER_MIN = 1.5

/**
 * Koefisien gesekan dasar terhadap tan(φ).
 *
 * Beton yang dicor langsung di atas tanah tidak licin, tetapi juga tidak
 * sekasar tanah terhadap tanah. 2/3 adalah angka lazim; memakai tan(φ) penuh
 * melebihkan tahanan geser pada elemen yang justru paling sering meluncur.
 */
export const FAKTOR_GESEK_DASAR = 2 / 3

export interface InputDindingPenahan {
  /** Tinggi total dinding dari dasar telapak, m. */
  tinggiM: number
  /** Tebal badan dinding di puncak, m. */
  tebalAtasM: number
  /** Tebal badan dinding di dasar, m. */
  tebalBawahM: number
  /** Panjang telapak (kaki + badan + tumit), m. */
  panjangTelapakM: number
  /** Tebal telapak, m. */
  tebalTelapakM: number
  /** Panjang kaki depan (toe) dari muka badan, m. */
  kakiM: number
  /** Berat volume tanah urug di belakang, kN/m³. */
  gammaTanahKnM3: number
  /** Sudut geser dalam tanah, derajat. */
  phiDerajat: number
  /** Kohesi tanah, kPa. Nol untuk pasir. */
  kohesiKpa?: number
  /** Daya dukung tanah izin di bawah telapak, kPa. */
  qaKnM2: number
  /** Beban merata di atas tanah urug (surcharge), kPa. */
  surchargeKpa?: number
  /** Panjang dinding, m — untuk volume. */
  panjangDindingM: number
  selimutMm: number
  dUtamaMm: number
  jarakUtamaMm: number
  mutu: { fcMpa: number; fyMpa: number }
  jumlah?: number
}

export interface HasilDindingPenahan extends HasilElemen {
  stabilitas: {
    /** Koefisien tekanan tanah aktif. */
    ka: number
    /** Gaya dorong tanah per meter panjang, kN/m. */
    paKnPerM: number
    /** Berat total penahan per meter panjang, kN/m. */
    wKnPerM: number
    /** Angka keamanan guling. */
    sfGuling: number
    /** Angka keamanan geser. */
    sfGeser: number
    /** Tekanan maksimum di bawah telapak, kPa. */
    qMaksKnM2: number
    qMinKnM2: number
    /** Eksentrisitas resultan dari pusat telapak, m. */
    eksentrisitasM: number
    /** Resultan keluar dari inti sepertiga tengah? */
    diLuarInti: boolean
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Dinding penahan tanah kantilever.
 *
 * Momen diambil terhadap UJUNG KAKI DEPAN (toe) — titik dinding berputar saat
 * guling.
 */
export function analisaDindingPenahan(input: InputDindingPenahan): HasilDindingPenahan {
  const {
    tinggiM, tebalAtasM, tebalBawahM, panjangTelapakM, tebalTelapakM, kakiM,
    gammaTanahKnM3, phiDerajat, qaKnM2, panjangDindingM,
    selimutMm, dUtamaMm, jarakUtamaMm, mutu,
  } = input

  positif('tinggi', tinggiM)
  positif('tebal atas', tebalAtasM)
  positif('tebal bawah', tebalBawahM)
  positif('panjang telapak', panjangTelapakM)
  positif('tebal telapak', tebalTelapakM)
  positif('berat volume tanah', gammaTanahKnM3)
  positif('sudut geser dalam', phiDerajat)
  positif('daya dukung tanah', qaKnM2)
  positif('panjang dinding', panjangDindingM)
  positif('d tulangan', dUtamaMm)
  positif('jarak tulangan', jarakUtamaMm)
  positif("f'c", mutu.fcMpa)
  positif('fy', mutu.fyMpa)

  if (phiDerajat >= 90) throw new Error(`sudut geser dalam ${phiDerajat}° tak masuk akal`)
  if (kakiM < 0) throw new Error('panjang kaki tak boleh negatif')
  if (kakiM + tebalBawahM > panjangTelapakM) {
    throw new Error(
      `Kaki (${kakiM} m) + tebal badan (${tebalBawahM} m) melebihi panjang `
      + `telapak (${panjangTelapakM} m) — tak ada ruang untuk tumit.`,
    )
  }
  if (tebalTelapakM >= tinggiM) {
    throw new Error('Tebal telapak ≥ tinggi dinding — periksa masukannya')
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []
  const surcharge = input.surchargeKpa ?? 0
  const kohesi = input.kohesiKpa ?? 0

  // ── Tekanan tanah aktif (Rankine) ────────────────────────────────────────
  const phiRad = (phiDerajat * Math.PI) / 180
  const ka = Math.tan(Math.PI / 4 - phiRad / 2) ** 2

  /*
    Gaya dorong dari tanah (segitiga) + surcharge (persegi). Keduanya bekerja
    pada lengan yang BERBEDA — segitiga di H/3 dari dasar, persegi di H/2 —
    dan menggabungkannya jadi satu resultan menggeser titik tangkapnya.
  */
  const paTanah = 0.5 * ka * gammaTanahKnM3 * tinggiM ** 2
  const paSurcharge = ka * surcharge * tinggiM
  const paKnPerM = paTanah + paSurcharge

  const momenGulingKnm =
    paTanah * (tinggiM / 3) + paSurcharge * (tinggiM / 2)

  // ── Berat penahan ────────────────────────────────────────────────────────
  const tinggiBadanM = tinggiM - tebalTelapakM
  const tumitM = panjangTelapakM - kakiM - tebalBawahM

  /* Badan trapesium. */
  const luasBadanM2 = ((tebalAtasM + tebalBawahM) / 2) * tinggiBadanM
  const wBadan = luasBadanM2 * BERAT_BETON_KN_M3
  /* Lengan badan dari ujung kaki: kaki + centroid trapesium. */
  const xBadan = kakiM + (
    (tebalBawahM ** 2 + tebalBawahM * tebalAtasM + tebalAtasM ** 2)
    / (3 * (tebalBawahM + tebalAtasM))
  )

  const wTelapak = panjangTelapakM * tebalTelapakM * BERAT_BETON_KN_M3
  const xTelapak = panjangTelapakM / 2

  /* Tanah DI ATAS TUMIT ikut menahan — dan porsinya besar. */
  const wTanah = tumitM * tinggiBadanM * gammaTanahKnM3
  const xTanah = kakiM + tebalBawahM + tumitM / 2

  const wSurcharge = tumitM * surcharge
  const xSurcharge = xTanah

  const wKnPerM = wBadan + wTelapak + wTanah + wSurcharge
  const momenPenahanKnm =
    wBadan * xBadan + wTelapak * xTelapak + wTanah * xTanah + wSurcharge * xSurcharge

  // ── Guling ───────────────────────────────────────────────────────────────
  const sfGuling = momenPenahanKnm / momenGulingKnm
  periksa.push({
    nama: 'Stabilitas guling',
    nilai: Math.round(sfGuling * 1000) / 1000,
    syarat: SF_GULING_MIN,
    satuan: '×',
    aman: sfGuling >= SF_GULING_MIN,
    rasio: Math.round((SF_GULING_MIN / sfGuling) * 1e4) / 1e4,
    rumus: `ΣM_penahan / ΣM_guling ≥ ${SF_GULING_MIN} (momen terhadap ujung kaki)`,
  })

  // ── Geser ────────────────────────────────────────────────────────────────
  /*
    Yang menahan geser BUKAN berat dinding melainkan gesekan dasar — dan
    gesekan itu kecil pada tanah lempung basah. Dinding boleh sangat berat
    sehingga tak mungkin guling, dan tetap meluncur.
  */
  const tahananGesekKnPerM = wKnPerM * Math.tan(FAKTOR_GESEK_DASAR * phiRad)
  const tahananKohesiKnPerM = kohesi * panjangTelapakM
  const sfGeser = (tahananGesekKnPerM + tahananKohesiKnPerM) / paKnPerM

  periksa.push({
    nama: 'Stabilitas geser',
    nilai: Math.round(sfGeser * 1000) / 1000,
    syarat: SF_GESER_MIN,
    satuan: '×',
    aman: sfGeser >= SF_GESER_MIN,
    rasio: Math.round((SF_GESER_MIN / sfGeser) * 1e4) / 1e4,
    rumus: `(W·tan(⅔φ) + c·B) / Pa ≥ ${SF_GESER_MIN}`,
  })

  // ── Tekanan tanah di bawah telapak ───────────────────────────────────────
  const xResultanM = (momenPenahanKnm - momenGulingKnm) / wKnPerM
  const eksentrisitasM = panjangTelapakM / 2 - xResultanM
  const diLuarInti = Math.abs(eksentrisitasM) > panjangTelapakM / 6

  const qMaksKnM2 = (wKnPerM / panjangTelapakM)
    * (1 + (6 * Math.abs(eksentrisitasM)) / panjangTelapakM)
  const qMinKnM2 = (wKnPerM / panjangTelapakM)
    * (1 - (6 * Math.abs(eksentrisitasM)) / panjangTelapakM)

  periksa.push({
    nama: 'Daya dukung tanah',
    nilai: Math.round(qaKnM2 * 100) / 100,
    syarat: Math.round(qMaksKnM2 * 100) / 100,
    satuan: 'kPa',
    aman: qMaksKnM2 <= qaKnM2,
    rasio: Math.round((qMaksKnM2 / qaKnM2) * 1e4) / 1e4,
    rumus: 'q_maks = W/B·(1 + 6e/B) ≤ qa',
  })

  periksa.push({
    nama: 'Resultan di inti telapak',
    nilai: Math.round(Math.abs(eksentrisitasM) * 1000) / 1000,
    syarat: Math.round((panjangTelapakM / 6) * 1000) / 1000,
    satuan: 'm',
    aman: !diLuarInti,
    rasio: Math.round((Math.abs(eksentrisitasM) / (panjangTelapakM / 6)) * 1e4) / 1e4,
    rumus: 'e ≤ B/6 — di luar ini sebagian telapak TERANGKAT',
  })

  if (diLuarInti) {
    catatan.push(
      `Resultan jatuh di luar sepertiga tengah telapak (e = `
      + `${Math.abs(eksentrisitasM).toFixed(3)} m > B/6 = `
      + `${(panjangTelapakM / 6).toFixed(3)} m). Sebagian telapak TERANGKAT, `
      + 'seluruh beban dipikul luas yang lebih kecil, dan rumus tekanan di atas '
      + 'tak lagi berlaku — tekanan nyatanya lebih besar. Perpanjang tumitnya.',
    )
  }

  // ── Lentur badan dinding ─────────────────────────────────────────────────
  const d = tebalBawahM * 1000 - selimutMm - dUtamaMm / 2
  if (d <= 0) throw new Error('Tebal badan terlalu kecil untuk selimut dan tulangan')

  /* Momen di dasar badan — tekanan tanah setinggi badan saja. */
  const paBadan = 0.5 * ka * gammaTanahKnM3 * tinggiBadanM ** 2
    + ka * surcharge * tinggiBadanM
  const muBadanKnm = paBadan * (tinggiBadanM / 3)

  const asPerM = (Math.PI / 4) * dUtamaMm ** 2 * (1000 / jarakUtamaMm)
  const a = (asPerM * mutu.fyMpa) / (0.85 * mutu.fcMpa * 1000)
  const phiMn = (0.9 * asPerM * mutu.fyMpa * (d - a / 2)) / 1e6

  periksa.push({
    nama: 'Lentur',
    nilai: Math.round(phiMn * 100) / 100,
    syarat: Math.round(muBadanKnm * 100) / 100,
    satuan: 'kNm/m',
    aman: phiMn >= muBadanKnm,
    rasio: phiMn > 0 ? Math.round((muBadanKnm / phiMn) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn ≥ Mu di dasar badan dinding',
  })

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const betonM3 = (luasBadanM2 + panjangTelapakM * tebalTelapakM)
    * panjangDindingM * jumlah

  /* Dua sisi badan + dua sisi telapak. Sisi belakang telapak tertimbun tanah. */
  const bekistingM2 = (
    2 * tinggiBadanM * panjangDindingM + 2 * tebalTelapakM * panjangDindingM
  ) * jumlah

  const beratPerM = (dMm: number) => 0.0061654 * dMm * dMm
  const nVertikal = Math.ceil((panjangDindingM * 1000) / jarakUtamaMm) + 1
  const nHorizontal = Math.ceil((tinggiM * 1000) / jarakUtamaMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm,
      jumlahBatang: nVertikal * jumlah,
      panjangPerBatangM: tinggiM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nVertikal * jumlah * tinggiM * beratPerM(dUtamaMm),
      peran: 'utama',
    },
    {
      tipe: 'BjTP', diameterMm: dUtamaMm,
      jumlahBatang: nHorizontal * jumlah,
      panjangPerBatangM: panjangDindingM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nHorizontal * jumlah * panjangDindingM * beratPerM(dUtamaMm),
      peran: 'bagi',
    },
  ]

  const besiBulat = besi.map((b) => ({ ...b, totalKg: Math.round(b.totalKg * 1e4) / 1e4 }))
  const volume: VolumeElemen = {
    betonM3: Math.round(betonM3 * 1e4) / 1e4,
    bekistingM2: Math.round(bekistingM2 * 1e4) / 1e4,
    besi: besiBulat,
    besiTotalKg: Math.round(besiBulat.reduce((s, b) => s + b.totalKg, 0) * 1e4) / 1e4,
    beratSendiriKg: Math.round(betonM3 * RHO_BETON * 1e4) / 1e4,
  }

  catatan.push(
    `Tekanan tanah memakai teori RANKINE (Ka = ${ka.toFixed(4)} untuk φ = `
    + `${phiDerajat}°). Coulomb memperhitungkan gesekan dinding-tanah dan `
    + 'memberi hasil lebih kecil — lebih ekonomis, tetapi butuh sudut gesek '
    + 'antarmuka yang jarang diukur. Untuk elemen yang kegagalannya menimbun '
    + 'orang, hasil yang lebih besar adalah arah yang benar.',
  )
  catatan.push(
    `Tahanan geser memakai ⅔φ (${(FAKTOR_GESEK_DASAR * phiDerajat).toFixed(1)}°), `
    + 'bukan φ penuh. Yang menahan geser BUKAN berat dinding melainkan gesekan '
    + 'dasar — dinding boleh sangat berat sehingga tak mungkin guling, dan '
    + 'tetap meluncur pada tanah lempung basah.',
  )
  catatan.push(
    'Yang BELUM diperiksa: tekanan tanah saat GEMPA (Mononobe-Okabe), tekanan '
    + 'air pori bila drainase tersumbat, dan stabilitas lereng menyeluruh. '
    + 'Tekanan air pori yang terabaikan adalah penyebab runtuhnya dinding '
    + 'penahan yang paling sering — dan ia muncul justru saat hujan lebat.',
  )
  catatan.push(
    'Drainase di belakang dinding (pipa suling & lapisan kerikil) WAJIB ada '
    + 'dan tidak dihitung di sini. Tanpanya tekanan air menambah dorongan '
    + 'sampai dua kali lipat.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      ka: Math.round(ka * 1e6) / 1e6,
      tinggiBadanM: Math.round(tinggiBadanM * 1e4) / 1e4,
      tumitM: Math.round(tumitM * 1e4) / 1e4,
      momenGulingKnm: Math.round(momenGulingKnm * 100) / 100,
      momenPenahanKnm: Math.round(momenPenahanKnm * 100) / 100,
      wBadan: Math.round(wBadan * 100) / 100,
      wTanah: Math.round(wTanah * 100) / 100,
      dMm: Math.round(d * 100) / 100,
    },
    catatan,
    stabilitas: {
      ka: Math.round(ka * 1e6) / 1e6,
      paKnPerM: Math.round(paKnPerM * 1e4) / 1e4,
      wKnPerM: Math.round(wKnPerM * 1e4) / 1e4,
      sfGuling: Math.round(sfGuling * 1e4) / 1e4,
      sfGeser: Math.round(sfGeser * 1e4) / 1e4,
      qMaksKnM2: Math.round(qMaksKnM2 * 1e4) / 1e4,
      qMinKnM2: Math.round(qMinKnM2 * 1e4) / 1e4,
      eksentrisitasM: Math.round(eksentrisitasM * 1e4) / 1e4,
      diLuarInti,
    },
  }
}

// ── DINDING GESER ────────────────────────────────────────────────────────────

export interface InputDindingGeser {
  /** Panjang dinding (arah gaya), m. */
  panjangM: number
  /** Tebal dinding, mm. */
  tebalMm: number
  /** Tinggi total dinding, m. */
  tinggiM: number
  /** Gaya geser rencana, kN. */
  vuKn: number
  /** Momen guling rencana di dasar, kNm. */
  muKnm: number
  /** Gaya aksial tekan yang bekerja bersamaan, kN. */
  puKn: number
  /** Rasio tulangan horizontal (badan), 0–1. */
  rhoHorizontal: number
  /** Rasio tulangan vertikal (badan), 0–1. */
  rhoVertikal: number
  /** Luas tulangan ujung (boundary element) tiap sisi, mm². */
  asUjungMm2: number
  selimutMm: number
  dUtamaMm: number
  jarakUtamaMm: number
  mutu: { fcMpa: number; fyMpa: number }
  jumlah?: number
}

export interface HasilDindingGeser extends HasilElemen {
  kapasitas: {
    /** Rasio tinggi/panjang — menentukan perilaku langsing vs gemuk. */
    rasioAspek: number
    /** Dinding LANGSING dikendalikan lentur, GEMUK dikendalikan geser. */
    langsing: boolean
    phiVnKn: number
    phiMnKnm: number
    /** Apakah lentur leleh LEBIH DULU daripada geser? Syarat daktilitas. */
    lenturDuluan: boolean
  }
}

/**
 * Dinding geser (shear wall) beton bertulang.
 *
 * Yang diperiksa bukan hanya kuat gesernya melainkan URUTAN kegagalannya:
 * lentur harus leleh lebih dulu daripada geser. Dinding yang gesernya lebih
 * lemah runtuh tiba-tiba tanpa peringatan, dan itu justru yang dihindari
 * seluruh filosofi desain gempa.
 */
export function analisaDindingGeser(input: InputDindingGeser): HasilDindingGeser {
  const {
    panjangM, tebalMm, tinggiM, vuKn, muKnm, puKn,
    rhoHorizontal, rhoVertikal, asUjungMm2,
    selimutMm, dUtamaMm, jarakUtamaMm, mutu,
  } = input

  positif('panjang', panjangM)
  positif('tebal', tebalMm)
  positif('tinggi', tinggiM)
  positif('Vu', vuKn)
  positif('d tulangan', dUtamaMm)
  positif('jarak tulangan', jarakUtamaMm)
  positif("f'c", mutu.fcMpa)
  positif('fy', mutu.fyMpa)

  if (rhoHorizontal < 0 || rhoVertikal < 0) {
    throw new Error('Rasio tulangan tak boleh negatif')
  }
  if (asUjungMm2 < 0) throw new Error('Luas tulangan ujung tak boleh negatif')

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const lwMm = panjangM * 1000
  const hwMm = tinggiM * 1000
  const rasioAspek = hwMm / lwMm
  const langsing = rasioAspek >= 2

  // ── Geser (SNI 2847 §11.5.4) ─────────────────────────────────────────────
  /*
    Koefisien αc bergantung rasio aspek: dinding GEMUK (hw/lw ≤ 1,5) punya
    tahanan beton lebih besar karena bekerja sebagai balok tinggi.
  */
  const alphaC = rasioAspek <= 1.5 ? 0.25 : rasioAspek >= 2 ? 0.17 : 0.25 - (rasioAspek - 1.5) * 0.16
  const acvMm2 = lwMm * tebalMm
  const vnKn = (acvMm2 * (alphaC * Math.sqrt(mutu.fcMpa) + rhoHorizontal * mutu.fyMpa)) / 1000
  const phiVnKn = 0.75 * vnKn

  /* Batas atas mutlak — beton hancur sebelum tulangan bekerja. */
  const vnMaksKn = (0.83 * Math.sqrt(mutu.fcMpa) * acvMm2) / 1000
  const phiVnPakai = Math.min(phiVnKn, 0.75 * vnMaksKn)

  periksa.push({
    nama: 'Kapasitas geser',
    nilai: Math.round(phiVnPakai * 100) / 100,
    syarat: Math.round(vuKn * 100) / 100,
    satuan: 'kN',
    aman: phiVnPakai >= vuKn,
    rasio: phiVnPakai > 0 ? Math.round((vuKn / phiVnPakai) * 1e4) / 1e4 : Infinity,
    rumus: "φVn = φ·Acv·(αc√f'c + ρt·fy) ≤ φ·0,83√f'c·Acv",
  })

  // ── Lentur ───────────────────────────────────────────────────────────────
  /*
    Kapasitas lentur diperkirakan dari kopel tulangan ujung + sumbangan aksial.
    Ini PENDEKATAN — analisa penampang penuh butuh diagram P-M dinding, yang
    berbeda dari kolom karena tulangan badannya tersebar.
  */
  const dEfektifMm = lwMm - selimutMm * 2
  const phiMnKnm = (
    0.9 * asUjungMm2 * mutu.fyMpa * dEfektifMm
    + puKn * 1000 * (lwMm / 2)
  ) / 1e6

  periksa.push({
    nama: 'Lentur',
    nilai: Math.round(phiMnKnm * 100) / 100,
    syarat: Math.round(muKnm * 100) / 100,
    satuan: 'kNm',
    aman: phiMnKnm >= muKnm,
    rasio: phiMnKnm > 0 ? Math.round((muKnm / phiMnKnm) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn ≥ Mu — kopel tulangan ujung + sumbangan aksial (PENDEKATAN)',
  })

  // ── Daktilitas: lentur harus leleh LEBIH DULU ────────────────────────────
  /*
    Inilah pemeriksaan yang membedakan dinding geser dari dinding biasa.
    Geser yang lebih lemah daripada lentur berarti dinding runtuh TIBA-TIBA
    saat gempa — tanpa retak yang memberi peringatan, tanpa waktu bagi orang
    untuk keluar.
  */
  const geserSaatLenturLelehKn = muKnm > 0 && phiMnKnm > 0
    ? vuKn * (phiMnKnm / muKnm)
    : 0
  const lenturDuluan = phiVnPakai >= geserSaatLenturLelehKn

  periksa.push({
    nama: 'Lentur leleh sebelum geser',
    nilai: Math.round(phiVnPakai * 100) / 100,
    syarat: Math.round(geserSaatLenturLelehKn * 100) / 100,
    satuan: 'kN',
    aman: lenturDuluan,
    rasio: phiVnPakai > 0
      ? Math.round((geserSaatLenturLelehKn / phiVnPakai) * 1e4) / 1e4
      : Infinity,
    rumus: 'φVn ≥ geser saat lentur leleh — kegagalan geser TIBA-TIBA',
  })

  if (!lenturDuluan) {
    catatan.push(
      'Geser akan gagal LEBIH DULU daripada lentur. Dinding ini runtuh '
      + 'tiba-tiba saat gempa — tanpa retak yang memberi peringatan, tanpa '
      + 'waktu bagi orang untuk keluar. Perbesar tulangan horizontal atau '
      + 'tebalkan dindingnya; menambah tulangan ujung justru MEMPERBURUK '
      + 'karena ia menaikkan kapasitas lentur.',
    )
  }

  // ── Tulangan minimum (SNI 2847 §11.6) ────────────────────────────────────
  const rhoMin = 0.0025
  periksa.push({
    nama: 'Tulangan minimum',
    nilai: Math.round(Math.min(rhoHorizontal, rhoVertikal) * 1e5) / 1e5,
    syarat: rhoMin,
    satuan: '',
    aman: rhoHorizontal >= rhoMin && rhoVertikal >= rhoMin,
    rasio: Math.round((rhoMin / Math.max(1e-9, Math.min(rhoHorizontal, rhoVertikal))) * 1e4) / 1e4,
    rumus: 'ρt dan ρl ≥ 0,0025 (SNI 2847 §11.6.2)',
  })

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const betonM3 = panjangM * tinggiM * (tebalMm / 1000) * jumlah
  const bekistingM2 = 2 * panjangM * tinggiM * jumlah

  const beratPerM = (dMm: number) => 0.0061654 * dMm * dMm
  /* Dinding bertulang DUA LAPIS (tiap muka) untuk tebal ≥ 200 mm. */
  const lapis = tebalMm >= 200 ? 2 : 1
  const nVert = Math.ceil(lwMm / jarakUtamaMm) + 1
  const nHor = Math.ceil(hwMm / jarakUtamaMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm,
      jumlahBatang: nVert * lapis * jumlah,
      panjangPerBatangM: tinggiM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nVert * lapis * jumlah * tinggiM * beratPerM(dUtamaMm),
      peran: 'utama',
    },
    {
      tipe: 'BjTP', diameterMm: dUtamaMm,
      jumlahBatang: nHor * lapis * jumlah,
      panjangPerBatangM: panjangM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nHor * lapis * jumlah * panjangM * beratPerM(dUtamaMm),
      peran: 'bagi',
    },
  ]

  const besiBulat = besi.map((b) => ({ ...b, totalKg: Math.round(b.totalKg * 1e4) / 1e4 }))
  const volume: VolumeElemen = {
    betonM3: Math.round(betonM3 * 1e4) / 1e4,
    bekistingM2: Math.round(bekistingM2 * 1e4) / 1e4,
    besi: besiBulat,
    besiTotalKg: Math.round(besiBulat.reduce((s, b) => s + b.totalKg, 0) * 1e4) / 1e4,
    beratSendiriKg: Math.round(betonM3 * RHO_BETON * 1e4) / 1e4,
  }

  catatan.push(
    `Rasio aspek hw/lw = ${rasioAspek.toFixed(2)} — dinding `
    + `${langsing ? 'LANGSING, dikendalikan LENTUR' : 'GEMUK, dikendalikan GESER'}. `
    + `Koefisien αc = ${alphaC.toFixed(3)} mengikuti rasio itu: dinding gemuk `
    + 'punya tahanan beton lebih besar karena bekerja sebagai balok tinggi.',
  )
  catatan.push(
    'Kapasitas lentur adalah PENDEKATAN dari kopel tulangan ujung. Analisa '
    + 'penampang penuh butuh diagram P-M dinding, yang berbeda dari kolom '
    + 'karena tulangan badannya tersebar sepanjang penampang.',
  )
  catatan.push(
    'Yang BELUM diperiksa: pendetailan elemen batas (boundary element) yang '
    + 'SNI 2847 §18.10.6 tuntut untuk dinding khusus, sambungan lewatan di '
    + 'daerah sendi plastis, dan bukaan pintu/jendela yang memotong dinding. '
    + 'Bukaan mengubah perilakunya sepenuhnya — dinding berlubang berperilaku '
    + 'sebagai rangka, bukan dinding.',
  )
  catatan.push(
    `Besi dihitung ${lapis} lapis (tiap muka) untuk tebal ${tebalMm} mm. `
    + 'Dinding ≥ 200 mm wajib dua lapis; satu lapis di tengah membuat separuh '
    + 'penampang tak bertulang saat dinding melengkung ke salah satu arah.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      rasioAspek: Math.round(rasioAspek * 1e4) / 1e4,
      alphaC: Math.round(alphaC * 1e4) / 1e4,
      acvMm2: Math.round(acvMm2),
      vnMaksKn: Math.round(vnMaksKn * 100) / 100,
      geserSaatLenturLelehKn: Math.round(geserSaatLenturLelehKn * 100) / 100,
      lapisTulangan: lapis,
    },
    catatan,
    kapasitas: {
      rasioAspek: Math.round(rasioAspek * 1e4) / 1e4,
      langsing,
      phiVnKn: Math.round(phiVnPakai * 100) / 100,
      phiMnKnm: Math.round(phiMnKnm * 100) / 100,
      lenturDuluan,
    },
  }
}
