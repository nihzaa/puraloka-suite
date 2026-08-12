/**
 * C1 — penyatuan KPI perusahaan (murni, tanpa basis).
 *
 * Yang diuji di sini adalah KEPUTUSAN MERINGKAS: bagaimana CPI/SPI per-proyek
 * jadi satu angka perusahaan. Rumus EVM-nya sendiri sudah dikunci
 * `evm-calculation.test.ts` — berkas ini tak mengujinya ulang.
 */
import { describe, it, expect } from 'vitest'
import { hitungKpiEvm, statusIndeks, type ProyekUntukKpi } from '../kpi-perusahaan.js'

let n = 0
const P = (o: Partial<ProyekUntukKpi>): ProyekUntukKpi => ({
  id: `p${++n}`,
  name: `Proyek ${n}`,
  bac: 1_000_000_000,
  ac: 500_000_000,
  progresPct: 50,
  rencanaPct: 50,
  ...o,
})

describe('penimbangan', () => {
  it('DITIMBANG nilai kontrak, bukan dirata-rata polos', () => {
    // Proyek kecil yang bermasalah tak boleh menenggelamkan angka perusahaan.
    //   besar : bac 10M, ev 5M, ac 5M      → cpi 1,00
    //   kecil : bac 100jt, ev 50jt, ac 100jt → cpi 0,50
    //
    // Rata-rata polos  = (1,00 + 0,50) / 2       = 0,750
    // Ditimbang BAC    = (1,00×10M + 0,50×0,1M) / 10,1M ≈ 0,995
    const h = hitungKpiEvm([
      P({ bac: 10_000_000_000, ac: 5_000_000_000, progresPct: 50 }),
      P({ bac: 100_000_000, ac: 100_000_000, progresPct: 50 }),
    ])
    expect(h.cpi).toBeGreaterThan(0.99)
    expect(h.cpi).toBeLessThan(1)
  })

  it('CPI dan SPI punya pembagi TERPISAH', () => {
    // Sebuah proyek bisa punya CPI tanpa SPI (belum ada baseline). Memakai
    // satu pembagi untuk keduanya membuat SPI perusahaan ikut turun tiap kali
    // ada proyek tanpa baseline — padahal proyek itu tak berkata apa-apa
    // tentang jadwal.
    const h = hitungKpiEvm([
      P({ progresPct: 50, rencanaPct: 50 }),          // cpi 1,0 · spi 1,0
      P({ progresPct: 50, rencanaPct: null }),        // cpi 1,0 · spi null
    ])
    expect(h.cpi).toBe(1)
    expect(h.spi).toBe(1) // BUKAN 0,5
  })
})

describe('proyek tanpa data', () => {
  it('bac nol DIBUANG, bukan dihitung sebagai nol', () => {
    // BAC nol berarti proyeknya belum punya anggaran; memasukkannya hanya
    // menambah pembagi tanpa menambah informasi.
    const h = hitungKpiEvm([P({}), P({ bac: 0 })])
    expect(h.proyekDihitung).toBe(1)
    expect(h.proyekTotal).toBe(2)
    expect(h.cpi).toBe(1)
  })

  it('rencanaPct null menghasilkan SPI null, bukan 1,0', () => {
    // Menganggap "tak punya baseline" sebagai "tepat jadwal" adalah
    // kebohongan yang paling nyaman.
    const h = hitungKpiEvm([P({ rencanaPct: null })])
    expect(h.perProyek[0].spi).toBeNull()
    expect(h.spi).toBeNull()
  })

  it('ac nol menghasilkan CPI null, bukan tak hingga', () => {
    const h = hitungKpiEvm([P({ ac: 0 })])
    expect(h.perProyek[0].cpi).toBeNull()
    expect(h.cpi).toBeNull()
  })

  it('daftar kosong tak melempar', () => {
    const h = hitungKpiEvm([])
    expect(h).toMatchObject({ cpi: null, spi: null, proyekDihitung: 0, proyekTotal: 0 })
    expect(h.cpiTerendah).toBeNull()
  })
})

describe('proyek terburuk', () => {
  it('menunjuk yang CPI-nya paling rendah', () => {
    const h = hitungKpiEvm([
      P({ name: 'Sehat', progresPct: 60 }),
      P({ name: 'Berdarah', progresPct: 20 }),
      P({ name: 'Sedang', progresPct: 45 }),
    ])
    expect(h.cpiTerendah?.name).toBe('Berdarah')
  })

  it('proyek ber-CPI null tak dianggap terburuk', () => {
    // Tak punya data bukan berarti bermasalah — menunjuknya sebagai yang
    // terburuk mengirim orang memeriksa proyek yang baik-baik saja.
    const h = hitungKpiEvm([
      P({ name: 'Tanpa biaya', ac: 0 }),
      P({ name: 'Buruk', progresPct: 20 }),
    ])
    expect(h.cpiTerendah?.name).toBe('Buruk')
  })
})

describe('total', () => {
  it('menjumlah BAC dan AC hanya dari proyek yang dihitung', () => {
    const h = hitungKpiEvm([
      P({ bac: 1_000_000_000, ac: 400_000_000 }),
      P({ bac: 2_000_000_000, ac: 600_000_000 }),
      P({ bac: 0, ac: 999_999_999 }), // dibuang
    ])
    expect(h.totalBac).toBe(3_000_000_000)
    expect(h.totalAc).toBe(1_000_000_000)
  })
})

describe('statusIndeks', () => {
  it('null = tak ada data, dengan sebab yang berbeda per jenis', () => {
    expect(statusIndeks(null, 'cpi').keadaan).toBe('tak_ada_data')
    expect(statusIndeks(null, 'cpi').arti).toMatch(/biaya aktual/i)
    expect(statusIndeks(null, 'spi').arti).toMatch(/baseline/i)
  })

  it('>= 1,00 baik', () => {
    expect(statusIndeks(1, 'cpi').keadaan).toBe('baik')
    expect(statusIndeks(1.2, 'spi').keadaan).toBe('baik')
  })

  it('0,95-0,99 PERHATIAN, bukan buruk', () => {
    // Selisih 1% ada di dalam derau: progres dilaporkan manusia dengan
    // pembulatan 5%, biaya masuk terlambat beberapa hari. Menandainya merah
    // membuat layar hampir selalu merah — dan layar yang selalu merah
    // berhenti dibaca.
    expect(statusIndeks(0.99, 'cpi').keadaan).toBe('perhatian')
    expect(statusIndeks(0.95, 'cpi').keadaan).toBe('perhatian')
  })

  it('< 0,95 buruk, dan artinya menyebut angkanya', () => {
    const s = statusIndeks(0.8, 'cpi')
    expect(s.keadaan).toBe('buruk')
    // Kalimatnya harus bisa dibaca orang yang tak hafal EVM.
    expect(s.arti).toMatch(/Rp 0,80|Rp 0\.80/)
  })

  it('SPI buruk dinyatakan sebagai persen yang seharusnya selesai', () => {
    expect(statusIndeks(0.7, 'spi').arti).toMatch(/70%/)
  })
})
