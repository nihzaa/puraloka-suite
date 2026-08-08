import { describe, it, expect } from 'vitest'
import { susunPeringatan } from './peringatan'

/**
 * Yang diuji di sini bukan "fungsinya jalan", melainkan tiga hal yang KALAU
 * rusak tidak akan terlihat di layar:
 *
 *  1. URUTAN mendesak — dua tempat tampil harus memberi prioritas yang sama.
 *  2. Nol/negatif/null TIDAK memunculkan baris — "0 invoice lewat tempo"
 *     adalah peringatan palsu, dan peringatan palsu melatih orang mengabaikan
 *     peringatan asli.
 *  3. `href` benar-benar ada di disk (dijaga terpisah oleh test rute).
 */
describe('susunPeringatan', () => {
  it('kosong saat tak ada apa-apa', () => {
    expect(susunPeringatan({})).toEqual([])
    expect(susunPeringatan(null)).toEqual([])
    expect(susunPeringatan(undefined)).toEqual([])
  })

  it('nol tidak memunculkan baris', () => {
    expect(
      susunPeringatan({ invoice_overdue: 0, milestone_late: 0, kasbon_pending: 0 }),
    ).toEqual([])
  })

  it('angka tak masuk akal diabaikan, tidak dirender apa adanya', () => {
    // Nilai negatif/NaN pernah datang dari agregasi yang gagal. Menampilkan
    // "-3 invoice lewat jatuh tempo" lebih buruk daripada tidak menampilkan.
    const hasil = susunPeringatan({
      invoice_overdue: -3,
      milestone_late: Number.NaN,
      kasbon_pending: null,
    })
    expect(hasil).toEqual([])
  })

  it('urutannya invoice → milestone → kasbon, apa pun urutan masukan', () => {
    const hasil = susunPeringatan({
      kasbon_pending: 9,
      milestone_late: 1,
      invoice_overdue: 2,
    })
    expect(hasil.map((p) => p.id)).toEqual(['invoice', 'milestone', 'kasbon'])
  })

  it('hanya yang berisi yang muncul', () => {
    const hasil = susunPeringatan({ kasbon_pending: 4 })
    expect(hasil).toHaveLength(1)
    expect(hasil[0].id).toBe('kasbon')
    expect(hasil[0].judul).toBe('4 kasbon menunggu persetujuan')
    expect(hasil[0].tingkat).toBe('sedang')
  })

  it('invoice dan milestone bertingkat tinggi, kasbon sedang', () => {
    const hasil = susunPeringatan({
      invoice_overdue: 1,
      milestone_late: 1,
      kasbon_pending: 1,
    })
    expect(hasil.map((p) => p.tingkat)).toEqual(['tinggi', 'tinggi', 'sedang'])
  })

  it('setiap peringatan punya judul, sub, dan href yang terisi', () => {
    const hasil = susunPeringatan({
      invoice_overdue: 1,
      milestone_late: 1,
      kasbon_pending: 1,
    })
    for (const p of hasil) {
      expect(p.judul.length).toBeGreaterThan(0)
      expect(p.sub.length).toBeGreaterThan(0)
      expect(p.href.startsWith('/')).toBe(true)
    }
  })
})
