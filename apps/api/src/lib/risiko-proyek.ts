// REGISTER RISIKO · MITIGASI · PERIZINAN PROYEK · SENGKETA (G3).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA REGISTER RISIKO GAGAL DI HAMPIR SEMUA PERUSAHAAN YANG MEMBUATNYA
// ══════════════════════════════════════════════════════════════════════════
//
// Register risiko biasanya dibuat sekali — saat tender menuntutnya — lalu tak
// pernah dibuka lagi. Ia jadi lampiran, bukan alat kerja. Dan yang membunuhnya
// selalu hal yang sama: **register itu hanya bisa menjawab pertanyaan yang
// tidak ditanyakan siapa pun.**
//
// "Apa saja risiko proyek ini?" tak pernah ditanyakan. Yang ditanyakan:
//
//   · "Yang mana yang harus saya urus MINGGU INI?"
//   · "Risiko ini sudah kami tangani belum? Apa buktinya?"
//   · "Kenapa risiko yang kemarin merah sekarang hilang dari daftar?"
//
// Ketiganya soal PERUBAHAN, bukan daftar. Karena itu modul ini dibangun di
// sekitar tiga perbedaan yang sering diratakan orang, dan setiap kali
// diratakan, registernya mati:
//
// ── 1. Skor AWAL vs skor SISA
//
// Register yang menimpa skor awal dengan skor sesudah mitigasi menghapus bukti
// bahwa mitigasinya berguna. Padahal pertanyaan pertama saat risikonya
// TERJADI adalah "apa yang sudah dilakukan untuk mencegah?" — dan jawabannya
// hanya bisa ditunjukkan kalau kedua angkanya masih ada.
//
// ── 2. "Terpantau" vs "tertutup" vs HILANG
//
// Risiko tak pernah benar-benar hilang; yang berubah adalah apakah masih ada
// yang mengawasinya. Register yang membolehkan baris menghilang tanpa alasan
// mengubah "kami memutuskan menerimanya" jadi tak bisa dibedakan dari "kami
// lupa" — dan keduanya terlihat sama persis: barisnya tidak ada.
//
// ── 3. Risiko yang DITERIMA vs risiko yang DIABAIKAN
//
// Strategi 'terima' ada dengan sengaja. Register yang memaksa setiap risiko
// punya mitigasi akan diisi dengan mitigasi palsu ("dimonitor berkala") supaya
// barisnya tidak merah — dan mitigasi palsu lebih berbahaya daripada tidak ada
// mitigasi, karena ia menutup pertanyaannya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA IZIN PROYEK BUKAN "DOKUMEN YANG PERLU DIARSIPKAN"
// ══════════════════════════════════════════════════════════════════════════
//
// PBG yang habis masa berlakunya sementara pekerjaan masih berjalan bukan
// cacat administrasi: pekerjaannya bisa DISEGEL. Yang disegel proyeknya, bukan
// berkasnya, dan berhentinya dihitung hari.
//
// Karena itu izin dinilai terhadap RENTANG PROYEK, bukan terhadap hari ini
// saja: izin yang berlaku sampai Maret pada proyek yang selesai Juni sudah
// bermasalah HARI INI, meski hari ini ia masih sah. Register yang hanya
// menandai "sudah lewat" memberi tahu terlambat — pengurusan perpanjangan PBG
// makan waktu berminggu-minggu.

// ────────────────────────────────────────────────────────────────────────
// Bentuk data
// ────────────────────────────────────────────────────────────────────────

export type KategoriRisiko =
  | 'teknis' | 'keuangan' | 'jadwal' | 'k3'
  | 'lingkungan' | 'hukum' | 'pengadaan' | 'eksternal'

export type StatusRisiko = 'terpantau' | 'terjadi' | 'tertutup'
export type StrategiRisiko = 'hindari' | 'kurangi' | 'alihkan' | 'terima'
export type StatusTindakan = 'rencana' | 'berjalan' | 'selesai' | 'batal'

export interface TindakanMitigasi {
  id: string
  tindakan: string
  status: StatusTindakan
  /** `YYYY-MM-DD` */
  tenggat: string | null
  selesai_pada: string | null
  penanggung_id: string | null
}

export interface Risiko {
  id: string
  kode: string | null
  judul: string
  kategori: KategoriRisiko
  dampak: number
  kemungkinan: number
  /** Kolom TERHITUNG di DB (`dampak * kemungkinan`). Tak pernah diketik. */
  skor: number
  strategi: StrategiRisiko
  dampak_sisa: number | null
  kemungkinan_sisa: number | null
  status: StatusRisiko
  /** `YYYY-MM-DD` */
  tenggat_tinjau: string | null
  pemilik_id: string | null
  tindakan?: TindakanMitigasi[]
}

