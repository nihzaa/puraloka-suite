import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ═══════════════════════════════════════════════════════════════════════════
// RETENSI MANDOR — yang diuji BUKAN "komponennya render"
//
// Halaman ini menampilkan UANG YANG DITAHAN dari orang lain. Tiga hal yang
// kalau salah merugikan mandor tanpa ada yang tahu — dan ketiganya tak
// terlihat dari tsc maupun lint:
//
//   1. Scope yang pekerjaannya SUDAH SELESAI tapi retensinya masih utuh harus
//      DITANDAI. Mandor tak bisa melihat ini dari sisinya; kalau kita juga
//      tak menampilkannya, uangnya mengendap selamanya di kas kita.
//   2. Batang proporsi wajib punya deskripsi teks. Pengguna pembaca layar
//      tak melihat batangnya sama sekali; tanpa aria-label mereka kehilangan
//      SATU-SATUNYA informasi yang halaman ini ada untuk menyampaikannya.
//   3. Nilai pencairan diisi otomatis dengan SISA PENUH. Medan kosong membuat
//      orang mengetik ulang angka yang sudah tertera — dan salah ketik di
//      sini berarti uang keluar dengan jumlah yang salah.
// ═══════════════════════════════════════════════════════════════════════════

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
  },
  makeAbortController: () => ({ signal: undefined, abort: () => {} }),
}))

const { RetensiSection } = await import('./retensi-section')

const BARIS = {
  work_scope_id: 's1',
  scope_name: 'Pasangan dinding lantai 2',
  status: 'aktif',
  retensi_pct: 5,
  mandor: { id: 'm1', name: 'Pak Dadang' },
  project: { id: 'p1', name: 'Gedung A' },
  ditahan: 10_000_000,
  dicairkan: 4_000_000,
  outstanding: 6_000_000,
}

function balas(scopes: unknown[], ringkas?: Record<string, number>) {
  get.mockResolvedValue({
    data: {
      scopes,
      total_ditahan: ringkas?.total_ditahan ?? 10_000_000,
      total_dicairkan: ringkas?.total_dicairkan ?? 4_000_000,
      total_outstanding: ringkas?.total_outstanding ?? 6_000_000,
    },
  })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('yang paling merugikan bila tak terlihat', () => {
  it('scope SELESAI dengan retensi masih utuh DITANDAI', async () => {
    balas([{ ...BARIS, status: 'selesai', dicairkan: 0, outstanding: 10_000_000 }])
    render(<RetensiSection />)

    await waitFor(() => {
      expect(
        screen.getByText(/pekerjaan sudah selesai/i),
        'scope yang sudah selesai tapi retensinya belum cair TIDAK ditandai — ' +
        'mandor tak bisa melihatnya dari sisinya, jadi tak akan ada yang ' +
        'menagih, dan uangnya mengendap selamanya di kas kita',
      ).toBeTruthy()
    })
  })

  it('scope yang masih AKTIF tidak ikut ditandai', async () => {
    // Penjaga berdaya: tanpa kasus ini, peringatan di atas bisa saja muncul
    // untuk semua baris dan test pertama tetap hijau.
    balas([BARIS])
    render(<RetensiSection />)

    await waitFor(() => expect(screen.getByText(/Pasangan dinding/)).toBeTruthy())
    expect(
      screen.queryByText(/pekerjaan sudah selesai/i),
      'scope yang masih berjalan ikut ditandai mendesak — peringatannya jadi ' +
      'kebisingan, dan yang benar-benar perlu ditagih tenggelam',
    ).toBeNull()
  })
})

describe('aksesibilitas — batang proporsi', () => {
  it('batang punya deskripsi teks yang menyebut ketiga angkanya', async () => {
    balas([BARIS])
    render(<RetensiSection />)

    const batang = await screen.findByRole('img')
    const label = batang.getAttribute('aria-label') ?? ''

    expect(
      label,
      'batang proporsi tanpa deskripsi teks — pengguna pembaca layar kehilangan ' +
      'SATU-SATUNYA informasi yang halaman ini ada untuk menyampaikannya',
    ).toMatch(/ditahan/i)
    expect(label).toMatch(/dicairkan/i)
    expect(label).toMatch(/tertahan/i)
  })
})

describe('form pencairan', () => {
  it('nilai terisi otomatis dengan SISA PENUH, bukan kosong', async () => {
    balas([BARIS])
    render(<RetensiSection />)

    const tombol = await screen.findByRole('button', { name: /cairkan retensi/i })
    await userEvent.click(tombol)

    const input = screen.getByLabelText(/jumlah dicairkan/i) as HTMLInputElement
    expect(
      input.value,
      'medan pencairan dibiarkan kosong — orang mengetik ulang angka yang sudah ' +
      'tertera di layar, dan salah ketik di sini berarti uang keluar dengan ' +
      'jumlah yang salah',
    ).toBe('6000000')
  })

  it('input dibatasi maksimal sisa yang tertahan', async () => {
    balas([BARIS])
    render(<RetensiSection />)

    await userEvent.click(await screen.findByRole('button', { name: /cairkan retensi/i }))
    const input = screen.getByLabelText(/jumlah dicairkan/i) as HTMLInputElement

    expect(
      input.max,
      'tak ada batas atas — pencairan melebihi yang pernah ditahan bisa dikirim, ' +
      'dan penolakannya baru terjadi setelah bolak-balik ke server',
    ).toBe('6000000')
  })

  it('galat dari server ditampilkan, bukan ditelan', async () => {
    balas([BARIS])
    post.mockRejectedValue({
      response: { data: { error: 'Pencairan melebihi retensi yang masih tertahan' } },
    })
    render(<RetensiSection />)

    await userEvent.click(await screen.findByRole('button', { name: /cairkan retensi/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cairkan$/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('alert').textContent,
        'galat server ditelan — pemakai mengira pencairannya berhasil padahal ' +
        'ditolak, dan retensi terlihat sudah cair padahal belum',
      ).toMatch(/melebihi/i)
    })
  })
})

describe('keadaan kosong', () => {
  it('memberi tahu KENAPA kosong, bukan sekadar "tidak ada data"', async () => {
    balas([], { total_ditahan: 0, total_dicairkan: 0, total_outstanding: 0 })
    render(<RetensiSection />)

    await waitFor(() => {
      expect(screen.getByText(/belum ada retensi tertahan/i)).toBeTruthy()
    })
    expect(
      screen.getByText(/pembayaran progres yang disetujui/i),
      'layar kosong tanpa penjelasan — pemakai tak tahu apakah fiturnya rusak ' +
      'atau memang belum ada isinya, dan akan mengira yang pertama',
    ).toBeTruthy()
  })
})
