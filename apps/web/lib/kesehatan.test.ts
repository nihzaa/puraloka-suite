import { describe, it, expect } from 'vitest'
import { hitungKesehatan } from './kesehatan'

const HARI_INI = new Date('2026-08-08T00:00:00.000Z')
const kosong = { invoiceLewatTempo: 0, milestoneTelat: 0, proyek: [], hariIni: HARI_INI }

describe('hitungKesehatan', () => {
  it('portofolio bersih bernilai 100 dan tanpa sorotan', () => {
    const h = hitungKesehatan(kosong)
    expect(h.skor).toBe(100)
    expect(h.nada).toBe('baik')
    expect(h.sorotan).toBe('')
  })

  /*
   * Bobot TIDAK sama, dan ini yang paling mudah rusak diam-diam. Satu proyek
   * lewat tenggat harus menekan skor lebih dalam daripada satu invoice lewat
   * tempo — kalau disamakan, masalah berat bersembunyi di balik yang ringan.
   */
  it('proyek lewat tenggat menekan lebih dalam daripada invoice lewat tempo', () => {
    const invoice = hitungKesehatan({ ...kosong, invoiceLewatTempo: 1 })
    const tenggat = hitungKesehatan({
      ...kosong,
      proyek: [{ progress_pct: 50, end_date: '2026-07-01' }],
    })
    expect(tenggat.skor).toBeLessThan(invoice.skor)
  })

  it('proyek mandek = progres 0%, bukan sekadar progres rendah', () => {
    const mandek = hitungKesehatan({ ...kosong, proyek: [{ progress_pct: 0, end_date: null }] })
    const jalan = hitungKesehatan({ ...kosong, proyek: [{ progress_pct: 5, end_date: null }] })
    expect(mandek.rincian.proyekMandek).toBe(1)
    expect(jalan.rincian.proyekMandek).toBe(0)
  })

  it('proyek yang SUDAH 100% tidak dihitung lewat tenggat walau tanggalnya lewat', () => {
    const h = hitungKesehatan({
      ...kosong,
      proyek: [{ progress_pct: 100, end_date: '2026-01-01' }],
    })
    expect(h.rincian.proyekLewatTenggat).toBe(0)
    expect(h.skor).toBe(100)
  })

  it('tanpa end_date tidak pernah dianggap lewat tenggat', () => {
    const h = hitungKesehatan({ ...kosong, proyek: [{ progress_pct: 50, end_date: null }] })
    expect(h.rincian.proyekLewatTenggat).toBe(0)
  })

  it('tanggal tak sah diabaikan, bukan bikin NaN', () => {
    const h = hitungKesehatan({ ...kosong, proyek: [{ progress_pct: 50, end_date: 'bukan tanggal' }] })
    expect(Number.isFinite(h.skor)).toBe(true)
    expect(h.rincian.proyekLewatTenggat).toBe(0)
  })

  /* Skor tak boleh negatif — portofolio sangat buruk tetap 0, bukan -40. */
  it('skor dijepit di 0–100', () => {
    const h = hitungKesehatan({ ...kosong, invoiceLewatTempo: 999 })
    expect(h.skor).toBe(0)
    expect(h.nada).toBe('buruk')
  })

  it('sorotan menyebut pengurang TERBESAR, bukan yang pertama ditemukan', () => {
    const h = hitungKesehatan({
      ...kosong,
      invoiceLewatTempo: 1, // 3
      proyek: [{ progress_pct: 10, end_date: '2026-01-01' }], // 8
    })
    expect(h.sorotan).toContain('lewat tenggat')
  })

  it('nada berjenjang menurut skor', () => {
    expect(hitungKesehatan({ ...kosong }).nada).toBe('baik')
    expect(hitungKesehatan({ ...kosong, invoiceLewatTempo: 8 }).nada).toBe('perhatian')
    expect(hitungKesehatan({ ...kosong, invoiceLewatTempo: 20 }).nada).toBe('buruk')
  })

  it('masukan tak sah diperlakukan sebagai nol', () => {
    // @ts-expect-error — sengaja: API bisa mengirim null saat datanya kosong
    const h = hitungKesehatan({ invoiceLewatTempo: null, milestoneTelat: undefined, proyek: null, hariIni: HARI_INI })
    expect(h.skor).toBe(100)
  })
})
