/**
 * Cara menagih change order — aturannya. MURNI, tanpa basis.
 *
 * Yang dijaga: `billing_mode` menentukan apakah `contract_value` dinaikkan.
 * Salah di sini berarti pekerjaan yang sama tertagih dua kali lewat dua jalur
 * yang masing-masing terlihat benar — tanpa satu pun galat.
 */
import { describe, it, expect } from 'vitest'
import {
  naikkanNilaiKontrak, periksaPenyetujuanCo, rekapPenagihanCo,
  CARA_TAGIH, ARTI_CARA_TAGIH,
  type BarisCo,
} from '../penagihan-co.js'

const co = (o: Partial<BarisCo> & { id: string }): BarisCo => ({
  co_number: 'CO-' + o.id, status: 'approved', billing_mode: 'include_termin',
  total_amount_delta: 10_000_000, ...o,
})

describe('naikkanNilaiKontrak', () => {
  it('HANYA include_termin yang menaikkan nilai kontrak', () => {
    expect(naikkanNilaiKontrak('include_termin')).toBe(true)
    expect(naikkanNilaiKontrak('separate_co')).toBe(false)
    expect(naikkanNilaiKontrak('final_account')).toBe(false)
  })

  it('kosong/null TIDAK menaikkan — belum diputuskan bukan berarti menyatu', () => {
    // Menebak NULL sebagai include_termin persis kesalahan yang menyembunyikan
    // lubang ini selama ini.
    expect(naikkanNilaiKontrak(null)).toBe(false)
    expect(naikkanNilaiKontrak(undefined)).toBe(false)
    expect(naikkanNilaiKontrak('')).toBe(false)
  })

  it('nilai asing tidak menaikkan', () => {
    expect(naikkanNilaiKontrak('include_ termin')).toBe(false)
    expect(naikkanNilaiKontrak('INCLUDE_TERMIN')).toBe(false)
  })

  it('setiap cara tagih punya penjelasannya', () => {
    for (const c of CARA_TAGIH) {
      expect(ARTI_CARA_TAGIH[c], c).toBeTruthy()
      expect(ARTI_CARA_TAGIH[c].length).toBeGreaterThan(20)
    }
  })
})

describe('periksa penyetujuan CO', () => {
  it('include_termin diterima, dan menyatakan nilai kontrak naik', () => {
    const h = periksaPenyetujuanCo({ billingMode: 'include_termin', deltaNilai: 50_000_000 })
    expect(h.boleh).toBe(true)
    if (h.boleh) {
      expect(h.naikkanKontrak).toBe(true)
      expect(h.catatan).toMatch(/Rp 50\.000\.000/)
    }
  })

  it('separate_co diterima, dan menyatakan nilai kontrak TIDAK diubah', () => {
    const h = periksaPenyetujuanCo({ billingMode: 'separate_co', deltaNilai: 50_000_000 })
    expect(h.boleh).toBe(true)
    if (h.boleh) {
      expect(h.naikkanKontrak).toBe(false)
      expect(h.catatan).toMatch(/TIDAK diubah/i)
    }
  })

  it('final_account juga tidak menaikkan', () => {
    const h = periksaPenyetujuanCo({ billingMode: 'final_account', deltaNilai: 10_000_000 })
    expect(h.boleh).toBe(true)
    if (h.boleh) expect(h.naikkanKontrak).toBe(false)
  })

  it('cara tagih KOSONG ditolak', () => {
    // Menyetujui tanpa memutuskan cara menagih berarti keputusan itu diambil
    // belakangan oleh siapa pun yang menerbitkan tagihan, tanpa jejak.
    for (const v of [null, undefined, '', '   ']) {
      const h = periksaPenyetujuanCo({ billingMode: v, deltaNilai: 1 })
      expect(h.boleh, String(v)).toBe(false)
      if (!h.boleh) expect(h.sebab).toMatch(/belum ditentukan/i)
    }
  })

  it('cara tagih asing ditolak, dan pilihannya disebut', () => {
    const h = periksaPenyetujuanCo({ billingMode: 'nanti_saja', deltaNilai: 1 })
    expect(h.boleh).toBe(false)
    if (!h.boleh) {
      expect(h.sebab).toMatch(/tidak dikenali/i)
      expect(h.sebab).toMatch(/separate_co/)
    }
  })

  it('delta NOL boleh include_termin, tapi tak boleh ditagih terpisah', () => {
    // Perubahan spesifikasi tanpa perubahan harga itu nyata; yang tak masuk
    // akal adalah menerbitkan tagihan tersendiri senilai nol.
    expect(periksaPenyetujuanCo({ billingMode: 'include_termin', deltaNilai: 0 }).boleh).toBe(true)

    const h = periksaPenyetujuanCo({ billingMode: 'separate_co', deltaNilai: 0 })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tak ada yang perlu ditagih/i)
  })

  it('delta NEGATIF diterima — pekerjaan kurang itu nyata', () => {
    const h = periksaPenyetujuanCo({ billingMode: 'separate_co', deltaNilai: -5_000_000 })
    expect(h.boleh).toBe(true)
    if (h.boleh) expect(h.naikkanKontrak).toBe(false)
  })

  it('delta bukan angka ditolak, bukan diperlakukan nol', () => {
    // `Number('') === 0` — kalau lolos jadi nol, ia ditolak di tempat lain
    // dengan pesan yang membicarakan hal berbeda.
    const h = periksaPenyetujuanCo({ billingMode: 'include_termin', deltaNilai: 'entah' })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tidak terbaca sebagai angka/i)
  })

  it('delta bertipe STRING (dari pg) tetap terbaca', () => {
    const h = periksaPenyetujuanCo({ billingMode: 'include_termin', deltaNilai: '50000000.00' })
    expect(h.boleh).toBe(true)
    if (h.boleh) expect(h.catatan).toMatch(/Rp 50\.000\.000/)
  })
})

