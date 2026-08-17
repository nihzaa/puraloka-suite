import { describe, it, expect } from 'vitest'
import {
  rencanakanSalinBoq, petakanSatuan, kunciNama,
  type ItemPenawaranMenang, type ItemBoqAda,
} from '../salin-boq-pemenang.js'

// ═════════════════════════════════════════════════════════════════════════════
// SALIN BOQ PEMENANG — satu-satunya data di modul ini yang TAK BISA dibuat
// ulang dari mana pun adalah PROGRES LAPANGAN.
//
// Diukur pada basis dev 2026-08-16: 25 dari 27 baris `work_scope_items` sudah
// ber-`volume_done` > 0. Menimpa `volume` pada baris begitu mengubah
// `pct_done` — kolom GENERATED (023:80) — sehingga pekerjaan yang terukur
// 100% selesai bisa mendadak jadi 40% tanpa ada yang menyentuh lapangan.
// Itu lalu mengalir ke pembayaran dan ke EVM.
//
// Tak satu pun jalan salahnya melempar error. Semuanya menghasilkan BOQ yang
// terlihat rapi.
// ═════════════════════════════════════════════════════════════════════════════

const I = (o: Partial<ItemPenawaranMenang> & Pick<ItemPenawaranMenang, 'uraian'>): ItemPenawaranMenang => ({
  volume: 10, harga_satuan: 100_000, ...o,
})

const B = (o: Partial<ItemBoqAda> & Pick<ItemBoqAda, 'id' | 'item_name'>): ItemBoqAda => ({
  volume_done: 0, ...o,
})

describe('rencanakanSalinBoq — pagar progres lapangan', () => {
  it('item yang SUDAH berprogres tidak pernah diperbarui', () => {
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Galian tanah', volume: 999, harga_satuan: 1 })],
      [B({ id: 'x1', item_name: 'Galian tanah', volume_done: 40 })],
    )
    expect(r.jumlah_perbarui).toBe(0)
    expect(r.jumlah_sisip).toBe(0)
    expect(r.tindakan[0]).toMatchObject({ jenis: 'lewati', id: 'x1', sebab: 'berprogres' })
    expect(r.dilewati_berprogres).toEqual(['Galian tanah'])
  })

  it('progres dibaca sebagai ANGKA meski tiba sebagai string NUMERIC', () => {
    // Postgres mengirim numeric sebagai string. `"0.5" > 0` benar sebagai
    // angka; kalau dibandingkan sebagai teks, pagar progresnya bocor.
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Urugan pasir' })],
      [B({ id: 'x1', item_name: 'Urugan pasir', volume_done: '0.5' })],
    )
    expect(r.tindakan[0].jenis).toBe('lewati')
  })

  it('progres NOL boleh diperbarui — itu BOQ yang belum tersentuh lapangan', () => {
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Galian tanah', volume: 50, harga_satuan: 250_000 })],
      [B({ id: 'x1', item_name: 'Galian tanah', volume_done: 0 })],
    )
    expect(r.jumlah_perbarui).toBe(1)
    expect(r.tindakan[0]).toMatchObject({
      jenis: 'perbarui', id: 'x1', volume: 50, unit_price: 250_000,
    })
    expect(r.dilewati_berprogres).toEqual([])
  })

  it('sebagian berprogres: yang bersih diperbarui, yang berprogres dilewati', () => {
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Galian' }), I({ uraian: 'Urugan' })],
      [
        B({ id: 'a', item_name: 'Galian', volume_done: 12 }),
        B({ id: 'b', item_name: 'Urugan', volume_done: 0 }),
      ],
    )
    expect(r.jumlah_perbarui).toBe(1)
    expect(r.dilewati_berprogres).toEqual(['Galian'])
  })
})

