import { describe, it, expect } from 'vitest'
import {
  analisaBalokBaja, luasPenampang, inersiaX, modulusElastis, modulusPlastis,
  radiusGirasiY, klasifikasiPenampang, kapasitasLentur, kapasitasGeser,
  lendutanMerata, ES_BAJA_STRUKTUR, PHI,
  type ProfilBaja, type MutuBaja,
} from '../struktur-baja'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BAJA PROFIL — dan kenapa pembandingnya BUKAN workbook
 *
 * Sembilan workbook "Auto Structure Pro" seluruhnya beton dan tanah; nol modul
 * baja (diukur dengan membaca daftar berkasnya, bukan ditaksir). Jadi tak ada
 * angka pembanding independen dari sana seperti pada modul beton.
 *
 * Gantinya: tiap besaran diuji terhadap PERHITUNGAN TANGAN yang ditulis penuh
 * di komentar tiap test — langkahnya bisa diperiksa ulang siapa pun dengan
 * kalkulator. Fungsinya sama dengan golden test: sumber yang independen dari
 * implementasinya.
 *
 * Profil yang dipakai WF 200x100x5,5x8 — ada di tabel `steel_profiles` basis
 * ini (berat 21,3333 kg/m), jadi angkanya bisa diadu ke data nyata.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const WF200: ProfilBaja = {
  designation: '200x100x5.5x8',
  profile_type: 'WF',
  hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
  beratKgPerM: 21.3333,
  panjangStandarM: 12,
}

const BJ37: MutuBaja = { fyMpa: 240, fuMpa: 370 }

describe('sifat penampang — diadu ke hitungan tangan', () => {
  it('luas = 2 sayap + badan', () => {
    /*
      2 × (100 × 8) = 1.600 mm²
      badan (200 − 16) × 5,5 = 184 × 5,5 = 1.012 mm²
      total 2.612 mm²
    */
    expect(luasPenampang(WF200)).toBeCloseTo(2612, 6)
  })

  it('luas hitungan cocok dengan berat per meter di tabel basis', () => {
    /*
      PEMERIKSAAN SILANG yang paling berguna di berkas ini.

      Berat per meter di tabel = 21,3333 kg/m. Kalau luas hitungan benar:
        A × ρ × 1 m = 2.612 mm² × 7.850 kg/m³ = 20,50 kg/m

      Selisih 3,9% terhadap tabel, dan arahnya MASUK AKAL: fillet (lengkungan
      sudut antara sayap dan badan) diabaikan rumus ini, dan fillet menambah
      material. Kalau selisihnya berlawanan arah atau jauh lebih besar,
      berarti rumus luasnya salah.
    */
    const beratHitung = (luasPenampang(WF200) / 1e6) * 7850
    expect(beratHitung).toBeLessThan(WF200.beratKgPerM)
    expect(WF200.beratKgPerM / beratHitung).toBeLessThan(1.08)
  })

  it('Ix = persegi penuh − dua kekosongan sisi badan', () => {
    /*
      penuh   100 × 200³ / 12  = 66.666.667 mm⁴
      kosong  2 × 47,25 × 184³ / 12 = 2 × 47,25 × 6.229.504 / 12
              = 2 × 24.528.671 = 49.057.343 mm⁴
      Ix ≈ 17.609.324 mm⁴  ≈ 1.761 cm⁴
    */
    const ix = inersiaX(WF200)
    expect(ix).toBeCloseTo(66_666_666.67 - 49_057_344, 0)
    // Tabel baja Indonesia mencatat Ix WF200 ≈ 1.840 cm⁴; selisih dari fillet.
    expect(ix / 1e4).toBeGreaterThan(1700)
    expect(ix / 1e4).toBeLessThan(1900)
  })

  it('Zx > Sx, dan rasionya 1,10–1,20 seperti WF pada umumnya', () => {
    /*
      Zx dipakai untuk kapasitas plastis, Sx untuk elastis. Memakai Sx
      membuang 10–18% kapasitas — dan pada baja yang dijual per kilogram,
      itu langsung jadi rupiah.
    */
    const sx = modulusElastis(WF200)
    const zx = modulusPlastis(WF200)
    expect(zx).toBeGreaterThan(sx)
    expect(zx / sx).toBeGreaterThan(1.10)
    expect(zx / sx).toBeLessThan(1.20)
  })

  it('Zx cocok dengan hitungan tangan', () => {
    /*
      sayap  2 × (100 × 8) × ((200 − 8)/2) = 1.600 × 96 = 153.600 mm³
      badan  5,5 × 184² / 4 = 5,5 × 33.856 / 4 = 46.552 mm³
      Zx = 200.152 mm³
    */
    expect(modulusPlastis(WF200)).toBeCloseTo(200_152, 0)
  })

  it('ry jauh lebih kecil dari rx — itu sebabnya tekuk lateral menentukan', () => {
    const ry = radiusGirasiY(WF200)
    const rx = Math.sqrt(inersiaX(WF200) / luasPenampang(WF200))
    expect(ry).toBeLessThan(rx / 3)
    // Tabel: ry WF200 ≈ 2,24 cm. Hitungan tanpa fillet sedikit lebih kecil.
    expect(ry / 10).toBeGreaterThan(2.0)
    expect(ry / 10).toBeLessThan(2.5)
  })
})

