// Kolom beton bertulang penampang LINGKARAN — SNI 2847. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// Bagian dari mesin hitung struktur. Lihat `struktur-beton.ts` untuk alasan
// pola (pure, golden test vs workbook, verdict ber-angka).
//
// ── Bedanya dengan kolom persegi, dan kenapa berkas sendiri
//
// Tulangan tersebar MELINGKAR, jadi jarak tiap batang ke serat tekan terluar
// bukan deret lurus melainkan fungsi sudut:
//
//     θᵢ = θ₀ + i · (2π/n)
//     dᵢ = D/2 + (D/2 − ds − ½Ds − ½Du) · cos θᵢ
//
// Konsekuensinya: tak ada "baris tulangan" seperti pada persegi — tiap batang
// punya dᵢ sendiri, dan regangannya berbeda-beda. Memaksakan model persegi ke
// sini menghasilkan As yang benar tetapi distribusi yang salah, dan itu
// menggeser kapasitas momen tanpa menggeser kapasitas aksial — jenis
// kesalahan yang tak terlihat dari angka Pn.
// ══════════════════════════════════════════════════════════════════════════════

import {
  beta1, RHO_BETON, KOEF_BERAT_BESI,
  type MutuBahan, type Periksa, type VolumeElemen, type BarisBesi,
} from './struktur-beton'

/**
 * Jenis pengekang — MENENTUKAN faktor reduksi, dan sering tertukar.
 *
 * SNI 2847 §22.4.2.1 & §21.2.2:
 *
 *     spiral    Pn,max = 0.85 · Po      φ = 0.75
 *     sengkang  Pn,max = 0.80 · Po      φ = 0.65
 *
 * Spiral mendapat angka lebih tinggi karena ia mengekang beton inti secara
 * menerus: saat selimut luar pecah, inti masih terkurung dan kolom runtuh
 * bertahap alih-alih tiba-tiba.
 *
 * ⚠ Workbook rujukan menyebut "tulangan spiral" di label inputnya tetapi
 * memakai 0.80 di rumus Pno-nya. Salah satu dari keduanya keliru. Di sini
 * jenis pengekang jadi INPUT EKSPLISIT, jadi angkanya selalu cocok dengan
 * yang sebenarnya dipasang — dan `sengkang` memulangkan angka yang identik
 * dengan workbook.
 */
export type Pengekang = 'spiral' | 'sengkang'

export const FAKTOR_PN_MAX: Record<Pengekang, number> = { spiral: 0.85, sengkang: 0.80 }
export const PHI_TEKAN: Record<Pengekang, number> = { spiral: 0.75, sengkang: 0.65 }

export interface InputKolomBulat {
  /** Diameter kolom, mm. */
  diameterMm: number
  /** Tinggi kolom, m — untuk VOLUME. */
  tinggiM: number
  /** Jumlah tulangan utama (tersebar merata melingkar). */
  nTulangan: number
  /** Selimut beton ke pusat tulangan pengekang, mm. */
  selimutMm: number
  /** Diameter tulangan utama, mm. */
  dUtamaMm: number
  /** Diameter tulangan pengekang (spiral/sengkang), mm. */
  dPengekangMm: number
  /** Jarak/pitch pengekang, mm. */
  jarakPengekangMm: number
  pengekang: Pengekang
  mutu: MutuBahan
  /** Beban aksial terfaktor, kN. */
  puKn: number
  /** Momen terfaktor, kNm. */
  muKnm: number
  jumlah?: number
}

/** Satu batang tulangan beserta posisi & regangannya pada kondisi balance. */
export interface BatangLingkar {
  indeks: number
  /** Sudut dari sumbu tekan, radian. */
  thetaRad: number
  /** Jarak dari serat tekan terluar, mm. */
  diMm: number
  /** Luas batang, mm². */
  asMm2: number
  /** Regangan pada kondisi balance (negatif = tekan). */
  epsilon: number
  /** Tegangan, MPa (dibatasi ±fy). */
  fsMpa: number
}

