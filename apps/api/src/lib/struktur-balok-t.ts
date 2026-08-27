// BALOK T / BALOK ANAK — penampang T dengan flens efektif. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BALOK YANG MENYATU DENGAN PELAT TIDAK BOLEH DIHITUNG SEBAGAI PERSEGI
// ══════════════════════════════════════════════════════════════════════════════
//
// Hampir semua balok lantai beton dicor MENYATU dengan pelat di atasnya. Saat
// balok melengkung ke bawah, bagian atas tertekan — dan yang tertekan bukan
// hanya lebar baloknya, melainkan sepotong pelat di kiri-kanannya ikut bekerja.
// Itulah penampang T.
//
// Menghitungnya sebagai persegi selebar baloknya saja KONSERVATIF untuk momen
// positif — kapasitas nyatanya lebih besar. Tetapi konservatif di sini punya
// harga: balok anak 200×400 yang sebenarnya cukup akan "gagal" di atas kertas
// dan diperbesar jadi 250×500, pada SETIAP balok anak di proyek. Pada rumah
// dua lantai itu belasan balok.
//
// ── Yang justru BERBAHAYA
//
// Arah sebaliknya berbahaya: pada momen NEGATIF (di atas tumpuan), flens
// berada di sisi TARIK dan tidak membantu sama sekali — penampangnya kembali
// jadi persegi selebar badan. Modul yang menganggap flens selalu membantu
// melebihkan kapasitas di tempat yang justru paling kritis.
//
// Karena itu modul ini menghitung DUA kondisi terpisah dan melaporkan
// keduanya, bukan mengambil yang menguntungkan.
//
// ── Lebar flens efektif — SNI 2847:2019 §6.3.2.1
//
// Tidak seluruh pelat ikut bekerja; hanya sepotong di dekat balok. Yang
// menentukan nilai TERKECIL dari tiga:
//
//     be ≤ bw + 2·(8·hf)         ← 8 kali tebal pelat tiap sisi
//     be ≤ bw + 2·(Ln/8)         ← seperdelapan bentang bersih tiap sisi
//     be ≤ jarak as-as balok     ← tak boleh tumpang tindih dengan balok sebelah
//
// Memakai yang terbesar (atau lupa membatasi) melebihkan kapasitas lentur —
// dan kelebihannya tak terlihat karena hasilnya tetap "aman".
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON } from './struktur-beton.js'
import type { HasilElemen, Periksa, VolumeElemen, BarisBesi } from './struktur-beton.js'

/** β₁ — SNI 2847:2019 §22.2.2.4.3. */
export function beta1(fcMpa: number): number {
  if (fcMpa <= 28) return 0.85
  return Math.max(0.65, 0.85 - 0.05 * (fcMpa - 28) / 7)
}

export interface InputBalokT {
  /** Lebar badan (web), mm. */
  bwMm: number
  /** Tinggi total balok termasuk pelat, mm. */
  hMm: number
  /** Tebal pelat (flens), mm. */
  hfMm: number
  /** Bentang BERSIH balok, m. */
  bentangBersihM: number
  /** Jarak as-as ke balok sebelah, m. Membatasi flens efektif. */
  jarakAsAsM: number
  /**
   * Balok TEPI hanya punya pelat di satu sisi.
   *
   * Flens efektifnya kira-kira separuh — dan balok tepi yang dihitung sebagai
   * balok tengah melebihkan kapasitas justru pada balok yang paling sering
   * memikul dinding luar.
   */
  balokTepi?: boolean
  selimutMm: number
  dUtamaMm: number
  /** Jumlah tulangan tarik (bawah) untuk momen positif. */
  nTarik: number
  /** Jumlah tulangan atas untuk momen negatif di tumpuan. */
  nAtas: number
  dSengkangMm: number
  jarakSengkangMm: number
  mutu: { fcMpa: number; fyMpa: number }
  /** Momen positif rencana (lapangan), kNm. */
  muPositifKnm: number
  /** Momen negatif rencana (tumpuan), kNm. Nol bila tumpuan sederhana. */
  muNegatifKnm: number
  vuKn: number
  jumlah?: number
}

