/**
 * BEBAN AKSIAL KOLOM.
 *
 * Angka dicocokkan dengan HITUNGAN TANGAN. Kesalahan di sini tak menimbulkan
 * galat — ia menghasilkan kolom yang terlihat wajar tapi memikul beban yang
 * bukan bebannya.
 */
import { describe, it, expect } from 'vitest'
import { analisaBebanKolom, faktorReduksiBebanHidup } from '../struktur-beban-kolom.js'

/*
  Kasus acuan — bisa dihitung tangan:

    kolom 400×400, tributari 25 m², 4 lantai, tinggi lantai 3,5 m
    pelat 120 mm · finishing (keramik 0,77 + plafon 0,20) = 0,97 kN/m²
    fungsi: kantor 2,40 kN/m²

    pelat    = 0,12 × 24 × 25 × 4          = 288,0 kN
    finishing= 0,97 × 25 × 4               =  97,0 kN
    kolom    = 0,40 × 0,40 × 24 × 3,5 × 4  =  53,76 kN
                                       D   = 438,76 kN
    hidup    = 2,40 × 25 × 4               = 240,0 kN

    luas kumulatif = 25 × 4 = 100 m² ; KLL·AT = 400
    faktor = 0,25 + 4,57/√400 = 0,25 + 0,2285 = 0,4785
    L tereduksi = 240 × 0,4785 = 114,84 kN
    Pu = 1,2(438,76) + 1,6(114,84) = 526,512 + 183,744 = 710,256 kN
*/
const DASAR = {
  luasTributariM2: 25, jumlahLantai: 4, tinggiLantaiM: 3.5,
  bMm: 400, hMm: 400, tebalPelatMm: 120,
  lapisMati: ['keramik-spesi', 'plafon-gypsum'],
  fungsiRuangKunci: 'kantor',
}

describe('beban mati kolom — menumpuk dari tiap lantai', () => {
  it('pelat, finishing, dan BERAT KOLOM SENDIRI semuanya ikut', () => {
    const h = analisaBebanKolom(DASAR)
    expect(h.pMatiKn).toBeCloseTo(288 + 97 + 53.76, 1)
  })

  it('berat kolom sendiri TAK PERNAH terlupa', () => {
    /*
      Pada gedung tinggi ia bukan angka kecil: kolom 400×400 setinggi 3,5 m ×
      8 lantai = 107 kN, setara beban hidup 22 m² lantai kantor.
    */
    const h = analisaBebanKolom({
      ...DASAR, lapisMati: [], tebalPelatMm: 0,
    })
    expect(h.pMatiKn).toBeCloseTo(53.76, 2)
    expect(h.rincian.some((x) => /berat sendiri kolom/i.test(x.nama))).toBe(true)
  })

  it('rincian BERJUMLAH sama dengan D — rincian yang tak berjumlah berbohong', () => {
    const h = analisaBebanKolom(DASAR)
    const jml = h.rincian.reduce((a, x) => a + x.kn, 0)
    expect(jml).toBeCloseTo(h.pMatiKn, 6)
  })

  it('beban bertambah SEBANDING jumlah lantai', () => {
    const empat = analisaBebanKolom(DASAR)
    const delapan = analisaBebanKolom({ ...DASAR, jumlahLantai: 8 })
    expect(delapan.pMatiKn).toBeCloseTo(empat.pMatiKn * 2, 1)
  })
})

