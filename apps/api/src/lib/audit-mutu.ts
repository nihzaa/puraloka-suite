// AUDIT MUTU (G1f) — pemeriksaan berkala penerapan SISTEM mutu.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Item terakhir kelompok G1 (R-011). Bedanya dari inspeksi menentukan seluruh
// bentuknya:
//
//   INSPEKSI memeriksa PEKERJAAN — "beton kolom ini kuat 250 kg/cm2?"
//   AUDIT    memeriksa SISTEM    — "ITP benar-benar diikuti? NCR ditutup
//                                   dalam tenggat? uji dilakukan sesuai
//                                   rencana mutu?"
//
// Auditor tidak mengukur beton. Ia mengukur apakah yang dijanjikan dokumen
// mutu benar-benar dikerjakan.
//
// ── Klasifikasi menentukan AKIBAT, bukan sekadar tingkat keparahan
//
//   MAJOR      sistem mutunya gagal di titik ini — wajib melahirkan NCR,
//              wajib ditutup sebelum audit berikutnya
//   MINOR      penyimpangan tunggal; wajib diperbaiki, tak wajib jadi NCR
//   OBSERVASI  belum menyimpang tapi berpotensi — catatan, bukan tuntutan
//
// Perbedaan itu bukan gradasi halus: MAJOR menghalangi sertifikasi, dua
// lainnya tidak. Menyamakannya membuat salah satu dari dua kesalahan —
// observasi diperlakukan seperti kegagalan (dan orang berhenti mencatat
// observasi), atau major diperlakukan seperti catatan (dan sistemnya gagal
// tanpa ada yang bertanggung jawab).
//
// ── Kenapa "temuan major tanpa NCR" dihitung terpisah
//
// Audit yang menghasilkan dokumen tanpa akibat adalah ritual: temuan
// dicatat, laporan dicetak, tak ada yang berubah di lapangan. Yang
// membedakan audit yang bekerja adalah temuan major-nya MASUK ke siklus NCR
// yang sudah ada — dengan penanggung jawab, target, dan verifikasi.
//
// Basis sudah menegakkannya lewat trigger dua sisi (migrasi 283). Yang di
// sini adalah agar layar bisa MENUNJUKKANNYA sebelum orang mencoba menutup
// audit dan ditolak — penolakan yang bisa diramalkan lebih baik daripada
// penolakan yang mengejutkan.

export type Klasifikasi = 'major' | 'minor' | 'observasi'
export type StatusAudit = 'rencana' | 'berjalan' | 'selesai' | 'dibatalkan'

export interface TemuanAudit {
  id: string
  urutan: number
  kode: string | null
  uraian: string
  klausul: string
  bukti: string | null
  klasifikasi: Klasifikasi
  /** NCR yang lahir dari temuan ini. `null` = belum ditindaklanjuti. */
  ncr_id: string | null
  /** `null` = belum ditutup. */
  ditutup_pada: string | null
  catatan_penutupan: string | null
}

export interface RingkasanTemuan {
  total: number
  major: number
  minor: number
  observasi: number

  /** Temuan yang sudah diverifikasi penutupannya. */
  ditutup: number
  terbuka: number

  /**
   * Temuan yang MENUNTUT TINDAKAN — major + minor, TANPA observasi.
   *
   * Observasi tak menuntut penutupan: ia catatan tentang sesuatu yang belum
   * menyimpang. Memasukkannya ke penyebut "sudah ditutup berapa" menciptakan
   * hutang yang tak ada — layar menampilkan "0 dari 4" untuk audit yang
   * sebenarnya hanya punya 3 pekerjaan.
   *
   * Ketahuan dari LAYAR, bukan dari test: kartu "Ditutup 0/4" terbaca seperti
   * nol dari empat pekerjaan selesai.
   */
  menuntut_tindakan: number
  /** Dari `menuntut_tindakan`, berapa yang sudah ditutup. */
  tindakan_ditutup: number

  /**
   * Temuan MAJOR yang belum punya NCR.
   *
   * Inilah yang menghalangi audit diselesaikan — dan satu-satunya angka di
   * modul ini yang punya akibat langsung.
   */
  major_tanpa_ncr: TemuanAudit[]
  /** Temuan MAJOR yang belum ditutup, ber-NCR maupun tidak. */
  major_terbuka: TemuanAudit[]

  /**
   * Boleh diselesaikan: nol temuan major tanpa NCR.
   *
   * `true` juga saat NOL TEMUAN — audit yang tak menemukan apa pun adalah
   * hasil yang sah (dan sering yang diharapkan), berbeda dari ITP kosong
   * yang berarti "belum menyatakan apa pun". Auditnya sendiri yang menjadi
   * pernyataan bahwa pemeriksaan dilakukan.
   */
  boleh_diselesaikan: boolean
}

/**
 * Ringkas temuan satu audit.
 *
 * INVARIAN yang diuji (`__tests__/audit-mutu.test.ts`):
 *  1. major/minor/observasi dihitung terpisah — ketiganya beda akibat
 *  2. `major_tanpa_ncr` hanya berisi MAJOR; minor tanpa NCR tidak masuk
 *  3. major yang sudah DITUTUP tetap butuh NCR — penutupan tak menghapus
 *     kewajibannya, dan basis menegakkannya lewat trigger
 *  4. `boleh_diselesaikan` = `true` saat nol temuan (beda dari ITP kosong)
 *  5. urutan mengikuti `urutan`, bukan urutan masukan
 */
