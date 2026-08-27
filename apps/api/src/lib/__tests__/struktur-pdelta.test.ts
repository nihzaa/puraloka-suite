import { describe, it, expect } from 'vitest'
import {
  analisaPDelta, THETA_ABAIKAN, THETA_MAKS_ABSOLUT,
} from '../struktur-beban-lateral'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * P-DELTA — bangunan yang sudah miring dijatuhkan oleh beratnya sendiri
 *
 * Hampir semua batas struktur lain memberi peringatan: baja meleleh dulu,
 * beton retak dulu, kayu melendut dulu. P-Delta tidak — ia BERPUTAR BALIK ke
 * dirinya sendiri. Miring menambah momen, momen menambah miring. Di bawah
 * ambang tertentu putaran itu mengecil; di atasnya ia membesar, dan bangunan
 * runtuh tanpa gejala yang bisa dilihat orang.
 *
 * Angka acuannya dari SNI 1726 §7.8.7 dan hitungan tangan, bukan dari
 * keluaran kode ini sendiri.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Satu tingkat, angka yang bisa dihitung tangan. */
const SATU = {
  nama: ['L1'],
  bebanVertikalKumulatifKn: [4000],
  driftMm: [20],
  gayaGeserKn: [500],
  tinggiTingkatM: [3.5],
  cd: 5.5,
}

describe('θ dicocokkan ke HITUNGAN TANGAN, bukan ke keluaran sendiri', () => {
  it('θ = Px·Δ / (Vx·hsx·Cd)', () => {
    /*
      4000 kN × 0,020 m / (500 kN × 3,5 m × 5,5) = 80 / 9625 = 0,008312
    */
    const h = analisaPDelta(SATU)
    expect(h.tingkat[0].theta).toBeCloseTo(0.0083, 4)
  })

  it('θmaks = 0,5/(β·Cd), dibatasi 0,25', () => {
    /* Cd 5,5 → 0,5/5,5 = 0,0909. */
    expect(analisaPDelta(SATU).tingkat[0].thetaMaks).toBeCloseTo(0.0909, 4)

    /* Cd kecil → dibatasi 0,25, bukan 0,5/(1×1) = 0,5. */
    const cdKecil = analisaPDelta({ ...SATU, cd: 1 })
    expect(cdKecil.tingkat[0].thetaMaks).toBe(THETA_MAKS_ABSOLUT)
  })

  it('Cd LEBIH BESAR memberi θmaks LEBIH KECIL — berlawanan dugaan', () => {
    /*
      Sistem yang lebih daktail memang boleh berdeformasi besar, tetapi justru
      karena itu ia lebih peka terhadap efek orde kedua. Uji ini menahan
      seseorang "memperbaiki" arahnya karena terasa terbalik.
    */
    const daktail = analisaPDelta({ ...SATU, cd: 6.5 })
    const kaku = analisaPDelta({ ...SATU, cd: 3 })
    expect(daktail.tingkat[0].thetaMaks).toBeLessThan(kaku.tingkat[0].thetaMaks)
  })

  it('θ naik saat beban naik, drift naik, atau geser turun', () => {
    const dasar = analisaPDelta(SATU).tingkat[0].theta
    expect(analisaPDelta({ ...SATU, bebanVertikalKumulatifKn: [8000] })
      .tingkat[0].theta).toBeGreaterThan(dasar)
    expect(analisaPDelta({ ...SATU, driftMm: [40] })
      .tingkat[0].theta).toBeGreaterThan(dasar)
    expect(analisaPDelta({ ...SATU, gayaGeserKn: [250] })
      .tingkat[0].theta).toBeGreaterThan(dasar)
  })
})

