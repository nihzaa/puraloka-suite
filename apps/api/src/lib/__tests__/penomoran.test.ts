/**
 * F1 — aturan penomoran dokumen. MURNI, tanpa basis.
 */
import { describe, it, expect } from 'vitest'
import {
  validasiSeri, contohNomor, kelompokPerJenis, labelJenis,
  PADDING_MAKS, PREFIX_MAKS,
  type SeriRingkas,
} from '../penomoran.js'

const seri = (o: Partial<SeriRingkas> = {}): SeriRingkas => ({
  doc_type: 'invoice', period: '2026-08', prefix: 'INV', padding: 4, last_number: 12, ...o,
})

describe('validasi seri', () => {
  it('prefix kosong SAH — nomor tanpa awalan adalah pilihan', () => {
    const v = validasiSeri({ prefix: '', padding: 4 })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.prefix).toBe('')
  })

  it('prefix dipangkas spasi tepinya', () => {
    const v = validasiSeri({ prefix: '  INV  ', padding: 4 })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.prefix).toBe('INV')
  })

  it('prefix berspasi di TENGAH ditolak', () => {
    const v = validasiSeri({ prefix: 'IN V', padding: 4 })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/satu kata/i)
  })

  it('prefix bertanda hubung ditolak — itu pemisah formatnya sendiri', () => {
    const v = validasiSeri({ prefix: 'INV-2026', padding: 4 })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/INV-2026-2026-0001/)
  })

  it(`prefix lebih dari ${PREFIX_MAKS} karakter ditolak`, () => {
    expect(validasiSeri({ prefix: 'A'.repeat(PREFIX_MAKS), padding: 4 }).ok).toBe(true)
    expect(validasiSeri({ prefix: 'A'.repeat(PREFIX_MAKS + 1), padding: 4 }).ok).toBe(false)
  })

  it('padding kosong ("") ditolak, BUKAN diperlakukan nol', () => {
    // `Number('') === 0` — kalau kosong lolos jadi 0, nomor kehilangan lebar
    // tetapnya dan urutan alfabetisnya rusak diam-diam.
    const v = validasiSeri({ prefix: 'INV', padding: '' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/wajib diisi/i)
  })

  it('padding null/undefined ditolak', () => {
    expect(validasiSeri({ prefix: 'INV', padding: null }).ok).toBe(false)
    expect(validasiSeri({ prefix: 'INV', padding: undefined }).ok).toBe(false)
  })

  it('padding nol ditolak dengan alasan yang bisa dipahami', () => {
    const v = validasiSeri({ prefix: 'INV', padding: 0 })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/2 muncul sesudah 10/)
  })

  it('padding pecahan ditolak', () => {
    expect(validasiSeri({ prefix: 'INV', padding: 3.5 }).ok).toBe(false)
  })

  it(`padding di atas ${PADDING_MAKS} ditolak`, () => {
    expect(validasiSeri({ prefix: 'INV', padding: PADDING_MAKS }).ok).toBe(true)
    expect(validasiSeri({ prefix: 'INV', padding: PADDING_MAKS + 1 }).ok).toBe(false)
  })

  it('padding sebagai string angka diterima — form mengirimnya begitu', () => {
    const v = validasiSeri({ prefix: 'INV', padding: '6' })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.padding).toBe(6)
  })

  it('padding bukan angka ditolak', () => {
    expect(validasiSeri({ prefix: 'INV', padding: 'enam' }).ok).toBe(false)
  })
})

