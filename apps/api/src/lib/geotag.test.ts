import { describe, it, expect } from 'vitest'
import { jarakMeter, nilaiLokasi, jarakTerbaca } from './geotag.js'

/**
 * Test geotag.
 *
 * Yang dijaga: penilaian "di lokasi" / "di luar lokasi" bisa dipakai dalam
 * sengketa progres. Dua kesalahan yang harus mustahil:
 *
 *   1. menyatakan "di luar lokasi" padahal datanya tak cukup
 *   2. menyatakan "di lokasi" padahal jaraknya jauh
 *
 * Yang pertama lebih berbahaya: ia tuduhan, dan tuduhan yang salah merusak
 * kepercayaan pada seluruh sistem.
 */

// Titik nyata di Bandung, jaraknya bisa dicek di peta mana pun.
const GEDUNG_SATE = { lintang: -6.9024, bujur: 107.6186 }
const ALUN_ALUN   = { lintang: -6.9218, bujur: 107.6070 }   // ± 2,5 km
const JAKARTA     = { lintang: -6.1754, bujur: 106.8272 }   // ± 118 km

describe('jarakMeter', () => {
  it('titik yang sama = nol', () => {
    expect(jarakMeter(GEDUNG_SATE, GEDUNG_SATE)).toBe(0)
  })

  it('Gedung Sate ke Alun-Alun Bandung ≈ 2,5 km', () => {
    const m = jarakMeter(GEDUNG_SATE, ALUN_ALUN)
    expect(m).toBeGreaterThan(2_300)
    expect(m).toBeLessThan(2_800)
  })

  it('Bandung ke Jakarta ≈ 118 km', () => {
    const m = jarakMeter(GEDUNG_SATE, JAKARTA)
    expect(m).toBeGreaterThan(110_000)
    expect(m).toBeLessThan(126_000)
  })

  it('simetris — urutan argumen tak mengubah jarak', () => {
    expect(jarakMeter(GEDUNG_SATE, JAKARTA)).toBe(jarakMeter(JAKARTA, GEDUNG_SATE))
  })

  it('menyeberang khatulistiwa dihitung benar', () => {
    // 1 derajat lintang ≈ 111 km di mana pun.
    const m = jarakMeter({ lintang: -0.5, bujur: 107 }, { lintang: 0.5, bujur: 107 })
    expect(m).toBeGreaterThan(108_000)
    expect(m).toBeLessThan(114_000)
  })

  it('menyeberang meridian 180° tak menghasilkan jarak keliling bumi', () => {
    // Dua titik berjarak 2 derajat bujur, tapi di sisi berlawanan garis
    // tanggal. Rumus yang salah akan memulangkan ~20.000 km.
    const m = jarakMeter({ lintang: 0, bujur: 179 }, { lintang: 0, bujur: -179 })
    expect(m).toBeLessThan(250_000)
  })
})

describe('nilaiLokasi', () => {
  it('foto di lokasi proyek → diLokasi true', () => {
    const h = nilaiLokasi({ ...GEDUNG_SATE, akurasiM: 10 }, GEDUNG_SATE, 500)
    expect(h.diLokasi).toBe(true)
    expect(h.jarakM).toBe(0)
    expect(h.alasan).toBe('di dalam radius')
  })

  it('foto 2,5 km dari proyek dengan radius 500 m → di luar', () => {
    const h = nilaiLokasi({ ...ALUN_ALUN, akurasiM: 15 }, GEDUNG_SATE, 500)
    expect(h.diLokasi).toBe(false)
    expect(h.alasan).toBe('di luar radius')
    expect(h.jarakM).toBeGreaterThan(2_000)
  })

  it('foto tanpa koordinat → null, BUKAN false', () => {
    // Ini invarian terpenting di berkas ini: "tidak diketahui" tak boleh
    // berubah jadi "tidak di lokasi". Yang kedua adalah tuduhan.
    const h = nilaiLokasi(null, GEDUNG_SATE, 500)
    expect(h.diLokasi).toBeNull()
    expect(h.jarakM).toBeNull()
    expect(h.alasan).toBe('foto tanpa koordinat')
  })

  it('proyek tanpa titik acuan → null, BUKAN false', () => {
    const h = nilaiLokasi({ ...GEDUNG_SATE, akurasiM: 10 }, null, 500)
    expect(h.diLokasi).toBeNull()
    expect(h.alasan).toBe('proyek belum punya titik acuan')
  })

  it('akurasi lebih besar dari radius → tak bisa dinilai', () => {
    // GPS meleset 800 m tak bisa membedakan dalam-radius dari luar-radius
    // 500 m. Menyatakan "di luar" atas dasar itu adalah tuduhan yang tak
    // bisa dipertahankan.
    const h = nilaiLokasi({ ...GEDUNG_SATE, akurasiM: 800 }, GEDUNG_SATE, 500)
    expect(h.diLokasi).toBeNull()
    expect(h.alasan).toBe('akurasi GPS terlalu rendah untuk dinilai')
    // Jaraknya TETAP dilaporkan — berguna sebagai perkiraan kasar.
    expect(h.jarakM).toBe(0)
  })

  it('akurasi tepat sama dengan radius masih bisa dinilai', () => {
    const h = nilaiLokasi({ ...GEDUNG_SATE, akurasiM: 500 }, GEDUNG_SATE, 500)
    expect(h.diLokasi).toBe(true)
  })

  it('akurasi tak diketahui tetap dinilai — tak ada alasan menahannya', () => {
    const h = nilaiLokasi({ ...GEDUNG_SATE, akurasiM: null }, GEDUNG_SATE, 500)
    expect(h.diLokasi).toBe(true)
  })

  it('tepat di batas radius dihitung di DALAM', () => {
    // Batas inklusif: foto tepat 500 m dari titik acuan dengan radius 500 m
    // adalah "di lokasi". Eksklusif akan membuat kasus batas jadi tuduhan.
    const proyek = { lintang: 0, bujur: 0 }
    // 0,0045 derajat lintang ≈ 500 m
    const foto = { lintang: 0.0045, bujur: 0, akurasiM: 5 }
    const h = nilaiLokasi(foto, proyek, 500)
    expect(h.jarakM).toBeLessThanOrEqual(505)
    expect(h.diLokasi).toBe(true)
  })

  it('radius bawaan 500 m dipakai bila tak disebut', () => {
    const h = nilaiLokasi({ ...ALUN_ALUN, akurasiM: 10 }, GEDUNG_SATE)
    expect(h.diLokasi).toBe(false)
  })
})

describe('jarakTerbaca', () => {
  it('di bawah 1 km ditulis meter, dibulatkan puluhan', () => {
    // GPS ponsel tak pernah setepat satu meter; "347 m" memberi kesan
    // presisi yang tak dimiliki angkanya.
    expect(jarakTerbaca(347)).toBe('350 m')
    expect(jarakTerbaca(12)).toBe('10 m')
    expect(jarakTerbaca(0)).toBe('0 m')
  })

  it('1 km ke atas ditulis kilometer, satu desimal', () => {
    expect(jarakTerbaca(1_000)).toBe('1.0 km')
    expect(jarakTerbaca(2_540)).toBe('2.5 km')
    expect(jarakTerbaca(118_000)).toBe('118.0 km')
  })
})
