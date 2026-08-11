import { describe, it, expect } from 'vitest'
import {
  hitungHariCuti, hitungSaldo, bolehAjukan, rentangTanggal, angka,
  type BarisHak, type BarisAmbil, type HariLibur, type JenisCuti,
} from '../cuti-karyawan.js'

// `!== undefined`, bukan `??` — pelajaran G1e/G2a/G2b: `??` membuat nilai yang
// sengaja diminta test (null, 0, '') diam-diam diganti bawaan.
function hak(p: Partial<BarisHak> = {}): BarisHak {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    tahun: p.tahun ?? 2026,
    jumlah_hari: p.jumlah_hari !== undefined ? p.jumlah_hari : 12,
    alasan: p.alasan ?? 'jatah tahunan',
    berlaku_sampai: p.berlaku_sampai !== undefined ? p.berlaku_sampai : null,
  }
}

function ambil(p: Partial<BarisAmbil> & { jenis?: JenisCuti } = {}): BarisAmbil {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    jenis: p.jenis ?? 'tahunan',
    tanggal_mulai: p.tanggal_mulai ?? '2026-09-07',
    tanggal_selesai: p.tanggal_selesai ?? '2026-09-09',
    jumlah_hari: p.jumlah_hari !== undefined ? p.jumlah_hari : 3,
    status: p.status ?? 'disetujui',
    alasan: p.alasan !== undefined ? p.alasan : null,
    alasan_tolak: p.alasan_tolak !== undefined ? p.alasan_tolak : null,
    hari_dilewati: p.hari_dilewati !== undefined ? p.hari_dilewati : null,
  }
}

// 2026-09-07 Senin … 09-11 Jumat; 09-12 Sabtu, 09-13 Minggu.
const LIBUR: HariLibur[] = [
  { tanggal: '2026-09-09', nama: 'Maulid Nabi', tetap_bekerja: false },
]

describe('angka', () => {
  it('string kosong → null, bukan 0', () => {
    // `Number('')` adalah 0 — pelajaran G2a, diulang karena di sini akibatnya
    // saldo cuti yang salah.
    expect(angka('')).toBeNull()
    expect(angka('NaN')).toBeNull()
    expect(angka('-2.5')).toBe(-2.5)
  })
})

describe('rentangTanggal', () => {
  it('inklusif dua ujung, dan rentang terbalik → kosong', () => {
    expect(rentangTanggal('2026-09-07', '2026-09-09'))
      .toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
    expect(rentangTanggal('2026-09-09', '2026-09-07')).toEqual([])
  })
})

describe('hitungHariCuti — akhir pekan & libur tidak memakan jatah', () => {
  it('Jumat sampai Senin adalah 2 hari, bukan 4', () => {
    // 2026-09-11 Jumat, 09-12 Sabtu, 09-13 Minggu, 09-14 Senin.
    const h = hitungHariCuti('2026-09-11', '2026-09-14', [])
    expect(h.jumlah_hari).toBe(2)
    expect(h.total_tanggal).toBe(4)
    expect(h.dilewati.map((d) => d.sebab)).toEqual(['Sabtu', 'Minggu'])
  })

  it('hari libur nasional tidak dihitung', () => {
    // Senin–Rabu, dengan Rabu (09-09) libur Maulid.
    const h = hitungHariCuti('2026-09-07', '2026-09-09', LIBUR)
    expect(h.jumlah_hari).toBe(2)
    expect(h.dilewati).toEqual([{ tanggal: '2026-09-09', sebab: 'Maulid Nabi' }])
  })

  it('libur yang TETAP BEKERJA tetap memakan jatah', () => {
    const h = hitungHariCuti('2026-09-07', '2026-09-09', [
      { tanggal: '2026-09-09', nama: 'Maulid Nabi', tetap_bekerja: true },
    ])
    // Bagi yang tetap masuk hari itu, cuti di tanggal tersebut memakan jatah.
    // Memperlakukannya libur memberi cuti gratis yang tak pernah diputuskan.
    expect(h.jumlah_hari).toBe(3)
    expect(h.dilewati).toEqual([])
  })

  it('tanggal yang dilewati dikembalikan BESERTA sebabnya', () => {
    const h = hitungHariCuti('2026-09-11', '2026-09-14', LIBUR)
    // Pegawai yang bertanya "kenapa cuma 2 hari" harus bisa dijawab dari
    // layarnya sendiri, bukan dengan membuka kode.
    expect(h.dilewati).toEqual([
      { tanggal: '2026-09-12', sebab: 'Sabtu' },
      { tanggal: '2026-09-13', sebab: 'Minggu' },
    ])
  })

  it('rentang yang SELURUHNYA libur menghasilkan 0', () => {
    const h = hitungHariCuti('2026-09-12', '2026-09-13', [])
    expect(h.jumlah_hari).toBe(0)
    expect(h.total_tanggal).toBe(2)
  })

  it('satu hari kerja tunggal = 1', () => {
    expect(hitungHariCuti('2026-09-07', '2026-09-07', []).jumlah_hari).toBe(1)
  })
})

