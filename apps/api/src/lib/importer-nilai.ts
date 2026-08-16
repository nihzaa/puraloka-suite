/**
 * NILAI BERDAFTAR-TERTUTUP UNTUK IMPORTER.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/importer.ts` tahu empat jenis sel: teks, angka, tanggal, bool. Tak ada
 * jenis "salah satu dari daftar" — dan beberapa kolom target justru dijaga
 * daftar tertutup oleh basis.
 *
 * Yang terjadi kalau ini tak ada, dan ini BUKAN hipotesis (2026-08-16):
 * skema pemasok versi pertama menuliskan `payment_terms` sebagai angka hari.
 * Basis menolaknya lewat `suppliers_payment_terms_check`, dan karena importer
 * ALL-OR-NOTHING, yang gagal bukan satu sel melainkan SELURUH berkas — dengan
 * pesan galat Postgres yang tak menyebut kolom mana yang salah bagi pengguna.
 *
 * ── Kenapa dipetakan, bukan ditolak
 *
 * Daftar sahnya `cod`, `prepaid`, `net_7`, `net_14`, `net_30`, `open_account` —
 * istilah basis data. Tak ada staf pengadaan yang mengetik "open_account" di
 * Excel; mereka menulis "NET 30", "30 hari", "tempo 30", "tunai", "COD".
 *
 * Menolak semua itu berarti importir hanya berguna untuk berkas yang sudah
 * ditulis dalam istilah basis — yaitu berkas yang diekspor dari sistem ini
 * sendiri, satu-satunya berkas yang justru tak perlu diimpor.
 *
 * ── Kenapa yang tak dikenali jadi NULL, bukan ditebak
 *
 * `payment_terms` menentukan kapan uang keluar. Menebak "net_30" untuk sel
 * berbunyi "sesuai kesepakatan" menghasilkan jatuh tempo yang terlihat pasti
 * padahal karangan — dan tagihan yang lewat tempo karena tebakan itu tak
 * meninggalkan jejak bahwa ia pernah ditebak.
 *
 * NULL jujur: kolomnya nullable, dan termin yang kosong terlihat kosong.
 */

/** Nilai sah `suppliers.payment_terms` — cermin `suppliers_payment_terms_check`.
 *
 *  ⚠ Kalau CHECK di basis berubah, daftar ini WAJIB ikut. Dijaga
 *  `__tests__/importer-nilai.test.ts` yang membaca constraint-nya langsung. */
export const TERMIN_PEMASOK = [
  'cod', 'prepaid', 'net_7', 'net_14', 'net_30', 'open_account',
] as const

export type TerminPemasok = (typeof TERMIN_PEMASOK)[number]

/** Kata yang lazim dipakai orang → nilai basis. Kunci sudah dinormalkan
 *  (huruf kecil, tanpa tanda baca, spasi tunggal). */
const SINONIM: Record<string, TerminPemasok> = {
  // Tunai / bayar di tempat
  'cod': 'cod',
  'tunai': 'cod',
  'cash': 'cod',
  'cash on delivery': 'cod',
  'bayar di tempat': 'cod',

  // Bayar di muka
  'prepaid': 'prepaid',
  'dp': 'prepaid',
  'di muka': 'prepaid',
  'dibayar di muka': 'prepaid',
  'uang muka': 'prepaid',

  // Tempo berhari
  'net 7': 'net_7',
  'net7': 'net_7',
  '7': 'net_7',
  '7 hari': 'net_7',
  'tempo 7': 'net_7',
  'tempo 7 hari': 'net_7',

  'net 14': 'net_14',
  'net14': 'net_14',
  '14': 'net_14',
  '14 hari': 'net_14',
  'tempo 14': 'net_14',
  'tempo 14 hari': 'net_14',

  'net 30': 'net_30',
  'net30': 'net_30',
  '30': 'net_30',
  '30 hari': 'net_30',
  'tempo 30': 'net_30',
  'tempo 30 hari': 'net_30',
  '1 bulan': 'net_30',

  // Rekening terbuka
  'open account': 'open_account',
  'rekening terbuka': 'open_account',
  'oa': 'open_account',
}

/** Menormalkan sel untuk dicocokkan: huruf kecil, `_`/`-`/`.` jadi spasi,
 *  tanda baca lain dibuang, spasi tunggal.
 *
 *  Sengaja SAMA BENTUKNYA dengan `normalkan()` di `importer.ts` supaya
 *  "NET_30" dari satu berkas dan "net 30" dari berkas lain berakhir sama. */
function normalkan(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Memetakan isi sel ke nilai `payment_terms` yang sah.
 *
 * Mengembalikan `null` bila kosong ATAU tak dikenali — keduanya berarti
 * "termin tidak diketahui", dan basis menerima NULL.
 */
export function terminPemasok(sel: unknown): TerminPemasok | null {
  if (sel === null || sel === undefined) return null

  const n = normalkan(String(sel))
  if (n === '') return null

  // Sudah berupa nilai basis — jalur berkas hasil ekspor sistem ini sendiri.
  // Dicocokkan setelah normalisasi, jadi "net_30" masuk lewat sini sebagai
  // "net 30" → dicari di SINONIM. Pemeriksaan langsung ini menangkap
  // 'cod', 'prepaid', 'open account'.
  const langsung = TERMIN_PEMASOK.find((t) => normalkan(t) === n)
  if (langsung) return langsung

  return SINONIM[n] ?? null
}
