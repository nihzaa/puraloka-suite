// Pondasi pilecap (poer) di atas kelompok tiang pancang — SNI 2847.
//
// ══════════════════════════════════════════════════════════════════════════════
// Bagian dari mesin hitung struktur. Lihat `struktur-beton.ts` untuk alasan
// pola (pure, golden test vs workbook, verdict ber-angka).
//
// ── Yang membedakannya dari footplat
//
// Footplat bertumpu pada TANAH (tegangan menyebar merata/linier); pilecap
// bertumpu pada TIANG (beban terkumpul di titik-titik). Konsekuensinya beban
// per tiang dihitung dengan rumus Rivet:
//
//     Pᵢ = ΣP/n + Mux·xᵢ/Σx² + Muy·yᵢ/Σy²
//
// Tiang di sudut menanggung paling besar — dan itulah yang menentukan, bukan
// rata-ratanya. Memakai ΣP/n saja (kesalahan yang mudah dibuat pada grup
// bermomen) melewatkan tiang terkritis sepenuhnya.
// ══════════════════════════════════════════════════════════════════════════════

import {
  RHO_BETON, KOEF_BERAT_BESI,
  type MutuBahan, type Periksa, type VolumeElemen, type BarisBesi,
} from './struktur-beton'
import { ALPHA_S, type LetakKolom } from './struktur-footplat'

export interface InputPilecap {
  /** Jumlah tiang arah X. */
  nx: number
  /** Jumlah tiang arah Y. */
  ny: number
  /** Jarak antar tiang arah X, m. */
  dxM: number
  /** Jarak antar tiang arah Y, m. */
  dyM: number
  /** Jarak tiang terluar ke tepi pilecap arah X, m. */
  axM: number
  /** Jarak tiang terluar ke tepi pilecap arah Y, m. */
  ayM: number
  /** Diameter tiang, m. */
  diameterTiangM: number
  /** Lebar kolom arah X, m. */
  bxM: number
  /** Lebar kolom arah Y, m. */
  byM: number
  /** Tebal pilecap, m. */
  hM: number
  /** Tebal tanah di atas pilecap, m. */
  zM: number
  /** Berat volume tanah timbunan, kN/m³. */
  gammaTanahKnM3: number
  /** Berat volume beton, kN/m³. */
  gammaBetonKnM3?: number
  letakKolom: LetakKolom
  mutu: MutuBahan
  /** Selimut ke pusat tulangan, m. */
  dAksenM: number
  dTulanganMm: number
  jarakTulanganMm: number
  /** Beban aksial terfaktor dari kolom, kN. */
  pukKn: number
  /** Momen terfaktor arah X, kNm. */
  muxKnm: number
  /** Momen terfaktor arah Y, kNm. */
  muyKnm: number
  /** Daya dukung ijin SATU tiang, kN. Dari `struktur-tiang.ts`. */
  pIjinTiangKn: number
  jumlah?: number
}

/** Satu tiang beserta posisi & beban yang ditanggungnya. */
export interface TiangDalamGrup {
  indeks: number
  /** Posisi dari pusat grup, m. */
  xM: number
  yM: number
  /** Beban aksial yang ditanggung, kN. */
  puKn: number
}

export interface HasilPilecap {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  tiang: TiangDalamGrup[]
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Susunan tiang & beban per tiang (rumus Rivet).
 *
 * Koordinat diukur dari PUSAT grup — itu yang membuat Σx² benar tanpa perlu
 * memindahkan titik acuan. Grup simetris menghasilkan Σx dan Σy = 0, jadi
 * momen membagi beban secara berlawanan di kedua sisi.
 */
export function bebanPerTiang(input: InputPilecap): TiangDalamGrup[] {
  const { nx, ny, dxM, dyM, pukKn, muxKnm, muyKnm } = input
  const n = nx * ny

  const posisi: { xM: number; yM: number }[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      posisi.push({
        xM: (i - (nx - 1) / 2) * dxM,
        yM: (j - (ny - 1) / 2) * dyM,
      })
    }
  }

  const sumX2 = posisi.reduce((s, p) => s + p.xM * p.xM, 0)
  const sumY2 = posisi.reduce((s, p) => s + p.yM * p.yM, 0)

  return posisi.map((p, i) => ({
    indeks: i + 1,
    xM: p.xM,
    yM: p.yM,
    // Σx² = 0 terjadi bila nx = 1 (satu baris) — momen arah itu tak bisa
    // dilawan grup dan sukunya dihilangkan, bukan jadi Infinity.
    puKn: pukKn / n
      + (sumX2 > 0 ? muxKnm * p.xM / sumX2 : 0)
      + (sumY2 > 0 ? muyKnm * p.yM / sumY2 : 0),
  }))
}

