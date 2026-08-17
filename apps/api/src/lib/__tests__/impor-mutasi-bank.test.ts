import { describe, it, expect } from 'vitest'
import { uraikanMutasi, angkaBank, tanggalBank, normalkan } from '../impor-mutasi-bank.js'

/**
 * Impor mutasi bank — MURNI, tanpa berkas sungguhan.
 *
 * Berkas bank asli memuat nomor rekening nasabah, jadi ia tak boleh masuk
 * repo. Yang diuji di sini PENAFSIRAN kolomnya, dan itu justru bagian yang
 * menentukan benar-salahnya.
 *
 * Tiga hal yang paling mahal kalau salah:
 *
 *   1. ARAH UANG. Salah tanda membuat selisih rekonsiliasi DUA KALI LIPAT
 *      nominalnya — lalu "diperbaiki" dengan penyesuaian karangan.
 *   2. PEMISAH RIBUAN. `1.234.567` yang ditafsir desimal Inggris jadi 1,23.
 *      Selisih sejuta rupiah dari satu tanda baca.
 *   3. BARIS YANG HILANG. Satu baris terlewat menghasilkan selisih yang
 *      ditutup penyesuaian — dan penyesuaian itulah yang membuat buku tak
 *      lagi bisa dipercaya.
 */

describe('angkaBank — dua gaya penulisan yang sama-sama lazim', () => {
  it('gaya Indonesia: titik ribuan, koma desimal', () => {
    expect(angkaBank('1.234.567,89')).toBeCloseTo(1234567.89, 2)
    expect(angkaBank('1.500')).toBe(1500)
  })

  it('gaya Inggris: koma ribuan, titik desimal', () => {
    expect(angkaBank('1,234,567.89')).toBeCloseTo(1234567.89, 2)
    expect(angkaBank('1,500')).toBe(1500)
  })

  it('tanda kurung = negatif (lazim di ekspor akuntansi)', () => {
    expect(angkaBank('(1.500)')).toBe(-1500)
  })

  it('membuang simbol mata uang', () => {
    expect(angkaBank('Rp 2.500.000')).toBe(2500000)
  })

  it('kosong & garis jadi null, bukan 0 — nol adalah ANGKA, kosong bukan', () => {
    expect(angkaBank('')).toBeNull()
    expect(angkaBank('-')).toBeNull()
    expect(angkaBank(null)).toBeNull()
  })
})

describe('tanggalBank', () => {
  it('menerima ISO dan DD/MM/YYYY', () => {
    expect(tanggalBank('2026-08-17')).toBe('2026-08-17')
    expect(tanggalBank('17/08/2026')).toBe('2026-08-17')
    expect(tanggalBank('5-8-26')).toBe('2026-08-05')
  })

  it('bulan > 12 DITOLAK, bukan ditukar diam-diam', () => {
    // Menukar berarti menebak asal berkasnya — dan tebakan itu menggeser
    // SELURUH tanggal di berkas.
    expect(tanggalBank('08/17/2026')).toBeNull()
  })

  it('yang tak terbaca jadi null', () => {
    expect(tanggalBank('kemarin')).toBeNull()
    expect(tanggalBank('')).toBeNull()
  })
})

