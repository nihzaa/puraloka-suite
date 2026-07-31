import { describe, it, expect } from 'vitest'
import { nilaiRencanaPerMinggu, ringkasCakupan, type ItemBerjadwal } from '../rencana-dari-gantt'

// PV (Planned Value) menentukan SPI. Sebelum modul ini, PV hanya punya dua
// sumber: `rab_schedule` manual (0 baris di dev — tak pernah diisi) dan normal
// CDF. Yang kedua benar secara matematis tapi TAK ADA HUBUNGANNYA dengan
// rencana proyek ini, sehingga SPI mengukur penyimpangan terhadap tebakan.
//
// Yang diuji di sini aritmetikanya, tanpa HTTP/DB — supaya kesalahan pembagian
// nilai ke minggu ketahuan sebagai angka, bukan sebagai grafik yang "kelihatan
// masuk akal".

const MULAI = new Date('2026-01-05')          // Senin
const item = (p: number, s: string | null, e: string | null): ItemBerjadwal =>
  ({ totalPrice: p, plannedStart: s, plannedEnd: e })

describe('nilaiRencanaPerMinggu', () => {
  it('item satu minggu penuh masuk ke satu ember', () => {
    const hasil = nilaiRencanaPerMinggu([item(700, '2026-01-05', '2026-01-11')], MULAI, 4)
    expect(hasil).not.toBeNull()
    expect(hasil![0]).toBeCloseTo(700, 6)
    expect(hasil!.slice(1)).toEqual([0, 0, 0])
  })

  it('item lintas dua minggu terbagi PROPORSIONAL per hari', () => {
    // 5–18 Jan = 14 hari; minggu-0 dapat 7 hari, minggu-1 dapat 7 hari.
    const hasil = nilaiRencanaPerMinggu([item(1400, '2026-01-05', '2026-01-18')], MULAI, 4)!
    expect(hasil[0]).toBeCloseTo(700, 6)
    expect(hasil[1]).toBeCloseTo(700, 6)
  })

  it('jumlah seluruh ember = nilai item (tak ada yang hilang/dobel)', () => {
    // Invarian terpenting: kalau pembagian bocor, PV meleset dan SPI ikut
    // meleset — tanpa gejala, karena grafiknya tetap naik mulus.
    const hasil = nilaiRencanaPerMinggu([
      item(1000, '2026-01-05', '2026-01-20'),
      item(2500, '2026-01-12', '2026-02-01'),
    ], MULAI, 8)!
    const total = hasil.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(3500, 4)
  })

  it('item satu HARI tetap dapat nilai penuh (durasi minimal 1)', () => {
    const hasil = nilaiRencanaPerMinggu([item(500, '2026-01-07', '2026-01-07')], MULAI, 3)!
    expect(hasil[0]).toBeCloseTo(500, 6)
  })

  it('nol item berjadwal → null, BUKAN array nol', () => {
    // Array nol akan membuat PV = 0 dan SPI ikut nol secara diam-diam.
    // `null` memaksa pemanggil memilih fallback secara sadar.
    expect(nilaiRencanaPerMinggu([item(100, null, null)], MULAI, 4)).toBeNull()
    expect(nilaiRencanaPerMinggu([], MULAI, 4)).toBeNull()
  })

  it('item berharga nol diabaikan — tak bikin "berjadwal" palsu', () => {
    expect(nilaiRencanaPerMinggu([item(0, '2026-01-05', '2026-01-11')], MULAI, 4)).toBeNull()
  })

  it('rentang TERBALIK (end < start) dilewati, bukan ditukar diam-diam', () => {
    // Menukarnya akan menyembunyikan data rusak di balik kurva yang tampak benar.
    expect(nilaiRencanaPerMinggu([item(900, '2026-02-01', '2026-01-05')], MULAI, 6)).toBeNull()
  })

  it('hari DI LUAR rentang proyek dibuang, tidak dijepit ke ujung', () => {
    // Menjepit akan menumpuk nilai palsu di minggu terakhir dan membuat PV
    // melonjak di periode yang sebenarnya tak merencanakan apa pun.
    const hasil = nilaiRencanaPerMinggu(
      [item(1400, '2026-01-05', '2026-01-18')], MULAI, 1)!   // proyek 1 minggu saja
    expect(hasil[0]).toBeCloseTo(700, 6)                      // hanya 7 hari pertama
    expect(hasil.length).toBe(1)
  })

  it('seluruh item di luar rentang → null (sama tak bergunanya dgn tanpa jadwal)', () => {
    const hasil = nilaiRencanaPerMinggu([item(500, '2027-06-01', '2027-06-07')], MULAI, 4)
    expect(hasil).toBeNull()
  })

  it('tanggal tak valid dilewati tanpa melempar', () => {
    const hasil = nilaiRencanaPerMinggu([
      item(100, 'bukan-tanggal', '2026-01-11'),
      item(700, '2026-01-05', '2026-01-11'),
    ], MULAI, 3)!
    expect(hasil[0]).toBeCloseTo(700, 6)
  })
})

describe('ringkasCakupan', () => {
  it('cakupan diukur dari NILAI, bukan jumlah item', () => {
    // 1 item besar terjadwal lebih bermakna daripada 3 item kecil tak
    // terjadwal — angka inilah yang menentukan PV layak dipercaya atau tidak.
    const r = ringkasCakupan([
      item(9000, '2026-01-05', '2026-01-11'),
      item(500, null, null),
      item(500, null, null),
    ])
    expect(r.total).toBe(3)
    expect(r.berjadwal).toBe(1)
    expect(r.pctNilai).toBeCloseTo(90, 2)
  })

  it('nol item → 0%, tidak NaN', () => {
    expect(ringkasCakupan([]).pctNilai).toBe(0)
  })
})
