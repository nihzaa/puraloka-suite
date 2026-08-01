import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PilihCari, type OpsiPilih } from './pilih-cari'

// ─────────────────────────────────────────────────────────────────────────────
// `PilihCari` — dropdown cari-sambil-ketik, dipakai untuk memilih resource
// dan material di halaman Estimasi.
//
// Kenapa komponen INI yang diuji lebih dulu: ia satu-satunya di repo yang
// mengimplementasikan navigasi papan tik SENDIRI (↑/↓ berpindah, Enter
// memilih, Esc menutup), bukan mengandalkan perilaku bawaan `<select>`.
//
// Kode semacam itu punya banyak jalur yang tak terlihat dari luar: sorotan
// yang keluar batas, penyaringan yang tak mengatur ulang sorotan, Enter yang
// memilih baris salah setelah daftar berubah. Semuanya lolos lint dan tsc —
// dan semuanya membuat orang memilih hal yang bukan dimaksudnya, pada
// komponen yang menentukan HARGA di RAB.
// ─────────────────────────────────────────────────────────────────────────────

const OPSI: OpsiPilih[] = [
  { value: 'r1', label: 'Semen Portland', keterangan: 'zak' },
  { value: 'r2', label: 'Pasir Beton', keterangan: 'm3' },
  { value: 'r3', label: 'Besi Beton 10mm', keterangan: 'kg' },
  { value: 'r4', label: 'Batu Split', keterangan: 'm3', nonaktif: true },
]

/** Pemicu dropdown: `<button aria-haspopup="listbox">`, bukan `role="combobox"`.
 *  Pola ini sah menurut WAI-ARIA dan yang dipakai komponennya. */
const pemicu = () => screen.getAllByRole('button')[0]

function pasang(over: Partial<React.ComponentProps<typeof PilihCari>> = {}) {
  const onChange = vi.fn()
  render(<PilihCari opsi={OPSI} value="" onChange={onChange} {...over} />)
  return { onChange }
}

