import { describe, it, expect } from 'vitest'
import { rekapAbsensi, type BarisAbsensi } from '../rekap-absensi.js'

/**
 * REKAP ABSENSI — angka yang keluar dari sini menentukan UPAH.
 *
 * Sebelum berkas ini ada, aritmetikanya hidup di dalam handler dan NOL test
 * menyentuhnya. Yang paling berbahaya bukan kesalahan yang melempar error,
 * melainkan yang menghasilkan angka rapi dan salah.
 */

const B = (
  worker_id: string,
  porsi_hari: number | string | null,
  jam_lembur: number | string | null = 0,
  extra: Partial<BarisAbsensi> = {},
): BarisAbsensi => ({
  worker_id,
  porsi_hari,
  jam_lembur,
  nama: `Tukang ${worker_id.toUpperCase()}`,
  tipe: 'harian',
  ...extra,
})

describe('rekapAbsensi — NUMERIC string', () => {
  // INVARIAN 1. `"1" + "1"` = "11", dan 11 hari kerja masuk slip upah tanpa
  // satu pun error.
  it('menjumlahkan string sebagai ANGKA, bukan merangkai teks', () => {
    const h = rekapAbsensi([B('a', '1'), B('a', '1')])
    expect(h.rekap[0].hari).toBe(2)
    expect(String(h.rekap[0].hari)).not.toBe('11')
    expect(h.total_hari).toBe(2)
  })

  it('menjumlahkan lembur string sebagai angka', () => {
    const h = rekapAbsensi([B('a', '1', '2'), B('a', '1', '3')])
    expect(h.rekap[0].lembur).toBe(5)
    expect(h.total_lembur).toBe(5)
  })

  it('menghitung nilai tak terbaca sebagai 0, bukan NaN', () => {
    // NaN merambat: SATU baris rusak akan menghapus rekap seluruh lingkup.
    const h = rekapAbsensi([B('a', '1'), B('a', 'entah' as unknown as string), B('a', null)])
    expect(h.rekap[0].hari).toBe(1)
    expect(Number.isNaN(h.total_hari)).toBe(false)
  })
})

describe('rekapAbsensi — lembur TERPISAH dari hari', () => {
  // INVARIAN 2. Lembur dibayar dengan tarif berbeda; meleburnya membuat 8 jam
  // lembur terbaca sebagai satu hari kerja biasa.
  it('lembur tidak pernah menambah jumlah hari', () => {
    const h = rekapAbsensi([B('a', 1, 8)])
    expect(h.rekap[0].hari).toBe(1)
    expect(h.rekap[0].lembur).toBe(8)
    expect(h.total_hari).toBe(1)
  })

  it('lembur tanpa kehadiran tetap tercatat, hari tetap nol', () => {
    // Terjadi nyata: tukang datang hanya untuk lembur malam.
    const h = rekapAbsensi([B('a', 0, 4)])
    expect(h.rekap[0].hari).toBe(0)
    expect(h.rekap[0].lembur).toBe(4)
    expect(h.jumlah_tanpa_kehadiran).toBe(1)
  })
})

describe('rekapAbsensi — porsi pecahan', () => {
  // INVARIAN 3.
  it('dua setengah hari menjadi satu hari, bukan dua', () => {
    const h = rekapAbsensi([B('a', 0.5), B('a', 0.5)])
    expect(h.rekap[0].hari).toBe(1)
    expect(h.rekap[0].jumlah_catatan).toBe(2)
  })

  it('membedakan jumlah HARI dari jumlah CATATAN', () => {
    // Tiga catatan setengah hari = 1,5 hari kerja. Memakai jumlah catatan
    // sebagai "hari" akan membayar 3 hari.
    const h = rekapAbsensi([B('a', 0.5), B('a', 0.5), B('a', 0.5)])
    expect(h.rekap[0].hari).toBe(1.5)
    expect(h.rekap[0].jumlah_catatan).toBe(3)
  })
})

describe('rekapAbsensi — penggabungan per pekerja', () => {
  // INVARIAN 4.
  it('menggabungkan pekerja yang sama dari beberapa tanggal', () => {
    const h = rekapAbsensi([B('a', 1), B('b', 1), B('a', 1), B('a', 0.5)])
    expect(h.rekap).toHaveLength(2)
    const a = h.rekap.find((r) => r.worker_id === 'a')!
    expect(a.hari).toBe(2.5)
    expect(a.jumlah_catatan).toBe(3)
  })

  it('memisahkan pekerja yang berbeda', () => {
    const h = rekapAbsensi([B('a', 1), B('b', 2)])
    expect(h.rekap.map((r) => r.hari).sort()).toEqual([1, 2])
  })
})

describe('rekapAbsensi — pekerja tanpa nama', () => {
  // INVARIAN 5. Hilang dari rekap berarti upahnya tak terhitung — dan tak
  // seorang pun protes sampai orangnya menagih.
  it('tetap muncul, dengan penanda yang terbaca sebagai anomali', () => {
    const h = rekapAbsensi([B('x', 1, 0, { nama: null })])
    expect(h.rekap).toHaveLength(1)
    expect(h.rekap[0].nama).toBe('(tanpa nama)')
    expect(h.rekap[0].hari).toBe(1)
  })

  it('nama yang hanya spasi diperlakukan sama dengan kosong', () => {
    const h = rekapAbsensi([B('x', 1, 0, { nama: '   ' })])
    expect(h.rekap[0].nama).toBe('(tanpa nama)')
  })

  it('nama menyusul bila baris pertama tak membawanya', () => {
    // Terjadi saat join relasi mengembalikan null di sebagian baris.
    const h = rekapAbsensi([
      B('x', 1, 0, { nama: null }),
      B('x', 1, 0, { nama: 'Pak Budi' }),
    ])
    expect(h.rekap[0].nama).toBe('Pak Budi')
    expect(h.rekap[0].hari).toBe(2)
  })
})

describe('rekapAbsensi — total & urutan', () => {
  // INVARIAN 6. Total dari sumber berbeda bisa berselisih diam-diam.
  it('total sama dengan jumlah seluruh baris rekap', () => {
    const h = rekapAbsensi([B('a', 1, 2), B('b', 0.5, 1), B('c', 2, 0)])
    expect(h.total_hari).toBe(h.rekap.reduce((s, r) => s + r.hari, 0))
    expect(h.total_lembur).toBe(h.rekap.reduce((s, r) => s + r.lembur, 0))
    expect(h.total_hari).toBe(3.5)
    expect(h.total_lembur).toBe(3)
  })

  // INVARIAN 7.
  it('mengurutkan berdasar nama, bukan urutan masuk', () => {
    const h = rekapAbsensi([
      B('c', 1, 0, { nama: 'Zainal' }),
      B('a', 1, 0, { nama: 'Ahmad' }),
      B('b', 1, 0, { nama: 'Made' }),
    ])
    expect(h.rekap.map((r) => r.nama)).toEqual(['Ahmad', 'Made', 'Zainal'])
  })

  it('rentang kosong menghasilkan rekap kosong, bukan galat', () => {
    const h = rekapAbsensi([])
    expect(h.rekap).toEqual([])
    expect(h.total_hari).toBe(0)
    expect(h.jumlah_tanpa_kehadiran).toBe(0)
  })
})
