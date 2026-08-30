/**
 * RETENSI NOTIFIKASI — yang diuji: apa yang boleh dihapus, dan apa yang tidak.
 *
 * Keadaan yang melahirkannya, diukur 2026-08-31 di produksi:
 *
 *   8.893 notifikasi · 0 dibaca · tertua 15 hari
 *   tak ada setelan retensi · tak ada tugas pembersih
 */
import { describe, it, expect } from 'vitest'
import { nilaiRetensi } from '../retensi-notifikasi.js'

const N = (o: Partial<Parameters<typeof nilaiRetensi>[0]> = {}) => ({
  umurHari: 40, sudahDibaca: false, prioritas: 'normal', ...o,
})

// Ambang: yang dibaca 14 hari, yang belum dibaca 60 hari.
const A = [14, 60] as const

describe('nilaiRetensi', () => {
  it('yang SUDAH DIBACA dihapus lebih cepat', () => {
    // Pemiliknya sudah melihatnya; menyimpannya tak menambah apa pun.
    expect(nilaiRetensi(N({ sudahDibaca: true, umurHari: 20 }), ...A).hapus).toBe(true)
    // Yang BELUM dibaca pada umur sama masih disimpan — menghapusnya berarti
    // pesan yang tak pernah sampai ke siapa pun.
    expect(nilaiRetensi(N({ sudahDibaca: false, umurHari: 20 }), ...A).hapus).toBe(false)
  })

  it('MENDESAK + BELUM DIBACA tidak pernah dihapus, berapa pun umurnya', () => {
    /*
      Aturan yang paling penting. Notifikasi `urgent` yang belum dibaca berarti
      sesuatu yang berbahaya — temuan K3 lewat tenggat, beton gagal, baku mutu
      terlampaui — dan belum ada yang melihatnya.

      Menghapusnya karena "sudah lama" adalah kebalikan dari yang seharusnya:
      makin lama ia tak dibaca, makin mendesak ia dibaca.
    */
    for (const umur of [60, 365, 3650]) {
      const h = nilaiRetensi(N({ prioritas: 'urgent', umurHari: umur }), ...A)
      expect(h.hapus, `urgent belum dibaca umur ${umur} hari`).toBe(false)
      expect(h.sebab).toBe('mendesak_dilindungi')
    }
  })

  it('MENDESAK yang SUDAH dibaca boleh dihapus — perlindungannya untuk yang belum', () => {
    // Perlindungannya melekat pada "belum ada yang melihat", bukan pada
    // prioritasnya sendiri. Yang sudah dibaca sudah sampai tujuannya.
    const h = nilaiRetensi(N({ prioritas: 'urgent', sudahDibaca: true, umurHari: 20 }), ...A)
    expect(h.hapus).toBe(true)
    expect(h.sebab).toBe('dibaca_kedaluwarsa')
  })

  it('SEBAB dipulangkan tepat — bukan cuma `hapus`', () => {
    /*
      `sebab` bukan hiasan: ia muncul di jawaban rute pembersih, dan itulah
      yang dibaca orang saat bertanya "kenapa notifikasi ini masih ada?".
      Menguji `hapus` saja membuat separuh nilai fungsi ini tak terjaga.

      ⚠ Satu mutasi pernah LOLOS di sini, dan pelajarannya bukan yang saya
      kira. Saya menukar urutan blok `mendesak` dengan blok `sudahDibaca`,
      test tetap hijau, dan saya menyimpulkan test-nya lemah.

      Diperiksa langsung pada keempat kombinasi masukan: keluarannya SAMA
      PERSIS. Kondisi kedua blok itu saling eksklusif (`sudahDibaca` vs
      `!sudahDibaca`), jadi urutannya memang tak berpengaruh.

      Mutasi itu tak mengubah perilaku apa pun — dan test yang dibuat untuk
      mengejarnya akan menguji BENTUK kode, bukan perilakunya. Yang benar:
      biarkan lolos, dan tulis alasannya.
    */
    expect(nilaiRetensi(N({ prioritas: 'urgent', umurHari: 1 }), ...A).sebab)
      .toBe('mendesak_dilindungi')
    expect(nilaiRetensi(N({ prioritas: 'urgent', umurHari: 9999 }), ...A).sebab)
      .toBe('mendesak_dilindungi')
    expect(nilaiRetensi(N({ sudahDibaca: true, umurHari: 99 }), ...A).sebab)
      .toBe('dibaca_kedaluwarsa')
    expect(nilaiRetensi(N({ umurHari: 99 }), ...A).sebab)
      .toBe('tak_dibaca_kedaluwarsa')
  })

  it('kondisi `!sudahDibaca` pada perlindungan mendesak WAJIB ada', () => {
    /*
      INI yang benar-benar load-bearing pada blok mendesak — bukan urutannya.

      Tanpa `!n.sudahDibaca`, notifikasi urgent yang SUDAH dibaca ikut abadi,
      dan kotak masuk penuh oleh peringatan yang sudah ditangani berbulan
      lalu. Perlindungannya melekat pada "belum ada yang melihat", bukan pada
      prioritasnya sendiri.
    */
    const sudah = nilaiRetensi(N({ prioritas: 'urgent', sudahDibaca: true, umurHari: 99 }), ...A)
    expect(sudah.hapus).toBe(true)
    expect(sudah.sebab).toBe('dibaca_kedaluwarsa')
  })

  it('yang masih baru tak disentuh', () => {
    expect(nilaiRetensi(N({ umurHari: 3 }), ...A).sebab).toBe('masih_baru')
    expect(nilaiRetensi(N({ umurHari: 3, sudahDibaca: true }), ...A).sebab).toBe('masih_baru')
  })

  it('batas TEPAT di ambang sudah dihapus', () => {
    // Batas yang mudah salah satu hari.
    expect(nilaiRetensi(N({ sudahDibaca: true, umurHari: 14 }), ...A).hapus).toBe(true)
    expect(nilaiRetensi(N({ sudahDibaca: true, umurHari: 13 }), ...A).hapus).toBe(false)
    expect(nilaiRetensi(N({ umurHari: 60 }), ...A).hapus).toBe(true)
    expect(nilaiRetensi(N({ umurHari: 59 }), ...A).hapus).toBe(false)
  })

  it('UMUR TAK TERBACA tidak dihapus — saat ragu, pilih yang bisa dibatalkan', () => {
    /*
      Sengaja BERBEDA dari `tenggat-terlewat.ts`, yang MELAPORKAN catatan tanpa
      tanggal supaya ia tak hilang diam-diam.

      Di sana melaporkan berarti menarik perhatian; di sini menghapus berarti
      menghancurkan. Menyimpan selalu bisa dibatalkan, menghapus tidak.
    */
    for (const u of [Number.NaN, -5]) {
      const h = nilaiRetensi(N({ umurHari: u, sudahDibaca: true }), ...A)
      expect(h.hapus).toBe(false)
      expect(h.sebab).toBe('masih_baru')
    }
  })

  it('prioritas mendesak dikenali dalam beberapa ejaan', () => {
    // Basis ini memakai `urgent`; ejaan lain diterima supaya perlindungannya
    // tak hilang kalau nanti ada yang menulis berbeda.
    for (const p of ['urgent', 'URGENT', ' Kritis ', 'critical']) {
      expect(nilaiRetensi(N({ prioritas: p, umurHari: 999 }), ...A).hapus,
        `prioritas "${p}" seharusnya dilindungi`).toBe(false)
    }
    for (const p of ['normal', 'high', 'low', '']) {
      expect(nilaiRetensi(N({ prioritas: p, umurHari: 999 }), ...A).hapus,
        `prioritas "${p}" seharusnya boleh dihapus`).toBe(true)
    }
  })

  it('`high` TIDAK dilindungi — hanya `urgent` yang tak pernah dihapus', () => {
    /*
      Keputusan yang layak ditulis: kalau `high` ikut dilindungi, hampir
      separuh notifikasi jadi abadi dan pembersihnya kehilangan gunanya.

      Diukur 2026-08-31: dari 1.666 notifikasi tiga jam terakhir, yang berprioritas
      tinggi jumlahnya besar — melindungi semuanya berarti tak membersihkan
      apa pun.
    */
    expect(nilaiRetensi(N({ prioritas: 'high', umurHari: 90 }), ...A).hapus).toBe(true)
  })
})
