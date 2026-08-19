// Analisa pelat beton bertulang dua arah (PBI'71 + SNI 2847) — PURE.
//
// ══════════════════════════════════════════════════════════════════════════════
// Bagian dari mesin hitung struktur. Lihat `struktur-beton.ts` untuk alasan
// pola (pure, golden test vs workbook, verdict ber-angka).
//
// Tabel koefisiennya ada di berkas terpisah `struktur-tabel-plat.ts` — data,
// bukan logika, dan tiga koreksi terhadap sumbernya tercatat di sana.
// ══════════════════════════════════════════════════════════════════════════════

import { beta1, RHO_BETON, KOEF_BERAT_BESI, type MutuBahan, type Periksa, type VolumeElemen, type BarisBesi } from './struktur-beton'
import { koefisienMomen, tentukanKondisi, type KondisiPelat, type Tumpuan } from './struktur-tabel-plat'

/** Satu komponen beban mati — dipisah supaya rinciannya bisa ditampilkan. */
export interface BebanMati {
  nama: string
  /** Berat volume (kN/m³) bila `tebalM` diisi, atau beban langsung (kN/m²). */
  nilai: number
  /** Tebal lapisan, m. Kosong = `nilai` sudah kN/m². */
  tebalM?: number
}

export interface InputPlat {
  /** Bentang arah Y, m. */
  lyM: number
  /** Bentang arah X, m. */
  lxM: number
  /** Tebal pelat, m. */
  hM: number
  /** Tumpuan tiap sisi. */
  tumpuan: { y1: Tumpuan; y2: Tumpuan; x1: Tumpuan; x2: Tumpuan }
  /** Diameter tulangan, mm. */
  dTulanganMm: number
  /** Jarak tulangan rencana, mm. */
  jarakTulanganMm: number
  /** Selimut beton bersih, mm. */
  selimutMm: number
  mutu: MutuBahan
  /**
   * Beban mati TAMBAHAN — berat sendiri pelat DIHITUNG OTOMATIS dan tidak
   * boleh diisi lagi di sini.
   *
   * Workbook menaruh "beban sendiri plat lantai" sebagai baris pertama yang
   * DIISI PENGGUNA (berat volume × tebal). Itu jebakan: kalau tebal pelat
   * diubah tanpa memperbarui baris itu, bebannya salah dan hasilnya tetap
   * terlihat wajar. Di sini berat sendiri turunan dari `hM` — berubah
   * bersamaan, selalu.
   */
  bebanMatiTambahan: BebanMati[]
  /** Beban hidup, kN/m². */
  bebanHidupKnM2: number
  /** Luas total pelat untuk volume, m². Kosong = lx × ly. */
  luasM2?: number
}

export interface HasilPlat {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  antara: Record<string, number>
  kondisi: KondisiPelat
  /** Momen per arah, kNm/m. */
  momen: { mulx: number; muly: number; mutx: number; muty: number; maks: number }
  catatan: string[]
}

/**
 * Analisa pelat dua arah.
 *
 * Alur (mengikuti workbook, rumusnya SNI/PBI):
 *   1. Qu = 1.2·QD + 1.6·QL          kombinasi beban terfaktor
 *   2. C dari tabel PBI per kondisi tumpuan & Ly/Lx
 *   3. Mu = C · 0.001 · Qu · Lx²     momen per meter lebar
 *   4. As perlu ← Rn → ρ → As        sama dengan balok, per meter
 *   5. As terpasang dari Ø & jarak
 */
