// Geotag foto lapangan (INTI #8) — fungsi murni ber-test.
//
// ── Kenapa fungsi murni terpisah
//
// Jarak antara dua koordinat menentukan apakah sebuah foto dianggap "di
// lokasi" atau "jauh dari lokasi" — dan itu penilaian yang bisa dipakai
// dalam sengketa. Rumusnya harus bisa diuji tanpa database, dan test itu
// yang menjadi penjaganya.

export type SumberLokasi = 'perangkat' | 'exif' | 'manual'

export interface Koordinat {
  lintang: number
  bujur: number
}

/**
 * Jarak dua titik di permukaan bumi, dalam METER (formula haversine).
 *
 * ── Kenapa haversine, bukan Euclidean
 *
 * Menghitung jarak koordinat seolah bidang datar (`√(Δlat² + Δlng²)`) meleset
 * makin jauh makin ke kutub, dan yang lebih penting: 1 derajat bujur di
 * Jakarta ≈ 111 km, sementara 1 derajat bujur di Oslo ≈ 62 km. Perhitungan
 * datar akan menganggap keduanya sama.
 *
 * Untuk Indonesia (dekat khatulistiwa) selisihnya kecil, tapi rumus yang
 * benar tak lebih mahal — dan aplikasi ini akan dipakai perusahaan yang
 * proyeknya bisa di mana saja.
 *
 * ── Kenapa bukan PostGIS
 *
 * PostGIS akan lebih tepat dan jauh lebih berat: satu ekstensi database
 * untuk satu perhitungan yang muat dalam sepuluh baris. Kalau suatu hari
 * ada kebutuhan geospasial sungguhan (poligon area kerja, rute), itu saat
 * yang benar untuk memindahkannya.
 */
export function jarakMeter(a: Koordinat, b: Koordinat): number {
  const R = 6_371_000 // jari-jari rata-rata bumi, meter
  const rad = (d: number) => (d * Math.PI) / 180

  const dLat = rad(b.lintang - a.lintang)
  const dLng = rad(b.bujur - a.bujur)
  const lat1 = rad(a.lintang)
  const lat2 = rad(b.lintang)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))))
}

export interface PenilaianLokasi {
  /** Jarak ke titik acuan proyek, meter. `null` bila salah satu tak punya koordinat. */
  jarakM: number | null
  /** `true` bila di dalam radius wajar proyek. `null` bila tak bisa dinilai. */
  diLokasi: boolean | null
  /**
   * Kenapa penilaiannya begitu — untuk ditampilkan apa adanya, bukan
   * disimpulkan ulang di UI.
   */
  alasan:
    | 'foto tanpa koordinat'
    | 'proyek belum punya titik acuan'
    | 'di dalam radius'
    | 'di luar radius'
    | 'akurasi GPS terlalu rendah untuk dinilai'
}

/**
 * Menilai apakah foto diambil di lokasi proyek.
 *
 * ── Yang membuat penilaian ini bisa dipercaya
 *
 * **Akurasi ikut diperhitungkan.** Titik yang meleset 300 m tak bisa dipakai
 * menyimpulkan apa pun tentang radius 500 m — jaraknya bisa 200 m atau 800 m
 * dan keduanya sama mungkinnya. Menyatakan "di luar lokasi" atas dasar itu
 * adalah tuduhan yang tak bisa dipertahankan.
 *
 * Ambangnya: akurasi tidak boleh melebihi radius. Kalau iya, hasilnya
 * `diLokasi: null` — TIDAK BISA DINILAI, bukan "di luar".
 *
 * **Tak pernah memulangkan `false` karena data kurang.** Foto tanpa
 * koordinat dan proyek tanpa titik acuan sama-sama menghasilkan `null`.
 * Membedakan "tidak di lokasi" dari "tidak diketahui" adalah inti kejujuran
 * fitur ini.
 */
export function nilaiLokasi(
  foto: (Koordinat & { akurasiM?: number | null }) | null,
  proyek: Koordinat | null,
  radiusM = 500,
): PenilaianLokasi {
  if (!foto) return { jarakM: null, diLokasi: null, alasan: 'foto tanpa koordinat' }
  if (!proyek) return { jarakM: null, diLokasi: null, alasan: 'proyek belum punya titik acuan' }

  const jarakM = jarakMeter(foto, proyek)

  // Akurasi lebih besar dari radius → titiknya tak bisa membedakan dalam
  // dari luar. Jaraknya tetap dilaporkan (berguna sebagai perkiraan kasar),
  // tapi kesimpulannya tidak.
  if (foto.akurasiM != null && foto.akurasiM > radiusM) {
    return { jarakM, diLokasi: null, alasan: 'akurasi GPS terlalu rendah untuk dinilai' }
  }

  return jarakM <= radiusM
    ? { jarakM, diLokasi: true, alasan: 'di dalam radius' }
    : { jarakM, diLokasi: false, alasan: 'di luar radius' }
}

/**
 * Jarak dalam bentuk yang dibaca manusia.
 *
 * Di bawah 1 km ditulis dalam meter dan DIBULATKAN ke puluhan: GPS ponsel
 * tak pernah setepat satu meter, dan menulis "347 m" memberi kesan presisi
 * yang tak dimiliki angkanya.
 */
export function jarakTerbaca(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1)} km`
}
