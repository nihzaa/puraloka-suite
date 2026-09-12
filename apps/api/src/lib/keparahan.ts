/**
 * KEPARAHAN — satu sumber kebenaran untuk "temuan ini berat atau tidak".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13 terhadap basis:
 *
 *     ncr_severity    → minor, major, kritis
 *     punch_severity  → ringan, sedang, berat, kritis
 *
 *     ncr_items.severity nyata:  minor 7 · kritis 6 · major 6
 *
 * Tiga tempat menghitung "NCR berat" dengan pola yang DITULIS TANGAN:
 *
 *     /major|mayor|tinggi|high/i
 *
 * Pola itu tak memuat `kritis`. Akibatnya ikhtisar mutu melaporkan
 * **6 NCR berat dari 12 yang sesungguhnya berat** — tepat separuhnya
 * hilang, dan yang hilang justru tingkat yang PALING parah.
 *
 * ── Kenapa ini tak bergejala
 *
 * `kritis` bukan nilai tak sah; ia anggota sah enum. Query berhasil, tipe
 * cocok, `tsc` hijau, tak ada satu pun galat. Yang salah cuma ANGKANYA,
 * dan angka yang terlalu kecil terbaca persis seperti kabar baik.
 *
 * Di layar itu berbunyi "NCR berat 6" dengan nada tenang, sementara enam
 * temuan kritis lain menganggur tanpa terhitung. Ini kelas kegagalan yang
 * sama dengan `?? 0` yang menelan KPI (CLAUDE.md §8a.3): **nol — atau
 * angka kecil — yang salah tak bisa dibedakan dari yang benar.**
 *
 * ── Kenapa DAFTAR, bukan pola teks
 *
 * Pola teks menuntut penebaknya membayangkan semua ejaan yang mungkin.
 * Yang ditulis 2026 memuat `high` dan `tinggi` — dua ejaan yang TIDAK
 * ADA di enum mana pun di basis ini — sambil melewatkan `kritis`, yang
 * ada di KEDUANYA. Ia menjaga terhadap kosakata yang dibayangkan, bukan
 * kosakata yang dipakai.
 *
 * Daftar di bawah diturunkan dari `pg_enum`, dan `audit-keparahan-lengkap.mjs`
 * merahkan CI kalau enum bertambah nilai yang belum ditimbang di sini.
 * Nilai BARU tak boleh diam-diam jatuh ke "tidak berat" — itu persis
 * bentuk cacat yang modul ini tutup.
 */

/**
 * Nilai `ncr_severity` yang dihitung BERAT.
 *
 * `kritis` lebih parah daripada `major`, jadi keduanya masuk. Yang di luar
 * daftar ini (`minor`) sengaja tidak.
 */
export const NCR_BERAT = ['major', 'kritis'] as const

/**
 * Nilai `punch_severity` yang dihitung BERAT.
 *
 * Kosakatanya BERBEDA dari NCR — `berat` di sini adalah nama tingkat,
 * bukan kategori. Menyatukan kedua daftar jadi satu akan membuat NCR
 * ber-severity `sedang` (yang tak pernah ada) terlihat tertangani.
 */
export const PUNCH_BERAT = ['berat', 'kritis'] as const

/**
 * Apakah sebuah nilai `ncr_items.severity` tergolong berat?
 *
 * Menerima `null`/`undefined` dan memulangkan `false` — baris tanpa
 * severity BUKAN baris berat, dan memperlakukannya sebagai berat akan
 * menaikkan angka alarm atas data yang belum diisi.
 *
 * Perbandingan DINORMALKAN (trim + huruf kecil) karena nilai bisa datang
 * dari impor CSV atau isian AI, bukan hanya dari enum yang dipaksakan
 * basis. Perbandingan persis akan melewatkan `'Kritis'` dengan K besar,
 * dan itu kegagalan yang arahnya sama dengan yang diperbaiki di sini.
 */
export function ncrBerat(nilai: string | null | undefined): boolean {
  if (!nilai) return false
  const n = nilai.trim().toLowerCase()
  return (NCR_BERAT as readonly string[]).includes(n)
}

/** Sama seperti `ncrBerat`, untuk `punch_items.severity`. */
export function punchBerat(nilai: string | null | undefined): boolean {
  if (!nilai) return false
  const n = nilai.trim().toLowerCase()
  return (PUNCH_BERAT as readonly string[]).includes(n)
}

/**
 * Status `ncr_status` yang berarti SELESAI — tak lagi menuntut tindakan.
 *
 * ⚠ Ditemukan 2026-09-13 saat mengukur dampak perbaikan severity:
 * `mutu-ikhtisar.ts` menyaring dengan `status !== 'ditutup' && status !==
 * 'closed'`. Nilai `'closed'` TIDAK ADA di enum ini — perbandingannya mati,
 * selalu benar, dan tak pernah menyaring apa pun.
 *
 * Yang lolos karenanya: `dibatalkan`. NCR yang sudah DIBATALKAN terhitung
 * sebagai temuan terbuka, dan ikut menaikkan angka yang dibaca sebagai
 * beban kerja yang masih menunggu.
 *
 * Enum lengkapnya:
 *     terbuka · disposisi · perbaikan · verifikasi · ditutup · dibatalkan
 */
export const NCR_SELESAI = ['ditutup', 'dibatalkan'] as const

/**
 * Status `punch_status` yang berarti SELESAI.
 *
 * ⚠ Lebih parah daripada NCR: baris lama berbunyi `status !== 'closed' &&
 * status !== 'selesai'`, dan KEDUA nilai itu tak ada di enum. Jadi
 * penyaringnya tak pernah membuang satu baris pun — `ditutup` (4 baris
 * terukur) dan `ditolak` ikut terhitung sebagai punch TERBUKA.
 *
 * Enum lengkapnya:
 *     terbuka · dikerjakan · menunggu_cek · ditutup · ditolak
 */
export const PUNCH_SELESAI = ['ditutup', 'ditolak'] as const

/** Apakah NCR ini masih menuntut tindakan? */
export function ncrTerbuka(status: string | null | undefined): boolean {
  if (!status) return true
  return !(NCR_SELESAI as readonly string[]).includes(status.trim().toLowerCase())
}

/** Apakah punch item ini masih menuntut tindakan? */
export function punchTerbuka(status: string | null | undefined): boolean {
  if (!status) return true
  return !(PUNCH_SELESAI as readonly string[]).includes(status.trim().toLowerCase())
}

/**
 * Label Indonesia per tingkat, untuk KEDUA enum.
 *
 * Dipakai layar supaya `kritis` tak muncul mentah. `Badge.statusLabel` di
 * mobile memakai bentuk `map[x] ?? x`, jadi kunci yang tak terdaftar TIDAK
 * gagal — ia tampil apa adanya, dan itulah yang memunculkan lencana
 * berbunyi `submitted` di layar mandor (CLAUDE.md §6).
 */
export const LABEL_KEPARAHAN: Record<string, string> = {
  minor: 'Minor',
  major: 'Mayor',
  ringan: 'Ringan',
  sedang: 'Sedang',
  berat: 'Berat',
  kritis: 'Kritis',
}
