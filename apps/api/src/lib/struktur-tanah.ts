// Daya dukung tanah — Terzaghi-Peck (1943), Meyerhof (1956), Skempton (1986).
//
// ══════════════════════════════════════════════════════════════════════════════
// Bagian dari mesin hitung struktur. Lihat `struktur-beton.ts` untuk alasan
// pola (pure, golden test vs workbook, verdict ber-angka).
//
// ── Kenapa TIGA metode, bukan satu yang "terbaik"
//
// Ketiganya memakai data uji tanah yang BERBEDA:
//
//     Terzaghi-Peck  c & φ        dari uji laboratorium (triaxial/geser langsung)
//     Meyerhof       qc           dari sondir (CPT)
//     Skempton       N-SPT        dari uji penetrasi standar
//
// Proyek jarang punya ketiganya. Menyediakan satu metode saja berarti modul ini
// tak bisa dipakai kalau data yang ada kebetulan bukan jenis itu — dan yang
// terjadi di lapangan adalah orang memaksa angkanya masuk ke rumus yang salah.
//
// Karena itu fungsi ini memulangkan hasil per metode yang DATANYA TERSEDIA,
// beserta nama metodenya. Membandingkan dua metode yang datanya ada juga
// berguna: selisih besar di antara keduanya adalah tanda data tanahnya
// meragukan, bukan tanda salah satunya salah.
// ══════════════════════════════════════════════════════════════════════════════

/** Faktor keamanan baku terhadap daya dukung ultimit. */
export const SF_DAYA_DUKUNG = 3

/** Konversi kg/cm² → kN/m² (1 kg/cm² = 98.0665 kPa). Workbook memakai 98.07. */
export const KGCM2_KE_KNM2 = 98.07

export interface GeometriPondasi {
  /** Lebar pondasi arah X, m. */
  lxM: number
  /** Lebar pondasi arah Y, m. */
  lyM: number
  /** Kedalaman dasar pondasi dari muka tanah, m. */
  dfM: number
}

export interface DataTanah {
  /** Berat volume tanah, kN/m³. */
  gammaKnM3: number
  /** Kohesi, kPa — untuk Terzaghi. */
  kohesiKpa?: number
  /** Sudut geser dalam, derajat — untuk Terzaghi. */
  sudutGeserDeg?: number
  /** Tahanan ujung sondir, kg/cm² — untuk Meyerhof. */
  qcKgCm2?: number
  /** Nilai N-SPT lapangan — untuk Skempton. */
  nSpt?: number
}

export interface HasilMetode {
  metode: 'Terzaghi-Peck 1943' | 'Meyerhof 1956' | 'Skempton 1986'
  /** Daya dukung ultimit, kN/m². Tak selalu ada (Meyerhof/Skempton langsung ijin). */
  quKnM2?: number
  /** Daya dukung ijin, kN/m². */
  qaKnM2: number
  antara: Record<string, number>
}

/**
 * Terzaghi-Peck 1943 — pondasi dangkal persegi, keruntuhan geser umum.
 *
 *     Nq = a² / (2·cos²(45° + φ/2)),  a = e^((3π/4 − φ/2)·tan φ)
 *     Nc = (Nq − 1) / tan φ
 *     Nγ = ½·tan φ·(Kpγ/cos²φ − 1),   Kpγ = 3·tan²(45° + (φ+33°)/2)
 *
 *     qu = c·Nc·(1 + 0.3·B/L) + Df·γ·Nq + 0.5·γ·B·Nγ·(1 − 0.2·B/L)
 *
 * ⚠ φ = 0 (lempung jenuh) MELEMPAR, bukan memulangkan Infinity: `tan 0 = 0`
 * membuat Nc pembaginya nol. Untuk lempung jenuh, Skempton yang berlaku.
 */
export function terzaghiPeck(g: GeometriPondasi, t: DataTanah): HasilMetode {
  const { kohesiKpa: c, sudutGeserDeg: phiDeg, gammaKnM3: gamma } = t
  if (c == null || phiDeg == null) {
    throw new Error('terzaghiPeck butuh kohesi & sudut geser — pakai Meyerhof (qc) atau Skempton (N-SPT)')
  }
  if (phiDeg <= 0) {
    throw new Error('terzaghiPeck: φ harus > 0 (tan φ jadi penyebut). '
      + 'Untuk lempung jenuh φ≈0, pakai Skempton.')
  }

  // Workbook memakai B = Lx dan L = Ly apa adanya (bukan min/max) di rumus qu —
  // ditiru supaya hasilnya sebanding. Faktor bentuk (1 + 0.3·B/L) memang
  // mengasumsikan B ≤ L, jadi urutan sisi berpengaruh; itu ditandai di sini
  // alih-alih "diperbaiki" diam-diam.
  const bM = g.lxM
  const lM = g.lyM

  const phi = phiDeg / 180 * Math.PI
  const a = Math.exp((3 * Math.PI / 4 - phi / 2) * Math.tan(phi))
  const kpg = 3 * Math.pow(Math.tan((45 + 0.5 * (phiDeg + 33)) / 180 * Math.PI), 2)

  const nq = a * a / (2 * Math.pow(Math.cos(Math.PI / 4 + phi / 2), 2))
  const nc = (nq - 1) / Math.tan(phi)
  const ng = 0.5 * Math.tan(phi) * (kpg / Math.pow(Math.cos(phi), 2) - 1)

  const qu = c * nc * (1 + 0.3 * bM / lM)
    + g.dfM * gamma * nq
    + 0.5 * gamma * bM * ng * (1 - 0.2 * bM / lM)

  return {
    metode: 'Terzaghi-Peck 1943',
    quKnM2: qu,
    qaKnM2: qu / SF_DAYA_DUKUNG,
    antara: { phi, a, kpg, nq, nc, ng, bM, lM },
  }
}