describe('klasifikasi penampang', () => {
  it('WF pabrikan biasa → kompak di sayap dan badan', () => {
    const k = klasifikasiPenampang(WF200, BJ37.fyMpa)
    expect(k.sayap).toBe('kompak')
    expect(k.badan).toBe('kompak')
  })

  it('badan yang sangat tipis → langsing, dan itu TERDETEKSI', () => {
    /*
      Profil built-up (dilas sendiri) sering punya badan tipis untuk menghemat
      berat. Ia tak bisa mencapai kekuatan plastisnya — badannya menekuk lokal
      seperti kaleng penyok. Kalau ini lolos tanpa peringatan, kapasitas
      terhitung jauh lebih besar dari yang sebenarnya.
    */
    const tipis = { ...WF200, hMm: 600, t1Mm: 3 }
    expect(klasifikasiPenampang(tipis, BJ37.fyMpa).badan).toBe('langsing')
  })

  it('mutu lebih tinggi mempersempit batas kompak', () => {
    // Batas kompak berbanding √(E/fy): makin tinggi fy, makin ketat.
    const bj55 = klasifikasiPenampang({ ...WF200, t2Mm: 4.4 }, 410)
    const bj37 = klasifikasiPenampang({ ...WF200, t2Mm: 4.4 }, 240)
    const urut = { kompak: 0, 'tak-kompak': 1, langsing: 2 } as const
    expect(urut[bj55.sayap]).toBeGreaterThanOrEqual(urut[bj37.sayap])
  })
})

describe('kapasitas lentur — tekuk lateral mengubah segalanya', () => {
  it('sayap terpegang penuh (Lb=0) → plastis, Mn = Zx·fy', () => {
    const r = kapasitasLentur(WF200, BJ37, 0)
    expect(r.daerah).toBe('plastis')
    // Zx 200.152 mm³ × 240 MPa = 48.036.480 N·mm = 48,04 kNm
    expect(r.mnKnm).toBeCloseTo(48.04, 1)
  })

  it('Lb sedikit di atas Lp → kapasitas TURUN, bukan tetap', () => {
    const penuh = kapasitasLentur(WF200, BJ37, 0)
    const r = kapasitasLentur(WF200, BJ37, penuh.lpM * 1.5)
    expect(r.daerah).toBe('tak-elastis')
    expect(r.mnKnm).toBeLessThan(penuh.mnKnm)
  })

  it('Lb sangat besar → tekuk elastis, kapasitas turun TAJAM', () => {
    /*
      Inilah yang membedakan balok telanjang (gudang, kanopi) dari balok yang
      menyatu dengan pelat beton. Profil yang sama bisa kehilangan lebih dari
      separuh kapasitasnya — dan itu tak terlihat dari profilnya sendiri.
    */
    const penuh = kapasitasLentur(WF200, BJ37, 0)
    const jauh = kapasitasLentur(WF200, BJ37, 8)
    expect(jauh.daerah).toBe('elastis')
    expect(jauh.mnKnm).toBeLessThan(penuh.mnKnm * 0.6)
  })

  it('kapasitas TIDAK PERNAH melebihi Mp, berapa pun Lb', () => {
    // Penjaga arah sebaliknya: rumus daerah elastis bisa memulangkan nilai
    // besar untuk Lb kecil kalau batasnya lupa dipasang.
    const mp = kapasitasLentur(WF200, BJ37, 0).mnKnm
    for (const lb of [0.5, 1, 2, 3, 5, 10, 20]) {
      expect(kapasitasLentur(WF200, BJ37, lb).mnKnm).toBeLessThanOrEqual(mp + 1e-9)
    }
  })

  it('kapasitas menurun MONOTON terhadap Lb', () => {
    // Tak boleh ada lonjakan naik di batas antar daerah — itu tanda
    // interpolasinya salah sambung.
    let sebelum = Infinity
    for (const lb of [0, 1, 2, 3, 4, 5, 6, 8, 10, 15]) {
      const kini = kapasitasLentur(WF200, BJ37, lb).mnKnm
      expect(kini).toBeLessThanOrEqual(sebelum + 1e-9)
      sebelum = kini
    }
  })
})

