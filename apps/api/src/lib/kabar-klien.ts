/**
 * KLIEN YANG DIDIAMKAN — proyek berjalan tanpa kabar ke pemiliknya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BUKAN DUPLIKAT `progres-belum-lapor` (3.11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 3.11 menegur MANDOR yang belum mengisi laporan harian — masalah disiplin
 * pencatatan, dan penerimanya orang dalam.
 *
 * Yang ini menjawab pertanyaan lain: **"klien mana yang sudah lama tak
 * mendengar kabar apa pun tentang proyeknya?"** Penerimanya yang mengurus
 * hubungan klien, dan tindakannya menelepon — bukan menegur mandor.
 *
 * Bedanya penting karena keduanya bisa benar sekaligus: mandor rajin melapor
 * ke sistem, tetapi tak seorang pun meneruskannya ke klien. Dan sebaliknya,
 * proyek yang sepi laporan bisa saja klien-nya justru rutin ditelepon.
 *
 * Diukur 2026-08-16 pada basis nyata: 15 proyek aktif, LIMA tak pernah punya
 * satu pun laporan progres — termasuk dua proyek Dinas PUPR senilai Rp 11
 * miliar — dan sembilan lagi terakhir dilaporkan lebih dari dua pekan lalu,
 * yang terlama 131 hari.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA KEADAAN YANG SENGAJA DIPISAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Belum pernah dilaporkan" dan "sudah lama tak dilaporkan" terlihat mirip di
 * angka — keduanya berarti klien tak tahu apa-apa. Tetapi tindakannya berbeda:
 *
 *   BELUM PERNAH   proyek berjalan tanpa jalur pelaporan sama sekali. Yang
 *                  perlu dibereskan prosesnya, bukan satu laporan yang telat.
 *   SUDAH LAMA     jalurnya ada dan berhenti. Cukup satu laporan menyusul.
 *
 * Menggabungkannya membuat proyek yang tak punya proses sama sekali terlihat
 * seperti proyek yang cuma telat sekali — dan diperlakukan begitu.
 */

export interface HasilKabar {
  /** Hari sejak laporan terakhir. `null` bila belum pernah ada. */
  hariDiam: number | null
  perlu: boolean
  sebab: 'terkabari' | 'belum_pernah' | 'lama_diam'
}

/**
 * @param laporanTerakhir ISO `YYYY-MM-DD`, atau `null` bila belum pernah ada
 * @param hariIni         ISO `YYYY-MM-DD`
 * @param ambangHari      berapa hari diam sudah dianggap terlalu lama
 */
export function nilaiKabarKlien(
  laporanTerakhir: string | null,
  hariIni: string,
  ambangHari: number,
): HasilKabar {
  if (!laporanTerakhir) {
    return { hariDiam: null, perlu: true, sebab: 'belum_pernah' }
  }

  const acuan = Date.parse(hariIni + 'T00:00:00Z')
  const t = Date.parse(String(laporanTerakhir).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(t) || Number.isNaN(acuan)) {
    /*
      Tanggal yang tak terbaca diperlakukan sebagai BELUM PERNAH, bukan
      dilewati.

      Melewatinya berarti proyek dengan tanggal rusak menjadi sunyi total —
      dan kolom tanggal yang rusak justru gejala bahwa pencatatannya
      bermasalah, persis proyek yang paling perlu diperiksa.
    */
    return { hariDiam: null, perlu: true, sebab: 'belum_pernah' }
  }

  const hariDiam = Math.floor((acuan - t) / 86_400_000)

  /*
    ── TAK ADA PENJAGAAN KHUSUS UNTUK TANGGAL MASA DEPAN, DAN ITU DISENGAJA

    Versi pertama memuat `if (hariDiam < 0) return terkabari` dengan komentar
    panjang tentang salah ketik tahun. Uji mutasi membuktikannya KODE MATI:
    membuangnya tak membuat satu test pun merah.

    Sebabnya sederhana begitu diperiksa — selisih negatif sudah gagal
    `hariDiam > ambangHari` dengan sendirinya (-365 > 14 bernilai false), jadi
    hasilnya `terkabari` tanpa perlu cabang tambahan.

    Kode mati yang menyamar sebagai perlindungan lebih buruk daripada tak ada:
    ia membuat pembaca berikutnya mengira kasus itu sudah ditangani secara
    khusus, dan mutasinya lolos sehingga testnya terlihat lebih kuat daripada
    kenyataannya.

    Perilakunya tetap sama dan tetap diuji — lihat test "tanggal MASA DEPAN".
  */

  if (hariDiam > ambangHari) {
    return { hariDiam, perlu: true, sebab: 'lama_diam' }
  }
  return { hariDiam, perlu: false, sebab: 'terkabari' }
}
