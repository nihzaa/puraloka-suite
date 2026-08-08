/**
 * SERAPAN ANGGARAN PORTOFOLIO — meringkas `/api/v1/cost-analytics/portfolio`
 * jadi satu angka yang layak ditaruh di tengah donat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJUMLAHAN INI TIDAK SESEPELE KELIHATANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Referensi menampilkan "68% Utilized" di tengah donat Budget Utilization.
 * Persentase portofolio hanya bermakna kalau pembaginya benar, dan di sini
 * pembaginya TIDAK seragam antar proyek:
 *
 *   - proyek yang punya RAP terkunci  → pagunya dari RAP
 *   - proyek yang baru punya RAB      → pagunya dari RAB
 *   - proyek yang belum punya keduanya → pagunya nilai kontrak
 *
 * Endpoint sudah memutuskan itu per proyek dan menyebutkan pilihannya di
 * `dasarPembanding`. Yang TIDAK boleh dilakukan di sini adalah merata-ratakan
 * `serapanPct` antar proyek: proyek Rp 5 juta dan proyek Rp 5 miliar akan
 * dihitung sama berat, dan angkanya jadi omong kosong yang terlihat masuk akal.
 *
 * Jadi yang dijumlahkan adalah RUPIAHNYA (serapan dan pagu), lalu dibagi
 * sekali di akhir — rata-rata TERTIMBANG, satu-satunya yang benar untuk uang.
 *
 * ── Proyek tanpa pagu dibuang, bukan dianggap nol
 *
 * Pagu 0 berarti "belum diketahui", bukan "gratis". Memasukkannya ke penyebut
 * mustahil (bagi nol); memasukkannya ke pembilang saja akan menggelembungkan
 * persentase tanpa alasan. Jumlah yang dibuang DILAPORKAN supaya kartunya bisa
 * berkata jujur "3 proyek belum punya anggaran".
 */

export interface BarisPortofolio {
  projectId: string
  nama: string
  status: string
  contractValue: number
  pagu: number
  serapan: number
  serapanPct: number
  dasarPembanding: string
}

export interface RingkasanSerapan {
  /** Total pagu proyek yang punya anggaran. */
  pagu: number
  /** Total yang sudah terserap. */
  serapan: number
  /** Sisa; tak pernah negatif — pembengkakan dilaporkan lewat `lewatPagu`. */
  sisa: number
  /** 0–100+, tertimbang rupiah. Bisa >100 kalau memang membengkak. */
  persen: number
  /** Proyek yang serapannya melewati pagunya sendiri. */
  lewatPagu: number
  /** Proyek yang belum punya pagu sama sekali — tak ikut dihitung. */
  tanpaPagu: number
  /** Ada sesuatu untuk digambar. */
  adaData: boolean
}

const angka = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

export function ringkasSerapan(baris: readonly BarisPortofolio[] | null | undefined): RingkasanSerapan {
  const rows = Array.isArray(baris) ? baris : []

  // Proyek batal tak punya arti dalam serapan berjalan; membiarkannya membuat
  // pagu portofolio terlihat lebih besar daripada yang benar-benar dikelola.
  const hidup = rows.filter((r) => r?.status !== 'cancelled')

  let pagu = 0
  let serapan = 0
  let lewatPagu = 0
  let tanpaPagu = 0

  for (const r of hidup) {
    const p = angka(r?.pagu)
    const s = angka(r?.serapan)
    if (p <= 0) {
      tanpaPagu++
      continue
    }
    pagu += p
    serapan += s
    if (s > p) lewatPagu++
  }

  const persen = pagu > 0 ? Math.round((serapan / pagu) * 100) : 0

  return {
    pagu,
    serapan,
    sisa: Math.max(0, pagu - serapan),
    persen,
    lewatPagu,
    tanpaPagu,
    adaData: pagu > 0,
  }
}
