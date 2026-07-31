import { describe, it, expect } from 'vitest'
import { jelaskanItem, type HspSnapshot } from '../explain-item'

// Explainability adalah Constraint TERTINGGI CECEP, bukan fitur pinggiran:
// angka RAB dibawa ke hadapan klien & pemeriksa, dan angka yang tak bisa
// dipertahankan tak akan dipakai untuk pekerjaan yang bernilai.
//
// Yang paling penting diuji di sini BUKAN "penjelasannya muncul", melainkan
// bahwa penjelasan yang BOLONG mengaku bolong. Penjelasan yang tampak lengkap
// padahal tak konsisten jauh lebih berbahaya daripada tak ada penjelasan.

const snap = (o: Partial<HspSnapshot['hsp']> = {}, prices: HspSnapshot['prices'] = []): HspSnapshot => ({
  hsp: {
    hspRaw: 87120, hspRounded: 87200, subtotalD: 79200,
    bukAmount: 7920, bukFraction: 0.1,
    rounding: { mode: 'up', step: 100 },
    groupTotals: { tenaga: 79200, bahan: 0, alat: 0 },
    ...o,
  },
  prices,
})

const komp = (kode: string, koef: number, harga: number, extra = {}) => ({
  resource_code: kode, coefficient: koef, amount: harga,
  sumber: 'price_book', effective_date: '2026-01-01', ...extra,
})

describe('jelaskanItem — rangkaian langkah', () => {
  it('menyusun langkah berurutan: harga → subtotal → BUK → pembulatan → volume', () => {
    const r = jelaskanItem(
      snap({}, [komp('AHSP-PEKERJA', 0.66, 100_000), komp('AHSP-MANDOR', 0.066, 200_000)]),
      { namaItem: 'Pasangan bata', satuan: 'm2', volume: 10, priceDate: '2026-01-01' },
    )
    expect(r.langkah.map((l) => l.no)).toEqual([1, 2, 3, 4, 5])
    expect(r.langkah[3].uraian).toContain('dibulatkan ke ATAS')
    expect(r.langkah[4].nilai).toBe(872_000)   // 10 × 87.200
  })

  it('komponen membawa sumber & tanggal harga — bukan cuma angka', () => {
    // "Rp 100.000" tanpa "dari price book, berlaku 1 Jan 2026" tak bisa
    // dipertahankan saat diperiksa.
    const r = jelaskanItem(snap({}, [komp('AHSP-PEKERJA', 0.66, 100_000)]), { namaItem: 'x' })
    expect(r.komponen[0]).toMatchObject({
      kode: 'AHSP-PEKERJA', koefisien: 0.66, hargaSatuan: 100_000,
      subtotal: 66_000, sumber: 'price_book', tanggalHarga: '2026-01-01',
    })
  })

  it('BUK disebut beserta persentasenya', () => {
    const r = jelaskanItem(snap({}, [komp('A', 1, 1000)]), { namaItem: 'x' })
    const buk = r.langkah.find((l) => l.judul.includes('BUK'))
    expect(buk?.judul).toContain('10.0%')
  })
})

describe('kejujuran — penjelasan bolong harus MENGAKU bolong', () => {
  it('snapshot tak ada → utuh=false + alasan yang bisa dibaca manusia', () => {
    const r = jelaskanItem(null, { namaItem: 'Item lama' })
    expect(r.utuh).toBe(false)
    expect(r.langkah).toHaveLength(0)
    expect(r.peringatan[0]).toContain('migrasi 139')
    // Tidak menebak-nebak angkanya — menebak lebih buruk daripada mengaku.
    expect(r.komponen).toHaveLength(0)
  })

  it('jumlah komponen tak cocok subtotal → peringatan, bukan diperhalus', () => {
    // Kalau snapshot-nya sendiri tak konsisten, itu HARUS terlihat.
    const r = jelaskanItem(
      snap({ subtotalD: 79_200 }, [komp('A', 1, 10_000)]),  // hitung 10.000 ≠ 79.200
      { namaItem: 'x' },
    )
    expect(r.utuh).toBe(false)
    expect(r.peringatan.some((p) => p.includes('tak cocok'))).toBe(true)
  })

  it('selisih pembulatan kecil TIDAK dianggap masalah', () => {
    // Toleransi ada supaya peringatan tetap bermakna — kalau tiap selisih sen
    // memicu peringatan, orang berhenti membacanya.
    const r = jelaskanItem(
      snap({ subtotalD: 66_000 }, [komp('A', 0.66, 100_000)]),
      { namaItem: 'x' },
    )
    expect(r.peringatan.filter((p) => p.includes('tak cocok'))).toHaveLength(0)
  })

  it('harga override WAJIB disebut', () => {
    // Angka yang menyimpang dari price book standar adalah hal PERTAMA yang
    // ditanyakan pemeriksa; menyembunyikannya membuat sisanya ikut diragukan.
    const r = jelaskanItem(
      snap({ subtotalD: 66_000 }, [komp('A', 0.66, 100_000, { override_reason: 'harga lokal Bandung' })]),
      { namaItem: 'x' },
    )
    expect(r.peringatan.some((p) => p.includes('harga lokal Bandung'))).toBe(true)
    expect(r.utuh).toBe(false)
    expect(r.komponen[0].alasanOverride).toBe('harga lokal Bandung')
  })

  it('nol komponen → peringatan snapshot tak lengkap', () => {
    const r = jelaskanItem(snap({}, []), { namaItem: 'x' })
    expect(r.peringatan.some((p) => p.includes('rincian harga'))).toBe(true)
    expect(r.utuh).toBe(false)
  })
})

describe('kasus batas', () => {
  it('tanpa volume → langkah 5 tak muncul, sisanya tetap', () => {
    const r = jelaskanItem(snap({ subtotalD: 66_000 }, [komp('A', 0.66, 100_000)]), { namaItem: 'x' })
    expect(r.langkah.some((l) => l.no === 5)).toBe(false)
    expect(r.utuh).toBe(true)
  })

  it('BUK nol tak menambah langkah kosong', () => {
    const r = jelaskanItem(
      snap({ bukAmount: 0, subtotalD: 66_000 }, [komp('A', 0.66, 100_000)]),
      { namaItem: 'x' },
    )
    expect(r.langkah.some((l) => l.judul.includes('BUK'))).toBe(false)
  })

  it('hspRaw = hspRounded → tak mengarang cerita pembulatan', () => {
    const r = jelaskanItem(
      snap({ hspRaw: 87_200, hspRounded: 87_200, subtotalD: 66_000 }, [komp('A', 0.66, 100_000)]),
      { namaItem: 'x' },
    )
    const bulat = r.langkah.find((l) => l.judul.includes('Pembulatan'))
    expect(bulat?.uraian).not.toContain('menjadi')
  })
})
