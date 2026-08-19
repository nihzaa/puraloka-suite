import { describe, it, expect } from 'vitest'
import {
  analisaBasePlate, analisaAngkur, kuatTumpuBeton, tebalPelatMinimum, PHI_TUMPUAN,
} from '../struktur-baja-tumpuan'
import { MUTU_BAUT } from '../struktur-baja-sambungan'
import type { ProfilBaja, MutuBaja } from '../struktur-baja'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BASE PLATE & ANGKUR — titik pertemuan baja dengan beton
 *
 * Kolom baja tak bisa berdiri langsung di atas beton: tegangan tumpu baja jauh
 * melebihi kuat tekan beton, sehingga ujung kolom MELESAK ke dalam pondasi
 * seperti paku ditekan ke kayu.
 *
 * Modul baja sebelumnya menghitung kolomnya dan sambungan antar batang —
 * tetapi TIDAK titik pertemuannya dengan pondasi. Padahal di sanalah dua bahan
 * dengan sifat berbeda bertemu, dan pertemuan dua bahan berbeda selalu jadi
 * titik lemah.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const WF200: ProfilBaja = {
  designation: '200x100x5.5x8', profile_type: 'WF',
  hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
  beratKgPerM: 21.3333, panjangStandarM: 12,
}
const BJ37: MutuBaja = { fyMpa: 240, fuMpa: 370 }

describe('kuat tumpu beton', () => {
  it('tanpa pengekangan: Pp = 0,85 f\'c A1', () => {
    // 0,85 × 25 × (300×300) = 1.912.500 N = 1.912,5 kN
    const r = kuatTumpuBeton(300 * 300, 25)
    expect(r.ppKn).toBeCloseTo(1912.5, 1)
    expect(r.faktorPengekangan).toBe(1)
  })

  it('pondasi lebih besar menaikkan kuat tumpu — sampai 2x', () => {
    /*
      Beton yang dikelilingi beton lain memang lebih kuat menahan tumpu: massa
      di sekelilingnya menahannya mengembang ke samping. Tetapi dibatasi 2 —
      di atas itu betonnya pecah membelah sebelum sempat memanfaatkannya.
    */
    const a1 = 300 * 300
    const kecil = kuatTumpuBeton(a1, 25, a1 * 2)
    const besar = kuatTumpuBeton(a1, 25, a1 * 100)
    expect(kecil.faktorPengekangan).toBeCloseTo(Math.SQRT2, 6)
    expect(besar.faktorPengekangan).toBe(2)     // DIBATASI, bukan 10
  })

  it('luas pondasi lebih kecil dari pelat tidak menurunkan — dianggap sama', () => {
    // Pemakai bisa salah isi; hasilnya tak boleh jadi faktor < 1 yang
    // menghukum dua kali.
    const r = kuatTumpuBeton(300 * 300, 25, 100 * 100)
    expect(r.faktorPengekangan).toBe(1)
  })
})

describe('tebal pelat minimum — dan jebakan memperbesar pelat', () => {
  it('MEMPERBESAR pelat menaikkan tebal minimum, bukan menurunkan', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      INI YANG PALING SERING SALAH DITAKSIR.

      Orang memperbesar pelat supaya tegangan betonnya turun, lalu lupa bahwa
      pelat yang makin lebar makin mudah melengkung di bagian yang menjorok.
      Pelat yang melengkung tak menyebarkan beban — sehingga pemeriksaan tumpu
      beton pun batal.

      Dijaga dengan angka: pelat 400×400 butuh lebih tebal daripada 300×300
      untuk beban yang SAMA.
      ══════════════════════════════════════════════════════════════════════
    */
    const kecil = tebalPelatMinimum({
      profil: WF200, panjangPelatMm: 300, lebarPelatMm: 300,
      mutuPelat: BJ37, puKn: 500,
    })
    const besar = tebalPelatMinimum({
      profil: WF200, panjangPelatMm: 500, lebarPelatMm: 500,
      mutuPelat: BJ37, puKn: 500,
    })
    expect(besar.menjorokMm).toBeGreaterThan(kecil.menjorokMm)
    expect(besar.tMinMm).toBeGreaterThan(kecil.tMinMm)
  })

  it('menjorok diambil yang TERBESAR dari dua arah', () => {
    /*
      Pelat 400×600 di bawah kolom 200×100 menjorok berbeda tiap arah. Yang
      menentukan tebalnya adalah yang terpanjang — memakai rata-rata atau yang
      terkecil menghasilkan pelat yang melengkung di sisi panjangnya.
    */
    const r = tebalPelatMinimum({
      profil: WF200, panjangPelatMm: 600, lebarPelatMm: 400,
      mutuPelat: BJ37, puKn: 400,
    })
    const m = (600 - 0.95 * 200) / 2      // 205
    const n = (400 - 0.80 * 100) / 2      // 160
    expect(r.menjorokMm).toBeCloseTo(Math.max(m, n), 6)
    expect(r.menjorokMm).toBeCloseTo(205, 6)
  })

  it('beban lebih besar → pelat harus lebih tebal', () => {
    const a = tebalPelatMinimum({
      profil: WF200, panjangPelatMm: 400, lebarPelatMm: 400,
      mutuPelat: BJ37, puKn: 200,
    })
    const b = tebalPelatMinimum({
      profil: WF200, panjangPelatMm: 400, lebarPelatMm: 400,
      mutuPelat: BJ37, puKn: 800,
    })
    expect(b.tMinMm).toBeGreaterThan(a.tMinMm)
    // Tebal berbanding akar beban: 4x beban → 2x tebal.
    expect(b.tMinMm / a.tMinMm).toBeCloseTo(2, 1)
  })
})