export function analisaPlat(input: InputPlat): HasilPlat {
  const { lyM, lxM, hM, dTulanganMm, jarakTulanganMm, selimutMm, mutu } = input
  if (!(lxM > 0 && lyM > 0)) throw new Error('Bentang pelat harus > 0')
  if (!(hM > 0)) throw new Error('Tebal pelat harus > 0')
  if (!(jarakTulanganMm > 0)) throw new Error('Jarak tulangan harus > 0')

  const catatan: string[] = []

  // ── 1. Beban
  // Berat sendiri DITURUNKAN dari tebal, tidak diminta ke pengguna.
  const beratSendiriKnM2 = hM * (RHO_BETON * 9.81 / 1000)  // kg/m³ → kN/m³
  /*
    Divalidasi, bukan langsung di-`reduce`.

    Tanpa penjagaan ini, input yang tak memuat `bebanMatiTambahan` gagal dengan
    `Cannot read properties of undefined (reading 'reduce')` — pesan yang tak
    menyebut satu pun medan, dan yang membacanya akan mencari cacat di modulnya.

    Modul ini SUDAH memvalidasi medan lain dengan pesan yang menyebut namanya
    ("Tebal pelat harus > 0"); yang satu ini terlewat, dan terlewatnya baru
    ketahuan saat rute hidup dijalankan dengan input tanpa medan itu.

    Array KOSONG sah — pelat tanpa beban mati tambahan memang mungkin. Yang
    tak sah adalah tidak ada sama sekali.
  */
  if (!Array.isArray(input.bebanMatiTambahan)) {
    throw new Error(
      'Beban mati tambahan (`bebanMatiTambahan`) wajib diisi sebagai daftar — '
      + 'pakai daftar kosong bila pelat tak memikul beban mati selain berat '
      + 'sendirinya. Berat sendiri dihitung dari tebalnya, tak perlu ditulis.',
    )
  }
  const qdTambahan = input.bebanMatiTambahan.reduce(
    (s, b) => s + (b.tebalM != null ? b.nilai * b.tebalM : b.nilai), 0)
  const qdKnM2 = beratSendiriKnM2 + qdTambahan
  const quKnM2 = 1.2 * qdKnM2 + 1.6 * input.bebanHidupKnM2

  // ── 2. Koefisien momen
  // Ly/Lx SELALU ≥ 1: tabel PBI mendefinisikan Ly sebagai sisi panjang.
  // Workbook memakai MAX/MIN untuk ini; ditiru supaya hasilnya sebanding.
  const sisiPanjang = Math.max(lxM, lyM)
  const sisiPendek = Math.min(lxM, lyM)
  const rasio = Math.round((sisiPanjang / sisiPendek) * 10) / 10

  const kondisi = tentukanKondisi(
    input.tumpuan.y1, input.tumpuan.y2, input.tumpuan.x1, input.tumpuan.x2)

  const cLx = koefisienMomen(kondisi, 'Clx', rasio)
  const cLy = koefisienMomen(kondisi, 'Cly', rasio)
  const cTx = koefisienMomen(kondisi, 'Ctx', rasio)
  const cTy = koefisienMomen(kondisi, 'Cty', rasio)

  // ── 3. Momen rencana, kNm/m
  // Lx pada rumus PBI = sisi PENDEK (bentang yang menentukan).
  const lx2 = sisiPendek * sisiPendek
  const mulx = cLx.nilai * 0.001 * quKnM2 * lx2
  const muly = cLy.nilai * 0.001 * quKnM2 * lx2
  const mutx = cTx.nilai * 0.001 * quKnM2 * lx2
  const muty = cTy.nilai * 0.001 * quKnM2 * lx2
  const muMaks = Math.max(mulx, muly, mutx, muty)

  // ── 4. Kapasitas per meter lebar
  const bMm = 1000  // per 1 m lebar
  const dEfektifMm = hM * 1000 - selimutMm - dTulanganMm / 2
  if (dEfektifMm <= 0) throw new Error('Selimut + tulangan melebihi tebal pelat')

  const phi = 0.9
  const mnPerluKnm = muMaks / phi
  const rnMpa = mnPerluKnm * 1e6 / (bMm * dEfektifMm * dEfektifMm)

  // ρ dari Rn — akar kuadrat bisa negatif kalau Rn melebihi Rmax.
  const rMax = 0.75 * (beta1(mutu.fcMpa) * 0.85 * mutu.fcMpa / mutu.fyMpa
    * 600 / (600 + mutu.fyMpa))
  const rnMaks = 0.75 * rMax * mutu.fyMpa * (1 - 0.5 * 0.75 * rMax * mutu.fyMpa / (0.85 * mutu.fcMpa))
  const bisaDitulangi = rnMpa <= rnMaks

  const dalamAkar = 1 - 2 * rnMpa / (0.85 * mutu.fcMpa)
  const rhoPerlu = bisaDitulangi && dalamAkar >= 0
    ? 0.85 * mutu.fcMpa / mutu.fyMpa * (1 - Math.sqrt(dalamAkar))
    : Number.POSITIVE_INFINITY

  // ρmin pelat: SNI 2847 §7.6.1.1 — susut & suhu, 0.0018 untuk fy 420.
  const rhoMin = mutu.fyMpa >= 420 ? 0.0018 : 0.0020
  const rhoPakai = Math.max(rhoPerlu, rhoMin)
  const asPerluMm2 = rhoPakai * bMm * dEfektifMm

  // ── 5. Terpasang
  const asBatangMm2 = Math.PI / 4 * dTulanganMm * dTulanganMm
  const nPerMeter = 1000 / jarakTulanganMm
  const asAdaMm2 = nPerMeter * asBatangMm2

  const aMm = asAdaMm2 * mutu.fyMpa / (0.85 * mutu.fcMpa * bMm)
  const mnAdaKnm = asAdaMm2 * mutu.fyMpa * (dEfektifMm - aMm / 2) * 1e-6
  const phiMnKnm = phi * mnAdaKnm

  // Jarak maksimum: SNI 2847 §8.7.2.2 — min(2h, 450 mm).
  const jarakMaksMm = Math.min(2 * hM * 1000, 450)

  const periksa: Periksa[] = [
    {
      nama: 'Lentur', nilai: phiMnKnm, syarat: muMaks, satuan: 'kNm/m',
      aman: phiMnKnm >= muMaks, rasio: muMaks > 0 ? muMaks / phiMnKnm : 0,
      rumus: 'φMn = 0.9 · As · fy · (d − a/2) per meter lebar',
    },
    {
      nama: 'As terpasang', nilai: asAdaMm2, syarat: asPerluMm2, satuan: 'mm²/m',
      aman: asAdaMm2 >= asPerluMm2, rasio: asPerluMm2 / asAdaMm2,
      rumus: 'As ada = (1000/s) · ¼πD²',
    },
    {
      // Pelat terlalu tipis untuk momennya: menambah tulangan TIDAK menolong,
      // yang harus berubah adalah tebalnya. Karena itu verdict-nya dipisah —
      // "As kurang" dan "pelat terlalu tipis" menuntut tindakan berbeda.
      nama: 'Tebal pelat memadai', nilai: rnMaks, syarat: rnMpa, satuan: 'MPa',
      aman: bisaDitulangi, rasio: rnMpa / rnMaks,
      rumus: 'Rn ≤ Rn,maks — bila gagal, TEBALKAN pelat (menambah tulangan tak menolong)',
    },
    {
      nama: 'Jarak tulangan maksimum', nilai: jarakMaksMm, syarat: jarakTulanganMm,
      satuan: 'mm', aman: jarakTulanganMm <= jarakMaksMm,
      rasio: jarakTulanganMm / jarakMaksMm,
      rumus: 's ≤ min(2h, 450)',
    },
  ]

  if (!bisaDitulangi) {
    catatan.push('Rn melebihi Rn,maks — pelat terlalu tipis untuk momen ini. '
      + 'Menambah tulangan tidak menolong; tebalkan pelat atau perkecil bentang.')
  }

  /*
    Batas yang SELALU berlaku, bukan peringatan situasional.

    Batang pelat dihitung sepanjang bentang saja — tanpa kait ujung dan tanpa
    sambungan lewatan. Sama seperti balok & kolom, dan alasannya sama: panjang
    lewatan bergantung detail sambungan yang belum diketahui saat estimasi,
    dan menebaknya di sini menyembunyikan asumsi di dalam angka.

    Yang membedakannya dari catatan `bisaDitulangi` di atas: yang itu hanya
    muncul kalau pelatnya bermasalah, yang ini berlaku pada SETIAP hasil —
    termasuk yang seluruh pemeriksaannya hijau. Batas yang hanya muncul saat
    ada masalah tak pernah terbaca oleh orang yang hasilnya baik-baik saja,
    dan justru merekalah yang memakai angkanya untuk memesan besi.
  */
  catatan.push(
    'Volume besi BELUM termasuk kait ujung dan sambungan lewatan — batang '
    + 'dihitung sepanjang bentang saja. Tambahkan sendiri saat menyusun RAP.',
  )

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumePlat(input, sisiPanjang, sisiPendek),
    kondisi,
    momen: { mulx, muly, mutx, muty, maks: muMaks },
    catatan,
    antara: {
      beratSendiriKnM2, qdKnM2, quKnM2, rasio, dEfektifMm,
      cLx: cLx.nilai, cLy: cLy.nilai, cTx: cTx.nilai, cTy: cTy.nilai,
      rnMpa, rnMaks, rhoPerlu, rhoMin, rhoPakai, asPerluMm2, asAdaMm2,
      aMm, mnAdaKnm, phiMnKnm, nPerMeter,
    },
  }
}

