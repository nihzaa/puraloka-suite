import { describe, it, expect } from 'vitest'
import {
  hitungJatuhTempo, ringkasBiayaAlat, nilaiKesehatanAlat, AMBANG_SEGERA,
} from '../alat-operasional.js'

const HARI_INI = '2026-08-07'

describe('hitungJatuhTempo', () => {
  // ── Inti modul: jam mengalahkan kalender ────────────────────────────────
  //
  // Excavator yang bekerja 300 jam dalam sebulan butuh ganti oli, meski
  // jadwal harian baru setengah jalan. Menghitung hanya dari tanggal adalah
  // cara paling umum alat rusak lebih cepat daripada seharusnya.
  it('JAM jatuh tempo meski kalender masih jauh', () => {
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Ganti oli mesin',
      setiap_jam: 250, setiap_hari: 180,
      jam_terakhir: 1000, tanggal_terakhir: '2026-07-20',   // baru 18 hari
    }, 1260, HARI_INI)                                       // 260 jam terpakai

    expect(h.status).toBe('jatuh_tempo')
    expect(h.pemicu).toBe('jam')
    expect(h.sisaJam).toBe(-10)
    // Kalendernya masih longgar — dan itu justru yang menyesatkan.
    expect(h.sisaHari).toBeGreaterThan(100)
  })

  it('KALENDER jatuh tempo meski jamnya masih jauh', () => {
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Kalibrasi tahunan',
      setiap_jam: 2000, setiap_hari: 365,
      jam_terakhir: 500, tanggal_terakhir: '2025-06-01',
    }, 600, HARI_INI)

    expect(h.status).toBe('jatuh_tempo')
    expect(h.pemicu).toBe('hari')
    expect(h.sisaJam).toBe(1900)          // jamnya masih sangat longgar
  })

  it('alat yang BELUM PERNAH dirawat tetap punya jatuh tempo pertama', () => {
    // Acuannya nol jam, bukan "tak bisa dihitung". Alat baru yang belum
    // pernah diservis TETAP jatuh tempo saat mencapai intervalnya.
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Servis pertama', setiap_jam: 100,
      jam_terakhir: null, tanggal_terakhir: null,
    }, 120, HARI_INI)

    expect(h.status).toBe('jatuh_tempo')
    expect(h.sisaJam).toBe(-20)
  })

  it('"segera" pada 80% menuju ambang — waktunya menjadwalkan', () => {
    expect(AMBANG_SEGERA).toBe(0.8)
    // Interval 250 jam; sisa 40 jam = 16% → di bawah 20%, jadi "segera".
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Ganti oli', setiap_jam: 250, jam_terakhir: 1000,
    }, 1210, HARI_INI)
    expect(h.status).toBe('segera')
    expect(h.pemicu).toBe('jam')
  })

  it('masih "aman" saat baru separuh jalan', () => {
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Ganti oli', setiap_jam: 250, jam_terakhir: 1000,
    }, 1125, HARI_INI)
    expect(h.status).toBe('aman')
    expect(h.sisaJam).toBe(125)
  })

  it('jadwal tanpa acuan sama sekali dinyatakan, bukan diam-diam "aman"', () => {
    // Hanya punya interval HARI, tapi belum pernah dirawat → tak ada
    // tanggal acuan. Menyebutnya "aman" berarti jadwal yang tak pernah
    // jatuh tempo terlihat seperti alat yang terawat.
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Servis berkala', setiap_hari: 90,
      tanggal_terakhir: null,
    }, null, HARI_INI)
    expect(h.status).toBe('belum_ada_acuan')
    expect(h.pemicu).toBeNull()
  })

  it('keduanya lewat → pemicu yang PALING JAUH terlewati yang disebut', () => {
    const h = hitungJatuhTempo({
      id: 'x', nama: 'Servis', setiap_jam: 100, setiap_hari: 30,
      jam_terakhir: 500, tanggal_terakhir: '2026-06-01',
    }, 700, HARI_INI)   // jam: -100 · hari: sudah lewat ~37 hari

    expect(h.status).toBe('jatuh_tempo')
    expect(h.sisaJam).toBe(-100)
    expect(h.sisaHari).toBeLessThan(0)
    // -100 jam lebih jauh terlewati daripada -37 hari.
    expect(h.pemicu).toBe('jam')
  })
})

