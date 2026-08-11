import { describe, it, expect } from 'vitest'
import {
  SUMBER, OPERATOR, BATAS_BAWAAN, BATAS_MAKS,
  cariSumber, periksaSusunan, daftarSelect, nilaiSaringan,
  type Susunan,
} from '../laporan-susun.js'

/**
 * Test pustaka report builder.
 *
 * Yang dijaga di sini bukan "fungsinya menyusun query", melainkan bahwa
 * **tak ada nama yang berasal dari pengguna pernah sampai ke query** — dan
 * bahwa saringan tak bisa hilang diam-diam.
 */

const S = (o: Partial<Susunan> = {}): Susunan => ({
  sumber: o.sumber ?? 'proyek',
  kolom: o.kolom ?? ['name', 'status'],
  saringan: 'saringan' in o ? o.saringan : undefined,
  urut: 'urut' in o ? o.urut : undefined,
  batas: 'batas' in o ? o.batas : undefined,
})

describe('daftar SUMBER — jaminan bentuk', () => {
  it('tiap sumber menyatakan cara penyaringan tenant-nya', () => {
    // Sumber tanpa ini akan membaca lintas perusahaan, dan hasilnya terlihat
    // seperti laporan yang wajar.
    for (const s of SUMBER) {
      expect(['company', 'project']).toContain(s.tenancy)
    }
  })

  it('tiap sumber menuntut izin', () => {
    for (const s of SUMBER) {
      expect(s.izin.length).toBeGreaterThan(0)
    }
  })

  it('tiap kolom punya jenis yang punya operatornya', () => {
    for (const s of SUMBER) {
      for (const k of s.kolom) {
        expect(OPERATOR[k.jenis]).toBeDefined()
        expect(OPERATOR[k.jenis].length).toBeGreaterThan(0)
      }
    }
  })

  it('kunci sumber unik', () => {
    expect(new Set(SUMBER.map((s) => s.kunci)).size).toBe(SUMBER.length)
  })
})

describe('periksaSusunan — nama yang tak terdaftar DITOLAK', () => {
  it('susunan wajar diterima', () => {
    expect(periksaSusunan(S()).sah).toBe(true)
  })

  it('sumber karangan ditolak', () => {
    const r = periksaSusunan(S({ sumber: 'users' }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/tidak dikenal/)
  })

  it('kolom karangan ditolak, bukan disaring diam-diam', () => {
    // Menyaring berarti menebak apa yang berbahaya, dan yang lolos dari
    // tebakan itu berakhir di query.
    const r = periksaSusunan(S({ kolom: ['name', 'password_hash'] }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/password_hash/)
  })

  it('kolom dari sumber LAIN ditolak', () => {
    // `invoice_number` sah di sumber invoice, tidak di sumber proyek.
    const r = periksaSusunan(S({ sumber: 'proyek', kolom: ['invoice_number'] }))
    expect(r.sah).toBe(false)
  })

  it('nol kolom ditolak', () => {
    const r = periksaSusunan(S({ kolom: [] }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/minimal satu kolom/)
  })

  it('upaya menyelipkan SQL lewat nama kolom ditolak', () => {
    const r = periksaSusunan(S({ kolom: ['name; DROP TABLE projects'] }))
    expect(r.sah).toBe(false)
  })

  it('kolom urut karangan ditolak', () => {
    const r = periksaSusunan(S({ urut: { kolom: 'ngawur', arah: 'naik' } }))
    expect(r.sah).toBe(false)
  })

  it('arah urut selain naik/turun ditolak', () => {
    const r = periksaSusunan(S({
      urut: { kolom: 'name', arah: 'acak' as unknown as 'naik' },
    }))
    expect(r.sah).toBe(false)
  })
})

describe('periksaSusunan — saringan tak boleh hilang diam-diam', () => {
  it('saringan sah diterima', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'status', operator: '=', nilai: 'active' }],
    }))
    expect(r.sah).toBe(true)
  })

  it('nilai KOSONG ditolak, bukan diperlakukan sebagai tanpa saringan', () => {
    // Saringan yang diam-diam hilang menghasilkan laporan yang jauh lebih
    // besar dari yang diminta — dan terlihat sah.
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'status', operator: '=', nilai: '' }],
    }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/wajib diisi/)
  })

  it('nilai berisi spasi saja juga ditolak', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'status', operator: '=', nilai: '   ' }],
    }))
    expect(r.sah).toBe(false)
  })

  it('kolom saringan karangan ditolak', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'ngawur', operator: '=', nilai: 'x' }],
    }))
    expect(r.sah).toBe(false)
  })

  it('operator yang tak berlaku untuk jenisnya ditolak', () => {
    // "mengandung" masuk akal untuk teks, tidak untuk angka.
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'contract_value', operator: 'mengandung', nilai: '5' }],
    }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/tak berlaku/)
  })

  it('operator karangan ditolak', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'status', operator: "'; DROP--", nilai: 'x' }],
    }))
    expect(r.sah).toBe(false)
  })

  it('nilai bukan-angka untuk kolom uang ditolak', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'contract_value', operator: '>', nilai: 'banyak' }],
    }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/harus angka/)
  })

  it('angka NOL diterima — ia nilai yang sah', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'contract_value', operator: '>', nilai: '0' }],
    }))
    expect(r.sah).toBe(true)
  })

  it('tanggal berformat salah ditolak', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'start_date', operator: '>=', nilai: '01-01-2026' }],
    }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/YYYY-MM-DD/)
  })

  it('tanggal berformat benar diterima', () => {
    const r = periksaSusunan(S({
      saringan: [{ kolom: 'start_date', operator: '>=', nilai: '2026-01-01' }],
    }))
    expect(r.sah).toBe(true)
  })
})

