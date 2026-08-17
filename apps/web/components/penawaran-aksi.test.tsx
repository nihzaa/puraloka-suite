import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ═══════════════════════════════════════════════════════════════════════════
// DOKUMEN PENAWARAN — sisi layar
//
// Yang dijaga di sini bukan hitungannya (itu milik server, 24 test murni),
// melainkan dua janji layar yang mudah dilanggar tanpa terlihat:
//
//   1. **Layar tidak menghitung total sendiri.** Subtotal, PPN, total, dan
//      terbilang semuanya datang dari server. Menghitung ulang di sini
//      melahirkan dua angka untuk satu nilai — dan yang tercetak di surat
//      adalah punya server, jadi layar yang berbeda hanya menyesatkan.
//
//   2. **Yang sudah TERKIRIM tak menawarkan sunting.** Suratnya di tangan
//      penerima; arsip yang berbeda dari yang mereka pegang tak bisa dipakai
//      membuktikan apa pun.
// ═══════════════════════════════════════════════════════════════════════════

const post = vi.fn()
const patch = vi.fn()
const put = vi.fn()
const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    put: (...a: unknown[]) => put(...a),
    get: (...a: unknown[]) => get(...a),
  },
  makeAbortController: () => new AbortController(),
}))

const {
  ModalSuratPenawaran, ModalRincianPenawaran, ModalStatusPenawaran,
} = await import('./penawaran-aksi')

const HITUNG = {
  subtotal: 320_000_000, diskon: 20_000_000, dpp: 300_000_000,
  ppn: 33_000_000, total: 333_000_000,
  terbilang: 'Tiga ratus tiga puluh tiga juta rupiah',
}

const SURAT = {
  id: 'p1', bid_id: null, nomor: '001/PEN/VIII/2026',
  perihal: 'Penawaran Gedung Serbaguna', kepada: 'PT Sumber Makmur',
  kepada_alamat: 'Jl. Merdeka 1', tanggal: '2026-08-16',
  berlaku_sampai: '2026-09-15', diskon: 20_000_000, ppn_persen: 11,
  syarat: null, catatan: null, status: 'draft', dikirim_pada: null,
}

const ITEM = [
  { uraian: 'A. PEKERJAAN PERSIAPAN', satuan: null, volume: null, harga_satuan: null },
  { uraian: 'Pekerjaan pondasi', satuan: 'm3', volume: 120, harga_satuan: 1_000_000 },
]

function siapkanDetail(status = 'draft') {
  get.mockResolvedValue({
    data: { data: { ...SURAT, status }, item: ITEM, hitung: HITUNG },
  })
}

beforeEach(() => {
  post.mockReset(); patch.mockReset(); put.mockReset(); get.mockReset()
  post.mockResolvedValue({ data: { data: { id: 'baru' } } })
  patch.mockResolvedValue({ data: { data: SURAT } })
  put.mockResolvedValue({ data: { hitung: HITUNG } })
  siapkanDetail()
})

