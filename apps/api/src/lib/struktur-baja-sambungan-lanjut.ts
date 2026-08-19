// SAMBUNGAN BAJA LANJUT — pelat buhul (gusset) & sambungan momen. PURE.
//
// ══════════════════════════════════════════════════════════════════════════════
// DUA SAMBUNGAN YANG PALING SERING JADI TITIK GAGAL SESUNGGUHNYA
// ══════════════════════════════════════════════════════════════════════════════
//
// Modul `struktur-baja-sambungan.ts` menghitung baut dan las satu per satu.
// Yang belum ada: apa yang terjadi pada PELAT yang menyatukan mereka.
//
// PELAT BUHUL (gusset) menyatukan batang-batang rangka di satu titik. Ia gagal
// dengan cara yang tak terpikir saat merancang bautnya:
//
//   LELEH TARIK   pada lebar efektif Whitmore — bukan seluruh lebar pelat
//                 ikut bekerja, hanya sepotong yang menyebar 30° dari baris
//                 baut pertama
//   SOBEK BLOK    sepotong pelat tercabut utuh mengikuti garis baut, dan
//                 kapasitasnya BUKAN jumlah kapasitas bautnya
//   TEKUK         pada batang tekan, pelat buhul menekuk seperti kolom pendek
//
// Yang paling sering dilewatkan: TEKUK pelat buhul. Perancang memeriksa
// bautnya, memeriksa lasnya, dan pelatnya sendiri melengkung keluar bidang.
//
// SAMBUNGAN MOMEN (rigid) harus menyalurkan momen, bukan hanya geser.
// Kesalahan paling mahal di sini: menganggap sambungan yang "kelihatan kaku"
// benar-benar kaku. Sambungan yang kekakuannya kurang berperilaku sebagai
// semi-rigid — momen yang dihitung tak sampai, dan momen lapangan justru
// lebih besar daripada yang direncanakan.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa } from './struktur-beton.js'

/** Faktor tahanan SNI 1729:2020. */
export const PHI_LELEH = 0.9
export const PHI_PUTUS = 0.75
export const PHI_TEKUK = 0.9

/** Sudut sebar Whitmore, derajat dari sumbu batang tiap sisi. */
export const SUDUT_WHITMORE = 30

/** Modulus elastisitas baja, MPa. */
export const ES_MPA = 200_000

export interface InputGusset {
  /** Tebal pelat buhul, mm. */
  tebalMm: number
  /** Lebar sambungan tegak lurus gaya (jarak antar baut terluar), mm. */
  lebarSambunganMm: number
  /** Panjang sambungan searah gaya (baris pertama ke terakhir), mm. */
  panjangSambunganMm: number
  /** Panjang bebas pelat dari baris baut terakhir ke tumpuan, mm. */
  panjangBebasMm: number
  /** Gaya batang yang disalurkan, kN. Positif tarik, negatif tekan. */
  gayaKn: number
  mutu: { fyMpa: number; fuMpa: number }
  /** Luas geser bruto blok sobek, mm². */
  agvMm2: number
  /** Luas geser neto blok sobek, mm². */
  anvMm2: number
  /** Luas tarik neto blok sobek, mm². */
  antMm2: number
}

