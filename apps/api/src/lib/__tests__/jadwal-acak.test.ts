/**
 * WAKTU SASARAN ACAK — supaya sapaan tak datang pada jam yang sama tiap hari.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUTUH TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-14: *"seperti manusia yg random aja dan emang ga tepat
 * seperti yang dijadwalkan"*.
 *
 * "Acak" adalah sifat yang paling mudah diklaim dan paling jarang dibuktikan.
 * Dua cara membangunnya terlihat sama di kode dan berbeda sepenuhnya di
 * kenyataan:
 *
 *   diundi SEKALI per periode  → tersebar merata sepanjang jendela
 *   diundi TIAP TICK           → peluang menumpuk; hampir selalu tertembak
 *                                di tick-tick pertama, yaitu SELALU PAGI
 *
 * Yang kedua tetap "acak" secara harfiah, dan hasilnya tetap jadwal kaku
 * dengan langkah tambahan. Test ini yang memisahkan keduanya.
 *
 * Sumber acaknya disuntik, bukan `Math.random()`: yang tak bisa diuji akan
 * dipercaya begitu saja.
 */
import { describe, it, expect } from 'vitest'
import { sasaranBerikut, sudahWaktunya } from '../jadwal-acak.js'

const AWAL = new Date('2026-08-15T08:00:00+07:00')

describe('sasaranBerikut — memilih di dalam jendela', () => {
  it('jendela 0 mengembalikan awal APA ADANYA (perilaku lama)', () => {
    /*
     * Seluruh tugas lama (cek tenggat, retensi) berjendela 0 — migrasi 391
     * tak boleh mengubah perilakunya sama sekali.
     *
     * Sumber acaknya MELEMPAR, bukan mengembalikan angka. Versi pertama test
     * ini memakai `() => 0.99`, dan mutasi uji membuktikannya tak berguna:
     * dengan jendela 0, `0.99 * 0` tetap 0, jadi cabang penjaganya tak pernah
     * benar-benar diuji. Sumber yang melempar membuktikan ia TIDAK DIPANGGIL.
     */
    const s = sasaranBerikut({
      awal: AWAL,
      jendelaMenit: 0,
      acak: () => { throw new Error('acak tak boleh dipanggil saat jendela 0') },
    })
    expect(s.getTime()).toBe(AWAL.getTime())
  })

  it('acak=0 jatuh tepat di awal', () => {
    const s = sasaranBerikut({ awal: AWAL, jendelaMenit: 600, acak: () => 0 })
    expect(s.getTime()).toBe(AWAL.getTime())
  })

  it('acak mendekati 1 TIDAK melewati akhir jendela', () => {
    // Batas atas EKSKLUSIF: sasaran yang jatuh tepat di awal periode
    // berikutnya akan terbaca sebagai periode yang salah.
    const s = sasaranBerikut({ awal: AWAL, jendelaMenit: 600, acak: () => 0.999999 })
    const akhir = AWAL.getTime() + 600 * 60_000
    expect(s.getTime()).toBeLessThan(akhir)
  })

  it('seluruh hasil ada di dalam [awal, awal+jendela)', () => {
    const akhir = AWAL.getTime() + 600 * 60_000
    for (let i = 0; i <= 100; i += 1) {
      const s = sasaranBerikut({ awal: AWAL, jendelaMenit: 600, acak: () => i / 100 })
      expect(s.getTime()).toBeGreaterThanOrEqual(AWAL.getTime())
      expect(s.getTime()).toBeLessThan(akhir)
    }
  })

  it('TERSEBAR — bukan menumpuk di awal', () => {
    // Inilah bedanya dari "diundi tiap tick". Dengan sumber acak merata,
    // hasilnya harus ikut merata sepanjang jendela.
    const jam: number[] = []
    for (let i = 0; i < 24; i += 1) {
      const s = sasaranBerikut({ awal: AWAL, jendelaMenit: 600, acak: () => i / 24 })
      jam.push(s.getHours())
    }
    // Jendela 10 jam dari pukul 08:00 → harus menyentuh lebih dari 5 jam berbeda.
    expect(new Set(jam).size).toBeGreaterThan(5)
  })

  it('dibulatkan ke MENIT — heartbeat-nya 15 menit, presisi detik menyesatkan', () => {
    const s = sasaranBerikut({ awal: AWAL, jendelaMenit: 600, acak: () => 0.37 })
    expect(s.getSeconds()).toBe(0)
    expect(s.getMilliseconds()).toBe(0)
  })

  it('acak di luar rentang tak menghasilkan waktu ngawur', () => {
    // Sumber acak yang rusak (mengembalikan -1 atau 5) tak boleh menghasilkan
    // sasaran di masa lalu atau berhari-hari ke depan.
    const akhir = AWAL.getTime() + 600 * 60_000
    for (const r of [-1, 5, Number.NaN]) {
      const s = sasaranBerikut({ awal: AWAL, jendelaMenit: 600, acak: () => r })
      expect(s.getTime()).toBeGreaterThanOrEqual(AWAL.getTime())
      expect(s.getTime()).toBeLessThan(akhir)
    }
  })
})

describe('sudahWaktunya — menunggu sampai sasaran lewat', () => {
  const opsi = { awal: AWAL, jendelaMenit: 600, acak: () => 0.5 }

  it('SEBELUM sasaran → ditunda', () => {
    const sasaran = new Date(AWAL.getTime() + 120 * 60_000) // 10:00
    const k = sudahWaktunya(sasaran, new Date(AWAL.getTime() + 60 * 60_000), opsi)
    expect(k.jalan).toBe(false)
    if (!k.jalan) expect(k.alasan).toBe('belum-sasaran')
  })

  it('TEPAT di sasaran → jalan', () => {
    const sasaran = new Date(AWAL.getTime() + 120 * 60_000)
    const k = sudahWaktunya(sasaran, sasaran, opsi)
    expect(k.jalan).toBe(true)
  })

  it('SESUDAH sasaran → jalan', () => {
    const sasaran = new Date(AWAL.getTime() + 120 * 60_000)
    const k = sudahWaktunya(sasaran, new Date(AWAL.getTime() + 200 * 60_000), opsi)
    expect(k.jalan).toBe(true)
  })

  it('sasaran belum ada → dipilih, dan dikembalikan supaya bisa DISIMPAN', () => {
    // Pemanggil yang menyimpannya; fungsi ini murni. Kalau sasarannya tak
    // ikut dikembalikan, pemanggil harus mengundi lagi — dan undian kedua
    // menghasilkan waktu yang berbeda dari yang baru saja diputuskan.
    const k = sudahWaktunya(null, AWAL, opsi)
    expect(k.sasaran.getTime()).toBe(AWAL.getTime() + 300 * 60_000)
  })
})
