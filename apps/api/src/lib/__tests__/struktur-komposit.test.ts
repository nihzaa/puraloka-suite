import { describe, it, expect } from 'vitest'
import {
  analisaKolomKomposit, analisaBondek, ecBeton,
  ES_MPA, RASIO_BAJA_MIN, BERAT_BETON_BASAH_KN_M3, BEBAN_PELAKSANAAN_KPA,
  LENDUT_MAKS_MM,
  type InputKolomKomposit, type InputBondek,
} from '../struktur-komposit'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KOMPOSIT BAJA-BETON — kolom komposit & pelat bondek
 *
 * Angka pembanding dihitung tangan mengikuti SNI 1729:2020 §I2, bukan disalin
 * dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Kolom terbungkus: WF 200 di dalam beton 400×400. */
const KOLOM: InputKolomKomposit = {
  jenis: 'terbungkus',
  asBajaMm2: 6353, inersiaBajaMm4: 1.34e7,
  lebarBetonMm: 400, tinggiBetonMm: 400,
  panjangTekukM: 3.5, asTulanganMm2: 1256,
  mutuBaja: { fyMpa: 240 },
  mutuBeton: { fcMpa: 30 },
  mutuTulangan: { fyMpa: 400 },
  puKn: 3000,
}

describe('kolom komposit — beton menyumbang, bukan pembungkus kosmetik', () => {
  it('kuat penampang menjumlahkan baja + tulangan + beton', () => {
    /*
      As·fy   = 6353 × 240      = 1.524.720 N
      Asr·fyr = 1256 × 400      =   502.400 N
      Ac      = 160.000 − 6353 − 1256 = 152.391 mm²
      0,85·Ac·f'c = 0,85 × 152.391 × 30 = 3.885.970 N
      Pno = 5.913.090 N = 5.913,1 kN
    */
    expect(analisaKolomKomposit(KOLOM).kapasitas.pnoKn).toBeCloseTo(5913.1, 0)
  })

  it('sumbangan beton LEBIH DARI SEPARUH kapasitas', () => {
    /*
      Menghitung kolom ini sebagai kolom baja saja mengabaikan porsi itu.
      1.524,7 / 5.913,1 = 25,8% baja → 74,2% sisanya.
    */
    const k = analisaKolomKomposit(KOLOM).kapasitas
    expect(k.porsiBeton).toBeGreaterThan(0.5)
    expect(analisaKolomKomposit(KOLOM).antara.kapasitasBajaSajaKn).toBeCloseTo(1524.7, 0)
  })

  it('kolom TERISI memakai koefisien beton 0,95, bukan 0,85', () => {
    /*
      Beton di dalam pipa baja TERKEKANG dari segala arah dan lebih kuat
      daripada silinder bebas. Memakai 0,85 untuk kolom terisi mengecilkan
      kapasitas 12% — konservatif, tetapi berarti kolom lebih besar daripada
      perlunya pada elemen yang paling mahal.
    */
    const terbungkus = analisaKolomKomposit(KOLOM).kapasitas.pnoKn
    const terisi = analisaKolomKomposit({ ...KOLOM, jenis: 'terisi' }).kapasitas.pnoKn
    expect(terisi).toBeGreaterThan(terbungkus)
  })

  it('kekakuan efektif menggabungkan baja dan beton', () => {
    /*
      EI = Es·Is + C1·Ec·Ic. Menghitung tekuk dengan kekakuan baja saja
      mengecilkan Pe berkali lipat dan membuat kolom terlihat jauh lebih
      langsing daripada kenyataannya.
    */
    const a = analisaKolomKomposit(KOLOM).antara
    expect(a.eiEfektif).toBeGreaterThan(ES_MPA * KOLOM.inersiaBajaMm4)
  })

  it('C1 kolom TERISI lebih besar — pipanya menahan retak beton', () => {
    const terbungkus = analisaKolomKomposit(KOLOM).antara.c1
    const terisi = analisaKolomKomposit({ ...KOLOM, jenis: 'terisi' }).antara.c1
    expect(terisi).toBeGreaterThan(terbungkus)
  })

  it('kolom PANJANG kapasitasnya turun karena tekuk', () => {
    const pendek = analisaKolomKomposit({ ...KOLOM, panjangTekukM: 2 }).kapasitas.phiPnKn
    const panjang = analisaKolomKomposit({ ...KOLOM, panjangTekukM: 8 }).kapasitas.phiPnKn
    expect(panjang).toBeLessThan(pendek)
  })

  it('MENANDAI rasio baja di bawah 1% — itu bukan komposit', () => {
    /*
      Di bawah 1% SNI tak lagi menyebutnya komposit: ia kolom beton bertulang
      dengan sedikit baja, dan rumus komposit tak berlaku. Menghitungnya tetap
      sebagai komposit melebihkan kapasitas.
    */
    const h = analisaKolomKomposit({ ...KOLOM, asBajaMm2: 1000 })
    expect(h.periksa.find((p) => p.nama.includes('Rasio luas baja'))!.aman).toBe(false)
    expect(h.aman).toBe(false)
    expect(RASIO_BAJA_MIN).toBe(0.01)
  })

  it('MENOLAK baja + tulangan yang melebihi penampang beton', () => {
    expect(() => analisaKolomKomposit({ ...KOLOM, asBajaMm2: 200_000 }))
      .toThrow(/melebihi penampang beton/i)
  })

  it('menolak jenis karangan', () => {
    expect(() => analisaKolomKomposit({ ...KOLOM, jenis: 'dibungkus-kayu' as never }))
      .toThrow(/tak dikenal/i)
  })

  it('kolom TERISI tak punya bekisting; TERBUNGKUS punya', () => {
    expect(analisaKolomKomposit({ ...KOLOM, jenis: 'terisi' }).volume.bekistingM2).toBe(0)
    expect(analisaKolomKomposit(KOLOM).volume.bekistingM2).toBeGreaterThan(0)
  })

  it('menyebut ketahanan api yang BELUM dihitung', () => {
    /* Justru salah satu alasan utama memakai kolom komposit. */
    expect(analisaKolomKomposit(KOLOM).catatan.join(' ')).toMatch(/KETAHANAN API/i)
  })

  it('kolom terisi diingatkan soal lubang udara', () => {
    expect(analisaKolomKomposit({ ...KOLOM, jenis: 'terisi' }).catatan.join(' '))
      .toMatch(/lubang udara/i)
  })

  it('Ec sesuai SNI 2847 §19.2.2', () => {
    /* 4700√30 = 25.743 MPa */
    expect(ecBeton(30)).toBeCloseTo(25743, 0)
  })
})

