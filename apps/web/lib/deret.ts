/**
 * DERET — perhitungan sparkline & delta untuk kartu KPI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DI `lib/`, BUKAN DI DALAM KOMPONEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua keputusan di sini menentukan ARTI angka di layar, bukan rupanya:
 *
 *   1. kapan delta TIDAK ditampilkan (pembagi nol, titik kurang dari dua)
 *   2. arah mana yang "baik" untuk metrik tertentu
 *
 * Keduanya mudah bergeser diam-diam saat komponennya disunting, dan
 * gejalanya halus: angka tetap tampil, hanya salah arti. Karena itu keduanya
 * dites terpisah dari tampilan.
 *
 * ── Arah "baik" ditentukan PER METRIK — brief §3.4
 *
 * Ini yang paling mudah salah. Menghijaukan setiap kenaikan membuat
 * "kasbon beredar naik 40%" tampil HIJAU — memberi rasa aman yang salah pada
 * angka yang justru memburuk. Pengeluaran, kasbon, dan invoice belum lunas
 * semuanya "turun itu baik".
 */

/** `naik-baik` = kenaikan itu kabar baik · `turun-baik` = kebalikannya. */
export type ArahBaik = 'naik-baik' | 'turun-baik'

export interface Delta {
  /** Persen perubahan dari titik kedua-terakhir ke titik terakhir. */
  persen: number
  /** Sudah memperhitungkan arah metrik — bukan sekadar tanda positif. */
  baik: boolean
}

/**
 * Path SVG untuk sparkline.
 *
 * Mengembalikan string kosong bila titiknya kurang dari dua: satu titik bukan
 * garis, dan menggambarnya menghasilkan noktah mengambang yang terbaca sebagai
 * kerusakan render.
 */
export function jalurSparkline(nilai: number[], lebar: number, tinggi: number): string {
  if (!Array.isArray(nilai) || nilai.length < 2) return ''

  const bersih = nilai.map((n) => (Number.isFinite(n) ? n : 0))
  const min = Math.min(...bersih)
  const max = Math.max(...bersih)

  /*
   * Deret DATAR membagi nol kalau rentangnya dipakai mentah, dan hasilnya
   * `NaN` di atribut `d`. SVG dengan path NaN tidak menggambar apa pun —
   * garisnya HILANG tanpa satu pun galat. Rentang 1 menaruhnya di tengah.
   */
  const rentang = max - min || 1
  const langkah = lebar / (bersih.length - 1)

  return bersih
    .map((n, i) => {
      const x = +(i * langkah).toFixed(2)
      // y dibalik: nilai TERTINGGI harus berada di ATAS (y terkecil).
      const y = +(tinggi - ((n - min) / rentang) * tinggi).toFixed(2)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join('')
}

/**
 * Delta dari dua titik terakhir.
 *
 * `null` bila tak bisa dihitung dengan jujur — dan itu keadaan yang WAJAR,
 * bukan kegagalan: dari 0 ke 50 bukan "naik tak hingga", ia hanya tak punya
 * persentase yang bermakna. Menampilkannya sebagai `Infinity%` atau `100%`
 * akan mengarang informasi.
 */
export function hitungDelta(nilai: number[], arah: ArahBaik = 'naik-baik'): Delta | null {
  if (!Array.isArray(nilai) || nilai.length < 2) return null

  const kini = nilai[nilai.length - 1]
  const lalu = nilai[nilai.length - 2]
  if (!Number.isFinite(kini) || !Number.isFinite(lalu) || lalu === 0) return null

  const persen = ((kini - lalu) / Math.abs(lalu)) * 100
  const naik = persen > 0
  const baik = persen === 0 ? true : arah === 'naik-baik' ? naik : !naik

  return { persen, baik }
}