describe('periksaSusunan — batas baris', () => {
  it('tanpa batas memakai bawaan', () => {
    const r = periksaSusunan(S())
    expect(r.sah).toBe(true)
    if (r.sah) expect(r.susunan.batas).toBe(BATAS_BAWAAN)
  })

  it('batas di atas maksimum ditolak dengan sebabnya', () => {
    const r = periksaSusunan(S({ batas: BATAS_MAKS + 1 }))
    expect(r.sah).toBe(false)
    if (!r.sah) expect(r.galat).toMatch(/membekukan peramban/)
  })

  it('batas nol dan negatif ditolak', () => {
    expect(periksaSusunan(S({ batas: 0 })).sah).toBe(false)
    expect(periksaSusunan(S({ batas: -5 })).sah).toBe(false)
  })

  it('batas maksimum PERSIS diterima', () => {
    expect(periksaSusunan(S({ batas: BATAS_MAKS })).sah).toBe(true)
  })
})

describe('daftarSelect — penyaringan KEDUA yang disengaja', () => {
  it('menghasilkan daftar kolom yang diminta', () => {
    const s = cariSumber('proyek')!
    expect(daftarSelect(s, ['name', 'status'])).toBe('name, status')
  })

  it('kolom karangan DIBUANG meski lolos ke sini', () => {
    // Duplikasi yang disengaja: fungsi ini bisa dipanggil dari tempat yang
    // lupa memeriksa lebih dulu, dan hasilnya masuk LANGSUNG ke query.
    const s = cariSumber('proyek')!
    expect(daftarSelect(s, ['name', 'password_hash'])).toBe('name')
  })

  it('seluruhnya karangan menghasilkan string kosong, bukan "*"', () => {
    // Kalau ini menghasilkan `*`, kolom yang ditolak justru semuanya ikut
    // terbaca — kebalikan dari yang dimaksud.
    const s = cariSumber('proyek')!
    expect(daftarSelect(s, ['a', 'b'])).toBe('')
  })
})

describe('nilaiSaringan', () => {
  it('"mengandung" jadi %nilai%', () => {
    expect(nilaiSaringan('teks', 'mengandung', 'dago')).toBe('%dago%')
  })
  it('"diawali" jadi nilai%', () => {
    expect(nilaiSaringan('teks', 'diawali', 'INV')).toBe('INV%')
  })
  it('"=" tak diubah', () => {
    expect(nilaiSaringan('teks', '=', 'aktif')).toBe('aktif')
  })
  it('angka tak pernah dibungkus persen', () => {
    // Kalau dibungkus, perbandingan angka berubah jadi perbandingan teks dan
    // "9" akan terlihat lebih besar dari "10".
    expect(nilaiSaringan('angka', '>', '100')).toBe('100')
    expect(nilaiSaringan('uang', '>=', '5000')).toBe('5000')
  })

  it('angka DENGAN operator teks pun tak dibungkus', () => {
    // Ditemukan mutasi: mengganti `jenis === 'teks'` dengan `true` tak
    // membuat satu test pun merah, karena test di atas memakai `>` dan `>=`
    // — operator yang memang tak pernah membungkus apa pun, apa pun jenisnya.
    //
    // Yang diuji di sini: pembungkusan dijaga oleh JENIS, bukan kebetulan
    // oleh operator. Kalau lolos, saringan `>` pada kolom uang akan menerima
    // "%100%" dan Postgres menolaknya sebagai numeric tak sah — galat yang
    // menunjuk basis, padahal salahnya di sini.
    expect(nilaiSaringan('angka', 'mengandung', '100')).toBe('100')
    expect(nilaiSaringan('uang', 'diawali', '5000')).toBe('5000')
    expect(nilaiSaringan('tanggal', 'mengandung', '2026-01-01')).toBe('2026-01-01')
  })
})

describe('cariSumber', () => {
  it('menemukan yang terdaftar', () => {
    expect(cariSumber('proyek')?.tabel).toBe('projects')
  })
  it('yang tak terdaftar jadi null, bukan melempar', () => {
    expect(cariSumber('users')).toBeNull()
  })
})
