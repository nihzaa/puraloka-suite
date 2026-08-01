import { describe, it, expect } from 'vitest'
import {
  periodeKe, bebanPeriode, jadwalSusut, nilaiBuku,
  hitungUtilisasi, biayaSewa,
  type AsetSusut,
} from '../aset'

// Penyusutan adalah angka yang masuk ke BIAYA PROYEK dan (setelah GL) ke jurnal.
// Salah sedikit ia tak berbunyi: tak ada error, hanya nilai buku yang menyimpang
// perlahan dan laporan yang tetap terlihat wajar. Yang diuji di sini bukan
// "rumusnya jalan", melainkan pagar-pagar yang menahan angka mustahil.

const aset = (o: Partial<AsetSusut> = {}): AsetSusut => ({
  hargaPerolehan: 60_000_000,
  nilaiResidu: 0,
  umurBulan: 60,
  metode: 'garis_lurus',
  tanggalPerolehan: '2026-01-15',
  ...o,
})

describe('periodeKe — bulan perolehan = periode 1', () => {
  it('bulan perolehan itu sendiri = 1, bukan 0', () => {
    // Kalau bulan perolehan dihitung 0, seluruh jadwal bergeser satu bulan dan
    // baris terakhir jatuh di luar umur ekonomis.
    expect(periodeKe('2026-01-15', 2026, 1)).toBe(1)
  })
  it('lintas tahun dihitung benar', () => {
    expect(periodeKe('2026-01-15', 2027, 1)).toBe(13)
    expect(periodeKe('2026-11-01', 2027, 2)).toBe(4)
  })
  it('sebelum perolehan → nol/negatif', () => {
    expect(periodeKe('2026-06-01', 2026, 5)).toBe(0)
  })
})

describe('garis lurus', () => {
  it('beban bulanan = (harga - residu) / umur', () => {
    expect(bebanPeriode(aset(), 2026, 1)).toBe(1_000_000)
  })

  it('residu mengurangi dasar susut, bukan diabaikan', () => {
    // 60jt - 12jt = 48jt / 60 = 800rb. Kalau residu diabaikan → 1jt (salah 25%).
    expect(bebanPeriode(aset({ nilaiResidu: 12_000_000 }), 2026, 1)).toBe(800_000)
  })

  it('di luar masa manfaat → 0, tidak melempar error', () => {
    // Penjadwal bulanan memanggil ini untuk SEMUA aset termasuk yang lunas.
    expect(bebanPeriode(aset(), 2031, 2)).toBe(0)   // periode 62 > 60
    expect(bebanPeriode(aset(), 2025, 12)).toBe(0)  // sebelum perolehan
  })

  it('jadwal berhenti PERSIS di nilai residu, tak menembus', () => {
    const j = jadwalSusut(aset({ nilaiResidu: 12_000_000 }))
    expect(j).toHaveLength(60)
    expect(j[59].nilaiBukuSesudah).toBe(12_000_000)
    expect(j[59].akumulasi).toBe(48_000_000)
  })

  it('pembulatan yang menumpuk TIDAK membuat baris terakhir menembus residu', () => {
    // 10.000.000 / 7 = 1.428.571,43 → dibulatkan tiap bulan, 7× akan meleset.
    // Tanpa pagar di baris terakhir, nilai buku jadi negatif beberapa rupiah —
    // dan nilai buku negatif adalah angka yang mustahil dipertanggungjawabkan.
    const j = jadwalSusut(aset({ hargaPerolehan: 10_000_000, umurBulan: 7, nilaiResidu: 0 }))
    expect(j[6].nilaiBukuSesudah).toBe(0)
    expect(j.reduce((s, b) => s + b.beban, 0)).toBe(10_000_000)
  })
})

describe('saldo menurun ganda', () => {
  it('beban mengecil tiap periode', () => {
    const a = aset({ metode: 'saldo_menurun', umurBulan: 60 })
    const b1 = bebanPeriode(a, 2026, 1)
    const b2 = bebanPeriode(a, 2026, 2)
    expect(b1).toBeGreaterThan(b2)
    expect(b1).toBe(2_000_000)   // 60jt × (2/60)
  })

  it('tak pernah menembus residu', () => {
    const j = jadwalSusut(aset({ metode: 'saldo_menurun', nilaiResidu: 5_000_000 }))
    expect(j.every((b) => b.nilaiBukuSesudah >= 5_000_000)).toBe(true)
    expect(j.every((b) => b.beban >= 0)).toBe(true)
  })

  it('metode ikut tersimpan di tiap baris (snapshot)', () => {
    // Mengubah metode aset TIDAK boleh menulis ulang sejarah — tiap baris log
    // membawa metode yang berlaku saat ia dicatat.
    const j = jadwalSusut(aset({ metode: 'saldo_menurun' }))
    expect(j[0].metode).toBe('saldo_menurun')
  })
})

