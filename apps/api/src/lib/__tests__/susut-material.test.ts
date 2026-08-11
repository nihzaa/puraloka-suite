import { describe, it, expect } from 'vitest'
import {
  angka, hitungBaris, ringkas, periksaRencana, periksaFaktor,
  LIPAT_JAUH_MELEBIHI, type BarisSusut,
} from '../susut-material.js'

/**
 * Test pustaka susut material.
 *
 * Yang dijaga di sini bukan aritmetikanya, melainkan bahwa **angka susut tak
 * pernah dipakai menilai orang tanpa pembanding** — dan bahwa cacat
 * pencatatan tidak disembunyikan supaya angkanya terlihat rapi.
 */

const B = (o: Partial<BarisSusut> = {}): BarisSusut => ({
  material_id: o.material_id ?? 'm1',
  nama: 'nama' in o ? o.nama! : 'Semen Portland 50kg',
  satuan: 'satuan' in o ? o.satuan! : 'sak',
  rab: 'rab' in o ? o.rab! : '100',
  diterima: 'diterima' in o ? o.diterima! : '100',
  terpakai: 'terpakai' in o ? o.terpakai! : '90',
  sisa: 'sisa' in o ? o.sisa! : '5',
  rencana_fraksi: 'rencana_fraksi' in o ? o.rencana_fraksi! : '0.05',
})

describe('angka', () => {
  it('string kosong jadi null, bukan nol', () => {
    expect(angka('')).toBeNull()
    expect(angka('   ')).toBeNull()
  })
  it('numeric Postgres sebagai string dibaca benar', () => {
    expect(angka('12.5000')).toBe(12.5)
  })
  it('nol sungguhan tetap nol', () => {
    expect(angka('0')).toBe(0)
  })
})

describe('hitungBaris — susut nyata', () => {
  it('menghitung yang hilang dan persentasenya', () => {
    // 100 diterima − 90 terpakai − 5 sisa = 5 hilang = 5%
    const r = hitungBaris(B())
    expect(r.hilang).toBe(5)
    expect(r.susut_pct).toBe(5)
  })

  it('susut dihitung terhadap yang DITERIMA, bukan terhadap RAB', () => {
    // RAB 200 tapi hanya 100 yang datang. Susutnya soal material yang ADA di
    // tangan — memakai RAB sebagai penyebut membuat kekurangan pembelian
    // terbaca sebagai susut.
    const r = hitungBaris(B({ rab: '200' }))
    expect(r.susut_pct).toBe(5)
  })

  it('nol diterima → susut null, BUKAN 0%', () => {
    // "Belum ada yang datang" berbeda artinya dari "nol persen susut", dan
    // menyamakannya membuat material yang belum tiba terlihat sempurna.
    const r = hitungBaris(B({ diterima: '0', terpakai: '0', sisa: '0' }))
    expect(r.susut_pct).toBeNull()
    expect(r.nilai).toBe('tak_terukur')
  })

  it('hilang NEGATIF dibiarkan negatif, tidak dipaksa nol', () => {
    // Terpakai + sisa melebihi yang diterima = ada yang salah catat.
    // Memaksanya nol menyembunyikan cacat pencatatan yang perlu diperbaiki,
    // dan membuat susutnya terlihat sempurna.
    const r = hitungBaris(B({ diterima: '100', terpakai: '98', sisa: '10' }))
    expect(r.hilang).toBe(-8)
    expect(r.susut_pct).toBe(-8)
  })

  it('data tak lengkap → null, bukan diterka', () => {
    expect(hitungBaris(B({ sisa: null })).hilang).toBeNull()
    expect(hitungBaris(B({ diterima: '' })).susut_pct).toBeNull()
  })
})