describe('uraikanMutasi — tiga bentuk berkas bank', () => {
  it('DUA KOLOM debit/kredit (Mandiri)', () => {
    const h = uraikanMutasi([
      { Tanggal: '01/08/2026', Keterangan: 'Transfer masuk', Debit: '', Kredit: '5.000.000' },
      { Tanggal: '02/08/2026', Keterangan: 'Bayar supplier', Debit: '1.200.000', Kredit: '' },
    ])
    expect(h.ditolak).toHaveLength(0)
    expect(h.baris[0].kredit).toBe(5_000_000)
    expect(h.baris[0].debit).toBe(0)
    expect(h.baris[1].debit).toBe(1_200_000)
  })

  it('NOMINAL + penanda DB/CR (BCA)', () => {
    const h = uraikanMutasi([
      { Tanggal: '01/08/2026', Keterangan: 'Setoran', Mutasi: '5.000.000', 'DB/CR': 'CR' },
      { Tanggal: '02/08/2026', Keterangan: 'Tarik tunai', Mutasi: '750.000', 'DB/CR': 'DB' },
    ])
    expect(h.ditolak).toHaveLength(0)
    expect(h.baris[0].kredit).toBe(5_000_000)
    expect(h.baris[1].debit).toBe(750_000)
  })

  it('SATU KOLOM bertanda minus (BNI)', () => {
    const h = uraikanMutasi([
      { Tanggal: '2026-08-01', Keterangan: 'Terima termin', Nominal: '5000000' },
      { Tanggal: '2026-08-02', Keterangan: 'Bayar upah', Nominal: '-2500000' },
    ])
    expect(h.baris[0].kredit).toBe(5_000_000)
    expect(h.baris[1].debit).toBe(2_500_000)
  })

  it('penanda arah TAK DIKENAL ditolak, bukan ditebak', () => {
    // Inti keamanan modul ini. Menebak arah membuat selisih rekonsiliasi
    // dua kali lipat nominalnya.
    const h = uraikanMutasi([
      { Tanggal: '01/08/2026', Keterangan: 'X', Mutasi: '1.000.000', Tanda: 'XX' },
    ])
    expect(h.baris).toHaveLength(0)
    expect(h.ditolak[0].sebab).toMatch(/arah|DB\/CR/i)
  })

  it('debit DAN kredit sama-sama terisi ditolak — pertanda salah petakan', () => {
    const h = uraikanMutasi([
      { Tanggal: '01/08/2026', Keterangan: 'X', Debit: '100', Kredit: '200' },
    ])
    expect(h.baris).toHaveLength(0)
    expect(h.ditolak[0].sebab).toMatch(/sama-sama terisi|pemetaan/i)
  })
})

describe('uraikanMutasi — yang dilaporkan, bukan disembunyikan', () => {
  it('kolom tanggal hilang → ditolak seluruhnya dengan sebab yang jelas', () => {
    const h = uraikanMutasi([{ Uraian: 'X', Nominal: '1000' }])
    expect(h.baris).toHaveLength(0)
    expect(h.ditolak[0].sebab).toMatch(/TANGGAL/i)
  })

  it('kolom nominal hilang → ditolak, dan menyebut bentuk yang diterima', () => {
    const h = uraikanMutasi([{ Tanggal: '01/08/2026', Keterangan: 'X' }])
    expect(h.baris).toHaveLength(0)
    expect(h.ditolak[0].sebab).toMatch(/Debit\/Kredit|Nominal/i)
  })

  it('baris KOSONG di ujung berkas dilewati tanpa jadi galat', () => {
    // Berkas bank lazim berakhir dengan baris kosong. Melaporkannya sebagai
    // galat membuat daftar tolakan penuh oleh yang bukan data.
    const h = uraikanMutasi([
      { Tanggal: '01/08/2026', Keterangan: 'Ada', Kredit: '1000' },
      { Tanggal: '', Keterangan: '', Kredit: '' },
    ])
    expect(h.baris).toHaveLength(1)
    expect(h.ditolak).toHaveLength(0)
  })

  it('satu baris cacat TIDAK menggagalkan sisanya', () => {
    const h = uraikanMutasi([
      { Tanggal: '01/08/2026', Keterangan: 'A', Kredit: '1000' },
      { Tanggal: 'kemarin', Keterangan: 'B', Kredit: '2000' },
      { Tanggal: '03/08/2026', Keterangan: 'C', Kredit: '3000' },
    ])
    expect(h.baris).toHaveLength(2)
    expect(h.ditolak).toHaveLength(1)
    expect(h.ditolak[0].nomor).toBe(3) // +2: baris 1 judul
  })

  it('pemetaan kolom DILAPORKAN — supaya salah tafsir terlihat', () => {
    const h = uraikanMutasi([
      { 'Tanggal Transaksi': '01/08/2026', Berita: 'X', Kredit: '1000', Saldo: '9000' },
    ])
    expect(h.pemetaan.tanggal).toBe('Tanggal Transaksi')
    expect(h.pemetaan.keterangan).toBe('Berita')
    expect(h.baris[0].saldo).toBe(9000)
  })

  it('daftar kosong tak melempar', () => {
    const h = uraikanMutasi([])
    expect(h.baris).toHaveLength(0)
    expect(h.ditolak).toHaveLength(0)
  })
})

describe('normalkan', () => {
  it('menyamakan gaya penulisan judul kolom', () => {
    expect(normalkan('Tanggal_Transaksi')).toBe('tanggal transaksi')
    expect(normalkan('  DB/CR  ')).toBe('db/cr')
  })
})
