/**
 * HASIL UJI MATERIAL — mutu yang tak memenuhi syarat, dan yang tak disimpulkan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI YANG PALING MAHAL DARI SELURUH TABEL TAK TERPANTAU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dicari dari arah berbeda: bukan "nomor rencana mana yang belum dibangun",
 * melainkan "tabel mana yang TERISI tetapi tak satu pun otomasi menyentuhnya".
 * Ada 109 tabel seperti itu; kebanyakan master data yang memang diam.
 *
 * `uji_material` bukan salah satunya. Diukur 2026-08-16:
 *
 *   UJI-2608-002  Beton K-250 zona A lantai 1
 *                 hasil 231 kg/cm2, syarat 250  →  TIDAK MEMENUHI
 *                 NCR: tak ada.  Didiamkan 13 hari.
 *
 *   UJI-2608-004  Besi beton D13 SNI, kuat tarik
 *                 hasil 4.250, syarat 4.000     →  kesimpulan NULL
 *
 *   UJI-2608-005  Beton K-300 kolom, uji 7 hari
 *                 hasil 195, syarat 210         →  perlu uji ulang
 *
 * Beton yang tak mencapai kuat tekan rencana adalah cacat STRUKTURAL. Ia tak
 * memburuk perlahan seperti anggaran — ia sudah terlanjur mengeras di kolom
 * dan balok, dan tiap hari yang lewat berarti lebih banyak pekerjaan
 * ditumpuk di atasnya.
 *
 * Tidak ada satu pun peringatan untuk ini sebelum sekarang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA KEADAAN, DAN YANG KEDUA PALING MUDAH TERLEWAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. TIDAK MEMENUHI        `kesimpulan` menyatakannya. Terlihat.
 *   2. BELUM DISIMPULKAN     `kesimpulan` NULL — hasilnya ada, tetapi tak
 *                            seorang pun memutuskan lulus atau tidak. Laporan
 *                            mutu yang menghitung "berapa yang gagal" akan
 *                            melewatkannya, karena ia tak dihitung gagal.
 *   3. PERLU UJI ULANG       diputuskan menggantung. Sah, tetapi punya batas
 *                            waktu: uji 7 hari yang tak dilanjutkan ke 28 hari
 *                            tak pernah menjawab pertanyaannya.
 *
 * Keadaan kedua itu yang paling berbahaya. `UJI-2608-004` sudah tiga belas
 * hari tanpa kesimpulan, dan angkanya JUSTRU lulus (4.250 dari syarat 4.000) —
 * jadi tak ada yang merasa perlu menindaklanjuti, dan berkasnya menggantung
 * selamanya.
 */

export interface Uji {
  /** `memenuhi` · `tidak_memenuhi` · `perlu_uji_ulang` · null */
  kesimpulan: string | null
  nilaiHasil: number | null
  nilaiSyarat: number | null
  /** Sudah ditindaklanjuti jadi NCR? */
  adaNcr: boolean
  /** Hari sejak tanggal uji. */
  hariLalu: number
}

export interface HasilUji {
  /** Selisih hasil terhadap syarat, dalam persen. `null` bila tak terhitung. */
  selisihPersen: number | null
  perlu: boolean
  sebab: 'aman' | 'gagal_tanpa_ncr' | 'belum_disimpulkan' | 'uji_ulang_menggantung'
}

/**
 * @param minHari  umur minimum sebelum "belum disimpulkan" dianggap menggantung
 */
export function nilaiHasilUji(u: Uji, minHari: number): HasilUji {
  const hasil = Number(u.nilaiHasil)
  const syarat = Number(u.nilaiSyarat)

  /*
    Selisih dihitung terhadap SYARAT, bukan terhadap hasil.

    `(hasil - syarat) / syarat` menjawab "meleset berapa persen dari yang
    diminta" — itu angka yang dipakai orang teknik. Membaginya dengan `hasil`
    memberi angka yang mirip tetapi menyesatkan saat selisihnya besar.
  */
  const selisihPersen =
    Number.isFinite(hasil) && Number.isFinite(syarat) && syarat !== 0
      ? Math.round(((hasil - syarat) / syarat) * 1000) / 10
      : null

  const k = (u.kesimpulan ?? '').trim().toLowerCase()

  /*
    URUTAN SEBAB — tetap, dan yang PERTAMA paling mendesak.

    Gagal yang belum jadi NCR berarti cacatnya diketahui tetapi tak masuk
    sistem tindak lanjut mana pun. Gagal yang SUDAH punya NCR sudah ditangani
    di jalurnya sendiri — menegurnya lagi mengirim pesan kedua untuk hal yang
    sudah ada tempatnya.
  */
  if (k === 'tidak_memenuhi') {
    return u.adaNcr
      ? { selisihPersen, perlu: false, sebab: 'aman' }
      : { selisihPersen, perlu: true, sebab: 'gagal_tanpa_ncr' }
  }

  /*
    Kesimpulan KOSONG diperiksa terhadap umur, bukan langsung dilaporkan.

    Uji yang baru dicatat kemarin wajar belum disimpulkan — laboratorium butuh
    waktu, dan menegurnya hari itu juga membuat peringatan ini jadi kebisingan
    harian bagi tim mutu.
  */
  if (k === '') {
    return u.hariLalu >= minHari
      ? { selisihPersen, perlu: true, sebab: 'belum_disimpulkan' }
      : { selisihPersen, perlu: false, sebab: 'aman' }
  }

  if (k === 'perlu_uji_ulang') {
    return u.hariLalu >= minHari
      ? { selisihPersen, perlu: true, sebab: 'uji_ulang_menggantung' }
      : { selisihPersen, perlu: false, sebab: 'aman' }
  }

  return { selisihPersen, perlu: false, sebab: 'aman' }
}
