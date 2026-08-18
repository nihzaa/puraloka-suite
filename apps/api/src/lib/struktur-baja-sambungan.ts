// Sambungan struktur baja: baut & las (SNI 1729:2020 §J) — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI PENTING MELEBIHI BATANGNYA SENDIRI
// ══════════════════════════════════════════════════════════════════════════════
//
// Pada struktur baja, sambungan adalah titik gagal PALING SERING — bukan
// batangnya. Batang dihitung insinyur dan dibuat pabrik dengan mutu terjamin;
// sambungan dikerjakan di lapangan, sering oleh tukang las tanpa sertifikasi,
// dan hampir tak pernah diperiksa ulang.
//
// `struktur-baja.ts` sebelumnya menyatakan "sambungan TIDAK dihitung" di
// catatan keluarannya. Itu jujur — tetapi juga berarti bagian paling berbahaya
// dibiarkan di luar, dan catatan yang menyebut sesuatu tak dihitung tak pernah
// menghentikan siapa pun membangun.
//
// ── Dipisah berkas, bukan ditempel ke `struktur-baja.ts`
//
// Sambungan punya masukan yang sama sekali berbeda dari batang (diameter baut,
// tebal pelat, mutu elektroda), dan satu sambungan bisa menghubungkan dua
// batang yang berbeda profil. Menggabungkannya berarti input batang membawa
// medan yang tak relevan untuk sebagian besar pemakaian.
//
// ⚠ YANG DIHITUNG: kapasitas baut dan las terhadap gaya yang diberikan.
// ⚠ YANG TIDAK: tata letak baut (jarak tepi, jarak antar baut, sobek blok),
//   pelat buhul, dan sambungan momen. Semuanya butuh geometri yang belum ada
//   di input — dan menebaknya menghasilkan angka yang terlihat lengkap sambil
//   salah, yang lebih berbahaya daripada tak menghitung sama sekali.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa } from './struktur-beton'
import type { MutuBaja } from './struktur-baja'

/** Faktor reduksi sambungan (SNI 1729 §J3.6) — lebih ketat daripada batang. */
export const PHI_SAMBUNGAN = 0.75

/** Mutu baut. A325/8.8 dan A490/10.9 paling umum untuk struktur. */
export interface MutuBaut {
  /** Nama mutu: "A325", "8.8", "A490". */
  nama: string
  /** Tegangan putus baut, MPa. */
  fubMpa: number
}

/** Mutu baut yang lazim dipakai di Indonesia. */
export const MUTU_BAUT: Record<string, MutuBaut> = {
  'A325': { nama: 'A325', fubMpa: 825 },
  '8.8': { nama: '8.8', fubMpa: 800 },
  'A490': { nama: 'A490', fubMpa: 1035 },
  '10.9': { nama: '10.9', fubMpa: 1000 },
}

export interface InputSambunganBaut {
  /** Diameter baut, mm (M12, M16, M20, M24). */
  diameterMm: number
  mutu: MutuBaut
  /** Jumlah baut dalam sambungan. */
  jumlah: number
  /**
   * Bidang geser per baut: 1 (irisan tunggal) atau 2 (irisan ganda).
   *
   * Irisan ganda memberi kapasitas dua kali lipat — perbedaan yang sering
   * luput saat menaksir: sambungan berpelat di KEDUA sisi jauh lebih kuat
   * daripada yang berpelat satu sisi, dengan baut yang sama persis.
   */
  bidangGeser: 1 | 2
  /** Ulir berada di bidang geser? Mengurangi kapasitas ~25%. */
  ulirDiBidangGeser?: boolean
  /** Tebal pelat tertipis yang disambung, mm — menentukan tumpu. */
  tebalPelatMm: number
  /** Mutu pelat yang disambung. */
  mutuPelat: MutuBaja
  /** Gaya geser terfaktor yang harus ditahan sambungan, kN. */
  vuKn: number
}

export interface HasilSambungan {
  periksa: Periksa[]
  aman: boolean
  antara: Record<string, number>
  catatan: string[]
}

