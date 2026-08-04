/**
 * SURAT MASUK/KELUAR — batas balas & konsistensi arah. PURE, tanpa I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARAH MENGUBAH ARTI TIAP TANGGAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ini bukan detail administratif. Ia menentukan siapa yang lalai:
 *
 *   Surat KELUAR  kita mengirim. Hitungan menunggu mulai dari `tanggal_kirim`.
 *                 Kalau lewat batas tanpa dibalas → LAWAN yang belum menjawab,
 *                 dan itu dasar klaim kita.
 *
 *   Surat MASUK   kita menerima. Hitungan mulai dari `tanggal_terima`.
 *                 Kalau lewat batas tanpa dibalas → KITA yang lalai, dan itu
 *                 dasar klaim lawan.
 *
 * Memakai satu tanggal untuk keduanya membuat kedua keadaan itu terlihat sama.
 * Yang paling merugikan: surat masuk yang kita abaikan tampak seperti surat
 * keluar yang tak dijawab lawan — kelalaian kita terbaca sebagai kelalaian
 * mereka, sampai ada yang memeriksanya di meja perundingan.
 *
 * ── Kenapa `siapaYangDitunggu` dikembalikan
 *
 * Daftar "surat lewat batas" tanpa membedakan arah tak bisa ditindaklanjuti:
 * yang satu berarti "kirim penagihan jawaban", yang lain berarti "SEGERA
 * jawab sebelum jadi bukti melawan kita". Dua tindakan yang berlawanan.
 *
 * ── Fail-closed
 *
 * Tanggal rusak MENOLAK, bukan dianggap aman. Surat yang lolos karena
 * tanggalnya tak terbaca adalah surat yang tenggatnya tak pernah dijaga.
 */

export type ArahSurat = 'masuk' | 'keluar'

export type StatusSurat =
  | 'draft' | 'terkirim' | 'diterima' | 'dibalas' | 'selesai' | 'kedaluwarsa'

export interface MasukanBatasBalas {
  arah: ArahSurat
  butuhBalasan: boolean
  /** `project_letters.batas_balas` — tenggat menurut surat/kontrak. */
  batasBalas?: string | null
  tanggalKirim?: string | null
  tanggalTerima?: string | null
  status: StatusSurat
  /** Hari ini — disuntikkan supaya fungsinya murni & bisa diuji. */
  hariIni: string
}

export interface HasilBatasBalas {
  /**
   * `tak_perlu`    — surat tak butuh balasan, atau sudah dibalas/selesai
   * `tak_diatur`   — butuh balasan tapi batasnya tak ditetapkan
   * `berjalan`     — masih ada waktu
   * `mendesak`     — sisa ≤ 3 hari
   * `lewat`        — batas terlampaui dan belum dibalas
   * `tak_terbaca`  — tanggal rusak; ditolak, bukan diloloskan
   */
  keadaan: 'tak_perlu' | 'tak_diatur' | 'berjalan' | 'mendesak' | 'lewat' | 'tak_terbaca'
  sisaHari: number | null
  /**
   * Siapa yang sedang ditunggu jawabannya. `null` bila tak relevan.
   *
   * `lawan` — kita sudah mengirim, mereka belum menjawab  → tagih
   * `kita`  — mereka sudah mengirim, kita belum menjawab  → SEGERA jawab
   */
  siapaYangDitunggu: 'kita' | 'lawan' | null
  pesan: string
}

/** Ambang "mendesak" — masih cukup waktu untuk bertindak. */
const AMBANG_MENDESAK = 3

/**
 * Parse `YYYY-MM-DD` jadi hari epoch.
 *
 * UTC tengah hari, bukan `new Date(s)` mentah — konstruktor Date menafsirkan
 * tanggal polos sebagai UTC 00:00, dan di WIB (+7) itu bergeser jadi hari
 * sebelumnya saat dibaca sebagai waktu lokal. Yang dipersengketakan di surat
 * adalah HARI; pergeseran satu hari bisa menentukan lalai atau tidak.
 */
function keHariEpoch(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.trim?.() ?? '')
  if (!m) return null
  const [, y, bl, d] = m
  const ms = Date.UTC(Number(y), Number(bl) - 1, Number(d), 12, 0, 0)
  if (!Number.isFinite(ms)) return null
  const tgl = new Date(ms)
  // Tolak tanggal yang "menggulung" (mis. 2026-02-31 → 3 Maret).
  if (tgl.getUTCMonth() !== Number(bl) - 1 || tgl.getUTCDate() !== Number(d)) return null
  return Math.floor(ms / 86_400_000)
}

/**
 * Apakah sebuah surat masih dalam tenggat balasnya.
 *
 * Mengembalikan **siapa yang ditunggu**, bukan hanya lewat/tidak — dua keadaan
 * itu menuntut tindakan yang berlawanan (lihat header).
 */
