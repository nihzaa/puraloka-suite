import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './toast'

// ─────────────────────────────────────────────────────────────────────────────
// `ToastProvider` — satu-satunya jalur di web yang memberi tahu pemakai bahwa
// sesuatu BERHASIL atau GAGAL.
//
// Yang dijaga di sini bukan tampilannya, melainkan satu keputusan desain yang
// mudah hilang saat refactor: toast SUKSES menghilang sendiri setelah 3 detik,
// toast ERROR TIDAK. Alasannya konkret — pesan gagal biasanya memuat sebab
// ("saldo tidak cukup", "termin sudah ditandai terbayar"), dan orang di
// lapangan sering tak sedang menatap layar saat menekan tombol. Pesan yang
// menghilang sendiri berarti kegagalan yang tak pernah terbaca.
//
// Membalik perilakunya tak menghasilkan error apa pun, tak tertangkap lint,
// dan tak terlihat sampai ada yang mengeluh "kok tersimpan tapi datanya tak
// berubah".
// ─────────────────────────────────────────────────────────────────────────────

function Pemicu({ tipe, pesan }: { tipe: 'success' | 'error'; pesan: string }) {
  const { showToast } = useToast()
  return <button onClick={() => showToast(tipe, pesan)}>picu</button>
}

function pasang(tipe: 'success' | 'error', pesan = 'pesan uji') {
  render(
    <ToastProvider>
      <Pemicu tipe={tipe} pesan={pesan} />
    </ToastProvider>,
  )
}

describe('ToastProvider', () => {
  it('menampilkan pesan saat dipicu', async () => {
    const user = userEvent.setup()
    pasang('success', 'Kasbon disetujui')

    await user.click(screen.getByRole('button', { name: 'picu' }))

    expect(screen.getByText('Kasbon disetujui')).toBeInTheDocument()
  })

  it('toast SUKSES hilang sendiri setelah 3 detik', async () => {
    // ⚠️ Timer palsu SENGAJA tidak dipakai di sini.
    //
    // `ToastProvider` memasang portalnya lewat `useEffect`, dan dengan
    // `vi.useFakeTimers()` efek itu tak pernah tuntas — setiap klik
    // menggantung sampai "Test timed out", gejala yang tak menunjuk ke
    // sebabnya sama sekali. Dicoba juga menaruh `useFakeTimers()` sebelum
    // `userEvent.setup()`; tetap menggantung.
    //
    // `waitFor` dengan timeout nyata lebih lambat (~3 detik) tapi menguji
    // JALUR YANG SAMA dengan yang dipakai orang, tanpa memalsukan apa pun.
    const user = userEvent.setup()
    pasang('success', 'Tersimpan')

    await user.click(screen.getByRole('button', { name: 'picu' }))
    expect(screen.getByText('Tersimpan')).toBeInTheDocument()

    await waitFor(
      () => expect(
        screen.queryByText('Tersimpan'),
        'toast sukses menetap — layar menumpuk pesan lama sampai orang menutupnya satu per satu',
      ).not.toBeInTheDocument(),
      { timeout: 4500 },
    )
  }, 8000)

  it('toast ERROR TIDAK hilang sendiri — harus terbaca', async () => {
    // Ini keputusan desain yang paling mudah hilang saat refactor, dan
    // membaliknya tak menghasilkan gejala apa pun: pesan gagal memuat SEBAB,
    // dan orang di lapangan sering tak menatap layar saat menekan tombol.
    const user = userEvent.setup()
    pasang('error', 'Saldo tidak cukup')

    await user.click(screen.getByRole('button', { name: 'picu' }))
    // Ditunggu LEBIH LAMA daripada 3 detik yang berlaku untuk toast sukses —
    // kalau ia ikut menghilang, di sinilah ketahuan.
    await new Promise((r) => setTimeout(r, 3500))

    expect(
      screen.getByText('Saldo tidak cukup'),
      'toast error ikut hilang sendiri — kegagalan yang memuat sebabnya lenyap ' +
        'sebelum sempat dibaca, dan orang mengira tindakannya berhasil',
    ).toBeInTheDocument()
  }, 8000)

  it('error bisa ditutup manual', async () => {
    const user = userEvent.setup()
    pasang('error', 'Gagal menyimpan')

    await user.click(screen.getByRole('button', { name: 'picu' }))
    expect(screen.getByText('Gagal menyimpan')).toBeInTheDocument()

    // Tombol tutup pada toast — bukan tombol pemicu.
    const tombol = screen.getAllByRole('button').filter((b) => b.textContent !== 'picu')
    expect(tombol.length, 'toast error tak punya tombol tutup — ia menetap selamanya').toBeGreaterThan(0)

    await user.click(tombol[0])
    expect(screen.queryByText('Gagal menyimpan')).not.toBeInTheDocument()
  })

  it('beberapa toast bisa tampil bersamaan', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Pemicu tipe="error" pesan="Gagal A" />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'picu' }))
    await user.click(screen.getByRole('button', { name: 'picu' }))

    expect(
      screen.getAllByText('Gagal A'),
      'toast kedua menimpa yang pertama — kegagalan beruntun hanya terlihat satu',
    ).toHaveLength(2)
  })

  it('`useToast` di luar provider tak melempar', () => {
    // Nilai bawaan konteks adalah no-op. Kalau ia `undefined`, komponen mana
    // pun yang dipakai di luar provider akan menjatuhkan seluruh halaman —
    // dan itu terjadi saat komponen dipindah, bukan saat ditulis.
    function Sendiri() {
      const { showToast } = useToast()
      return <button onClick={() => showToast('error', 'x')}>picu</button>
    }
    expect(() => render(<Sendiri />)).not.toThrow()
  })
})
