/**
 * KEBIASAAN BAYAR KLIEN — pola lintas-invoice, bukan satu invoice telat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUKAN DUPLIKAT `invoice-terlambat` (2.6)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2.6 menjawab "invoice mana yang lewat jatuh tempo" — satu baris, satu
 * tagihan, dan tindakannya menagih. Berkas ini menjawab pertanyaan lain:
 * "klien mana yang SELALU telat", dan tindakannya berbeda sama sekali —
 * menaikkan uang muka, memperpendek termin, atau menolak proyek berikutnya.
 *
 * Diukur 2026-08-16 pada basis nyata:
 *
 *   Ratna Sari      2 invoice   rata +33 hari   terparah  67   Rp 364,6 jt
 *   Eko Prasetyo    3 invoice   rata +31 hari   terparah  98   Rp 342,7 jt
 *   Melati Indah    3 invoice   rata  −2 hari   tepat waktu
 *   Sari Dewi       1 invoice   rata −30 hari   30 hari LEBIH AWAL
 *
 * Dua nama teratas tak pernah terlihat oleh 2.6 sebagai POLA — hanya sebagai
 * beberapa invoice terlambat yang tersebar di beberapa bulan.
 */

export interface RiwayatBayar {
  /** Selisih hari: positif = telat, negatif = lebih awal. */
  selisihHari: number
  /** Nominal yang dibayar, untuk menimbang bobot. */
  nominal: number
}

export interface HasilKebiasaan {
  invoice: number
  /** Rata-rata selisih hari. Positif = cenderung telat. */
  rataSelisih: number
  /** Selisih terburuk (paling telat). */
  palingTelat: number
  /** Berapa invoice yang benar-benar lewat jatuh tempo. */
  jumlahTelat: number
  /** Proporsi invoice yang telat, 0..1. */
  porsiTelat: number
  nilaiTotal: number
  /**
   * Layak dilaporkan? Dipisahkan dari angkanya supaya pemanggil tak
   * menyusun ulang aturannya sendiri dan menyimpang diam-diam.
   */
  layakLapor: boolean
  /** Kenapa layak/tidak — untuk pesan dan untuk test. */
  sebab: 'kurang_sampel' | 'tepat_waktu' | 'rata_rata_telat' | 'sering_telat'
}

/**
 * @param minInvoice  jumlah invoice minimum sebelum pola dipercaya
 * @param ambangHari  rata-rata telat (hari) yang dianggap bermasalah
 * @param ambangPorsi porsi invoice telat (0..1) yang dianggap bermasalah
 */
export function nilaiKebiasaanBayar(
  riwayat: RiwayatBayar[],
  minInvoice: number,
  ambangHari: number,
  ambangPorsi: number,
): HasilKebiasaan {
  const sah = riwayat.filter((r) => Number.isFinite(r.selisihHari))
  const n = sah.length

  const kosong: HasilKebiasaan = {
    invoice: n, rataSelisih: 0, palingTelat: 0, jumlahTelat: 0,
    porsiTelat: 0, nilaiTotal: 0, layakLapor: false, sebab: 'kurang_sampel',
  }
  if (n < Math.max(1, minInvoice)) return kosong

  const jumlah = sah.reduce((a, r) => a + r.selisihHari, 0)
  const telat = sah.filter((r) => r.selisihHari > 0)
  const nilaiTotal = sah.reduce((a, r) => a + (Number.isFinite(r.nominal) ? r.nominal : 0), 0)

  /*
    RATA-RATA TIDAK DIBULATKAN SEBELUM DIBANDINGKAN.

    Cacat yang sama sudah pernah terjadi di repo ini pada laporan upah:
    rasio dibulatkan lebih dulu, lalu dibandingkan dengan ambangnya, dan satu
    kasus lolos dari ambangnya sendiri. Pembulatan hanya untuk DITAMPILKAN.
  */
  const rataSelisih = jumlah / n
  const palingTelat = Math.max(...sah.map((r) => r.selisihHari))
  const porsiTelat = telat.length / n

  const dasar = {
    invoice: n,
    rataSelisih: Math.round(rataSelisih * 10) / 10,
    palingTelat,
    jumlahTelat: telat.length,
    porsiTelat: Math.round(porsiTelat * 100) / 100,
    nilaiTotal,
  }

  /*
    DUA JALUR, DAN JALUR KEDUA ADALAH YANG PENTING.

    Rata-rata saja bisa disembunyikan oleh pembayaran lebih awal. Klien dengan
    satu invoice telat 98 hari dan satu invoice 90 hari lebih awal punya
    rata-rata +4 — terlihat sehat, padahal separuh tagihannya macet tiga bulan.

    Jadi porsi invoice telat diperiksa TERPISAH, bukan sebagai turunan
    rata-rata. Salah satunya cukup untuk melapor.

    Diuji langsung di `kebiasaan-bayar.test.ts`; tanpa test itu, cacat ini tak
    punya gejala apa pun selain "kok klien itu tak pernah muncul".
  */
  if (rataSelisih >= ambangHari) return { ...dasar, layakLapor: true, sebab: 'rata_rata_telat' }
  if (porsiTelat >= ambangPorsi) return { ...dasar, layakLapor: true, sebab: 'sering_telat' }
  return { ...dasar, layakLapor: false, sebab: 'tepat_waktu' }
}
