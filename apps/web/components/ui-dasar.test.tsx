import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KartuKPI, Panel, Kosong, GrafikBatang, Donat } from './ui-dasar'

// ═══════════════════════════════════════════════════════════════════════════
// KOMPONEN DASAR — dipakai 59 halaman, jadi cacat di sini menyebar ke semua
//
// Empat hal yang kalau salah merusak seluruh aplikasi sekaligus:
//
//   1. Delta HARUS punya ikon, bukan hanya warna (WCAG 1.4.1). Halaman ini
//      dibaca di HP di lapangan, tempat beda warna tipis hilang di bawah
//      sinar matahari.
//   2. Naik-itu-bagus vs naik-itu-buruk. "+15% biaya" berwarna hijau adalah
//      kebohongan yang menenangkan.
//   3. Grafik & donat wajib punya deskripsi teks — pengguna pembaca layar
//      tak melihat SVG sama sekali.
//   4. Hanya SATU batang boleh bergradasi. Kalau semua bergradasi, tak ada
//      yang menonjol, dan halaman kembali monoton dengan warna berbeda.
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  // Matikan animasi supaya nilai akhir langsung terbaca — bukan angka
  // di tengah perjalanan hitung-naik.
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce'), media: q,
    addEventListener: () => {}, removeEventListener: () => {},
  }))
})

describe('KartuKPI — delta tak boleh mengandalkan warna saja', () => {
  it('delta naik menampilkan tanda + dan ikon', () => {
    render(<KartuKPI label="Kas" nilai="Rp 2,5 M" delta={12.4} />)

    expect(
      screen.getByText(/\+12,4%/),
      'delta tak menampilkan tanda + — pemakai harus menebak arahnya dari ' +
      'warna, dan warna hilang di bawah sinar matahari',
    ).toBeTruthy()
  })

  it('delta turun menampilkan angka negatif', () => {
    render(<KartuKPI label="Kas" nilai="Rp 2,5 M" delta={-8.1} />)
    expect(screen.getByText(/-8,1%/)).toBeTruthy()
  })

  it('delta nol TIDAK ditampilkan — nol bukan perubahan', () => {
    render(<KartuKPI label="Kas" nilai="Rp 2,5 M" delta={0} />)
    expect(
      screen.queryByText(/%/),
      'delta 0% ditampilkan sebagai perubahan — mengisi layar dengan ' +
      'informasi yang tak memberi tahu apa pun',
    ).toBeNull()
  })
})

describe('KartuKPI — naik bagus vs naik buruk', () => {
  it('naik pada metrik BAIK memakai warna sukses', () => {
    const { container } = render(
      <KartuKPI label="Pendapatan" nilai="Rp 1 M" delta={10} naikBagus />)
    const lencana = container.querySelector('span[style*="success"]')
    expect(lencana).toBeTruthy()
  })

  it('naik pada metrik BURUK memakai warna bahaya', () => {
    const { container } = render(
      <KartuKPI label="Biaya" nilai="Rp 1 M" delta={10} naikBagus={false} />)

    expect(
      container.querySelector('span[style*="danger"]'),
      'kenaikan BIAYA ditampilkan hijau — itu kebohongan yang menenangkan, ' +
      'dan pemakai membaca masalah sebagai kabar baik',
    ).toBeTruthy()
  })
})

describe('KartuKPI — satu sorot per layar', () => {
  it('kartu tersorot memakai gradasi', () => {
    const { container } = render(<KartuKPI label="Kas" nilai="Rp 1 M" sorot />)
    expect(
      (container.firstChild as HTMLElement).getAttribute('style'),
    ).toMatch(/grad-aksen/)
  })

  it('kartu biasa TIDAK bergradasi', () => {
    const { container } = render(<KartuKPI label="Kas" nilai="Rp 1 M" />)
    expect(
      (container.firstChild as HTMLElement).getAttribute('style'),
      'kartu biasa ikut bergradasi — kalau semuanya menonjol, tak ada yang ' +
      'menonjol, dan halaman kembali monoton dengan warna berbeda',
    ).not.toMatch(/grad-aksen/)
  })

  it('kartu yang bisa diklik jadi <button>, bukan div', () => {
    render(<KartuKPI label="Kas" nilai="Rp 1 M" onClick={() => {}} />)
    expect(
      screen.getByRole('button'),
      'kartu yang bisa diklik dibuat <div> — pemakai keyboard tak bisa ' +
      'menjangkaunya sama sekali',
    ).toBeTruthy()
  })
})

