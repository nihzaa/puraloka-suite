import { describe, it, expect } from 'vitest'
import {
  hitungBarisSektor, rekapSektor, faktorKemiringan, luasBukaan,
  SEKTOR_SAH, SATUAN_SEKTOR, FAKTOR_MAKS, KEMIRINGAN_MAKS_DERAJAT,
  type BarisSektorInput,
} from '../takeoff-sektor'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TAKE-OFF SEKTOR NON-STRUKTUR
 *
 * Angka pembanding di bawah DIHITUNG TANGAN, bukan disalin dari keluaran kode.
 * Test yang membandingkan keluaran dengan dirinya sendiri hijau selamanya —
 * termasuk saat rumusnya salah.
 * ══════════════════════════════════════════════════════════════════════════════
 */

describe('faktorKemiringan', () => {
  it('atap datar (0°) tidak menambah luas', () => {
    expect(faktorKemiringan(0)).toBe(1)
  })

  it('30° memberi 1,1547 — angka geometri, bukan pendekatan', () => {
    /* 1 / cos 30° = 1 / 0,866025 = 1,154701 */
    expect(faktorKemiringan(30)).toBeCloseTo(1.154701, 6)
  })

  it('45° memberi √2', () => {
    expect(faktorKemiringan(45)).toBeCloseTo(Math.SQRT2, 6)
  })

  it('menolak kemiringan di atas batas — 89° memberi faktor 57×', () => {
    /*
      Bukan pembatasan sewenang-wenang: pada 89° faktornya 57,3, yang mengubah
      100 m² denah jadi 5.730 m² genteng tanpa satu pun galat. Angka sebesar
      itu di kolom derajat hampir selalu salah ketik.
    */
    expect(() => faktorKemiringan(89)).toThrow(/melewati batas/)
    expect(() => faktorKemiringan(KEMIRINGAN_MAKS_DERAJAT + 0.1)).toThrow()
    expect(() => faktorKemiringan(KEMIRINGAN_MAKS_DERAJAT)).not.toThrow()
  })

  it('menolak kemiringan negatif', () => {
    expect(() => faktorKemiringan(-1)).toThrow()
  })
})

describe('luasBukaan', () => {
  it('menjumlahkan lebar × tinggi × jumlah', () => {
    /* pintu 0,9×2,1×1 = 1,89 · jendela 1,2×1,2×2 = 2,88 → 4,77 */
    expect(luasBukaan([
      { nama: 'P1', lebarM: 0.9, tinggiM: 2.1, jumlah: 1 },
      { nama: 'J1', lebarM: 1.2, tinggiM: 1.2, jumlah: 2 },
    ])).toBeCloseTo(4.77, 6)
  })

  it('daftar kosong = nol, bukan galat', () => {
    expect(luasBukaan([])).toBe(0)
  })

  it('menolak ukuran bukaan yang tak masuk akal', () => {
    expect(() => luasBukaan([{ nama: 'P1', lebarM: 0, tinggiM: 2.1, jumlah: 1 }])).toThrow(/P1/)
  })
})

