// KENDALI DOKUMEN — revisi gambar, tindak lanjut rapat, distribusi. PURE.
//
// ════════════════════════════════════════════════════════════════════════════
// EMPAT HAL YANG MODUL INI TOLAK TAMPILKAN SEBAGAI KABAR BAIK
// ════════════════════════════════════════════════════════════════════════════
//
// 1. **Gambar "berlaku" yang sudah punya revisi lebih baru.** Tukang
//    mengerjakan rev-2 karena rev-3 tak pernah sampai; pekerjaan dibongkar,
//    dan yang menanggung biayanya ditentukan siapa yang punya bukti kirim.
//    Di sini gambar yang punya revisi lebih tinggi ditandai **usang**, meski
//    kolom statusnya masih 'berlaku'.
//
// 2. **Transmittal "terkirim" yang tak pernah dikonfirmasi diterima.**
//    "Sudah saya kirim" dan "sudah saya terima" adalah dua klaim berbeda.
//    Yang tak berjawab lebih dari sepekan disebut menggantung, bukan selesai.
//
// 3. **Butir tindakan rapat yang lewat tenggat, tenggelam di antara yang
//    selesai.** Notulen dengan 20 butir dan 18 selesai terlihat produktif;
//    2 yang telat justru yang menghambat semuanya.
//
// 4. **Jadwal laporan yang diam-diam berhenti terkirim.** Tak ada yang
//    mengeluh soal surel yang tak datang — sampai ada yang menanyakan angka
//    yang seharusnya sudah dibaca berminggu-minggu lalu.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Selisih hari `dari` → `sampai` (positif bila `sampai` di masa depan). */
function selisihHari(dari: string, sampai: string): number {
  const a = new Date(dari.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(sampai.slice(0, 10) + 'T00:00:00Z').getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

// ── Register gambar ─────────────────────────────────────────────────────────

export interface Gambar {
  id: string
  nomor: string
  judul?: string | null
  revisi: number | string
  status: string
  disiplin?: string | null
  tahap?: string | null
  digantikan_oleh?: string | null
  tanggal_terbit?: string | null
}

export interface HasilGambar extends Gambar {
  /** Revisi TERTINGGI yang ada untuk nomor gambar ini. */
  revisiTertinggi: number
  /**
   * `true` bila baris ini berstatus 'berlaku' TAPI ada revisi lebih baru.
   *
   * Inilah keadaan yang paling merugikan: statusnya hijau, gambarnya sudah
   * mati. Kolom `status` saja tak menangkapnya karena memperbarui status
   * revisi lama adalah langkah manual yang mudah terlupa.
   */
  usang: boolean
}

export interface RingkasGambar {
  gambar: HasilGambar[]
  total: number
  /** Nomor gambar unik (bukan jumlah baris — satu nomor punya banyak revisi). */
  jumlahJudul: number
  /** Yang berstatus 'berlaku' padahal ada revisi lebih baru. */
  usang: number
  /** Yang berstatus 'digantikan' tapi tak menyebut penggantinya. */
  gantungTanpaPengganti: number
}

/**
 * Tandai gambar yang usang.
 *
 * @param gambar seluruh baris register untuk satu proyek.
 */
export function nilaiRegisterGambar(gambar: Gambar[]): RingkasGambar {
  // Revisi tertinggi per NOMOR — itu satuan yang berarti, bukan per baris.
  const tertinggi = new Map<string, number>()
  for (const g of gambar) {
    const r = angka(g.revisi) ?? 0
    const t = tertinggi.get(g.nomor)
    if (t === undefined || r > t) tertinggi.set(g.nomor, r)
  }

  const hasil: HasilGambar[] = gambar.map((g) => {
    const r = angka(g.revisi) ?? 0
    const max = tertinggi.get(g.nomor) ?? r
    return {
      ...g,
      revisiTertinggi: max,
      // Status 'berlaku' + ada revisi lebih baru = usang, apa pun kata kolomnya.
      usang: g.status === 'berlaku' && r < max,
    }
  })

  return {
    gambar: hasil,
    total: hasil.length,
    jumlahJudul: tertinggi.size,
    usang: hasil.filter((g) => g.usang).length,
    gantungTanpaPengganti: hasil.filter(
      (g) => g.status === 'digantikan' && !g.digantikan_oleh).length,
  }
}

// ── Transmittal ─────────────────────────────────────────────────────────────

export interface Transmittal {
  id: string
  nomor: string
  status: string
  dikirim_pada?: string | null
  diterima_pada?: string | null
}

/** Hari tanpa jawaban sebelum sebuah transmittal disebut menggantung. */
export const AMBANG_MENGGANTUNG_HARI = 7

export interface HasilTransmittal extends Transmittal {
  /** Hari sejak dikirim. `null` bila belum dikirim. */
  umurHari: number | null
  /**
   * Dikirim, belum dikonfirmasi diterima, dan sudah lewat ambang.
   *
   * BUKAN sekadar "belum diterima": transmittal yang dikirim pagi ini belum
   * pantas dianggap bermasalah. Yang bermasalah adalah yang sudah sepekan
   * tak berjawab — dan itu yang jadi sengketa saat pekerjaan salah gambar.
   */
  menggantung: boolean
}

export interface RingkasTransmittal {
  transmittal: HasilTransmittal[]
  terkirim: number
  diterima: number
  menggantung: number
  /** Rasio konfirmasi terima. `null` bila belum ada yang dikirim. */
  rasioDiterima: number | null
}

export function nilaiTransmittal(
  daftar: Transmittal[],
  hariIni: string,
): RingkasTransmittal {
  const hasil: HasilTransmittal[] = daftar.map((t) => {
    const umur = t.dikirim_pada ? selisihHari(t.dikirim_pada, hariIni) : null
    return {
      ...t,
      umurHari: umur,
      menggantung:
        t.status === 'dikirim' &&
        !t.diterima_pada &&
        umur != null &&
        umur >= AMBANG_MENGGANTUNG_HARI,
    }
  })

  const terkirim = hasil.filter((t) => t.dikirim_pada != null).length
  const diterima = hasil.filter((t) => t.diterima_pada != null).length

  return {
    transmittal: hasil,
    terkirim,
    diterima,
    menggantung: hasil.filter((t) => t.menggantung).length,
    // `null`, bukan 0, saat belum ada yang dikirim. Nol persen terbaca
    // "tak ada yang mengonfirmasi" — padahal belum ada yang perlu.
    rasioDiterima: terkirim > 0 ? Math.round((diterima / terkirim) * 1000) / 10 : null,
  }
}

// ── Butir tindakan notulen ──────────────────────────────────────────────────

export interface Tindakan {
  id: string
  uraian?: string | null
  status: string
  tenggat?: string | null
  selesai_pada?: string | null
  pj_nama?: string | null
}

export interface HasilTindakan extends Tindakan {
  /** Sisa hari menuju tenggat. Negatif = lewat. `null` bila tak bertenggat. */
  sisaHari: number | null
  lewatTenggat: boolean
}

export interface RingkasTindakan {
  tindakan: HasilTindakan[]
  terbuka: number
  selesai: number
  lewatTenggat: number
  /**
   * Butir terbuka TANPA tenggat.
   *
   * Dinyatakan terpisah karena ia tak akan pernah muncul sebagai "lewat
   * tenggat" — ia hanya mengendap. Notulen yang butirnya tak bertenggat
   * menghasilkan rapat berikutnya yang membahas hal yang sama.
   */
  tanpaTenggat: number
  /** Persen selesai. `null` bila belum ada butir sama sekali. */
  persenSelesai: number | null
}

export function nilaiTindakan(daftar: Tindakan[], hariIni: string): RingkasTindakan {
  const hasil: HasilTindakan[] = daftar.map((t) => {
    const sisa = t.tenggat ? selisihHari(hariIni, t.tenggat) : null
    return {
      ...t,
      sisaHari: sisa,
      // Hanya yang MASIH TERBUKA bisa lewat tenggat. Butir selesai yang
      // tenggatnya sudah lewat bukan masalah — ia sudah dikerjakan.
      lewatTenggat: t.status === 'terbuka' && sisa != null && sisa < 0,
    }
  })

  const terbuka = hasil.filter((t) => t.status === 'terbuka').length
  const selesai = hasil.filter((t) => t.status === 'selesai').length
  // Dibatalkan tidak dihitung di penyebut: membatalkan butir bukan prestasi,
  // dan memasukkannya membuat persentase bisa dinaikkan dengan membatalkan.
  const relevan = terbuka + selesai

  return {
    tindakan: hasil,
    terbuka,
    selesai,
    lewatTenggat: hasil.filter((t) => t.lewatTenggat).length,
    tanpaTenggat: hasil.filter((t) => t.status === 'terbuka' && !t.tenggat).length,
    persenSelesai: relevan > 0 ? Math.round((selesai / relevan) * 1000) / 10 : null,
  }
}

// ── Jadwal distribusi laporan ───────────────────────────────────────────────

export interface JadwalLaporan {
  id: string
  nama: string
  irama: string
  hari_ke?: number | string | null
  aktif: boolean
  terakhir_dikirim?: string | null
  gagal_berturut?: number | string | null
}

/** Berapa kali gagal berturut sebelum sebuah jadwal disebut MACET. */
export const AMBANG_MACET = 3

export interface HasilJadwalLaporan extends JadwalLaporan {
  /** Hari sejak terakhir berhasil terkirim. `null` bila belum pernah. */
  umurKirimHari: number | null
  /**
   * Jadwal aktif yang gagal berturut ≥ ambang, ATAU terlambat jauh dari
   * iramanya sendiri.
   *
   * Kedua bentuk dihitung: jadwal bisa berhenti tanpa satu pun galat
   * tercatat (proses penjadwalnya mati), dan itu justru yang paling lama
   * tak ketahuan.
   */
  macet: boolean
}

/** Berapa hari seharusnya jarak antar-pengiriman menurut iramanya. */
function jarakIrama(irama: string): number {
  if (irama === 'harian') return 1
  if (irama === 'mingguan') return 7
  return 31
}

export function nilaiJadwalLaporan(
  daftar: JadwalLaporan[],
  hariIni: string,
): { jadwal: HasilJadwalLaporan[]; aktif: number; macet: number } {
  const hasil: HasilJadwalLaporan[] = daftar.map((j) => {
    const umur = j.terakhir_dikirim ? selisihHari(j.terakhir_dikirim, hariIni) : null
    const gagal = angka(j.gagal_berturut) ?? 0
    // Toleransi 2× irama: laporan mingguan yang telat sehari bukan macet.
    const batasTelat = jarakIrama(j.irama) * 2
    const telatJauh = umur != null && umur > batasTelat

    return {
      ...j,
      umurKirimHari: umur,
      macet: j.aktif && (gagal >= AMBANG_MACET || telatJauh),
    }
  })

  return {
    jadwal: hasil,
    aktif: hasil.filter((j) => j.aktif).length,
    macet: hasil.filter((j) => j.macet).length,
  }
}