describe('analisaBasePlate', () => {
  /*
    Tebal 30 mm, bukan 20.

    Percobaan pertama memakai 20 mm dan test "memadai" MERAH — modulnya benar,
    fixture saya yang tidak memadai: pelat 350x350 berbeban 500 kN menuntut
    26,2 mm. Itu justru memperlihatkan kenapa pemeriksaan tebal ini perlu:
    20 mm terasa tebal bagi orang yang menaksir, dan tetap kurang.
  */
  const dasar = {
    profil: WF200, mutuPelat: BJ37,
    panjangPelatMm: 350, lebarPelatMm: 350, tebalPelatMm: 30,
    fcBetonMpa: 25, puKn: 500,
  }

  it('base plate memadai → aman', () => {
    const h = analisaBasePlate(dasar)
    expect(h.aman).toBe(true)
    expect(h.periksa).toHaveLength(2)
  })

  it('20 mm TIDAK cukup untuk beban ini — dan itu tak terlihat dari menaksir', () => {
    // Diukur: perlu 26,2 mm. Selisih 6 mm yang tak terasa saat menaksir,
    // tetapi pelat yang melengkung membatalkan seluruh perhitungan tumpu.
    const h = analisaBasePlate({ ...dasar, tebalPelatMm: 20 })
    expect(h.periksa.find((p) => p.nama === 'Tebal pelat landas')!.aman).toBe(false)
  })

  it('pelat lebih kecil dari kolom DITOLAK, bukan dihitung', () => {
    // Kolom tak akan berdiri di atasnya — menghitungnya menghasilkan angka
    // untuk keadaan yang mustahil dibangun.
    expect(() => analisaBasePlate({ ...dasar, panjangPelatMm: 150 }))
      .toThrow(/lebih kecil dari penampang kolom/)
  })

  it('pelat terlalu tipis → merah, DAN diberi tahu bahwa memperbesar memperburuk', () => {
    const h = analisaBasePlate({ ...dasar, tebalPelatMm: 6, puKn: 800 })
    const tebal = h.periksa.find((p) => p.nama === 'Tebal pelat landas')!
    expect(tebal.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/MEMPERBESAR ukuran pelat justru MEMPERBURUK/)
    expect(h.catatan.join(' ')).toMatch(/stiffener|pengaku/)
  })

  it('beban terlalu besar → tumpu beton merah', () => {
    const h = analisaBasePlate({ ...dasar, puKn: 5000 })
    const tumpu = h.periksa.find((p) => p.nama === 'Tumpu beton di bawah pelat')!
    expect(tumpu.aman).toBe(false)
  })

  it('luas pondasi tak diisi → pengekangan dianggap NOL, dan itu DIKATAKAN', () => {
    const h = analisaBasePlate(dasar)
    expect(h.antara.faktorPengekangan).toBe(1)
    expect(h.catatan.join(' ')).toMatch(/asumsi aman/)
    expect(h.catatan.join(' ')).toMatch(/2x lipat/)
  })

  it('gaya CABUT diarahkan ke analisa angkur, tidak diabaikan', () => {
    /*
      Base plate hanya diperiksa terhadap tekan. Kemampuan menahan cabut
      ditentukan angkurnya — dan membiarkan gaya cabut lewat tanpa komentar
      membuat orang mengira sudah diperiksa.
    */
    const h = analisaBasePlate({ ...dasar, tuKn: 120 })
    expect(h.catatan.join(' ')).toMatch(/gaya CABUT 120 kN/)
    expect(h.catatan.join(' ')).toMatch(/ditentukan ANGKURNYA/)
  })

  it('GROUTING dinyatakan wajib meski tak dihitung', () => {
    /*
      Tanpa grout, beban hanya bertumpu pada beberapa titik tonjolan beton —
      bukan pada seluruh luas pelat yang dihitung. Seluruh perhitungan tumpu
      di atas batal.
    */
    const h = analisaBasePlate(dasar)
    expect(h.catatan.join(' ')).toMatch(/Grouting.*WAJIB ada/s)
  })

  it('base plate kolom JEPIT dinyatakan di luar cakupan', () => {
    const h = analisaBasePlate(dasar)
    expect(h.catatan.join(' ')).toMatch(/kolom JEPIT pada rangka portal/)
    expect(h.catatan.join(' ')).toMatch(/belum ada di sini/)
  })
})

