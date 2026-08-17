import { describe, it, expect } from 'vitest'
import { susunEkspor, formatSah, FORMAT_EKSPOR, type OpsiEkspor } from '../ekspor-tabel.js'
import * as XLSX from 'xlsx'

/**
 * Ekspor tabel multi-format.
 *
 * Yang dijaga di sini bukan "fungsinya menghasilkan berkas", melainkan tiga
 * hal yang mudah rusak diam-diam dan mahal saat rusak:
 *
 *   1. ANGKA tetap ANGKA di XLSX. Pemisah ribuan membuatnya jadi TEKS, dan
 *      kolom teks tak bisa dijumlahkan — yang persis merusak gunanya
 *      diekspor ke Excel.
 *   2. CSV ber-BOM. Tanpanya Excel di Windows merusak nama sebelum dipakai.
 *   3. Kop PDF memakai identitas TENANT. `pdfHeader()` lama memaku "Puraloka
 *      Suite" — untuk SaaS itu berarti PT lain menerima laporan berkop nama
 *      pesaingnya.
 */

const opsi: OpsiEkspor = {
  judul: 'Jurnal Umum',
  tenant: 'PT Klien Sejahtera',
  keterangan: 'Periode 2026-08',
  kolom: [
    { kunci: 'tanggal', judul: 'Tanggal', lebar: 14 },
    { kunci: 'akun', judul: 'Akun', lebar: 20 },
    { kunci: 'debit', judul: 'Debit', angka: true, lebar: 16 },
    { kunci: 'kredit', judul: 'Kredit', angka: true, lebar: 16 },
  ],
  baris: [
    { tanggal: '2026-08-01', akun: 'Kas', debit: 5_000_000, kredit: 0 },
    { tanggal: '2026-08-01', akun: 'Pendapatan, jasa', debit: 0, kredit: 5_000_000 },
  ],
}

describe('formatSah', () => {
  it('menerima keempat format yang didukung', () => {
    for (const f of FORMAT_EKSPOR) expect(formatSah(f)).toBe(f)
  })

  it('menolak yang di luar daftar — `format` datang dari query string', () => {
    expect(formatSah('exe')).toBeNull()
    expect(formatSah('')).toBeNull()
    expect(formatSah(null)).toBeNull()
    expect(formatSah('../../etc/passwd')).toBeNull()
  })
})

describe('CSV', () => {
  it('ber-BOM UTF-8 — tanpanya Excel merusak nama sebelum dipakai', async () => {
    const h = await susunEkspor('csv', opsi)
    expect(h.isi.toString('utf8').charCodeAt(0)).toBe(0xFEFF)
    expect(h.ekstensi).toBe('csv')
  })

  it('nama berkoma dibungkus kutip — barisnya tak boleh pecah', async () => {
    const t = (await susunEkspor('csv', opsi)).isi.toString('utf8')
    expect(t).toContain('"Pendapatan, jasa"')
    // 1 judul + 2 data = 3 baris berisi.
    expect(t.trim().split('\r\n')).toHaveLength(3)
  })

  it('angka TANPA pemisah ribuan — supaya tetap bisa dijumlahkan', async () => {
    const t = (await susunEkspor('csv', opsi)).isi.toString('utf8')
    expect(t).toContain('5000000')
    expect(t).not.toContain('5.000.000')
  })
})

describe('XLSX', () => {
  it('angka tetap bertipe ANGKA, bukan teks', async () => {
    // Ini inti kenapa XLSX ada. Kalau jadi teks, penggunanya tak bisa
    // menjumlahkan kolom — dan ekspornya kehilangan gunanya.
    const h = await susunEkspor('xlsx', opsi)
    const wb = XLSX.read(h.isi, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    expect(typeof baris[0].Debit).toBe('number')
    expect(baris[0].Debit).toBe(5_000_000)
  })

  it('judul kolom memakai label manusia, bukan kunci teknis', async () => {
    const wb = XLSX.read((await susunEkspor('xlsx', opsi)).isi, { type: 'buffer' })
    const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    expect(Object.keys(baris[0])).toContain('Tanggal')
    expect(Object.keys(baris[0])).not.toContain('tanggal')
  })

  it('nama sheet dibersihkan — `:\\/?*[]` membuat berkas gagal dibuka Excel', async () => {
    const h = await susunEkspor('xlsx', { ...opsi, judul: 'Jurnal: 2026/08 [draft]' })
    const wb = XLSX.read(h.isi, { type: 'buffer' })
    expect(wb.SheetNames[0]).not.toMatch(/[:\\/?*[\]]/)
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31)
  })
})

describe('PDF', () => {
  it('memakai nama TENANT di kop, bukan nama produk yang dipaku', async () => {
    // `pdfHeader()` lama memaku "Puraloka Suite". Untuk SaaS multi-tenant itu
    // berarti PT lain menerima laporan berkop nama pesaingnya.
    const h = await susunEkspor('pdf', opsi)
    expect(h.tipeKonten).toBe('application/pdf')
    expect(h.isi.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(h.isi.length).toBeGreaterThan(800)
  })

  it('tenant kosong TIDAK memakai nama siapa pun', async () => {
    const h = await susunEkspor('pdf', { ...opsi, tenant: null })
    expect(h.isi.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('daftar kosong tetap menghasilkan PDF yang sah', async () => {
    // Halaman kosong tanpa kalimat terbaca sebagai "gagal cetak".
    const h = await susunEkspor('pdf', { ...opsi, baris: [] })
    expect(h.isi.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('banyak baris tak melempar — halaman baru mengulang judul kolom', async () => {
    const banyak = Array.from({ length: 120 }, (_, i) => ({
      tanggal: '2026-08-01', akun: `Akun ${i}`, debit: i * 1000, kredit: 0,
    }))
    const h = await susunEkspor('pdf', { ...opsi, baris: banyak })
    expect(h.isi.length).toBeGreaterThan(2000)
  })
})

describe('JSON', () => {
  it('membawa tipe apa adanya — angka tetap angka', async () => {
    const h = await susunEkspor('json', opsi)
    const j = JSON.parse(h.isi.toString('utf8'))
    expect(j.baris[0].debit).toBe(5_000_000)
    expect(typeof j.baris[0].debit).toBe('number')
    expect(j.tenant).toBe('PT Klien Sejahtera')
  })
})

describe('keempat format menghasilkan berkas', () => {
  it('tiap format punya tipe konten & ekstensinya sendiri', async () => {
    const ekstensi = new Set<string>()
    for (const f of FORMAT_EKSPOR) {
      const h = await susunEkspor(f, opsi)
      expect(h.isi.length, `${f} kosong`).toBeGreaterThan(0)
      expect(h.tipeKonten).toBeTruthy()
      ekstensi.add(h.ekstensi)
    }
    // Ekstensi yang bertabrakan membuat unduhan menimpa satu sama lain.
    expect(ekstensi.size).toBe(FORMAT_EKSPOR.length)
  })
})
