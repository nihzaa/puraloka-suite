/**
 * Test logika penjadwalan.
 *
 * Seluruhnya deterministik — `now` dioper, tak ada `Date.now()`, tak ada
 * menunggu, tak ada DB. Itulah alasan logikanya dipisah dari pemicunya.
 *
 * Yang diuji bukan "apakah tanggal bekerja", melainkan keputusan yang membuat
 * penjadwal ini berbeda dari `setInterval` naif:
 *
 *   • cron yang TELAT tetap mengejar (bukan melewatkan diam-diam)
 *   • satu periode dijalankan TEPAT sekali
 *   • tanggal 31 tidak hilang di bulan 30 hari
 *   • bentuk jam tak sah menolak jalan, bukan memicu di jam sembarang
 */
import { describe, it, expect } from 'vitest'
import { harusJalan, awalPeriode, menitDariJam, type Jadwal } from '../jadwal.js'

/** Waktu lokal — penjadwal ini memang bekerja di zona waktu server. */
const pada = (s: string) => new Date(s)

const harian = (o: Partial<Jadwal> = {}): Jadwal => ({
  jenis: 'harian', jam: '07:00', aktif: true, terakhir_jalan: null, ...o,
})

describe('menitDariJam', () => {
  it('mengurai jam yang sah', () => {
    expect(menitDariJam('00:00')).toBe(0)
    expect(menitDariJam('07:30')).toBe(450)
    expect(menitDariJam('23:59')).toBe(1439)
    expect(menitDariJam(' 7:05 ')).toBe(425)
  })

  it('menolak yang tak sah dengan -1', () => {
    for (const buruk of ['', '7', '24:00', '07:60', 'pagi', '07-00', '-1:00']) {
      expect(menitDariJam(buruk)).toBe(-1)
    }
  })
})

describe('harian', () => {
  it('belum jam-nya TAPI kemarin sudah jalan → tunggu', () => {
    const k = harusJalan(
      harian({ jam: '07:00', terakhir_jalan: pada('2026-08-09T07:00:00') }),
      pada('2026-08-10T06:59:00'),
    )
    expect(k.jalan).toBe(false)
    expect(k.alasan).toBe('sudah-jalan-periode-ini')
  })

  it('jadwal BARU (belum pernah jalan) langsung mengejar periode berjalan', () => {
    // Sempat saya tulis test yang mengharapkan `false` di sini. Itu SALAH, dan
    // perilaku kodenya yang benar: pukul 06:59 periode berjalan adalah "kemarin
    // pukul 07:00", dan jadwal yang baru dibuat belum pernah menjalankannya.
    //
    // Kalau ia menunggu, jadwal yang dibuat pukul 08:00 hari ini tak akan
    // pernah jalan sampai besok — dan orang yang membuatnya akan mengira
    // penjadwalnya rusak.
    const k = harusJalan(harian({ jam: '07:00' }), pada('2026-08-10T06:59:00'))
    expect(k.jalan).toBe(true)
    expect(k.alasan).toBe('jatuh-tempo')
  })

  it('tepat jam-nya, belum pernah jalan → jalan', () => {
    expect(harusJalan(harian(), pada('2026-08-10T07:00:00')).jalan).toBe(true)
  })

  it('sudah jalan hari ini → tidak diulang', () => {
    const k = harusJalan(
      harian({ terakhir_jalan: pada('2026-08-10T07:00:05') }),
      pada('2026-08-10T07:15:00'),
    )
    expect(k.jalan).toBe(false)
    expect(k.alasan).toBe('sudah-jalan-periode-ini')
  })

  it('CRON TELAT 3 JAM tetap mengejar', () => {
    // Inti aturan "sudah lewat DAN belum jalan". Pencocokan jam-persis akan
    // melewatkan ini diam-diam.
    const k = harusJalan(
      harian({ jam: '07:00', terakhir_jalan: pada('2026-08-09T07:00:00') }),
      pada('2026-08-10T10:00:00'),
    )
    expect(k.jalan).toBe(true)
  })

  it('SERVER MATI SEMALAM tetap mengejar begitu hidup', () => {
    const k = harusJalan(
      harian({ jam: '07:00', terakhir_jalan: pada('2026-08-08T07:00:00') }),
      pada('2026-08-10T09:30:00'),
    )
    expect(k.jalan).toBe(true)
  })

  it('dipanggil berkali-kali dalam satu periode → jalan TEPAT sekali', () => {
    let jadwal = harian({ jam: '07:00', terakhir_jalan: pada('2026-08-09T07:00:00') })
    let berjalan = 0
    for (const menit of ['07:00', '07:15', '07:30', '12:00', '23:59']) {
      const now = pada(`2026-08-10T${menit}:00`)
      if (harusJalan(jadwal, now).jalan) {
        berjalan++
        jadwal = { ...jadwal, terakhir_jalan: now }
      }
    }
    expect(berjalan).toBe(1)
  })
})

