/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KETAHANAN API — beton tidak terbakar, tetapi TULANGANNYA meleleh
 *
 * Salah paham yang paling mahal tentang beton: karena ia tak terbakar, orang
 * menyangka bangunan beton aman dari kebakaran. Betonnya memang tak terbakar.
 * Yang memikul beban BUKAN betonnya melainkan tulangan di dalamnya, dan baja
 * kehilangan lebih dari separuh kekuatannya pada 550 °C — suhu yang dicapai
 * kebakaran ruangan biasa dalam sekitar sepuluh menit.
 *
 * Yang menahan panas itu sampai ke tulangan hanya SELIMUT BETON: beberapa
 * sentimeter beton di antara permukaan dan besinya. Selimut yang kurang dua
 * sentimeter bisa memangkas ketahanan api dari dua jam menjadi setengah jam.
 *
 * ── Kenapa ini bukan urusan "nanti saja"
 *
 * Ketahanan api tidak bisa ditambahkan sesudah bangunan berdiri. Ia ditentukan
 * saat tulangan diikat, oleh tukang yang memasang beton decking — dan kalau
 * deckingnya kurang atau tergeser saat pengecoran, tak ada cara memperbaikinya
 * selain membongkar.
 *
 * Yang lebih halus: selimut yang TERLALU TEBAL juga merugikan — ia mengurangi
 * tinggi efektif penampang, jadi kapasitas lenturnya turun. Modul ini memeriksa
 * keduanya, bukan hanya kekurangannya.
 *
 * ── Batas yang JUJUR
 *
 * Ini metode TABULASI (SNI 1726 / SNI 2847 Tabel, mengikuti pola Eurocode 2
 * dan ACI 216). Ia memberi ketahanan api dari dimensi dan selimut saja —
 * cukup untuk perencanaan dan untuk memenuhi persyaratan bangunan, TIDAK
 * cukup untuk bangunan yang butuh analisa kebakaran sesungguhnya (rumah sakit,
 * gedung tinggi, pabrik berbahan mudah terbakar).
 *
 * Metode tabulasi juga mengandaikan kebakaran STANDAR (kurva ISO 834). Api
 * yang menyala lebih panas — kebakaran bahan bakar cair, misalnya — tak
 * terwakili olehnya.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { Periksa } from './struktur-beton.js'

/** Elemen beton yang punya tabel ketahanan api sendiri. */
export type ElemenApi = 'balok' | 'kolom' | 'pelat' | 'dinding'

/**
 * Tingkat ketahanan api yang lazim diminta, menit.
 *
 * Angka-angka ini datang dari peraturan bangunan, bukan dari perhitungan
 * struktur: berapa lama penghuni butuh waktu untuk keluar, dan berapa lama
 * pemadam butuh waktu untuk masuk.
 */
export const TINGKAT_API = [30, 60, 90, 120, 180, 240] as const
export type TingkatApi = typeof TINGKAT_API[number]

/**
 * Selimut beton MINIMUM ke pusat tulangan (axis distance), mm.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PENTING: ini jarak ke PUSAT tulangan, bukan ke permukaannya.
 *
 * Dua besaran yang selalu tertukar di lapangan:
 *
 *   selimut bersih (cover)   permukaan beton → permukaan sengkang
 *   axis distance (a)        permukaan beton → PUSAT tulangan utama
 *
 * a = selimut bersih + Ø sengkang + ½ Ø tulangan utama
 *
 * Tabel ketahanan api memakai yang KEDUA, sementara gambar kerja dan
 * pengawasan lapangan memakai yang PERTAMA. Memasukkan selimut bersih ke
 * tabel api memberi ketahanan yang terlalu optimistis — dan selisihnya
 * sekitar 20 mm, cukup untuk menggeser satu tingkat penuh.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Angka dari Eurocode 2 Bagian 1-2 Tabel 5.5/5.6 (balok & pelat) dan 5.2a
 * (kolom), yang menjadi acuan SNI 2847 untuk hal ini.
 */
