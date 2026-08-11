import { describe, it, expect } from 'vitest'
import {
  ringkasTimesheet, bolehDiajukan, rentangTanggal, angka,
  type BarisTimesheet,
} from '../timesheet-staf.js'

// `!== undefined`, bukan `??` — pelajaran dari G1e & G2a: `??` membuat nilai
// yang sengaja diminta test (null, 0, '') diam-diam diganti bawaan, sehingga
// test yang menguji "kosong" justru menguji "terisi".
function baris(p: Partial<BarisTimesheet> & { tanggal: string }): BarisTimesheet {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    tanggal: p.tanggal,
    jam_kerja: p.jam_kerja !== undefined ? p.jam_kerja : 8,
    jam_lembur: p.jam_lembur !== undefined ? p.jam_lembur : 0,
    project_id: p.project_id !== undefined ? p.project_id : null,
    kegiatan: p.kegiatan !== undefined ? p.kegiatan : null,
    status: p.status ?? 'draf',
    alasan_tolak: p.alasan_tolak !== undefined ? p.alasan_tolak : null,
  }
}

describe('angka', () => {
  it('string numeric dibaca; kosong dan NaN jadi null', () => {
    expect(angka('7.5')).toBe(7.5)
    // `Number('')` adalah 0 — pelajaran G2a, diulang di sini karena kolom
    // jam yang dikosongkan akan terbaca "nol jam kerja", bukan "belum diisi".
    expect(angka('')).toBeNull()
    expect(angka('NaN')).toBeNull()
  })
})

