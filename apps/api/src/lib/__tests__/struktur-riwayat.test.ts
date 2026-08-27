/**
 * RIWAYAT ELEMEN — pembanding input yang menentukan lahir-tidaknya revisi.
 *
 * ⚠ Yang BUKTINYA ada di tempat lain: apakah riwayat benar-benar TERCATAT.
 *
 * Cacat pertama fitur ini lolos dari `tsc --noEmit` yang exit 0 —
 * `ambilElemen()` tak mengambil `company_id`, insert ditolak RLS, riwayat
 * diam-diam kosong. Test bentuk seperti berkas ini TIDAK bisa melihatnya.
 * Buktinya ada di `scripts/uji-riwayat-hidup.mjs` (mengubah elemen sungguhan
 * lewat rute, lalu membaca riwayatnya kembali lewat rute), dan mutasi
 * sengaja terhadap cacat itu terbukti MERAH.
 *
 * Yang diuji di sini hanya bagian yang PURE: kapan dua input dianggap beda.
 */
import { describe, it, expect } from 'vitest'
import { inputBerbeda } from '../struktur-riwayat.js'

describe('inputBerbeda — kapan sebuah perubahan layak jadi revisi', () => {
  it('nilai yang berubah = beda', () => {
    expect(inputBerbeda({ hMm: 500 }, { hMm: 520 })).toBe(true)
  })

  it('isi sama = TIDAK beda, walau objeknya lain', () => {
    /*
      `===` selalu memulangkan false untuk dua objek berbeda. Kalau
      pembandingnya memakai itu, SETIAP hitung-ulang melahirkan revisi —
      dan riwayat penuh baris identik membuat perubahan yang sungguhan
      tenggelam.
    */
    expect(inputBerbeda({ hMm: 500 }, { hMm: 500 })).toBe(false)
  })

  it('URUTAN KUNCI tidak membuatnya beda', () => {
    /*
      `JSON.stringify` polos peka urutan kunci. Objek yang isinya sama tapi
      urutannya beda — hal yang lumrah terjadi setelah data bolak-balik
      lewat JSON — akan dianggap berubah, dan lahir revisi palsu.
    */
    expect(inputBerbeda({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false)
  })

  it('objek bersarang dibandingkan sampai ke dalam', () => {
    expect(inputBerbeda({ mutu: { fcMpa: 25 } }, { mutu: { fcMpa: 30 } })).toBe(true)
    expect(inputBerbeda({ mutu: { fcMpa: 25 } }, { mutu: { fcMpa: 25 } })).toBe(false)
  })

  it('URUTAN LARIK tetap bermakna', () => {
    /*
      Beda dengan kunci objek: urutan lapisan tanah menentukan mana yang di
      atas. Menyamakan [A,B] dengan [B,A] akan menyembunyikan perubahan
      susunan tanah yang mengubah seluruh hasil daya dukung.
    */
    expect(inputBerbeda({ lapisan: [1, 2] }, { lapisan: [2, 1] })).toBe(true)
  })

  it('menambah medan baru = beda', () => {
    expect(inputBerbeda({ hMm: 500 }, { hMm: 500, bMm: 300 })).toBe(true)
  })

  it('null dan undefined tidak dianggap sama dengan nilai', () => {
    expect(inputBerbeda({ x: null }, { x: 0 })).toBe(true)
    expect(inputBerbeda({ x: null }, { x: null })).toBe(false)
  })

  it('angka dan teks yang "terlihat sama" tetap beda', () => {
    /*
      `300` dan `"300"` berperilaku berbeda di perhitungan. Menyamakannya
      di sini membuat perubahan tipe — yang sering justru penanda bug di
      hulu — luput dari riwayat.
    */
    expect(inputBerbeda({ bMm: 300 }, { bMm: '300' })).toBe(true)
  })
})
