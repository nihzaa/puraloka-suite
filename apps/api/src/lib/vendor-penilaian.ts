// PENILAIAN VENDOR — prakualifikasi & evaluasi kinerja. PURE, tanpa I/O.
//
// ════════════════════════════════════════════════════════════════════════════
// TIGA HAL YANG MODUL INI TOLAK TAMPILKAN SEBAGAI KABAR BAIK
// ════════════════════════════════════════════════════════════════════════════
//
// 1. **Vendor "lolos" yang dokumennya kedaluwarsa.** Statusnya hijau, izinnya
//    mati. Diukur pada data uji: satu vendor lolos dengan SIUJK yang habis
//    Maret 2026 — dan tak ada satu pun kolom yang berteriak. Yang membacanya
//    akan mengundangnya tender, lalu penawarannya gugur di meja panitia.
//
// 2. **Skor rata-rata yang menyembunyikan satu dimensi nol.** Vendor dengan
//    mutu 100 dan ketepatan waktu 0 menghasilkan rata-rata 50 — angka yang
//    sama dengan vendor yang biasa-biasa saja di semua hal. Padahal yang
//    pertama TIDAK PERNAH tepat waktu, dan itu keputusan yang berbeda.
//
// 3. **Daftar hitam yang tenggelam di antara skor rendah.** Vendor 46 karena
//    sekali telat berbeda dari vendor 46 karena mengirim barang palsu lalu
//    menolak retur. Menyamakannya membuat yang kedua bisa dipakai lagi.
//
// ── Kenapa bobot, bukan rata-rata polos
//
// Rata-rata memperlakukan harga sepenting mutu. Di konstruksi, barang murah
// yang gagal uji lab berarti bongkar-pasang — dan biayanya jauh melewati
// selisih harganya. Bobot bawaan mencerminkan itu, dan bisa ditimpa
// per-tenant tanpa mengubah kode.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Bobot bawaan evaluasi kinerja — total 100.
 *
 * Mutu dan ketepatan waktu masing-masing 30: keduanya menghentikan
 * pekerjaan kalau gagal. Harga 25 — penting, tapi barang murah yang ditolak
 * QC tak pernah benar-benar murah. Layanan 15: mengganggu, jarang fatal.
 */
export const BOBOT_EVALUASI = { mutu: 30, waktu: 30, harga: 25, layanan: 15 } as const

/** Bobot bawaan prakualifikasi — total 100. */
export const BOBOT_PRAKUALIFIKASI = {
  legalitas: 35, keuangan: 25, teknis: 25, pengalaman: 15,
} as const

/** Ambang di bawahnya sebuah dimensi dianggap TITIK LEMAH, bukan sekadar rendah. */
export const AMBANG_LEMAH = 50

export type StatusPrakualifikasi = 'draft' | 'lolos' | 'ditolak' | 'kedaluwarsa'

export interface DokumenPrakualifikasi {
  jenis: string
  nomor?: string | null
  berlaku_sampai?: string | null
  terverifikasi?: boolean | null
}

export interface MasukanPrakualifikasi {
  status: StatusPrakualifikasi | string
  berlaku_sampai?: string | null
  skor_legalitas?: number | string | null
  skor_keuangan?: number | string | null
  skor_teknis?: number | string | null
  skor_pengalaman?: number | string | null
  dokumen?: DokumenPrakualifikasi[]
}

export type PeringatanVendor =
  /** Status `lolos`, tapi ada dokumen yang sudah lewat masa berlakunya. */
  | 'dokumen_kedaluwarsa'
  /** Dokumen akan habis dalam 60 hari — masih bisa diurus. */
  | 'dokumen_segera_habis'
  /** Prakualifikasinya sendiri sudah lewat masa berlaku. */
  | 'prakualifikasi_kedaluwarsa'
  /** Ada dimensi di bawah AMBANG_LEMAH — tersembunyi di balik rata-rata. */
  | 'ada_titik_lemah'
  /** Vendor masuk daftar hitam. */
  | 'daftar_hitam'

export interface HasilPrakualifikasi {
  /** 0–100, berbobot. */
  skor: number
  /** Status EFEKTIF — bisa berbeda dari yang tersimpan bila sudah lewat. */
  status: StatusPrakualifikasi
  /** Dokumen yang sudah lewat masa berlakunya. */
  dokumenKedaluwarsa: DokumenPrakualifikasi[]
  /** Dokumen yang habis dalam 60 hari. */
  dokumenSegeraHabis: DokumenPrakualifikasi[]
  peringatan: PeringatanVendor[]
  /**
   * `true` bila vendor ini benar-benar boleh diundang tender hari ini.
   *
   * BUKAN sekadar `status === 'lolos'`: status hijau dengan izin mati adalah
   * persis kasus yang membuat penawaran gugur di meja panitia.
   */
  bolehDiundang: boolean
}

