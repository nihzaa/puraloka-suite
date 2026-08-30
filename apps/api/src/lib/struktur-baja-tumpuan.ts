// Base plate & angkur: tumpuan kolom baja ke pondasi beton (SNI 1729 §J8).
// PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Kolom baja tak bisa berdiri langsung di atas beton: tegangan tumpu baja jauh
// melebihi kuat tekan beton, sehingga ujung kolom akan MELESAK ke dalam pondasi
// seperti paku ditekan ke kayu. Base plate menyebarkan bebannya ke luasan yang
// cukup, dan angkur menahannya dari terangkat serta bergeser.
//
// Modul baja sebelumnya menghitung kolomnya (`analisaKolomBaja`) dan
// sambungan antar batang (`struktur-baja-sambungan.ts`) — tetapi TIDAK titik
// pertemuannya dengan pondasi. Padahal di sanalah dua bahan dengan sifat yang
// sama sekali berbeda bertemu, dan pertemuan dua bahan berbeda selalu jadi
// titik lemah.
//
// ── Tiga hal yang diperiksa, dan urutan seringnya menentukan
//
//   1. TUMPU BETON     apakah pelatnya cukup lebar supaya beton tak melesak
//   2. TEBAL PELAT     apakah pelatnya cukup tebal supaya tak melengkung
//   3. ANGKUR          apakah cukup menahan cabut dan geser
//
// Nomor 2 paling sering salah ditaksir. Orang memperbesar UKURAN pelat supaya
// tegangan betonnya turun, lalu lupa bahwa pelat yang makin lebar justru makin
// mudah melengkung di bagian yang menjorok — dan pelat yang melengkung berarti
// bebannya tak jadi tersebar, sehingga pemeriksaan nomor 1 pun batal.
//
// ⚠ BATAS TANGGUNG JAWAB. Yang dihitung: base plate berbeban TEKAN dengan
// momen kecil. Yang TIDAK: base plate berbeban momen besar (kolom jepit pada
// rangka portal), yang menuntut analisis distribusi tegangan segitiga dan
// angkur bertarik — itu perhitungan yang berbeda dan lebih panjang.
// ══════════════════════════════════════════════════════════════════════════════

import type { Periksa, VolumeElemen } from './struktur-beton.js'
import type { MutuBaja, ProfilBaja } from './struktur-baja.js'
import { PHI_SAMBUNGAN, type MutuBaut } from './struktur-baja-sambungan.js'

export interface InputBasePlate {
  /** Profil kolom yang ditumpu. */
  profil: ProfilBaja
  /** Mutu pelat landas. */
  mutuPelat: MutuBaja
  /** Panjang pelat (arah sumbu kuat kolom), mm. */
  panjangPelatMm: number
  /** Lebar pelat, mm. */
  lebarPelatMm: number
  /** Tebal pelat, mm. */
  tebalPelatMm: number
  /** Kuat tekan beton pondasi, MPa. */
  fcBetonMpa: number
  /**
   * Luas pondasi di bawahnya, mm² — untuk faktor pengekangan.
   *
   * Beton yang dikelilingi beton lain lebih kuat menahan tumpu daripada beton
   * di tepi: massa di sekelilingnya menahannya mengembang ke samping. SNI
   * mengizinkan kenaikan sampai 2× lewat √(A2/A1). Kosong = dianggap sama
   * dengan luas pelat (tanpa kenaikan) — asumsi AMAN.
   */
  luasPondasiMm2?: number
  /** Beban aksial tekan terfaktor, kN. */
  puKn: number
  /** Gaya geser terfaktor di dasar kolom, kN. */
  vuKn?: number
  /** Gaya cabut (uplift) terfaktor, kN. Angin/gempa bisa membalik arah beban. */
  tuKn?: number
  jumlah?: number
}

export interface InputAngkur {
  /** Diameter angkur, mm. */
  diameterMm: number
  mutu: MutuBaut
  /** Jumlah angkur. */
  jumlahAngkur: number
  /** Kedalaman tanam efektif, mm. */
  kedalamanMm: number
  /** Kuat tekan beton, MPa. */
  fcBetonMpa: number
  /** Gaya cabut terfaktor, kN. */
  tuKn: number
  /** Gaya geser terfaktor, kN. */
  vuKn: number
}