describe('hitungSaldo — diturunkan dari transaksi', () => {
  it('hanya jenis TAHUNAN yang memakan jatah', () => {
    const s = hitungSaldo(
      [hak({ jumlah_hari: 12 })],
      [
        ambil({ jenis: 'tahunan', jumlah_hari: 3 }),
        // Sakit & melahirkan adalah hak TERPISAH. Memotongnya dari jatah
        // berarti karyawan yang sakit kehilangan liburannya.
        ambil({ jenis: 'sakit', jumlah_hari: 5 }),
        ambil({ jenis: 'melahirkan', jumlah_hari: 90 }),
      ],
      2026,
    )
    expect(s.terpakai).toBe(3)
    expect(s.sisa).toBe(9)
  })

  it('yang DIAJUKAN menahan jatah, terpisah dari terpakai', () => {
    const s = hitungSaldo(
      [hak({ jumlah_hari: 12 })],
      [
        ambil({ jumlah_hari: 3, status: 'disetujui' }),
        ambil({ jumlah_hari: 2, status: 'diajukan' }),
      ],
      2026,
    )
    // Tanpa `tertahan`, pegawai bisa mengajukan tiga kali jatah penuh sebelum
    // satu pun diputuskan.
    expect(s.terpakai).toBe(3)
    expect(s.tertahan).toBe(2)
    expect(s.sisa).toBe(7)
  })

  it('ditolak & dibatalkan TIDAK mengurangi apa pun', () => {
    const s = hitungSaldo(
      [hak({ jumlah_hari: 12 })],
      [
        ambil({ jumlah_hari: 5, status: 'ditolak' }),
        ambil({ jumlah_hari: 4, status: 'dibatalkan' }),
      ],
      2026,
    )
    expect(s.terpakai).toBe(0)
    expect(s.tertahan).toBe(0)
    expect(s.sisa).toBe(12)
  })

  it('hak NEGATIF (koreksi) ikut dijumlahkan', () => {
    const s = hitungSaldo(
      [hak({ jumlah_hari: 12, alasan: 'jatah tahunan' }),
       hak({ jumlah_hari: -2, alasan: 'koreksi kelebihan' })],
      [], 2026,
    )
    // Koreksi dicatat sebagai BARIS, bukan dengan mengedit baris lama —
    // mengedit menghapus jejak.
    expect(s.hak).toBe(10)
  })

  it('hak tahun LAIN tidak ikut', () => {
    const s = hitungSaldo(
      [hak({ tahun: 2026, jumlah_hari: 12 }), hak({ tahun: 2025, jumlah_hari: 8 })],
      [], 2026,
    )
    expect(s.hak).toBe(12)
  })

  it('sisa boleh NEGATIF, tidak dipotong ke nol', () => {
    const s = hitungSaldo(
      [hak({ jumlah_hari: 2 })],
      [ambil({ jumlah_hari: 5, status: 'disetujui' })],
      2026,
    )
    // Memotongnya ke nol menyembunyikan jatah yang terlanjur terpakai
    // berlebih — dan itu justru yang perlu dilihat.
    expect(s.sisa).toBe(-3)
  })

  it('nol hak, nol ambil → nol semuanya', () => {
    const s = hitungSaldo([], [], 2026)
    expect(s).toMatchObject({ hak: 0, terpakai: 0, tertahan: 0, sisa: 0 })
  })
})

