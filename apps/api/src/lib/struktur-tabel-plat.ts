// Tabel koefisien momen pelat persegi — PBI 1971, beban merata.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA TABEL INI BERKAS SENDIRI
// ══════════════════════════════════════════════════════════════════════════════
//
// Ini DATA, bukan logika: 9 kondisi tumpuan × 4 koefisien × 17 rasio bentang.
// Memisahkannya dari `struktur-plat.ts` membuat dua hal mungkin — angkanya bisa
// diperiksa seorang insinyur tanpa membaca kode, dan koreksi tabel tak pernah
// menyentuh berkas yang berisi rumus.
//
// ── Kondisi tumpuan (PBI'71)
//
//   ┌───┐  garis putus = terletak bebas (simple)
//   │   │  garis penuh = menerus / terjepit elastis
//   └───┘
//
//   1  keempat sisi bebas                     5  X menerus, Y bebas
//   2  keempat sisi menerus                   6  Y menerus, X bebas (1 sisi)
//   3  tiga sisi menerus, satu bebas          7  X menerus penuh, Y bebas
//   4  dua sisi berhadapan menerus            8  tiga menerus + satu bebas (var.)
//                                             9  dua sisi bersebelahan menerus
//
// Ctx/Cty = 0 pada sisi yang TERLETAK BEBAS — tak ada momen tumpuan di sana.
// Itu bukan data hilang; itu artinya nol.
//
// ── ⚠ TIGA KOREKSI terhadap sumber, dan kenapa DIKOREKSI bukan disalin
//
// Tabel ini dibaca dari workbook "Auto Structure Pro" (lisensi founder), dan
// tiga barisnya memuat nilai yang MUSTAHIL menurut deretnya sendiri:
//
//   Kondisi 3 Ctx/Clx : … 48, 55, [616], [7], 71, 76 …
//   Kondisi 5 Ctx/Clx : … 59, 60, [616], [2], 62, 63 …
//
// Koefisien PBI naik monoton terhadap Ly/Lx; `616` diapit 55 dan 71 tidak
// mungkin. Bentuknya khas salah-ketik dua sel: `61` + `6…` menyatu jadi `616`,
// sisanya jadi sel berikutnya. Nilai yang konsisten dengan deret: 61 dan 67
// (kondisi 3), 61 dan 62 (kondisi 5).
//
// **Menyalinnya apa adanya akan menghasilkan momen 10× lipat** pada rasio
// Ly/Lx = 1.2 — dan hasilnya BUKAN galat melainkan pelat yang ditulangi jauh
// berlebihan (kalau beruntung) atau perhitungan yang dipercaya padahal ngawur.
//
// Koreksi ini ditandai di `KOREKSI` di bawah supaya terlihat, bukan
// disembunyikan. Kalau kelak sumber PBI asli mengatakan lain, ubah di situ.
// ══════════════════════════════════════════════════════════════════════════════

/** Rasio Ly/Lx yang punya kolom di tabel. `>2.5` diwakili 99. */
export const RASIO_TABEL = [
  1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
  2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 99,
] as const

export type JenisKoefisien = 'Clx' | 'Cly' | 'Ctx' | 'Cty'
export type KondisiPelat = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/**
 * Koreksi terhadap sumber — DIDAFTARKAN, bukan diam-diam ditulis benar.
 *
 * Tiap entri menyatakan: apa yang tertulis di sumber, apa yang dipakai, dan
 * kenapa. Seorang insinyur yang meragukan angka di tabel bisa membaca daftar
 * ini alih-alih membandingkan sel per sel dengan workbook.
 */
export const KOREKSI = [
  {
    kondisi: 3 as KondisiPelat, koefisien: ['Ctx', 'Cly'] as const, indeksRasio: [2, 3],
    sumber: [616, 7], dipakai: [61, 67],
    alasan: 'deret 48·55·[?]·[?]·71·76 menuntut nilai naik monoton; 616 mustahil. '
      + 'Pola khas dua sel tergeser saat penyalinan tabel.',
  },
  {
    kondisi: 5 as KondisiPelat, koefisien: ['Ctx', 'Clx'] as const, indeksRasio: [5, 6],
    sumber: [616, 2], dipakai: [61, 62],
    alasan: 'deret 59·60·[?]·[?]·62·63 menuntut 61 dan 62; 616 mustahil.',
  },
] as const

