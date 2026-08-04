import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ═══════════════════════════════════════════════════════════════════════════
// KLAIM KONTRAKTUAL — yang diuji adalah KEPUTUSAN TAMPILAN, bukan render
//
// Empat hal yang kalau salah membuat uang hilang tanpa ada yang tahu:
//
//   1. `gugur` HARUS terbaca beda dari `ditolak`. Ditolak = owner menilai tak
//      berdasar. Gugur = kita yang terlambat. Menyamakannya menghapus
//      satu-satunya cara melihat berapa uang hilang karena kelalaian sendiri.
//   2. Klaim yang batasnya LEWAT dan belum diputus harus muncul di ATAS,
//      sebelum total rupiah. Klaim gugur karena telat diberitahukan, bukan
//      karena angkanya salah.
//   3. Batas waktu TIDAK ditampilkan pada klaim yang sudah diputus — di sana
//      ia cuma kebisingan yang menutupi keputusannya.
//   4. `tak_diatur` tidak boleh terlihat hijau. Batas yang belum diisi bukan
//      kepatuhan; menghijaukannya adalah kepatuhan palsu.
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

const { KlaimSection } = await import('./klaim-section')

const dasar = {
  id: 'k1',
  claim_number: 'CL-001',
  claim_type: 'keterlambatan_lahan',
  title: 'Lahan blok B terlambat diserahkan 30 hari',
  description: null,
  event_date: '2026-07-01',
  notified_at: null,
  notice_days_limit: 14,
  amount_claimed: 250_000_000,
  amount_approved: null,
  status: 'diajukan' as const,
  decision_note: null,
  batas_pemberitahuan: {
    keadaan: 'berjalan' as const, sisaHari: 9, hariTerpakai: 5, pesan: '',
  },
}

function balas(data: unknown[], ringkas?: Record<string, number>) {
  get.mockResolvedValue({
    data: {
      data,
      ringkas: {
        jumlah: data.length,
        total_diklaim: 250_000_000,
        total_disetujui: 0,
        berisiko_gugur: 0,
        mendesak: 0,
        ...ringkas,
      },
    },
  })
}

beforeEach(() => { get.mockReset(); post.mockReset() })

describe('GUGUR dibedakan dari DITOLAK', () => {
  it('gugur menyebut sebabnya: telat diberitahukan', async () => {
    balas([{ ...dasar, status: 'gugur' }])
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/telat diberitahukan/i),
        'klaim GUGUR ditampilkan sama dengan DITOLAK — perusahaan kehilangan ' +
        'satu-satunya cara melihat berapa uang hilang karena LALAI MEMBERI ' +
        'TAHU, bukan karena klaimnya lemah',
      ).toBeTruthy()
    })
  })

  it('ditolak TIDAK menyebut telat — penjaga berdaya', async () => {
    // Tanpa kasus ini, "telat diberitahukan" bisa saja muncul di semua status
    // dan test pertama tetap hijau.
    balas([{ ...dasar, status: 'ditolak' }])
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/Ditolak owner/i)).toBeTruthy())
    expect(screen.queryByText(/telat diberitahukan/i)).toBeNull()
  })
})

describe('yang mendesak muncul SEBELUM angka rupiah', () => {
  it('klaim berisiko gugur ditampilkan sebagai peringatan', async () => {
    balas([{ ...dasar, batas_pemberitahuan: { keadaan: 'terlambat', sisaHari: -20, hariTerpakai: 34, pesan: '' } }],
      { berisiko_gugur: 1 })
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/lewat batas pemberitahuan dan belum diputus/i),
        'klaim yang batasnya lewat tak diperingatkan — pemakai melihat total ' +
        'rupiah yang tampak sehat, padahal sebagiannya sudah tak bisa ditagih',
      ).toBeTruthy()
    })
  })

  it('tanpa risiko, peringatan TIDAK muncul', async () => {
    balas([dasar])
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/CL-001/)).toBeTruthy())
    expect(
      screen.queryByText(/lewat batas pemberitahuan/i),
      'peringatan muncul walau tak ada yang berisiko — peringatan yang selalu ' +
      'ada melatih orang mengabaikannya',
    ).toBeNull()
  })
})

describe('batas waktu hanya relevan selama masih bisa ditindaklanjuti', () => {
  it('klaim yang SUDAH diputus tak menampilkan sisa hari', async () => {
    balas([{
      ...dasar, status: 'disetujui', amount_approved: 250_000_000,
      batas_pemberitahuan: { keadaan: 'aman', sisaHari: 5, hariTerpakai: 9, pesan: '' },
    }])
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/Disetujui penuh/i)).toBeTruthy())
    expect(
      screen.queryByText(/Diberitahukan hari ke-9/i),
      'batas waktu masih ditampilkan pada klaim yang sudah diputus — ia cuma ' +
      'kebisingan yang menutupi keputusannya',
    ).toBeNull()
  })

  it('klaim BELUM diputus menampilkan sisa harinya', async () => {
    balas([dasar])
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/Sisa 9 hari/i),
        'klaim yang masih berjalan tak menunjukkan sisa waktunya — pemakai tak ' +
        'tahu mana yang harus dikejar hari ini',
      ).toBeTruthy()
    })
  })
})

describe('nilai disetujui ditampilkan terpisah dari yang diklaim', () => {
  it('klaim yang dipotong menampilkan KEDUA angka', async () => {
    balas([{
      ...dasar, status: 'disetujui_sebagian',
      amount_claimed: 250_000_000, amount_approved: 100_000_000,
    }])
    render(<KlaimSection projectId="p1" />)

    // `getAllByText` — nilai klaim memang muncul dua kali secara sah: sekali
    // di kotak ringkasan "Total diklaim", sekali di baris klaimnya. Memakai
    // `getByText` di sini bukan assertion yang lebih ketat, melainkan test
    // yang salah menuduh duplikasi sebagai cacat.
    await waitFor(() => {
      expect(screen.getAllByText(/Rp 250.0 jt/).length).toBeGreaterThan(0)
    })
    expect(
      screen.getByText(/disetujui Rp 100.0 jt/i),
      'hanya satu angka ditampilkan — tak terlihat bahwa klaim ditawar separuh, ' +
      'dan selisihnya hilang dari perhatian',
    ).toBeTruthy()
  })
})

describe('keadaan kosong', () => {
  it('menjelaskan KAPAN harus mencatat, bukan sekadar "belum ada"', async () => {
    balas([], { jumlah: 0, total_diklaim: 0 })
    render(<KlaimSection projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/belum ada klaim tercatat/i)).toBeTruthy()
    })
    expect(
      screen.getByText(/begitu peristiwanya terjadi/i),
      'layar kosong tanpa arahan — pemakai mencatat klaim saat menagih, dan ' +
      'saat itu batas pemberitahuannya sudah lewat',
    ).toBeTruthy()
  })
})
