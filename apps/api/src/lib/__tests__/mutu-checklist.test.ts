import { describe, it, expect } from 'vitest'
import {
  ringkasChecklist, nilaiUji, ringkasUji,
  type ButirChecklist, type BarisUji,
} from '../mutu-checklist.js'

/**
 * CHECKLIST INSPEKSI + HASIL UJI MATERIAL (G1d).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder mencabut seluruh larangan bangun 2026-08-11 (R-011). Dari 7
 * sub-item Mutu, dua ini benar-benar NOL TABEL sebelum migrasi 279.
 *
 * ── Kenapa "belum diperiksa" DIBEDAKAN dari "tidak lolos"
 *
 * `lolos` bertipe `boolean NULL`, dan ketiga nilainya berarti hal berbeda:
 *
 *   null   belum diperiksa   → butuh orang datang memeriksa
 *   true   lolos             → selesai
 *   false  tidak lolos       → butuh perbaikan, dan WAJIB beralasan
 *
 * Menyamakan `null` dengan `false` membuat inspeksi yang baru separuh jalan
 * terbaca sebagai "banyak yang gagal" — dan itu memicu tindakan yang belum
 * perlu. Menyamakannya dengan `true` jauh lebih berbahaya: pekerjaan yang
 * belum diperiksa terhitung lolos.
 *
 * ── Kenapa kesimpulan uji TIDAK diturunkan dari angka
 *
 * Godaan terbesarnya: `nilai_hasil >= nilai_syarat ? 'memenuhi' : 'tidak'`.
 * Itu salah untuk sebagian besar uji nyata —
 *
 *   • sebagian uji tak punya ambang tunggal (gradasi, visual, kimia)
 *   • sebagian punya toleransi yang butuh penilaian ahli
 *   • sebagian dibaca TERBALIK (kadar lumpur: makin kecil makin baik)
 *
 * Menurunkannya otomatis akan menyatakan "tidak memenuhi" untuk hasil yang
 * masih dalam toleransi — dan pernyataan itu masuk sertifikat mutu.
 *
 * Yang dilakukan pustaka ini: **membandingkan, lalu melaporkan bahwa angka
 * dan kesimpulan manusia TIDAK COCOK** — tanpa mengubah kesimpulannya.
 */

const b = (o: Partial<ButirChecklist>): ButirChecklist => ({
  id: 'x', urutan: 0, butir: 'Uji', acuan: null,
  lolos: null, catatan: null, ...o,
})

const u = (o: Partial<BarisUji>): BarisUji => ({
  id: 'x', nomor: 'UJI-001', objek: 'Beton K-250', jenis_uji: 'kuat tekan',
  nilai_hasil: null, nilai_syarat: null, satuan: null,
  kesimpulan: null, tanggal_uji: '2026-08-01', ncr_id: null, ...o,
})

