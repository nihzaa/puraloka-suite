import { describe, it, expect } from 'vitest'
import {
  cariAturanBeli, konversiKeBeli, konversiBesiBeton, konversiBajaProfil,
  ATURAN_BELI,
} from '../satuan-beli'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SATUAN RAB ≠ SATUAN RAP
 *
 * RAB memakai satuan ANALISA (kg, m², m) karena itu yang dipakai AHSP menyusun
 * harga jual. RAP memakai satuan PEMBELIAN (batang, dus, sak, kaleng) karena
 * itu yang benar-benar dipesan.
 *
 * Bedanya bukan penamaan: barang dijual UTUH dan sisanya tak bisa
 * dikembalikan. RAP yang memakai satuan RAB kekurangan uang untuk sisa itu di
 * SETIAP material — dan kekurangannya tak pernah terlihat, karena angkanya
 * "benar" menurut satuan yang dipakai. Yang ketahuan cuma akibatnya: belanja
 * aktual selalu melebihi RAP, tanpa ada yang bisa menunjuk sebabnya.
 * ══════════════════════════════════════════════════════════════════════════════
 */

describe('pembulatan SELALU ke atas', () => {
  it('45 m2 keramik 60x60 → 32 dus, bukan 31,25', () => {
    /*
      1 dus = 1,44 m². 45 / 1,44 = 31,25 → 32 dus = 46,08 m².
      Sisa 1,08 m² jadi milik proyek, dan RAP harus membayarnya.
    */
    const r = konversiKeBeli('Keramik 60x60 polos', 45)!
    expect(r.kuantitasBeli).toBe(32)
    expect(r.satuanBeli).toBe('dus')
    expect(r.sisaTerbeli).toBeCloseTo(1.08, 6)
  })

  it('tak ada supplier yang menjual 0,7 kaleng cat', () => {
    // 12 kg cat besi, kaleng 5 kg → 3 kaleng (15 kg), sisa 3 kg.
    const r = konversiKeBeli('Cat besi menie', 12)!
    expect(r.kuantitasBeli).toBe(3)
    expect(r.sisaTerbeli).toBeCloseTo(3, 6)
  })

  it('kuantitas PAS tetap tidak dibulatkan naik', () => {
    // 50 kg semen = tepat 1 sak. Membulatkan naik di sini akan memboroskan
    // satu sak di setiap baris yang kebetulan pas.
    const r = konversiKeBeli('Semen Portland', 50)!
    expect(r.kuantitasBeli).toBe(1)
    expect(r.sisaTerbeli).toBeCloseTo(0, 9)
  })

  it('kuantitas sangat kecil tetap jadi SATU satuan beli, bukan nol', () => {
    /*
      0,3 kg cat tetap harus beli satu kaleng. Membulatkan ke bawah
      menghasilkan RAP nol untuk pekerjaan yang nyata ada.
    */
    const r = konversiKeBeli('Cat tembok interior', 0.3)!
    expect(r.kuantitasBeli).toBe(1)
  })
})

