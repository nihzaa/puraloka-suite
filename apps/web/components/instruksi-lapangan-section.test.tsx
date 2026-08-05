import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUKSI LAPANGAN — produknya bukan pencatatan, melainkan KONFIRMASI
//
// Perintah lisan yang dicatat sepihak bukan bukti — ia versi kita. Empat hal
// yang kalau salah membuat modul ini kehilangan gunanya:
//
//   1. `disangkal` HARUS terpisah dari "belum dikonfirmasi". Yang pertama
//      sudah sengketa dan butuh bukti LAIN; menampilkannya bersama yang kedua
//      membuat orang mengira masih bisa dikejar dengan surat.
//   2. Instruksi yang berdampak biaya TAPI belum jadi klaim harus terlihat —
//      itu uang yang berhak ditagih tapi belum diajukan.
//   3. Satu instruksi bisa memicu DUA jalur (klaim + EOT). Yang kedua paling
//      sering terlupa, jadi keduanya ditampilkan terpisah.
//   4. Konfirmasi TERLAMBAT tetap bisa dicatat — mencatatnya lebih baik
//      daripada tidak, asal nilainya dinyatakan apa adanya.
// ═══════════════════════════════════════════════════════════════════════════

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  makeAbortController: () => ({ signal: undefined, abort: () => {} }),
}))

const { InstruksiLapanganSection } = await import('./instruksi-lapangan-section')

const dasar = {
  id: 'i1', nomor: 'SI-001',
  pemberi_nama: 'Ir. Bambang', pemberi_jabatan: 'Pengawas',
  pemberi_pihak: 'PT Owner Sejahtera',
  bentuk_perintah: 'lisan' as const,
  isi_instruksi: 'Bongkar dinding partisi lantai 2 zona B',
  lokasi: null,
  diterima_pada: '2026-08-04T02:00:00Z',
  dikonfirmasi_pada: null, dikonfirmasi_via: null,
  berdampak_biaya: false, berdampak_waktu: false,
  estimasi_biaya: null, status: 'dicatat',
  klaim_id: null,
  konfirmasi: { keadaan: 'mendesak' as const, jamBerlalu: 4, sisaJam: 20, pesan: '' },
  tindak_lanjut: { jalur: [] as Array<'klaim' | 'eot'>, pesan: '' },
}

function balas(data: unknown[], r?: Record<string, number>) {
  get.mockResolvedValue({
    data: {
      data,
      ringkas: {
        jumlah: data.length, konfirmasi_lewat: 0, konfirmasi_mendesak: 0,
        disangkal: 0, berdampak_tanpa_klaim: 0, ...r,
      },
    },
  })
}

beforeEach(() => { get.mockReset(); post.mockReset(); patch.mockReset() })

describe('DISANGKAL terpisah dari belum-dikonfirmasi', () => {
  it('disangkal menyarankan bukti LAIN, bukan konfirmasi', async () => {
    balas([{ ...dasar, status: 'disangkal',
      konfirmasi: { keadaan: 'disangkal', jamBerlalu: null, sisaJam: null, pesan: '' } }],
      { disangkal: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/saksi, foto, notulen/i),
        'instruksi yang DISANGKAL ditampilkan sebagai "belum dikonfirmasi" — ' +
        'orang mengira masih bisa dikejar dengan surat, padahal yang ' +
        'dibutuhkan sudah berbeda: bukti lain',
      ).toBeTruthy()
    })
  })

  it('disangkal TIDAK menawarkan tombol konfirmasi', async () => {
    balas([{ ...dasar, status: 'disangkal',
      konfirmasi: { keadaan: 'disangkal', jamBerlalu: null, sisaJam: null, pesan: '' } }],
      { disangkal: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => expect(screen.getAllByText(/SI-001/).length).toBeGreaterThan(0))
    expect(
      screen.queryByRole('button', { name: /catat konfirmasi/i }),
      'tombol konfirmasi masih ditawarkan pada instruksi yang sudah disangkal — ' +
      'pemakai mengirim surat konfirmasi yang tak akan menolong',
    ).toBeNull()
  })
})