export interface HasilTumpuan {
  periksa: Periksa[]
  aman: boolean
  antara: Record<string, number>
  catatan: string[]
  /**
   * Kuantitas material — hanya untuk yang memang punya.
   *
   * Base plate PUNYA: ia pelat baja nyata yang dipesan per lembar. Angkur
   * TIDAK punya di sini — ia dianggarkan lewat AHSP `2.3.1.2` (pemasangan
   * angkur, per kilogram), bukan dari geometri sambungannya.
   */
  volume?: VolumeElemen
}

function bilanganPositif(nama: string, v: number): void {
  if (!(v > 0)) throw new Error(`${nama} harus > 0`)
}

const rasio = (tuntutan: number, kapasitas: number) =>
  kapasitas > 0 ? tuntutan / kapasitas : Number.POSITIVE_INFINITY

/**
 * Kuat tumpu beton di bawah pelat landas, kN (SNI 2847 §14.5.6 / 1729 §J8).
 *
 *     Pp = 0,85 · f'c · A1 · √(A2/A1),  dengan √(A2/A1) ≤ 2
 *
 * Faktor √(A2/A1) itu bukan kemurahan: beton yang dikelilingi beton lain
 * memang lebih kuat menahan tumpu, karena massa di sekelilingnya menahannya
 * mengembang ke samping. Tetapi ia dibatasi 2 — di atas itu, betonnya pecah
 * membelah sebelum sempat memanfaatkan pengekangan.
 */
export function kuatTumpuBeton(
  luasPelatMm2: number, fcMpa: number, luasPondasiMm2?: number,
): { ppKn: number; faktorPengekangan: number } {
  const a1 = luasPelatMm2
  const a2 = luasPondasiMm2 && luasPondasiMm2 > a1 ? luasPondasiMm2 : a1
  const faktor = Math.min(Math.sqrt(a2 / a1), 2)
  return { ppKn: (0.85 * fcMpa * a1 * faktor) / 1000, faktorPengekangan: faktor }
}

/**
 * Tebal pelat landas MINIMUM, mm (SNI 1729 §J8, pendekatan garis leleh).
 *
 *     t ≥ l · √(2·Pu / (0,9 · Fy · B · N))
 *
 * `l` adalah panjang bagian pelat yang MENJOROK keluar dari penampang kolom —
 * bagian itulah yang melengkung, seperti papan yang ditopang di tengah.
 *
 * Yang sering salah ditaksir: memperbesar pelat menurunkan tegangan beton
 * TETAPI memperbesar `l`, sehingga tebal minimumnya justru naik. Pelat yang
 * lebar tapi tipis melengkung, dan pelat yang melengkung tak menyebarkan beban
 * — sehingga pemeriksaan tumpu beton pun batal.
 */
export function tebalPelatMinimum(
  input: Pick<InputBasePlate, 'profil' | 'panjangPelatMm' | 'lebarPelatMm' | 'mutuPelat' | 'puKn'>,
): { tMinMm: number; menjorokMm: number } {
  const { profil, panjangPelatMm: N, lebarPelatMm: B, mutuPelat, puKn } = input

  /*
    Panjang menjorok diambil yang TERBESAR dari dua arah.

    Pelat 400×600 di bawah kolom 200×200 menjorok 100 mm ke satu arah dan
    200 mm ke arah lain. Yang menentukan tebalnya adalah yang 200 — memakai
    rata-rata atau yang terkecil menghasilkan pelat yang melengkung di sisi
    panjangnya.
  */
  const m = (N - 0.95 * profil.hMm) / 2
  const n = (B - 0.80 * profil.bMm) / 2
  const l = Math.max(m, n, 0)

  const fp = puKn * 1000 / (B * N)          // tegangan rata-rata, MPa
  const tMin = l * Math.sqrt((2 * fp) / (0.9 * mutuPelat.fyMpa))

  return { tMinMm: tMin, menjorokMm: l }
}

/**
 * Analisa base plate.
 *
 * Ketiga pemeriksaan dilaporkan TERPISAH karena tindakannya bertentangan:
 * memperbesar pelat memperbaiki tumpu beton tetapi MEMPERBURUK tebal minimum.
 * Verdict gabungan "base plate tidak memadai" membuat orang memperbesar
 * pelatnya — dan itu justru memperparah kalau yang gagal tebalnya.
 */