describe('geser & lendutan', () => {
  it('geser dari BADAN saja', () => {
    // 0,6 × 240 × (200 × 5,5) = 0,6 × 240 × 1.100 = 158.400 N = 158,4 kN
    expect(kapasitasGeser(WF200, BJ37)).toBeCloseTo(158.4, 3)
  })

  it('lendutan = 5wL⁴/(384EI), diadu ke hitungan tangan', () => {
    /*
      w = 10 kN/m = 10 N/mm · L = 6.000 mm
      Ix = 17.609.323 mm⁴ · E = 200.000 MPa

      5 × 10 × 6.000⁴ = 5 × 10 × 1,296e15 = 6,48e16
      384 × 200.000 × 17.609.323 = 1,3524e15
      δ = 47,9 mm
    */
    const d = lendutanMerata(WF200, 6, 10)
    expect(d).toBeCloseTo(47.9, 0)
  })

  it('lendutan naik dengan PANGKAT EMPAT bentang — bukan linier', () => {
    /*
      Ini yang membuat orang salah menaksir: bentang dua kali lipat membuat
      lendutan 16 kali, bukan 2 kali. Balok 6 m yang aman jadi jauh dari aman
      di 12 m dengan profil yang sama.
    */
    const d6 = lendutanMerata(WF200, 6, 10)
    const d12 = lendutanMerata(WF200, 12, 10)
    expect(d12 / d6).toBeCloseTo(16, 1)
  })
})

