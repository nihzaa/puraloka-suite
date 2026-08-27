import { describe, it, expect } from 'vitest'
import {
  analisaRangka, analisaBatangRangka, kapasitasTarik, BATAS_KELANGSINGAN,
  type BatangRangka,
} from '../struktur-baja-rangka'
import type { ProfilBaja, MutuBaja } from '../struktur-baja'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RANGKA BATANG — bentuk struktur baja yang PALING SERING dibangun
 *
 * Gudang, pabrik, kanopi, gedung olahraga. Modul ini sebelumnya tak bisa
 * menghitungnya sama sekali: yang ada baru balok, kolom, dan sambungan batang
 * tunggal.
 *
 * Yang membedakannya dari balok: batang rangka hanya menerima TARIK atau TEKAN
 * murni. Itu membuatnya jauh lebih efisien — tetapi batang tekan bisa jauh
 * lebih langsing daripada kolom, dan tekuk jadi penentu hampir selalu.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const SIKU: ProfilBaja = {
  designation: '70x70x7', profile_type: 'L',
  hMm: 70, bMm: 70, t1Mm: 7, t2Mm: 7,
  beratKgPerM: 7.38, panjangStandarM: 6,
}
const WF150: ProfilBaja = {
  designation: '150x75x5x7', profile_type: 'WF',
  hMm: 150, bMm: 75, t1Mm: 5, t2Mm: 7,
  beratKgPerM: 14.0, panjangStandarM: 12,
}
const BJ37: MutuBaja = { fyMpa: 240, fuMpa: 370 }

describe('kapasitas tarik — leleh utuh vs putus di lubang baut', () => {
  it('tanpa lubang → leleh penampang utuh yang menentukan', () => {
    const r = kapasitasTarik(WF150, BJ37)
    expect(r.penentu).toBe('leleh')
  })

  it('luas neto kecil → PUTUS di lubang yang menentukan', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Yang sering terlupa: batang tarik yang disambung BAUT punya lubang, dan
      lubang itu mengurangi luas justru di tempat gayanya penuh.

      Batang yang lulus "leleh penampang utuh" bisa PUTUS di lubang bautnya —
      dan putus terjadi mendadak, tanpa perpanjangan yang terlihat lebih dulu
      seperti pada leleh.
      ══════════════════════════════════════════════════════════════════════
    */
    const utuh = kapasitasTarik(WF150, BJ37)
    const berlubang = kapasitasTarik(WF150, BJ37, 1200)   // luas neto dipotong
    expect(berlubang.penentu).toBe('putus')
    /*
      Dibandingkan nilai BER-PHI, bukan nominal.

      Percobaan pertama membandingkan `pnKn` nominal dan MERAH: 444 kN nominal
      leleh vs 415 kN ber-phi putus. Modulnya benar — nilai nominal tanpa phi
      memang tak sebanding, karena phi-nya berbeda (0,90 vs 0,75). Yang salah
      bentuk keluarannya, dan itu sudah diperbaiki: kini hanya nilai ber-phi
      yang dipulangkan.
    */
    expect(berlubang.phiPnKn).toBeLessThan(utuh.phiPnKn)
    // phi putus lebih ketat karena putus terjadi MENDADAK.
    expect(berlubang.phi).toBeLessThan(utuh.phi)
  })
})

