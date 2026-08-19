// PONDASI DANGKAL — menerus (batu kali/beton) dan raft. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// DUA PONDASI YANG PALING SERING DIPAKAI DAN PALING JARANG DIHITUNG
// ══════════════════════════════════════════════════════════════════════════════
//
// PONDASI MENERUS batu kali adalah pondasi paling umum di Indonesia untuk rumah
// tinggal — dan hampir tak pernah dihitung. Ukurannya diwariskan turun-temurun
// ("lebar bawah 60, atas 30, tinggi 60") tanpa seorang pun memeriksa apakah
// tanah di bawahnya sanggup. Pada tanah lunak ia amblas; pada tanah keras ia
// dua kali lebih besar daripada perlunya, dan galian serta batunya terbuang.
//
// RAFT (pelat pondasi menyeluruh) dipakai justru saat tanahnya lemah — dan di
// situlah kesalahan paling mahal: raft yang terlalu tipis melengkung, dan
// lengkungannya meretakkan seluruh lantai dasar sekaligus.
//
// ── Yang membedakan keduanya dari footplat
//
// Footplat memikul SATU kolom dan dihitung per titik. Dua pondasi ini memikul
// beban MEMANJANG (dinding) atau MENYELURUH (semua kolom sekaligus), jadi
// tekanan tanahnya dihitung per meter panjang atau per meter persegi — bukan
// per titik.
//
// ── Batu kali tidak bertulang, dan itu menentukan segalanya
//
// Pasangan batu kali praktis tak punya kuat tarik. Ia hanya boleh menyalurkan
// beban lewat TEKAN, dan itu berarti bentuknya harus cukup gemuk sehingga
// garis beban tak keluar dari badannya — aturan "sudut sebar 60°". Menghitung
// pondasi batu kali dengan rumus beton bertulang menghasilkan ukuran yang jauh
// lebih ramping daripada yang boleh dipakai.
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON } from './struktur-beton.js'
import {
  analisaPenurunan, type JenisTanahPenurunan,
} from './struktur-penurunan.js'
import type { HasilElemen, Periksa, VolumeElemen, BarisBesi } from './struktur-beton.js'

/** Berat volume pasangan batu kali, kN/m³ — SNI 1727 Tabel C3-1. */
export const BERAT_BATU_KALI_KN_M3 = 22

/** Berat volume beton bertulang, kN/m³. */
export const BERAT_BETON_KN_M3 = 24

/**
 * Sudut sebar beban pada pasangan batu kali, derajat dari vertikal.
 *
 * Beban dari dinding menyebar ke bawah membentuk kerucut. Bagian pondasi di
 * LUAR kerucut itu tidak memikul apa pun — ia hanya menambah berat dan biaya.
 * Sebaliknya, pondasi yang terlalu lebar terhadap tingginya membuat tepinya
 * bekerja sebagai kantilever, dan batu kali tak sanggup menahan tarik.
 *
 * 60° adalah angka praktik lapangan Indonesia, sama dengan yang dipakai
 * spreadsheet perencana; lebih landai dari itu menuntut pondasi beton bertulang.
 */
export const SUDUT_SEBAR_DERAJAT = 60

export type JenisPondasiMenerus = 'batu_kali' | 'beton_bertulang'