export function analisaPilecap(input: InputPilecap): HasilPilecap {
  const {
    nx, ny, dxM, dyM, axM, ayM, diameterTiangM, bxM, byM, hM, zM,
    gammaTanahKnM3, letakKolom, mutu, dAksenM, dTulanganMm, jarakTulanganMm,
    pukKn, pIjinTiangKn,
  } = input
  if (nx < 1 || ny < 1) throw new Error('Jumlah tiang tiap arah minimal 1')
  if (!(hM > 0)) throw new Error('Tebal pilecap harus > 0')
  if (!(pIjinTiangKn > 0)) throw new Error('Daya dukung ijin tiang harus > 0')
  if (!(diameterTiangM > 0)) throw new Error('Diameter tiang harus > 0')

  const gammaBeton = input.gammaBetonKnM3 ?? 24
  const jumlah = input.jumlah ?? 1
  const catatan: string[] = []

  // ── Dimensi pilecap dari susunan tiang
  const lxM = (nx - 1) * dxM + 2 * axM
  const lyM = (ny - 1) * dyM + 2 * ayM
  const n = nx * ny

  // ── Beban per tiang
  const tiang = bebanPerTiang(input)
  const puMaksKn = Math.max(...tiang.map((t) => t.puKn))
  const puMinKn = Math.min(...tiang.map((t) => t.puKn))

  if (puMinKn < 0) {
    catatan.push('Ada tiang bertanda TARIK (Pu negatif) — grup tiang harus '
      + 'menahan cabut, bukan hanya tekan. Periksa sambungan tiang–pilecap; '
      + 'kapasitas cabut TIDAK dihitung di sini.')
  }

  // Jarak antar tiang minimum: 2.5 D (praktik umum) — lebih rapat membuat
  // zona tekanan tiang saling tumpang tindih dan daya dukung grup turun.
  const jarakMinM = 2.5 * diameterTiangM
  const jarakTerkecilM = nx > 1 && ny > 1 ? Math.min(dxM, dyM)
    : nx > 1 ? dxM : ny > 1 ? dyM : Number.POSITIVE_INFINITY

  // ── Geser pons kolom menembus pilecap
  const dM = hM - dAksenM
  if (dM <= 0) throw new Error('Selimut melebihi tebal pilecap')

  const b0M = 2 * (bxM + dM) + 2 * (byM + dM)
  const bc = bxM / byM
  const alphaS = ALPHA_S[letakKolom]
  const akarFc = Math.sqrt(mutu.fcMpa)
  const phiGeser = 0.75

  const vcTerkecilKn = Math.min(
    (1 + 2 / bc) * akarFc * (b0M * 1000) * (dM * 1000) / 6 * 0.001,
    (alphaS * (dM * 1000) / (b0M * 1000) + 2) * akarFc * (b0M * 1000) * (dM * 1000) / 12 * 0.001,
    (1 / 3) * akarFc * (b0M * 1000) * (dM * 1000) * 0.001,
  )
  const phiVnpKn = phiGeser * vcTerkecilKn

  // ── Lentur: kantilever dari muka kolom, dibebani tiang di luar garis itu
  const lenganXM = lxM / 2 - bxM / 2
  const lenganYM = lyM / 2 - byM / 2
  // Momen = Σ (Pu tiang × jaraknya ke muka kolom), hanya tiang di luar.
  const muXKnm = tiang.reduce((s, t) => {
    const lengan = Math.abs(t.xM) - bxM / 2
    return s + (lengan > 0 ? t.puKn * lengan : 0)
  }, 0)
  const muYKnm = tiang.reduce((s, t) => {
    const lengan = Math.abs(t.yM) - byM / 2
    return s + (lengan > 0 ? t.puKn * lengan : 0)
  }, 0)
  const muMaksKnm = Math.max(muXKnm, muYKnm)

  const dMm = dM * 1000
  const lebarM = Math.max(lxM, lyM)
  const asAdaMm2PerM = (1000 / jarakTulanganMm) * (Math.PI / 4 * dTulanganMm * dTulanganMm)
  const asTotalMm2 = asAdaMm2PerM * lebarM
  const aMm = asTotalMm2 * mutu.fyMpa / (0.85 * mutu.fcMpa * (lebarM * 1000))
  const phiMnKnm = 0.9 * asTotalMm2 * mutu.fyMpa * (dMm - aMm / 2) * 1e-6

  const rhoMin = mutu.fyMpa >= 420 ? 0.0018 : 0.0020
  const asMinMm2PerM = rhoMin * 1000 * dMm

  const periksa: Periksa[] = [
    {
      // Yang menentukan adalah tiang TERKRITIS, bukan rata-rata. Grup dengan
      // momen besar bisa punya rata-rata aman sementara satu tiang sudut
      // sudah lewat batas.
      nama: 'Beban tiang maksimum', nilai: pIjinTiangKn, syarat: puMaksKn,
      satuan: 'kN', aman: puMaksKn <= pIjinTiangKn, rasio: puMaksKn / pIjinTiangKn,
      rumus: 'Pi = ΣP/n + Mux·xi/Σx² + Muy·yi/Σy²  (Rivet) ≤ P ijin tiang',
    },
    {
      nama: 'Tidak ada tiang tercabut', nilai: puMinKn, syarat: 0, satuan: 'kN',
      aman: puMinKn >= 0, rasio: puMinKn >= 0 ? 0 : Math.abs(puMinKn) / puMaksKn,
      rumus: 'Pi ≥ 0 — negatif berarti tiang TERTARIK',
    },
    {
      nama: 'Jarak antar tiang minimum', nilai: jarakTerkecilM, syarat: jarakMinM,
      satuan: 'm', aman: jarakTerkecilM >= jarakMinM,
      rasio: jarakMinM / (jarakTerkecilM || jarakMinM),
      rumus: 's ≥ 2.5·D — lebih rapat, zona tekanan tumpang tindih',
    },
    {
      nama: 'Geser pons kolom', nilai: phiVnpKn, syarat: pukKn, satuan: 'kN',
      aman: phiVnpKn >= pukKn, rasio: pukKn / phiVnpKn,
      rumus: `φVc ≥ Puk pada keliling d/2 (αs=${alphaS}, kolom ${letakKolom})`,
    },
    {
      nama: 'Lentur', nilai: phiMnKnm, syarat: muMaksKnm, satuan: 'kNm',
      aman: phiMnKnm >= muMaksKnm, rasio: muMaksKnm > 0 ? muMaksKnm / phiMnKnm : 0,
      rumus: 'φMn ≥ Σ(Pu tiang × lengan ke muka kolom)',
    },
    {
      nama: 'As minimum', nilai: asAdaMm2PerM, syarat: asMinMm2PerM, satuan: 'mm²/m',
      aman: asAdaMm2PerM >= asMinMm2PerM, rasio: asMinMm2PerM / asAdaMm2PerM,
      rumus: 'As ≥ ρmin · b · d',
    },
  ]

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumePilecap(input, lxM, lyM),
    tiang,
    /*
      Dua batang yang SELALU dipasang tetapi tak bisa dihitung dari input di
      sini, jadi batasnya dinyatakan alih-alih ditebak — alasan yang sama
      dengan `struktur-footplat.ts`:

        • stek kolom  — jumlah & diameternya milik kolom di atasnya
        • stek tiang  — panjang tulangan tiang yang dibobok masuk ke pilecap,
                        milik tiang pancang/bor di bawahnya

      Keduanya nyata dan tidak kecil. Menaruh angka tebakan untuk keduanya
      akan membuat RAP terlihat lengkap sambil salah.
    */
    catatan: [
      ...catatan,
      'Volume besi BELUM termasuk stek kolom (dowel) maupun stek tiang yang '
      + 'dibobok masuk ke pilecap — keduanya mengikuti elemen di atas dan di '
      + 'bawahnya, bukan pilecap ini. Tambahkan saat menyusun RAP.',
    ],
    antara: {
      lxM, lyM, n, puMaksKn, puMinKn, puRataKn: pukKn / n,
      sumX2: tiang.reduce((s, t) => s + t.xM * t.xM, 0),
      sumY2: tiang.reduce((s, t) => s + t.yM * t.yM, 0),
      dM, b0M, bc, alphaS, vcTerkecilKn, phiVnpKn,
      lenganXM, lenganYM, muXKnm, muYKnm, muMaksKnm,
      asAdaMm2PerM, asMinMm2PerM, phiMnKnm,
      qTimbunanKnM2: hM * gammaBeton + zM * gammaTanahKnM3,
      jumlah,
    },
  }
}

