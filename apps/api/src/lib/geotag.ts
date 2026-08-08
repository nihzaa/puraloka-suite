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

/**
 * Kolom geotag untuk satu baris INSERT foto — atau objek KOSONG.
 *
 * ── Kenapa fungsi ini ada, dan kenapa DI SINI
 *
 * Diukur 2026-08-08: seluruh rantai geotag lengkap kecuali dua mata rantai,
 * dan hasilnya **0 dari 36 foto punya geotag**.
 *
 * Salah satunya di sini: jalur insert laporan harian (`progress.ts` ~345 dan
 * ~405) menyalin `url`, `caption`, `taken_at` — dan MEMBUANG koordinatnya.
 * Hanya jalur penautan (~150) yang menyimpannya, dan itu jalur yang jarang
 * dipakai (foto menyusul saat sinyal buruk).
 *
 * Aturan penyaringannya ditaruh di pustaka, bukan disalin ke tiga tempat:
 * tiga salinan aturan yang sama akan menyimpang, dan yang menyimpang di
 * antara ketiganya adalah bukti lokasi kerja yang dipakai dalam sengketa.
 *
 * ── Kenapa objek KOSONG, bukan null di tiap kolom
 *
 * `{}` yang di-spread ke baris insert tidak menyentuh kolom sama sekali,
 * sehingga default kolom tetap berlaku. `{ lintang: null, ... }` menuliskan
 * null secara eksplisit — hasilnya sama di sini, tapi ia menyatakan "sudah
 * diperiksa, memang tak ada" pada kolom yang sebenarnya tak pernah dinilai.
 *
 * INVARIAN yang diuji:
 *  - koordinat tak lengkap / di luar jangkauan / NaN → `{}` (foto tetap masuk)
 *  - sumber tak dikenal → jatuh ke 'perangkat', bukan diteruskan mentah
 *    (constraint DB akan menolaknya dan MENGGAGALKAN seluruh insert foto)
 *  - akurasi negatif atau tak dikirim → null, bukan 0 ("tepat sempurna")
 */
export function barisGeotag(p: {
  lintang?: number | null
  bujur?: number | null
  akurasi_m?: number | null
  sumber_lokasi?: SumberLokasi
}): Record<string, unknown> {
  const { lintang, bujur, akurasi_m, sumber_lokasi } = p

  const masukAkal =
    typeof lintang === 'number' && Number.isFinite(lintang) &&
    lintang >= -90 && lintang <= 90 &&
    typeof bujur === 'number' && Number.isFinite(bujur) &&
    bujur >= -180 && bujur <= 180

  if (!masukAkal) return {}

  const sumberSah: SumberLokasi[] = ['perangkat', 'exif', 'manual']

  return {
    lintang,
    bujur,
    akurasi_m:
      typeof akurasi_m === 'number' && Number.isFinite(akurasi_m) && akurasi_m >= 0
        ? akurasi_m
        : null,
    sumber_lokasi:
      sumber_lokasi && sumberSah.includes(sumber_lokasi) ? sumber_lokasi : 'perangkat',
    lokasi_dicatat_pada: new Date().toISOString(),
  }
}
