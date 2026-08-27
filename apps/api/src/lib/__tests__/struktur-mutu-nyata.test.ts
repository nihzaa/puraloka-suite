/**
 * MUTU NYATA vs MUTU DESAIN.
 *
 * Angka konversinya diuji terhadap nilai yang bisa diperiksa tangan, bukan
 * terhadap keluaran fungsinya sendiri. Test yang membandingkan fungsi dengan
 * dirinya sendiri akan tetap hijau walau faktornya salah — dan faktor yang
 * salah di sini membuat beton dianggap ~20% lebih kuat dari kenyataannya.
 */
import { describe, it, expect } from 'vitest'
import {
  dampakMutu, fcDesainDari, kubusKeSilinderMpa, labelK, mutuBetonTerukur,
  silinderKeKubusKgCm2, tampilMutuBeton, umurDariJenis,
} from '../struktur-mutu-nyata.js'

describe('kubusKeSilinderMpa — K (kg/cm², kubus) → f\'c (MPa, silinder)', () => {
  it('K-250 BUKAN 25 MPa', () => {
    /*
      Kesalahan yang sangat sering terjadi karena angkanya "kebetulan mirip".
      Menyamakannya membuat beton dianggap ~20% lebih kuat dari kenyataannya —
      dan arah kesalahannya BERBAHAYA.
    */
    const fc = kubusKeSilinderMpa(250)
    expect(fc).toBeGreaterThan(19)
    expect(fc).toBeLessThan(21)
    expect(Math.abs(fc - 25)).toBeGreaterThan(4)
  })

  it('cocok dengan hitungan tangan: 250 / 10,197 × 0,83', () => {
    expect(kubusKeSilinderMpa(250)).toBeCloseTo((250 / 10.197) * 0.83, 6)
  })

  it('K-300 ≈ 24,4 MPa', () => {
    expect(kubusKeSilinderMpa(300)).toBeCloseTo(24.42, 1)
  })

  it('naik monoton — beton lebih kuat tak boleh memulangkan angka lebih kecil', () => {
    expect(kubusKeSilinderMpa(300)).toBeGreaterThan(kubusKeSilinderMpa(250))
  })
})

describe('labelK & tampilMutuBeton — bahasa lapangan di samping bahasa SNI', () => {
  it('kelas baku SNI memakai padanan pemesanan, TANPA tanda ~', () => {
    /*
      Versi pertama fungsi ini hanya membagi balik lalu mencari kelas
      terdekat. Pada nilai yang PALING SERING dipakai aplikasi ini
      (fc 30 muncul 8x di CONTOH UI, fc 25 muncul 6x) hasilnya:

          fc 30 -> ~K-369       fc 35 -> ~K-430

      Aritmetiknya benar, tapi angka itu tak bisa dipesan ke batching plant
      mana pun — dan angka yang tak bisa dipesan lebih buruk daripada tak
      ada angka: ia terlihat seperti spesifikasi.
    */
    expect(labelK(20)).toBe('K-250')
    expect(labelK(25)).toBe('K-300')
    expect(labelK(30)).toBe('K-350')
    expect(labelK(35)).toBe('K-400')
  })

  it('nilai di LUAR kelas baku ditandai ~', () => {
    /*
      Tanda ~ memberi tahu pembacanya bahwa angka itu TURUNAN, bukan kelas
      yang tertulis di dokumen pesanan. Menghilangkannya membuat hasil uji
      laboratorium terbaca seperti spesifikasi pemesanan.
    */
    expect(labelK(18.8)).toMatch(/^~K-/)
    expect(labelK(9.77)).toMatch(/^~K-/)
  })

  it('MPa tetap di DEPAN, K di dalam kurung', () => {
    /*
      f'c MPa adalah angka yang BENAR-BENAR masuk rumus (SNI 2847) dan yang
      tertulis di lembar bertanda tangan. Menaruh K di depan membuat orang
      mengira K yang masuk rumus, lalu mengetik 300 ke medan f'c — beton
      dianggap hampir 15x lebih kuat.
    */
    expect(tampilMutuBeton(25)).toBe('25 MPa (K-300)')
    expect(tampilMutuBeton(25).indexOf('MPa')).toBeLessThan(tampilMutuBeton(25).indexOf('K-'))
  })

  it('bolak-balik konsisten: K -> MPa -> K', () => {
    /*
      Dua fungsi konversi yang menyimpang membuat angka K di layar tak lagi
      cocok dengan f'c yang dipakai menghitung. Keduanya memakai konstanta
      yang sama, dan test ini yang menahannya tetap begitu.
    */
    for (const k of [250, 300, 350]) {
      const mpa = kubusKeSilinderMpa(k)
      expect(silinderKeKubusKgCm2(mpa)).toBeCloseTo(k, 6)
    }
  })

  it('nilai tak masuk akal TIDAK dipaksa jadi label', () => {
    expect(labelK(0)).toBeNull()
    expect(labelK(-5)).toBeNull()
    expect(labelK(Number.NaN)).toBeNull()
  })

  it('tampilMutuBeton tak pernah memulangkan "null" sebagai teks', () => {
    /*
      Layar yang menampilkan "0 MPa (null)" lebih buruk daripada menampilkan
      angkanya saja — ia terbaca seperti cacat data, padahal cuma cacat
      penampilan.
    */
    expect(tampilMutuBeton(0)).not.toContain('null')
    expect(tampilMutuBeton(Number.NaN)).not.toContain('null')
  })
})
describe('umurDariJenis', () => {
  it('membaca umur dari teks bebas', () => {
    expect(umurDariJenis('Kuat tekan 28 hari')).toBe(28)
    expect(umurDariJenis('Kuat tekan 7 hari')).toBe(7)
  })

  it('null bila tak tersebut', () => {
    expect(umurDariJenis('Kuat tekan')).toBeNull()
    expect(umurDariJenis(null)).toBeNull()
  })
})

