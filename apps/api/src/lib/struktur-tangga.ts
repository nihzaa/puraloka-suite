// TANGGA BETON — pelat miring, anak tangga, bordes. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA TANGGA TIDAK BISA MEMAKAI `analisaPlat` ATAU `analisaBalok`
// ══════════════════════════════════════════════════════════════════════════════
//
// Tangga adalah pelat satu arah, dan sekilas `analisaPlat` cukup. Tiga hal
// membuatnya tidak:
//
//   1. **Pelatnya MIRING, bebannya VERTIKAL.** Berat sendiri bekerja tegak
//      lurus bumi, tetapi pelatnya membentang miring. Panjang miring selalu
//      lebih besar daripada bentang datar — pada kemiringan 30° selisihnya
//      15,5%. Menghitung tangga sebagai pelat datar sepanjang proyeksinya
//      kekurangan beban DAN kekurangan beton.
//
//   2. **Anak tangganya bagian dari beban, bukan hiasan.** Segitiga beton di
//      atas pelat miring menambah berat yang tak kecil: pada optrede 175 mm
//      dan antrede 280 mm, tambahannya ~2,1 kN/m² — sekitar sepertiga berat
//      pelat 120 mm. Melewatkannya membuat tangga terhitung lebih ringan
//      daripada kenyataannya.
//
//   3. **Beban hidupnya paling besar di seluruh bangunan.** SNI 1727 menuntut
//      **4,79 kN/m²** untuk tangga bangunan umum — hampir dua kali lipat
//      hunian (1,92). Tangga yang dihitung dengan beban lantai biasa lolos di
//      atas kertas dan melendut di lapangan.
//
// ── Kenyamanan yang bukan soal selera
//
// Rumus Blondel — 2·optrede + antrede ≈ 600–650 mm — bukan estetika melainkan
// panjang langkah manusia. Tangga di luar rentang itu membuat orang tersandung,
// dan itu penyebab kecelakaan rumah tangga yang paling sering. Diperiksa di
// sini karena inilah satu-satunya tempat yang menghitung optrede dan antrede.
//
// ── Yang TIDAK dihitung di sini
//
// Tangga dianggap bertumpu SEDERHANA pada kedua ujungnya (bordes/balok).
// Tangga kantilever, tangga putar (spiral), dan tangga dengan bordes
// menggantung butuh model lain — disebutkan di `catatan`, bukan didiamkan.
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON } from './struktur-beton.js'
import type { HasilElemen, Periksa, VolumeElemen, BarisBesi } from './struktur-beton.js'

/** Berat volume beton bertulang, kN/m³ — SNI 1727. */
export const BERAT_BETON_KN_M3 = 24

/**
 * Beban hidup tangga, kN/m². SNI 1727 Tabel 4.3-1.
 *
 * `umum` (4,79) untuk tangga yang dipakai orang banyak: kantor, sekolah,
 * ruko, apartemen. `hunian` (1,92) HANYA untuk tangga dalam satu rumah
 * tinggal. Salah pilih di sini melipatgandakan atau membagi dua bebannya.
 */
export const BEBAN_HIDUP_KN_M2 = {
  umum: 4.79,
  hunian: 1.92,
} as const

export type PemakaianTangga = keyof typeof BEBAN_HIDUP_KN_M2

/** Beban mati tambahan: keramik + spesi + railing, kN/m². Praktik lapangan. */
export const FINISHING_KN_M2 = 1.2

/** Rentang Blondel: 2·optrede + antrede, mm. */
export const BLONDEL_MIN = 600
export const BLONDEL_MAKS = 650

/** Batas praktis optrede (tinggi anak tangga), mm. */
export const OPTREDE_MIN = 150
export const OPTREDE_MAKS = 200

/** Antrede (lebar injakan) minimum, mm — telapak kaki dewasa. */
export const ANTREDE_MIN = 250

export interface InputTangga {
  /** Tebal pelat tangga (tegak lurus bidang miring), mm. */
  tebalPelatMm: number
  /** Lebar tangga, m. */
  lebarM: number
  /** Tinggi antar lantai yang ditempuh satu flight, m. */
  tinggiM: number
  /** Optrede — tinggi satu anak tangga, mm. */
  optredeMm: number
  /** Antrede — lebar injakan, mm. */
  antredeMm: number
  selimutMm: number
  /** Diameter tulangan utama (memanjang, arah bentang), mm. */
  dUtamaMm: number
  /** Jarak tulangan utama, mm. */
  jarakUtamaMm: number
  /** Diameter tulangan bagi (melintang), mm. */
  dBagiMm: number
  /** Jarak tulangan bagi, mm. */
  jarakBagiMm: number
  mutu: { fcMpa: number; fyMpa: number }
  pemakaian: PemakaianTangga
  /** Panjang bordes datar, m. Nol bila tangga lurus tanpa bordes. */
  panjangBordesM?: number
  jumlah?: number
}