function bilanganPositif(nama: string, v: number): void {
  if (!(v > 0)) throw new Error(`${nama} harus > 0`)
}

const rasio = (tuntutan: number, kapasitas: number) =>
  kapasitas > 0 ? tuntutan / kapasitas : Number.POSITIVE_INFINITY

/**
 * Kapasitas geser satu baut, kN (SNI 1729 §J3.6).
 *
 * Fnv = 0,45·Fub bila ulir ADA di bidang geser, 0,56·Fub bila tidak.
 *
 * Bedanya 25%, dan yang menentukan cuma panjang baut yang dipesan. Baut yang
 * terlalu pendek membuat ulirnya jatuh tepat di bidang geser, dan kapasitas
 * sambungan turun seperempat tanpa ada yang terlihat berbeda dari luar.
 */
export function kapasitasGeserBaut(
  diameterMm: number, mutu: MutuBaut, ulirDiBidangGeser: boolean, bidangGeser: number,
): number {
  const ab = (Math.PI / 4) * diameterMm ** 2
  const fnv = (ulirDiBidangGeser ? 0.45 : 0.56) * mutu.fubMpa
  return (fnv * ab * bidangGeser) / 1000
}

/**
 * Kapasitas TUMPU satu baut pada pelat, kN (SNI 1729 §J3.10).
 *
 *     Rn = 2,4 · d · t · Fu
 *
 * Inilah yang sering MENENTUKAN, bukan geser bautnya: baut mutu tinggi pada
 * pelat tipis akan merobek pelatnya lebih dulu — lubang bautnya memanjang jadi
 * lonjong, sambungan mengendur, dan struktur bergoyang. Memakai baut lebih
 * kuat sama sekali tidak menolong untuk kegagalan ini.
 */
export function kapasitasTumpuBaut(
  diameterMm: number, tebalPelatMm: number, fuPelatMpa: number,
): number {
  return (2.4 * diameterMm * tebalPelatMm * fuPelatMpa) / 1000
}

/**
 * Analisa sambungan baut.
 *
 * Dua mekanisme diperiksa TERPISAH, bukan diambil yang terkecil diam-diam:
 * keduanya menuntut TINDAKAN BERBEDA. Geser baut kurang → baut lebih besar
 * atau lebih banyak. Tumpu kurang → tebalkan PELAT-nya; baut lebih kuat tak
 * menolong sama sekali.
 *
 * Menggabungkannya jadi satu verdict "sambungan tidak kuat" membuat orang
 * menebak tindakannya — dan tebakan yang paling sering diambil (baut lebih
 * besar) justru yang salah untuk kegagalan tumpu.
 */