describe('reduksi beban hidup — SNI 1727:2020 §4.7.2', () => {
  it('rumusnya cocok dengan hitungan tangan', () => {
    /* KLL·AT = 4 × 100 = 400 ; 0,25 + 4,57/20 = 0,4785 */
    expect(faktorReduksiBebanHidup(100)).toBeCloseTo(0.4785, 4)
  })

  it('luas KECIL tak direduksi sama sekali', () => {
    /*
      Di bawah KLL·AT 37,2 m² SNI tak mengizinkan reduksi. Menerapkannya di
      sana membuat elemen KURANG kuat.
    */
    expect(faktorReduksiBebanHidup(5)).toBe(1)
  })

  it('tak pernah turun di bawah 0,4', () => {
    /* Batas bawah SNI untuk elemen yang memikul lebih dari satu lantai. */
    expect(faktorReduksiBebanHidup(100000)).toBeGreaterThanOrEqual(0.4)
  })

  it('TIDAK berlaku untuk tempat berkumpul (>4,79 kN/m²)', () => {
    /*
      Di sana orang memang berkerumun serentak — justru anggapan yang
      membuat reduksi sah runtuh.
    */
    const h = analisaBebanKolom({ ...DASAR, fungsiRuangKunci: 'perpustakaan-rak' })
    expect(h.faktorReduksi).toBe(1)
    expect(h.catatan.join(' ')).toMatch(/tempat berkumpul/i)
  })

  it('TIDAK berlaku untuk parkir', () => {
    const h = analisaBebanKolom({ ...DASAR, fungsiRuangKunci: 'parkir-mobil' })
    expect(h.faktorReduksi).toBe(1)
  })

  it('bisa DIMATIKAN, dan hasilnya konservatif', () => {
    const dengan = analisaBebanKolom(DASAR)
    const tanpa = analisaBebanKolom({ ...DASAR, pakaiReduksi: false })
    expect(tanpa.puKn).toBeGreaterThan(dengan.puKn)
    expect(tanpa.catatan.join(' ')).toMatch(/SENGAJA dimatikan/)
  })

  it('menyebut persentase reduksinya di catatan', () => {
    /* Reduksi 52% yang tak disebut adalah angka yang tak bisa diperiksa. */
    const h = analisaBebanKolom(DASAR)
    expect(h.catatan.join(' ')).toMatch(/DIREDUKSI \d+%/)
    expect(h.catatan.join(' ')).toMatch(/4\.7/)
  })
})

describe('Pu terfaktor', () => {
  it('cocok dengan hitungan tangan', () => {
    const h = analisaBebanKolom(DASAR)
    expect(h.pHidupKn).toBeCloseTo(240, 1)
    expect(h.pHidupTereduksiKn).toBeCloseTo(114.84, 1)
    expect(h.puKn).toBeCloseTo(710.256, 1)
  })

  it('memakai 1,2D + 1,6L, bukan 1,0D + 1,0L', () => {
    /*
      Lupa faktor menghasilkan Pu 553,6 alih-alih 710,3 — selisih 22%, dan
      hasilnya tetap "angka kN yang wajar".
    */
    const h = analisaBebanKolom(DASAR)
    expect(h.puKn).toBeCloseTo(1.2 * h.pMatiKn + 1.6 * h.pHidupTereduksiKn, 6)
  })
})

describe('penjagaan input', () => {
  it('beban mati yang HILANG ditolak, bukan dianggap nol', () => {
    const { lapisMati, ...tanpa } = DASAR
    expect(() => analisaBebanKolom(tanpa as never)).toThrow(/beban mati/i)
  })

  it('beban hidup yang HILANG ditolak', () => {
    const { fungsiRuangKunci, ...tanpa } = DASAR
    expect(() => analisaBebanKolom({ ...tanpa, lapisMati: [] } as never))
      .toThrow(/beban hidup/i)
  })

  it('jumlah lantai pecahan DITOLAK', () => {
    /* "2,5 lantai" bukan hal yang ada; menerimanya menyembunyikan salah ketik. */
    expect(() => analisaBebanKolom({ ...DASAR, jumlahLantai: 2.5 }))
      .toThrow(/bulat/i)
  })

  it('fungsi ruang karangan ditolak', () => {
    expect(() => analisaBebanKolom({ ...DASAR, fungsiRuangKunci: 'ruang-naga' }))
      .toThrow(/tak dikenal/i)
  })
})

describe('batas yang dinyatakan', () => {
  it('menyatakan momen portal BELUM dihitung', () => {
    /*
      Modul ini menghitung beban AKSIAL saja. Membiarkan pembacanya mengira
      momennya juga terhitung adalah kelalaian yang berbahaya.
    */
    expect(analisaBebanKolom(DASAR).catatan.join(' ')).toMatch(/momen kolom/i)
    expect(analisaBebanKolom(DASAR).catatan.join(' ')).toMatch(/portal|rangka/i)
  })

  it('mengingatkan kolom atas memikul lebih sedikit', () => {
    expect(analisaBebanKolom(DASAR).catatan.join(' ')).toMatch(/lantai atas/i)
  })
})
