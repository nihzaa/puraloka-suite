// KOMPOSIT BAJA-BETON — kolom komposit & pelat bondek. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// DUA BAHAN BEKERJA BERSAMA, DAN ITU MENGUBAH SEGALANYA
// ══════════════════════════════════════════════════════════════════════════════
//
// Komposit bukan sekadar "baja ditambah beton". Yang membuatnya berbeda:
// keduanya harus bekerja SEBAGAI SATU, dan itu hanya terjadi bila lekatan di
// antaranya cukup. Kalau lekatan gagal, keduanya bekerja sendiri-sendiri — dan
// jumlah dua kapasitas terpisah JAUH LEBIH KECIL daripada kapasitas komposit.
//
// KOLOM KOMPOSIT (baja terbungkus atau terisi beton) dipakai saat kolom baja
// murni terlalu langsing atau butuh ketahanan api. Betonnya bukan pembungkus
// kosmetik: ia menahan baja dari tekuk lokal, dan baja menahan beton dari
// pecah. Menghitungnya sebagai kolom baja saja mengabaikan sumbangan beton
// yang bisa separuh kapasitasnya.
//
// PELAT BONDEK memakai baja gelombang sebagai bekisting SEKALIGUS tulangan
// bawah. Yang paling sering salah bukan perhitungan akhirnya melainkan tahap
// PELAKSANAAN: sebelum beton mengeras, bondek memikul sendiri berat beton
// basah + pekerja, dan pada bentang yang sedikit terlalu panjang ia melendut
// dan betonnya menebal — menambah berat yang membuatnya melendut lebih jauh.
//
// ── Yang TIDAK dihitung di sini
//
// Ketahanan api (fire rating), yang justru salah satu alasan utama memakai
// kolom komposit. Itu butuh kurva suhu-waktu dan tabel ketebalan selimut yang
// berbeda per standar — di luar cakupan, dan disebutkan di `catatan`.
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON } from './struktur-beton.js'
import type { HasilElemen, Periksa, VolumeElemen, BarisBesi } from './struktur-beton.js'

/** Modulus elastisitas baja, MPa. */
export const ES_MPA = 200_000

/** Batas rasio luas baja terhadap luas total — SNI 1729 §I2.1. */
export const RASIO_BAJA_MIN = 0.01

/**
 * Jenis kolom komposit.
 *
 * `terbungkus` = profil baja dibungkus beton bertulang (encased)
 * `terisi`     = pipa/kotak baja diisi beton (filled)
 *
 * Keduanya berbeda perilakunya: yang terisi mendapat KEKANGAN dari pipanya
 * sehingga beton lebih kuat daripada silinder bebas; yang terbungkus tidak.
 */
export type JenisKolomKomposit = 'terbungkus' | 'terisi'

export interface InputKolomKomposit {
  jenis: JenisKolomKomposit
  /** Luas penampang profil baja, mm². */
  asBajaMm2: number
  /** Momen inersia profil baja arah lemah, mm⁴. */
  inersiaBajaMm4: number
  /** Lebar penampang beton total, mm. */
  lebarBetonMm: number
  /** Tinggi penampang beton total, mm. */
  tinggiBetonMm: number
  /** Panjang tekuk kolom, m. */
  panjangTekukM: number
  /** Luas tulangan longitudinal, mm². Nol untuk kolom terisi tanpa tulangan. */
  asTulanganMm2: number
  mutuBaja: { fyMpa: number }
  mutuBeton: { fcMpa: number }
  mutuTulangan: { fyMpa: number }
  /** Gaya aksial tekan rencana, kN. */
  puKn: number
  jumlah?: number
}