describe('TIGA keadaan yang harus dibedakan — dan bendera yang tak boleh bertentangan', () => {
  it('θ ≤ 0,10 → boleh diabaikan, pembesaran 1,0', () => {
    const h = analisaPDelta(SATU)
    const t = h.tingkat[0]
    expect(t.perluDihitung).toBe(false)
    expect(t.tidakStabil).toBe(false)
    expect(t.pembesaran).toBe(1)
    expect(h.aman).toBe(true)
    expect(h.catatan.some((c) => /boleh diabaikan/.test(c))).toBe(true)
  })

  it('0,10 < θ ≤ θmaks → WAJIB diperhitungkan, gaya diperbesar 1/(1−θ)', () => {
    /*
      Butuh Cd kecil supaya θmaks > 0,10 — pada Cd 5,5 θmaks hanya 0,0909,
      jadi keadaan "perlu dihitung tapi masih stabil" tak mungkin ada di sana.
      Itu sendiri temuan: sistem daktail melompat dari "abaikan" langsung ke
      "tidak stabil".
    */
    const h = analisaPDelta({
      ...SATU, cd: 2, bebanVertikalKumulatifKn: [20000], driftMm: [30],
      gayaGeserKn: [500],
    })
    const t = h.tingkat[0]
    expect(t.theta).toBeGreaterThan(THETA_ABAIKAN)
    expect(t.theta).toBeLessThanOrEqual(t.thetaMaks)
    expect(t.perluDihitung).toBe(true)
    expect(t.tidakStabil).toBe(false)
    expect(t.pembesaran).toBeCloseTo(1 / (1 - t.theta), 3)
    expect(h.catatan.some((c) => /WAJIB diperhitungkan/.test(c))).toBe(true)
  })

  it('θ > θmaks → TIDAK STABIL, dan pembesaran TIDAK dipakai', () => {
    /*
      Di atas θmaks, angka 1/(1−θ) tak berarti apa-apa: yang dibutuhkan bukan
      gaya yang diperbesar melainkan bentuk bangunan yang diubah.
    */
    const h = analisaPDelta({
      ...SATU, bebanVertikalKumulatifKn: [12000], driftMm: [50],
      gayaGeserKn: [320],
    })
    const t = h.tingkat[0]
    expect(t.tidakStabil).toBe(true)
    expect(t.pembesaran).toBe(1)
    expect(h.aman).toBe(false)
    expect(h.catatan.some((c) => /TIDAK STABIL/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /bentuk bangunannya yang.*diubah/s.test(c))).toBe(true)
  })

  it('BENDERA tak boleh bertentangan: tidak stabil SELALU perlu dihitung', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Ditemukan saat menguji keadaan batas, bukan dari test.

      Dua ambangnya bergerak sendiri-sendiri: ambang abaikan dipaku 0,10,
      sementara θmaks = 0,5/(β·Cd) BISA LEBIH KECIL — pada Cd 5,5 hanya
      0,0909.

      Versi pertama menulis `theta > THETA_ABAIKAN` saja, dan pada θ = 0,097
      hasilnya `tidakStabil: true` bersama `perluDihitung: false` —
      "strukturnya tak stabil, tetapi efeknya boleh diabaikan". Verdict-nya
      benar, tetapi bendera yang bertentangan akan dibaca UI dan ditampilkan
      apa adanya.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaPDelta({
      ...SATU, bebanVertikalKumulatifKn: [12000], driftMm: [50],
      gayaGeserKn: [320],
    })
    const t = h.tingkat[0]
    /* θ 0,097: DI ATAS θmaks 0,0909, tetapi DI BAWAH ambang abaikan 0,10. */
    expect(t.theta).toBeGreaterThan(t.thetaMaks)
    expect(t.theta).toBeLessThan(THETA_ABAIKAN)
    expect(t.tidakStabil).toBe(true)
    expect(t.perluDihitung, 'tidak stabil TAPI boleh diabaikan — bertentangan')
      .toBe(true)
  })

  it('tiap tingkat punya bendera yang konsisten satu sama lain', () => {
    const h = analisaPDelta({
      nama: ['L1', 'L2', 'L3'],
      bebanVertikalKumulatifKn: [12000, 8000, 4000],
      driftMm: [45, 38, 25],
      gayaGeserKn: [400, 300, 180],
      tinggiTingkatM: [3.5, 3.5, 3.5],
      cd: 5.5,
    })
    for (const t of h.tingkat) {
      if (t.tidakStabil) {
        expect(t.perluDihitung, `${t.nama}: tak stabil tapi tak perlu dihitung`)
          .toBe(true)
        expect(t.pembesaran, `${t.nama}: tak stabil tapi punya pembesaran`)
          .toBe(1)
      }
      if (t.pembesaran > 1) {
        expect(t.perluDihitung).toBe(true)
        expect(t.tidakStabil).toBe(false)
      }
    }
  })
})

describe('beban KUMULATIF, bukan per tingkat — dan tingkat BAWAH yang kritis', () => {
  it('tingkat bawah memikul lebih banyak, jadi θ-nya lebih besar', () => {
    /*
      Yang menekan kolom tingkat bawah adalah SELURUH bangunan di atasnya.
      Memakai berat per tingkat memberi θ yang jauh terlalu kecil, dan justru
      di tingkat bawah efeknya paling besar.
    */
    const h = analisaPDelta({
      nama: ['L1', 'L2', 'L3'],
      bebanVertikalKumulatifKn: [12000, 8000, 4000],
      driftMm: [30, 30, 30],
      gayaGeserKn: [400, 400, 400],
      tinggiTingkatM: [3.5, 3.5, 3.5],
      cd: 5.5,
    })
    expect(h.tingkat[0].theta).toBeGreaterThan(h.tingkat[1].theta)
    expect(h.tingkat[1].theta).toBeGreaterThan(h.tingkat[2].theta)
    expect(h.antara.tingkatKritis).toBe('L1')
  })

  it('catatan MENYEBUT bahwa bebannya harus kumulatif', () => {
    const h = analisaPDelta(SATU)
    expect(h.catatan.some((c) => /KUMULATIF/.test(c))).toBe(true)
  })

  it('SATU pemeriksaan per bangunan, bukan satu per tingkat', () => {
    /*
      Bangunan 20 lantai akan memberi 20 batang persen yang hampir semuanya
      hijau — dan yang berulang tak dibaca. Yang dilaporkan tingkat
      TERKRITIS, dan namanya disebut supaya bisa langsung dicari.
    */
    const h = analisaPDelta({
      nama: ['L1', 'L2', 'L3', 'L4', 'L5'],
      bebanVertikalKumulatifKn: [20000, 16000, 12000, 8000, 4000],
      driftMm: [25, 25, 25, 25, 25],
      gayaGeserKn: [500, 450, 400, 300, 200],
      tinggiTingkatM: [3.5, 3.5, 3.5, 3.5, 3.5],
      cd: 5.5,
    })
    expect(h.periksa).toHaveLength(1)
    expect(h.tingkat).toHaveLength(5)
    expect(h.periksa[0].rumus).toContain(h.antara.tingkatKritis)
  })
})

