/**
 * BANDING ALTERNATIF DESAIN — menyusun beberapa kandidat berdampingan.
 *
 * Berkas ini memakai `analisaBalok` SUNGGUHAN, bukan tiruan. Alasannya bukan
 * kemurnian: tebakan saya tentang bentuk `periksa` salah di TIGA tempat
 * sekaligus (medannya `aman` bukan `ok`, tak ada `arah`, dan `rasio` sudah
 * tersedia). Tiruan yang dibuat dari tebakan itu akan lulus dengan gemilang
 * sambil menguji bentuk yang tak pernah ada.
 */
import { describe, it, expect } from 'vitest'
import { analisaBalok } from '../struktur-beton.js'
import { bandingkan, kandidatDariVariasi } from '../struktur-banding.js'

const DASAR = {
  bMm: 300, hMm: 520, mutu: { fcMpa: 25, fyMpa: 400 },
  vuKn: 90, muKnm: 120, nTarik: 5, nTekan: 2,
  dUtamaMm: 16, dSengkangMm: 8, jarakSengkangMm: 150,
  selimutMm: 30, panjangM: 6, tingkatApiMenit: 120, jumlah: 1,
}
const hitung = (i: Record<string, unknown>) => analisaBalok(i as never)

describe('kandidatDariVariasi', () => {
  it('mengganti SATU medan dan menyalin sisanya', () => {
    const k = kandidatDariVariasi(DASAR, 'hMm', [450, 500, 550])
    expect(k).toHaveLength(3)
    expect(k.map((x) => x.input.hMm)).toEqual([450, 500, 550])
    /* Medan lain wajib TETAP — kalau ikut berubah, yang dibandingkan bukan
       satu variabel lagi dan kesimpulannya tak berarti apa-apa. */
    for (const x of k) expect(x.input.bMm).toBe(300)
  })

  it('TIDAK mengubah objek dasarnya', () => {
    const salinan = structuredClone(DASAR)
    kandidatDariVariasi(DASAR, 'hMm', [900])
    expect(DASAR).toEqual(salinan)
  })

  it('mendukung medan bersarang lewat titik', () => {
    const k = kandidatDariVariasi(DASAR, 'mutu.fcMpa', [25, 30])
    expect((k[1].input.mutu as { fcMpa: number }).fcMpa).toBe(30)
    /* Saudara satu induknya tak boleh ikut hilang. */
    expect((k[1].input.mutu as { fyMpa: number }).fyMpa).toBe(400)
  })

  it('MENOLAK medan yang tak ada, tidak membuatnya diam-diam', () => {
    /*
      Membuat medan baru diam-diam menghasilkan kandidat yang hasilnya
      identik dengan dasar — dan pemakainya menyimpulkan "ubahan ini tak
      berpengaruh", padahal ubahannya tak pernah sampai ke modul analisa.
    */
    expect(() => kandidatDariVariasi(DASAR, 'tinggiBalok', [500])).toThrow(/tak ada/i)
    expect(() => kandidatDariVariasi(DASAR, 'mutu.fcKgcm2', [250])).toThrow(/tak ada/i)
  })
})

