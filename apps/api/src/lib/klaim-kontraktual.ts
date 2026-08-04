/**
 * KLAIM KONTRAKTUAL — batas waktu pemberitahuan & keputusan. PURE, tanpa I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG SEBENARNYA MENGGUGURKAN KLAIM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Di meja perundingan, klaim jarang gugur karena angkanya salah. Ia gugur
 * karena **terlambat diberitahukan**. Hampir semua kontrak konstruksi memberi
 * batas — lazimnya 14–28 hari sejak peristiwa — dan lewat dari itu, klaim
 * yang paling sah sekalipun kehilangan dasarnya.
 *
 * Karena itu berkas ini memisahkan dua hal yang mudah tertukar:
 *
 *   TERLAMBAT  → sudah lewat batas, klaimnya `gugur`
 *   DITOLAK    → owner menilai klaimnya tak berdasar
 *
 * Menyatukan keduanya menghapus pelajaran termahal yang bisa dipetik sebuah
 * perusahaan konstruksi: berapa banyak uang hilang karena **lalai memberi
 * tahu**, bukan karena klaimnya lemah. Yang pertama bisa diperbaiki dengan
 * disiplin; yang kedua tidak.
 *
 * ── Kenapa `sisaHari` dikembalikan, bukan cuma boolean
 *
 * Klaim yang tersisa 2 hari lagi butuh tindakan HARI INI. Fungsi yang hanya
 * menjawab "belum lewat" membuat itu tak terlihat sampai sudah terlambat.
 *
 * ── Fail-closed
 *
 * Tanggal rusak MENOLAK, bukan dianggap aman. Klaim yang lolos karena
 * tanggalnya tak terbaca adalah klaim yang batas waktunya tak pernah dijaga.
 */

/** Status klaim — cermin enum `claim_status` di migrasi 184. */
export type StatusKlaim =
  | 'draft' | 'diberitahukan' | 'diajukan'
  | 'disetujui' | 'disetujui_sebagian' | 'ditolak' | 'gugur'

export interface MasukanBatasPemberitahuan {
  /** Kapan peristiwanya terjadi (YYYY-MM-DD). */
  tanggalPeristiwa: string
  /** Batas hari menurut kontrak. `null` = tak diatur → tak ada yang bisa dilewati. */
  batasHari: number | null | undefined
  /** Kapan owner diberi tahu. `null` = belum diberi tahu. */
  tanggalPemberitahuan?: string | null
  /** Hari ini — disuntikkan supaya fungsinya tetap murni & bisa diuji. */
  hariIni: string
}

export interface HasilBatasPemberitahuan {
  /**
   * `tak_diatur`  — kontrak tak menetapkan batas; tak ada yang bisa terlampaui
   * `aman`        — sudah diberitahukan dalam batas
   * `mendesak`    — belum diberitahukan, sisa ≤ 3 hari
   * `berjalan`    — belum diberitahukan, masih ada waktu
   * `terlambat`   — batas terlampaui → klaim GUGUR
   * `tak_terbaca` — tanggal rusak; ditolak, bukan diloloskan
   */
  keadaan: 'tak_diatur' | 'aman' | 'berjalan' | 'mendesak' | 'terlambat' | 'tak_terbaca'
  /** Sisa hari sampai batas. Negatif = sudah lewat. `null` bila tak berlaku. */
  sisaHari: number | null
  /** Hari terpakai dari peristiwa sampai pemberitahuan (atau sampai hari ini). */
  hariTerpakai: number | null
  pesan: string
}

/** Ambang "mendesak" — hari kerja yang tersisa masih cukup untuk bertindak. */
const AMBANG_MENDESAK = 3

/**
 * Parse `YYYY-MM-DD` jadi hari epoch UTC.
 *
 * Sengaja UTC-tengah-hari, bukan `new Date(s)` mentah: konstruktor Date
 * menafsirkan tanggal polos sebagai UTC 00:00, dan di zona WIB (+7) itu
 * bergeser jadi hari sebelumnya saat dibaca kembali sebagai waktu lokal.
 * Yang dipersengketakan di kontrak adalah HARI, jadi pergeseran satu hari
 * bukan galat kosmetik — ia bisa menentukan klaim gugur atau tidak.
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
 * Apakah batas waktu pemberitahuan klaim masih terpenuhi.
 *
 * Bukan boolean: pemanggilnya perlu tahu **berapa sisa harinya** untuk bisa
 * memperingatkan sebelum terlambat, dan perlu membedakan "tak diatur" dari
 * "aman" supaya tak melaporkan kepatuhan yang tak pernah diuji.
 */
