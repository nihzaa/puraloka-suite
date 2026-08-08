import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { barisFokus, totalFokus } from './fokus'

describe('barisFokus', () => {
  /*
   * Aturan 1: baris NOL dibuang. Daftar yang penuh "0" membuat yang
   * benar-benar menunggu tenggelam — nol di sini bukan informasi, ia
   * ketiadaan pekerjaan.
   */
  it('membuang baris bernilai nol', () => {
    const b = barisFokus({ invoice_jatuh_tempo: 0, kasbon_menunggu: 3 })
    expect(b).toHaveLength(1)
    expect(b[0].kunci).toBe('kasbon_menunggu')
  })

  it('rincian kosong menghasilkan daftar kosong', () => {
    expect(barisFokus({})).toEqual([])
    expect(barisFokus(null)).toEqual([])
    expect(barisFokus(undefined)).toEqual([])
  })

  /*
   * Aturan 2 — ini yang paling mudah rusak diam-diam. Mengurutkan menurut
   * JUMLAH saja akan menaruh "12 kasbon menunggu" di atas "1 invoice jatuh
   * tempo", dan yang sudah merugikan hilang di bawah.
   */
  it('lewat tenggat selalu di atas yang menunggu — walau jumlahnya jauh lebih kecil', () => {
    const b = barisFokus({ kasbon_menunggu: 12, invoice_jatuh_tempo: 1 })
    expect(b.map((x) => x.kunci)).toEqual(['invoice_jatuh_tempo', 'kasbon_menunggu'])
  })

  it('nada ditandai benar', () => {
    const b = barisFokus({ invoice_jatuh_tempo: 1, kasbon_menunggu: 1 })
    expect(b.find((x) => x.kunci === 'invoice_jatuh_tempo')?.nada).toBe('lewat')
    expect(b.find((x) => x.kunci === 'kasbon_menunggu')?.nada).toBe('menunggu')
  })

  it('nilai tak sah diperlakukan seperti nol', () => {
    // @ts-expect-error — sengaja: API bisa mengirim null/teks saat kolomnya kosong
    expect(barisFokus({ invoice_jatuh_tempo: null, kasbon_menunggu: 'x' })).toEqual([])
    expect(barisFokus({ invoice_jatuh_tempo: NaN })).toEqual([])
    expect(barisFokus({ invoice_jatuh_tempo: -2 })).toEqual([])
  })

  it('tiap baris punya tautannya sendiri — bukan satu tautan untuk semua', () => {
    const b = barisFokus({ invoice_jatuh_tempo: 1, kasbon_menunggu: 1 })
    const href = b.map((x) => x.href)
    expect(new Set(href).size).toBe(href.length)
  })

  /*
   * Tautan yang menunjuk rute tak ada = 404 dari widget yang justru dibuat
   * untuk mempercepat. Diukur ke DISK, bukan dipercaya dari ingatan: dua
   * tautan pertama yang saya tulis (`/kontrak/klaim`, `/lapangan/instruksi`)
   * ternyata memang tak ada — keduanya hidup di dalam halaman induknya.
   */
  it('semua tautan menunjuk halaman yang BENAR-BENAR ada', () => {
    const b = barisFokus({
      invoice_jatuh_tempo: 1,
      klaim_lewat_batas: 1,
      instruksi_belum_dikonfirmasi: 1,
      kasbon_menunggu: 1,
      penagihan_menunggu: 1,
    })
    expect(b).toHaveLength(5)
    for (const x of b) {
      const berkas = join(process.cwd(), 'app', '(dashboard)', x.href, 'page.tsx')
      expect(existsSync(berkas), `rute ${x.href} tidak ada di disk (${x.kunci})`).toBe(true)
    }
  })
})

describe('totalFokus', () => {
  it('menjumlahkan per nada', () => {
    const b = barisFokus({ invoice_jatuh_tempo: 2, klaim_lewat_batas: 1, kasbon_menunggu: 4 })
    expect(totalFokus(b)).toEqual({ lewat: 3, menunggu: 4 })
  })

  it('daftar kosong jadi nol-nol', () => {
    expect(totalFokus([])).toEqual({ lewat: 0, menunggu: 0 })
  })
})