describe('hitungBaris — penilaian HANYA saat ada pembanding', () => {
  it('tanpa rencana → tak_terukur, dan itu bukan kegagalan', () => {
    // Angka susut tanpa pembanding tak boleh dipakai menilai siapa pun.
    const r = hitungBaris(B({ rencana_fraksi: null }))
    expect(r.nilai).toBe('tak_terukur')
    expect(r.rencana_pct).toBeNull()
    expect(r.selisih_pct).toBeNull()
    // Susut nyatanya TETAP dihitung — yang tak ada hanya penilaiannya.
    expect(r.susut_pct).toBe(5)
  })

  it('rencana kosong (string) juga tak_terukur, bukan rencana 0%', () => {
    expect(hitungBaris(B({ rencana_fraksi: '' })).nilai).toBe('tak_terukur')
  })

  it('susut di bawah rencana → wajar', () => {
    const r = hitungBaris(B({ terpakai: '92', sisa: '5', rencana_fraksi: '0.05' }))
    expect(r.susut_pct).toBe(3)
    expect(r.nilai).toBe('wajar')
  })

  it('susut PERSIS rencana → wajar, batasnya inklusif', () => {
    // Batas eksklusif akan menuduh orang yang tepat memenuhi anggarannya.
    expect(hitungBaris(B()).nilai).toBe('wajar')
  })

  it('susut di atas rencana tapi di bawah dua kali → melebihi', () => {
    const r = hitungBaris(B({ terpakai: '85', sisa: '7', rencana_fraksi: '0.05' }))
    expect(r.susut_pct).toBe(8)
    expect(r.nilai).toBe('melebihi')
  })

  it(`lebih dari ${LIPAT_JAUH_MELEBIHI}x rencana → jauh_melebihi`, () => {
    const r = hitungBaris(B({ terpakai: '80', sisa: '5', rencana_fraksi: '0.05' }))
    expect(r.susut_pct).toBe(15)
    expect(r.nilai).toBe('jauh_melebihi')
  })

  it('tepat dua kali rencana masih "melebihi", bukan "jauh"', () => {
    const r = hitungBaris(B({ terpakai: '85', sisa: '5', rencana_fraksi: '0.05' }))
    expect(r.susut_pct).toBe(10)
    expect(r.nilai).toBe('melebihi')
  })

  it('selisih dihitung dalam poin persen', () => {
    const r = hitungBaris(B({ terpakai: '85', sisa: '7', rencana_fraksi: '0.05' }))
    expect(r.selisih_pct).toBe(3)
  })

  it('susut LEBIH KECIL dari rencana menghasilkan selisih negatif', () => {
    const r = hitungBaris(B({ terpakai: '93', sisa: '5', rencana_fraksi: '0.05' }))
    expect(r.selisih_pct).toBe(-3)
  })
})

describe('hitungBaris — rencana NOL adalah kasus khusus', () => {
  it('susut 0 pada rencana 0 → wajar', () => {
    const r = hitungBaris(B({ terpakai: '95', sisa: '5', rencana_fraksi: '0' }))
    expect(r.susut_pct).toBe(0)
    expect(r.nilai).toBe('wajar')
  })

  it('susut kecil pada rencana 0 → melebihi, BUKAN jauh_melebihi', () => {
    // `rencana * 2` tetap nol, jadi tanpa cabang khusus susut 0,5% pada
    // material berencana 0% langsung dicap "jauh melebihi" — tuduhan berat
    // untuk selisih setengah persen.
    const r = hitungBaris(B({ diterima: '1000', terpakai: '994', sisa: '1', rencana_fraksi: '0' }))
    expect(r.susut_pct).toBe(0.5)
    expect(r.nilai).toBe('melebihi')
  })

  it('susut besar pada rencana 0 → jauh_melebihi', () => {
    const r = hitungBaris(B({ terpakai: '90', sisa: '5', rencana_fraksi: '0' }))
    expect(r.susut_pct).toBe(5)
    expect(r.nilai).toBe('jauh_melebihi')
  })
})

