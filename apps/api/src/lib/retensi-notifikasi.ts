/**
 * RETENSI NOTIFIKASI — memutuskan mana yang boleh dihapus.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — diukur 2026-08-31 di basis produksi
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     8.893 notifikasi · 0 dibaca · tertua 15 hari
 *
 *     0-1 hari    1.941
 *     1-7 hari    2.553
 *     7-30 hari   4.399
 *
 * Tak ada setelan retensi, tak ada tugas pembersih. Notifikasi menumpuk sejak
 * hari pertama dan tak pernah berkurang.
 *
 * ── KENAPA INI BUKAN SEKADAR KOTOR
 *
 * Kotak masuk yang memuat ribuan baris tak terbaca berhenti berfungsi sebagai
 * kotak masuk. Orang tak menggulir 8.893 baris untuk mencari yang penting —
 * mereka berhenti membuka halamannya sama sekali, dan yang mendesak ikut
 * tenggelam bersama yang tidak.
 *
 * Ini akar yang sama dengan cacat 2026-08-16 (9.009 notifikasi, 3 dibaca) yang
 * melahirkan jeda melandai. Bedanya: jeda melandai menahan PENGULANGAN, dan ia
 * bekerja — diukur hari ini, 17 notifikasi berarti 17 catatan berbeda, bukan
 * satu catatan ditagih 17 kali.
 *
 * Yang belum ditangani: notifikasi yang sudah tak relevan tetap tinggal
 * selamanya. Menahan pengulangan tak membersihkan yang lama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA ATURAN, DAN YANG KETIGA MENYELAMATKAN YANG PENTING
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Yang SUDAH DIBACA boleh dihapus lebih cepat — pemiliknya sudah
 *      melihatnya, dan menyimpannya tak menambah apa pun.
 *   2. Yang BELUM DIBACA disimpan lebih lama — menghapusnya berarti pesan
 *      yang tak pernah sampai ke siapa pun.
 *   3. Yang MENDESAK dan belum dibaca TIDAK PERNAH dihapus otomatis.
 *
 * Aturan ketiga itu yang paling penting. Notifikasi `urgent` yang belum
 * dibaca berarti sesuatu yang berbahaya — temuan K3 lewat tenggat, beton yang
 * gagal, baku mutu terlampaui — dan belum ada yang melihatnya. Menghapusnya
 * karena "sudah lama" persis kebalikan dari yang seharusnya: makin lama ia
 * tak dibaca, makin mendesak ia dibaca.
 *
 * Kalau kotak masuk penuh oleh yang mendesak, jawabannya bukan menghapusnya —
 * melainkan mengerjakannya.
 */

export interface Notifikasi {
  /** Hari sejak notifikasi dibuat. */
  umurHari: number
  sudahDibaca: boolean
  /** `low` · `normal` · `high` · `urgent` */
  prioritas: string
}

export interface HasilRetensi {
  hapus: boolean
  sebab: 'masih_baru' | 'dibaca_kedaluwarsa' | 'tak_dibaca_kedaluwarsa' | 'mendesak_dilindungi'
}

/** Prioritas yang tak pernah dihapus otomatis selama belum dibaca. */
const MENDESAK = new Set(['urgent', 'critical', 'kritis'])

/**
 * @param hariDibaca    umur maksimum notifikasi yang SUDAH dibaca
 * @param hariTakDibaca umur maksimum notifikasi yang BELUM dibaca
 */
export function nilaiRetensi(
  n: Notifikasi,
  hariDibaca: number,
  hariTakDibaca: number,
): HasilRetensi {
  const umur = Number(n.umurHari)

  /*
    Umur tak terbaca diperlakukan sebagai MASIH BARU — tidak dihapus.

    Ini keputusan yang sengaja berbeda dari `tenggat-terlewat.ts`, yang
    MELAPORKAN catatan tanpa tanggal supaya tak hilang diam-diam.

    Di sana melaporkan berarti menarik perhatian ke sesuatu; di sini menghapus
    berarti menghancurkan sesuatu. Saat ragu, yang benar adalah tindakan yang
    bisa dibatalkan — dan menyimpan selalu bisa dibatalkan, menghapus tidak.
  */
  if (!Number.isFinite(umur) || umur < 0) {
    return { hapus: false, sebab: 'masih_baru' }
  }

  const mendesak = MENDESAK.has((n.prioritas ?? '').trim().toLowerCase())

  /*
    MENDESAK + BELUM DIBACA = tak pernah dihapus otomatis.

    Makin lama ia tak dibaca, makin mendesak ia dibaca. Kalau kotak masuk
    penuh oleh yang mendesak, jawabannya mengerjakannya, bukan menghapusnya.

    ⚠ CATATAN TENTANG URUTAN, dan saya SALAH menuliskannya dua kali.

    Versi pertama komentar ini menyatakan urutan blok ini terhadap blok
    `sudahDibaca` "load-bearing". Mutasi membuktikan sebaliknya: menukar
    keduanya menghasilkan fungsi yang IDENTIK secara perilaku, karena
    kondisinya saling eksklusif (`sudahDibaca` vs `!sudahDibaca`) — tak ada
    masukan yang bisa masuk keduanya.

    Diperiksa langsung pada keempat kombinasi; keluarannya sama persis.

    Jadi mutasi "tukar urutan" yang LOLOS bukan celah test — ia mutasi yang
    tak mengubah apa pun, dan menambah test untuk mengejarnya berarti menguji
    bentuk kode alih-alih perilakunya.

    Yang BENAR-BENAR load-bearing adalah kondisi `!n.sudahDibaca` di baris
    bawah ini. Membuangnya membuat urgent yang sudah dibaca ikut abadi, dan
    ITU tertangkap test.
  */
  if (mendesak && !n.sudahDibaca) {
    return { hapus: false, sebab: 'mendesak_dilindungi' }
  }

  if (n.sudahDibaca) {
    return umur >= hariDibaca
      ? { hapus: true, sebab: 'dibaca_kedaluwarsa' }
      : { hapus: false, sebab: 'masih_baru' }
  }

  return umur >= hariTakDibaca
    ? { hapus: true, sebab: 'tak_dibaca_kedaluwarsa' }
    : { hapus: false, sebab: 'masih_baru' }
}
