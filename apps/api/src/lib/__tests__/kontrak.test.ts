/**
 * Register kontrak — aturannya. MURNI, tanpa basis.
 */
import { describe, it, expect } from 'vitest'
import {
  validasiKontrak, periksaTransisiKontrak, hitungNilaiKontrak, bandingkanNilai,
  EPSILON_KONTRAK,
  type BarisKontrak,
} from '../kontrak.js'

const isiSah = (o: Record<string, unknown> = {}) => ({
  jenis: 'induk',
  nomor: 'KTR-2026-001',
  judul: 'Pembangunan rumah tinggal',
  tanggal_tanda_tangan: '2026-01-15',
  nilai: 500_000_000,
  ...o,
})

const k = (o: Partial<BarisKontrak> = {}): BarisKontrak => ({
  id: 'x', jenis: 'induk', status: 'berlaku', nilai: 100_000_000,
  kontrak_induk_id: null, ...o,
})

describe('validasi kontrak', () => {
  it('masukan sah diterima', () => {
    const v = validasiKontrak(isiSah())
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.nilai).toBe(500_000_000)
  })

  it('jenis di luar induk/addendum ditolak', () => {
    expect(validasiKontrak(isiSah({ jenis: 'perjanjian' })).ok).toBe(false)
    expect(validasiKontrak(isiSah({ jenis: undefined })).ok).toBe(false)
  })

  it('nomor & judul kosong ditolak', () => {
    expect(validasiKontrak(isiSah({ nomor: '  ' })).ok).toBe(false)
    const v = validasiKontrak(isiSah({ judul: '' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/tak bisa dikenali/i)
  })

  it('nilai kosong ("") ditolak, BUKAN diperlakukan nol', () => {
    // `Number('') === 0` — kalau kosong lolos jadi nol, ia ditolak CHECK basis
    // dengan pesan yang membicarakan hal lain.
    const v = validasiKontrak(isiSah({ nilai: '' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/wajib diisi/i)
  })

  it('kontrak INDUK bernilai nol atau negatif ditolak', () => {
    expect(validasiKontrak(isiSah({ nilai: 0 })).ok).toBe(false)
    expect(validasiKontrak(isiSah({ nilai: -1 })).ok).toBe(false)
  })

  it('ADDENDUM boleh NEGATIF — pengurangan lingkup nyata adanya', () => {
    const v = validasiKontrak(isiSah({ jenis: 'addendum', nilai: -25_000_000 }))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.nilai).toBe(-25_000_000)
  })

  it('addendum bernilai NOL ditolak, dan pesannya menyarankan negatif', () => {
    const v = validasiKontrak(isiSah({ jenis: 'addendum', nilai: 0 }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/NEGATIF/i)
  })

  it('nilai string angka diterima — form mengirimnya begitu', () => {
    const v = validasiKontrak(isiSah({ nilai: '750000000' }))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.nilai).toBe(750_000_000)
  })

  it('tanggal selesai mendahului mulai ditolak', () => {
    const v = validasiKontrak(isiSah({
      tanggal_mulai: '2026-06-01', tanggal_selesai: '2026-01-01',
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/denda keterlambatan/i)
  })

  it('tanggal tanda tangan wajib dan berbentuk YYYY-MM-DD', () => {
    expect(validasiKontrak(isiSah({ tanggal_tanda_tangan: '' })).ok).toBe(false)
    expect(validasiKontrak(isiSah({ tanggal_tanda_tangan: '15-01-2026' })).ok).toBe(false)
  })

  it('retensi di luar 0–100 ditolak', () => {
    expect(validasiKontrak(isiSah({ retensi_pct: -1 })).ok).toBe(false)
    expect(validasiKontrak(isiSah({ retensi_pct: 101 })).ok).toBe(false)
    expect(validasiKontrak(isiSah({ retensi_pct: 5 })).ok).toBe(true)
  })

  it('retensi kosong jadi null, bukan nol', () => {
    // Nol berarti "disepakati tanpa retensi"; null berarti "belum diputuskan".
    const v = validasiKontrak(isiSah({ retensi_pct: '' }))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.retensi_pct).toBeNull()
  })

  it('teks opsional kosong jadi null', () => {
    const v = validasiKontrak(isiSah({ lingkup: '   ', catatan: '' }))
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.nilai.lingkup).toBeNull()
      expect(v.nilai.catatan).toBeNull()
    }
  })
})

describe('transisi status', () => {
  it('draf → berlaku', () => {
    expect(periksaTransisiKontrak({
      statusSekarang: 'draf', statusTujuan: 'berlaku',
    }).boleh).toBe(true)
  })

  it('berlaku → selesai', () => {
    expect(periksaTransisiKontrak({
      statusSekarang: 'berlaku', statusTujuan: 'selesai',
    }).boleh).toBe(true)
  })

  it('draf langsung ke selesai ditolak', () => {
    expect(periksaTransisiKontrak({
      statusSekarang: 'draf', statusTujuan: 'selesai',
    }).boleh).toBe(false)
  })

  it('pembatalan wajib beralasan', () => {
    expect(periksaTransisiKontrak({
      statusSekarang: 'berlaku', statusTujuan: 'dibatalkan',
    }).boleh).toBe(false)
    expect(periksaTransisiKontrak({
      statusSekarang: 'berlaku', statusTujuan: 'dibatalkan', alasanBatal: '   ',
    }).boleh).toBe(false)
    expect(periksaTransisiKontrak({
      statusSekarang: 'berlaku', statusTujuan: 'dibatalkan',
      alasanBatal: 'Klien membatalkan proyek',
    }).boleh).toBe(true)
  })

  it('yang SELESAI tak bisa dibatalkan', () => {
    // Membatalkannya tak menghapus pembayaran yang sudah terjadi.
    const h = periksaTransisiKontrak({
      statusSekarang: 'selesai', statusTujuan: 'dibatalkan', alasanBatal: 'x',
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tak pernah berlaku/i)
  })

  it('yang DIBATALKAN tak bisa dihidupkan kembali', () => {
    const h = periksaTransisiKontrak({
      statusSekarang: 'dibatalkan', statusTujuan: 'berlaku',
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/terbitkan kontrak baru/i)
  })

  it('tak bisa kembali ke draf', () => {
    expect(periksaTransisiKontrak({
      statusSekarang: 'berlaku', statusTujuan: 'draf',
    }).boleh).toBe(false)
  })
})

describe('nilai kontraktual', () => {
  it('induk + addendum positif dan negatif', () => {
    const h = hitungNilaiKontrak([
      k({ nilai: 100_000_000 }),
      k({ jenis: 'addendum', nilai: 25_000_000, kontrak_induk_id: 'a' }),
      k({ jenis: 'addendum', nilai: -5_000_000, kontrak_induk_id: 'a' }),
    ])
    expect(h.awal).toBe(100_000_000)
    expect(h.addendum).toBe(20_000_000)
    expect(h.berjalan).toBe(120_000_000)
    expect(h.jumlahAddendum).toBe(2)
  })

  it('DRAF tak dihitung — rancangan bukan kesepakatan', () => {
    const h = hitungNilaiKontrak([
      k({ nilai: 100_000_000 }),
      k({ jenis: 'addendum', status: 'draf', nilai: 999_000_000, kontrak_induk_id: 'a' }),
    ])
    expect(h.berjalan).toBe(100_000_000)
    expect(h.jumlahAddendum).toBe(0)
  })

  it('yang DIBATALKAN tak dihitung', () => {
    const h = hitungNilaiKontrak([
      k({ nilai: 100_000_000 }),
      k({ jenis: 'addendum', status: 'dibatalkan', nilai: 50_000_000, kontrak_induk_id: 'a' }),
    ])
    expect(h.berjalan).toBe(100_000_000)
  })

  it('yang SELESAI IKUT dihitung — laporan penutupan membacanya', () => {
    const h = hitungNilaiKontrak([
      k({ status: 'selesai', nilai: 100_000_000 }),
      k({ jenis: 'addendum', status: 'selesai', nilai: 10_000_000, kontrak_induk_id: 'a' }),
    ])
    expect(h.berjalan).toBe(110_000_000)
  })

  it('numeric bertipe string (dari pg) tetap terjumlah', () => {
    // `'100' + '25'` menghasilkan '10025' kalau tak dikonversi.
    const h = hitungNilaiKontrak([
      k({ nilai: '100000000' }),
      k({ jenis: 'addendum', nilai: '25000000', kontrak_induk_id: 'a' }),
    ])
    expect(h.berjalan).toBe(125_000_000)
  })

  it('daftar kosong menghasilkan nol, tidak melempar', () => {
    expect(hitungNilaiKontrak([])).toEqual({
      awal: 0, addendum: 0, berjalan: 0, jumlahAddendum: 0,
    })
  })
})

describe('banding nilai dokumen vs jalur uang', () => {
  it('cocok saat sama', () => {
    const b = bandingkanNilai({ menurutKontrak: 120_000_000, menurutProyek: 120_000_000 })
    expect(b.cocok).toBe(true)
    expect(b.selisih).toBe(0)
  })

  it('toleransi 1 sen diterima — pembulatan NUMERIC(15,2)', () => {
    const b = bandingkanNilai({
      menurutKontrak: 120_000_000, menurutProyek: 120_000_000 + EPSILON_KONTRAK,
    })
    expect(b.cocok).toBe(true)
  })

  it('nol kontrak dijelaskan terpisah — bukan "lebih tinggi"', () => {
    // Proyek yang belum punya dokumen kontrak sama sekali menuntut kalimat
    // yang berbeda dari proyek yang dokumennya ada tapi selisih.
    const b = bandingkanNilai({ menurutKontrak: 0, menurutProyek: 500_000_000 })
    expect(b.cocok).toBe(false)
    expect(b.sebab).toMatch(/belum ada kontrak berlaku/i)
  })

  it('selisih PLUS berjelaskan change order bila ada', () => {
    const b = bandingkanNilai({
      menurutKontrak: 100_000_000, menurutProyek: 150_000_000, adaCoBelumAddendum: true,
    })
    expect(b.selisih).toBe(50_000_000)
    expect(b.sebab).toMatch(/belum diaddendumkan/i)
  })

  it('selisih PLUS tanpa change order disebut tak terjelaskan', () => {
    const b = bandingkanNilai({ menurutKontrak: 100_000_000, menurutProyek: 150_000_000 })
    expect(b.sebab).toMatch(/tak ada change order/i)
  })

  it('selisih MINUS disebut sebagai penagihan yang tertinggal', () => {
    const b = bandingkanNilai({ menurutKontrak: 150_000_000, menurutProyek: 100_000_000 })
    expect(b.selisih).toBe(-50_000_000)
    expect(b.sebab).toMatch(/lebih RENDAH/)
  })

  it('numeric string dari pg terbaca', () => {
    const b = bandingkanNilai({ menurutKontrak: 100, menurutProyek: '100' })
    expect(b.cocok).toBe(true)
  })
})