export interface InputPondasiMenerus {
  jenis: JenisPondasiMenerus
  /** Lebar dasar pondasi, m. */
  lebarBawahM: number
  /**
   * Jenis tanah pendukung, untuk perkiraan penurunan. OPSIONAL.
   *
   * Daya dukung izin menahan KERUNTUHAN tanah, bukan penurunan. Pondasi
   * menerus rumah tinggal hampir selalu lulus daya dukung — dan pada lempung
   * lunak tetap turun berlebihan.
   */
  jenisTanahPenurunan?: JenisTanahPenurunan
  /** N-SPT rata-rata pada kedalaman pengaruh (~2B di bawah dasar). */
  nSptPenurunan?: number
  /** Jarak ke pondasi tetangga, m — untuk distorsi sudut (yang meretakkan). */
  jarakKolomM?: number
  /** Lebar puncak pondasi, m. */
  lebarAtasM: number
  /** Tinggi badan pondasi, m. */
  tinggiM: number
  /** Panjang total pondasi, m. */
  panjangM: number
  /** Kedalaman dasar pondasi dari muka tanah, m. */
  kedalamanM: number
  /** Beban dari dinding & struktur di atasnya, kN per meter panjang. */
  bebanKnPerM: number
  /** Daya dukung tanah izin, kPa (kN/m²). */
  qaKnM2: number
  /** Berat volume tanah urug di atas pondasi, kN/m³. */
  gammaTanahKnM3?: number
  /** Tebal pasir urug di bawah pondasi, m — untuk volume. */
  tebalPasirM?: number
  /** Tinggi pasangan batu kosong (aanstamping), m — untuk volume. */
  tinggiAanstampingM?: number
  jumlah?: number
}

export interface HasilPondasiMenerus extends HasilElemen {
  tekanan: {
    /** Beban total per meter panjang termasuk berat sendiri, kN/m. */
    totalKnPerM: number
    /** Tekanan pada dasar pondasi, kPa. */
    qKnM2: number
    beratSendiriKnPerM: number
    beratTanahKnPerM: number
  }
}