export const AXIS_MIN_MM: Record<ElemenApi, Record<TingkatApi, number>> = {
  /* Balok bertumpu sederhana, lebar ≥ 200 mm. */
  balok: { 30: 25, 60: 40, 90: 55, 120: 65, 180: 80, 240: 90 },
  /* Kolom terpapar api dari semua sisi. */
  kolom: { 30: 25, 60: 30, 90: 40, 120: 45, 180: 60, 240: 75 },
  /* Pelat satu/dua arah. */
  pelat: { 30: 10, 60: 20, 90: 30, 120: 40, 180: 55, 240: 65 },
  /* Dinding pemikul beban. */
  dinding: { 30: 10, 60: 10, 90: 20, 120: 25, 180: 40, 240: 55 },
}

/**
 * Dimensi MINIMUM penampang, mm.
 *
 * Selimut tebal tak menolong kalau penampangnya sendiri terlalu kecil: panas
 * masuk dari dua sisi dan bertemu di tengah. Balok selebar 100 mm tak bisa
 * mencapai 120 menit berapa pun selimutnya.
 */
export const DIMENSI_MIN_MM: Record<ElemenApi, Record<TingkatApi, number>> = {
  balok: { 30: 80, 60: 120, 90: 150, 120: 200, 180: 240, 240: 280 },
  kolom: { 30: 200, 60: 200, 90: 250, 120: 350, 180: 350, 240: 400 },
  pelat: { 30: 60, 60: 80, 90: 100, 120: 120, 180: 150, 240: 175 },
  dinding: { 30: 100, 60: 110, 90: 120, 120: 140, 180: 160, 240: 180 },
}

/**
 * Selimut MAKSIMUM yang masih wajar, mm.
 *
 * Selimut yang terlalu tebal mengurangi tinggi efektif penampang, jadi
 * kapasitas lenturnya turun — dan beton di luar tulangan itu retak lebih dulu
 * karena tak ada yang menahannya (spalling).
 */
export const AXIS_MAKS_WAJAR_MM = 100

export interface InputKetahananApi {
  elemen: ElemenApi
  /** Tingkat ketahanan api yang DIMINTA peraturan, menit. */
  tingkatDimintaMenit: TingkatApi
  /** Selimut beton BERSIH (permukaan → sengkang), mm. */
  selimutBersihMm: number
  /** Diameter sengkang, mm. Nol untuk pelat/dinding tanpa sengkang. */
  dSengkangMm: number
  /** Diameter tulangan utama, mm. */
  dUtamaMm: number
  /**
   * Dimensi terkecil penampang, mm.
   *
   * Balok → lebar badan. Kolom → sisi terpendek. Pelat/dinding → tebalnya.
   */
  dimensiTerkecilMm: number
}