describe('ringkasChecklist — tiga keadaan, bukan dua', () => {
  it('menghitung lolos, gagal, dan belum diperiksa terpisah', () => {
    const r = ringkasChecklist([
      b({ lolos: true }), b({ lolos: true }),
      b({ lolos: false, catatan: 'retak' }),
      b({ lolos: null }),
    ])
    expect(r.lolos).toBe(2)
    expect(r.gagal).toBe(1)
    expect(r.belum).toBe(1)
    expect(r.total).toBe(4)
  })

  // INVARIAN. Butir yang belum diperiksa terhitung lolos = pekerjaan yang
  // belum dicek dinyatakan benar.
  it('yang BELUM diperiksa tidak terhitung lolos', () => {
    const r = ringkasChecklist([b({ lolos: null }), b({ lolos: null })])
    expect(r.lolos).toBe(0)
    expect(r.belum).toBe(2)
  })

  // Persentase dihitung terhadap yang SUDAH diperiksa, bukan terhadap total.
  // Inspeksi yang baru 2 dari 10 butir dan keduanya lolos adalah "100% dari
  // yang diperiksa", bukan "20% lolos" — yang kedua terbaca seperti kegagalan.
  it('persen lolos dihitung dari yang SUDAH diperiksa', () => {
    const r = ringkasChecklist([
      b({ lolos: true }), b({ lolos: true }),
      b({ lolos: null }), b({ lolos: null }), b({ lolos: null }),
    ])
    expect(r.pct_lolos).toBe(100)
    expect(r.pct_selesai).toBe(40)
  })

  // Nol butir diperiksa → persen tak bisa dihitung. `null`, BUKAN 0:
  // nol persen berarti "semua gagal", dan itu klaim yang tak dimiliki datanya.
  it('persen null saat belum ada yang diperiksa, bukan 0', () => {
    const r = ringkasChecklist([b({ lolos: null })])
    expect(r.pct_lolos).toBeNull()
  })

  it('daftar kosong tidak melempar', () => {
    const r = ringkasChecklist([])
    expect(r.total).toBe(0)
    expect(r.pct_lolos).toBeNull()
  })

  // Inspeksi dinyatakan tuntas hanya bila SELURUH butir sudah diperiksa.
  it('selesai hanya bila nol butir tersisa', () => {
    expect(ringkasChecklist([b({ lolos: true }), b({ lolos: null })]).selesai).toBe(false)
    expect(ringkasChecklist([b({ lolos: true }), b({ lolos: false, catatan: 'x' })]).selesai).toBe(true)
  })

  // Butir gagal dibawa keluar supaya bisa langsung ditindaklanjuti —
  // mencarinya sendiri di daftar 30 butir adalah pekerjaan yang tak perlu.
  it('butir yang GAGAL dibawa terpisah beserta catatannya', () => {
    const r = ringkasChecklist([
      b({ id: 'a', lolos: true }),
      b({ id: 'g', butir: 'Kerataan lantai', lolos: false, catatan: 'beda 8mm' }),
    ])
    expect(r.yang_gagal).toHaveLength(1)
    expect(r.yang_gagal[0].butir).toBe('Kerataan lantai')
    expect(r.yang_gagal[0].catatan).toBe('beda 8mm')
  })
})