export function analisaBasePlate(input: InputBasePlate): HasilTumpuan {
  const {
    profil, mutuPelat, panjangPelatMm: N, lebarPelatMm: B, tebalPelatMm: t,
    fcBetonMpa, puKn,
  } = input
  bilanganPositif('Panjang pelat', N)
  bilanganPositif('Lebar pelat', B)
  bilanganPositif('Tebal pelat', t)
  bilanganPositif("f'c beton", fcBetonMpa)

  const catatan: string[] = []

  if (N < profil.hMm || B < profil.bMm) {
    throw new Error(
      `Pelat ${N}x${B} mm lebih kecil dari penampang kolom `
      + `${profil.hMm}x${profil.bMm} mm — kolom tak akan berdiri di atasnya.`,
    )
  }

  const luasPelat = B * N
  const tumpu = kuatTumpuBeton(luasPelat, fcBetonMpa, input.luasPondasiMm2)
  const PHI_TUMPU = 0.65   // SNI 2847 §21.2 untuk tumpu beton
  const phiPpKn = PHI_TUMPU * tumpu.ppKn

  const tebal = tebalPelatMinimum({ profil, panjangPelatMm: N, lebarPelatMm: B, mutuPelat, puKn })

  const periksa: Periksa[] = [
    {
      nama: 'Tumpu beton di bawah pelat', nilai: phiPpKn, syarat: puKn,
      satuan: 'kN', aman: phiPpKn >= puKn, rasio: rasio(puKn, phiPpKn),
      rumus: 'phiPp = 0.65 x 0.85 f\'c x A1 x akar(A2/A1), akar dibatasi 2',
    },
    {
      nama: 'Tebal pelat landas', nilai: t, syarat: tebal.tMinMm,
      satuan: 'mm', aman: t >= tebal.tMinMm,
      rasio: tebal.tMinMm / Math.max(t, 1e-9),
      rumus: 't >= l x akar(2Pu / (0.9 Fy B N)) — l = bagian pelat yang MENJOROK',
    },
  ]

  if (tumpu.faktorPengekangan <= 1.0001 && !input.luasPondasiMm2) {
    catatan.push(
      'Luas pondasi tak diisi, sehingga pengekangan beton dianggap NOL '
      + '(asumsi aman). Bila pelat landas berada di tengah pondasi yang jauh '
      + 'lebih besar, kuat tumpunya bisa sampai 2x lipat — isi luas pondasi '
      + 'untuk memanfaatkannya.',
    )
  }

  if (t < tebal.tMinMm) {
    catatan.push(
      `Pelat KURANG TEBAL (${t} mm, perlu ${tebal.tMinMm.toFixed(1)} mm). `
      + 'Perhatikan: MEMPERBESAR ukuran pelat justru MEMPERBURUK ini, karena '
      + 'bagian yang menjorok jadi lebih panjang. Yang menolong: menebalkan '
      + 'pelat, atau menambah pengaku (stiffener) di bagian yang menjorok.',
    )
  }

  if (input.tuKn && input.tuKn > 0) {
    catatan.push(
      `Ada gaya CABUT ${input.tuKn} kN. Base plate ini hanya diperiksa `
      + 'terhadap tekan — kemampuan menahan cabut ditentukan ANGKURNYA, '
      + 'hitung terpisah dengan analisa angkur.',
    )
  }

  catatan.push(
    'Berlaku untuk base plate berbeban TEKAN dengan momen kecil. Base plate '
    + 'kolom JEPIT pada rangka portal menerima momen besar, yang membuat '
    + 'tegangan di bawahnya berbentuk segitiga dan sebagian angkur TERTARIK — '
    + 'itu perhitungan berbeda yang belum ada di sini.',
  )

  catatan.push(
    'Grouting (adukan pengisi antara pelat dan beton) TIDAK dihitung, tetapi '
    + 'WAJIB ada: tanpa grout, beban hanya bertumpu pada beberapa titik '
    + 'tonjolan beton, bukan pada seluruh luas pelat yang dihitung di atas.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeBasePlate(N, B, t, input.jumlah ?? 1),
    antara: {
      luasPelatMm2: luasPelat,
      faktorPengekangan: tumpu.faktorPengekangan,
      ppKn: tumpu.ppKn, phiPpKn,
      tebalMinMm: tebal.tMinMm, menjorokMm: tebal.menjorokMm,
      teganganTumpuMpa: puKn * 1000 / luasPelat,
      jumlah: input.jumlah ?? 1,
    },
    catatan,
  }
}