describe('kasus batas penyusutan', () => {
  it('harga ≤ residu → tak menyusut sama sekali', () => {
    const a = aset({ hargaPerolehan: 5_000_000, nilaiResidu: 5_000_000 })
    expect(bebanPeriode(a, 2026, 1)).toBe(0)
    expect(jadwalSusut(a).every((b) => b.beban === 0)).toBe(true)
  })

  it('nilai buku sebelum perolehan = harga penuh', () => {
    expect(nilaiBuku(aset(), 2025, 12)).toBe(60_000_000)
  })

  it('nilai buku setelah umur habis = residu, tidak terus turun', () => {
    expect(nilaiBuku(aset({ nilaiResidu: 12_000_000 }), 2035, 1)).toBe(12_000_000)
  })
})

describe('utilisasi', () => {
  const rentang = { dari: '2026-01-01', sampai: '2026-01-31' }

  it('menghitung persentase hari terpakai', () => {
    const r = hitungUtilisasi([{ mulai: '2026-01-01', selesai: '2026-01-16' }], rentang)
    expect(r.hariTerpakai).toBe(15)
    expect(r.hariTersedia).toBe(30)
    expect(r.utilisasiPct).toBe(50)
  })

  it('periode TUMPANG TINDIH dihitung sekali, bukan dijumlahkan', () => {
    // Satu alat tercatat dua kali di hari yang sama akan menghasilkan >100% —
    // angka mustahil yang langsung meruntuhkan kepercayaan seluruh laporan.
    const r = hitungUtilisasi([
      { mulai: '2026-01-01', selesai: '2026-01-21' },
      { mulai: '2026-01-11', selesai: '2026-01-31' },
    ], rentang)
    expect(r.hariTerpakai).toBe(30)
    expect(r.utilisasiPct).toBe(100)
    expect(r.utilisasiPct).toBeLessThanOrEqual(100)
  })

  it('sewa yang masih BERJALAN dihitung sampai akhir rentang', () => {
    const r = hitungUtilisasi([{ mulai: '2026-01-16', selesai: null }], rentang)
    expect(r.hariTerpakai).toBe(15)
  })

  it('belum tersedia → null, BUKAN 0%', () => {
    // 0% terbaca "alat menganggur total" dan memicu keputusan menjual alat yang
    // sebenarnya baru dibeli. Yang benar: belum bisa dinilai.
    const r = hitungUtilisasi([], rentang, '2026-06-01')
    expect(r.utilisasiPct).toBeNull()
    expect(r.hariTersedia).toBe(0)
  })

  it('aset yang baru tersedia di tengah rentang → penyebutnya ikut menyusut', () => {
    const r = hitungUtilisasi(
      [{ mulai: '2026-01-16', selesai: '2026-01-31' }],
      rentang,
      '2026-01-16',
    )
    expect(r.hariTersedia).toBe(15)
    expect(r.utilisasiPct).toBe(100)
  })

  it('pemakaian SEBELUM aset dimiliki tak dihitung', () => {
    const r = hitungUtilisasi(
      [{ mulai: '2026-01-01', selesai: '2026-01-31' }],
      rentang,
      '2026-01-21',
    )
    expect(r.hariTerpakai).toBe(10)
    expect(r.utilisasiPct).toBe(100)
  })

  it('tanpa pemakaian → 0% dan seluruh hari menganggur', () => {
    const r = hitungUtilisasi([], rentang)
    expect(r.utilisasiPct).toBe(0)
    expect(r.hariMenganggur).toBe(30)
  })
})

describe('biaya sewa', () => {
  it('harian dihitung apa adanya', () => {
    expect(biayaSewa({ tarif: 150_000, satuan: 'hari', mulai: '2026-01-01', selesai: '2026-01-11' }, '2026-02-01'))
      .toBe(1_500_000)
  })

  it('mingguan DIBULATKAN KE ATAS — 8 hari dibayar 2 minggu', () => {
    // Begitulah tagihan sewa alat bekerja. Membaginya jadi 1,14 minggu membuat
    // biaya tercatat lebih kecil dari tagihan yang benar-benar dibayar.
    expect(biayaSewa({ tarif: 900_000, satuan: 'minggu', mulai: '2026-01-01', selesai: '2026-01-09' }, '2026-02-01'))
      .toBe(1_800_000)
  })

  it('bulanan dibulatkan ke atas juga', () => {
    expect(biayaSewa({ tarif: 3_000_000, satuan: 'bulan', mulai: '2026-01-01', selesai: '2026-02-05' }, '2026-03-01'))
      .toBe(6_000_000)
  })

  it('sewa BERJALAN dihitung sampai tanggal acuan', () => {
    // Biaya yang sedang berjalan harus sudah terlihat — bukan muncul mendadak
    // saat sewanya diakhiri.
    expect(biayaSewa({ tarif: 100_000, satuan: 'hari', mulai: '2026-01-01', selesai: null }, '2026-01-11'))
      .toBe(1_000_000)
  })

  it('sewa yang selesai SESUDAH tanggal acuan dipotong di acuan', () => {
    expect(biayaSewa({ tarif: 100_000, satuan: 'hari', mulai: '2026-01-01', selesai: '2026-03-01' }, '2026-01-11'))
      .toBe(1_000_000)
  })

  it('rentang nol/terbalik → 0, bukan negatif', () => {
    expect(biayaSewa({ tarif: 100_000, satuan: 'hari', mulai: '2026-01-11', selesai: '2026-01-01' }, '2026-02-01'))
      .toBe(0)
  })
})
