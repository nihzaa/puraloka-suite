import { describe, it, expect } from 'vitest'
import { analisaProyek, ringkasPortofolio, urutkanPerhatian, type BarisProyek } from '../cost-analytics'

// Agregasi lintas proyek dipakai pemilik untuk memutuskan DI MANA harus turun
// tangan. Dua hal yang mudah salah dan mahal:
//   1. dasar pembanding (RAP belanja vs RAB jual) — salah pilih membuat
//      persentase serapan terlihat jauh lebih kecil dari kenyataan
//   2. "tak diketahui" vs "nol" — proyek tanpa pagu yang dilaporkan 0% terbaca
//      sebagai proyek paling hemat, kebalikan dari kenyataannya

const p = (o: Partial<BarisProyek> = {}): BarisProyek => ({
  projectId: 'x', nama: 'Proyek', status: 'active',
  contractValue: 0, rabValue: 0, paguRAP: 0, serapan: 0, progressPct: 0, ...o,
})

describe('dasar pembanding berjenjang', () => {
  it('RAP terkunci menang atas RAB dan kontrak', () => {
    // RAP = rencana BELANJA. Itu pembanding yang tepat untuk pengeluaran.
    const r = analisaProyek(p({ paguRAP: 800, rabValue: 1000, contractValue: 1200, serapan: 400 }))
    expect(r.dasarPembanding).toBe('rap_locked')
    expect(r.pagu).toBe(800)
    expect(r.serapanPct).toBe(50)
  })

  it('tanpa RAP → RAB; persentasenya jadi lebih kecil (dan itu HARUS disadari)', () => {
    // Membandingkan belanja dengan harga JUAL membuat serapan terlihat hemat.
    const r = analisaProyek(p({ rabValue: 1000, contractValue: 1200, serapan: 400 }))
    expect(r.dasarPembanding).toBe('rab')
    expect(r.serapanPct).toBe(40)   // vs 50% kalau dibanding pagu belanja
  })

  it('hanya kontrak → dipakai sebagai pilihan terakhir', () => {
    const r = analisaProyek(p({ contractValue: 1200, serapan: 600 }))
    expect(r.dasarPembanding).toBe('contract_value')
    expect(r.serapanPct).toBe(50)
  })

  it('tanpa pagu apa pun → null, BUKAN 0%', () => {
    // 0% akan terbaca sebagai proyek paling hemat. Yang benar: tak bisa dinilai.
    const r = analisaProyek(p({ serapan: 500 }))
    expect(r.dasarPembanding).toBe('tak_ada')
    expect(r.serapanPct).toBeNull()
    expect(r.deviasiPoin).toBeNull()
    expect(r.sisaPagu).toBeNull()
  })
})

describe('deviasi & sisa pagu', () => {
  it('positif = uang keluar mendahului pekerjaan', () => {
    const r = analisaProyek(p({ paguRAP: 1000, serapan: 700, progressPct: 40 }))
    expect(r.serapanPct).toBe(70)
    expect(r.deviasiPoin).toBe(30)
  })

  it('negatif = pekerjaan mendahului pengeluaran', () => {
    const r = analisaProyek(p({ paguRAP: 1000, serapan: 300, progressPct: 60 }))
    expect(r.deviasiPoin).toBe(-30)
  })

  it('sisa pagu negatif saat sudah lewat', () => {
    const r = analisaProyek(p({ paguRAP: 1000, serapan: 1250 }))
    expect(r.sisaPagu).toBe(-250)
    expect(r.serapanPct).toBe(125)
  })
})

