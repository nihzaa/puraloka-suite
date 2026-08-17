import { describe, it, expect } from 'vitest'
import { susunCsvBupot, normalkanNpwp, KODE_OBJEK, type BarisPajak } from '../ekspor-bupot.js'

/**
 * Ekspor bukti potong — MURNI, tanpa basis.
 *
 * Yang dijaga di sini bukan "fungsinya menghasilkan CSV", melainkan bahwa
 * berkas yang keluar TIDAK PERNAH memuat data karangan. Bukti potong adalah
 * dokumen pajak: yang salah isinya beredar sebagai kewajiban yang salah,
 * sementara yang tak terbit cuma menunggu dilengkapi.
 *
 * Karena itu tiap baris yang tak lengkap harus DITOLAK dengan menyebut
 * sebabnya, bukan dibuang diam-diam dan bukan diisi bawaan.
 */

const dasar: BarisPajak = {
  tax_type: 'pph_final_42',
  base_amount: 100_000_000,
  rate_pct: 2,
  tax_amount: 2_000_000,
  period_month: '2026-08',
  invoice: {
    invoice_number: 'INV/2026/08/001',
    issued_date: '2026-08-05',
    project: {
      name: 'Rumah Bu Sari',
      client: {
        company_name: 'PT Klien Sejahtera',
        contact_person: 'Bu Sari',
        npwp: '01.234.567.8-901.000',
      },
    },
  },
}

const ubah = (p: Partial<BarisPajak>): BarisPajak => ({ ...dasar, ...p })

describe('normalkanNpwp', () => {
  it('membuang titik dan strip — DJP hanya menerima angka murni', () => {
    expect(normalkanNpwp('01.234.567.8-901.000')).toBe('0012345678901000')
  })

  it('NPWP 15 digit diberi awalan 0 (aturan transisi 16 digit)', () => {
    expect(normalkanNpwp('012345678901000')).toBe('0012345678901000')
  })

  it('panjang di luar 15/16 DITOLAK, bukan ditebak', () => {
    // Menebak berarti menerbitkan bukti potong atas NPWP yang tak pernah ada.
    expect(normalkanNpwp('123')).toBeNull()
    expect(normalkanNpwp('012345678901234567890')).toBeNull()
    expect(normalkanNpwp('')).toBeNull()
    expect(normalkanNpwp(null)).toBeNull()
  })
})

describe('susunCsvBupot — baris sah', () => {
  it('menyusun satu baris lengkap dengan masa & tahun DIPISAH', () => {
    const h = susunCsvBupot([dasar])
    expect(h.jumlah).toBe(1)
    expect(h.ditolak).toHaveLength(0)

    const baris = h.csv.trim().split('\r\n')[1]
    // e-Bupot meminta masa (8) dan tahun (2026) sebagai kolom terpisah;
    // menyatukannya membuat berkas ditolak tanpa pesan yang menjelaskan.
    expect(baris).toContain(',8,2026,')
    expect(baris).toContain('0012345678901000')
    expect(baris).toContain(KODE_OBJEK.pph_final_42)
  })

  it('nilai uang DIBULATKAN — DJP menolak desimal pada rupiah', () => {
    const h = susunCsvBupot([ubah({ base_amount: 100_000_000.4, tax_amount: 2_000_000.6 })])
    const baris = h.csv.trim().split('\r\n')[1]
    expect(baris).toContain('100000000')
    expect(baris).toContain('2000001')
    expect(baris).not.toMatch(/\d\.\d/)
  })

  it('BOM UTF-8 ada — tanpanya Excel merusak nama klien sebelum diunggah', () => {
    expect(susunCsvBupot([dasar]).csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('nama berkoma dibungkus kutip — tanpa itu barisnya pecah', () => {
    const h = susunCsvBupot([ubah({
      invoice: { ...dasar.invoice, project: {
        client: { company_name: 'PT Maju, Tbk', npwp: '01.234.567.8-901.000' },
      } },
    })])
    expect(h.jumlah).toBe(1)
    expect(h.csv).toContain('"PT Maju, Tbk"')
    // Baris data tetap SATU baris, bukan dua.
    expect(h.csv.trim().split('\r\n')).toHaveLength(2)
  })

  it('jatuh ke contact_person bila company_name kosong', () => {
    const h = susunCsvBupot([ubah({
      invoice: { ...dasar.invoice, project: {
        client: { company_name: null, contact_person: 'Bu Sari', npwp: '01.234.567.8-901.000' },
      } },
    })])
    expect(h.jumlah).toBe(1)
    expect(h.csv).toContain('Bu Sari')
  })
})

describe('susunCsvBupot — yang DITOLAK, dan sebabnya disebut', () => {
  const kasus: Array<[string, Partial<BarisPajak>, RegExp]> = [
    ['NPWP kosong', {
      invoice: { ...dasar.invoice, project: { client: { company_name: 'PT A', npwp: null } } },
    }, /NPWP/i],
    ['nama klien kosong', {
      invoice: { ...dasar.invoice, project: {
        client: { company_name: null, contact_person: null, npwp: '01.234.567.8-901.000' },
      } },
    }, /nama klien/i],
    ['jenis pajak tak berkode', { tax_type: 'pph_21' }, /kode objek/i],
    ['DPP bukan angka', { base_amount: 'entah' }, /DPP|PPh/i],
    ['masa pajak salah format', { period_month: 'Agustus 2026' }, /masa pajak/i],
  ]

  for (const [nama, patch, pola] of kasus) {
    it(`${nama} → ditolak dengan sebabnya, bukan dibuang diam-diam`, () => {
      const h = susunCsvBupot([ubah(patch)])
      expect(h.jumlah, 'baris tak lengkap IKUT terekspor').toBe(0)
      expect(h.ditolak).toHaveLength(1)
      expect(h.ditolak[0].sebab).toMatch(pola)
      expect(h.ditolak[0].nomor).toBe(1)
    })
  }

  it('yang sah tetap terekspor meski ada tetangganya yang ditolak', () => {
    // Satu baris cacat TIDAK boleh menggagalkan seluruh ekspor — kalau
    // begitu, satu NPWP kosong menahan seluruh pelaporan pajak bulan itu.
    const h = susunCsvBupot([dasar, ubah({ tax_type: 'pph_21' }), dasar])
    expect(h.jumlah).toBe(2)
    expect(h.ditolak).toHaveLength(1)
    expect(h.ditolak[0].nomor).toBe(2)
  })

  it('daftar kosong menghasilkan CSV berjudul saja, bukan melempar', () => {
    const h = susunCsvBupot([])
    expect(h.jumlah).toBe(0)
    expect(h.csv).toContain('NPWP')
  })
})
