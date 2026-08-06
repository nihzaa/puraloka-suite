import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tabel, KepalaHalaman, Lencana, type Kolom } from './dasar'

// ═══════════════════════════════════════════════════════════════════════════
// KERANGKA HALAMAN — `dasar.tsx` tak punya satu pun test sampai 2026-08-07
//
// Itu celah yang mahal, karena berkas ini memuat `Tabel<T>` — dan seluruh
// argumen UI-0-4 bersandar pada satu klaim: "pakai <Tabel>, ia sudah menjaga
// caption, scope=row, tabular-nums, dan overflow-x untukmu".
//
// Klaim itu ditulis di komentar `dasar.tsx:311-320` dan TIDAK PERNAH DIUJI.
// Kalau ternyata meleset, penyebaran ke 28 halaman justru MENGHAPUS a11y yang
// susah payah dibangun tiga commit (16164e9 caption 24→0, ed3a55d + 0adb5b9
// scope=row 55→14).
//
// Jadi yang diuji di sini bukan "komponennya render". Yang diuji: keempat
// jaminan itu benar-benar ditepati, supaya pemakainya boleh berhenti
// memikirkannya.
// ═══════════════════════════════════════════════════════════════════════════

type Baris = { id: string; nama: string; jumlah: number }

const DATA: Baris[] = [
  { id: '1', nama: 'Semen Gresik', jumlah: 111111 },
  { id: '2', nama: 'Besi beton', jumlah: 888888 },
]

const KOLOM: Array<Kolom<Baris>> = [
  { kunci: 'nama', judul: 'Material', render: (b) => b.nama, kepalaBaris: true },
  { kunci: 'jumlah', judul: 'Nilai', rata: 'kanan', render: (b) => b.jumlah.toLocaleString('id-ID') },
]

function tabel(extra: Partial<React.ComponentProps<typeof Tabel<Baris>>> = {}) {
  return render(
    <Tabel<Baris>
      kolom={KOLOM}
      data={DATA}
      kunciBaris={(b) => b.id}
      caption="Daftar material beserta nilainya"
      {...extra}
    />,
  )
}

describe('Tabel — empat jaminan yang membuat pemakainya boleh berhenti berpikir', () => {
  it('caption ADA dan terbaca pembaca layar', () => {
    const { container } = tabel()
    const caption = container.querySelector('caption')

    expect(
      caption?.textContent,
      'tabel tanpa <caption> diumumkan pembaca layar sebagai "tabel, 2 kolom" ' +
      'tanpa menyebut isinya — persis 24 tabel yang harus diperbaiki di 16164e9',
    ).toBe('Daftar material beserta nilainya')

    expect(
      caption?.className,
      'caption terlihat di layar — ia dimaksudkan hanya untuk pembaca layar',
    ).toContain('sr-only')
  })

  it('kolom pertama jadi <th scope="row"> — barisnya punya nama', () => {
    const { container } = tabel()
    const th = container.querySelectorAll('tbody th[scope="row"]')

    expect(
      th.length,
      'baris tak punya kepala baris: pembaca layar membacakan "888.888" tanpa ' +
      'menyebut itu milik material apa — cacat yang ditutup ed3a55d + 0adb5b9',
    ).toBe(2)
    expect(th[0].textContent).toBe('Semen Gresik')
  })

  it('kolom TANPA kepalaBaris tetap <td>, bukan <th>', () => {
    const { container } = tabel()
    expect(
      container.querySelectorAll('tbody td').length,
      'semua sel jadi kepala baris — pembaca layar kehilangan bedanya antara ' +
      'yang menamai baris dan yang berisi data',
    ).toBe(2)
  })

  it('angka memakai tabular-nums supaya digit sejajar', () => {
    const { container } = tabel()
    const tabelEl = container.querySelector('table')

    expect(
      tabelEl?.style.fontVariantNumeric,
      'tanpa tabular-nums, "Rp 111.111" dan "Rp 888.888" punya lebar berbeda ' +
      'meski digitnya sama — mata tak bisa lagi membandingkan besaran dari ' +
      'panjang kolom, dan itu menghapus guna tabel',
    ).toBe('tabular-nums')
  })

  it('tabel dibungkus overflow-x — tabel lebar tak menggeser halaman', () => {
    const { container } = tabel()
    const pembungkus = container.querySelector('div')

    expect(
      pembungkus?.style.overflowX,
      'tanpa pembungkus, tabel lebar mendorong SELURUH halaman ke samping ' +
      'dan sidebar ikut tergeser di layar sempit',
    ).toBe('auto')
  })
})

