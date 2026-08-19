import { describe, it, expect } from 'vitest'
import {
  analisaSambunganBaut, analisaSambunganLas,
  kapasitasGeserBaut, kapasitasTumpuBaut, ukuranLasMinimumMm,
  MUTU_BAUT, PHI_SAMBUNGAN,
} from '../struktur-baja-sambungan'
import { analisaKolomBaja, kapasitasTekan, type ProfilBaja, type MutuBaja } from '../struktur-baja'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SAMBUNGAN — titik gagal PALING SERING pada struktur baja
 *
 * Batang dihitung insinyur dan dibuat pabrik dengan mutu terjamin; sambungan
 * dikerjakan di lapangan, sering oleh tukang las tanpa sertifikasi, dan hampir
 * tak pernah diperiksa ulang.
 *
 * Pembandingnya perhitungan tangan yang ditulis penuh di tiap test — sama
 * seperti modul baja, karena workbook sumber tak punya modul baja sama sekali.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const BJ37: MutuBaja = { fyMpa: 240, fuMpa: 370 }
const WF200: ProfilBaja = {
  designation: '200x100x5.5x8', profile_type: 'WF',
  hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
  beratKgPerM: 21.3333, panjangStandarM: 12,
}

describe('kapasitas baut — diadu ke hitungan tangan', () => {
  it('geser M16 A325, ulir di bidang geser, irisan tunggal', () => {
    /*
      Ab = π/4 × 16² = 201,06 mm²
      Fnv = 0,45 × 825 = 371,25 MPa
      Rn = 371,25 × 201,06 × 1 = 74.644 N = 74,64 kN
    */
    const r = kapasitasGeserBaut(16, MUTU_BAUT['A325'], true, 1)
    expect(r).toBeCloseTo(74.64, 1)
  })

  it('ulir DI LUAR bidang geser menambah kapasitas ~24%', () => {
    /*
      0,56/0,45 = 1,244 — dan yang menentukan cuma panjang baut yang dipesan.
      Baut terlalu pendek membuat ulirnya jatuh tepat di bidang geser, dan
      kapasitas turun seperempat tanpa ada yang terlihat berbeda dari luar.
    */
    const dgnUlir = kapasitasGeserBaut(16, MUTU_BAUT['A325'], true, 1)
    const tanpaUlir = kapasitasGeserBaut(16, MUTU_BAUT['A325'], false, 1)
    expect(tanpaUlir / dgnUlir).toBeCloseTo(0.56 / 0.45, 6)
  })

  it('irisan GANDA memberi kapasitas dua kali lipat', () => {
    const satu = kapasitasGeserBaut(16, MUTU_BAUT['A325'], true, 1)
    const dua = kapasitasGeserBaut(16, MUTU_BAUT['A325'], true, 2)
    expect(dua).toBeCloseTo(satu * 2, 9)
  })

  it('tumpu = 2,4·d·t·Fu', () => {
    // 2,4 × 16 × 8 × 370 = 113.664 N = 113,66 kN
    expect(kapasitasTumpuBaut(16, 8, 370)).toBeCloseTo(113.66, 1)
  })
})

