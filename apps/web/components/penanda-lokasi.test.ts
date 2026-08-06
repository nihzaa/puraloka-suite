import { describe, it, expect } from 'vitest'
import { jarakMeter, jarakTerbaca } from './penanda-lokasi'

// ─────────────────────────────────────────────────────────────────────────────
// PENANDA LOKASI — rumus jarak & format bacanya.
//
// Angka yang dihasilkan fungsi ini menentukan apakah sebuah foto DIANGGAP
// bukti bahwa pekerjaan dilakukan di lokasi itu. Salah hitung berarti dua
// kesalahan yang sama-sama merusak:
//
//   • foto sah ditandai "di luar lokasi" — tuduhan yang salah, dan tuduhan
//     yang salah merusak kepercayaan pada seluruh sistem;
//   • foto dari tempat lain lolos sebagai bukti — dasar sengketa progres
//     yang justru hendak ditutup geotag.
//
// `uji-geotag-sinkron.mjs` menjaga rumus ini identik dengan `apps/api`.
// Berkas INI menjaga angkanya benar. Keduanya perlu: dua salinan yang
// sama-sama salah tetap sinkron.
// ─────────────────────────────────────────────────────────────────────────────

/** Titik acuan: Dago, Bandung. */
const DAGO = { lintang: -6.8790, bujur: 107.6130 }

describe('jarakMeter — haversine', () => {
  it('titik yang sama = nol', () => {
    expect(jarakMeter(DAGO, DAGO)).toBe(0)
  })

  it('jarak pendek dalam kota masuk akal', () => {
    // ~50 m ke timur laut. Toleransi lebar karena yang diuji besaran, bukan
    // presisi geodetik — dan keputusan "di dalam radius 500 m" tak berubah
    // oleh selisih beberapa meter.
    const d = jarakMeter(DAGO, { lintang: -6.8792, bujur: 107.6134 })
    expect(d).toBeGreaterThan(20)
    expect(d).toBeLessThan(100)
  })

  it('Bandung–Jakarta ≈ 120 km', () => {
    const d = jarakMeter(DAGO, { lintang: -6.1754, bujur: 106.8272 })
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(130_000)
  })

  it('simetris — urutan argumen tak mengubah jarak', () => {
    const a = { lintang: -6.9024, bujur: 107.6186 }
    expect(jarakMeter(DAGO, a)).toBe(jarakMeter(a, DAGO))
  })

  it('lintas khatulistiwa dihitung benar', () => {
    // 1 derajat lintang ≈ 111 km, di mana pun.
    const d = jarakMeter({ lintang: -0.5, bujur: 107 }, { lintang: 0.5, bujur: 107 })
    expect(d).toBeGreaterThan(105_000)
    expect(d).toBeLessThan(118_000)
  })

  it('lintas meridian 180 TIDAK menghasilkan setengah keliling bumi', () => {
    // Jebakan klasik: 179° dan −179° berselisih 2°, bukan 358°. Rumus yang
    // salah di sini melaporkan ~20.000 km untuk dua titik yang bertetangga —
    // dan setiap foto di dekat garis tanggal jadi "di luar lokasi".
    const d = jarakMeter({ lintang: 0, bujur: 179 }, { lintang: 0, bujur: -179 })
    expect(d).toBeLessThan(250_000)
  })

  it('titik antipodal menghasilkan setengah keliling bumi, bukan NaN', () => {
    // Kutub ke kutub, dan dua titik antipodal lain.
    //
    // Catatan jujur soal penjepit `Math.min(1, …)` di rumusnya: DIUKUR, `h`
    // pada ketiga pasangan ini tepat 1,0 — tak melampaui. Jadi test ini TIDAK
    // membuktikan penjepit itu bekerja; mencopotnya tak membuat satu pun test
    // di berkas ini merah (diverifikasi lewat mutasi).
    //
    // Penjepitnya tetap benar sebagai pengaman terhadap galat pembulatan pada
    // arsitektur floating-point lain — tapi mengklaim test ini menjaganya akan
    // menjadi kebohongan yang menenangkan. Yang benar-benar diuji di sini:
    // jarak antipodal menghasilkan angka yang masuk akal, bukan NaN.
    for (const [a, b] of [
      [{ lintang: 90, bujur: 0 }, { lintang: -90, bujur: 0 }],
      [{ lintang: 0, bujur: 0 }, { lintang: 0, bujur: 180 }],
      [{ lintang: 45, bujur: 0 }, { lintang: -45, bujur: 180 }],
    ] as const) {
      const d = jarakMeter(a, b)
      expect(Number.isNaN(d)).toBe(false)
      expect(d).toBeGreaterThan(19_000_000)
      expect(d).toBeLessThan(20_100_000)
    }
  })
})

describe('jarakTerbaca — presisi yang jujur', () => {
  it('di bawah 1 km dibulatkan ke puluhan meter', () => {
    // GPS ponsel tak pernah setepat satu meter. "347 m" memberi kesan presisi
    // yang tak dimiliki angkanya, dan pembaca menyimpulkan lebih dari yang sah.
    expect(jarakTerbaca(347)).toBe('350 m')
    expect(jarakTerbaca(52)).toBe('50 m')
    expect(jarakTerbaca(4)).toBe('0 m')
  })

  it('1 km ke atas dalam kilometer satu desimal', () => {
    expect(jarakTerbaca(1000)).toBe('1.0 km')
    expect(jarakTerbaca(2712)).toBe('2.7 km')
    expect(jarakTerbaca(120_000)).toBe('120.0 km')
  })

  it('batas 1000 m tepat pindah satuan', () => {
    expect(jarakTerbaca(999)).toBe('1000 m')
    expect(jarakTerbaca(1000)).toBe('1.0 km')
  })

  it('nol meter tetap terbaca, bukan kosong', () => {
    expect(jarakTerbaca(0)).toBe('0 m')
  })
})
