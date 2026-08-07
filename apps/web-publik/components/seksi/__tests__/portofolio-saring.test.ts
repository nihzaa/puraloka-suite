import { describe, it, expect } from 'vitest'
import { petakTerlihat, geserIndeks } from '../portofolio-logika'
import type { Kategori, Media } from '@/lib/konten'

/**
 * Logika saring & navigasi portofolio.
 *
 * ── Kenapa diuji terpisah dari komponennya
 *
 * `apps/web-publik` memakai `environment: 'node'` tanpa React testing library
 * (diperiksa di `vitest.config.ts`, bukan diasumsikan). Menambah jsdom +
 * @testing-library demi mengklik tombol adalah pekerjaan tersendiri.
 *
 * Yang lebih penting: bagian yang BISA SALAH DIAM-DIAM di sini bukan
 * render-nya, melainkan aritmetika indeks. Foto yang salah muncul saat panah
 * ditekan, atau saringan yang menampilkan kategori keliru, adalah kesalahan
 * yang tetap terlihat rapi di layar. Itu persis yang diuji di sini.
 *
 * Perilaku DOM-nya (fokus terkunci, Esc, fokus kembali ke pemicu) sudah
 * dibuktikan di peramban nyata dan tercatat di JOURNAL.
 */

const m = (nama: string): Media => ({
  path_storage: nama, alt: `alt ${nama}`, lebar: 1600, tinggi: 1200, urutan: 0,
})

const k = (kunci: string, ...foto: string[]): Kategori => ({
  kunci, judul: kunci, ringkasan: null, lokasi: null, lingkup: null, urutan: 0,
  media: foto.map(m),
})

const DATA: Kategori[] = [
  k('pabrik', 'p1', 'p2', 'p3'),
  k('baja', 'b1', 'b2'),
  k('lahan', 'l1'),
]

describe('petakTerlihat', () => {
  it('tanpa saringan, menampilkan seluruh foto dari semua kategori', () => {
    expect(petakTerlihat(DATA, null)).toHaveLength(6)
  })

  it('dengan saringan, hanya kategori itu', () => {
    const hasil = petakTerlihat(DATA, 'baja')
    expect(hasil).toHaveLength(2)
    expect(hasil.every((x) => x.kunci === 'baja')).toBe(true)
  })

  // INVARIAN INTI: tiap petak membawa asal-usulnya. Versi pertama mencari
  // ulang dengan `k.media.includes(m)` — perbandingan REFERENSI objek, yang
  // bekerja hari ini dan gagal diam-diam begitu datanya disalin atau
  // di-serialisasi ulang.
  it('indeks yang dibawa adalah indeks DI DALAM kategorinya, bukan indeks global', () => {
    const semua = petakTerlihat(DATA, null)
    const baja = semua.filter((x) => x.kunci === 'baja')
    expect(baja.map((x) => x.indeks)).toEqual([0, 1])

    const lahan = semua.filter((x) => x.kunci === 'lahan')
    // Foto ke-6 secara global, tapi ke-0 di kategorinya. Memakai indeks
    // global akan membuat panah membuka foto kategori lain.
    expect(lahan[0].indeks).toBe(0)
  })

  it('saringan ke kategori yang tak ada menghasilkan kosong, bukan galat', () => {
    expect(petakTerlihat(DATA, 'entah')).toEqual([])
  })

  it('kategori tanpa foto tidak menyumbang petak', () => {
    expect(petakTerlihat([...DATA, k('kosong')], null)).toHaveLength(6)
  })
})

describe('geserIndeks', () => {
  it('maju satu', () => {
    expect(geserIndeks(0, 1, 3)).toBe(1)
  })

  // BERPUTAR, bukan berhenti. Panah yang mati di ujung terbaca sebagai
  // tombol rusak, bukan sebagai batas.
  it('dari foto terakhir, maju kembali ke pertama', () => {
    expect(geserIndeks(2, 1, 3)).toBe(0)
  })

  it('dari foto pertama, mundur ke terakhir', () => {
    expect(geserIndeks(0, -1, 3)).toBe(2)
  })

  // `(0 - 1) % 1` di JavaScript menghasilkan -0, dan indeks negatif
  // mengembalikan `undefined` dari array tanpa satu pun galat.
  it('kategori berisi satu foto tetap di indeks 0, tak pernah negatif', () => {
    expect(geserIndeks(0, -1, 1)).toBe(0)
    expect(geserIndeks(0, 1, 1)).toBe(0)
    expect(Object.is(geserIndeks(0, -1, 1), -0)).toBe(false)
  })

  it('jumlah nol tidak menghasilkan NaN', () => {
    expect(geserIndeks(0, 1, 0)).toBe(0)
  })
})
