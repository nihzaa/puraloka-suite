import { describe, it, expect } from 'vitest'
import {
  susunJurnalInvoice, susunJurnalPembayaran, petaWajibInvoice,
  periksaKesiapanPeta, PETA_MINIMUM,
  type InvoiceUntukJurnal, type PembayaranUntukJurnal, type PetaAkun,
} from '../penjurnalan-otomatis.js'

const PETA: PetaAkun = {
  pendapatan_termin: 'ak-pendapatan',
  piutang_usaha: 'ak-piutang',
  retensi_ditahan: 'ak-retensi',
  uang_muka_klien: 'ak-uangmuka',
  ppn_keluaran: 'ak-ppn',
  pph_final: 'ak-pph',
  kas_bank: 'ak-bank',
}

function invoice(p: Partial<InvoiceUntukJurnal> = {}): InvoiceUntukJurnal {
  return {
    id: 'i1', invoice_number: 'INV/001', issued_date: '2026-08-01',
    base_amount: 100_000_000, commission_amount: 0, tax_amount: 2_000_000,
    retensi_amount: 0, dp_deduction_amount: 0, total_amount: 102_000_000,
    tax_scheme: 'pph_final', ...p,
  }
}

function bayar(p: Partial<PembayaranUntukJurnal> = {}): PembayaranUntukJurnal {
  return {
    id: 'b1', invoice_id: 'i1', invoice_number: 'INV/001',
    amount_paid: 50_000_000, paid_at: '2026-08-10', cash_account_id: null, ...p,
  }
}

/** Jurnal HARUS seimbang — dan itu diperiksa di tiap kasus, bukan sekali. */
function seimbang(h: ReturnType<typeof susunJurnalInvoice>) {
  if ('galat' in h) throw new Error('tak tersusun: ' + h.galat)
  const d = h.baris.reduce((a, b) => a + b.debit, 0)
  const k = h.baris.reduce((a, b) => a + b.credit, 0)
  expect(Math.round(d * 100) / 100).toBe(Math.round(k * 100) / 100)
  return h
}

describe('MENOLAK bekerja sampai petanya diisi', () => {
  it('peta KOSONG menolak, menyebut yang kurang', () => {
    const h = susunJurnalInvoice(invoice(), {})
    expect('galat' in h).toBe(true)
    if (!('galat' in h)) return
    expect(h.galat).toMatch(/salah dengan meyakinkan/)
    expect(h.kurang).toContain('pendapatan_termin')
    expect(h.kurang).toContain('piutang_usaha')
  })

  it('peta setengah lengkap juga menolak', () => {
    const h = susunJurnalInvoice(invoice(), { pendapatan_termin: 'x' })
    expect('galat' in h).toBe(true)
    if (!('galat' in h)) return
    expect(h.kurang).toContain('piutang_usaha')
    expect(h.kurang).not.toContain('pendapatan_termin')
  })

  it('TIDAK menebak akun bawaan', () => {
    // Kalau modul ini pernah memakai bawaan, hasilnya akan tersusun — dan
    // laporan keuangannya salah tanpa ada yang membantah.
    const h = susunJurnalInvoice(invoice(), {})
    expect('baris' in h).toBe(false)
  })
})