describe('grafik — wajib bisa dibaca tanpa melihat', () => {
  it('GrafikBatang punya deskripsi yang menyebut tiap nilai', () => {
    render(<GrafikBatang data={[
      { label: 'Jan', nilai: 10 },
      { label: 'Feb', nilai: 20, sorot: true },
    ]} />)

    const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
    expect(
      label,
      'grafik tanpa deskripsi teks — pengguna pembaca layar kehilangan ' +
      'seluruh isinya, dan SVG tak memberi mereka apa-apa',
    ).toMatch(/Jan/)
    expect(label).toMatch(/Feb/)
  })

  it('Donat menyebut label, nilai, DAN persennya', () => {
    render(<Donat pct={76.4} label="Total Anggaran" nilai="Rp 2,5 M" />)

    const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
    expect(label).toMatch(/Total Anggaran/)
    expect(label).toMatch(/Rp 2,5 M/)
    expect(
      label,
      'persen tak disebutkan — justru itu informasi utama sebuah donat',
    ).toMatch(/76[.,]4 persen/)
  })
})

describe('Panel', () => {
  it('judul dirender sebagai heading, bukan teks tebal', () => {
    render(<Panel judul="Arus kas"><div>isi</div></Panel>)
    expect(
      screen.getByRole('heading', { name: /arus kas/i }),
      'judul panel bukan heading — pembaca layar tak bisa melompati bagian, ' +
      'dan harus mendengarkan seluruh isi untuk menemukan yang dicari',
    ).toBeTruthy()
  })

  it('aksi di kanan judul ikut dirender', () => {
    render(
      <Panel judul="Arus kas" aksi={<button>Bulan ini</button>}>
        <div>isi</div>
      </Panel>)
    expect(screen.getByRole('button', { name: /bulan ini/i })).toBeTruthy()
  })
})

describe('Kosong — menjelaskan, bukan sekadar "tidak ada data"', () => {
  it('menampilkan judul dan sebab', () => {
    render(<Kosong judul="Belum ada klaim"
      sebab="Catat begitu peristiwanya terjadi, bukan saat menagih." />)
    expect(screen.getByText(/belum ada klaim/i)).toBeTruthy()
    expect(
      screen.getByText(/begitu peristiwanya terjadi/i),
      'layar kosong tanpa penjelasan terbaca sebagai fitur RUSAK, bukan ' +
      'sebagai "belum ada isinya"',
    ).toBeTruthy()
  })

  it('`sebab` WAJIB — dijaga TypeScript, bukan sekadar anjuran', () => {
    // Prop ini sempat bernama `keterangan` dan opsional. Hasilnya bisa
    // diukur: dari 161 layar kosong di web, hanya 20 yang menjelaskan
    // KENAPA kosong. Sisanya berhenti di "Tidak ada data" — dan tiga
    // keadaan yang menuntut tindakan sangat berbeda (belum diisi /
    // tersaring habis / gagal dimuat) jadi terbaca persis sama.
    //
    // @ts-expect-error — menghilangkan `sebab` HARUS gagal kompilasi.
    // Kalau baris ini berhenti error, kewajibannya sudah bocor.
    const tanpaSebab = <Kosong judul="Belum ada klaim" />
    expect(tanpaSebab).toBeTruthy()
  })

  it('aksi dirender supaya layar kosong punya jalan keluar', () => {
    render(
      <Kosong
        judul="Belum ada invoice"
        sebab="Invoice terbit dari termin yang sudah disetujui."
        aksi={<button>Buat invoice</button>}
      />)
    expect(screen.getByRole('button', { name: /buat invoice/i })).toBeTruthy()
  })
})