describe('contoh nomor', () => {
  it('berprefix dan berperiode', () => {
    expect(contohNomor({ prefix: 'INV', periode: '2026-08', padding: 4, urut: 13 }))
      .toBe('INV-2026-08-0013')
  })

  it('tanpa prefix TIDAK diawali pemisah', () => {
    // `-2026-08-0013` terlihat seperti nomor yang bagian depannya hilang.
    expect(contohNomor({ prefix: '', periode: '2026-08', padding: 4, urut: 13 }))
      .toBe('2026-08-0013')
  })

  it("periode '-' berarti TAK berperiode, bukan periode bernama '-'", () => {
    // Nilai itu default `next_document_number`; menuliskannya apa adanya
    // menghasilkan `INV---0001`.
    expect(contohNomor({ prefix: 'INV', periode: '-', padding: 4, urut: 1 }))
      .toBe('INV-0001')
    expect(contohNomor({ prefix: '', periode: '-', padding: 4, urut: 1 }))
      .toBe('0001')
  })

  it('padding dipatuhi', () => {
    expect(contohNomor({ prefix: 'PO', periode: '2026', padding: 6, urut: 7 }))
      .toBe('PO-2026-000007')
  })

  it('urut negatif jadi nol, tidak menghasilkan tanda minus di nomor', () => {
    expect(contohNomor({ prefix: 'INV', periode: '2026', padding: 4, urut: -5 }))
      .toBe('INV-2026-0000')
  })

  it('urut pecahan dipotong, bukan dibulatkan naik', () => {
    expect(contohNomor({ prefix: 'INV', periode: '2026', padding: 4, urut: 9.9 }))
      .toBe('INV-2026-0009')
  })

  it('nomor melebihi padding TIDAK terpotong', () => {
    // `padStart` hanya menambah, tak pernah memotong — dan itu benar: nomor
    // 12345 yang jadi 2345 adalah dokumen yang menunjuk dokumen lain.
    expect(contohNomor({ prefix: 'INV', periode: '2026', padding: 3, urut: 12345 }))
      .toBe('INV-2026-12345')
  })
})

describe('kelompok per jenis', () => {
  it('menggabungkan periode di bawah satu jenis', () => {
    const k = kelompokPerJenis([
      seri({ period: '2026-08', last_number: 12 }),
      seri({ period: '2026-07', last_number: 30 }),
      seri({ doc_type: 'po', period: '2026', last_number: 532, prefix: '' }),
    ])
    expect(k).toHaveLength(2)
    const inv = k.find((x) => x.doc_type === 'invoice')!
    expect(inv.periode).toHaveLength(2)
  })

  it('periode TERBARU yang menentukan prefix & padding yang ditampilkan', () => {
    const k = kelompokPerJenis([
      seri({ period: '2025-01', prefix: 'LAMA', padding: 3 }),
      seri({ period: '2026-08', prefix: 'BARU', padding: 5 }),
    ])
    expect(k[0].prefix).toBe('BARU')
    expect(k[0].padding).toBe(5)
    expect(k[0].terbaru?.period).toBe('2026-08')
  })

  it("periode '-' jatuh paling akhir, bukan paling awal", () => {
    const k = kelompokPerJenis([
      seri({ period: '-', prefix: 'TANPA' }),
      seri({ period: '2026-08', prefix: 'ADA' }),
    ])
    expect(k[0].terbaru?.period).toBe('2026-08')
  })

  it('total terbit menjumlahkan SELURUH periode', () => {
    const k = kelompokPerJenis([
      seri({ period: '2026-08', last_number: 12 }),
      seri({ period: '2026-07', last_number: 30 }),
    ])
    expect(k[0].totalTerbit).toBe(42)
  })

  it('last_number bertipe string (numeric dari pg) tetap terjumlah', () => {
    // Driver pg mengirim BIGINT sebagai STRING. `'12' + '30'` menghasilkan
    // '1230' kalau tak dikonversi — angka yang salah tanpa satu pun galat.
    const k = kelompokPerJenis([
      seri({ period: '2026-08', last_number: '12' }),
      seri({ period: '2026-07', last_number: '30' }),
    ])
    expect(k[0].totalTerbit).toBe(42)
  })

  it('daftar kosong menghasilkan daftar kosong, tidak melempar', () => {
    expect(kelompokPerJenis([])).toEqual([])
  })

  it('diurutkan menurut LABEL, bukan doc_type', () => {
    const k = kelompokPerJenis([
      seri({ doc_type: 'po' }),
      seri({ doc_type: 'gr' }),
      seri({ doc_type: 'invoice' }),
    ])
    // 'Invoice ke klien' < 'Penerimaan Barang' < 'Purchase Order'
    expect(k.map((x) => x.doc_type)).toEqual(['invoice', 'gr', 'po'])
  })
})

describe('label jenis', () => {
  it('jenis dikenal diterjemahkan', () => {
    expect(labelJenis('invoice')).toBe('Invoice ke klien')
  })

  it('jenis TAK dikenal ditampilkan apa adanya, bukan "Tidak diketahui"', () => {
    // Modul baru menambah doc_type sendiri; menampilkannya sebagai "Tidak
    // diketahui" membuat serinya tak bisa dikenali di halaman pengaturan.
    expect(labelJenis('spk')).toBe('spk')
  })
})