describe('petaWajibInvoice — hanya menuntut yang memang dipakai', () => {
  it('invoice polos hanya butuh pendapatan + piutang + pajaknya', () => {
    const w = petaWajibInvoice(invoice({ tax_amount: 0 }))
    expect(w).toEqual(['pendapatan_termin', 'piutang_usaha'])
  })

  it('retensi hanya wajib bila invoice-nya BERRETENSI', () => {
    expect(petaWajibInvoice(invoice({ retensi_amount: 0 })))
      .not.toContain('retensi_ditahan')
    expect(petaWajibInvoice(invoice({ retensi_amount: 5_000_000 })))
      .toContain('retensi_ditahan')
  })

  it('uang muka hanya wajib bila ada potongannya', () => {
    expect(petaWajibInvoice(invoice({ dp_deduction_amount: 10_000_000 })))
      .toContain('uang_muka_klien')
  })

  it('skema PPN menuntut akun PPN, skema PPh menuntut akun PPh', () => {
    expect(petaWajibInvoice(invoice({ tax_scheme: 'ppn' }))).toContain('ppn_keluaran')
    expect(petaWajibInvoice(invoice({ tax_scheme: 'ppn' }))).not.toContain('pph_final')
    expect(petaWajibInvoice(invoice({ tax_scheme: 'pph_final' }))).toContain('pph_final')
    expect(petaWajibInvoice(invoice({ tax_scheme: 'pph_final' }))).not.toContain('ppn_keluaran')
  })

  it('pajak NOL tak menuntut akun pajak sama sekali', () => {
    const w = petaWajibInvoice(invoice({ tax_amount: 0 }))
    expect(w).not.toContain('pph_final')
    expect(w).not.toContain('ppn_keluaran')
  })
})

describe('invoice PPh final — pajak jadi BEBAN (didebit)', () => {
  it('jurnalnya seimbang dan PPh di sisi DEBIT', () => {
    const h = seimbang(susunJurnalInvoice(invoice(), PETA))
    if ('galat' in h) return
    const pph = h.baris.find((b) => b.account_id === 'ak-pph')!
    expect(pph.debit).toBe(2_000_000)
    expect(pph.credit).toBe(0)
  })

  it('pendapatan dikredit sebesar nilai pekerjaan, TANPA pajak', () => {
    const h = seimbang(susunJurnalInvoice(invoice(), PETA))
    if ('galat' in h) return
    const pend = h.baris.find((b) => b.account_id === 'ak-pendapatan')!
    // 100 jt, bukan 102 jt: PPh final bukan pendapatan.
    expect(pend.credit).toBe(100_000_000)
  })

  it('piutang = pendapatan − PPh (yang benar-benar akan diterima)', () => {
    const h = seimbang(susunJurnalInvoice(invoice(), PETA))
    if ('galat' in h) return
    const piut = h.baris.find((b) => b.account_id === 'ak-piutang')!
    expect(piut.debit).toBe(98_000_000)
  })

  it('komisi ikut jadi pendapatan', () => {
    const h = seimbang(susunJurnalInvoice(
      invoice({ base_amount: 224_000_000, commission_amount: 24_000_000, tax_amount: 4_480_000 }),
      PETA))
    if ('galat' in h) return
    const pend = h.baris.find((b) => b.account_id === 'ak-pendapatan')!
    expect(pend.credit).toBe(248_000_000)
    expect(pend.keterangan).toMatch(/termasuk komisi/)
  })
})

describe('invoice PPN — pajak jadi TITIPAN (dikredit)', () => {
  it('PPN di sisi KREDIT, bukan debit', () => {
    // Bedanya menentukan: PPN yang didebit akan terhitung beban dan
    // mengurangi laba — padahal ia titipan pelanggan untuk negara.
    const h = seimbang(susunJurnalInvoice(
      invoice({ tax_scheme: 'ppn', tax_amount: 11_000_000 }), PETA))
    if ('galat' in h) return
    const ppn = h.baris.find((b) => b.account_id === 'ak-ppn')!
    expect(ppn.credit).toBe(11_000_000)
    expect(ppn.debit).toBe(0)
    expect(h.baris.find((b) => b.account_id === 'ak-pph')).toBeUndefined()
  })

  it('piutang = pendapatan + PPN (klien membayar keduanya)', () => {
    const h = seimbang(susunJurnalInvoice(
      invoice({ tax_scheme: 'ppn', tax_amount: 11_000_000 }), PETA))
    if ('galat' in h) return
    const piut = h.baris.find((b) => b.account_id === 'ak-piutang')!
    expect(piut.debit).toBe(111_000_000)
  })
})