describe('PilihCari — navigasi papan tik', () => {
  it('mengetik menyaring daftar', async () => {
    const user = userEvent.setup()
    pasang()

    await user.click(pemicu())
    await user.keyboard('pasir')

    expect(screen.getByText('Pasir Beton')).toBeInTheDocument()
    expect(
      screen.queryByText('Semen Portland'),
      'penyaringan tak bekerja — mengetik tak mempersempit daftar',
    ).not.toBeInTheDocument()
  })

  it('penyaringan mengabaikan besar-kecil huruf', async () => {
    const user = userEvent.setup()
    pasang()
    await user.click(pemicu())
    await user.keyboard('SEMEN')
    expect(screen.getByText('Semen Portland')).toBeInTheDocument()
  })

  it('penyaringan juga membaca keterangan, bukan cuma label', async () => {
    // Orang mencari "m3" untuk menemukan material bersatuan kubik. Kalau
    // hanya label yang dicari, pencarian itu tak menemukan apa pun.
    const user = userEvent.setup()
    pasang()
    await user.click(pemicu())
    await user.keyboard('kg')
    expect(screen.getByText('Besi Beton 10mm')).toBeInTheDocument()
  })

  it('Enter memilih baris yang SEDANG DISOROT, bukan baris pertama', async () => {
    // Ini jalur yang paling mudah rusak: sesudah ↓ dua kali, Enter harus
    // memilih baris ketiga. Kalau ia selalu memilih `hasil[0]`, orang
    // mendapat material yang bukan dimaksudnya — dan harga RAB ikut salah.
    const user = userEvent.setup()
    const { onChange } = pasang()

    await user.click(pemicu())
    await user.keyboard('{ArrowDown}{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(
      onChange,
      'Enter memilih baris yang salah — sorotan dan pilihan tak sinkron',
    ).toHaveBeenCalledWith('r3')
  })

  it('↑ tak bisa melewati batas atas', async () => {
    const user = userEvent.setup()
    const { onChange } = pasang()

    await user.click(pemicu())
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    await user.keyboard('{Enter}')

    expect(onChange, 'sorotan keluar batas atas').toHaveBeenCalledWith('r1')
  })

  it('↓ berhenti di baris terakhir — tak keluar batas', async () => {
    // Opsi terakhir (`r4`) sengaja `nonaktif`, jadi yang dibuktikan di sini
    // adalah sorotan tak melewati ujung daftar. Kalau ia keluar batas,
    // `hasil[sorot]` jadi `undefined` dan Enter melempar.
    const user = userEvent.setup()
    const { onChange } = pasang()

    await user.click(pemicu())
    // Ditekan lebih banyak daripada jumlah opsi.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    await user.keyboard('{Enter}')

    // Tak melempar, dan tak memilih opsi nonaktif.
    expect(onChange, 'opsi nonaktif justru terpilih').not.toHaveBeenCalled()
    expect(screen.getByRole('listbox'), 'daftar tertutup padahal tak ada yang terpilih').toBeInTheDocument()
  })

  it('sorotan tetap DI DALAM daftar setelah ↓ berlebihan', async () => {
    // ⚠️ Test ini ada karena uji mutasi menemukan celah: melepas
    // `Math.min(s + 1, hasil.length - 1)` TIDAK menggagalkan test mana pun.
    // Sebabnya `if (hasil[sorot])` menelan indeks di luar batas diam-diam —
    // Enter jadi tak melakukan apa-apa, dan itu tak terlihat dari luar.
    //
    // Yang rusak bukan Enter-nya, melainkan SOROTANNYA: tak ada baris yang
    // tersorot, jadi orang menekan ↓ lalu Enter dan tak terjadi apa pun tanpa
    // penjelasan. Dijaga lewat penanda visual, karena itu satu-satunya yang
    // membedakan.
    const user = userEvent.setup()
    pasang()

    await user.click(pemicu())
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')

    const opsi = screen.getAllByRole('option')
    const tersorot = opsi.filter((o) => o.style.background.includes('--bg'))
    expect(
      tersorot,
      'tak ada baris tersorot setelah ↓ berlebihan — sorotan keluar batas, ' +
        'dan Enter jadi tak melakukan apa pun tanpa penjelasan',
    ).toHaveLength(1)
  })

  it('opsi NONAKTIF tak bisa dipilih — diklik pun tak berubah', async () => {
    // `nonaktif` dipakai untuk material tanpa harga: memilihnya membuat RAB
    // memakai angka nol tanpa ada yang menyadarinya.
    const user = userEvent.setup()
    const { onChange } = pasang()

    await user.click(pemicu())
    await user.click(screen.getByText('Batu Split'))

    expect(onChange, 'opsi nonaktif terpilih — material tanpa harga masuk ke RAB').not.toHaveBeenCalled()
  })

  it('Esc menutup daftar tanpa memilih', async () => {
    const user = userEvent.setup()
    const { onChange } = pasang()

    await user.click(pemicu())
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox'), 'Esc tak menutup daftar').not.toBeInTheDocument()
    expect(onChange, 'Esc justru memilih sesuatu').not.toHaveBeenCalled()
  })

  it('klik opsi memilihnya', async () => {
    const user = userEvent.setup()
    const { onChange } = pasang()

    await user.click(pemicu())
    await user.click(screen.getByText('Besi Beton 10mm'))

    expect(onChange).toHaveBeenCalledWith('r3')
  })

  it('nilai terpilih ditampilkan, bukan placeholder', () => {
    pasang({ value: 'r2' })
    expect(pemicu()).toHaveTextContent('Pasir Beton')
  })

  it('pencarian tanpa hasil menampilkan pesan, bukan daftar kosong senyap', async () => {
    // Daftar yang kosong tanpa penjelasan terbaca sebagai "aplikasi rusak".
    const user = userEvent.setup()
    pasang()

    await user.click(pemicu())
    await user.keyboard('xyztidakada')

    expect(screen.getByText('Tidak ada yang cocok.')).toBeInTheDocument()
  })

  it('punya penanda ARIA yang benar — haspopup + expanded + listbox', async () => {
    // Tanpa ini pembaca layar menyebutnya sekadar "tombol", dan orang tak
    // tahu ada daftar yang bisa dijelajahi.
    const user = userEvent.setup()
    pasang()

    const p = pemicu()
    expect(p).toHaveAttribute('aria-haspopup', 'listbox')
    expect(p).toHaveAttribute('aria-expanded', 'false')

    await user.click(p)
    expect(p).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})
