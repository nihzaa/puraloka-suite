import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { useTutupEsc } from './use-tutup-esc'

// ─────────────────────────────────────────────────────────────────────────────
// `useTutupEsc` — TEST PERTAMA di `apps/web`.
//
// Hook ini dipasang di 51 tempat pada 2026-08-01/02 untuk menutup jebakan
// papan tik: 36 modal yang hanya bisa ditutup dengan tetikus (WCAG 2.1.2,
// Level A). Seluruhnya diverifikasi lewat lint, pembacaan kode, dan
// pemeriksaan bundle — tak satu pun dengan MENJALANKANNYA.
//
// Penjaga `modal-esc-ratchet.mjs` menangkap KEBERADAAN panggilannya, bukan
// efeknya. Jadi kalau seseorang mengubah `e.key !== 'Escape'` jadi
// `e.key !== 'Esc'` (nama lama yang sudah usang), lint tetap hijau, penjaga
// tetap hijau, dan 51 modal kembali menjebak tanpa satu pun gejala.
//
// Test ini yang menutup celah itu.
// ─────────────────────────────────────────────────────────────────────────────

/** Modal minimal: yang diuji hook-nya, bukan tampilannya. */
function ModalUji({ awalTerbuka = true, aktif = true }: { awalTerbuka?: boolean; aktif?: boolean }) {
  const [terbuka, setTerbuka] = useState(awalTerbuka)
  useTutupEsc(terbuka && aktif ? () => setTerbuka(false) : null)
  return terbuka ? <div role="dialog">Isi modal</div> : <p>tertutup</p>
}

describe('useTutupEsc — Esc benar-benar menutup', () => {
  it('menekan Esc menutup modal', async () => {
    const user = userEvent.setup()
    render(<ModalUji />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(
      screen.queryByRole('dialog'),
      'Esc ditekan tapi modal masih terbuka — pemakai keyboard TERJEBAK, ' +
        'dan itu persis yang hook ini dibuat untuk mencegah (WCAG 2.1.2)',
    ).not.toBeInTheDocument()
  })

  it('tombol LAIN tidak menutup — Esc saja, bukan sembarang tombol', async () => {
    // Kalau hook menutup pada tombol apa pun, orang yang mengetik di dalam
    // form akan kehilangan isian tanpa tahu kenapa.
    const user = userEvent.setup()
    render(<ModalUji />)

    await user.keyboard('a')
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('dialog'), 'modal tertutup oleh tombol selain Esc').toBeInTheDocument()
  })

  it('aksi `null` → Esc TIDAK menutup (mis. sedang menyimpan)', async () => {
    // Kontrak hook: melewatkan `null` menonaktifkannya. Dipakai untuk form
    // yang sedang mengirim — menutupnya di tengah jalan membuang isian orang.
    const user = userEvent.setup()
    render(<ModalUji aktif={false} />)

    await user.keyboard('{Escape}')

    expect(
      screen.getByRole('dialog'),
      'Esc menutup padahal aksinya `null` — form yang sedang menyimpan bisa ' +
        'hilang di tengah jalan',
    ).toBeInTheDocument()
  })

  it('aksi `null` → listener TAK PERNAH dipasang, bukan sekadar tak berefek', async () => {
    // ⚠️ Test di atas ternyata TIDAK CUKUP, dan itu ketahuan dari uji mutasi:
    // menghapus guard `if (!tutup) return` membuat listener tetap terpasang
    // dan memanggil `null` saat Esc ditekan — melempar TypeError. Test di atas
    // tetap hijau karena error di dalam event listener tak menggagalkan test.
    //
    // Bedanya nyata, bukan kerapian: listener yang terpasang untuk setiap
    // modal TERTUTUP menumpuk di `document`, dan tiap Esc melempar error
    // sebanyak modal yang pernah dibuka. Yang dijaga di sini: guard-nya
    // mencegah PEMASANGAN, bukan cuma efeknya.
    const pasang = vi.spyOn(document, 'addEventListener')
    render(<ModalUji aktif={false} />)

    const keydown = pasang.mock.calls.filter(([tipe]) => tipe === 'keydown')
    expect(
      keydown,
      'listener keydown dipasang padahal aksinya `null` — guard `if (!tutup) ' +
        'return` hilang, dan tiap modal tertutup menyisakan penangan yang ' +
        'memanggil null saat Esc ditekan',
    ).toHaveLength(0)

    pasang.mockRestore()
  })

  it('penangan DICABUT saat komponen dilepas — tak ada kebocoran', async () => {
    // Penangan dipasang di `document`. Kalau tak dicabut, modal yang sudah
    // hilang tetap menanggapi Esc — dan menutup sesuatu yang tak terlihat.
    const tutup = vi.fn()
    function Pembungkus() {
      const [tampil, setTampil] = useState(true)
      return (
        <>
          <button onClick={() => setTampil(false)}>lepas</button>
          {tampil ? <Anak /> : null}
        </>
      )
    }
    function Anak() {
      useTutupEsc(tutup)
      return <div role="dialog">isi</div>
    }

    const user = userEvent.setup()
    render(<Pembungkus />)
    await user.click(screen.getByRole('button', { name: 'lepas' }))
    await user.keyboard('{Escape}')

    expect(
      tutup,
      'penangan masih aktif sesudah komponen dilepas — `useEffect` tak ' +
        'membersihkan listener, dan tiap modal yang pernah dibuka menumpuk',
    ).not.toHaveBeenCalled()
  })

  it('Esc berulang aman — menutup sekali, tak melempar', async () => {
    const user = userEvent.setup()
    render(<ModalUji />)
    await user.keyboard('{Escape}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('tertutup')).toBeInTheDocument()
  })
})
