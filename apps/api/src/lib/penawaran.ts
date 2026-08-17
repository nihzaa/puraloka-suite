/**
 * DOKUMEN PENAWARAN — hitungan & kata-katanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Register tender (`bids`) menyimpan ANGKA penawaran — satu kolom
 * `bid_value` — tetapi bukan DOKUMENNYA. Tak ada nomor surat, masa berlaku,
 * syarat, maupun baris rincian.
 *
 * Akibatnya surat penawaran disusun di luar aplikasi, dan yang dikirim ke
 * owner berbeda dari yang tercatat di sini. Saat menang, RAB-nya disusun dari
 * angka yang tak pernah dibandingkan dengan yang ditawarkan — dan selisihnya
 * baru ketahuan sebagai margin yang hilang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TERBILANG — dan kenapa ia bukan hiasan
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Surat penawaran di Indonesia menuliskan nilainya DUA KALI: sebagai angka
 * dan sebagai kata. Bukan tradisi — itu yang menentukan saat keduanya
 * berbeda: dalam praktik komersial, YANG TERTULIS HURUF yang dipegang.
 *
 * Karena itu terbilangnya dihitung dari angka yang sama yang dicetak, di satu
 * tempat, dan diuji. Menyerahkannya ke pengetikan tangan berarti dua sumber
 * untuk satu nilai — dan yang salah ketik justru yang mengikat.
 */

export type StatusPenawaran = 'draft' | 'terkirim' | 'menang' | 'kalah' | 'batal'

export const STATUS_PENAWARAN_SAH: readonly StatusPenawaran[] =
  ['draft', 'terkirim', 'menang', 'kalah', 'batal'] as const

export interface BarisPenawaran {
  uraian: string
  satuan?: string | null
  volume?: number | string | null
  harga_satuan?: number | string | null
}

export interface HitungPenawaran {
  /** Jumlah seluruh baris sebelum diskon & pajak. */
  subtotal: number
  diskon: number
  /** Dasar pengenaan pajak = subtotal − diskon. */
  dpp: number
  ppn: number
  total: number
  terbilang: string
}

/** Angka dari isian: string kosong, sampah, dan negatif jadi `null`. */
export function angkaSah(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return n
}

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima',
  'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
]

/**
 * Angka → kata, gaya Indonesia baku.
 *
 * Yang membuatnya tak sepele dan sering salah kalau ditulis buru-buru:
 *
 *   11–19   "sebelas", "dua belas" … BUKAN "satu belas"
 *   100     "seratus"  BUKAN "satu ratus"
 *   1.000   "seribu"   BUKAN "satu ribu"
 *   2.000   "dua ribu" — awalan "se-" HANYA untuk yang pertama
 *
 * Rekursif per tiga digit, dan tiap tingkat memakai aturan "se-" yang sama.
 */
function keKata(n: number): string {
  if (n < 0) return `minus ${keKata(-n)}`
  if (n < 12) return SATUAN[n]
  if (n < 20) return `${SATUAN[n - 10]} belas`
  if (n < 100) {
    const sisa = n % 10
    return `${SATUAN[Math.floor(n / 10)]} puluh${sisa ? ` ${SATUAN[sisa]}` : ''}`
  }
  if (n < 200) return `seratus${n - 100 ? ` ${keKata(n - 100)}` : ''}`
  if (n < 1000) {
    const sisa = n % 100
    return `${SATUAN[Math.floor(n / 100)]} ratus${sisa ? ` ${keKata(sisa)}` : ''}`
  }
  if (n < 2000) return `seribu${n - 1000 ? ` ${keKata(n - 1000)}` : ''}`
  if (n < 1_000_000) {
    const sisa = n % 1000
    return `${keKata(Math.floor(n / 1000))} ribu${sisa ? ` ${keKata(sisa)}` : ''}`
  }
  if (n < 1_000_000_000) {
    const sisa = n % 1_000_000
    return `${keKata(Math.floor(n / 1_000_000))} juta${sisa ? ` ${keKata(sisa)}` : ''}`
  }
  if (n < 1_000_000_000_000) {
    const sisa = n % 1_000_000_000
    return `${keKata(Math.floor(n / 1_000_000_000))} miliar${sisa ? ` ${keKata(sisa)}` : ''}`
  }
  const sisa = n % 1_000_000_000_000
  return `${keKata(Math.floor(n / 1_000_000_000_000))} triliun${sisa ? ` ${keKata(sisa)}` : ''}`
}

/**
 * Terbilang rupiah, siap dicetak di surat.
 *
 * Sen DIBULATKAN, tidak dibuang: nilai yang dicetak sebagai angka juga
 * dibulatkan, dan dua pembulatan yang berbeda menghasilkan surat yang
 * angkanya tak sama dengan hurufnya — persis keadaan yang membuat huruf
 * dipegang dan angka diabaikan.
 */