export interface HasilTangga extends HasilElemen {
  geometri: {
    /** Jumlah anak tangga (naik). */
    jumlahOptrede: number
    /** Panjang datar (proyeksi horizontal), m. */
    panjangDatarM: number
    /** Panjang MIRING pelat, m — inilah bentang sesungguhnya. */
    panjangMiringM: number
    kemiringanDerajat: number
    /** 2·optrede + antrede, mm — rumus Blondel. */
    blondelMm: number
  }
  beban: {
    pelatKnPerM2: number
    anakTanggaKnPerM2: number
    finishingKnPerM2: number
    hidupKnPerM2: number
    /** Beban terfaktor per meter lebar, kN/m. */
    wuKnPerM: number
    muKnm: number
    vuKn: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

const BETA1 = (fc: number) => (fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7))

/**
 * Analisa tangga beton.
 *
 * Bentangnya PANJANG MIRING, bukan proyeksi datar — lihat kepala berkas.
 */
export function analisaTangga(input: InputTangga): HasilTangga {
  const {
    tebalPelatMm, lebarM, tinggiM, optredeMm, antredeMm,
    selimutMm, dUtamaMm, jarakUtamaMm, dBagiMm, jarakBagiMm,
    mutu, pemakaian,
  } = input

  positif('tebal pelat', tebalPelatMm)
  positif('lebar', lebarM)
  positif('tinggi', tinggiM)
  positif('optrede', optredeMm)
  positif('antrede', antredeMm)
  positif('d tulangan utama', dUtamaMm)
  positif('jarak tulangan utama', jarakUtamaMm)
  positif("f'c", mutu.fcMpa)
  positif('fy', mutu.fyMpa)

  const bebanHidup = BEBAN_HIDUP_KN_M2[pemakaian]
  if (!bebanHidup) throw new Error(`pemakaian tangga tak dikenal: ${pemakaian}`)

  const catatan: string[] = []
  const periksa: Periksa[] = []

  // ── Geometri ─────────────────────────────────────────────────────────────
  /*
    Jumlah optrede DIBULATKAN KE ATAS, lalu optrede sesungguhnya dihitung ulang
    dari tinggi ÷ jumlah. Tangga tak boleh punya anak tangga terakhir yang
    tingginya berbeda — itu penyebab tersandung yang paling sering, dan orang
    yang menuruni tangga tidak melihat kakinya.
  */
  const jumlahOptrede = Math.ceil((tinggiM * 1000) / optredeMm)
  const optredeNyataMm = (tinggiM * 1000) / jumlahOptrede
  const panjangDatarM = ((jumlahOptrede - 1) * antredeMm) / 1000
  const panjangMiringM = Math.sqrt(panjangDatarM ** 2 + tinggiM ** 2)
  const kemiringanDerajat = Math.atan2(tinggiM, panjangDatarM) * 180 / Math.PI
  const blondelMm = 2 * optredeNyataMm + antredeMm

  if (Math.abs(optredeNyataMm - optredeMm) > 1) {
    catatan.push(
      `Optrede disesuaikan dari ${optredeMm} mm jadi ${optredeNyataMm.toFixed(1)} mm `
      + `supaya ${jumlahOptrede} anak tangga tepat mencapai tinggi ${tinggiM} m. `
      + 'Anak tangga terakhir yang tingginya berbeda adalah penyebab tersandung '
      + 'paling sering — orang yang menuruni tangga tidak melihat kakinya.',
    )
  }

  // ── Kenyamanan (Blondel) ─────────────────────────────────────────────────
  periksa.push({
    nama: 'Langkah nyaman (Blondel)',
    nilai: Math.round(blondelMm * 10) / 10,
    syarat: BLONDEL_MAKS,
    satuan: 'mm',
    aman: blondelMm >= BLONDEL_MIN && blondelMm <= BLONDEL_MAKS,
    /*
      `rasio` diukur terhadap batas ATAS. Rentang dua sisi tak punya rasio
      tunggal yang jujur; yang dipilih arah yang lebih sering dilanggar —
      tangga terlalu curam (blondel kecil) maupun terlalu landai keduanya
      salah, tetapi curam yang melukai orang.
    */
    rasio: Math.round((blondelMm / BLONDEL_MAKS) * 1e4) / 1e4,
    rumus: `2·optrede + antrede harus ${BLONDEL_MIN}–${BLONDEL_MAKS} mm (Blondel)`,
  })
  if (blondelMm < BLONDEL_MIN || blondelMm > BLONDEL_MAKS) {
    catatan.push(
      `2·optrede + antrede = ${blondelMm.toFixed(0)} mm, di luar rentang `
      + `${BLONDEL_MIN}–${BLONDEL_MAKS} mm. Ini bukan soal selera: rentang itu `
      + 'panjang langkah manusia, dan tangga di luarnya membuat orang '
      + 'tersandung — penyebab kecelakaan rumah tangga yang paling sering.',
    )
  }

  periksa.push({
    nama: 'Tinggi anak tangga',
    nilai: Math.round(optredeNyataMm * 10) / 10,
    syarat: OPTREDE_MAKS,
    satuan: 'mm',
    aman: optredeNyataMm >= OPTREDE_MIN && optredeNyataMm <= OPTREDE_MAKS,
    rasio: Math.round((optredeNyataMm / OPTREDE_MAKS) * 1e4) / 1e4,
    rumus: `optrede wajar ${OPTREDE_MIN}–${OPTREDE_MAKS} mm`,
  })

  periksa.push({
    nama: 'Lebar injakan',
    nilai: antredeMm,
    syarat: ANTREDE_MIN,
    satuan: 'mm',
    aman: antredeMm >= ANTREDE_MIN,
    rasio: Math.round((ANTREDE_MIN / antredeMm) * 1e4) / 1e4,
    rumus: `antrede ≥ ${ANTREDE_MIN} mm — telapak kaki dewasa`,
  })

  // ── Beban ────────────────────────────────────────────────────────────────
  /*
    Berat pelat dihitung pada bidang MIRING lalu diproyeksikan ke bidang datar
    dengan membaginya cos(θ) — karena bebannya bekerja vertikal sementara
    luasnya miring. Melewatkan ini kekurangan beban sebesar 1/cos θ, yaitu
    15,5% pada 30°.
  */
  const cosTheta = panjangDatarM / panjangMiringM
  const pelatKnPerM2 = (tebalPelatMm / 1000) * BERAT_BETON_KN_M3 / cosTheta

  /*
    Anak tangga = prisma segitiga di atas pelat. Luas segitiga per anak =
    ½·optrede·antrede, dan per meter datar ada 1/antrede buah — jadi tebal
    rata-ratanya ½·optrede. Bukan pendekatan kasar: itu hasil eksak untuk
    segitiga siku-siku yang berulang.
  */
  const anakTanggaKnPerM2 = (optredeNyataMm / 1000 / 2) * BERAT_BETON_KN_M3

  const matiKnPerM2 = pelatKnPerM2 + anakTanggaKnPerM2 + FINISHING_KN_M2
  const wuKnPerM2 = 1.2 * matiKnPerM2 + 1.6 * bebanHidup
  const wuKnPerM = wuKnPerM2 * 1     // per METER LEBAR

  /*
    Tumpuan SEDERHANA (wL²/8) memakai bentang MIRING.

    Tangga umumnya bertumpu pada bordes dan balok lantai yang tak menjepitnya
    penuh. Memakai wL²/12 di sini akan mengurangi momen 33% berdasarkan
    kekangan yang belum tentu ada — arah yang salah untuk elemen yang
    kegagalannya melukai orang.
  */
  const muKnm = (wuKnPerM * panjangMiringM ** 2) / 8
  const vuKn = (wuKnPerM * panjangMiringM) / 2

  // ── Lentur ───────────────────────────────────────────────────────────────
  const d = tebalPelatMm - selimutMm - dUtamaMm / 2
  if (d <= 0) throw new Error('Tebal pelat terlalu kecil untuk selimut dan tulangan yang diminta')

  const asPerM = (Math.PI / 4) * dUtamaMm ** 2 * (1000 / jarakUtamaMm)
  const a = (asPerM * mutu.fyMpa) / (0.85 * mutu.fcMpa * 1000)
  const phiMn = 0.9 * asPerM * mutu.fyMpa * (d - a / 2) / 1e6   // kNm per meter

  periksa.push({
    /*
      Dinamai 'Lentur', sama dengan balok/pelat/footplat/pilecap — BUKAN
      'Kapasitas lentur'.

      Nama pemeriksaan adalah kunci kamus terjemahan awam. Dua nama untuk
      pemeriksaan yang sama berarti dua entri kamus yang akan berpisah maknanya
      saat salah satunya diperbaiki, dan pembaca layar melihat dua istilah
      berbeda untuk hal yang persis sama.
    */
    nama: 'Lentur',
    nilai: Math.round(phiMn * 100) / 100,
    syarat: Math.round(muKnm * 100) / 100,
    satuan: 'kNm/m',
    aman: phiMn >= muKnm,
    rasio: phiMn > 0 ? Math.round((muKnm / phiMn) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn ≥ Mu — pelat tangga arah memanjang',
  })

  // ── Tulangan minimum ─────────────────────────────────────────────────────
  /*
    SNI 2847 §7.6.1.1: pelat butuh As minimum susut & suhu 0,0018·b·h untuk
    fy 420. Ini yang mengendalikan pada tangga tipis, bukan lentur.
  */
  const asMin = 0.0018 * 1000 * tebalPelatMm
  periksa.push({
    nama: 'Tulangan minimum',
    nilai: Math.round(asPerM),
    syarat: Math.round(asMin),
    satuan: 'mm²/m',
    aman: asPerM >= asMin,
    rasio: asPerM > 0 ? Math.round((asMin / asPerM) * 1e4) / 1e4 : Infinity,
    rumus: 'As ≥ 0,0018·b·h (SNI 2847 §7.6.1.1)',
  })

  // ── Geser ────────────────────────────────────────────────────────────────
  const phiVc = 0.75 * 0.17 * Math.sqrt(mutu.fcMpa) * 1000 * d / 1000   // kN per meter
  periksa.push({
    nama: 'Kapasitas geser beton',
    nilai: Math.round(phiVc * 100) / 100,
    syarat: Math.round(vuKn * 100) / 100,
    satuan: 'kN/m',
    aman: phiVc >= vuKn,
    rasio: phiVc > 0 ? Math.round((vuKn / phiVc) * 1e4) / 1e4 : Infinity,
    rumus: "φVc = 0,75·0,17·√f'c·b·d — pelat tangga tanpa sengkang",
  })

  // ── Tebal minimum ────────────────────────────────────────────────────────
  /*
    SNI 2847 Tabel 7.3.1.1: pelat satu arah tertumpu sederhana butuh h ≥ L/20
    supaya lendutannya tak perlu dihitung. Bentangnya panjang MIRING.
  */
  const tebalMinMm = (panjangMiringM * 1000) / 20
  periksa.push({
    nama: 'Tebal minimum (lendutan)',
    nilai: tebalPelatMm,
    syarat: Math.round(tebalMinMm),
    satuan: 'mm',
    aman: tebalPelatMm >= tebalMinMm,
    rasio: Math.round((tebalMinMm / tebalPelatMm) * 1e4) / 1e4,
    rumus: 'h ≥ L/20 dengan L = panjang MIRING (SNI 2847 Tabel 7.3.1.1)',
  })

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const bordesM = input.panjangBordesM ?? 0

  /* Pelat miring + anak tangga (segitiga) + bordes datar. */
  const betonPelatM3 = panjangMiringM * lebarM * (tebalPelatMm / 1000)
  const betonAnakM3 = (optredeNyataMm / 1000) * (antredeMm / 1000) / 2
    * (jumlahOptrede - 1) * lebarM
  const betonBordesM3 = bordesM * lebarM * (tebalPelatMm / 1000)
  const betonM3 = (betonPelatM3 + betonAnakM3 + betonBordesM3) * jumlah

  /*
    Bekisting tangga: bidang bawah pelat miring + dua sisi + papan tegak anak
    tangga. Bidang atas TIDAK dibekisting (dicor terbuka), tetapi papan tegak
    tiap optrede iya — dan itu yang membuat bekisting tangga jauh lebih mahal
    per m³ beton daripada pelat biasa.
  */
  const bekistingM2 = (
    panjangMiringM * lebarM                              // bidang bawah
    + 2 * panjangMiringM * (tebalPelatMm / 1000)         // dua sisi
    + (jumlahOptrede - 1) * (optredeNyataMm / 1000) * lebarM  // papan tegak
    + bordesM * lebarM                                    // bawah bordes
  ) * jumlah

  const luasM2 = panjangMiringM * lebarM + bordesM * lebarM
  const beratPerM = (dMm: number) => 0.0061654 * dMm * dMm

  const nUtama = Math.ceil((lebarM * 1000) / jarakUtamaMm) + 1
  const nBagi = Math.ceil(((panjangMiringM + bordesM) * 1000) / jarakBagiMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm,
      jumlahBatang: nUtama * jumlah,
      panjangPerBatangM: panjangMiringM + bordesM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nUtama * jumlah * (panjangMiringM + bordesM) * beratPerM(dUtamaMm),
      peran: 'utama',
    },
    {
      tipe: 'BjTP', diameterMm: dBagiMm,
      jumlahBatang: nBagi * jumlah,
      panjangPerBatangM: lebarM,
      beratKgPerM: beratPerM(dBagiMm),
      totalKg: nBagi * jumlah * lebarM * beratPerM(dBagiMm),
      peran: 'bagi',
    },
  ]

  const besiBulat = besi.map((b) => ({ ...b, totalKg: Math.round(b.totalKg * 1e4) / 1e4 }))
  const volume: VolumeElemen = {
    betonM3: Math.round(betonM3 * 1e4) / 1e4,
    bekistingM2: Math.round(bekistingM2 * 1e4) / 1e4,
    besi: besiBulat,
    besiTotalKg: Math.round(besiBulat.reduce((x, b) => x + b.totalKg, 0) * 1e4) / 1e4,
    /*
      Berat sendiri memakai RHO_BETON (2.400 kg/m³, kerapatan), BUKAN 24 kN/m³
      (berat jenis). Keduanya besaran yang sama dibagi g — menukarnya
      menghasilkan angka yang meleset ~10×, dan kolom "berat sendiri" yang
      dipakai memeriksa pembebanan jadi tak berarti.

      Konstantanya DIIMPOR, tidak ditulis ulang: dua sumber untuk angka yang
      sama akan berpisah diam-diam saat salah satunya dikoreksi.
    */
    beratSendiriKg: Math.round(betonM3 * RHO_BETON * 1e4) / 1e4,
  }

  catatan.push(
    `Bentang yang dipakai PANJANG MIRING ${panjangMiringM.toFixed(3)} m, bukan `
    + `proyeksi datar ${panjangDatarM.toFixed(3)} m (kemiringan `
    + `${kemiringanDerajat.toFixed(1)}°). Menghitung tangga sebagai pelat datar `
    + 'kekurangan beban sekaligus kekurangan beton.',
  )
  catatan.push(
    `Beban hidup ${bebanHidup} kN/m² dipakai (${pemakaian}). Tangga bangunan `
    + 'umum menuntut 4,79 kN/m² — hampir dua kali lipat hunian. Tangga yang '
    + 'dihitung dengan beban lantai biasa lolos di atas kertas dan melendut di '
    + 'lapangan.',
  )
  catatan.push(
    'Tangga dianggap bertumpu SEDERHANA pada kedua ujungnya. Tangga kantilever, '
    + 'tangga putar, dan bordes menggantung butuh model lain yang belum ada di '
    + 'aplikasi ini.',
  )
  catatan.push(
    'Volume besi belum termasuk panjang penyaluran, kait, dan tulangan tambahan '
    + 'di lipatan (tempat pelat berbelok arah) — di titik itu tulangan tarik '
    + 'harus diteruskan menembus, dan pembesian nyatanya lebih besar.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      jumlahOptrede,
      optredeNyataMm: Math.round(optredeNyataMm * 100) / 100,
      panjangMiringM: Math.round(panjangMiringM * 1e4) / 1e4,
      kemiringanDerajat: Math.round(kemiringanDerajat * 100) / 100,
      luasM2: Math.round(luasM2 * 1e4) / 1e4,
      dMm: Math.round(d * 100) / 100,
      asPerM: Math.round(asPerM * 100) / 100,
      beta1: BETA1(mutu.fcMpa),
    },
    catatan,
    geometri: {
      jumlahOptrede,
      panjangDatarM: Math.round(panjangDatarM * 1e4) / 1e4,
      panjangMiringM: Math.round(panjangMiringM * 1e4) / 1e4,
      kemiringanDerajat: Math.round(kemiringanDerajat * 100) / 100,
      blondelMm: Math.round(blondelMm * 10) / 10,
    },
    beban: {
      pelatKnPerM2: Math.round(pelatKnPerM2 * 1e4) / 1e4,
      anakTanggaKnPerM2: Math.round(anakTanggaKnPerM2 * 1e4) / 1e4,
      finishingKnPerM2: FINISHING_KN_M2,
      hidupKnPerM2: bebanHidup,
      wuKnPerM: Math.round(wuKnPerM * 1e4) / 1e4,
      muKnm: Math.round(muKnm * 1e4) / 1e4,
      vuKn: Math.round(vuKn * 1e4) / 1e4,
    },
  }
}
