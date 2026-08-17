import { describe, it, expect } from 'vitest'
import {
  keMenit, hariMingguIso, hariTerakhirBulan, awalPeriode, geserHari,
  periksaJatuhTempo, pilihJatuhTempo,
  type JadwalKirim,
} from '../jadwal-laporan-jatuh-tempo.js'

// ═══════════════════════════════════════════════════════════════════════════
// JADWAL LAPORAN — MANA YANG JATUH TEMPO
//
// Seluruh berkas ini tentang WAKTU, dan tiap kesalahan waktu punya bentuk yang
// sama: hasilnya masuk akal, hanya salah hari atau salah jam. Tak ada yang
// melempar galat, dan yang menerimanya menyimpulkan sistemnya rusak.
//
// Empat jebakan yang diuji satu per satu:
//
//   1. `new Date('2026-08-16').getDay()` membaca string sebagai UTC lalu
//      memulangkan hari menurut zona MESIN. CI berzona UTC, penggunanya tidak.
//   2. `getDay()` memakai 0=Minggu; layar Indonesia memakai 1=Senin.
//   3. Tanggal 31 di bulan berhari 30 — dilompati berarti laporan bulanan
//      absen empat kali setahun tanpa jejak.
//   4. Jadwal yang TERLEWAT karena penjadwal mati: tetap dikirim, bukan
//      dilompati. Yang mencegah kirim ganda adalah `terakhir_dikirim`.
// ═══════════════════════════════════════════════════════════════════════════

const dasar: JadwalKirim = {
  id: 'j1', nama: 'Laporan mingguan proyek', jenis_laporan: 'progres',
  irama: 'mingguan', hari_ke: 5, jam: '07:00', aktif: true,
  terakhir_dikirim: null,
}

describe('keMenit', () => {
  it('membaca HH:MM dan HH:MM:SS', () => {
    expect(keMenit('07:00')).toBe(420)
    expect(keMenit('07:00:00')).toBe(420)
    expect(keMenit('23:59')).toBe(1439)
  })

  it('jam tak masuk akal dipulangkan null, bukan angka', () => {
    // `null` DITAHAN di pemeriksa (fail-closed). Angka sembarang akan
    // meloloskan pengiriman pada jam yang tak pernah disetel.
    expect(keMenit('25:00')).toBeNull()
    expect(keMenit('07:99')).toBeNull()
    expect(keMenit('pagi')).toBeNull()
    expect(keMenit('')).toBeNull()
  })
})

describe('hariMingguIso — 1=Senin, dan tanpa zona waktu mesin', () => {
  it('2026-08-16 adalah MINGGU = 7', () => {
    // `new Date('2026-08-16').getDay()` memulangkan 0 di UTC — dan 0 dibaca
    // sebagai "Minggu" di satu tempat, "belum diisi" di tempat lain.
    expect(hariMingguIso('2026-08-16')).toBe(7)
  })

  it('Senin sampai Sabtu berurutan', () => {
    expect(hariMingguIso('2026-08-17')).toBe(1)  // Senin
    expect(hariMingguIso('2026-08-18')).toBe(2)
    expect(hariMingguIso('2026-08-21')).toBe(5)  // Jumat
    expect(hariMingguIso('2026-08-22')).toBe(6)  // Sabtu
  })

  it('tahun kabisat: 2024-02-29 adalah Kamis', () => {
    expect(hariMingguIso('2024-02-29')).toBe(4)
  })

  it('tanggal tak sah dipulangkan null', () => {
    expect(hariMingguIso('2026-13-01')).toBeNull()
    expect(hariMingguIso('bukan tanggal')).toBeNull()
  })
})

describe('hariTerakhirBulan', () => {
  it('Februari kabisat 29, biasa 28', () => {
    expect(hariTerakhirBulan('2024-02-10')).toBe(29)
    expect(hariTerakhirBulan('2026-02-10')).toBe(28)
    expect(hariTerakhirBulan('2100-02-10')).toBe(28)  // abad bukan kabisat
    expect(hariTerakhirBulan('2000-02-10')).toBe(29)  // kelipatan 400 kabisat
  })

  it('April 30, Agustus 31', () => {
    expect(hariTerakhirBulan('2026-04-01')).toBe(30)
    expect(hariTerakhirBulan('2026-08-01')).toBe(31)
  })
})

