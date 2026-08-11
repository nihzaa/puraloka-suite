import { describe, it, expect } from 'vitest'
import {
  angka, pilihMarkup, periksaFraksi, hitungPenawaran, marginPersen,
  type PeriodeMarkup,
} from '../markup.js'

/**
 * Test pustaka markup.
 *
 * Yang diuji di sini bukan "fungsinya mengembalikan angka", melainkan
 * **fungsinya menolak menebak** — karena setiap tebakan di modul ini keluar
 * sebagai penawaran yang terlihat wajar.
 */

/**
 * `??` DILARANG untuk medan nilai di sini, dan itu bukan kerapian.
 *
 * Versi pertama menulis `o.keuntungan_fraksi ?? '0.0700'`. Akibatnya test
 * "baris yang keuntungannya KOSONG ditolak" mengirim `null`, lalu `??`
 * MENGGANTINYA dengan 0.07 — kasus yang hendak diuji tak pernah terjadi, dan
 * test-nya hijau sambil menguji hal lain.
 *
 * Yang dipakai: `in` pada objek, sehingga `null` yang ditulis sengaja tetap
 * sampai ke fungsi yang diuji.
 */
const P = (o: Partial<PeriodeMarkup> = {}): PeriodeMarkup => ({
  id: o.id ?? 'p1',
  jenis_pekerjaan: 'jenis_pekerjaan' in o ? o.jenis_pekerjaan! : null,
  berlaku_sejak: o.berlaku_sejak ?? '2026-01-01',
  overhead_fraksi: 'overhead_fraksi' in o ? o.overhead_fraksi! : '0.0300',
  keuntungan_fraksi: 'keuntungan_fraksi' in o ? o.keuntungan_fraksi! : '0.0700',
  kontinjensi_fraksi: 'kontinjensi_fraksi' in o ? o.kontinjensi_fraksi! : '0.0000',
})

