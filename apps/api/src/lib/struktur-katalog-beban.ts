/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KATALOG BEBAN — dipilih dari SNI, bukan diketik dari ingatan
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── Kenapa ini ada
 *
 * Sebelum ini `bebanHidupKnM2` adalah angka bebas. Estimator mengetik 2,5
 * karena "biasanya segitu" — padahal SNI 1727:2020 Tabel 4.3-1 SUDAH
 * menetapkannya per fungsi ruang, dan selisihnya besar:
 *
 *     hunian        1,92 kN/m²
 *     kantor        2,40 kN/m²
 *     ruang rapat   4,79 kN/m²   ← dua setengah kali hunian
 *     perpustakaan  7,18 kN/m²   ← hampir empat kali
 *
 * Angka yang diketik dari ingatan tak punya "rasa salah": 2,5 untuk ruang
 * rapat terlihat wajar, dan baloknya lolos pemeriksaan dengan beban separuh
 * dari yang seharusnya. Tak ada galat, tak ada gejala — sampai lantainya
 * dipakai rapat.
 *
 * ── Beban MATI: yang dihitung vs yang dipilih
 *
 * Sebagian besar beban mati TIDAK perlu diinput sama sekali, dan modul
 * `struktur-beban-balok` memang sudah menghitungnya sendiri:
 *
 *     berat sendiri balok  = b × h × 24 kN/m³      (dari dimensi)
 *     berat pelat          = tebal × 24 × lebar pikul
 *
 * Yang TIDAK bisa diturunkan dari dimensi adalah lapisan finishing: keramik,
 * spesi, plafon, penggantung, MEP, waterproofing. Itu bergantung PILIHAN
 * material, bukan geometri — dan karena itu dipilih dari katalog ini, bukan
 * dikarang angkanya.
 *
 * ⚠ Angka di sini nilai LAZIM untuk perencanaan awal. Untuk bangunan penting
 * atau material tak biasa, berat sesungguhnya datang dari spesifikasi pabrik.
 * Itu dinyatakan di tiap keluaran, bukan disembunyikan.
 */

export interface FungsiRuang {
  kunci: string
  nama: string
  /** kN/m², SNI 1727:2020 Tabel 4.3-1. */
  bebanHidupKnM2: number
  /** Kelompok untuk pengelompokan di layar. */
  kelompok: string
  catatan?: string
}