describe('mutuBetonTerukur — menyaring dari teks bebas', () => {
  const BARIS = [
    {
      id: '1', objek: 'Beton K-250 zona A', jenis_uji: 'Kuat tekan 28 hari',
      nilai_hasil: 231, nilai_syarat: 250, satuan: 'kg/cm2',
      tanggal_uji: '2026-08-01', kesimpulan: 'tidak_memenuhi',
    },
    {
      id: '2', objek: 'Besi beton D13 SNI', jenis_uji: 'Kuat tarik',
      nilai_hasil: 4250, nilai_syarat: 4000, satuan: 'kg/cm2',
      tanggal_uji: '2026-08-02', kesimpulan: null,
    },
    {
      id: '3', objek: 'Pasir pasang', jenis_uji: 'Kadar lumpur',
      nilai_hasil: 4.2, nilai_syarat: 5, satuan: '%',
      tanggal_uji: '2026-08-03', kesimpulan: 'memenuhi',
    },
  ]

  it('KUAT TARIK baja tidak ikut terbaca sebagai mutu beton', () => {
    /*
      Ini yang paling berbahaya kalau salah. 4250 kg/cm² sebagai "mutu beton"
      berarti f'c ≈ 346 MPa — beton super yang membuat SELURUH elemen terlihat
      sangat aman. Kegagalan yang arahnya persis ke arah yang salah.
    */
    const hasil = mutuBetonTerukur(BARIS as never)
    expect(hasil.map((h) => h.id)).not.toContain('2')
  })

  it('uji non-kekuatan (kadar lumpur) tidak ikut', () => {
    expect(mutuBetonTerukur(BARIS as never).map((h) => h.id)).not.toContain('3')
  })

  it('mengambil uji tekan beton dan mengonversinya', () => {
    const [h] = mutuBetonTerukur(BARIS as never)
    expect(h.id).toBe('1')
    expect(h.fcNyataMpa).toBeCloseTo(kubusKeSilinderMpa(231), 2)
    /* Nilai & satuan ASLI ikut — supaya bisa ditelusuri ke sertifikatnya. */
    expect(h.nilaiAsli).toBe(231)
    expect(h.satuanAsli).toBe('kg/cm2')
  })

  it('MPa TIDAK dikonversi lagi', () => {
    /*
      SNI 2847 memakai f'c silinder, jadi angka ber-MPa sudah silinder.
      Mengalikan 0,83 lagi membuat betonnya terlihat 17% lebih lemah dari
      kenyataannya — memicu penguatan yang tak perlu.
    */
    const [h] = mutuBetonTerukur([{
      id: 'x', objek: 'beton', jenis_uji: 'Kuat tekan 28 hari',
      nilai_hasil: 25, nilai_syarat: 25, satuan: 'MPa',
      tanggal_uji: null, kesimpulan: null,
    }] as never)
    expect(h.fcNyataMpa).toBe(25)
  })

  it('satuan yang tak dikenal DIBUANG, bukan ditebak', () => {
    /*
      Menebak satuan berarti membandingkan desain terhadap angka yang artinya
      tak diketahui siapa pun.
    */
    const hasil = mutuBetonTerukur([{
      id: 'y', objek: 'beton', jenis_uji: 'Kuat tekan 28 hari',
      nilai_hasil: 250, nilai_syarat: 250, satuan: 'psi',
      tanggal_uji: null, kesimpulan: null,
    }] as never)
    expect(hasil).toHaveLength(0)
  })

  it('menandai hasil 7 hari sebagai BELUM final', () => {
    const [h] = mutuBetonTerukur([{
      id: 'z', objek: 'beton', jenis_uji: 'Kuat tekan 7 hari',
      nilai_hasil: 195, nilai_syarat: 210, satuan: 'kg/cm2',
      tanggal_uji: null, kesimpulan: 'perlu_uji_ulang',
    }] as never)
    expect(h.umurHari).toBe(7)
    expect(h.final).toBe(false)
  })

  it('tanpa umur tersebut, DIANGGAP final (arah konservatif)', () => {
    /*
      Menganggap hasil final sebagai "belum final" menyembunyikan temuan yang
      mengikat — dan mutu jeblok yang disembunyikan jauh lebih berbahaya
      daripada peringatan yang ternyata prematur.
    */
    const [h] = mutuBetonTerukur([{
      id: 'w', objek: 'beton', jenis_uji: 'Kuat tekan silinder',
      nilai_hasil: 180, nilai_syarat: 250, satuan: 'kg/cm2',
      tanggal_uji: null, kesimpulan: null,
    }] as never)
    expect(h.final).toBe(true)
  })
})

