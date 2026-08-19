import {
  analisaPenurunan, type JenisTanahPenurunan,
} from './struktur-penurunan.js'
// Pondasi footplat (telapak setempat) — tegangan tanah, geser, tulangan.
//
// ══════════════════════════════════════════════════════════════════════════════
// Bagian dari mesin hitung struktur. Lihat `struktur-beton.ts` untuk alasan
// pola (pure, golden test vs workbook, verdict ber-angka).
//
// ── Tiga tinjauan yang harus lolos SEMUA
//
//   1. Tegangan tanah   qmax ≤ qa, dan qmin ≥ 0 (tak boleh terangkat)
//   2. Geser satu arah  φVc ≥ Vu di bidang kritis sejarak d dari muka kolom
//   3. Geser pons       φVc ≥ Vup pada keliling d/2 mengelilingi kolom
//
// Yang paling sering menentukan ukuran footplat adalah nomor 3, bukan 1 —
// dan itu berlawanan dengan dugaan orang. Karena itu ketiganya dilaporkan
// terpisah beserta angkanya, bukan diringkas jadi satu "aman".
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON, KOEF_BERAT_BESI, type MutuBahan, type Periksa, type VolumeElemen, type BarisBesi } from './struktur-beton'

/**
 * Letak kolom pada footplat — menentukan αs pada rumus geser pons.
 * SNI 2847 §22.6.5.2: 40 interior · 30 tepi · 20 sudut.
 */
export type LetakKolom = 'tengah' | 'tepi' | 'sudut'

export const ALPHA_S: Record<LetakKolom, number> = {
  tengah: 40, tepi: 30, sudut: 20,
}

export interface InputFootplat {
  /** Lebar pondasi arah X, m. */
  lxM: number
  /** Lebar pondasi arah Y, m. */
  lyM: number
  /** Tebal pondasi, m. */
  hM: number
  /** Lebar kolom arah X, m. */
  bxM: number
  /** Lebar kolom arah Y, m. */
  byM: number
  /** Posisi as kolom dari tepi arah X, m. */
  pxM: number
  /** Posisi as kolom dari tepi arah Y, m. */
  pyM: number
  /** Tebal tanah di atas footplat, m. */
  zM: number
  /** Berat volume tanah, kN/m³. */
  gammaTanahKnM3: number
  /** Berat volume beton bertulang, kN/m³. */
  gammaBetonKnM3?: number
  letakKolom: LetakKolom
  mutu: MutuBahan
  /** Selimut beton ke pusat tulangan, m. */
  dAksenM: number
  /** Diameter tulangan, mm. */
  dTulanganMm: number
  /** Jarak tulangan, mm. */
  jarakTulanganMm: number
  /** Beban aksial terfaktor dari kolom, kN. */
  pukKn: number
  /** Momen terfaktor arah X, kNm. */
  muxKnm: number
  /** Momen terfaktor arah Y, kNm. */
  muyKnm: number
  /** Daya dukung ijin tanah, kN/m². Dari `struktur-tanah.ts`. */
  qaKnM2: number
  /*
    ══════════════════════════════════════════════════════════════════════════
    PENURUNAN — tiga medan opsional, dan ketiadaannya BUKAN "aman".

    Daya dukung izin (`qaKnM2`) di atas menahan KERUNTUHAN tanah, bukan
    penurunan. Pada pasir padat batasan penurunan hampir selalu terpenuhi
    dengan sendirinya; pada LEMPUNG LUNAK tidak — pondasi bisa lulus daya
    dukung dengan angka keamanan 3 dan tetap turun berlebihan.

    Diisi, pemeriksaan penurunan ikut dijalankan. Tak diisi, catatannya
    MENYATAKAN bahwa penurunan belum diperiksa — bukan diam-diam
    menganggapnya aman.
    ══════════════════════════════════════════════════════════════════════════
  */
  /** Jenis tanah pendukung, untuk perkiraan penurunan. */
  jenisTanahPenurunan?: JenisTanahPenurunan
  /** N-SPT rata-rata pada kedalaman pengaruh (~2B di bawah dasar telapak). */
  nSptPenurunan?: number
  /** Jarak ke kolom tetangga, m — untuk distorsi sudut (yang meretakkan). */
  jarakKolomM?: number
  jumlah?: number
}

export interface HasilFootplat {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  antara: Record<string, number>
  catatan: string[]
}