function positif(nama: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nama} harus angka > 0 (diterima: ${v})`)
  }
}

/**
 * Pondasi menerus — batu kali atau beton bertulang.
 *
 * Yang diperiksa: tekanan tanah, sudut sebar (batu kali saja), dan proporsi
 * yang membuatnya bekerja sebagai TEKAN murni.
 */
export function analisaPondasiMenerus(input: InputPondasiMenerus): HasilPondasiMenerus {
  const {
    jenis, lebarBawahM, lebarAtasM, tinggiM, panjangM, kedalamanM,
    bebanKnPerM, qaKnM2,
  } = input

  positif('lebar bawah', lebarBawahM)
  positif('lebar atas', lebarAtasM)
  positif('tinggi', tinggiM)
  positif('panjang', panjangM)
  positif('kedalaman', kedalamanM)
  positif('beban', bebanKnPerM)
  positif('daya dukung tanah', qaKnM2)

  if (jenis !== 'batu_kali' && jenis !== 'beton_bertulang') {
    throw new Error(`jenis pondasi tak dikenal: ${jenis}`)
  }
  if (lebarAtasM > lebarBawahM) {
    throw new Error(
      `Lebar atas (${lebarAtasM} m) tak boleh melebihi lebar bawah `
      + `(${lebarBawahM} m) — pondasi menyempit ke atas, bukan sebaliknya.`,
    )
  }
  if (kedalamanM < tinggiM) {
    throw new Error(
      `Kedalaman (${kedalamanM} m) lebih kecil daripada tinggi pondasi `
      + `(${tinggiM} m) — sebagian pondasi berada di atas muka tanah.`,
    )
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []
  const gammaTanah = input.gammaTanahKnM3 ?? 17

  // ── Tekanan pada tanah ───────────────────────────────────────────────────
  /* Luas penampang trapesium per meter panjang. */
  const luasPenampangM2 = ((lebarBawahM + lebarAtasM) / 2) * tinggiM
  const beratJenis = jenis === 'batu_kali' ? BERAT_BATU_KALI_KN_M3 : BERAT_BETON_KN_M3
  const beratSendiriKnPerM = luasPenampangM2 * beratJenis

  /*
    Tanah urug DI ATAS bahu pondasi ikut menekan. Melewatkannya mengecilkan
    tekanan 10–20% pada pondasi yang tertanam dalam — arah yang salah, karena
    yang diperiksa adalah apakah tanahnya sanggup.
  */
  const tinggiUrugM = Math.max(0, kedalamanM - tinggiM)
  const luasBahuM2 = (lebarBawahM - lebarAtasM) * tinggiUrugM
  const beratTanahKnPerM = luasBahuM2 * gammaTanah

  const totalKnPerM = bebanKnPerM + beratSendiriKnPerM + beratTanahKnPerM
  const qKnM2 = totalKnPerM / lebarBawahM

  periksa.push({
    nama: 'Daya dukung tanah',
    nilai: Math.round(qaKnM2 * 100) / 100,
    syarat: Math.round(qKnM2 * 100) / 100,
    satuan: 'kPa',
    aman: qKnM2 <= qaKnM2,
    rasio: Math.round((qKnM2 / qaKnM2) * 1e4) / 1e4,
    rumus: 'q = (beban + berat sendiri + berat tanah) / lebar ≤ qa',
  })

  // ── Sudut sebar — hanya untuk batu kali ──────────────────────────────────
  if (jenis === 'batu_kali') {
    /*
      Bahu pondasi (tonjolan tiap sisi) tak boleh melebihi tinggi × tan(60°).
      Kalau melebihi, tepinya bekerja sebagai kantilever — dan pasangan batu
      kali praktis tak punya kuat tarik.
    */
    const bahuM = (lebarBawahM - lebarAtasM) / 2
    const bahuMaksM = tinggiM * Math.tan((SUDUT_SEBAR_DERAJAT * Math.PI) / 180)

    periksa.push({
      nama: 'Sudut sebar batu kali',
      nilai: Math.round(bahuMaksM * 1000) / 1000,
      syarat: Math.round(bahuM * 1000) / 1000,
      satuan: 'm',
      aman: bahuM <= bahuMaksM,
      rasio: bahuMaksM > 0 ? Math.round((bahuM / bahuMaksM) * 1e4) / 1e4 : Infinity,
      rumus: `bahu ≤ tinggi × tan ${SUDUT_SEBAR_DERAJAT}° — batu kali menyalurkan TEKAN saja`,
    })

    if (bahuM > bahuMaksM) {
      catatan.push(
        `Bahu pondasi ${bahuM.toFixed(3)} m melewati batas sebar `
        + `${bahuMaksM.toFixed(3)} m. Bagian di luar kerucut sebar bekerja `
        + 'sebagai kantilever, dan pasangan batu kali praktis tak punya kuat '
        + 'tarik — tepinya akan pecah. Tinggikan pondasinya, sempitkan '
        + 'dasarnya, atau ganti ke beton bertulang.',
      )
    }

    catatan.push(
      'Pasangan batu kali dihitung sebagai penyalur TEKAN, bukan elemen '
      + 'bertulang. Menghitungnya dengan rumus beton bertulang menghasilkan '
      + 'ukuran yang jauh lebih ramping daripada yang boleh dipakai.',
    )
  }

  // ── Proporsi praktis ─────────────────────────────────────────────────────
  /*
    Lebar bawah minimal 1,5× lebar atas untuk pondasi menerus batu kali —
    kurang dari itu ia tak menyebarkan beban dan tak lebih baik daripada
    dinding yang langsung menumpu tanah.
  */
  if (jenis === 'batu_kali' && lebarBawahM < 1.5 * lebarAtasM) {
    catatan.push(
      `Lebar bawah ${lebarBawahM} m kurang dari 1,5× lebar atas ${lebarAtasM} m. `
      + 'Pondasi yang tak melebar tidak menyebarkan beban — ia tak lebih baik '
      + 'daripada dinding yang langsung menumpu tanah, sementara batu dan '
      + 'galiannya tetap dibayar.',
    )
  }

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const tebalPasir = input.tebalPasirM ?? 0
  const tinggiAans = input.tinggiAanstampingM ?? 0

  const volPondasiM3 = luasPenampangM2 * panjangM * jumlah
  const volPasirM3 = tebalPasir * lebarBawahM * panjangM * jumlah
  const volAansM3 = tinggiAans * lebarBawahM * panjangM * jumlah
  const volGalianM3 = lebarBawahM * kedalamanM * panjangM * jumlah

  /*
    Bekisting HANYA untuk pondasi beton bertulang. Pondasi batu kali disusun
    langsung di dalam galian tanpa cetakan — memasukkannya ke RAB adalah biaya
    yang tak pernah dikeluarkan.
  */
  const bekistingM2 = jenis === 'beton_bertulang'
    ? 2 * tinggiM * panjangM * jumlah
    : 0

  const besi: BarisBesi[] = []
  const volume: VolumeElemen = {
    betonM3: Math.round(volPondasiM3 * 1e4) / 1e4,
    bekistingM2: Math.round(bekistingM2 * 1e4) / 1e4,
    besi,
    besiTotalKg: 0,
    beratSendiriKg: Math.round(
      volPondasiM3 * (jenis === 'batu_kali' ? 2200 : RHO_BETON) * 1e4,
    ) / 1e4,
  }

  catatan.push(
    `Volume yang dipulangkan HANYA badan pondasi (${volPondasiM3.toFixed(3)} m³). `
    + `Galian ${volGalianM3.toFixed(3)} m³, pasir urug ${volPasirM3.toFixed(3)} m³, `
    + `dan aanstamping ${volAansM3.toFixed(3)} m³ ada di "antara" — ketiganya `
    + 'item RAB tersendiri dengan AHSP berbeda, dan menjumlahkannya ke satu '
    + 'angka membuat harganya salah.',
  )
  if (jenis === 'batu_kali') {
    catatan.push(
      'Pondasi batu kali TIDAK memakai bekisting — disusun langsung di dalam '
      + 'galian. Bekisting dipulangkan nol; memasukkannya ke RAB adalah biaya '
      + 'yang tak pernah dikeluarkan.',
    )
  }
  /*
    ══════════════════════════════════════════════════════════════════════════
    PENURUNAN — pondasi menerus justru yang PALING BANYAK dipakai.

    Rumah tinggal di Indonesia hampir seluruhnya memakai pondasi menerus batu
    kali. Ia hampir selalu lulus daya dukung — beban dindingnya kecil — dan
    justru karena itu tak ada yang memeriksanya lebih jauh.

    Yang membuatnya berbeda dari footplat: pondasi menerus MEMANJANG, dan
    pondasi memanjang turun lebih banyak daripada telapak bujur sangkar pada
    tekanan yang sama, karena bebannya menyebar ke tanah yang lebih dalam.
    `analisaPenurunan` sudah menangani itu lewat faktor bentuknya.

    Panjang yang dipakai untuk penurunan DIBATASI: pondasi sepanjang 40 m tak
    berperilaku seperti pelat selebar 40 m — yang menentukan hanya sepanjang
    beberapa kali lebarnya di sekitar titik yang ditinjau. Dipakai 10× lebar,
    yang sudah masuk daerah "memanjang" pada faktor bentuknya.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (input.jenisTanahPenurunan != null && input.nSptPenurunan != null) {
    try {
      const turun = analisaPenurunan({
        lebarM: lebarBawahM,
        panjangM: Math.min(panjangM, lebarBawahM * 10),
        tekananNetoKnM2: Math.max(qKnM2, 1),
        jenisTanah: input.jenisTanahPenurunan,
        nSpt: input.nSptPenurunan,
        jarakKolomM: input.jarakKolomM,
      })
      periksa.push(...turun.periksa)
      catatan.push(...turun.catatan)
      catatan.push(
        `Panjang yang dipakai untuk penurunan dibatasi `
        + `${Math.min(panjangM, lebarBawahM * 10).toFixed(1)} m (10× lebar), `
        + `bukan panjang penuh ${panjangM} m. Pondasi sepanjang puluhan meter `
        + 'tak berperilaku seperti pelat selebar itu — yang menentukan hanya '
        + 'sepanjang beberapa kali lebarnya di sekitar titik yang ditinjau.',
      )
    } catch (e) {
      catatan.push(
        `Perkiraan PENURUNAN tak dapat dijalankan: ${(e as Error).message}`,
      )
    }
  } else {
    catatan.push(
      'Penurunan (settlement) TIDAK diperiksa karena jenis tanah dan N-SPT '
      + 'belum diisi. Daya dukung izin menahan KERUNTUHAN tanah, bukan '
      + 'penurunan — dan pondasi menerus hampir selalu lulus daya dukung '
      + 'karena beban dindingnya kecil, justru karena itu tak ada yang '
      + 'memeriksanya lebih jauh. Pada lempung lunak, penurunanlah yang lebih '
      + 'dulu merusak bangunan.',
    )
  }

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      luasPenampangM2: Math.round(luasPenampangM2 * 1e4) / 1e4,
      volGalianM3: Math.round(volGalianM3 * 1e4) / 1e4,
      volPasirM3: Math.round(volPasirM3 * 1e4) / 1e4,
      volAanstampingM3: Math.round(volAansM3 * 1e4) / 1e4,
      bahuM: Math.round(((lebarBawahM - lebarAtasM) / 2) * 1e4) / 1e4,
    },
    catatan,
    tekanan: {
      totalKnPerM: Math.round(totalKnPerM * 1e4) / 1e4,
      qKnM2: Math.round(qKnM2 * 1e4) / 1e4,
      beratSendiriKnPerM: Math.round(beratSendiriKnPerM * 1e4) / 1e4,
      beratTanahKnPerM: Math.round(beratTanahKnPerM * 1e4) / 1e4,
    },
  }
}

// ── RAFT ─────────────────────────────────────────────────────────────────────

export interface InputRaft {
  /** Panjang raft, m. */
  panjangM: number
  /** Lebar raft, m. */
  lebarM: number
  /** Tebal pelat raft, mm. */
  tebalMm: number
  /** Jumlah total beban kolom yang dipikul, kN. */
  bebanTotalKn: number
  /**
   * Eksentrisitas resultan beban dari pusat raft, m.
   *
   * Nol berarti beban terpusat sempurna — hampir tak pernah terjadi, dan
   * menganggapnya nol menyembunyikan tekanan tepi yang justru menentukan.
   */
  eksentrisitasXM: number
  eksentrisitasYM: number
  qaKnM2: number
  selimutMm: number
  dUtamaMm: number
  jarakUtamaMm: number
  mutu: { fcMpa: number; fyMpa: number }
  /** Bentang terbesar antar kolom, m — menentukan momen pelat. */
  bentangKolomM: number
  jumlah?: number
}

export interface HasilRaft extends HasilElemen {
  tekanan: {
    /** Tekanan rata-rata, kPa. */
    rataKnM2: number
    /** Tekanan maksimum di tepi, kPa. */
    maksKnM2: number
    /** Tekanan minimum — negatif berarti tanah TERANGKAT. */
    minKnM2: number
    terangkat: boolean
  }
}

/**
 * Pelat pondasi menyeluruh (raft).
 *
 * Tekanan tanah dihitung dengan rumus eksentrisitas dua arah:
 *
 *     q = P/A · (1 ± 6ex/L ± 6ey/B)
 *
 * Menganggap tekanannya merata (P/A saja) menyembunyikan tekanan TEPI yang
 * bisa 2–3 kali lipat rata-rata — dan tepi itulah yang lebih dulu amblas.
 */
export function analisaRaft(input: InputRaft): HasilRaft {
  const {
    panjangM, lebarM, tebalMm, bebanTotalKn,
    eksentrisitasXM, eksentrisitasYM, qaKnM2,
    selimutMm, dUtamaMm, jarakUtamaMm, mutu, bentangKolomM,
  } = input

  positif('panjang', panjangM)
  positif('lebar', lebarM)
  positif('tebal', tebalMm)
  positif('beban total', bebanTotalKn)
  positif('daya dukung tanah', qaKnM2)
  positif('d tulangan', dUtamaMm)
  positif('jarak tulangan', jarakUtamaMm)
  positif('bentang kolom', bentangKolomM)
  positif("f'c", mutu.fcMpa)
  positif('fy', mutu.fyMpa)

  if (!Number.isFinite(eksentrisitasXM) || !Number.isFinite(eksentrisitasYM)) {
    throw new Error('Eksentrisitas harus angka (boleh nol)')
  }

  const catatan: string[] = []
  const periksa: Periksa[] = []

  const luasM2 = panjangM * lebarM
  const rataKnM2 = bebanTotalKn / luasM2

  const fx = (6 * Math.abs(eksentrisitasXM)) / panjangM
  const fy = (6 * Math.abs(eksentrisitasYM)) / lebarM
  const maksKnM2 = rataKnM2 * (1 + fx + fy)
  const minKnM2 = rataKnM2 * (1 - fx - fy)
  const terangkat = minKnM2 < 0

  periksa.push({
    nama: 'Daya dukung tanah',
    nilai: Math.round(qaKnM2 * 100) / 100,
    syarat: Math.round(maksKnM2 * 100) / 100,
    satuan: 'kPa',
    aman: maksKnM2 <= qaKnM2,
    rasio: Math.round((maksKnM2 / qaKnM2) * 1e4) / 1e4,
    rumus: 'q_maks = P/A·(1 + 6ex/L + 6ey/B) ≤ qa — TEPI, bukan rata-rata',
  })

  /*
    Tanah TIDAK BISA menarik. Kalau q_min negatif, sebagian raft terangkat dan
    seluruh beban dipikul luas yang lebih kecil — tekanan nyatanya jauh lebih
    besar daripada yang dihitung rumus di atas, dan rumus itu tak lagi berlaku.
  */
  periksa.push({
    nama: 'Tanah tidak terangkat',
    nilai: Math.round(minKnM2 * 100) / 100,
    syarat: 0,
    satuan: 'kPa',
    aman: !terangkat,
    rasio: terangkat ? Infinity : 0,
    rumus: 'q_min ≥ 0 — tanah tak bisa menarik',
  })

  if (terangkat) {
    catatan.push(
      `Tekanan minimum ${minKnM2.toFixed(2)} kPa NEGATIF: sebagian raft `
      + 'terangkat dari tanah. Seluruh beban lalu dipikul luas yang lebih '
      + 'kecil, dan tekanan nyatanya JAUH LEBIH BESAR daripada angka di atas — '
      + 'rumus eksentrisitas tak lagi berlaku. Perbesar raft, atau geser '
      + 'susunan kolomnya supaya resultannya lebih dekat ke pusat.',
    )
  }

  // ── Lentur pelat ─────────────────────────────────────────────────────────
  const d = tebalMm - selimutMm - dUtamaMm / 2
  if (d <= 0) throw new Error('Tebal raft terlalu kecil untuk selimut dan tulangan')

  /*
    Momen pelat diperkirakan dengan koefisien 1/10 — pelat menerus di atas
    banyak tumpuan. Ini PENDEKATAN; raft sesungguhnya butuh analisa pelat di
    atas fondasi elastis, dan itu disebutkan di catatan.
  */
  const muKnm = (maksKnM2 * bentangKolomM ** 2) / 10
  const asPerM = (Math.PI / 4) * dUtamaMm ** 2 * (1000 / jarakUtamaMm)
  const a = (asPerM * mutu.fyMpa) / (0.85 * mutu.fcMpa * 1000)
  const phiMn = (0.9 * asPerM * mutu.fyMpa * (d - a / 2)) / 1e6

  periksa.push({
    nama: 'Lentur',
    nilai: Math.round(phiMn * 100) / 100,
    syarat: Math.round(muKnm * 100) / 100,
    satuan: 'kNm/m',
    aman: phiMn >= muKnm,
    rasio: phiMn > 0 ? Math.round((muKnm / phiMn) * 1e4) / 1e4 : Infinity,
    rumus: 'φMn ≥ Mu = q·L²/10 (pelat menerus, PENDEKATAN)',
  })

  // ── Geser pons di sekitar kolom ──────────────────────────────────────────
  const phiVc = (0.75 * 0.17 * Math.sqrt(mutu.fcMpa) * 1000 * d) / 1000
  const vuKn = (maksKnM2 * bentangKolomM) / 2
  periksa.push({
    nama: 'Geser',
    nilai: Math.round(phiVc * 100) / 100,
    syarat: Math.round(vuKn * 100) / 100,
    satuan: 'kN/m',
    aman: phiVc >= vuKn,
    rasio: phiVc > 0 ? Math.round((vuKn / phiVc) * 1e4) / 1e4 : Infinity,
    rumus: "φVc = 0,75·0,17·√f'c·b·d ≥ Vu",
  })

  // ── Tulangan minimum ─────────────────────────────────────────────────────
  const asMin = 0.0018 * 1000 * tebalMm
  periksa.push({
    nama: 'Tulangan minimum',
    nilai: Math.round(asPerM),
    syarat: Math.round(asMin),
    satuan: 'mm²/m',
    aman: asPerM >= asMin,
    rasio: asPerM > 0 ? Math.round((asMin / asPerM) * 1e4) / 1e4 : Infinity,
    rumus: 'As ≥ 0,0018·b·h (SNI 2847 §7.6.1.1)',
  })

  // ── Volume ───────────────────────────────────────────────────────────────
  const jumlah = input.jumlah ?? 1
  const betonM3 = luasM2 * (tebalMm / 1000) * jumlah
  const bekistingM2 = 2 * (panjangM + lebarM) * (tebalMm / 1000) * jumlah

  const beratPerM = (dMm: number) => 0.0061654 * dMm * dMm
  /*
    Raft bertulang DUA ARAH, ATAS dan BAWAH — empat lapis. Menghitung satu
    lapis saja (seperti pelat lantai satu arah) kekurangan 75% besi pada elemen
    yang justru paling banyak besinya di seluruh bangunan.
  */
  const nArahX = Math.ceil((lebarM * 1000) / jarakUtamaMm) + 1
  const nArahY = Math.ceil((panjangM * 1000) / jarakUtamaMm) + 1
  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm,
      jumlahBatang: nArahX * 2 * jumlah,
      panjangPerBatangM: panjangM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nArahX * 2 * jumlah * panjangM * beratPerM(dUtamaMm),
      peran: 'utama',
    },
    {
      tipe: 'BjTS', diameterMm: dUtamaMm,
      jumlahBatang: nArahY * 2 * jumlah,
      panjangPerBatangM: lebarM,
      beratKgPerM: beratPerM(dUtamaMm),
      totalKg: nArahY * 2 * jumlah * lebarM * beratPerM(dUtamaMm),
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
    `Tekanan tepi ${maksKnM2.toFixed(2)} kPa dipakai, bukan rata-rata `
    + `${rataKnM2.toFixed(2)} kPa. Menganggap tekanan merata menyembunyikan `
    + 'tepi yang bisa 2–3 kali lipat rata-rata — dan tepi itulah yang lebih '
    + 'dulu amblas.',
  )
  catatan.push(
    'Momen memakai koefisien PENDEKATAN q·L²/10 untuk pelat menerus. Raft '
    + 'sesungguhnya berperilaku sebagai pelat di atas fondasi elastis, dan '
    + 'analisanya butuh modulus reaksi tanah yang belum ada di aplikasi ini. '
    + 'Angka di sini untuk perencanaan awal dan estimasi volume.',
  )
  catatan.push(
    'Besi dihitung DUA ARAH, ATAS dan BAWAH (empat lapis). Menghitung satu '
    + 'lapis saja kekurangan 75% besi pada elemen yang paling banyak besinya '
    + 'di seluruh bangunan.',
  )
  catatan.push(
    'Penurunan (settlement) dan penurunan TAK SERAGAM belum diperiksa. Raft '
    + 'justru dipakai saat tanahnya lemah, dan di situlah penurunan tak seragam '
    + 'yang meretakkan seluruh lantai dasar sekaligus.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume,
    antara: {
      luasM2: Math.round(luasM2 * 1e4) / 1e4,
      dMm: Math.round(d * 100) / 100,
      asPerM: Math.round(asPerM * 100) / 100,
      muKnm: Math.round(muKnm * 100) / 100,
      fx: Math.round(fx * 1e4) / 1e4,
      fy: Math.round(fy * 1e4) / 1e4,
    },
    catatan,
    tekanan: {
      rataKnM2: Math.round(rataKnM2 * 1e4) / 1e4,
      maksKnM2: Math.round(maksKnM2 * 1e4) / 1e4,
      minKnM2: Math.round(minKnM2 * 1e4) / 1e4,
      terangkat,
    },
  }
}
