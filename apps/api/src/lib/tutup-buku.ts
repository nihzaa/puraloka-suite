// PERIODE AKUNTANSI & TUTUP BUKU (G5).
//
// ⚠ EMBER [C] — CLAUDE.md §5.3. Penguncian periode ditegakkan TRIGGER di
//   basis (migrasi 294), bukan oleh berkas ini. Yang ada di sini adalah
//   PEMERIKSAAN SEBELUM: memberi tahu apa yang akan terjadi, dengan kalimat
//   yang bisa dibaca orang — sebelum trigger menolaknya dengan bahasa
//   Postgres.
//
//   Menghapus berkas ini tidak melemahkan penguncian. Menghapus triggernya
//   melemahkan segalanya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA "SIAP DITUTUP" BUKAN SEKADAR "TANGGALNYA SUDAH LEWAT"
// ══════════════════════════════════════════════════════════════════════════
//
// Menutup periode adalah tindakan yang sulit dibatalkan: sesudahnya laporan
// dicetak, dikirim ke bank, dan dipakai menghitung pajak. Membuka kembali
// mungkin, tetapi berjejak permanen — dan periode yang dibuka tiga kali
// menceritakan sesuatu tentang kualitas pembukuannya.
//
// Karena itu `periksaKesiapan` menjawab pertanyaan yang benar-benar
// menentukan, bukan sekadar "sudah tanggal berapa":
//
//   1. Masih ada jurnal DRAFT di periode ini?
//      Draft tak masuk laporan. Menutup periode dengan draft tertinggal
//      berarti angka yang dilaporkan KURANG dari yang sebenarnya — dan
//      draftnya akan ditemukan berbulan-bulan kemudian, saat periodenya
//      sudah terkunci.
//
//   2. Ada periode SEBELUMNYA yang masih terbuka?
//      Menutup Agustus sementara Juli masih terbuka menghasilkan laporan
//      yang tak bisa dijumlahkan: saldo awal Agustus diambil dari Juli yang
//      angkanya masih bisa berubah.
//
//   3. Periode ini kosong sama sekali?
//      Bukan penghalang, tetapi WAJIB dinyatakan. Periode tanpa satu pun
//      jurnal yang ditutup "berhasil" adalah kelas cacat "berhasil tanpa
//      melakukan apa-apa" — orang menyangka pembukuannya beres, padahal
//      belum ada yang dicatat.
//
// Ketiganya PERINGATAN, bukan larangan — kecuali yang kedua. Alasannya di
// `bolehDitutup`.

export type StatusPeriode = 'terbuka' | 'tertutup'

export interface Periode {
  id: string
  nama: string
  /** `YYYY-MM-DD` */
  tanggal_mulai: string
  tanggal_akhir: string
  status: StatusPeriode
  ditutup_pada: string | null
  dibuka_ulang: number
}

export interface IsiPeriode {
  /** Jurnal berstatus `posted` di rentang periode. */
  posted: number
  /** Jurnal berstatus `draft` — belum masuk laporan mana pun. */
  draft: number
  /**
   * Total debit dari jurnal posted. numeric dari Postgres tiba sebagai
   * STRING, dan bisa `null` bila belum pernah ada jurnal.
   */
  total_debit: number | string | null
  total_kredit: number | string | null
}

export type BeratMasalah = 'penghalang' | 'peringatan' | 'catatan'

export interface Masalah {
  berat: BeratMasalah
  pesan: string
}

export interface Kesiapan {
  /**
   * Boleh ditutup?
   *
   * `null` bila periodenya SUDAH tertutup — pertanyaannya tak berlaku, dan
   * menjawab `false` akan terbaca "ada yang salah".
   */
  boleh: boolean | null
  masalah: Masalah[]
  isi: IsiPeriode
}

/**
 * numeric Postgres → angka, dengan `null` untuk yang TAK TERBACA.
 *
 * Kenapa `null` dan bukan 0: mutasi membuktikan penjaga string-kosong yang
 * hasilnya dijatuhkan ke 0 TIDAK BERARTI APA PUN — `Number('')` memang 0,
 * dan `Number.isFinite(0)` benar, jadi melepas penjaganya tak mengubah
 * satu pun keluaran. Penjaga yang tak bisa dibuat merah adalah hiasan.
 *
 * Yang membuatnya berarti: memisahkan "nol" dari "tak terbaca". Di halaman
 * tutup buku bedanya nyata — periode berdebit nol memang seimbang, sementara
 * periode yang debitnya gagal dibaca TIDAK boleh dinyatakan seimbang.
 */
