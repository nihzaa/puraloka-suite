// ════════════════════════════════════════════════════════════════════════════
// GERBANG KELAYAKAN MITRA — satu penanda, semua pintu
// ════════════════════════════════════════════════════════════════════════════
//
// ── Cacat yang ditutup, DIUKUR bukan diduga
//
// Sampai migrasi 461, identitas mitra terpecah tiga tabel yang tak saling
// mengenal, dan akibatnya bukan sekadar tak rapi:
//
//   evaluasi_subkon.supplier_id       → suppliers   (5 evaluasi)
//   prakualifikasi_vendor.supplier_id → suppliers   (5 prakualifikasi)
//   penawaran_subkon.worker_id        → workers     (8 penawaran)
//
// Diukur 2026-08-19: **kedelapan penawaran tender datang lewat `workers`**,
// sementara `evaluasi_subkon.masuk_daftar_hitam` — satu-satunya penanda
// daftar hitam — hanya bisa menunjuk `suppliers`.
//
// Dan `tender-subkon.ts` maupun `spk.ts` **tidak memeriksanya sama sekali**
// (nol rujukan `masuk_daftar_hitam` di kedua berkas). Jadi pihak yang
// di-blacklist tetap bisa menawar dan menang — bukan karena penjaganya
// lalai, melainkan karena penjaganya berdiri di pintu yang lain.
//
// Migrasi 461 memindahkan penanda itu ke `mitra.daftar_hitam`, tempat ketiga
// peran bertemu. Berkas ini yang memakainya.
//
// ── Kenapa MENOLAK di penetapan, MEMPERINGATKAN di penawaran
//
// Dua titik keputusan, dua akibat yang berbeda:
//
//   MENAWAR    — belum ada uang berpindah, belum ada kewajiban. Menolaknya
//                keras berarti panitia tak pernah melihat harga pembanding,
//                dan tender berpenawar tunggal justru lebih rawan.
//   MENETAPKAN — pekerjaan diberikan. Di sinilah kerugiannya nyata, dan di
//                sinilah gerbang harus MENOLAK.
//
// Menolak keduanya sama kerasnya terdengar lebih aman, tapi mendorong orang
// menghapus status daftar hitam supaya bisa menyelesaikan pekerjaannya — dan
// penanda yang dihapus demi kelancaran adalah penanda yang mati.
//
// ── Kenapa alasannya IKUT dibawa
//
// "Ditolak: masuk daftar hitam" tanpa sebab memaksa penggunanya membuka layar
// lain untuk tahu apa yang terjadi, dan sebagian akan menyimpulkan sistemnya
// rusak. Migrasi 461 sudah menuntut alasan lewat CHECK; di sini alasan itu
// dipakai.

/** Baris mitra secukupnya untuk memutuskan kelayakan. */
export interface MitraKelayakan {
  id: string
  nama: string
  daftar_hitam: boolean | null
  alasan_daftar_hitam: string | null
  aktif: boolean | null
}

export type KodeKelayakan =
  /** Boleh maju. */
  | 'layak'
  /** Masuk daftar hitam — menetapkan pekerjaan padanya DITOLAK. */
  | 'daftar_hitam'
  /** Dinonaktifkan; bukan hukuman, tapi tetap tak boleh menerima pekerjaan baru. */
  | 'tak_aktif'
  /**
   * Belum punya identitas mitra.
   *
   * TIDAK dianggap tak layak. Ia keadaan data, bukan penilaian atas pihaknya —
   * dan menolak semua yang belum tertaut akan menghentikan seluruh tender
   * pada hari migrasi 461 dijalankan di tenant yang barisnya belum ter-backfill.
   */
  | 'tanpa_identitas'

export interface HasilKelayakan {
  kode: KodeKelayakan
  /** Boleh DITETAPKAN sebagai pemenang / pelaksana. */
  boleh: boolean
  /**
   * Layak diberitahukan meski `boleh` true.
   *
   * `tanpa_identitas` memulangkan `boleh: true` + peringatan: pekerjaannya
   * jalan, tetapi ada yang perlu dibereskan.
   */
  pesan: string | null
}

/**
 * Putuskan kelayakan satu mitra.
 *
 * INVARIAN yang diuji (`__tests__/gerbang-kelayakan.test.ts`):
 *  1. daftar hitam DITOLAK, dan alasannya ikut di pesan
 *  2. daftar hitam tanpa alasan tetap ditolak — pesannya tak boleh jadi
 *     kosong hanya karena alasannya hilang
 *  3. tak aktif ditolak, dengan kalimat yang BERBEDA dari daftar hitam:
 *     "sudah tidak dipakai" dan "dilarang" menuntut tindakan berbeda
 *  4. `null` (belum tertaut) TIDAK menghentikan pekerjaan
 *  5. daftar hitam menang atas tak aktif — yang lebih berat yang disebut
 */
export function periksaKelayakan(m: MitraKelayakan | null | undefined): HasilKelayakan {
  if (!m) {
    return {
      kode: 'tanpa_identitas',
      boleh: true,
      pesan: 'Pihak ini belum punya identitas mitra, jadi rekam jejaknya '
        + 'tak bisa diperiksa. Tautkan lewat Master Data › Mitra.',
    }
  }

  // Daftar hitam diperiksa LEBIH DULU. Mitra yang di-blacklist biasanya juga
  // dinonaktifkan, dan kalau urutannya terbalik pesannya berbunyi "tidak
  // aktif" — terbaca seperti kelalaian administrasi, padahal ia larangan.
  if (m.daftar_hitam === true) {
    const alasan = (m.alasan_daftar_hitam ?? '').trim()
    return {
      kode: 'daftar_hitam',
      boleh: false,
      pesan: `"${m.nama}" masuk daftar hitam`
        // Alasan seharusnya SELALU ada (CHECK migrasi 461), tetapi baris lama
        // atau perubahan constraint di kemudian hari bisa membuatnya kosong —
        // dan pesan yang menggantung di "masuk daftar hitam:" lebih buruk
        // daripada pesan tanpa sebab.
        + (alasan ? `: ${alasan}` : ' (alasan tak tercatat)')
        + '. Cabut dulu status itu kalau keputusannya memang hendak diubah.',
    }
  }

  if (m.aktif === false) {
    return {
      kode: 'tak_aktif',
      boleh: false,
      pesan: `"${m.nama}" sudah dinonaktifkan, jadi tak bisa diberi pekerjaan `
        + 'baru. Aktifkan kembali di Master Data › Mitra kalau memang masih dipakai.',
    }
  }

  return { kode: 'layak', boleh: true, pesan: null }
}