describe('bolehAjukan', () => {
  const saldo12 = hitungSaldo([hak({ jumlah_hari: 12 })], [], 2026)

  it('pengajuan wajar diterima', () => {
    const h = hitungHariCuti('2026-09-07', '2026-09-08', [])
    expect(bolehAjukan('tahunan', '2026-09-07', '2026-09-08', h, saldo12, []).boleh).toBe(true)
  })

  it('rentang SELURUHNYA libur ditolak, bukan diterima sebagai 0 hari', () => {
    const h = hitungHariCuti('2026-09-12', '2026-09-13', [])
    const r = bolehAjukan('tahunan', '2026-09-12', '2026-09-13', h, saldo12, [])
    expect(r.boleh).toBe(false)
    expect(r.penghalang.map((p) => p.kode)).toContain('nol-hari')
  })

  it('rentang terbalik ditolak SENDIRI, tanpa penghalang lain ikut', () => {
    const h = hitungHariCuti('2026-09-09', '2026-09-07', [])
    const r = bolehAjukan('tahunan', '2026-09-09', '2026-09-07', h, saldo12, [])
    expect(r.penghalang).toHaveLength(1)
    expect(r.penghalang[0].kode).toBe('rentang-terbalik')
  })

  it('tumpang tindih dengan pengajuan HIDUP ditolak', () => {
    const h = hitungHariCuti('2026-09-07', '2026-09-09', [])
    const r = bolehAjukan('tahunan', '2026-09-07', '2026-09-09', h, saldo12, [
      ambil({ tanggal_mulai: '2026-09-08', tanggal_selesai: '2026-09-10', status: 'disetujui' }),
    ])
    expect(r.boleh).toBe(false)
    const p = r.penghalang.find((x) => x.kode === 'tumpang-tindih')!
    expect(p.bentrok).toHaveLength(1)
  })

  it('yang DITOLAK/DIBATALKAN tidak menghalangi tanggal itu', () => {
    const h = hitungHariCuti('2026-09-07', '2026-09-09', [])
    const r = bolehAjukan('tahunan', '2026-09-07', '2026-09-09', h, saldo12, [
      ambil({ tanggal_mulai: '2026-09-08', tanggal_selesai: '2026-09-10', status: 'ditolak' }),
      ambil({ tanggal_mulai: '2026-09-07', tanggal_selesai: '2026-09-07', status: 'dibatalkan' }),
    ])
    expect(r.boleh).toBe(true)
  })

  it('bersinggungan di UJUNG saja tetap terhitung tumpang tindih', () => {
    const h = hitungHariCuti('2026-09-09', '2026-09-11', [])
    const r = bolehAjukan('tahunan', '2026-09-09', '2026-09-11', h, saldo12, [
      ambil({ tanggal_mulai: '2026-09-07', tanggal_selesai: '2026-09-09', status: 'disetujui' }),
    ])
    // 09-09 ada di kedua rentang. Perbandingan yang memakai `<` alih-alih
    // `<=` melewatkan kasus ini, dan satu hari terhitung dua kali.
    expect(r.penghalang.map((p) => p.kode)).toContain('tumpang-tindih')
  })

  it('saldo kurang menghalangi cuti TAHUNAN, dengan angkanya', () => {
    const saldo2 = hitungSaldo([hak({ jumlah_hari: 2 })], [], 2026)
    const h = hitungHariCuti('2026-09-07', '2026-09-11', [])
    const r = bolehAjukan('tahunan', '2026-09-07', '2026-09-11', h, saldo2, [])
    expect(r.boleh).toBe(false)
    const p = r.penghalang.find((x) => x.kode === 'saldo-kurang')!
    // "Tidak cukup" tak bisa ditindaklanjuti; angkanya bisa.
    expect(p.pesan).toMatch(/2 hari/)
    expect(p.pesan).toMatch(/5 hari/)
  })

  it('saldo kurang TIDAK menghalangi cuti sakit', () => {
    const saldo0 = hitungSaldo([], [], 2026)
    const h = hitungHariCuti('2026-09-07', '2026-09-11', [])
    // Menolak cuti sakit karena "jatah habis" merugikan karyawan, dan sakit
    // memang bukan hak yang sama.
    expect(bolehAjukan('sakit', '2026-09-07', '2026-09-11', h, saldo0, []).boleh).toBe(true)
  })

  it('pesan saldo menyebut yang TERTAHAN kalau ada', () => {
    const s = hitungSaldo(
      [hak({ jumlah_hari: 5 })],
      [ambil({ jumlah_hari: 4, status: 'diajukan' })],
      2026,
    )
    const h = hitungHariCuti('2026-09-07', '2026-09-09', [])
    const r = bolehAjukan('tahunan', '2026-09-07', '2026-09-09', h, s, [])
    // Pegawai yang melihat "sisa 1 hari" padahal jatahnya 5 perlu tahu
    // sebabnya, bukan mengira sistemnya salah.
    expect(r.penghalang.find((x) => x.kode === 'saldo-kurang')!.pesan)
      .toMatch(/menunggu putusan/)
  })
})