/**
 * ⚠ SATU KOREKSI YANG DIBATALKAN — dan kenapa ini dicatat, bukan dihapus.
 *
 * Percobaan pertama berkas ini "mengoreksi" Kondisi 9 @ Ly/Lx = 1.0 dari
 * **13 → 44**, dengan alasan 13 memutus deret yang lalu melompat ke 48·51·55.
 * Penalaran itu rapi dan SALAH.
 *
 * Diverifikasi ke tabel PBI'71 tercetak (Modul-3 "Analisa Pelat Lantai Dua
 * Arah Metode Koefisien Momen Tabel PBI-1971", Tabel 1): **13 memang tercetak
 * begitu.** Ia bukan salah ketik. Pola yang sama muncul di beberapa titik
 * ekstrem tabel — Kondisi 2, 5, dan 9 sama-sama bernilai 13 di kolom >2,5.
 *
 * Kalau koreksi itu diterapkan, pelat bujur sangkar berkondisi 9 — kasus yang
 * SERING dipakai — akan dihitung dengan koefisien 3,4× lipat dari yang benar,
 * dan hasilnya bukan galat melainkan pelat yang ditulangi berlebihan dengan
 * angka yang terlihat meyakinkan.
 *
 * Pelajarannya ditulis di sini, bukan dibuang bersama kodenya: **deret yang
 * "terlihat tidak wajar" bukan bukti salah ketik.** Yang membedakan koreksi 1
 * dan 2 (benar) dari yang ini (salah) adalah bentuk cacatnya — 616 mustahil
 * ada di antara 55 dan 71 karena BUKAN sekadar aneh, melainkan tak muat di
 * rentang mana pun.
 *
 * ── Uji-mandiri yang menemukan ketiganya, dan layak dipakai lagi
 *
 * Di tabel PBI'71, untuk setiap kondisi bersisi menerus: **Ctx identik dengan
 * Clx** dan **Cty identik dengan Cly** di seluruh 17 kolom. Kalau dua baris itu
 * tak sama persis, di situlah letak pergeseran selnya. Aturan ini ditegakkan
 * oleh test (`struktur-tabel-plat.test.ts`), jadi kesalahan salin berikutnya
 * tertangkap tanpa perlu membandingkan ke sumber luar.
 */

/**
 * Tabel koefisien. Urutan nilai mengikuti `RASIO_TABEL`.
 *
 * Sumber: PBI 1971 (momen pelat persegi akibat beban merata), dibaca dari
 * workbook Auto Structure Pro sheet "Tabel Koefisien Momen Plat", dengan tiga
 * koreksi di atas diterapkan.
 */
