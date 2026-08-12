/**
 * D3 — back-charge (murni, tanpa basis).
 *
 * Jalur nyatanya diuji di `routes/v1/__tests__/back-charge.test.ts` terhadap
 * Postgres sungguhan.
 */
import { describe, it, expect } from 'vitest'
import {
  ringkasBackCharge, hitungNetoLengkap, periksaSetujuBackCharge,
  type BarisBackCharge,
} from '../back-charge.js'

let n = 0
const B = (status: string, nilai: number | string): BarisBackCharge => ({
  id: `bc${++n}`, nomor: `BC-${n}`, uraian: 'uji', nilai, status,
})

describe('ringkasBackCharge — status menentukan segalanya', () => {
  it('hanya `disetujui` yang siap dipotong', () => {
    const r = ringkasBackCharge([
      B('disetujui', 1_000_000),
      B('diajukan', 500_000),
      B('dipotong', 750_000),
      B('dibatalkan', 999_000),
    ])
    expect(r.siapDipotong).toBe(1_000_000)
    expect(r.menungguSetuju).toBe(500_000)
    expect(r.sudahDipotong).toBe(750_000)
  })

  it('`diajukan` TIDAK memotong apa pun', () => {
    // Belum disahkan siapa pun; memotongnya berarti sepihak.
    const r = ringkasBackCharge([B('diajukan', 2_000_000)])
    expect(r.siapDipotong).toBe(0)
  })

  it('`dipotong` tak dihitung lagi sebagai siap', () => {
    // Sudah masuk pembayaran lain. Menghitungnya lagi memotong DUA KALI untuk
    // biaya yang sama, dan totalnya tetap terlihat wajar.
    const r = ringkasBackCharge([B('dipotong', 3_000_000)])
    expect(r.siapDipotong).toBe(0)
    expect(r.sudahDipotong).toBe(3_000_000)
  })

  it('`dibatalkan` tak dihitung ke mana pun', () => {
    const r = ringkasBackCharge([B('dibatalkan', 5_000_000)])
    expect(r.siapDipotong).toBe(0)
    expect(r.sudahDipotong).toBe(0)
    expect(r.menungguSetuju).toBe(0)
  })

  it('mengumpulkan id yang siap dipotong — bukan hanya jumlahnya', () => {
    // Id-nya yang dipakai menandai `dipotong` sesudah pembayaran; tanpa itu,
    // tak ada yang tahu baris MANA yang sudah terpakai.
    const a = B('disetujui', 100), b = B('diajukan', 200), c = B('disetujui', 300)
    const r = ringkasBackCharge([a, b, c])
    expect(r.siapIds).toEqual([a.id, c.id])
  })

  it('nilai nol/negatif/kosong dilewati', () => {
    const r = ringkasBackCharge([
      B('disetujui', 0), B('disetujui', -500), B('disetujui', ''),
    ])
    expect(r.siapDipotong).toBe(0)
  })

  it('numeric bertipe string dari Postgres dibaca benar', () => {
    const r = ringkasBackCharge([B('disetujui', '2500000.50')])
    expect(r.siapDipotong).toBe(2_500_000.5)
  })

  it('daftar kosong tak melempar', () => {
    expect(ringkasBackCharge([])).toMatchObject({ siapDipotong: 0, jumlahBaris: 0 })
  })
})

