import { describe, it, expect } from 'vitest'
import { susunPesanPo, nomorWa, tautanWa, rupiah, type DataPesanPo } from '../pesan-po.js'

// ROADMAP #12 / Modul 9b — test penyusun pesan PO.
//
// Pesan ini keluar dari sistem menuju pihak ketiga. Salah di sini bukan bug
// internal: supplier mengirim barang yang salah, atau menagih angka yang tak
// disepakati. Yang diuji adalah hal-hal yang membuat sengketa itu mungkin.

const dasar: DataPesanPo = {
  po_number: 'PO-2026-001',
  nama_proyek: 'Renovasi Cibuluh',
  nama_supplier: 'TB Sumber Rejeki',
  items: [{ nama: 'Semen Portland 50kg', qty: 40, unit: 'sak', harga_satuan: 65000 }],
  total: 2_600_000,
}

describe('susunPesanPo', () => {
  it('SELALU memuat nomor PO — tanpa itu supplier tak bisa merujuk balik', () => {
    expect(susunPesanPo(dasar)).toContain('PO-2026-001')
  })

  it('memuat rincian item, bukan hanya total', () => {
    // Inti perbaikan #12: pesan lama hanya "Total: Rp …", jadi supplier tetap
    // harus menelepon untuk tahu apa yang dipesan.
    const t = susunPesanPo(dasar)
    expect(t).toContain('Semen Portland 50kg')
    expect(t).toContain('40 sak')
    expect(t).toContain('Rp 65.000')
  })

  it('menomori setiap item', () => {
    const t = susunPesanPo({
      ...dasar,
      items: [
        { nama: 'Semen', qty: 10, unit: 'sak' },
        { nama: 'Pasir', qty: 3, unit: 'm3' },
        { nama: 'Besi 10mm', qty: 25, unit: 'batang' },
      ],
    })
    expect(t).toContain('1. Semen')
    expect(t).toContain('2. Pasir')
    expect(t).toContain('3. Besi 10mm')
  })

  it('memakai total dari DATA, tidak menghitung ulang dari item', () => {
    // Kalau pesan menghitung sendiri, angkanya bisa berbeda dari yang tercatat
    // di sistem (mis. karena diskon/pembulatan) — dan itu sengketa dengan
    // supplier yang tak akan pernah bisa dijelaskan.
    const t = susunPesanPo({ ...dasar, total: 9_999_999 })
    expect(t).toContain('Rp 9.999.999')
  })

  it('melewati field kosong, tidak mencetak "null" atau baris kosong ganda', () => {
    const t = susunPesanPo({
      po_number: 'PO-1', items: [], total: 0,
      nama_proyek: null, alamat_kirim: '   ', catatan: undefined,
    })
    expect(t).not.toMatch(/null|undefined/)
    expect(t).not.toMatch(/\n\n\n/)
  })

  it('nol item tetap menghasilkan pesan yang sah', () => {
    const t = susunPesanPo({ ...dasar, items: [] })
    expect(t).toContain('PO-2026-001')
    expect(t).toContain('Total')
  })

  it('menyapa kontak person bila ada, jatuh ke nama supplier bila tidak', () => {
    expect(susunPesanPo({ ...dasar, kontak_person: 'Pak Budi' })).toContain('Halo Pak Budi,')
    expect(susunPesanPo(dasar)).toContain('Halo TB Sumber Rejeki,')
    expect(susunPesanPo({ ...dasar, nama_supplier: null })).toContain('Halo,')
  })

  it('membuang desimal nol pada kuantitas', () => {
    // "2.000 sak" membingungkan: terbaca dua ribu, padahal dua.
    expect(susunPesanPo({ ...dasar, items: [{ nama: 'X', qty: 2.0, unit: 'sak' }] }))
      .toContain('2 sak')
  })

  it('menyembunyikan harga satuan bila nol/tak ada', () => {
    const t = susunPesanPo({ ...dasar, items: [{ nama: 'X', qty: 5, unit: 'bh', harga_satuan: 0 }] })
    expect(t).toContain('5 bh')
    expect(t).not.toContain('@ Rp 0')
  })
})

describe('nomorWa', () => {
  it('mengubah 08xx menjadi 628xx', () => {
    expect(nomorWa('081234567890')).toBe('6281234567890')
  })

  it('menerima yang sudah 62 dan merapikan pemisah', () => {
    expect(nomorWa('+62 812-3456-7890')).toBe('6281234567890')
  })

  it('menerima yang ditulis tanpa 0 di depan', () => {
    expect(nomorWa('81234567890')).toBe('6281234567890')
  })

  it('menolak yang jelas bukan nomor — lebih baik tombolnya tak muncul', () => {
    // Tautan ke nomor ngawur lebih buruk daripada tak ada tombol: PO terkirim
    // ke orang asing, dan pengirimnya mengira sudah beres.
    expect(nomorWa('12345')).toBeNull()
    expect(nomorWa('')).toBeNull()
    expect(nomorWa(null)).toBeNull()
    expect(nomorWa('abc')).toBeNull()
    expect(nomorWa('0812')).toBeNull()             // terlalu pendek
    expect(nomorWa('08123456789012345')).toBeNull() // terlalu panjang
  })
})

describe('tautanWa', () => {
  it('meng-encode pesan supaya baris baru & spasi tak merusak URL', () => {
    const t = tautanWa('081234567890', 'Halo\nPO-1')
    expect(t).toContain('https://wa.me/6281234567890?text=')
    expect(t).toContain('%0A')
    expect(t).not.toContain(' ')
  })

  it('mengembalikan null saat nomornya tak sah', () => {
    expect(tautanWa('xxx', 'pesan')).toBeNull()
  })
})

describe('rupiah', () => {
  it('memformat ribuan gaya Indonesia', () => {
    expect(rupiah(2_600_000)).toBe('Rp 2.600.000')
  })

  it('menerima NUMERIC berbentuk string dari Postgres', () => {
    expect(rupiah('2600000')).toBe('Rp 2.600.000')
  })

  it('null/NaN jadi Rp 0, bukan "Rp NaN"', () => {
    expect(rupiah(null)).toBe('Rp 0')
    expect(rupiah('bukan-angka')).toBe('Rp 0')
  })
})