export interface HasilKolomKomposit extends HasilElemen {
  kapasitas: {
    /** Kuat nominal tekan penampang, kN. */
    pnoKn: number
    /** Beban tekuk elastis, kN. */
    peKn: number
    /** Kuat tekan rencana, kN. */
    phiPnKn: number
    /** Rasio luas baja terhadap total. */
    rasioBaja: number
    /** Sumbangan beton terhadap kapasitas, 0–1. */
    porsiBeton: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/** Modulus elastisitas beton, MPa — SNI 2847 §19.2.2. */
export function ecBeton(fcMpa: number): number {
  return 4700 * Math.sqrt(fcMpa)
}

/**
 * Kolom komposit — SNI 1729:2020 §I2.
 *
 * Kapasitasnya BUKAN jumlah kapasitas baja dan beton terpisah: keduanya
 * bekerja sebagai satu penampang dengan kekakuan gabungan, dan itu yang
 * menentukan bagaimana ia tertekuk.
 */
export function analisaKolomKomposit(input: InputKolomKomposit): HasilKolomKomposit {
  const {
    jenis, asBajaMm2, inersiaBajaMm4, lebarBetonMm, tinggiBetonMm,
    panjangTekukM, asTulanganMm2, mutuBaja, mutuBeton, mutuTulangan, puKn,
  } = input

  positif('luas baja', asBajaMm2)
  positif('inersia baja', inersiaBajaMm4)
  positif('lebar beton', lebarBetonMm)
  positif('tinggi beton', tinggiBetonMm)
  positif('panjang tekuk', panjangTekukM)
  positif('fy baja', mutuBaja.fyMpa)
  positif("f'c beton", mutuBeton.fcMpa)
  positif('Pu', puKn)
  if (asTulanganMm2 < 0) throw new Error('luas tulangan tak boleh negatif')
  if (jenis !== 'terbungkus' && jenis !== 'terisi') {
    throw new Error(`jenis kolom komposit tak dikenal: ${jenis}`)
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const luasTotalMm2 = lebarBetonMm * tinggiBetonMm
  const luasBetonMm2 = luasTotalMm2 - asBajaMm2 - asTulanganMm2
  if (luasBetonMm2 <= 0) {
    throw new Error(
      'Luas baja + tulangan melebihi penampang beton — periksa masukannya',
    )
  }

  const rasioBaja = asBajaMm2 / luasTotalMm2

  /*
    Rasio baja minimum 1%. Di bawah itu SNI tak lagi menyebutnya komposit —
    ia kolom beton bertulang dengan sedikit baja, dan rumus di bawah tak
    berlaku. Menghitungnya tetap sebagai komposit melebihkan kapasitas.
  */
  periksa.push({
    nama: 'Rasio luas baja',
    nilai: Math.round(rasioBaja * 1e5) / 1e5,
    syarat: RASIO_BAJA_MIN,
    satuan: '',
    aman: rasioBaja >= RASIO_BAJA_MIN,
    rasio: Math.round((RASIO_BAJA_MIN / rasioBaja) * 1e4) / 1e4,
    rumus: `As/Ag ≥ ${RASIO_BAJA_MIN} — di bawah ini bukan komposit (SNI 1729 §I2.1)`,
  })

  /*
    Koefisien beton: 0,85 untuk terbungkus, 0,95 untuk TERISI.

    Bedanya bukan sembarang: beton di dalam pipa baja terkekang dari segala
    arah, dan beton terkekang lebih kuat daripada silinder bebas. Memakai 0,85
    untuk kolom terisi mengecilkan kapasitas 12% — konservatif, tetapi berarti
    kolom lebih besar daripada perlunya pada elemen yang paling mahal.
  */
  const koefBeton = jenis === 'terisi' ? 0.95 : 0.85

  const pnoKn = (
    asBajaMm2 * mutuBaja.fyMpa
    + asTulanganMm2 * mutuTulangan.fyMpa
    + koefBeton * luasBetonMm2 * mutuBeton.fcMpa
  ) / 1000

  // ── Kekakuan efektif & tekuk ─────────────────────────────────────────────
  /*
    C1 menentukan berapa banyak kekakuan beton yang diperhitungkan. Beton retak
    saat dibebani, jadi tak seluruh inersianya bekerja — dan yang terisi
    mendapat porsi lebih besar karena pipanya menahan retak.
  */
  const c1 = jenis === 'terisi'
    ? Math.min(0.9, 0.45 + 3 * rasioBaja)
    : Math.min(0.7, 0.25 + 3 * rasioBaja)

  const inersiaBetonMm4 = (lebarBetonMm * tinggiBetonMm ** 3) / 12
  const eiEfektif = ES_MPA * inersiaBajaMm4
    + c1 * ecBeton(mutuBeton.fcMpa) * inersiaBetonMm4

  const lcMm = panjangTekukM * 1000
  const peKn = (Math.PI ** 2 * eiEfektif) / (lcMm ** 2 * 1000)

  /*
    Rumus tekuk komposit sama bentuknya dengan kolom baja: elastis atau
    inelastis bergantung rasio Pno/Pe.
  */
  const pnKn = pnoKn / peKn <= 2.25
    ? pnoKn * 0.658 ** (pnoKn / peKn)
    : 0.877 * peKn

  const phiPnKn = 0.75 * pnKn

  periksa.push({
    nama: 'Kapasitas tekan',
    nilai: Math.round(phiPnKn * 100) / 100,
    syarat: Math.round(puKn * 100) / 100,
    satuan: 'kN',
    aman: phiPnKn >= puKn,
    rasio: phiPnKn > 0 ? Math.round((puKn / phiPnKn) * 1e4) / 1e4 : Infinity,
    rumus: 'φPn ≥ Pu — komposit, kekakuan gabungan (SNI 1729 §I2.1b)',
  })

  const kapasitasBajaSajaKn = (asBajaMm2 * mutuBaja.fyMpa) / 1000
  const porsiBeton = 1 - kapasitasBajaSajaKn / pnoKn

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const betonM3 = (luasBetonMm2 / 1e6) * panjangTekukM * jumlah
  const bekistingM2 = jenis === 'terbungkus'
    ? 2 * ((lebarBetonMm + tinggiBetonMm) / 1000) * panjangTekukM * jumlah
    : 0

  const beratBajaKg = (asBajaMm2 / 1e6) * panjangTekukM * 7850 * jumlah
  const beratPerM = (dMm: number) => 0.0061654 * dMm * dMm
  /* Tulangan disederhanakan jadi satu baris berdiameter setara. */
  const dSetaraMm = asTulanganMm2 > 0 ? Math.sqrt((4 * asTulanganMm2) / (Math.PI * 4)) : 0

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: Math.round(tinggiBetonMm),
      jumlahBatang: jumlah,
      panjangPerBatangM: panjangTekukM,
      beratKgPerM: (asBajaMm2 / 1e6) * 7850,
      totalKg: beratBajaKg,
      peran: `profil komposit ${jenis}`,
    },
  ]
  if (asTulanganMm2 > 0) {
    besi.push({
      tipe: 'BjTS', diameterMm: Math.round(dSetaraMm),
      jumlahBatang: 4 * jumlah,
      panjangPerBatangM: panjangTekukM,
      beratKgPerM: beratPerM(dSetaraMm),
      totalKg: 4 * jumlah * panjangTekukM * beratPerM(dSetaraMm),
      peran: 'utama',
    })
  }

  const besiBulat = besi.map((b) => ({ ...b, totalKg: Math.round(b.totalKg * 1e4) / 1e4 }))
  const volume: VolumeElemen = {
    betonM3: Math.round(betonM3 * 1e4) / 1e4,
    bekistingM2: Math.round(bekistingM2 * 1e4) / 1e4,
    besi: besiBulat,
    besiTotalKg: Math.round(besiBulat.reduce((s, b) => s + b.totalKg, 0) * 1e4) / 1e4,
    beratSendiriKg: Math.round((betonM3 * RHO_BETON + beratBajaKg) * 1e4) / 1e4,
  }

  catatan.push(
    `Sumbangan beton ${(porsiBeton * 100).toFixed(1)}% dari kapasitas penampang. `
    + 'Menghitung kolom ini sebagai kolom baja saja mengabaikan porsi itu — '
    + 'dan pada kolom terbungkus ia sering melebihi separuh.',
  )
  catatan.push(
    `Koefisien beton ${koefBeton} dipakai (${jenis}). Beton di dalam pipa baja `
    + 'TERKEKANG dari segala arah dan lebih kuat daripada silinder bebas; '
    + 'memakai 0,85 untuk kolom terisi mengecilkan kapasitas 12%.',
  )
  catatan.push(
    'KETAHANAN API belum dihitung — dan itu justru salah satu alasan utama '
    + 'memakai kolom komposit. Ia butuh kurva suhu-waktu dan tabel ketebalan '
    + 'selimut yang berbeda per standar.',
  )
  catatan.push(
    'Yang BELUM diperiksa: interaksi aksial-momen (diagram P-M komposit), '
    + 'transfer gaya antara baja dan beton di sambungan, dan geser penampang.',
  )
  if (jenis === 'terisi') {
    catatan.push(
      'Kolom TERISI menuntut lubang udara di setiap ujung supaya udara '
      + 'terjebak bisa keluar saat pengecoran. Tanpa itu terbentuk rongga yang '
      + 'tak terlihat dari luar.',
    )
  }

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      luasTotalMm2: Math.round(luasTotalMm2),
      luasBetonMm2: Math.round(luasBetonMm2),
      c1: Math.round(c1 * 1e4) / 1e4,
      eiEfektif: Math.round(eiEfektif),
      pnKn: Math.round(pnKn * 100) / 100,
      kapasitasBajaSajaKn: Math.round(kapasitasBajaSajaKn * 100) / 100,
    },
    catatan,
    kapasitas: {
      pnoKn: Math.round(pnoKn * 100) / 100,
      peKn: Math.round(peKn * 100) / 100,
      phiPnKn: Math.round(phiPnKn * 100) / 100,
      rasioBaja: Math.round(rasioBaja * 1e5) / 1e5,
      porsiBeton: Math.round(porsiBeton * 1e4) / 1e4,
    },
  }
}