describe('retensi — ASET yang didebit, bukan pengurang pendapatan', () => {
  it('retensi didebit, dan pendapatan TETAP penuh', () => {
    const h = seimbang(susunJurnalInvoice(
      invoice({ retensi_amount: 5_000_000, tax_amount: 0 }), PETA))
    if ('galat' in h) return
    const ret = h.baris.find((b) => b.account_id === 'ak-retensi')!
    const pend = h.baris.find((b) => b.account_id === 'ak-pendapatan')!
    expect(ret.debit).toBe(5_000_000)
    // Pendapatan TIDAK berkurang — pekerjaannya sudah selesai.
    expect(pend.credit).toBe(100_000_000)
  })

  it('piutang berkurang sebesar retensi', () => {
    const h = seimbang(susunJurnalInvoice(
      invoice({ retensi_amount: 5_000_000, tax_amount: 0 }), PETA))
    if ('galat' in h) return
    expect(h.baris.find((b) => b.account_id === 'ak-piutang')!.debit).toBe(95_000_000)
  })
})

describe('potongan uang muka — MELUNASI liabilitas', () => {
  it('uang muka didebit, piutang berkurang', () => {
    const h = seimbang(susunJurnalInvoice(
      invoice({ dp_deduction_amount: 20_000_000, tax_amount: 0 }), PETA))
    if ('galat' in h) return
    expect(h.baris.find((b) => b.account_id === 'ak-uangmuka')!.debit).toBe(20_000_000)
    expect(h.baris.find((b) => b.account_id === 'ak-piutang')!.debit).toBe(80_000_000)
  })

  it('retensi + uang muka + pajak bersamaan tetap seimbang', () => {
    const h = seimbang(susunJurnalInvoice(invoice({
      base_amount: 200_000_000, tax_amount: 4_000_000,
      retensi_amount: 10_000_000, dp_deduction_amount: 40_000_000,
    }), PETA))
    if ('galat' in h) return
    // 200jt kredit = 4jt PPh + 10jt retensi + 40jt DP + 146jt piutang
    expect(h.baris.find((b) => b.account_id === 'ak-piutang')!.debit).toBe(146_000_000)
  })
})

