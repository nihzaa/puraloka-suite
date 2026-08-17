/**
 * IMPOR MUTASI BANK — berkas rekening koran menjadi baris rekonsiliasi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PARSER, BUKAN SAMBUNGAN API BANK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog menandai `sy-api` "sebagian" karena sambungan keluar ke bank belum
 * ada. Sambungan itu nyata mungkin — tapi menuntut perjanjian tertulis dengan
 * bank, biaya bulanan, dan proses yang berbulan-bulan.
 *
 * Sementara itu tiap internet banking di Indonesia bisa mengunduh mutasi
 * sebagai CSV atau Excel. Yang memisahkan pemakai dari rekonsiliasi bukan
 * ketiadaan API, melainkan ketiadaan pengurai — dan pengurai tak menuntut
 * izin siapa pun.
 *
 * ── Kenapa DEBIT/KREDIT tak bisa ditebak dari satu kolom nominal
 *
 * Format bank berbeda-beda, dan ini yang paling sering salah:
 *
 *     BCA      dua kolom terpisah (Mutasi + tanda DB/CR)
 *     Mandiri  dua kolom: Debit, Kredit
 *     BNI      satu kolom bertanda minus untuk keluar
 *
 * Menebak arah uang dari satu angka berarti salah tanda pada seluruh berkas —
 * dan rekonsiliasi yang arahnya terbalik menghasilkan selisih dua kali lipat
 * nominalnya, yang lalu "diperbaiki" dengan penyesuaian karangan.
 *
 * Karena itu tiga bentuk itu dikenali EKSPLISIT, dan yang tak dikenali
 * ditolak dengan menyebut barisnya — bukan diasumsikan masuk.
 *
 * ── Kenapa fungsi MURNI
 *
 * Yang menentukan benar-salahnya adalah PENAFSIRAN kolom, bukan I/O-nya.
 * Sebagai fungsi murni tiap format bank bisa dikunci test tanpa berkas
 * sungguhan — dan berkas bank asli memuat nomor rekening nasabah, yang tak
 * boleh masuk repo.
 */

export interface BarisMutasi {
  tanggal: string
  keterangan: string
  debit: number
  kredit: number
  saldo: number | null
  ref_bank: string | null
}

export interface HasilImporMutasi {
  baris: BarisMutasi[]
  ditolak: Array<{ nomor: number; sebab: string }>
  /** Kolom yang BERHASIL dikenali — dilaporkan supaya salah-tafsir terlihat. */
  pemetaan: Record<string, string>
}

/** Judul kolom yang lazim, per makna. Dinormalkan sebelum dicocokkan. */
const ALIAS: Record<string, string[]> = {
  tanggal: ['tanggal', 'date', 'tgl', 'tanggal transaksi', 'posting date', 'trx date'],
  keterangan: ['keterangan', 'description', 'uraian', 'berita', 'remark', 'transaction remark', 'catatan'],
  debit: ['debit', 'debet', 'keluar', 'pengeluaran', 'withdrawal', 'dr'],
  kredit: ['kredit', 'credit', 'masuk', 'penerimaan', 'deposit', 'cr'],
  nominal: ['nominal', 'jumlah', 'amount', 'mutasi', 'nilai'],
  arah: ['dbcr', 'db/cr', 'tanda', 'jenis', 'type', 'd/k'],
  saldo: ['saldo', 'balance', 'saldo akhir', 'running balance'],
  ref: ['ref', 'referensi', 'reference', 'no ref', 'no. referensi', 'trace'],
}