describe('analisaSambunganBaut — dua mekanisme, dua TINDAKAN berbeda', () => {
  const dasar = {
    diameterMm: 16, mutu: MUTU_BAUT['A325'], jumlah: 4,
    bidangGeser: 1 as const, tebalPelatMm: 8, mutuPelat: BJ37, vuKn: 150,
  }

  it('sambungan memadai → aman', () => {
    const h = analisaSambunganBaut(dasar)
    expect(h.aman).toBe(true)
    expect(h.periksa).toHaveLength(2)
  })

  it('geser dan tumpu DIPERIKSA TERPISAH, bukan diambil yang terkecil', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Keduanya menuntut TINDAKAN BERBEDA:

        geser baut kurang → baut lebih besar atau lebih banyak
        tumpu kurang      → tebalkan PELAT-nya; baut lebih kuat TAK menolong

      Menggabungkannya jadi satu verdict "sambungan tidak kuat" membuat orang
      menebak tindakannya — dan tebakan yang paling sering diambil (baut lebih
      besar) justru yang salah untuk kegagalan tumpu.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaSambunganBaut(dasar)
    expect(h.periksa.map((p) => p.nama)).toEqual(['Geser baut', 'Tumpu pelat'])
  })

  it('pelat TIPIS → tumpu yang menentukan, dan itu DIKATAKAN', () => {
    const h = analisaSambunganBaut({ ...dasar, tebalPelatMm: 4, vuKn: 200 })
    const tumpu = h.periksa.find((p) => p.nama === 'Tumpu pelat')!
    const geser = h.periksa.find((p) => p.nama === 'Geser baut')!
    expect(tumpu.nilai).toBeLessThan(geser.nilai)
    expect(h.catatan.join(' ')).toMatch(/TUMPU PELAT yang menentukan/)
    expect(h.catatan.join(' ')).toMatch(/baut mutu lebih tinggi TIDAK menolong/i)
  })

  it('baut mutu lebih tinggi TIDAK menaikkan kapasitas tumpu', () => {
    /*
      Bukti angka untuk klaim di catatan: tumpu bergantung pada pelat, bukan
      baut. Kalau ini tak dijaga, seseorang bisa "memperbaiki" rumus tumpu
      dengan menyertakan mutu baut dan cacatnya tak terlihat.
    */
    const a325 = analisaSambunganBaut({ ...dasar, tebalPelatMm: 4 })
    const a490 = analisaSambunganBaut({
      ...dasar, tebalPelatMm: 4, mutu: MUTU_BAUT['A490'],
    })
    const t1 = a325.periksa.find((p) => p.nama === 'Tumpu pelat')!.nilai
    const t2 = a490.periksa.find((p) => p.nama === 'Tumpu pelat')!.nilai
    expect(t2).toBeCloseTo(t1, 9)
  })

  it('asumsi ulir DINYATAKAN — bukan diam-diam dipakai', () => {
    const h = analisaSambunganBaut(dasar)
    expect(h.catatan.join(' ')).toMatch(/Ulir dianggap BERADA di bidang geser/)
    expect(h.catatan.join(' ')).toMatch(/asumsi aman/)
  })

  it('tata letak baut dinyatakan TIDAK diperiksa', () => {
    /*
      Baut yang terlalu dekat tepi akan menyobek pelat keluar meski kapasitas
      geser dan tumpunya cukup — kegagalan yang tak muncul di hitungan mana
      pun di berkas ini.
    */
    const h = analisaSambunganBaut(dasar)
    expect(h.catatan.join(' ')).toMatch(/TATA LETAK baut TIDAK diperiksa/)
    expect(h.catatan.join(' ')).toMatch(/sobek blok|block shear/i)
  })

  it('menolak jumlah baut pecahan atau nol', () => {
    expect(() => analisaSambunganBaut({ ...dasar, jumlah: 0 })).toThrow(/minimal 1/)
    expect(() => analisaSambunganBaut({ ...dasar, jumlah: 2.5 })).toThrow(/bulat/)
  })

  it('phi sambungan 0,75 — lebih ketat daripada batang', () => {
    // Sambungan gagal lebih tiba-tiba dan lebih sulit diperiksa daripada
    // batang, jadi faktor keamanannya lebih besar.
    expect(PHI_SAMBUNGAN).toBe(0.75)
  })
})