// ── PELAT BONDEK ─────────────────────────────────────────────────────────────

/** Berat beton basah, kN/m³ — lebih berat daripada beton kering. */
export const BERAT_BETON_BASAH_KN_M3 = 25

/** Beban pekerja & alat saat pengecoran, kPa — SNI 1727 §4.11. */
export const BEBAN_PELAKSANAAN_KPA = 1.0

/** Batas lendutan bondek saat pelaksanaan — bentang/180 atau 20 mm. */
export const RASIO_LENDUT_PELAKSANAAN = 1 / 180
export const LENDUT_MAKS_MM = 20

export interface InputBondek {
  /** Bentang bersih antar tumpuan, m. */
  bentangM: number
  /** Tebal pelat total dari dasar gelombang, mm. */
  tebalTotalMm: number
  /** Tinggi gelombang bondek, mm. */
  tinggiGelombangMm: number
  /** Tebal baja bondek, mm. */
  tebalBajaMm: number
  /** Luas penampang bondek per meter lebar, mm²/m. */
  asBondekMm2PerM: number
  /** Momen inersia bondek per meter lebar, mm⁴/m. */
  inersiaBondekMm4PerM: number
  mutuBondek: { fyMpa: number }
  mutuBeton: { fcMpa: number }
  /** Beban hidup rencana, kPa. */
  bebanHidupKpa: number
  /** Beban mati tambahan (finishing, plafon), kPa. */
  bebanMatiTambahanKpa: number
  /** Ada tumpuan sementara saat pengecoran? */
  adaPenyanggaSementara?: boolean
  /** Luas pelat, m² — untuk volume. */
  luasM2: number
  jumlah?: number
}