/**
 * Analisa angkur — tarik & geser (SNI 2847 Pasal 17 disederhanakan).
 *
 * Dua mekanisme kegagalan yang SANGAT berbeda:
 *
 *   1. BAJA angkurnya putus       — bergantung mutu & luas angkur
 *   2. BETON-nya jebol berbentuk kerucut — bergantung KEDALAMAN tanam
 *
 * Nomor 2 hampir selalu yang menentukan pada angkur pendek, dan ia tak bisa
 * diperbaiki dengan angkur bermutu lebih tinggi. Yang menolong cuma menanam
 * lebih dalam — dan itu keputusan yang harus diambil sebelum beton dicor,
 * bukan sesudah.
 */
export function analisaAngkur(input: InputAngkur): HasilTumpuan {
  const { diameterMm, mutu, jumlahAngkur, kedalamanMm, fcBetonMpa, tuKn, vuKn } = input
  bilanganPositif('Diameter angkur', diameterMm)
  bilanganPositif('Kedalaman tanam', kedalamanMm)
  bilanganPositif("f'c beton", fcBetonMpa)
  if (!Number.isInteger(jumlahAngkur) || jumlahAngkur < 1) {
    throw new Error('Jumlah angkur harus bilangan bulat minimal 1')
  }

  const catatan: string[] = []
  const ab = (Math.PI / 4) * diameterMm ** 2

  // ── 1. Kekuatan BAJA angkur
  const nsaKn = (0.75 * mutu.fubMpa * ab * jumlahAngkur) / 1000        // tarik §17.4.1
  const vsaKn = (0.60 * mutu.fubMpa * ab * jumlahAngkur) / 1000        // geser §17.5.1
  const PHI_BAJA = 0.75
  const phiNsa = PHI_BAJA * nsaKn
  const phiVsa = PHI_BAJA * vsaKn

  /*
    ── 2. JEBOL BETON berbentuk kerucut (concrete breakout), §17.4.2

        Ncb = 10 · √f'c · hef^1.5     (satu angkur, tanpa pengaruh tepi)

    Pangkat 1,5 pada kedalaman itu yang membuatnya sangat peka: menanam 1,5×
    lebih dalam memberi 1,84× kapasitas. Sebaliknya, angkur yang dipasang
    lebih dangkal dari rencana — hal yang lazim terjadi karena tulangan
    pondasi menghalangi — kehilangan kapasitas jauh lebih cepat daripada yang
    diduga orang di lapangan.

    ⚠ Rumus ini mengabaikan pengaruh JARAK KE TEPI dan jarak antar angkur.
    Keduanya MENURUNKAN kapasitas, kadang drastis: angkur dekat tepi pondasi
    menjebol beton ke samping, bukan ke atas. Dinyatakan di catatan.
  */
  const ncbSatuKn = (10 * Math.sqrt(fcBetonMpa) * Math.pow(kedalamanMm, 1.5)) / 1000
  const PHI_BETON = 0.70
  const phiNcb = PHI_BETON * ncbSatuKn * jumlahAngkur

  const periksa: Periksa[] = [
    {
      nama: 'Tarik baja angkur', nilai: phiNsa, syarat: tuKn,
      satuan: 'kN', aman: phiNsa >= tuKn, rasio: rasio(tuKn, phiNsa),
      rumus: 'phiNsa = 0.75 x 0.75 Futa x Ase x n angkur',
    },
    {
      nama: 'Jebol beton (cabut angkur)', nilai: phiNcb, syarat: tuKn,
      satuan: 'kN', aman: phiNcb >= tuKn, rasio: rasio(tuKn, phiNcb),
      rumus: 'phiNcb = 0.70 x 10 akar(f\'c) x hef^1.5 x n — bergantung KEDALAMAN',
    },
    {
      nama: 'Geser baja angkur', nilai: phiVsa, syarat: vuKn,
      satuan: 'kN', aman: phiVsa >= vuKn, rasio: rasio(vuKn, phiVsa),
      rumus: 'phiVsa = 0.75 x 0.60 Futa x Ase x n angkur',
    },
  ]

  if (phiNcb < phiNsa) {
    catatan.push(
      'JEBOL BETON yang menentukan, bukan kekuatan bajanya. Memakai angkur '
      + 'bermutu lebih tinggi TIDAK menolong sama sekali — yang menolong cuma '
      + 'MENANAM LEBIH DALAM. Dan itu keputusan yang harus diambil sebelum '
      + 'beton dicor, bukan sesudah.',
    )
  }

  catatan.push(
    'Pengaruh JARAK KE TEPI dan jarak antar angkur TIDAK diperhitungkan. '
    + 'Keduanya MENURUNKAN kapasitas jebol beton, kadang drastis: angkur dekat '
    + 'tepi pondasi menjebol beton ke samping (bukan ke atas) pada beban jauh '
    + 'lebih kecil. Periksa SNI 2847 Pasal 17.4.2.1 bila angkur berada dalam '
    + '1,5 x kedalaman tanam dari tepi.',
  )

  catatan.push(
    'Angkur dianggap DICOR BERSAMA pondasi (cast-in). Angkur yang dibor '
    + 'belakangan (post-installed, chemical anchor) punya kapasitas dan cara '
    + 'hitung yang BERBEDA, dan sangat bergantung mutu pengerjaan pengeboran '
    + 'serta pembersihan lubangnya.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    antara: {
      luasAngkurMm2: ab, jumlahAngkur,
      nsaKn, vsaKn, ncbSatuKn,
      phiNsaKn: phiNsa, phiVsaKn: phiVsa, phiNcbKn: phiNcb,
      kedalamanMm,
    },
    catatan,
  }
}