describe('analisaSambunganLas', () => {
  const dasar = {
    ukuranMm: 6, panjangMm: 200, fuElektrodaMpa: 490,
    mutuPelat: BJ37, tebalPelatMm: 10, vuKn: 100,
  }

  it('tebal efektif = 0,707 × ukuran kaki', () => {
    /*
      Las sudut berpenampang segitiga; yang menahan adalah tinggi tegak lurus
      dari sudut ke sisi miringnya. Memakai ukuran kaki langsung membuat
      kapasitas terhitung 41% lebih besar dari kenyataan.

      a=6 → te = 4,242 mm · L=200 → Ae = 848,5 mm²
      phiRn = 0,75 × 0,6 × 490 × 848,5 = 187.107 N = 187,1 kN
    */
    const h = analisaSambunganLas(dasar)
    expect(h.antara.tebalEfektifMm).toBeCloseTo(4.242, 3)
    expect(h.periksa[0].nilai).toBeCloseTo(187.1, 0)
  })

  it('LOGAM INDUK ikut diperiksa — las kuat pada pelat lemah tak menolong', () => {
    /*
      Kegagalan ini sering mengejutkan: lasnya utuh sempurna, pelatnya yang
      sobek memanjang mengikuti garis las.
    */
    const h = analisaSambunganLas(dasar)
    expect(h.periksa.map((p) => p.nama)).toContain('Logam induk di sisi las')
  })

  it('ukuran las MINIMUM diperiksa — batas teknologi, bukan tegangan', () => {
    /*
      Las terlalu kecil pada pelat tebal mendingin terlalu cepat (panasnya
      terserap habis ke pelat), lalu menjadi getas dan retak. Batas ini tetap
      berlaku meski hitungan kekuatannya sudah lebih dari cukup — dan itulah
      yang membuatnya mudah dilanggar.
    */
    const h = analisaSambunganLas({ ...dasar, ukuranMm: 3, tebalPelatMm: 20, vuKn: 10 })
    const min = h.periksa.find((p) => p.nama === 'Ukuran las minimum')!
    expect(min.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/BUKAN soal kekuatan/)
    expect(h.catatan.join(' ')).toMatch(/getas/)
  })

  it('ukuran minimum naik bersama tebal pelat', () => {
    expect(ukuranLasMinimumMm(5)).toBe(3)
    expect(ukuranLasMinimumMm(10)).toBe(5)
    expect(ukuranLasMinimumMm(16)).toBe(6)
    expect(ukuranLasMinimumMm(25)).toBe(8)
  })

  it('mutu pengerjaan dinyatakan tak bisa dihitung', () => {
    const h = analisaSambunganLas(dasar)
    expect(h.catatan.join(' ')).toMatch(/bergantung PENGERJAAN/)
    expect(h.catatan.join(' ')).toMatch(/bukan untuk las lapangan tanpa pemeriksaan/)
  })

  it('menolak dimensi nol', () => {
    expect(() => analisaSambunganLas({ ...dasar, ukuranMm: 0 })).toThrow(/Ukuran las/)
    expect(() => analisaSambunganLas({ ...dasar, panjangMm: 0 })).toThrow(/Panjang las/)
  })
})