describe('ringkasan portofolio', () => {
  const data = [
    analisaProyek(p({ projectId: 'a', paguRAP: 1000, serapan: 1200, progressPct: 50, contractValue: 1500 })),
    analisaProyek(p({ projectId: 'b', rabValue: 2000, serapan: 500, progressPct: 40, contractValue: 2400 })),
    analisaProyek(p({ projectId: 'c', serapan: 300, contractValue: 0 })),   // tanpa pagu
  ]

  it('menghitung lewat-pagu & serapan-mendahului', () => {
    const r = ringkasPortofolio(data)
    expect(r.jumlahProyek).toBe(3)
    expect(r.lewatPagu).toBe(1)            // a: 1200 > 1000
    expect(r.serapanMendahului).toBe(1)    // a: 120% vs 50% = +70 poin
    expect(r.tanpaPagu).toBe(1)
  })

  it('totalPagu hanya menjumlahkan yang PUNYA pagu', () => {
    // Menjumlahkan nol dari proyek tanpa pagu membuat rasio serapan
    // terhadap pagu menyesatkan.
    expect(ringkasPortofolio(data).totalPagu).toBe(3000)
  })

  it('pagu NEGATIF (data rusak) tak ikut mengurangi total portofolio', () => {
    // Uji mutasi menunjukkan test di atas saja tak cukup: mengganti
    // `pagu > 0 ? pagu : 0` dengan `pagu` polos tetap hijau, karena datanya
    // kebetulan tak pernah negatif. Nilai kontrak negatif memang salah input,
    // tapi kalau ia sampai masuk, ia TAK BOLEH diam-diam mengurangi total
    // portofolio — angka yang mengecil tanpa sebab jauh lebih sulit
    // dilacak daripada satu baris yang jelas salah.
    const rusak = [
      analisaProyek(p({ projectId: 'ok', paguRAP: 1000, serapan: 100 })),
      analisaProyek(p({ projectId: 'rusak', contractValue: -5000, serapan: 0 })),
    ]
    expect(ringkasPortofolio(rusak).totalPagu).toBe(1000)
  })

  it('SELALU menyertakan batas "belum diadu ke realisasi belanja"', () => {
    // Syarat eksplisit ROADMAP #18. Angka yang terlihat rapi tanpa peringatan
    // mengundang keputusan yang datanya belum sanggup menopang.
    const r = ringkasPortofolio(data)
    expect(r.keterbatasan[0]).toContain('belum diadu ke realisasi')
    expect(r.keterbatasan.join(' ')).toContain('§D7')
  })

  it('menyebut berapa proyek yang paguanya dari RAB (harga jual)', () => {
    const r = ringkasPortofolio(data)
    expect(r.keterbatasan.some((k) => k.includes('harga JUAL'))).toBe(true)
  })

  it('menyebut proyek yang tak punya pagu sama sekali', () => {
    const r = ringkasPortofolio(data)
    expect(r.keterbatasan.some((k) => k.includes('TAK punya pagu'))).toBe(true)
  })

  it('portofolio kosong → nol semua, keterbatasan dasar tetap ada', () => {
    const r = ringkasPortofolio([])
    expect(r.jumlahProyek).toBe(0)
    expect(r.totalPagu).toBe(0)
    expect(r.keterbatasan.length).toBeGreaterThan(0)   // batas D7 selalu berlaku
  })
})

describe('urutan perhatian', () => {
  it('lewat pagu selalu di atas, lalu deviasi terbesar', () => {
    const hasil = [
      analisaProyek(p({ projectId: 'deviasi', paguRAP: 1000, serapan: 800, progressPct: 20 })),  // +60
      analisaProyek(p({ projectId: 'lewat',   paguRAP: 1000, serapan: 1100, progressPct: 95 })), // +15, lewat
      analisaProyek(p({ projectId: 'aman',    paguRAP: 1000, serapan: 300, progressPct: 40 })),  // -10
    ]
    expect(urutkanPerhatian(hasil).map((h) => h.projectId)).toEqual(['lewat', 'deviasi', 'aman'])
  })

  it('proyek yang TAK BISA dinilai turun ke bawah, bukan dianggap aman', () => {
    const hasil = [
      analisaProyek(p({ projectId: 'null', serapan: 999 })),
      analisaProyek(p({ projectId: 'aman', paguRAP: 1000, serapan: 100, progressPct: 50 })),
    ]
    // Keduanya "tak bermasalah" menurut angka, tapi yang null bukan berarti
    // baik — ia belum bisa dinilai. Ditaruh paling bawah supaya tak menyamar
    // sebagai proyek paling sehat di puncak daftar.
    expect(urutkanPerhatian(hasil).map((h) => h.projectId)).toEqual(['aman', 'null'])
  })
})
