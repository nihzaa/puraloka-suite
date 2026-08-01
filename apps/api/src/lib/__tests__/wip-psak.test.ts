import { describe, it, expect } from 'vitest'
import { hitungWIP, ringkasWIP, type InputWIP } from '../wip-psak'

// WIP menentukan APAKAH SEBUAH PROYEK UNTUNG — angka yang dibawa ke bank dan
// pemberi kerja. Tiga hal yang salahnya paling mahal dan tak berbunyi:
//   1. CIE/BIE tertukar → liabilitas dilaporkan sebagai aset. Kontraktor
//      merasa kaya di tengah proyek lalu kehabisan uang di akhir.
//   2. biaya melampaui estimasi diakui sebagai pendapatan >100%
//   3. kerugian ditunda ke akhir proyek (PSAK mewajibkan diakui SEKARANG)
//
// Catatan disiplin: sesudah uji mutasi #16 menemukan test yang memeriksa HASIL
// dan bukan JALUR, di sini tiap jepit diuji lewat nilai antaranya
// (persenCostToCost, pendapatanDiakui), bukan cuma lewat angka akhir.

const p = (o: Partial<InputWIP> = {}): InputWIP => ({
  projectId: 'x', nama: 'Proyek', status: 'active',
  nilaiKontrak: 1_000_000_000,
  biayaTerjadi: 400_000_000,
  estimasiTotalBiaya: 800_000_000,
  progressPct: 50,
  totalDitagih: 0,
  ...o,
})

describe('persentase penyelesaian', () => {
  it('cost-to-cost = biaya ÷ estimasi total', () => {
    const r = hitungWIP(p())
    expect(r.persenCostToCost).toBe(50)   // 400jt / 800jt
    expect(r.metode).toBe('cost_to_cost')
  })

  it('cost-to-cost DIPAKAI meski fisik berbeda — ia standar audit', () => {
    // Fisik berbasis penilaian manusia; cost-to-cost berbasis angka terekam.
    const r = hitungWIP(p({ progressPct: 70 }))
    expect(r.persenDipakai).toBe(50)
    expect(r.persenFisik).toBe(70)
  })

  it('tanpa estimasi biaya → jatuh ke fisik, DENGAN peringatan', () => {
    const r = hitungWIP(p({ estimasiTotalBiaya: null, progressPct: 60 }))
    expect(r.metode).toBe('fisik')
    expect(r.persenDipakai).toBe(60)
    expect(r.persenCostToCost).toBeNull()
    expect(r.peringatan.some((w) => w.includes('cost-to-cost'))).toBe(true)
  })

  it('biaya MELAMPAUI estimasi → dijepit 100%, dilaporkan sebagai kerugian', () => {
    // Yang diuji JALURnya: persenCostToCost harus persis 100, bukan 125.
    // Tanpa jepit, pendapatan diakui jadi 1,25 M dari kontrak 1 M — mengakui
    // pendapatan yang tak pernah ada.
    const r = hitungWIP(p({ biayaTerjadi: 1_000_000_000 }))
    expect(r.persenCostToCost).toBe(100)
    expect(r.pendapatanDiakui).toBe(1_000_000_000)
    expect(r.pendapatanDiakui).not.toBeGreaterThan(1_000_000_000)
    expect(r.peringatan.some((w) => w.includes('meleset'))).toBe(true)
  })

  it('fisik di luar 0..100 dijepit — diuji lewat pendapatan, bukan cuma hasil', () => {
    const r = hitungWIP(p({ estimasiTotalBiaya: null, progressPct: 140 }))
    expect(r.persenFisik).toBe(100)
    expect(r.pendapatanDiakui).toBe(1_000_000_000)

    const r2 = hitungWIP(p({ estimasiTotalBiaya: null, progressPct: -30 }))
    expect(r2.persenFisik).toBe(0)
    expect(r2.pendapatanDiakui).toBe(0)
  })
})

describe('pendapatan & laba diakui', () => {
  it('pendapatan = persen × nilai kontrak', () => {
    expect(hitungWIP(p()).pendapatanDiakui).toBe(500_000_000)
  })

  it('laba = pendapatan diakui − biaya terjadi', () => {
    const r = hitungWIP(p())
    expect(r.labaDiakui).toBe(100_000_000)   // 500jt − 400jt
    expect(r.marginPct).toBe(20)
  })

  it('RUGI diakui sekarang, bukan ditunda — PSAK mewajibkannya', () => {
    // Estimasi 1,2 M untuk kontrak 1 M = proyek memang rugi. Menunda
    // pengakuannya ke akhir membuat laporan bulanan berbohong sampai terlambat.
    const r = hitungWIP(p({ biayaTerjadi: 600_000_000, estimasiTotalBiaya: 1_200_000_000 }))
    expect(r.persenCostToCost).toBe(50)
    expect(r.labaDiakui).toBe(-100_000_000)   // 500jt − 600jt
    expect(r.peringatan.some((w) => w.includes('Rugi diakui'))).toBe(true)
  })

  it('nilai kontrak nol → pendapatan null, bukan 0', () => {
    const r = hitungWIP(p({ nilaiKontrak: 0 }))
    expect(r.pendapatanDiakui).toBeNull()
    expect(r.peringatan.some((w) => w.includes('kontrak nol'))).toBe(true)
  })
})