describe('ringkasBiayaAlat', () => {
  const BIAYA = [
    { jenis: 'bbm', jumlah: 4_500_000, kuantitas: 300 },
    { jenis: 'bbm', jumlah: 3_000_000, kuantitas: 200 },
    { jenis: 'operator', jumlah: 6_000_000 },
    { jenis: 'pelumas', jumlah: 800_000 },
  ]

  it('menjumlah per jenis dan total', () => {
    const h = ringkasBiayaAlat(BIAYA, 250)
    expect(h.total).toBe(14_300_000)
    expect(h.perJenis.bbm).toBe(7_500_000)
    expect(h.perJenis.operator).toBe(6_000_000)
  })

  it('biaya per jam dihitung dari jam operasi', () => {
    const h = ringkasBiayaAlat(BIAYA, 250)
    expect(h.perJam).toBe(57_200)          // 14.300.000 / 250
    expect(h.bbmPerJam).toBe(2)            // 500 liter / 250 jam
  })

  // ── Cacat kedua: pembagian dengan nol ───────────────────────────────────
  it('jam operasi NOL → perJam `null`, BUKAN Infinity atau angka besar', () => {
    const h = ringkasBiayaAlat(BIAYA, 0)
    // `Infinity` dirender jadi "∞", atau lebih buruk: dibulatkan jadi angka
    // besar yang terlihat masuk akal. Yang benar: tak bisa dihitung.
    expect(h.perJam).toBeNull()
    expect(h.bbmPerJam).toBeNull()
    // Totalnya tetap benar — yang tak bisa dihitung cuma rasionya.
    expect(h.total).toBe(14_300_000)
  })

  it('jam operasi null diperlakukan sama dengan nol', () => {
    expect(ringkasBiayaAlat(BIAYA, null).perJam).toBeNull()
    expect(ringkasBiayaAlat(BIAYA, undefined).perJam).toBeNull()
  })

  it('string NUMERIC dihitung sebagai ANGKA, bukan digabung sebagai teks', () => {
    // DUA baris, bukan satu. Dengan satu baris, `"1000000"` yang tak
    // dikonversi tetap membulat ke angka yang sama — cacatnya tak terlihat.
    // Dengan dua, `0 + "1000000" + "500000"` jadi `"01000000500000"`.
    const h = ringkasBiayaAlat([
      { jenis: 'bbm', jumlah: '1000000', kuantitas: '100' },
      { jenis: 'operator', jumlah: '500000' },
    ], '50')
    expect(h.total).toBe(1_500_000)
    expect(h.perJenis.bbm).toBe(1_000_000)
    expect(h.perJam).toBe(30_000)
    expect(h.bbmPerJam).toBe(2)
  })

  // ── Cacat keempat, ditemukan saat MELIHAT layarnya ──────────────────────
  //
  // Dump truck dengan 4 kerusakan mendadak senilai Rp 19,85 juta tampil
  // "Rp 0" karena tak sekali pun mengisi BBM lewat modul ini. Alat yang
  // paling sering rusak jadi terlihat PALING MURAH — peringkatnya terbalik.
  it('biaya PERAWATAN ikut dijumlah, bukan hanya biaya operasional', () => {
    const h = ringkasBiayaAlat(
      [{ jenis: 'bbm', jumlah: 1_000_000, kuantitas: 60 }],
      100,
      [{ biaya: 5_800_000 }, { biaya: 3_200_000 }])

    expect(h.total).toBe(10_000_000)
    // Servis punya jenisnya sendiri: "boros BBM" dan "sering rusak"
    // menuntut tindakan berbeda.
    expect(h.perJenis.perawatan).toBe(9_000_000)
    expect(h.perJenis.bbm).toBe(1_000_000)
    expect(h.perJam).toBe(100_000)
  })

  it('alat TANPA biaya operasional tapi mahal servisnya tetap terlihat mahal', () => {
    const h = ringkasBiayaAlat([], 200, [{ biaya: 19_850_000 }])
    expect(h.total).toBe(19_850_000)
    expect(h.perJam).toBe(99_250)
    // Bukan Rp 0 — itu yang membalik peringkat alat.
    expect(h.total).not.toBe(0)
  })

  it('tanpa riwayat perawatan, `perawatan` tak muncul sebagai jenis nol', () => {
    const h = ringkasBiayaAlat([{ jenis: 'bbm', jumlah: 500_000 }], 50, [])
    expect(h.perJenis.perawatan).toBeUndefined()
    expect(h.total).toBe(500_000)
  })

  it('tanpa BBM sama sekali, bbmPerJam `null` bukan 0', () => {
    const h = ringkasBiayaAlat([{ jenis: 'operator', jumlah: 1_000_000 }], 100)
    expect(h.bbmPerJam).toBeNull()
    expect(h.perJam).toBe(10_000)
  })
})

describe('nilaiKesehatanAlat', () => {
  // ── Cacat ketiga: "sering dirawat" yang sebenarnya "sering rusak" ────────
  it('rasio mendadak tinggi berarti preventif GAGAL, bukan alat terawat', () => {
    const h = nilaiKesehatanAlat([
      { tak_terjadwal: false }, { tak_terjadwal: false },
      { tak_terjadwal: true }, { tak_terjadwal: true }, { tak_terjadwal: true },
    ])
    expect(h.servisTerjadwal).toBe(2)
    expect(h.servisMendadak).toBe(3)
    expect(h.rasioMendadak).toBe(60)
    // 20 servis terdengar seperti alat yang dirawat baik. Kalau 12 di
    // antaranya mendadak, yang sebenarnya terjadi adalah kerusakan berulang.
    expect(h.preventifGagal).toBe(true)
  })

  it('mayoritas terjadwal → preventif bekerja', () => {
    const h = nilaiKesehatanAlat([
      { tak_terjadwal: false }, { tak_terjadwal: false },
      { tak_terjadwal: false }, { tak_terjadwal: true },
    ])
    expect(h.rasioMendadak).toBe(25)
    expect(h.preventifGagal).toBe(false)
  })

  it('tepat 50% sudah dianggap gagal — separuhnya kerusakan', () => {
    const h = nilaiKesehatanAlat([{ tak_terjadwal: true }, { tak_terjadwal: false }])
    expect(h.rasioMendadak).toBe(50)
    expect(h.preventifGagal).toBe(true)
  })

  it('belum ada servis → rasio `null`, bukan 0', () => {
    const h = nilaiKesehatanAlat([])
    // 0% terbaca "tak pernah rusak" — padahal yang benar "belum ada datanya".
    expect(h.rasioMendadak).toBeNull()
    expect(h.preventifGagal).toBe(false)
  })
})
