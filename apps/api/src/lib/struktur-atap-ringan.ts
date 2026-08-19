// KUDA-KUDA KAYU & RANGKA ATAP BAJA RINGAN — PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// DUA RANGKA ATAP YANG PALING BANYAK DIPAKAI DAN PALING JARANG DIHITUNG
// ══════════════════════════════════════════════════════════════════════════════
//
// KUDA-KUDA KAYU dipakai di hampir semua rumah tinggal Indonesia, dan
// ukurannya diwariskan ("kaso 5/7, gording 8/12") tanpa perhitungan. Yang
// membuatnya berbeda dari baja:
//
//   ARAH SERAT menentukan segalanya. Kayu kuat searah serat dan lemah tegak
//   lurusnya — sampai 20 kali lipat bedanya. Sambungan yang menekan tegak
//   lurus serat hancur pada tegangan yang jauh di bawah kuat tekan
//   sejajarnya, dan itu yang paling sering gagal.
//
//   KADAR AIR mengubah kekuatan. Kayu basah bisa 30% lebih lemah daripada
//   kering udara, dan kayu yang dipasang basah menyusut lalu sambungannya
//   longgar.
//
//   DURASI BEBAN. Kayu yang dibebani terus-menerus patah pada beban yang
//   sanggup ditahannya sesaat. Faktor durasi bukan kehati-hatian berlebihan
//   melainkan sifat bahannya.
//
// RANGKA ATAP BAJA RINGAN (profil C dan reng dari baja tipis lapis Zn/AlZn)
// menggantikan kayu di sebagian besar proyek baru. Yang berbeda dan sering
// salah:
//
//   TEKUK LOKAL mengendalikan, bukan leleh. Baja setebal 0,75 mm menekuk
//   pada tegangan jauh di bawah kuat lelehnya — dan kapasitas penampangnya
//   dihitung dengan LEBAR EFEKTIF, bukan lebar penuh.
//
//   LAPISAN ANTIKARAT menentukan umur, bukan kekuatan. Rangka yang kuat tetapi
//   berlapis tipis habis dalam belasan tahun di daerah pantai.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa, VolumeElemen, BarisBesi } from './struktur-beton.js'

/** Modulus elastisitas baja, MPa. */
export const ES_MPA = 200_000

/**
 * Kelas kuat kayu Indonesia — PKKI / SNI 7973:2013.
 *
 * `fb`  = kuat lentur, MPa
 * `fc`  = kuat tekan SEJAJAR serat, MPa
 * `fcp` = kuat tekan TEGAK LURUS serat, MPa
 * `fv`  = kuat geser, MPa
 * `e`   = modulus elastisitas, MPa
 *
 * Perhatikan `fc` vs `fcp`: bedanya sampai 10 kali lipat. Sambungan yang
 * menekan tegak lurus serat hancur jauh sebelum kuat tekan sejajarnya
 * tercapai — dan itu yang paling sering gagal pada kuda-kuda kayu.
 */
export const KELAS_KAYU = {
  I: { fb: 100, fc: 65, fcp: 25, fv: 12, e: 12500, nama: 'Kelas I (jati, merbau, ulin)' },
  II: { fb: 85, fc: 42.5, fcp: 15, fv: 8, e: 10000, nama: 'Kelas II (rasamala, meranti)' },
  III: { fb: 60, fc: 30, fcp: 10, fv: 6, e: 8000, nama: 'Kelas III (kamper, borneo)' },
  IV: { fb: 45, fc: 22.5, fcp: 5, fv: 5, e: 6000, nama: 'Kelas IV (sengon, meranti muda)' },
} as const

export type KelasKayu = keyof typeof KELAS_KAYU

/**
 * Faktor durasi beban — SNI 7973 Tabel 4.3.2.
 *
 * Kayu yang dibebani TERUS-MENERUS patah pada beban yang sanggup ditahannya
 * sesaat. Ini bukan kehati-hatian berlebihan melainkan sifat bahannya
 * (creep rupture).
 */
export const FAKTOR_DURASI = {
  tetap: 0.9,       // beban mati seumur bangunan
  sepuluh_tahun: 1.0,
  dua_bulan: 1.15,  // beban salju/konstruksi
  tujuh_hari: 1.25,
  sepuluh_menit: 1.6, // angin & gempa
} as const