export interface HasilGusset {
  periksa: Periksa[]
  aman: boolean
  kapasitas: {
    /** Lebar efektif Whitmore, mm. */
    lebarWhitmoreMm: number
    phiTarikLelehKn: number
    phiSobekBlokKn: number
    /** Nol bila gaya tarik — tekuk hanya berlaku pada batang tekan. */
    phiTekukKn: number
    /** Kelangsingan pelat sebagai kolom pendek. */
    kelangsingan: number
  }
  catatan: string[]
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Pelat buhul (gusset plate).
 *
 * Tiga kegagalan diperiksa terpisah karena ketiganya bekerja pada bagian
 * pelat yang berbeda — dan yang paling lemah menentukan.
 */
export function analisaGusset(input: InputGusset): HasilGusset {
  const {
    tebalMm, lebarSambunganMm, panjangSambunganMm, panjangBebasMm,
    gayaKn, mutu, agvMm2, anvMm2, antMm2,
  } = input

  positif('tebal pelat', tebalMm)
  positif('lebar sambungan', lebarSambunganMm)
  positif('panjang sambungan', panjangSambunganMm)
  positif('fy', mutu.fyMpa)
  positif('fu', mutu.fuMpa)
  positif('Agv', agvMm2)
  positif('Anv', anvMm2)
  positif('Ant', antMm2)
  if (panjangBebasMm < 0) throw new Error('panjang bebas tak boleh negatif')
  if (gayaKn === 0) throw new Error('gaya batang tak boleh nol')

  const catatan: string[] = []
  const periksa: Periksa[] = []
  const gayaAbsKn = Math.abs(gayaKn)
  const tekan = gayaKn < 0

  // ── Lebar efektif Whitmore ───────────────────────────────────────────────
  /*
    BUKAN seluruh lebar pelat ikut bekerja. Gaya menyebar 30° tiap sisi dari
    baris baut pertama, dan hanya sepotong itu yang menahan. Memakai lebar
    penuh pelat melebihkan kapasitas berkali lipat pada pelat yang lebar.
  */
  const tan30 = Math.tan((SUDUT_WHITMORE * Math.PI) / 180)
  const lebarWhitmoreMm = lebarSambunganMm + 2 * panjangSambunganMm * tan30

  const phiTarikLelehKn = (PHI_LELEH * lebarWhitmoreMm * tebalMm * mutu.fyMpa) / 1000

  periksa.push({
    nama: 'Leleh tarik pelat buhul',
    nilai: Math.round(phiTarikLelehKn * 100) / 100,
    syarat: Math.round(gayaAbsKn * 100) / 100,
    satuan: 'kN',
    aman: phiTarikLelehKn >= gayaAbsKn,
    rasio: phiTarikLelehKn > 0 ? Math.round((gayaAbsKn / phiTarikLelehKn) * 1e4) / 1e4 : Infinity,
    rumus: `φFy·(lebar Whitmore ${SUDUT_WHITMORE}°)·t — BUKAN lebar penuh pelat`,
  })

  // ── Sobek blok (SNI 1729 §J4.3) ──────────────────────────────────────────
  /*
    Sepotong pelat tercabut UTUH mengikuti garis baut. Kapasitasnya bukan
    jumlah kapasitas bautnya — ini kegagalan PELAT, dan ia bisa terjadi
    meski setiap bautnya cukup.
  */
  const ubs = 1.0     // tegangan tarik seragam
  const sobek1 = 0.6 * mutu.fuMpa * anvMm2 + ubs * mutu.fuMpa * antMm2
  const sobek2 = 0.6 * mutu.fyMpa * agvMm2 + ubs * mutu.fuMpa * antMm2
  const phiSobekBlokKn = (PHI_PUTUS * Math.min(sobek1, sobek2)) / 1000

  periksa.push({
    nama: 'Sobek blok',
    nilai: Math.round(phiSobekBlokKn * 100) / 100,
    syarat: Math.round(gayaAbsKn * 100) / 100,
    satuan: 'kN',
    aman: phiSobekBlokKn >= gayaAbsKn,
    rasio: phiSobekBlokKn > 0 ? Math.round((gayaAbsKn / phiSobekBlokKn) * 1e4) / 1e4 : Infinity,
    rumus: 'φ·min(0,6Fu·Anv + Ubs·Fu·Ant, 0,6Fy·Agv + Ubs·Fu·Ant) — SNI 1729 §J4.3',
  })

  // ── Tekuk pelat (hanya batang TEKAN) ─────────────────────────────────────
  /*
    Inilah yang paling sering dilewatkan. Perancang memeriksa bautnya,
    memeriksa lasnya, dan pelatnya sendiri melengkung keluar bidang.

    Pelat diperlakukan sebagai kolom pendek selebar Whitmore dengan panjang
    tekuk = panjang bebasnya. K = 1,2 untuk gusset yang tertumpu satu sisi.
  */
  const radiusGirasi = tebalMm / Math.sqrt(12)
  const kFaktor = 1.2
  const kelangsingan = radiusGirasi > 0
    ? (kFaktor * panjangBebasMm) / radiusGirasi
    : Infinity

  let phiTekukKn = 0
  if (tekan) {
    const fe = (Math.PI ** 2 * ES_MPA) / kelangsingan ** 2
    const fcr = fe >= 0.44 * mutu.fyMpa
      ? mutu.fyMpa * 0.658 ** (mutu.fyMpa / fe)
      : 0.877 * fe
    phiTekukKn = (PHI_TEKUK * lebarWhitmoreMm * tebalMm * fcr) / 1000

    periksa.push({
      nama: 'Tekuk pelat buhul',
      nilai: Math.round(phiTekukKn * 100) / 100,
      syarat: Math.round(gayaAbsKn * 100) / 100,
      satuan: 'kN',
      aman: phiTekukKn >= gayaAbsKn,
      rasio: phiTekukKn > 0 ? Math.round((gayaAbsKn / phiTekukKn) * 1e4) / 1e4 : Infinity,
      rumus: 'φFcr·(lebar Whitmore)·t — pelat sebagai kolom pendek, K = 1,2',
    })

    if (kelangsingan > 25) {
      catatan.push(
        `Kelangsingan pelat ${kelangsingan.toFixed(0)} melebihi 25. Di atas itu `
        + 'tekuk pelat buhul mengendalikan, dan ia terjadi KELUAR BIDANG — '
        + 'arah yang tak terlihat pada gambar sambungan. Perpendek panjang '
        + 'bebasnya atau tebalkan pelatnya.',
      )
    }
  } else {
    catatan.push(
      'Batang TARIK: tekuk pelat tidak diperiksa karena tak berlaku. Pada '
      + 'batang TEKAN, tekuk pelat buhul justru yang paling sering '
      + 'mengendalikan — dan paling sering dilewatkan.',
    )
  }

  catatan.push(
    `Lebar efektif Whitmore ${lebarWhitmoreMm.toFixed(0)} mm dipakai, bukan `
    + 'lebar penuh pelat. Gaya menyebar 30° tiap sisi dari baris baut pertama; '
    + 'memakai lebar penuh melebihkan kapasitas berkali lipat pada pelat lebar.',
  )
  catatan.push(
    'Yang BELUM diperiksa: interaksi gaya dari BEBERAPA batang yang bertemu di '
    + 'satu buhul. Pelat yang cukup untuk tiap batang sendiri-sendiri bisa '
    + 'gagal saat semuanya bekerja bersamaan — dan itu keadaan yang sebenarnya.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    kapasitas: {
      lebarWhitmoreMm: Math.round(lebarWhitmoreMm * 100) / 100,
      phiTarikLelehKn: Math.round(phiTarikLelehKn * 100) / 100,
      phiSobekBlokKn: Math.round(phiSobekBlokKn * 100) / 100,
      phiTekukKn: Math.round(phiTekukKn * 100) / 100,
      kelangsingan: Math.round(kelangsingan * 100) / 100,
    },
    catatan,
  }
}

