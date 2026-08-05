import { describe, it, expect } from 'vitest'
import { hitungNeraca, hitungLabaRugi, type SaldoAkun } from './laporan-keuangan.js'

/**
 * Test neraca & laba-rugi.
 *
 * Yang dijaga di sini bukan "fungsinya jalan" — melainkan INVARIAN yang
 * kalau bocor menghasilkan laporan keuangan yang salah tanpa satu pun galat:
 *
 *   1. aset = liabilitas + ekuitas + laba berjalan
 *   2. laba berjalan di neraca = laba bersih di laba-rugi
 *   3. tanda saldo mengikuti arah normal tipe akun
 *
 * Cacat pada ketiganya terlihat masuk akal di layar. Itu sebabnya mereka
 * diuji, bukan dipercaya.
 */

const akun = (
  code: string, name: string, type: string, saldo: number,
): SaldoAkun => ({
  account_id: `id-${code}`,
  code, name, type,
  // debit/credit tak dipakai perhitungan laporan — hanya `saldo` yang
  // sudah bertanda. Diisi agar bentuknya utuh.
  debit: saldo > 0 ? saldo : 0,
  credit: saldo < 0 ? -saldo : 0,
  saldo,
})

/** Satu set pembukuan sederhana yang SEIMBANG. */
const PEMBUKUAN: SaldoAkun[] = [
  akun('1100', 'Kas', 'asset', 150_000_000),
  akun('1200', 'Piutang Usaha', 'asset', 120_000_000),
  akun('2100', 'Utang Usaha', 'liability', 40_000_000),
  akun('3100', 'Modal Disetor', 'equity', 100_000_000),
  akun('4100', 'Pendapatan Kontrak', 'revenue', 200_000_000),
  akun('5100', 'Beban Upah Mandor', 'expense', 45_000_000),
  akun('5200', 'Beban Material', 'expense', 20_000_000),
  akun('6100', 'Beban Operasional', 'expense', 5_000_000),
]
// aset 270jt · liabilitas 40jt · ekuitas 100jt
// laba = 200 − (45+20+5) = 130jt
// 40 + 100 + 130 = 270 ✓

describe('hitungLabaRugi', () => {
  it('laba bersih = pendapatan − seluruh beban', () => {
    const lr = hitungLabaRugi(PEMBUKUAN)
    expect(lr.pendapatan.total).toBe(200_000_000)
    expect(lr.beban.total).toBe(70_000_000)
    expect(lr.labaBersih).toBe(130_000_000)
  })

  it('laba kotor memisahkan harga pokok (5xxx) dari beban operasional (6xxx)', () => {
    const lr = hitungLabaRugi(PEMBUKUAN)
    // HPP = 45 + 20 = 65jt → laba kotor 200 − 65 = 135jt
    expect(lr.labaKotor).toBe(135_000_000)
    // Selisih laba kotor dan bersih = beban operasional.
    expect(lr.labaKotor - lr.labaBersih).toBe(5_000_000)
  })

  it('margin dihitung terhadap pendapatan, satu desimal', () => {
    const lr = hitungLabaRugi(PEMBUKUAN)
    expect(lr.marginPct).toBe(65) // 130/200
  })

  it('margin null saat belum ada pendapatan — bukan 0, bukan NaN', () => {
    // 0% berarti "impas"; null berarti "belum bisa dihitung". Menampilkan
    // 0% pada perusahaan yang belum menagih adalah kabar yang salah.
    const lr = hitungLabaRugi([akun('5100', 'Beban', 'expense', 10_000_000)])
    expect(lr.marginPct).toBeNull()
    expect(lr.labaBersih).toBe(-10_000_000)
  })

  it('akun bersaldo nol tidak muncul di daftar', () => {
    const lr = hitungLabaRugi([
      ...PEMBUKUAN,
      akun('4900', 'Pendapatan Lain (kosong)', 'revenue', 0),
    ])
    expect(lr.pendapatan.akun.find((a) => a.code === '4900')).toBeUndefined()
    expect(lr.pendapatan.total).toBe(200_000_000)
  })

  it('bagan akun tanpa pola 5xxx: laba kotor = laba bersih, bukan menebak', () => {
    const lain: SaldoAkun[] = [
      akun('4000', 'Pendapatan', 'revenue', 100_000_000),
      akun('8100', 'Beban Apa Saja', 'expense', 30_000_000),
    ]
    const lr = hitungLabaRugi(lain)
    expect(lr.labaKotor).toBe(100_000_000)   // tak ada 5xxx → HPP 0
    expect(lr.labaBersih).toBe(70_000_000)
  })
})

