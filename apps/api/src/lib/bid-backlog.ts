/**
 * BACKLOG & ANALISA MENANG-KALAH dari register tender.
 *
 * ── Kenapa ini lib terpisah, bukan di route
 *
 * Aritmetikanya kecil tapi punya dua keputusan yang mudah salah dan mahal:
 * apa yang dihitung sebagai "backlog", dan bagaimana selisih harga dibaca.
 * Di lib ia bisa diuji sebagai ANGKA; di dalam route ia hanya bisa dilihat
 * sebagai grafik yang "kelihatan masuk akal".
 */

export interface BidRingkas {
  id: string
  status: string
  bid_value: number | string | null
  winner_value: number | string | null
  submitted_at: string | null
  decided_at: string | null
  project_id: string | null
}

const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0

export interface RingkasanBid {
  /** Sudah MENANG dan pekerjaannya belum tuntas — beban kapasitas nyata. */
  backlogNilai: number
  backlogJumlah: number
  /** Sedang menunggu keputusan — belum beban, tapi bisa jadi beban. */
  pipelineNilai: number
  pipelineJumlah: number
  menang: number
  kalah: number
  /** Menang ÷ (menang + kalah). `null` bila belum ada tender yang diputuskan —
   *  BUKAN 0, karena "belum pernah ikut" ≠ "selalu kalah". */
  winRatePct: number | null
  /**
   * Rata-rata selisih penawaran kita terhadap pemenang, dalam PERSEN, hanya
   * dari tender yang kalah DAN nilai pemenangnya diketahui.
   *
   * Positif = penawaran kita lebih mahal. Inilah angka yang membedakan
   * "kalah karena harga" dari "kalah karena syarat": kalau selisihnya tipis
   * atau negatif, harga bukan penyebabnya, dan menurunkan harga di tender
   * berikutnya justru membuang margin tanpa menambah peluang.
   */
  selisihHargaRataPct: number | null
  /** Berapa tender kalah yang nilai pemenangnya diketahui — konteks untuk angka di atas. */
  kalahDenganPembanding: number
}

/** Status yang dihitung sebagai backlog: menang & proyeknya belum selesai. */
const STATUS_MENANG = 'menang'
/** Status yang masih berjalan (belum diputuskan). */
const STATUS_PIPELINE = new Set(['prospek', 'go', 'diajukan'])

export function hitungBacklog(
  bids: BidRingkas[],
  /**
   * Id proyek yang SUDAH selesai/batal. Tender yang menang tapi proyeknya
   * sudah tuntas BUKAN backlog lagi — memasukkannya membuat kapasitas terlihat
   * penuh padahal sudah lowong, dan itu kesalahan yang mahal ke arah
   * sebaliknya: menolak kerja yang sebenarnya sanggup diambil.
   */
  proyekSelesai: Set<string> = new Set(),
): RingkasanBid {
  let backlogNilai = 0, backlogJumlah = 0
  let pipelineNilai = 0, pipelineJumlah = 0
  let menang = 0, kalah = 0
  const selisih: number[] = []

  for (const b of bids) {
    if (b.status === STATUS_MENANG) {
      menang++
      const tuntas = b.project_id ? proyekSelesai.has(b.project_id) : false
      if (!tuntas) {
        backlogJumlah++
        backlogNilai += n(b.bid_value)
      }
    } else if (b.status === 'kalah') {
      kalah++
      const kita = n(b.bid_value)
      const pemenang = n(b.winner_value)
      // Keduanya harus ADA dan positif. Membandingkan terhadap nol
      // menghasilkan −100% yang tampak seperti temuan padahal cuma data kosong.
      if (kita > 0 && pemenang > 0) {
        selisih.push(((kita - pemenang) / pemenang) * 100)
      }
    } else if (STATUS_PIPELINE.has(b.status)) {
      pipelineJumlah++
      pipelineNilai += n(b.bid_value)
    }
    // 'no_go' & 'batal' sengaja tak dihitung ke mana pun: keduanya keputusan
    // untuk TIDAK ikut, jadi memasukkannya ke win-rate akan menghukum
    // kedisiplinan memilih tender.
  }

  const diputuskan = menang + kalah
  return {
    backlogNilai,
    backlogJumlah,
    pipelineNilai,
    pipelineJumlah,
    menang,
    kalah,
    winRatePct: diputuskan > 0 ? parseFloat(((menang / diputuskan) * 100).toFixed(1)) : null,
    selisihHargaRataPct: selisih.length > 0
      ? parseFloat((selisih.reduce((a, b) => a + b, 0) / selisih.length).toFixed(2))
      : null,
    kalahDenganPembanding: selisih.length,
  }
}