export function analisaSambunganBaut(input: InputSambunganBaut): HasilSambungan {
  const { diameterMm, mutu, jumlah, bidangGeser, tebalPelatMm, mutuPelat, vuKn } = input
  bilanganPositif('Diameter baut', diameterMm)
  bilanganPositif('Tebal pelat', tebalPelatMm)
  if (!Number.isInteger(jumlah) || jumlah < 1) {
    throw new Error('Jumlah baut harus bilangan bulat minimal 1')
  }

  // Asumsi AMAN saat tak diisi: ulir ikut tergeser (kapasitas lebih kecil).
  const ulir = input.ulirDiBidangGeser ?? true
  const catatan: string[] = []

  const geserPerBaut = kapasitasGeserBaut(diameterMm, mutu, ulir, bidangGeser)
  const tumpuPerBaut = kapasitasTumpuBaut(diameterMm, tebalPelatMm, mutuPelat.fuMpa)

  const phiGeserTotal = PHI_SAMBUNGAN * geserPerBaut * jumlah
  const phiTumpuTotal = PHI_SAMBUNGAN * tumpuPerBaut * jumlah

  const periksa: Periksa[] = [
    {
      nama: 'Geser baut', nilai: phiGeserTotal, syarat: vuKn,
      satuan: 'kN', aman: phiGeserTotal >= vuKn, rasio: rasio(vuKn, phiGeserTotal),
      rumus: `phiRn = 0.75 x ${ulir ? '0.45' : '0.56'}Fub x Ab x ${bidangGeser} bidang x ${jumlah} baut`,
    },
    {
      nama: 'Tumpu pelat', nilai: phiTumpuTotal, syarat: vuKn,
      satuan: 'kN', aman: phiTumpuTotal >= vuKn, rasio: rasio(vuKn, phiTumpuTotal),
      rumus: 'phiRn = 0.75 x 2.4 x d x t x Fu   (yang robek PELAT-nya, bukan bautnya)',
    },
  ]

  if (phiTumpuTotal < phiGeserTotal) {
    catatan.push(
      'TUMPU PELAT yang menentukan, bukan geser baut. Artinya memakai baut '
      + 'mutu lebih tinggi TIDAK menolong sama sekali — yang harus ditebalkan '
      + 'adalah pelatnya, atau bautnya diperbanyak supaya bebannya terbagi.',
    )
  }

  if (ulir) {
    catatan.push(
      'Ulir dianggap BERADA di bidang geser (asumsi aman) — kapasitas geser '
      + '25% lebih kecil daripada bila ulir di luar bidang geser. Bila baut '
      + 'dipesan cukup panjang sehingga bagian polosnya yang tergeser, isi '
      + 'ulirDiBidangGeser: false dan kapasitasnya naik.',
    )
  }

  catatan.push(
    'TATA LETAK baut TIDAK diperiksa: jarak ke tepi pelat, jarak antar baut, '
    + 'dan sobek blok (block shear). Baut yang terlalu dekat tepi akan '
    + 'menyobek pelat keluar meski kapasitas geser dan tumpunya cukup.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    antara: {
      geserPerBautKn: geserPerBaut, tumpuPerBautKn: tumpuPerBaut,
      phiGeserTotalKn: phiGeserTotal, phiTumpuTotalKn: phiTumpuTotal,
      jumlahBaut: jumlah, luasBautMm2: (Math.PI / 4) * diameterMm ** 2,
    },
    catatan,
  }
}

export interface InputSambunganLas {
  /** Ukuran kaki las sudut, mm. */
  ukuranMm: number
  /** Panjang total las efektif, mm. */
  panjangMm: number
  /** Kuat tarik elektroda, MPa. E70XX = 490, E60XX = 415. */
  fuElektrodaMpa: number
  /** Mutu pelat induk — las tak boleh lebih kuat dari yang disambungnya. */
  mutuPelat: MutuBaja
  /** Tebal pelat tertipis yang disambung, mm — menentukan ukuran las minimum. */
  tebalPelatMm: number
  /** Gaya terfaktor, kN. */
  vuKn: number
}

/**
 * Ukuran las sudut MINIMUM menurut tebal pelat (SNI 1729 Tabel J2.4).
 *
 * Ini batas TEKNOLOGI pengelasan, bukan batas tegangan: las terlalu kecil pada
 * pelat tebal mendingin terlalu cepat — panasnya terserap habis ke pelat — dan
 * lasnya menjadi getas serta retak.
 *
 * Karena itu ia tetap berlaku meski hitungan kekuatannya sudah lebih dari
 * cukup, dan itulah yang membuatnya mudah dilanggar: orang menghitung
 * kapasitas, melihat angkanya cukup, lalu memakai las sekecil mungkin.
 */
export function ukuranLasMinimumMm(tebalPelatMm: number): number {
  if (tebalPelatMm <= 6) return 3
  if (tebalPelatMm <= 13) return 5
  if (tebalPelatMm <= 19) return 6
  return 8
}

/**
 * Analisa las sudut (fillet weld) — SNI 1729 §J2.4.
 *
 * Tebal efektif = 0,707 × ukuran kaki: las sudut berpenampang segitiga, dan
 * yang menahan adalah tinggi tegak lurus dari sudut ke sisi miringnya. Memakai
 * ukuran kaki langsung membuat kapasitas terhitung 41% lebih besar dari
 * kenyataan.
 */
