import { describe, it, expect } from 'vitest'
import {
  analisaPondasiMenerus, analisaRaft,
  BERAT_BATU_KALI_KN_M3, BERAT_BETON_KN_M3, SUDUT_SEBAR_DERAJAT,
  type InputPondasiMenerus, type InputRaft,
} from '../struktur-pondasi-dangkal'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PONDASI DANGKAL — menerus batu kali & raft
 *
 * Angka pembanding dihitung tangan, bukan disalin dari keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Pondasi batu kali rumah tinggal — ukuran yang diwariskan turun-temurun. */
const MENERUS: InputPondasiMenerus = {
  jenis: 'batu_kali',
  lebarBawahM: 0.6, lebarAtasM: 0.3, tinggiM: 0.6,
  panjangM: 40, kedalamanM: 0.8,
  bebanKnPerM: 25, qaKnM2: 150,
  tebalPasirM: 0.05, tinggiAanstampingM: 0.2,
}

describe('pondasi menerus — tekanan tanah', () => {
  it('berat sendiri dari luas trapesium × berat jenis', () => {
    /*
      Luas = (0,6 + 0,3)/2 × 0,6 = 0,27 m²
      Berat = 0,27 × 22 = 5,94 kN/m
    */
    expect(analisaPondasiMenerus(MENERUS).tekanan.beratSendiriKnPerM)
      .toBeCloseTo(5.94, 3)
  })

  it('tanah urug di atas bahu IKUT menekan', () => {
    /*
      Tinggi urug = 0,8 − 0,6 = 0,2 m
      Luas bahu   = (0,6 − 0,3) × 0,2 = 0,06 m²
      Berat       = 0,06 × 17 = 1,02 kN/m

      Melewatkannya mengecilkan tekanan — arah yang salah, karena yang
      diperiksa adalah apakah tanahnya sanggup.
    */
    expect(analisaPondasiMenerus(MENERUS).tekanan.beratTanahKnPerM)
      .toBeCloseTo(1.02, 3)
  })

  it('tekanan = total / lebar BAWAH', () => {
    /* (25 + 5,94 + 1,02) / 0,6 = 31,96 / 0,6 = 53,27 kPa */
    const t = analisaPondasiMenerus(MENERUS).tekanan
    expect(t.totalKnPerM).toBeCloseTo(31.96, 3)
    expect(t.qKnM2).toBeCloseTo(53.27, 2)
  })

  it('lolos pada tanah keras, GAGAL pada tanah lunak', () => {
    /*
      Ukuran yang sama diwariskan turun-temurun tanpa memeriksa tanahnya. Pada
      tanah lunak ia amblas.
    */
    expect(analisaPondasiMenerus(MENERUS).aman).toBe(true)
    const lunak = analisaPondasiMenerus({ ...MENERUS, qaKnM2: 40 })
    expect(lunak.periksa.find((p) => p.nama.includes('Daya dukung'))!.aman).toBe(false)
  })

  it('beton bertulang lebih berat daripada batu kali', () => {
    const bk = analisaPondasiMenerus(MENERUS).tekanan.beratSendiriKnPerM
    const bt = analisaPondasiMenerus({ ...MENERUS, jenis: 'beton_bertulang' })
      .tekanan.beratSendiriKnPerM
    expect(bt).toBeGreaterThan(bk)
    expect(bt / bk).toBeCloseTo(BERAT_BETON_KN_M3 / BERAT_BATU_KALI_KN_M3, 4)
  })
})

