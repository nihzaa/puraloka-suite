import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { dapatDitekan } from './dapat-ditekan'

// ─────────────────────────────────────────────────────────────────────────────
// `dapatDitekan` — helper yang membuat elemen non-tombol benar-benar bisa
// ditekan (baris tabel yang melipat, kartu KPI, pencentang permission).
//
// Kenapa perlu test, padahal kodenya sederhana: yang dijaga di sini bukan
// "helper-nya jalan" melainkan KELENGKAPANNYA. Kegagalan paling sering pada
// pola ini adalah separuh implementasi —
//
//   · `role` tanpa `tabIndex` → pembaca layar bilang "tombol", Tab melewatinya
//   · `tabIndex` tanpa penangan → bisa difokus, Enter tak melakukan apa pun
//   · Enter ditangani, Space tidak → terasa rusak SESEKALI, dan itu lebih
//     membingungkan daripada rusak konsisten
//
// Ketiganya lolos lint dan lolos pembacaan sekilas. Hanya menjalankannya yang
// membuktikan.
// ─────────────────────────────────────────────────────────────────────────────

describe('dapatDitekan — kelengkapan, bukan sekadar ada', () => {
  it('Enter memicu aksi', async () => {
    const aksi = vi.fn()
    const user = userEvent.setup()
    render(<div {...dapatDitekan(aksi, 'Lipat kategori')}>baris</div>)

    await user.tab()
    await user.keyboard('{Enter}')

    expect(aksi, 'Enter tak memicu aksi — elemen tampak bisa ditekan tapi tidak').toHaveBeenCalledTimes(1)
  })

  it('Space JUGA memicu aksi — bukan Enter saja', async () => {
    // Ini kegagalan paling sering pada pola `role="button"` buatan tangan.
    // Tombol asli menanggapi keduanya; separuh implementasi membuat orang
    // mengira elemennya kadang rusak.
    const aksi = vi.fn()
    const user = userEvent.setup()
    render(<div {...dapatDitekan(aksi, 'Lipat kategori')}>baris</div>)

    await user.tab()
    await user.keyboard(' ')

    expect(
      aksi,
      'Space tak memicu aksi — tombol asli menanggapi Enter DAN Space, jadi ' +
        'separuh implementasi terasa rusak sesekali',
    ).toHaveBeenCalledTimes(1)
  })

  it('klik tetap bekerja', async () => {
    const aksi = vi.fn()
    const user = userEvent.setup()
    render(<div {...dapatDitekan(aksi, 'Lipat kategori')}>baris</div>)
    await user.click(screen.getByRole('button'))
    expect(aksi).toHaveBeenCalledTimes(1)
  })

  it('BISA DIFOKUS — Tab berhenti di sini', async () => {
    // `role="button"` tanpa `tabIndex` menjanjikan sesuatu yang tak ada:
    // pembaca layar menyebut "tombol", tapi Tab melewatinya begitu saja.
    const user = userEvent.setup()
    render(<div {...dapatDitekan(vi.fn(), 'Lipat kategori')}>baris</div>)

    await user.tab()

    expect(
      screen.getByRole('button'),
      'Tab tak berhenti di elemen ini — `role` ada tapi `tabIndex` tidak, ' +
        'jadi ia mengumumkan diri sebagai tombol yang tak bisa dicapai',
    ).toHaveFocus()
  })

  it('punya nama yang terbaca pembaca layar', () => {
    render(<div {...dapatDitekan(vi.fn(), 'Lipat kategori Pekerjaan Tanah')}>baris</div>)
    expect(screen.getByRole('button', { name: 'Lipat kategori Pekerjaan Tanah' })).toBeInTheDocument()
  })

  it('aksi `null` → BUKAN tombol sama sekali', () => {
    // Elemen yang tak melakukan apa-apa tak boleh mengumumkan diri sebagai
    // tombol. Tab yang berhenti di sesuatu yang tak bisa ditekan membuat orang
    // mengira ada yang rusak.
    render(<div {...dapatDitekan(null, 'Tak aktif')} data-testid="mati">baris</div>)

    const el = screen.getByTestId('mati')
    expect(screen.queryByRole('button'), 'elemen tanpa aksi mengumumkan diri sebagai tombol').toBeNull()
    expect(el).not.toHaveAttribute('tabindex')
    expect(el).not.toHaveAttribute('aria-label')
  })

  it('`aria-expanded` ikut saat status buka/tutup diberikan', () => {
    // Untuk baris yang melipat, pembaca layar harus tahu ia sedang terbuka
    // atau tertutup — kalau tidak, menekannya berulang terasa seperti judi.
    const { rerender } = render(
      <div {...dapatDitekan(vi.fn(), 'Lipat', { terbuka: true })}>baris</div>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')

    rerender(<div {...dapatDitekan(vi.fn(), 'Lipat', { terbuka: false })}>baris</div>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('tanpa opsi `terbuka` → `aria-expanded` TIDAK dipasang', () => {
    // Elemen yang tak melipat apa pun tak boleh mengaku punya status
    // buka/tutup — pembaca layar akan mengumumkan "tertutup" untuk tombol
    // yang tak pernah membuka apa pun.
    render(<div {...dapatDitekan(vi.fn(), 'Buka detail')}>baris</div>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-expanded')
  })

  it('Space TIDAK menggulirkan halaman', async () => {
    // Space menggulir secara bawaan. Pada baris tabel yang panjang, layar
    // melompat setiap kali orang mencoba menekannya.
    const user = userEvent.setup()
    // Pendengar dipasang di `document`, bukan lewat `<div onKeyDown>`
    // pembungkus: yang terakhir membuat elemen statis menerima interaksi —
    // persis pola yang `no-static-element-interactions` larang, dan berkas
    // test tak boleh jadi pengecualian yang menaikkan ambang.
    let dicegah = false
    const pantau = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.defaultPrevented) dicegah = true
    }
    document.addEventListener('keydown', pantau)

    render(<div {...dapatDitekan(vi.fn(), 'Lipat')}>baris</div>)
    await user.tab()
    await user.keyboard(' ')
    document.removeEventListener('keydown', pantau)

    expect(
      dicegah,
      'Space tak dicegah — layar melompat setiap kali orang menekan baris',
    ).toBe(true)
  })

  it('tombol LAIN tidak memicu aksi', async () => {
    const aksi = vi.fn()
    const user = userEvent.setup()
    render(<div {...dapatDitekan(aksi, 'Lipat')}>baris</div>)

    await user.tab()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('a')
    await user.keyboard('{Escape}')

    expect(aksi, 'tombol sembarang memicu aksi').not.toHaveBeenCalled()
  })
})
