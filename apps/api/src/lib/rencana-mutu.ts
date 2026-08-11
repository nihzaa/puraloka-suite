// RENCANA MUTU PROYEK + INSPECTION & TEST PLAN (G1e).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Sebelum ini, 24 inspeksi tercatat tanpa ada satu pun pernyataan berapa yang
// SEHARUSNYA ada. Pertanyaan "titik periksa mana yang terlewat" hanya bisa
// dijawab dengan mengingat — dan yang paling berkepentingan mengingatnya
// salah adalah orang yang melewatkannya.
//
// ── Yang membedakan ITP dari daftar biasa: HOLD POINT
//
// Titik HOLD berarti pekerjaan BERHENTI sampai ia lolos. Melewatinya bukan
// keterlambatan administratif — ia menutup pekerjaan yang belum boleh
// ditutup. Pembesian yang sudah dicor tak bisa diperiksa lagi tanpa
// membongkar, dan pada titik itu biayanya berpindah dari "menunggu inspektur"
// ke "membongkar struktur".
//
// WITNESS berbeda: pemilik berhak hadir, tetapi ketidakhadirannya TIDAK
// menahan. Menyamakan keduanya membuat salah satu dari dua kesalahan:
//
//   witness diperlakukan seperti hold  → pekerjaan berhenti tanpa perlu,
//                                        dan orang berhenti mempercayai
//                                        peringatannya
//   hold diperlakukan seperti witness  → pekerjaan lanjut melewati titik
//                                        yang seharusnya menahannya
//
// Yang kedua jauh lebih mahal, tapi yang pertama yang membuat modul ini
// diabaikan. Karena itu keduanya dihitung terpisah dan dinamai berbeda di
// keluaran.
//
// ── Kenapa `lolos: null` bukan `false`
//
// Sama seperti `inspeksi_checklist` (G1d): tiga keadaan, bukan dua.
//
//   null   belum diperiksa   → mungkin belum waktunya, mungkin terlewat
//   true   lolos             → boleh lanjut
//   false  tidak lolos       → menahan, dan WAJIB beralasan
//
// Titik yang belum diperiksa TIDAK sama dengan gagal. Tapi untuk HOLD,
// keduanya sama-sama MENAHAN — dan itulah satu-satunya tempat di modul ini
// di mana `null` dan `false` diperlakukan sama. Perbedaannya tetap dibawa
// keluar supaya layar bisa membedakan "belum diperiksa" dari "ditolak".

export type JenisTitik = 'hold' | 'witness' | 'review'
export type StatusRmp = 'draf' | 'diajukan' | 'disetujui' | 'kedaluwarsa'

export interface TitikItp {
  id: string
  urutan: number
  kode: string | null
  tahap_pekerjaan: string
  uraian: string
  jenis_titik: JenisTitik
  kriteria: string | null
  acuan: string | null
  /** `null` = belum diperiksa. Lihat "tiga keadaan" di kepala berkas. */
  lolos: boolean | null
  catatan_hasil: string | null
  diperiksa_pada: string | null
  /** Inspeksi yang menjawab titik ini — `null` bila belum ada yang menjawabnya. */
  inspection_id?: string | null
}

export interface RingkasanItp {
  total: number
  lolos: number
  gagal: number
  /** Belum diperiksa — DIBEDAKAN dari gagal. */
  belum: number

  /**
   * Titik HOLD yang belum lolos — baik karena belum diperiksa maupun karena
   * ditolak. Inilah yang MENAHAN pekerjaan.
   */
  menahan: TitikItp[]
  /**
   * Titik WITNESS yang belum lolos. Wajib diberitahukan, TIDAK menahan.
   * Dipisah supaya tak ikut menyalakan peringatan berhenti.
   */
  menunggu_saksi: TitikItp[]

