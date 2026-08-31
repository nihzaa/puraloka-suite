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
      Puncak analitis 50,625 kNm di x = 0,375 L, diverifikasi lewat persamaan
      tiga momen: M tumpuan tengah = wL²/8 = 90 → R kiri = 3wL/8 = 45 →
      puncak di x = R/w = 2,25 m = 0,375 L → M = R·x − w·x²/2 = 50,625.

      ⚠ Test ini dulu MENUNTUT 50,400 — nilai cuplikan 0,4 L — dan komentarnya
      menjelaskan panjang lebar kenapa 50,625 "mustahil hijau": `momenKnm.maks`
      saat itu maksimum atas jaring 11 titik saja, dan 0,375 L bukan titik
      jaring. Test yang mengabadikan batasan implementasi seperti itu berhenti
      menjaga fisikanya dan mulai menjaga cacatnya: 0,44% ke arah LEBIH KECIL,
      pada angka yang dipakai memilih pembesian.

      `analisaRangka2D` sekarang menyertakan puncak analitis x = V1/q. Jaring
      `di[]` tetap 11 titik untuk menggambar diagram — karena itu `puncak.xM`
      di bawah masih dicari dari jaring dan masih toleransi 1 angka.
    */
    const L = 6, w = 20
    const h = analisaBalokMenerus({
      bentangM: [L, L], bMm: 300, hMm: 500, fcMpa: 25, qKnM: w,
    })
    const b = h.batang[0]!

    const R = 3 * w * L / 8                    // reaksi tepi, dari wL²/8
    const xPuncak = R / w                      // 2,25 m = 0,375 L
    expect(b.momenKnm.maks).toBeCloseTo(R * xPuncak - w * xPuncak ** 2 / 2, 6)
    expect(b.momenKnm.maks).toBeCloseTo(0.070313 * w * L ** 2, 1)

    // Jaring penggambar diagram tak ikut berubah — puncaknya masih dicuplik
    // di 0,4 L, tetangga terdekat 0,375 L.
    expect(b.momenKnm.di).toHaveLength(11)
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