// ── SAMBUNGAN MOMEN ──────────────────────────────────────────────────────────

/**
 * Klasifikasi kekakuan sambungan — SNI 1729 §B3.4.
 *
 * Batas dinyatakan sebagai Ki·L/(E·Ib): sambungan yang kekakuannya di bawah
 * batas bawah berperilaku SENDI meski dibaut rapat, dan yang di atas batas
 * atas boleh dianggap kaku penuh.
 */
export const BATAS_KAKU = 20
export const BATAS_SENDI = 2

export type TipeSambunganMomen = 'pelat_ujung' | 'sayap_dilas' | 'siku_sayap'

export interface InputSambunganMomen {
  tipe: TipeSambunganMomen
  /** Tinggi balok, mm. */
  tinggiBalokMm: number
  /** Tebal sayap balok, mm. */
  tebalSayapMm: number
  /** Lebar sayap balok, mm. */
  lebarSayapMm: number
  /** Momen rencana yang disalurkan, kNm. */
  muKnm: number
  /** Geser rencana, kN. */
  vuKn: number
  /** Momen inersia balok, mm⁴ — untuk klasifikasi kekakuan. */
  inersiaBalokMm4: number
  /** Bentang balok, m — untuk klasifikasi kekakuan. */
  bentangM: number
  /** Kekakuan rotasi sambungan, kNm/rad. */
  kekakuanKnmPerRad: number
  /** Luas total baut tarik di sayap atas, mm². */
  asBautTarikMm2: number
  /** Kuat tarik baut, MPa. */
  fuBautMpa: number
  mutu: { fyMpa: number; fuMpa: number }
}

