/**
 * KONFIRMASI TULIS LEWAT WHATSAPP — membaca "ya" tanpa salah tangkap.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI DI SINI ADALAH CARA GAGALNYA, BUKAN CARA BERHASILNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "ya" yang dikenali adalah bagian yang mudah. Yang mahal:
 *
 *   1. "ya" di TENGAH kalimat lain — "yang penting jangan dulu" memuat "ya",
 *      dan `includes()` akan menyimpan kasbon yang justru sedang ditolak.
 *   2. "ya" yang datang TERLAMBAT — orangnya menjawab pertanyaan lain, dan
 *      token lama masih hidup.
 *   3. "ya" saat ada DUA usulan — tak menunjuk yang mana.
 *   4. "ya jangan" — memuat keduanya; yang menang harus penolakannya.
 *
 * Ketiga-empatnya menyimpan sesuatu yang tak dimaksud siapa pun, atas nama
 * orang sungguhan, ke modul yang punya rantai approval.
 */
import { describe, it, expect } from 'vitest'
import { niatKonfirmasi, JENDELA_KONFIRMASI_MS } from '../tulis-konfirmasi-wa.js'

describe('membaca niat konfirmasi', () => {
  it('kata konfirmasi yang jelas → ya', () => {
    for (const t of ['ya', 'iya', 'ok', 'oke', 'sip', 'betul', 'setuju', 'simpan', 'lanjut']) {
      expect(niatKonfirmasi(t)).toBe('ya')
    }
  })

  it('HURUF BESAR dan tanda baca tetap terbaca', () => {
    // Orang lapangan mengetik apa adanya. Menuntut huruf kecil tanpa tanda
    // seru adalah menuntut yang tak akan terjadi.
    expect(niatKonfirmasi('YA')).toBe('ya')
    expect(niatKonfirmasi('Ya!')).toBe('ya')
    expect(niatKonfirmasi('  oke.  ')).toBe('ya')
    expect(niatKonfirmasi('ya 👍')).toBe('ya')
  })

  it('kata pembatalan → batal', () => {
    for (const t of ['batal', 'tidak', 'jangan', 'ga', 'nggak', 'salah', 'bukan', 'stop']) {
      expect(niatKonfirmasi(t)).toBe('batal')
    }
  })

  it('KALIMAT yang kebetulan memuat "ya" BUKAN konfirmasi', () => {
    // Inti berkas ini. `includes('ya')` akan menyetujui semuanya — termasuk
    // kalimat yang artinya justru menolak.
    expect(niatKonfirmasi('yang penting jangan dulu')).toBe('bukan')
    expect(niatKonfirmasi('kayanya salah deh')).toBe('bukan')
    expect(niatKonfirmasi('saya belum yakin')).toBe('bukan')
    expect(niatKonfirmasi('berapa ya sisa semennya')).toBe('bukan')
    expect(niatKonfirmasi('oke deh nanti saya cek dulu')).toBe('bukan')
  })

  it('"ya jangan" menang PENOLAKANNYA', () => {
    // Saat ragu, arah yang aman adalah TIDAK menyimpan.
    expect(niatKonfirmasi('jangan')).toBe('batal')
    expect(niatKonfirmasi('ga jadi')).toBe('batal')
    expect(niatKonfirmasi('bukan itu')).toBe('batal')
  })

  it('kosong / bukan teks → bukan', () => {
    expect(niatKonfirmasi('')).toBe('bukan')
    expect(niatKonfirmasi('   ')).toBe('bukan')
    expect(niatKonfirmasi(undefined as unknown as string)).toBe('bukan')
  })

  it('jendela konfirmasi JAUH lebih pendek dari umur token', () => {
    // 15 menit aman untuk tombol yang menempel pada usulan yang terlihat.
    // Kalimat tak menempel pada apa pun — lihat kepala berkas pustakanya.
    expect(JENDELA_KONFIRMASI_MS).toBeLessThan(15 * 60_000)
    expect(JENDELA_KONFIRMASI_MS).toBeGreaterThanOrEqual(60_000)
  })
})
