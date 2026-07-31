/**
 * EXECUTIVE COST ANALYTICS — agregasi biaya LINTAS PROYEK (ROADMAP #18).
 *
 * ── Pertanyaan yang dijawab
 *
 * Semua laporan yang ada hari ini bersifat PER-PROYEK. Yang tak bisa dijawab:
 * "dari 15 proyek, mana yang paling menggerus margin, dan seberapa?"
 * Pemilik tak bisa memutuskan di mana harus turun tangan tanpa itu.
 *
 * ── Batas yang WAJIB dinyatakan, bukan disembunyikan
 *
 * ROADMAP #18 menuliskan syaratnya sendiri: dashboard ini **wajib menyatakan
 * eksplisit** bahwa angkanya BELUM diadu ke realisasi belanja per-material
 * (rekonsiliasi §D7 masih terkunci gerbang — `resources` ↔ `materials` baru
 * cocok 0,1%).
 *
 * Artinya "serapan" di sini = pengeluaran yang tercatat di `project_expenses`,
 * BUKAN pembuktian bahwa material yang dibeli sesuai yang dianggarkan. Angka
 * yang terlihat rapi tanpa peringatan itu justru yang paling berbahaya: ia
 * mengundang keputusan yang datanya belum sanggup menopang.
 *
 * Karena itu tiap baris membawa `dasarPembanding` — apa yang dipakai sebagai
 * pagu — dan ringkasannya membawa daftar keterbatasan. Keduanya bukan hiasan.
 */

export interface BarisProyek {
  projectId: string
  nama: string
  status: string
  /** Nilai kontrak (jual). Nol bila belum diisi. */
  contractValue: number
  /** Total RAB (rencana jual, dari kategori). */
  rabValue: number
  /** Pagu RAP terkunci (rencana BELANJA). Paling benar bila ada. */
  paguRAP: number
  /** Pengeluaran approved. */
  serapan: number
  progressPct: number
}

export type DasarPembanding = 'rap_locked' | 'rab' | 'contract_value' | 'tak_ada'

export interface HasilProyek extends BarisProyek {
  /** Angka yang dipakai sebagai pagu, beserta ASALNYA. */
  pagu: number
  dasarPembanding: DasarPembanding
  /** serapan ÷ pagu × 100. `null` bila pagu tak diketahui — BUKAN 0. */
  serapanPct: number | null
  /**
   * Selisih serapan terhadap progres fisik, dalam poin persen.
   * Positif = uang keluar mendahului pekerjaan. `null` bila pagu tak diketahui.
   */
  deviasiPoin: number | null
  /** Sisa pagu; negatif berarti sudah lewat. */
  sisaPagu: number | null
}