export interface HasilBalokT extends HasilElemen {
  flens: {
    /** Lebar flens efektif yang dipakai, mm. */
    beMm: number
    /** Batas mana yang menentukan — supaya bisa diperiksa. */
    penentu: string
    batasTebalMm: number
    batasBentangMm: number
    batasJarakMm: number
  }
  kapasitas: {
    /** φMn momen positif dengan flens tertekan, kNm. */
    phiMnPositifKnm: number
    /** φMn momen negatif — flens di sisi TARIK, penampang jadi persegi. */
    phiMnNegatifKnm: number
    /** Apakah blok tekan masih di dalam flens? */
    blokDiFlens: boolean
    aMm: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Analisa balok T / balok anak.
 *
 * Momen positif memakai penampang T; momen negatif memakai persegi selebar
 * badan. Keduanya dilaporkan — bukan diambil yang menguntungkan.
 */
export function analisaBalokT(input: InputBalokT): HasilBalokT {
  const {
    bwMm, hMm, hfMm, bentangBersihM, jarakAsAsM,
    selimutMm, dUtamaMm, nTarik, nAtas, dSengkangMm, jarakSengkangMm,
    mutu, muPositifKnm, muNegatifKnm, vuKn,
  } = input

  positif('bw', bwMm)
  positif('h', hMm)
  positif('hf (tebal pelat)', hfMm)
  positif('bentang bersih', bentangBersihM)
  positif('jarak as-as', jarakAsAsM)
  positif('d tulangan utama', dUtamaMm)
  positif('jarak sengkang', jarakSengkangMm)
  positif("f'c", mutu.fcMpa)
  positif('fy', mutu.fyMpa)
  if (nTarik < 2) throw new Error('nTarik minimal 2 batang')
  if (nAtas < 2) throw new Error('nAtas minimal 2 batang — sengkang harus digantung')
  if (hfMm >= hMm) {
    throw new Error(
      `Tebal pelat (${hfMm} mm) ≥ tinggi balok (${hMm} mm) — ini bukan balok T, `
      + 'melainkan pelat. Periksa masukannya.',
    )
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []
  const b1 = beta1(mutu.fcMpa)

  // ── Lebar flens efektif (SNI 2847 §6.3.2.1) ──────────────────────────────
  const sisi = input.balokTepi ? 1 : 2
  const batasTebalMm = bwMm + sisi * (8 * hfMm)
  const batasBentangMm = bwMm + sisi * ((bentangBersihM * 1000) / 8)
  const batasJarakMm = input.balokTepi
    ? bwMm + (jarakAsAsM * 1000 - bwMm) / 2
    : jarakAsAsM * 1000

  const beMm = Math.min(batasTebalMm, batasBentangMm, batasJarakMm)
  const penentu = beMm === batasTebalMm ? '8×tebal pelat'
    : beMm === batasBentangMm ? 'bentang/8'
      : 'jarak as-as balok'

  // ── Momen POSITIF: penampang T ───────────────────────────────────────────
  const d = hMm - selimutMm - dSengkangMm - dUtamaMm / 2
  if (d <= 0) throw new Error('Tinggi balok terlalu kecil untuk selimut dan tulangan')

  const asTarik = nTarik * (Math.PI / 4) * dUtamaMm ** 2

  /*
    Blok tekan dihitung dulu dengan anggapan seluruhnya di dalam FLENS
    (penampang persegi selebar be). Kalau ternyata a > hf, sebagian badan ikut
    tertekan dan rumusnya berubah — dan itu perbedaan yang nyata: balok dengan
    pelat tipis dan tulangan banyak jatuh ke kasus kedua.
  */
  const aPercobaan = (asTarik * mutu.fyMpa) / (0.85 * mutu.fcMpa * beMm)
  const blokDiFlens = aPercobaan <= hfMm

  let phiMnPositifKnm: number
  let aMm: number

  if (blokDiFlens) {
    aMm = aPercobaan
    phiMnPositifKnm = 0.9 * asTarik * mutu.fyMpa * (d - aMm / 2) / 1e6
  } else {
    /*
      Blok tekan menembus flens. Gaya tekan dipecah dua: flens yang menonjol
      (be − bw) setinggi hf, dan badan selebar bw setinggi a.
    */
    const asf = (0.85 * mutu.fcMpa * (beMm - bwMm) * hfMm) / mutu.fyMpa
    const asw = asTarik - asf
    if (asw <= 0) {
      throw new Error('Perhitungan flens tak konsisten — periksa lebar flens dan tulangan')
    }
    aMm = (asw * mutu.fyMpa) / (0.85 * mutu.fcMpa * bwMm)
    phiMnPositifKnm = 0.9 * (
      asf * mutu.fyMpa * (d - hfMm / 2) + asw * mutu.fyMpa * (d - aMm / 2)
    ) / 1e6
    catatan.push(
      `Blok tekan (${aMm.toFixed(1)} mm) MENEMBUS tebal pelat (${hfMm} mm), jadi `
      + 'sebagian badan balok ikut tertekan. Kapasitasnya dihitung dengan '
      + 'memecah gaya tekan jadi bagian flens dan bagian badan — bukan rumus '
      + 'persegi biasa.',
    )
  }

  periksa.push({
    nama: 'Lentur',
    nilai: Math.round(phiMnPositifKnm * 100) / 100,
    syarat: Math.round(muPositifKnm * 100) / 100,
    satuan: 'kNm',
    aman: phiMnPositifKnm >= muPositifKnm,
    rasio: phiMnPositifKnm > 0 ? Math.round((muPositifKnm / phiMnPositifKnm) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn ≥ Mu (momen POSITIF, penampang T — flens tertekan)',
  })

  // ── Momen NEGATIF: penampang PERSEGI selebar badan ───────────────────────
  /*
    Di atas tumpuan, flens berada di sisi TARIK dan TIDAK membantu sama sekali.
    Modul yang menganggap flens selalu membantu melebihkan kapasitas di tempat
    yang justru paling kritis — dan retak di atas tumpuan adalah yang paling
    sulit diperbaiki sesudah lantai dicor.
  */
  const asAtas = nAtas * (Math.PI / 4) * dUtamaMm ** 2
  const aNeg = (asAtas * mutu.fyMpa) / (0.85 * mutu.fcMpa * bwMm)
  const phiMnNegatifKnm = 0.9 * asAtas * mutu.fyMpa * (d - aNeg / 2) / 1e6

  if (muNegatifKnm > 0) {
    periksa.push({
      nama: 'Lentur negatif (tumpuan)',
      nilai: Math.round(phiMnNegatifKnm * 100) / 100,
      syarat: Math.round(muNegatifKnm * 100) / 100,
      satuan: 'kNm',
      aman: phiMnNegatifKnm >= muNegatifKnm,
      rasio: phiMnNegatifKnm > 0 ? Math.round((muNegatifKnm / phiMnNegatifKnm) * 1e4) / 1e4 : Infinity,
      rumus: 'φMn ≥ Mu⁻ — flens di sisi TARIK, penampang jadi PERSEGI selebar bw',
    })
  }

  // ── Geser ────────────────────────────────────────────────────────────────
  /*
    Geser memakai lebar BADAN saja, bukan flens. Flens tak menyalurkan geser
    vertikal — memakai be di sini melebihkan kapasitas geser berkali lipat.
  */
  const phiVc = 0.75 * 0.17 * Math.sqrt(mutu.fcMpa) * bwMm * d / 1000
  const avPerS = (2 * (Math.PI / 4) * dSengkangMm ** 2) / jarakSengkangMm
  const phiVs = 0.75 * avPerS * mutu.fyMpa * d / 1000
  const phiVn = phiVc + phiVs

  periksa.push({
    nama: 'Geser',
    nilai: Math.round(phiVn * 100) / 100,
    syarat: Math.round(vuKn * 100) / 100,
    satuan: 'kN',
    aman: phiVn >= vuKn,
    rasio: phiVn > 0 ? Math.round((vuKn / phiVn) * 1e4) / 1e4 : Infinity,
    rumus: 'φ(Vc+Vs) ≥ Vu — memakai lebar BADAN bw, bukan flens',
  })

  // ── Tulangan minimum ─────────────────────────────────────────────────────
  const asMin = Math.max(
    (0.25 * Math.sqrt(mutu.fcMpa) / mutu.fyMpa) * bwMm * d,
    (1.4 / mutu.fyMpa) * bwMm * d,
  )
  periksa.push({
    nama: 'Tulangan minimum',
    nilai: Math.round(asTarik),
    syarat: Math.round(asMin),
    satuan: 'mm²',
    aman: asTarik >= asMin,
    rasio: asTarik > 0 ? Math.round((asMin / asTarik) * 1e4) / 1e4 : Infinity,
    rumus: 'As ≥ max(0,25√f\'c/fy, 1,4/fy)·bw·d (SNI 2847 §9.6.1.2)',
  })

  // ── Volume ───────────────────────────────────────────────────────────────
  /*
    Volume beton menghitung BADAN saja — flens sudah masuk volume pelat lantai.
    Menghitungnya penuh berarti beton pelat dihitung DUA KALI, dan RAB
    membengkak tanpa ada yang tahu dari mana.
  */
  const jumlah = input.jumlah ?? 1
  const tinggiBadanMm = hMm - hfMm
  const betonM3 = (bwMm / 1000) * (tinggiBadanMm / 1000) * bentangBersihM * jumlah

  /* Bekisting: dua sisi badan + dasar. Sisi atas menyatu dengan pelat. */
  const bekistingM2 = (
    2 * (tinggiBadanMm / 1000) * bentangBersihM + (bwMm / 1000) * bentangBersihM
  ) * jumlah

  const beratPerM = (dMm: number) => 0.0061654 * dMm * dMm
  const kelilingSengkangM = 2 * ((bwMm - 2 * selimutMm) + (hMm - 2 * selimutMm)) / 1000
  const nSengkang = Math.ceil((bentangBersihM * 1000) / jarakSengkangMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm,
      jumlahBatang: (nTarik + nAtas) * jumlah,
      panjangPerBatangM: bentangBersihM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: (nTarik + nAtas) * jumlah * bentangBersihM * beratPerM(dUtamaMm),
      peran: 'utama',
    },
    {
      tipe: 'BjTP', diameterMm: dSengkangMm,
      jumlahBatang: nSengkang * jumlah,
      panjangPerBatangM: kelilingSengkangM,
      beratKgPerM: beratPerM(dSengkangMm),
      totalKg: nSengkang * jumlah * kelilingSengkangM * beratPerM(dSengkangMm),
      peran: 'sengkang',
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
    `Lebar flens efektif ${Math.round(beMm)} mm ditentukan oleh "${penentu}" `
    + `(batas: 8×hf ${Math.round(batasTebalMm)} · Ln/8 ${Math.round(batasBentangMm)} `
    + `· as-as ${Math.round(batasJarakMm)} mm). Memakai yang terbesar melebihkan `
    + 'kapasitas lentur, dan kelebihannya tak terlihat karena hasilnya tetap "aman".',
  )
  catatan.push(
    'Momen NEGATIF di tumpuan dihitung sebagai penampang PERSEGI selebar badan '
    + '— flens berada di sisi tarik dan tidak membantu sama sekali. Modul yang '
    + 'menganggap flens selalu membantu melebihkan kapasitas justru di tempat '
    + 'paling kritis.',
  )
  catatan.push(
    'Volume beton menghitung BADAN saja; flens sudah masuk volume pelat lantai. '
    + 'Menghitungnya penuh berarti beton pelat dihitung DUA KALI.',
  )
  catatan.push(
    'Volume besi belum termasuk panjang penyaluran, kait, dan sambungan lewatan. '
    + 'Untuk RAP, pakai Bar Bending Schedule.',
  )
  if (input.balokTepi) {
    catatan.push(
      'Dihitung sebagai balok TEPI — pelat hanya di satu sisi, jadi flens '
      + 'efektifnya kira-kira separuh balok tengah.',
    )
  }

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      beMm: Math.round(beMm * 100) / 100,
      dMm: Math.round(d * 100) / 100,
      asTarik: Math.round(asTarik * 100) / 100,
      asAtas: Math.round(asAtas * 100) / 100,
      aMm: Math.round(aMm * 100) / 100,
      beta1: b1,
      phiVc: Math.round(phiVc * 100) / 100,
      phiVs: Math.round(phiVs * 100) / 100,
    },
    catatan,
    flens: {
      beMm: Math.round(beMm * 100) / 100,
      penentu,
      batasTebalMm: Math.round(batasTebalMm * 100) / 100,
      batasBentangMm: Math.round(batasBentangMm * 100) / 100,
      batasJarakMm: Math.round(batasJarakMm * 100) / 100,
    },
    kapasitas: {
      phiMnPositifKnm: Math.round(phiMnPositifKnm * 100) / 100,
      phiMnNegatifKnm: Math.round(phiMnNegatifKnm * 100) / 100,
      blokDiFlens,
      aMm: Math.round(aMm * 100) / 100,
    },
  }
}
