/**
 * RINGKASAN MINGGUAN — yang diuji cara ia bisa jadi spam, bukan angkanya.
 */
import { describe, it, expect } from 'vitest'
import { susunRingkasan, type BarisNotifikasi } from '../ringkasan-mingguan.js'

const N = (type: string, priority = 'normal', sudahDibaca = false): BarisNotifikasi =>
  ({ type, priority, sudahDibaca })

const SENDIRI = 'ringkasan_mingguan'

describe('susunRingkasan', () => {
  it('mengelompokkan per jenis dan memisahkan yang belum dibaca', () => {
    const h = susunRingkasan([
      N('invoice_terlambat'), N('invoice_terlambat'),
      N('kasbon_outstanding', 'normal', true),
    ], SENDIRI, 1)
    expect(h.total).toBe(3)
    expect(h.belumDibaca).toBe(2)
    expect(h.perJenis[0].type).toBe('invoice_terlambat')
    expect(h.perJenis[0].belumDibaca).toBe(2)
  })

  it('TIDAK MERANGKUM DIRINYA SENDIRI', () => {
    /*
      Cacat yang paling mudah lolos dan paling merusak.

      Ringkasan ini menulis notifikasi. Minggu depan ia membaca tujuh hari
      terakhir — termasuk ringkasan minggu lalu. Pada minggu yang benar-benar
      sepi, satu-satunya isinya adalah ringkasan sebelumnya, sehingga ia tak
      pernah "kosong" dan terkirim SELAMANYA: alarm yang berbunyi tiap minggu
      untuk mengabarkan bahwa minggu lalu ada alarm.

      Tak ada galat, tak ada gejala — kecuali orang berhenti membacanya.
    */
    const h = susunRingkasan([N(SENDIRI), N(SENDIRI), N(SENDIRI)], SENDIRI, 1)
    expect(h.total).toBe(0)
    expect(h.perJenis).toHaveLength(0)
    expect(h.layakKirim).toBe(false)   // minggu sepi = TIDAK ada pesan
  })

  it('minggu sepi tidak menghasilkan pesan sama sekali', () => {
    // "Tidak ada apa-apa minggu ini" yang dikirim tiap Senin adalah pesan yang
    // selalu benar dan tak pernah berguna — ia melatih orang mengabaikan
    // pengirimnya sebelum minggu yang ramai tiba.
    expect(susunRingkasan([], SENDIRI, 1).layakKirim).toBe(false)
  })

  it('menghitung urgent DAN high sebagai mendesak', () => {
    // Repo ini memakai keduanya. Memeriksa satu saja membuat separuh peringatan
    // penting hilang dari baris terpenting ringkasan — tanpa gejala apa pun
    // selain angka yang terlihat tenang.
    const h = susunRingkasan([
      N('a', 'urgent'), N('b', 'high'), N('c', 'normal'),
    ], SENDIRI, 1)
    expect(h.mendesak).toBe(2)
  })

  it('prioritas huruf besar tetap terhitung', () => {
    // Nilai dari basis tak dijamin huruf kecil; perbandingan sensitif-huruf
    // membuat peringatan mendesak lolos tanpa suara.
    expect(susunRingkasan([N('a', 'URGENT'), N('b', 'High')], SENDIRI, 1).mendesak).toBe(2)
  })

  it('mengurutkan yang paling banyak BELUM DIBACA di atas', () => {
    // Ringkasan yang mengurut berdasar jumlah total menaruh kebisingan lama
    // yang sudah dibaca di puncak, dan hal yang belum ditangani tenggelam.
    const h = susunRingkasan([
      N('lama', 'normal', true), N('lama', 'normal', true), N('lama', 'normal', true),
      N('baru'), N('baru'),
    ], SENDIRI, 1)
    expect(h.perJenis[0].type).toBe('baru')
  })

  it('menghormati minimum jenis — satu jenis saja belum tentu layak', () => {
    const satu = [N('invoice_terlambat'), N('invoice_terlambat')]
    expect(susunRingkasan(satu, SENDIRI, 1).layakKirim).toBe(true)
    expect(susunRingkasan(satu, SENDIRI, 2).layakKirim).toBe(false)
  })

  it('baris tanpa jenis dibuang, bukan dikelompokkan sebagai kosong', () => {
    const h = susunRingkasan(
      [N('a'), { type: '', priority: 'high', sudahDibaca: false }], SENDIRI, 1,
    )
    expect(h.total).toBe(1)
    expect(h.perJenis).toHaveLength(1)
  })
})
