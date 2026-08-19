import { describe, it, expect } from 'vitest'
import {
  analisaSloof, BERAT_DINDING_KN_M3, BERAT_BETON_KN_M3,
  RASIO_TINGGI_MIN, TINGGI_MIN_MM, type InputSloof,
} from '../struktur-sloof'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SLOOF — beban DIHITUNG, tulangan SIMETRIS, kekakuan minimum
 *
 * Angka pembanding dihitung tangan, bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const DASAR: InputSloof = {
  bMm: 150, hMm: 250, bentangM: 3,
  selimutMm: 30, dUtamaMm: 12, nBawah: 2, nAtas: 2,
  dSengkangMm: 8, jarakSengkangMm: 150,
  mutu: { fcMpa: 20, fyMpa: 400 },
  tinggiDindingM: 3, tebalDindingM: 0.15, jenisDinding: 'bata_merah',
}

describe('beban dihitung, bukan diketik', () => {
  it('beban dinding = tinggi × tebal × berat jenis', () => {
    /*
      3 m × 0,15 m × 17 kN/m³ = 7,65 kN/m
      Estimator yang menghitung ini di kertas akan salah, dan salahnya tak
      terlihat karena angka momen tak punya "rasa benar" seperti dimensi.
    */
    expect(analisaSloof(DASAR).beban.dindingKnPerM).toBeCloseTo(7.65, 4)
  })

  it('berat sendiri = b × h × 24 kN/m³', () => {
    /* 0,15 × 0,25 × 24 = 0,9 kN/m */
    expect(analisaSloof(DASAR).beban.beratSendiriKnPerM).toBeCloseTo(0.9, 4)
  })

  it('total = dinding + berat sendiri + tambahan', () => {
    /* 7,65 + 0,9 = 8,55 kN/m */
    expect(analisaSloof(DASAR).beban.totalKnPerM).toBeCloseTo(8.55, 4)
    expect(analisaSloof({ ...DASAR, bebanTambahanKnPerM: 2 }).beban.totalKnPerM)
      .toBeCloseTo(10.55, 4)
  })

  it('momen memakai wL²/12 (jepit-jepit), BUKAN wL²/8', () => {
    /*
      wu = 1,2 × 8,55 = 10,26 kN/m
      Mu = 10,26 × 3² / 12 = 7,695 kNm

      Tumpuan sederhana (wL²/8) memberi 11,54 kNm — konservatif untuk lapangan
      tetapi MENYESATKAN untuk tumpuan, tempat momen negatifnya terbesar dan
      tulangan atasnya sering dilupakan.
    */
    const h = analisaSloof(DASAR)
    expect(h.beban.muKnm).toBeCloseTo(7.695, 3)
    expect(h.beban.muKnm).not.toBeCloseTo(11.5425, 3)   // bukan wL²/8
  })

  it('geser = wu·L/2', () => {
    /* 10,26 × 3 / 2 = 15,39 kN */
    expect(analisaSloof(DASAR).beban.vuKn).toBeCloseTo(15.39, 3)
  })

  it('bata ringan menghasilkan beban jauh lebih kecil daripada bata merah', () => {
    /*
      6,5 vs 17 kN/m³ — hampir tiga kali lipat. Memakai bawaan yang salah
      menggeser seluruh perhitungan sloof, jadi jenisnya WAJIB dipilih.
    */
    const merah = analisaSloof(DASAR).beban.dindingKnPerM
    const ringan = analisaSloof({ ...DASAR, jenisDinding: 'bata_ringan' }).beban.dindingKnPerM
    expect(ringan).toBeCloseTo(3 * 0.15 * 6.5, 4)
    expect(ringan).toBeLessThan(merah / 2)
  })

  it('berat jenis boleh ditimpa langsung', () => {
    expect(analisaSloof({ ...DASAR, beratDindingKnM3: 10 }).beban.dindingKnPerM)
      .toBeCloseTo(3 * 0.15 * 10, 4)
  })

  it('sloof tanpa dinding tetap sah bila ada beban tambahan', () => {
    const h = analisaSloof({ ...DASAR, tinggiDindingM: 0, bebanTambahanKnPerM: 5 })
    expect(h.beban.dindingKnPerM).toBe(0)
    expect(h.beban.totalKnPerM).toBeCloseTo(5.9, 4)
  })

  it('MEMPERINGATKAN sloof yang hanya memikul berat sendiri', () => {
    /*
      Versi pertama test ini menuntut GALAT, dan itu salah: berat sendiri
      (b × h × 24) selalu > 0, jadi "beban total nol" mustahil tercapai. Cek
      yang tak pernah bisa benar adalah kode mati yang terbaca seperti
      penjagaan.

      Yang benar-benar perlu diperingatkan: sloof tanpa dinding SAH (pengikat
      murni), tetapi jauh lebih sering berarti tinggi dindingnya lupa diisi —
      dan hasilnya keluar jauh lebih kecil daripada seharusnya.
    */
    const h = analisaSloof({ ...DASAR, tinggiDindingM: 0 })
    expect(h.beban.dindingKnPerM).toBe(0)
    expect(h.beban.totalKnPerM).toBeCloseTo(0.9, 4)
    expect(h.catatan.join(' ')).toMatch(/hanya dengan berat sendirinya/i)
  })

  it('TIDAK memperingatkan bila ada dinding atau beban tambahan', () => {
    expect(analisaSloof(DASAR).catatan.join(' '))
      .not.toMatch(/hanya dengan berat sendirinya/i)
    expect(analisaSloof({ ...DASAR, tinggiDindingM: 0, bebanTambahanKnPerM: 5 })
      .catatan.join(' ')).not.toMatch(/hanya dengan berat sendirinya/i)
  })
})