describe('sisa terbeli DITAMPILKAN, bukan disembunyikan', () => {
  it('selisih antara yang dibeli dan yang terpakai selalu ≥ 0', () => {
    for (const nama of ['Semen Portland', 'Keramik 60x60', 'Cat tembok', 'Triplek 12 mm']) {
      for (const q of [0.1, 1, 7.3, 45, 200]) {
        const r = konversiKeBeli(nama, q)
        if (!r) continue
        expect(r.sisaTerbeli, `${nama} @ ${q}`).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  })

  it('sisa selalu LEBIH KECIL dari satu satuan beli', () => {
    /*
      Kalau sisanya ≥ satu satuan, berarti pembulatannya kelebihan satu — dan
      itu memboroskan uang di tiap baris RAP.
    */
    for (const q of [1, 10, 45, 99.9, 100]) {
      const r = konversiKeBeli('Keramik 60x60', q)!
      expect(r.sisaTerbeli).toBeLessThan(r.isiPerSatuan)
    }
  })
})

describe('besi beton: isi per lonjor bergantung DIAMETER', () => {
  it('Ø10 dan Ø16 punya berat per lonjor yang jauh berbeda', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Inilah kenapa besi tak bisa memakai angka tetap "isi per satuan".

      Ø10 → 0,0061654 × 100 × 12 = 7,40 kg/lonjor
      Ø16 → 0,0061654 × 256 × 12 = 18,94 kg/lonjor

      Selisihnya 2,56× — memakai satu angka untuk keduanya membuat RAP salah
      sebesar itu, dan angkanya tetap terlihat wajar.
      ══════════════════════════════════════════════════════════════════════
    */
    const d10 = konversiBesiBeton(10, 100)
    const d16 = konversiBesiBeton(16, 100)
    expect(d10.isiPerSatuan).toBeCloseTo(7.398, 2)
    expect(d16.isiPerSatuan).toBeCloseTo(18.940, 2)
    // 100 kg → Ø10 butuh 14 lonjor, Ø16 cuma 6.
    expect(d10.kuantitasBeli).toBe(14)
    expect(d16.kuantitasBeli).toBe(6)
  })

  it('menyebut bahwa sisa potongan besi MASIH bisa dipakai', () => {
    /*
      Beda dari baja profil: potongan besi beton sering terpakai untuk sengkang
      atau tulangan pendek. Menyamakan keduanya membuat RAP besi terlalu boros
      atau RAP baja terlalu tipis.
    */
    const r = konversiBesiBeton(13, 250)
    expect(r.asumsi).toMatch(/sengkang|tulangan pendek/)
    expect(r.asumsi).toMatch(/tak selalu/)
  })

  it('panjang lonjor bisa diubah — tak semua daerah memakai 12 m', () => {
    const l12 = konversiBesiBeton(13, 100, 12)
    const l6 = konversiBesiBeton(13, 100, 6)
    expect(l6.isiPerSatuan).toBeCloseTo(l12.isiPerSatuan / 2, 6)
    expect(l6.kuantitasBeli).toBeGreaterThan(l12.kuantitasBeli)
  })
})

describe('baja profil: isi per batang bergantung BERAT PER METER', () => {
  it('WF 200 dan WF 400 punya berat per batang yang jauh berbeda', () => {
    // WF200 21,33 kg/m → 256 kg/batang · WF400 66 kg/m → 792 kg/batang
    const wf200 = konversiBajaProfil(21.3333, 1000)
    const wf400 = konversiBajaProfil(66.0, 1000)
    expect(wf200.isiPerSatuan).toBeCloseTo(256, 0)
    expect(wf400.isiPerSatuan).toBeCloseTo(792, 0)
    expect(wf200.kuantitasBeli).toBe(4)
    expect(wf400.kuantitasBeli).toBe(2)
  })

  it('menyebut bahwa sisa potongan profil JARANG terpakai', () => {
    /*
      Berbeda dari besi beton. Potongan WF berukuran spesifik dan jarang cocok
      untuk elemen lain — jadi ia kehilangan, bukan sisa yang bisa dipakai.
      Menyamakan keduanya membuat RAP baja terlalu tipis.
    */
    const r = konversiBajaProfil(21.3333, 500)
    expect(r.asumsi).toMatch(/jarang terpakai/)
    expect(r.asumsi).toMatch(/kehilangan/)
  })
})

describe('material yang tak dikenali memulangkan null, bukan tebakan', () => {
  it('null untuk material di luar daftar', () => {
    /*
      Menebak satuan beli untuk material yang tak dikenali menghasilkan RAP
      yang terlihat lengkap sambil salah. Lebih baik pemanggil TAHU bahwa ia
      harus mengisinya sendiri.
    */
    expect(cariAturanBeli('Bahan ajaib yang belum ada')).toBeNull()
    expect(konversiKeBeli('Bahan ajaib yang belum ada', 10)).toBeNull()
  })

  it('isiPerSatuan 0 → null, karena isinya bergantung barangnya', () => {
    /*
      Besi dan kayu punya `isiPerSatuan: 0` — isinya tak bisa ditulis sebagai
      angka tetap. Memulangkan null memaksa pemanggil menghitungnya dari
      dimensi, alih-alih memakai angka karangan yang terlihat masuk akal.
    */
    expect(konversiKeBeli('Besi beton ulir D13', 100)).toBeNull()
    expect(konversiKeBeli('Baja profil WF', 500)).toBeNull()
  })

  it('isi bisa DITIMPA — merek berbeda, isi berbeda', () => {
    // Keramik 60×60 bawaan 1,44 m²/dus; sebagian merek isi 3 = 1,08 m².
    const bawaan = konversiKeBeli('Keramik 60x60', 45)!
    const ditimpa = konversiKeBeli('Keramik 60x60', 45, 1.08)!
    expect(ditimpa.kuantitasBeli).toBeGreaterThan(bawaan.kuantitasBeli)
    expect(ditimpa.isiPerSatuan).toBe(1.08)
  })
})

describe('aturan bawaan — kualitas datanya', () => {
  it('tiap aturan MENYEBUT asumsinya', () => {
    /*
      Angka isi-per-satuan adalah KEBIASAAN PASAR, bukan standar — ia berbeda
      antar daerah dan merek. Asumsi yang tak tertulis akan dipakai sebagai
      kepastian, dan RAP yang salah satuan belinya baru ketahuan saat barang
      datang kurang.
    */
    for (const { pola, aturan } of ATURAN_BELI) {
      expect(aturan.asumsi.length, `pola ${pola[0]}: asumsi terlalu pendek`)
        .toBeGreaterThan(30)
    }
  })

  it('pola yang lebih SPESIFIK berada sebelum yang umum', () => {
    /*
      "besi beton" harus dicocokkan sebelum "besi"; "keramik 60x60" sebelum
      "keramik". Urutan salah membuat semua keramik memakai isi yang sama.
    */
    const semua = ATURAN_BELI.flatMap((a) => a.pola)
    const iKeramik60 = semua.indexOf('keramik 60x60')
    const iKeramik = semua.indexOf('keramik')
    expect(iKeramik60).toBeLessThan(iKeramik)

    const iCatTembok = semua.indexOf('cat tembok')
    const iCat = semua.indexOf('cat')
    expect(iCatTembok).toBeLessThan(iCat)
  })

  it('semua kategori material besar tercakup', () => {
    /*
      Founder minta pembedaan satuan untuk SEMUA material, bukan hanya baja.
      Penjaga ini menuntut tiap kategori besar punya aturannya.
    */
    const wajib = [
      'Semen Portland', 'Pasir beton', 'Keramik 60x60', 'Bata merah',
      'Cat tembok interior', 'Pipa PVC 4 inci', 'Kabel NYM 3x2.5',
      'Triplek 12 mm', 'Gypsum board 9 mm', 'Kloset duduk',
      'Kawat las E6013', 'Bata ringan 10 cm',
    ]
    const tanpa = wajib.filter((m) => cariAturanBeli(m) === null)
    expect(tanpa, `material tanpa aturan satuan beli: ${tanpa.join(', ')}`)
      .toHaveLength(0)
  })

  it('satuan RAB dan satuan BELI memang berbeda untuk yang seharusnya', () => {
    // Kalau keduanya sama untuk keramik/cat/semen, berarti aturannya tak
    // menambah apa pun.
    const semen = cariAturanBeli('Semen Portland')!
    expect(semen.satuanRab).toBe('kg')
    expect(semen.satuanBeli).toBe('sak')

    const keramik = cariAturanBeli('Keramik 60x60')!
    expect(keramik.satuanRab).toBe('m2')
    expect(keramik.satuanBeli).toBe('dus')
  })

  it('pasir & agregat TETAP m3 di keduanya — dan itu benar', () => {
    /*
      Tidak semua material berbeda satuannya. Memaksakan perbedaan untuk yang
      memang sama akan membuat RAP menyebut satuan karangan.
    */
    const pasir = cariAturanBeli('Pasir beton')!
    expect(pasir.satuanRab).toBe('m3')
    expect(pasir.satuanBeli).toBe('m3')
    expect(pasir.asumsi).toMatch(/rit/)
  })
})
