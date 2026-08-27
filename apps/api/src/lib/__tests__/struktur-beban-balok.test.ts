/**
 * BEBAN MATI & HIDUP → MOMEN DAN GAYA LINTANG.
 *
 * Angkanya dicocokkan dengan HITUNGAN TANGAN, bukan dengan keluaran fungsinya
 * sendiri. Test yang membandingkan fungsi dengan dirinya sendiri tetap hijau
 * walau koefisiennya salah — dan koefisien yang salah di sini menghasilkan
 * balok yang lolos pemeriksaan tapi tak kuat.
 */
import { describe, it, expect } from 'vitest'
import { analisaBebanBalok } from '../struktur-beban-balok.js'

/*
  Kasus acuan yang bisa dihitung tangan:

    balok 300×500, bentang 6 m, lebar pikul 3 m, pelat 120 mm
    beban mati tambahan 1,5 kN/m2 · beban hidup 2,5 kN/m2

    berat sendiri = 0,30 × 0,50 × 24            = 3,60 kN/m
    pelat         = 0,12 × 24 × 3               = 8,64 kN/m
    tambahan      = 1,5 × 3                     = 4,50 kN/m
                                          D total = 16,74 kN/m
    hidup         = 2,5 × 3                     = 7,50 kN/m

    qu = 1,2(16,74) + 1,6(7,50) = 20,088 + 12,00 = 32,088 kN/m
    Mu = 32,088 × 6² / 8                        = 144,396 kNm
    Vu = 32,088 × 6 × 0,5                       = 96,264 kN
*/
const DASAR = {
  bentangM: 6, lebarPikulM: 3, bMm: 300, hMm: 500, tebalPelatMm: 120,
  bebanMatiTambahan: [{ nama: 'Finishing + plafon', nilai: 1.5 }],
  bebanHidupKnM2: 2.5,
}

describe('analisaBebanBalok — cocok dengan hitungan tangan', () => {
  it('beban mati menjumlahkan berat sendiri + pelat + tambahan', () => {
    const h = analisaBebanBalok(DASAR)
    expect(h.qMatiKnM).toBeCloseTo(3.6 + 8.64 + 4.5, 3)
  })

  it('beban hidup = beban luasan × lebar pikul', () => {
    expect(analisaBebanBalok(DASAR).qHidupKnM).toBeCloseTo(7.5, 3)
  })

  it('kombinasi 1,2D + 1,6L', () => {
    /*
      Faktor yang salah di sini tak menimbulkan galat apa pun — ia menghasilkan
      balok yang terlihat aman. 1,0D + 1,0L (lupa faktor) memberi qu 24,24
      alih-alih 32,088: SELISIH 32%, dan hasilnya tetap "angka beton wajar".
    */
    expect(analisaBebanBalok(DASAR).quKnM).toBeCloseTo(32.088, 3)
  })

  it('momen balok sederhana = wL²/8', () => {
    expect(analisaBebanBalok(DASAR).muKnm).toBeCloseTo(144.396, 2)
  })

  it('gaya lintang balok sederhana = wL/2', () => {
    expect(analisaBebanBalok(DASAR).vuKn).toBeCloseTo(96.264, 2)
  })
})

describe('skema tumpuan', () => {
  it('KANTILEVER delapan kali balok sederhana', () => {
    /*
      Ini kesalahan paling mahal di modul ini, dan yang paling tak terlihat:
      hasilnya tetap "angka momen yang wajar". Test ini yang menahannya.
    */
    const sederhana = analisaBebanBalok(DASAR)
    const kantilever = analisaBebanBalok({ ...DASAR, skema: 'kantilever' })
    expect(kantilever.muKnm / sederhana.muKnm).toBeCloseTo(4, 1)
  })

  it('menerus lebih kecil dari sederhana', () => {
    const sederhana = analisaBebanBalok(DASAR)
    const menerus = analisaBebanBalok({ ...DASAR, skema: 'menerus-tengah' })
    expect(menerus.muKnm).toBeLessThan(sederhana.muKnm)
    expect(menerus.pembagiMomen).toBe(11)
  })

  it('skema karangan DITOLAK, tidak diam-diam jadi sederhana', () => {
    /*
      Jatuh diam-diam ke "sederhana" berbahaya untuk kantilever: momennya
      seperempat dari yang sebenarnya.
    */
    expect(() => analisaBebanBalok({ ...DASAR, skema: 'melayang' as never }))
      .toThrow(/skema/i)
  })
})