export function ringkasTemuan(temuan: TemuanAudit[]): RingkasanTemuan {
  const urut = (a: TemuanAudit, b: TemuanAudit) => a.urutan - b.urutan
  const major = temuan.filter((t) => t.klasifikasi === 'major')

  // `ncr_id` kosong pada MAJOR — tanpa memandang apakah temuannya sudah
  // ditutup. Menutup temuan tanpa NCR berarti menyatakan selesai sesuatu
  // yang tak pernah punya penanggung jawab; basis menolaknya, dan angka ini
  // menunjukkannya sebelum orang mencoba.
  const majorTanpaNcr = major.filter((t) => !t.ncr_id).sort(urut)

  // Observasi dikeluarkan: ia tak menuntut penutupan. Lihat komentar di
  // `menuntut_tindakan`.
  const menuntut = temuan.filter((t) => t.klasifikasi !== 'observasi')

  return {
    total: temuan.length,
    major: major.length,
    minor: temuan.filter((t) => t.klasifikasi === 'minor').length,
    observasi: temuan.filter((t) => t.klasifikasi === 'observasi').length,
    ditutup: temuan.filter((t) => t.ditutup_pada !== null).length,
    terbuka: temuan.filter((t) => t.ditutup_pada === null).length,
    menuntut_tindakan: menuntut.length,
    tindakan_ditutup: menuntut.filter((t) => t.ditutup_pada !== null).length,
    major_tanpa_ncr: majorTanpaNcr,
    major_terbuka: major.filter((t) => t.ditutup_pada === null).sort(urut),
    // Nol temuan = boleh diselesaikan. Berbeda dari `ringkasItp` (G1e) yang
    // mengembalikan `null` untuk ITP kosong: di sana kosong berarti "belum
    // menyatakan apa pun", di sini berarti "diperiksa, tak ditemukan".
    boleh_diselesaikan: majorTanpaNcr.length === 0,
  }
}

export interface Audit {
  id: string
  nomor: string
  judul: string
  status: StatusAudit
  lingkup: string | null
  kriteria: string | null
  tanggal_rencana: string | null
  tanggal_selesai: string | null
  auditor: string | null
  kesimpulan: string | null
}

export interface PenghalangSelesai {
  kode: 'major-tanpa-ncr' | 'tanpa-auditor' | 'sudah-selesai' | 'dibatalkan'
  pesan: string
  temuan?: TemuanAudit[]
}

/**
 * Boleh tidaknya sebuah audit dinyatakan SELESAI.
 *
 * Diperiksa di aplikasi supaya layar bisa menjelaskan SEBELUM orang mencoba.
 * Basis tetap menegakkannya (constraint + trigger 283) — ini bukan
 * penggantinya: pesan constraint mentah tak bisa dibaca siapa pun di layar,
 * dan tombol yang menjanjikan sesuatu lalu ditolak server adalah UX yang
 * lebih buruk daripada tombol yang menjelaskan sejak awal.
 *
 * INVARIAN yang diuji:
 *  1. audit dengan major tanpa NCR TIDAK boleh diselesaikan
 *  2. audit tanpa auditor TIDAK boleh — laporannya tak berpenanggung jawab
 *  3. audit yang SUDAH selesai tak bisa diselesaikan lagi
 *  4. audit DIBATALKAN tak bisa diselesaikan
 *  5. audit bersih (nol temuan, ada auditor) BOLEH
 */
export function bolehDiselesaikan(
  audit: Audit,
  temuan: TemuanAudit[],
): { boleh: boolean; penghalang: PenghalangSelesai[] } {
  const penghalang: PenghalangSelesai[] = []

  if (audit.status === 'selesai') {
    return {
      boleh: false,
      penghalang: [{ kode: 'sudah-selesai', pesan: 'Audit ini sudah diselesaikan.' }],
    }
  }
  if (audit.status === 'dibatalkan') {
    return {
      boleh: false,
      penghalang: [{ kode: 'dibatalkan', pesan: 'Audit ini dibatalkan.' }],
    }
  }

  if (!audit.auditor) {
    penghalang.push({
      kode: 'tanpa-auditor',
      pesan: 'Belum ada auditor — laporan audit tanpa nama pemeriksa tak bisa dipertanggungjawabkan.',
    })
  }

  const r = ringkasTemuan(temuan)
  if (r.major_tanpa_ncr.length > 0) {
    penghalang.push({
      kode: 'major-tanpa-ncr',
      pesan:
        `${r.major_tanpa_ncr.length} temuan major belum punya NCR. ` +
        'Temuan major berarti sistem mutunya gagal di titik itu — tanpa NCR ia ' +
        'tak punya penanggung jawab, target selesai, maupun verifikasi.',
      temuan: r.major_tanpa_ncr,
    })
  }

  return { boleh: penghalang.length === 0, penghalang }
}