export type DurasiBeban = keyof typeof FAKTOR_DURASI

/** Faktor kadar air — kayu basah jauh lebih lemah. */
export const FAKTOR_KADAR_AIR = { kering: 1.0, basah: 0.7 } as const
export type KadarAir = keyof typeof FAKTOR_KADAR_AIR

export interface InputKudaKudaKayu {
  kelas: KelasKayu
  /** Lebar penampang batang, mm. */
  lebarMm: number
  /** Tinggi penampang batang, mm. */
  tinggiMm: number
  /** Panjang batang, m. */
  panjangM: number
  /** Gaya batang, kN. Positif tarik, negatif tekan. */
  gayaKn: number
  /** Momen lentur pada batang, kNm. Nol untuk batang rangka murni. */
  momenKnm: number
  durasi: DurasiBeban
  kadarAir: KadarAir
  /** Lebar tumpuan tegak lurus serat, mm. Nol bila tak ada tumpuan. */
  lebarTumpuanMm: number
  /** Gaya tumpu tegak lurus serat, kN. */
  gayaTumpuKn: number
  /** Jumlah batang sejenis, untuk volume. */
  jumlah?: number
}

export interface HasilKudaKudaKayu {
  periksa: Periksa[]
  aman: boolean
  kapasitas: {
    /** Kuat izin sesudah faktor durasi & kadar air, MPa. */
    fbTerkoreksiMpa: number
    fcTerkoreksiMpa: number
    fcpTerkoreksiMpa: number
    kelangsingan: number
    phiTekanKn: number
    phiTarikKn: number
    phiLenturKnm: number
  }
  /*
    ⚠ Bentuknya `VolumeElemen` KANONIK, bukan `{ kayuM3 }` sendiri.

    Versi pertama memulangkan bentuk khusus, dan itu MERUNTUHKAN
    `rekap-volume` seluruh proyek dengan HTTP 500: pembacanya mengandaikan
    medan `besi` selalu ada, dan bentuk khusus lolos cek "seharusnya punya
    volume" karena objeknya memang ada.

    Bukan satu baris yang hilang — seluruh halaman rekap gagal begitu ada satu
    elemen kayu di proyek. Ditemukan dengan MENJALANKAN, bukan oleh test.

    Kayu memang bukan beton dan bukan besi. Yang dipakai: `betonM3` menampung
    volume kayunya (satuan sama, m³) dan `besi` kosong — sementara catatan
    menjelaskan bahwa angka itu KAYU. Memaksakan medan baru ke tipe bersama
    berarti setiap pembaca lama harus tahu tentang kayu.
  */
  volume: VolumeElemen
  catatan: string[]
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Batang kuda-kuda kayu.
 *
 * Memeriksa tarik/tekan, lentur, dan TUMPU TEGAK LURUS SERAT — yang terakhir
 * paling sering gagal dan paling jarang diperiksa.
 */
export function analisaKudaKudaKayu(input: InputKudaKudaKayu): HasilKudaKudaKayu {
  const {
    kelas, lebarMm, tinggiMm, panjangM, gayaKn, momenKnm,
    durasi, kadarAir, lebarTumpuanMm, gayaTumpuKn,
  } = input

  positif('lebar', lebarMm)
  positif('tinggi', tinggiMm)
  positif('panjang', panjangM)

  const k = KELAS_KAYU[kelas]
  if (!k) throw new Error(`kelas kayu tak dikenal: ${kelas}`)
  const cd = FAKTOR_DURASI[durasi]
  if (!cd) throw new Error(`durasi beban tak dikenal: ${durasi}`)
  const cm = FAKTOR_KADAR_AIR[kadarAir]
  if (!cm) throw new Error(`kadar air tak dikenal: ${kadarAir}`)
  if (lebarTumpuanMm < 0 || gayaTumpuKn < 0) {
    throw new Error('Tumpuan dan gaya tumpu tak boleh negatif')
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const fbMpa = k.fb * cd * cm
  const fcMpa = k.fc * cd * cm
  const fcpMpa = k.fcp * cm      // tumpu TIDAK dipengaruhi durasi
  const fvMpa = k.fv * cd * cm

  const luasMm2 = lebarMm * tinggiMm
  const sectionModulusMm3 = (lebarMm * tinggiMm ** 2) / 6

  // ── Kelangsingan & tekuk ─────────────────────────────────────────────────
  const sisiTerkecil = Math.min(lebarMm, tinggiMm)
  const kelangsingan = (panjangM * 1000) / sisiTerkecil

  /*
    Batas kelangsingan 50 — di atas itu batang kayu praktis tak bisa dipakai
    sebagai batang tekan, seberapa pun besar penampangnya.
  */
  if (gayaKn < 0) {
    periksa.push({
      nama: 'Kelangsingan batang tekan',
      nilai: Math.round(kelangsingan * 100) / 100,
      syarat: 50,
      satuan: '',
      aman: kelangsingan <= 50,
      rasio: Math.round((kelangsingan / 50) * 1e4) / 1e4,
      rumus: 'L/d ≤ 50 — di atas ini kayu tak bisa jadi batang tekan',
    })
  }

  /* Faktor stabilitas kolom sederhana (Ylinen disederhanakan). */
  const feMpa = (0.822 * k.e * cm) / kelangsingan ** 2
  const rasioF = feMpa / fcMpa
  const cp = ((1 + rasioF) / 1.6) - Math.sqrt(((1 + rasioF) / 1.6) ** 2 - rasioF / 0.8)
  const fcAksialMpa = fcMpa * Math.max(0.05, Math.min(1, cp))

  const phiTekanKn = (fcAksialMpa * luasMm2) / 1000
  const phiTarikKn = (fcMpa * luasMm2) / 1000
  const phiLenturKnm = (fbMpa * sectionModulusMm3) / 1e6

  if (gayaKn < 0) {
    periksa.push({
      nama: 'Kapasitas tekan',
      nilai: Math.round(phiTekanKn * 100) / 100,
      syarat: Math.round(Math.abs(gayaKn) * 100) / 100,
      satuan: 'kN',
      aman: phiTekanKn >= Math.abs(gayaKn),
      rasio: phiTekanKn > 0 ? Math.round((Math.abs(gayaKn) / phiTekanKn) * 1e4) / 1e4 : Infinity,
      rumus: 'Fc* · Cp · A ≥ P — termasuk faktor stabilitas kolom',
    })
  } else if (gayaKn > 0) {
    periksa.push({
      nama: 'Kapasitas tarik',
      nilai: Math.round(phiTarikKn * 100) / 100,
      syarat: Math.round(gayaKn * 100) / 100,
      satuan: 'kN',
      aman: phiTarikKn >= gayaKn,
      rasio: phiTarikKn > 0 ? Math.round((gayaKn / phiTarikKn) * 1e4) / 1e4 : Infinity,
      rumus: 'Ft · A ≥ T',
    })
  }

  if (momenKnm > 0) {
    periksa.push({
      nama: 'Lentur',
      nilai: Math.round(phiLenturKnm * 100) / 100,
      syarat: Math.round(momenKnm * 100) / 100,
      satuan: 'kNm',
      aman: phiLenturKnm >= momenKnm,
      rasio: phiLenturKnm > 0 ? Math.round((momenKnm / phiLenturKnm) * 1e4) / 1e4 : Infinity,
      rumus: 'Fb · S ≥ M',
    })
  }

  // ── TUMPU TEGAK LURUS SERAT ──────────────────────────────────────────────
  /*
    Inilah yang paling sering gagal dan paling jarang diperiksa. Kayu kelas II
    kuat tekan sejajar 42,5 MPa tetapi tegak lurus hanya 15 MPa — bedanya
    hampir 3×, dan pada kelas IV bedanya 4,5×.

    Yang terjadi di lapangan: gording menekan kuda-kuda tegak lurus seratnya,
    kayunya penyok, atapnya turun, dan tak ada yang mengira sebabnya tumpuan.
  */
  if (gayaTumpuKn > 0 && lebarTumpuanMm > 0) {
    const luasTumpuMm2 = lebarTumpuanMm * lebarMm
    const phiTumpuKn = (fcpMpa * luasTumpuMm2) / 1000

    periksa.push({
      nama: 'Tumpu tegak lurus serat',
      nilai: Math.round(phiTumpuKn * 100) / 100,
      syarat: Math.round(gayaTumpuKn * 100) / 100,
      satuan: 'kN',
      aman: phiTumpuKn >= gayaTumpuKn,
      rasio: phiTumpuKn > 0 ? Math.round((gayaTumpuKn / phiTumpuKn) * 1e4) / 1e4 : Infinity,
      rumus: 'Fc⊥ · A_tumpu ≥ R — Fc⊥ JAUH lebih kecil daripada Fc sejajar',
    })

    catatan.push(
      `Kuat tumpu tegak lurus serat ${fcpMpa.toFixed(1)} MPa, sementara tekan `
      + `sejajar ${fcMpa.toFixed(1)} MPa — beda ${(fcMpa / fcpMpa).toFixed(1)}×. `
      + 'Yang terjadi di lapangan: gording menekan kuda-kuda tegak lurus '
      + 'seratnya, kayunya penyok, atapnya turun, dan tak ada yang mengira '
      + 'sebabnya tumpuan.',
    )
  } else {
    catatan.push(
      'Tumpu tegak lurus serat TIDAK diperiksa (tak ada gaya tumpu diisi). '
      + 'Ini pemeriksaan yang paling sering gagal pada kuda-kuda kayu — isi '
      + 'gaya dan lebar tumpuannya bila batang ini menumpu atau ditumpu.',
    )
  }

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const kayuM3 = (lebarMm / 1000) * (tinggiMm / 1000) * panjangM * jumlah
  /* Berat jenis kayu kering udara ~600 kg/m³ (kelas II–III). */
  const beratKayuKg = kayuM3 * 600

  catatan.push(
    `Faktor durasi ${cd} (${durasi}) dan kadar air ${cm} (${kadarAir}) sudah `
    + 'diterapkan. Kayu yang dibebani TERUS-MENERUS patah pada beban yang '
    + 'sanggup ditahannya sesaat — faktor durasi bukan kehati-hatian '
    + 'berlebihan melainkan sifat bahannya.',
  )
  if (kadarAir === 'basah') {
    catatan.push(
      'Kayu BASAH: kekuatannya 30% lebih rendah, DAN ia menyusut saat kering '
      + 'sehingga sambungannya longgar. Pasang kayu kering udara, atau '
      + 'kencangkan ulang sambungannya sesudah beberapa bulan.',
    )
  }
  catatan.push(
    'Yang BELUM diperiksa: SAMBUNGAN (paku, baut, pelat gigi) — pada kuda-kuda '
    + 'kayu, sambungan hampir selalu lebih lemah daripada batangnya, dan '
    + 'kapasitasnya bergantung jenis alat sambung serta jarak ke tepi kayu. '
    + 'Batang yang cukup tak menjamin kuda-kudanya cukup.',
  )
  catatan.push(
    'Rayap dan jamur TIDAK dihitung dan tak bisa dihitung — keduanya '
    + 'menghabiskan kayu yang perhitungannya sempurna. Kayu struktural wajib '
    + 'diawetkan, dan atapnya wajib bisa diperiksa.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    kapasitas: {
      fbTerkoreksiMpa: Math.round(fbMpa * 100) / 100,
      fcTerkoreksiMpa: Math.round(fcMpa * 100) / 100,
      fcpTerkoreksiMpa: Math.round(fcpMpa * 100) / 100,
      kelangsingan: Math.round(kelangsingan * 100) / 100,
      phiTekanKn: Math.round(phiTekanKn * 100) / 100,
      phiTarikKn: Math.round(phiTarikKn * 100) / 100,
      phiLenturKnm: Math.round(phiLenturKnm * 100) / 100,
    },
    volume: {
      /*
        `betonM3` menampung volume KAYU — satuannya sama (m³) dan pembaca
        rekap menjumlahkannya sebagai "volume bahan utama". Catatan di bawah
        menyatakan bahwa angka itu kayu, bukan beton.
      */
      betonM3: Math.round(kayuM3 * 1e5) / 1e5,
      bekistingM2: 0,
      besi: [],
      besiTotalKg: 0,
      beratSendiriKg: Math.round(beratKayuKg * 1e4) / 1e4,
    },
    catatan: [
      ...catatan,
      `Kuat geser terkoreksi ${fvMpa.toFixed(1)} MPa.`,
      `Volume ${kayuM3.toFixed(4)} m³ adalah KAYU, bukan beton — ia menempati `
      + 'medan volume yang sama supaya rekap proyek bisa menjumlahkannya, '
      + 'tetapi AHSP dan harganya sama sekali berbeda. Jangan menjumlahkannya '
      + 'ke volume beton saat menyusun RAB.',
    ],
  }
}

// ── BAJA RINGAN ──────────────────────────────────────────────────────────────

/**
 * Profil baja ringan yang lazim di Indonesia.
 *
 * Tebal dalam mm (TCT — thickness coated total). Yang beredar 0,60–1,00 mm;
 * di bawah 0,75 mm hanya untuk reng, bukan kuda-kuda.
 */
export const PROFIL_BAJA_RINGAN = {
  C75_075: { tinggiMm: 75, lebarMm: 35, tebalMm: 0.75, beratKgPerM: 0.72, nama: 'C75.75' },
  C75_100: { tinggiMm: 75, lebarMm: 35, tebalMm: 1.00, beratKgPerM: 0.96, nama: 'C75.100' },
  C100_100: { tinggiMm: 100, lebarMm: 40, tebalMm: 1.00, beratKgPerM: 1.22, nama: 'C100.100' },
  R30_045: { tinggiMm: 30, lebarMm: 25, tebalMm: 0.45, beratKgPerM: 0.28, nama: 'Reng 30.45' },
} as const

export type TipeProfilRingan = keyof typeof PROFIL_BAJA_RINGAN

/** Mutu baja ringan — G550 yang lazim, MPa. */
export const FY_BAJA_RINGAN = 550

/**
 * Lapisan antikarat minimum, gram/m².
 *
 * AZ100 (100 g/m² AlZn) untuk daerah biasa; AZ150 untuk tepi pantai. Rangka
 * yang kuat tetapi berlapis tipis habis dalam belasan tahun — dan
 * mengganti rangka atap berarti membongkar seluruh penutupnya.
 */
export const LAPISAN_MIN_G_M2 = { biasa: 100, pantai: 150 } as const
export type LingkunganAtap = keyof typeof LAPISAN_MIN_G_M2

export interface InputBajaRingan {
  profil: TipeProfilRingan
  /** Panjang batang, m. */
  panjangM: number
  /** Gaya batang, kN. Positif tarik, negatif tekan. */
  gayaKn: number
  /** Jarak antar kuda-kuda, m. */
  jarakKudaKudaM: number
  /** Lapisan antikarat yang dipakai, g/m². */
  lapisanGM2: number
  lingkungan: LingkunganAtap
  /** Jumlah batang, untuk volume. */
  jumlah?: number
}

export interface HasilBajaRingan {
  periksa: Periksa[]
  aman: boolean
  kapasitas: {
    /** Luas penampang bruto, mm². */
    agMm2: number
    /** Luas EFEKTIF sesudah tekuk lokal, mm². */
    aeMm2: number
    /** Rasio efektif — inilah yang membedakan baja ringan dari baja biasa. */
    rasioEfektif: number
    kelangsingan: number
    phiTekanKn: number
    phiTarikKn: number
  }
  /* Bentuk KANONIK — alasan sama dengan kayu di atas. */
  volume: VolumeElemen
  catatan: string[]
}

/**
 * Batang rangka atap baja ringan.
 *
 * TEKUK LOKAL mengendalikan, bukan leleh: baja setebal 0,75 mm menekuk pada
 * tegangan jauh di bawah kuat lelehnya, dan kapasitas penampangnya dihitung
 * dengan LEBAR EFEKTIF.
 */
export function analisaBajaRingan(input: InputBajaRingan): HasilBajaRingan {
  const { profil, panjangM, gayaKn, jarakKudaKudaM, lapisanGM2, lingkungan } = input

  positif('panjang', panjangM)
  positif('jarak kuda-kuda', jarakKudaKudaM)
  positif('lapisan antikarat', lapisanGM2)
  if (gayaKn === 0) throw new Error('gaya batang tak boleh nol')

  const p = PROFIL_BAJA_RINGAN[profil]
  if (!p) throw new Error(`profil baja ringan tak dikenal: ${profil}`)
  const lapisanMin = LAPISAN_MIN_G_M2[lingkungan]
  if (!lapisanMin) throw new Error(`lingkungan tak dikenal: ${lingkungan}`)

  const catatan: string[] = []
  const periksa: Periksa[] = []

  /* Luas bruto profil C: badan + dua sayap + dua bibir (perkiraan). */
  const agMm2 = p.tebalMm * (p.tinggiMm + 2 * p.lebarMm + 2 * 10)

  // ── Lebar efektif (tekuk lokal) ──────────────────────────────────────────
  /*
    Inilah yang membedakan baja ringan dari baja profil biasa. Pelat setipis
    ini menekuk lokal jauh sebelum lelehnya tercapai, dan hanya sepotong dekat
    tepi yang tetap efektif.

    Rumus Winter disederhanakan: λ = 1,052/√k · (w/t) · √(f/E)
  */
  const kPelat = 4.0
  const wPerT = p.tinggiMm / p.tebalMm
  const lambda = (1.052 / Math.sqrt(kPelat)) * wPerT * Math.sqrt(FY_BAJA_RINGAN / ES_MPA)
  const rho = lambda <= 0.673 ? 1 : (1 - 0.22 / lambda) / lambda
  const rasioEfektif = Math.min(1, rho)
  const aeMm2 = agMm2 * rasioEfektif

  // ── Kelangsingan & tekuk global ──────────────────────────────────────────
  /* Radius girasi arah lemah — pendekatan untuk profil C. */
  const rMm = 0.3 * p.lebarMm
  const kelangsingan = (panjangM * 1000) / rMm

  const feMpa = (Math.PI ** 2 * ES_MPA) / kelangsingan ** 2
  const lambdaC = Math.sqrt(FY_BAJA_RINGAN / feMpa)
  const fnMpa = lambdaC <= 1.5
    ? 0.658 ** (lambdaC ** 2) * FY_BAJA_RINGAN
    : (0.877 / lambdaC ** 2) * FY_BAJA_RINGAN

  const phiTekanKn = (0.85 * aeMm2 * fnMpa) / 1000
  const phiTarikKn = (0.9 * agMm2 * FY_BAJA_RINGAN) / 1000

  const gayaAbs = Math.abs(gayaKn)
  if (gayaKn < 0) {
    periksa.push({
      nama: 'Kapasitas tekan',
      nilai: Math.round(phiTekanKn * 100) / 100,
      syarat: Math.round(gayaAbs * 100) / 100,
      satuan: 'kN',
      aman: phiTekanKn >= gayaAbs,
      rasio: phiTekanKn > 0 ? Math.round((gayaAbs / phiTekanKn) * 1e4) / 1e4 : Infinity,
      rumus: 'φ·Ae·Fn — memakai luas EFEKTIF, bukan bruto (tekuk lokal)',
    })

    periksa.push({
      nama: 'Kelangsingan batang tekan',
      nilai: Math.round(kelangsingan * 100) / 100,
      syarat: 200,
      satuan: '',
      aman: kelangsingan <= 200,
      rasio: Math.round((kelangsingan / 200) * 1e4) / 1e4,
      rumus: 'KL/r ≤ 200 (SNI 7971)',
    })
  } else {
    periksa.push({
      nama: 'Kapasitas tarik',
      nilai: Math.round(phiTarikKn * 100) / 100,
      syarat: Math.round(gayaAbs * 100) / 100,
      satuan: 'kN',
      aman: phiTarikKn >= gayaAbs,
      rasio: phiTarikKn > 0 ? Math.round((gayaAbs / phiTarikKn) * 1e4) / 1e4 : Infinity,
      rumus: 'φ·Ag·Fy — tarik memakai luas BRUTO, tekuk lokal tak berlaku',
    })
  }

  // ── Lapisan antikarat ────────────────────────────────────────────────────
  /*
    Menentukan UMUR, bukan kekuatan — dan karena itu tak pernah muncul di
    perhitungan struktur biasa. Rangka yang kuat tetapi berlapis tipis habis
    dalam belasan tahun, dan menggantinya berarti membongkar seluruh penutup
    atapnya.
  */
  periksa.push({
    nama: 'Lapisan antikarat',
    nilai: lapisanGM2,
    syarat: lapisanMin,
    satuan: 'g/m²',
    aman: lapisanGM2 >= lapisanMin,
    rasio: Math.round((lapisanMin / lapisanGM2) * 1e4) / 1e4,
    rumus: `AZ${lapisanMin} minimum untuk lingkungan ${lingkungan}`,
  })

  if (lapisanGM2 < lapisanMin) {
    catatan.push(
      `Lapisan ${lapisanGM2} g/m² di bawah minimum ${lapisanMin} g/m² untuk `
      + `lingkungan ${lingkungan}. Ini menentukan UMUR, bukan kekuatan — rangka `
      + 'yang kuat tetapi berlapis tipis habis dalam belasan tahun, dan '
      + 'menggantinya berarti membongkar seluruh penutup atapnya.',
    )
  }

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const beratKg = p.beratKgPerM * panjangM * jumlah

  const besiRingan: BarisBesi[] = [
    {
      tipe: 'BjTS',
      /* Tinggi profil dipakai sebagai penanda ukuran, bukan diameter. */
      diameterMm: p.tinggiMm,
      jumlahBatang: jumlah,
      panjangPerBatangM: panjangM,
      beratKgPerM: p.beratKgPerM,
      totalKg: Math.round(beratKg * 1e4) / 1e4,
      peran: `profil ${p.nama}`,
    },
  ]

  catatan.push(
    `Luas efektif ${(rasioEfektif * 100).toFixed(1)}% dari bruto akibat TEKUK `
    + `LOKAL (w/t = ${wPerT.toFixed(0)}). Inilah yang membedakan baja ringan `
    + 'dari baja profil biasa: pelat setipis ini menekuk jauh sebelum lelehnya '
    + 'tercapai, dan menghitungnya dengan luas bruto melebihkan kapasitas.',
  )
  catatan.push(
    'Yang BELUM diperiksa: SAMBUNGAN sekrup (jumlah, jarak tepi, dan tarik '
    + 'cabut), yang pada rangka baja ringan hampir selalu lebih lemah daripada '
    + 'batangnya. Juga ikatan angin dan bracing — rangka baja ringan sangat '
    + 'langsing dan mudah terpuntir sebelum bracingnya terpasang penuh.',
  )
  catatan.push(
    'Beban ANGIN pada atap belum dihitung di sini. Rangka ringan justru paling '
    + 'rentan pada hisap angin karena beratnya sendiri kecil — atap baja ringan '
    + 'yang terangkat utuh adalah kegagalan yang sudah sering terjadi.',
  )

  return {
    periksa,
    aman: periksa.every((x) => x.aman),
    kapasitas: {
      agMm2: Math.round(agMm2 * 100) / 100,
      aeMm2: Math.round(aeMm2 * 100) / 100,
      rasioEfektif: Math.round(rasioEfektif * 1e4) / 1e4,
      kelangsingan: Math.round(kelangsingan * 100) / 100,
      phiTekanKn: Math.round(phiTekanKn * 100) / 100,
      phiTarikKn: Math.round(phiTarikKn * 100) / 100,
    },
    /*
      Baja ringan masuk sebagai baris BESI berperan `profil`, sama dengan
      baja profil biasa — supaya tabel "kebutuhan besi & baja profil" di layar
      menampilkannya dengan benar, dan `struktur-ke-rab` mengenalinya sebagai
      baja-profil (AHSP-nya memang beda dari tulangan beton).
    */
    volume: {
      betonM3: 0,
      bekistingM2: 0,
      besi: besiRingan,
      besiTotalKg: Math.round(beratKg * 1e4) / 1e4,
      beratSendiriKg: Math.round(beratKg * 1e4) / 1e4,
    },
    catatan,
  }
}
