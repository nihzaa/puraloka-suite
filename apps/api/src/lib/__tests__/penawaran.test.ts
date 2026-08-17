import { describe, it, expect } from 'vitest'
import {
  angkaSah, terbilangRupiah, jumlahBaris, hitungPenawaran, periksaKirimPenawaran,
} from '../penawaran.js'

// ═══════════════════════════════════════════════════════════════════════════
// DOKUMEN PENAWARAN
//
// Dua hal yang dijaga paling keras di sini, dan keduanya soal ANGKA YANG
// MENGIKAT:
//
//   1. **Terbilang.** Surat penawaran menuliskan nilainya dua kali — angka
//      dan kata. Dalam praktik komersial, YANG TERTULIS HURUF yang dipegang
//      saat keduanya berbeda. Jadi hurufnya wajib lahir dari angka yang sama
//      yang dicetak, bukan diketik terpisah.
//
//   2. **Urutan diskon & PPN.** Pajak dikenakan pada dasar SESUDAH diskon.
//      Menukarnya membuat pajak dihitung atas nilai yang tak pernah ditagih,
//      dan pada penawaran ratusan juta selisihnya jutaan.
// ═══════════════════════════════════════════════════════════════════════════

describe('terbilang — aturan "se-" yang sering salah', () => {
  it('11–19 memakai "belas", bukan "satu belas"', () => {
    expect(terbilangRupiah(11)).toBe('Sebelas rupiah')
    expect(terbilangRupiah(12)).toBe('Dua belas rupiah')
    expect(terbilangRupiah(19)).toBe('Sembilan belas rupiah')
  })

  it('100 adalah "seratus", bukan "satu ratus"', () => {
    expect(terbilangRupiah(100)).toBe('Seratus rupiah')
    expect(terbilangRupiah(150)).toBe('Seratus lima puluh rupiah')
    // 200 kembali memakai angkanya.
    expect(terbilangRupiah(200)).toBe('Dua ratus rupiah')
  })

  it('1.000 adalah "seribu", 2.000 adalah "dua ribu"', () => {
    expect(terbilangRupiah(1_000)).toBe('Seribu rupiah')
    expect(terbilangRupiah(1_500)).toBe('Seribu lima ratus rupiah')
    expect(terbilangRupiah(2_000)).toBe('Dua ribu rupiah')
  })

  it('nilai penawaran sungguhan terbaca benar', () => {
    // Angka yang benar-benar muncul di surat penawaran konstruksi.
    expect(terbilangRupiah(1_250_000_000))
      .toBe('Satu miliar dua ratus lima puluh juta rupiah')
    expect(terbilangRupiah(487_500_000))
      .toBe('Empat ratus delapan puluh tujuh juta lima ratus ribu rupiah')
    expect(terbilangRupiah(2_750_000))
      .toBe('Dua juta tujuh ratus lima puluh ribu rupiah')
  })

  it('miliar dan triliun', () => {
    expect(terbilangRupiah(1_000_000_000)).toBe('Satu miliar rupiah')
    expect(terbilangRupiah(1_000_000_000_000)).toBe('Satu triliun rupiah')
  })

  it('nol dan negatif punya kata sendiri, bukan string kosong', () => {
    expect(terbilangRupiah(0)).toBe('Nol rupiah')
    expect(terbilangRupiah(-500)).toBe('Minus lima ratus rupiah')
    // Surat dengan terbilang kosong terbaca seperti dokumen rusak.
    expect(terbilangRupiah(Number.NaN)).toBe('Nol rupiah')
  })

  it('sen DIBULATKAN, tidak dibuang', () => {
    // Angka yang dicetak juga dibulatkan; dua pembulatan berbeda membuat
    // angka dan huruf di surat yang sama tidak cocok.
    expect(terbilangRupiah(1_000.4)).toBe('Seribu rupiah')
    expect(terbilangRupiah(1_000.6)).toBe('Seribu satu rupiah')
  })
})

describe('angkaSah', () => {
  it('kosong dan sampah jadi null, bukan 0', () => {
    // 0 akan terhitung sebagai harga nol — dan baris berharga nol di surat
    // penawaran adalah pekerjaan yang diberikan gratis tanpa ada yang sadar.
    expect(angkaSah('')).toBeNull()
    expect(angkaSah('   ')).toBeNull()
    expect(angkaSah('abc')).toBeNull()
    expect(angkaSah(null)).toBeNull()
    expect(angkaSah(undefined)).toBeNull()
  })

  it('angka dan string angka diterima', () => {
    expect(angkaSah(12.5)).toBe(12.5)
    expect(angkaSah('12.5')).toBe(12.5)
    expect(angkaSah(0)).toBe(0)
  })
})

