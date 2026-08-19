import { describe, it, expect } from 'vitest'
import {
  analisaGusset, analisaSambunganMomen,
  SUDUT_WHITMORE, BATAS_KAKU, BATAS_SENDI, PHI_LELEH, PHI_PUTUS,
  type InputGusset, type InputSambunganMomen,
} from '../struktur-baja-sambungan-lanjut'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PELAT BUHUL & SAMBUNGAN MOMEN
 *
 * Angka pembanding dihitung tangan mengikuti SNI 1729:2020, bukan disalin dari
 * keluaran kode.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const GUSSET: InputGusset = {
  tebalMm: 10, lebarSambunganMm: 150, panjangSambunganMm: 200, panjangBebasMm: 80,
  gayaKn: -300,
  mutu: { fyMpa: 240, fuMpa: 370 },
  agvMm2: 4000, anvMm2: 3000, antMm2: 1500,
}

describe('pelat buhul — lebar efektif Whitmore', () => {
  it('lebar efektif = lebar sambungan + 2·panjang·tan30°', () => {
    /*
      150 + 2 × 200 × 0,5774 = 150 + 230,94 = 380,94 mm

      BUKAN seluruh lebar pelat ikut bekerja: gaya menyebar 30° tiap sisi dari
      baris baut pertama. Memakai lebar penuh melebihkan kapasitas berkali
      lipat pada pelat lebar.
    */
    expect(analisaGusset(GUSSET).kapasitas.lebarWhitmoreMm).toBeCloseTo(380.94, 1)
    expect(SUDUT_WHITMORE).toBe(30)
  })

  it('sambungan yang lebih PANJANG memberi lebar efektif lebih besar', () => {
    /* Gaya punya lebih banyak ruang untuk menyebar. */
    const pendek = analisaGusset({ ...GUSSET, panjangSambunganMm: 100 })
    const panjang = analisaGusset({ ...GUSSET, panjangSambunganMm: 300 })
    expect(panjang.kapasitas.lebarWhitmoreMm)
      .toBeGreaterThan(pendek.kapasitas.lebarWhitmoreMm)
  })

  it('leleh tarik = φ·Fy·lebar_Whitmore·t', () => {
    /* 0,9 × 240 × 380,94 × 10 / 1000 = 822,8 kN */
    expect(analisaGusset(GUSSET).kapasitas.phiTarikLelehKn).toBeCloseTo(822.8, 0)
    expect(PHI_LELEH).toBe(0.9)
  })
})

describe('pelat buhul — sobek blok', () => {
  it('memakai yang TERKECIL dari dua jalur', () => {
    /*
      1) 0,6×370×3000 + 1,0×370×1500 = 666.000 + 555.000 = 1.221.000 N
      2) 0,6×240×4000 + 1,0×370×1500 = 576.000 + 555.000 = 1.131.000 N
      φ × min = 0,75 × 1.131.000 = 848,25 kN
    */
    expect(analisaGusset(GUSSET).kapasitas.phiSobekBlokKn).toBeCloseTo(848.25, 1)
    expect(PHI_PUTUS).toBe(0.75)
  })

  it('sobek blok adalah kegagalan PELAT, bukan bautnya', () => {
    /*
      Sepotong pelat tercabut UTUH mengikuti garis baut. Ia bisa terjadi meski
      setiap bautnya cukup — karena itu ia diperiksa terpisah.
    */
    const h = analisaGusset(GUSSET)
    expect(h.periksa.some((p) => p.nama === 'Sobek blok')).toBe(true)
  })
})

