// apps/api/src/lib/__tests__/rangka-portal.test.ts
import { describe, it, expect } from 'vitest'
import { analisaBalokMenerus } from '../rangka-portal.js'

describe('analisaBalokMenerus — lapis 2', () => {
  /*
    DUA BENTANG SAMA, beban merata, tiga tumpuan sederhana.

    Persamaan tiga momen → M tumpuan tengah = wL²/8.
    DIVERIFIKASI numerik 2026-09-01 saat spec ditulis: −0,125 wL² tepat,
    dan momen lapangan 0,070313 wL² (= wL²/14,22) di x = 0,375 L.

    Kedua angka dipakai: yang pertama menguji tumpuan, yang kedua menguji
    bahwa deret titik sepanjang batang juga benar — bukan cuma nilai kritis.
  */
  it('dua bentang sama: M tumpuan tengah = wL²/8', () => {
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    // momenTumpuanKnm = [tepi kiri, tengah, tepi kanan]
    expect(Math.abs(h.momenTumpuanKnm[1]!)).toBeCloseTo(w * L ** 2 / 8, 2)
  })

  it('dua bentang sama: M lapangan wL²/14,22 di x = 0,375L', () => {
    /*
      ⚠ PENYIMPANGAN DARI PLAN — dan bukan karena solvernya salah.

      Plan menuliskan `expect(b.momenKnm.maks).toBeCloseTo(0.070313*w*L**2, 1)`.
      Angka fisikanya BENAR: puncak analitis 50,625 kNm di x = 0,375 L, sudah
      diverifikasi ulang di sini lewat persamaan tiga momen (M tumpuan tengah
      = wL²/8 = 90 → R kiri = 3wL/8 = 45 → puncak di x = R/w = 2,25 m = 0,375 L
      → M = 50,625). Yang tak bisa dipenuhi adalah CARA MENGUKURNYA.

      `analisaRangka2D` mencuplik gaya dalam di 11 TITIK, x = 0 · 0,1L · … · L,
      dan `momenKnm.maks` adalah maksimum atas cuplikan itu — bukan puncak
      analitis. x = 0,375 L BUKAN titik cuplikan; tetangganya 0,3 L dan 0,4 L.
      Nilai terbaik yang bisa dipulangkan jaring itu adalah 50,400 kNm di
      0,4 L, meleset 0,225 dari 50,625 — sementara `toBeCloseTo(…, 1)`
      menuntut < 0,05. Assertion itu MUSTAHIL hijau tanpa mengubah `maks`
      jadi puncak analitis (bukan wewenang Task 3) atau memperapat jaringnya.

      Diverifikasi bahwa yang meleset memang HANYA jaringnya: momen solver
      cocok rumus tertutup R·x − w·x²/2 di KESEBELAS titik dengan beda
      0,00e+0 — nol mutlak, bukan sekadar dekat.

      Jadi yang diuji di sini: (a) nilai di titik cuplikan terdekat sama
      persis dengan teori, dan (b) puncaknya memang di sekitar 0,375 L —
      assertion kedua ini dipakai APA ADANYA dari plan, dan ia hijau.
    */
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    const b = h.batang[0]!

    // Puncak jaring = 0,4 L. Teori di titik itu: 45·2,4 − 20·2,4²/2 = 50,4.
    const R = 3 * w * L / 8                    // reaksi tepi, dari wL²/8
    const xCuplik = 0.4 * L
    expect(b.momenKnm.maks).toBeCloseTo(R * xCuplik - w * xCuplik ** 2 / 2, 6)

    // Puncak analitis 50,625 terkurung rapat oleh dua cuplikan tetangganya.
    expect(b.momenKnm.maks).toBeLessThan(0.070313 * w * L ** 2)
    expect(b.momenKnm.maks).toBeGreaterThan(0.070313 * w * L ** 2 * 0.99)

    const puncak = b.momenKnm.di.reduce((p, c) => (c.nilai > p.nilai ? c : p))
    expect(puncak.xM / L).toBeCloseTo(0.375, 1)
  })

  it('satu bentang = balok sederhana: wL²/8 di tengah', () => {
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    expect(h.batang[0]!.momenKnm.maks).toBeCloseTo(w * L ** 2 / 8, 2)
  })

  it('KEWARASAN: sebanding dengan koefisien pendekatan yang sudah ada', () => {
    /*
      Bukan pengganti kasus tangan — keduanya MEMANG berbeda, dan itu justru
      alasan solver dibangun. Ini hanya menangkap kesalahan BESAR: di luar
      0,5–1,5× berarti ada yang salah di salah satunya.
    */
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    const pendekatan = w * L ** 2 / 11   // SNI 2847 §6.5, bentang tengah
    const solver = Math.abs(h.momenTumpuanKnm[1]!)
    expect(solver / pendekatan).toBeGreaterThan(0.5)
    expect(solver / pendekatan).toBeLessThan(1.5)
  })

  it('menolak bentang kosong atau nol', () => {
    expect(() => analisaBalokMenerus({
      bentangM: [], bMm: 300, hMm: 500, fcMpa: 25, qKnM: 20,
    })).toThrow(/bentang/i)
    expect(() => analisaBalokMenerus({
      bentangM: [6, 0], bMm: 300, hMm: 500, fcMpa: 25, qKnM: 20,
    })).toThrow(/bentang/i)
  })
})