describe('analisaAngkur — baja vs JEBOL BETON', () => {
  const dasar = {
    diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlah: 4,
    kedalamanMm: 300, fcBetonMpa: 25, tuKn: 100, vuKn: 60,
  }

  it('memeriksa tarik baja, jebol beton, DAN geser', () => {
    const h = analisaAngkur(dasar)
    expect(h.periksa.map((p) => p.nama)).toEqual([
      'Tarik baja angkur', 'Jebol beton (cabut angkur)', 'Geser baja angkur',
    ])
  })

  it('kedalaman berpangkat 1,5 — sangat peka', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Menanam 1,5x lebih dalam memberi 1,84x kapasitas.

      Sebaliknya, angkur yang dipasang lebih DANGKAL dari rencana — hal yang
      lazim terjadi karena tulangan pondasi menghalangi — kehilangan kapasitas
      jauh lebih cepat daripada yang diduga orang di lapangan.
      ══════════════════════════════════════════════════════════════════════
    */
    const dangkal = analisaAngkur({ ...dasar, kedalamanMm: 200 })
    const dalam = analisaAngkur({ ...dasar, kedalamanMm: 300 })
    const rasio = (dalam.antara.ncbSatuKn as number) / (dangkal.antara.ncbSatuKn as number)
    expect(rasio).toBeCloseTo(Math.pow(1.5, 1.5), 2)
  })

  it('angkur DANGKAL → jebol beton yang menentukan, dan itu DIKATAKAN', () => {
    /*
      Memakai angkur bermutu lebih tinggi TIDAK menolong sama sekali untuk
      kegagalan ini — yang menolong cuma menanam lebih dalam, dan itu
      keputusan yang harus diambil SEBELUM beton dicor.
    */
    const h = analisaAngkur({ ...dasar, kedalamanMm: 100, tuKn: 200 })
    const jebol = h.periksa.find((p) => p.nama === 'Jebol beton (cabut angkur)')!
    const baja = h.periksa.find((p) => p.nama === 'Tarik baja angkur')!
    expect(jebol.nilai).toBeLessThan(baja.nilai)
    expect(h.catatan.join(' ')).toMatch(/JEBOL BETON yang menentukan/)
    expect(h.catatan.join(' ')).toMatch(/sebelum beton dicor/)
  })

  it('angkur bermutu lebih tinggi TIDAK menaikkan kapasitas jebol beton', () => {
    // Bukti angka untuk klaim di catatan: jebol beton bergantung f'c dan
    // kedalaman, bukan mutu angkurnya.
    const a325 = analisaAngkur({ ...dasar, kedalamanMm: 100 })
    const a490 = analisaAngkur({ ...dasar, kedalamanMm: 100, mutu: MUTU_BAUT['A490'] })
    expect(a490.antara.phiNcbKn).toBeCloseTo(a325.antara.phiNcbKn as number, 9)
    // Sementara kapasitas bajanya NAIK.
    expect(a490.antara.phiNsaKn as number).toBeGreaterThan(a325.antara.phiNsaKn as number)
  })

  it('pengaruh JARAK KE TEPI dinyatakan tak dihitung', () => {
    /*
      Angkur dekat tepi pondasi menjebol beton ke SAMPING (bukan ke atas) pada
      beban jauh lebih kecil — dan rumus di modul ini tak melihatnya.
    */
    const h = analisaAngkur(dasar)
    expect(h.catatan.join(' ')).toMatch(/JARAK KE TEPI.*TIDAK diperhitungkan/s)
    expect(h.catatan.join(' ')).toMatch(/ke samping/)
  })

  it('angkur cast-in vs post-installed dibedakan', () => {
    const h = analisaAngkur(dasar)
    expect(h.catatan.join(' ')).toMatch(/DICOR BERSAMA pondasi/)
    expect(h.catatan.join(' ')).toMatch(/post-installed|chemical anchor/)
  })

  it('menolak jumlah angkur pecahan', () => {
    expect(() => analisaAngkur({ ...dasar, jumlah: 2.5 })).toThrow(/bulat/)
  })
})

