import { describe, it, expect } from 'vitest'
import {
  formatRupiah,
  formatRupiahSingkat,
  formatAngka,
  formatPersen,
  formatVolume,
  formatTanggal,
  formatTanggalPanjang,
  formatTanggalJam,
  formatRelatif,
  formatMutasi,
} from './format'

/**
 * Kenapa berkas ini ada sebelum implementasinya:
 *
 * `lib/format.ts` menggantikan 127 pemanggilan `toLocaleString`/`Intl` yang
 * tersebar. Kalau perilakunya berubah sedikit saja (spasi, pembulatan, tanda
 * negatif), yang berubah adalah SETIAP nominal di seluruh aplikasi sekaligus.
 * Jadi perilakunya dikunci test lebih dulu, bukan sesudah.
 */

describe('formatRupiah', () => {
  it('memakai titik ribuan dan awalan Rp', () => {
    expect(formatRupiah(1250000000)).toBe('Rp 1.250.000.000')
  })

  /*
   * ICU mengeluarkan SPASI TAK-PUTUS (U+00A0), bukan spasi biasa. Kalau tak
   * dinormalkan, `"Rp 1.000" === formatRupiah(1000)` GAGAL dengan pesan yang
   * terlihat identik di layar — jenis kegagalan yang paling membuang waktu.
   */
  it('memakai spasi BIASA, bukan spasi tak-putus', () => {
    const hasil = formatRupiah(1000)
    expect(hasil).toBe('Rp 1.000')
    expect(hasil.includes(' ')).toBe(false)
  })

  it('membulatkan ke rupiah penuh — nominal tak pernah tampil desimal', () => {
    expect(formatRupiah(1000.4)).toBe('Rp 1.000')
    expect(formatRupiah(1000.6)).toBe('Rp 1.001')
  })

  it('menangani nol dan negatif', () => {
    expect(formatRupiah(0)).toBe('Rp 0')
    expect(formatRupiah(-1200000)).toBe('-Rp 1.200.000')
  })

  /*
   * Nominal datang dari API sebagai `numeric` Postgres — yang oleh driver
   * dikirim sebagai STRING supaya presisi tak hilang. Kalau helper ini hanya
   * menerima number, tiap pemanggil akan menulis `Number(...)` sendiri dan
   * sebagian akan lupa.
   */
  it('menerima string numerik dari API', () => {
    expect(formatRupiah('1250000')).toBe('Rp 1.250.000')
    expect(formatRupiah('1250000.75')).toBe('Rp 1.250.001')
  })

  it('nilai kosong jadi tanda pisah, bukan "NaN" atau "Rp null"', () => {
    expect(formatRupiah(null)).toBe('—')
    expect(formatRupiah(undefined)).toBe('—')
    expect(formatRupiah('')).toBe('—')
    expect(formatRupiah('bukan angka')).toBe('—')
    expect(formatRupiah(NaN)).toBe('—')
  })
})

describe('formatRupiahSingkat', () => {
  /*
   * Skala Indonesia: rb / jt / M / T. Gambar referensi memakai skala India
   * ("Cr", "L") dan itu DILARANG — pembacanya kontraktor Indonesia.
   */
  it('memakai skala Indonesia rb/jt/M/T', () => {
    expect(formatRupiahSingkat(875000)).toBe('Rp 875 rb')
    expect(formatRupiahSingkat(1250000)).toBe('Rp 1,25 jt')
    expect(formatRupiahSingkat(1250000000)).toBe('Rp 1,25 M')
    expect(formatRupiahSingkat(2500000000000)).toBe('Rp 2,5 T')
  })

  it('tak pernah memakai skala India', () => {
    const contoh = [875000, 1250000, 1250000000, 2500000000000]
    for (const n of contoh) {
      const h = formatRupiahSingkat(n)
      expect(h).not.toMatch(/\bCr\b|\bL\b|lakh|crore/i)
    }
  })

  it('di bawah seribu tampil utuh', () => {
    expect(formatRupiahSingkat(999)).toBe('Rp 999')
    expect(formatRupiahSingkat(0)).toBe('Rp 0')
  })

  it('membuang desimal nol — "Rp 2 jt", bukan "Rp 2,00 jt"', () => {
    expect(formatRupiahSingkat(2000000)).toBe('Rp 2 jt')
  })

  it('negatif tetap terbaca', () => {
    expect(formatRupiahSingkat(-1250000)).toBe('-Rp 1,25 jt')
  })

  it('nilai kosong jadi tanda pisah', () => {
    expect(formatRupiahSingkat(null)).toBe('—')
  })
})