describe('uang yang berhak ditagih tapi belum diajukan', () => {
  it('instruksi berdampak biaya tanpa klaim DITANDAI', async () => {
    balas([{ ...dasar, berdampak_biaya: true, estimasi_biaya: 50_000_000,
      tindak_lanjut: { jalur: ['klaim'], pesan: '' } }],
      { berdampak_tanpa_klaim: 1, konfirmasi_mendesak: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/berbiaya, belum diklaim/i),
        'instruksi berdampak biaya yang belum jadi klaim tak terlihat — uang ' +
        'yang berhak ditagih menguap tanpa seorang pun tahu',
      ).toBeTruthy()
    })
  })
})

describe('satu instruksi bisa memicu DUA jalur', () => {
  it('klaim DAN eot ditampilkan terpisah', async () => {
    balas([{ ...dasar, berdampak_biaya: true, berdampak_waktu: true,
      tindak_lanjut: { jalur: ['klaim', 'eot'], pesan: '' } }],
      { konfirmasi_mendesak: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => {
      expect(screen.getAllByText(/perlu klaim biaya/i).length).toBeGreaterThan(0)
    })
    expect(
      screen.getAllByText(/perlu EOT/i).length,
      'hanya satu jalur ditampilkan padahal instruksinya memicu dua — yang ' +
      'kedua terbuang tanpa ada yang tahu',
    ).toBeGreaterThan(0)
  })

  it('instruksi tanpa dampak tidak menampilkan jalur apa pun', async () => {
    balas([dasar], { konfirmasi_mendesak: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => expect(screen.getAllByText(/SI-001/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/perlu klaim biaya/i)).toBeNull()
  })
})

describe('bentuk perintah menentukan mendesaknya', () => {
  it('tertulis tidak menuntut konfirmasi', async () => {
    balas([{ ...dasar, bentuk_perintah: 'tertulis',
      konfirmasi: { keadaan: 'tak_perlu', jamBerlalu: null, sisaJam: null, pesan: '' } }])
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => expect(screen.getAllByText(/SI-001/).length).toBeGreaterThan(0))
    expect(
      screen.queryByRole('button', { name: /catat konfirmasi/i }),
      'instruksi TERTULIS diminta dikonfirmasi — ia sudah berjejak, jadi ' +
      'permintaan itu cuma kebisingan yang menutupi yang benar-benar mendesak',
    ).toBeNull()
  })

  it('lisan menampilkan sisa jam konfirmasi', async () => {
    balas([dasar], { konfirmasi_mendesak: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getAllByText(/Konfirmasi dalam 20 jam/i).length,
        'sisa waktu konfirmasi tak ditampilkan — pemakai tak tahu ini harus ' +
        'dikerjakan hari ini',
      ).toBeGreaterThan(0)
    })
  })
})

describe('form konfirmasi', () => {
  it('konfirmasi TERLAMBAT tetap bisa dicatat, dengan peringatan jujur', async () => {
    balas([{ ...dasar,
      konfirmasi: { keadaan: 'lewat', jamBerlalu: 200, sisaJam: -176, pesan: '' } }],
      { konfirmasi_lewat: 1 })
    render(<InstruksiLapanganSection projectId="p1" />)

    const tombol = await screen.findAllByRole('button', { name: /catat konfirmasi/i })
    await userEvent.click(tombol[0])

    expect(
      screen.getByText(/tetap lebih baik daripada tidak sama sekali/i),
      'konfirmasi terlambat ditolak diam-diam — mencatatnya tetap lebih baik ' +
      'daripada tak ada, asal nilainya dinyatakan apa adanya',
    ).toBeTruthy()
  })

  it('galat server ditampilkan, bukan ditelan', async () => {
    balas([dasar], { konfirmasi_mendesak: 1 })
    patch.mockRejectedValue({
      response: { data: { error: 'Cara konfirmasi wajib disebut' } },
    })
    render(<InstruksiLapanganSection projectId="p1" />)

    const tombol = await screen.findAllByRole('button', { name: /catat konfirmasi/i })
    await userEvent.click(tombol[0])
    await userEvent.type(screen.getByLabelText(/dikonfirmasi lewat apa/i), 'x')
    await userEvent.click(screen.getByRole('button', { name: /simpan konfirmasi/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/wajib disebut/i)
    })
  })
})

describe('keadaan kosong', () => {
  it('menjelaskan kenapa perintah lisan perlu dicatat', async () => {
    balas([])
    render(<InstruksiLapanganSection projectId="p1" />)
    await waitFor(() => expect(screen.getByText(/belum ada instruksi tercatat/i)).toBeTruthy())
    expect(screen.getByText(/kami tidak pernah/i)).toBeTruthy()
  })
})