describe('tulangan WAJIB simetris', () => {
  it('MENOLAK tulangan atas lebih sedikit — bukan sekadar memperingatkan', () => {
    /*
      Momen negatif di atas tumpuan sama besar dengan momen positif di lapangan
      pada anggapan jepit-jepit. Tulangan atas yang kurang membuat sloof retak
      tepat di atas kolom — tempat yang paling sulit diperbaiki sesudah dinding
      berdiri.

      Catatan yang bisa dilewati akan dilewati; karena itu ditolak.
    */
    expect(() => analisaSloof({ ...DASAR, nAtas: 1 })).toThrow(/simetris/i)
    expect(() => analisaSloof({ ...DASAR, nBawah: 4, nAtas: 2 })).toThrow(/simetris/i)
  })

  it('menerima yang simetris', () => {
    expect(() => analisaSloof({ ...DASAR, nBawah: 3, nAtas: 3 })).not.toThrow()
  })

  it('MENOLAK kurang dari 2 batang bawah', () => {
    expect(() => analisaSloof({ ...DASAR, nBawah: 1, nAtas: 1 })).toThrow(/minimal 2/i)
  })
})

describe('kekakuan minimum — fungsi utama sloof', () => {
  it('memperingatkan saat h di bawah L/15', () => {
    /*
      Bentang 6 m → h minimum 400 mm. Sloof 250 mm terlalu langsing: ia tak
      sanggup menyatukan pondasi saat tanah turun tak seragam, dan retak yang
      muncul justru di DINDING di atasnya — kerusakan yang terlihat pemilik
      bangunan sementara sebabnya di bawah tanah.
    */
    const h = analisaSloof({ ...DASAR, bentangM: 6, hMm: 250 })
    expect(h.catatan.join(' ')).toMatch(/di bawah minimum praktis/i)
    expect(h.catatan.join(' ')).toMatch(/400 mm/)
  })

  it('tidak memperingatkan saat h cukup', () => {
    const h = analisaSloof({ ...DASAR, bentangM: 6, hMm: 450 })
    expect(h.catatan.join(' ')).not.toMatch(/di bawah minimum praktis/i)
  })

  it('batas mutlak 200 mm berlaku untuk bentang pendek', () => {
    /*
      Bentang 1,5 m → L/15 = 100 mm, tetapi sengkang tak muat di bawah 200 mm.
      Yang berlaku yang lebih besar.
    */
    expect(RASIO_TINGGI_MIN * 1500).toBeLessThan(TINGGI_MIN_MM)
    const h = analisaSloof({ ...DASAR, bentangM: 1.5, hMm: 150 })
    expect(h.catatan.join(' ')).toMatch(/200 mm/)
  })
})