describe('formatAngka', () => {
  it('titik ribuan, koma desimal', () => {
    expect(formatAngka(1248)).toBe('1.248')
    expect(formatAngka(1248.5, 1)).toBe('1.248,5')
  })

  it('nilai kosong jadi tanda pisah', () => {
    expect(formatAngka(null)).toBe('—')
  })
})

describe('formatPersen', () => {
  /*
   * Sumbernya dua macam: pecahan (0,685) dan angka persen (68,5). Salah tebak
   * menghasilkan "0,7%" di tempat yang seharusnya "68,5%" — dan itu tak
   * terlihat seperti bug, hanya seperti angka yang salah.
   */
  it('menerima PECAHAN secara baku', () => {
    expect(formatPersen(0.685)).toBe('68,5%')
  })

  it('menerima angka persen langsung bila diberi tahu', () => {
    expect(formatPersen(68.5, { sudahPersen: true })).toBe('68,5%')
  })

  it('desimal bisa diatur', () => {
    expect(formatPersen(0.685, { desimal: 0 })).toBe('69%')
  })

  it('nilai kosong jadi tanda pisah', () => {
    expect(formatPersen(null)).toBe('—')
  })
})

describe('formatVolume', () => {
  it('angka + satuan', () => {
    expect(formatVolume(1248.5, 'm³')).toBe('1.248,5 m³')
  })

  it('tanpa satuan tetap jalan', () => {
    expect(formatVolume(1248.5)).toBe('1.248,5')
  })

  it('nilai kosong jadi tanda pisah', () => {
    expect(formatVolume(null, 'm³')).toBe('—')
  })
})

describe('tanggal', () => {
  const d = new Date('2026-05-20T03:45:00.000Z') // 10.45 WIB

  it('formatTanggal — 20 Mei 2026', () => {
    expect(formatTanggal(d)).toBe('20 Mei 2026')
  })

  it('formatTanggalPanjang menyertakan nama hari', () => {
    expect(formatTanggalPanjang(d)).toBe('Rabu, 20 Mei 2026')
  })

  /*
   * Zona WAJIB dipaku ke Asia/Jakarta. Tanpa itu, jam yang tampil ikut zona
   * MESIN — server UTC menampilkan jam yang berbeda dari yang dilihat pengguna
   * di lapangan, dan selisihnya tak pernah terlihat sebagai galat.
   */
  it('formatTanggalJam memakai WIB, bukan zona mesin', () => {
    expect(formatTanggalJam(d)).toBe('20 Mei 2026 · 10.45')
  })

  it('menerima string ISO dari API', () => {
    expect(formatTanggal('2026-05-20T03:45:00.000Z')).toBe('20 Mei 2026')
  })

  it('tanggal tak sah jadi tanda pisah, bukan "Invalid Date"', () => {
    expect(formatTanggal(null)).toBe('—')
    expect(formatTanggal('bukan tanggal')).toBe('—')
  })
})

describe('formatRelatif', () => {
  const acuan = new Date('2026-05-20T10:00:00.000Z')

  it('baru saja', () => {
    expect(formatRelatif(new Date('2026-05-20T09:59:30.000Z'), acuan)).toBe('baru saja')
  })

  it('menit & jam', () => {
    expect(formatRelatif(new Date('2026-05-20T09:45:00.000Z'), acuan)).toBe('15 menit lalu')
    expect(formatRelatif(new Date('2026-05-20T08:00:00.000Z'), acuan)).toBe('2 jam lalu')
  })

  it('kemarin', () => {
    expect(formatRelatif(new Date('2026-05-19T10:00:00.000Z'), acuan)).toBe('kemarin')
  })

  it('lebih dari seminggu jatuh ke tanggal penuh', () => {
    expect(formatRelatif(new Date('2026-05-01T10:00:00.000Z'), acuan)).toBe('1 Mei 2026')
  })

  it('nilai kosong jadi tanda pisah', () => {
    expect(formatRelatif(null, acuan)).toBe('—')
  })
})

describe('formatMutasi', () => {
  /*
   * Brief §5: negatif keuangan ditulis dalam kurung, bukan dengan tanda minus.
   * Ini konvensi akuntansi — minus mudah hilang saat dicetak atau difoto.
   */
  it('negatif dalam kurung, tanpa tanda minus', () => {
    expect(formatMutasi(-1200000)).toBe('(Rp 1.200.000)')
  })

  it('positif tanpa kurung', () => {
    expect(formatMutasi(1200000)).toBe('Rp 1.200.000')
  })

  it('nol tanpa kurung', () => {
    expect(formatMutasi(0)).toBe('Rp 0')
  })
})
