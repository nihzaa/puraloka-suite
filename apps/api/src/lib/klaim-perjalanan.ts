/**
 * KLAIM PERJALANAN (G1) — penggantian biaya yang ditalangi karyawan. PURE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN KASBON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kasbon adalah UANG MUKA — dicairkan sebelum belanja. Klaim perjalanan arah
 * uangnya berlawanan: karyawan menalangi lebih dulu, perusahaan mengganti
 * sesudahnya.
 *
 * Bedanya bukan istilah. Kasbon yang belum diselesaikan adalah PIUTANG
 * perusahaan kepada karyawan; klaim yang belum dibayar adalah UTANG. Mencatat
 * keduanya di satu tabel membuat saldo "kasbon beredar" salah tanda.
 *
 * ── Kenapa `disetujui` dan `dibayar` DIPISAH
 *
 * Klaim yang disetujui tapi belum cair adalah utang yang harus terlihat.
 * Menyatukan keduanya membuat utang itu lenyap dari pembukuan pada saat
 * persetujuan — dan yang menagihnya (karyawan) tak punya bukti apa pun bahwa
 * perusahaan sudah setuju membayar.
 */

export type StatusKlaim = 'diajukan' | 'disetujui' | 'ditolak' | 'dibayar'
export type JenisBiaya = 'transport' | 'penginapan' | 'konsumsi' | 'bbm' | 'tol_parkir' | 'lain'

export const JENIS_BIAYA: readonly JenisBiaya[] = [
  'transport', 'penginapan', 'konsumsi', 'bbm', 'tol_parkir', 'lain',
] as const

/**
 * Ambang nominal yang menuntut bukti.
 *
 * ── Kenapa ada ambang, bukan "bukti selalu wajib"
 *
 * Parkir Rp 5.000 tanpa kuitansi adalah kenyataan lapangan. Menuntut bukti
 * untuk semuanya menghasilkan salah satu dari dua hal, keduanya buruk: klaim
 * kecil tak pernah diajukan (karyawan menanggung sendiri), atau orang
 * memfoto apa saja supaya kolomnya terisi — dan bukti berhenti berarti.
 *
 * Angkanya di sini, bukan di basis: ia kebijakan tenant, dan CHECK yang
 * menolak seluruh tenant bukan tempatnya. Yang TIDAK boleh dikonfigurasi
 * adalah keberadaan aturannya (ember [C], CLAUDE.md §5.3).
 */
export const AMBANG_BUKTI_DEFAULT = 100_000

export interface ItemKlaim {
  jenis?: string
  uraian?: string
  tanggal?: string
  nominal?: number | string | null
  bukti_url?: string | null
}

export type HasilValidasiItem =
  | { ok: true; nilai: Array<{ jenis: JenisBiaya; uraian: string; tanggal: string; nominal: number; bukti_url: string | null }> ; total: number }
  | { ok: false; galat: string }

const TGL = /^\d{4}-\d{2}-\d{2}$/