describe('menolak nominal yang TAK TERBAKA — bukan menganggapnya nol', () => {
  it("base_amount string KOSONG ditolak — `Number('')` adalah 0", () => {
    // Mutasi membuktikan melepas penjaga string-kosong tetap hijau di banyak
    // tempat, karena `Number('')` memang 0. Yang membedakan: pesannya.
    // Tanpa penjaga itu, `''` jadi 0 dan tertangkap penjaga `<= 0` — yang
    // pesannya menyebut "nol", padahal masalahnya "belum diisi".
    //
    // Dan pada medan OPSIONAL bedanya lebih tajam lagi: lihat test berikutnya.
    const h = susunJurnalInvoice(invoice({ base_amount: '' }), PETA)
    expect('galat' in h).toBe(true)
  })

  it("retensi string KOSONG diperlakukan NOL, tetapi teks ditolak", () => {
    // Inilah yang benar-benar membedakan `null` dari 0 di modul ini:
    // `angkaAtauNol` mengembalikan 0 untuk kosong (medan opsional memang
    // boleh kosong), tetapi `null` untuk teks — dan `null` MENOLAK jurnalnya.
    const kosong = susunJurnalInvoice(
      invoice({ retensi_amount: '', tax_amount: 0 }), PETA)
    expect('baris' in kosong).toBe(true)

    const teks = susunJurnalInvoice(
      invoice({ retensi_amount: 'lima juta', tax_amount: 0 }), PETA)
    expect('galat' in teks).toBe(true)
  })

  it('base_amount nol ditolak oleh penjaganya SENDIRI', () => {
    // Mutasi membuktikan test versi pertama hijau lewat JALUR YANG SALAH:
    // `base 0 + pajak 2jt` tertangkap penjaga "piutang negatif", bukan
    // penjaga `dasar <= 0`. Melepas `<= 0` tetap hijau.
    //
    // Yang membedakan: invoice bernilai nol TANPA komponen lain — di situ
    // tak ada penjaga lain yang bisa menangkapnya, dan tanpa `<= 0` ia akan
    // menghasilkan jurnal kosong yang "berhasil".
    const h = susunJurnalInvoice(
      invoice({ base_amount: 0, tax_amount: 0, retensi_amount: 0, dp_deduction_amount: 0 }),
      PETA)
    expect('galat' in h).toBe(true)
    if (!('galat' in h)) return
    expect(h.galat).toMatch(/tak terbaca atau nol/)
    expect(h.galat).not.toMatch(/piutang negatif/)
  })

  it('base_amount negatif juga ditolak', () => {
    const h = susunJurnalInvoice(
      invoice({ base_amount: -5_000_000, tax_amount: 0 }), PETA)
    expect('galat' in h).toBe(true)
  })

  it('pajak berupa TEKS ditolak — bukan dihitung nol', () => {
    // Kalau dianggap nol, jurnalnya SEIMBANG tetapi SALAH — dan
    // `trg_gl_wajib_seimbang` tak akan menangkapnya.
    const h = susunJurnalInvoice(invoice({ tax_amount: 'dua juta' }), PETA)
    expect('galat' in h).toBe(true)
    if (!('galat' in h)) return
    expect(h.galat).toMatch(/seimbang tetapi salah/)
  })

  it('retensi berupa teks ditolak', () => {
    const h = susunJurnalInvoice(invoice({ retensi_amount: 'lima persen' }), PETA)
    expect('galat' in h).toBe(true)
  })

  it('medan opsional yang NULL diperlakukan nol — itu memang kosong', () => {
    const h = seimbang(susunJurnalInvoice(
      invoice({ retensi_amount: null, dp_deduction_amount: null, tax_amount: 0 }), PETA))
    if ('galat' in h) return
    expect(h.baris.find((b) => b.account_id === 'ak-retensi')).toBeUndefined()
  })
})

describe('menolak jurnal yang tak masuk akal', () => {
  it('retensi + DP melebihi nilai tagihan ditolak', () => {
    const h = susunJurnalInvoice(invoice({
      base_amount: 10_000_000, tax_amount: 0,
      retensi_amount: 8_000_000, dp_deduction_amount: 5_000_000,
    }), PETA)
    expect('galat' in h).toBe(true)
    if (!('galat' in h)) return
    expect(h.galat).toMatch(/piutang negatif/)
  })

  it('piutang NOL (habis dipotong) tetap sah — barisnya dihilangkan', () => {
    const h = seimbang(susunJurnalInvoice(invoice({
      base_amount: 10_000_000, tax_amount: 0, dp_deduction_amount: 10_000_000,
    }), PETA))
    if ('galat' in h) return
    // Baris piutang nol tak ditulis — `jel_debit_xor_credit` menolak baris
    // yang debit dan kreditnya sama-sama nol.
    expect(h.baris.find((b) => b.account_id === 'ak-piutang')).toBeUndefined()
    expect(h.total_debit).toBe(10_000_000)
  })
})

