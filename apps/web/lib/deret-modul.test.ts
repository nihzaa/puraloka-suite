import { describe, it, expect } from 'vitest'
import {
  labelBulanPendek, ringkasNilai, labelKomposisi, WARNA_DERET,
} from './deret-modul'

describe('labelBulanPendek', () => {
  it('YYYY-MM → nama bulan + dua digit tahun', () => {
    expect(labelBulanPendek('2026-06')).toBe('Jun 26')
    expect(labelBulanPendek('2025-12')).toBe('Des 25')
  })

  it('tahun ikut supaya Jan dua tahun berbeda tak tertukar', () => {
    expect(labelBulanPendek('2025-01')).not.toBe(labelBulanPendek('2026-01'))
  })

  it('bentuk tak dikenal dikembalikan apa adanya', () => {
    expect(labelBulanPendek('2026')).toBe('2026')
    expect(labelBulanPendek('')).toBe('')
  })

  it('bulan di luar 1..12 tak menghasilkan undefined', () => {
    expect(labelBulanPendek('2026-13')).toBe('2026-13')
    expect(labelBulanPendek('2026-00')).toBe('2026-00')
  })
})

describe('ringkasNilai', () => {
  it('miliar diprioritaskan di atas juta', () => {
    expect(ringkasNilai(4_110_000_000)).toBe('4.1 M')
    expect(ringkasNilai(12_000_000_000)).toBe('12 M')
  })

  it('juta, ribu, satuan', () => {
    expect(ringkasNilai(472_000_000)).toBe('472 jt')
    expect(ringkasNilai(45_000)).toBe('45 rb')
    expect(ringkasNilai(300)).toBe('300')
  })

  it('nol tetap "0", bukan tanda pisah', () => {
    // Bulan tanpa transaksi memang nol — itu informasi, bukan ketiadaan data.
    expect(ringkasNilai(0)).toBe('0')
  })

  it('negatif tetap negatif', () => {
    expect(ringkasNilai(-472_000_000)).toBe('-472 jt')
  })

  it('bukan angka → tanda pisah, bukan "NaN"', () => {
    expect(ringkasNilai(Number.NaN)).toBe('—')
    expect(ringkasNilai(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('labelKomposisi', () => {
  it('menerjemahkan status proyek', () => {
    expect(labelKomposisi('active')).toBe('Aktif')
    expect(labelKomposisi('on_hold')).toBe('Ditunda')
  })

  it('menerjemahkan tujuan kasbon', () => {
    expect(labelKomposisi('gaji_tukang')).toBe('Upah tukang')
  })

  it('menerjemahkan status PO', () => {
    expect(labelKomposisi('fully_received')).toBe('Diterima penuh')
    expect(labelKomposisi('partially_received')).toBe('Diterima sebagian')
  })

  it('menerjemahkan status laporan upah', () => {
    expect(labelKomposisi('paid')).toBe('Dibayar')
    expect(labelKomposisi('submitted')).toBe('Diajukan')
  })

  it('SATU kamus untuk empat modul — tak ada nilai yang bentrok', () => {
    // Kalau dua modul memakai kunci sama dengan arti berbeda, satu di
    // antaranya akan salah label tanpa gejala. Diperiksa: tak ada.
    const kunci = [
      'active', 'completed', 'on_hold', 'draft', 'cancelled',
      'gaji_tukang', 'uang_makan', 'pembelian_alat', 'operasional', 'lain_lain',
      'confirmed', 'partially_received', 'fully_received', 'closed',
      'submitted', 'approved', 'paid', 'rejected', 'settled',
    ]
    expect(new Set(kunci).size).toBe(kunci.length)
    for (const k of kunci) expect(labelKomposisi(k), k).not.toBe('—')
  })

  it('nilai tak dikenal tetap ditampilkan', () => {
    expect(labelKomposisi('status_baru')).toBe('Status baru')
    expect(labelKomposisi('')).toBe('—')
  })
})

describe('WARNA_DERET', () => {
  it('seluruhnya token CSS, NOL hex', () => {
    for (const w of WARNA_DERET) {
      expect(w.startsWith('var(--'), w).toBe(true)
      expect(w).not.toMatch(/#[0-9a-f]{3,8}/i)
    }
  })

  it('TIDAK memuat --aksen (terlalu dekat --navy di irisan kecil)', () => {
    // Cacat nyata: donat kasbon di /keuangan, dua irisan pertama tampak
    // sewarna. Ketahuan dari tangkapan layar, bukan dari kode.
    expect(WARNA_DERET).not.toContain('var(--aksen)')
  })

  it('cukup untuk komposisi terbanyak yang mungkin (5 status PO)', () => {
    expect(WARNA_DERET.length).toBeGreaterThanOrEqual(5)
  })
})
