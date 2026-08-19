/**
 * TENGGAT TERLEWAT — satu bentuk untuk tujuh otomasi sekaligus.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU FUNGSI, BUKAN TUJUH YANG MIRIP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tujuh tabel di basis ini punya bentuk yang persis sama: sebuah pekerjaan,
 * sebuah tenggat, dan sebuah tanda selesai.
 *
 *   punch_items          target_selesai  ·  ditutup_pada
 *   ncr_items            target_selesai  ·  ditutup_pada
 *   inspection_requests  diminta_untuk   ·  diperiksa_pada
 *   tindakan_mitigasi    tenggat         ·  selesai_pada
 *   notulen_tindakan     tenggat         ·  selesai_pada
 *   temuan_k3            tenggat         ·  ditutup_pada
 *   rfq                  batas_masuk     ·  status = 'selesai'
 *
 * Menulis tujuh fungsi yang hampir sama berarti tujuh tempat yang harus
 * diperbaiki setiap kali ada cacat, dan tujuh kesempatan untuk memperbaiki
 * enam saja. Repo ini sudah punya contohnya: dedup harian salah selama
 * berbulan-bulan di 47 rute karena disalin, bukan dibagi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA KEADAAN — DAN YANG KETIGA BUKAN SOAL TERLAMBAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   LEWAT           tenggatnya sudah lewat dan pekerjaannya belum selesai.
 *   SEGERA          tenggatnya dalam hitungan hari. Peringatan yang datang
 *                   SEBELUM tenggat masih bisa mencegah; yang datang sesudah
 *                   hanya bisa melapor.
 *   TANPA TENGGAT   pekerjaannya terbuka tetapi tak seorang pun memberi
 *                   tanggal.
 *
 * Keadaan ketiga itu yang paling mudah luput, dan sengaja dilaporkan.
 * Diukur 2026-08-19: satu NCR dan satu tindak lanjut notulen tak punya
 * tenggat sama sekali. Laporan mana pun yang bertanya "apa yang lewat
 * tenggat?" akan MELEWATKANNYA selamanya — bukan karena ia beres, melainkan
 * karena ia tak punya tenggat untuk dilewati.
 *
 * Pekerjaan tanpa tenggat adalah pekerjaan yang tak pernah terlambat, dan
 * karena itu tak pernah dikerjakan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEPARAHAN MENGGESER AMBANG, TIDAK MENGGANTIKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `punch_items`, `ncr_items`, dan `temuan_k3` punya kolom keparahan
 * (`severity`/`tingkat`). Cacat berat tak boleh menunggu selama cacat ringan.
 *
 * Tetapi keparahan hanya menggeser ambang "SEGERA" — ia tak pernah membuat
 * sesuatu berhenti dilaporkan. Cacat ringan yang lewat tenggat tetap lewat
 * tenggat; ia hanya tak membangunkan orang di prioritas tinggi.
 */

export interface Pekerjaan {
  /** Hari sampai tenggat. Negatif = sudah lewat. `null` = tak bertenggat. */
  sisaHari: number | null
  /** Sudah ditutup/selesai/diperiksa? */
  selesai: boolean
  /**
   * Keparahan — KATA atau ANGKA, karena tujuh tabel ini tidak seragam.
   *
   * Diukur 2026-08-19, dan dugaan pertama saya salah:
   *
   *   punch_items.severity   enum kata  `ringan` `sedang` `berat` `kritis`
   *   ncr_items.severity     enum kata  `minor` `major` `kritis`
   *   temuan_k3.tingkat      SMALLINT   1 · 2 · 3
   *   risiko (lewat skor)    angka      matriks 5×5, 1..25
   *
   * Saya menulis di komentar bahwa `temuan_k3` "memakai bahasa Indonesia",
   * lalu rutenya balas 500 dengan `.trim is not a function` — kolomnya angka.
   * Sekarang keduanya diterima, dan tak ada pemanggil yang perlu menambal
   * sendiri.
   */
  keparahan: string | number | null
  /**
   * Nilai minimum yang dianggap berat, KHUSUS untuk keparahan berupa angka.
   *
   * Wajib diisi bila `keparahan` angka — tanpanya angka apa pun dianggap
   * ringan. Skalanya berbeda tiap tabel (`temuan_k3` 1..3, skor risiko 1..25),
   * jadi tak ada satu nilai bawaan yang benar untuk keduanya, dan menebak
   * salah satu berarti diam-diam salah untuk yang lain.
   */
  ambangBerat?: number
}

