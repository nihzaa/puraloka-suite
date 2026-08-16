/**
 * KEBIASAAN BAYAR KLIEN — yang diuji adalah cara ia bisa DIAM, bukan angkanya.
 *
 * Angka acuan dari basis nyata 2026-08-16:
 *
 *   Ratna Sari      2 invoice   rata +33 hari   terparah  67
 *   Eko Prasetyo    3 invoice   rata +31 hari   terparah  98
 *   Melati Indah    3 invoice   rata  −2 hari
 */
import { describe, it, expect } from 'vitest'
import { nilaiKebiasaanBayar } from '../kebiasaan-bayar.js'

const R = (selisihHari: number, nominal = 1_000_000) => ({ selisihHari, nominal })

describe('nilaiKebiasaanBayar', () => {
  it('menandai klien yang rata-rata telat', () => {
    // Eko Prasetyo: 98, −3, −2 → rata +31.
    const h = nilaiKebiasaanBayar([R(98), R(-3), R(-2)], 2, 14, 0.5)
    expect(h.layakLapor).toBe(true)
    expect(h.sebab).toBe('rata_rata_telat')
    expect(h.rataSelisih).toBeCloseTo(31, 0)
    expect(h.palingTelat).toBe(98)
  })

  it('MEMBAYAR LEBIH AWAL TIDAK BOLEH MENUTUPI TAGIHAN MACET', () => {
    /*
      Ini cacat yang paling mudah lolos, dan paling mahal.

      Satu invoice telat 98 hari + satu invoice 90 hari lebih awal menghasilkan
      rata-rata +4 — di bawah ambang mana pun yang masuk akal. Klien yang
      separuh tagihannya macet tiga bulan terlihat sehat, dan tak ada satu pun
      gejala selain "kok klien itu tak pernah muncul di peringatan".

      Yang menahannya jalur KEDUA: porsi invoice telat diperiksa terpisah,
      bukan sebagai turunan rata-rata.
    */
    const h = nilaiKebiasaanBayar([R(98), R(-90)], 2, 14, 0.5)
    expect(h.rataSelisih).toBeCloseTo(4, 0)   // rata-ratanya memang jinak
    expect(h.layakLapor).toBe(true)            // tapi tetap dilaporkan
    expect(h.sebab).toBe('sering_telat')
  })

  it('klien tepat waktu tidak dilaporkan', () => {
    // Melati Indah: semuanya lebih awal.
    const h = nilaiKebiasaanBayar([R(-2), R(-2), R(-1)], 2, 14, 0.5)
    expect(h.layakLapor).toBe(false)
    expect(h.sebab).toBe('tepat_waktu')
    expect(h.jumlahTelat).toBe(0)
  })

  it('sampel terlalu sedikit TIDAK dilaporkan — satu invoice bukan kebiasaan', () => {
    // Menuduh klien "selalu telat" dari satu invoice merusak hubungan bisnis
    // atas dasar yang tak ada. Sari Dewi punya satu invoice, dibayar 30 hari
    // lebih awal — kebalikannya, dan tetap tak cukup untuk menyimpulkan apa pun.
    const h = nilaiKebiasaanBayar([R(60)], 2, 14, 0.5)
    expect(h.layakLapor).toBe(false)
    expect(h.sebab).toBe('kurang_sampel')
  })

  it('rata-rata dibandingkan SEBELUM dibulatkan', () => {
    /*
      Cacat yang sudah pernah terjadi di repo ini pada laporan upah: rasio
      dibulatkan lebih dulu lalu dibandingkan, dan satu kasus lolos dari
      ambangnya sendiri.

      13,5 dan 13,6 keduanya membulat ke 14. Kalau perbandingan memakai angka
      bulat, 13,5 ikut dilaporkan padahal di bawah ambang 14.

      ⚠ Bentuk pertama test ini memakai [13,5 · 13,5] dan MERAH — bukan karena
      pembulatannya, melainkan karena kedua invoice itu telat, jadi porsi
      telatnya 1,0 dan jalur KEDUA melaporkannya dengan benar. Testnya yang
      salah, bukan kodenya.

      Supaya pembulatan teruji SENDIRIAN, porsi telat harus di bawah ambangnya:
      28 dan −1 memberi rata-rata 13,5 dengan porsi 0,5.
    */
    const h = nilaiKebiasaanBayar([R(28), R(-1)], 2, 14, 0.6)
    expect(h.rataSelisih).toBe(13.5)
    expect(h.porsiTelat).toBe(0.5)
    expect(h.layakLapor).toBe(false)
  })

  it('ambang porsi dihormati — sesekali telat bukan kebiasaan', () => {
    // 1 dari 4 telat = 0,25. Di bawah ambang 0,5, dan rata-ratanya jinak.
    const h = nilaiKebiasaanBayar([R(20), R(-5), R(-5), R(-5)], 2, 14, 0.5)
    expect(h.porsiTelat).toBe(0.25)
    expect(h.layakLapor).toBe(false)
  })

  it('selisih tepat 0 hari bukan telat — dibayar PAS jatuh tempo', () => {
    // `>= 0` di tempat `> 0` membuat setiap pembayaran tepat waktu dihitung
    // sebagai keterlambatan, dan porsi telat melonjak jadi 1,0 untuk klien
    // yang justru paling disiplin.
    const h = nilaiKebiasaanBayar([R(0), R(0), R(0)], 2, 14, 0.5)
    expect(h.jumlahTelat).toBe(0)
    expect(h.layakLapor).toBe(false)
  })

  it('menjumlahkan nilai tagihan untuk menimbang bobot', () => {
    const h = nilaiKebiasaanBayar([R(30, 200_000_000), R(30, 164_650_000)], 2, 14, 0.5)
    expect(h.nilaiTotal).toBe(364_650_000)
  })
})
