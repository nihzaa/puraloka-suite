import { describe, it, expect } from 'vitest'
import { susunKisi, kunciTanggal, HARI_ID } from './kalender'

const HARI_INI = new Date(2026, 7, 8) // 8 Agustus 2026 (bulan 0-indeks)

describe('susunKisi', () => {
  it('selalu 42 sel supaya tinggi kartu tak melompat antar bulan', () => {
    for (const b of [0, 1, 5, 11]) {
      expect(susunKisi(new Date(2026, b, 15), [], HARI_INI).sel).toHaveLength(42)
    }
  })

  it('judul memakai nama bulan Indonesia', () => {
    expect(susunKisi(new Date(2026, 7, 1), [], HARI_INI).judul).toBe('Agustus 2026')
    expect(susunKisi(new Date(2026, 0, 1), [], HARI_INI).judul).toBe('Januari 2026')
  })

  /*
   * Cacat paling mudah lolos: `getDay()` menomori Minggu = 0, jadi kisi yang
   * memakainya mentah menggeser SELURUH bulan satu kolom. Hasilnya tetap
   * terlihat rapi — hanya tanggalnya jatuh di hari yang salah.
   *
   * 1 Agustus 2026 adalah SABTU, yaitu kolom ke-6 (indeks 5) bila Senin = 0.
   */
  it('minggu mulai SENIN, bukan Minggu', () => {
    expect(HARI_ID[0]).toBe('Sen')
    const { sel } = susunKisi(new Date(2026, 7, 1), [], HARI_INI)
    const i = sel.findIndex((s) => s.tanggal === 1)
    expect(i).toBe(5)
    expect(new Date(2026, 7, 1).getDay()).toBe(6) // benar-benar Sabtu
  })

  it('sel sebelum tanggal 1 dan sesudah akhir bulan kosong', () => {
    const { sel } = susunKisi(new Date(2026, 7, 1), [], HARI_INI)
    expect(sel[0].tanggal).toBeNull()
    expect(sel[0].iso).toBeNull()
    expect(sel[sel.length - 1].tanggal).toBeNull()
  })

  it('jumlah hari benar termasuk Februari kabisat', () => {
    const hitung = (t: number, b: number) =>
      susunKisi(new Date(t, b, 1), [], HARI_INI).sel.filter((s) => s.tanggal !== null).length
    expect(hitung(2026, 1)).toBe(28) // Feb 2026
    expect(hitung(2028, 1)).toBe(29) // Feb 2028 kabisat
    expect(hitung(2026, 7)).toBe(31) // Agustus
    expect(hitung(2026, 8)).toBe(30) // September
  })

  it('menandai hari ini, dan hanya satu', () => {
    const { sel } = susunKisi(new Date(2026, 7, 20), [], HARI_INI)
    const kini = sel.filter((s) => s.hariIni)
    expect(kini).toHaveLength(1)
    expect(kini[0].tanggal).toBe(8)
  })

  it('tidak menandai hari ini saat bulan lain ditampilkan', () => {
    const { sel } = susunKisi(new Date(2026, 9, 1), [], HARI_INI)
    expect(sel.some((s) => s.hariIni)).toBe(false)
  })

  it('menandai tanggal yang punya peristiwa', () => {
    const { sel } = susunKisi(new Date(2026, 7, 1), ['2026-08-12', '2026-08-25'], HARI_INI)
    expect(sel.filter((s) => s.berisi).map((s) => s.tanggal)).toEqual([12, 25])
  })

  /*
   * Peristiwa bulan LAIN tak boleh bocor ke kisi bulan ini. Kalau bocor,
   * pencocokannya berbasis nomor hari saja — dan tiap tanggal 12 di bulan mana
   * pun akan bertitik.
   */
  it('peristiwa bulan lain tidak ikut ditandai', () => {
    const { sel } = susunKisi(new Date(2026, 7, 1), ['2026-09-12', '2026-07-12'], HARI_INI)
    expect(sel.some((s) => s.berisi)).toBe(false)
  })

  it('masukan tanggal tak sah diabaikan, bukan bikin galat', () => {
    const { sel } = susunKisi(new Date(2026, 7, 1), ['', 'bukan-tanggal'], HARI_INI)
    expect(sel.some((s) => s.berisi)).toBe(false)
  })
})

describe('kunciTanggal', () => {
  it('menerima date polos maupun timestamptz', () => {
    expect(kunciTanggal('2026-08-20')).toBe('2026-08-20')
    expect(kunciTanggal('2026-08-20T00:00:00+07:00')).toBe('2026-08-20')
    expect(kunciTanggal('2026-08-20T17:00:00Z')).toBe('2026-08-20')
  })

  /*
   * Memotong string, BUKAN mengurai jadi Date lalu memformat ulang.
   * `new Date('2026-08-20')` diurai sebagai UTC; dirender di Asia/Jakarta ia
   * tetap 20, tetapi `2026-08-20T17:00:00Z` akan menjadi 21 — dan titiknya
   * pindah ke kotak yang salah. Pemotongan menghindari seluruh kelas cacat itu.
   */
  it('tidak menggeser tanggal karena zona waktu', () => {
    expect(kunciTanggal('2026-08-20T23:59:59Z')).toBe('2026-08-20')
    expect(kunciTanggal('2026-01-01T00:00:00+07:00')).toBe('2026-01-01')
  })

  it('menolak nilai yang bukan tanggal', () => {
    for (const buruk of [null, undefined, '', 'kemarin', '2026-8-2', 123 as unknown as string]) {
      expect(kunciTanggal(buruk)).toBeNull()
    }
  })
})