function angka(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  // `Number('')` adalah 0, bukan NaN — pelajaran G2a, dan di sini ia harus
  // dibedakan dari nol yang sungguhan.
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Apakah periode ini boleh ditutup, dan apa yang perlu diketahui dulu.
 *
 * @param periode periode yang hendak ditutup
 * @param isi hitungan jurnal di rentangnya
 * @param periodeSebelumTerbuka nama periode SEBELUMNYA yang masih terbuka,
 *   `null` bila tak ada. Ini satu-satunya PENGHALANG (lihat kepala berkas).
 */
export function periksaKesiapan(
  periode: Periode,
  isi: IsiPeriode,
  periodeSebelumTerbuka: string | null = null,
): Kesiapan {
  if (periode.status === 'tertutup') {
    return { boleh: null, masalah: [], isi }
  }

  const masalah: Masalah[] = []

  // PENGHALANG — dan satu-satunya. Menutup periode sementara periode
  // sebelumnya masih terbuka menghasilkan laporan yang tak bisa dijumlahkan:
  // saldo awal periode ini diambil dari periode yang angkanya masih berubah.
  if (periodeSebelumTerbuka) {
    masalah.push({
      berat: 'penghalang',
      pesan: `Periode "${periodeSebelumTerbuka}" sebelum ini masih terbuka. `
        + 'Tutup yang lebih dulu — saldo awal periode ini diambil dari sana, '
        + 'dan angka yang masih bisa berubah membuat laporannya tak bisa '
        + 'dijumlahkan.',
    })
  }

  // PERINGATAN — nyata, tetapi menutupnya tetap keputusan orang. Draft bisa
  // saja memang batal, dan memaksanya jadi penghalang akan membuat orang
  // menghapus draft asal periodenya bisa ditutup.
  if (isi.draft > 0) {
    masalah.push({
      berat: 'peringatan',
      pesan: isi.draft === 1
        ? '1 jurnal masih berstatus draft dan TIDAK akan masuk laporan. '
          + 'Kalau ia seharusnya masuk, posting dulu — sesudah periode '
          + 'ditutup, memostingnya menuntut membuka kembali (berjejak).'
        : `${isi.draft} jurnal masih berstatus draft dan TIDAK akan masuk `
          + 'laporan. Kalau ada yang seharusnya masuk, posting dulu — sesudah '
          + 'periode ditutup, memostingnya menuntut membuka kembali (berjejak).',
    })
  }

  // CATATAN — bukan masalah, tetapi harus dinyatakan. Periode kosong yang
  // ditutup "berhasil" membuat orang menyangka pembukuannya beres.
  if (isi.posted === 0) {
    masalah.push({
      berat: 'catatan',
      pesan: 'Periode ini tak punya satu pun jurnal yang sudah diposting. '
        + 'Menutupnya sah, tetapi tak menjaga apa pun — dan laporan periode '
        + 'ini akan menampilkan nol di semua akun.',
    })
  }

  return {
    boleh: !masalah.some((m) => m.berat === 'penghalang'),
    masalah,
    isi,
  }
}

/**
 * Total debit vs kredit periode. Dipakai UI menunjukkan bahwa yang dikunci
 * memang seimbang.
 *
 * Selisihnya HARUS nol — `trg_gl_wajib_seimbang` menjamin tiap jurnal
 * seimbang, jadi jumlahnya pun seimbang. Kalau di layar ternyata tidak,
 * itu gejala bahwa ada jurnal yang masuk lewat jalur yang tak melewati
 * trigger, dan itu jauh lebih serius daripada tampilan yang salah.
 */
export function selisihSeimbang(isi: IsiPeriode): number | null {
  const d = angka(isi.total_debit)
  const k = angka(isi.total_kredit)
  // `null` bila salah satunya tak terbaca — dan itu HARUS terlihat di layar,
  // bukan disamarkan jadi 0 yang berarti "seimbang". Periode yang angkanya
  // gagal dibaca lalu dinyatakan seimbang adalah kebohongan yang meyakinkan.
  if (d === null || k === null) return null
  return d - k
}

/**
 * Periode mana yang memuat tanggal ini?
 *
 * Rentangnya INKLUSIF di kedua ujung — sama dengan `daterange(...,'[]')` yang
 * dipakai constraint anti-tumpang-tindih di migrasi 294. Kalau keduanya
 * berbeda, akan ada tanggal yang menurut basis ada di satu periode tetapi
 * menurut aplikasi ada di dua.
 */
export function periodeUntukTanggal(
  daftar: Periode[],
  tanggal: string,
): Periode | null {
  return daftar.find(
    (p) => tanggal >= p.tanggal_mulai && tanggal <= p.tanggal_akhir) ?? null
}

/**
 * Apakah tanggal ini terkunci?
 *
 * `null` bila tanggalnya TAK TERCAKUP periode mana pun — dan itu keadaan yang
 * berbeda dari "tidak terkunci". Perusahaan yang belum membuat periode sama
 * sekali tidak sedang "bebas memposting dengan aman"; ia sedang tak punya
 * kerangka pembukuan. Menjawab `false` menyembunyikan itu.
 */
export function tanggalTerkunci(
  daftar: Periode[],
  tanggal: string,
): boolean | null {
  const p = periodeUntukTanggal(daftar, tanggal)
  if (!p) return null
  return p.status === 'tertutup'
}

export interface RingkasPeriode {
  total: number
  terbuka: number
  tertutup: number
  /** Berapa periode yang PERNAH dibuka kembali — angka yang tak disembunyikan. */
  pernah_dibuka_ulang: number
  /** Periode terbuka paling lama (tanggal mulainya paling awal). `null` bila tak ada. */
  terbuka_terlama: Periode | null
  /**
   * Ada lubang di antara periode? Rentang tanggal yang tak tercakup periode
   * mana pun.
   *
   * Lubang berarti ada transaksi yang tak pernah bisa dikunci — dan ia baru
   * ketahuan saat auditor bertanya "periode mana yang memuat Maret?".
   */
  lubang: Array<{ dari: string; sampai: string }>
}

function tambahHari(iso: string, n: number): string {
  const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  return new Date(t + n * 86400000).toISOString().slice(0, 10)
}

export function ringkasPeriode(daftar: Periode[]): RingkasPeriode {
  const urut = [...daftar].sort((a, b) => a.tanggal_mulai.localeCompare(b.tanggal_mulai))
  const terbuka = urut.filter((p) => p.status === 'terbuka')

  const lubang: Array<{ dari: string; sampai: string }> = []
  for (let i = 1; i < urut.length; i++) {
    const sebelum = urut[i - 1]
    const kini = urut[i]
    const berikutnya = tambahHari(sebelum.tanggal_akhir, 1)
    // Bersebelahan bila periode berikutnya mulai TEPAT sehari sesudah yang
    // sebelumnya berakhir. Lebih dari itu = lubang.
    if (kini.tanggal_mulai > berikutnya) {
      lubang.push({ dari: berikutnya, sampai: tambahHari(kini.tanggal_mulai, -1) })
    }
  }

  return {
    total: daftar.length,
    terbuka: terbuka.length,
    tertutup: daftar.length - terbuka.length,
    pernah_dibuka_ulang: daftar.filter((p) => p.dibuka_ulang > 0).length,
    terbuka_terlama: terbuka[0] ?? null,
    lubang,
  }
}

/**
 * Boleh membuka kembali periode yang sudah ditutup?
 *
 * Larangan mutlak terdengar lebih aman, tetapi menghasilkan hal yang lebih
 * buruk: saat koreksi benar-benar diperlukan, orang mengubah basis lewat SQL
 * langsung — dan itu tak berjejak sama sekali.
 *
 * Yang ditegakkan di sini: alasannya cukup panjang untuk berarti. "koreksi"
 * dan "salah" tak menjelaskan apa pun saat dibaca setahun kemudian oleh orang
 * yang tak ada di ruangan saat keputusannya diambil.
 */
export const MIN_ALASAN_BUKA = 20

export function bolehBukaKembali(
  periode: Periode,
  alasan: string,
): { boleh: boolean; galat?: string } {
  if (periode.status !== 'tertutup') {
    return { boleh: false, galat: 'Periode ini tidak sedang tertutup' }
  }
  const a = alasan?.trim() ?? ''
  if (a.length < MIN_ALASAN_BUKA) {
    return {
      boleh: false,
      galat: `Alasan membuka kembali wajib minimal ${MIN_ALASAN_BUKA} huruf. `
        + 'Yang membacanya setahun lagi tak ada di ruangan saat keputusan ini '
        + 'diambil — "koreksi" tak menjelaskan apa pun baginya.',
    }
  }
  return { boleh: true }
}
