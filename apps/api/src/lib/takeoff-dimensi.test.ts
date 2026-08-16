import { describe, it, expect } from 'vitest'
import {
  hitungBarisTakeoff, rekapTakeoff, bandingkanTerapan, GalatTakeoff,
  DIMENSI_WAJIB, SATUAN_HASIL, METODE_SAH, FAKTOR_MAKS,
} from './takeoff-dimensi.js'

// GOLDEN — angka dihitung TANGAN, bukan disalin dari keluaran fungsi. Menyalin
// keluaran membuat test ini menyetujui apa pun yang kebetulan dihasilkan kode
// hari ini, termasuk kalau rumusnya salah sejak baris pertama.

describe('hitungBarisTakeoff — metode volume (p × l × t)', () => {
  it('GOLDEN galian pondasi: 12,5 × 0,8 × 0,6 × 4 × 1,25 = 30 m³', () => {
    // Tangan: 12,5 × 0,8 = 10 ; × 0,6 = 6 ; × 4 = 24 ; × 1,25 = 30
    const r = hitungBarisTakeoff({
      uraian: 'Galian pondasi P1', metode: 'volume',
      panjangM: 12.5, lebarM: 0.8, tinggiM: 0.6, jumlah: 4, faktor: 1.25,
    })
    expect(r.volumeSatuan).toBeCloseTo(6, 6)
    expect(r.hasilVolume).toBeCloseTo(30, 6)
    expect(r.satuan).toBe('m³')
  })

  it('rumus memperlihatkan SELURUH perkalian, bukan cuma hasilnya', () => {
    const r = hitungBarisTakeoff({
      uraian: 'Galian', metode: 'volume',
      panjangM: 12.5, lebarM: 0.8, tinggiM: 0.6, jumlah: 4, faktor: 1.25,
    })
    // Inilah yang membuat orang bisa memeriksa dari mana volumenya datang —
    // tanpa ini layar hanya memulangkan angka yang harus dipercaya begitu saja.
    expect(r.rumus).toBe('12,5 × 0,8 × 0,6 × 4 × 1,25 = 30 m³')
  })

  it('jumlah & faktor default 1 bila tak diisi', () => {
    const r = hitungBarisTakeoff({ uraian: 'Beton sloof', metode: 'volume', panjangM: 10, lebarM: 0.15, tinggiM: 0.2 })
    expect(r.jumlah).toBe(1)
    expect(r.faktor).toBe(1)
    expect(r.hasilVolume).toBeCloseTo(0.3, 6) // 10 × 0,15 × 0,2
  })
})

describe('hitungBarisTakeoff — tiga metode lain', () => {
  it('luas: 6 × 4 × 2 = 48 m²', () => {
    const r = hitungBarisTakeoff({ uraian: 'Lantai keramik', metode: 'luas', panjangM: 6, lebarM: 4, jumlah: 2 })
    expect(r.hasilVolume).toBeCloseTo(48, 6)
    expect(r.satuan).toBe('m²')
  })

  it('dinding: 20 × 3,5 = 70 m² (tebal TIDAK ikut — ia hidup di AHSP per-m²)', () => {
    const r = hitungBarisTakeoff({ uraian: 'Pasangan bata', metode: 'dinding', panjangM: 20, tinggiM: 3.5 })
    expect(r.hasilVolume).toBeCloseTo(70, 6)
    expect(r.satuan).toBe('m²')
  })

  it("panjang: 45 × 1 = 45 m'", () => {
    const r = hitungBarisTakeoff({ uraian: 'Pipa PVC 4"', metode: 'panjang', panjangM: 45 })
    expect(r.hasilVolume).toBeCloseTo(45, 6)
    expect(r.satuan).toBe('m')
  })
})

