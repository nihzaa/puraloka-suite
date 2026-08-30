// Diagram interaksi P-M kolom beton bertulang — SNI 2847. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA — dan kenapa ia menutup satu-satunya batas yang tersisa
// ══════════════════════════════════════════════════════════════════════════════
//
// `struktur-beton.ts` dan `struktur-kolom-bulat.ts` memeriksa kolom di DUA
// titik yang bisa dihitung tertutup: tekan sentris (φPn,max) dan kondisi
// balance. Keduanya menyatakan sendiri di `catatan`-nya bahwa itu BUKAN
// diagram interaksi penuh.
//
// Batas itu bukan formalitas. Kolom dengan momen besar pada beban aksial kecil
// bisa LOLOS pemeriksaan aksial — φPn 2000 kN ≫ Pu 300 kN — sementara titik
// bebannya jatuh di luar kurva kapasitas. Verdict "aman" yang muncul dari
// pemeriksaan setengah itu justru lebih berbahaya daripada tak ada verdict,
// karena ia dipercaya.
//
// Berkas ini menghitung kurvanya penuh: garis netral `c` disapu dari tekan
// murni sampai tarik murni, dan tiap titik menghasilkan pasangan (φMn, φPn).
//
// ── Di workbook ini 3.159 sel per arah; di sini satu loop
//
// Excel memerlukan satu baris per nilai `c` — 170 baris × 19 kolom × 2 arah.
// Yang membuat versi ini bukan sekadar salinan: jumlah langkah bisa dinaikkan
// tanpa biaya (ketelitian kurva jadi pilihan, bukan batas alat), titik beban
// diuji secara aljabar alih-alih dilihat mata, dan hasilnya bisa dipakai
// program lain.
// ══════════════════════════════════════════════════════════════════════════════

import { beta1, ES_BAJA, REGANGAN_BETON_ULTIMIT } from './struktur-beton.js'
import { batangLingkaran } from './struktur-kolom-bulat.js'
import type { MutuBahan } from './struktur-beton.js'

/** Satu lapis/batang tulangan pada penampang yang ditinjau. */
export interface LapisTulangan {
  /** Jarak dari serat tekan TERLUAR, mm. */
  diMm: number
  /** Luas total tulangan pada lapis ini, mm². */
  asMm2: number
}

export interface PenampangKolom {
  /** Lebar penampang tegak lurus sumbu lentur, mm. */
  bMm: number
  /** Tinggi penampang searah lentur, mm. */
  hMm: number
  /** Luas bruto, mm². Untuk lingkaran ≠ b×h, jadi WAJIB eksplisit. */
  agMm2: number
  lapis: LapisTulangan[]
  mutu: MutuBahan
  /**
   * Faktor Pn,max — 0.80 sengkang, 0.85 spiral (SNI §22.4.2.1).
   * Menentukan langit-langit kurva di sisi tekan.
   */
  faktorPnMax: number
  /** φ pada kondisi tekan — 0.65 sengkang, 0.75 spiral. */
  phiTekan: number
}

/** Satu titik pada kurva interaksi. */
export interface TitikPM {
  /** Garis netral, mm. */
  cMm: number
  /** Tinggi blok tegangan ekuivalen, mm. */
  aMm: number
  /** Gaya tekan beton, kN. */
  ccKn: number
  /** Resultan gaya baja, kN (positif = menambah tekan). */
  fsTotalKn: number
  /** Kapasitas nominal aksial, kN. */
  pnKn: number
  /** Kapasitas nominal momen, kNm. */
  mnKnm: number
  /** Faktor reduksi pada titik ini. */
  phi: number
  /** Kapasitas terfaktor. */
  phiPnKn: number
  phiMnKnm: number
  /** Regangan tarik pada baja terjauh — penentu φ (SNI §21.2.2). */
  epsilonT: number
}

export interface DiagramPM {
  titik: TitikPM[]
  /** Kapasitas tekan sentris terfaktor (puncak kurva). */
  phiPnMaksKn: number
  /** Titik dengan φMn terbesar — kapasitas momen puncak. */
  phiMnMaksKnm: number
  antara: Record<string, number>
}