describe('Tabel — keadaan kosong ditangani di komponen, bukan diserahkan', () => {
  it('data kosong + prop kosong → yang tampil keadaan kosongnya', () => {
    render(
      <Tabel<Baris>
        kolom={KOLOM} data={[]} kunciBaris={(b) => b.id}
        caption="Daftar material"
        kosong={<p>Belum ada material</p>}
      />,
    )
    expect(screen.getByText('Belum ada material')).toBeTruthy()
  })

  it('data kosong TANPA prop kosong → tetap render tabel berkepala', () => {
    // Sengaja: kepala kolom yang tersisa memberi tahu "tabel ini SEHARUSNYA
    // berisi apa". Layar benar-benar kosong terbaca sebagai fitur rusak.
    const { container } = render(
      <Tabel<Baris>
        kolom={KOLOM} data={[]} kunciBaris={(b) => b.id}
        caption="Daftar material"
      />,
    )
    expect(container.querySelector('thead')).toBeTruthy()
    expect(container.querySelectorAll('tbody tr').length).toBe(0)
  })
})

describe('Tabel — baris total', () => {
  it('prop `total` menghasilkan <tfoot>, bukan baris data biasa', () => {
    const { container } = tabel({
      total: [
        { kunci: 'label', isi: 'Total', rentang: 1 },
        { kunci: 'nilai', isi: '999.999', rata: 'kanan' },
      ],
    })

    const tfoot = container.querySelector('tfoot')
    expect(
      tfoot,
      'baris total diletakkan di <tbody>: pembaca layar dan fitur "urutkan" ' +
      'memperlakukannya sebagai data, sehingga total ikut terurut di tengah',
    ).toBeTruthy()
    expect(tfoot?.textContent).toContain('Total')
    expect(tfoot?.textContent).toContain('999.999')
  })

  it('tanpa prop `total` tak ada <tfoot> sama sekali', () => {
    const { container } = tabel()
    expect(container.querySelector('tfoot')).toBeNull()
  })

  it('rentang diterjemahkan jadi colSpan', () => {
    const { container } = tabel({
      total: [
        { kunci: 'label', isi: 'Total', rentang: 1 },
        { kunci: 'nilai', isi: '999.999', rata: 'kanan' },
      ],
    })
    expect(container.querySelector('tfoot td')?.getAttribute('colspan')).toBe('1')
  })
})

describe('KepalaHalaman', () => {
  it('judul jadi <h1> — halaman punya satu penanda tingkat teratas', () => {
    const { container } = render(<KepalaHalaman judul="Laporan Upah" />)
    expect(
      container.querySelector('h1')?.textContent,
      'judul halaman bukan <h1>: pengguna pembaca layar kehilangan cara ' +
      'melompat ke awal isi',
    ).toBe('Laporan Upah')
  })

  it('keterangan ditampilkan bila ada', () => {
    render(<KepalaHalaman judul="Laporan" keterangan="Minggu ini" />)
    expect(screen.getByText('Minggu ini')).toBeTruthy()
  })
})

describe('Lencana — status tak boleh mengandalkan warna saja', () => {
  it('teksnya selalu ada, apa pun nadanya', () => {
    render(<Lencana nada="bahaya">Ditolak</Lencana>)
    expect(
      screen.getByText('Ditolak'),
      'status hanya dibedakan warna: buta warna dan layar di bawah matahari ' +
      'kehilangan informasinya sepenuhnya (WCAG 1.4.1)',
    ).toBeTruthy()
  })
})