/**
 * Nilai satu prakualifikasi.
 *
 * @param hariIni tanggal acuan (`YYYY-MM-DD`). DIOPER dari pemanggil, bukan
 *   `new Date()` di dalam — supaya fungsinya tetap bisa diuji dan hasilnya
 *   tak berubah tergantung jam berapa test dijalankan.
 */
export function nilaiPrakualifikasi(
  m: MasukanPrakualifikasi,
  hariIni: string,
): HasilPrakualifikasi {
  const b = BOBOT_PRAKUALIFIKASI
  const skor = Math.round(
    (angka(m.skor_legalitas) * b.legalitas +
      angka(m.skor_keuangan) * b.keuangan +
      angka(m.skor_teknis) * b.teknis +
      angka(m.skor_pengalaman) * b.pengalaman) / 100,
  )

  const dok = m.dokumen ?? []
  const dokumenKedaluwarsa = dok.filter(
    (d) => d.berlaku_sampai != null && d.berlaku_sampai < hariIni)

  // 60 hari — cukup untuk mengurus perpanjangan SIUJK/SBU, dan itulah gunanya
  // peringatan ini: memberi waktu, bukan mengabarkan yang sudah terlambat.
  const batas = tambahHari(hariIni, 60)
  const dokumenSegeraHabis = dok.filter(
    (d) => d.berlaku_sampai != null &&
      d.berlaku_sampai >= hariIni && d.berlaku_sampai <= batas)

  const prakualifikasiLewat =
    m.berlaku_sampai != null && m.berlaku_sampai < hariIni

  // Status EFEKTIF. Yang tersimpan bisa `lolos` selamanya karena tak ada yang
  // memperbaruinya — dan status yang tak pernah basi adalah status yang
  // berhenti berarti.
  const status: StatusPrakualifikasi = prakualifikasiLewat
    ? 'kedaluwarsa'
    : ((m.status as StatusPrakualifikasi) ?? 'draft')

  const peringatan: PeringatanVendor[] = []
  if (prakualifikasiLewat) peringatan.push('prakualifikasi_kedaluwarsa')
  if (dokumenKedaluwarsa.length) peringatan.push('dokumen_kedaluwarsa')
  else if (dokumenSegeraHabis.length) peringatan.push('dokumen_segera_habis')

  return {
    skor,
    status,
    dokumenKedaluwarsa,
    dokumenSegeraHabis,
    peringatan,
    bolehDiundang: status === 'lolos' && dokumenKedaluwarsa.length === 0,
  }
}

export interface MasukanEvaluasi {
  skor_mutu?: number | string | null
  skor_waktu?: number | string | null
  skor_harga?: number | string | null
  skor_layanan?: number | string | null
  masuk_daftar_hitam?: boolean | null
}

export interface HasilEvaluasi {
  /** 0–100, berbobot. */
  skor: number
  /** Rata-rata polos — DISERTAKAN untuk dibandingkan, bukan dipakai. */
  rataPolos: number
  /** Nama dimensi yang di bawah AMBANG_LEMAH. */
  titikLemah: string[]
  peringatan: PeringatanVendor[]
  /** `true` bila vendor ini boleh dipakai lagi. */
  bolehDipakai: boolean
}

/** Nilai satu evaluasi kinerja. */
export function nilaiEvaluasi(m: MasukanEvaluasi): HasilEvaluasi {
  const b = BOBOT_EVALUASI
  const nilai = {
    mutu: angka(m.skor_mutu),
    waktu: angka(m.skor_waktu),
    harga: angka(m.skor_harga),
    layanan: angka(m.skor_layanan),
  }

  const skor = Math.round(
    (nilai.mutu * b.mutu + nilai.waktu * b.waktu +
      nilai.harga * b.harga + nilai.layanan * b.layanan) / 100,
  )
  const rataPolos = Math.round((nilai.mutu + nilai.waktu + nilai.harga + nilai.layanan) / 4)

  // Dimensi lemah DINYATAKAN, bukan dibiarkan tenggelam di rata-rata. Vendor
  // dengan mutu 100 & waktu 0 punya angka yang sama dengan yang serba-50 —
  // padahal yang pertama TIDAK PERNAH tepat waktu.
  const titikLemah = (Object.keys(nilai) as Array<keyof typeof nilai>)
    .filter((k) => nilai[k] < AMBANG_LEMAH)

  const hitam = m.masuk_daftar_hitam === true
  const peringatan: PeringatanVendor[] = []
  if (hitam) peringatan.push('daftar_hitam')
  if (titikLemah.length) peringatan.push('ada_titik_lemah')

  return {
    skor,
    rataPolos,
    titikLemah,
    peringatan,
    // Daftar hitam mengalahkan skor berapa pun. Vendor 90 yang mengirim
    // barang palsu tetap tak boleh dipakai.
    bolehDipakai: !hitam,
  }
}

/** Tambah `n` hari ke tanggal `YYYY-MM-DD`, kembalikan format yang sama. */
function tambahHari(tanggal: string, n: number): string {
  const d = new Date(tanggal + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