/** Empat tingkat, dipisahkan karena TINDAKANNYA berbeda. Lihat `tingkatDari`. */
export type TingkatRisiko = 'rendah' | 'sedang' | 'tinggi' | 'ekstrem'

export interface RisikoDinilai extends Risiko {
  tingkat: TingkatRisiko
  /** Skor sesudah mitigasi. `null` bila belum dinilai ulang. */
  skor_sisa: number | null
  tingkat_sisa: TingkatRisiko | null
  /**
   * Berapa turun berkat mitigasi. `null` bila skor sisa belum dinilai.
   * Nol berarti mitigasi belum menurunkan apa pun — berbeda dari `null`.
   */
  penurunan: number | null
  /** Perlu perhatian sekarang. Lihat `perluPerhatian`. */
  mendesak: boolean
  alasan_mendesak: string[]
}

// ────────────────────────────────────────────────────────────────────────
// Penilaian risiko
// ────────────────────────────────────────────────────────────────────────

/**
 * Skor 1..25 → empat tingkat.
 *
 * Batasnya dipilih supaya tiap tingkat menuntut TINDAKAN yang berbeda, bukan
 * supaya kotaknya rata:
 *
 *   1–4    rendah   diterima apa adanya
 *   5–9    sedang   dimitigasi kalau murah
 *   10–14  tinggi   wajib punya tindakan bertenggat
 *   15–25  ekstrem  wajib naik ke direktur
 *
 * Matriks 5×5 yang membagi rata (1-6/7-12/13-18/19-25) menempatkan 5×2=10
 * ("dampak berat, jarang terjadi") setingkat dengan 3×3=9 — padahal yang
 * pertama bisa menghentikan proyek dan yang kedua tidak.
 */
export function tingkatDari(skor: number): TingkatRisiko {
  if (!Number.isFinite(skor) || skor < 1) return 'rendah'
  if (skor >= 15) return 'ekstrem'
  if (skor >= 10) return 'tinggi'
  if (skor >= 5) return 'sedang'
  return 'rendah'
}

/**
 * Kenapa `null` dan bukan skor awal saat sisa belum dinilai.
 *
 * Mengembalikan skor awal sebagai "skor sisa" membuat risiko yang BELUM
 * dinilai ulang tak bisa dibedakan dari yang sudah dinilai dan ternyata tak
 * turun. Yang pertama butuh peninjauan; yang kedua butuh mitigasi lain.
 */
export function skorSisa(r: Pick<Risiko, 'dampak_sisa' | 'kemungkinan_sisa'>): number | null {
  if (r.dampak_sisa == null || r.kemungkinan_sisa == null) return null
  return r.dampak_sisa * r.kemungkinan_sisa
}

/**
 * Kenapa risiko ini perlu perhatian SEKARANG — dan alasannya dikembalikan,
 * bukan hanya boolean.
 *
 * Daftar yang menandai baris merah tanpa mengatakan kenapa memaksa orang
 * membuka satu per satu untuk menebak. Alasan yang tertulis membuat daftarnya
 * bisa dibaca tanpa diklik.
 *
 * @param acuan `YYYY-MM-DD`. Dilewatkan, bukan diambil dari jam sistem —
 *   supaya laporan bulan lalu bisa dihitung ulang dengan keadaan bulan lalu.
 */
export function perluPerhatian(r: Risiko, acuan: string): string[] {
  const alasan: string[] = []
  if (r.status === 'tertutup') return alasan

  const tingkat = tingkatDari(r.skor)

  if (r.status === 'terjadi') {
    alasan.push('risikonya sudah terjadi')
  }

  // Ekstrem tanpa satu pun tindakan: strategi 'terima' TIDAK membebaskan.
  // Menerima risiko ekstrem adalah keputusan direktur, dan keputusan itu harus
  // terlihat — bukan tersembunyi di kolom strategi.
  const adaTindakan = (r.tindakan ?? []).some((t) => t.status !== 'batal')
  if (tingkat === 'ekstrem' && !adaTindakan) {
    alasan.push('skor ekstrem tanpa tindakan')
  }

  // Tinggi/ekstrem yang mitigasinya belum dinilai ulang: kita tak tahu apakah
  // mitigasinya bekerja.
  if ((tingkat === 'tinggi' || tingkat === 'ekstrem') && skorSisa(r) === null && adaTindakan) {
    alasan.push('mitigasi belum dinilai ulang')
  }

  if (r.tenggat_tinjau && r.tenggat_tinjau < acuan) {
    alasan.push('lewat tenggat tinjau')
  }

  // Tindakan yang tenggatnya lewat sementara statusnya belum selesai.
  const telat = (r.tindakan ?? []).filter(
    (t) => t.status !== 'selesai' && t.status !== 'batal' && t.tenggat != null && t.tenggat < acuan,
  )
  if (telat.length > 0) {
    alasan.push(
      telat.length === 1 ? '1 tindakan lewat tenggat' : `${telat.length} tindakan lewat tenggat`,
    )
  }

  // Risiko tanpa pemilik: yang tak dimiliki siapa pun tak diurus siapa pun.
  if (!r.pemilik_id && (tingkat === 'tinggi' || tingkat === 'ekstrem')) {
    alasan.push('belum ada pemiliknya')
  }

  return alasan
}

