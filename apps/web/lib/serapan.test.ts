import { describe, it, expect } from 'vitest'
import { ringkasSerapan, type BarisPortofolio } from './serapan'

const p = (o: Partial<BarisPortofolio>): BarisPortofolio => ({
  projectId: 'x', nama: 'Proyek', status: 'active',
  contractValue: 0, pagu: 0, serapan: 0, serapanPct: 0, dasarPembanding: 'rab',
  ...o,
})

describe('ringkasSerapan', () => {
  it('menjumlahkan rupiah, bukan merata-ratakan persen', () => {
    /*
     * INI cacat yang paling mudah dibuat dan paling sulit dilihat.
     *
     * Rata-rata persen: (100 + 0) / 2 = 50%.
     * Rata-rata tertimbang: 1jt dari 1.001jt = 0,0999… → 0%.
     *
     * Proyek Rp 1 juta yang habis TIDAK boleh menyeret portofolio Rp 1 miliar
     * ke "50% terpakai". Angka yang salah di sini terlihat sangat masuk akal.
     */
    const h = ringkasSerapan([
      p({ pagu: 1_000_000, serapan: 1_000_000 }),
      p({ pagu: 1_000_000_000, serapan: 0 }),
    ])
    expect(h.persen).toBe(0)
    expect(h.pagu).toBe(1_001_000_000)
    expect(h.serapan).toBe(1_000_000)
  })

  it('persen tertimbang benar pada kasus sederhana', () => {
    const h = ringkasSerapan([
      p({ pagu: 100, serapan: 40 }),
      p({ pagu: 100, serapan: 40 }),
    ])
    expect(h.persen).toBe(40)
    expect(h.sisa).toBe(120)
  })

  /* Pagu 0 = "belum diketahui", bukan "gratis". Ia tak boleh masuk penyebut. */
  it('proyek tanpa pagu dibuang dan DILAPORKAN, bukan dianggap nol', () => {
    const h = ringkasSerapan([
      p({ pagu: 200, serapan: 50 }),
      p({ pagu: 0, serapan: 0 }),
      p({ pagu: 0, serapan: 999 }),
    ])
    expect(h.tanpaPagu).toBe(2)
    expect(h.pagu).toBe(200)
    expect(h.serapan).toBe(50) // serapan proyek tanpa pagu tidak ikut
    expect(h.persen).toBe(25)
  })

  it('proyek batal tidak ikut dihitung', () => {
    const h = ringkasSerapan([
      p({ pagu: 100, serapan: 100 }),
      p({ pagu: 900, serapan: 0, status: 'cancelled' }),
    ])
    expect(h.pagu).toBe(100)
    expect(h.persen).toBe(100)
  })

  it('pembengkakan dihitung dan sisa tak pernah negatif', () => {
    const h = ringkasSerapan([p({ pagu: 100, serapan: 150 })])
    expect(h.persen).toBe(150)
    expect(h.lewatPagu).toBe(1)
    expect(h.sisa).toBe(0)
  })

  it('portofolio kosong tidak bikin NaN atau bagi nol', () => {
    for (const masukan of [[], null, undefined]) {
      const h = ringkasSerapan(masukan)
      expect(h.persen).toBe(0)
      expect(h.adaData).toBe(false)
      expect(Number.isFinite(h.persen)).toBe(true)
    }
  })

  it('nilai tak sah dari API diperlakukan sebagai nol', () => {
    // @ts-expect-error — sengaja: API bisa mengirim null saat kolomnya kosong
    const h = ringkasSerapan([p({ pagu: null, serapan: undefined })])
    expect(h.persen).toBe(0)
    expect(h.tanpaPagu).toBe(1)
  })
})