describe('susunJurnalPembayaran — pendapatan TIDAK disentuh', () => {
  it('kas didebit, piutang dikredit, tak ada pendapatan', () => {
    const h = susunJurnalPembayaran(bayar(), PETA)
    expect('baris' in h).toBe(true)
    if (!('baris' in h)) return
    expect(h.baris).toHaveLength(2)
    // Mengakui pendapatan lagi di sini adalah PENGGANDAAN — dan jurnalnya
    // tetap seimbang, jadi tak ada invariant yang menangkapnya.
    expect(h.baris.find((b) => b.account_id === 'ak-pendapatan')).toBeUndefined()
    expect(h.baris.find((b) => b.account_id === 'ak-bank')!.debit).toBe(50_000_000)
    expect(h.baris.find((b) => b.account_id === 'ak-piutang')!.credit).toBe(50_000_000)
  })

  it('akun kas dari pembayaran MENANG atas peta', () => {
    const h = susunJurnalPembayaran(bayar({ cash_account_id: 'ak-kas-proyek' }), PETA)
    if (!('baris' in h)) return
    expect(h.baris.find((b) => b.account_id === 'ak-kas-proyek')).toBeTruthy()
    expect(h.baris.find((b) => b.account_id === 'ak-bank')).toBeUndefined()
  })

  it('tanpa akun kas mana pun ditolak', () => {
    const h = susunJurnalPembayaran(bayar(), { piutang_usaha: 'ak-piutang' })
    expect('galat' in h).toBe(true)
    if (!('galat' in h)) return
    expect(h.kurang).toContain('kas_bank')
  })

  it('pembayaran ber-cash_account TIDAK menuntut peta kas_bank', () => {
    const h = susunJurnalPembayaran(
      bayar({ cash_account_id: 'ak-kas-proyek' }), { piutang_usaha: 'ak-piutang' })
    expect('baris' in h).toBe(true)
  })

  it('nilai nol atau tak terbaca ditolak', () => {
    expect('galat' in susunJurnalPembayaran(bayar({ amount_paid: 0 }), PETA)).toBe(true)
    expect('galat' in susunJurnalPembayaran(bayar({ amount_paid: '' }), PETA)).toBe(true)
    expect('galat' in susunJurnalPembayaran(bayar({ amount_paid: 'lima juta' }), PETA)).toBe(true)
  })
})

describe('periksaKesiapanPeta — kosong berbeda dari belum lengkap', () => {
  it('peta KOSONG menjawab null, bukan false', () => {
    // `false` berarti "ada yang tertinggal"; `null` berarti "belum pernah
    // ditetapkan". Layar mengatakan hal berbeda untuk keduanya.
    const k = periksaKesiapanPeta({})
    expect(k.siap).toBeNull()
    expect(k.kurang).toEqual(PETA_MINIMUM)
  })

  it('peta setengah menjawab false beserta yang kurang', () => {
    const k = periksaKesiapanPeta({ pendapatan_termin: 'x' })
    expect(k.siap).toBe(false)
    expect(k.kurang).toContain('piutang_usaha')
    expect(k.ditetapkan).toEqual(['pendapatan_termin'])
  })

  it('peta minimum lengkap menjawab true', () => {
    const k = periksaKesiapanPeta({
      pendapatan_termin: 'a', piutang_usaha: 'b', kas_bank: 'c',
    })
    expect(k.siap).toBe(true)
    expect(k.kurang).toEqual([])
  })

  it('retensi & pajak TIDAK termasuk minimum', () => {
    // Menuntutnya akan menghalangi perusahaan yang tak pernah memakai
    // retensi — dan mereka tetap berhak menjurnalkan invoice biasa.
    expect(PETA_MINIMUM).not.toContain('retensi_ditahan')
    expect(PETA_MINIMUM).not.toContain('ppn_keluaran')
  })

  it('nilai kosong tak dihitung sebagai ditetapkan', () => {
    const k = periksaKesiapanPeta({ pendapatan_termin: '' })
    expect(k.siap).toBeNull()
  })
})

describe('pembulatan mengikuti numeric(18,2)', () => {
  it('nominal berdesimal tetap seimbang', () => {
    const h = seimbang(susunJurnalInvoice(invoice({
      base_amount: '33333333.33', tax_amount: '666666.67', retensi_amount: 0,
    }), PETA))
    if ('galat' in h) return
    expect(h.total_debit).toBe(h.total_kredit)
  })

  it('numeric STRING dari Postgres dibaca benar', () => {
    const h = seimbang(susunJurnalInvoice(invoice({
      base_amount: '100000000.00', tax_amount: '2000000.00',
    }), PETA))
    if ('galat' in h) return
    expect(h.total_kredit).toBe(100_000_000)
  })
})