export function validasiItem(
  item: readonly ItemKlaim[] | undefined,
  batas: { berangkat: string; kembali: string },
  ambangBukti: number = AMBANG_BUKTI_DEFAULT,
): HasilValidasiItem {
  if (!Array.isArray(item) || item.length === 0) {
    return {
      ok: false,
      galat: 'Klaim tanpa satu pun rincian tak meminta penggantian apa pun.',
    }
  }

  const nilai: Array<{ jenis: JenisBiaya; uraian: string; tanggal: string; nominal: number; bukti_url: string | null }> = []
  let total = 0

  for (const [i, it] of item.entries()) {
    const no = i + 1

    if (!JENIS_BIAYA.includes(it.jenis as JenisBiaya)) {
      return { ok: false, galat: `Rincian ${no}: jenis biaya "${it.jenis}" tak dikenal` }
    }
    if (!it.uraian?.trim()) {
      return { ok: false, galat: `Rincian ${no}: uraian wajib diisi` }
    }
    if (!it.tanggal || !TGL.test(it.tanggal)) {
      return { ok: false, galat: `Rincian ${no}: tanggal wajib, bentuk YYYY-MM-DD` }
    }

    // Tanggal biaya WAJIB di dalam rentang perjalanan. Di luar itu, biayanya
    // milik perjalanan lain — atau tak ada perjalanannya sama sekali.
    //
    // Perbandingan STRING pada bentuk YYYY-MM-DD sudah benar secara leksikal,
    // dan menghindari pergeseran zona waktu saat mem-parse Date.
    if (it.tanggal < batas.berangkat || it.tanggal > batas.kembali) {
      return {
        ok: false,
        galat: `Rincian ${no}: tanggal ${it.tanggal} di luar rentang perjalanan `
          + `(${batas.berangkat} s.d. ${batas.kembali}).`,
      }
    }

    // `Number('') === 0`, bukan NaN — kosong ditolak SEBELUM konversi supaya
    // "belum diisi" tak lolos jadi nol lalu ditolak CHECK dengan pesan lain.
    if (it.nominal === null || it.nominal === undefined || String(it.nominal).trim() === '') {
      return { ok: false, galat: `Rincian ${no}: nominal wajib diisi` }
    }
    const n = Number(it.nominal)
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, galat: `Rincian ${no}: nominal harus lebih dari nol` }
    }

    const bukti = it.bukti_url?.trim() || null
    if (n >= ambangBukti && !bukti) {
      return {
        ok: false,
        galat: `Rincian ${no} bernilai ${n} — bukti wajib dilampirkan untuk pengeluaran `
          + `${ambangBukti} ke atas.`,
      }
    }

    total += n
    nilai.push({
      jenis: it.jenis as JenisBiaya,
      uraian: it.uraian.trim(),
      tanggal: it.tanggal,
      nominal: n,
      bukti_url: bukti,
    })
  }

  return { ok: true, nilai, total: bulat2(total) }
}

export type HasilTransisi =
  | { boleh: true }
  | { boleh: false; sebab: string }

/**
 * Bolehkah klaim berpindah status?
 *
 * `diajukan` → `disetujui` → `dibayar`, dan `diajukan` → `ditolak`.
 *
 * ── Kenapa yang DITOLAK tak bisa dihidupkan kembali
 *
 * Penolakan sudah beralasan dan tercatat. Menghidupkannya kembali membuat
 * alasan itu menggantung pada dokumen yang akhirnya dibayar — dan riwayatnya
 * membingungkan siapa pun yang membacanya belakangan. Ajukan klaim baru.
 */
