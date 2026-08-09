import { describe, it, expect } from 'vitest'
import {
  labelKategori, labelGerak, persenNilaiBuku, ringkasRp, NADA_KONDISI,
} from './ikhtisar-gudang'

describe('labelKategori', () => {
  it('menerjemahkan kategori yang dikenal', () => {
    expect(labelKategori('alat_ringan')).toBe('Alat ringan')
    expect(labelKategori('scaffolding')).toBe('Scaffolding')
    expect(labelKategori('kendaraan')).toBe('Kendaraan')
  })

  it('kategori TAK dikenal tetap ditampilkan, bukan disembunyikan', () => {
    // Kategori yang hilang dari grafik terbaca sebagai barang yang tak ada.
    expect(labelKategori('alat_khusus_baru')).toBe('Alat khusus baru')
  })

  it('kosong → tanda pisah, bukan "undefined"', () => {
    expect(labelKategori('')).toBe('—')
    expect(labelKategori(undefined as unknown as string)).toBe('—')
  })
})

describe('labelGerak', () => {
  it('menyebut ARAH, bukan sekadar mengapitalkan', () => {
    // "kembali" sendirian tak memberi tahu kembali ke mana, dan arah itulah
    // yang dicari orang saat membaca riwayat gudang.
    expect(labelGerak('kembali')).toBe('Kembali ke gudang')
    expect(labelGerak('pindah')).toBe('Keluar ke proyek')
  })

  it('perawatan dan pelepasan punya labelnya sendiri', () => {
    expect(labelGerak('perawatan')).toBe('Masuk perawatan')
    expect(labelGerak('pelepasan')).toBe('Dilepas')
  })

  it('jenis tak dikenal tak menghasilkan kosong', () => {
    expect(labelGerak('jenis_baru')).toBe('jenis baru')
    expect(labelGerak('')).toBe('—')
  })
})

describe('persenNilaiBuku', () => {
  it('perolehan nol → 0, bukan NaN', () => {
    // Perusahaan tanpa aset pasti terjadi; "NaN%" langsung terlihat pemakai.
    expect(persenNilaiBuku('0.00', '0.00')).toBe(0)
    expect(Number.isNaN(persenNilaiBuku('0.00', '0.00'))).toBe(false)
  })

  it('menghitung persen dari string numeric', () => {
    expect(persenNilaiBuku('4556263232.14', '6241900000.00')).toBe(73)
    expect(persenNilaiBuku('5000000.00', '10000000.00')).toBe(50)
  })

  it('buku negatif dijepit ke nol', () => {
    expect(persenNilaiBuku('-100.00', '1000.00')).toBe(0)
  })

  it('masukan bukan angka → 0', () => {
    expect(persenNilaiBuku('bukan', '1000.00')).toBe(0)
    expect(persenNilaiBuku('100.00', 'bukan')).toBe(0)
  })
})

describe('ringkasRp', () => {
  it('miliar diprioritaskan di atas juta', () => {
    expect(ringkasRp(6_241_900_000)).toBe('6.2 M')
    expect(ringkasRp(12_000_000_000)).toBe('12 M')
  })

  it('juta, ribu, satuan', () => {
    expect(ringkasRp(145_000_000)).toBe('145 jt')
    expect(ringkasRp(12_500)).toBe('13 rb')
    expect(ringkasRp(500)).toBe('500')
  })

  it('bukan angka → tanda pisah', () => {
    expect(ringkasRp(Number.NaN)).toBe('—')
  })
})

describe('NADA_KONDISI', () => {
  it('memetakan ketiga kondisi yang diizinkan constraint DB', () => {
    // assets_condition_check: baik | cukup | buruk
    // Nadanya memakai kosakata `Lencana`, bukan nama kondisinya.
    expect(NADA_KONDISI.baik).toBe('sukses')
    expect(NADA_KONDISI.cukup).toBe('peringatan')
    expect(NADA_KONDISI.buruk).toBe('bahaya')
  })

  it('nilai tak dikenal tidak diam-diam jadi "baik"', () => {
    // Memetakan yang tak dikenal ke "baik" akan menyembunyikan alat rusak.
    expect(NADA_KONDISI['entah']).toBeUndefined()
  })
})
