import { describe, it, expect } from 'vitest'
import {
  gabungKlausul, bolehDiubah, KLAUSUL_BAWAAN,
  NOMOR_BISA_DIUBAH, NOMOR_DIRAKIT_KODE, type Klausul,
} from '../klausul-kontrak.js'

/**
 * Klausul kontrak — MURNI, tanpa basis.
 *
 * Yang dijaga di sini bukan "fungsinya menggabungkan array". Yang dijaga:
 * kontrak TIDAK PERNAH terbit tanpa pasal yang menentukan apa yang terjadi
 * saat keadaan memburuk.
 *
 * Kertas yang tak menyebut forum sengketa bukan kertas yang "belum lengkap" —
 * ia kertas yang menyerahkan penentuannya kepada siapa pun yang menggugat
 * lebih dulu. Karena itu bawaan berlaku sebagai LANTAI, bukan sebagai contoh.
 */

const uji = (p: Partial<Klausul>): Klausul => ({
  nomor: '9', judul: 'PENYELESAIAN PERSELISIHAN', isi: 'Isi tenant', urutan: 90, ...p,
})

describe('bawaan sebagai LANTAI', () => {
  it('tanpa klausul tenant, seluruh bawaan tetap terbit', () => {
    const h = gabungKlausul([])
    expect(h).toHaveLength(KLAUSUL_BAWAAN.length)
    // Tenant BARU tak boleh berakhir tanpa pasal sengketa.
    expect(h.some((k) => k.nomor === '9')).toBe(true)
    expect(h.some((k) => k.nomor === '10')).toBe(true)
  })

  it('bawaan yang TIDAK ditimpa tetap ikut', () => {
    const h = gabungKlausul([uji({ nomor: '1', isi: 'Maksud versi tenant' })])
    // Menimpa pasal 1 tak boleh menghapus pasal 9.
    expect(h.find((k) => k.nomor === '9')?.isi).toBe(
      KLAUSUL_BAWAAN.find((k) => k.nomor === '9')!.isi)
  })

  it('klausul tenant ber-isi KOSONG diabaikan, bukan menimpa dengan kekosongan', () => {
    // Pasal berjudul tanpa badan = kertas yang terlihat lengkap padahal
    // kewajibannya hilang.
    const h = gabungKlausul([uji({ nomor: '9', isi: '   ' })])
    expect(h.find((k) => k.nomor === '9')?.isi).toBe(
      KLAUSUL_BAWAAN.find((k) => k.nomor === '9')!.isi)
  })
})

describe('penimpaan oleh tenant', () => {
  it('nomor yang sama DIGANTI isinya', () => {
    const h = gabungKlausul([uji({ nomor: '9', isi: 'Sengketa lewat BANI Jakarta.' })])
    expect(h.find((k) => k.nomor === '9')?.isi).toBe('Sengketa lewat BANI Jakarta.')
  })

  it('judul kosong jatuh ke judul bawaan, bukan jadi kosong', () => {
    const h = gabungKlausul([uji({ nomor: '9', judul: '  ', isi: 'Isi baru' })])
    expect(h.find((k) => k.nomor === '9')?.judul).toBe('PENYELESAIAN PERSELISIHAN')
  })

  it('pasal BARU milik tenant ikut terbit', () => {
    const h = gabungKlausul([uji({ nomor: '8a', judul: 'ASURANSI', isi: 'Wajib CAR.', urutan: 85 })])
    expect(h.some((k) => k.nomor === '8a')).toBe(true)
    expect(h.length).toBe(KLAUSUL_BAWAAN.length + 1)
  })
})

describe('urutan cetak', () => {
  it('"8a" jatuh SESUDAH "8", bukan sesudah "89"', () => {
    const h = gabungKlausul([uji({ nomor: '8a', judul: 'ASURANSI', isi: 'X', urutan: 85 })])
    const nomor = h.map((k) => k.nomor)
    expect(nomor.indexOf('8a')).toBeGreaterThan(nomor.indexOf('8'))
    expect(nomor.indexOf('8a')).toBeLessThan(nomor.indexOf('9'))
  })

  it('"10" jatuh SESUDAH "9" — pengurutan teks murni akan membalikkannya', () => {
    const nomor = gabungKlausul([]).map((k) => k.nomor)
    expect(nomor.indexOf('10')).toBeGreaterThan(nomor.indexOf('9'))
  })

  it('urutan tenant dihormati saat berbeda dari bawaan', () => {
    const h = gabungKlausul([uji({ nomor: '9', isi: 'X', urutan: 5 })])
    expect(h[0].nomor).toBe('9')
  })
})

describe('batas pasal yang boleh diubah', () => {
  it('pasal berteks murni boleh diubah', () => {
    for (const n of NOMOR_BISA_DIUBAH) expect(bolehDiubah(n)).toBe(true)
  })

  it('pasal yang MENGANYAM DATA tidak boleh — template bernilai kosong tetap tercetak rapi', () => {
    // Pasal 3 memuat nilai kontrak + terbilang, pasal 5 tabel termin.
    // Menjadikannya template menuntut bahasa templating, dan template yang
    // salah tulis menghasilkan kontrak bernilai KOSONG yang terlihat wajar.
    for (const n of NOMOR_DIRAKIT_KODE) expect(bolehDiubah(n)).toBe(false)
  })

  it('dua daftar itu tak beririsan', () => {
    const irisan = (NOMOR_BISA_DIUBAH as readonly string[])
      .filter((n) => (NOMOR_DIRAKIT_KODE as readonly string[]).includes(n))
    expect(irisan).toHaveLength(0)
  })

  it('nomor tak dikenal tidak boleh diubah', () => {
    expect(bolehDiubah('99')).toBe(false)
    expect(bolehDiubah('')).toBe(false)
  })
})

describe('bawaan itu sendiri', () => {
  it('tiap bawaan punya isi yang bukan sekadar judul', () => {
    for (const k of KLAUSUL_BAWAAN) {
      expect(k.isi.trim().length, `pasal ${k.nomor} isinya terlalu pendek`).toBeGreaterThan(40)
      expect(k.judul.trim()).not.toBe('')
    }
  })

  it('nomor bawaan semuanya termasuk yang boleh diubah', () => {
    // Kalau ada bawaan di luar daftar itu, tenant melihatnya tercetak tapi
    // tak bisa menyuntingnya — dan tak ada yang menjelaskan kenapa.
    for (const k of KLAUSUL_BAWAAN) expect(bolehDiubah(k.nomor)).toBe(true)
  })
})