describe('sektor DINDING — bukaan dikurangkan', () => {
  const dinding = (bukaan?: BarisSektorInput['bukaan']) => hitungBarisSektor({
    uraian: 'Plesteran dinding R1', sektor: 'dinding', lokasi: 'R1',
    panjangM: 4, tinggiM: 3, bukaan,
  })

  it('dinding polos = p × t', () => {
    expect(dinding().volume).toBe(12)
  })

  it('bukaan DIKURANGI — inilah yang tak dilakukan takeoff-dimensi', () => {
    /*
      4 × 3 = 12 m² kotor
      pintu 0,9 × 2,1 = 1,89
      jendela 1,2 × 1,2 = 1,44
      bersih = 12 − 3,33 = 8,67 m²

      Selisihnya 28% dari luas dinding. Di sektor yang paling banyak barisnya
      (plesteran, acian, cat), kelebihan itu langsung jadi rupiah.
    */
    const h = dinding([
      { nama: 'P1', lebarM: 0.9, tinggiM: 2.1, jumlah: 1 },
      { nama: 'J1', lebarM: 1.2, tinggiM: 1.2, jumlah: 1 },
    ])
    expect(h.volume).toBeCloseTo(8.67, 4)
    expect(h.bukaanM2).toBeCloseTo(3.33, 4)
  })

  it('rincian menyebut tiap bukaan dengan namanya', () => {
    /*
      Nama bukaan bukan hiasan: `estimate_items.quantity` masuk sebagai angka
      jadi, dan sesudah masuk, volume benar dan volume salah ketik terlihat
      identik. Rincian ini satu-satunya yang menjawab "kenapa segini?".
    */
    const h = dinding([{ nama: 'P1', lebarM: 0.9, tinggiM: 2.1, jumlah: 1 }])
    expect(h.rincian).toMatch(/P1/)
    expect(h.rincian).toMatch(/0,9×2,1/)
    expect(h.rincian).toMatch(/−|bukaan/)
  })

  it('MEMPERINGATKAN saat tak ada bukaan sama sekali', () => {
    /*
      Sah, tetapi patut dilihat: dinding tanpa pintu maupun jendela ada
      (dinding pembatas), tetapi lebih sering ini berarti bukaannya lupa
      dimasukkan — dan lupa itu menaikkan volume tanpa gejala.
    */
    expect(dinding().catatan.join(' ')).toMatch(/tidak ada bukaan/i)
    expect(dinding([{ nama: 'P1', lebarM: 0.9, tinggiM: 2.1, jumlah: 1 }]).catatan)
      .toHaveLength(0)
  })

  it('MENOLAK bukaan yang lebih besar daripada dindingnya', () => {
    /*
      Dinding tak bisa habis oleh bukaannya sendiri. Memulangkan nol atau
      angka negatif di sini menghasilkan baris RAB yang hilang diam-diam.
    */
    expect(() => dinding([{ nama: 'X', lebarM: 4, tinggiM: 3, jumlah: 1 }]))
      .toThrow(/bukaan.*>=.*dinding/i)
  })
})

describe('sektor ATAP — luas miring, bukan luas denah', () => {
  it('atap 30° seluas 100 m² denah = 115,47 m² genteng', () => {
    /*
      100 ÷ cos 30° = 115,4701. Estimator yang memakai luas denah kekurangan
      15% genteng, dan kekurangannya baru ketahuan saat pemasangan berhenti.
    */
    const h = hitungBarisSektor({
      uraian: 'Genteng', sektor: 'atap', panjangM: 10, lebarM: 10,
      kemiringanDerajat: 30,
    })
    expect(h.volume).toBeCloseTo(115.4701, 3)
    expect(h.rincian).toMatch(/cos 30/)
  })

  it('atap datar sama dengan denah, dan MEMPERINGATKAN', () => {
    const h = hitungBarisSektor({
      uraian: 'Dak beton', sektor: 'atap', panjangM: 10, lebarM: 10,
    })
    expect(h.volume).toBe(100)
    expect(h.catatan.join(' ')).toMatch(/datar/i)
  })

  it('kemiringan diterapkan SESUDAH jumlah, bukan sebelumnya', () => {
    /* 2 bidang 10×5 = 100 m² denah, ÷ cos 30° = 115,47 */
    const h = hitungBarisSektor({
      uraian: 'Genteng 2 bidang', sektor: 'atap', panjangM: 10, lebarM: 5,
      jumlah: 2, kemiringanDerajat: 30,
    })
    expect(h.volume).toBeCloseTo(115.4701, 3)
  })
})

describe('sektor KUSEN — keliling, bukan luas', () => {
  it('kusen 0,9 × 2,1 = keliling 6 m', () => {
    /* 2 × (0,9 + 2,1) = 6,0 m */
    const h = hitungBarisSektor({
      uraian: 'Kusen pintu P1', sektor: 'kusen', lebarM: 0.9, tinggiM: 2.1,
    })
    expect(h.volume).toBe(6)
    expect(h.satuan).toBe('m')
  })

  it('empat kusen sama = 24 m', () => {
    const h = hitungBarisSektor({
      uraian: 'Kusen P1', sektor: 'kusen', lebarM: 0.9, tinggiM: 2.1, jumlah: 4,
    })
    expect(h.volume).toBe(24)
  })

  it('pipa memakai panjang apa adanya bila lebar/tinggi tak diisi', () => {
    const h = hitungBarisSektor({
      uraian: 'Pipa PVC 3"', sektor: 'mep_pipa', panjangM: 18.5,
    })
    expect(h.volume).toBe(18.5)
    expect(h.satuan).toBe('m')
  })
})