describe('nilaiUji — angka DIBANDINGKAN, kesimpulan TIDAK diubah', () => {
  it('meneruskan kesimpulan manusia apa adanya', () => {
    expect(nilaiUji(u({ kesimpulan: 'memenuhi' })).kesimpulan).toBe('memenuhi')
    expect(nilaiUji(u({ kesimpulan: 'tidak_memenuhi' })).kesimpulan).toBe('tidak_memenuhi')
  })

  // INVARIAN INTI. Menebak kesimpulan dari angka salah untuk uji yang dibaca
  // terbalik (kadar lumpur), tak berambang tunggal (gradasi), atau bertoleransi.
  it('TIDAK menebak kesimpulan saat manusia belum mengisinya', () => {
    const h = nilaiUji(u({ nilai_hasil: 300, nilai_syarat: 250, kesimpulan: null }))
    expect(h.kesimpulan).toBeNull()
    expect(h.perlu_kesimpulan).toBe(true)
  })

  it('nilai di atas syarat ditandai memadai', () => {
    const h = nilaiUji(u({ nilai_hasil: 300, nilai_syarat: 250 }))
    expect(h.selisih).toBe(50)
    expect(h.angka_memadai).toBe(true)
  })

  it('nilai di bawah syarat ditandai tidak memadai', () => {
    const h = nilaiUji(u({ nilai_hasil: 200, nilai_syarat: 250 }))
    expect(h.selisih).toBe(-50)
    expect(h.angka_memadai).toBe(false)
  })

  // Ini yang membuat pustaka ini berguna: angka bilang cukup, manusia bilang
  // tidak — atau sebaliknya. Keduanya bisa benar (toleransi, uji terbalik),
  // tapi selisih itu harus TERLIHAT supaya bisa ditanyakan.
  it('angka dan kesimpulan yang BERTENTANGAN ditandai', () => {
    const kurang = nilaiUji(u({ nilai_hasil: 200, nilai_syarat: 250, kesimpulan: 'memenuhi' }))
    expect(kurang.bertentangan).toBe(true)

    const lebih = nilaiUji(u({ nilai_hasil: 300, nilai_syarat: 250, kesimpulan: 'tidak_memenuhi' }))
    expect(lebih.bertentangan).toBe(true)
  })

  it('angka dan kesimpulan yang SEJALAN tidak ditandai', () => {
    expect(nilaiUji(u({ nilai_hasil: 300, nilai_syarat: 250, kesimpulan: 'memenuhi' })).bertentangan).toBe(false)
    expect(nilaiUji(u({ nilai_hasil: 200, nilai_syarat: 250, kesimpulan: 'tidak_memenuhi' })).bertentangan).toBe(false)
  })

  // `perlu_uji_ulang` bukan penilaian lolos/gagal — ia menyatakan hasilnya
  // belum bisa dipakai. Menandainya bertentangan akan salah.
  it('perlu_uji_ulang tidak pernah dianggap bertentangan', () => {
    expect(nilaiUji(u({ nilai_hasil: 200, nilai_syarat: 250, kesimpulan: 'perlu_uji_ulang' })).bertentangan).toBe(false)
  })

  it('tanpa syarat, tak ada yang bisa dibandingkan', () => {
    const h = nilaiUji(u({ nilai_hasil: 300, nilai_syarat: null, kesimpulan: 'memenuhi' }))
    expect(h.selisih).toBeNull()
    expect(h.angka_memadai).toBeNull()
    expect(h.bertentangan).toBe(false)
  })

  // Postgres `numeric` tiba sebagai STRING, dan MENERIMA NaN.
  it('numeric berbentuk string dibandingkan sebagai angka', () => {
    const h = nilaiUji(u({ nilai_hasil: '300.5000' as never, nilai_syarat: '250.0000' as never }))
    expect(h.selisih).toBeCloseTo(50.5, 4)
  })

  it('nilai NaN tidak menghasilkan NaN di keluaran', () => {
    const h = nilaiUji(u({ nilai_hasil: 'NaN' as never, nilai_syarat: 250 }))
    expect(h.selisih).toBeNull()
    expect(h.angka_memadai).toBeNull()
  })
})

describe('ringkasUji — daftar untuk dibaca manusia', () => {
  const daftar = [
    u({ id: 'a', kesimpulan: 'memenuhi', nilai_hasil: 300, nilai_syarat: 250 }),
    u({ id: 'b', kesimpulan: 'tidak_memenuhi', nilai_hasil: 200, nilai_syarat: 250 }),
    u({ id: 'c', kesimpulan: null, nilai_hasil: 280, nilai_syarat: 250 }),
    u({ id: 'd', kesimpulan: 'perlu_uji_ulang' }),
  ]

  it('menghitung per kesimpulan', () => {
    const r = ringkasUji(daftar)
    expect(r.memenuhi).toBe(1)
    expect(r.tidak_memenuhi).toBe(1)
    expect(r.perlu_uji_ulang).toBe(1)
    expect(r.belum_disimpulkan).toBe(1)
  })

  // Yang TIDAK MEMENUHI naik ke atas — itu satu-satunya yang menuntut
  // tindakan, dan daftar yang menaruhnya di bawah membuatnya tak dibaca.
  it('yang tidak memenuhi diurutkan paling atas', () => {
    expect(ringkasUji(daftar).baris[0].kesimpulan).toBe('tidak_memenuhi')
  })

  it('menghitung berapa yang angkanya bertentangan dengan kesimpulan', () => {
    const r = ringkasUji([
      u({ nilai_hasil: 200, nilai_syarat: 250, kesimpulan: 'memenuhi' }),
      u({ nilai_hasil: 300, nilai_syarat: 250, kesimpulan: 'memenuhi' }),
    ])
    expect(r.bertentangan).toBe(1)
  })

  it('daftar kosong tidak melempar', () => {
    expect(ringkasUji([]).baris).toEqual([])
  })
})
