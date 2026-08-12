/**
 * GERBANG OPNAME (D1) — pembayaran progres menuntut berita acara terverifikasi.
 *
 * ── Lubang yang ditutup, diukur 2026-08-12
 *
 * `progress_payments.requires_opname` ada sejak migrasi 044 (2024) dengan
 * DEFAULT true, dan `opname_report_id` menyertainya. Komentar migrasi itu
 * menyebut maksudnya persis:
 *
 *   > PM WAJIB submit dan admin/PM verify sebelum progress payment bisa
 *   > dibuat untuk work_scope dengan payment_system IN ('borongan',
 *   > 'progress_pct').
 *
 * Tabel yang ditunjuknya tak pernah terbentuk (ledger-diff:
 * TERCATAT-TAPI-ARTEFAK-HILANG), dan kedua kolom itu **tak pernah dibaca satu
 * baris kode pun**. Diukur: 17 dari 20 lingkup kerja wajib opname, kelima
 * pembayaran yang ada bertanda wajib, nol punya berita acara.
 *
 * Gerbang yang dijanjikan schema selama dua tahun, tak pernah menjaga apa pun.
 *
 * ── Kenapa `harian` dikecualikan
 *
 * Bukan kelonggaran. Upah harian dibayar per hari kerja yang sudah dicatat
 * absensi — tak ada "volume terpasang" yang bisa diukur, dan menuntut berita
 * acara pengukuran untuk itu berarti menghentikan pembayaran mingguan tukang
 * demi dokumen yang tak punya isi.
 *
 * Yang dijaga adalah pembayaran berbasis KEMAJUAN FISIK: borongan dan
 * progress_pct. Di sanalah selisih antara yang diklaim dan yang terpasang
 * benar-benar bisa terjadi.
 */

/** Sistem pembayaran yang menuntut opname. Diukur dari `work_scopes`. */
export const SISTEM_WAJIB_OPNAME = ['borongan', 'progress_pct'] as const

export interface OpnameUntukGerbang {
  id: string
  status: string
  /** Persen selesai tertinggi yang tercatat di berita acara ini. */
  pctTertinggi: number | null
}

export type HasilGerbang =
  | { boleh: true; opnameId: string | null; alasanLolos: 'tak_wajib' | 'terverifikasi' }
  | { boleh: false; sebab: string }

/**
 * Bolehkah pembayaran progres ini dibuat?
 *
 * MURNI — tak menyentuh basis. Pemanggil menyediakan sistem pembayarannya dan
 * daftar opname yang ada untuk lingkup kerja itu.
 *
 * ── Kenapa membandingkan PERSEN, bukan sekadar "ada opname"
 *
 * Berita acara bulan lalu yang mencatat 40% tak membenarkan pembayaran 80%
 * hari ini. Tanpa perbandingan ini, satu opname di awal proyek membuka
 * seluruh pembayaran sesudahnya — gerbang yang hanya dilewati sekali.
 */
