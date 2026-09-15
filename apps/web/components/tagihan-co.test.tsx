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

/*
  PILIH DARI COMBOBOX — bukan `selectOptions`.

  ⚠ Ditulis 2026-09-15 mengganti `orang.selectOptions(...)`, dan alasannya
  perlu diketahui sebelum seseorang mengembalikannya.

  `<select>` di layar ini sudah diganti komponen `Pilihan` (236 dropdown,
  commit e8251c35) supaya daftar panjang bisa DICARI — pemilih analisa
  Komposer memuat 3.040 pilihan, dan elemen bawaan cuma bisa diloncati
  dengan mengetik huruf awal.

  `selectOptions` HANYA bekerja pada `<select>` sungguhan; terhadap combobox
  kustom ia gagal dengan `Value "co1" not found in options` — galat yang
  terbaca seperti DATANYA yang hilang, padahal markup-nya yang berubah.

  Helper ini meniru yang dilakukan pengguna: buka, lalu klik barisnya.
*/
async function pilih(orang: ReturnType<typeof userEvent.setup>, label: RegExp, nilaiOpsi: string) {
  await orang.click(screen.getByLabelText(label))
  // Dicari lewat NILAI-nya (`data-nilai`), bukan teks yang tampil: teks bisa
  // berubah saat salinan layar diperbaiki, sedangkan nilai adalah kontrak
  // yang sama dengan `<option value>` dulu.
  /*
    Dicocokkan lewat ISI TEKS `<li role="option">`, bukan `{ name: … }`.

    Diukur, bukan ditebak: `role="option"` ada di `<li>`, sedangkan yang bisa
    ditekan `<button>` di DALAMNYA — jadi NAMA AKSESIBEL li itu tidak memuat
    teks opsinya, dan `getByRole('option', { name })` gagal walau opsinya
    jelas terlihat. Isinya sendiri benar: "CO-003 — T · Rp 45.000.000".
  */
  const opsi = (await screen.findAllByRole('option')).find((o) =>
    new RegExp(nilaiOpsi, 'i').test(o.textContent ?? ''))
  if (!opsi) throw new Error(`opsi "${nilaiOpsi}" tak ada di daftar combobox`)
  await orang.click(opsi)
}


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
    await pilih(orang, /change order/i, 'CO-003')

    // Kotak yang ada hanya jatuh tempo, PPN, dan catatan. Nilai tagihannya
    // sendiri tak punya isian — itulah pagarnya.
    expect(screen.queryByLabelText(/^nilai/i)).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: /nilai/i })).toBeNull()
  })

  it('nilai CO DIPAJANG beserta keterangan bahwa ia tak bisa diubah', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await pilih(orang, /change order/i, 'CO-003')

    expect(screen.getByText(/tak bisa diubah di sini/i)).toBeTruthy()
    expect(screen.getByText(/Gedung Serbaguna/)).toBeTruthy()
  })

  it('muatan TIDAK membawa base_amount', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await pilih(orang, /change order/i, 'CO-003')
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

    // Isi teks, bukan `{ name }` — alasannya di helper `pilih()` di atas:
    // role="option" ada di <li>, tombolnya di dalamnya, jadi nama aksesibel
    // li tak memuat teks opsinya.
    await waitFor(() => expect(
      screen.getAllByRole('option').some((o) => /CO-003/.test(o.textContent ?? ''))
    ).toBe(true))
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

    await pilih(orang, /change order/i, 'CO-003')

    expect(screen.getByRole('button', { name: /terbitkan tagihan/i })).toBeDisabled()
    expect(screen.getByText(/jatuh tempo wajib diisi/i)).toBeTruthy()
  })

  it('PPN negatif ditolak sebelum dikirim', async () => {
    const orang = userEvent.setup()
    render(<ModalTagihanCo onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/change order/i)).toBeTruthy())

    await pilih(orang, /change order/i, 'CO-003')
    await orang.type(screen.getByLabelText(/jatuh tempo/i), '2026-12-31')
    await orang.type(screen.getByLabelText(/ppn/i), '-5000')

    expect(screen.getByRole('button', { name: /terbitkan tagihan/i })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })
})
