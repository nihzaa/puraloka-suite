import { describe, it, expect } from 'vitest'
import { ringkasJt, labelBulan, WARNA_KASBON } from './ikhtisar-keuangan'

describe('ringkasJt', () => {
  it('miliar diprioritaskan di atas juta', () => {
    // Terbalik urutannya, 2 miliar jadi "2000 jt" — benar secara teknis,
    // tetapi tak terbaca sebagai besaran.
    expect(ringkasJt(2_000_000_000)).toBe('2.0 M')
    expect(ringkasJt(4_883_000_000)).toBe('4.9 M')
  })

  it('miliar dua digit dibulatkan tanpa desimal', () => {
    // "12.0 M" dan "12 M" sama informatifnya; yang kedua lebih pendek, dan
    // label sumbu adalah tempat paling sempit di seluruh grafik.
    expect(ringkasJt(12_000_000_000)).toBe('12 M')
  })

  it('juta', () => {
    expect(ringkasJt(119_595_000)).toBe('120 jt')
    expect(ringkasJt(1_500_000)).toBe('2 jt')
  })

  it('ribu dan satuan', () => {
    expect(ringkasJt(15_000)).toBe('15 rb')
    expect(ringkasJt(750)).toBe('750')
    expect(ringkasJt(0)).toBe('0')
  })

  it('negatif tetap terbaca sebagai negatif', () => {
    // Saldo kas bisa minus, dan "213 jt" untuk -213jt adalah kebohongan yang
    // menenangkan.
    expect(ringkasJt(-213_695_000)).toBe('-214 jt')
    expect(ringkasJt(-2_000_000_000)).toBe('-2.0 M')
  })

  it('bukan angka → tanda pisah, bukan "NaN"', () => {
    expect(ringkasJt(Number.NaN)).toBe('—')
    expect(ringkasJt(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('labelBulan', () => {
  it('YYYY-MM → nama bulan + dua digit tahun', () => {
    expect(labelBulan('2026-06')).toBe('Jun 26')
    expect(labelBulan('2025-12')).toBe('Des 25')
    expect(labelBulan('2026-01')).toBe('Jan 26')
  })

  it('tahun ikut ditampilkan supaya Jan tahun berbeda bisa dibedakan', () => {
    expect(labelBulan('2025-01')).not.toBe(labelBulan('2026-01'))
  })

  it('bentuk tak dikenal dikembalikan apa adanya, bukan kosong', () => {
    // Label kosong membuat sumbu terlihat rusak; string mentah setidaknya
    // memberi petunjuk apa yang salah.
    expect(labelBulan('2026')).toBe('2026')
    expect(labelBulan('bukan-tanggal')).toBe('bukan-tanggal')
  })

  it('bulan di luar 1..12 tidak menghasilkan undefined', () => {
    expect(labelBulan('2026-13')).toBe('2026-13')
    expect(labelBulan('2026-00')).toBe('2026-00')
  })

  it('kosong/undefined tidak melempar', () => {
    expect(labelBulan('')).toBe('')
    expect(labelBulan(undefined as unknown as string)).toBe('')
  })
})

describe('WARNA_KASBON', () => {
  it('seluruhnya token CSS, NOL hex', () => {
    // Hex tak ikut berbalik di mode gelap — donat yang cantik di terang jadi
    // buram di gelap. Dijaga juga oleh `uji-token-grafik-bukan-teks.mjs`.
    for (const w of WARNA_KASBON) {
      expect(w.startsWith('var(--'), w).toBe(true)
      expect(w).not.toMatch(/#[0-9a-f]{3,8}/i)
    }
  })

  it('cukup banyak untuk seluruh tujuan kasbon yang ada', () => {
    // Lima tujuan di `kasbon_purposes`: gaji_tukang, uang_makan,
    // pembelian_alat, operasional, lain_lain.
    expect(WARNA_KASBON.length).toBeGreaterThanOrEqual(5)
  })
})
