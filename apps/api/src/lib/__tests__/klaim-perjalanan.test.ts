/**
 * G1 — aturan klaim perjalanan. MURNI, tanpa basis.
 */
import { describe, it, expect } from 'vitest'
import {
  validasiItem, periksaTransisiKlaim, ringkasKlaim, lamaPerjalanan,
  AMBANG_BUKTI_DEFAULT,
  type ItemKlaim, type RingkasKlaim,
} from '../klaim-perjalanan.js'

const RENTANG = { berangkat: '2026-08-01', kembali: '2026-08-03' }

const it1 = (o: Partial<ItemKlaim> = {}): ItemKlaim => ({
  jenis: 'transport', uraian: 'Tiket kereta', tanggal: '2026-08-01', nominal: 50_000, ...o,
})

describe('validasi rincian', () => {
  it('rincian sah menghasilkan total', () => {
    const v = validasiItem([it1(), it1({ nominal: 30_000 })], RENTANG)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.total).toBe(80_000)
  })

  it('klaim tanpa rincian ditolak', () => {
    expect(validasiItem([], RENTANG).ok).toBe(false)
    expect(validasiItem(undefined, RENTANG).ok).toBe(false)
  })

  it('jenis tak dikenal ditolak dan menyebut nomornya', () => {
    const v = validasiItem([it1({ jenis: 'pesawat_pribadi' })], RENTANG)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/Rincian 1/)
  })

  it('tanggal DI LUAR rentang perjalanan ditolak', () => {
    // Biaya di luar rentang milik perjalanan lain — atau tak ada perjalanannya.
    const v = validasiItem([it1({ tanggal: '2026-07-28' })], RENTANG)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/di luar rentang/i)
  })

  it('tanggal di TEPI rentang diterima', () => {
    expect(validasiItem([it1({ tanggal: '2026-08-01' })], RENTANG).ok).toBe(true)
    expect(validasiItem([it1({ tanggal: '2026-08-03' })], RENTANG).ok).toBe(true)
  })

  it('nominal kosong ("") ditolak, BUKAN diperlakukan nol', () => {
    // `Number('') === 0` — kalau kosong lolos jadi nol, ia ditolak CHECK basis
    // dengan pesan yang membicarakan hal lain.
    const v = validasiItem([it1({ nominal: '' })], RENTANG)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.galat).toMatch(/wajib diisi/i)
  })

  it('nominal nol dan negatif ditolak', () => {
    expect(validasiItem([it1({ nominal: 0 })], RENTANG).ok).toBe(false)
    expect(validasiItem([it1({ nominal: -1 })], RENTANG).ok).toBe(false)
  })

  it('nominal string angka diterima — form mengirimnya begitu', () => {
    const v = validasiItem([it1({ nominal: '75000' })], RENTANG)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.total).toBe(75_000)
  })

  it(`bukti WAJIB di ${AMBANG_BUKTI_DEFAULT} ke atas`, () => {
    const tanpa = validasiItem([it1({ nominal: AMBANG_BUKTI_DEFAULT })], RENTANG)
    expect(tanpa.ok).toBe(false)
    if (!tanpa.ok) expect(tanpa.galat).toMatch(/bukti wajib/i)

    const dengan = validasiItem(
      [it1({ nominal: AMBANG_BUKTI_DEFAULT, bukti_url: 'kuitansi.jpg' })], RENTANG)
    expect(dengan.ok).toBe(true)
  })

  it('DI BAWAH ambang, bukti tidak wajib — parkir Rp 5.000 nyata adanya', () => {
    const v = validasiItem([it1({ nominal: AMBANG_BUKTI_DEFAULT - 1 })], RENTANG)
    expect(v.ok).toBe(true)
  })

  it('ambang bisa disetel tenant', () => {
    // Kebijakan tenant, bukan konstanta yang mengikat semua orang.
    const v = validasiItem([it1({ nominal: 60_000 })], RENTANG, 50_000)
    expect(v.ok).toBe(false)
  })

  it('bukti berisi spasi saja TIDAK dihitung sebagai bukti', () => {
    const v = validasiItem(
      [it1({ nominal: AMBANG_BUKTI_DEFAULT, bukti_url: '   ' })], RENTANG)
    expect(v.ok).toBe(false)
  })

  it('uraian dipangkas spasi tepinya', () => {
    const v = validasiItem([it1({ uraian: '  Tol Cipularang  ' })], RENTANG)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.nilai[0].uraian).toBe('Tol Cipularang')
  })
})

