import { describe, it, expect } from 'vitest'
import {
  ringkasKomitmen,
  hitungPosisi,
  STATUS_KOMITMEN,
  type BarisPO,
} from '../komitmen.js'

/**
 * Test murni — tak menyentuh basis.
 *
 * `komitmen.ts` sengaja tak punya query di dalamnya, jadi aturannya bisa
 * diuji tanpa Postgres. Yang diuji di sini ATURAN BISNISNYA; bahwa rutenya
 * memanggil aturan ini dengan data yang benar diuji terpisah.
 */

const po = (status: string, total: number | string | null): BarisPO => ({
  id: crypto.randomUUID(),
  project_id: 'p1',
  status,
  total_amount: total,
})

describe('ringkasKomitmen — status mana yang mengikat', () => {
  it('menghitung sent + confirmed sebagai komitmen', () => {
    const r = ringkasKomitmen([po('sent', 5_000_000), po('confirmed', 3_000_000)])
    expect(r.nilaiKomitmen).toBe(8_000_000)
    expect(r.jumlahPo).toBe(2)
  })

  it('TIDAK menghitung draft sebagai komitmen', () => {
    const r = ringkasKomitmen([po('draft', 30_000_000)])
    expect(r.nilaiKomitmen).toBe(0)
    /*
      Tetapi draf WAJIB terlihat. PO draf senilai 30 juta yang tak muncul
      di mana pun adalah uang yang hilang dari pandangan — bukan uang yang
      tak ada.
    */
    expect(r.nilaiDraf).toBe(30_000_000)
    expect(r.jumlahDraf).toBe(1)
  })

  it('TIDAK menghitung cancelled sama sekali', () => {
    const r = ringkasKomitmen([po('cancelled', 4_950_000)])
    expect(r.nilaiKomitmen).toBe(0)
    expect(r.nilaiDraf).toBe(0)
    expect(r.nilaiTerpenuhi).toBe(0)
  })

  it('memindahkan fully_received dari komitmen ke terpenuhi', () => {
    const r = ringkasKomitmen([po('fully_received', 44_735_000)])
    expect(r.nilaiKomitmen).toBe(0)
    expect(r.nilaiTerpenuhi).toBe(44_735_000)
  })

  it('status tak dikenal diabaikan, bukan dihitung sembarangan', () => {
    const r = ringkasKomitmen([po('status_baru_belum_ada', 1_000_000)])
    expect(r.nilaiKomitmen).toBe(0)
    expect(r.nilaiTerpenuhi).toBe(0)
    expect(r.nilaiDraf).toBe(0)
  })

  it('numeric Postgres yang datang sebagai STRING tetap dijumlah benar', () => {
    /*
      `numeric` sampai ke JS sebagai string supaya presisinya tak hilang
      lewat float. Penjumlahan string akan menghasilkan "50000001000000".
    */
    const r = ringkasKomitmen([po('sent', '5000000'), po('confirmed', '1000000')])
    expect(r.nilaiKomitmen).toBe(6_000_000)
  })

  it('total NULL dihitung nol, bukan NaN', () => {
    const r = ringkasKomitmen([po('sent', null), po('sent', 2_000_000)])
    expect(r.nilaiKomitmen).toBe(2_000_000)
    expect(Number.isNaN(r.nilaiKomitmen)).toBe(false)
  })

  it('daftar kosong memberi nol di semua pencacah', () => {
    const r = ringkasKomitmen([])
    expect(r).toEqual({
      jumlahPo: 0, nilaiKomitmen: 0, nilaiTerpenuhi: 0, nilaiDraf: 0, jumlahDraf: 0,
    })
  })
})

describe('hitungPosisi — anggaran vs realisasi + komitmen', () => {
  it('KOMITMEN membuat pos yang terlihat aman jadi LEWAT', () => {
    /*
      Inilah alasan modul ini dibangun. Tanpa komitmen, pos ini terbaca
      "300 dari 500 — masih aman". Dengan komitmen 250, ia sudah lewat 50.
    */
    const p = hitungPosisi({
      projectId: 'p1', nama: 'Pos Material',
      anggaran: 500_000_000, realisasi: 300_000_000, komitmen: 250_000_000,
    })
    expect(p.sisa).toBe(-50_000_000)
    expect(p.lewat).toBe(true)
    expect(p.terpakaiPct).toBeCloseTo(110, 5)
  })

  it('tanpa komitmen, pos yang sama masih aman — pembanding langsung', () => {
    const p = hitungPosisi({
      projectId: 'p1', nama: 'Pos Material',
      anggaran: 500_000_000, realisasi: 300_000_000, komitmen: 0,
    })
    expect(p.sisa).toBe(200_000_000)
    expect(p.lewat).toBe(false)
  })

  it('anggaran NOL memberi terpakaiPct null, BUKAN 0', () => {
    /*
      0% dan "tak punya anggaran" adalah dua keadaan berbeda. Menampilkan
      0% untuk yang kedua membuat proyek tanpa anggaran terlihat paling
      sehat di seluruh daftar.
    */
    const p = hitungPosisi({
      projectId: 'p1', nama: 'Belum dianggarkan',
      anggaran: 0, realisasi: 10_000_000, komitmen: 0,
    })
    expect(p.terpakaiPct).toBeNull()
    expect(p.lewat).toBe(false)
  })

  it('tepat 100% belum dihitung LEWAT', () => {
    const p = hitungPosisi({
      projectId: 'p1', nama: 'Pas',
      anggaran: 100_000_000, realisasi: 60_000_000, komitmen: 40_000_000,
    })
    expect(p.terpakaiPct).toBe(100)
    expect(p.lewat).toBe(false)
  })
})

describe('STATUS_KOMITMEN — daftarnya tak boleh melebar diam-diam', () => {
  it('hanya sent & confirmed', () => {
    /*
      Penjaga terhadap perubahan yang tak disengaja. Menambah `draft` ke
      daftar ini akan mengembangkan angka komitmen seluruh perusahaan, dan
      tak ada test lain yang akan merah karenanya.
    */
    expect([...STATUS_KOMITMEN]).toEqual(['sent', 'confirmed'])
  })
})
