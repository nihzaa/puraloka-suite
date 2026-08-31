// apps/api/src/lib/__tests__/rangka-matriks.test.ts
import { describe, it, expect } from 'vitest'
import { kLokal, kGlobal, selesaikan } from '../rangka-matriks.js'

describe('kLokal', () => {
  /*
    Matriks kekakuan batang portal 2D (6 DOF: u1,v1,θ1,u2,v2,θ2).
    Bentuk bakunya — diperiksa terhadap Hibbeler, Structural Analysis:

        EA/L                              -EA/L
              12EI/L³   6EI/L²                   -12EI/L³   6EI/L²
              6EI/L²    4EI/L                    -6EI/L²    2EI/L
       -EA/L                               EA/L
             -12EI/L³  -6EI/L²                    12EI/L³  -6EI/L²
              6EI/L²    2EI/L                    -6EI/L²    4EI/L

    Diuji dengan angka bulat supaya salah tempat langsung terlihat.
  */
  it('menempatkan tiap suku di posisinya, dengan SATUAN yang benar', () => {
    /*
      ⚠ Angka NYATA, bukan E=A=I=L=1. Draf pertama plan ini memakai satuan
      serba-1 dan rumus EA/L-nya meleset 1000× TANPA testnya merah — pada
      angka satu, faktor 1000 tak terlihat sama sekali.

      Balok beton 300x500, E=200.000 MPa, L=6 m:
        A  = 150.000 mm²
        EA/L = (200.000/1000) kN/mm² × 150.000 mm² / 6 m = 5.000.000 kN/m
        I  = 300·500³/12 = 3,125e9 mm⁴
        EI = 200.000 × 3,125e9 × 1e-9 = 625.000 kN·m²
      Keduanya diverifikasi lewat dua jalur perhitungan 2026-09-01.
    */
    const E = 200_000, A = 150_000, I = 300 * 500 ** 3 / 12, L = 6
    const k = kLokal(E, A, I, L)
    expect(k).toHaveLength(6)
    expect(k[0]).toHaveLength(6)

    const EA_L = 5_000_000            // kN/m
    expect(k[0]![0]!).toBeCloseTo(EA_L, 0)
    expect(k[0]![3]!).toBeCloseTo(-EA_L, 0)
    expect(k[3]![3]!).toBeCloseTo(EA_L, 0)

    const EI = 625_000                // kN·m²
    expect(k[2]![2]!).toBeCloseTo(4 * EI / L, 0)      // 4EI/L
    expect(k[1]![1]!).toBeCloseTo(12 * EI / L ** 3, 0) // 12EI/L³
  })

  it('simetris — k[i][j] === k[j][i] untuk SEMUA pasangan', () => {
    /*
      Bukan hiasan: matriks kekakuan WAJIB simetris secara fisika (hukum
      timbal balik Maxwell-Betti). Satu suku salah tempat merusak simetri,
      dan itu jauh lebih mudah ditangkap daripada memeriksa 36 nilai.
    */
    const k = kLokal(200_000, 90_000, 675e6, 6)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(k[i]![j]!).toBeCloseTo(k[j]![i]!, 9)
      }
    }
  })

  it('menolak masukan tak masuk akal', () => {
    expect(() => kLokal(0, 1, 1, 1)).toThrow(/E|modulus/i)
    expect(() => kLokal(1, 1, 1, 0)).toThrow(/panjang|L/i)
  })
})

describe('kGlobal', () => {
  it('batang mendatar: global === lokal', () => {
    // cos=1, sin=0 → tak ada rotasi.
    const lokal = kLokal(200_000, 90_000, 675e6, 6)
    const global = kGlobal(200_000, 90_000, 675e6, 6, 1, 0)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(global[i]![j]!).toBeCloseTo(lokal[i]![j]!, 9)
      }
    }
  })

  it('batang tegak: suku aksial pindah ke arah Y', () => {
    /*
      Kolom (cos=0, sin=1). Kekakuan aksial yang tadinya di DOF-0 (arah X)
      harus muncul di DOF-1 (arah Y). Kalau transformasinya salah, kolom
      jadi kaku ke arah yang salah — dan portalnya "berdiri" ke samping.
    */
    const E = 200_000, A = 90_000, I = 675e6, L = 3
    const g = kGlobal(E, A, I, L, 0, 1)
    const EA_L = (E / 1000) * A / L        // kN/m — konversi SAMA dengan kLokal
    expect(g[1]![1]!).toBeCloseTo(EA_L, 0)
    expect(g[0]![0]!).toBeLessThan(EA_L)   // arah X kini lentur, jauh lebih lunak
  })
})

describe('selesaikan', () => {
  it('menyelesaikan sistem 2×2 yang jawabannya diketahui', () => {
    // 2x + y = 5 ; x + 3y = 10  →  x = 1, y = 3
    const x = selesaikan([[2, 1], [1, 3]], [5, 10])
    expect(x[0]!).toBeCloseTo(1, 9)
    expect(x[1]!).toBeCloseTo(3, 9)
  })

  it('MENOLAK matriks singular, bukan memulangkan Infinity', () => {
    /*
      Ini pemeriksaan terpenting di berkas ini. Matriks singular berarti
      struktur bisa bergerak bebas (tumpuan kurang). Penyelesai naif
      memulangkan angka raksasa yang TERLIHAT SEPERTI HASIL — lalu angka
      itu dipakai memilih tulangan. Wajib melempar, menyebut barisnya.
    */
    expect(() => selesaikan([[1, 2], [2, 4]], [1, 2])).toThrow(/singular|labil/i)
  })

  it('tetap benar saat pivot pertama nol (butuh tukar baris)', () => {
    // 0x + 1y = 2 ; 1x + 0y = 3  →  x = 3, y = 2
    const x = selesaikan([[0, 1], [1, 0]], [2, 3])
    expect(x[0]!).toBeCloseTo(3, 9)
    expect(x[1]!).toBeCloseTo(2, 9)
  })
})