describe('angka — Number("") === 0 adalah jebakannya', () => {
  it('string kosong jadi null, BUKAN nol persen', () => {
    // Kalau ini 0, kolom yang dikosongkan berubah jadi keputusan "markup nol"
    // dan perusahaan menawar pada harga pokok tanpa satu pun gejala.
    expect(angka('')).toBeNull()
    expect(angka('   ')).toBeNull()
  })

  it('numeric Postgres yang tiba sebagai string dibaca benar', () => {
    expect(angka('0.0750')).toBe(0.075)
  })

  it('null/undefined/NaN jadi null', () => {
    expect(angka(null)).toBeNull()
    expect(angka(undefined)).toBeNull()
    expect(angka('bukan angka')).toBeNull()
    expect(angka(Number.NaN)).toBeNull()
    expect(angka(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('nol SUNGGUHAN tetap nol — bedanya dengan kosong', () => {
    expect(angka('0')).toBe(0)
    expect(angka(0)).toBe(0)
  })
})

describe('pilihMarkup — tak ada yang berlaku berarti null', () => {
  it('daftar kosong → null, bukan markup nol', () => {
    expect(pilihMarkup([], '2026-08-12')).toBeNull()
  })

  it('semua periode di MASA DEPAN → null', () => {
    // Markup yang disiapkan untuk tahun depan tak boleh dipakai hari ini —
    // itulah gunanya menyiapkannya lebih awal.
    expect(pilihMarkup([P({ berlaku_sejak: '2027-01-01' })], '2026-08-12')).toBeNull()
  })

  it('tanggal acuan tak sah → null', () => {
    expect(pilihMarkup([P()], '12-08-2026')).toBeNull()
    expect(pilihMarkup([P()], '')).toBeNull()
  })

  it('periode bertanggal rusak DIABAIKAN, bukan dipakai', () => {
    expect(pilihMarkup([P({ berlaku_sejak: 'kemarin' })], '2026-08-12')).toBeNull()
  })

  it('baris yang overhead-nya KOSONG tidak dipakai dan tidak dianggap nol', () => {
    const r = pilihMarkup([P({ overhead_fraksi: '' })], '2026-08-12')
    expect(r).toBeNull()
  })

  it('baris yang keuntungannya KOSONG juga ditolak', () => {
    expect(pilihMarkup([P({ keuntungan_fraksi: null })], '2026-08-12')).toBeNull()
  })
})

describe('pilihMarkup — yang berlaku dipilih benar', () => {
  it('memakai periode terbaru yang sudah berlaku', () => {
    const r = pilihMarkup([
      P({ id: 'lama', berlaku_sejak: '2025-01-01', keuntungan_fraksi: '0.05' }),
      P({ id: 'baru', berlaku_sejak: '2026-06-01', keuntungan_fraksi: '0.09' }),
      P({ id: 'depan', berlaku_sejak: '2027-01-01', keuntungan_fraksi: '0.20' }),
    ], '2026-08-12')
    expect(r?.periode_id).toBe('baru')
    expect(r?.keuntungan).toBe(0.09)
  })

  it('berlaku PERSIS pada tanggal mulainya', () => {
    // Batas inklusif. Kalau eksklusif, markup baru tak berlaku di hari
    // pertamanya dan penawaran hari itu memakai angka lama tanpa gejala.
    const r = pilihMarkup([P({ berlaku_sejak: '2026-08-12' })], '2026-08-12')
    expect(r).not.toBeNull()
  })

  it('buk = overhead + keuntungan, dan kontinjensi TIDAK ikut', () => {
    const r = pilihMarkup([P({
      overhead_fraksi: '0.04', keuntungan_fraksi: '0.06', kontinjensi_fraksi: '0.03',
    })], '2026-08-12')
    // `buk` diserahkan ke computeAhsp; kontinjensi ditambahkan terpisah supaya
    // cadangan risiko tak jadi dasar perhitungan keuntungan.
    expect(r?.buk).toBeCloseTo(0.10, 10)
    expect(r?.kontinjensi).toBe(0.03)
  })

  it('kontinjensi kosong jadi 0 — itu memang bawaan yang sah', () => {
    const r = pilihMarkup([P({ kontinjensi_fraksi: null })], '2026-08-12')
    expect(r?.kontinjensi).toBe(0)
  })
})

describe('pilihMarkup — spesifik menang atas umum', () => {
  const daftar = [
    P({ id: 'umum', jenis_pekerjaan: null, berlaku_sejak: '2026-07-01', keuntungan_fraksi: '0.10' }),
    P({ id: 'jalan', jenis_pekerjaan: 'jalan', berlaku_sejak: '2026-01-01', keuntungan_fraksi: '0.06' }),
  ]

  it('jenis yang cocok menang MESKI tanggalnya lebih lama', () => {
    // Kalau umum menang karena lebih baru, menambahkan satu baris umum akan
    // diam-diam mengubah penawaran seluruh jenis yang punya angkanya sendiri.
    const r = pilihMarkup(daftar, '2026-08-12', 'jalan')
    expect(r?.periode_id).toBe('jalan')
    expect(r?.dari_umum).toBe(false)
  })

  it('jenis tanpa baris sendiri jatuh ke umum, dan MENYATAKANNYA', () => {
    const r = pilihMarkup(daftar, '2026-08-12', 'gedung')
    expect(r?.periode_id).toBe('umum')
    // `dari_umum` dipakai layar untuk mengatakan angka ini bukan khusus —
    // tanpanya, estimator mengira ada yang menetapkannya untuk pekerjaannya.
    expect(r?.dari_umum).toBe(true)
  })

  it('tanpa jenis sama sekali memakai umum', () => {
    expect(pilihMarkup(daftar, '2026-08-12')?.periode_id).toBe('umum')
  })

  it('jenis berspasi disamakan dengan kosong', () => {
    expect(pilihMarkup(daftar, '2026-08-12', '   ')?.periode_id).toBe('umum')
  })

  it('dua baris SPESIFIK: yang terbaru menang', () => {
    const r = pilihMarkup([
      P({ id: 'j-lama', jenis_pekerjaan: 'jalan', berlaku_sejak: '2026-01-01' }),
      P({ id: 'j-baru', jenis_pekerjaan: 'jalan', berlaku_sejak: '2026-06-01' }),
    ], '2026-08-12', 'jalan')
    expect(r?.periode_id).toBe('j-baru')
  })

  it('hanya ada baris jenis LAIN → null, tidak meminjam angkanya', () => {
    const r = pilihMarkup(
      [P({ jenis_pekerjaan: 'jalan' })], '2026-08-12', 'gedung')
    expect(r).toBeNull()
  })
})

describe('periksaFraksi — menangkap 15 yang dimaksud 15%', () => {
  it('kosong ditolak dengan sebab', () => {
    expect(periksaFraksi('Keuntungan', '')).toMatch(/wajib diisi/)
    expect(periksaFraksi('Keuntungan', null)).toMatch(/wajib diisi/)
  })

  it('negatif ditolak', () => {
    expect(periksaFraksi('Overhead', '-0.05')).toMatch(/negatif/)
  })

  it('15 ditolak dan pesannya MENYEBUT 1500%', () => {
    // Ini kesalahan ketik yang paling mahal di modul ini: penawaran 15x lipat
    // yang terlihat sah, dan yang menemukan biasanya panitia lelang.
    const p = periksaFraksi('Keuntungan', '15')
    expect(p).toMatch(/1500%/)
    expect(p).toMatch(/0\.15/)
  })

  it('0 dan 1 diterima — batasnya inklusif', () => {
    expect(periksaFraksi('Overhead', '0')).toBeNull()
    expect(periksaFraksi('Overhead', '1')).toBeNull()
  })

  it('nilai wajar diterima', () => {
    expect(periksaFraksi('Keuntungan', '0.08')).toBeNull()
  })
})

describe('hitungPenawaran', () => {
  const m = pilihMarkup([P({
    overhead_fraksi: '0.03', keuntungan_fraksi: '0.07', kontinjensi_fraksi: '0.02',
  })], '2026-08-12')!

  it('komponen dihitung dari biaya pokok, semuanya SEJAJAR', () => {
    const h = hitungPenawaran(1_000_000, m)
    expect(h.overhead).toBe(30_000)
    expect(h.keuntungan).toBe(70_000)
    expect(h.kontinjensi).toBe(20_000)
    expect(h.nilai_penawaran).toBe(1_120_000)
  })

  it('kontinjensi TIDAK bertingkat di atas BUK', () => {
    // Kalau bertingkat, kontinjensinya 0.02 x 1.100.000 = 22.000 dan
    // perusahaan mengambil keuntungan dari cadangan risikonya sendiri.
    const h = hitungPenawaran(1_000_000, m)
    expect(h.kontinjensi).toBe(20_000)
    expect(h.kontinjensi).not.toBe(22_000)
  })

  it('biaya pokok nol menghasilkan penawaran nol, bukan NaN', () => {
    expect(hitungPenawaran(0, m).nilai_penawaran).toBe(0)
  })
})

describe('marginPersen — markup 10% BUKAN margin 10%', () => {
  it('markup 10% di atas biaya = margin 9,09%', () => {
    // Pembedaan yang rutin salah: yang memakai markup sebagai margin akan
    // selalu meleset KE ATAS saat menghitung laba tahunan.
    const m = marginPersen(1_100_000, 1_000_000)
    expect(m).toBeCloseTo(9.0909, 3)
    expect(m).not.toBeCloseTo(10, 3)
  })

  it('selisihnya melebar seiring markup membesar', () => {
    expect(marginPersen(1_500_000, 1_000_000)).toBeCloseTo(33.333, 2)
  })

  it('penawaran nol/negatif → null, bukan pembagian nol', () => {
    expect(marginPersen(0, 100)).toBeNull()
    expect(marginPersen(-5, 100)).toBeNull()
  })

  it('biaya negatif ditolak', () => {
    expect(marginPersen(100, -1)).toBeNull()
  })

  it('menawar DI BAWAH pokok menghasilkan margin negatif, bukan null', () => {
    // Rugi adalah keadaan nyata dan harus terlihat sebagai angka, bukan
    // disembunyikan jadi "tak bisa dihitung".
    expect(marginPersen(900_000, 1_000_000)).toBeCloseTo(-11.111, 2)
  })
})