describe('ringkas', () => {
  const buat = () => [
    hitungBaris(B({ material_id: 'a', terpakai: '95', sisa: '5', rencana_fraksi: '0.05' })),  // 0% wajar
    hitungBaris(B({ material_id: 'b', terpakai: '85', sisa: '7', rencana_fraksi: '0.05' })),  // 8% melebihi
    hitungBaris(B({ material_id: 'c', terpakai: '80', sisa: '5', rencana_fraksi: '0.05' })),  // 15% jauh
    hitungBaris(B({ material_id: 'd', rencana_fraksi: null })),                                // tak terukur
  ]

  it('menghitung tiap kategori terpisah', () => {
    const r = ringkas(buat())
    expect(r.wajar).toBe(1)
    expect(r.melebihi).toBe(1)
    expect(r.jauh_melebihi).toBe(1)
    expect(r.tak_terukur).toBe(1)
    expect(r.total_material).toBe(4)
    expect(r.terukur).toBe(3)
  })

  it('terparah adalah selisih TERBESAR, bukan susut terbesar', () => {
    // Yang dicari saat rapat: yang paling jauh dari anggarannya, bukan yang
    // angkanya paling besar. Material berencana 20% yang susut 21% lebih
    // wajar daripada yang berencana 1% dan susut 6%.
    const r = ringkas(buat())
    expect(r.terparah?.material_id).toBe('c')
    expect(r.terparah?.selisih_pct).toBe(10)
  })

  it('yang tak terukur TIDAK ikut jadi terparah', () => {
    const r = ringkas([hitungBaris(B({ rencana_fraksi: null }))])
    expect(r.terparah).toBeNull()
  })

  it('semua wajar → terparah null, bukan yang paling tidak wajar', () => {
    const r = ringkas([
      hitungBaris(B({ terpakai: '95', sisa: '5' })),
      hitungBaris(B({ terpakai: '96', sisa: '4' })),
    ])
    expect(r.terparah).toBeNull()
  })

  it('daftar kosong tidak melempar', () => {
    const r = ringkas([])
    expect(r.total_material).toBe(0)
    expect(r.terparah).toBeNull()
  })
})

describe('periksaRencana', () => {
  it('kosong ditolak — Number("") adalah 0', () => {
    expect(periksaRencana('')).toMatch(/wajib diisi/)
    expect(periksaRencana(null)).toMatch(/wajib diisi/)
    expect(periksaRencana(undefined)).toMatch(/wajib diisi/)
  })
  it('negatif ditolak', () => {
    expect(periksaRencana(-1)).toMatch(/negatif/)
  })
  it('di atas 100 ditolak dengan sebabnya', () => {
    const p = periksaRencana(500)
    expect(p).toMatch(/dua kali lipat/)
    expect(p).toMatch(/5 untuk 5%/)
  })
  it('0 dan 100 diterima — batasnya inklusif', () => {
    expect(periksaRencana(0)).toBeNull()
    expect(periksaRencana(100)).toBeNull()
  })
  it('nilai wajar diterima', () => {
    expect(periksaRencana('5')).toBeNull()
  })
  it('teks bukan angka ditolak', () => {
    expect(periksaRencana('banyak')).toMatch(/harus angka/)
  })
})

describe('periksaFaktor', () => {
  it('kosong ditolak', () => {
    expect(periksaFaktor('')).toMatch(/wajib diisi/)
  })
  it('NOL ditolak — ia menghapus seluruh kebutuhan', () => {
    // Faktor 0 menghasilkan "tak ada yang dibutuhkan" untuk material yang
    // sebenarnya dipakai berton-ton.
    expect(periksaFaktor(0)).toMatch(/lebih besar dari 0/)
  })
  it('negatif ditolak', () => {
    expect(periksaFaktor(-1)).toMatch(/lebih besar dari 0/)
  })
  it('pecahan kecil diterima — 1 kg = 0,02 sak', () => {
    expect(periksaFaktor('0.02')).toBeNull()
  })
  it('teks bukan angka ditolak', () => {
    expect(periksaFaktor('satu')).toMatch(/harus angka/)
  })
})
