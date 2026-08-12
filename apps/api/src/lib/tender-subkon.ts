// F5 PEMBEDA — Tender & award subkontraktor: bukti pemilihan pelaksana.
//
// ── Kenapa modul ini ada
//
// Diukur 2026-08-07: 20 lingkup kerja bernilai Rp 15.000.000 sampai
// Rp 280.000.000, SELURUHNYA ber-`contract_status = 'unsigned'`, dan tak satu
// pun punya jejak bagaimana mandornya dipilih.
//
// Kesenjangan yang PERSIS SAMA dengan yang ditutup RFQ, tapi di sisi
// subkontraktor: saat auditor bertanya "kenapa mandor ini yang dapat borongan
// Rp 280 juta", jawabannya cuma ingatan orang.
//
// ── Kenapa dibandingkan terhadap PERKIRAAN, bukan hanya antar penawar
//
// Penawaran terendah belum tentu wajar. Yang 40% di bawah perkiraan biasanya
// berarti ada yang tak dihitung — dan itu muncul belakangan sebagai klaim
// tambah, pekerjaan berhenti, atau mandor kabur di tengah jalan.
//
// Modul ini menandainya (`terlalu_rendah`), bukan menolaknya: keputusan tetap
// di tangan manusia, tapi ia tak boleh diambil tanpa melihat angkanya.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type StatusPenawaran = 'diajukan' | 'menang' | 'kalah' | 'gugur'

export interface BarisPenawaranSubkon {
  id: string
  worker_id: string
  worker_name?: string | null
  nilai_penawaran: number | string
  waktu_kerja_hari?: number | null
  tidak_menawar?: boolean | null
  status?: StatusPenawaran | null
  catatan?: string | null
}

/** Seberapa jauh sebuah penawaran menyimpang, dan ke arah mana. */
export type PenilaianPenawaran =
  /** Termurah di antara yang menawar. */
  | 'termurah'
  /** Dalam rentang wajar terhadap perkiraan. */
  | 'wajar'
  /**
   * Jauh DI BAWAH perkiraan — bukan kabar baik.
   *
   * Penawaran yang terlalu rendah biasanya berarti ada lingkup yang tak
   * dihitung, dan itu kembali sebagai klaim tambah atau pekerjaan mangkrak.
   */
  | 'terlalu_rendah'
  /** Jauh DI ATAS perkiraan. */
  | 'terlalu_tinggi'
  /** Mandor menyatakan tidak menawar. */
  | 'tidak_menawar'

export interface PenawaranTerhitung {
  id: string
  worker_id: string
  worker_name: string
  /** null bila tak menawar — BUKAN 0, yang akan menang sebagai termurah. */
  nilai: number | null
  waktu_kerja_hari: number | null
  status: StatusPenawaran
  /** Selisih terhadap penawaran termurah, dalam persen. null bila tak menawar. */
  selisih_termurah_pct: number | null
  /**
   * Selisih terhadap perkiraan nilai, dalam persen. NEGATIF = di bawah
   * perkiraan. null bila perkiraannya tak diisi.
   */
  selisih_perkiraan_pct: number | null
  penilaian: PenilaianPenawaran
  menang: boolean
  /**
   * Catatan penawar, diteruskan apa adanya.
   *
   * Bukan hiasan: di sinilah tertulis "harga tidak menyebut talang dan
   * flashing" — kalimat yang menjelaskan KENAPA sebuah penawaran jauh di
   * bawah perkiraan. Tanpa diteruskan, layar hanya menandai angkanya ganjil
   * tanpa pernah menunjukkan sebabnya, dan pembacanya harus menebak.
   */
  catatan: string | null
}

export interface HasilTender {
  penawaran: PenawaranTerhitung[]
  /** null bila tak satu pun menawar. */
  nilai_termurah: number | null
  nilai_tertinggi: number | null
  /** Rentang antar penawar, dalam persen terhadap termurah. */
  rentang_pct: number | null
  jumlah_menawar: number
  jumlah_tidak_menawar: number
  jumlah_terlalu_rendah: number
  /** Pemenang, bila sudah ditunjuk. */
  pemenang: PenawaranTerhitung | null
  /**
   * `true` bila pemenangnya BUKAN penawar termurah.
   *
   * Bukan tuduhan — sering ada alasan sah (rekam jejak, kapasitas, waktu).
   * Tapi itulah keputusan yang WAJIB punya alasan tertulis, dan tanpa
   * ditandai ia tak pernah ditanyakan.
   */
  pemenang_bukan_termurah: boolean
  /** Selisih rupiah antara pemenang dan penawar termurah. 0 bila sama. */
  selisih_pemenang_termurah: number
}