describe('jumlahBaris', () => {
  it('volume × harga satuan', () => {
    expect(jumlahBaris({ uraian: 'x', volume: 120, harga_satuan: 185_000 }))
      .toBe(22_200_000)
  })

  it('salah satu kosong → 0, bukan NaN', () => {
    // NaN merambat ke subtotal, lalu ke total, lalu tercetak "NaN" di surat.
    expect(jumlahBaris({ uraian: 'x', volume: null, harga_satuan: 185_000 })).toBe(0)
    expect(jumlahBaris({ uraian: 'x', volume: 120, harga_satuan: '' })).toBe(0)
  })
})

describe('hitungPenawaran — urutan diskon & pajak', () => {
  const baris = [
    { uraian: 'Pekerjaan pondasi', satuan: 'm3', volume: 120, harga_satuan: 1_000_000 },
    { uraian: 'Pekerjaan struktur', satuan: 'm2', volume: 400, harga_satuan: 500_000 },
  ]

  it('subtotal menjumlah seluruh baris', () => {
    const h = hitungPenawaran({ baris })
    expect(h.subtotal).toBe(320_000_000)
  })

  it('PPN dikenakan SESUDAH diskon, bukan sebelum', () => {
    const h = hitungPenawaran({ baris, diskon: 20_000_000, ppn_persen: 11 })
    expect(h.dpp).toBe(300_000_000)
    // 11% dari 300jt = 33jt. Kalau urutannya tertukar: 11% dari 320jt = 35,2jt
    // — pajak atas nilai yang tak pernah ditagih.
    expect(h.ppn).toBe(33_000_000)
    expect(h.total).toBe(333_000_000)
  })

  it('tanpa PPN, total sama dengan DPP', () => {
    const h = hitungPenawaran({ baris, diskon: 20_000_000 })
    expect(h.total).toBe(300_000_000)
  })

  it('diskon melebihi subtotal DIBATASI, tidak menghasilkan total negatif', () => {
    // Total negatif = surat penawaran yang menyatakan kita MEMBAYAR klien.
    const h = hitungPenawaran({ baris, diskon: 999_000_000, ppn_persen: 11 })
    expect(h.diskon).toBe(320_000_000)
    expect(h.dpp).toBe(0)
    expect(h.ppn).toBe(0)
    expect(h.total).toBe(0)
  })

  it('diskon negatif dianggap nol, bukan menambah', () => {
    const h = hitungPenawaran({ baris, diskon: -5_000_000 })
    expect(h.diskon).toBe(0)
    expect(h.total).toBe(320_000_000)
  })

  it('terbilang MENGIKUTI totalnya, bukan subtotal', () => {
    const h = hitungPenawaran({ baris, diskon: 20_000_000, ppn_persen: 11 })
    // Yang mengikat adalah yang tertulis huruf — ia harus menyebut angka
    // yang sama dengan yang tercetak sebagai total.
    expect(h.terbilang).toBe('Tiga ratus tiga puluh tiga juta rupiah')
  })

  it('baris kosong tak menghasilkan NaN', () => {
    const h = hitungPenawaran({ baris: [{ uraian: 'Belum diisi' }] })
    expect(h.subtotal).toBe(0)
    expect(h.total).toBe(0)
    expect(h.terbilang).toBe('Nol rupiah')
  })
})

describe('periksaKirimPenawaran', () => {
  const sah = {
    nomor: '001/PEN/VIII/2026',
    tanggal: '2026-08-16',
    berlaku_sampai: '2026-09-15',
    baris: [{ uraian: 'Pekerjaan pondasi', volume: 1, harga_satuan: 1000 }],
  }

  it('lengkap: boleh dikirim', () => {
    expect(periksaKirimPenawaran(sah).ok).toBe(true)
  })

  it('tanpa nomor surat ditolak, dan sebabnya menyebut akibatnya', () => {
    const v = periksaKirimPenawaran({ ...sah, nomor: '  ' })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.galat).toMatch(/dirujuk di korespondensi/i)
  })

  it('tanpa baris rincian ditolak', () => {
    // Yang tak tertulis akan jadi klaim tambah di tengah pekerjaan.
    const v = periksaKirimPenawaran({ ...sah, baris: [] })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.galat).toMatch(/klaim tambah/i)
  })

  it('baris yang uraiannya kosong tak dihitung sebagai rincian', () => {
    const v = periksaKirimPenawaran({ ...sah, baris: [{ uraian: '   ' }] })
    expect(v.ok).toBe(false)
  })

  it('tanpa masa berlaku ditolak', () => {
    const v = periksaKirimPenawaran({ ...sah, berlaku_sampai: null })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.galat).toMatch(/kenaikan harga material/i)
  })

  it('masa berlaku sebelum tanggal surat ditolak', () => {
    const v = periksaKirimPenawaran({ ...sah, berlaku_sampai: '2026-08-01' })
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.galat).toMatch(/berakhir sebelum/i)
  })
})
