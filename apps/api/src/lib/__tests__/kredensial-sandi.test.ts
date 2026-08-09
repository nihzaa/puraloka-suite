/**
 * Test lapisan enkripsi kredensial.
 *
 * Seluruhnya fungsi murni — tak menyentuh basis data, tak butuh server. Yang
 * diuji bukan "apakah AES bekerja" (itu tugas Node), melainkan keputusan yang
 * KITA ambil di atasnya: menolak kunci yang tak layak, IV yang tak pernah
 * berulang, dan kegagalan yang berisik alih-alih mengembalikan sampah.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  kunciNilai, bukaNilai, empatAkhir, sandiSiap, lupakanKunciUjiSaja,
} from '../kredensial-sandi.js'

const ENV_ASLI = process.env.CREDENTIAL_ENCRYPTION_KEY

function pakaiKunci(v: string | undefined) {
  if (v === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY
  else process.env.CREDENTIAL_ENCRYPTION_KEY = v
  lupakanKunciUjiSaja()
}

beforeEach(() => pakaiKunci('kunci-uji-yang-cukup-panjang-2026'))
afterAll(() => pakaiKunci(ENV_ASLI))

describe('kredensial-sandi — bolak-balik', () => {
  it('nilai yang dikunci bisa dibuka utuh', () => {
    const asli = 'sk-ant-contoh-kunci-palsu-untuk-uji-0123456789'
    expect(bukaNilai(kunciNilai(asli))).toBe(asli)
  })

  it('menangani UTF-8 non-ASCII', () => {
    const asli = 'kunci-dengan-émoji-🔐-dan-aksen-ü'
    expect(bukaNilai(kunciNilai(asli))).toBe(asli)
  })

  it('menangani nilai kosong', () => {
    expect(bukaNilai(kunciNilai(''))).toBe('')
  })

  it('hasilnya berformat v1 dengan empat bagian', () => {
    const hasil = kunciNilai('apa saja')
    expect(hasil.startsWith('v1:')).toBe(true)
    expect(hasil.split(':')).toHaveLength(4)
  })
})

describe('kredensial-sandi — IV tak pernah berulang', () => {
  it('nilai SAMA menghasilkan ciphertext BERBEDA', () => {
    // Kalau ini gagal, IV-nya tetap — dan GCM dengan IV berulang bocor, bukan
    // sekadar melemah: dua ciphertext bisa di-XOR untuk menghapus keystream.
    const a = kunciNilai('nilai-yang-sama')
    const b = kunciNilai('nilai-yang-sama')
    expect(a).not.toBe(b)
    expect(bukaNilai(a)).toBe('nilai-yang-sama')
    expect(bukaNilai(b)).toBe('nilai-yang-sama')
  })

  it('100 enkripsi menghasilkan 100 IV berbeda', () => {
    const iv = new Set(Array.from({ length: 100 }, () => kunciNilai('x').split(':')[1]))
    expect(iv.size).toBe(100)
  })
})

describe('kredensial-sandi — gagal dengan berisik', () => {
  it('menolak ciphertext yang diubah, bukan mengembalikan sampah', () => {
    const utuh = kunciNilai('kunci-rahasia')
    const [v, iv, tag, data] = utuh.split(':')
    // Balik satu bit di byte terakhir data.
    const buf = Buffer.from(data, 'base64url')
    buf[buf.length - 1] ^= 0x01
    const rusak = [v, iv, tag, buf.toString('base64url')].join(':')

    expect(() => bukaNilai(rusak)).toThrow()
  })

  it('menolak tag autentikasi yang salah', () => {
    const [v, iv, , data] = kunciNilai('kunci-rahasia').split(':')
    const tagPalsu = Buffer.alloc(16, 7).toString('base64url')
    expect(() => bukaNilai([v, iv, tagPalsu, data].join(':'))).toThrow()
  })

  it('menolak versi yang tak dikenal', () => {
    const [, iv, tag, data] = kunciNilai('x').split(':')
    expect(() => bukaNilai(['v99', iv, tag, data].join(':'))).toThrow(/v99/)
  })

  it('menolak bentuk yang bukan empat bagian', () => {
    expect(() => bukaNilai('plaintext-polos')).toThrow(/tidak dikenal/)
    expect(() => bukaNilai('v1:cuma:tiga')).toThrow(/tidak dikenal/)
  })

  it('nilai dari kunci utama LAIN tak bisa dibuka', () => {
    const dgnKunciA = kunciNilai('rahasia')
    pakaiKunci('kunci-utama-yang-sama-sekali-berbeda-2026')
    expect(() => bukaNilai(dgnKunciA)).toThrow()
  })
})

describe('kredensial-sandi — menolak kunci utama yang tak layak', () => {
  it('melempar bila env kosong', () => {
    pakaiKunci(undefined)
    expect(sandiSiap()).toBe(false)
    expect(() => kunciNilai('x')).toThrow(/CREDENTIAL_ENCRYPTION_KEY/)
  })

  it('melempar bila env terlalu pendek', () => {
    // Kunci pendek membuat seluruh enkripsi ini teater — lebih baik menolak
    // menyimpan daripada memberi rasa aman yang keliru.
    pakaiKunci('pendek')
    expect(sandiSiap()).toBe(false)
    expect(() => kunciNilai('x')).toThrow(/terlalu pendek/)
  })

  it('sandiSiap true saat kuncinya layak', () => {
    expect(sandiSiap()).toBe(true)
  })
})

describe('empatAkhir', () => {
  it('mengambil empat karakter terakhir', () => {
    expect(empatAkhir('sk-ant-api03-abcd1234')).toBe('1234')
  })

  it('null untuk nilai pendek — 4 dari 6 bukan penyamaran', () => {
    expect(empatAkhir('abc')).toBeNull()
    expect(empatAkhir('1234567')).toBeNull()
    expect(empatAkhir('12345678')).toBe('5678')
  })
})
