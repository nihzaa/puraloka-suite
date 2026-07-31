import { describe, it, expect } from 'vitest'
import { periksaKuota, type KuotaRab, type PemakaianMr } from '../kuota-rab-material.js'

// ROADMAP #11 / Modul 9a — test hard-guard kuota RAB.
//
// Yang diuji bukan "fungsinya jalan" melainkan batas-batas yang kalau salah
// menghasilkan kerugian nyata: menolak pembelian sah (lapangan berhenti) atau
// meloloskan pembelian melebihi RAB (uang bocor tanpa alarm).

const semen: KuotaRab = { material_id: 'm-semen', material_name: 'Semen 50kg', unit: 'sak', rab_quantity: 100 }
const besi: KuotaRab = { material_id: 'm-besi', material_name: 'Besi 10mm', unit: 'batang', rab_quantity: 50 }

const mr = (material_id: string, qty: number | string | null): PemakaianMr =>
  ({ material_id, qty_requested: qty })

describe('periksaKuota', () => {
  it('lolos saat total di BAWAH kuota', () => {
    const h = periksaKuota([mr('m-semen', 30)], new Map([['m-semen', 40]]), [semen])
    expect(h.lolos).toBe(true)
    expect(h.pelanggaran).toEqual([])
  })

  it('lolos TEPAT di batas — rumusnya `>`, bukan `>=`', () => {
    // Memesan persis sebanyak volume RAB harus boleh. Kalau `>=` dipakai,
    // penyelesaian pekerjaan terakhir selalu tertolak.
    const h = periksaKuota([mr('m-semen', 60)], new Map([['m-semen', 40]]), [semen])
    expect(h.lolos).toBe(true)
  })

  it('DITOLAK saat lewat sedikit pun', () => {
    const h = periksaKuota([mr('m-semen', 60.001)], new Map([['m-semen', 40]]), [semen])
    expect(h.lolos).toBe(false)
    expect(h.pelanggaran[0].kelebihan).toBeCloseTo(0.001, 3)
  })

  it('menjumlahkan beberapa baris MR untuk material yang SAMA sebelum menilai', () => {
    // Kegagalan klasik: memeriksa baris per baris. 3 baris @40 masing-masing
    // "aman" terhadap kuota 100, padahal totalnya 120.
    const h = periksaKuota(
      [mr('m-semen', 40), mr('m-semen', 40), mr('m-semen', 40)],
      new Map(), [semen])
    expect(h.lolos).toBe(false)
    expect(h.pelanggaran[0].diminta).toBe(120)
    expect(h.pelanggaran[0].kelebihan).toBe(20)
  })

  it('memperhitungkan yang SUDAH dipesan lewat MR lain', () => {
    // Tanpa ini, MR bisa diajukan berkali-kali masing-masing "aman" sampai
    // total pembelian jauh melampaui RAB.
    const h = periksaKuota([mr('m-semen', 30)], new Map([['m-semen', 95]]), [semen])
    expect(h.lolos).toBe(false)
    expect(h.pelanggaran[0].sudah_di_mr).toBe(95)
    expect(h.pelanggaran[0].total).toBe(125)
    expect(h.pelanggaran[0].kelebihan).toBe(25)
  })

  it('material TANPA baris kuota tidak memblokir, tapi tetap dilaporkan', () => {
    // Kuota diisi bertahap. Memblokir semua material yang belum terdaftar akan
    // menghentikan seluruh procurement pada hari guard dinyalakan.
    const h = periksaKuota(
      [mr('m-semen', 10), mr('m-entah', 999)],
      new Map(), [semen])
    expect(h.lolos).toBe(true)
    expect(h.tanpa_kuota).toEqual(['m-entah'])
  })

  it('menjumlahkan NUMERIC berbentuk string sebagai angka', () => {
    // '40' + '40' = '4040' kalau tak dikonversi — angka besar dan meyakinkan
    // yang lolos tanpa error.
    const h = periksaKuota(
      [mr('m-semen', '40'), mr('m-semen', '40')],
      new Map([['m-semen', 30]]), [{ ...semen, rab_quantity: '100' }])
    expect(h.pelanggaran[0].diminta).toBe(80)
    expect(h.pelanggaran[0].total).toBe(110)
  })

  it('qty null/NaN dihitung 0, tidak meracuni penilaian', () => {
    const h = periksaKuota(
      [mr('m-semen', 50), mr('m-semen', null), mr('m-semen', 'x' as unknown as number)],
      new Map(), [semen])
    expect(h.lolos).toBe(true)
  })

  it('melaporkan SEMUA material yang melanggar, bukan berhenti di yang pertama', () => {
    // Pengguna harus tahu seluruh yang perlu diperbaiki dalam satu kali coba,
    // bukan menemukannya satu per satu lewat submit berulang.
    const h = periksaKuota(
      [mr('m-semen', 200), mr('m-besi', 80)],
      new Map(), [semen, besi])
    expect(h.pelanggaran).toHaveLength(2)
  })

  it('mengurutkan pelanggaran dari kelebihan TERBESAR', () => {
    const h = periksaKuota(
      [mr('m-semen', 105), mr('m-besi', 90)],
      new Map(), [semen, besi])
    expect(h.pelanggaran[0].material_id).toBe('m-besi')   // lebih 40
    expect(h.pelanggaran[1].material_id).toBe('m-semen')  // lebih 5
  })

  it('MR kosong lolos tanpa error', () => {
    expect(periksaKuota([], new Map(), [semen]).lolos).toBe(true)
  })

  it('membawa nama & satuan material ke pesan pelanggaran', () => {
    // Pesan "material m-semen melebihi kuota" tak berguna bagi orang lapangan.
    const h = periksaKuota([mr('m-semen', 200)], new Map(), [semen])
    expect(h.pelanggaran[0].material_name).toBe('Semen 50kg')
    expect(h.pelanggaran[0].unit).toBe('sak')
  })
})
