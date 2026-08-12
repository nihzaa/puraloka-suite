/**
 * Pelajaran (lessons learned) — aturannya. MURNI, tanpa basis.
 *
 * Yang dijaga: pelajaran yang tak mengubah apa pun ditolak SEBELUM tersimpan.
 * Approve yang berhasil tapi tak mengubah knowledge base adalah kegagalan
 * paling sunyi di modul ini — tak ada galat, dan tak ada yang berubah.
 */
import { describe, it, expect } from 'vitest'
import {
  validasiPelajaran, hitungVarians, TARGET_PROPAGASI,
  type MasukanPelajaran,
} from '../pelajaran.js'

const isiSah = (o: Partial<MasukanPelajaran> = {}): MasukanPelajaran => ({
  project_id: 'p1',
  title: 'Bekisting kolom butuh 1,4× tenaga dari asumsi AHSP',
  planned_amount: 10_000_000,
  actual_amount: 14_000_000,
  akar: [{ description: 'Tinggi kolom 4,2 m menuntut perancah tambahan', category: 'metode' }],
  usulan: [{ target_type: 'price_book', resource_id: 'r1', proposed_value: 145_000 }],
  ...o,
})

describe('validasi pelajaran', () => {
  it('masukan sah diterima', () => {
    const v = validasiPelajaran(isiSah())
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.nilai.akar).toHaveLength(1)
      expect(v.nilai.usulan).toHaveLength(1)
      expect(v.nilai.summary).toBeNull()
    }
  })

  it('tanpa project_id ditolak', () => {
    expect(validasiPelajaran(isiSah({ project_id: undefined })).ok).toBe(false)
  })

  it('judul terlalu pendek ditolak — harus bisa ditemukan kembali', () => {
    const v = validasiPelajaran(isiSah({ title: 'Kolom' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/ditemukan kembali/i)
  })

  it('judul berisi spasi saja diperlakukan kosong', () => {
    const v = validasiPelajaran(isiSah({ title: '            ' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/wajib diisi/i)
  })

  it('nominal KOSONG ditolak, bukan diperlakukan nol', () => {
    // `Number('') === 0` — kalau lolos jadi nol, varians dihitung dari angka
    // yang tak pernah dimasukkan siapa pun, dan hasilnya terlihat wajar.
    for (const v of ['', null, undefined]) {
      const h = validasiPelajaran(isiSah({ planned_amount: v as never }))
      expect(h.ok, String(v)).toBe(false)
      if (!h.ok) expect(h.galat).toMatch(/wajib diisi/i)
    }
  })

  it('nominal negatif ditolak', () => {
    const v = validasiPelajaran(isiSah({ actual_amount: -1 }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/negatif/i)
  })

  it('nominal bertipe STRING (dari form) diterima', () => {
    const v = validasiPelajaran(isiSah({ planned_amount: '10000000', actual_amount: '14000000' }))
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.nilai.planned_amount).toBe(10_000_000)
      expect(v.nilai.actual_amount).toBe(14_000_000)
    }
  })

  it('TANPA akar masalah ditolak — itu keluhan, bukan pelajaran', () => {
    const v = validasiPelajaran(isiSah({ akar: [] }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/keluhan/i)
  })

  it('akar masalah berisi spasi saja dianggap tak ada', () => {
    const v = validasiPelajaran(isiSah({ akar: [{ description: '   ' }] }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/akar masalah/i)
  })

  it('TANPA usulan ditolak — approve-nya berhasil tapi tak mengubah apa pun', () => {
    // Kegagalan paling sunyi di modul ini: persetujuan sukses, knowledge base
    // tetap sama, dan tak ada satu pun galat.
    const v = validasiPelajaran(isiSah({ usulan: [] }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/tak mengubah apa pun/i)
  })

  it('target propagasi asing ditolak, dan pilihannya disebut', () => {
    const v = validasiPelajaran(isiSah({
      usulan: [{ target_type: 'ahsp', resource_id: 'r1', proposed_value: 1 }],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.galat).toMatch(/tidak dikenali/i)
      expect(v.galat).toMatch(/price_book/)
    }
  })

  it('usulan produktivitas WAJIB menunjuk cost code', () => {
    // Tanpa cost code, angka produktivitas baru tak punya tempat jatuh.
    const v = validasiPelajaran(isiSah({
      usulan: [{ target_type: 'productivity', resource_id: 'r1', proposed_value: 0.42 }],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/cost code/i)

    const ok = validasiPelajaran(isiSah({
      usulan: [{ target_type: 'productivity', resource_id: 'r1', cost_code_id: 'cc1', proposed_value: 0.42 }],
    }))
    expect(ok.ok).toBe(true)
  })

  it('price_book TIDAK menuntut cost code', () => {
    expect(validasiPelajaran(isiSah()).ok).toBe(true)
  })

  it('usulan tanpa resource ditolak', () => {
    const v = validasiPelajaran(isiSah({
      usulan: [{ target_type: 'price_book', proposed_value: 1000 }],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/resource wajib/i)
  })

  it('usulan bernilai NOL ditolak', () => {
    const v = validasiPelajaran(isiSah({
      usulan: [{ target_type: 'price_book', resource_id: 'r1', proposed_value: 0 }],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/tak mengubah apa pun/i)
  })

  it('DUA usulan untuk resource+target yang sama ditolak', () => {
    // Yang terakhir menang tanpa ada yang tahu usulan pertama pernah ada.
    const v = validasiPelajaran(isiSah({
      usulan: [
        { target_type: 'price_book', resource_id: 'r1', proposed_value: 145_000 },
        { target_type: 'price_book', resource_id: 'r1', proposed_value: 150_000 },
      ],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/dua usulan/i)
  })

  it('resource sama dengan TARGET BERBEDA tetap diterima', () => {
    const v = validasiPelajaran(isiSah({
      usulan: [
        { target_type: 'price_book', resource_id: 'r1', proposed_value: 145_000 },
        { target_type: 'productivity', resource_id: 'r1', cost_code_id: 'cc1', proposed_value: 0.42 },
      ],
    }))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai.usulan).toHaveLength(2)
  })

  it('nomor usulan yang bermasalah disebut, bukan "ada yang salah"', () => {
    const v = validasiPelajaran(isiSah({
      usulan: [
        { target_type: 'price_book', resource_id: 'r1', proposed_value: 1 },
        { target_type: 'price_book', resource_id: 'r2', proposed_value: 0 },
      ],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/ke-2/)
  })

  it('kedua target propagasi terdaftar', () => {
    expect([...TARGET_PROPAGASI].sort()).toEqual(['price_book', 'productivity'])
  })
})

describe('hitung varians', () => {
  it('lebih mahal dari rencana', () => {
    const h = hitungVarians(10_000_000, 14_000_000)
    expect(h.selisih).toBe(4_000_000)
    expect(h.persen).toBe(40)
    expect(h.arah).toBe('lebih_mahal')
  })

  it('lebih murah dari rencana', () => {
    const h = hitungVarians(10_000_000, 8_000_000)
    expect(h.selisih).toBe(-2_000_000)
    expect(h.persen).toBe(-20)
    expect(h.arah).toBe('lebih_murah')
  })

  it('rencana NOL: persen null, bukan tak terhingga', () => {
    const h = hitungVarians(0, 5_000_000)
    expect(h.persen).toBeNull()
    expect(h.selisih).toBe(5_000_000)
  })

  it('numeric STRING dari pg dihitung sebagai angka', () => {
    // `'14000000' - '10000000'` kebetulan benar di JS, tapi `'10' + '4'`
    // tidak — konversi eksplisit menjaga keduanya.
    const h = hitungVarians('10000000.00', '14000000.00')
    expect(h.selisih).toBe(4_000_000)
  })

  it('nilai tak terbaca tidak membuat NaN mengalir', () => {
    const h = hitungVarians('entah', 100)
    expect(Number.isNaN(h.selisih)).toBe(false)
    expect(h.arah).toBe('sama')
  })
})
