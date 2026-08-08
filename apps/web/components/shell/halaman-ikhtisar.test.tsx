import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HalamanIkhtisar } from './halaman-ikhtisar'
import { Rail } from './rail'

/**
 * Yang diuji di sini adalah KEPUTUSAN STRUKTUR, bukan rupa.
 *
 * Rail adalah slot: halaman DASHBOARD mengisinya, halaman DAFTAR tidak. Kalau
 * pembedaan itu rusak, gejalanya halus — halaman daftar menyisakan kolom kosong
 * selebar 300px, atau dashboard kehilangan railnya tanpa galat apa pun.
 * Keduanya tak akan membuat test lain merah.
 */
describe('HalamanIkhtisar', () => {
  it('tanpa rail: satu kolom, tak ada kelas grid dua-kolom', () => {
    const { container } = render(<HalamanIkhtisar>isi</HalamanIkhtisar>)
    expect(
      container.querySelector('.ikhtisar-grid'),
      'halaman daftar tak boleh memakai grid dua-kolom: sisanya jadi ruang ' +
      'kosong 300px yang memotong lebar tabel tanpa memberi apa pun',
    ).toBeNull()
  })

  it('dengan rail: memakai grid dua-kolom', () => {
    const { container } = render(
      <HalamanIkhtisar rail={<Rail>rail</Rail>}>isi</HalamanIkhtisar>,
    )
    expect(container.querySelector('.ikhtisar-grid')).toBeTruthy()
  })

  /*
   * Dua `render()` menumpuk di DOM yang sama, jadi `getByText` global akan
   * menemukan dua kecocokan dan gagal. Dicari di dalam `container` masing-
   * masing — kegagalan pertama test ini justru karena itu, bukan karena
   * komponennya salah.
   */
  it('isi halaman tetap tampil di kedua bentuk', () => {
    const tanpa = render(<HalamanIkhtisar>isi utama</HalamanIkhtisar>)
    expect(tanpa.container.textContent).toContain('isi utama')

    const dengan = render(
      <HalamanIkhtisar rail={<Rail>panel</Rail>}>isi utama</HalamanIkhtisar>,
    )
    expect(dengan.container.textContent).toContain('isi utama')
    expect(dengan.container.textContent).toContain('panel')
  })

  /*
   * `<aside>` bukan kosmetik: pembaca layar memakainya untuk MELOMPATI isi
   * pelengkap. Kalau rail jadi `<div>` biasa, lima baris antrean ikut terbaca
   * sebelum isi utama halaman.
   */
  it('rail memakai <aside> ber-label supaya bisa dilompati pembaca layar', () => {
    const { container } = render(<Rail>isi</Rail>)
    const aside = container.querySelector('aside')
    expect(aside).toBeTruthy()
    expect(aside?.getAttribute('aria-label')).toBeTruthy()
  })
})
