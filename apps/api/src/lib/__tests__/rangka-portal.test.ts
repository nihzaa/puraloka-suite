// apps/api/src/lib/__tests__/rangka-portal.test.ts
import { describe, it, expect } from 'vitest'
import { analisaBalokMenerus, analisaPortal } from '../rangka-portal.js'

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

describe('analisaPortal — lapis 3 (gravitasi)', () => {
  const dasar = {
    bentangM: 6, tinggiM: 3.5, jumlahLantai: 1,
    balok: { bMm: 300, hMm: 500 },
    kolom: { bMm: 400, hMm: 400 },
    fcMpa: 25, qKnM: 20,
  }

  it('momen balok portal ADA DI ANTARA sederhana dan jepit-jepit', () => {
    /*
      Ini kasus tangan yang paling berguna untuk portal, dan alasannya
      penting: portal satu bentang berkaki jepit TIDAK punya rumus tertutup
      sesederhana balok — momennya bergantung kekakuan RELATIF kolom-balok.

      Tetapi ia PASTI terkurung di antara dua batas yang punya rumus tertutup:

        kolom sangat lunak → balok mendekati SEDERHANA    → M tumpuan → 0
        kolom sangat kaku  → balok mendekati JEPIT-JEPIT  → M tumpuan → wL²/12

      ⚠ PLAN-nya SALAH di sini, dan koreksinya diukur bukan ditebak. Plan
      menulis batasnya `wL²/12 × 0,85 < M tumpuan < wL²/8`. Dua-duanya keliru:

        • wL²/8 adalah momen LAPANGAN balok sederhana, bukan momen TUMPUAN.
          Balok sederhana justru bermomen tumpuan NOL — jadi kolom yang makin
          lunak menurunkan M tumpuan ke 0, bukan menaikkannya ke wL²/8.
        • karena itu wL²/12 adalah batas ATAS, bukan batas bawah.

      Disapu terhadap kekakuan kolom (balok 300×500, L=6, h=3,5, w=20):

        kolom  50²  M tumpuan  0,034      kolom 400²  M tumpuan 41,927
        kolom 200²  M tumpuan  7,653      kolom 2000² M tumpuan 59,879 → wL²/12

      Batas plan menuntut M tumpuan > 51 untuk kolom 400×400 — penampang yang
      sama sekali lazim — dan itu baru tercapai di atas kolom ≈800×800.

      Diverifikasi lewat TIGA jalur yang saling bebas 2026-09-01: solver,
      slope-deflection tangan (−42,04 kNm; solver −41,93, bedanya pemendekan
      aksial kolom yang slope-deflection abaikan), dan identitas statika.

      Yang diuji karena itu batas SEBENARNYA, ditambah identitas keseimbangan
      yang jauh lebih tajam daripada sekadar rentang: untuk beban merata,
      M tumpuan + M lapangan = wL²/8 PERSIS, berapa pun kekakuan kolomnya.
      Solver yang salah membagi momen antara kolom dan balok akan langsung
      melanggarnya.
    */
    const h = analisaPortal(dasar)
    const balok = h.batang.find((b) => b.nama.startsWith('B'))!
    const mTumpuan = Math.abs(Math.min(balok.momenKnm.min, 0))
    const w = dasar.qKnM, L = dasar.bentangM

    expect(mTumpuan).toBeGreaterThan(0)
    expect(mTumpuan).toBeLessThan(w * L ** 2 / 12)

    // Identitas statika — berlaku untuk SEMBARANG kekakuan kolom.
    expect(mTumpuan + balok.momenKnm.maks).toBeCloseTo(w * L ** 2 / 8, 6)
  })

  it('BATAS: kolom makin lunak → M tumpuan → 0 (balok jadi sederhana)', () => {
    /*
      Sisi lain dari kurungan di atas, dan sisi yang paling mudah salah:
      plan menaruh batas ini di wL²/8. Kolom yang sangat lunak tak menahan
      putaran sama sekali, jadi balok bertumpu bebas — momen tumpuannya NOL
      dan seluruh wL²/8 pindah ke lapangan.
    */
    const h = analisaPortal({ ...dasar, kolom: { bMm: 50, hMm: 50 } })
    const balok = h.batang.find((b) => b.nama.startsWith('B'))!
    const mTumpuan = Math.abs(Math.min(balok.momenKnm.min, 0))
    const w = dasar.qKnM, L = dasar.bentangM

    expect(mTumpuan).toBeLessThan(w * L ** 2 / 12 * 0.02)
    expect(balok.momenKnm.maks).toBeCloseTo(w * L ** 2 / 8, 0)
  })

  it('kolom SANGAT kaku → balok mendekati jepit-jepit wL²/12', () => {
    // Kolom 2000×2000 mm: kekakuannya jauh di atas balok.
    const h = analisaPortal({ ...dasar, kolom: { bMm: 2000, hMm: 2000 } })
    const balok = h.batang.find((b) => b.nama.startsWith('B'))!
    const mTumpuan = Math.abs(Math.min(balok.momenKnm.min, 0))
    expect(mTumpuan).toBeCloseTo(dasar.qKnM * dasar.bentangM ** 2 / 12, 0)
  })

  it('kolom memikul aksial dari beban balok di atasnya', () => {
    const h = analisaPortal(dasar)
    const kolom = h.batang.filter((b) => b.nama.startsWith('K'))
    const totalAksial = kolom.reduce((s, k) => s + Math.abs(k.aksialKn), 0)
    // Dua kolom memikul qL total (± berat sendiri yang tak dihitung di sini).
    expect(totalAksial).toBeCloseTo(dasar.qKnM * dasar.bentangM, 0)
  })

  it('dua lantai menghasilkan lebih banyak batang daripada satu', () => {
    const satu = analisaPortal(dasar)
    const dua = analisaPortal({ ...dasar, jumlahLantai: 2 })
    expect(dua.batang.length).toBeGreaterThan(satu.batang.length)
  })
})
