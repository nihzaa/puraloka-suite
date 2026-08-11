import { describe, it, expect } from 'vitest'
import {
  angka, selisihHari, bandingkan, ringkas, periksaBaseline,
  type ItemBaseline, type ItemSekarang,
} from '../baseline-jadwal.js'

/**
 * Test pustaka baseline jadwal.
 *
 * Yang dijaga di sini bukan "fungsinya menghitung selisih", melainkan bahwa
 * **pergeseran tak bisa disembunyikan**: item yang hilang, item yang baru,
 * dan pembobotan yang membuat satu item besar tak tenggelam di antara
 * seratus item kecil.
 */

const B = (o: Partial<ItemBaseline> = {}): ItemBaseline => ({
  rab_item_id: o.rab_item_id ?? 'i1',
  uraian: 'uraian' in o ? o.uraian! : 'Pekerjaan uji',
  planned_start: 'planned_start' in o ? o.planned_start! : '2026-01-01',
  planned_end: 'planned_end' in o ? o.planned_end! : '2026-01-31',
  weight_pct: 'weight_pct' in o ? o.weight_pct! : '10',
})

const S = (o: Partial<ItemSekarang> = {}): ItemSekarang => ({
  id: o.id ?? 'i1',
  name: 'name' in o ? o.name! : 'Pekerjaan uji',
  planned_start: 'planned_start' in o ? o.planned_start! : '2026-01-01',
  planned_end: 'planned_end' in o ? o.planned_end! : '2026-01-31',
  weight_pct: 'weight_pct' in o ? o.weight_pct! : '10',
})

describe('angka', () => {
  it('string kosong jadi null, bukan bobot nol', () => {
    expect(angka('')).toBeNull()
    expect(angka('  ')).toBeNull()
  })
  it('numeric Postgres sebagai string dibaca benar', () => {
    expect(angka('22.5000')).toBe(22.5)
  })
  it('nol sungguhan tetap nol', () => {
    expect(angka('0')).toBe(0)
  })
})

describe('selisihHari — zona waktu tak boleh menggeser sehari', () => {
  it('menghitung selisih maju', () => {
    expect(selisihHari('2026-01-01', '2026-01-31')).toBe(30)
  })
  it('mundur menghasilkan negatif', () => {
    expect(selisihHari('2026-01-31', '2026-01-01')).toBe(-30)
  })
  it('tanggal sama = 0, bukan null', () => {
    expect(selisihHari('2026-01-01', '2026-01-01')).toBe(0)
  })
  it('melintasi tahun dan tahun kabisat', () => {
    // 2028 kabisat: Februari 29 hari.
    expect(selisihHari('2028-02-28', '2028-03-01')).toBe(2)
  })
  it('null / format salah → null, bukan NaN', () => {
    expect(selisihHari(null, '2026-01-01')).toBeNull()
    expect(selisihHari('2026-01-01', null)).toBeNull()
    expect(selisihHari('01-01-2026', '2026-01-01')).toBeNull()
  })
  it('selisih 1 hari benar-benar 1 — bukan 0 karena pergeseran zona', () => {
    // Selisih sehari pada laporan keterlambatan bisa jadi selisih sehari denda.
    expect(selisihHari('2026-08-12', '2026-08-13')).toBe(1)
  })
})

describe('bandingkan — pergeseran terlihat', () => {
  it('jadwal tak berubah → geser 0', () => {
    const p = bandingkan([B()], [S()])
    expect(p[0].geser_selesai_hari).toBe(0)
  })

  it('mundur 14 hari terbaca positif', () => {
    const p = bandingkan([B()], [S({ planned_end: '2026-02-14' })])
    expect(p[0].geser_selesai_hari).toBe(14)
  })

  it('maju terbaca negatif', () => {
    const p = bandingkan([B()], [S({ planned_end: '2026-01-21' })])
    expect(p[0].geser_selesai_hari).toBe(-10)
  })

  it('item yang HILANG dilaporkan, tidak dibuang', () => {
    // Lingkup yang berubah adalah sebab keterlambatan yang paling sering
    // diperdebatkan. Membuangnya menyembunyikan justru sebab itu.
    const p = bandingkan([B()], [])
    expect(p).toHaveLength(1)
    expect(p[0].hilang).toBe(true)
  })

  it('item BARU dilaporkan juga', () => {
    const p = bandingkan([], [S({ id: 'baru-1' })])
    expect(p[0].baru).toBe(true)
    expect(p[0].baseline_end).toBeNull()
  })

  it('item TANPA jadwal bukan "item baru" — ia memang tak pernah masuk', () => {
    // Ditemukan di LAYAR, bukan oleh test. Proyek dengan 285 item yang hanya
    // 14 berjadwal melaporkan "0 dari 285 pekerjaan": 271 baris "baru"
    // menenggelamkan 14 yang benar-benar dibandingkan. Baseline hanya
    // menyalin item ber-jadwal, jadi yang tak berjadwal bukan perubahan
    // lingkup — ia sekadar di luar jangkauan perbandingan.
    const p = bandingkan([], [
      S({ id: 'tanpa-jadwal', planned_start: null, planned_end: null }),
      S({ id: 'berjadwal' }),
    ])
    expect(p).toHaveLength(1)
    expect(p[0].rab_item_id).toBe('berjadwal')
  })

  it('item yang PUNYA salah satu tanggal tetap dilaporkan', () => {
    // Hanya yang KEDUANYA kosong yang diabaikan. Item dengan mulai tapi tanpa
    // selesai adalah data setengah jadi yang justru perlu terlihat.
    const p = bandingkan([], [S({ id: 'setengah', planned_end: null })])
    expect(p).toHaveLength(1)
    expect(p[0].baru).toBe(true)
  })

  it('uraian diambil dari BASELINE, bukan nama sekarang', () => {
    // Item bisa di-rename. Laporan yang menyebut nama BARU untuk baseline
    // LAMA membingungkan pembacanya.
    const p = bandingkan(
      [B({ uraian: 'Nama saat kontrak' })],
      [S({ name: 'Nama sesudah diubah' })])
    expect(p[0].uraian).toBe('Nama saat kontrak')
  })

  it('uraian baseline kosong jatuh ke nama sekarang', () => {
    const p = bandingkan([B({ uraian: null })], [S({ name: 'Dari RAB' })])
    expect(p[0].uraian).toBe('Dari RAB')
  })

  it('item hilang tak menghasilkan selisih palsu', () => {
    const p = bandingkan([B()], [])
    expect(p[0].geser_selesai_hari).toBeNull()
  })
})