describe('faktor reduksi', () => {
  it('jebol beton (0,70) lebih ketat daripada baja angkur (0,75)', () => {
    /*
      Kegagalan beton lebih getas dan lebih sulit diperiksa daripada baja —
      lasnya bisa dilihat, kedalaman tanam tidak.
    */
    expect(PHI_TUMPUAN.jebolBeton).toBeLessThan(PHI_TUMPUAN.bajaAngkur)
  })

  it('tumpu beton 0,65 — paling ketat dari semuanya', () => {
    expect(PHI_TUMPUAN.tumpuBeton).toBe(0.65)
    expect(PHI_TUMPUAN.tumpuBeton).toBeLessThan(PHI_TUMPUAN.jebolBeton)
  })
})

describe('volume base plate — pelat baja nyata yang dipesan', () => {
  const dasar = {
    profil: WF200, mutuPelat: BJ37,
    panjangPelatMm: 350, lebarPelatMm: 350, tebalPelatMm: 30,
    fcBetonMpa: 25, puKn: 500,
  }

  it('base plate PUNYA volume — sempat hilang, dan itu mahal', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      `analisaBasePlate` semula tak memulangkan `volume` sama sekali.

      Ketahuannya BUKAN dari test — melainkan dari penjaga di
      `routes/v1/struktur.ts` yang membedakan "jenis yang MEMANG tak
      bervolume" (sambungan baut/las/angkur) dari "jenis yang seharusnya punya
      tetapi tak memulangkannya".

      Tanpa penjaga itu, base plate hilang diam-diam dari rekap RAP — dan satu
      gedung baja bisa punya puluhan pelat landas tebal 20-30 mm. Pelat
      350x350x30 beratnya 28,9 kg; dua puluh di antaranya 578 kg baja yang tak
      teranggarkan.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaBasePlate(dasar)
    expect(h.volume).toBeTruthy()
    expect(h.volume!.besiTotalKg).toBeGreaterThan(0)
  })

  it('berat terpasang = luas x tebal x 7850', () => {
    // 0,35 x 0,35 x 0,030 x 7850 = 28,85 kg
    const h = analisaBasePlate(dasar)
    expect(h.volume!.beratSendiriKg).toBeCloseTo(0.35 * 0.35 * 0.03 * 7850, 3)
  })

  it('dibeli per LEMBAR, dan yang dibeli lebih berat dari yang terpasang', () => {
    /*
      Pelat baja dijual per lembar 1,2 x 2,4 m. Pelat landas dipotong darinya,
      dan sisa potongan berukuran ganjil jarang terpakai untuk pelat lain.
      Menghitung per kilogram terpasang membuat RAP kekurangan — sama seperti
      lonjor besi dan batang profil.
    */
    const h = analisaBasePlate(dasar)
    expect(h.volume!.besiTotalKg).toBeGreaterThan(h.volume!.beratSendiriKg)
    expect(h.volume!.besi[0].peran).toMatch(/pelat landas/)
  })

  it('banyak pelat kecil muat dalam satu lembar', () => {
    /*
      Lembar 2,88 m2; pelat 0,1225 m2 → 23 pelat per lembar. 20 pelat landas
      cukup SATU lembar, bukan 20.
    */
    const h = analisaBasePlate({ ...dasar, jumlah: 20 })
    expect(h.volume!.besi[0].jumlahBatang).toBe(1)
  })

  it('pelat besar butuh lebih dari satu lembar', () => {
    // Pelat 900x900 = 0,81 m2 → 3 per lembar. 10 pelat butuh 4 lembar.
    const h = analisaBasePlate({
      ...dasar, panjangPelatMm: 900, lebarPelatMm: 900, tebalPelatMm: 40,
      puKn: 1500, jumlah: 10,
    })
    expect(h.volume!.besi[0].jumlahBatang).toBe(4)
  })

  it('ANGKUR tidak punya volume — dan itu benar, bukan cacat', () => {
    /*
      Angkur dianggarkan lewat AHSP 2.3.1.2 (pemasangan angkur, per kilogram),
      bukan dari geometri sambungannya. Membedakan ini dari cacat adalah
      seluruh gunanya daftar TANPA_VOLUME di rute.
    */
    const h = analisaAngkur({
      diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlah: 4,
      kedalamanMm: 300, fcBetonMpa: 25, tuKn: 100, vuKn: 60,
    })
    expect(h.volume).toBeUndefined()
  })
})