export function analisaSambunganLas(input: InputSambunganLas): HasilSambungan {
  const { ukuranMm, panjangMm, fuElektrodaMpa, mutuPelat, tebalPelatMm, vuKn } = input
  bilanganPositif('Ukuran las', ukuranMm)
  bilanganPositif('Panjang las', panjangMm)
  bilanganPositif('Tebal pelat', tebalPelatMm)

  const catatan: string[] = []

  const tebalEfektif = 0.707 * ukuranMm
  const luasEfektif = tebalEfektif * panjangMm
  const phiRnLas = (PHI_SAMBUNGAN * 0.6 * fuElektrodaMpa * luasEfektif) / 1000

  /*
    LOGAM INDUK ikut diperiksa.

    Las yang lebih kuat dari pelat yang disambungnya tidak membuat sambungan
    lebih kuat — yang robek pelatnya, tepat di sisi las. Kegagalan ini sering
    mengejutkan: lasnya utuh sempurna, pelatnya yang sobek memanjang mengikuti
    garis las.
  */
  const phiRnInduk = (PHI_SAMBUNGAN * 0.6 * mutuPelat.fuMpa * (ukuranMm * panjangMm)) / 1000

  const minimum = ukuranLasMinimumMm(tebalPelatMm)

  const periksa: Periksa[] = [
    {
      nama: 'Las sudut', nilai: phiRnLas, syarat: vuKn,
      satuan: 'kN', aman: phiRnLas >= vuKn, rasio: rasio(vuKn, phiRnLas),
      rumus: 'phiRn = 0.75 x 0.6Fexx x (0.707 a L) — 0.707 karena las berpenampang segitiga',
    },
    {
      nama: 'Logam induk di sisi las', nilai: phiRnInduk, syarat: vuKn,
      satuan: 'kN', aman: phiRnInduk >= vuKn, rasio: rasio(vuKn, phiRnInduk),
      rumus: 'phiRn = 0.75 x 0.6Fu pelat x (a L)   (yang sobek PELAT-nya)',
    },
    {
      nama: 'Ukuran las minimum', nilai: ukuranMm, syarat: minimum,
      satuan: 'mm', aman: ukuranMm >= minimum, rasio: minimum / Math.max(ukuranMm, 1e-9),
      rumus: 'SNI 1729 Tabel J2.4 — batas TEKNOLOGI pengelasan, bukan tegangan',
    },
  ]

  if (phiRnInduk < phiRnLas) {
    catatan.push(
      'LOGAM INDUK yang menentukan, bukan lasnya. Memakai elektroda lebih kuat '
      + 'atau memperbesar las TIDAK menolong — yang sobek pelatnya, tepat di '
      + 'sisi las. Perpanjang lasnya, atau tebalkan pelat.',
    )
  }

  if (ukuranMm < minimum) {
    catatan.push(
      `Ukuran las ${ukuranMm} mm di bawah minimum ${minimum} mm untuk pelat `
      + `tebal ${tebalPelatMm} mm. Ini BUKAN soal kekuatan: las sekecil itu `
      + 'mendingin terlalu cepat karena panasnya terserap pelat, lalu menjadi '
      + 'getas dan retak. Hitungan kekuatan yang cukup tidak membatalkannya.',
    )
  }

  catatan.push(
    'Mutu las bergantung PENGERJAAN, dan pengerjaan tak bisa dihitung. '
    + 'Kapasitas di atas berlaku untuk las yang dikerjakan sesuai prosedur dan '
    + 'diperiksa — bukan untuk las lapangan tanpa pemeriksaan.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    antara: {
      tebalEfektifMm: tebalEfektif, luasEfektifMm2: luasEfektif,
      phiRnLasKn: phiRnLas, phiRnIndukKn: phiRnInduk, ukuranMinimumMm: minimum,
    },
    catatan,
  }
}