/**
 * Hitung SATU titik pada garis netral `c`.
 *
 * Perjanjian tanda (mengikuti workbook & SNI):
 *   εsi = 0.003·(c − di)/c    → positif TEKAN, negatif TARIK
 *   fsi = εsi·Es, dibatasi ±fy
 *   Fsi = Asi·fsi             positif menambah kapasitas tekan
 *   Msi = Fsi·(h/2 − di)      momen terhadap pusat penampang
 *
 * ⚠ Tanda εsi di sini BERLAWANAN dengan `struktur-kolom-bulat.batangLingkaran`
 * yang memakai konvensi tarik-positif. Perbedaan itu DISENGAJA dan dipisah:
 * berkas ini menghitung kesetimbangan gaya (tekan positif lebih alami),
 * sementara di sana yang dilaporkan adalah regangan tarik. Konversinya
 * dilakukan eksplisit di `dariKolomBulat()`, bukan diandalkan kebetulan.
 */
export function titikPM(p: PenampangKolom, cMm: number): TitikPM {
  if (!(cMm > 0)) throw new Error('titikPM: c harus > 0')

  const { bMm, hMm, mutu } = p
  const b1 = beta1(mutu.fcMpa)
  const aMm = Math.min(b1 * cMm, hMm)  // blok tak boleh melebihi penampang

  // Gaya tekan beton — memakai lebar b. Untuk lingkaran, `b` adalah lebar
  // EKUIVALEN yang sudah disesuaikan pemanggil (lihat dariKolomBulat).
  const ccKn = 0.85 * mutu.fcMpa * bMm * aMm * 1e-3
  const mcKnmm = ccKn * (hMm - aMm) / 2

  let fsTotalKn = 0
  let msKnmm = 0
  let epsilonT = 0  // regangan TARIK terbesar (untuk φ)

  for (const l of p.lapis) {
    const eps = REGANGAN_BETON_ULTIMIT * (cMm - l.diMm) / cMm
    const fs = Math.max(-mutu.fyMpa, Math.min(mutu.fyMpa, eps * ES_BAJA))
    const fKn = l.asMm2 * fs * 1e-3
    fsTotalKn += fKn
    msKnmm += fKn * (hMm / 2 - l.diMm)
    // eps negatif = tarik; ambil yang paling negatif lalu jadikan positif.
    if (-eps > epsilonT) epsilonT = -eps
  }

  const pnKasarKn = ccKn + fsTotalKn
  // Langit-langit tekan: Pn tak boleh melampaui Pn,max.
  const poKn = (0.85 * mutu.fcMpa * (p.agMm2 - p.lapis.reduce((s, l) => s + l.asMm2, 0))
    + p.lapis.reduce((s, l) => s + l.asMm2, 0) * mutu.fyMpa) * 1e-3
  const pnMaksKn = p.faktorPnMax * poKn
  const pnKn = Math.min(pnKasarKn, pnMaksKn)

  const mnKnm = (msKnmm + mcKnmm) * 1e-3

  /*
    φ transisi (SNI 2847 §21.2.2) — DARI REGANGAN, bukan dari Pn.

    Workbook menghitung φ dari Pn:  φ = 0.65 − 0.15·(Pn − 0.1f'cAg)/(0.1f'cAg),
    dibatasi 0.65..0.9. Itu pendekatan lama (SNI 2002 / ACI 318-99).

    SNI 2847:2019 memakai regangan tarik εt:
        εt ≤ εty        → terkendali tekan,  φ = 0.65 (sengkang) / 0.75 (spiral)
        εty < εt < 0.005 → transisi linier
        εt ≥ 0.005      → terkendali tarik,  φ = 0.90

    Yang dipakai di sini versi REGANGAN — lebih baru dan lebih tepat di daerah
    transisi. Selisihnya terhadap workbook dinyatakan di test, bukan
    disembunyikan.
  */
  const epsTy = mutu.fyMpa / ES_BAJA
  const phi = epsilonT <= epsTy ? p.phiTekan
    : epsilonT >= 0.005 ? 0.90
      : p.phiTekan + (0.90 - p.phiTekan) * (epsilonT - epsTy) / (0.005 - epsTy)

  return {
    cMm, aMm, ccKn, fsTotalKn, pnKn, mnKnm, phi,
    phiPnKn: phi * pnKn, phiMnKnm: phi * mnKnm, epsilonT,
  }
}

/**
 * Susun kurva interaksi penuh.
 *
 * `c` disapu dari 1.2·h (tekan hampir murni) menurun sampai mendekati nol.
 * Workbook memakai langkah h/50 dan 170 baris; di sini `langkah` bisa dipilih
 * karena tak ada biaya sel — ketelitian jadi pilihan, bukan batas alat.
 */