describe('surat: masa berlaku & tanggal', () => {
  it('masa berlaku sebelum tanggal surat ditolak SEBELUM dikirim', async () => {
    const orang = userEvent.setup()
    render(<ModalSuratPenawaran awal={null} onClose={() => {}} onSukses={() => {}} />)

    await orang.type(screen.getByLabelText(/nomor surat/i), '001/PEN/2026')
    await orang.type(screen.getByLabelText(/perihal/i), 'Uji')
    await orang.clear(screen.getByLabelText(/tanggal surat/i))
    await orang.type(screen.getByLabelText(/tanggal surat/i), '2026-08-16')
    await orang.type(screen.getByLabelText(/berlaku sampai/i), '2026-08-01')

    expect(screen.getByRole('button', { name: /buat surat/i })).toBeDisabled()
    expect(screen.getByText(/berakhir sebelum tanggal suratnya/i)).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })

  it('masa berlaku kosong dikirim null, bukan string kosong', async () => {
    const orang = userEvent.setup()
    render(<ModalSuratPenawaran awal={null} onClose={() => {}} onSukses={() => {}} />)

    await orang.type(screen.getByLabelText(/nomor surat/i), '001/PEN/2026')
    await orang.type(screen.getByLabelText(/perihal/i), 'Uji')
    await orang.click(screen.getByRole('button', { name: /buat surat/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    const m = post.mock.calls[0][1] as Record<string, unknown>
    // Tanggal berstring kosong ditolak basis sebagai tanggal tak terbaca, dan
    // pesannya menyebut FORMAT — bukan menyebut bahwa kolomnya memang sedang
    // dikosongkan.
    expect(m.berlaku_sampai).toBeNull()
  })

  it('PPN bawaannya 11%, dan dinyatakan dikenakan SESUDAH diskon', async () => {
    render(<ModalSuratPenawaran awal={null} onClose={() => {}} onSukses={() => {}} />)
    expect(screen.getByLabelText(/ppn/i)).toHaveValue(11)
    expect(screen.getByText(/sesudah diskon/i)).toBeTruthy()
  })
})

describe('rincian: angka datang dari SERVER', () => {
  it('total & terbilang yang tampil adalah yang dari server', async () => {
    render(<ModalRincianPenawaran penawaranId="p1" onClose={() => {}} onSukses={() => {}} />)

    // 320jt − 20jt + 11% = 333jt. Kalau layar menghitung sendiri dan urutan
    // diskon/pajaknya tertukar, angkanya jadi 335,2jt — dan yang tercetak di
    // surat tetap 333jt.
    expect(await screen.findByText(/Rp\s?333\.000\.000/)).toBeTruthy()
    expect(screen.getByText(/Tiga ratus tiga puluh tiga juta rupiah/)).toBeTruthy()
  })

  it('baris JUDUL tak menampilkan "Rp 0" di kolom jumlah', async () => {
    render(<ModalRincianPenawaran penawaranId="p1" onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/uraian baris 1/i)).toBeTruthy())

    // Nol di kolom jumlah membuat pembaca menjumlahkannya sebagai pekerjaan
    // yang diberikan gratis.
    //
    // Kolomnya dicari lewat JUDULNYA, bukan lewat indeks yang dipaku. Versi
    // pertama memakai `querySelectorAll('td')[4]`, dan ia patah 2026-08-16
    // ketika sel URAIAN jadi `<th scope="row">` — perubahan a11y yang tak
    // menyentuh perilaku yang diuji sama sekali. Uji yang patah oleh
    // perubahan tak berhubungan akan dilemahkan orang, bukan dibaca.
    const tabel = screen.getByRole('table')
    const kepala = [...tabel.querySelectorAll('thead th')].map((h) => h.textContent?.trim())
    const kolomJumlah = kepala.indexOf('Jumlah')
    expect(kolomJumlah).toBeGreaterThan(-1)

    const sel = tabel.querySelectorAll('tbody tr')[0].querySelectorAll('th, td')
    expect(sel[kolomJumlah].textContent).toBe('')
  })

  it('menyimpan hanya baris yang beruraian', async () => {
    const orang = userEvent.setup()
    render(<ModalRincianPenawaran penawaranId="p1" onClose={() => {}} onSukses={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/uraian baris 1/i)).toBeTruthy())

    await orang.click(screen.getByRole('button', { name: /tambah baris/i }))
    await orang.click(screen.getByRole('button', { name: /simpan rincian/i }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const m = put.mock.calls[0][1] as { item: Array<{ uraian: string }> }
    // Baris kosong yang ikut terkirim jadi baris tanpa uraian di surat.
    expect(m.item).toHaveLength(2)
  })
})

describe('yang sudah TERKIRIM terkunci di layar', () => {
  it('isian mati dan tombol simpan hilang', async () => {
    siapkanDetail('terkirim')
    render(<ModalRincianPenawaran penawaranId="p1" onClose={() => {}} onSukses={() => {}} />)

    await waitFor(() => expect(screen.getByLabelText(/uraian baris 1/i)).toBeDisabled())
    expect(screen.queryByRole('button', { name: /simpan rincian/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /tambah baris/i })).toBeNull()
  })

  it('sebabnya DINYATAKAN, bukan sekadar isian yang mati', async () => {
    siapkanDetail('terkirim')
    render(<ModalRincianPenawaran penawaranId="p1" onClose={() => {}} onSukses={() => {}} />)

    // Isian mati tanpa penjelasan dibaca sebagai aplikasi rusak.
    expect(await screen.findByRole('alert')).toHaveTextContent(/revisi bernomor baru/i)
  })
})

describe('status', () => {
  it('memperingatkan bahwa terkirim MENGUNCI rinciannya', async () => {
    const orang = userEvent.setup()
    render(<ModalStatusPenawaran penawaran={SURAT} onClose={() => {}} onSukses={() => {}} />)

    await orang.selectOptions(screen.getByLabelText(/^status$/i), 'terkirim')
    expect(screen.getByText(/rinciannya terkunci/i)).toBeTruthy()
  })

  it('status yang belum berubah mematikan simpan', async () => {
    render(<ModalStatusPenawaran penawaran={SURAT} onClose={() => {}} onSukses={() => {}} />)
    expect(screen.getByRole('button', { name: /simpan status/i })).toBeDisabled()
  })

  it('mengirim status ke rute yang benar', async () => {
    const orang = userEvent.setup()
    render(<ModalStatusPenawaran penawaran={SURAT} onClose={() => {}} onSukses={() => {}} />)

    await orang.selectOptions(screen.getByLabelText(/^status$/i), 'menang')
    await orang.click(screen.getByRole('button', { name: /simpan status/i }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][0]).toBe('/api/v1/penawaran/p1/status')
    expect(patch.mock.calls[0][1]).toEqual({ status: 'menang' })
  })
})