describe('batang rangka — tarik & tekan diperiksa berbeda', () => {
  const dasar = (ubah: Partial<BatangRangka> = {}): BatangRangka => ({
    nama: 'A1', profil: SIKU, panjangM: 1.5, gayaKn: 50, ...ubah,
  })

  it('gaya POSITIF → tarik, NEGATIF → tekan', () => {
    expect(analisaBatangRangka(dasar({ gayaKn: 50 }), BJ37).arah).toBe('tarik')
    expect(analisaBatangRangka(dasar({ gayaKn: -50 }), BJ37).arah).toBe('tekan')
  })

  it('batang tekan pendek → aman', () => {
    const h = analisaBatangRangka(dasar({ gayaKn: -80, panjangM: 1.2 }), BJ37)
    expect(h.aman).toBe(true)
  })

  it('batang tekan PANJANG gagal meski gayanya sama', () => {
    /*
      Inilah bedanya batang rangka dari balok: yang menentukan panjangnya,
      bukan gayanya. Batang 4 m dan 1,2 m dengan gaya sama punya nasib
      berbeda — dan itu tak terlihat dari besar gayanya.
    */
    const pendek = analisaBatangRangka(dasar({ gayaKn: -80, panjangM: 1.2 }), BJ37)
    const panjang = analisaBatangRangka(dasar({ gayaKn: -80, panjangM: 4.0 }), BJ37)
    expect(pendek.aman).toBe(true)
    expect(panjang.aman).toBe(false)
  })

  it('batas kelangsingan TARIK lebih longgar daripada TEKAN', () => {
    /*
      Batang tarik tak bisa menekuk, jadi batasnya bukan soal kekuatan — yang
      terlalu langsing MELENDUT oleh beratnya sendiri dan BERGETAR saat angin.
      Getaran melelahkan sambungannya, dan kelelahan tak terlihat sampai
      sambungannya retak.
    */
    expect(BATAS_KELANGSINGAN.tarik).toBeGreaterThan(BATAS_KELANGSINGAN.tekan)
    expect(BATAS_KELANGSINGAN.tekan).toBe(200)
    expect(BATAS_KELANGSINGAN.tarik).toBe(300)
  })

  it('batang tarik sangat panjang gagal KELANGSINGAN meski gayanya kecil', () => {
    const h = analisaBatangRangka(dasar({ gayaKn: 5, panjangM: 8 }), BJ37)
    const langsing = h.periksa.find((p) => p.nama.startsWith('Kelangsingan'))!
    expect(langsing.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('batang tarik MEMPERINGATKAN soal luas neto lubang baut', () => {
    const h = analisaBatangRangka(dasar({ gayaKn: 50 }), BJ37)
    expect(h.catatan.join(' ')).toMatch(/Luas NETO/)
    expect(h.catatan.join(' ')).toMatch(/PUTUS di lubang bautnya/)
  })
})

describe('GAYA BALIK — penyebab runtuh kuda-kuda paling sering', () => {
  const batangTarik: BatangRangka = {
    nama: 'batang bawah', profil: SIKU, panjangM: 2.0, gayaKn: 60,
  }

  it('batang tarik TANPA gaya balik diberi peringatan', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Angin hisap MEMBALIK arah gaya pada rangka atap: batang bawah yang
      biasanya tarik jadi TEKAN. Batang yang dirancang tipis karena "cuma
      tarik" mendadak harus menahan tekan, dan ia menekuk.

      Atap terangkat saat angin kencang — bukan roboh karena beban berat.
      Itu penyebab runtuh kuda-kuda paling sering di Indonesia, dan ia tak
      pernah muncul kalau yang diperiksa cuma beban gravitasi.
      ══════════════════════════════════════════════════════════════════════
    */
    const h = analisaBatangRangka(batangTarik, BJ37)
    expect(h.catatan.join(' ')).toMatch(/GAYA BALIK tidak diisi/)
    expect(h.catatan.join(' ')).toMatch(/angin hisap/)
    expect(h.catatan.join(' ')).toMatch(/atap terangkat/i)
  })

  it('gaya balik TEKAN diperiksa terpisah, dan bisa MENGGAGALKAN', () => {
    // Batang tipis yang aman untuk tarik 60 kN bisa gagal untuk tekan 60 kN
    // pada panjang yang sama — karena tekan menekuk, tarik tidak.
    const h = analisaBatangRangka(
      { ...batangTarik, panjangM: 3.5, gayaBalikKn: -60 }, BJ37)
    const balik = h.periksa.find((p) => p.nama.includes('BERBALIK'))!
    expect(balik).toBeTruthy()
    expect(balik.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('batang yang lulus KEDUANYA tetap aman', () => {
    const h = analisaBatangRangka(
      { ...batangTarik, panjangM: 1.2, gayaBalikKn: -30 }, BJ37)
    expect(h.aman).toBe(true)
    // Dan peringatan "gaya balik tidak diisi" TIDAK muncul lagi.
    expect(h.catatan.join(' ')).not.toMatch(/GAYA BALIK tidak diisi/)
  })
})

describe('analisaRangka — verdict seluruh rangka', () => {
  const kudaKuda = (ubah: Partial<BatangRangka>[] = []) => ({
    nama: 'KK-1', mutu: BJ37,
    batang: [
      { nama: 'atas-1', profil: WF150, panjangM: 2.0, gayaKn: -120 },
      { nama: 'bawah-1', profil: SIKU, panjangM: 2.0, gayaKn: 100, gayaBalikKn: -20 },
      { nama: 'diagonal-1', profil: SIKU, panjangM: 1.5, gayaKn: -40 },
      { nama: 'vertikal-1', profil: SIKU, panjangM: 1.0, gayaKn: 25, gayaBalikKn: -10 },
      ...ubah,
    ] as BatangRangka[],
  })

  it('rangka yang seluruh batangnya aman → aman', () => {
    const h = analisaRangka(kudaKuda())
    expect(h.aman).toBe(true)
    expect(h.batang).toHaveLength(4)
  })

  it('SATU batang gagal menggagalkan seluruh rangka', () => {
    /*
      Rangka batang TAK punya jalur beban cadangan: setiap batang memikul
      bagiannya sendiri, dan yang putus membuat rangka jadi mekanisme yang
      runtuh seketika.

      Itu berbeda dari portal beton, yang bisa menyalurkan beban lewat jalur
      lain saat satu bagian meleleh — perbedaan yang sering diremehkan.
    */
    const h = analisaRangka(kudaKuda([
      { nama: 'diagonal-rusak', profil: SIKU, panjangM: 6.0, gayaKn: -80 },
    ]))
    expect(h.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/TAK punya jalur beban cadangan/)
    expect(h.catatan.join(' ')).toMatch(/diagonal-rusak/)
  })

  it('menyebut NAMA batang yang gagal, bukan cuma jumlahnya', () => {
    const h = analisaRangka(kudaKuda([
      { nama: 'X1', profil: SIKU, panjangM: 7.0, gayaKn: -50 },
      { nama: 'X2', profil: SIKU, panjangM: 7.5, gayaKn: -50 },
    ]))
    expect(h.catatan.join(' ')).toMatch(/X1/)
    expect(h.catatan.join(' ')).toMatch(/X2/)
  })

  it('menolak rangka tanpa batang', () => {
    expect(() => analisaRangka({ nama: 'kosong', mutu: BJ37, batang: [] }))
      .toThrow(/minimal satu batang/)
  })

  it('menyatakan bahwa GAYA BATANG harus datang dari analisis lain', () => {
    /*
      Modul ini memeriksa apakah profil sanggup menahan gaya yang DIBERIKAN —
      ia tidak mencari gayanya. Tanpa keterangan ini, orang mengira memasukkan
      geometri saja sudah cukup.
    */
    const h = analisaRangka(kudaKuda())
    expect(h.catatan.join(' ')).toMatch(/GAYA BATANG harus datang dari analisis/)
    expect(h.catatan.join(' ')).toMatch(/ia tidak mencari gayanya/)
  })

  it('SAMBUNGAN BUHUL dinyatakan tak dihitung', () => {
    const h = analisaRangka(kudaKuda())
    expect(h.catatan.join(' ')).toMatch(/SAMBUNGAN BUHUL/)
    expect(h.catatan.join(' ')).toMatch(/beberapa batang sekaligus/)
  })
})

describe('volume rangka untuk RAP', () => {
  const kudaKuda = {
    nama: 'KK-1', mutu: BJ37,
    batang: [
      { nama: 'atas-1', profil: WF150, panjangM: 3.0, gayaKn: -100 },
      { nama: 'atas-2', profil: WF150, panjangM: 3.0, gayaKn: -100 },
      { nama: 'd1', profil: SIKU, panjangM: 1.5, gayaKn: -30 },
      { nama: 'd2', profil: SIKU, panjangM: 1.5, gayaKn: -30 },
      { nama: 'd3', profil: SIKU, panjangM: 1.5, gayaKn: 30, gayaBalikKn: -10 },
      { nama: 'd4', profil: SIKU, panjangM: 1.5, gayaKn: 30, gayaBalikKn: -10 },
    ] as BatangRangka[],
  }

  it('DIJUMLAHKAN per profil, bukan per batang', () => {
    /*
      Kuda-kuda 20 batang dengan 3 jenis profil menghasilkan 3 baris
      pembelian, bukan 20. Yang dipesan adalah profilnya, sejumlah total
      panjangnya.
    */
    const h = analisaRangka(kudaKuda)
    expect(h.volume.besi).toHaveLength(2)   // WF150 + SIKU
    const perans = h.volume.besi.map((b) => b.peran)
    expect(perans.some((p) => p.includes('WF'))).toBe(true)
    expect(perans.some((p) => p.includes('L'))).toBe(true)
  })

  it('batang dibeli dihitung dari TOTAL panjang, bukan per batang rangka', () => {
    /*
      4 batang siku @1,5 m = 6 m total = 1 batang standar 6 m, BUKAN 4.
      Menghitung per batang membuat RAP empat kali lipat.
    */
    const h = analisaRangka(kudaKuda)
    const siku = h.volume.besi.find((b) => b.peran.includes('L '))!
    expect(siku.jumlahBatang).toBe(1)
  })

  it('berat TERPASANG lebih kecil dari yang dibeli', () => {
    const h = analisaRangka(kudaKuda)
    expect(h.volume.beratSendiriKg).toBeLessThanOrEqual(h.volume.besiTotalKg)
    // 2×3 m WF150 (14 kg/m) + 4×1,5 m siku (7,38) = 84 + 44,28 = 128,28 kg
    expect(h.volume.beratSendiriKg).toBeCloseTo(2 * 3 * 14 + 4 * 1.5 * 7.38, 2)
  })

  it('jumlah rangka identik mengalikan volumenya', () => {
    const satu = analisaRangka(kudaKuda)
    const lima = analisaRangka({ ...kudaKuda, jumlah: 5 })
    expect(lima.volume.beratSendiriKg).toBeCloseTo(satu.volume.beratSendiriKg * 5, 6)
  })

  it('beton & bekisting NOL — bentuknya tetap sama dengan elemen beton', () => {
    const h = analisaRangka(kudaKuda)
    expect(h.volume.betonM3).toBe(0)
    expect(h.volume.bekistingM2).toBe(0)
    expect(Array.isArray(h.volume.besi)).toBe(true)
    expect(typeof h.volume.besiTotalKg).toBe('number')
  })
})
