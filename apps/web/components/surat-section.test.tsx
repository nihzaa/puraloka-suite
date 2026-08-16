import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ═══════════════════════════════════════════════════════════════════════════
// SURAT — yang diuji: ARAH memisahkan dua keadaan yang BERLAWANAN
//
// Surat KELUAR lewat batas → LAWAN belum menjawab → kita MENAGIH
// Surat MASUK  lewat batas → KITA belum menjawab  → kita SEGERA JAWAB
//
// Dua-duanya "lewat batas". Menampilkannya sebagai satu angka membuat daftar
// ini tak bisa dipakai — dan yang paling merugikan: surat masuk yang kita
// abaikan terbaca seperti kelalaian lawan, sampai ada yang memeriksanya di
// meja perundingan.
// ═══════════════════════════════════════════════════════════════════════════

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  makeAbortController: () => ({ signal: undefined, abort: () => {} }),
}))

const { SuratSection } = await import('./surat-section')

const keluar = {
  id: 'k1', nomor: '012/PP/VIII', arah: 'keluar' as const, jenis: 'permintaan',
  perihal: 'Permintaan penyerahan lahan blok B',
  dari_pihak: 'PT Puraloka', kepada_pihak: 'PT Owner',
  tanggal_kirim: '2026-07-01', tanggal_terima: null,
  membalas_id: null, butuh_balasan: true, batas_balas: '2026-07-20',
  status: 'terkirim' as const,
  batas: { keadaan: 'lewat' as const, sisaHari: -15, siapaYangDitunggu: 'lawan' as const, pesan: '' },
}

const masuk = {
  ...keluar, id: 'm1', nomor: '077/OWN/VIII', arah: 'masuk' as const, jenis: 'teguran',
  perihal: 'Teguran keterlambatan penyelesaian',
  dari_pihak: 'PT Owner', kepada_pihak: 'PT Puraloka',
  tanggal_kirim: null, tanggal_terima: '2026-07-01',
  status: 'diterima' as const,
  batas: { keadaan: 'lewat' as const, sisaHari: -15, siapaYangDitunggu: 'kita' as const, pesan: '' },
}

function balas(data: unknown[], r?: Record<string, number>) {
  get.mockResolvedValue({
    data: {
      data,
      ringkas: {
        jumlah: data.length, masuk: 0, keluar: 0,
        kita_belum_menjawab: 0, lawan_belum_menjawab: 0, mendesak: 0, ...r,
      },
    },
  })
}

beforeEach(() => { get.mockReset(); post.mockReset() })

describe('ARAH memisahkan KITA lalai dari LAWAN lalai', () => {
  it('dua angka ditampilkan TERPISAH dengan tindakan berbeda', async () => {
    balas([keluar, masuk], { kita_belum_menjawab: 1, lawan_belum_menjawab: 1 })
    render(<SuratSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/menunggu jawaban KITA/i),
        'surat masuk yang terabaikan tak dipisah dari surat keluar yang tak ' +
        'dijawab lawan — dua keadaan yang menuntut tindakan BERLAWANAN jadi ' +
        'satu angka, dan daftarnya tak bisa dipakai',
      ).toBeTruthy()
    })
    expect(screen.getByText(/belum dijawab lawan/i)).toBeTruthy()
  })

  it('yang menuntut jawaban KITA muncul di bagian "Perlu dijawab"', async () => {
    balas([masuk], { kita_belum_menjawab: 1 })
    render(<SuratSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getByText(/perlu dijawab/i),
        'surat yang menunggu jawaban kita tenggelam di antrean arsip — ini ' +
        'antrean kerja, bukan daftar arsip',
      ).toBeTruthy()
    })
  })

  it('surat KELUAR tidak masuk "Perlu dijawab" — penjaga berdaya', async () => {
    // Tanpa kasus ini, bagian "Perlu dijawab" bisa saja menampilkan semuanya
    // dan test di atas tetap hijau.
    balas([keluar], { lawan_belum_menjawab: 1 })
    render(<SuratSection projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/012\/PP\/VIII/)).toBeTruthy())
    expect(
      screen.queryByText(/perlu dijawab/i),
      'surat keluar ikut masuk daftar "perlu dijawab" — pekerjaan yang bukan ' +
      'milik kita ikut menumpuk di antrean',
    ).toBeNull()
  })

  it('label lencana menyebut SIAPA yang telat', async () => {
    balas([masuk], { kita_belum_menjawab: 1 })
    render(<SuratSection projectId="p1" />)

    await waitFor(() => {
      expect(
        screen.getAllByText(/kita telat menjawab/i).length,
        'lencana tak menyebut siapa yang telat — pemakai harus menebak dari ' +
        'arah suratnya, dan tebakan itu sering salah',
      ).toBeGreaterThan(0)
    })
  })
})

describe('jenis yang jadi dasar sengketa ditandai', () => {
  it('teguran ditandai berbeda dari pemberitahuan biasa', async () => {
    balas([masuk], { kita_belum_menjawab: 1 })
    render(<SuratSection projectId="p1" />)

    await waitFor(() => {
      // Muncul dua kali (bagian mendesak + arsip) — itu sah.
      expect(screen.getAllByText('Teguran').length).toBeGreaterThan(0)
    })
  })
})

describe('form — batas balas hanya muncul bila menuntut balasan', () => {
  it('medan batas TERSEMBUNYI sampai "menuntut balasan" dicentang', async () => {
    balas([])
    render(<SuratSection projectId="p1" />)

    await userEvent.click(await screen.findByRole('button', { name: /catat surat/i }))
    expect(
      screen.queryByLabelText(/batas balas/i),
      'medan batas selalu tampil — mengundang pengisian pada surat yang tak ' +
      'menuntut jawaban, dan itu menghasilkan peringatan palsu',
    ).toBeNull()

    /*
      `role="switch"`, BUKAN `checkbox`.

      Kontrolnya diubah dari checkbox jadi `<Saklar>` di commit ecbb4fb7
      (22 saklar + 1 daftar dikonversi), dan test ini tertinggal — ia masih
      mencari peran lama, jadi MERAH sejak saat itu.

      Yang benar komponennya: `saklar.tsx` sengaja memakai `role="switch"`
      karena pembaca layar mengumumkannya berbeda dari checkbox — "aktif/
      nonaktif", bukan "tercentang". Mengembalikannya ke checkbox demi
      menghijaukan test berarti merusak aksesibilitas yang benar.
    */
    await userEvent.click(screen.getByRole('switch'))
    expect(screen.getByLabelText(/batas balas/i)).toBeTruthy()
  })

  it('arah mengubah label tanggal — pemakai tak perlu menebak kolomnya', async () => {
    balas([])
    render(<SuratSection projectId="p1" />)

    await userEvent.click(await screen.findByRole('button', { name: /catat surat/i }))
    expect(screen.getByLabelText(/tanggal kirim/i)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /kita terima/i }))
    expect(
      screen.getByLabelText(/tanggal terima/i),
      'label tanggal tak ikut berubah saat arah diganti — pemakai mengisi ' +
      'tanggal kirim untuk surat masuk, dan kewajiban menjawab dihitung dari ' +
      'tanggal yang salah',
    ).toBeTruthy()
  })
})

describe('keadaan kosong', () => {
  it('menjelaskan kenapa surat perlu dicatat', async () => {
    balas([])
    render(<SuratSection projectId="p1" />)
    await waitFor(() => expect(screen.getByText(/belum ada surat tercatat/i)).toBeTruthy())
    expect(screen.getByText(/siapa yang bisa membuktikan/i)).toBeTruthy()
  })
})
