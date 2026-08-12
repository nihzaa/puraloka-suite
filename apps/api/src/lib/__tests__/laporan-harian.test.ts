/**
 * B1 — penyusunan Laporan Harian (murni, tanpa basis).
 *
 * Jalur nyatanya diuji di `routes/v1/__tests__/laporan-harian.test.ts`
 * terhadap Postgres sungguhan.
 */
import { describe, it, expect } from 'vitest'
import { susunLaporanHarian, ringkasRentang, type BarisProgres } from '../laporan-harian.js'

let n = 0
const B = (o: Partial<BarisProgres>): BarisProgres => ({
  id: `id-${++n}`,
  project_id: 'p1',
  mode: 'daily',
  logged_at: '2026-06-16T08:00:00.000Z',
  pct_overall: null,
  weather: null,
  worker_count: null,
  notes: null,
  ...o,
})

describe('hanya mode daily', () => {
  it('baris mode detail DIBUANG', () => {
    // `progress_logs` menampung dua jenis catatan. Diukur 2026-06-16: 48
    // baris, hanya 3 bercuaca — sisanya progres per-item RAB. Mencampurnya
    // membuat satu hari terlihat punya 48 laporan harian.
    const h = susunLaporanHarian([
      B({ mode: 'daily', weather: 'cerah' }),
      B({ mode: 'detail', weather: 'hujan' }),
      B({ mode: 'detail' }),
    ])
    expect(h).toHaveLength(1)
    expect(h[0].laporan).toBe(1)
    expect(h[0].cuaca).toEqual(['cerah'])
  })

  it('mode null dibuang juga', () => {
    expect(susunLaporanHarian([B({ mode: null })])).toHaveLength(0)
  })
})

describe('kiriman ganda', () => {
  it('laporan berisi PERSIS SAMA tak dijumlahkan dua kali', () => {
    // Diukur 2026-08-12: 2026-06-16 punya TIGA baris identik (teks, cuaca,
    // dan worker_count 18 semuanya sama). Menjumlahkannya menghasilkan 54
    // pekerja untuk hari yang sesungguhnya 18 — salah tiga kali lipat, tanpa
    // satu pun galat.
    const sama = { notes: 'Finishing 50%', weather: 'cerah', worker_count: 18 }
    const h = susunLaporanHarian([B(sama), B(sama), B(sama)])
    expect(h[0].laporan).toBe(1)
    expect(h[0].duplikat).toBe(2)
    expect(h[0].pekerja).toBe(18)
    expect(h[0].catatan).toHaveLength(1)
  })

  it('isi BERBEDA sedikit pun tetap dihitung terpisah', () => {
    // Dua mandor yang benar-benar melapor beda harus tetap dijumlahkan.
    const h = susunLaporanHarian([
      B({ notes: 'Cor kolom', worker_count: 6 }),
      B({ notes: 'Pasang bekisting', worker_count: 8 }),
    ])
    expect(h[0].laporan).toBe(2)
    expect(h[0].duplikat).toBe(0)
    expect(h[0].pekerja).toBe(14)
  })

  it('proyek berbeda dengan teks sama BUKAN duplikat', () => {
    const h = susunLaporanHarian([
      B({ notes: 'Cor kolom', worker_count: 5 }),
      B({ notes: 'Cor kolom', worker_count: 5, project_id: 'p2' }),
    ])
    expect(h[0].laporan).toBe(2)
    expect(h[0].pekerja).toBe(10)
  })
})

describe('jumlah pekerja', () => {
  it('DIJUMLAH lintas laporan, bukan dirata-rata', () => {
    // Dua mandor melapor 6 dan 8 berarti 14 orang di lapangan hari itu.
    const h = susunLaporanHarian([
      B({ worker_count: 6 }), B({ worker_count: 8, project_id: 'p2' }),
    ])
    expect(h[0].pekerja).toBe(14)
  })

  it('null bila TAK SATU PUN laporan menyebutnya', () => {
    // Dibedakan dari 0: nol pekerja berarti pekerjaan berhenti hari itu.
    const h = susunLaporanHarian([B({ notes: 'ada' })])
    expect(h[0].pekerja).toBeNull()
  })

  it('nol yang DILAPORKAN tetap nol, bukan null', () => {
    const h = susunLaporanHarian([B({ worker_count: 0 })])
    expect(h[0].pekerja).toBe(0)
  })

  it('string kosong tak berubah jadi nol', () => {
    // `Number('') === 0`, bukan NaN — kelas cacat yang berulang di repo ini.
    const h = susunLaporanHarian([B({ worker_count: '' })])
    expect(h[0].pekerja).toBeNull()
  })

  it('nilai numeric bertipe string dari Postgres dibaca benar', () => {
    const h = susunLaporanHarian([B({ worker_count: '12' })])
    expect(h[0].pekerja).toBe(12)
  })
})