describe('kolom baja — tekuk pada sumbu LEMAH', () => {
  const BJ: MutuBaja = BJ37

  it('kapasitas dihitung terhadap ry, bukan rx', () => {
    /*
      Kolom menekuk ke arah yang paling mudah, dan untuk profil I itu selalu
      sumbu lemah. Memakai rx menghasilkan kapasitas 3–4 kali lipat lebih
      besar dari kenyataan.

      Dibuktikan lewat kelangsingan: KL/ry harus jauh lebih besar dari KL/rx.
    */
    const r = kapasitasTekan(WF200, BJ, 4, 1.0)
    // ry ≈ 22,2 mm → KL/r = 4000/22,2 ≈ 180
    expect(r.kelangsingan).toBeGreaterThan(150)
    expect(r.kelangsingan).toBeLessThan(200)
  })

  it('kolom pendek → tekuk tak-elastis; kolom langsing → elastis', () => {
    /*
      Kolom pendek gagal karena BAHANNYA menyerah; kolom langsing gagal karena
      BENTUKNYA. Keduanya butuh rumus berbeda, dan menyamakannya membuat kolom
      langsing terhitung jauh lebih kuat dari kenyataan.
    */
    expect(kapasitasTekan(WF200, BJ, 1.5, 1.0).daerah).toBe('tak-elastis')
    expect(kapasitasTekan(WF200, BJ, 8, 1.0).daerah).toBe('elastis')
  })

  it('kapasitas menurun MONOTON terhadap tinggi kolom', () => {
    let sebelum = Infinity
    for (const t of [1, 2, 3, 4, 5, 6, 8, 10]) {
      const kini = kapasitasTekan(WF200, BJ, t, 1.0).pnKn
      expect(kini).toBeLessThanOrEqual(sebelum + 1e-9)
      sebelum = kini
    }
  })

  it('faktor K kecil (jepit-jepit) menaikkan kapasitas', () => {
    const sendi = kapasitasTekan(WF200, BJ, 4, 1.0).pnKn
    const jepit = kapasitasTekan(WF200, BJ, 4, 0.65).pnKn
    expect(jepit).toBeGreaterThan(sendi)
  })

  it('K bawaan 1,0 DINYATAKAN — bukan dipakai diam-diam', () => {
    /*
      K yang ditaksir terlalu kecil membuat kapasitas terhitung jauh lebih
      besar dari kenyataan, tanpa gejala sampai kolomnya menekuk. Bawaan 1,0
      dipilih karena paling AMAN, bukan karena paling sering benar.
    */
    const h = analisaKolomBaja({
      profil: WF200, mutu: BJ, tinggiM: 4, puKn: 100,
    })
    expect(h.catatan.join(' ')).toMatch(/K dianggap 1,0/)
    expect(h.catatan.join(' ')).toMatch(/tanpa gejala sampai kolomnya menekuk/)
  })

  it('KELANGSINGAN diperiksa terpisah — soal bisa-dibangun, bukan rumus', () => {
    /*
      Kolom dengan KL/r di atas 200 secara teknis masih punya kapasitas
      terhitung, tetapi ia sudah tak bisa dipasang dengan lurus: kelengkungan
      dari pengangkutan dan pemasangan saja sudah cukup membuatnya jauh lebih
      lemah dari hitungan.
    */
    const h = analisaKolomBaja({
      profil: WF200, mutu: BJ, tinggiM: 6, puKn: 10,
    })
    const langsing = h.periksa.find((p) => p.nama === 'Kelangsingan kolom')!
    expect(langsing.aman).toBe(false)
    expect(langsing.rumus).toMatch(/KEBISAAN DIBANGUN/)
    // Dan elemen keseluruhan TIDAK aman meski kapasitasnya cukup untuk 10 kN.
    expect(h.aman).toBe(false)
  })

  it('interaksi tekan+momen DIARAHKAN ke modulnya, bukan dinyatakan tak ada', () => {
    /*
      Kalimatnya sempat berbunyi "interaksi §H1 BELUM dihitung di sini" —
      benar sampai `struktur-baja-gording.ts` ada. Membiarkannya berarti
      menyuruh orang mencari sendiri sesuatu yang sudah tersedia.

      Yang dijaga: catatan tetap MEMPERINGATKAN bahwa kolom bermomen tak boleh
      dihitung sebagai tekan murni, DAN menunjukkan ke mana harus pergi.
    */
    const h = analisaKolomBaja({ profil: WF200, mutu: BJ, tinggiM: 3, puKn: 100 })
    const c = h.catatan.join(' ')
    expect(c).toMatch(/tekan MURNI/)
    expect(c).toMatch(/analisa INTERAKSI tekan\+momen/)
    expect(c).toMatch(/gagal saat keduanya bekerja bersamaan/)
  })

  it('volume kolom berbentuk sama dengan elemen lain', () => {
    const h = analisaKolomBaja({ profil: WF200, mutu: BJ, tinggiM: 4, puKn: 100, jumlah: 6 })
    expect(h.volume.betonM3).toBe(0)
    expect(Array.isArray(h.volume.besi)).toBe(true)
    // 4 m × 21,3333 × 6 = 512 kg terpasang
    expect(h.volume.beratSendiriKg).toBeCloseTo(4 * 21.3333 * 6, 3)
    // dibeli: 1 batang 12 m per kolom × 6
    expect(h.volume.besi[0].jumlahBatang).toBe(6)
  })
})