describe('rekap penagihan CO', () => {
  it('memisahkan tiga jalur, dan yang tanpa cara tagih berdiri sendiri', () => {
    const r = rekapPenagihanCo([
      co({ id: '1', billing_mode: 'include_termin', total_amount_delta: 50_000_000 }),
      co({ id: '2', billing_mode: 'separate_co', total_amount_delta: 30_000_000 }),
      co({ id: '3', billing_mode: 'final_account', total_amount_delta: 20_000_000 }),
      co({ id: '4', billing_mode: null, total_amount_delta: 7_000_000 }),
    ])
    expect(r.lewatTermin).toBe(50_000_000)
    expect(r.terpisah).toBe(30_000_000)
    expect(r.akhir).toBe(20_000_000)
    // Yang tanpa cara tagih TIDAK dilebur ke salah satu — melebur berarti
    // menebak, dan tebakan itu yang harus terlihat supaya bisa diperbaiki.
    expect(r.tanpaCara).toBe(7_000_000)
    expect(r.jumlahTanpaCara).toBe(1)
  })

  it('yang BELUM disetujui tak dihitung sama sekali', () => {
    const r = rekapPenagihanCo([
      co({ id: '1', status: 'draft', total_amount_delta: 99_000_000 }),
      co({ id: '2', status: 'submitted', billing_mode: 'separate_co', total_amount_delta: 88_000_000 }),
      co({ id: '3', status: 'rejected', billing_mode: 'separate_co', total_amount_delta: 77_000_000 }),
    ])
    expect(r.lewatTermin).toBe(0)
    expect(r.terpisah).toBe(0)
    expect(r.tanpaCara).toBe(0)
  })

  it('numeric STRING dari pg dijumlahkan sebagai angka', () => {
    // `'30000000' + '20000000'` menghasilkan '3000000020000000' kalau tak
    // dikonversi — angka yang salah tanpa satu pun galat.
    const r = rekapPenagihanCo([
      co({ id: '1', billing_mode: 'separate_co', total_amount_delta: '30000000.00' }),
      co({ id: '2', billing_mode: 'separate_co', total_amount_delta: '20000000.00' }),
    ])
    expect(r.terpisah).toBe(50_000_000)
  })

  it('delta negatif mengurangi, bukan ditambah sebagai nilai mutlak', () => {
    const r = rekapPenagihanCo([
      co({ id: '1', billing_mode: 'separate_co', total_amount_delta: 30_000_000 }),
      co({ id: '2', billing_mode: 'separate_co', total_amount_delta: -10_000_000 }),
    ])
    expect(r.terpisah).toBe(20_000_000)
  })

  it('daftar kosong menghasilkan nol, tidak melempar', () => {
    expect(rekapPenagihanCo([])).toEqual({
      lewatTermin: 0, terpisah: 0, akhir: 0, tanpaCara: 0, jumlahTanpaCara: 0,
    })
  })

  it('nilai tak terbaca dilewati, tidak membuat NaN mengalir', () => {
    const r = rekapPenagihanCo([
      co({ id: '1', billing_mode: 'separate_co', total_amount_delta: 'entah' }),
      co({ id: '2', billing_mode: 'separate_co', total_amount_delta: 10_000_000 }),
    ])
    expect(Number.isNaN(r.terpisah)).toBe(false)
    expect(r.terpisah).toBe(10_000_000)
  })
})
