import { describe, it, expect } from 'vitest'
import { analisaTruss } from '../rangka-truss.js'

describe('analisaTruss — lapis 5', () => {
  /*
    RANGKA SEGITIGA: dua batang miring bertemu di puncak, beban P ke bawah.
    Keseimbangan simpul puncak → gaya tiap batang = P/(2 sin θ), TEKAN.

    DIVERIFIKASI numerik 2026-09-01:
      θ=30° → 1,0000 P      θ=45° → 0,7071 P      θ=60° → 0,5774 P
  */
  it('segitiga beban puncak: gaya batang = P/(2 sin θ), TEKAN', () => {
    const P = 20, L = 4, tinggi = 4 * Math.tan(45 * Math.PI / 180) / 2
    const hasil = analisaTruss({
      simpul: [
        { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
        { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
        { nama: 'C', xM: L / 2, yM: tinggi },
      ],
      batang: [
        { nama: 'AC', dari: 0, ke: 2, aMm2: 2000 },
        { nama: 'BC', dari: 1, ke: 2, aMm2: 2000 },
        { nama: 'AB', dari: 0, ke: 1, aMm2: 2000 },
      ],
      beban: [{ simpul: 2, fyKn: -P }],
    })

    const theta = Math.atan2(tinggi, L / 2)
    const harap = P / (2 * Math.sin(theta))

    for (const nama of ['AC', 'BC']) {
      const b = hasil.batang.find((x) => x.nama === nama)!
      expect(Math.abs(b.gayaKn)).toBeCloseTo(harap, 1)
      expect(b.arah).toBe('tekan')
    }
  })

  it('batang bawah TARIK — arah dibedakan, bukan cuma besarnya', () => {
    /*
      Arah menentukan pemeriksaan yang berlaku: batang tekan dibatasi
      TEKUK, batang tarik tidak. Menukar keduanya membuat batang tekuk
      lolos pemeriksaan yang salah.
    */
    const P = 20, L = 4, tinggi = 2
    const hasil = analisaTruss({
      simpul: [
        { nama: 'A', xM: 0, yM: 0, tumpuan: 'sendi' },
        { nama: 'B', xM: L, yM: 0, tumpuan: 'rol-x' },
        { nama: 'C', xM: L / 2, yM: tinggi },
      ],
      batang: [
        { nama: 'AC', dari: 0, ke: 2, aMm2: 2000 },
        { nama: 'BC', dari: 1, ke: 2, aMm2: 2000 },
        { nama: 'AB', dari: 0, ke: 1, aMm2: 2000 },
      ],
      beban: [{ simpul: 2, fyKn: -P }],
    })
    expect(hasil.batang.find((x) => x.nama === 'AB')!.arah).toBe('tarik')
  })

  it('menolak truss labil', () => {
    expect(() => analisaTruss({
      simpul: [
        { nama: 'A', xM: 0, yM: 0 },
        { nama: 'B', xM: 4, yM: 0 },
      ],
      batang: [{ nama: 'AB', dari: 0, ke: 1, aMm2: 2000 }],
      beban: [{ simpul: 1, fyKn: -10 }],
    })).toThrow(/labil|singular|tumpuan/i)
  })
})