describe('dampakMutu', () => {
  const uji = (fcKgCm2: number, umur: string) => mutuBetonTerukur([{
    id: 'a', objek: 'beton', jenis_uji: `Kuat tekan ${umur}`,
    nilai_hasil: fcKgCm2, nilai_syarat: 250, satuan: 'kg/cm2',
    tanggal_uji: null, kesimpulan: null,
  }] as never)

  it('K-250 nyata 231 terhadap desain 20 MPa: masih DI ATAS desain', () => {
    /*
      Angka nyata dari basis. 231 kg/cm² → 18,8 MPa; kalau desainnya 20 MPa
      ia di bawah. Yang diuji di sini: arahnya benar dan besarnya masuk akal.
    */
    const d = dampakMutu(uji(231, '28 hari'), 20)!
    expect(d.fcNyataMpa).toBeCloseTo(18.8, 1)
    expect(d.dibawahDesain).toBe(true)
    expect(d.selisihPersen).toBeLessThan(0)
  })

  it('beton yang lebih kuat dari desain: selisih POSITIF', () => {
    const d = dampakMutu(uji(300, '28 hari'), 20)!
    expect(d.dibawahDesain).toBe(false)
    expect(d.selisihPersen).toBeGreaterThan(0)
  })

  it('mengambil yang TERENDAH, bukan rata-rata', () => {
    /*
      Rata-rata meratakan satu silinder yang jeblok dengan empat yang baik —
      padahal yang jeblok itulah yang menentukan di titik ia diambil.
    */
    const banyak = mutuBetonTerukur([
      { id: '1', objek: 'a', jenis_uji: 'Kuat tekan 28 hari', nilai_hasil: 300, nilai_syarat: 250, satuan: 'kg/cm2', tanggal_uji: null, kesimpulan: null },
      { id: '2', objek: 'b', jenis_uji: 'Kuat tekan 28 hari', nilai_hasil: 180, nilai_syarat: 250, satuan: 'kg/cm2', tanggal_uji: null, kesimpulan: null },
      { id: '3', objek: 'c', jenis_uji: 'Kuat tekan 28 hari', nilai_hasil: 310, nilai_syarat: 250, satuan: 'kg/cm2', tanggal_uji: null, kesimpulan: null },
    ] as never)
    const d = dampakMutu(banyak, 20)!
    expect(d.fcNyataMpa).toBeCloseTo(kubusKeSilinderMpa(180), 2)
  })

  it('hasil 7 hari DIKESAMPINGKAN bila ada yang 28 hari', () => {
    /*
      Silinder 7 hari yang "jeblok" itu normal — beton baru mencapai sekitar
      65-70% kekuatannya. Memperlakukannya seperti hasil 28 hari memicu
      pembongkaran yang tak perlu.
    */
    const campur = mutuBetonTerukur([
      { id: '1', objek: 'a', jenis_uji: 'Kuat tekan 7 hari', nilai_hasil: 150, nilai_syarat: 250, satuan: 'kg/cm2', tanggal_uji: null, kesimpulan: null },
      { id: '2', objek: 'b', jenis_uji: 'Kuat tekan 28 hari', nilai_hasil: 260, nilai_syarat: 250, satuan: 'kg/cm2', tanggal_uji: null, kesimpulan: null },
    ] as never)
    const d = dampakMutu(campur, 20)!
    expect(d.fcNyataMpa).toBeCloseTo(kubusKeSilinderMpa(260), 2)
    expect(d.final).toBe(true)
  })

  it('kalau HANYA ada hasil 7 hari, ia tetap dipakai tapi ditandai belum final', () => {
    /*
      Membuangnya berarti menjawab "belum ada data" pada proyek yang datanya
      ADA — dan yang membaca menyimpulkan mutunya belum pernah diuji.
    */
    const d = dampakMutu(uji(150, '7 hari'), 20)!
    expect(d.final).toBe(false)
    expect(d.dibawahDesain).toBe(true)
  })

  it('null bila tak ada data uji sama sekali', () => {
    expect(dampakMutu([], 20)).toBeNull()
  })
})

describe('fcDesainDari', () => {
  it('membaca mutu.fcMpa bersarang', () => {
    expect(fcDesainDari({ mutu: { fcMpa: 25 } })).toBe(25)
  })

  it('membaca fcMpa di puncak', () => {
    expect(fcDesainDari({ fcMpa: 30 })).toBe(30)
  })

  it('null bila tak ada — BUKAN 0', () => {
    /*
      Memulangkan 0 membuat pembaginya nol dan selisihnya Infinity. Layar yang
      menampilkan "Infinity%" sudah pernah terjadi di modul ini.
    */
    expect(fcDesainDari({})).toBeNull()
    expect(fcDesainDari(null)).toBeNull()
  })
})