export interface HasilSambunganMomen {
  periksa: Periksa[]
  aman: boolean
  klasifikasi: {
    /** Kekakuan tak berdimensi. */
    kekakuanRelatif: number
    /** 'kaku' · 'semi-rigid' · 'sendi'. */
    kelas: 'kaku' | 'semi-rigid' | 'sendi'
  }
  kapasitas: {
    /** Gaya tarik di sayap akibat momen, kN. */
    gayaSayapKn: number
    phiTarikBautKn: number
    phiMomenKnm: number
  }
  catatan: string[]
}

/**
 * Sambungan momen (rigid connection).
 *
 * Yang diperiksa bukan hanya kapasitasnya melainkan KEKAKUANNYA: sambungan
 * yang dihitung sebagai kaku tetapi sebenarnya semi-rigid membuat momen
 * lapangan jauh lebih besar daripada yang direncanakan.
 */
export function analisaSambunganMomen(input: InputSambunganMomen): HasilSambunganMomen {
  const {
    tipe, tinggiBalokMm, tebalSayapMm, lebarSayapMm, muKnm, vuKn,
    inersiaBalokMm4, bentangM, kekakuanKnmPerRad,
    asBautTarikMm2, fuBautMpa, mutu,
  } = input

  positif('tinggi balok', tinggiBalokMm)
  positif('tebal sayap', tebalSayapMm)
  positif('lebar sayap', lebarSayapMm)
  positif('Mu', muKnm)
  positif('inersia balok', inersiaBalokMm4)
  positif('bentang', bentangM)
  positif('kekakuan sambungan', kekakuanKnmPerRad)
  positif('luas baut tarik', asBautTarikMm2)
  positif('fu baut', fuBautMpa)
  positif('fy', mutu.fyMpa)
  if (vuKn < 0) throw new Error('Vu tak boleh negatif')
  if (!['pelat_ujung', 'sayap_dilas', 'siku_sayap'].includes(tipe)) {
    throw new Error(`tipe sambungan momen tak dikenal: ${tipe}`)
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  // ── Klasifikasi kekakuan ─────────────────────────────────────────────────
  /*
    Inilah kesalahan paling mahal di sambungan momen: menganggap sambungan yang
    "kelihatan kaku" benar-benar kaku. Yang menentukan bukan penampilannya
    melainkan perbandingan kekakuannya terhadap kekakuan baloknya.
  */
  const lMm = bentangM * 1000
  /* Ki·L/(E·Ib), dengan Ki dalam N·mm/rad. */
  const kekakuanRelatif = (kekakuanKnmPerRad * 1e6 * lMm) / (ES_MPA * inersiaBalokMm4)

  const kelas: 'kaku' | 'semi-rigid' | 'sendi' =
    kekakuanRelatif >= BATAS_KAKU ? 'kaku'
      : kekakuanRelatif <= BATAS_SENDI ? 'sendi'
        : 'semi-rigid'

  periksa.push({
    nama: 'Kekakuan sambungan',
    nilai: Math.round(kekakuanRelatif * 100) / 100,
    syarat: BATAS_KAKU,
    satuan: '',
    aman: kelas === 'kaku',
    rasio: kekakuanRelatif > 0
      ? Math.round((BATAS_KAKU / kekakuanRelatif) * 1e4) / 1e4
      : Infinity,
    rumus: `Ki·L/(E·Ib) ≥ ${BATAS_KAKU} untuk sambungan KAKU (SNI 1729 §B3.4)`,
  })

  if (kelas !== 'kaku') {
    catatan.push(
      `Sambungan ini ${kelas.toUpperCase()}, bukan kaku (Ki·L/EI = `
      + `${kekakuanRelatif.toFixed(1)}, butuh ≥ ${BATAS_KAKU}). Momen yang `
      + 'dihitung TIDAK SAMPAI ke sambungan, dan momen lapangan justru lebih '
      + 'besar daripada yang direncanakan — balok yang dirancang sebagai '
      + 'menerus berperilaku lebih dekat ke tumpuan sederhana.',
    )
  }

  // ── Kapasitas momen lewat kopel sayap ────────────────────────────────────
  /*
    Momen disalurkan sebagai KOPEL: sayap atas tertarik, sayap bawah tertekan,
    dengan lengan setinggi balok dikurangi satu tebal sayap.
  */
  const lenganMm = tinggiBalokMm - tebalSayapMm
  const gayaSayapKn = (muKnm * 1e6) / lenganMm / 1000

  const phiTarikBautKn = (PHI_PUTUS * 0.75 * fuBautMpa * asBautTarikMm2) / 1000
  const phiMomenKnm = (phiTarikBautKn * lenganMm) / 1000

  periksa.push({
    nama: 'Kapasitas momen',
    nilai: Math.round(phiMomenKnm * 100) / 100,
    syarat: Math.round(muKnm * 100) / 100,
    satuan: 'kNm',
    aman: phiMomenKnm >= muKnm,
    rasio: phiMomenKnm > 0 ? Math.round((muKnm / phiMomenKnm) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn = φRn_baut × lengan kopel sayap',
  })

  // ── Leleh sayap balok ────────────────────────────────────────────────────
  const phiLelehSayapKn = (PHI_LELEH * lebarSayapMm * tebalSayapMm * mutu.fyMpa) / 1000
  periksa.push({
    nama: 'Leleh sayap balok',
    nilai: Math.round(phiLelehSayapKn * 100) / 100,
    syarat: Math.round(gayaSayapKn * 100) / 100,
    satuan: 'kN',
    aman: phiLelehSayapKn >= gayaSayapKn,
    rasio: phiLelehSayapKn > 0
      ? Math.round((gayaSayapKn / phiLelehSayapKn) * 1e4) / 1e4
      : Infinity,
    rumus: 'φFy·bf·tf ≥ gaya kopel sayap',
  })

  catatan.push(
    `Momen disalurkan sebagai KOPEL sayap dengan lengan ${lenganMm.toFixed(0)} mm. `
    + `Gaya tarik di sayap atas ${gayaSayapKn.toFixed(1)} kN — jauh lebih besar `
    + 'daripada geser baloknya, dan itu yang menentukan jumlah bautnya.',
  )
  catatan.push(
    'Yang BELUM diperiksa: pengaku badan kolom (continuity plate) di depan '
    + 'sayap balok, geser panel zone kolom, dan prying action pada baut tarik. '
    + 'Panel zone yang lemah membuat sambungan berputar meski bautnya cukup — '
    + 'dan itu mengubah kelasnya dari kaku jadi semi-rigid.',
  )
  if (tipe === 'siku_sayap') {
    catatan.push(
      'Sambungan SIKU SAYAP hampir selalu semi-rigid — sikunya melentur dan '
      + 'menyerap rotasi. Merancangnya sebagai kaku penuh jarang benar.',
    )
  }

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    klasifikasi: {
      kekakuanRelatif: Math.round(kekakuanRelatif * 100) / 100,
      kelas,
    },
    kapasitas: {
      gayaSayapKn: Math.round(gayaSayapKn * 100) / 100,
      phiTarikBautKn: Math.round(phiTarikBautKn * 100) / 100,
      phiMomenKnm: Math.round(phiMomenKnm * 100) / 100,
    },
    catatan,
  }
}