describe('analisaBalokBaja — verdict lengkap', () => {
  const dasar = {
    profil: WF200, mutu: BJ37, bentangM: 6, jarakPengakuM: 0,
    muKnm: 30, vuKn: 60, bebanLayanKnPerM: 3,
  }

  it('balok yang memadai → aman', () => {
    const h = analisaBalokBaja(dasar)
    expect(h.aman).toBe(true)
    expect(h.periksa).toHaveLength(3)
  })

  it('LENDUTAN bisa menggagalkan balok yang tegangannya aman', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      INILAH YANG PALING SERING TERLEWAT PADA BAJA.

      Baja jauh lebih kuat per satuan berat daripada beton, sehingga profil
      yang lulus pemeriksaan tegangan bisa melendut sampai terasa saat
      dilewati. "Aman tapi bergoyang" adalah keluhan penghuni nomor satu pada
      struktur baja — dan ia TIDAK PERNAH muncul di pemeriksaan tegangan.

      Test ini menuntut lendutan diperlakukan sejajar dengan kekuatan: balok
      yang gagal lendutan tetap `aman: false`.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaBalokBaja({ ...dasar, bentangM: 9, muKnm: 20, vuKn: 30, bebanLayanKnPerM: 4 })
    const lentur = h.periksa.find((p) => p.nama === 'Lentur baja')!
    const lendut = h.periksa.find((p) => p.nama === 'Lendutan')!
    expect(lentur.aman).toBe(true)      // tegangannya masih sanggup
    expect(lendut.aman).toBe(false)     // tetapi melendut berlebihan
    expect(h.aman).toBe(false)          // dan itu MENGGAGALKAN elemennya
  })

  it('jarak pengaku besar menurunkan verdict lentur', () => {
    const terpegang = analisaBalokBaja({ ...dasar, muKnm: 40 })
    const telanjang = analisaBalokBaja({ ...dasar, muKnm: 40, jarakPengakuM: 6 })
    expect(terpegang.periksa[0].aman).toBe(true)
    expect(telanjang.periksa[0].aman).toBe(false)
  })

  it('Lb=0 MENYEBUTKAN asumsinya — bukan diam-diam menganggap terpegang', () => {
    const h = analisaBalokBaja(dasar)
    expect(h.catatan.join(' ')).toMatch(/TERPEGANG PENUH/)
    expect(h.catatan.join(' ')).toMatch(/gudang|kanopi/)
  })

  it('penampang tak kompak DILAPORKAN, kapasitasnya tak dikoreksi diam-diam', () => {
    /*
      Koreksi tekuk lokal butuh rumus terpisah per kelas. Menerapkannya
      setengah-setengah menghasilkan angka yang terlihat lengkap sambil salah.
      Yang jujur: nyatakan bahwa hasilnya berlaku untuk penampang kompak.
    */
    const h = analisaBalokBaja({ ...dasar, profil: { ...WF200, hMm: 600, t1Mm: 3 } })
    expect(h.catatan.join(' ')).toMatch(/TIDAK kompak/)
    expect(h.catatan.join(' ')).toMatch(/TERLALU BESAR/)
  })

  it('SAMBUNGAN diarahkan ke modulnya, bukan sekadar dinyatakan tak dihitung', () => {
    /*
      Kalimatnya sempat berbunyi "sambungan TIDAK dihitung" — benar sampai
      `struktur-baja-sambungan.ts` ada. Membiarkannya berarti menyuruh orang
      menghitung sendiri sesuatu yang sudah tersedia; kelas cacat yang sama
      dengan catatan basi mana pun: ia terbaca sebagai kepastian.

      Yang dijaga: catatan tetap MENYEBUT sambungan sebagai titik gagal, DAN
      menunjukkan ke mana harus pergi.
    */
    const h = analisaBalokBaja(dasar)
    const c = h.catatan.join(' ')
    expect(c).toMatch(/SAMBUNGAN/)
    expect(c).toMatch(/titik gagal paling sering/)
    expect(c).toMatch(/analisa sambungan baut\/las/)
  })

  it('pendekatan Lr dinyatakan, bukan disembunyikan', () => {
    const h = analisaBalokBaja(dasar)
    expect(h.catatan.join(' ')).toMatch(/KONSERVATIF/)
  })

  it('menolak input mustahil alih-alih memulangkan angka', () => {
    expect(() => analisaBalokBaja({ ...dasar, bentangM: 0 })).toThrow(/Bentang/)
    expect(() => analisaBalokBaja({ ...dasar, jarakPengakuM: -1 })).toThrow(/negatif/)
  })

  it('medan WAJIB yang HILANG ditolak — bukan dijawab Infinity/NaN', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Ditemukan 2026-08-19 dengan MEMOTRET LAYAR, bukan dari test.

      `undefined < 0` adalah FALSE, jadi pemeriksaan `jarakPengakuM < 0`
      tak menahan apa pun ketika medannya hilang. Balok baja tanpa
      `jarakPengakuM` dan `bebanLayanKnPerM` lolos sampai ke layar dan
      menampilkan batang kekuatan bertuliskan **Infinity%** serta lendutan
      **NaN**.

      Yang membuatnya berbahaya bukan angka anehnya, melainkan verdict di
      atasnya: "TIDAK AMAN — 2 pemeriksaan tidak terpenuhi". Itu terbaca
      sebagai kesimpulan TEKNIK, bukan sebagai keluhan tentang input.
      Pembacanya akan memperbesar profilnya, dan angkanya tetap Infinity.
      ══════════════════════════════════════════════════════════════════════
    */
    const tanpaPengaku = { ...dasar } as Partial<typeof dasar>
    delete tanpaPengaku.jarakPengakuM
    expect(() => analisaBalokBaja(tanpaPengaku as typeof dasar))
      .toThrow(/jarakPengakuM/)

    const tanpaBeban = { ...dasar } as Partial<typeof dasar>
    delete tanpaBeban.bebanLayanKnPerM
    expect(() => analisaBalokBaja(tanpaBeban as typeof dasar))
      .toThrow(/bebanLayanKnPerM/)
  })

  it('TAK ADA rasio Infinity atau NaN pada input yang sah', () => {
    /*
      Batang persen di layar dibangun dari `rasio`. Satu saja yang Infinity
      atau NaN membuat layar menampilkan angka yang tak berarti apa-apa
      kepada orang yang memakai layar ini justru karena tak paham rumusnya.
    */
    const h = analisaBalokBaja(dasar)
    for (const p of h.periksa) {
      expect(Number.isFinite(p.rasio), `${p.nama} rasio=${p.rasio}`).toBe(true)
    }
  })
})