describe('hitungNetoLengkap — urutan potongan menentukan hasil', () => {
  it('retensi dihitung dari BRUTO, bukan dari sisa setelah back-charge', () => {
    // Retensi adalah jaminan mutu atas NILAI PEKERJAAN, bukan atas uang yang
    // kebetulan dibayarkan. Menghitungnya dari sisa akan mengecilkan retensi
    // tiap kali ada back-charge — persis saat jaminannya paling dibutuhkan.
    const h = hitungNetoLengkap({
      bruto: 10_000_000, retensiPct: 5, potonganKasbon: 0, backCharge: 2_000_000,
    })
    expect(h.ok).toBe(true)
    expect(h.retensi).toBe(500_000)          // 5% dari 10 jt, BUKAN dari 8 jt
    expect(h.backCharge).toBe(2_000_000)
    expect(h.neto).toBe(7_500_000)
  })

  it('menjumlah kasbon dan back-charge', () => {
    const h = hitungNetoLengkap({
      bruto: 10_000_000, retensiPct: 0, potonganKasbon: 1_000_000, backCharge: 2_000_000,
    })
    expect(h.neto).toBe(7_000_000)
  })

  it('potongan melebihi tagihan DITOLAK, bukan dipaksa nol', () => {
    // Pembayaran negatif berarti potongannya melebihi tagihannya, dan itu
    // keputusan manusia (mis. sisa dibawa ke pembayaran berikutnya) — bukan
    // sesuatu yang boleh diputuskan diam-diam oleh pembulatan.
    const h = hitungNetoLengkap({
      bruto: 1_000_000, retensiPct: 0, potonganKasbon: 0, backCharge: 5_000_000,
    })
    expect(h.ok).toBe(false)
    expect(h.galat).toMatch(/melebihi tagihan/i)
  })

  it('galat MENYEBUT back-charge supaya tak dicari di kasbon', () => {
    // Pesan dari lib retensi menyebut "kasbon" untuk jumlah gabungan. Tanpa
    // penjelasan ini, yang membaca akan mencari selisihnya di kasbon dan tak
    // menemukan apa pun.
    const h = hitungNetoLengkap({
      bruto: 1_000_000, retensiPct: 0, potonganKasbon: 0, backCharge: 5_000_000,
    })
    expect(h.galat).toMatch(/back-charge/i)
  })

  it('back-charge negatif ditolak', () => {
    const h = hitungNetoLengkap({
      bruto: 10_000_000, retensiPct: 5, potonganKasbon: 0, backCharge: -1,
    })
    expect(h.ok).toBe(false)
    expect(h.galat).toMatch(/tidak sah/i)
  })

  it('persen retensi rusak tetap ditolak — lib retensi yang menjaganya', () => {
    const h = hitungNetoLengkap({
      bruto: 10_000_000, retensiPct: 150, potonganKasbon: 0, backCharge: 0,
    })
    expect(h.ok).toBe(false)
  })

  it('back-charge nol tak mengubah apa pun', () => {
    const tanpa = hitungNetoLengkap({ bruto: 10_000_000, retensiPct: 5, potonganKasbon: 500_000, backCharge: 0 })
    expect(tanpa.ok).toBe(true)
    expect(tanpa.neto).toBe(9_000_000)
  })

  it('pecahan sen tetap konsisten', () => {
    const h = hitungNetoLengkap({
      bruto: 0.3, retensiPct: 10, potonganKasbon: 0.1, backCharge: 0.1,
    })
    expect(h.ok).toBe(true)
    // 0.3 − 0.03 − 0.2 = 0.07; tanpa pembulatan hasilnya 0.06999999999999998
    expect(h.neto).toBe(0.07)
  })
})

describe('periksaSetujuBackCharge — SoD', () => {
  it('pengaju tak boleh menyetujui sendiri', () => {
    const h = periksaSetujuBackCharge({ status: 'diajukan', pengajuId: 'u1', penyetujuId: 'u1' })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tak bisa menyetujuinya sendiri/i)
  })

  it('orang lain boleh', () => {
    const h = periksaSetujuBackCharge({ status: 'diajukan', pengajuId: 'u1', penyetujuId: 'u2' })
    expect(h.boleh).toBe(true)
  })

  it('status selain `diajukan` ditolak, dengan menyebut statusnya', () => {
    for (const st of ['disetujui', 'dipotong', 'dibatalkan']) {
      const h = periksaSetujuBackCharge({ status: st, pengajuId: 'u1', penyetujuId: 'u2' })
      expect(h.boleh, st).toBe(false)
      if (!h.boleh) expect(h.sebab).toContain(st)
    }
  })
})
