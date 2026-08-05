// Neraca & Laba-Rugi (INTI #1) — fungsi murni di atas saldo per akun.
//
// ── Kenapa fungsi murni terpisah, bukan di dalam handler
//
// Ini rumus finansial: Ember [C] (CLAUDE.md §5.3) — struktur perhitungannya
// tak boleh bisa diubah dari UI. Memisahkannya jadi fungsi murni membuatnya
// BISA DIUJI tanpa database, dan test itu yang menjadi penjaganya.
//
// ── Dua laporan, satu sumber
//
// Neraca dan laba-rugi dihitung dari daftar saldo yang SAMA. Itu bukan
// penghematan kode — itu yang membuat keduanya tak mungkin menyimpang.
// Laba berjalan di neraca HARUS sama dengan laba bersih di laba-rugi; kalau
// dihitung dari dua jalur berbeda, suatu hari ia tidak sama, dan tak ada
// yang tahu mana yang benar.

/** Satu baris saldo akun, keluaran `/api/v1/gl/trial-balance`. */
export interface SaldoAkun {
  account_id: string
  code: string
  name: string
  /** 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' */
  type: string
  debit: number
  credit: number
  /** Saldo bertanda menurut arah normal tipe akun. */
  saldo: number
}

export interface KelompokLaporan {
  label: string
  akun: Array<{ account_id: string; code: string; name: string; saldo: number }>
  total: number
}

export interface Neraca {
  aset: KelompokLaporan
  liabilitas: KelompokLaporan
  ekuitas: KelompokLaporan
  /** Laba berjalan periode ini — pendapatan dikurangi beban. */
  labaBerjalan: number
  /** Ekuitas + laba berjalan. Ini yang harus sama dengan aset. */
  totalEkuitasDenganLaba: number
  /** aset − (liabilitas + ekuitas + laba). HARUS nol. */
  selisih: number
  seimbang: boolean
}

export interface LabaRugi {
  pendapatan: KelompokLaporan
  beban: KelompokLaporan
  labaKotor: number
  labaBersih: number
  /** Margin bersih dalam persen; null bila belum ada pendapatan. */
  marginPct: number | null
}

/** Membulatkan ke 2 desimal — nominal `numeric` di DB, bukan float. */
const bulat = (n: number) => Math.round(n * 100) / 100

function kelompok(label: string, baris: SaldoAkun[]): KelompokLaporan {
  const akun = baris
    // Akun bersaldo nol tidak ditampilkan. Neraca dengan 200 baris nol
    // membuat yang berisi tenggelam — dan pembaca berhenti membacanya.
    .filter((b) => b.saldo !== 0)
    .map((b) => ({ account_id: b.account_id, code: b.code, name: b.name, saldo: bulat(b.saldo) }))
    .sort((a, b) => a.code.localeCompare(b.code))
  return { label, akun, total: bulat(akun.reduce((s, a) => s + a.saldo, 0)) }
}

/**
 * Laba-rugi: pendapatan − beban.
 *
 * `labaKotor` di sini adalah pendapatan dikurangi beban ber-kode 5xxx (harga
 * pokok). Kode akun mengikuti bagan akun kontraktor di migrasi 170: 4xxx
 * pendapatan, 5xxx harga pokok, 6xxx beban operasional.
 *
 * Kalau bagan akun suatu tenant tak mengikuti pola itu, `labaKotor` akan
 * sama dengan `labaBersih` — bukan salah, hanya tak memisahkan. Itu lebih
 * jujur daripada menebak mana yang harga pokok.
 */
export function hitungLabaRugi(saldo: SaldoAkun[]): LabaRugi {
  const pendapatan = kelompok('Pendapatan', saldo.filter((s) => s.type === 'revenue'))
  const semuaBeban = saldo.filter((s) => s.type === 'expense')
  const beban = kelompok('Beban', semuaBeban)

  const hargaPokok = bulat(
    semuaBeban.filter((s) => s.code.startsWith('5')).reduce((t, s) => t + s.saldo, 0),
  )

  const labaKotor = bulat(pendapatan.total - hargaPokok)
  const labaBersih = bulat(pendapatan.total - beban.total)

  return {
    pendapatan,
    beban,
    labaKotor,
    labaBersih,
    marginPct: pendapatan.total > 0
      ? Math.round((labaBersih / pendapatan.total) * 1000) / 10
      : null,
  }
}

/**
 * Neraca: aset = liabilitas + ekuitas + laba berjalan.
 *
 * `labaBerjalan` diambil dari `hitungLabaRugi` — bukan dihitung ulang di
 * sini. Itu yang membuat kedua laporan tak mungkin menyimpang.
 */
export function hitungNeraca(saldo: SaldoAkun[]): Neraca {
  const aset = kelompok('Aset', saldo.filter((s) => s.type === 'asset'))
  const liabilitas = kelompok('Liabilitas', saldo.filter((s) => s.type === 'liability'))
  const ekuitas = kelompok('Ekuitas', saldo.filter((s) => s.type === 'equity'))

  const { labaBersih } = hitungLabaRugi(saldo)
  const totalEkuitasDenganLaba = bulat(ekuitas.total + labaBersih)
  const selisih = bulat(aset.total - (liabilitas.total + totalEkuitasDenganLaba))

  return {
    aset,
    liabilitas,
    ekuitas,
    labaBerjalan: labaBersih,
    totalEkuitasDenganLaba,
    selisih,
    // Toleransi 0,01 untuk pembulatan sen. BUKAN untuk menyembunyikan
    // ketidakseimbangan: selisih yang lebih besar dari itu berarti ada
    // jurnal tak seimbang, dan `selisih` tetap dipulangkan apa adanya
    // supaya bisa ditampilkan, bukan disamarkan.
    seimbang: Math.abs(selisih) < 0.01,
  }
}