export interface HasilTenggat {
  perlu: boolean
  sebab: 'aman' | 'selesai' | 'lewat' | 'segera' | 'tanpa_tenggat'
  /** Prioritas notifikasi yang disarankan. */
  mendesak: boolean
}

/**
 * Keparahan yang menuntut perhatian lebih cepat.
 *
 * Ditulis dalam beberapa ejaan karena tujuh tabel ini tidak seragam — sebagian
 * memakai `severity` bahasa Inggris, sebagian `tingkat` bahasa Indonesia.
 * Menyeragamkannya di basis adalah pekerjaan lain; sampai itu terjadi, fungsi
 * ini menerima keduanya.
 */
const BERAT = new Set(['kritis', 'critical', 'mayor', 'major', 'tinggi', 'high', 'berat'])

/**
 * Apakah keparahan ini tergolong berat?
 *
 * Menerima kata maupun angka. Untuk angka, `ambangBerat` WAJIB — tanpanya
 * fungsi ini memulangkan `false`, dan itu keputusan yang disengaja: lebih baik
 * memperlakukan sesuatu sebagai ringan daripada menebak skalanya salah.
 * `temuan_k3.tingkat` berskala 1..3 sementara skor risiko 1..25; satu ambang
 * bawaan yang cocok untuk keduanya tidak ada.
 */
function keparahanBerat(nilai: string | number | null, ambangBerat?: number): boolean {
  if (nilai == null) return false

  if (typeof nilai === 'number' || (typeof nilai === 'string' && nilai.trim() !== '' && Number.isFinite(Number(nilai)))) {
    const angka = Number(nilai)
    if (!Number.isFinite(angka) || ambangBerat == null) return false
    return angka >= ambangBerat
  }

  return BERAT.has(String(nilai).trim().toLowerCase())
}

/**
 * @param p            pekerjaan yang dinilai
 * @param ambangSegera hari sebelum tenggat saat peringatan mulai dikirim
 * @param faktorBerat  pengali ambang untuk pekerjaan berkeparahan tinggi
 */
export function nilaiTenggat(
  p: Pekerjaan,
  ambangSegera: number,
  faktorBerat = 2,
): HasilTenggat {
  if (p.selesai) {
    return { perlu: false, sebab: 'selesai', mendesak: false }
  }

  const berat = keparahanBerat(p.keparahan, p.ambangBerat)

  /*
    TANPA TENGGAT dilaporkan, tidak dilewati.

    Pekerjaan tanpa tenggat tak pernah terlambat, dan karena itu tak pernah
    muncul di laporan mana pun — bukan karena beres, melainkan karena tak
    punya tanggal untuk dilanggar. Diamnya menjadikannya tempat paling aman
    untuk hilang.

    Ini keputusan yang sama dengan `barang-tertahan` (kiriman tanpa tenggat
    dilaporkan) dan SENGAJA BERBEDA dari `uji-material-gagal`, yang melewati
    catatan tanpa tanggal. Bedanya: di sana tanggal cuma metadata, di sini
    tenggat ADALAH alat satu-satunya untuk menilai.
  */
  if (p.sisaHari == null || !Number.isFinite(Number(p.sisaHari))) {
    return { perlu: true, sebab: 'tanpa_tenggat', mendesak: berat }
  }

  const sisa = Number(p.sisaHari)

  if (sisa < 0) {
    // Sudah lewat. Yang berkeparahan tinggi naik ke mendesak; yang ringan
    // tetap dilaporkan, hanya tidak membangunkan siapa pun.
    return { perlu: true, sebab: 'lewat', mendesak: berat }
  }

  /*
    Ambang SEGERA digeser oleh keparahan, bukan diganti.

    Cacat kritis diperingatkan lebih awal (ambang × faktor) supaya masih ada
    waktu bertindak. Yang tak berkeparahan tinggi memakai ambang apa adanya.
  */
  const ambang = berat ? ambangSegera * faktorBerat : ambangSegera
  if (sisa <= ambang) {
    return { perlu: true, sebab: 'segera', mendesak: berat }
  }

  return { perlu: false, sebab: 'aman', mendesak: false }
}