export const TABEL_KOEFISIEN: Record<KondisiPelat, Record<JenisKoefisien, readonly number[]>> = {
  1: {
    Ctx: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Clx: [44, 52, 59, 66, 73, 78, 84, 88, 93, 97, 100, 103, 106, 108, 110, 112, 125],
    Cly: [44, 45, 45, 44, 44, 43, 41, 40, 39, 38, 37, 36, 35, 34, 32, 32, 25],
    Cty: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  2: {
    Ctx: [36, 42, 46, 50, 53, 56, 58, 59, 60, 61, 62, 62, 62, 63, 63, 63, 63],
    Clx: [36, 42, 46, 50, 53, 56, 58, 59, 60, 61, 62, 62, 62, 63, 63, 63, 63],
    Cly: [36, 37, 38, 38, 38, 37, 36, 36, 35, 35, 35, 34, 34, 34, 34, 34, 13],
    Cty: [36, 37, 38, 38, 38, 37, 36, 36, 35, 35, 35, 34, 34, 34, 34, 34, 38],
  },
  3: {
    // KOREKSI: indeks 2,3 — sumber [616, 7] → [61, 67]
    Ctx: [48, 55, 61, 67, 71, 76, 79, 82, 84, 86, 88, 89, 90, 91, 92, 92, 94],
    Clx: [48, 55, 61, 67, 71, 76, 79, 82, 84, 86, 88, 89, 90, 91, 92, 92, 94],
    Cly: [48, 50, 51, 51, 51, 51, 51, 50, 50, 49, 49, 49, 48, 48, 47, 47, 19],
    Cty: [48, 50, 51, 51, 51, 51, 51, 50, 50, 49, 49, 49, 48, 48, 47, 47, 56],
  },
  4: {
    Ctx: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Clx: [22, 28, 34, 41, 48, 55, 62, 68, 74, 80, 85, 89, 93, 97, 100, 103, 125],
    Cly: [51, 57, 62, 67, 70, 73, 75, 77, 78, 79, 79, 79, 79, 79, 79, 79, 25],
    Cty: [51, 57, 62, 67, 70, 73, 75, 77, 78, 79, 79, 79, 79, 79, 79, 79, 75],
  },
  5: {
    // KOREKSI: indeks 5,6 — sumber [616, 2] → [61, 62]
    Ctx: [51, 54, 57, 59, 60, 61, 62, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63],
    Clx: [51, 54, 57, 59, 60, 61, 62, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63],
    Cly: [22, 20, 18, 17, 15, 14, 13, 12, 11, 10, 10, 10, 9, 9, 9, 9, 13],
    Cty: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  6: {
    Ctx: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Clx: [31, 38, 45, 53, 59, 66, 72, 78, 83, 88, 92, 96, 99, 102, 105, 108, 125],
    Cly: [60, 65, 69, 73, 75, 77, 78, 79, 79, 80, 80, 80, 79, 79, 79, 79, 25],
    Cty: [60, 65, 69, 73, 75, 77, 78, 79, 79, 80, 80, 80, 79, 79, 79, 79, 75],
  },
  7: {
    Ctx: [60, 66, 71, 76, 79, 82, 85, 87, 88, 89, 90, 91, 91, 92, 92, 93, 94],
    Clx: [60, 66, 71, 76, 79, 82, 85, 87, 88, 89, 90, 91, 91, 92, 92, 93, 94],
    Cly: [31, 30, 28, 27, 25, 24, 22, 21, 20, 19, 18, 17, 17, 16, 16, 15, 12],
    Cty: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  8: {
    Ctx: [38, 46, 53, 59, 65, 69, 73, 77, 80, 83, 85, 86, 87, 88, 89, 90, 54],
    Clx: [38, 46, 53, 59, 65, 69, 73, 77, 80, 83, 85, 86, 87, 88, 89, 90, 54],
    Cly: [43, 46, 48, 50, 51, 51, 51, 51, 50, 50, 50, 49, 49, 48, 48, 48, 19],
    Cty: [43, 46, 48, 50, 51, 51, 51, 51, 50, 50, 50, 49, 49, 48, 48, 48, 56],
  },
  9: {
    // 13 di kolom pertama BUKAN salah ketik — diverifikasi ke PBI'71 tercetak.
    // Lihat "SATU KOREKSI YANG DIBATALKAN" di atas sebelum mengubahnya.
    Ctx: [13, 48, 51, 55, 57, 58, 60, 61, 62, 62, 62, 63, 63, 63, 63, 63, 63],
    Clx: [13, 48, 51, 55, 57, 58, 60, 61, 62, 62, 62, 63, 63, 63, 63, 63, 63],
    Cly: [38, 39, 38, 38, 37, 36, 36, 35, 35, 34, 34, 34, 33, 33, 33, 33, 13],
    Cty: [38, 39, 38, 38, 37, 36, 36, 35, 35, 34, 34, 34, 33, 33, 33, 33, 38],
  },
}

/** Sisi pelat: bagaimana ia bertumpu. */
export type Tumpuan = 'bebas' | 'menerus'

/**
 * Menentukan kondisi PBI dari empat sisi.
 *
 * Workbook memakai rantai IF bersarang yang hanya mengenali sebagian kombinasi
 * dan MEMULANGKAN TEKS KOSONG untuk sisanya — pelat yang tak cocok pola
 * menghasilkan koefisien kosong lalu momen NOL, tanpa satu pun peringatan.
 * Di sini kombinasi yang tak dikenal MELEMPAR, bukan memulangkan nol.
 *
 * @param y1 y2 x1 x2  tumpuan tiap sisi
 */
export function tentukanKondisi(
  y1: Tumpuan, y2: Tumpuan, x1: Tumpuan, x2: Tumpuan,
): KondisiPelat {
  /*
    Pemetaan ini DITURUNKAN dari rantai IF workbook (sel D12), bukan ditebak —
    dan tebakan pertama saya SALAH di dua tempat.

    Percobaan pertama menyimpulkan "tiga menerus → 3 kalau X keduanya menerus,
    kalau tidak 8", dan "dua bersebelahan → 9". Diadu dengan input contoh
    workbook (Y menerus·menerus, X bebas·menerus) yang seharusnya Kondisi 9,
    kode memulangkan 8. Sumbu X dan Y tertukar.

    Aturan yang SEBENARNYA berlaku, dibaca dari rumusnya:

        1  keempat bebas
        2  keempat menerus
        3  Y campur DAN X campur          (masing-masing 1 menerus 1 bebas)
        4  Y keduanya bebas, X keduanya menerus
        5  Y keduanya menerus, X keduanya bebas
        6  Y keduanya bebas, X campur
        7  Y campur, X keduanya bebas
        8  Y campur, X keduanya menerus
        9  Y keduanya menerus, X campur

    Perhatikan bahwa jumlah sisi menerus TIDAK cukup untuk membedakan: kondisi
    3, 8, dan 9 sama-sama bisa punya 2–3 sisi menerus. Yang menentukan adalah
    kombinasi per SUMBU. Itulah kenapa versi pertama saya bisa lolos test
    "jumlahnya" tetapi salah untuk kasus nyata.
  */
  const yMenerus = [y1, y2].filter((t) => t === 'menerus').length
  const xMenerus = [x1, x2].filter((t) => t === 'menerus').length

  if (yMenerus === 0 && xMenerus === 0) return 1
  if (yMenerus === 2 && xMenerus === 2) return 2
  if (yMenerus === 1 && xMenerus === 1) return 3
  if (yMenerus === 0 && xMenerus === 2) return 4
  if (yMenerus === 2 && xMenerus === 0) return 5
  if (yMenerus === 0 && xMenerus === 1) return 6
  if (yMenerus === 1 && xMenerus === 0) return 7
  if (yMenerus === 1 && xMenerus === 2) return 8
  return 9  // yMenerus === 2 && xMenerus === 1
}

export interface HasilKoefisien {
  nilai: number
  /** Rasio yang dipakai setelah dibulatkan ke kolom tabel. */
  rasioDipakai: number
}

/**
 * Ambil koefisien momen dari tabel.
 *
 * Rasio dibulatkan ke 1 desimal lalu dicocokkan ke kolom terdekat —
 * cara yang sama dengan workbook (`ROUND(…,1)` lalu INDEX/MATCH), supaya
 * hasilnya bisa dibandingkan langsung. Rasio > 2.5 memakai kolom terakhir.
 */
export function koefisienMomen(
  kondisi: KondisiPelat, jenis: JenisKoefisien, lyPerLx: number,
): HasilKoefisien {
  if (!(lyPerLx >= 1)) {
    throw new Error(`koefisienMomen: Ly/Lx harus ≥ 1 (diterima ${lyPerLx}). `
      + 'Tabel PBI mendefinisikan Ly sebagai sisi PANJANG — tukar Lx dan Ly.')
  }
  const bulat = Math.round(lyPerLx * 10) / 10
  let idx = RASIO_TABEL.findIndex((r) => r === bulat)
  if (idx < 0) idx = bulat > 2.5 ? RASIO_TABEL.length - 1 : 0

  const deret = TABEL_KOEFISIEN[kondisi][jenis]
  const nilai = deret[idx]
  if (nilai == null) throw new Error(`koefisienMomen: nilai tak ada untuk kondisi ${kondisi} ${jenis} @ ${bulat}`)

  return { nilai, rasioDipakai: idx === RASIO_TABEL.length - 1 ? 99 : bulat }
}
