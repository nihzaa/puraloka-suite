/**
 * USULAN TULIS — jalur yang lengkap tapi tak pernah bisa dipakai.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUTUH TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: asisten SUDAH bisa menyiapkan lima jenis catatan, tool
 * `siapkan_tulis` terdaftar, dan kedua rutenya ada. Yang hilang satu hal —
 * `grep` atas seluruh `apps/web` menemukan NOL pemanggilan `/api/v1/ai/tulis`.
 *
 * Jadi asisten berkata "tekan tombol konfirmasi" untuk tombol yang tak pernah
 * ada, dan tokennya kedaluwarsa 15 menit kemudian.
 *
 * Yang dibuktikan di sini:
 *
 *   1. usulan benar-benar TERBACA dari blok tool
 *   2. giliran biasa (cuma bertanya) menghasilkan array kosong
 *   3. jenis asing DIBUANG — tombol yang rutenya tolak 422 lebih buruk
 *      daripada tak ada tombol
 *   4. dua usulan dalam satu giliran → hanya yang TERAKHIR
 *   5. blok rusak/kosong tak melempar
 */
import { describe, it, expect } from 'vitest'
import { JENIS_USUL, usulDariBlok } from '../usul-tulis.js'

const blokUsul = (jenis: string, argumen: Record<string, unknown> = {}) => [
  { ronde: 1, teks: '', panggilanTool: [{ nama: 'siapkan_tulis', argumen: { jenis, ...argumen } }] },
]

describe('membaca usulan dari blok tool', () => {
  it('usulan yang sah TERBACA', () => {
    const u = usulDariBlok(blokUsul('catatan_progres', { proyek: 'Cimahi', persen: 40 }))
    expect(u).toHaveLength(1)
    expect(u[0].jenis).toBe('catatan_progres')
    expect(u[0].argumen.persen).toBe(40)
  })

  it('KELIMA jenis yang terdaftar diterima', () => {
    for (const j of JENIS_USUL) {
      expect(usulDariBlok(blokUsul(j))).toHaveLength(1)
    }
  })

  it('giliran yang cuma BERTANYA menghasilkan kosong', () => {
    // Keadaan normalnya — bukan kegagalan. UI menampilkan tombol hanya
    // kalau ada isinya.
    const blok = [
      { ronde: 1, teks: '', panggilanTool: [{ nama: 'daftar_proyek', argumen: {} }] },
      { ronde: 1, hasilTool: [{ id: 'x', isi: '...', isError: false }] },
    ]
    expect(usulDariBlok(blok)).toEqual([])
  })

  it('jenis ASING dibuang', () => {
    // Tombol yang menjanjikan menyimpan sesuatu yang rutenya tolak 422 lebih
    // buruk daripada tak ada tombol sama sekali.
    expect(usulDariBlok(blokUsul('hapus_proyek'))).toEqual([])
    expect(usulDariBlok(blokUsul(''))).toEqual([])
  })

  it('DUA usulan dalam satu giliran → hanya yang TERAKHIR', () => {
    // Model bisa memanggil dua kali (mis. memperbaiki angka sesudah membaca
    // proyeknya). Dua tombol membuat orang memilih antara dua hal yang ia
    // kira sama.
    const blok = [
      { ronde: 1, panggilanTool: [{ nama: 'siapkan_tulis', argumen: { jenis: 'kasbon', jumlah: 100 } }] },
      { ronde: 2, panggilanTool: [{ nama: 'siapkan_tulis', argumen: { jenis: 'kasbon', jumlah: 500 } }] },
    ]
    const u = usulDariBlok(blok)
    expect(u).toHaveLength(1)
    expect(u[0].argumen.jumlah).toBe(500)
  })

  it('blok rusak tak melempar', () => {
    // Blok datang dari `ai_pesan.blok` (JSONB) — bentuknya tak dijamin
    // kolom mana pun, dan melempar dari sini akan menjatuhkan seluruh balasan
    // chat demi tombol yang cuma pelengkap.
    expect(usulDariBlok(null)).toEqual([])
    expect(usulDariBlok(undefined)).toEqual([])
    expect(usulDariBlok('bukan array')).toEqual([])
    expect(usulDariBlok([null, 42, { panggilanTool: 'bukan array' }])).toEqual([])
    expect(usulDariBlok([{ panggilanTool: [{ nama: 'siapkan_tulis' }] }])).toEqual([])
  })
})
