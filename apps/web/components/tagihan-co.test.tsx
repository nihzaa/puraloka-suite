import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ═══════════════════════════════════════════════════════════════════════════
// TAGIHAN PEKERJAAN TAMBAH
//
// Modul ini seluruhnya tentang MENCEGAH TAGIHAN GANDA, dan layarnya punya dua
// tugas yang tak boleh menyimpang:
//
//   1. **Nilai tak boleh diketik.** Angkanya datang dari CO yang disetujui.
//      Yang menandatangani persetujuan bukan yang menerbitkan tagihan.
//
//   2. **Yang SUDAH ditagih tetap ditampilkan.** CO yang hilang dari daftar
//      akan dicari orang, tak ketemu, lalu ditagih lewat jalur lain — persis
//      tagihan ganda yang seluruh rancangan ini hindari.
// ═══════════════════════════════════════════════════════════════════════════

const post = vi.fn()
const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
  },
  makeAbortController: () => new AbortController(),
}))

const { ModalTagihanCo } = await import('./tagihan-co')

const BELUM = {
  id: 'co1', co_number: 'CO-003', title: 'Tambah kolom baja blok B',
  total_amount_delta: 45_000_000, billing_mode: 'separate_co',
  approved_at: '2026-06-01', project_id: 'p1',
  projects: { id: 'p1', name: 'Gedung Serbaguna' },
  tagihan: null,
}

const SUDAH = {
  ...BELUM, id: 'co2', co_number: 'CO-004', title: 'Perkuatan pondasi',
  total_amount_delta: 22_000_000, billing_mode: 'final_account',
  tagihan: { id: 'i9', invoice_number: 'INV/2026/06/011', status: 'sent' },
}

function siapkan(data: unknown[]) {
  get.mockResolvedValue({ data: { data } })
}

beforeEach(() => {
  post.mockReset(); get.mockReset()
  post.mockResolvedValue({ data: {} })
  siapkan([BELUM, SUDAH])
})

describe('nilai tidak bisa diketik', () => {
  it('tak ada kotak isian nilai — bahkan SESUDAH CO dipilih', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    // CO DIPILIH lebih dulu, dan itu bukan kelengkapan: rincian nilainya baru
    // dirender sesudah ada yang dipilih. Memeriksa sebelum memilih menguji
    // layar yang memang belum menampilkan apa pun — versi pertama uji ini
    // begitu, dan mutasi "nilai jadi kotak isian" lolos hijau karenanya.
    await orang.selectOptions(screen.getByLabelText(/change order/i), 'co1')

    // Kotak yang ada hanya jatuh tempo, PPN, dan catatan. Nilai tagihannya
    // sendiri tak punya isian — itulah pagarnya.
    expect(screen.queryByLabelText(/^nilai/i)).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: /nilai/i })).toBeNull()
  })

  it('nilai CO DIPAJANG beserta keterangan bahwa ia tak bisa diubah', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await orang.selectOptions(screen.getByLabelText(/change order/i), 'co1')

    expect(screen.getByText(/tak bisa diubah di sini/i)).toBeTruthy()
    expect(screen.getByText(/Gedung Serbaguna/)).toBeTruthy()
  })

  it('muatan TIDAK membawa base_amount', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await orang.selectOptions(screen.getByLabelText(/change order/i), 'co1')
    await orang.type(screen.getByLabelText(/jatuh tempo/i), '2026-12-31')
    await orang.click(screen.getByRole('button', { name: /terbitkan tagihan/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    const m = post.mock.calls[0][1] as Record<string, unknown>
    // Server mengambilnya dari CO. Mengirimnya dari sini membuka celah agar
    // tagihan berbeda dari yang disetujui.
    expect(m.base_amount).toBeUndefined()
    expect(m).toMatchObject({
      invoice_type: 'change_order_billing',
      change_order_id: 'co1',
      project_id: 'p1',
    })
  })
})

describe('yang sudah ditagih tetap terlihat', () => {
  it('tak ditawarkan lagi di pemilih, TAPI terdaftar beserta nomor tagihannya', async () => {
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)

    await waitFor(() => expect(screen.getByRole('option', { name: /CO-003/ })).toBeTruthy())
    expect(screen.queryByRole('option', { name: /CO-004/ })).toBeNull()

    expect(await screen.findByText(/sudah ditagih \(1\)/i)).toBeTruthy()
    expect(screen.getByText('INV/2026/06/011')).toBeTruthy()
  })

  it('daftar kosong menjelaskan SYARATNYA, bukan sekadar "tak ada"', async () => {
    siapkan([])
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)

    // KEDUA syaratnya disebut. "Setelah disetujui" saja tak cukup: yang
    // membuat CO tak muncul di sini paling sering justru cara tagihnya, dan
    // orang yang tak diberi tahu akan menyimpulkan CO-nya belum tersimpan.
    expect(await screen.findByText(/tersendiri.*perhitungan akhir/i)).toBeTruthy()
    expect(screen.getByText(/setelah disetujui/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /terbitkan tagihan/i })).toBeNull()
  })

  it('semua sudah ditagih: dijelaskan, bukan tampil sebagai kosong tanpa sebab', async () => {
    siapkan([SUDAH])
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)

    expect(await screen.findByText(/sudah punya tagihannya/i)).toBeTruthy()
  })
})

describe('halangan sebelum kirim', () => {
  it('tanpa jatuh tempo, terbitkan mati', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await orang.selectOptions(screen.getByLabelText(/change order/i), 'co1')

    expect(screen.getByRole('button', { name: /terbitkan tagihan/i })).toBeDisabled()
    expect(screen.getByText(/jatuh tempo wajib diisi/i)).toBeTruthy()
  })

  it('PPN negatif ditolak sebelum dikirim', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await orang.selectOptions(screen.getByLabelText(/change order/i), 'co1')
    await orang.type(screen.getByLabelText(/jatuh tempo/i), '2026-12-31')
    await orang.type(screen.getByLabelText(/ppn/i), '-5000')

    expect(screen.getByRole('button', { name: /terbitkan tagihan/i })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })
})
