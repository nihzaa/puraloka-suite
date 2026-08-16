/**
 * KEBUTUHAN MATERIAL — memproyeksikan kekurangan SEBELUM pekerjaan berhenti.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIJAWAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "stok tinggal berapa" — itu sudah dijawab `stok-menipis` (4.5) dan ia
 * melihat GUDANG, bukan rencana.
 *
 * Yang ini: "proyek sudah 40% jalan, materialnya baru datang 25% dari rencana
 * — apakah cukup sampai selesai?"
 *
 * Bedanya menentukan waktu. Stok menipis baru terlihat saat barangnya hampir
 * habis; kekurangan terhadap RENCANA terlihat berminggu-minggu sebelumnya,
 * yang justru waktu yang dibutuhkan untuk memesan.
 */

export interface BarisKebutuhan {
  /** Kebutuhan menurut RAB. */
  rencana: number
  /** Sudah diterima di proyek. */
  diterima: number
  /** Stok yang masih ada di tangan (gudang + proyek). */
  ditangan: number
}

export interface HasilKebutuhan {
  rencana: number
  diterima: number
  ditangan: number
  /** Porsi rencana yang sudah tersedia (diterima + di tangan), 0..1+. */
  porsiTersedia: number
  /** Selisih terhadap kebutuhan pada progres saat ini. Negatif = kurang. */
  selisih: number
  kurang: boolean
  sebab: 'cukup' | 'kurang_terhadap_progres' | 'belum_ada_rencana'
}

/**
 * @param progres  progres proyek 0..1 — penentu BERAPA BANYAK yang seharusnya
 *                 sudah tersedia sekarang, bukan pada akhir proyek
 * @param bantalan porsi cadangan di atas kebutuhan (mis. 0.1 = 10%)
 */
export function nilaiKebutuhan(
  b: BarisKebutuhan,
  progres: number,
  bantalan: number,
): HasilKebutuhan {
  const rencana = Number(b.rencana)
  const diterima = Number(b.diterima) || 0
  const ditangan = Number(b.ditangan) || 0

  if (!Number.isFinite(rencana) || rencana <= 0) {
    return {
      rencana: 0, diterima, ditangan, porsiTersedia: 0, selisih: 0,
      kurang: false, sebab: 'belum_ada_rencana',
    }
  }

  const tersedia = diterima + ditangan

  /*
    Progres DIJEPIT ke 0..1.

    `progress_logs.pct_overall` di basis ini bisa melebihi 100 (pekerjaan
    tambah) dan bisa negatif kalau salah input. Tanpa jepitan, progres 150%
    menuntut material satu setengah kali RAB dan SELURUH proyek dilaporkan
    kekurangan — peringatan massal dari satu salah ketik, tanpa galat apa pun.
  */
  const p = Math.min(1, Math.max(0, Number(progres) || 0))

  /*
    Yang dibandingkan kebutuhan PADA PROGRES SEKARANG, bukan kebutuhan total.

    Membandingkan dengan total membuat setiap proyek yang baru mulai terlihat
    kekurangan segalanya — peringatan yang benar secara aritmetika dan tak
    berguna sama sekali, karena tak ada kontraktor yang menimbun seluruh
    material di hari pertama.
  */
  const butuhSekarang = rencana * p * (1 + bantalan)
  const selisih = tersedia - butuhSekarang

  return {
    rencana,
    diterima,
    ditangan,
    porsiTersedia: Math.round((tersedia / rencana) * 100) / 100,
    selisih: Math.round(selisih * 1000) / 1000,
    kurang: selisih < 0,
    sebab: selisih < 0 ? 'kurang_terhadap_progres' : 'cukup',
  }
}