export function diagramPM(p: PenampangKolom, langkah = 200): DiagramPM {
  if (!(p.bMm > 0 && p.hMm > 0)) throw new Error('Dimensi penampang harus > 0')
  if (!(p.agMm2 > 0)) throw new Error('Ag harus > 0')
  if (p.lapis.length === 0) throw new Error('Penampang tanpa tulangan')
  if (langkah < 10) throw new Error('langkah minimal 10 — kurva terlalu kasar')

  const cAwal = 1.2 * p.hMm
  const titik: TitikPM[] = []
  for (let i = 0; i < langkah; i++) {
    // Turun geometris supaya rapat di daerah tarik (tempat kurva melengkung
    // tajam) tanpa memboroskan titik di daerah tekan yang hampir lurus.
    const c = cAwal * Math.pow(0.02 / 1.2, i / (langkah - 1))
    titik.push(titikPM(p, c))
  }

  const phiPnMaksKn = Math.max(...titik.map((t) => t.phiPnKn))
  const phiMnMaksKnm = Math.max(...titik.map((t) => t.phiMnKnm))

  return {
    titik, phiPnMaksKn, phiMnMaksKnm,
    antara: { cAwal, langkah, beta1: beta1(p.mutu.fcMpa) },
  }
}

export interface HasilCekTitik {
  /** true bila (Mu, Pu) berada DI DALAM kurva kapasitas. */
  aman: boolean
  /** Rasio pemakaian 0..1+; > 1 berarti di luar kurva. */
  rasio: number
  /** Kapasitas momen pada tingkat Pu ini, kNm. */
  phiMnPadaPuKnm: number
  /** Titik kurva yang mengapit Pu — untuk ditampilkan. */
  bawah: TitikPM | null
  atas: TitikPM | null
  catatan: string[]
}

/**
 * Uji apakah titik beban (Pu, Mu) berada di dalam kurva.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * INILAH yang tak bisa dilakukan workbook.
 *
 * Di sana verdict-nya VISUAL: pengguna melihat apakah titik bebannya jatuh di
 * dalam kurva. Mata manusia tak bisa membedakan "di dalam sedikit" dari "di
 * luar sedikit", dan tak ada catatan yang tersimpan.
 *
 * Di sini kurva diinterpolasi pada tingkat Pu yang diminta, lalu Mu
 * dibandingkan secara aljabar — hasilnya angka, bukan penilaian mata.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function cekTitikBeban(d: DiagramPM, puKn: number, muKnm: number): HasilCekTitik {
  const catatan: string[] = []

  if (puKn > d.phiPnMaksKn) {
    return {
      aman: false,
      rasio: puKn / d.phiPnMaksKn,
      phiMnPadaPuKnm: 0,
      bawah: null, atas: null,
      catatan: [`Pu ${puKn.toFixed(1)} kN melampaui kapasitas tekan sentris `
        + `φPn,max ${d.phiPnMaksKn.toFixed(1)} kN — di luar kurva pada sumbu mana pun.`],
    }
  }

  // Kurva terurut menurun menurut φPn (c besar → φPn besar). Cari pasangan
  // titik yang mengapit puKn.
  const urut = [...d.titik].sort((a, b) => a.phiPnKn - b.phiPnKn)
  let bawah: TitikPM | null = null
  let atas: TitikPM | null = null
  for (let i = 0; i < urut.length - 1; i++) {
    if (urut[i].phiPnKn <= puKn && puKn <= urut[i + 1].phiPnKn) {
      bawah = urut[i]; atas = urut[i + 1]; break
    }
  }

  let phiMnPadaPu: number
  if (bawah && atas) {
    const rentang = atas.phiPnKn - bawah.phiPnKn
    const t = rentang > 0 ? (puKn - bawah.phiPnKn) / rentang : 0
    phiMnPadaPu = bawah.phiMnKnm + t * (atas.phiMnKnm - bawah.phiMnKnm)
  } else {
    // Pu di bawah titik terendah kurva (tarik murni) — pakai titik terdekat.
    phiMnPadaPu = urut[0].phiMnKnm
    catatan.push('Pu di bawah rentang kurva — kolom nyaris tanpa beban aksial. '
      + 'Kapasitas momen diambil dari titik kurva terendah; periksa juga '
      + 'sebagai balok bila Pu mendekati nol.')
  }

  const aman = muKnm <= phiMnPadaPu
  if (!aman) {
    catatan.push(`Titik beban DI LUAR kurva: Mu ${muKnm.toFixed(1)} kNm melebihi `
      + `kapasitas ${phiMnPadaPu.toFixed(1)} kNm pada Pu ${puKn.toFixed(1)} kN.`)
  }

  return {
    aman,
    rasio: phiMnPadaPu > 0 ? muKnm / phiMnPadaPu : Number.POSITIVE_INFINITY,
    phiMnPadaPuKnm: phiMnPadaPu,
    bawah, atas, catatan,
  }
}

// ── Pembangun penampang dari input modul yang sudah ada ──────────────────────

/**
 * Penampang persegi dengan tulangan tersusun baris.
 *
 * `nBarisSejajar` = jumlah batang per baris tegak lurus sumbu lentur.
 */