describe('pelat buhul — TEKUK, yang paling sering dilewatkan', () => {
  it('tekuk diperiksa untuk batang TEKAN', () => {
    const h = analisaGusset(GUSSET)
    expect(h.periksa.some((p) => p.nama.includes('Tekuk'))).toBe(true)
    expect(h.kapasitas.phiTekukKn).toBeGreaterThan(0)
  })

  it('tekuk TIDAK diperiksa untuk batang TARIK, dan itu dijelaskan', () => {
    /*
      Pada batang tarik tekuk tak berlaku. Tetapi pada batang TEKAN ia justru
      paling sering mengendalikan — dan paling sering dilewatkan, karena
      perancang memeriksa bautnya, memeriksa lasnya, dan pelatnya sendiri
      melengkung keluar bidang.
    */
    const tarik = analisaGusset({ ...GUSSET, gayaKn: 300 })
    expect(tarik.periksa.some((p) => p.nama.includes('Tekuk'))).toBe(false)
    expect(tarik.kapasitas.phiTekukKn).toBe(0)
    expect(tarik.catatan.join(' ')).toMatch(/paling sering dilewatkan/i)
  })

  it('pelat TIPIS dengan panjang bebas PANJANG gagal tekuk', () => {
    /*
      Kelangsingan = 1,2 × L_bebas / (t/√12). Pelat 6 mm dengan bebas 300 mm
      → sangat langsing, dan tekuknya KELUAR BIDANG — arah yang tak terlihat
      pada gambar sambungan.
    */
    const h = analisaGusset({ ...GUSSET, tebalMm: 6, panjangBebasMm: 300 })
    expect(h.kapasitas.kelangsingan).toBeGreaterThan(100)
    expect(h.periksa.find((p) => p.nama.includes('Tekuk'))!.aman).toBe(false)
    expect(h.catatan.join(' ')).toMatch(/KELUAR BIDANG/i)
    expect(h.aman).toBe(false)
  })

  it('pelat TEBAL dengan bebas pendek aman terhadap tekuk', () => {
    const h = analisaGusset({ ...GUSSET, tebalMm: 16, panjangBebasMm: 50 })
    expect(h.periksa.find((p) => p.nama.includes('Tekuk'))!.aman).toBe(true)
  })

  it('menyebut interaksi beberapa batang yang BELUM diperiksa', () => {
    /*
      Pelat yang cukup untuk tiap batang sendiri-sendiri bisa gagal saat
      semuanya bekerja bersamaan — dan itu keadaan yang sebenarnya.
    */
    expect(analisaGusset(GUSSET).catatan.join(' ')).toMatch(/bersamaan/i)
  })

  it('menolak gaya nol', () => {
    expect(() => analisaGusset({ ...GUSSET, gayaKn: 0 })).toThrow()
  })
})

// ── SAMBUNGAN MOMEN ──────────────────────────────────────────────────────────

const MOMEN: InputSambunganMomen = {
  tipe: 'pelat_ujung',
  tinggiBalokMm: 400, tebalSayapMm: 13, lebarSayapMm: 200,
  muKnm: 150, vuKn: 80,
  inersiaBalokMm4: 2.37e8, bentangM: 6,
  kekakuanKnmPerRad: 50_000,
  asBautTarikMm2: 1200, fuBautMpa: 800,
  mutu: { fyMpa: 240, fuMpa: 370 },
}