describe('sektor CACAH — sanitair & titik MEP', () => {
  it('cacah dipakai apa adanya', () => {
    const h = hitungBarisSektor({
      uraian: 'Closet duduk', sektor: 'sanitair', cacah: 3, lokasi: 'KM1-3',
    })
    expect(h.volume).toBe(3)
    expect(h.satuan).toBe('unit')
    expect(h.lokasi).toBe('KM1-3')
  })

  it('titik MEP bersatuan titik', () => {
    expect(hitungBarisSektor({
      uraian: 'Titik lampu', sektor: 'mep_titik', cacah: 24,
    }).satuan).toBe('titik')
  })

  it('menolak cacah nol — bukan memulangkan nol diam-diam', () => {
    /*
      Nol yang dipulangkan tanpa galat menghilang di dalam total, dan yang
      hilang dari RAB adalah kekurangan anggaran yang tak terlihat karena
      sisanya tampak lengkap.
    */
    expect(() => hitungBarisSektor({
      uraian: 'Closet', sektor: 'sanitair', cacah: 0,
    })).toThrow(/cacah/)
  })
})

describe('sektor LUAS — plafon, lantai, daun', () => {
  it('plafon = p × l', () => {
    expect(hitungBarisSektor({
      uraian: 'Plafon gypsum', sektor: 'plafon', panjangM: 4, lebarM: 3,
    }).volume).toBe(12)
  })

  it('lantai dengan faktor potongan tepi', () => {
    /* 4 × 3 = 12 × 1,05 = 12,6 m² */
    expect(hitungBarisSektor({
      uraian: 'Keramik 60×60', sektor: 'lantai',
      panjangM: 4, lebarM: 3, faktor: 1.05,
    }).volume).toBeCloseTo(12.6, 4)
  })
})

describe('penjagaan masukan', () => {
  it('menolak sektor karangan', () => {
    expect(() => hitungBarisSektor({
      uraian: 'x', sektor: 'kolam-renang' as never, panjangM: 1, lebarM: 1,
    })).toThrow(/sektor tak dikenal/)
  })

  it('menolak faktor di atas batas', () => {
    expect(() => hitungBarisSektor({
      uraian: 'x', sektor: 'plafon', panjangM: 4, lebarM: 3,
      faktor: FAKTOR_MAKS + 0.1,
    })).toThrow(/faktor/)
  })

  it('menolak dimensi wajib yang kosong — tidak menganggapnya nol', () => {
    expect(() => hitungBarisSektor({
      uraian: 'x', sektor: 'plafon', panjangM: 4,
    })).toThrow(/lebar/)
  })

  it('setiap sektor sah punya satuan', () => {
    for (const s of SEKTOR_SAH) {
      expect(SATUAN_SEKTOR[s], `sektor ${s} tak punya satuan`).toBeTruthy()
    }
  })
})

describe('rekapSektor', () => {
  const baris = [
    hitungBarisSektor({ uraian: 'Plafon R1', sektor: 'plafon', panjangM: 4, lebarM: 3 }),
    hitungBarisSektor({ uraian: 'Plafon R2', sektor: 'plafon', panjangM: 3, lebarM: 3 }),
    hitungBarisSektor({
      uraian: 'Dinding R1', sektor: 'dinding', panjangM: 4, tinggiM: 3,
      bukaan: [{ nama: 'P1', lebarM: 0.9, tinggiM: 2.1, jumlah: 1 }],
    }),
  ]

  it('dijumlahkan PER SEKTOR, tidak dicampur', () => {
    /*
      m² plafon dan m² dinding punya AHSP yang berbeda jauh harganya.
      Menjumlahkannya menghasilkan angka yang terlihat wajar sambil tak
      berarti apa-apa.
    */
    const r = rekapSektor(baris)
    expect(r).toHaveLength(2)
    expect(r.find((x) => x.sektor === 'plafon')!.total).toBe(21)   // 12 + 9
    expect(r.find((x) => x.sektor === 'dinding')!.total).toBeCloseTo(10.11, 4)
  })

  it('total bukaan ikut direkap — supaya pengurangannya bisa diperiksa', () => {
    expect(rekapSektor(baris).find((x) => x.sektor === 'dinding')!.totalBukaanM2)
      .toBeCloseTo(1.89, 4)
  })

  it('urut mengikuti urutan pengerjaan, bukan abjad', () => {
    /* atap → plafon → dinding → lantai …; abjad akan menaruh dinding lebih dulu. */
    const r = rekapSektor(baris).map((x) => x.sektor)
    expect(r.indexOf('plafon')).toBeLessThan(r.indexOf('dinding'))
  })

  it('daftar kosong menghasilkan daftar kosong, bukan galat', () => {
    expect(rekapSektor([])).toEqual([])
  })
})