  /** Persen lolos dari yang SUDAH diperiksa. `null` bila belum ada. */
  pct_lolos: number | null
  pct_selesai: number
  /**
   * Pekerjaan boleh lanjut: nol titik HOLD yang belum lolos.
   *
   * `null` bila ITP-nya kosong — tak punya titik sama sekali BUKAN berarti
   * boleh lanjut, ia berarti belum ada yang menyatakan apa pun.
   */
  boleh_lanjut: boolean | null
}

const kosong = (s: string | null | undefined) => !s || s.trim() === ''

/**
 * Ringkas titik-titik ITP satu rencana mutu.
 *
 * INVARIAN yang diuji (`__tests__/rencana-mutu.test.ts`):
 *  1. HOLD yang `null` DAN yang `false` sama-sama masuk `menahan`
 *  2. WITNESS yang belum lolos TIDAK masuk `menahan`
 *  3. REVIEW tak pernah menahan apa pun
 *  4. `boleh_lanjut` = `null` saat ITP kosong, BUKAN `true`
 *  5. `pct_lolos` dari yang sudah diperiksa, `null` saat belum ada
 *  6. urutan `menahan` mengikuti `urutan` titik, bukan urutan masukan
 */
export function ringkasItp(titik: TitikItp[]): RingkasanItp {
  const lolos = titik.filter((t) => t.lolos === true).length
  const gagal = titik.filter((t) => t.lolos === false).length
  const belum = titik.filter((t) => t.lolos === null || t.lolos === undefined).length
  const diperiksa = lolos + gagal

  const belumLolos = (t: TitikItp) => t.lolos !== true
  const urut = (a: TitikItp, b: TitikItp) => a.urutan - b.urutan

  const menahan = titik.filter((t) => t.jenis_titik === 'hold' && belumLolos(t)).sort(urut)
  const menunggu_saksi = titik
    .filter((t) => t.jenis_titik === 'witness' && belumLolos(t))
    .sort(urut)

  return {
    total: titik.length,
    lolos,
    gagal,
    belum,
    menahan,
    menunggu_saksi,
    // `null`, bukan 0: nol persen berarti "semua gagal", dan itu klaim yang
    // tak dimiliki datanya saat penyebutnya nol.
    pct_lolos: diperiksa > 0 ? (lolos / diperiksa) * 100 : null,
    pct_selesai: titik.length > 0 ? (diperiksa / titik.length) * 100 : 0,
    // ITP kosong TIDAK berarti boleh lanjut. Mengembalikan `true` di sini
    // membuat proyek yang belum menyusun ITP terbaca "aman untuk lanjut" —
    // kebalikan dari kenyataannya.
    boleh_lanjut: titik.length > 0 ? menahan.length === 0 : null,
  }
}

export interface RencanaMutu {
  id: string
  nomor: string
  judul: string
  revisi: number
  status: StatusRmp
  standar_acuan: string | null
  sasaran_mutu: string | null
  disetujui_pada: string | null
}

export interface CacatRmp {
  /** Kode ringkas supaya layar bisa mengelompokkan tanpa mencocokkan teks. */
  kode: 'tanpa-acuan' | 'tanpa-sasaran' | 'tanpa-titik' | 'tanpa-hold' | 'titik-tanpa-kriteria'
  pesan: string
  /** Titik yang bermasalah, bila cacatnya melekat pada titik tertentu. */
  titik?: TitikItp[]
}