describe('rentangTanggal', () => {
  it('inklusif di kedua ujung', () => {
    expect(rentangTanggal('2026-08-03', '2026-08-05'))
      .toEqual(['2026-08-03', '2026-08-04', '2026-08-05'])
  })

  it('melintasi batas bulan', () => {
    expect(rentangTanggal('2026-07-30', '2026-08-02'))
      .toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
  })

  it('rentang terbalik → daftar kosong, bukan perulangan tak berujung', () => {
    expect(rentangTanggal('2026-08-05', '2026-08-01')).toEqual([])
  })

  it('satu hari → satu entri', () => {
    expect(rentangTanggal('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })
})

describe('ringkasTimesheet — belum diisi ≠ nol jam', () => {
  // 2026-08-03 Senin … 2026-08-07 Jumat; 08-08 Sabtu, 08-09 Minggu.
  const senin = '2026-08-03', selasa = '2026-08-04', rabu = '2026-08-05'

  it('hari kerja tanpa baris masuk `hari_kosong`, TIDAK dihitung nol jam', () => {
    const r = ringkasTimesheet(
      [baris({ tanggal: senin, jam_kerja: 8 })],
      8,
      { awal: senin, akhir: rabu },
    )
    // Selasa & Rabu belum diisi. Menghitungnya nol membuat pegawai yang lupa
    // mengisi terbaca seperti tidak bekerja — dan itu masuk laporan biaya.
    expect(r.hari_kosong).toEqual([selasa, rabu])
    expect(r.total_jam_kerja).toBe(8)
    expect(r.hari_terisi).toBe(1)
  })

  it('AKHIR PEKAN tidak masuk `hari_kosong`', () => {
    const r = ringkasTimesheet(
      [baris({ tanggal: '2026-08-07', jam_kerja: 8 })],
      8,
      { awal: '2026-08-07', akhir: '2026-08-09' },  // Jum, Sab, Min
    )
    // Peringatan yang selalu menyala berhenti dibaca.
    expect(r.hari_kosong).toEqual([])
  })

  it('tanpa rentang, `hari_kosong` kosong — tak ada yang bisa disimpulkan', () => {
    const r = ringkasTimesheet([baris({ tanggal: senin })], 8)
    expect(r.hari_kosong).toEqual([])
  })
})

describe('ringkasTimesheet — lembur tidak diturunkan dari total', () => {
  it('jam kerja MELEBIHI standar hanya DITANDAI, lembur tak dibuat sendiri', () => {
    const r = ringkasTimesheet(
      [baris({ tanggal: '2026-08-03', jam_kerja: 10, jam_lembur: 0 })],
      8,
    )
    // Lembur harus DIPERINTAHKAN. Menurunkannya otomatis membuat setiap
    // keterlambatan pulang jadi tagihan lembur yang tak pernah disetujui.
    expect(r.total_jam_lembur).toBe(0)
    expect(r.baris[0].melebihi_standar).toBe(true)
    expect(r.perlu_ditanya).toHaveLength(1)
  })

  it('lembur yang DICATAT tidak ditandai melebihi standar', () => {
    const r = ringkasTimesheet(
      [baris({ tanggal: '2026-08-03', jam_kerja: 8, jam_lembur: 3 })],
      8,
    )
    // Total 11 jam, tapi jam kerja normalnya pas 8 — ini keadaan yang BENAR,
    // dan menandainya akan membanjiri layar dengan peringatan palsu.
    expect(r.baris[0].melebihi_standar).toBe(false)
    expect(r.perlu_ditanya).toHaveLength(0)
    expect(r.total_jam_lembur).toBe(3)
  })

  it('lembur di hari libur dengan jam kerja 0 tetap terhitung penuh', () => {
    const r = ringkasTimesheet(
      [baris({ tanggal: '2026-08-08', jam_kerja: 0, jam_lembur: 6 })],
      8,
    )
    // Rumus `total - standar` menghasilkan NOL untuk kasus ini — itulah
    // kenapa lembur adalah kolom sendiri.
    expect(r.total_jam_lembur).toBe(6)
    expect(r.baris[0].di_bawah_standar).toBe(false)
  })

  it('jam kerja di bawah standar ditandai terpisah dari melebihi', () => {
    const r = ringkasTimesheet(
      [baris({ tanggal: '2026-08-03', jam_kerja: 4 })],
      8,
    )
    expect(r.baris[0].di_bawah_standar).toBe(true)
    expect(r.baris[0].melebihi_standar).toBe(false)
  })
})

describe('ringkasTimesheet — jam per proyek', () => {
  it('overhead kantor (`null`) tetap jadi kelompok sendiri', () => {
    const r = ringkasTimesheet([
      baris({ tanggal: '2026-08-03', jam_kerja: 8, project_id: 'p1' }),
      baris({ tanggal: '2026-08-04', jam_kerja: 4, project_id: null }),
      baris({ tanggal: '2026-08-05', jam_kerja: 6, project_id: 'p1' }),
    ], 8)
    const p1 = r.per_proyek.find((x) => x.project_id === 'p1')!
    const kantor = r.per_proyek.find((x) => x.project_id === null)!
    expect(p1.jam).toBe(14)
    // Waktu overhead HARUS terlihat — memaksakan proyek membuat orang
    // memilih proyek asal, merusak justru angka yang dicari.
    expect(kantor.jam).toBe(4)
  })

  it('lembur dijumlahkan terpisah dari jam kerja per proyek', () => {
    const r = ringkasTimesheet([
      baris({ tanggal: '2026-08-03', jam_kerja: 8, jam_lembur: 2, project_id: 'p1' }),
    ], 8)
    expect(r.per_proyek[0].jam).toBe(8)
    expect(r.per_proyek[0].lembur).toBe(2)
  })

  it('urutan per proyek: yang paling banyak menyerap waktu dulu', () => {
    const r = ringkasTimesheet([
      baris({ tanggal: '2026-08-03', jam_kerja: 2, project_id: 'kecil' }),
      baris({ tanggal: '2026-08-04', jam_kerja: 9, project_id: 'besar' }),
      baris({ tanggal: '2026-08-05', jam_kerja: 5, project_id: 'sedang' }),
    ], 8)
    // Tiga elemen dengan masukan teracak — dua elemen tak bisa membedakan
    // komparator yang dibalik (pelajaran fixture geotag 2026-08-10).
    expect(r.per_proyek.map((x) => x.project_id)).toEqual(['besar', 'sedang', 'kecil'])
  })
})

describe('ringkasTimesheet — urutan & status', () => {
  it('baris diurutkan menurut tanggal, TERBARU dulu', () => {
    const r = ringkasTimesheet([
      baris({ tanggal: '2026-08-03' }),
      baris({ tanggal: '2026-08-07' }),
      baris({ tanggal: '2026-08-05' }),
    ], 8)
    expect(r.baris.map((b) => b.tanggal))
      .toEqual(['2026-08-07', '2026-08-05', '2026-08-03'])
  })

  it('status dihitung terpisah', () => {
    const r = ringkasTimesheet([
      baris({ tanggal: '2026-08-03', status: 'draf' }),
      baris({ tanggal: '2026-08-04', status: 'diajukan' }),
      baris({ tanggal: '2026-08-05', status: 'disetujui' }),
      baris({ tanggal: '2026-08-06', status: 'disetujui' }),
    ], 8)
    expect(r.per_status.draf).toBe(1)
    expect(r.per_status.diajukan).toBe(1)
    expect(r.per_status.disetujui).toBe(2)
    expect(r.per_status.ditolak).toBe(0)
  })
})

describe('bolehDiajukan', () => {
  const rs = (b: BarisTimesheet[], rentang?: { awal: string; akhir: string }) =>
    ringkasTimesheet(b, 8, rentang)

  it('ada draf → boleh diajukan', () => {
    const h = bolehDiajukan(rs([baris({ tanggal: '2026-08-03', status: 'draf' })]))
    expect(h.boleh).toBe(true)
  })

  it('nol baris → tak bisa diajukan, dengan kode `kosong`', () => {
    const h = bolehDiajukan(rs([]))
    expect(h.boleh).toBe(false)
    expect(h.penghalang[0].kode).toBe('kosong')
  })

  it('semua sudah diajukan → kode `sudah-diajukan`, bukan `kosong`', () => {
    const h = bolehDiajukan(rs([baris({ tanggal: '2026-08-03', status: 'diajukan' })]))
    expect(h.boleh).toBe(false)
    // Dua keadaan berbeda menuntut pesan berbeda: "belum diisi" vs "sudah
    // dikirim". Menyamakannya membuat pengguna mencari baris yang tak ada.
    expect(h.penghalang[0].kode).toBe('sudah-diajukan')
  })

  it('hari kosong adalah PERINGATAN, bukan penghalang', () => {
    const h = bolehDiajukan(rs(
      [baris({ tanggal: '2026-08-03', status: 'draf' })],
      { awal: '2026-08-03', akhir: '2026-08-05' },
    ))
    // Pegawai yang cuti sehari tak boleh terkunci dari mengajukan sisanya,
    // dan memaksanya mengisi hari cuti dengan nol jam merusak angkanya.
    expect(h.boleh).toBe(true)
    expect(h.peringatan[0].kode).toBe('ada-hari-kosong')
    expect(h.peringatan[0].tanggal).toEqual(['2026-08-04', '2026-08-05'])
  })
})
