/**
 * PENYUSUTAN → JURNAL (A2).
 *
 * ── Yang diukur 2026-08-12
 *
 * `penyusutan_alat` berisi 12 baris dengan `journal_entry_id` NULL SELURUHNYA.
 * Kolomnya ada sejak lama; jalur yang mengisinya tak pernah dibangun.
 *
 * Akibatnya beban penyusutan tak pernah masuk laba-rugi, dan nilai buku aset
 * di neraca lebih tinggi daripada kenyataannya — dua laporan yang paling
 * sering ditanyakan calon pelanggan, dua-duanya salah, tanpa satu pun galat.
 *
 * ── Kenapa fungsi MURNI, bukan langsung menulis
 *
 * Yang menentukan benar-salahnya jurnal penyusutan adalah bentuk barisnya:
 * debit beban, kredit akumulasi, jumlah sama besar. Itu bisa — dan harus —
 * diuji tanpa basis.
 *
 * Penulisannya sendiri ada di rutenya, di mana ia bisa memakai transaksi dan
 * memeriksa hasil setiap langkah.
 */

/** Kode akun. Ditulis sebagai konstanta supaya salah ketik jadi galat kompilasi. */
export const AKUN_BEBAN_PENYUSUTAN = '5960'
export const AKUN_AKUMULASI_PENYUSUTAN = '1511'

export interface BarisPenyusutan {
  id: string
  periode: string
  nilai: number | string
  /** Nama alat, untuk keterangan jurnal yang bisa dibaca manusia. */
  namaAlat?: string | null
}

export interface BarisJurnal {
  account_code: string
  debit: number
  credit: number
  description: string
}

export type HasilSusun =
  | { ok: true; entryDate: string; description: string; lines: BarisJurnal[]; total: number }
  | { ok: false; sebab: string }

/** Membulatkan ke 2 desimal — nominal `numeric` di DB, bukan float. */
const bulat = (n: number) => Math.round(n * 100) / 100

/**
 * Susun SATU jurnal untuk sekumpulan baris penyusutan pada periode yang sama.
 *
 * ── Kenapa satu jurnal untuk banyak alat, bukan satu jurnal per alat
 *
 * Penyusutan bulanan sepuluh alat menghasilkan sepuluh jurnal yang tanggal,
 * keterangan, dan pasangan akunnya identik — buku besar jadi penuh baris yang
 * tak membawa informasi tambahan.
 *
 * Yang tetap terbaca per-alat: `description` tiap baris menyebut namanya, dan
 * `penyusutan_alat.journal_entry_id` menunjuk balik ke jurnalnya.
 *
 * ── Kenapa periode dicek, bukan diandaikan
 *
 * Mencampur periode dalam satu jurnal membuat beban bulan Mei tercatat
 * bertanggal Juni. Angka totalnya tetap benar sepanjang tahun, jadi tak ada
 * yang menemukannya sampai seseorang membandingkan laba per bulan.
 */
export function susunJurnalPenyusutan(baris: BarisPenyusutan[]): HasilSusun {
  if (baris.length === 0) return { ok: false, sebab: 'Tak ada baris penyusutan yang dipilih' }

  const periode = new Set(baris.map(b => String(b.periode).slice(0, 10)))
  if (periode.size > 1) {
    return {
      ok: false,
      sebab: `Baris yang dipilih mencakup ${periode.size} periode berbeda. `
        + 'Jurnalkan satu periode dalam satu kali — beban bulan lalu tak boleh bertanggal bulan ini.',
    }
  }

  const lines: BarisJurnal[] = []
  let total = 0
  for (const b of baris) {
    // `Number('')` bernilai 0, bukan NaN — kelas cacat yang berulang di repo
    // ini. Jadi kosong ditolak SEBELUM konversi, bukan sesudah.
    if (b.nilai === null || b.nilai === undefined || b.nilai === '') {
      return { ok: false, sebab: 'Ada baris penyusutan tanpa nilai' }
    }
    const n = Number(b.nilai)
    if (!Number.isFinite(n)) return { ok: false, sebab: `Nilai penyusutan tak terbaca: ${String(b.nilai)}` }
    if (n <= 0) {
      // Nol tak dijurnalkan: jurnal bernilai nol lolos pemeriksaan seimbang
      // (0 = 0) dan menambah baris yang tak berarti apa-apa di buku besar.
      // Negatif berarti ada koreksi yang harus ditempuh lewat jurnal
      // penyesuaian tersendiri, bukan diselipkan ke sini.
      return { ok: false, sebab: `Nilai penyusutan harus lebih dari nol (ditemukan ${n})` }
    }
    total = bulat(total + n)
    lines.push({
      account_code: AKUN_BEBAN_PENYUSUTAN,
      debit: bulat(n),
      credit: 0,
      description: `Penyusutan ${b.namaAlat ?? 'alat'}`,
    })
  }

  // Sisi kredit DIRINGKAS jadi satu baris.
  //
  // Akumulasi penyusutan adalah satu akun; memecahnya per alat tak menambah
  // informasi apa pun di buku besar, sementara rinciannya sudah ada di sisi
  // debit dan di `penyusutan_alat` itu sendiri.
  lines.push({
    account_code: AKUN_AKUMULASI_PENYUSUTAN,
    debit: 0,
    credit: total,
    description: `Akumulasi penyusutan ${baris.length} alat`,
  })

  const tgl = [...periode][0]
  return {
    ok: true,
    entryDate: tgl,
    description: `Penyusutan periode ${tgl} — ${baris.length} alat`,
    lines,
    total,
  }
}

/**
 * Apakah kedua sisi sama besar?
 *
 * Diperiksa DI SINI meski basis punya trigger `fn_gl_wajib_seimbang`.
 * Bukan duplikasi sia-sia: trigger menolak dengan galat Postgres yang tak
 * bisa ditindaklanjuti pengguna, dan penolakannya terjadi SESUDAH kepala
 * jurnal ditulis — meninggalkan jurnal kosong bila penanganannya lalai.
 */
export function seimbang(lines: BarisJurnal[]): boolean {
  const d = bulat(lines.reduce((a, l) => a + l.debit, 0))
  const k = bulat(lines.reduce((a, l) => a + l.credit, 0))
  return Math.abs(d - k) < 0.01
}