describe('bandingkan', () => {
  it('memulangkan satu baris per kandidat, berurutan', () => {
    const hasil = bandingkan(kandidatDariVariasi(DASAR, 'hMm', [450, 520, 600]), 1, hitung)
    expect(hasil).toHaveLength(3)
    expect(hasil.map((h) => h.label)).toEqual(['hMm = 450', 'hMm = 520', 'hMm = 600'])
  })

  it('puncak KESELURUHAN bisa didominasi pemeriksaan yang tak berubah', () => {
    /*
      Ini bukan cacat yang ditambal — ini perilaku yang DIDOKUMENTASIKAN,
      karena ia yang melahirkan `puncakBerubahPersen`.

      Selimut api tak bergantung tinggi balok sama sekali, tapi rasionya
      (1,413) tertinggi di antara semua pemeriksaan. Jadi `puncakPersen`
      memulangkan 141,3% untuk tinggi 450 MAUPUN 700 — dan orang yang
      membandingkan tinggi melihat dua angka identik lalu menyimpulkan
      menaikkan tinggi balok tak ada gunanya. Kesimpulan yang salah.
    */
    const [kecil, besar] = bandingkan(
      kandidatDariVariasi(DASAR, 'hMm', [450, 700]), 1, hitung)
    expect(kecil.puncakPersen).toBe(besar.puncakPersen)
    expect(kecil.puncakNama).toMatch(/api/i)
  })

  it('puncak YANG BERUBAH memperlihatkan pengaruh tinggi balok', () => {
    /*
      Invarian fisik: menambah tinggi menambah lengan momen, jadi rasio
      lenturnya turun. Kalau arah ini terbalik, seluruh perbandingan
      menyesatkan ke arah yang BERBAHAYA — menyarankan penampang lebih kecil.

      Diukur: lentur 0,890 (h=450) -> 0,533 (h=700).
    */
    const [kecil, besar] = bandingkan(
      kandidatDariVariasi(DASAR, 'hMm', [450, 700]), 1, hitung)
    expect(kecil.puncakBerubahPersen).not.toBeNull()
    expect(besar.puncakBerubahPersen).not.toBeNull()
    expect(besar.puncakBerubahPersen!).toBeLessThan(kecil.puncakBerubahPersen!)
    /* Dan ia menyebut pemeriksaan yang memang bergantung tinggi. */
    expect(kecil.puncakBerubahNama).not.toMatch(/api/i)
  })

  it('kandidat TUNGGAL tak punya puncak-berubah — tak ada pembandingnya', () => {
    /*
      Satu kandidat sendirian tak bisa tahu pemeriksaan mana yang berubah.
      Mengarangnya berarti menyebut satu pemeriksaan "penentu" tanpa dasar.
    */
    const [satu] = bandingkan(kandidatDariVariasi(DASAR, 'hMm', [520]), 1, hitung)
    expect(satu.puncakBerubahPersen).toBeNull()
    expect(satu.puncakPersen).not.toBeNull()
  })
  it('balok yang lebih tinggi memakai beton lebih banyak', () => {
    /* Inilah pertukaran yang membuat perbandingan ini ada gunanya. */
    const [kecil, besar] = bandingkan(
      kandidatDariVariasi(DASAR, 'hMm', [450, 700]), 1, hitung)
    expect(besar.betonM3!).toBeGreaterThan(kecil.betonM3!)
  })

  it('menyebut NAMA pemeriksaan yang memuncak, bukan cuma angkanya', () => {
    const [h] = bandingkan(kandidatDariVariasi(DASAR, 'hMm', [520]), 1, hitung)
    expect(h.puncakNama).toBeTruthy()
    /* "96%" tanpa nama tak memberi tahu APA yang harus diperbaiki. */
    expect(typeof h.puncakNama).toBe('string')
  })

  it('menyebut pemeriksaan yang GAGAL dengan namanya', () => {
    /*
      Selimut 30 mm pada tuntutan api 120 menit memang tak lolos — itu yang
      terlihat di lembar PDF (141%). Yang diuji di sini: namanya ikut
      terbawa, bukan hanya jumlahnya.
    */
    const [h] = bandingkan(kandidatDariVariasi(DASAR, 'selimutMm', [30]), 1, hitung)
    expect(h.aman).toBe(false)
    expect(h.gagalPeriksa.length).toBeGreaterThan(0)
    expect(h.gagalPeriksa.join(' ')).toMatch(/api/i)
  })

  it('kandidat yang TAK BISA dihitung tetap muncul, dengan alasannya', () => {
    /*
      Menghilangkannya membuat daftar lebih pendek dari yang diminta, dan
      pemakainya menyimpulkan kandidat itu "tidak disarankan" padahal
      sebenarnya inputnya tak sah.
    */
    const hasil = bandingkan(
      [{ label: 'rusak', input: { ...DASAR, bMm: -1 } }], 1, hitung)
    expect(hasil).toHaveLength(1)
    expect(hasil[0].aman).toBeNull()
    expect(hasil[0].gagal).toBeTruthy()
  })

  it('membedakan "gagal dihitung" dari "tidak aman"', () => {
    /*
      Keduanya bukan hal yang sama, dan menyamakannya membuat input yang
      salah ketik terbaca sebagai desain yang tak kuat — orang lalu
      membesarkan penampang untuk memperbaiki salah ketik.
    */
    const [rusak] = bandingkan([{ label: 'x', input: { ...DASAR, bMm: -1 } }], 1, hitung)
    const [takAman] = bandingkan(kandidatDariVariasi(DASAR, 'selimutMm', [30]), 1, hitung)
    expect(rusak.aman).toBeNull()
    expect(takAman.aman).toBe(false)
  })
})