export interface HasilKolomBulat {
  periksa: Periksa[]
  aman: boolean
  volume: VolumeElemen
  batang: BatangLingkar[]
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Posisi & regangan tiap batang pada garis netral tertentu.
 *
 * `θ₀` mengikuti workbook: 0 bila n kelipatan 4 (ada batang tepat di sumbu
 * tekan), setengah sudut antar-batang bila tidak. Itu bukan sekadar konvensi
 * gambar — posisi batang terluar menentukan d₁, dan d₁ menentukan cb.
 */
export function batangLingkaran(
  input: Pick<InputKolomBulat, 'diameterMm' | 'nTulangan' | 'selimutMm' | 'dUtamaMm' | 'dPengekangMm' | 'mutu'>,
  cMm: number,
): BatangLingkar[] {
  const { diameterMm: D, nTulangan: n, selimutMm, dUtamaMm, dPengekangMm, mutu } = input
  const theta0Rad = 2 * Math.PI / n
  // Ada batang tepat di puncak bila n kelipatan 4 (mengikuti workbook Q18).
  const mulai = n % 4 === 0 ? 0 : 0.5 * theta0Rad
  const jariTulangan = D / 2 - selimutMm - 0.5 * dPengekangMm - 0.5 * dUtamaMm
  const asBatang = Math.PI / 4 * dUtamaMm * dUtamaMm

  return Array.from({ length: n }, (_, i) => {
    const thetaRad = mulai + i * theta0Rad
    const diMm = D / 2 + jariTulangan * Math.cos(thetaRad)
    // Regangan: positif = tarik (di > c), negatif = tekan.
    const epsilon = 0.003 * (cMm - diMm) / cMm
    const fsMpa = Math.max(-mutu.fyMpa, Math.min(mutu.fyMpa, epsilon * 200_000))
    return { indeks: i + 1, thetaRad, diMm, asMm2: asBatang, epsilon, fsMpa }
  })
}

/**
 * Analisa kolom lingkaran — kapasitas aksial + kondisi balance.
 *
 * ⚠ BATAS yang sama dengan kolom persegi: ini BUKAN diagram interaksi P-M
 * penuh. Kolom dengan Mu besar pada Pu kecil bisa lolos di sini padahal titik
 * bebannya di luar kurva. Diagram penuh dijadwalkan Fase 2; sampai itu ada,
 * `catatan` menyatakan batasnya alih-alih membiarkan "aman" dipercaya bulat.
 */
export function analisaKolomBulat(input: InputKolomBulat): HasilKolomBulat {
  const {
    diameterMm: D, tinggiM, nTulangan: n, selimutMm,
    dUtamaMm, dPengekangMm, jarakPengekangMm, pengekang, mutu,
  } = input
  if (!(D > 0)) throw new Error('Diameter kolom harus > 0')
  if (!(tinggiM > 0)) throw new Error('Tinggi kolom harus > 0')
  if (n < 6) throw new Error('Kolom lingkaran minimal 6 batang tulangan (SNI 2847 §10.7.3.1)')
  if (!(jarakPengekangMm > 0)) throw new Error('Jarak pengekang harus > 0')
  if (!(mutu.fcMpa > 0 && mutu.fyMpa > 0)) throw new Error("f'c dan fy harus > 0")

  const jumlah = input.jumlah ?? 1
  const catatan: string[] = []

  const agMm2 = 0.25 * Math.PI * D * D
  const asMm2 = n * Math.PI / 4 * dUtamaMm * dUtamaMm
  const rho = asMm2 / agMm2

  // ── Kapasitas aksial
  const faktor = FAKTOR_PN_MAX[pengekang]
  const phi = PHI_TEKAN[pengekang]
  // Po memakai (Ag − As): beton hanya mengisi yang tidak ditempati baja.
  const poKn = (0.85 * mutu.fcMpa * (agMm2 - asMm2) + asMm2 * mutu.fyMpa) * 1e-3
  const pnMaxKn = faktor * poKn
  const phiPnKn = phi * pnMaxKn

  // ── Kondisi balance
  const jariTulangan = D / 2 - selimutMm - 0.5 * dPengekangMm - 0.5 * dUtamaMm
  const d1Mm = D / 2 + jariTulangan  // batang terjauh dari serat tekan
  const cbMm = 600 / (600 + mutu.fyMpa) * d1Mm
  const b1 = beta1(mutu.fcMpa)
  const batang = batangLingkaran(input, cbMm)

  // ── Rasio tulangan & jarak pengekang
  const sMaksMm = pengekang === 'spiral'
    ? 75                                   // pitch spiral maks 75 mm (§25.7.3.1)
    : Math.min(16 * dUtamaMm, 48 * dPengekangMm, D)

  const periksa: Periksa[] = [
    {
      nama: 'Kapasitas aksial', nilai: phiPnKn, syarat: input.puKn, satuan: 'kN',
      aman: phiPnKn >= input.puKn,
      rasio: phiPnKn > 0 ? input.puKn / phiPnKn : Number.POSITIVE_INFINITY,
      rumus: `φPn,max = ${phi} · ${faktor} · [0.85·f'c·(Ag−As) + As·fy]  (${pengekang})`,
    },
    {
      nama: 'Rasio tulangan', nilai: rho, syarat: 0.01, satuan: '—',
      aman: rho >= 0.01 && rho <= 0.08,
      rasio: rho > 0 ? 0.01 / rho : Number.POSITIVE_INFINITY,
      rumus: '0.01 ≤ ρ ≤ 0.08 (SNI 2847 §10.6.1.1)',
    },
    {
      nama: 'Jumlah tulangan minimum', nilai: n, syarat: 6, satuan: 'batang',
      aman: n >= 6, rasio: 6 / n,
      rumus: 'n ≥ 6 untuk kolom bulat (§10.7.3.1)',
    },
    {
      nama: pengekang === 'spiral' ? 'Pitch spiral maksimum' : 'Jarak sengkang maksimum',
      nilai: sMaksMm, syarat: jarakPengekangMm, satuan: 'mm',
      aman: jarakPengekangMm <= sMaksMm, rasio: jarakPengekangMm / sMaksMm,
      rumus: pengekang === 'spiral'
        ? 'pitch ≤ 75 mm (§25.7.3.1)'
        : 's ≤ min(16·db, 48·ds, D)',
    },
  ]

  catatan.push('Pemeriksaan ini mencakup tekan sentris dan kondisi balance, '
    + 'BUKAN diagram interaksi P-M penuh. Kolom dengan momen besar pada beban '
    + 'aksial kecil bisa lolos di sini padahal titik bebannya di luar kurva.')

  return {
    periksa,
    aman: periksa.every((p) => p.aman),
    volume: volumeKolomBulat(input),
    batang,
    catatan,
    antara: {
      agMm2, asMm2, rho, poKn, pnMaxKn, phiPnKn, faktor, phi,
      d1Mm, cbMm, beta1: b1, jariTulangan, theta0Rad: 2 * Math.PI / n,
      sMaksMm, jumlah,
    },
  }
}

/**
 * Volume kolom bulat.
 *
 * Spiral dihitung sebagai HELIKS, bukan lingkaran datar bertumpuk: panjang
 * satu putaran = √((π·Dinti)² + pitch²). Mengabaikan kemiringannya membuat
 * tonase kurang — kecil per putaran, tetapi kolom 3.5 m berpitch 75 mm punya
 * 47 putaran.
 */
function volumeKolomBulat(input: InputKolomBulat): VolumeElemen {
  const {
    diameterMm: D, tinggiM, nTulangan: n, selimutMm,
    dUtamaMm, dPengekangMm, jarakPengekangMm, pengekang,
  } = input
  const jumlah = input.jumlah ?? 1

  const dM = D / 1000
  const betonM3 = 0.25 * Math.PI * dM * dM * tinggiM * jumlah
  // Bekisting kolom bulat = keliling × tinggi.
  const bekistingM2 = Math.PI * dM * tinggiM * jumlah

  const dIntiMm = D - 2 * selimutMm - dPengekangMm
  const kelilingIntiM = Math.PI * dIntiMm / 1000
  const nPutaran = Math.ceil(tinggiM * 1000 / jarakPengekangMm) + 1

  // Spiral: panjang per putaran memperhitungkan kemiringan heliks.
  // Sengkang: cincin datar + kait 2×6db.
  const pitchM = jarakPengekangMm / 1000
  const panjangPerPutaranM = pengekang === 'spiral'
    ? Math.sqrt(kelilingIntiM * kelilingIntiM + pitchM * pitchM)
    : kelilingIntiM + 2 * 6 * dPengekangMm / 1000

  const besi: BarisBesi[] = [
    {
      tipe: 'BjTS', diameterMm: dUtamaMm, peran: 'utama',
      jumlahBatang: n * jumlah, panjangPerBatangM: tinggiM,
      beratKgPerM: KOEF_BERAT_BESI * dUtamaMm * dUtamaMm,
      totalKg: n * jumlah * tinggiM * KOEF_BERAT_BESI * dUtamaMm * dUtamaMm,
    },
    {
      tipe: 'BjTP', diameterMm: dPengekangMm, peran: 'sengkang',
      jumlahBatang: nPutaran * jumlah, panjangPerBatangM: panjangPerPutaranM,
      beratKgPerM: KOEF_BERAT_BESI * dPengekangMm * dPengekangMm,
      totalKg: nPutaran * jumlah * panjangPerPutaranM
        * KOEF_BERAT_BESI * dPengekangMm * dPengekangMm,
    },
  ]

  return {
    betonM3, bekistingM2, besi,
    besiTotalKg: besi.reduce((s, b) => s + b.totalKg, 0),
    beratSendiriKg: betonM3 * RHO_BETON,
  }
}