/*
  Beban hidup merata minimum — SNI 1727:2020 Tabel 4.3-1.

  Yang didaftar: fungsi yang benar-benar muncul di proyek gedung biasa.
  Menambah seluruh tabel (puluhan baris, termasuk hanggar pesawat dan kandang
  ternak) membuat pemilihnya panjang tanpa menambah satu pun kasus nyata —
  dan daftar panjang justru membuat orang memilih asal.
*/
export const FUNGSI_RUANG: readonly FungsiRuang[] = [
  // ── Hunian ──────────────────────────────────────────────────────────────
  { kunci: 'hunian', nama: 'Rumah tinggal / apartemen', bebanHidupKnM2: 1.92, kelompok: 'Hunian' },
  { kunci: 'hunian-koridor', nama: 'Koridor hunian', bebanHidupKnM2: 1.92, kelompok: 'Hunian' },
  { kunci: 'balkon-hunian', nama: 'Balkon hunian', bebanHidupKnM2: 2.87, kelompok: 'Hunian',
    catatan: 'Balkon dihitung 1,5× ruang yang dilayaninya, minimum 2,87 kN/m².' },

  // ── Kantor & niaga ──────────────────────────────────────────────────────
  { kunci: 'kantor', nama: 'Ruang kantor', bebanHidupKnM2: 2.40, kelompok: 'Kantor & niaga' },
  { kunci: 'kantor-koridor', nama: 'Koridor kantor (di atas lantai 1)', bebanHidupKnM2: 3.83, kelompok: 'Kantor & niaga' },
  { kunci: 'lobi', nama: 'Lobi / koridor lantai dasar', bebanHidupKnM2: 4.79, kelompok: 'Kantor & niaga' },
  { kunci: 'toko-eceran', nama: 'Toko eceran lantai dasar', bebanHidupKnM2: 4.79, kelompok: 'Kantor & niaga' },
  { kunci: 'toko-atas', nama: 'Toko eceran lantai atas', bebanHidupKnM2: 3.59, kelompok: 'Kantor & niaga' },

  // ── Berkumpul ───────────────────────────────────────────────────────────
  { kunci: 'rapat-kursi-tetap', nama: 'Ruang rapat, kursi terpasang tetap', bebanHidupKnM2: 2.87, kelompok: 'Tempat berkumpul' },
  { kunci: 'rapat-kursi-lepas', nama: 'Ruang rapat, kursi tidak tetap', bebanHidupKnM2: 4.79, kelompok: 'Tempat berkumpul' },
  { kunci: 'restoran', nama: 'Restoran / ruang makan', bebanHidupKnM2: 4.79, kelompok: 'Tempat berkumpul' },
  { kunci: 'panggung', nama: 'Panggung pertunjukan', bebanHidupKnM2: 4.79, kelompok: 'Tempat berkumpul' },

  // ── Pendidikan & kesehatan ──────────────────────────────────────────────
  { kunci: 'kelas', nama: 'Ruang kelas', bebanHidupKnM2: 1.92, kelompok: 'Pendidikan & kesehatan' },
  { kunci: 'sekolah-koridor', nama: 'Koridor sekolah di atas lantai 1', bebanHidupKnM2: 3.83, kelompok: 'Pendidikan & kesehatan' },
  { kunci: 'perpustakaan-baca', nama: 'Perpustakaan — ruang baca', bebanHidupKnM2: 2.87, kelompok: 'Pendidikan & kesehatan' },
  { kunci: 'perpustakaan-rak', nama: 'Perpustakaan — ruang rak buku', bebanHidupKnM2: 7.18, kelompok: 'Pendidikan & kesehatan',
    catatan: 'Hampir 4× hunian. Rak buku adalah salah satu beban lantai terberat di gedung biasa.' },
  { kunci: 'rs-rawat', nama: 'Rumah sakit — ruang rawat', bebanHidupKnM2: 1.92, kelompok: 'Pendidikan & kesehatan' },
  { kunci: 'rs-operasi', nama: 'Rumah sakit — ruang operasi/lab', bebanHidupKnM2: 2.87, kelompok: 'Pendidikan & kesehatan' },

  // ── Atap & tangga ───────────────────────────────────────────────────────
  { kunci: 'atap-datar', nama: 'Atap datar (tak untuk aktivitas)', bebanHidupKnM2: 0.96, kelompok: 'Atap & tangga' },
  { kunci: 'atap-taman', nama: 'Atap taman / dapat diakses', bebanHidupKnM2: 4.79, kelompok: 'Atap & tangga',
    catatan: 'Lima kali atap biasa. Atap yang "sekadar bisa dinaiki" sering terlanjur dipakai sebagai teras.' },
  { kunci: 'tangga', nama: 'Tangga & jalan keluar', bebanHidupKnM2: 4.79, kelompok: 'Atap & tangga' },

  // ── Gudang & parkir ─────────────────────────────────────────────────────
  { kunci: 'gudang-ringan', nama: 'Gudang barang ringan', bebanHidupKnM2: 6.00, kelompok: 'Gudang & parkir' },
  { kunci: 'gudang-berat', nama: 'Gudang barang berat', bebanHidupKnM2: 11.97, kelompok: 'Gudang & parkir' },
  { kunci: 'parkir-mobil', nama: 'Parkir mobil penumpang', bebanHidupKnM2: 1.92, kelompok: 'Gudang & parkir',
    catatan: 'Berlaku untuk mobil penumpang saja. Truk dan bus punya ketentuan tersendiri.' },
]

export interface LapisMati {
  kunci: string
  nama: string
  /** kN/m² untuk lapisan luasan. */
  knM2: number
  kelompok: string
  catatan?: string
}

