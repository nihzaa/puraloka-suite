import { describe, it, expect } from 'vitest'
import { susunLookAhead, ringkasLookAhead, awalMinggu, type ItemJadwal } from '../look-ahead'

// Look-ahead menjawab pertanyaan yang TIDAK dijawab kurva-S/EVM: "minggu depan
// saya harus menyiapkan apa?". Kurva-S menoleh ke belakang; ini ke depan.
//
// `sekarang` selalu DISUNTIKKAN, tak pernah `new Date()` di dalam lib — kalau
// tidak, test hanya benar pada hari ia ditulis.

const RABU = new Date('2026-01-07T10:00:00')   // Rabu; Senin minggu ini = 5 Jan
const bikin = (
  id: string, mulai: string | null, selesai: string | null, progres = 0, harga = 0,
): ItemJadwal => ({ id, name: `Item ${id}`, plannedStart: mulai, plannedEnd: selesai, progressPct: progres, totalPrice: harga })

describe('awalMinggu', () => {
  it('memulangkan SENIN, bukan Minggu', () => {
    // Kalender kerja Indonesia mulai Senin, dan look-ahead dibaca saat rapat
    // awal pekan. `getDay()` bawaan JS menganggap Minggu = 0.
    //
    // ⚠️ Dibandingkan dalam waktu LOKAL, bukan lewat `toISOString()`.
    // `awalMinggu` sengaja memulangkan tengah malam LOKAL; meng-ISO-kannya di
    // WIB (UTC+7) menggeser tanggalnya mundur sehari, jadi assertion ISO akan
    // gagal padahal fungsinya benar — dan "memperbaikinya" di lib justru akan
    // merusak perbandingan tanggal di zona pemakainya sendiri.
    const lokal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(lokal(awalMinggu(new Date('2026-01-07')))).toBe('2026-01-05')
    expect(lokal(awalMinggu(new Date('2026-01-05')))).toBe('2026-01-05')
    expect(lokal(awalMinggu(new Date('2026-01-11')))).toBe('2026-01-05') // Minggu
  })
})

describe('susunLookAhead', () => {
  it('item yang lewat tanggal & belum 100% → telat, dengan jumlah harinya', () => {
    const r = susunLookAhead([bikin('a', '2025-12-01', '2026-01-04', 40)], RABU)
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('telat')
    expect(r[0].hariTelat).toBe(3)      // 4 Jan → 7 Jan
    expect(r[0].mingguKe).toBe(-1)
  })

  it('item 100% TIDAK muncul, walau tanggalnya sudah lewat', () => {
    // Look-ahead adalah daftar KERJA, bukan laporan. Yang sudah beres bukan
    // telat — ia selesai.
    expect(susunLookAhead([bikin('a', '2025-12-01', '2026-01-04', 100)], RABU)).toHaveLength(0)
  })

  it('item yang sedang berjalan minggu ini → berjalan', () => {
    const r = susunLookAhead([bikin('a', '2026-01-05', '2026-01-16', 30)], RABU)
    expect(r[0].status).toBe('berjalan')
  })

  it('item mulai 2 minggu lagi masuk horizon, 5 minggu lagi TIDAK', () => {
    const r = susunLookAhead([
      bikin('dekat', '2026-01-19', '2026-01-25'),
      bikin('jauh',  '2026-02-16', '2026-02-22'),
    ], RABU)
    expect(r.map(x => x.itemId)).toEqual(['dekat'])
    expect(r[0].status).toBe('akan_mulai')
    expect(r[0].mingguKe).toBe(2)
  })

  it('horizon bisa diubah (3 default, 6 kalau diminta)', () => {
    const jauh = [bikin('jauh', '2026-02-16', '2026-02-22')]
    expect(susunLookAhead(jauh, RABU)).toHaveLength(0)
    expect(susunLookAhead(jauh, RABU, 8)).toHaveLength(1)
  })

  it('urutan = urutan PERHATIAN: telat → berjalan → akan mulai', () => {
    const r = susunLookAhead([
      bikin('c', '2026-01-19', '2026-01-25', 0, 100),
      bikin('a', '2025-12-01', '2026-01-02', 10, 100),
      bikin('b', '2026-01-05', '2026-01-16', 50, 100),
    ], RABU)
    expect(r.map(x => x.itemId)).toEqual(['a', 'b', 'c'])
  })

  it('telat PALING LAMA di paling atas', () => {
    const r = susunLookAhead([
      bikin('baru',  '2025-12-20', '2026-01-05', 10),
      bikin('lama',  '2025-11-01', '2025-12-01', 10),
    ], RABU)
    expect(r[0].itemId).toBe('lama')
  })

  it('dalam kelompok sama, NILAI terbesar di atas', () => {
    // "3 item telat" terasa berbeda antara Rp 5 juta dan Rp 500 juta.
    const r = susunLookAhead([
      bikin('kecil', '2026-01-19', '2026-01-25', 0, 5_000_000),
      bikin('besar', '2026-01-19', '2026-01-25', 0, 500_000_000),
    ], RABU)
    expect(r.map(x => x.itemId)).toEqual(['besar', 'kecil'])
  })

  it('item tanpa tanggal dilewati, tidak melempar', () => {
    expect(susunLookAhead([bikin('a', null, null), bikin('b', '2026-01-05', '2026-01-16')], RABU))
      .toHaveLength(1)
  })

  it('tanggal tak valid dilewati', () => {
    expect(susunLookAhead([bikin('a', 'bukan-tanggal', '2026-01-16')], RABU)).toHaveLength(0)
  })
})

describe('ringkasLookAhead', () => {
  it('menghitung per status + NILAI yang telat', () => {
    const baris = susunLookAhead([
      bikin('t1', '2025-12-01', '2026-01-02', 10, 300_000_000),
      bikin('t2', '2025-12-10', '2026-01-04', 20, 200_000_000),
      bikin('b1', '2026-01-05', '2026-01-16', 50, 50_000_000),
      bikin('a1', '2026-01-19', '2026-01-25', 0, 10_000_000),
    ], RABU)
    const r = ringkasLookAhead(baris)
    expect(r.telat).toBe(2)
    expect(r.berjalan).toBe(1)
    expect(r.akanMulai).toBe(1)
    expect(r.nilaiTelat).toBe(500_000_000)
    expect(r.telatTerlama).toBe(5)   // 2 Jan → 7 Jan
  })

  it('daftar kosong → nol semua, bukan NaN', () => {
    const r = ringkasLookAhead([])
    expect(r).toEqual({ telat: 0, berjalan: 0, akanMulai: 0, nilaiTelat: 0, telatTerlama: 0 })
  })
})