describe('penjagaan input', () => {
  it('daftar beban mati yang HILANG ditolak, bukan dianggap nol', () => {
    /*
      Nol yang tak disengaja membuat balok terlihat lebih kuat: finishing,
      plafon, dan MEP lazimnya 1,5-2,5 kN/m² — setara sepertiga beban hidup
      hunian.
    */
    const { bebanMatiTambahan, ...tanpa } = DASAR
    expect(() => analisaBebanBalok(tanpa as never)).toThrow(/bebanMatiTambahan/)
  })

  it('daftar KOSONG diterima — itu pernyataan, bukan kelalaian', () => {
    expect(() => analisaBebanBalok({ ...DASAR, bebanMatiTambahan: [] })).not.toThrow()
  })

  it('bentang nol ditolak', () => {
    expect(() => analisaBebanBalok({ ...DASAR, bentangM: 0 })).toThrow(/bentang/i)
  })

  it('beban hidup NOL diterima (mis. atap tak terakses)', () => {
    const h = analisaBebanBalok({ ...DASAR, bebanHidupKnM2: 0 })
    expect(h.qHidupKnM).toBe(0)
    expect(h.quKnM).toBeCloseTo(1.2 * h.qMatiKnM, 3)
  })

  it('beban mati yang bukan angka ditolak dengan menyebut namanya', () => {
    expect(() => analisaBebanBalok({
      ...DASAR, bebanMatiTambahan: [{ nama: 'Keramik', nilai: 'tebal' as never }],
    })).toThrow(/Keramik/)
  })
})

describe('rincian & catatan — supaya bisa diperiksa orang lain', () => {
  it('tiap penyusun beban mati disebut satu per satu', () => {
    /*
      `qu` tunggal tak bisa diaudit siapa pun. Yang membuat angka ini bisa
      diperiksa adalah rinciannya.
    */
    const h = analisaBebanBalok(DASAR)
    expect(h.rincianMati.length).toBeGreaterThanOrEqual(3)
    expect(h.rincianMati.some((x) => /berat sendiri/i.test(x.nama))).toBe(true)
    expect(h.rincianMati.some((x) => /pelat/i.test(x.nama))).toBe(true)
    /* Dan jumlahnya harus sama dengan qMati — rincian yang tak berjumlah
       adalah rincian yang berbohong. */
    const jml = h.rincianMati.reduce((a, x) => a + x.knM, 0)
    expect(jml).toBeCloseTo(h.qMatiKnM, 6)
  })

  it('berat sendiri SELALU ikut, walau tak diminta', () => {
    const h = analisaBebanBalok({ ...DASAR, bebanMatiTambahan: [], tebalPelatMm: 0 })
    expect(h.qMatiKnM).toBeCloseTo(3.6, 3)
  })

  it('dinding dihitung sebagai beban GARIS, tak dikali lebar pikul', () => {
    /*
      Mengalikannya dengan lebar pikul akan melipatgandakan beban dinding
      sebesar lebar pikul — 3× pada kasus ini.
    */
    const tanpa = analisaBebanBalok(DASAR)
    const dengan = analisaBebanBalok({ ...DASAR, bebanDindingKnM: 5 })
    expect(dengan.qMatiKnM - tanpa.qMatiKnM).toBeCloseTo(5, 6)
  })

  it('kantilever memperingatkan tulangan tarik di ATAS', () => {
    const h = analisaBebanBalok({ ...DASAR, skema: 'kantilever' })
    expect(h.catatan.join(' ')).toMatch(/atas/i)
  })

  it('menyatakan batasnya: BUKAN pengganti pemodelan rangka', () => {
    expect(analisaBebanBalok(DASAR).catatan.join(' ')).toMatch(/rangka/i)
  })
})