describe('transisi status', () => {
  const dasar = { statusSekarang: 'diajukan' as const, totalDiajukan: 500_000 }

  it('diajukan → disetujui dengan nominal yang sah', () => {
    const h = periksaTransisiKlaim({ ...dasar, statusTujuan: 'disetujui', totalDisetujui: 400_000 })
    expect(h.boleh).toBe(true)
  })

  it('disetujui MELEBIHI diajukan ditolak', () => {
    const h = periksaTransisiKlaim({ ...dasar, statusTujuan: 'disetujui', totalDisetujui: 600_000 })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tak boleh menambah/i)
  })

  it('menyetujui Rp 0 ditolak — itu penolakan yang tak beralasan', () => {
    const h = periksaTransisiKlaim({ ...dasar, statusTujuan: 'disetujui', totalDisetujui: 0 })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/tolak klaimnya/i)
  })

  it('menyetujui tanpa menentukan nominal ditolak', () => {
    expect(periksaTransisiKlaim({ ...dasar, statusTujuan: 'disetujui' }).boleh).toBe(false)
    expect(periksaTransisiKlaim({
      ...dasar, statusTujuan: 'disetujui', totalDisetujui: NaN,
    }).boleh).toBe(false)
  })

  it('penolakan wajib beralasan', () => {
    expect(periksaTransisiKlaim({ ...dasar, statusTujuan: 'ditolak' }).boleh).toBe(false)
    expect(periksaTransisiKlaim({
      ...dasar, statusTujuan: 'ditolak', alasanTolak: '   ',
    }).boleh).toBe(false)
    expect(periksaTransisiKlaim({
      ...dasar, statusTujuan: 'ditolak', alasanTolak: 'Di luar kebijakan perjalanan',
    }).boleh).toBe(true)
  })

  it('membayar menuntut akun kas', () => {
    const tanpa = periksaTransisiKlaim({
      statusSekarang: 'disetujui', statusTujuan: 'dibayar', totalDiajukan: 500_000,
    })
    expect(tanpa.boleh).toBe(false)
    if (!tanpa.boleh) expect(tanpa.sebab).toMatch(/direkonsiliasi/i)

    const dengan = periksaTransisiKlaim({
      statusSekarang: 'disetujui', statusTujuan: 'dibayar',
      totalDiajukan: 500_000, adaAkunKas: true,
    })
    expect(dengan.boleh).toBe(true)
  })

  it('membayar yang BELUM disetujui ditolak', () => {
    const h = periksaTransisiKlaim({
      ...dasar, statusTujuan: 'dibayar', adaAkunKas: true,
    })
    expect(h.boleh).toBe(false)
  })

  it('yang sudah DIBAYAR tak bisa diapa-apakan', () => {
    const h = periksaTransisiKlaim({
      statusSekarang: 'dibayar', statusTujuan: 'ditolak',
      totalDiajukan: 500_000, alasanTolak: 'salah',
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/uangnya sudah keluar/i)
  })

  it('yang DITOLAK tak bisa dihidupkan kembali', () => {
    const h = periksaTransisiKlaim({
      statusSekarang: 'ditolak', statusTujuan: 'disetujui',
      totalDiajukan: 500_000, totalDisetujui: 100_000,
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/ajukan klaim baru/i)
  })

  it('tak bisa kembali ke diajukan', () => {
    const h = periksaTransisiKlaim({
      statusSekarang: 'disetujui', statusTujuan: 'diajukan', totalDiajukan: 500_000,
    })
    expect(h.boleh).toBe(false)
  })
})

describe('ringkasan', () => {
  const k = (o: Partial<RingkasKlaim>): RingkasKlaim => ({
    status: 'diajukan', total_diajukan: 100_000, total_disetujui: null, ...o,
  })

  it('memisahkan menunggu, utang, dan yang sudah dibayar', () => {
    const r = ringkasKlaim([
      k({ status: 'diajukan', total_diajukan: 100_000 }),
      k({ status: 'disetujui', total_diajukan: 200_000, total_disetujui: 150_000 }),
      k({ status: 'dibayar', total_diajukan: 300_000, total_disetujui: 300_000 }),
    ])
    expect(r.menunggu).toBe(100_000)
    expect(r.utang).toBe(150_000)
    expect(r.dibayar).toBe(300_000)
  })

  it('UTANG memakai yang DISETUJUI, bukan yang diajukan', () => {
    // Selisihnya justru bagian yang ditolak penyetuju — memakai yang diajukan
    // membuat utang terlihat lebih besar daripada yang disepakati.
    const r = ringkasKlaim([
      k({ status: 'disetujui', total_diajukan: 500_000, total_disetujui: 200_000 }),
    ])
    expect(r.utang).toBe(200_000)
  })

  it('yang DITOLAK tak dihitung ke mana pun', () => {
    const r = ringkasKlaim([
      k({ status: 'ditolak', total_diajukan: 900_000, total_disetujui: null }),
    ])
    expect(r.menunggu).toBe(0)
    expect(r.utang).toBe(0)
    expect(r.dibayar).toBe(0)
  })

  it('numeric bertipe string (dari pg) tetap terjumlah', () => {
    // `'100' + '200'` menghasilkan '100200' kalau tak dikonversi.
    const r = ringkasKlaim([
      k({ status: 'diajukan', total_diajukan: '100000' }),
      k({ status: 'diajukan', total_diajukan: '200000' }),
    ])
    expect(r.menunggu).toBe(300_000)
    expect(r.jumlahMenunggu).toBe(2)
  })

  it('daftar kosong menghasilkan nol, tidak melempar', () => {
    const r = ringkasKlaim([])
    expect(r).toEqual({ menunggu: 0, utang: 0, dibayar: 0, jumlahMenunggu: 0, jumlahUtang: 0 })
  })

  it('disetujui bernilai null diperlakukan nol, bukan NaN', () => {
    const r = ringkasKlaim([k({ status: 'disetujui', total_disetujui: null })])
    expect(r.utang).toBe(0)
  })
})

describe('lama perjalanan', () => {
  it('sehari penuh = 1 hari, bukan 0', () => {
    // Yang menghitungnya nol akan membagi dengan nol saat mencari biaya per hari.
    expect(lamaPerjalanan('2026-08-01', '2026-08-01')).toBe(1)
  })

  it('tiga hari inklusif', () => {
    expect(lamaPerjalanan('2026-08-01', '2026-08-03')).toBe(3)
  })

  it('kembali sebelum berangkat → null', () => {
    expect(lamaPerjalanan('2026-08-05', '2026-08-01')).toBeNull()
  })

  it('tanggal tak terbaca → null, tidak melempar', () => {
    expect(lamaPerjalanan('bukan', '2026-08-01')).toBeNull()
  })
})