export function terbilangRupiah(n: number): string {
  // Nol dan NaN lewat jalur yang SAMA dengan sisanya, bukan `return` awal.
  //
  // Versi pertama memulangkan `'nol rupiah'` huruf kecil dari dua jalur
  // pintas, sementara sisanya berhuruf besar. Ujinya menangkapnya, dan itu
  // bukan kerewelan: surat yang satu barisnya berhuruf kecil di antara yang
  // lain terbaca seperti tempelan — dan surat penawaran dinilai penerimanya
  // sebelum angkanya dibaca.
  const bulat = Number.isFinite(n) ? Math.round(n) : 0
  const kata = bulat === 0 ? 'nol' : keKata(Math.abs(bulat)).replace(/\s+/g, ' ').trim()
  const berhuruf = `${kata} rupiah`
  const hasil = bulat < 0 ? `minus ${berhuruf}` : berhuruf
  return hasil.charAt(0).toUpperCase() + hasil.slice(1)
}

/** Jumlah satu baris = volume × harga satuan. Kosong mana pun → 0. */
export function jumlahBaris(b: BarisPenawaran): number {
  const v = angkaSah(b.volume)
  const h = angkaSah(b.harga_satuan)
  if (v === null || h === null) return 0
  return v * h
}

/**
 * Hitung seluruh penawaran.
 *
 * ── Urutan diskon dan pajak TIDAK boleh tertukar
 *
 * PPN dikenakan pada dasar SESUDAH diskon (DPP), bukan sebelum. Menukarnya
 * membuat pajak dihitung atas nilai yang tak pernah ditagih — dan pada
 * penawaran ratusan juta, selisihnya jutaan yang harus ditanggung sendiri
 * saat faktur pajaknya terbit dari angka yang benar.
 *
 * ── Diskon dibatasi subtotal
 *
 * Diskon melebihi subtotal menghasilkan DPP negatif, lalu PPN negatif, lalu
 * total negatif — surat penawaran yang menyatakan perusahaan MEMBAYAR klien.
 * Ditahan di sini, bukan dipercayakan pada orang yang mengetik.
 */
export function hitungPenawaran(masukan: {
  baris: readonly BarisPenawaran[]
  diskon?: number | string | null
  ppn_persen?: number | string | null
}): HitungPenawaran {
  const subtotal = masukan.baris.reduce((s, b) => s + jumlahBaris(b), 0)

  const diskonMinta = Math.max(0, angkaSah(masukan.diskon) ?? 0)
  const diskon = Math.min(diskonMinta, subtotal)

  const dpp = subtotal - diskon
  const persen = Math.max(0, angkaSah(masukan.ppn_persen) ?? 0)
  const ppn = Math.round(dpp * persen) / 100
  const total = dpp + ppn

  return {
    subtotal: bulat2(subtotal),
    diskon: bulat2(diskon),
    dpp: bulat2(dpp),
    ppn: bulat2(ppn),
    total: bulat2(total),
    terbilang: terbilangRupiah(total),
  }
}

/** Dua desimal, tanpa galat pembulatan biner yang menghasilkan 0.30000000000000004. */
function bulat2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type VerdictPenawaran = { ok: true } | { ok: false; galat: string }

/**
 * Boleh-tidaknya sebuah penawaran DIKIRIM (draft → terkirim).
 *
 * Yang diperiksa hanya hal-hal yang membuat suratnya tak bisa dipakai — bukan
 * selera. Penawaran yang salah harga tetap boleh dikirim; itu keputusan
 * bisnis. Yang ditahan adalah surat yang secara dokumen memang cacat.
 */
export function periksaKirimPenawaran(m: {
  nomor?: string | null
  berlaku_sampai?: string | null
  tanggal?: string | null
  baris: readonly BarisPenawaran[]
}): VerdictPenawaran {
  if (!m.nomor?.trim()) {
    return {
      ok: false,
      galat: 'Nomor surat wajib diisi — surat penawaran tanpa nomor tak bisa '
        + 'dirujuk di korespondensi berikutnya, dan itulah yang dicari saat '
        + 'penawarannya dipersoalkan.',
    }
  }

  const isi = m.baris.filter((b) => b.uraian?.trim())
  if (isi.length === 0) {
    return {
      ok: false,
      galat: 'Penawaran tanpa satu pun baris rincian hanya memuat angka total. '
        + 'Yang membacanya tak bisa menilai apa yang termasuk — dan yang tak '
        + 'tertulis akan jadi klaim tambah di tengah pekerjaan.',
    }
  }

  if (m.berlaku_sampai && m.tanggal && m.berlaku_sampai < m.tanggal) {
    return {
      ok: false,
      galat: 'Masa berlaku berakhir sebelum tanggal suratnya sendiri.',
    }
  }

  if (!m.berlaku_sampai) {
    return {
      ok: false,
      galat: 'Masa berlaku wajib diisi. Penawaran tanpa batas waktu mengikat '
        + 'harga hari ini untuk pekerjaan tahun depan — dan kenaikan harga '
        + 'material di antaranya ditanggung sendiri.',
    }
  }

  return { ok: true }
}