/**
 * Volume pelat landas — baja PELAT, dibeli per LEMBAR.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * KENAPA INI SEMPAT HILANG, DAN KENAPA ITU MAHAL
 *
 * `analisaBasePlate` semula tak memulangkan `volume` sama sekali. Ketahuannya
 * bukan dari test — melainkan dari penjaga di `routes/v1/struktur.ts` yang
 * membedakan "jenis yang MEMANG tak bervolume" dari "jenis yang seharusnya
 * punya tetapi tak memulangkannya".
 *
 * Tanpa penjaga itu, base plate akan hilang diam-diam dari rekap RAP — dan
 * satu gedung baja bisa punya puluhan pelat landas tebal 20-30 mm. Pelat 350x350x30
 * beratnya 28,9 kg; dua puluh di antaranya 578 kg baja yang tak teranggarkan.
 *
 * ── Kenapa per LEMBAR, bukan per kilogram
 *
 * Pelat baja dijual per lembar 1,2 x 2,4 m. Pelat landas dipotong darinya, dan
 * sisa potongan berukuran ganjil jarang terpakai untuk pelat lain. Menghitung
 * per kilogram terpasang membuat RAP kekurangan — sama seperti lonjor besi dan
 * batang profil.
 * ══════════════════════════════════════════════════════════════════════════════
 */
function volumeBasePlate(
  panjangMm: number, lebarMm: number, tebalMm: number, jumlah: number,
): VolumeElemen {
  const RHO_BAJA = 7850          // kg/m3
  const LEMBAR_M2 = 1.2 * 2.4    // ukuran lembar pelat yang lazim dijual

  const luasM2 = (panjangMm / 1000) * (lebarMm / 1000)
  const beratSatuanKg = luasM2 * (tebalMm / 1000) * RHO_BAJA
  const beratTerpasangKg = beratSatuanKg * jumlah

  /*
    Berapa pelat landas muat dalam satu lembar — dibulatkan ke BAWAH, karena
    potongan yang tak utuh tak bisa dipakai.
  */
  const perLembar = Math.max(1, Math.floor(LEMBAR_M2 / luasM2))
  const lembar = Math.ceil(jumlah / perLembar)
  const beratDibeliKg = lembar * LEMBAR_M2 * (tebalMm / 1000) * RHO_BAJA

  return {
    betonM3: 0,
    bekistingM2: 0,
    besi: [{
      tipe: 'BjTS',
      diameterMm: tebalMm,      // tebal pelat sebagai penanda ukuran
      peran: `pelat landas ${panjangMm}x${lebarMm}x${tebalMm}`,
      jumlahBatang: lembar,
      panjangPerBatangM: 2.4,   // sisi panjang lembar
      beratKgPerM: (LEMBAR_M2 / 2.4) * (tebalMm / 1000) * RHO_BAJA,
      totalKg: beratDibeliKg,
    }],
    besiTotalKg: beratDibeliKg,
    beratSendiriKg: beratTerpasangKg,
  }
}

/** Faktor reduksi yang dipakai berkas ini — diekspor supaya bisa diuji. */
export const PHI_TUMPUAN = {
  tumpuBeton: 0.65,
  bajaAngkur: 0.75,
  jebolBeton: 0.70,
  sambungan: PHI_SAMBUNGAN,
} as const
