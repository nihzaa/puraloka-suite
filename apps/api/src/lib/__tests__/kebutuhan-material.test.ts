/**
 * KEBUTUHAN MATERIAL — yang diuji cara ia memberi peringatan SALAH dalam diam.
 *
 * Angka acuan dari basis nyata 2026-08-16 (sesudah migrasi 425 mengisi peta):
 *
 *   Bu Sari — Dago       Hebel AAC 10cm   14.342 buah
 *   Pak Andi — Buah Batu Hebel AAC 10cm    9.146 buah
 *   Bu Sari — Dago       Cat Dulux 5L        313 kaleng
 */
import { describe, it, expect } from 'vitest'
import { nilaiKebutuhan } from '../kebutuhan-material.js'

describe('nilaiKebutuhan', () => {
  it('menandai kurang terhadap progres, bukan terhadap total', () => {
    // Rencana 1000, progres 50%, bantalan 10% → butuh 550. Tersedia 400.
    const h = nilaiKebutuhan({ rencana: 1000, diterima: 300, ditangan: 100 }, 0.5, 0.1)
    expect(h.kurang).toBe(true)
    expect(h.selisih).toBeCloseTo(-150, 0)
    expect(h.sebab).toBe('kurang_terhadap_progres')
  })

  it('PROYEK BARU MULAI TIDAK dilaporkan kekurangan segalanya', () => {
    /*
      Cacat yang membuat automation ini tak berguna kalau lolos.

      Membandingkan dengan kebutuhan TOTAL membuat setiap proyek yang baru
      mulai terlihat kekurangan seluruh materialnya — benar secara aritmetika,
      dan tak berguna sama sekali karena tak ada kontraktor yang menimbun
      seluruh material di hari pertama.

      Peringatan yang selalu benar dan selalu ada adalah peringatan yang
      diabaikan dalam seminggu.
    */
    const h = nilaiKebutuhan({ rencana: 14342, diterima: 0, ditangan: 500 }, 0.02, 0.1)
    expect(h.kurang).toBe(false)   // 2% progres → butuh ~316, tersedia 500
  })

  it('PROGRES DI ATAS 100% DIJEPIT — satu salah ketik tak memicu peringatan massal', () => {
    /*
      `progress_logs.pct_overall` bisa melebihi 100 (pekerjaan tambah) dan bisa
      negatif kalau salah input. Tanpa jepitan, progres 150% menuntut material
      satu setengah kali RAB dan SELURUH proyek dilaporkan kekurangan.

      Tak ada galat. Yang terlihat cuma banjir peringatan dari satu salah ketik.
    */
    const cukup = { rencana: 1000, diterima: 1000, ditangan: 0 }
    expect(nilaiKebutuhan(cukup, 1.5, 0).kurang).toBe(false)
    expect(nilaiKebutuhan(cukup, 15, 0).kurang).toBe(false)
  })

  it('progres NEGATIF dijepit ke nol, bukan membalik tandanya', () => {
    // Progres −0,5 dengan bantalan menghasilkan kebutuhan NEGATIF, sehingga
    // material yang benar-benar habis dilaporkan "cukup".
    const h = nilaiKebutuhan({ rencana: 1000, diterima: 0, ditangan: 0 }, -0.5, 0.1)
    expect(h.kurang).toBe(false)      // butuh 0 pada progres 0
    expect(h.selisih).toBe(0)
  })

  it('STOK DI TANGAN ikut dihitung, bukan hanya yang sudah diterima', () => {
    // Menghitung `diterima` saja melaporkan kekurangan untuk material yang
    // barangnya ADA di gudang — peringatan palsu yang membuat orang memesan
    // barang yang sudah dipunya.
    const h = nilaiKebutuhan({ rencana: 1000, diterima: 100, ditangan: 500 }, 0.5, 0.1)
    expect(h.kurang).toBe(false)
    expect(h.porsiTersedia).toBe(0.6)
  })

  it('bantalan menambah kebutuhan, bukan menguranginya', () => {
    const tanpa = nilaiKebutuhan({ rencana: 1000, diterima: 500, ditangan: 0 }, 0.5, 0)
    const dengan = nilaiKebutuhan({ rencana: 1000, diterima: 500, ditangan: 0 }, 0.5, 0.2)
    expect(tanpa.kurang).toBe(false)     // butuh 500, tersedia 500
    expect(dengan.kurang).toBe(true)     // butuh 600, tersedia 500
  })

  it('rencana nol atau tak sah dilewati, bukan dianggap kurang', () => {
    // Baris peta ber-rencana 0 akan melaporkan kekurangan pada progres berapa
    // pun kalau tak dijaga — kebisingan dari data yang belum dipetakan.
    for (const r of [0, -5, Number.NaN]) {
      const h = nilaiKebutuhan({ rencana: r, diterima: 0, ditangan: 0 }, 0.9, 0.1)
      expect(h.kurang).toBe(false)
      expect(h.sebab).toBe('belum_ada_rencana')
    }
  })
})