/*
  Beban mati TAMBAHAN — hanya yang tak bisa diturunkan dari dimensi.

  Berat sendiri balok dan pelat TIDAK ada di sini: keduanya sudah dihitung
  `analisaBebanBalok` dari b × h × 24 dan tebal × 24. Menaruhnya di katalog
  akan membuatnya terhitung DUA KALI — dan dua kali beban mati menghasilkan
  balok yang jauh lebih besar dari perlu, tanpa satu pun galat.
*/
export const LAPIS_MATI: readonly LapisMati[] = [
  { kunci: 'keramik-spesi', nama: 'Keramik + spesi (t=3 cm)', knM2: 0.77, kelompok: 'Lantai' },
  { kunci: 'granit-spesi', nama: 'Granit/marmer + spesi (t=4 cm)', knM2: 1.10, kelompok: 'Lantai' },
  { kunci: 'vinyl', nama: 'Vinyl / karpet', knM2: 0.10, kelompok: 'Lantai' },
  { kunci: 'screed', nama: 'Screed perata (t=5 cm)', knM2: 1.10, kelompok: 'Lantai' },
  { kunci: 'waterproofing', nama: 'Waterproofing + pelindung', knM2: 0.30, kelompok: 'Lantai' },

  { kunci: 'plafon-gypsum', nama: 'Plafon gypsum + rangka', knM2: 0.20, kelompok: 'Plafon & MEP' },
  { kunci: 'plafon-grc', nama: 'Plafon GRC + rangka', knM2: 0.25, kelompok: 'Plafon & MEP' },
  { kunci: 'mep-ringan', nama: 'Instalasi MEP (gedung biasa)', knM2: 0.25, kelompok: 'Plafon & MEP' },
  { kunci: 'mep-berat', nama: 'Instalasi MEP (rumah sakit/lab)', knM2: 0.50, kelompok: 'Plafon & MEP' },

  { kunci: 'partisi-ringan', nama: 'Partisi ringan (gypsum, dapat dipindah)', knM2: 0.72, kelompok: 'Partisi',
    catatan: 'SNI 1727 §4.3.2: partisi yang dapat dipindah WAJIB dihitung minimum 0,72 kN/m², '
      + 'walau denahnya belum menunjukkan satu partisi pun.' },
]

/** Berat dinding per m² bidang — untuk beban GARIS di atas balok. */
export interface JenisDinding {
  kunci: string
  nama: string
  /** kN/m² bidang dinding (belum dikali tinggi). */
  knM2: number
  catatan?: string
}

export const JENIS_DINDING: readonly JenisDinding[] = [
  { kunci: 'bata-merah-plester', nama: 'Bata merah + plester 2 sisi (½ bata)', knM2: 2.50 },
  { kunci: 'bata-ringan-plester', nama: 'Bata ringan + plester 2 sisi', knM2: 1.50,
    catatan: 'Sekitar 60% berat bata merah — inilah alasan utama orang memilihnya.' },
  { kunci: 'batako-plester', nama: 'Batako + plester 2 sisi', knM2: 2.00 },
  { kunci: 'gypsum-rangka', nama: 'Partisi gypsum + rangka hollow', knM2: 0.50 },
  { kunci: 'kaca-rangka', nama: 'Curtain wall kaca + rangka', knM2: 0.60 },
]

/** Cari fungsi ruang; `null` bila kuncinya tak dikenal. */
export function fungsiRuang(kunci: string): FungsiRuang | null {
  return FUNGSI_RUANG.find((x) => x.kunci === kunci) ?? null
}

/**
 * Ubah pilihan katalog jadi daftar beban mati siap pakai.
 *
 * Kunci yang TAK DIKENAL dilempar sebagai galat, bukan dilewati diam-diam:
 * lapisan yang hilang membuat beban mati lebih ringan dari seharusnya, dan
 * itu arah kesalahan yang berbahaya.
 */
export function lapisMatiDari(kunci: readonly string[]): Array<{ nama: string; nilai: number }> {
  return kunci.map((k) => {
    const lapis = LAPIS_MATI.find((x) => x.kunci === k)
    if (!lapis) {
      throw new Error(
        `Lapisan beban mati "${k}" tak dikenal. Pilihan: ${LAPIS_MATI.map((x) => x.kunci).join(', ')}`)
    }
    return { nama: lapis.nama, nilai: lapis.knM2 }
  })
}

/**
 * Beban dinding (kN/m) dari jenis dan tingginya.
 *
 * Dipisah dari lapisan lantai karena satuannya BERBEDA: dinding adalah beban
 * GARIS di atas balok (kN/m), bukan beban luasan (kN/m²). Menyamakan keduanya
 * membuat beban dinding terkali lebar pikul — tiga kali lipat pada kasus yang
 * lazim.
 */
export function bebanDindingDari(kunci: string, tinggiM: number): number {
  const d = JENIS_DINDING.find((x) => x.kunci === kunci)
  if (!d) {
    throw new Error(
      `Jenis dinding "${kunci}" tak dikenal. Pilihan: ${JENIS_DINDING.map((x) => x.kunci).join(', ')}`)
  }
  const t = Number(tinggiM)
  if (!Number.isFinite(t) || t <= 0) {
    throw new Error(`Tinggi dinding wajib angka > 0 (diterima: ${tinggiM})`)
  }
  return d.knM2 * t
}
