import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavBagian } from './nav-bagian'

/**
 * Kenapa berkas ini ada.
 *
 * `lib/rute-aktif.ts` dibuat 2026-08-07 untuk menyatukan TIGA aturan
 * "rute mana yang aktif" yang berbeda-beda, dan kepala berkasnya menyebut
 * `nav-bagian.tsx:61` sebagai salah satu yang cacat — ia memakai `startsWith`
 * MENTAH, tanpa `+ "/"`.
 *
 * Impornya ditambahkan hari itu. Barisnya TIDAK pernah diganti.
 *
 * Yang membuat itu bertahan berhari-hari: lint melaporkannya sebagai
 * "impor tak terpakai" — keluhan sepele yang terbaca seperti kelalaian gaya,
 * bukan seperti perbaikan yang berhenti di tengah. Tak ada satu pun test yang
 * menanyakan menu mana yang menyala.
 *
 * Jadi yang dikunci di sini bukan "fungsi mana yang dipanggil" melainkan
 * PERILAKUNYA: kalau seseorang menulis ulang aturannya inline lagi, kasus
 * saudara di bawah akan merah.
 */

const mockPathname = vi.hoisted(() => ({ nilai: '/' }))
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.nilai,
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...sisa }: React.ComponentProps<'a'>) => (
    <a href={href} {...sisa}>{children}</a>
  ),
}))

/** Menu mana yang `aria-current="page"` pada pathname tertentu. */
function yangAktif(pathname: string, bagian: Array<{ href: string; label: string }>) {
  mockPathname.nilai = pathname
  const { unmount } = render(<NavBagian bagian={bagian} />)
  const aktif = screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent?.trim())
  unmount()
  return aktif
}

describe('NavBagian — menu mana yang menyala', () => {
  const KEUANGAN = [
    { href: '/keuangan', label: 'Ringkasan' },
    { href: '/keuangan/invoice', label: 'Invoice' },
    { href: '/keuangan/arus-kas', label: 'Arus Kas' },
  ]

  it('akar modul menyala HANYA di halamannya sendiri', () => {
    expect(yangAktif('/keuangan', KEUANGAN)).toEqual(['Ringkasan'])
  })

  it('membuka anak TIDAK ikut menyalakan induknya', () => {
    // Kalau induk ikut menyala, pengguna tak tahu mana yang sedang dibuka.
    expect(yangAktif('/keuangan/invoice', KEUANGAN)).toEqual(['Invoice'])
  })

  it('halaman lebih dalam menyalakan bagian yang memuatnya', () => {
    expect(yangAktif('/keuangan/invoice/abc-123', KEUANGAN)).toEqual(['Invoice'])
  })

  /**
   * INI kasus yang dulu salah, dan satu-satunya alasan berkas ini ada.
   *
   * `"/pengaturan/situs-lama".startsWith("/pengaturan/situs")` bernilai `true`.
   * Dengan `startsWith` mentah, membuka "Situs Lama" menyalakan menu "Situs" —
   * menu yang menyala BUKAN yang sedang dibuka.
   */
  it('saudara yang namanya berawalan sama TIDAK saling menyalakan', () => {
    const PENGATURAN = [
      { href: '/pengaturan/situs', label: 'Situs' },
      { href: '/pengaturan/situs-lama', label: 'Situs Lama' },
    ]
    expect(yangAktif('/pengaturan/situs-lama', PENGATURAN)).toEqual(['Situs Lama'])
    expect(yangAktif('/pengaturan/situs', PENGATURAN)).toEqual(['Situs'])
  })

  it('tak ada yang menyala di rute yang bukan bagian mana pun', () => {
    expect(yangAktif('/proyek', KEUANGAN)).toEqual([])
  })

  /**
   * MODUL BERSARANG — kasus yang dulu salah, ditemukan 2026-08-11.
   *
   * Aturan lama menyimpulkan "akar modul" dari `segmen === 1`. Itu benar untuk
   * `/kas` dan `/keuangan`, tetapi `/pengaturan/asisten` punya DUA segmen —
   * jadi ia memakai aturan anak-segmen dan ikut menyala di keempat
   * sub-halamannya. Diukur di peramban: tab "Lapisan AI" aktif bersamaan
   * dengan "Asisten Pemilik" di semua halaman.
   *
   * Yang menentukan bukan kedalaman href melainkan apakah ada tab LAIN di
   * daftar yang sama yang merupakan anaknya.
   */
  const ASISTEN = [
    { href: '/pengaturan/asisten', label: 'Lapisan AI' },
    { href: '/pengaturan/asisten/pemilik', label: 'Asisten pemilik' },
    { href: '/pengaturan/asisten/staf', label: 'Asisten staf' },
  ]

  it('induk BERSARANG tak ikut menyala di halaman anaknya', () => {
    expect(yangAktif('/pengaturan/asisten/pemilik', ASISTEN)).toEqual(['Asisten pemilik'])
    expect(yangAktif('/pengaturan/asisten/staf', ASISTEN)).toEqual(['Asisten staf'])
  })

  it('induk bersarang menyala di halamannya sendiri', () => {
    expect(yangAktif('/pengaturan/asisten', ASISTEN)).toEqual(['Lapisan AI'])
  })

  /**
   * Kebalikannya harus tetap jalan: tab yang TIDAK punya anak di daftar tetap
   * memakai aturan anak-segmen, supaya halaman detail menyalakan bagiannya.
   */
  it('tab tanpa anak di daftar tetap menyala untuk halaman detailnya', () => {
    expect(yangAktif('/pengaturan/asisten/pemilik/riwayat', ASISTEN)).toEqual([
      'Asisten pemilik',
    ])
  })

  /**
   * Pasangan yang sudah pernah menggigit di `sidebar.tsx`, dicatat di kepala
   * `lib/rute-aktif.ts`: `/proyeksi-kas` bukan anak `/proyek`.
   */
  it('"/proyeksi-kas" bukan anak "/proyek"', () => {
    const P = [
      { href: '/proyek', label: 'Proyek' },
      { href: '/proyeksi-kas', label: 'Proyeksi Kas' },
    ]
    expect(yangAktif('/proyeksi-kas', P)).toEqual(['Proyeksi Kas'])
  })
})