export interface HasilKetahananApi {
  periksa: Periksa[]
  aman: boolean
  catatan: string[]
  antara: {
    /** Jarak permukaan → PUSAT tulangan yang sesungguhnya, mm. */
    axisMm: number
    /** Axis distance yang disyaratkan untuk tingkat itu, mm. */
    axisMinMm: number
    /** Dimensi minimum yang disyaratkan, mm. */
    dimensiMinMm: number
    /**
     * Tingkat ketahanan api yang SESUNGGUHNYA tercapai, menit.
     * Nol bila di bawah tingkat terendah (30 menit).
     */
    tercapaiMenit: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Tingkat api tertinggi yang dipenuhi oleh axis distance & dimensi tertentu.
 *
 * DIPISAH supaya bisa diuji sebagai angka, dan supaya layar bisa menyatakan
 * "yang tercapai 60 menit" — bukan cuma "kurang". Yang membaca perlu tahu
 * seberapa kurang.
 */
export function tingkatTercapai(
  elemen: ElemenApi, axisMm: number, dimensiMm: number,
): number {
  let tercapai = 0
  for (const t of TINGKAT_API) {
    if (axisMm >= AXIS_MIN_MM[elemen][t] && dimensiMm >= DIMENSI_MIN_MM[elemen][t]) {
      tercapai = t
    } else {
      break
    }
  }
  return tercapai
}

export function analisaKetahananApi(input: InputKetahananApi): HasilKetahananApi {
  const {
    elemen, tingkatDimintaMenit, selimutBersihMm, dSengkangMm, dUtamaMm,
    dimensiTerkecilMm,
  } = input

  if (!AXIS_MIN_MM[elemen]) {
    throw new Error(
      `Elemen "${elemen}" tak punya tabel ketahanan api. Yang ada: `
      + `${Object.keys(AXIS_MIN_MM).join(', ')}.`,
    )
  }
  if (!(TINGKAT_API as readonly number[]).includes(tingkatDimintaMenit)) {
    throw new Error(
      `Tingkat ketahanan api ${tingkatDimintaMenit} menit tak ada di tabel. `
      + `Yang ada: ${TINGKAT_API.join(', ')} menit. Angka ini datang dari `
      + 'peraturan bangunan, bukan dari perhitungan struktur.',
    )
  }
  positif('Selimut bersih', selimutBersihMm)
  positif('Ø tulangan utama', dUtamaMm)
  positif('Dimensi terkecil', dimensiTerkecilMm)
  if (!Number.isFinite(dSengkangMm) || dSengkangMm < 0) {
    throw new Error(`Ø sengkang harus angka >= 0 (diterima: ${dSengkangMm})`)
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  /*
    ── axis distance: permukaan beton → PUSAT tulangan utama.

    Inilah besaran yang dipakai tabel api, dan inilah yang selalu tertukar
    dengan selimut bersih di lapangan.
  */
  const axisMm = selimutBersihMm + dSengkangMm + dUtamaMm / 2
  const axisMinMm = AXIS_MIN_MM[elemen][tingkatDimintaMenit]
  const dimensiMinMm = DIMENSI_MIN_MM[elemen][tingkatDimintaMenit]
  const tercapaiMenit = tingkatTercapai(elemen, axisMm, dimensiTerkecilMm)

  periksa.push({
    nama: 'Tulangan terlindungi dari api',
    nilai: Math.round(axisMm * 10) / 10,
    syarat: axisMinMm,
    satuan: 'mm',
    aman: axisMm >= axisMinMm,
    rasio: Math.round((axisMinMm / Math.max(axisMm, 1e-9)) * 1e4) / 1e4,
    rumus: `a = selimut ${selimutBersihMm} + Ø sengkang ${dSengkangMm} `
      + `+ ½Ø utama ${dUtamaMm / 2} = ${axisMm.toFixed(1)} mm ≥ ${axisMinMm} mm `
      + `(${elemen}, ${tingkatDimintaMenit} menit — Eurocode 2 §5, acuan SNI 2847)`,
  })

  periksa.push({
    nama: 'Penampang cukup tebal menahan api',
    nilai: Math.round(dimensiTerkecilMm * 10) / 10,
    syarat: dimensiMinMm,
    satuan: 'mm',
    aman: dimensiTerkecilMm >= dimensiMinMm,
    rasio: Math.round((dimensiMinMm / Math.max(dimensiTerkecilMm, 1e-9)) * 1e4) / 1e4,
    rumus: `dimensi terkecil ≥ ${dimensiMinMm} mm (${elemen}, `
      + `${tingkatDimintaMenit} menit). Selimut tebal tak menolong bila `
      + 'penampangnya terlalu kecil — panas masuk dari dua sisi dan bertemu '
      + 'di tengah.',
  })

  /*
    ── Selimut yang TERLALU TEBAL juga merugikan.

    Bukan soal api melainkan soal kapasitas: selimut yang tebal mengurangi
    tinggi efektif, jadi kapasitas lenturnya turun. Betonnya sendiri juga
    lebih mudah terkelupas (spalling) karena tak ada tulangan yang
    menahannya.

    Dijadikan pemeriksaan terpisah supaya tak tertukar dengan yang di atas.
  */
  periksa.push({
    nama: 'Selimut tidak berlebihan',
    nilai: Math.round(axisMm * 10) / 10,
    syarat: AXIS_MAKS_WAJAR_MM,
    satuan: 'mm',
    aman: axisMm <= AXIS_MAKS_WAJAR_MM,
    rasio: Math.round((axisMm / AXIS_MAKS_WAJAR_MM) * 1e4) / 1e4,
    rumus: `a ≤ ${AXIS_MAKS_WAJAR_MM} mm — selimut berlebihan mengurangi `
      + 'tinggi efektif (kapasitas lentur turun) dan betonnya lebih mudah '
      + 'terkelupas karena tak ada tulangan yang menahannya.',
  })

  /* ── Catatan ───────────────────────────────────────────────────────────── */
  catatan.push(
    `Yang dipakai tabel api adalah AXIS DISTANCE (permukaan → PUSAT tulangan) `
    + `= ${axisMm.toFixed(1)} mm, BUKAN selimut bersih ${selimutBersihMm} mm. `
    + 'Keduanya selalu tertukar di lapangan: gambar kerja dan pengawasan '
    + 'memakai selimut bersih, tabel api memakai axis distance. Selisihnya di '
    + 'sini ' + (axisMm - selimutBersihMm).toFixed(1) + ' mm — cukup untuk '
    + 'menggeser satu tingkat penuh.',
  )

  if (tercapaiMenit >= tingkatDimintaMenit) {
    catatan.push(
      `Ketahanan api yang tercapai ${tercapaiMenit} menit, memenuhi `
      + `${tingkatDimintaMenit} menit yang diminta.`,
    )
  } else if (tercapaiMenit > 0) {
    catatan.push(
      `Ketahanan api yang tercapai hanya ${tercapaiMenit} menit, sementara `
      + `yang diminta ${tingkatDimintaMenit} menit. Bukan "hampir" — selisih `
      + 'setengah jam adalah selisih antara penghuni sempat keluar dan tidak.',
    )
  } else {
    catatan.push(
      'Ketahanan api TIDAK MENCAPAI tingkat terendah (30 menit). Pada '
      + 'kebakaran ruangan biasa, tulangan mencapai 550 °C — suhu tempat baja '
      + 'kehilangan lebih dari separuh kekuatannya — dalam waktu sekitar '
      + 'sepuluh menit.',
    )
  }

  catatan.push(
    'Ketahanan api DITENTUKAN SAAT TULANGAN DIIKAT, oleh tukang yang memasang '
    + 'beton decking. Kalau deckingnya kurang atau tergeser saat pengecoran, '
    + 'tak ada cara memperbaikinya selain membongkar — ini bukan hal yang '
    + 'bisa ditambahkan sesudah bangunan berdiri.',
  )
  catatan.push(
    'Metode TABULASI (Eurocode 2 §5, acuan SNI 2847): ketahanan api dari '
    + 'dimensi dan selimut saja. Cukup untuk perencanaan dan untuk memenuhi '
    + 'persyaratan bangunan; TIDAK cukup untuk bangunan yang butuh analisa '
    + 'kebakaran sesungguhnya — rumah sakit, gedung tinggi, pabrik berbahan '
    + 'mudah terbakar.',
  )
  catatan.push(
    'Yang BELUM diperiksa: pengelupasan beton eksplosif (spalling) pada beton '
    + 'mutu tinggi dan beton basah, kebakaran yang lebih panas daripada kurva '
    + 'standar ISO 834 (bahan bakar cair), ketahanan api sambungan dan '
    + 'tumpuan, serta lapisan pelindung tambahan (vermikulit, gipsum, cat '
    + 'intumesen) yang bisa menaikkan tingkatnya tanpa menambah selimut.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    catatan,
    antara: {
      axisMm: Math.round(axisMm * 100) / 100,
      axisMinMm,
      dimensiMinMm,
      tercapaiMenit,
    },
  }
}
