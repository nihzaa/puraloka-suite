import { describe, it, expect } from 'vitest'
import {
  analisaKudaKudaKayu, analisaBajaRingan,
  KELAS_KAYU, FAKTOR_DURASI, FAKTOR_KADAR_AIR,
  PROFIL_BAJA_RINGAN, FY_BAJA_RINGAN, LAPISAN_MIN_G_M2,
  type InputKudaKudaKayu, type InputBajaRingan,
} from '../struktur-atap-ringan'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KUDA-KUDA KAYU & RANGKA ATAP BAJA RINGAN
 *
 * Angka pembanding dihitung tangan, bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Batang tekan kuda-kuda kayu kelas II, 6/12, panjang 3 m. */
const KAYU: InputKudaKudaKayu = {
  kelas: 'II', lebarMm: 60, tinggiMm: 120, panjangM: 3,
  gayaKn: -15, momenKnm: 0.5,
  durasi: 'tetap', kadarAir: 'kering',
  lebarTumpuanMm: 80, gayaTumpuKn: 12,
}

describe('kayu — arah serat menentukan segalanya', () => {
  it('kuat tekan TEGAK LURUS serat jauh lebih kecil daripada sejajar', () => {
    /*
      Kelas II: 42,5 MPa sejajar vs 15 MPa tegak lurus — hampir 3×.
      Pada kelas IV bedanya 4,5×.
    */
    expect(KELAS_KAYU.II.fc / KELAS_KAYU.II.fcp).toBeCloseTo(2.83, 1)
    expect(KELAS_KAYU.IV.fc / KELAS_KAYU.IV.fcp).toBeCloseTo(4.5, 1)
  })

  it('memeriksa TUMPU tegak lurus serat', () => {
    /*
      Yang paling sering gagal dan paling jarang diperiksa. Yang terjadi di
      lapangan: gording menekan kuda-kuda tegak lurus seratnya, kayunya penyok,
      atapnya turun, dan tak ada yang mengira sebabnya tumpuan.

      Fc⊥ = 15 × 1,0 (kering) = 15 MPa; A = 80 × 60 = 4800 mm²
      Kapasitas = 15 × 4800 / 1000 = 72 kN
    */
    const h = analisaKudaKudaKayu(KAYU)
    const p = h.periksa.find((x) => x.nama.includes('Tumpu'))!
    expect(p.nilai).toBeCloseTo(72, 1)
    expect(p.aman).toBe(true)
  })

  it('MEMPERINGATKAN bila tumpu tak diisi sama sekali', () => {
    const h = analisaKudaKudaKayu({ ...KAYU, gayaTumpuKn: 0, lebarTumpuanMm: 0 })
    expect(h.catatan.join(' ')).toMatch(/paling sering gagal/i)
  })

  it('tumpu yang terlalu sempit GAGAL meski batangnya kuat', () => {
    /* Lebar tumpuan 20 mm → 15 × 20 × 60 / 1000 = 18 kN, sementara gaya 30 kN */
    const h = analisaKudaKudaKayu({ ...KAYU, lebarTumpuanMm: 20, gayaTumpuKn: 30 })
    expect(h.periksa.find((x) => x.nama.includes('Tumpu'))!.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('tumpu TIDAK dipengaruhi durasi beban, tetapi kadar air iya', () => {
    /*
      Fc⊥ adalah kegagalan penyok, bukan patah — creep rupture tak berlaku.
      Kadar air tetap berpengaruh karena kayu basah lebih lunak.
    */
    const tetap = analisaKudaKudaKayu(KAYU).kapasitas.fcpTerkoreksiMpa
    const angin = analisaKudaKudaKayu({ ...KAYU, durasi: 'sepuluh_menit' })
      .kapasitas.fcpTerkoreksiMpa
    expect(angin).toBeCloseTo(tetap, 4)

    const basah = analisaKudaKudaKayu({ ...KAYU, kadarAir: 'basah' })
      .kapasitas.fcpTerkoreksiMpa
    expect(basah).toBeCloseTo(tetap * 0.7, 3)
  })
})

describe('kayu — durasi beban & kadar air', () => {
  it('beban TETAP memakai faktor 0,9 — lebih kecil daripada sesaat', () => {
    /*
      Kayu yang dibebani terus-menerus patah pada beban yang sanggup
      ditahannya sesaat. Ini sifat bahan (creep rupture), bukan kehati-hatian.
    */
    expect(FAKTOR_DURASI.tetap).toBe(0.9)
    expect(FAKTOR_DURASI.sepuluh_menit).toBe(1.6)
    const tetap = analisaKudaKudaKayu(KAYU).kapasitas.fbTerkoreksiMpa
    const angin = analisaKudaKudaKayu({ ...KAYU, durasi: 'sepuluh_menit' })
      .kapasitas.fbTerkoreksiMpa
    expect(angin / tetap).toBeCloseTo(1.6 / 0.9, 3)
  })

  it('kayu BASAH 30% lebih lemah, dan diperingatkan soal susut', () => {
    expect(FAKTOR_KADAR_AIR.basah).toBe(0.7)
    const h = analisaKudaKudaKayu({ ...KAYU, kadarAir: 'basah' })
    expect(h.catatan.join(' ')).toMatch(/menyusut|longgar/i)
  })

  it('kuat lentur = fb × durasi × kadar air', () => {
    /* Kelas II fb 85 × 0,9 × 1,0 = 76,5 MPa */
    expect(analisaKudaKudaKayu(KAYU).kapasitas.fbTerkoreksiMpa).toBeCloseTo(76.5, 2)
  })
})

describe('kayu — tekan, tarik, lentur', () => {
  it('kelangsingan = L / sisi terkecil', () => {
    /* 3000 / 60 = 50 */
    expect(analisaKudaKudaKayu(KAYU).kapasitas.kelangsingan).toBe(50)
  })

  it('MENOLAK batang tekan yang terlalu langsing', () => {
    /* L/d > 50 → kayu tak bisa dipakai sebagai batang tekan */
    const h = analisaKudaKudaKayu({ ...KAYU, panjangM: 5 })
    expect(h.periksa.find((p) => p.nama.includes('Kelangsingan'))!.aman).toBe(false)
  })

  it('batang TARIK tak diperiksa kelangsingannya', () => {
    const h = analisaKudaKudaKayu({ ...KAYU, gayaKn: 15, panjangM: 5 })
    expect(h.periksa.some((p) => p.nama.includes('Kelangsingan'))).toBe(false)
    expect(h.periksa.some((p) => p.nama === 'Kapasitas tarik')).toBe(true)
  })

  it('kapasitas tekan LEBIH KECIL daripada tarik pada batang langsing', () => {
    /* Faktor stabilitas kolom menurunkannya. */
    const k = analisaKudaKudaKayu(KAYU).kapasitas
    expect(k.phiTekanKn).toBeLessThan(k.phiTarikKn)
  })

  it('lentur hanya diperiksa bila ada momen', () => {
    expect(analisaKudaKudaKayu(KAYU).periksa.some((p) => p.nama === 'Lentur')).toBe(true)
    expect(analisaKudaKudaKayu({ ...KAYU, momenKnm: 0 })
      .periksa.some((p) => p.nama === 'Lentur')).toBe(false)
  })

  it('volume kayu = b × h × L', () => {
    /* 0,06 × 0,12 × 3 = 0,0216 m³ */
    expect(analisaKudaKudaKayu(KAYU).volume.betonM3).toBeCloseTo(0.0216, 5)
  })

  it('volume berbentuk VolumeElemen KANONIK — bukan bentuk khusus', () => {
    /*
      ⚠ Test ini ada karena bentuk khusus `{ kayuM3 }` MERUNTUHKAN
      `rekap-volume` seluruh proyek dengan HTTP 500. Pembacanya mengandaikan
      medan `besi` selalu ada, dan bentuk khusus lolos cek "seharusnya punya
      volume" karena objeknya memang ada.

      Bukan satu baris yang hilang — SELURUH halaman rekap gagal begitu ada
      satu elemen kayu di proyek. Ditemukan dengan MENJALANKAN, bukan oleh
      test mana pun.
    */
    const v = analisaKudaKudaKayu(KAYU).volume
    expect(Array.isArray(v.besi)).toBe(true)
    expect(typeof v.betonM3).toBe('number')
    expect(typeof v.bekistingM2).toBe('number')
    expect(typeof v.besiTotalKg).toBe('number')
    expect(typeof v.beratSendiriKg).toBe('number')
  })

  it('MENYATAKAN bahwa volumenya KAYU, bukan beton', () => {
    /*
      Ia menempati medan yang sama supaya rekap bisa menjumlahkannya, tetapi
      AHSP dan harganya sama sekali berbeda. Tanpa catatan ini, volume kayu
      akan dijumlahkan ke volume beton saat menyusun RAB.
    */
    expect(analisaKudaKudaKayu(KAYU).catatan.join(' '))
      .toMatch(/adalah KAYU, bukan beton/i)
  })

  it('menyebut SAMBUNGAN dan rayap yang BELUM/tak bisa dihitung', () => {
    /*
      Pada kuda-kuda kayu, sambungan hampir selalu lebih lemah daripada
      batangnya — batang yang cukup tak menjamin kuda-kudanya cukup.
    */
    const c = analisaKudaKudaKayu(KAYU).catatan.join(' ')
    expect(c).toMatch(/sambungan hampir selalu lebih lemah/i)
    expect(c).toMatch(/[Rr]ayap/)
  })

  it('menolak kelas/durasi/kadar air karangan', () => {
    expect(() => analisaKudaKudaKayu({ ...KAYU, kelas: 'V' as never })).toThrow(/tak dikenal/i)
    expect(() => analisaKudaKudaKayu({ ...KAYU, durasi: 'seabad' as never })).toThrow(/tak dikenal/i)
    expect(() => analisaKudaKudaKayu({ ...KAYU, kadarAir: 'lembap' as never })).toThrow(/tak dikenal/i)
  })
})

// ── BAJA RINGAN ──────────────────────────────────────────────────────────────

const RINGAN: InputBajaRingan = {
  profil: 'C75_075', panjangM: 1.5, gayaKn: -4,
  jarakKudaKudaM: 1.2, lapisanGM2: 100, lingkungan: 'biasa',
}

describe('baja ringan — TEKUK LOKAL mengendalikan, bukan leleh', () => {
  it('luas EFEKTIF jauh lebih kecil daripada bruto', () => {
    /*
      Baja 0,75 mm dengan w/t = 100 menekuk lokal jauh sebelum lelehnya
      tercapai. Hanya ~33% penampangnya tetap efektif — menghitungnya dengan
      luas bruto melebihkan kapasitas 3×.
    */
    const k = analisaBajaRingan(RINGAN).kapasitas
    expect(k.rasioEfektif).toBeLessThan(0.5)
    expect(k.aeMm2).toBeLessThan(k.agMm2)
  })

  it('batang GAGAL dengan luas efektif meski LOLOS dengan bruto', () => {
    /*
      ⚠ Test ini ada karena mutasi "pakai luas bruto" LOLOS tanpanya.

      Fixture dasar sudah gagal pada KEDUA versi (2,98 kN vs gaya 4 kN), jadi
      menaikkan kapasitas 3× tak mengubah verdict apa pun. Yang benar-benar
      membedakan adalah gaya yang jatuh DI ANTARA: di atas kapasitas efektif,
      di bawah kapasitas bruto.

      Inilah keadaan yang berbahaya — perancang yang menghitung dengan luas
      bruto menyimpulkan batangnya cukup, dan batang itu menekuk lokal saat
      dibebani.
    */
    const h = analisaBajaRingan({ ...RINGAN, gayaKn: -6 })
    const k = h.kapasitas
    /* efektif tak cukup… */
    expect(k.phiTekanKn).toBeLessThan(6)
    /* …sementara dengan bruto akan cukup */
    const denganBruto = k.phiTekanKn / k.rasioEfektif
    expect(denganBruto).toBeGreaterThan(6)
    expect(h.periksa.find((p) => p.nama === 'Kapasitas tekan')!.aman).toBe(false)
  })

  it('profil lebih TEBAL punya rasio efektif lebih besar', () => {
    const tipis = analisaBajaRingan(RINGAN).kapasitas.rasioEfektif
    const tebal = analisaBajaRingan({ ...RINGAN, profil: 'C75_100' }).kapasitas.rasioEfektif
    expect(tebal).toBeGreaterThan(tipis)
  })

  it('TARIK memakai luas BRUTO — tekuk lokal tak berlaku', () => {
    /*
      Pelat yang ditarik tidak menekuk. Memakai luas efektif untuk tarik
      mengecilkan kapasitas tanpa alasan.
    */
    const h = analisaBajaRingan({ ...RINGAN, gayaKn: 4 })
    expect(h.periksa.find((p) => p.nama === 'Kapasitas tarik')!.rumus).toMatch(/BRUTO/)
    expect(h.kapasitas.phiTarikKn).toBeGreaterThan(h.kapasitas.phiTekanKn)
  })

  it('kelangsingan dibatasi 200', () => {
    const h = analisaBajaRingan({ ...RINGAN, panjangM: 4 })
    expect(h.periksa.find((p) => p.nama.includes('Kelangsingan'))!.syarat).toBe(200)
  })

  it('konstanta profil & mutu', () => {
    expect(FY_BAJA_RINGAN).toBe(550)
    expect(PROFIL_BAJA_RINGAN.C75_075.tebalMm).toBe(0.75)
    expect(PROFIL_BAJA_RINGAN.C100_100.tinggiMm).toBe(100)
  })
})

describe('baja ringan — lapisan antikarat menentukan UMUR', () => {
  it('lapisan diperiksa terhadap lingkungannya', () => {
    /*
      Ini menentukan UMUR, bukan kekuatan — dan karena itu tak pernah muncul
      di perhitungan struktur biasa.
    */
    expect(analisaBajaRingan(RINGAN)
      .periksa.find((p) => p.nama.includes('Lapisan'))!.aman).toBe(true)
    expect(LAPISAN_MIN_G_M2.biasa).toBe(100)
    expect(LAPISAN_MIN_G_M2.pantai).toBe(150)
  })

  it('lingkungan PANTAI menuntut lapisan lebih tebal', () => {
    /*
      Rangka yang kuat tetapi berlapis tipis habis dalam belasan tahun, dan
      menggantinya berarti membongkar seluruh penutup atapnya.
    */
    const h = analisaBajaRingan({ ...RINGAN, lingkungan: 'pantai' })
    expect(h.periksa.find((p) => p.nama.includes('Lapisan'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/membongkar seluruh penutup/i)
    expect(h.aman).toBe(false)
  })

  it('volume dilaporkan sebagai BERAT, bukan panjang', () => {
    /* Baja ringan dibeli per kg maupun per batang; berat yang menyambung ke RAB. */
    expect(analisaBajaRingan(RINGAN).volume.besiTotalKg)
      .toBeCloseTo(PROFIL_BAJA_RINGAN.C75_075.beratKgPerM * 1.5, 4)
  })

  it('masuk sebagai baris besi berperan PROFIL — bukan tulangan', () => {
    /*
      Supaya tabel "kebutuhan besi & baja profil" menampilkannya dengan benar
      (bukan sebagai "Ulir D75"), dan `struktur-ke-rab` mengenalinya sebagai
      baja-profil — AHSP-nya memang beda dari tulangan beton.
    */
    const besi = analisaBajaRingan(RINGAN).volume.besi
    expect(besi).toHaveLength(1)
    expect(besi[0].peran).toMatch(/^profil /)
    expect(besi[0].peran).toContain('C75.75')
  })

  it('volume berbentuk VolumeElemen KANONIK', () => {
    const v = analisaBajaRingan(RINGAN).volume
    expect(Array.isArray(v.besi)).toBe(true)
    expect(v.betonM3).toBe(0)
    expect(v.bekistingM2).toBe(0)
  })

  it('menyebut sekrup, bracing, dan ANGIN yang BELUM dihitung', () => {
    /*
      Rangka ringan paling rentan pada hisap angin karena beratnya sendiri
      kecil — atap baja ringan yang terangkat utuh sudah sering terjadi.
    */
    const c = analisaBajaRingan(RINGAN).catatan.join(' ')
    expect(c).toMatch(/sekrup/i)
    expect(c).toMatch(/bracing/i)
    expect(c).toMatch(/terangkat utuh/i)
  })

  it('menolak profil & lingkungan karangan', () => {
    expect(() => analisaBajaRingan({ ...RINGAN, profil: 'C999' as never }))
      .toThrow(/tak dikenal/i)
    expect(() => analisaBajaRingan({ ...RINGAN, lingkungan: 'gunung' as never }))
      .toThrow(/tak dikenal/i)
  })

  it('menolak gaya nol', () => {
    expect(() => analisaBajaRingan({ ...RINGAN, gayaKn: 0 })).toThrow()
  })
})