/**
 * Volume pelat.
 *
 * Tulangan dihitung DUA ARAH (X dan Y) — pelat dua arah selalu bertulangan
 * silang. Menghitung satu arah saja adalah kesalahan yang membuat tonase
 * kurang hampir setengah, dan itu tak terlihat dari angka mana pun.
 */
function volumePlat(input: InputPlat, sisiPanjang: number, sisiPendek: number): VolumeElemen {
  const { hM, dTulanganMm, jarakTulanganMm } = input
  const luasM2 = input.luasM2 ?? (sisiPanjang * sisiPendek)

  const betonM3 = luasM2 * hM
  // Bekisting pelat = luas bawah saja (sisi tepi diabaikan: tipis dan biasanya
  // menyatu dengan bekisting balok).
  const bekistingM2 = luasM2

  const beratKgPerM = KOEF_BERAT_BESI * dTulanganMm * dTulanganMm

  /*
    ⚠ TULANGAN MENGIKUTI `luasM2`, bukan satu panel saja.

    Versi pertama menghitung beton dari `luasM2` tetapi tulangan dari
    `sisiPanjang × sisiPendek` — satu panel. Untuk pelat lantai 200 m² yang
    dianalisa lewat panel 4×3.5 m, betonnya 24 m³ sementara besinya hanya
    untuk 14 m²: **kekurangan 14× lipat**.

    Hasilnya bukan galat, melainkan RAP yang terlihat wajar dengan tonase besi
    yang mustahil. Ditemukan penjaga rasio besi/beton di
    `struktur-rekap-lintas.test.ts` — pelat memulangkan 5.1 kg/m³, padahal
    pelat normal 60–100.

    Panel tetap dipakai untuk KAPASITAS (momen bergantung bentang panel);
    yang diskalakan hanya kuantitasnya. Faktor luas dibulatkan ke atas — pelat
    3.7 panel tetap butuh potongan batang untuk panel keempat.
  */
  const luasPanelM2 = sisiPanjang * sisiPendek
  const faktorLuas = luasPanelM2 > 0 ? luasM2 / luasPanelM2 : 1

  // Arah X: batang membentang sepanjang sisiPanjang, jumlahnya sepanjang sisiPendek.
  const nArahX = (Math.ceil(sisiPendek * 1000 / jarakTulanganMm) + 1) * faktorLuas
  const nArahY = (Math.ceil(sisiPanjang * 1000 / jarakTulanganMm) + 1) * faktorLuas

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dTulanganMm, peran: 'utama',
      jumlahBatang: Math.ceil(nArahX), panjangPerBatangM: sisiPanjang,
      beratKgPerM, totalKg: Math.ceil(nArahX) * sisiPanjang * beratKgPerM,
    },
    {
      tipe: 'BjTS', diameterMm: dTulanganMm, peran: 'utama',
      jumlahBatang: Math.ceil(nArahY), panjangPerBatangM: sisiPendek,
      beratKgPerM, totalKg: Math.ceil(nArahY) * sisiPendek * beratKgPerM,
    },
  ]

  return {
    betonM3, bekistingM2, besi,
    besiTotalKg: besi.reduce((s, b) => s + b.totalKg, 0),
    beratSendiriKg: betonM3 * RHO_BETON,
  }
}