export interface HasilBondek extends HasilElemen {
  pelaksanaan: {
    /** Beban saat pengecoran, kPa. */
    bebanCorKpa: number
    /** Lendutan bondek saat pengecoran, mm. */
    lendutanMm: number
    lendutanBatasMm: number
    /** Tebal beton tambahan akibat lendutan (ponding), mm. */
    tambahanTebalMm: number
  }
  layan: {
    /** Momen rencana saat layan, kNm/m. */
    muKnm: number
    phiMnKnm: number
  }
}

/**
 * Pelat komposit bondek.
 *
 * Diperiksa DUA tahap: pelaksanaan (bondek sendirian memikul beton basah) dan
 * layan (komposit penuh). Tahap pelaksanaan yang paling sering menentukan, dan
 * paling sering dilewatkan.
 */
export function analisaBondek(input: InputBondek): HasilBondek {
  const {
    bentangM, tebalTotalMm, tinggiGelombangMm, tebalBajaMm,
    asBondekMm2PerM, inersiaBondekMm4PerM,
    mutuBondek, mutuBeton, bebanHidupKpa, bebanMatiTambahanKpa, luasM2,
  } = input

  positif('bentang', bentangM)
  positif('tebal total', tebalTotalMm)
  positif('tinggi gelombang', tinggiGelombangMm)
  positif('tebal baja', tebalBajaMm)
  positif('luas bondek', asBondekMm2PerM)
  positif('inersia bondek', inersiaBondekMm4PerM)
  positif('fy bondek', mutuBondek.fyMpa)
  positif("f'c beton", mutuBeton.fcMpa)
  positif('luas pelat', luasM2)
  if (bebanHidupKpa < 0 || bebanMatiTambahanKpa < 0) {
    throw new Error('Beban tak boleh negatif')
  }
  if (tinggiGelombangMm >= tebalTotalMm) {
    throw new Error(
      `Tinggi gelombang (${tinggiGelombangMm} mm) ≥ tebal total `
      + `(${tebalTotalMm} mm) — tak ada beton di atas gelombang.`,
    )
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  // ── TAHAP PELAKSANAAN ────────────────────────────────────────────────────
  /*
    Sebelum beton mengeras, bondek memikul SENDIRI berat beton basah + pekerja.
    Inilah tahap yang paling sering menentukan dan paling sering dilewatkan.

    Tebal rata-rata memperhitungkan gelombang: beton mengisi lembah gelombang,
    jadi volumenya kurang dari tebal total × luas.
  */
  const tebalRataMm = tebalTotalMm - tinggiGelombangMm / 2
  const beratBetonBasahKpa = (tebalRataMm / 1000) * BERAT_BETON_BASAH_KN_M3
  const bebanCorKpa = beratBetonBasahKpa + BEBAN_PELAKSANAAN_KPA

  const bentangEfektifM = input.adaPenyanggaSementara ? bentangM / 2 : bentangM
  const lMm = bentangEfektifM * 1000

  /* Lendutan pelat menerus: 5wL⁴/384EI, disederhanakan tumpuan sederhana. */
  const wNPerMm = bebanCorKpa   // kPa = kN/m² = N/mm² × 1e-3 → per mm lebar: N/mm
  const lendutanMm = (5 * wNPerMm * lMm ** 4)
    / (384 * ES_MPA * inersiaBondekMm4PerM)

  const lendutanBatasMm = Math.min(lMm * RASIO_LENDUT_PELAKSANAAN, LENDUT_MAKS_MM)

  periksa.push({
    nama: 'Lendutan saat pengecoran',
    nilai: Math.round(lendutanMm * 100) / 100,
    syarat: Math.round(lendutanBatasMm * 100) / 100,
    satuan: 'mm',
    aman: lendutanMm <= lendutanBatasMm,
    rasio: lendutanBatasMm > 0
      ? Math.round((lendutanMm / lendutanBatasMm) * 1e4) / 1e4
      : Infinity,
    rumus: 'δ ≤ min(L/180, 20 mm) — bondek memikul beton BASAH sendirian',
  })

  /*
    PONDING: bondek yang melendut membuat beton di tengahnya lebih tebal, dan
    tambahan berat itu membuatnya melendut lebih jauh. Lingkaran yang
    memperkuat dirinya sendiri, dan pada bentang yang sedikit terlalu panjang
    ia berakhir dengan bondek yang runtuh saat pengecoran.
  */
  const tambahanTebalMm = lendutanMm * 0.7
  if (lendutanMm > lendutanBatasMm) {
    catatan.push(
      `Bondek melendut ${lendutanMm.toFixed(1)} mm saat pengecoran, melebihi `
      + `batas ${lendutanBatasMm.toFixed(1)} mm. Beton di tengah bentang jadi `
      + `~${tambahanTebalMm.toFixed(0)} mm lebih tebal, dan tambahan berat itu `
      + 'membuatnya melendut lebih jauh — lingkaran yang memperkuat dirinya '
      + 'sendiri. Pasang penyangga sementara di tengah bentang.',
    )
  }

  // ── TAHAP LAYAN (komposit) ───────────────────────────────────────────────
  const wuKpa = 1.2 * (
    (tebalRataMm / 1000) * 24 + bebanMatiTambahanKpa
  ) + 1.6 * bebanHidupKpa
  const muKnm = (wuKpa * bentangM ** 2) / 8

  /*
    Bondek berperan sebagai tulangan tarik. Lengan momen diambil dari pusat
    bondek ke pusat blok tekan beton di atas gelombang.
  */
  const dEfektifMm = tebalTotalMm - tinggiGelombangMm / 2
  const aMm = (asBondekMm2PerM * mutuBondek.fyMpa) / (0.85 * mutuBeton.fcMpa * 1000)
  const phiMnKnm = (0.9 * asBondekMm2PerM * mutuBondek.fyMpa * (dEfektifMm - aMm / 2)) / 1e6

  periksa.push({
    nama: 'Lentur',
    nilai: Math.round(phiMnKnm * 100) / 100,
    syarat: Math.round(muKnm * 100) / 100,
    satuan: 'kNm/m',
    aman: phiMnKnm >= muKnm,
    rasio: phiMnKnm > 0 ? Math.round((muKnm / phiMnKnm) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn ≥ Mu — bondek sebagai tulangan tarik (tahap komposit)',
  })

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const betonM3 = (tebalRataMm / 1000) * luasM2 * jumlah

  /*
    Bekisting NOL — inilah alasan utama memakai bondek. Ia adalah bekisting
    sekaligus tulangan, dan menghapus seluruh pekerjaan pasang-bongkar
    bekisting pelat yang biasanya 30–40% biaya pelat.
  */
  const beratBondekKgPerM2 = (asBondekMm2PerM / 1e6) * 7850
  const beratBondekKg = beratBondekKgPerM2 * luasM2 * jumlah

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: Math.round(tebalBajaMm * 10),
      jumlahBatang: jumlah,
      panjangPerBatangM: luasM2,
      beratKgPerM: beratBondekKgPerM2,
      totalKg: beratBondekKg,
      peran: 'profil bondek',
    },
  ]

  const besiBulat = besi.map((b) => ({ ...b, totalKg: Math.round(b.totalKg * 1e4) / 1e4 }))
  const volume: VolumeElemen = {
    betonM3: Math.round(betonM3 * 1e4) / 1e4,
    bekistingM2: 0,
    besi: besiBulat,
    besiTotalKg: Math.round(besiBulat.reduce((s, b) => s + b.totalKg, 0) * 1e4) / 1e4,
    beratSendiriKg: Math.round((betonM3 * RHO_BETON + beratBondekKg) * 1e4) / 1e4,
  }

  catatan.push(
    `Volume beton memakai tebal RATA-RATA ${tebalRataMm.toFixed(0)} mm, bukan `
    + `tebal total ${tebalTotalMm} mm. Beton mengisi lembah gelombang, jadi `
    + 'volumenya kurang dari tebal total × luas — memakai tebal total '
    + `melebihkan volume ${((tebalTotalMm / tebalRataMm - 1) * 100).toFixed(0)}%.`,
  )
  catatan.push(
    'BEKISTING NOL — inilah alasan utama memakai bondek. Ia bekisting sekaligus '
    + 'tulangan, dan menghapus pekerjaan pasang-bongkar bekisting pelat yang '
    + 'biasanya 30–40% biaya pelat.',
  )
  catatan.push(
    'Tulangan SUSUT & SUHU di atas gelombang (wiremesh) belum dihitung di sini '
    + '— ia wajib ada dan biasanya M8-150. Bondek hanya menahan tarik di bawah; '
    + 'retak susut muncul di permukaan atas.',
  )
  catatan.push(
    'Yang BELUM diperiksa: kuat geser horizontal antara bondek dan beton '
    + '(bergantung bentuk embos tiap merek), tumpuan minimum di atas balok, '
    + 'dan lendutan jangka panjang akibat rangkak.',
  )
  if (input.adaPenyanggaSementara) {
    catatan.push(
      'Dihitung DENGAN penyangga sementara di tengah bentang — bentang '
      + 'efektifnya separuh. Penyangga WAJIB tetap terpasang sampai beton '
      + 'mencapai kuat rencana; membongkarnya lebih awal membuat bondek '
      + 'memikul beban yang tak pernah dihitung.',
    )
  }

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      tebalRataMm: Math.round(tebalRataMm * 100) / 100,
      dEfektifMm: Math.round(dEfektifMm * 100) / 100,
      bentangEfektifM: Math.round(bentangEfektifM * 1e4) / 1e4,
      wuKpa: Math.round(wuKpa * 100) / 100,
      aMm: Math.round(aMm * 100) / 100,
      beratBondekKgPerM2: Math.round(beratBondekKgPerM2 * 1e4) / 1e4,
    },
    catatan,
    pelaksanaan: {
      bebanCorKpa: Math.round(bebanCorKpa * 100) / 100,
      lendutanMm: Math.round(lendutanMm * 100) / 100,
      lendutanBatasMm: Math.round(lendutanBatasMm * 100) / 100,
      tambahanTebalMm: Math.round(tambahanTebalMm * 100) / 100,
    },
    layan: {
      muKnm: Math.round(muKnm * 100) / 100,
      phiMnKnm: Math.round(phiMnKnm * 100) / 100,
    },
  }
}