export interface RingkasanPortofolio {
  jumlahProyek: number
  totalKontrak: number
  totalPagu: number
  totalSerapan: number
  /** Proyek yang serapannya melampaui pagu. */
  lewatPagu: number
  /** Proyek yang uang keluarnya mendahului pekerjaan >10 poin. */
  serapanMendahului: number
  /** Proyek yang paguannya tak bisa ditentukan — konteks untuk seluruh angka di atas. */
  tanpaPagu: number
  /** Keterbatasan yang WAJIB ditampilkan bersama angkanya. */
  keterbatasan: string[]
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0

/** Ambang "uang keluar mendahului pekerjaan" — poin persen. */
const AMBANG_MENDAHULUI = 10

export function analisaProyek(b: BarisProyek): HasilProyek {
  // Pagu berjenjang, urutan sengaja: yang paling benar dulu.
  //   RAP terkunci = rencana BELANJA (harga supplier + borongan) → pembanding
  //   yang tepat untuk pengeluaran.
  //   RAB = rencana JUAL; memakainya berarti membandingkan belanja dengan
  //   harga jual, jadi persentasenya terlihat lebih kecil dari kenyataan.
  //   contract_value = pilihan terakhir, paling kasar.
  const paguRAP = num(b.paguRAP)
  const rab = num(b.rabValue)
  const kontrak = num(b.contractValue)

  const dasarPembanding: DasarPembanding =
    paguRAP > 0 ? 'rap_locked' : rab > 0 ? 'rab' : kontrak > 0 ? 'contract_value' : 'tak_ada'
  const pagu = paguRAP > 0 ? paguRAP : rab > 0 ? rab : kontrak

  const serapan = num(b.serapan)
  // `null`, bukan 0: "pagu tak diketahui" ≠ "serapan 0%". Yang kedua akan
  // terbaca sebagai proyek yang sangat hemat — kebalikan dari kenyataannya.
  const serapanPct = pagu > 0 ? parseFloat(((serapan / pagu) * 100).toFixed(2)) : null

  return {
    ...b,
    pagu,
    dasarPembanding,
    serapanPct,
    deviasiPoin: serapanPct == null ? null : parseFloat((serapanPct - num(b.progressPct)).toFixed(2)),
    sisaPagu: pagu > 0 ? pagu - serapan : null,
  }
}

export function ringkasPortofolio(hasil: HasilProyek[]): RingkasanPortofolio {
  const tanpaPagu = hasil.filter((h) => h.dasarPembanding === 'tak_ada').length
  const pakaiRAB = hasil.filter((h) => h.dasarPembanding === 'rab').length
  const pakaiKontrak = hasil.filter((h) => h.dasarPembanding === 'contract_value').length

  const keterbatasan: string[] = [
    // Syarat eksplisit ROADMAP #18 — bukan basa-basi hukum.
    'Serapan di sini adalah pengeluaran yang TERCATAT, belum diadu ke realisasi ' +
    'belanja per-material. Rekonsiliasi pagu-vs-realisasi (§D7) belum dibangun ' +
    'karena pemetaan resource↔material baru cocok 0,1%.',
  ]
  if (pakaiRAB > 0) {
    keterbatasan.push(
      `${pakaiRAB} proyek memakai RAB (harga JUAL) sebagai pagu karena RAP belum ` +
      'dikunci. Persentase serapannya terlihat LEBIH KECIL dari kenyataan, karena ' +
      'belanja dibandingkan dengan harga jual, bukan rencana belanja.',
    )
  }
  if (pakaiKontrak > 0) {
    keterbatasan.push(`${pakaiKontrak} proyek hanya punya nilai kontrak sebagai pembanding — paling kasar.`)
  }
  if (tanpaPagu > 0) {
    keterbatasan.push(`${tanpaPagu} proyek TAK punya pagu sama sekali; serapannya tak bisa dipersentasekan.`)
  }

  return {
    jumlahProyek: hasil.length,
    totalKontrak: hasil.reduce((s, h) => s + num(h.contractValue), 0),
    // Hanya proyek ber-pagu yang dijumlahkan — menjumlahkan nol dari proyek
    // tanpa pagu membuat total portofolio terlihat lebih kecil, dan rasio
    // serapan-terhadap-pagu ikut menyesatkan.
    totalPagu: hasil.reduce((s, h) => s + (h.pagu > 0 ? h.pagu : 0), 0),
    totalSerapan: hasil.reduce((s, h) => s + num(h.serapan), 0),
    lewatPagu: hasil.filter((h) => h.sisaPagu != null && h.sisaPagu < 0).length,
    serapanMendahului: hasil.filter((h) => h.deviasiPoin != null && h.deviasiPoin > AMBANG_MENDAHULUI).length,
    tanpaPagu,
    keterbatasan,
  }
}

/** Urutan = urutan PERHATIAN: yang paling menggerus margin di atas. */
export function urutkanPerhatian(hasil: HasilProyek[]): HasilProyek[] {
  return [...hasil].sort((a, b) => {
    // Lewat pagu selalu di atas — itu uang yang sudah keluar melebihi rencana.
    const lewatA = a.sisaPagu != null && a.sisaPagu < 0 ? 0 : 1
    const lewatB = b.sisaPagu != null && b.sisaPagu < 0 ? 0 : 1
    if (lewatA !== lewatB) return lewatA - lewatB
    // Lalu deviasi terbesar (uang mendahului pekerjaan). `null` di bawah:
    // proyek yang tak bisa dinilai bukan proyek yang baik-baik saja.
    const da = a.deviasiPoin ?? -Infinity
    const db = b.deviasiPoin ?? -Infinity
    return db - da
  })
}
