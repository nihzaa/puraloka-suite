/**
 * LAJU PEMAKAIAN ALAT — mengubah "sisa jam" jadi "sisa hari".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rute `perawatan-alat` (10.7) menulis batasannya sendiri di komentar:
 *
 *     "Jam TAK punya padanan 'N hari sebelum'. Ambang hari bisa dibaca sebagai
 *      kalender; ambang jam tidak — 14 jam operasi bisa habis dalam dua hari
 *      atau dua bulan tergantung alatnya."
 *
 * Akibatnya ia DIAM sampai jam servis benar-benar terlewat. Diukur pada basis
 * nyata 2026-08-16, Truk Mixer 7 m3 memakai 6,7 jam/hari dengan sisa 190 jam —
 * jatuh tempo 28 hari lagi, dan tak ada satu pun peringatan sampai hari H.
 *
 * Fungsi yang diuji di sini memberi jam padanan hari itu. Yang diuji bukan
 * "angkanya keluar", melainkan tiga cara ia bisa salah DALAM DIAM.
 */
import { describe, it, expect } from 'vitest'
import { hitungLajuPakai, prediksiHariDariJam } from '../alat-operasional.js'

describe('hitungLajuPakai', () => {
  it('menghitung jam per hari dari pembacaan meter sungguhan', () => {
    // Angka Truk Mixer 7 m3 dari basis: 2150 → 2210 dalam 9 hari.
    const h = hitungLajuPakai([
      { tanggal: '2026-07-28', jam: 2150 },
      { tanggal: '2026-08-01', jam: 2180 },
      { tanggal: '2026-08-06', jam: 2210 },
    ], 3)
    expect(h.sebab).toBe('cukup')
    expect(h.perHari).toBeCloseTo(6.67, 1)
    expect(h.rentangHari).toBe(9)
  })

  it('urutan masukan tidak mengubah hasil', () => {
    // Data dari basis tidak dijamin urut. Kalau fungsi ini memakai elemen
    // pertama/terakhir tanpa menyortir, lajunya jadi negatif atau nol untuk
    // masukan yang sah — dan itu tak melempar apa pun.
    const urut = hitungLajuPakai([
      { tanggal: '2026-08-01', jam: 100 },
      { tanggal: '2026-08-11', jam: 200 },
    ], 2)
    const acak = hitungLajuPakai([
      { tanggal: '2026-08-11', jam: 200 },
      { tanggal: '2026-08-01', jam: 100 },
    ], 2)
    expect(acak.perHari).toBe(urut.perHari)
    expect(acak.perHari).toBe(10)
  })

  it('METER MUNDUR dianggap tak bergerak, BUKAN laju negatif', () => {
    /*
      Ini cacat yang paling mahal kalau lolos.

      Jam-meter tak bisa mundur; kalau angkanya turun, itu penggantian unit,
      salah ketik, atau meter di-reset. Laju negatif membuat prediksi jatuh
      tempo mundur ke MASA LALU, dan alat yang baru saja diservis langsung
      diperingatkan "sudah lewat" — persis kebalikan dari yang benar.

      Tak ada galat yang muncul. Yang terlihat cuma peringatan yang salah, dan
      orang berhenti mempercayai seluruh peringatan perawatan.
    */
    const h = hitungLajuPakai([
      { tanggal: '2026-08-01', jam: 900 },
      { tanggal: '2026-08-11', jam: 400 },
    ], 2)
    expect(h.perHari).toBeNull()
    expect(h.sebab).toBe('tak_bergerak')
  })

  it('membedakan "kurang data" dari "tak bergerak" — keduanya null', () => {
    // Dua sebab berbeda, satu nilai kembalian. Memperlakukannya sama membuat
    // alat yang menganggur dilaporkan sebagai alat yang datanya kurang, dan
    // orang mencari masalah pencatatan yang tak ada.
    const kurang = hitungLajuPakai([{ tanggal: '2026-08-01', jam: 100 }], 2)
    expect(kurang.perHari).toBeNull()
    expect(kurang.sebab).toBe('kurang_pembacaan')

    const sehari = hitungLajuPakai([
      { tanggal: '2026-08-01', jam: 100 },
      { tanggal: '2026-08-01', jam: 108 },
    ], 2)
    expect(sehari.sebab).toBe('rentang_nol')
  })

  it('menghormati minPembacaan — laju dari dua titik terlalu rapuh', () => {
    const dua = [
      { tanggal: '2026-08-01', jam: 100 },
      { tanggal: '2026-08-11', jam: 200 },
    ]
    expect(hitungLajuPakai(dua, 2).sebab).toBe('cukup')
    expect(hitungLajuPakai(dua, 3).sebab).toBe('kurang_pembacaan')
  })

  it('pembacaan tanpa angka jam dibuang, bukan dihitung sebagai nol', () => {
    // `jam: null` yang dianggap 0 membuat meter terlihat MUNDUR dari 100 ke 0,
    // lalu naik lagi — laju karangan dari data yang sebenarnya tak ada.
    const h = hitungLajuPakai([
      { tanggal: '2026-08-01', jam: 100 },
      { tanggal: '2026-08-05', jam: null },
      { tanggal: '2026-08-11', jam: 200 },
    ], 2)
    expect(h.pembacaan).toBe(2)
    expect(h.perHari).toBe(10)
  })
})

describe('prediksiHariDariJam', () => {
  it('mengubah sisa jam jadi sisa hari memakai laju', () => {
    // Truk Mixer: sisa 190 jam pada 6,7 jam/hari.
    expect(prediksiHariDariJam(190, 6.67)).toBe(29)
  })

  it('membulatkan KE ATAS — 0,3 hari lagi bukan "sudah lewat"', () => {
    // `Math.round` di sini memulangkan 0, dan 0 terbaca "jatuh tempo hari ini
    // atau sudah lewat". Membulatkan ke bawah menunda peringatan sehari untuk
    // alat yang justru paling mendesak.
    expect(prediksiHariDariJam(2, 6.7)).toBe(1)
  })

  it('laju nol atau tak diketahui memulangkan null, bukan Infinity', () => {
    // Pembagian dengan nol menghasilkan Infinity, dan `Infinity <= ambang`
    // bernilai false — jadi alatnya diam-diam tak pernah diperingatkan.
    // Yang lebih buruk: `Infinity` yang lolos ke pesan tertulis "Infinity hari".
    expect(prediksiHariDariJam(190, 0)).toBeNull()
    expect(prediksiHariDariJam(190, null)).toBeNull()
    expect(prediksiHariDariJam(null, 6.7)).toBeNull()
  })

  it('sisa jam NEGATIF tetap dihitung — sudah lewat berapa hari', () => {
    // Excavator dari basis: sisa −18 jam pada 8,7 jam/hari. Memulangkan null
    // di sini akan menyembunyikan alat yang PALING terlambat.
    expect(prediksiHariDariJam(-18, 8.7)).toBeLessThan(0)
  })
})