describe('volume baja untuk RAP', () => {
  const dasar = {
    profil: WF200, mutu: BJ37, bentangM: 5, jarakPengakuM: 0,
    muKnm: 20, vuKn: 40, bebanLayanKnPerM: 2,
  }

  it('berat TERPASANG = panjang × berat per meter', () => {
    const h = analisaBalokBaja({ ...dasar, jumlah: 4 })
    // 5 m × 21,3333 kg/m × 4 = 426,67 kg
    expect(h.volume.beratSendiriKg).toBeCloseTo(5 * 21.3333 * 4, 3)
  })

  it('yang DIBELI dihitung per batang standar, bukan per meter terpasang', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Baja dijual per batang 12 m. Balok 5 m berarti satu batang dipotong, dan
      sisa 7 m-nya belum tentu terpakai.

      Melaporkan 5 m sebagai kebutuhan membuat RAP KEKURANGAN — persis kelas
      cacat yang sama dengan lonjor besi beton di `struktur-bbs.ts`, dan
      persis kelas cacat yang membuat volume balok kehilangan tulangan atas.

      Keduanya dilaporkan supaya selisihnya TERLIHAT, bukan tersembunyi.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaBalokBaja(dasar)
    // 1 batang 12 m × 21,3333 = 256 kg dibeli, untuk 5 m (106,7 kg) terpasang.
    expect(h.volume.besiTotalKg).toBeCloseTo(12 * 21.3333, 3)
    expect(h.volume.besiTotalKg).toBeGreaterThan(h.volume.beratSendiriKg)
  })

  it('balok lebih panjang dari batang standar → berbatang lebih dari satu', () => {
    const h = analisaBalokBaja({ ...dasar, bentangM: 20 })
    // 20 m butuh 2 batang 12 m.
    expect(h.volume.besi[0].jumlahBatang).toBe(2)
  })

  it('beton & bekisting NOL — dan itu jawaban, bukan data hilang', () => {
    const h = analisaBalokBaja(dasar)
    expect(h.volume.betonM3).toBe(0)
    expect(h.volume.bekistingM2).toBe(0)
  })

  it('bentuk volume SAMA dengan elemen beton — bisa direkap bersama', () => {
    /*
      Satu proyek berisi balok beton DAN balok baja. Kalau bentuk volumenya
      berbeda, `rekapVolume` crash atau melewatkannya — kelas cacat yang sudah
      terjadi sekali pada tiang pancang.
    */
    const h = analisaBalokBaja(dasar)
    expect(Array.isArray(h.volume.besi)).toBe(true)
    expect(typeof h.volume.betonM3).toBe('number')
    expect(typeof h.volume.bekistingM2).toBe('number')
    expect(typeof h.volume.besiTotalKg).toBe('number')
    expect(typeof h.volume.beratSendiriKg).toBe('number')
  })

  it('peran menyebut PROFILNYA — "besi 256 kg" tanpa jenis tak bisa dipesan', () => {
    const h = analisaBalokBaja(dasar)
    expect(h.volume.besi[0].peran).toMatch(/WF/)
    expect(h.volume.besi[0].peran).toMatch(/200x100/)
  })
})

describe('konstanta & faktor', () => {
  it('φ lentur 0,90 dan φ tekan 0,85 — tekan lebih ketat', () => {
    /*
      Kegagalan tekan (tekuk) jauh lebih sensitif terhadap ketidaksempurnaan
      awal batang: kelengkungan sisa dari pabrik dan eksentrisitas pemasangan.
    */
    expect(PHI.lentur).toBe(0.9)
    expect(PHI.tekan).toBeLessThan(PHI.lentur)
  })

  it('E baja 200.000 MPa', () => {
    expect(ES_BAJA_STRUKTUR).toBe(200_000)
  })
})
