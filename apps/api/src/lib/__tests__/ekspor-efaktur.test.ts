import { describe, it, expect } from 'vitest'
import { susunCsvEfaktur, nsfpSah, npwpFaktur, type BarisFaktur } from '../ekspor-efaktur.js'

/**
 * Ekspor e-Faktur — MURNI, tanpa basis.
 *
 * Yang dijaga: berkas yang keluar TIDAK PERNAH memuat faktur karangan.
 * Faktur Pajak bukan sekadar dokumen — ia memindahkan kewajiban PPN. Yang
 * isinya dikarang membebankan pajak kepada pihak yang tak pernah
 * bertransaksi.
 *
 * Dan satu hal yang hanya bisa dijaga test: URUTAN FK → LT → OF. Importer
 * DJP menempelkan tiap LT/OF ke FK terakhir yang dibacanya, jadi satu baris
 * tertukar membuat seluruh sisa berkas menempel ke faktur yang salah — dan
 * itu tak terlihat sampai SPT-nya ditolak.
 */

const dasar: BarisFaktur = {
  efaktur_number: '0100002600000001',
  base_amount: 100_000_000,
  tax_amount: 11_000_000,
  period_month: '2026-08',
  invoice: {
    invoice_number: 'INV/2026/08/001',
    issued_date: '2026-08-05',
    project: {
      name: 'Rumah Bu Sari',
      client: {
        company_name: 'PT Klien Sejahtera',
        npwp: '01.234.567.8-901.000',
        address: 'Jl. Dago 1, Bandung',
      },
    },
  },
}

const ubah = (p: Partial<BarisFaktur>): BarisFaktur => ({ ...dasar, ...p })

describe('nsfpSah', () => {
  it('menerima 16 digit, dengan atau tanpa pemisah', () => {
    expect(nsfpSah('0100002600000001')).toBe('0100002600000001')
    expect(nsfpSah('010.002-26.00000001')).toBe('0100022600000001')
  })

  it('panjang selain 16 DITOLAK — bukan dipotong, bukan ditambal', () => {
    // Memotong berarti menerbitkan faktur bernomor yang bukan jatahnya.
    expect(nsfpSah('123')).toBeNull()
    expect(nsfpSah('01000026000000012345')).toBeNull()
    expect(nsfpSah(null)).toBeNull()
  })
})

describe('npwpFaktur — sama perilakunya dengan bupot', () => {
  it('15 digit diberi awalan 0, 16 digit apa adanya', () => {
    expect(npwpFaktur('012345678901000')).toBe('0012345678901000')
    expect(npwpFaktur('0012345678901000')).toBe('0012345678901000')
  })

  it('di luar itu ditolak', () => {
    expect(npwpFaktur('123')).toBeNull()
  })
})

describe('susunCsvEfaktur — bentuk berkas', () => {
  it('satu faktur menghasilkan TIGA baris, berurutan FK → LT → OF', () => {
    const h = susunCsvEfaktur([dasar])
    expect(h.jumlah).toBe(1)
    expect(h.ditolak).toHaveLength(0)

    const baris = h.csv.replace('﻿', '').trim().split('\r\n')
    expect(baris).toHaveLength(3)
    expect(baris[0].startsWith('FK,')).toBe(true)
    expect(baris[1].startsWith('LT,')).toBe(true)
    expect(baris[2].startsWith('OF,')).toBe(true)
  })

  it('dua faktur TIDAK saling menyisip — FK,LT,OF,FK,LT,OF', () => {
    // Kalau menyisip, LT faktur kedua menempel ke FK pertama di importer DJP.
    const h = susunCsvEfaktur([dasar, ubah({ efaktur_number: '0100002600000002' })])
    const jenis = h.csv.replace('﻿', '').trim().split('\r\n').map((b) => b.slice(0, 2))
    expect(jenis).toEqual(['FK', 'LT', 'OF', 'FK', 'LT', 'OF'])
  })

  it('masa & tahun DIPISAH di baris FK', () => {
    const fk = susunCsvEfaktur([dasar]).csv.replace('﻿', '').split('\r\n')[0]
    expect(fk).toContain(',08,2026,')
  })

  it('uang DIBULATKAN — DJP menolak desimal', () => {
    const h = susunCsvEfaktur([ubah({ base_amount: 100_000_000.7, tax_amount: 11_000_000.4 })])
    expect(h.csv).toContain('100000001')
    expect(h.csv).toContain('11000000')
    expect(h.csv).not.toMatch(/\d\.\d/)
  })

  it('BOM UTF-8 ada', () => {
    expect(susunCsvEfaktur([dasar]).csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('nama berkoma dibungkus — barisnya tak boleh pecah', () => {
    const h = susunCsvEfaktur([ubah({
      invoice: { ...dasar.invoice, project: {
        client: { company_name: 'PT Maju, Tbk', npwp: '01.234.567.8-901.000' },
      } },
    })])
    expect(h.csv).toContain('"PT Maju, Tbk"')
    expect(h.csv.replace('﻿', '').trim().split('\r\n')).toHaveLength(3)
  })
})

describe('susunCsvEfaktur — yang DITOLAK', () => {
  const kasus: Array<[string, Partial<BarisFaktur>, RegExp]> = [
    ['NSFP kosong', { efaktur_number: null }, /Nomor Seri|e-Nofa/i],
    ['NSFP bukan 16 digit', { efaktur_number: '12345' }, /16 digit|e-Nofa/i],
    ['NPWP pembeli kosong', {
      invoice: { ...dasar.invoice, project: { client: { company_name: 'PT A', npwp: null } } },
    }, /NPWP/i],
    ['nama pembeli kosong', {
      invoice: { ...dasar.invoice, project: {
        client: { company_name: null, contact_person: null, npwp: '01.234.567.8-901.000' },
      } },
    }, /nama pembeli/i],
    ['DPP bukan angka', { base_amount: 'entah' }, /DPP|PPN/i],
    ['masa pajak salah', { period_month: '2026/08' }, /masa pajak/i],
  ]

  for (const [nama, patch, pola] of kasus) {
    it(`${nama} → ditolak dengan sebabnya`, () => {
      const h = susunCsvEfaktur([ubah(patch)])
      expect(h.jumlah, 'faktur cacat IKUT terekspor').toBe(0)
      expect(h.ditolak).toHaveLength(1)
      expect(h.ditolak[0].sebab).toMatch(pola)
    })
  }

  it('satu faktur cacat tak menggagalkan yang lain', () => {
    // Kalau menggagalkan, satu NPWP kosong menahan seluruh pelaporan PPN
    // masa itu — dan denda telat lapor jatuh ke perusahaannya.
    const h = susunCsvEfaktur([dasar, ubah({ efaktur_number: null }),
      ubah({ efaktur_number: '0100002600000003' })])
    expect(h.jumlah).toBe(2)
    expect(h.ditolak).toHaveLength(1)
    expect(h.ditolak[0].nomor).toBe(2)
  })

  it('daftar kosong tak melempar', () => {
    const h = susunCsvEfaktur([])
    expect(h.jumlah).toBe(0)
    expect(h.ditolak).toHaveLength(0)
  })
})