describe('rencanakanSalinBoq — aditif, tidak destruktif', () => {
  it('item BOQ yang tak ada di penawaran TIDAK dihapus', () => {
    // BOQ pelaksanaan boleh memuat pekerjaan tambah yang disepakati terpisah.
    // Menghapusnya karena "tak ada di penawaran pemenang" membuang kesepakatan
    // lain tanpa ada yang meminta.
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Galian' })],
      [B({ id: 'a', item_name: 'Galian' }), B({ id: 'z', item_name: 'Pekerjaan tambah' })],
    )
    expect(r.tindakan.some((t) => t.jenis === ('hapus' as never))).toBe(false)
    expect(r.tindakan).toHaveLength(1)
  })

  it('item baru disisipkan, sort_order melanjutkan yang lama', () => {
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Pos baru' })],
      [B({ id: 'a', item_name: 'Lama 1' }), B({ id: 'b', item_name: 'Lama 2' })],
    )
    expect(r.jumlah_sisip).toBe(1)
    // Dua item lama → yang baru mulai di 2, jadi urutan lama tak bergeser.
    expect(r.tindakan[0]).toMatchObject({ jenis: 'sisip', sort_order: 2 })
  })

  it('BOQ kosong: semua item pemenang disisipkan', () => {
    const r = rencanakanSalinBoq([I({ uraian: 'A' }), I({ uraian: 'B' })], [])
    expect(r.jumlah_sisip).toBe(2)
    expect(r.jumlah_perbarui).toBe(0)
  })
})

describe('rencanakanSalinBoq — pencocokan nama', () => {
  it('beda huruf besar/kecil dan spasi ganda tetap dianggap item yang SAMA', () => {
    // Kalau tidak, barisnya MENGGANDA di BOQ dan volume terkontrak
    // terhitung dua kali.
    const r = rencanakanSalinBoq(
      [I({ uraian: 'Galian  Tanah' })],
      [B({ id: 'a', item_name: 'galian tanah' })],
    )
    expect(r.jumlah_sisip).toBe(0)
    expect(r.jumlah_perbarui).toBe(1)
  })

  it('kunciNama menormalkan spasi dan kapital', () => {
    expect(kunciNama('  Galian   Tanah ')).toBe('galian tanah')
  })

  it('uraian kosong jatuh ke kode item, bukan ke nama kosong', () => {
    const r = rencanakanSalinBoq([I({ uraian: '  ', kode_item: 'A.1' })], [])
    expect(r.tindakan[0]).toMatchObject({ jenis: 'sisip', item_name: 'A.1' })
  })
})

describe('petakanSatuan — tak dikenal jadi `ls`, bukan menggagalkan', () => {
  it('satuan enum dipakai apa adanya', () => {
    expect(petakanSatuan('m2')).toBe('m2')
    expect(petakanSatuan('M3')).toBe('m3')
    expect(petakanSatuan(' KG ')).toBe('kg')
  })

  it('superskrip m³/m² yang lazim di surat penawaran dikenali', () => {
    expect(petakanSatuan('m³')).toBe('m3')
    expect(petakanSatuan('m²')).toBe('m2')
  })

  it('sinonim umum dipetakan', () => {
    expect(petakanSatuan('titik lampu')).toBe('titik')
    expect(petakanSatuan('pcs')).toBe('buah')
    expect(petakanSatuan('meter lari')).toBe('m_linear')
    expect(petakanSatuan('paket')).toBe('ls')
  })

  it('yang benar-benar tak dikenal jadi `ls`, tidak melempar', () => {
    // Menggagalkan seluruh penyalinan karena satu satuan aneh berarti
    // pemenang yang sudah sah ditetapkan tak punya BOQ sama sekali.
    expect(petakanSatuan('sak semen 50kg')).toBe('ls')
    expect(petakanSatuan(null)).toBe('ls')
    expect(petakanSatuan('')).toBe('ls')
  })
})

describe('rencanakanSalinBoq — nilai batas', () => {
  it('volume 0 tetap disalin — pos yang dinyatakan tak dikerjakan', () => {
    const r = rencanakanSalinBoq([I({ uraian: 'Pos kosong', volume: 0 })], [])
    expect(r.tindakan[0]).toMatchObject({ jenis: 'sisip', volume: 0 })
  })

  it('NUMERIC berupa string dikonversi sebagai angka', () => {
    const r = rencanakanSalinBoq(
      [I({ uraian: 'A', volume: '12.5', harga_satuan: '300000' })], [])
    expect(r.tindakan[0]).toMatchObject({ volume: 12.5, unit_price: 300_000 })
  })

  it('penawaran tanpa item menghasilkan rencana kosong', () => {
    const r = rencanakanSalinBoq([], [B({ id: 'a', item_name: 'Lama' })])
    expect(r.tindakan).toHaveLength(0)
    expect(r.jumlah_sisip).toBe(0)
  })
})
