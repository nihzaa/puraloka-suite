/**
 * KESEHATAN PERAWATAN ALAT — yang diuji cara ia menuduh alat yang sehat,
 * atau membiarkan alat yang mogok beruntun lolos.
 *
 * Angka acuan dari basis nyata 2026-08-16:
 *
 *   DTR-002 Dump Truck   Rp 19,85 jt / Rp 780 jt = 2,54%   4 dari 6 tak terjadwal
 *   TRK-004 Truk Mixer   Rp  6,70 jt / Rp 950 jt = 0,71%   0 dari 2
 *   EXC-001 Excavator    Rp  6,43 jt / Rp 1,85 M = 0,35%   1 dari 3
 */
import { describe, it, expect } from 'vitest'
import { nilaiKesehatanPerawatan } from '../kesehatan-perawatan.js'

const S = (biaya: number, takTerjadwal = false) => ({ biaya, takTerjadwal })

// Dump Truck apa adanya: 6 servis, 4 di antaranya kerusakan.
const DUMP = [
  S(2_150_000), S(5_800_000, true), S(3_200_000, true),
  S(2_400_000), S(1_800_000, true), S(4_500_000, true),
]

describe('nilaiKesehatanPerawatan', () => {
  it('menandai alat yang SERING RUSAK, bukan sekadar mahal', () => {
    const h = nilaiKesehatanPerawatan(DUMP, 780_000_000, 2, 2, 0.5)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('sering_rusak')
    expect(h.takTerjadwal).toBe(4)
    expect(h.porsiRusak).toBeCloseTo(0.67, 1)
  })

  it('SERING RUSAK diperiksa LEBIH DULU daripada biaya tinggi', () => {
    /*
      Dump Truck memenuhi KEDUA syarat (2,54% > 2% DAN 4/6 > 0,5).

      Kalau urutannya dibalik, ia dilaporkan dengan sebab "biaya_tinggi" — dan
      yang membacanya menyimpulkan masalah ANGGARAN, padahal masalahnya alat
      itu berhenti bekerja di tengah pekerjaan empat kali.

      Tindakan untuk keduanya berbeda: yang satu meninjau anggaran perawatan,
      yang lain memutuskan mengganti atau menyewa.
    */
    const h = nilaiKesehatanPerawatan(DUMP, 780_000_000, 2, 2, 0.5)
    expect(h.persenHarga).toBeGreaterThan(2)   // syarat biaya JUGA terpenuhi
    expect(h.sebab).toBe('sering_rusak')       // tapi yang dilaporkan ini
  })

  it('alat yang servisnya semua terjadwal TIDAK ditandai', () => {
    // Truk Mixer: dua servis drum berkala, nol kerusakan.
    const h = nilaiKesehatanPerawatan(
      [S(3_300_000), S(3_400_000)], 950_000_000, 2, 2, 0.5)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('sehat')
    expect(h.takTerjadwal).toBe(0)
  })

  it('HARGA BELI NOL mematikan jalur rasio, bukan menghasilkan Infinity', () => {
    /*
      Cacat yang paling mahal kalau lolos.

      `total / 0` menghasilkan Infinity, dan `Infinity >= ambang` bernilai
      true — jadi SETIAP alat yang harga belinya tak tercatat dilaporkan
      "biaya perawatan tinggi".

      Alat sewa dan alat hibah biasanya tak punya harga beli, dan justru
      itulah yang paling banyak di daftar aset. Peringatan massal dari kolom
      yang memang kosong.
    */
    for (const harga of [0, null, Number.NaN]) {
      const h = nilaiKesehatanPerawatan(
        [S(9_000_000), S(9_000_000)], harga as number, 2, 2, 0.9)
      expect(h.persenHarga).toBeNull()
      expect(h.perlu).toBe(false)   // jalur porsi juga tak memicu (0 rusak)
    }
  })

  it('harga beli nol TIDAK mematikan jalur SERING RUSAK', () => {
    // Alat sewa yang mogok beruntun tetap harus terlihat, meski rasionya
    // tak bisa dihitung. Mematikan kedua jalur sekaligus akan menyembunyikan
    // justru alat yang paling bermasalah.
    const h = nilaiKesehatanPerawatan(
      [S(1_000_000, true), S(1_000_000, true)], null, 2, 2, 0.5)
    expect(h.persenHarga).toBeNull()
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('sering_rusak')
  })

  it('satu servis bukan kesimpulan', () => {
    // Satu kerusakan tak menjadikan alat "sering rusak". Menuduhnya dari satu
    // sampel membuat setiap alat baru yang sekali mogok langsung diusulkan
    // diganti.
    const h = nilaiKesehatanPerawatan([S(5_000_000, true)], 100_000_000, 2, 2, 0.5)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('kurang_sampel')
  })

  it('rasio dihitung dari biaya KUMULATIF, bukan rata-rata', () => {
    // Rata-rata menyembunyikan alat yang banyak servis kecil: sepuluh servis
    // Rp 2 jt = Rp 20 jt total, tetapi rata-ratanya cuma Rp 2 jt dan terlihat
    // jinak dibanding satu servis Rp 15 jt.
    const h = nilaiKesehatanPerawatan(
      Array.from({ length: 10 }, () => S(2_000_000)), 100_000_000, 2, 15, 0.9)
    expect(h.totalBiaya).toBe(20_000_000)
    expect(h.persenHarga).toBe(20)
    expect(h.sebab).toBe('biaya_tinggi')
  })
})