/**
 * Cacat sebuah rencana mutu — hal yang membuatnya tak berfungsi sebagai
 * dokumen mengikat, meski barisnya ada.
 *
 * KENAPA INI TERPISAH DARI VALIDASI DB
 *
 * Constraint DB menolak yang MUSTAHIL (lolos tanpa pemeriksa). Yang di sini
 * adalah yang MUNGKIN tapi tak berguna — dan justru itu yang lolos ke
 * produksi. RMP tanpa satu pun titik HOLD adalah dokumen yang tak menahan
 * apa pun; ia lulus semua constraint dan tak menjalankan fungsinya.
 *
 * Tidak dibuat error: sebagian sah selama masih draf. Yang salah bukan
 * keberadaannya, melainkan MENYETUJUINYA dalam keadaan itu.
 *
 * INVARIAN yang diuji:
 *  1. RMP lengkap → nol cacat
 *  2. ITP tanpa satu pun HOLD dilaporkan — dokumen yang tak menahan apa pun
 *  3. titik tanpa kriteria dilaporkan BESERTA titiknya, bukan cuma jumlahnya
 *  4. RMP tanpa titik sama sekali dilaporkan sekali, tidak dua kali
 *     (tanpa-titik menelan tanpa-hold — dua pesan untuk satu keadaan
 *      membuat pembacanya mengira ada dua masalah berbeda)
 */
export function cacatRencanaMutu(rmp: RencanaMutu, titik: TitikItp[]): CacatRmp[] {
  const hasil: CacatRmp[] = []

  if (kosong(rmp.standar_acuan)) {
    hasil.push({
      kode: 'tanpa-acuan',
      pesan: 'Belum menyebut standar acuan — tanpa itu "lolos" jadi pendapat, bukan persyaratan.',
    })
  }
  if (kosong(rmp.sasaran_mutu)) {
    hasil.push({
      kode: 'tanpa-sasaran',
      pesan: 'Belum menyatakan sasaran mutu yang bisa diukur.',
    })
  }

  if (titik.length === 0) {
    // Menelan `tanpa-hold`: ITP kosong sudah menjelaskan keduanya, dan dua
    // pesan untuk satu keadaan terbaca sebagai dua masalah berbeda.
    hasil.push({
      kode: 'tanpa-titik',
      pesan: 'Belum punya satu pun titik periksa — ITP-nya masih kosong.',
    })
    return hasil
  }

  if (!titik.some((t) => t.jenis_titik === 'hold')) {
    hasil.push({
      kode: 'tanpa-hold',
      pesan:
        'Tak ada satu pun titik HOLD. Rencana ini tidak menahan pekerjaan apa pun, ' +
        'jadi tak ada tahap yang wajib lolos sebelum ditutup.',
    })
  }

  const tanpaKriteria = titik.filter((t) => kosong(t.kriteria)).sort((a, b) => a.urutan - b.urutan)
  if (tanpaKriteria.length > 0) {
    hasil.push({
      kode: 'titik-tanpa-kriteria',
      pesan:
        `${tanpaKriteria.length} titik belum punya kriteria penerimaan — ` +
        'lolos/tidaknya diserahkan ke pendapat siapa pun yang kebetulan hadir.',
      titik: tanpaKriteria,
    })
  }

  return hasil
}

/**
 * Boleh tidaknya sebuah RMP disetujui.
 *
 * Menyetujui adalah tindakan yang MENGIKAT: sesudahnya dokumen ini yang
 * ditunjukkan ke pemilik dan auditor. Menyetujui rencana tanpa titik HOLD
 * berarti menandatangani pernyataan bahwa tak ada tahap yang wajib lolos —
 * dan itu hampir selalu bukan yang dimaksud.
 *
 * Cacat yang MENGHALANGI persetujuan sengaja lebih sempit daripada seluruh
 * daftar cacat: kekurangan sasaran mutu membuat dokumen lemah, tetapi
 * menahannya akan membuat orang menyetujui lewat jalan lain.
 */
export const CACAT_PENGHALANG: ReadonlyArray<CacatRmp['kode']> = ['tanpa-titik', 'tanpa-hold']

export function bolehDisetujui(
  rmp: RencanaMutu,
  titik: TitikItp[],
): { boleh: boolean; penghalang: CacatRmp[] } {
  if (rmp.status === 'disetujui') {
    return { boleh: false, penghalang: [] }
  }
  const penghalang = cacatRencanaMutu(rmp, titik).filter((c) =>
    CACAT_PENGHALANG.includes(c.kode),
  )
  return { boleh: penghalang.length === 0, penghalang }
}