export function nilaiRisiko(r: Risiko, acuan: string): RisikoDinilai {
  const sisa = skorSisa(r)
  const alasan = perluPerhatian(r, acuan)
  return {
    ...r,
    tingkat: tingkatDari(r.skor),
    skor_sisa: sisa,
    tingkat_sisa: sisa === null ? null : tingkatDari(sisa),
    penurunan: sisa === null ? null : r.skor - sisa,
    mendesak: alasan.length > 0,
    alasan_mendesak: alasan,
  }
}

export interface RingkasRegister {
  total: number
  terpantau: number
  terjadi: number
  tertutup: number
  /** Hanya yang BELUM tertutup — risiko tertutup tak lagi menuntut tindakan. */
  per_tingkat: Record<TingkatRisiko, number>
  mendesak: number
  /**
   * Rata-rata penurunan skor berkat mitigasi, dari yang SUDAH dinilai ulang.
   * `null` bila belum ada satu pun yang dinilai ulang — bukan 0, karena 0
   * berarti "mitigasi tidak menurunkan apa pun".
   */
  penurunan_rata: number | null
  dinilai_ulang: number
}

export function ringkasRegister(daftar: RisikoDinilai[]): RingkasRegister {
  const per_tingkat: Record<TingkatRisiko, number> = {
    rendah: 0, sedang: 0, tinggi: 0, ekstrem: 0,
  }
  let terpantau = 0, terjadi = 0, tertutup = 0, mendesak = 0
  let jumlahTurun = 0, dinilai_ulang = 0

  for (const r of daftar) {
    if (r.status === 'terpantau') terpantau++
    else if (r.status === 'terjadi') terjadi++
    else tertutup++

    if (r.status !== 'tertutup') per_tingkat[r.tingkat]++
    if (r.mendesak) mendesak++
    if (r.penurunan !== null) { jumlahTurun += r.penurunan; dinilai_ulang++ }
  }

  return {
    total: daftar.length,
    terpantau, terjadi, tertutup,
    per_tingkat,
    mendesak,
    penurunan_rata: dinilai_ulang === 0 ? null
      : Math.round((jumlahTurun / dinilai_ulang) * 10) / 10,
    dinilai_ulang,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Perizinan proyek
// ────────────────────────────────────────────────────────────────────────

export type StatusIzinProyek = 'rencana' | 'diajukan' | 'terbit' | 'ditolak' | 'dicabut'

export interface IzinProyek {
  id: string
  jenis: string
  nomor: string | null
  status: StatusIzinProyek
  /** `YYYY-MM-DD` */
  berlaku_dari: string | null
  /** `YYYY-MM-DD`. `null` = tanpa batas waktu (izin lokasi permanen). */
  berlaku_sampai: string | null
  /** Izin yang tanpanya pekerjaan tak boleh dimulai (PBG, bukan izin reklame). */
  menghalangi_mulai: boolean
}

/**
 * Enam keadaan, bukan dua.
 *
 * `belum_terbit`   masih diurus — belum bisa dipakai
 * `berlaku`        sah pada tanggal acuan
 * `akan_habis`     masih sah, tetapi habis sebelum proyek selesai / dalam ambang
 * `kedaluwarsa`    sudah lewat
 * `ditolak`        permohonannya ditolak — tak akan pernah terbit
 * `dicabut`        pernah terbit lalu dicabut — paling berbahaya, karena
 *                  pekerjaan mungkin sudah berjalan atas dasar izin itu
 */
export type StatusMasaIzin =
  | 'belum_terbit' | 'berlaku' | 'akan_habis' | 'kedaluwarsa' | 'ditolak' | 'dicabut'

export interface IzinDinilai extends IzinProyek {
  masa: StatusMasaIzin
  /**
   * Sisa hari sampai kedaluwarsa. Negatif = sudah lewat.
   * `null` bila tanpa batas waktu atau belum terbit.
   */
  sisa_hari: number | null
  /** Pekerjaan tak boleh berjalan dengan keadaan izin ini. */
  memblokir: boolean
}

function hariAntara(dari: string, sampai: string): number {
  const a = Date.UTC(+dari.slice(0, 4), +dari.slice(5, 7) - 1, +dari.slice(8, 10))
  const b = Date.UTC(+sampai.slice(0, 4), +sampai.slice(5, 7) - 1, +sampai.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

/**
 * @param acuan  `YYYY-MM-DD` — tanggal penilaian.
 * @param selesaiProyek `YYYY-MM-DD` atau null. Kalau ada, izin yang habis
 *   SEBELUM proyek selesai ditandai `akan_habis` meski hari ini masih sah.
 *   Inilah yang membedakan register izin yang berguna dari yang memberi tahu
 *   terlambat: pengurusan perpanjangan makan waktu berminggu-minggu.
 * @param ambangHari peringatan dini untuk izin tanpa tanggal selesai proyek.
 */
export function nilaiIzin(
  izin: IzinProyek,
  acuan: string,
  selesaiProyek: string | null = null,
  ambangHari = 60,
): IzinDinilai {
  if (izin.status === 'ditolak') {
    return { ...izin, masa: 'ditolak', sisa_hari: null, memblokir: izin.menghalangi_mulai }
  }
  if (izin.status === 'dicabut') {
    return { ...izin, masa: 'dicabut', sisa_hari: null, memblokir: izin.menghalangi_mulai }
  }
  if (izin.status !== 'terbit') {
    return { ...izin, masa: 'belum_terbit', sisa_hari: null, memblokir: izin.menghalangi_mulai }
  }

  // Terbit tetapi tanpa batas waktu — sah selamanya.
  if (!izin.berlaku_sampai) {
    return { ...izin, masa: 'berlaku', sisa_hari: null, memblokir: false }
  }

  // Sisa hari: izin habis pada AKHIR hari `berlaku_sampai`, jadi sisa 0 masih
  // sah hari itu. Batasnya `< 0`, bukan `<= 0` — sama seperti sertifikat
  // (G2e). Memakai `<=` menghentikan pekerjaan sehari lebih cepat.
  const sisa = hariAntara(acuan, izin.berlaku_sampai)
  if (sisa < 0) {
    return { ...izin, masa: 'kedaluwarsa', sisa_hari: sisa, memblokir: izin.menghalangi_mulai }
  }

  // Habis SEBELUM proyek selesai: bermasalah hari ini, meski hari ini sah.
  const habisSebelumSelesai =
    selesaiProyek != null && izin.berlaku_sampai < selesaiProyek

  if (habisSebelumSelesai || sisa <= ambangHari) {
    return { ...izin, masa: 'akan_habis', sisa_hari: sisa, memblokir: false }
  }

  return { ...izin, masa: 'berlaku', sisa_hari: sisa, memblokir: false }
}

export interface KesiapanIzin {
  /** Pekerjaan boleh berjalan. `null` bila belum ada izin sama sekali. */
  boleh_jalan: boolean | null
  memblokir: IzinDinilai[]
  perlu_diurus: IzinDinilai[]
  total: number
}

/**
 * Kenapa `null` saat NOL izin, bukan `true`.
 *
 * Pelajaran yang sama dengan ITP kosong (G1e): proyek tanpa satu pun izin
 * tercatat bukan proyek yang izinnya lengkap — ia proyek yang izinnya belum
 * didata. Menjawab "boleh jalan" untuk daftar kosong adalah kebohongan yang
 * terlihat meyakinkan.
 */
export function kesiapanIzin(daftar: IzinDinilai[]): KesiapanIzin {
  if (daftar.length === 0) {
    return { boleh_jalan: null, memblokir: [], perlu_diurus: [], total: 0 }
  }
  const memblokir = daftar.filter((i) => i.memblokir)
  const perlu_diurus = daftar.filter(
    (i) => !i.memblokir && (i.masa === 'akan_habis' || i.masa === 'belum_terbit'),
  )
  return {
    boleh_jalan: memblokir.length === 0,
    memblokir,
    perlu_diurus,
    total: daftar.length,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Sengketa
// ────────────────────────────────────────────────────────────────────────

export type StatusSengketa =
  | 'dicatat' | 'negosiasi' | 'mediasi' | 'arbitrase' | 'pengadilan' | 'selesai'

/**
 * Urutan eskalasi. Dipakai untuk memeriksa perpindahan, bukan untuk memaksa
 * setiap sengketa melewati semuanya — sengketa bisa langsung ke pengadilan.
 */
export const URUTAN_SENGKETA: StatusSengketa[] = [
  'dicatat', 'negosiasi', 'mediasi', 'arbitrase', 'pengadilan', 'selesai',
]

/**
 * Boleh pindah ke tahap ini?
 *
 * Maju boleh melompat (negosiasi → pengadilan itu wajar bila pihak lawan
 * menolak berunding). MUNDUR tidak boleh: perkara yang sudah masuk pengadilan
 * tak bisa "kembali ke negosiasi" di catatan — kalaupun berdamai, itu
 * `selesai` dengan hasil damai, bukan mundur. Catatan yang mundur menghapus
 * jejak bahwa perkaranya pernah sampai sejauh itu, dan justru jejak itulah
 * yang menentukan biaya dan risikonya.
 *
 * `selesai` adalah keadaan akhir: sengketa yang sudah diputus tak bisa dibuka
 * lagi lewat kolom status. Perkara baru atas hal yang sama adalah sengketa
 * baru, dengan nomornya sendiri.
 */
export function bolehPindahTahapSengketa(
  dari: StatusSengketa,
  ke: StatusSengketa,
): { boleh: boolean; alasan?: string } {
  if (dari === ke) return { boleh: false, alasan: 'tahapnya sudah itu' }
  if (dari === 'selesai') {
    return { boleh: false, alasan: 'sengketa sudah selesai — buat sengketa baru bila ada perkara lain' }
  }
  const i = URUTAN_SENGKETA.indexOf(dari)
  const j = URUTAN_SENGKETA.indexOf(ke)
  if (i < 0 || j < 0) return { boleh: false, alasan: 'tahap tak dikenal' }
  if (j < i) return { boleh: false, alasan: 'tahap tak boleh mundur' }
  return { boleh: true }
}

export interface Sengketa {
  id: string
  judul: string
  pihak_lawan: string
  status: StatusSengketa
  /** `YYYY-MM-DD` */
  tanggal_mulai: string
  selesai_pada: string | null
  /** numeric dari Postgres tiba sebagai STRING. */
  nilai_tuntutan: string | number | null
  nilai_putusan: string | number | null
  klaim_id: string | null
}

/**
 * `Number('')` adalah 0, bukan NaN — pelajaran G2a, dan di sini akibatnya
 * lebih buruk: nilai tuntutan yang terbaca 0 membuat sengketa Rp 2 miliar
 * terlihat tak bernilai di rekap.
 */
function angka(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface RingkasSengketa {
  total: number
  berjalan: number
  selesai: number
  /** Total tuntutan yang MASIH BERJALAN — paparan yang belum diketahui hasilnya. */
  paparan: number
  /** Berapa sengketa berjalan yang nilainya belum dicatat. Paparan di atas
   *  BELUM memasukkan mereka, dan angka tanpa catatan ini menyesatkan. */
  tanpa_nilai: number
  /** Selisih tuntutan vs putusan dari yang SUDAH selesai. `null` bila belum ada. */
  selisih_putusan: number | null
  /** Berapa lama sengketa berjalan tertua, dalam hari. `null` bila tak ada. */
  terlama_hari: number | null
}

export function ringkasSengketa(daftar: Sengketa[], acuan: string): RingkasSengketa {
  let berjalan = 0, selesai = 0, paparan = 0, tanpa_nilai = 0
  let tuntutSelesai = 0, putusSelesai = 0, adaSelesaiBernilai = 0
  let terlama: number | null = null

  for (const s of daftar) {
    const tuntut = angka(s.nilai_tuntutan)
    if (s.status === 'selesai') {
      selesai++
      const putus = angka(s.nilai_putusan)
      if (tuntut !== null && putus !== null) {
        tuntutSelesai += tuntut
        putusSelesai += putus
        adaSelesaiBernilai++
      }
    } else {
      berjalan++
      if (tuntut === null) tanpa_nilai++
      else paparan += tuntut
      const umur = hariAntara(s.tanggal_mulai, acuan)
      if (terlama === null || umur > terlama) terlama = umur
    }
  }

  return {
    total: daftar.length,
    berjalan, selesai, paparan, tanpa_nilai,
    selisih_putusan: adaSelesaiBernilai === 0 ? null : tuntutSelesai - putusSelesai,
    terlama_hari: terlama,
  }
}