export function normalkan(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9\s/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Angka bergaya Indonesia MAUPUN Inggris.
 *
 * `1.234.567,89` dan `1,234,567.89` sama-sama lazim di berkas bank — dan
 * menafsirkan yang pertama sebagai desimal Inggris menghasilkan 1,23 alih-alih
 * 1.234.567. Selisih sejuta rupiah dari satu tanda baca.
 *
 * Aturannya: pemisah TERAKHIR yang diikuti tepat 1-2 digit adalah desimal.
 */
export function angkaBank(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null

  let s = String(v).trim()
  if (s === '' || s === '-') return null

  // Tanda kurung = negatif, lazim di ekspor akuntansi: (1.500) → -1500
  let negatif = false
  if (/^\(.*\)$/.test(s)) { negatif = true; s = s.slice(1, -1) }

  s = s.replace(/[^\d.,-]/g, '')
  if (s.startsWith('-')) { negatif = true; s = s.slice(1) }

  const titikAkhir = s.lastIndexOf('.')
  const komaAkhir = s.lastIndexOf(',')
  const pemisah = Math.max(titikAkhir, komaAkhir)

  if (pemisah >= 0) {
    const sesudah = s.length - pemisah - 1
    if (sesudah >= 1 && sesudah <= 2) {
      // Yang terakhir desimal; sisanya pemisah ribuan.
      s = s.slice(0, pemisah).replace(/[.,]/g, '') + '.' + s.slice(pemisah + 1)
    } else {
      s = s.replace(/[.,]/g, '')
    }
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negatif ? -n : n
}

/**
 * Tanggal bergaya Indonesia maupun ISO → `YYYY-MM-DD`.
 *
 * `03/04/2026` AMBIGU: 3 April atau 4 Maret? Di Indonesia hampir selalu
 * hari-dulu, dan itu yang dipakai — tapi hanya bila angka pertamanya > 12
 * tak mungkin bulan, atau formatnya memang DD/MM. Yang tak bisa dipastikan
 * TIDAK ditebak.
 */
export function tanggalBank(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s)
  if (dmy) {
    const d = Number(dmy[1]); const m = Number(dmy[2])
    let y = Number(dmy[3])
    if (y < 100) y += 2000
    // Bulan > 12 mustahil — berarti urutannya MM/DD, dan itu ditolak alih-alih
    // ditukar diam-diam: menukar berarti menebak asal berkasnya.
    if (m > 12 || d > 31 || d < 1 || m < 1) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

/** Mencari kolom berkas yang cocok dengan makna tertentu. */
function cariKolom(judul: string[], makna: string): string | null {
  const alias = ALIAS[makna] ?? []
  for (const j of judul) {
    const n = normalkan(j)
    if (alias.includes(n)) return j
  }
  // Cocok sebagian: "tanggal transaksi" mengandung "tanggal".
  for (const j of judul) {
    const n = normalkan(j)
    if (alias.some((a) => n.includes(a))) return j
  }
  return null
}

/**
 * Mengubah baris berkas bank menjadi baris rekonsiliasi.
 *
 * Baris yang tak bisa ditafsirkan DITOLAK beserta sebabnya — tidak dilewati
 * diam-diam. Satu baris yang hilang dari rekonsiliasi menghasilkan selisih
 * yang lalu ditutup dengan penyesuaian karangan, dan penyesuaian itulah yang
 * membuat buku tak lagi bisa dipercaya.
 */
export function uraikanMutasi(
  baris: Array<Record<string, unknown>>,
): HasilImporMutasi {
  const ditolak: HasilImporMutasi['ditolak'] = []
  const hasil: BarisMutasi[] = []

  if (baris.length === 0) return { baris: [], ditolak: [], pemetaan: {} }

  const judul = Object.keys(baris[0])
  const kTanggal = cariKolom(judul, 'tanggal')
  const kKeterangan = cariKolom(judul, 'keterangan')
  const kNominal = cariKolom(judul, 'nominal')
  const kSaldo = cariKolom(judul, 'saldo')
  const kRef = cariKolom(judul, 'ref')

  // ⚠ `arah` DICARI LEBIH DULU, dan kolomnya lalu DIKUNCI dari makna lain.
  //
  // Ditemukan lewat test, bukan lewat membaca kode: judul `DB/CR` (format
  // BCA) dinormalkan jadi `db/cr`, dan pencocokan-sebagian melihat "cr" di
  // dalamnya lalu mengklaimnya sebagai kolom KREDIT.
  //
  // Akibatnya bukan galat: pengurai masuk ke cabang "dua kolom", membaca
  // "CR" sebagai nominal, mendapat nol, lalu menolak SELURUH berkas dengan
  // "debit dan kredit sama-sama kosong" — pesan yang menuduh berkasnya,
  // padahal pemetaannya yang salah.
  const kArah = cariKolom(judul, 'arah')
  const sisa = judul.filter((j) => j !== kArah)

  const kDebit = cariKolom(sisa, 'debit')
  const kKredit = cariKolom(sisa, 'kredit')

  const pemetaan: Record<string, string> = {}
  for (const [makna, kol] of [['tanggal', kTanggal], ['keterangan', kKeterangan],
    ['debit', kDebit], ['kredit', kKredit], ['nominal', kNominal],
    ['arah', kArah], ['saldo', kSaldo], ['ref', kRef]] as const) {
    if (kol) pemetaan[makna] = kol
  }

  if (!kTanggal) {
    return {
      baris: [],
      ditolak: [{ nomor: 0, sebab: 'Kolom TANGGAL tak ditemukan di berkas ini' }],
      pemetaan,
    }
  }
  // Tanpa salah satu bentuk nominal, tak ada uang yang bisa dibaca.
  if (!kDebit && !kKredit && !kNominal) {
    return {
      baris: [],
      ditolak: [{
        nomor: 0,
        sebab: 'Kolom nominal tak ditemukan — berkas harus punya kolom Debit/Kredit, '
          + 'atau satu kolom Nominal beserta penanda arahnya',
      }],
      pemetaan,
    }
  }

  baris.forEach((b, i) => {
    const nomor = i + 2 // +2: baris 1 judul, dan orang menghitung dari 1

    const tgl = tanggalBank(b[kTanggal])
    if (!tgl) {
      const isi = String(b[kTanggal] ?? '').trim()
      // Baris kosong di ujung berkas lazim — dilewati TANPA jadi galat,
      // supaya daftar tolakan tak penuh oleh baris yang memang bukan data.
      if (isi === '') return
      ditolak.push({ nomor, sebab: `tanggal "${isi}" tak terbaca (pakai DD/MM/YYYY atau YYYY-MM-DD)` })
      return
    }

    let debit = 0
    let kredit = 0

    if (kDebit || kKredit) {
      // Bentuk DUA KOLOM — paling tak ambigu.
      debit = Math.abs(angkaBank(kDebit ? b[kDebit] : null) ?? 0)
      kredit = Math.abs(angkaBank(kKredit ? b[kKredit] : null) ?? 0)
    } else {
      const n = angkaBank(b[kNominal!])
      if (n === null) {
        ditolak.push({ nomor, sebab: 'nominal tak terbaca' })
        return
      }
      if (kArah) {
        // Bentuk NOMINAL + TANDA (BCA: DB/CR).
        const a = normalkan(String(b[kArah] ?? ''))
        if (['db', 'd', 'debit', 'debet', 'keluar'].includes(a)) debit = Math.abs(n)
        else if (['cr', 'k', 'c', 'kredit', 'credit', 'masuk'].includes(a)) kredit = Math.abs(n)
        else {
          // Arah yang tak dikenali TIDAK ditebak — salah tanda membuat
          // selisih rekonsiliasi dua kali lipat nominalnya.
          ditolak.push({ nomor, sebab: `penanda arah "${b[kArah]}" tak dikenali (harap DB/CR)` })
          return
        }
      } else {
        // Bentuk SATU KOLOM BERTANDA: negatif = uang keluar.
        if (n < 0) debit = Math.abs(n)
        else kredit = n
      }
    }

    if (debit === 0 && kredit === 0) {
      ditolak.push({ nomor, sebab: 'debit dan kredit sama-sama kosong' })
      return
    }
    if (debit > 0 && kredit > 0) {
      // Dua-duanya terisi berarti kolomnya salah tafsir — dan menjumlahkan
      // keduanya akan menyamarkan itu.
      ditolak.push({ nomor, sebab: 'debit DAN kredit sama-sama terisi — periksa pemetaan kolom' })
      return
    }

    hasil.push({
      tanggal: tgl,
      keterangan: String(b[kKeterangan ?? ''] ?? '').trim() || '(tanpa keterangan)',
      debit,
      kredit,
      saldo: kSaldo ? angkaBank(b[kSaldo]) : null,
      ref_bank: kRef ? (String(b[kRef] ?? '').trim() || null) : null,
    })
  })

  return { baris: hasil, ditolak, pemetaan }
}