describe('pondasi menerus — sudut sebar (batu kali tak punya kuat tarik)', () => {
  it('bahu di bawah batas → aman', () => {
    /*
      Bahu = (0,6 − 0,3)/2 = 0,15 m
      Batas = 0,6 × tan 60° = 1,039 m — jauh di atasnya
    */
    const p = analisaPondasiMenerus(MENERUS).periksa.find((x) => x.nama.includes('Sudut sebar'))!
    expect(p.aman).toBe(true)
    expect(p.nilai).toBeCloseTo(1.039, 2)
  })

  it('pondasi CEPER dan LEBAR ditolak — tepinya akan pecah', () => {
    /*
      Lebar 2 m, tinggi 0,2 m → bahu 0,85 m, batas 0,2 × 1,732 = 0,346 m.
      Bagian di luar kerucut sebar bekerja sebagai kantilever, dan pasangan
      batu kali praktis tak punya kuat tarik.
    */
    const h = analisaPondasiMenerus({
      ...MENERUS, lebarBawahM: 2, lebarAtasM: 0.3, tinggiM: 0.2,
    })
    expect(h.periksa.find((x) => x.nama.includes('Sudut sebar'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/kantilever/i)
    expect(h.aman).toBe(false)
  })

  it('sudut sebar TIDAK diperiksa untuk beton bertulang', () => {
    /* Beton bertulang punya kuat tarik — aturan sebar tak berlaku baginya. */
    const h = analisaPondasiMenerus({
      ...MENERUS, jenis: 'beton_bertulang',
      lebarBawahM: 2, lebarAtasM: 0.3, tinggiM: 0.2,
    })
    expect(h.periksa.some((x) => x.nama.includes('Sudut sebar'))).toBe(false)
  })

  it('memperingatkan pondasi yang tak melebar', () => {
    /*
      Lebar bawah < 1,5× lebar atas: ia tak menyebarkan beban dan tak lebih
      baik daripada dinding yang langsung menumpu tanah, sementara batu dan
      galiannya tetap dibayar.
    */
    const h = analisaPondasiMenerus({ ...MENERUS, lebarBawahM: 0.35, lebarAtasM: 0.3 })
    expect(h.catatan.join(' ')).toMatch(/tak melebar tidak menyebarkan beban/i)
  })

  it('konstanta sudut sebar 60°', () => {
    expect(SUDUT_SEBAR_DERAJAT).toBe(60)
  })
})

describe('pondasi menerus — volume', () => {
  it('beton = luas trapesium × panjang', () => {
    /* 0,27 × 40 = 10,8 m³ */
    expect(analisaPondasiMenerus(MENERUS).volume.betonM3).toBeCloseTo(10.8, 3)
  })

  it('batu kali TIDAK memakai bekisting', () => {
    /*
      Disusun langsung di dalam galian. Memasukkannya ke RAB adalah biaya yang
      tak pernah dikeluarkan.
    */
    expect(analisaPondasiMenerus(MENERUS).volume.bekistingM2).toBe(0)
    expect(analisaPondasiMenerus(MENERUS).catatan.join(' '))
      .toMatch(/TIDAK memakai bekisting/i)
  })

  it('beton bertulang MEMAKAI bekisting', () => {
    /* 2 × 0,6 × 40 = 48 m² */
    expect(analisaPondasiMenerus({ ...MENERUS, jenis: 'beton_bertulang' })
      .volume.bekistingM2).toBeCloseTo(48, 2)
  })

  it('galian, pasir, aanstamping DIPISAH — AHSP-nya berbeda', () => {
    /*
      galian = 0,6 × 0,8 × 40 = 19,2 m³
      pasir  = 0,05 × 0,6 × 40 = 1,2 m³
      aans   = 0,2 × 0,6 × 40 = 4,8 m³

      Menjumlahkannya ke satu angka membuat harganya salah.
    */
    const a = analisaPondasiMenerus(MENERUS).antara
    expect(a.volGalianM3).toBeCloseTo(19.2, 3)
    expect(a.volPasirM3).toBeCloseTo(1.2, 3)
    expect(a.volAanstampingM3).toBeCloseTo(4.8, 3)
  })

  it('tak ada besi untuk batu kali', () => {
    const v = analisaPondasiMenerus(MENERUS).volume
    expect(v.besi).toHaveLength(0)
    expect(v.besiTotalKg).toBe(0)
  })
})

describe('pondasi menerus — penjagaan masukan', () => {
  it('MENOLAK lebar atas melebihi lebar bawah', () => {
    expect(() => analisaPondasiMenerus({ ...MENERUS, lebarAtasM: 0.9 }))
      .toThrow(/menyempit ke atas/i)
  })

  it('MENOLAK kedalaman lebih kecil daripada tinggi pondasi', () => {
    /* Sebagian pondasi berada di atas muka tanah — masukannya pasti salah. */
    expect(() => analisaPondasiMenerus({ ...MENERUS, kedalamanM: 0.4 }))
      .toThrow(/di atas muka tanah/i)
  })

  it('menolak jenis karangan', () => {
    expect(() => analisaPondasiMenerus({ ...MENERUS, jenis: 'bambu' as never }))
      .toThrow(/tak dikenal/i)
  })

  it('menyebut penurunan yang BELUM diperiksa', () => {
    expect(analisaPondasiMenerus(MENERUS).catatan.join(' '))
      .toMatch(/penurunan|settlement/i)
  })
})

// ── RAFT ─────────────────────────────────────────────────────────────────────

const RAFT: InputRaft = {
  panjangM: 12, lebarM: 8, tebalMm: 400,
  bebanTotalKn: 4800,
  eksentrisitasXM: 0.5, eksentrisitasYM: 0.3,
  qaKnM2: 120,
  selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150,
  mutu: { fcMpa: 30, fyMpa: 400 },
  bentangKolomM: 4,
}

describe('raft — tekanan TEPI, bukan rata-rata', () => {
  it('tekanan rata-rata = P/A', () => {
    /* 4800 / (12 × 8) = 50 kPa */
    expect(analisaRaft(RAFT).tekanan.rataKnM2).toBeCloseTo(50, 3)
  })

  it('tekanan maksimum memperhitungkan eksentrisitas DUA arah', () => {
    /*
      fx = 6 × 0,5 / 12 = 0,25
      fy = 6 × 0,3 / 8  = 0,225
      q_maks = 50 × (1 + 0,25 + 0,225) = 73,75 kPa

      Menganggap tekanan merata menyembunyikan tepi yang 1,5× rata-rata — dan
      tepi itulah yang lebih dulu amblas.
    */
    const t = analisaRaft(RAFT).tekanan
    expect(t.maksKnM2).toBeCloseTo(73.75, 2)
    expect(t.maksKnM2).toBeGreaterThan(t.rataKnM2 * 1.4)
  })

  it('tekanan minimum = P/A · (1 − fx − fy)', () => {
    /* 50 × (1 − 0,475) = 26,25 kPa */
    expect(analisaRaft(RAFT).tekanan.minKnM2).toBeCloseTo(26.25, 2)
  })

  it('daya dukung dibandingkan TEPI, bukan rata-rata', () => {
    const p = analisaRaft(RAFT).periksa.find((x) => x.nama.includes('Daya dukung'))!
    expect(p.syarat).toBeCloseTo(73.75, 1)
    expect(p.rumus).toMatch(/TEPI/)
  })

  it('raft GAGAL bila TEPI melewati qa meski RATA-RATA masih aman', () => {
    /*
      ⚠ Test ini ada karena mutasi "pakai tekanan rata-rata" LOLOS tanpanya.

      Kasus di atas (qa 120) aman pada kedua tekanan, jadi menukar maks dengan
      rata-rata tak mengubah verdict apa pun. Yang benar-benar membedakan
      keduanya adalah qa yang jatuh DI ANTARA: rata-rata 50 kPa lolos, tepi
      73,75 kPa tidak.

      Inilah keadaan yang paling sering di lapangan — dan raft yang diluluskan
      berdasarkan rata-rata akan amblas di tepinya.
    */
    const h = analisaRaft({ ...RAFT, qaKnM2: 60 })
    expect(h.tekanan.rataKnM2).toBeLessThan(60)      // rata-rata lolos
    expect(h.tekanan.maksKnM2).toBeGreaterThan(60)   // tepi tidak
    expect(h.periksa.find((x) => x.nama.includes('Daya dukung'))!.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('beban terpusat sempurna → tekanan merata', () => {
    const t = analisaRaft({ ...RAFT, eksentrisitasXM: 0, eksentrisitasYM: 0 }).tekanan
    expect(t.maksKnM2).toBeCloseTo(t.rataKnM2, 4)
    expect(t.minKnM2).toBeCloseTo(t.rataKnM2, 4)
  })
})

describe('raft — tanah tak bisa menarik', () => {
  it('menandai raft yang sebagiannya TERANGKAT', () => {
    /*
      fx = 6 × 3 / 12 = 1,5 → q_min = 50 × (1 − 1,5) = −25 kPa

      Seluruh beban lalu dipikul luas yang lebih kecil, dan tekanan nyatanya
      JAUH LEBIH BESAR daripada rumus — yang tak lagi berlaku.
    */
    const h = analisaRaft({ ...RAFT, eksentrisitasXM: 3, eksentrisitasYM: 0 })
    expect(h.tekanan.terangkat).toBe(true)
    expect(h.periksa.find((x) => x.nama.includes('terangkat'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/tak lagi berlaku/i)
    expect(h.aman).toBe(false)
  })

  it('raft yang seimbang tidak terangkat', () => {
    expect(analisaRaft(RAFT).tekanan.terangkat).toBe(false)
  })
})

describe('raft — pelat & volume', () => {
  it('momen memakai tekanan TEPI dan koefisien L²/10', () => {
    /* 73,75 × 4² / 10 = 118 kNm/m */
    expect(analisaRaft(RAFT).antara.muKnm).toBeCloseTo(118, 1)
  })

  it('besi dihitung DUA ARAH, ATAS dan BAWAH — empat lapis', () => {
    /*
      Menghitung satu lapis saja kekurangan 75% besi pada elemen yang paling
      banyak besinya di seluruh bangunan.
    */
    const besi = analisaRaft(RAFT).volume.besi
    expect(besi).toHaveLength(2)
    /* arah X: ceil(8000/150)+1 = 55 baris × 2 lapis = 110 batang */
    expect(besi[0].jumlahBatang).toBe(110)
    expect(analisaRaft(RAFT).catatan.join(' ')).toMatch(/empat lapis/i)
  })

  it('beton = luas × tebal', () => {
    /* 96 × 0,4 = 38,4 m³ */
    expect(analisaRaft(RAFT).volume.betonM3).toBeCloseTo(38.4, 3)
  })

  it('bekisting hanya keliling tepi', () => {
    /* 2 × (12 + 8) × 0,4 = 16 m² */
    expect(analisaRaft(RAFT).volume.bekistingM2).toBeCloseTo(16, 3)
  })

  it('tulangan minimum 0,0018·b·h diperiksa', () => {
    /* 0,0018 × 1000 × 400 = 720 mm²/m */
    const p = analisaRaft(RAFT).periksa.find((x) => x.nama === 'Tulangan minimum')!
    expect(p.syarat).toBe(720)
  })

  it('MENOLAK tebal yang tak muat selimut dan tulangan', () => {
    expect(() => analisaRaft({ ...RAFT, tebalMm: 40 })).toThrow(/terlalu kecil/i)
  })

  it('menyebut batas pendekatan dan penurunan tak seragam', () => {
    const c = analisaRaft(RAFT).catatan.join(' ')
    expect(c).toMatch(/fondasi elastis/i)
    expect(c).toMatch(/penurunan TAK SERAGAM|tak seragam/i)
  })

  it('jumlah elemen mengalikan volume, bukan kapasitas', () => {
    const satu = analisaRaft(RAFT)
    const dua = analisaRaft({ ...RAFT, jumlah: 2 })
    expect(dua.volume.betonM3).toBeCloseTo(satu.volume.betonM3 * 2, 3)
    expect(dua.aman).toBe(satu.aman)
  })
})