export function penampangPersegi(args: {
  bMm: number; hMm: number; selimutMm: number;
  dUtamaMm: number; dSengkangMm: number;
  nBarisTegakLurus: number; nBarisSearah: number;
  mutu: MutuBahan; faktorPnMax?: number; phiTekan?: number;
}): PenampangKolom {
  const { bMm, hMm, selimutMm, dUtamaMm, dSengkangMm, nBarisTegakLurus, nBarisSearah, mutu } = args
  const asBatang = Math.PI / 4 * dUtamaMm * dUtamaMm
  const d1 = selimutMm + dSengkangMm + dUtamaMm / 2
  const jarak = nBarisSearah > 1 ? (hMm - 2 * d1) / (nBarisSearah - 1) : 0

  const lapis: LapisTulangan[] = Array.from({ length: nBarisSearah }, (_, i) => ({
    diMm: d1 + i * jarak,
    // Baris terluar berisi nBarisTegakLurus batang; baris tengah hanya 2
    // (kiri & kanan) — pola tulangan tepi yang lazim.
    asMm2: (i === 0 || i === nBarisSearah - 1 ? nBarisTegakLurus : 2) * asBatang,
  }))

  return {
    bMm, hMm, agMm2: bMm * hMm, lapis, mutu,
    faktorPnMax: args.faktorPnMax ?? 0.80,
    phiTekan: args.phiTekan ?? 0.65,
  }
}

/**
 * Penampang lingkaran — dikonversi ke model lapis dengan lebar EKUIVALEN.
 *
 * ⚠ PENYEDERHANAAN YANG DINYATAKAN, bukan disembunyikan.
 *
 * Blok tekan lingkaran berbentuk tembereng, bukan persegi. Di sini dipakai
 * lebar ekuivalen b = Ag/h, yang membuat luas blok tekan mendekati benar pada
 * daerah c sedang — tetapi MELEBIHKAN pada c sangat kecil (tembereng tipis
 * jauh lebih sempit dari b rata-rata).
 *
 * Konsekuensinya: kapasitas momen di ujung tarik kurva sedikit optimistis.
 * Karena itu `diagramPM` untuk lingkaran WAJIB dibaca bersama catatan ini, dan
 * `cekTitikBeban` di daerah Pu rendah sebaiknya diverifikasi manual.
 *
 * Perhitungan tembereng eksak dijadwalkan menyusul; menuliskannya setengah
 * jalan lebih berbahaya daripada menyatakan batasnya.
 */
export function penampangLingkaran(args: {
  diameterMm: number; nTulangan: number; selimutMm: number;
  dUtamaMm: number; dPengekangMm: number;
  mutu: MutuBahan; faktorPnMax?: number; phiTekan?: number;
}): PenampangKolom {
  const { diameterMm: D, mutu } = args
  const agMm2 = 0.25 * Math.PI * D * D
  // `batangLingkaran` memakai konvensi tarik-positif; di sini yang dibutuhkan
  // hanya posisi dᵢ-nya, jadi `c` yang dilewatkan tak berpengaruh.
  const batang = batangLingkaran({ ...args, mutu }, D / 2)

  return {
    bMm: agMm2 / D,     // lebar ekuivalen
    hMm: D,
    agMm2,
    lapis: batang.map((b) => ({ diMm: b.diMm, asMm2: b.asMm2 })),
    mutu,
    faktorPnMax: args.faktorPnMax ?? 0.80,
    phiTekan: args.phiTekan ?? 0.65,
  }
}