describe('sambungan momen — KEKAKUAN, bukan hanya kekuatan', () => {
  it('kekakuan relatif = Ki·L / (E·Ib)', () => {
    /*
      50.000 kNm/rad × 1e6 × 6000 / (200.000 × 2,37e8) = 6,33

      Batas kaku 20 — jadi sambungan ini SEMI-RIGID meski kekakuannya terdengar
      besar. Inilah kesalahan paling mahal: menganggap sambungan yang
      "kelihatan kaku" benar-benar kaku.
    */
    const k = analisaSambunganMomen(MOMEN).klasifikasi
    expect(k.kekakuanRelatif).toBeCloseTo(6.33, 1)
    expect(k.kelas).toBe('semi-rigid')
  })

  it('sambungan SEMI-RIGID membuat seluruh hasilnya TIDAK aman', () => {
    /*
      ⚠ Test ini ada karena mutasi "kekakuan tak diperiksa" LOLOS tanpanya.

      Test-test lain memeriksa KLASIFIKASINYA (semi-rigid/kaku/sendi) dan
      catatan penjelasnya, tetapi tak satu pun memeriksa bahwa klasifikasi itu
      benar-benar MEMENGARUHI verdict. Melumpuhkan pemeriksaannya tak
      memerahkan apa pun.

      Ini yang paling penting dari seluruh modul: sambungan yang dihitung
      sebagai kaku tetapi sebenarnya semi-rigid harus GAGAL, bukan sekadar
      diberi catatan yang bisa dilewati.
    */
    const h = analisaSambunganMomen(MOMEN)
    expect(h.klasifikasi.kelas).toBe('semi-rigid')
    expect(h.periksa.find((p) => p.nama.includes('Kekakuan'))!.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('sambungan yang cukup kaku diklasifikasi KAKU', () => {
    const h = analisaSambunganMomen({ ...MOMEN, kekakuanKnmPerRad: 200_000 })
    expect(h.klasifikasi.kelas).toBe('kaku')
    expect(h.periksa.find((p) => p.nama.includes('Kekakuan'))!.aman).toBe(true)
  })

  it('sambungan yang sangat lentur diklasifikasi SENDI', () => {
    const h = analisaSambunganMomen({ ...MOMEN, kekakuanKnmPerRad: 10_000 })
    expect(h.klasifikasi.kelas).toBe('sendi')
    expect(BATAS_SENDI).toBe(2)
    expect(BATAS_KAKU).toBe(20)
  })

  it('MENJELASKAN akibat sambungan yang tidak kaku', () => {
    /*
      Momen yang dihitung TIDAK SAMPAI ke sambungan, dan momen lapangan justru
      lebih besar daripada yang direncanakan — balok yang dirancang sebagai
      menerus berperilaku lebih dekat ke tumpuan sederhana.
    */
    const c = analisaSambunganMomen(MOMEN).catatan.join(' ')
    expect(c).toMatch(/TIDAK SAMPAI/i)
    expect(c).toMatch(/momen lapangan/i)
  })
})

describe('sambungan momen — kopel sayap', () => {
  it('gaya sayap = Mu / lengan kopel', () => {
    /*
      lengan = 400 − 13 = 387 mm
      T = 150 × 1e6 / 387 / 1000 = 387,6 kN

      Jauh lebih besar daripada geser baloknya (80 kN) — dan itu yang
      menentukan jumlah bautnya.
    */
    expect(analisaSambunganMomen(MOMEN).kapasitas.gayaSayapKn).toBeCloseTo(387.6, 0)
  })

  it('kapasitas momen = kapasitas baut × lengan', () => {
    /*
      φRn = 0,75 × 0,75 × 800 × 1200 / 1000 = 540 kN
      φMn = 540 × 387 / 1000 = 209 kNm
    */
    const k = analisaSambunganMomen(MOMEN).kapasitas
    expect(k.phiTarikBautKn).toBeCloseTo(540, 0)
    expect(k.phiMomenKnm).toBeCloseTo(209, 0)
  })

  it('memeriksa leleh sayap balok, bukan hanya bautnya', () => {
    /*
      Baut boleh cukup sementara sayap baloknya yang leleh — dan sayap yang
      leleh membuat sambungan berputar meski bautnya utuh.
    */
    const h = analisaSambunganMomen(MOMEN)
    expect(h.periksa.some((p) => p.nama.includes('Leleh sayap'))).toBe(true)
  })

  it('menandai momen yang melebihi kapasitas', () => {
    const h = analisaSambunganMomen({ ...MOMEN, muKnm: 400 })
    expect(h.periksa.find((p) => p.nama === 'Kapasitas momen')!.aman).toBe(false)
    expect(h.aman).toBe(false)
  })

  it('siku sayap diperingatkan hampir selalu semi-rigid', () => {
    expect(analisaSambunganMomen({ ...MOMEN, tipe: 'siku_sayap' }).catatan.join(' '))
      .toMatch(/hampir selalu semi-rigid/i)
  })

  it('menyebut panel zone & prying yang BELUM diperiksa', () => {
    /*
      Panel zone yang lemah membuat sambungan berputar meski bautnya cukup —
      dan itu mengubah kelasnya dari kaku jadi semi-rigid.
    */
    const c = analisaSambunganMomen(MOMEN).catatan.join(' ')
    expect(c).toMatch(/panel zone/i)
    expect(c).toMatch(/prying/i)
  })

  it('menolak tipe karangan', () => {
    expect(() => analisaSambunganMomen({ ...MOMEN, tipe: 'dilem' as never }))
      .toThrow(/tak dikenal/i)
  })
})
