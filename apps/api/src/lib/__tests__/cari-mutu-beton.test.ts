/**
 * PENCARIAN AHSP SADAR MUTU BETON.
 *
 * ⚠ Yang BUKTINYA ada di tempat lain: apakah klausa `or()` yang dihasilkan
 * benar-benar diterima PostgREST. Di dalamnya ada tanda kutip tunggal
 * (`f'c`), dan hanya basis yang tahu. Buktinya di
 * `scripts/uji-cari-mutu-hidup.mjs`, yang mencari lewat rute sungguhan dan
 * memeriksa hasilnya memuat KEDUA bahasa katalog.
 */
import { describe, it, expect } from 'vitest'
import { klausaCari, polaCariMutu, sebutanMutu } from '../cari-mutu-beton.js'

describe('sebutanMutu — mengenali bentuk mutu dari teks bebas', () => {
  it('mengenali K dengan dan TANPA tanda hubung', () => {
    /*
      "K300" memulangkan NOL hasil di pencarian polos, dan nol hasil tak
      pernah terbaca sebagai salah ketik — pemakainya menyimpulkan analisanya
      memang tak ada, padahal ada 25 baris K-250 di katalog.
    */
    expect(sebutanMutu('K-300')?.k).toBe(300)
    expect(sebutanMutu('K300')?.k).toBe(300)
    expect(sebutanMutu('k 250')?.k).toBe(250)
    expect(sebutanMutu('K-250 ')?.k).toBe(250)
  })

  it("mengenali bentuk f'c", () => {
    expect(sebutanMutu("f'c 25")?.fc).toBe('25')
    expect(sebutanMutu("fc 30 MPa")?.fc).toBe('30')
    expect(sebutanMutu("f'c 7,5")?.fc).toBe('7,5')
  })

  it('kata BIASA bukan sebutan mutu', () => {
    for (const k of ['bekisting', 'beton', 'balok 20/30', '', 'K']) {
      expect(sebutanMutu(k)).toBeNull()
    }
  })
})

describe('polaCariMutu', () => {
  it('K diperluas ke padanan f\'c-nya', () => {
    const p = polaCariMutu('K-300')
    expect(p).toContain('K-300')
    expect(p.some((x) => /f'c 25/.test(x))).toBe(true)
  })

  it('f\'c diperluas balik ke K', () => {
    const p = polaCariMutu("f'c 25")
    expect(p.some((x) => /K-?300/.test(x))).toBe(true)
  })

  it('kata BIASA memulangkan dirinya sendiri, tanpa tambahan', () => {
    /*
      Pencarian "bekisting" tak boleh berubah perilakunya hanya karena modul
      ini dipasang. Perluasan yang bocor ke kata biasa membuat hasil pencarian
      memuat baris yang tak diminta — dan daftar yang memuat lebih banyak
      terlihat seperti pencarian yang lebih baik.
    */
    expect(polaCariMutu('bekisting')).toEqual(['bekisting'])
    expect(polaCariMutu('beton')).toEqual(['beton'])
  })

  it('K yang tak ada padanannya tetap dicari sebagai K', () => {
    /* K-999 tak ada di tabel padanan; polanya tetap harus memuat K-999. */
    const p = polaCariMutu('K-999')
    expect(p).toContain('K-999')
  })
})

describe('klausaCari — bentuk klausa PostgREST', () => {
  it('memuat name DAN code untuk tiap pola', () => {
    const k = klausaCari('K-300')
    expect(k).toMatch(/name\.ilike/)
    expect(k).toMatch(/code\.ilike/)
  })

  it('membersihkan karakter yang punya arti khusus di or()', () => {
    /*
      `%`, `,`, dan tanda kurung memecah sintaks `or()`. Satu koma yang lolos
      mengubah satu syarat jadi dua — dan hasilnya bukan galat, melainkan
      pencarian yang diam-diam mencari hal lain.
    */
    const k = klausaCari('beton (100%) , campur')
    expect(k).not.toMatch(/\(100/)
    expect(k.split('name.ilike').length - 1).toBe(1)
  })

  it('kata ngawur tetap menghasilkan SATU pasang syarat', () => {
    /*
      Klausa yang membengkak tanpa sebab adalah tanda perluasan bocor —
      dan pencarian yang mencocokkan segalanya terlihat seperti berhasil.
    */
    const k = klausaCari('zzqqxx')
    expect(k).toBe('name.ilike.%zzqqxx%,code.ilike.%zzqqxx%')
  })
})