describe('geserHari — melintasi batas bulan & tahun', () => {
  it('mundur melewati awal bulan', () => {
    expect(geserHari('2026-03-01', -1)).toBe('2026-02-28')
    expect(geserHari('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('maju melewati akhir tahun', () => {
    expect(geserHari('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('mundur melewati awal tahun', () => {
    expect(geserHari('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('awalPeriode', () => {
  it('harian: hari itu sendiri', () => {
    expect(awalPeriode('2026-08-19', 'harian')).toBe('2026-08-19')
  })

  it('mingguan: mundur ke SENIN', () => {
    // 2026-08-19 Rabu → Senin 2026-08-17.
    expect(awalPeriode('2026-08-19', 'mingguan')).toBe('2026-08-17')
    expect(awalPeriode('2026-08-17', 'mingguan')).toBe('2026-08-17')
    // Minggu adalah hari KE-7, jadi awal pekannya Senin sebelumnya.
    expect(awalPeriode('2026-08-16', 'mingguan')).toBe('2026-08-10')
  })

  it('bulanan: tanggal 1', () => {
    expect(awalPeriode('2026-08-19', 'bulanan')).toBe('2026-08-01')
  })
})

describe('mingguan', () => {
  it('jatuh tempo pada hari & jam yang disetel', () => {
    // hari_ke 5 = Jumat. 2026-08-21 Jumat.
    const v = periksaJatuhTempo(dasar, { tanggal: '2026-08-21', jam: '07:00' })
    expect(v.kirim).toBe(true)
  })

  it('hari yang salah dilewati DENGAN sebabnya', () => {
    const v = periksaJatuhTempo(dasar, { tanggal: '2026-08-20', jam: '09:00' })
    expect(v.kirim).toBe(false)
    expect(v.alasan).toBe('belum-harinya')
  })

  it('`hari_ke` kosong DITAHAN, bukan ditebak Senin', () => {
    // Menebaknya membuat laporan datang di hari yang tak pernah disepakati.
    const v = periksaJatuhTempo(
      { ...dasar, hari_ke: null }, { tanggal: '2026-08-17', jam: '09:00' })
    expect(v.kirim).toBe(false)
    expect(v.alasan).toBe('belum-harinya')
  })
})

describe('jam', () => {
  it('sebelum jamnya: ditahan', () => {
    const v = periksaJatuhTempo(dasar, { tanggal: '2026-08-21', jam: '06:59' })
    expect(v.alasan).toBe('belum-jamnya')
  })

  it('TERLEWAT jauh tetap dikirim — penjadwal bisa mati semalaman', () => {
    // Melompatinya berarti laporan hari itu hilang tanpa jejak, dan yang
    // menunggunya tak diberi tahu.
    const v = periksaJatuhTempo(dasar, { tanggal: '2026-08-21', jam: '23:30' })
    expect(v.kirim).toBe(true)
  })

  it('jam jadwal yang rusak DITAHAN (fail-closed)', () => {
    // Laporan yang terkirim pada jam yang tak pernah disetel tak menimbulkan
    // pertanyaan — dan itu yang membuatnya lebih buruk daripada tak terkirim.
    const v = periksaJatuhTempo(
      { ...dasar, jam: '99:99' }, { tanggal: '2026-08-21', jam: '10:00' })
    expect(v.kirim).toBe(false)
    expect(v.alasan).toBe('belum-jamnya')
  })
})

describe('satu kali per periode — yang mencegah kirim berulang', () => {
  it('mingguan yang sudah terkirim pekan ini tak dikirim lagi', () => {
    const v = periksaJatuhTempo(
      { ...dasar, terakhir_dikirim: '2026-08-21T07:02:00Z' },
      { tanggal: '2026-08-21', jam: '10:00' })
    expect(v.kirim).toBe(false)
    expect(v.alasan).toBe('sudah-dikirim-periode-ini')
  })

  it('terkirim PEKAN LALU: dikirim lagi', () => {
    const v = periksaJatuhTempo(
      { ...dasar, terakhir_dikirim: '2026-08-14T07:02:00Z' },
      { tanggal: '2026-08-21', jam: '07:00' })
    expect(v.kirim).toBe(true)
  })

  it('harian: terkirim kemarin → dikirim lagi hari ini', () => {
    const h: JadwalKirim = { ...dasar, irama: 'harian', hari_ke: null }
    expect(periksaJatuhTempo(
      { ...h, terakhir_dikirim: '2026-08-20T07:02:00Z' },
      { tanggal: '2026-08-21', jam: '07:00' }).kirim).toBe(true)
    expect(periksaJatuhTempo(
      { ...h, terakhir_dikirim: '2026-08-21T07:02:00Z' },
      { tanggal: '2026-08-21', jam: '09:00' }).alasan).toBe('sudah-dikirim-periode-ini')
  })
})

describe('bulanan', () => {
  const b: JadwalKirim = { ...dasar, irama: 'bulanan', hari_ke: 31, jam: '08:00' }

  it('tanggal 31 di bulan berhari 30 jatuh ke HARI TERAKHIR', () => {
    // Dilompati berarti laporan bulanan absen empat kali setahun — dan
    // absennya tak meninggalkan satu pun jejak.
    expect(periksaJatuhTempo(b, { tanggal: '2026-04-30', jam: '08:00' }).kirim).toBe(true)
  })

  it('tanggal 31 di bulan berhari 31 tetap tanggal 31', () => {
    expect(periksaJatuhTempo(b, { tanggal: '2026-08-31', jam: '08:00' }).kirim).toBe(true)
    expect(periksaJatuhTempo(b, { tanggal: '2026-08-30', jam: '08:00' }).alasan)
      .toBe('belum-harinya')
  })

  it('Februari: tanggal 31 jatuh ke 28 (atau 29 di tahun kabisat)', () => {
    expect(periksaJatuhTempo(b, { tanggal: '2026-02-28', jam: '08:00' }).kirim).toBe(true)
    expect(periksaJatuhTempo(b, { tanggal: '2024-02-29', jam: '08:00' }).kirim).toBe(true)
    expect(periksaJatuhTempo(b, { tanggal: '2024-02-28', jam: '08:00' }).alasan)
      .toBe('belum-harinya')
  })

  it('terkirim bulan ini tak dikirim lagi', () => {
    expect(periksaJatuhTempo(
      { ...b, hari_ke: 1, terakhir_dikirim: '2026-08-01T08:01:00Z' },
      { tanggal: '2026-08-01', jam: '10:00' }).alasan).toBe('sudah-dikirim-periode-ini')
  })
})

describe('nonaktif', () => {
  it('jadwal mati tak pernah dikirim, dan sebabnya disebut', () => {
    const v = periksaJatuhTempo(
      { ...dasar, aktif: false }, { tanggal: '2026-08-21', jam: '08:00' })
    expect(v.kirim).toBe(false)
    expect(v.alasan).toBe('nonaktif')
  })
})

describe('pilihJatuhTempo', () => {
  it('memisahkan yang dikirim dari yang dilewati, tanpa membuang yang kedua', () => {
    const hasil = pilihJatuhTempo([
      dasar,                                   // Jumat 07:00 → kirim
      { ...dasar, id: 'j2', aktif: false },    // nonaktif
      { ...dasar, id: 'j3', hari_ke: 1 },      // Senin → belum harinya
    ], { tanggal: '2026-08-21', jam: '08:00' })

    expect(hasil.kirim.map((j) => j.id)).toEqual(['j1'])
    // "Kenapa laporan saya tak datang" adalah pertanyaan yang pasti muncul,
    // dan jawabannya harus ada di log — bukan disimpulkan dari ketiadaan baris.
    expect(hasil.lewat.map((v) => v.alasan)).toEqual(['nonaktif', 'belum-harinya'])
  })
})