/**
 * Meyerhof 1956 — dari tahanan ujung sondir (qc).
 *
 *     Kd = min(1 + 0.33·Df/B, 1.33)
 *     qa = qc/33 · ((B + 0.3)/B)² · Kd        [kg/cm²]
 *
 * Berlaku untuk B > 1.2 m (pondasi lebar). B diambil sisi TERPENDEK —
 * itu yang menentukan zona pengaruh di bawah pondasi.
 */
export function meyerhof(g: GeometriPondasi, t: DataTanah): HasilMetode {
  if (t.qcKgCm2 == null) throw new Error('meyerhof butuh qc (sondir)')
  if (!(t.qcKgCm2 > 0)) throw new Error('meyerhof: qc harus > 0')

  const bM = Math.min(g.lxM, g.lyM)
  const kdMentah = 1 + 0.33 * g.dfM / bM
  const kd = Math.min(kdMentah, 1.33)

  const qaKgCm2 = t.qcKgCm2 / 33 * Math.pow((bM + 0.3) / bM, 2) * kd
  const qaKnM2 = qaKgCm2 * KGCM2_KE_KNM2

  return {
    metode: 'Meyerhof 1956',
    qaKnM2,
    antara: { bM, kdMentah, kd, qaKgCm2 },
  }
}

/**
 * Skempton 1986 — dari N-SPT, dengan koreksi tegangan overburden.
 *
 *     po = Df · γ                             tegangan efektif
 *     CN = 2 / (1 + po/pr),   pr = 100 kN/m²  faktor koreksi
 *     N' = CN · N                             N terkoreksi
 *     Kd = min(1 + 0.33·Df/B, 1.33)
 *     qa = 12.5 · N' · ((B + 0.3)/B)² · Kd    [kN/m²]
 */
export function skempton(g: GeometriPondasi, t: DataTanah): HasilMetode {
  if (t.nSpt == null) throw new Error('skempton butuh nilai N-SPT')
  if (!(t.nSpt > 0)) throw new Error('skempton: N-SPT harus > 0')

  const PR = 100
  const bM = Math.min(g.lxM, g.lyM)
  const po = g.dfM * t.gammaKnM3
  const cn = 2 / (1 + po / PR)
  const nAksen = cn * t.nSpt
  const kd = Math.min(1 + 0.33 * g.dfM / bM, 1.33)

  const qaKnM2 = 12.5 * nAksen * Math.pow((bM + 0.3) / bM, 2) * kd

  return {
    metode: 'Skempton 1986',
    qaKnM2,
    antara: { bM, po, cn, nAksen, kd },
  }
}

export interface HasilDayaDukung {
  /** Hasil per metode yang datanya tersedia. Kosong bila tak ada data sama sekali. */
  metode: HasilMetode[]
  /**
   * qa terkecil di antara metode yang ada — yang dipakai untuk desain.
   *
   * Terkecil, BUKAN rata-rata: metode yang datanya paling sesuai kondisi tanah
   * tak diketahui dari angka saja, jadi memilih yang paling konservatif adalah
   * satu-satunya pilihan yang tak bisa membahayakan.
   */
  qaDesainKnM2: number | null
  /**
   * Selisih relatif antara qa terbesar dan terkecil, 0..1.
   *
   * > 0.5 berarti dua metode berbeda dua kali lipat — tanda data tanahnya
   * meragukan, bukan tanda salah satunya salah. Ditandai supaya orang
   * memeriksa datanya, bukan diam-diam memakai yang menguntungkan.
   */
  sebaran: number | null
  catatan: string[]
}

/** Hitung dengan SEMUA metode yang datanya tersedia. */
export function dayaDukungTanah(g: GeometriPondasi, t: DataTanah): HasilDayaDukung {
  if (!(g.lxM > 0 && g.lyM > 0)) throw new Error('Dimensi pondasi harus > 0')
  if (!(g.dfM > 0)) throw new Error('Kedalaman pondasi harus > 0')
  if (!(t.gammaKnM3 > 0)) throw new Error('Berat volume tanah harus > 0')

  const metode: HasilMetode[] = []
  const catatan: string[] = []

  if (t.kohesiKpa != null && t.sudutGeserDeg != null && t.sudutGeserDeg > 0) {
    metode.push(terzaghiPeck(g, t))
  }
  if (t.qcKgCm2 != null && t.qcKgCm2 > 0) metode.push(meyerhof(g, t))
  if (t.nSpt != null && t.nSpt > 0) metode.push(skempton(g, t))

  if (metode.length === 0) {
    catatan.push('Tak satu pun data uji tanah tersedia — isi salah satu: '
      + 'kohesi+sudut geser (lab), qc (sondir), atau N-SPT.')
    return { metode, qaDesainKnM2: null, sebaran: null, catatan }
  }

  const daftar = metode.map((m) => m.qaKnM2)
  const min = Math.min(...daftar)
  const maks = Math.max(...daftar)
  const sebaran = maks > 0 ? (maks - min) / maks : 0

  if (metode.length === 1) {
    catatan.push(`Hanya satu metode dipakai (${metode[0].metode}) — tak ada pembanding. `
      + 'Menambah data uji tanah lain akan menunjukkan apakah angkanya wajar.')
  } else if (sebaran > 0.5) {
    catatan.push(`Selisih antar-metode ${(sebaran * 100).toFixed(0)}% — terlalu jauh. `
      + 'Periksa data uji tanahnya sebelum memakai angka ini; yang dipakai '
      + 'adalah yang TERKECIL.')
  }

  return { metode, qaDesainKnM2: min, sebaran, catatan }
}