describe('cuaca', () => {
  it('unik, urut seperti dilaporkan', () => {
    const h = susunLaporanHarian([
      B({ weather: 'cerah' }), B({ weather: 'hujan' }), B({ weather: 'cerah' }),
    ])
    expect(h[0].cuaca).toEqual(['cerah', 'hujan'])
  })

  it('spasi kosong tak dihitung sebagai cuaca', () => {
    const h = susunLaporanHarian([B({ weather: '   ' })])
    expect(h[0].cuaca).toEqual([])
  })
})

describe('catatan kendala', () => {
  it('dikumpulkan beserta pelapornya', () => {
    const h = susunLaporanHarian([
      B({ notes: 'Hujan sejak siang, cor ditunda', reporter: { name: 'Pak Budi' } }),
    ])
    expect(h[0].catatan).toEqual([
      { proyek_id: 'p1', teks: 'Hujan sejak siang, cor ditunda', pelapor: 'Pak Budi' },
    ])
  })

  it('catatan kosong tak masuk daftar', () => {
    const h = susunLaporanHarian([B({ notes: '  ' }), B({ notes: null })])
    expect(h[0].catatan).toEqual([])
  })
})

describe('progres', () => {
  it('mengambil yang TERTINGGI per proyek, bukan yang terakhir', () => {
    // Laporan susulan/koreksi bisa masuk dengan angka lebih rendah; memakai
    // "yang terakhir" membuat progres terlihat MUNDUR pada hari yang sama.
    // Catatan dibedakan supaya ketiganya bukan kiriman ganda — yang diuji
    // di sini pemilihan pct tertinggi, bukan deduplikasi.
    const h = susunLaporanHarian([
      B({ pct_overall: 40, notes: 'pagi' }),
      B({ pct_overall: 55, notes: 'siang' }),
      B({ pct_overall: 45, notes: 'sore' }),
    ])
    expect(h[0].progres).toEqual([{ proyek_id: 'p1', pct: 55 }])
  })

  it('dipisah per proyek', () => {
    const h = susunLaporanHarian([
      B({ pct_overall: 40 }), B({ pct_overall: 70, project_id: 'p2' }),
    ])
    expect(h[0].progres).toHaveLength(2)
  })
})

describe('pengelompokan hari', () => {
  it('terbaru di atas', () => {
    const h = susunLaporanHarian([
      B({ logged_at: '2026-06-01T09:00:00.000Z' }),
      B({ logged_at: '2026-06-16T09:00:00.000Z' }),
      B({ logged_at: '2026-06-08T09:00:00.000Z' }),
    ])
    expect(h.map(x => x.tanggal)).toEqual(['2026-06-16', '2026-06-08', '2026-06-01'])
  })

  it('jam berbeda pada hari sama tetap satu hari', () => {
    const h = susunLaporanHarian([
      B({ logged_at: '2026-06-16T01:00:00.000Z', notes: 'shift pagi' }),
      B({ logged_at: '2026-06-16T23:00:00.000Z', notes: 'shift malam' }),
    ])
    expect(h).toHaveLength(1)
    expect(h[0].laporan).toBe(2)
  })

  it('menghitung proyek unik, bukan jumlah laporan', () => {
    const h = susunLaporanHarian([
      B({ notes: 'a' }), B({ notes: 'b' }), B({ notes: 'c', project_id: 'p2' }),
    ])
    expect(h[0].laporan).toBe(3)
    expect(h[0].proyek).toBe(2)
  })
})

describe('ringkasRentang', () => {
  it('rerata pekerja hanya atas hari yang MELAPORKAN', () => {
    // Membagi dengan seluruh hari menurunkan angkanya tiap kali ada hari
    // tanpa data — dan "tak ada laporan" bukan "nol pekerja".
    const hari = susunLaporanHarian([
      B({ logged_at: '2026-06-16T08:00:00Z', worker_count: 10 }),
      B({ logged_at: '2026-06-15T08:00:00Z', worker_count: 20 }),
      B({ logged_at: '2026-06-14T08:00:00Z', notes: 'libur' }),
    ])
    const r = ringkasRentang(hari)
    expect(r.hariBerlaporan).toBe(3)
    expect(r.rerataPekerja).toBe(15)
  })

  it('rerata null bila tak ada satu pun hari berpekerja', () => {
    const r = ringkasRentang(susunLaporanHarian([B({ notes: 'x' })]))
    expect(r.rerataPekerja).toBeNull()
  })

  it('rentang kosong tak melempar', () => {
    expect(ringkasRentang([])).toEqual({
      hariBerlaporan: 0, totalLaporan: 0, totalCatatan: 0, rerataPekerja: null,
    })
  })
})