describe('ringkas — satu item besar tak boleh tenggelam', () => {
  it('rata-rata TERTIMBANG, bukan rata-rata biasa', () => {
    // 3 item kecil tepat waktu (bobot 1 masing-masing) + 1 item besar
    // (bobot 97) mundur 60 hari.
    //   rata-rata biasa    : 60 / 4          = 15 hari  ← menyesatkan
    //   rata-rata tertimbang: 60*97 / 100    = 58,2 hari ← kenyataannya
    const base = [
      B({ rab_item_id: 'a', weight_pct: '1' }),
      B({ rab_item_id: 'b', weight_pct: '1' }),
      B({ rab_item_id: 'c', weight_pct: '1' }),
      B({ rab_item_id: 'besar', weight_pct: '97' }),
    ]
    const kini = [
      S({ id: 'a', weight_pct: '1' }),
      S({ id: 'b', weight_pct: '1' }),
      S({ id: 'c', weight_pct: '1' }),
      S({ id: 'besar', weight_pct: '97', planned_end: '2026-04-01' }),
    ]
    const r = ringkas(bandingkan(base, kini))
    expect(r.geser_tertimbang_hari).toBeGreaterThan(50)
    expect(r.geser_tertimbang_hari).not.toBe(15)
  })

  it('mundur terparah adalah angka yang dicari saat rapat', () => {
    const r = ringkas(bandingkan(
      [B({ rab_item_id: 'a' }), B({ rab_item_id: 'b' })],
      [S({ id: 'a', planned_end: '2026-02-10' }), S({ id: 'b', planned_end: '2026-03-02' })],
    ))
    expect(r.mundur_terparah_hari).toBe(30)
  })

  it('menghitung mundur, maju, hilang, dan baru terpisah', () => {
    const r = ringkas(bandingkan(
      [B({ rab_item_id: 'a' }), B({ rab_item_id: 'b' }), B({ rab_item_id: 'c' })],
      [
        S({ id: 'a', planned_end: '2026-02-10' }),   // mundur
        S({ id: 'b', planned_end: '2026-01-21' }),   // maju
        S({ id: 'baru' }),                            // baru (c hilang)
      ],
    ))
    expect(r.mundur).toBe(1)
    expect(r.maju).toBe(1)
    expect(r.hilang).toBe(1)
    expect(r.baru).toBe(1)
  })

  it('bobot yang MUNDUR dijumlahkan', () => {
    const r = ringkas(bandingkan(
      [B({ rab_item_id: 'a', weight_pct: '30' }), B({ rab_item_id: 'b', weight_pct: '5' })],
      [S({ id: 'a', planned_end: '2026-02-10' }), S({ id: 'b' })],
    ))
    expect(r.bobot_mundur_pct).toBe(30)
  })

  it('semua bobot kosong → tertimbang null, BUKAN 0', () => {
    // "Tak bisa dihitung karena bobot kosong" berbeda artinya dari "tidak
    // bergeser sama sekali", dan layar harus bisa membedakannya.
    const r = ringkas(bandingkan(
      [B({ weight_pct: '0' })], [S({ weight_pct: '0', planned_end: '2026-03-01' })]))
    expect(r.geser_tertimbang_hari).toBeNull()
    // Tetapi keterlambatannya TETAP terhitung — nyata bagi yang mengerjakannya.
    expect(r.mundur).toBe(1)
  })

  it('daftar kosong tidak melempar', () => {
    const r = ringkas([])
    expect(r.total_item).toBe(0)
    expect(r.mundur_terparah_hari).toBeNull()
  })

  it('item hilang TIDAK dihitung sebagai mundur', () => {
    // Kalau dihitung, menghapus item yang terlambat akan MEMPERBAIKI angka
    // keterlambatan — persis kebalikan dari yang seharusnya.
    const r = ringkas(bandingkan([B()], []))
    expect(r.mundur).toBe(0)
    expect(r.hilang).toBe(1)
  })
})

describe('periksaBaseline — menolak pernyataan kosong', () => {
  it('nama kosong ditolak', () => {
    expect(periksaBaseline('', 'alasan yang cukup panjang', 5)).toMatch(/Nama/)
    expect(periksaBaseline('   ', 'alasan yang cukup panjang', 5)).toMatch(/Nama/)
  })

  it('alasan terlalu pendek ditolak dengan sebabnya', () => {
    const p = periksaBaseline('Baseline 1', 'adendum', 5)
    expect(p).toMatch(/10 huruf/)
    expect(p).toMatch(/klaim keterlambatan/)
  })

  it('nol item ditolak — baseline kosong selalu "nol pergeseran"', () => {
    const p = periksaBaseline('Baseline 1', 'kontrak awal ditandatangani', 0)
    expect(p).toMatch(/belum punya satu pun item/)
  })

  it('lengkap → null', () => {
    expect(periksaBaseline('Baseline 1', 'kontrak awal ditandatangani', 12)).toBeNull()
  })
})