describe('mingguan', () => {
  const mingguan = (o: Partial<Jadwal> = {}): Jadwal => ({
    jenis: 'mingguan', jam: '08:00', hari_pekan: 1, aktif: true,
    terakhir_jalan: null, ...o,
  })

  it('pada hari yang ditentukan → jalan', () => {
    // 2026-08-10 adalah Senin.
    expect(pada('2026-08-10T08:00:00').getDay()).toBe(1)
    expect(harusJalan(mingguan(), pada('2026-08-10T08:00:00')).jalan).toBe(true)
  })

  it('sudah jalan Senin ini → tak diulang Rabu', () => {
    const k = harusJalan(
      mingguan({ terakhir_jalan: pada('2026-08-10T08:00:00') }),
      pada('2026-08-12T09:00:00'),
    )
    expect(k.jalan).toBe(false)
    expect(k.alasan).toBe('sudah-jalan-periode-ini')
  })

  it('pekan berikutnya → jalan lagi', () => {
    const k = harusJalan(
      mingguan({ terakhir_jalan: pada('2026-08-10T08:00:00') }),
      pada('2026-08-17T08:00:00'),
    )
    expect(k.jalan).toBe(true)
  })

  it('terlewat sepekan penuh → tetap mengejar', () => {
    const k = harusJalan(
      mingguan({ terakhir_jalan: pada('2026-08-03T08:00:00') }),
      pada('2026-08-19T10:00:00'),
    )
    expect(k.jalan).toBe(true)
  })
})

describe('bulanan', () => {
  const bulanan = (o: Partial<Jadwal> = {}): Jadwal => ({
    jenis: 'bulanan', jam: '06:00', hari_bulan: 1, aktif: true,
    terakhir_jalan: null, ...o,
  })

  it('tanggal 1 → jalan', () => {
    expect(harusJalan(bulanan(), pada('2026-09-01T06:00:00')).jalan).toBe(true)
  })

  it('sudah jalan bulan ini → tak diulang', () => {
    const k = harusJalan(
      bulanan({ terakhir_jalan: pada('2026-09-01T06:00:00') }),
      pada('2026-09-20T06:00:00'),
    )
    expect(k.jalan).toBe(false)
  })

  it('TANGGAL 31 di bulan 30 hari jatuh ke hari terakhir', () => {
    // November hanya 30 hari. Tanpa penanganan ini, jadwal akhir bulan HILANG
    // di lima dari dua belas bulan — dan tak seorang pun mengira sebabnya
    // adalah tanggalnya.
    const j = bulanan({ hari_bulan: 31 })
    const batas = awalPeriode(j, pada('2026-11-30T23:00:00'))
    expect(batas.getMonth()).toBe(10)   // November
    expect(batas.getDate()).toBe(30)    // hari terakhirnya
    expect(harusJalan(j, pada('2026-11-30T06:30:00')).jalan).toBe(true)
  })

  it('TANGGAL 31 di Februari jatuh ke 28/29', () => {
    const j = bulanan({ hari_bulan: 31 })
    // 2028 kabisat → 29 Februari.
    expect(awalPeriode(j, pada('2028-02-29T12:00:00')).getDate()).toBe(29)
    // 2026 bukan kabisat → 28 Februari.
    expect(awalPeriode(j, pada('2026-02-28T12:00:00')).getDate()).toBe(28)
  })

  it('lintas tahun: Januari melihat ke Desember tahun lalu', () => {
    const batas = awalPeriode(bulanan({ hari_bulan: 15 }), pada('2027-01-05T06:00:00'))
    expect(batas.getFullYear()).toBe(2026)
    expect(batas.getMonth()).toBe(11)
  })
})

describe('menolak jalan', () => {
  it('nonaktif → tidak pernah jalan', () => {
    const k = harusJalan(harian({ aktif: false }), pada('2026-08-10T07:00:00'))
    expect(k.jalan).toBe(false)
    expect(k.alasan).toBe('nonaktif')
  })

  it('jam tak sah → DIAM, bukan memicu di jam sembarang', () => {
    for (const buruk of ['25:00', 'pagi', '']) {
      const k = harusJalan(harian({ jam: buruk }), pada('2026-08-10T07:00:00'))
      expect(k.jalan).toBe(false)
      expect(k.alasan).toBe('jam-tak-sah')
    }
  })
})