/** Volume pilecap — beton, bekisting keliling, tulangan dua arah. */
function volumePilecap(input: InputPilecap, lxM: number, lyM: number): VolumeElemen {
  const { hM, dTulanganMm, jarakTulanganMm, dAksenM } = input
  const jumlah = input.jumlah ?? 1

  const betonM3 = lxM * lyM * hM * jumlah
  const bekistingM2 = 2 * (lxM + lyM) * hM * jumlah

  const beratKgPerM = KOEF_BERAT_BESI * dTulanganMm * dTulanganMm
  const kaitM = 2 * 6 * dTulanganMm / 1000
  const panjangXM = lxM - 2 * dAksenM + kaitM
  const panjangYM = lyM - 2 * dAksenM + kaitM
  const nX = Math.ceil(lyM * 1000 / jarakTulanganMm) + 1
  const nY = Math.ceil(lxM * 1000 / jarakTulanganMm) + 1

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dTulanganMm, peran: 'utama',
      jumlahBatang: nX * jumlah, panjangPerBatangM: panjangXM,
      beratKgPerM, totalKg: nX * jumlah * panjangXM * beratKgPerM,
    },
    {
      tipe: 'BjTS', diameterMm: dTulanganMm, peran: 'utama',
      jumlahBatang: nY * jumlah, panjangPerBatangM: panjangYM,
      beratKgPerM, totalKg: nY * jumlah * panjangYM * beratKgPerM,
    },
  ]

  return {
    betonM3, bekistingM2, besi,
    besiTotalKg: besi.reduce((s, b) => s + b.totalKg, 0),
    beratSendiriKg: betonM3 * RHO_BETON,
  }
}