describe('hitungNeraca', () => {
  it('seimbang: aset = liabilitas + ekuitas + laba berjalan', () => {
    const n = hitungNeraca(PEMBUKUAN)
    expect(n.aset.total).toBe(270_000_000)
    expect(n.liabilitas.total).toBe(40_000_000)
    expect(n.ekuitas.total).toBe(100_000_000)
    expect(n.labaBerjalan).toBe(130_000_000)
    expect(n.totalEkuitasDenganLaba).toBe(230_000_000)
    expect(n.selisih).toBe(0)
    expect(n.seimbang).toBe(true)
  })

  it('laba berjalan di neraca SAMA dengan laba bersih di laba-rugi', () => {
    // Invarian yang paling mudah bocor kalau keduanya dihitung dari jalur
    // berbeda — dan kalau bocor, tak ada yang tahu mana yang benar.
    const n = hitungNeraca(PEMBUKUAN)
    const lr = hitungLabaRugi(PEMBUKUAN)
    expect(n.labaBerjalan).toBe(lr.labaBersih)
  })

  it('ketidakseimbangan DILAPORKAN, bukan disamarkan', () => {
    // Satu aset yang tak punya lawan — jurnal tak seimbang.
    const bocor = [...PEMBUKUAN, akun('1300', 'Aset Menggantung', 'asset', 7_000_000)]
    const n = hitungNeraca(bocor)
    expect(n.seimbang).toBe(false)
    expect(n.selisih).toBe(7_000_000)
  })

  it('toleransi hanya untuk pembulatan sen, bukan untuk selisih nyata', () => {
    const sen = [...PEMBUKUAN, akun('1301', 'Selisih Sen', 'asset', 0.004)]
    expect(hitungNeraca(sen).seimbang).toBe(true)

    const seribu = [...PEMBUKUAN, akun('1302', 'Selisih Ribu', 'asset', 1_000)]
    expect(hitungNeraca(seribu).seimbang).toBe(false)
  })

  it('rugi berjalan mengurangi ekuitas', () => {
    const rugi: SaldoAkun[] = [
      akun('1100', 'Kas', 'asset', 60_000_000),
      akun('3100', 'Modal', 'equity', 100_000_000),
      akun('4100', 'Pendapatan', 'revenue', 10_000_000),
      akun('5100', 'Beban', 'expense', 50_000_000),
    ]
    const n = hitungNeraca(rugi)
    expect(n.labaBerjalan).toBe(-40_000_000)
    expect(n.totalEkuitasDenganLaba).toBe(60_000_000)
    expect(n.seimbang).toBe(true)
  })

  it('akun diurutkan menurut kode, bukan urutan masuk', () => {
    const acak = [
      akun('1300', 'Persediaan', 'asset', 10_000_000),
      akun('1100', 'Kas', 'asset', 20_000_000),
      akun('1200', 'Piutang', 'asset', 30_000_000),
    ]
    expect(hitungNeraca(acak).aset.akun.map((a) => a.code))
      .toEqual(['1100', '1200', '1300'])
  })

  it('pembukuan kosong: semua nol, dan tetap dinyatakan seimbang', () => {
    const n = hitungNeraca([])
    expect(n.aset.total).toBe(0)
    expect(n.labaBerjalan).toBe(0)
    expect(n.seimbang).toBe(true)
    expect(n.aset.akun).toEqual([])
  })
})