describe('β — dan kenapa bawaannya yang paling konservatif', () => {
  it('β = 1,0 bawaan; β lebih kecil MEMPERLONGGAR batas', () => {
    const bawaan = analisaPDelta(SATU).tingkat[0].thetaMaks
    const longgar = analisaPDelta({ ...SATU, beta: 0.5 }).tingkat[0].thetaMaks
    expect(longgar).toBeGreaterThan(bawaan)
    /* Karena itu catatannya memperingatkan. */
    expect(analisaPDelta(SATU).catatan.some(
      (c) => /MEMPERLONGGAR/.test(c) && /berbahaya/.test(c),
    )).toBe(true)
  })
})

describe('yang DITOLAK', () => {
  it('panjang larik yang tak sama ditolak dengan menyebut mana', () => {
    expect(() => analisaPDelta({ ...SATU, driftMm: [20, 30] }))
      .toThrow(/drift/)
    expect(() => analisaPDelta({ ...SATU, gayaGeserKn: [] }))
      .toThrow(/gaya geser/)
  })

  it('nol tingkat ditolak', () => {
    expect(() => analisaPDelta({
      nama: [], bebanVertikalKumulatifKn: [], driftMm: [],
      gayaGeserKn: [], tinggiTingkatM: [], cd: 5.5,
    })).toThrow(/Minimal satu tingkat/)
  })

  it('angka nol atau negatif ditolak dengan menyebut TINGKATNYA', () => {
    /*
      Pesan yang menyebut "L3" bisa ditindak; pesan yang cuma bilang "gaya
      geser harus > 0" memaksa pembacanya memeriksa seluruh tingkat.
    */
    expect(() => analisaPDelta({
      ...SATU, nama: ['Lantai 3'], gayaGeserKn: [0],
    })).toThrow(/Lantai 3/)
    expect(() => analisaPDelta({ ...SATU, cd: 0 })).toThrow(/Cd/)
  })

  it('drift NEGATIF ditolak, drift NOL diterima', () => {
    /* Drift nol sah: tingkat yang tak bergerak sama sekali. */
    expect(() => analisaPDelta({ ...SATU, driftMm: [-5] })).toThrow(/Drift/)
    expect(() => analisaPDelta({ ...SATU, driftMm: [0] })).not.toThrow()
  })
})

describe('dua lapis: angka untuk insinyur, kalimat untuk yang memutuskan', () => {
  it('pemeriksaan membawa RUMUS beserta tingkat terkritisnya', () => {
    const h = analisaPDelta(SATU)
    expect(h.periksa[0].rumus).toContain('θ')
    expect(h.periksa[0].rumus).toContain('SNI 1726')
  })

  it('catatan menyatakan APA YANG HARUS DILAKUKAN, bukan cuma angkanya', () => {
    const h = analisaPDelta({
      ...SATU, bebanVertikalKumulatifKn: [12000], driftMm: [50],
      gayaGeserKn: [320],
    })
    /* Bukan "θ melewati batas" saja, tetapi apa yang harus diubah. */
    expect(h.catatan.some((c) => /dinding geser|bresing|kurangi tingginya/.test(c)))
      .toBe(true)
  })

  it('catatan menyatakan apa yang BELUM diperiksa', () => {
    expect(analisaPDelta(SATU).catatan.some((c) => /BELUM diperiksa/.test(c)))
      .toBe(true)
  })

  it('tiap rasio BERHINGGA', () => {
    for (const drift of [0, 10, 50, 200]) {
      const h = analisaPDelta({ ...SATU, driftMm: [drift] })
      for (const p of h.periksa) {
        expect(Number.isFinite(p.rasio), `drift ${drift} → ${p.rasio}`).toBe(true)
      }
    }
  })
})
