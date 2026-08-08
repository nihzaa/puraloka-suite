import { describe, it, expect } from 'vitest'
import { jalurSparkline, hitungDelta } from './deret'

describe('jalurSparkline', () => {
  it('menghasilkan path SVG dari deret', () => {
    const d = jalurSparkline([1, 2, 3], 60, 24)
    expect(d).toMatch(/^M0,/)
    expect(d.split('L').length).toBe(3) // 3 titik = M + 2 L
  })

  /*
   * Deret datar (semua nilai sama) membagi nol kalau rentangnya dipakai
   * mentah. Gejalanya `NaN` di atribut `d`, dan SVG dengan path NaN tidak
   * menggambar apa pun — garis HILANG tanpa galat, persis kelas cacat yang
   * paling lama tak ketahuan.
   */
  it('deret datar tidak menghasilkan NaN', () => {
    const d = jalurSparkline([5, 5, 5], 60, 24)
    expect(d).not.toContain('NaN')
  })

  it('deret nol semua tidak menghasilkan NaN', () => {
    expect(jalurSparkline([0, 0, 0], 60, 24)).not.toContain('NaN')
  })

  /*
   * Kurang dari dua titik bukan garis. Menggambarnya menghasilkan satu titik
   * mengambang yang terbaca sebagai kerusakan render.
   */
  it('kurang dari dua titik menghasilkan string kosong', () => {
    expect(jalurSparkline([7], 60, 24)).toBe('')
    expect(jalurSparkline([], 60, 24)).toBe('')
  })

  it('nilai tertinggi berada di atas (y lebih kecil)', () => {
    const d = jalurSparkline([0, 10], 60, 24)
    const y = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]))
    expect(y[1]).toBeLessThan(y[0])
  })
})

describe('hitungDelta', () => {
  it('naik menghasilkan persen positif', () => {
    expect(hitungDelta([100, 120])?.persen).toBeCloseTo(20)
  })

  it('turun menghasilkan persen negatif', () => {
    expect(hitungDelta([100, 80])?.persen).toBeCloseTo(-20)
  })

  /*
   * ARAH "BAIK" DITENTUKAN PER METRIK, bukan per tanda — brief §3.4.
   * Pengeluaran yang TURUN itu kabar baik; invoice belum lunas yang turun
   * juga baik. Menghijaukan semua kenaikan membuat "kasbon naik 40%" tampil
   * hijau, dan itu memberi rasa aman yang salah.
   */
  it('naik-itu-baik: hijau saat naik', () => {
    expect(hitungDelta([100, 120], 'naik-baik')?.baik).toBe(true)
    expect(hitungDelta([100, 80], 'naik-baik')?.baik).toBe(false)
  })

  it('turun-itu-baik: hijau saat TURUN', () => {
    expect(hitungDelta([100, 80], 'turun-baik')?.baik).toBe(true)
    expect(hitungDelta([100, 120], 'turun-baik')?.baik).toBe(false)
  })

  /*
   * Pembagi nol: bulan lalu 0 lalu bulan ini 50 bukan "kenaikan tak hingga".
   * Persentasenya tak bermakna, jadi delta TIDAK ditampilkan — bukan
   * ditampilkan sebagai Infinity atau 100%.
   */
  it('dari nol tidak menghasilkan persen tak hingga', () => {
    expect(hitungDelta([0, 50])).toBeNull()
  })

  it('kurang dari dua titik menghasilkan null', () => {
    expect(hitungDelta([5])).toBeNull()
    expect(hitungDelta([])).toBeNull()
  })

  it('tanpa perubahan menghasilkan nol dan tidak dianggap buruk', () => {
    const d = hitungDelta([100, 100], 'naik-baik')
    expect(d?.persen).toBe(0)
    expect(d?.baik).toBe(true)
  })
})