export function evaluasiBatasBalas(m: MasukanBatasBalas): HasilBatasBalas {
  const kosong = { sisaHari: null, siapaYangDitunggu: null } as const

  // Sudah dibalas / ditutup → tak ada yang ditunggu, apa pun batasnya.
  if (m.status === 'dibalas' || m.status === 'selesai') {
    return { keadaan: 'tak_perlu', ...kosong, pesan: 'Surat sudah dibalas/selesai.' }
  }
  if (!m.butuhBalasan) {
    return { keadaan: 'tak_perlu', ...kosong, pesan: 'Surat ini tidak menuntut balasan.' }
  }

  // Siapa yang ditunggu ditentukan ARAH, dan berlaku bahkan saat batasnya
  // belum ditetapkan — informasinya tetap berguna.
  const ditunggu: 'kita' | 'lawan' = m.arah === 'masuk' ? 'kita' : 'lawan'

  if (m.batasBalas == null) {
    return {
      keadaan: 'tak_diatur', sisaHari: null, siapaYangDitunggu: ditunggu,
      pesan: 'Surat menuntut balasan tetapi batas waktunya belum ditetapkan.',
    }
  }

  const batas = keHariEpoch(m.batasBalas)
  const kini = keHariEpoch(m.hariIni)
  if (batas === null || kini === null) {
    return {
      keadaan: 'tak_terbaca', ...kosong,
      pesan: 'Tanggal tidak terbaca (format wajib YYYY-MM-DD).',
    }
  }

  // Tanggal acuan mengikuti ARAH — inilah inti berkas ini.
  const acuanStr = m.arah === 'masuk' ? m.tanggalTerima : m.tanggalKirim
  if (acuanStr) {
    const acuan = keHariEpoch(acuanStr)
    if (acuan === null) {
      return {
        keadaan: 'tak_terbaca', ...kosong,
        pesan: `Tanggal ${m.arah === 'masuk' ? 'terima' : 'kirim'} tidak terbaca.`,
      }
    }
    if (batas < acuan) {
      // Batas mendahului suratnya sendiri = data rusak, bukan "sudah lewat".
      // Membiarkannya lolos sebagai `lewat` menghasilkan peringatan yang tak
      // bisa ditindaklanjuti siapa pun.
      return {
        keadaan: 'tak_terbaca', ...kosong,
        pesan: `Batas balas (${m.batasBalas}) mendahului tanggal surat (${acuanStr}).`,
      }
    }
  }

  const sisa = batas - kini

  if (sisa < 0) {
    return {
      keadaan: 'lewat', sisaHari: sisa, siapaYangDitunggu: ditunggu,
      pesan: ditunggu === 'kita'
        ? `Batas balas lewat ${-sisa} hari dan KITA belum menjawab. ` +
          'Ini bisa jadi bukti melawan kita.'
        : `Batas balas lewat ${-sisa} hari dan pihak lawan belum menjawab. ` +
          'Ini dasar penagihan jawaban.',
    }
  }
  if (sisa <= AMBANG_MENDESAK) {
    return {
      keadaan: 'mendesak', sisaHari: sisa, siapaYangDitunggu: ditunggu,
      pesan: `Sisa ${sisa} hari sampai batas balas.`,
    }
  }
  return {
    keadaan: 'berjalan', sisaHari: sisa, siapaYangDitunggu: ditunggu,
    pesan: `Sisa ${sisa} hari sampai batas balas.`,
  }
}

export interface MasukanKonsistensiSurat {
  arah: ArahSurat
  status: StatusSurat
  tanggalKirim?: string | null
  tanggalTerima?: string | null
  butuhBalasan: boolean
  batasBalas?: string | null
}

export interface VerdictKonsistensiSurat {
  ok: boolean
  galat?: string
}

/**
 * Apakah bentuk sebuah surat masuk akal sebelum menyentuh database.
 *
 * Constraint di migrasi 185 sudah menjaga yang sama, tetapi pemeriksaan di sini
 * memberi **pesan yang bisa dibaca manusia**. Galat constraint Postgres
 * (`violates check constraint "project_letters_kirim_bertanggal"`) benar tapi
 * tak memberi tahu pemakai apa yang harus ia isi.
 */
export function validasiKonsistensiSurat(
  m: MasukanKonsistensiSurat,
): VerdictKonsistensiSurat {
  if (m.status !== 'draft') {
    if (m.arah === 'keluar' && !m.tanggalKirim) {
      return {
        ok: false,
        galat: 'Surat keluar yang sudah dikirim wajib punya tanggal kirim — ' +
               'tanpa itu, lama-menunggu jawaban tak bisa dihitung.',
      }
    }
    if (m.arah === 'masuk' && !m.tanggalTerima) {
      return {
        ok: false,
        galat: 'Surat masuk wajib punya tanggal terima — dari situlah kewajiban ' +
               'menjawab dihitung.',
      }
    }
  }

  if (m.tanggalKirim && m.tanggalTerima) {
    const k = keHariEpoch(m.tanggalKirim)
    const t = keHariEpoch(m.tanggalTerima)
    if (k === null || t === null) {
      return { ok: false, galat: 'Tanggal tidak terbaca (format wajib YYYY-MM-DD).' }
    }
    if (t < k) {
      return { ok: false, galat: 'Tanggal terima mendahului tanggal kirim.' }
    }
  }

  if (m.batasBalas && !m.butuhBalasan) {
    // Peringatan palsu melatih orang mengabaikan seluruh peringatan.
    return {
      ok: false,
      galat: 'Batas balas hanya berlaku untuk surat yang menuntut balasan. ' +
             'Tandai "butuh balasan" atau kosongkan batasnya.',
    }
  }

  return { ok: true }
}