describe('hasil struktural & volume', () => {
  it('memulangkan bentuk HasilElemen yang lengkap', () => {
    const h = analisaSloof(DASAR)
    expect(h.periksa.length).toBeGreaterThan(0)
    expect(typeof h.aman).toBe('boolean')
    expect(h.volume.betonM3).toBeGreaterThan(0)
    expect(h.volume.besi.length).toBeGreaterThan(0)
  })

  it('volume beton = b × h × bentang', () => {
    /* 0,15 × 0,25 × 3 = 0,1125 m³ */
    expect(analisaSloof(DASAR).volume.betonM3).toBeCloseTo(0.1125, 4)
  })

  it('tulangan ATAS ikut ditimbang di volume', () => {
    /*
      Sloof bertulangan simetris: 2 bawah + 2 atas. Volume yang cuma menghitung
      bawahnya kekurangan separuh besi memanjang pada SETIAP sloof di proyek.
    */
    const utama = analisaSloof(DASAR).volume.besi.filter((b) => b.peran === 'utama')
    const total = utama.reduce((s, b) => s + b.jumlahBatang, 0)
    expect(total).toBe(4)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const satu = analisaSloof(DASAR)
    const lima = analisaSloof({ ...DASAR, jumlah: 5 })
    expect(lima.volume.betonM3).toBeCloseTo(satu.volume.betonM3 * 5, 6)
    expect(lima.aman).toBe(satu.aman)
  })
})

describe('catatan batas', () => {
  it('menyebut gaya tarik gempa yang BELUM diperiksa', () => {
    /*
      SNI 2847 §18.13.3 mensyaratkan sloof penghubung pondasi memikul 10% beban
      aksial kolom terbesar. Itu butuh gaya gempa yang belum dihitung modul mana
      pun — dan menebaknya lebih berbahaya daripada menyebutnya belum ada.
    */
    expect(analisaSloof(DASAR).catatan.join(' ')).toMatch(/gempa/i)
    expect(analisaSloof(DASAR).catatan.join(' ')).toMatch(/18\.13\.3/)
  })

  it('menuliskan RANTAI perhitungan bebannya', () => {
    /*
      Beban yang dihitung diam-diam tak bisa diperiksa. Catatan ini
      satu-satunya yang menjawab "kenapa Mu-nya segini?".
    */
    const c = analisaSloof(DASAR).catatan.join(' ')
    expect(c).toMatch(/17 kN\/m³/)
    expect(c).toMatch(/wL²\/12/)
  })

  it('mewarisi catatan batas dari analisa balok', () => {
    /* Batas volume besi (penyaluran, kait, sambungan lewatan) tetap terbawa. */
    expect(analisaSloof(DASAR).catatan.join(' ')).toMatch(/penyaluran|lewatan|kait/i)
  })
})

describe('penjagaan masukan', () => {
  it.each([
    ['bMm', { bMm: 0 }],
    ['hMm', { hMm: -1 }],
    ['bentangM', { bentangM: 0 }],
    ['dUtamaMm', { dUtamaMm: 0 }],
    ['fcMpa', { mutu: { fcMpa: 0, fyMpa: 400 } }],
  ])('menolak %s tak masuk akal', (_nama, ubah) => {
    expect(() => analisaSloof({ ...DASAR, ...ubah } as InputSloof)).toThrow()
  })

  it('menolak jenis dinding karangan', () => {
    expect(() => analisaSloof({ ...DASAR, jenisDinding: 'kaca' as never }))
      .toThrow(/jenis dinding tak dikenal/i)
  })

  it('konstanta berat jenis sesuai SNI 1727', () => {
    expect(BERAT_DINDING_KN_M3.bata_merah).toBe(17)
    expect(BERAT_DINDING_KN_M3.bata_ringan).toBe(6.5)
    expect(BERAT_BETON_KN_M3).toBe(24)
  })
})
