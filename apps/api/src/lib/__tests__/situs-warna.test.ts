import { describe, it, expect } from 'vitest'
import {
  rasioKontras,
  validasiPasangan,
  validasiAksen,
  LATAR_LANDING,
} from '../situs-warna.js'

describe('rasioKontras', () => {
  it('putih di atas hitam = 21:1', () => {
    expect(rasioKontras('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
  })

  // Angka jangkar dari spec §5.1 — hasil pengukuran, bukan karangan.
  it('kuning merek di atas navy pekat = 11,77:1', () => {
    expect(rasioKontras('#FFD600', '#001F3D')).toBeCloseTo(11.77, 1)
  })

  it('kuning merek di atas navy = 8,93:1', () => {
    expect(rasioKontras('#FFD600', '#003366')).toBeCloseTo(8.93, 1)
  })

  it('kuning merek di atas putih = 1,41:1 — inti kenapa kuning haram di terang', () => {
    expect(rasioKontras('#FFD600', '#FFFFFF')).toBeCloseTo(1.41, 1)
  })

  // 16,62 — bukan 17,4 seperti yang sempat saya tulis di spec §5.1 dan commit
  // 55166a9. Angka itu tebakan yang tak pernah diukur; test ini yang
  // menangkapnya. Kesimpulannya tak berubah: putih (16,62) tetap jauh di atas
  // kuning (11,77) sebagai warna logo di atas navy pekat.
  it('putih di atas navy pekat = 16,62:1 — alasan logo putih, bukan kuning', () => {
    expect(rasioKontras('#FFFFFF', '#001F3D')).toBeCloseTo(16.62, 1)
    expect(rasioKontras('#FFFFFF', '#001F3D')).toBeGreaterThan(
      rasioKontras('#FFD600', '#001F3D'),
    )
  })

  it('urutan argumen tidak mengubah rasio', () => {
    expect(rasioKontras('#FFD600', '#001F3D')).toBeCloseTo(
      rasioKontras('#001F3D', '#FFD600'),
      5,
    )
  })

  it('mengembalikan 0 untuk hex tak sah, bukan NaN', () => {
    expect(rasioKontras('bukan-hex', '#FFFFFF')).toBe(0)
    expect(rasioKontras('#FFF', '#FFFFFF')).toBe(0)
  })
})

describe('validasiPasangan', () => {
  it('menolak kuning sebagai teks di atas putih', () => {
    const h = validasiPasangan('#FFD600', '#FFFFFF', 'teks')
    expect(h.lulus).toBe(false)
    expect(h.rasio).toBeCloseTo(1.41, 1)
    expect(h.pesan).toContain('1.41')
  })

  it('meloloskan kuning sebagai teks di atas navy pekat', () => {
    expect(validasiPasangan('#FFD600', '#001F3D', 'teks').lulus).toBe(true)
  })

  // Inti temuan spec §4.2: warna yang SAMA memberi dua verdikt berbeda.
  // Validator yang menilai warna tunggal akan menolak warna merek sendiri.
  it('warna sama, latar beda, verdikt beda', () => {
    expect(validasiPasangan('#FFD600', '#001F3D', 'teks').lulus).toBe(true)
    expect(validasiPasangan('#FFD600', '#FFFFFF', 'teks').lulus).toBe(false)
  })

  it('ambang teks-besar (3:1) lebih longgar dari teks (4,5:1)', () => {
    // #949494 di atas putih = 3,03:1 — lulus sebagai teks besar, gagal sbg teks.
    expect(validasiPasangan('#949494', '#FFFFFF', 'teks').lulus).toBe(false)
    expect(validasiPasangan('#949494', '#FFFFFF', 'teks-besar').lulus).toBe(true)
  })

  it('menyebut ambang yang berlaku di hasilnya', () => {
    expect(validasiPasangan('#FFD600', '#FFFFFF', 'teks').ambang).toBe(4.5)
    expect(validasiPasangan('#FFD600', '#FFFFFF', 'non-teks').ambang).toBe(3)
  })

  it('menolak hex tak sah dengan pesan yang bisa ditindaklanjuti', () => {
    const h = validasiPasangan('bukan-hex', '#FFFFFF', 'teks')
    expect(h.lulus).toBe(false)
    expect(h.pesan).toMatch(/#RRGGBB/)
  })

  it('pesan menyarankan arah perbaikan sesuai terang-gelapnya latar', () => {
    // Latar terang → warna harus lebih GELAP.
    expect(validasiPasangan('#FFD600', '#FFFFFF', 'teks').pesan).toMatch(/gelap/)
    // Latar gelap → warna harus lebih TERANG.
    expect(validasiPasangan('#0A2A4A', '#001F3D', 'teks').pesan).toMatch(/terang/)
  })
})

describe('validasiAksen', () => {
  it('menguji aksen terhadap SELURUH latar landing', () => {
    expect(LATAR_LANDING).toHaveLength(3)
    expect(validasiAksen('#FFD600')).toHaveLength(3)
  })

  it('meloloskan kuning merek di ketiga latar landing', () => {
    expect(validasiAksen('#FFD600').every((h) => h.lulus)).toBe(true)
  })

  it('menolak aksen yang tenggelam di latar tergelap', () => {
    // #0A2A4A terlalu dekat dengan navy pekat — tak terbaca di sana.
    const h = validasiAksen('#0A2A4A')
    expect(h.some((x) => !x.lulus)).toBe(true)
  })

  it('menolak aksen yang gagal di SALAH SATU latar, bukan hanya rata-rata', () => {
    // Aksen yang lulus di navy pekat tapi gagal di navy terang harus ditolak.
    const h = validasiAksen('#4A7FB5')
    expect(h.every((x) => x.lulus)).toBe(false)
  })
})