// ── BONDEK ───────────────────────────────────────────────────────────────────

const BONDEK: InputBondek = {
  bentangM: 2.5, tebalTotalMm: 120, tinggiGelombangMm: 50, tebalBajaMm: 0.75,
  asBondekMm2PerM: 1300, inersiaBondekMm4PerM: 540000,
  mutuBondek: { fyMpa: 550 }, mutuBeton: { fcMpa: 25 },
  bebanHidupKpa: 2.5, bebanMatiTambahanKpa: 1.2, luasM2: 100,
}

describe('bondek — TAHAP PELAKSANAAN yang paling sering dilewatkan', () => {
  it('beban cor = beton BASAH + pekerja', () => {
    /*
      Tebal rata = 120 − 25 = 95 mm
      Beton basah = 0,095 × 25 = 2,375 kPa   (basah 25, bukan kering 24)
      + pekerja 1,0 = 3,375 kPa
    */
    const p = analisaBondek(BONDEK).pelaksanaan
    expect(p.bebanCorKpa).toBeCloseTo(3.38, 2)
    expect(BERAT_BETON_BASAH_KN_M3).toBe(25)
    expect(BEBAN_PELAKSANAAN_KPA).toBe(1.0)
  })

  it('lendutan = 5wL⁴/384EI', () => {
    /*
      5 × 3,375 × 2500⁴ / (384 × 200.000 × 540.000) = 15,9 mm

      Satuannya diperiksa terpisah: kPa = kN/m² = N/mm per mm lebar, jadi
      hasilnya mm.
    */
    expect(analisaBondek(BONDEK).pelaksanaan.lendutanMm).toBeCloseTo(15.9, 0)
  })

  it('batas lendutan = min(L/180, 20 mm)', () => {
    /* 2500/180 = 13,89 mm — lebih kecil daripada 20 */
    expect(analisaBondek(BONDEK).pelaksanaan.lendutanBatasMm).toBeCloseTo(13.89, 1)
    /* bentang panjang → yang menentukan batas mutlak 20 mm */
    const panjang = analisaBondek({ ...BONDEK, bentangM: 5 })
    expect(panjang.pelaksanaan.lendutanBatasMm).toBe(LENDUT_MAKS_MM)
  })

  it('MENANDAI bondek yang melendut berlebihan, dan menjelaskan PONDING', () => {
    /*
      Bondek 0,75 mm pada bentang 2,5 m tanpa penyangga memang melendut
      melebihi batas — itu sebabnya penyangga sementara lazim dipakai.

      Beton di tengah jadi lebih tebal, dan tambahan berat itu membuatnya
      melendut lebih jauh: lingkaran yang memperkuat dirinya sendiri.
    */
    const h = analisaBondek(BONDEK)
    expect(h.periksa.find((p) => p.nama.includes('pengecoran'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/memperkuat dirinya sendiri/i)
    expect(h.pelaksanaan.tambahanTebalMm).toBeGreaterThan(0)
  })

  it('PENYANGGA SEMENTARA memperpendek bentang efektif jadi separuh', () => {
    /*
      Lendutan sebanding L⁴, jadi separuh bentang berarti seperenambelas
      lendutan — dari 15,9 mm jadi ~1 mm.
    */
    const tanpa = analisaBondek(BONDEK).pelaksanaan.lendutanMm
    const dengan = analisaBondek({ ...BONDEK, adaPenyanggaSementara: true })
    expect(dengan.antara.bentangEfektifM).toBeCloseTo(1.25, 3)
    expect(dengan.pelaksanaan.lendutanMm).toBeCloseTo(tanpa / 16, 1)
    expect(dengan.periksa.find((p) => p.nama.includes('pengecoran'))!.aman).toBe(true)
  })

  it('penyangga sementara diingatkan TIDAK BOLEH dibongkar lebih awal', () => {
    expect(analisaBondek({ ...BONDEK, adaPenyanggaSementara: true }).catatan.join(' '))
      .toMatch(/membongkarnya lebih awal/i)
  })
})

describe('bondek — tahap layan & volume', () => {
  it('bondek berperan sebagai tulangan tarik', () => {
    /*
      d = 120 − 25 = 95 mm
      a = 1300 × 550 / (0,85 × 25 × 1000) = 33,6 mm
      φMn = 0,9 × 1300 × 550 × (95 − 16,8) / 1e6 = 50,3 kNm/m
    */
    expect(analisaBondek(BONDEK).layan.phiMnKnm).toBeCloseTo(50.3, 0)
  })

  it('Mu layan = wu·L²/8', () => {
    /*
      wu = 1,2 × (0,095 × 24 + 1,2) + 1,6 × 2,5 = 1,2 × 3,48 + 4 = 8,176 kPa
      Mu = 8,176 × 2,5² / 8 = 6,39 kNm/m
    */
    expect(analisaBondek(BONDEK).layan.muKnm).toBeCloseTo(6.39, 1)
  })

  it('volume beton memakai tebal RATA-RATA, bukan tebal total', () => {
    /*
      Beton mengisi lembah gelombang. 0,095 × 100 = 9,5 m³.
      Memakai tebal total (0,12) melebihkan volume 26%.
    */
    const v = analisaBondek(BONDEK).volume
    expect(v.betonM3).toBeCloseTo(9.5, 3)
    expect(v.betonM3).toBeLessThan(0.12 * 100)
  })

  it('BEKISTING NOL — alasan utama memakai bondek', () => {
    /*
      Ia bekisting sekaligus tulangan, dan menghapus pekerjaan pasang-bongkar
      bekisting pelat yang biasanya 30–40% biaya pelat.
    */
    expect(analisaBondek(BONDEK).volume.bekistingM2).toBe(0)
    expect(analisaBondek(BONDEK).catatan.join(' ')).toMatch(/BEKISTING NOL/i)
  })

  it('bondek masuk baris besi sebagai PROFIL, bukan tulangan biasa', () => {
    const besi = analisaBondek(BONDEK).volume.besi
    expect(besi[0].peran).toMatch(/^profil /)
  })

  it('MENOLAK gelombang setinggi atau lebih tinggi daripada pelatnya', () => {
    /* Tak ada beton di atas gelombang — masukannya pasti salah. */
    expect(() => analisaBondek({ ...BONDEK, tinggiGelombangMm: 120 }))
      .toThrow(/tak ada beton di atas gelombang/i)
  })

  it('menyebut wiremesh & geser horizontal yang BELUM dihitung', () => {
    const c = analisaBondek(BONDEK).catatan.join(' ')
    expect(c).toMatch(/wiremesh|SUSUT/i)
    expect(c).toMatch(/geser horizontal/i)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const satu = analisaBondek(BONDEK)
    const dua = analisaBondek({ ...BONDEK, jumlah: 2 })
    expect(dua.volume.betonM3).toBeCloseTo(satu.volume.betonM3 * 2, 3)
    expect(dua.aman).toBe(satu.aman)
  })
})