export function analisaFootplat(input: InputFootplat): HasilFootplat {
  const {
    lxM, lyM, hM, bxM, byM, pxM, pyM, zM,
    gammaTanahKnM3, letakKolom, mutu, dAksenM, dTulanganMm, jarakTulanganMm,
    pukKn, muxKnm, muyKnm, qaKnM2,
  } = input
  if (!(lxM > 0 && lyM > 0 && hM > 0)) throw new Error('Dimensi footplat harus > 0')
  if (!(bxM > 0 && byM > 0)) throw new Error('Dimensi kolom harus > 0')
  if (!(qaKnM2 > 0)) throw new Error('Daya dukung ijin tanah harus > 0')

  const gammaBeton = input.gammaBetonKnM3 ?? 24
  const catatan: string[] = []

  // ── 1. Tegangan tanah di dasar pondasi
  const aM2 = lxM * lyM
  const wxM3 = (1 / 6) * lyM * lxM * lxM
  const wyM3 = (1 / 6) * lxM * lyM * lyM
  // Beban merata dari berat sendiri footplat + tanah di atasnya.
  const qKnM2 = hM * gammaBeton + zM * gammaTanahKnM3

  const exM = muxKnm / pukKn
  const eyM = muyKnm / pukKn
  const exBatasM = lxM / 6
  const eyBatasM = lyM / 6

  const qmax = pukKn / aM2 + muxKnm / wxM3 + muyKnm / wyM3 + qKnM2
  const qmin = pukKn / aM2 - muxKnm / wxM3 - muyKnm / wyM3 + qKnM2

  // ── 2. Geser satu arah
  const dM = hM - dAksenM
  if (dM <= 0) throw new Error('Selimut melebihi tebal footplat')

  const cxM = lxM - pxM - 0.5 * (bxM + dM)
  const cyM = lyM - pyM - 0.5 * (byM + dM)
  const perluGeserX = cxM > dM
  const perluGeserY = cyM > dM

  const bc = bxM / byM
  const alphaS = ALPHA_S[letakKolom]
  const akarFc = Math.sqrt(mutu.fcMpa)
  const phiGeser = 0.75

  /** Vc terkecil dari tiga persamaan SNI §22.6.5.2 — dalam kN. */
  const vcTerkecil = (bMm: number, dMm: number) => Math.min(
    (1 + 2 / bc) * akarFc * bMm * dMm / 6 * 0.001,
    (alphaS * dMm / bMm + 2) * akarFc * bMm * dMm / 12 * 0.001,
    (1 / 3) * akarFc * bMm * dMm * 0.001,
  )

  // Tegangan tanah di bidang kritis (interpolasi linier qmin→qmax).
  const qxKritis = qmin + ((lxM - cxM) / lxM) * (qmax - qmin)
  const qyKritis = qmin + ((lyM - cyM) / lyM) * (qmax - qmin)
  // Gaya geser = tegangan neto (dikurangi berat sendiri q) × luas di luar kritis.
  const vuxKn = perluGeserX ? (qxKritis + (qmax - qxKritis) / 2 - qKnM2) * cxM * lyM : 0
  const vuyKn = perluGeserY ? (qyKritis + (qmax - qyKritis) / 2 - qKnM2) * cyM * lxM : 0

  const phiVcxKn = phiGeser * vcTerkecil(lyM * 1000, dM * 1000)
  const phiVcyKn = phiGeser * vcTerkecil(lxM * 1000, dM * 1000)

  if (!perluGeserX && !perluGeserY) {
    catatan.push('Bidang kritis geser jatuh di dalam kolom (c ≤ d) — '
      + 'geser satu arah tidak menentukan untuk footplat seukuran ini.')
  }

  // ── 3. Geser pons (punching shear)
  // Keliling kritis: kotak sejarak d/2 dari muka kolom.
  const b0M = 2 * (bxM + dM) + 2 * (byM + dM)
  const luasDalamM2 = (bxM + dM) * (byM + dM)
  // Gaya pons = beban kolom dikurangi tekanan tanah di dalam keliling kritis.
  const qRataKnM2 = (qmax + qmin) / 2
  const vupKn = pukKn - (qRataKnM2 - qKnM2) * luasDalamM2
  const phiVcPonsKn = phiGeser * vcTerkecil(b0M * 1000, dM * 1000)

  // ── 4. Tulangan lentur (kantilever dari muka kolom)
  const lenganXM = (lxM - bxM) / 2
  const lenganYM = (lyM - byM) / 2
  // Momen per meter lebar, memakai tegangan neto maksimum.
  const qNetoKnM2 = Math.max(qmax - qKnM2, 0)
  const muxPerM = 0.5 * qNetoKnM2 * lenganXM * lenganXM
  const muyPerM = 0.5 * qNetoKnM2 * lenganYM * lenganYM
  const muPerM = Math.max(muxPerM, muyPerM)

  const dMm = dM * 1000
  const asBatangMm2 = Math.PI / 4 * dTulanganMm * dTulanganMm
  const asAdaMm2 = (1000 / jarakTulanganMm) * asBatangMm2
  const aMm = asAdaMm2 * mutu.fyMpa / (0.85 * mutu.fcMpa * 1000)
  const phiMnKnm = 0.9 * asAdaMm2 * mutu.fyMpa * (dMm - aMm / 2) * 1e-6

  // ρmin footplat = ρmin pelat (susut & suhu).
  const rhoMin = mutu.fyMpa >= 420 ? 0.0018 : 0.0020
  const asMinMm2 = rhoMin * 1000 * dMm

  const periksa: Periksa[] = [
    {
      nama: 'Eksentrisitas arah X', nilai: exBatasM, syarat: exM, satuan: 'm',
      aman: exM <= exBatasM, rasio: exM / exBatasM,
      rumus: 'ex ≤ Lx/6 — di luar ini sebagian dasar pondasi TERANGKAT',
    },
    {
      nama: 'Eksentrisitas arah Y', nilai: eyBatasM, syarat: eyM, satuan: 'm',
      aman: eyM <= eyBatasM, rasio: eyM / eyBatasM,
      rumus: 'ey ≤ Ly/6',
    },
    {
      nama: 'Tegangan tanah maksimum', nilai: qaKnM2, syarat: qmax, satuan: 'kN/m²',
      aman: qmax <= qaKnM2, rasio: qmax / qaKnM2,
      rumus: 'qmax = P/A + Mx/Wx + My/Wy + q ≤ qa',
    },
    {
      // qmin < 0 berarti tanah harus MENARIK pondasi ke bawah — mustahil.
      // Bagian itu terangkat, dan tegangan sisanya jadi lebih besar dari
      // yang dihitung rumus linier ini. Verdict-nya karena itu terpisah.
      nama: 'Tanah tidak terangkat', nilai: qmin, syarat: 0, satuan: 'kN/m²',
      aman: qmin >= 0, rasio: qmin >= 0 ? 0 : Math.abs(qmin) / qmax,
      rumus: 'qmin ≥ 0 — negatif berarti sebagian dasar terangkat',
    },
    {
      nama: 'Geser satu arah X', nilai: phiVcxKn, syarat: vuxKn, satuan: 'kN',
      aman: phiVcxKn >= vuxKn, rasio: vuxKn > 0 ? vuxKn / phiVcxKn : 0,
      rumus: 'φVc ≥ Vux di bidang kritis sejarak d dari muka kolom',
    },
    {
      nama: 'Geser satu arah Y', nilai: phiVcyKn, syarat: vuyKn, satuan: 'kN',
      aman: phiVcyKn >= vuyKn, rasio: vuyKn > 0 ? vuyKn / phiVcyKn : 0,
      rumus: 'φVc ≥ Vuy',
    },
    {
      // Geser pons yang paling sering menentukan tebal footplat — dan
      // keruntuhannya paling tiba-tiba: kolom menembus pelat tanpa lendutan
      // yang memberi peringatan lebih dulu.
      nama: 'Geser pons', nilai: phiVcPonsKn, syarat: vupKn, satuan: 'kN',
      aman: phiVcPonsKn >= vupKn, rasio: vupKn > 0 ? vupKn / phiVcPonsKn : 0,
      rumus: `φVc ≥ Vup pada keliling d/2 (αs=${alphaS}, kolom ${letakKolom})`,
    },
    {
      nama: 'Lentur', nilai: phiMnKnm, syarat: muPerM, satuan: 'kNm/m',
      aman: phiMnKnm >= muPerM, rasio: muPerM > 0 ? muPerM / phiMnKnm : 0,
      rumus: 'φMn ≥ Mu kantilever dari muka kolom',
    },
    {
      nama: 'As minimum', nilai: asAdaMm2, syarat: asMinMm2, satuan: 'mm²/m',
      aman: asAdaMm2 >= asMinMm2, rasio: asMinMm2 / asAdaMm2,
      rumus: 'As ≥ ρmin · b · d (susut & suhu)',
    },
  ]

  if (qmin < 0) {
    catatan.push('qmin negatif — sebagian dasar pondasi terangkat. Tegangan '
      + 'nyata di sisi tertekan LEBIH BESAR daripada qmax yang dihitung rumus '
      + 'linier ini; perbesar pondasi atau kurangi eksentrisitas.')
  }

  /*
    Batas yang SELALU berlaku — berbeda dari dua catatan situasional di atas.

    STEK KOLOM (dowel) TIDAK ikut ditimbang. Batang itu selalu dipasang: ia
    yang menyambungkan tulangan kolom ke fondasi. Ia tak bisa dihitung di sini
    karena jumlah & diameternya milik KOLOM di atasnya, bukan milik fondasi —
    dan menebaknya berarti menaruh angka karangan di dalam RAP.

    Besarnya bukan pembulatan: untuk fondasi 2×2 m dengan kolom 8D19 dan
    panjang stek ~1,5 m, steknya ~27 kg terhadap ~97 kg tulangan fondasi —
    sekitar 28%. Angka sebesar itu tak boleh hanya "tidak ada"; ia harus
    tertulis, supaya yang menyusun RAP menambahkannya sadar-sadar.
  */
  catatan.push(
    'Volume besi BELUM termasuk stek kolom (dowel) — jumlah dan diameternya '
    + 'mengikuti tulangan kolom di atasnya, bukan fondasi ini. Pada fondasi '
    + '2×2 m dengan kolom 8D19, steknya sekitar 28% dari tulangan fondasi.',
  )

  /*
    ══════════════════════════════════════════════════════════════════════════
    PENURUNAN — dijalankan DI SINI, bukan sebagai jenis elemen terpisah.

    Satu telapak punya satu verdict. Memisahkannya berarti estimator
    memasukkan pondasi yang sama DUA KALI, dan volumenya terhitung ganda di
    RAB — cacat yang jauh lebih mahal daripada kerapian struktur kode.

    Tekanan neto memakai `qmax` yang sudah dihitung di atas DIKURANGI tekanan
    tanah timbunan (`qKnM2`): yang menekan tanah di bawah hanya beban
    TAMBAHAN dari bangunan, bukan berat tanah yang memang sudah ada di situ
    sebelum dibangun. Memakai qmax mentah melebihkan penurunannya.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (input.jenisTanahPenurunan != null && input.nSptPenurunan != null) {
    try {
      const turun = analisaPenurunan({
        lebarM: Math.min(lxM, lyM),
        panjangM: Math.max(lxM, lyM),
        tekananNetoKnM2: Math.max(qmax - qKnM2, 1),
        jenisTanah: input.jenisTanahPenurunan,
        nSpt: input.nSptPenurunan,
        jarakKolomM: input.jarakKolomM,
      })
      periksa.push(...turun.periksa)
      catatan.push(...turun.catatan)
    } catch (e) {
      /*
        Penurunan yang tak bisa dihitung tak boleh menggagalkan analisa
        strukturnya — pemeriksaan lain tetap berguna. Tetapi juga tak boleh
        DIAM: sebabnya dicatat apa adanya.
      */
      catatan.push(
        `Perkiraan PENURUNAN tak dapat dijalankan: ${(e as Error).message}`,
      )
    }
  } else {
    catatan.push(
      'Penurunan (settlement) TIDAK diperiksa karena jenis tanah dan N-SPT '
      + 'belum diisi. Daya dukung izin di atas menahan KERUNTUHAN tanah, '
      + 'bukan penurunan — dan pada tanah lempung, penurunanlah yang lebih '
      + 'dulu merusak bangunan. Isi `jenisTanahPenurunan` dan `nSptPenurunan` '
      + 'dari hasil penyelidikan tanah.',
    )
  }

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeFootplat(input, dM),
    catatan,
    antara: {
      aM2, wxM3, wyM3, qKnM2, exM, eyM, exBatasM, eyBatasM, qmax, qmin,
      dM, cxM, cyM, bc, alphaS, qxKritis, qyKritis, vuxKn, vuyKn,
      phiVcxKn, phiVcyKn, b0M, vupKn, phiVcPonsKn,
      lenganXM, lenganYM, qNetoKnM2, muxPerM, muyPerM, muPerM,
      asAdaMm2, asMinMm2, phiMnKnm,
    },
  }
}

/** Volume footplat — beton, bekisting sisi, tulangan dua arah. */
function volumeFootplat(input: InputFootplat, dM: number): VolumeElemen {
  const { lxM, lyM, hM, dTulanganMm, jarakTulanganMm, dAksenM } = input
  const jumlah = input.jumlah ?? 1
  void dM

  const betonM3 = lxM * lyM * hM * jumlah
  // Bekisting = keliling × tebal (dasar menempel tanah, atas terbuka).
  const bekistingM2 = 2 * (lxM + lyM) * hM * jumlah

  const beratKgPerM = KOEF_BERAT_BESI * dTulanganMm * dTulanganMm
  // Panjang batang = sisi dikurangi 2× selimut, ditambah kait 2×6db tiap ujung.
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