export function periksaGerbangOpname(params: {
  sistemPembayaran: string | null | undefined
  pctDiminta: number
  opname: OpnameUntukGerbang[]
}): HasilGerbang {
  const { sistemPembayaran, pctDiminta, opname } = params

  if (!SISTEM_WAJIB_OPNAME.includes(sistemPembayaran as never)) {
    return { boleh: true, opnameId: null, alasanLolos: 'tak_wajib' }
  }

  const terverifikasi = opname.filter(o => o.status === 'diverifikasi')
  if (terverifikasi.length === 0) {
    const disengketakan = opname.some(o => o.status === 'disengketakan')
    const diajukan = opname.some(o => o.status === 'diajukan')
    return {
      boleh: false,
      sebab: disengketakan
        ? 'Opname untuk lingkup kerja ini sedang disengketakan. Selesaikan sengketanya '
          + 'sebelum pembayaran dirilis.'
        : diajukan
          ? 'Opname sudah diajukan tetapi belum diverifikasi. Pembayaran menunggu '
            + 'verifikasi pihak kedua.'
          : 'Belum ada berita acara opname untuk lingkup kerja ini. Ukur volume '
            + 'terpasang di lapangan lebih dulu — pembayaran borongan dan progres '
            + 'menuntut pengukuran bersama.',
    }
  }

  // Persen tertinggi yang PERNAH diverifikasi. Bukan yang terakhir: opname
  // susulan bisa mencatat angka lebih rendah untuk item yang berbeda, dan
  // memakai "yang terakhir" membuat hak bayar terlihat mundur.
  const pctSah = terverifikasi.reduce(
    (a, o) => (o.pctTertinggi !== null && o.pctTertinggi > a ? o.pctTertinggi : a),
    0,
  )

  // Toleransi 0,01 untuk pembulatan. BUKAN untuk melonggarkan: selisih di
  // atas itu berarti pembayaran melampaui yang terukur.
  if (pctDiminta > pctSah + 0.01) {
    return {
      boleh: false,
      sebab: `Pembayaran ${pctDiminta}% melampaui opname terverifikasi (${pctSah}%). `
        + 'Lakukan opname susulan untuk kemajuan yang belum terukur.',
    }
  }

  // Berita acara yang MENDASARI pembayaran ini — yang persennya mencukupi,
  // bukan sekadar yang pertama ditemukan. Itulah yang harus tercatat di
  // `opname_report_id` sebagai jejaknya.
  const dasar = terverifikasi
    .filter(o => (o.pctTertinggi ?? 0) >= pctDiminta - 0.01)
    .sort((a, b) => (a.pctTertinggi ?? 0) - (b.pctTertinggi ?? 0))[0]
    ?? terverifikasi[0]

  return { boleh: true, opnameId: dasar.id, alasanLolos: 'terverifikasi' }
}

/**
 * Persen selesai satu berita acara = rata-rata TERTIMBANG VOLUME dari itemnya.
 *
 * ── Kenapa ditimbang, bukan dirata-rata polos
 *
 * Sebuah opname bisa memuat "pengecatan 100% selesai" (nilai kecil) dan
 * "struktur 20% selesai" (nilai besar). Rata-rata polos menghasilkan 60% —
 * angka yang membuka pembayaran lebih dari separuh nilai borongan untuk
 * pekerjaan yang sebagian besar belum berdiri.
 *
 * Ditimbang volume × harga satuan bila ada; kalau tak ada harga, ditimbang
 * volume saja. Bila keduanya tak ada, barulah rata-rata polos — dan itu
 * disebutkan lewat `dasar`.
 */
export function pctOpname(items: Array<{
  pct_selesai: number | string
  volume_rencana?: number | string | null
  harga_satuan?: number | string | null
}>): { pct: number | null; dasar: 'nilai' | 'volume' | 'rata' } {
  if (items.length === 0) return { pct: null, dasar: 'rata' }

  const baris = items.map(i => ({
    pct: Number(i.pct_selesai) || 0,
    vol: i.volume_rencana === null || i.volume_rencana === undefined || i.volume_rencana === ''
      ? null : Number(i.volume_rencana),
    harga: i.harga_satuan === null || i.harga_satuan === undefined || i.harga_satuan === ''
      ? null : Number(i.harga_satuan),
  }))

  const bisaNilai = baris.every(b => b.vol !== null && b.harga !== null && Number.isFinite(b.vol) && Number.isFinite(b.harga))
  if (bisaNilai) {
    const bobot = baris.reduce((a, b) => a + b.vol! * b.harga!, 0)
    if (bobot > 0) {
      const j = baris.reduce((a, b) => a + b.pct * b.vol! * b.harga!, 0)
      return { pct: Math.round((j / bobot) * 100) / 100, dasar: 'nilai' }
    }
  }

  const bisaVolume = baris.every(b => b.vol !== null && Number.isFinite(b.vol))
  if (bisaVolume) {
    const bobot = baris.reduce((a, b) => a + b.vol!, 0)
    if (bobot > 0) {
      const j = baris.reduce((a, b) => a + b.pct * b.vol!, 0)
      return { pct: Math.round((j / bobot) * 100) / 100, dasar: 'volume' }
    }
  }

  const j = baris.reduce((a, b) => a + b.pct, 0)
  return { pct: Math.round((j / baris.length) * 100) / 100, dasar: 'rata' }
}