export function evaluasiBatasPemberitahuan(
  m: MasukanBatasPemberitahuan,
): HasilBatasPemberitahuan {
  const kosong = { sisaHari: null, hariTerpakai: null }

  const peristiwa = keHariEpoch(m.tanggalPeristiwa)
  if (peristiwa === null) {
    return {
      keadaan: 'tak_terbaca', ...kosong,
      pesan: 'Tanggal peristiwa tidak terbaca (format wajib YYYY-MM-DD).',
    }
  }

  const kini = keHariEpoch(m.hariIni)
  if (kini === null) {
    return { keadaan: 'tak_terbaca', ...kosong, pesan: 'Tanggal acuan tidak terbaca.' }
  }

  const diberitahu = m.tanggalPemberitahuan ? keHariEpoch(m.tanggalPemberitahuan) : null
  if (m.tanggalPemberitahuan && diberitahu === null) {
    return {
      keadaan: 'tak_terbaca', ...kosong,
      pesan: 'Tanggal pemberitahuan tidak terbaca (format wajib YYYY-MM-DD).',
    }
  }

  // Batas tak diatur → tak ada yang bisa terlampaui. Dibedakan dari `aman`:
  // melaporkan "patuh" untuk aturan yang tak pernah ada adalah kepatuhan palsu.
  const batas = m.batasHari
  if (batas == null || !Number.isFinite(batas)) {
    return {
      keadaan: 'tak_diatur',
      sisaHari: null,
      hariTerpakai: diberitahu !== null ? diberitahu - peristiwa : kini - peristiwa,
      pesan: 'Kontrak tidak menetapkan batas waktu pemberitahuan klaim.',
    }
  }
  if (batas < 0) {
    return { keadaan: 'tak_terbaca', ...kosong, pesan: `Batas hari (${batas}) tidak masuk akal.` }
  }

  // Sudah diberitahukan — yang dinilai adalah tanggal PEMBERITAHUAN, bukan
  // hari ini. Klaim yang diberitahukan tepat waktu tetap sah selamanya,
  // betapa pun lama sesudahnya rinciannya diajukan.
  if (diberitahu !== null) {
    const terpakai = diberitahu - peristiwa
    const sisa = batas - terpakai
    if (terpakai < 0) {
      return {
        keadaan: 'tak_terbaca', sisaHari: null, hariTerpakai: terpakai,
        pesan: 'Tanggal pemberitahuan mendahului tanggal peristiwa.',
      }
    }
    if (sisa < 0) {
      return {
        keadaan: 'terlambat', sisaHari: sisa, hariTerpakai: terpakai,
        pesan:
          `Pemberitahuan terlambat ${-sisa} hari: peristiwa ${m.tanggalPeristiwa}, ` +
          `diberitahukan hari ke-${terpakai}, batas ${batas} hari. Klaim berisiko GUGUR.`,
      }
    }
    return {
      keadaan: 'aman', sisaHari: sisa, hariTerpakai: terpakai,
      pesan: `Diberitahukan hari ke-${terpakai} dari batas ${batas} hari.`,
    }
  }

  // Belum diberitahukan — hitungannya berjalan sampai hari ini.
  const terpakai = kini - peristiwa
  const sisa = batas - terpakai

  if (sisa < 0) {
    return {
      keadaan: 'terlambat', sisaHari: sisa, hariTerpakai: terpakai,
      pesan:
        `Batas pemberitahuan sudah lewat ${-sisa} hari dan owner BELUM diberi tahu. ` +
        `Peristiwa ${m.tanggalPeristiwa}, batas ${batas} hari.`,
    }
  }
  if (sisa <= AMBANG_MENDESAK) {
    return {
      keadaan: 'mendesak', sisaHari: sisa, hariTerpakai: terpakai,
      pesan: `Sisa ${sisa} hari untuk memberi tahu owner. Setelah itu klaim bisa GUGUR.`,
    }
  }
  return {
    keadaan: 'berjalan', sisaHari: sisa, hariTerpakai: terpakai,
    pesan: `Sisa ${sisa} hari untuk memberi tahu owner.`,
  }
}

export interface MasukanKeputusanKlaim {
  status: StatusKlaim
  diklaim: number
  disetujui?: number | null
}

export interface VerdictKeputusanKlaim {
  ok: boolean
  galat?: string
}

/**
 * Apakah sebuah keputusan klaim konsisten.
 *
 * Constraint database sudah menjaga bentuk dasarnya (migrasi 184), tetapi
 * pemeriksaan di sini memberi **pesan yang bisa dibaca manusia** sebelum
 * request menyentuh database — dan menangkap satu hal yang constraint tak
 * bisa: nilai disetujui melebihi yang diklaim.
 */
export function validasiKeputusanKlaim(m: MasukanKeputusanKlaim): VerdictKeputusanKlaim {
  const memutuskan = m.status === 'disetujui' || m.status === 'disetujui_sebagian'

  if (!Number.isFinite(m.diklaim) || m.diklaim < 0) {
    return { ok: false, galat: 'Nilai klaim tidak sah' }
  }

  if (!memutuskan) {
    if (m.disetujui != null) {
      return {
        ok: false,
        galat: `Status "${m.status}" tidak boleh membawa nilai disetujui — ` +
               'nilai yang disetujui pada klaim yang belum/tidak disetujui akan ' +
               'ikut terhitung di laporan.',
      }
    }
    return { ok: true }
  }

  if (m.disetujui == null || !Number.isFinite(m.disetujui) || m.disetujui < 0) {
    return { ok: false, galat: `Status "${m.status}" wajib menyertakan nilai disetujui` }
  }

  if (m.disetujui > m.diklaim) {
    // Bukan sekadar aneh — ini uang yang masuk pembukuan tanpa pernah ditagih.
    return {
      ok: false,
      galat: `Nilai disetujui (${m.disetujui}) melebihi yang diklaim (${m.diklaim}).`,
    }
  }

  if (m.status === 'disetujui' && m.disetujui !== m.diklaim) {
    return {
      ok: false,
      galat:
        'Status "disetujui" berarti disetujui PENUH. Untuk nilai yang berbeda ' +
        'dari klaim, pakai "disetujui_sebagian" — kalau tidak, laporan tak bisa ' +
        'membedakan klaim yang utuh diterima dari yang dipotong.',
    }
  }

  return { ok: true }
}