export function periksaTransisiKlaim(m: {
  statusSekarang: StatusKlaim
  statusTujuan: StatusKlaim
  alasanTolak?: string | null
  totalDisetujui?: number | null
  totalDiajukan: number
  adaAkunKas?: boolean
}): HasilTransisi {
  const { statusSekarang: dari, statusTujuan: ke } = m

  if (dari === ke) return { boleh: false, sebab: `Klaim sudah berstatus ${ke}.` }
  if (dari === 'dibayar') {
    return { boleh: false, sebab: 'Klaim sudah dibayar — uangnya sudah keluar dan tak bisa ditarik dari sini.' }
  }
  if (dari === 'ditolak') {
    return {
      boleh: false,
      sebab: 'Klaim ini sudah ditolak beserta alasannya. Ajukan klaim baru — '
        + 'menghidupkan yang lama membuat alasan penolakannya menggantung pada dokumen yang dibayar.',
    }
  }

  if (ke === 'ditolak') {
    if (dari !== 'diajukan') {
      return { boleh: false, sebab: `Hanya klaim yang diajukan bisa ditolak; ini berstatus ${dari}.` }
    }
    if (!m.alasanTolak?.trim()) {
      return {
        boleh: false,
        sebab: 'Penolakan wajib beralasan — yang menalangi berhak tahu kenapa uangnya tak diganti.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'disetujui') {
    if (dari !== 'diajukan') {
      return { boleh: false, sebab: `Hanya klaim yang diajukan bisa disetujui; ini berstatus ${dari}.` }
    }
    const d = m.totalDisetujui
    if (d === null || d === undefined || !Number.isFinite(d)) {
      return { boleh: false, sebab: 'Nominal yang disetujui wajib ditentukan' }
    }
    if (d <= 0) {
      return {
        boleh: false,
        sebab: 'Menyetujui Rp 0 bukan persetujuan — tolak klaimnya beserta alasan.',
      }
    }
    if (d > m.totalDiajukan) {
      return {
        boleh: false,
        sebab: `Yang disetujui (${d}) melebihi yang diajukan (${m.totalDiajukan}). `
          + 'Penyetuju boleh memangkas, tak boleh menambah — yang ditambah tak punya bukti.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'dibayar') {
    if (dari !== 'disetujui') {
      return {
        boleh: false,
        sebab: `Hanya klaim yang sudah disetujui bisa dibayar; ini berstatus ${dari}.`,
      }
    }
    if (!m.adaAkunKas) {
      return {
        boleh: false,
        sebab: 'Akun kas wajib dipilih — pembayaran tanpa sumber dana tak bisa direkonsiliasi.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'diajukan') {
    return { boleh: false, sebab: 'Klaim tak bisa dikembalikan ke diajukan. Ajukan klaim baru.' }
  }

  return { boleh: false, sebab: `Perpindahan ${dari} → ${ke} tak dikenal.` }
}

export interface RingkasKlaim {
  status: StatusKlaim
  total_diajukan: number | string
  total_disetujui: number | string | null
}

export interface HasilRingkas {
  menunggu: number
  /** Sudah disetujui, belum cair — UTANG perusahaan kepada karyawan. */
  utang: number
  dibayar: number
  jumlahMenunggu: number
  jumlahUtang: number
}

/**
 * Ringkasan untuk layar dan laporan.
 *
 * ── Kenapa `utang` memakai `total_disetujui`, bukan `total_diajukan`
 *
 * Yang menjadi kewajiban perusahaan adalah yang DISETUJUI. Memakai yang
 * diajukan membuat utang terlihat lebih besar daripada yang sebenarnya
 * disepakati — dan selisihnya justru bagian yang ditolak penyetuju.
 */
export function ringkasKlaim(daftar: readonly RingkasKlaim[]): HasilRingkas {
  const h: HasilRingkas = { menunggu: 0, utang: 0, dibayar: 0, jumlahMenunggu: 0, jumlahUtang: 0 }

  for (const k of daftar) {
    // Numeric dari pg datang sebagai STRING. `'500' + '700'` menghasilkan
    // '500700' kalau tak dikonversi — angka yang salah tanpa satu pun galat.
    const diajukan = Number(k.total_diajukan ?? 0)
    const disetujui = k.total_disetujui === null || k.total_disetujui === undefined
      ? 0
      : Number(k.total_disetujui)

    if (k.status === 'diajukan') {
      h.menunggu += Number.isFinite(diajukan) ? diajukan : 0
      h.jumlahMenunggu++
    } else if (k.status === 'disetujui') {
      h.utang += Number.isFinite(disetujui) ? disetujui : 0
      h.jumlahUtang++
    } else if (k.status === 'dibayar') {
      h.dibayar += Number.isFinite(disetujui) ? disetujui : 0
    }
    // `ditolak` tak dihitung ke mana pun — ia bukan kewajiban, dan bukan
    // pengeluaran.
  }

  h.menunggu = bulat2(h.menunggu)
  h.utang = bulat2(h.utang)
  h.dibayar = bulat2(h.dibayar)
  return h
}

/** Lama perjalanan dalam hari, inklusif — berangkat dan pulang ikut dihitung. */
export function lamaPerjalanan(berangkat: string, kembali: string): number | null {
  if (!TGL.test(berangkat) || !TGL.test(kembali)) return null
  const a = Date.parse(berangkat)
  const b = Date.parse(kembali)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  // +1 karena perjalanan sehari (berangkat = kembali) tetap satu hari, bukan
  // nol. Yang menghitungnya nol akan membagi dengan nol saat mencari biaya
  // per hari.
  return Math.round((b - a) / 86_400_000) + 1
}

function bulat2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