describe('CIE / BIE — inti WIP', () => {
  it('pekerjaan mendahului tagihan → CIE (ASET)', () => {
    // Diakui 500jt, baru ditagih 300jt → berhak menagih 200jt lagi.
    const r = hitungWIP(p({ totalDitagih: 300_000_000 }))
    expect(r.cie).toBe(200_000_000)
    expect(r.bie).toBe(0)
  })

  it('tagihan mendahului pekerjaan → BIE (LIABILITAS)', () => {
    // Ini yang paling berbahaya: 700jt di rekening terlihat seperti kas
    // melimpah, padahal 200jt di antaranya UTANG PEKERJAAN yang belum ada.
    const r = hitungWIP(p({ totalDitagih: 700_000_000 }))
    expect(r.bie).toBe(200_000_000)
    expect(r.cie).toBe(0)
  })

  it('CIE & BIE tak pernah keduanya terisi, dan tak pernah negatif', () => {
    for (const ditagih of [0, 300_000_000, 500_000_000, 900_000_000]) {
      const r = hitungWIP(p({ totalDitagih: ditagih }))
      expect(r.cie).toBeGreaterThanOrEqual(0)
      expect(r.bie).toBeGreaterThanOrEqual(0)
      expect(r.cie === 0 || r.bie === 0).toBe(true)
    }
  })

  it('tagihan persis sama dengan pendapatan diakui → keduanya nol', () => {
    const r = hitungWIP(p({ totalDitagih: 500_000_000 }))
    expect(r.cie).toBe(0)
    expect(r.bie).toBe(0)
  })
})

describe('selisih dua metode = sinyal, bukan bug', () => {
  it('uang mendahului pekerjaan → peringatan pemborosan', () => {
    const r = hitungWIP(p({ biayaTerjadi: 640_000_000, progressPct: 40 }))
    expect(r.persenCostToCost).toBe(80)
    expect(r.selisihMetodePoin).toBe(40)
    expect(r.peringatan.some((w) => w.includes('Uang mendahului'))).toBe(true)
  })

  it('pekerjaan mendahului biaya → peringatan biaya belum tercatat', () => {
    const r = hitungWIP(p({ biayaTerjadi: 160_000_000, progressPct: 70 }))
    expect(r.selisihMetodePoin).toBe(-50)
    expect(r.peringatan.some((w) => w.includes('belum tercatat'))).toBe(true)
  })

  it('selisih kecil tak memicu peringatan — kalau tiap selisih berbunyi, orang berhenti membaca', () => {
    const r = hitungWIP(p({ biayaTerjadi: 440_000_000, progressPct: 50 }))
    expect(r.selisihMetodePoin).toBe(5)
    expect(r.peringatan.filter((w) => w.includes('poin'))).toHaveLength(0)
  })
})

describe('ringkasan portofolio', () => {
  const data = [
    hitungWIP(p({ projectId: 'a', totalDitagih: 300_000_000 })),                        // CIE 200jt
    hitungWIP(p({ projectId: 'b', totalDitagih: 700_000_000 })),                        // BIE 200jt
    hitungWIP(p({ projectId: 'c', estimasiTotalBiaya: null, progressPct: 30 })),        // tanpa estimasi
    hitungWIP(p({ projectId: 'd', biayaTerjadi: 600_000_000, estimasiTotalBiaya: 1_200_000_000 })), // rugi
  ]

  it('CIE dan BIE dijumlahkan TERPISAH, tak saling menghapus', () => {
    // Di neraca yang satu ASET dan yang lain LIABILITAS. Menyalinghapuskannya
    // (jumlah CIE − jumlah BIE) menyembunyikan kedua-duanya sekaligus.
    //   a: diakui 500jt, ditagih 300jt → CIE 200jt
    //   c: fisik 30% × 1 M = 300jt, ditagih 0 → CIE 300jt
    //   d: diakui 500jt, ditagih 0        → CIE 500jt
    //   b: diakui 500jt, ditagih 700jt    → BIE 200jt
    const r = ringkasWIP(data)
    expect(r.totalCIE).toBe(1_000_000_000)
    expect(r.totalBIE).toBe(200_000_000)
    // Yang dijaga: keduanya berdiri sendiri, bukan satu angka bersih.
    expect(r.totalCIE - r.totalBIE).not.toBe(r.totalCIE)
    expect(r.totalBIE).toBeGreaterThan(0)
  })

  it('menghitung proyek rugi & yang tanpa estimasi biaya', () => {
    const r = ringkasWIP(data)
    // DUA yang rugi, bukan satu: `d` rugi karena estimasi biaya melampaui
    // kontrak, dan `c` juga — fisik 30% mengakui 300jt sementara biayanya
    // sudah 400jt. Justru itu gunanya: proyek tanpa pagu RAP bisa terlihat
    // baik-baik saja sampai angkanya dihitung.
    expect(r.proyekRugi).toBe(2)
    expect(r.proyekTanpaEstimasiBiaya).toBe(1)
  })

  it('SELALU menyatakan bahwa ini laporan, bukan jurnal', () => {
    // Angka WIP mudah disangka sudah masuk pembukuan. Ia belum.
    const r = ringkasWIP(data)
    expect(r.keterbatasan[0]).toContain('bukan jurnal')
    expect(r.keterbatasan[0]).toContain('GL')
  })

  it('menyebut proyek rugi di keterbatasan', () => {
    expect(ringkasWIP(data).keterbatasan.some((k) => k.includes('SEKARANG'))).toBe(true)
  })

  it('portofolio kosong → nol semua, keterbatasan dasar tetap ada', () => {
    const r = ringkasWIP([])
    expect(r.jumlahProyek).toBe(0)
    expect(r.totalCIE).toBe(0)
    expect(r.keterbatasan.length).toBeGreaterThan(0)
  })
})
