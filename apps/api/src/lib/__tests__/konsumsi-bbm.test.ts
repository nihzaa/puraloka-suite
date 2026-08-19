/**
 * KONSUMSI BBM — yang diuji cara ia menuduh alat yang wajar, atau membiarkan
 * solar hilang tanpa suara.
 *
 * Angka acuan dari basis nyata 2026-08-16:
 *   Excavator 20 Ton   12 pengisian   960 liter   80 L tiap kali
 *   Truk Mixer 7 m3    10 pengisian   450 liter   45 L tiap kali
 *
 * Nominal rupiahnya SERAGAM — itulah yang membuat saya sempat mencoret
 * automation ini. Liternya yang bermakna, dibagi jam operasi.
 */
import { describe, it, expect } from 'vitest'
import { nilaiKonsumsiBbm } from '../konsumsi-bbm.js'

const I = (liter: number, tanggal = '2026-08-01') => ({ tanggal, liter })

describe('nilaiKonsumsiBbm', () => {
  it('menandai konsumsi yang melonjak dari riwayat alat itu sendiri', () => {
    // Riwayat 900 L / 50 jam = 18 L/jam. Terbaru 300 L / 10 jam = 30 L/jam.
    const h = nilaiKonsumsiBbm(
      [I(150), I(150)], 10,
      [I(450), I(450)], 50,
      2, 30,
    )
    expect(h.literPerJam).toBe(30)
    expect(h.acuanPerJam).toBe(18)
    expect(h.naikPersen).toBeCloseTo(66.7, 0)
    expect(h.boros).toBe(true)
    expect(h.sebab).toBe('melonjak')
  })

  it('DIBANDINGKAN DENGAN DIRINYA SENDIRI, bukan dengan alat lain', () => {
    /*
      Truk mixer yang selalu 30 L/jam BUKAN temuan; excavator yang biasanya
      18 lalu jadi 30 ADALAH temuan. Angkanya sama persis.

      Kalau pembandingnya antar-alat, tuduhannya selalu menunjuk alat terbesar
      — benar secara aritmetika, tak berguna sama sekali.
    */
    const selaluBoros = nilaiKonsumsiBbm(
      [I(300)], 10,
      [I(1500)], 50,     // riwayatnya juga 30 L/jam
      1, 30,
    )
    expect(selaluBoros.literPerJam).toBe(30)
    expect(selaluBoros.acuanPerJam).toBe(30)
    expect(selaluBoros.boros).toBe(false)
    expect(selaluBoros.sebab).toBe('wajar')
  })

  it('JAM NOL mematikan perhitungan, BUKAN menghasilkan Infinity', () => {
    /*
      Cacat yang paling mahal kalau lolos.

      `liter / 0` menghasilkan Infinity, dan `Infinity >= ambang` bernilai
      true — jadi SETIAP alat yang jam-meternya tak tercatat dilaporkan boros.
      Alat baru dan alat yang operatornya lalai mencatat masuk kategori itu,
      dan justru merekalah yang paling banyak.
    */
    for (const jam of [0, null, Number.NaN, -5]) {
      const h = nilaiKonsumsiBbm([I(100), I(100)], jam as number, [I(500)], 50, 2, 30)
      expect(h.literPerJam).toBeNull()
      expect(h.boros).toBe(false)
      expect(h.sebab).toBe('jam_tak_terukur')
    }
  })

  it('TANPA RIWAYAT tidak ada tuduhan — alat baru diam sampai punya acuan', () => {
    /*
      Godaannya membandingkan dengan angka baku industri (15-25 L/jam untuk
      excavator 20 ton). Ditolak: angka baku tak tahu alat ini bekerja di tanah
      keras atau lunak, dengan operator berpengalaman atau tidak.

      Tuduhan dari pembanding yang tak cocok membuat orang berhenti mempercayai
      seluruh peringatan BBM.
    */
    const h = nilaiKonsumsiBbm([I(400), I(400)], 10, [], null, 2, 30)
    expect(h.literPerJam).toBe(80)      // angkanya dihitung
    expect(h.acuanPerJam).toBeNull()    // tapi tak ada pembandingnya
    expect(h.boros).toBe(false)
    expect(h.sebab).toBe('kurang_data')
  })

  it('pengisian terlalu sedikit tidak disimpulkan', () => {
    // Satu pengisian bisa berarti tangki diisi penuh sesudah lama kosong —
    // bukan konsumsi periode itu.
    const h = nilaiKonsumsiBbm([I(300)], 10, [I(900)], 50, 3, 30)
    expect(h.boros).toBe(false)
    expect(h.sebab).toBe('kurang_data')
  })

  it('liter nol atau negatif dibuang, bukan dijumlahkan', () => {
    // Baris ber-kuantitas 0 (pengisian yang batal dicatat) akan menurunkan
    // rata-rata dan menyembunyikan lonjakan yang nyata.
    const h = nilaiKonsumsiBbm(
      [I(150), I(0), I(150), I(-20)], 10,
      [I(450), I(450)], 50, 2, 30,
    )
    expect(h.pengisian).toBe(2)
    expect(h.totalLiter).toBe(300)
    expect(h.boros).toBe(true)
  })

  it('turun di bawah acuan jelas tidak dilaporkan', () => {
    const h = nilaiKonsumsiBbm([I(100)], 10, [I(900)], 50, 1, 30)
    expect(h.naikPersen).toBeLessThan(0)
    expect(h.boros).toBe(false)
  })
})