describe('hitungBarisTakeoff — masukan cacat DITOLAK, bukan dibulatkan diam-diam', () => {
  it("metode 'volume' TANPA tinggi ditolak (bukan diperlakukan tinggi = 1)", () => {
    // Inti kelas cacatnya: kalau NULL diperlakukan 1, hasilnya 20 m³ — angka
    // yang terlihat sangat wajar untuk sebuah galian, dan tak seorang pun akan
    // curiga bahwa salah satu dimensinya tak pernah diisi.
    expect(() => hitungBarisTakeoff({
      uraian: 'Galian tanpa tinggi', metode: 'volume', panjangM: 10, lebarM: 2,
    })).toThrow(GalatTakeoff)
  })

  it("metode 'luas' yang diisi tinggi ditolak — pengisinya mengira tinggi ikut dihitung", () => {
    expect(() => hitungBarisTakeoff({
      uraian: 'Lantai', metode: 'luas', panjangM: 6, lebarM: 4, tinggiM: 3,
    })).toThrow(/tidak memakai tinggi_m/)
  })

  it('metode di luar daftar tertutup ditolak', () => {
    expect(() => hitungBarisTakeoff({
      uraian: 'Ngarang', metode: 'kubikasi' as never, panjangM: 10,
    })).toThrow(/metode wajib/)
  })

  it('uraian kosong ditolak — deretan angka tanpa nama tak bisa dicocokkan ke gambar', () => {
    expect(() => hitungBarisTakeoff({ uraian: '   ', metode: 'panjang', panjangM: 10 })).toThrow(/uraian/)
  })

  it('faktor 0 ditolak — volume menguap jadi 0 tanpa gejala', () => {
    expect(() => hitungBarisTakeoff({ uraian: 'X', metode: 'panjang', panjangM: 10, faktor: 0 })).toThrow(/faktor/)
  })

  it(`faktor di atas ${FAKTOR_MAKS} ditolak — hampir pasti salah ketik`, () => {
    expect(() => hitungBarisTakeoff({ uraian: 'X', metode: 'panjang', panjangM: 10, faktor: 100 })).toThrow(/faktor maksimal/)
  })

  it('dimensi negatif & jumlah 0 ditolak', () => {
    expect(() => hitungBarisTakeoff({ uraian: 'X', metode: 'panjang', panjangM: -5 })).toThrow(GalatTakeoff)
    expect(() => hitungBarisTakeoff({ uraian: 'X', metode: 'panjang', panjangM: 5, jumlah: 0 })).toThrow(/jumlah/)
  })

  it('NaN ditolak — ia lolos dari `typeof === number` dan menular ke seluruh total', () => {
    expect(() => hitungBarisTakeoff({ uraian: 'X', metode: 'panjang', panjangM: Number.NaN })).toThrow(GalatTakeoff)
  })
})

describe('rekapTakeoff — Σ baris, dan satuan campur yang harus kelihatan', () => {
  it('menjumlahkan hasil seluruh baris satu item', () => {
    const b = [
      { hasilVolume: 30, metode: 'volume' as const },
      { hasilVolume: 12.5, metode: 'volume' as const },
    ]
    const r = rekapTakeoff(b)
    expect(r.totalVolume).toBeCloseTo(42.5, 6)
    expect(r.jumlahBaris).toBe(2)
    expect(r.satuan).toBe('m³')
  })

  it('satuan campur → null (m³ + m tak boleh dijumlahkan diam-diam)', () => {
    const r = rekapTakeoff([
      { hasilVolume: 30, metode: 'volume' },
      { hasilVolume: 45, metode: 'panjang' },
    ])
    expect(r.satuan).toBeNull()
    // Totalnya tetap dihitung supaya UI bisa memperlihatkan angkanya SEKALIGUS
    // peringatannya — menyembunyikan angka membuat orang mengira datanya hilang.
    expect(r.totalVolume).toBeCloseTo(75, 6)
  })

  it('nol baris → total 0, satuan null', () => {
    expect(rekapTakeoff([])).toEqual({ totalVolume: 0, jumlahBaris: 0, satuan: null })
  })

  it('luas & dinding sama-sama m² → dianggap satuan sama', () => {
    expect(rekapTakeoff([
      { hasilVolume: 48, metode: 'luas' },
      { hasilVolume: 70, metode: 'dinding' },
    ]).satuan).toBe('m²')
  })
})

describe('bandingkanTerapan — selisih take-off vs RAB adalah SINYAL', () => {
  it('sama → sinkron', () => {
    expect(bandingkanTerapan(30, 30).sinkron).toBe(true)
  })

  it('take-off direvisi tapi RAB belum menyusul → tidak sinkron, selisih terbaca', () => {
    const r = bandingkanTerapan(30, 42.5)
    expect(r.sinkron).toBe(false)
    expect(r.selisih).toBeCloseTo(12.5, 6)
  })

  it('beda di bawah presisi numeric(16,4) dianggap sinkron', () => {
    // Peringatan yang menyala tanpa sebab akan diabaikan — dan peringatan yang
    // benar ikut terabaikan bersamanya.
    expect(bandingkanTerapan(30, 30.00000001).sinkron).toBe(true)
  })

  it('beda pada digit ke-4 TETAP terbaca sebagai tidak sinkron', () => {
    expect(bandingkanTerapan(30, 30.001).sinkron).toBe(false)
  })
})

describe('tabel metode — kembaran CHECK di migrasi 431', () => {
  it('empat metode, dan tiap metode punya satuan', () => {
    expect(METODE_SAH).toEqual(['volume', 'luas', 'dinding', 'panjang'])
    for (const m of METODE_SAH) expect(SATUAN_HASIL[m]).toBeTruthy()
  })

  it('dimensi wajib cocok dengan CHECK takeoff_dimensi_dimensi_wajib', () => {
    expect(DIMENSI_WAJIB.volume).toEqual(['panjang_m', 'lebar_m', 'tinggi_m'])
    expect(DIMENSI_WAJIB.luas).toEqual(['panjang_m', 'lebar_m'])
    expect(DIMENSI_WAJIB.dinding).toEqual(['panjang_m', 'tinggi_m'])
    expect(DIMENSI_WAJIB.panjang).toEqual(['panjang_m'])
  })
})