/** Ambang "terlalu rendah" terhadap perkiraan, dalam persen. */
export const AMBANG_TERLALU_RENDAH_PCT = 20
/** Ambang "terlalu tinggi" terhadap perkiraan, dalam persen. */
export const AMBANG_TERLALU_TINGGI_PCT = 20

/**
 * Susun perbandingan penawaran subkontraktor.
 *
 * INVARIANT yang diuji:
 *  - `tidak_menawar` tak pernah menang sebagai termurah
 *  - string NUMERIC dibandingkan sebagai ANGKA, bukan teks
 *  - penawaran jauh di bawah perkiraan ditandai, bukan dipuji
 *  - pemenang bukan-termurah DINYATAKAN, supaya alasannya ditanyakan
 *  - status `gugur` tak ikut perbandingan harga
 */
export function susunTender(
  penawaran: BarisPenawaranSubkon[],
  nilaiPerkiraan?: number | string | null,
  opsi?: { ambangRendahPct?: number; ambangTinggiPct?: number },
): HasilTender {
  const ambangRendah = opsi?.ambangRendahPct ?? AMBANG_TERLALU_RENDAH_PCT
  const ambangTinggi = opsi?.ambangTinggiPct ?? AMBANG_TERLALU_TINGGI_PCT
  const perkiraan = angka(nilaiPerkiraan)

  // Yang GUGUR tak ikut perbandingan harga: ia tak memenuhi syarat, jadi
  // harganya tak relevan. Membiarkannya ikut membuat "termurah" jatuh ke
  // penawar yang memang tak bisa dipakai.
  const ikut = penawaran.filter((p) => p.status !== 'gugur')
  const menawar = ikut.filter((p) => !p.tidak_menawar)

  const nilaiMenawar = menawar.map((p) => angka(p.nilai_penawaran))
  const termurah = nilaiMenawar.length > 0 ? Math.min(...nilaiMenawar) : null
  const tertinggi = nilaiMenawar.length > 0 ? Math.max(...nilaiMenawar) : null

  const hasil: PenawaranTerhitung[] = penawaran.map((p) => {
    const takMenawar = p.tidak_menawar === true
    const nilai = takMenawar ? null : angka(p.nilai_penawaran)
    const status: StatusPenawaran = p.status ?? 'diajukan'

    // Pembagi nol dijaga: termurah 0 adalah penawaran sah bernilai nol
    // (mustahil di basis, tapi fungsi murni ini menerima data apa pun).
    const selisihTermurah =
      nilai != null && termurah != null && termurah > 0
        ? ((nilai - termurah) / termurah) * 100
        : null

    const selisihPerkiraan =
      nilai != null && perkiraan > 0
        ? ((nilai - perkiraan) / perkiraan) * 100
        : null

    let penilaian: PenilaianPenawaran
    if (takMenawar) {
      penilaian = 'tidak_menawar'
    } else if (selisihPerkiraan != null && selisihPerkiraan < -ambangRendah) {
      // Diperiksa SEBELUM `termurah`: penawaran terendah yang jauh di bawah
      // perkiraan adalah RISIKO, bukan kemenangan. Menandainya "termurah"
      // saja membuat yang paling berbahaya terlihat paling menarik.
      penilaian = 'terlalu_rendah'
    } else if (selisihPerkiraan != null && selisihPerkiraan > ambangTinggi) {
      penilaian = 'terlalu_tinggi'
    } else if (termurah != null && nilai === termurah) {
      penilaian = 'termurah'
    } else {
      penilaian = 'wajar'
    }

    return {
      id: p.id,
      worker_id: p.worker_id,
      worker_name: p.worker_name ?? '—',
      nilai,
      waktu_kerja_hari: p.waktu_kerja_hari ?? null,
      status,
      selisih_termurah_pct: selisihTermurah,
      selisih_perkiraan_pct: selisihPerkiraan,
      penilaian,
      menang: status === 'menang',
      catatan: p.catatan ?? null,
    }
  })

  // Termurah lebih dulu; yang tak menawar dan gugur di bawah. Urutan ini
  // yang dibaca saat memutuskan, jadi yang paling relevan harus di atas.
  const urutanNilai = (p: PenawaranTerhitung) =>
    p.status === 'gugur' ? 3 : p.nilai == null ? 2 : 0
  hasil.sort((a, b) =>
    urutanNilai(a) - urutanNilai(b) ||
    (a.nilai ?? 0) - (b.nilai ?? 0) ||
    a.worker_name.localeCompare(b.worker_name, 'id'))

  const pemenang = hasil.find((p) => p.menang) ?? null

  return {
    penawaran: hasil,
    nilai_termurah: termurah,
    nilai_tertinggi: tertinggi,
    // Butuh MINIMAL DUA penawar. Satu penawar tak punya pembanding, dan
    // "rentang 0%" akan terbaca "harganya seragam" padahal yang benar
    // "tak ada yang bisa dibandingkan".
    rentang_pct:
      nilaiMenawar.length >= 2 && termurah != null && termurah > 0 && tertinggi != null
        ? ((tertinggi - termurah) / termurah) * 100
        : null,
    jumlah_menawar: menawar.length,
    jumlah_tidak_menawar: penawaran.filter((p) => p.tidak_menawar === true).length,
    jumlah_terlalu_rendah: hasil.filter((p) => p.penilaian === 'terlalu_rendah').length,
    pemenang,
    // Dinyatakan, bukan disembunyikan: memilih yang bukan termurah sering
    // punya alasan sah — tapi alasan itu tak pernah ditanyakan kalau tak ada
    // yang menandainya.
    pemenang_bukan_termurah:
      pemenang != null && pemenang.nilai != null && termurah != null && pemenang.nilai > termurah,
    selisih_pemenang_termurah:
      pemenang?.nilai != null && termurah != null ? pemenang.nilai - termurah : 0,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PENETAPAN PEMENANG — ditambahkan 2026-08-13
// ════════════════════════════════════════════════════════════════════════════
//
// ── Kenapa menyusul, bukan sejak awal
//
// `susunTender` di atas sudah menghitung perbandingannya lengkap, termasuk
// `pemenang_bukan_termurah`. Tapi diukur 2026-08-13: TAK SATU PUN rute
// menulis `penawaran_subkon.status = 'menang'`. Dua halaman membacanya —
// `mandor/spk/page.tsx:610` mencari pemenang untuk menerbitkan SPK, dan
// `mandor/tender/page.tsx` menampilkan penandanya — sehingga keduanya
// menunggu keadaan yang tak pernah bisa terjadi lewat aplikasi.
//
// Jadi modul ini bisa membandingkan penawaran dengan sangat baik, lalu
// berhenti tepat sebelum gunanya: memutuskan. Keputusan diambil di luar
// sistem, dan yang tercatat hanya angka-angka tanpa hasil.

/** Batas bawah alasan saat pemenang BUKAN penawar termurah. */
export const MIN_ALASAN_BUKAN_TERMURAH = 25

/** Batas bawah alasan saat pemenang memang termurah. */
export const MIN_ALASAN_UMUM = 10

export type KodeTolakPenetapan =
  | 'tak_ada' | 'tak_menawar' | 'sudah_putus' | 'alasan' | 'status'

export type HasilPenetapan =
  | { boleh: true; peringatan: string | null }
  | { boleh: false; sebab: string; kode: KodeTolakPenetapan }

/**
 * Boleh-tidaknya sebuah penawaran ditetapkan sebagai pemenang.
 *
 * `peringatan` BUKAN penolakan. Memilih penawar yang lebih mahal adalah
 * keputusan bisnis yang sah dan sering benar — TND-2026-001 di basis ini
 * contohnya: pemenangnya Rp 12jt lebih mahal karena satu-satunya yang pernah
 * mengerjakan bore pile di tanah lunak Dago dan sanggup 30 hari lebih cepat.
 *
 * Yang tak sah adalah melakukannya tanpa keterangan. Karena itu ambang
 * panjang alasannya LEBIH TINGGI saat pemenangnya bukan termurah: bukan untuk
 * mempersulit, melainkan karena "sesuai arahan" tak menjawab apa pun saat
 * ditanya auditor enam bulan kemudian.
 */
export function periksaPenetapan(masukan: {
  penawaran: readonly BarisPenawaranSubkon[]
  idPemenang: string
  statusTender: string
  alasan?: string | null
}): HasilPenetapan {
  const { penawaran, idPemenang, statusTender } = masukan
  const alasan = (masukan.alasan ?? '').trim()

  if (statusTender === 'selesai') {
    return {
      boleh: false, kode: 'sudah_putus',
      sebab: 'Tender ini sudah diputuskan. Untuk mengubah pemenangnya, batalkan tender '
        + 'dan terbitkan yang baru — mengganti pemenang di belakang keputusan membuat '
        + 'jejaknya tak bisa dipertanggungjawabkan.',
    }
  }
  if (statusTender === 'batal') {
    return {
      boleh: false, kode: 'sudah_putus',
      sebab: 'Tender ini dibatalkan — tak ada pemenang yang bisa ditetapkan.',
    }
  }

  const calon = penawaran.find((p) => p.id === idPemenang)
  if (!calon) {
    return { boleh: false, kode: 'tak_ada', sebab: 'Penawaran itu bukan bagian dari tender ini.' }
  }
  if (calon.tidak_menawar === true) {
    return {
      boleh: false, kode: 'tak_menawar',
      sebab: 'Penawar ini menyatakan TIDAK menawar — tak ada harga yang disepakati, '
        + 'jadi tak ada yang bisa dimenangkan.',
    }
  }
  if (calon.status === 'gugur') {
    return {
      boleh: false, kode: 'status',
      sebab: 'Penawaran ini berstatus gugur. Pulihkan statusnya lebih dulu bila '
        + 'penggugurannya keliru.',
    }
  }

  // Pembanding dihitung ulang di sini, bukan diambil dari `susunTender`:
  // fungsi ini harus sah dipanggil tanpa perkiraan nilai, dan yang menentukan
  // "termurah" hanyalah penawaran yang benar-benar mengajukan harga.
  // `tidak_menawar` tersimpan bernilai 0, dan 0 selalu menang sebagai termurah.
  const bersaing = penawaran.filter((p) => p.tidak_menawar !== true && p.status !== 'gugur')
  const termurah = bersaing.reduce<BarisPenawaranSubkon | null>((min, p) => {
    const n = angka(p.nilai_penawaran)
    return min === null || n < angka(min.nilai_penawaran) ? p : min
  }, null)

  const bukanTermurah = termurah !== null && termurah.id !== calon.id
  const batas = bukanTermurah ? MIN_ALASAN_BUKAN_TERMURAH : MIN_ALASAN_UMUM

  if (alasan.length < batas) {
    return {
      boleh: false, kode: 'alasan',
      sebab: bukanTermurah
        ? 'Pemenang bukan penawar termurah — alasannya wajib dijelaskan (minimal '
          + `${MIN_ALASAN_BUKAN_TERMURAH} karakter). Inilah yang ditanyakan auditor lebih `
          + 'dulu, dan paling mudah dijawab sekarang.'
        : `Alasan pemilihan wajib diisi (minimal ${MIN_ALASAN_UMUM} karakter).`,
    }
  }

  let peringatan: string | null = null
  if (bukanTermurah && termurah) {
    const selisih = angka(calon.nilai_penawaran) - angka(termurah.nilai_penawaran)
    peringatan = `Pemenang Rp ${selisih.toLocaleString('id-ID')} lebih mahal daripada `
      + 'penawar terendah. Alasannya tercatat dan ikut terbaca saat tender ini diaudit.'
  }

  return { boleh: true, peringatan }
}

/**
 * Apakah tender boleh ditutup (status → 'selesai').
 *
 * Dipisah dari `periksaPenetapan` karena keduanya terjadi pada saat berbeda:
 * pemenang ditetapkan, lalu tendernya ditutup. Menggabungkannya jadi satu
 * tombol menghapus kesempatan meninjau ulang sebelum menutup — dan penutupan
 * tak bisa dibatalkan.
 */
export function periksaPenutupan(masukan: {
  penawaran: readonly BarisPenawaranSubkon[]
  statusTender: string
  alasan?: string | null
}): { boleh: true } | { boleh: false; sebab: string } {
  if (masukan.statusTender === 'selesai') {
    return { boleh: false, sebab: 'Tender ini sudah ditutup.' }
  }
  if (masukan.statusTender === 'batal') {
    return { boleh: false, sebab: 'Tender yang dibatalkan tak bisa ditutup sebagai selesai.' }
  }

  const pemenang = masukan.penawaran.filter((p) => p.status === 'menang')
  if (pemenang.length === 0) {
    return {
      boleh: false,
      sebab: 'Belum ada pemenang. Tetapkan pemenangnya lebih dulu — tender yang ditutup '
        + 'tanpa pemenang tak menghasilkan apa pun yang bisa dikerjakan.',
    }
  }
  if (pemenang.length > 1) {
    // Basis melarangnya lewat indeks unik parsial (migrasi 201:157). Kalau
    // sampai terbaca di sini, ada jalur tulis yang melewati aplikasi.
    return {
      boleh: false,
      sebab: `Tender ini punya ${pemenang.length} pemenang. Sisakan satu sebelum menutupnya.`,
    }
  }
  if (!(masukan.alasan ?? '').trim()) {
    return { boleh: false, sebab: 'Alasan pemilihan wajib tercatat sebelum tender ditutup.' }
  }

  return { boleh: true }
}
