import { describe, it, expect } from 'vitest'
import { rangkumBelanjaAktual, SUMBER, type BarisSumber } from '../belanja-aktual.js'

/**
 * BELANJA AKTUAL — menyatukan biaya yang tersebar di empat tabel.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08:
 *
 *   upah mingguan `paid`      43 baris   Rp 243.600.100
 *   faktur supplier            5 baris   Rp  50.485.000
 *   PO (komitmen)              8 baris   Rp  11.095.000
 *   `project_expenses`         0 baris   Rp           0   ← YANG DIPAKAI LAPORAN
 *
 * `cost-control.ts` membaca `project_expenses` untuk sisi "aktual". Tabel itu
 * **nol baris**, jadi tab Varians Biaya menampilkan "Belanja aktual Rp 0" di
 * sebelah "Commitment Rp 11.095.000" — bukan karena belum ada belanja,
 * melainkan karena **melihat ke tabel yang salah**.
 *
 * Hampir **Rp 300 juta** biaya nyata tak masuk laporan mana pun. Dan ini juga
 * yang memblokir CVR: ia membandingkan biaya terpakai vs nilai terpasang, dan
 * sisi "biaya terpakai"-nya selama ini kosong.
 *
 * ── Kenapa DIHITUNG, bukan disalin ke satu tabel
 *
 * Menyalin ke tabel ringkasan berarti angka itu bisa basi diam-diam saat satu
 * faktur disunting — dan yang paling berkepentingan menyuntingnya adalah
 * orang yang angkanya sedang buruk. Pola yang sama sudah dipakai contingency
 * ("sisa dihitung, tak disimpan") dan tabulasi RFQ.
 *
 * ── Kenapa status disaring, dan bukan sekadar dijumlah
 *
 * Upah `draft` belum disetujui siapa pun. Menghitungnya sebagai biaya membuat
 * laporan berubah setiap kali seseorang mengetik angka yang belum tentu jadi.
 * Prinsip yang sama sudah berlaku di varians: *"belanja yang masih menunggu
 * persetujuan sengaja tak dihitung, supaya angkanya tak berubah saat ditolak."*
 */

const b = (sumber: string, nilai: number | string, status: string, extra = {}): BarisSumber => ({
  sumber: sumber as BarisSumber['sumber'], nilai, status, ...extra,
})

describe('rangkumBelanjaAktual — status yang dihitung', () => {
  it('upah PAID dihitung', () => {
    const h = rangkumBelanjaAktual([b('upah', 1_000_000, 'paid')])
    expect(h.total).toBe(1_000_000)
  })

  // INVARIAN. Upah draft belum disetujui siapa pun; menghitungnya membuat
  // laporan berubah setiap kali seseorang mengetik angka yang belum tentu jadi.
  it('upah DRAFT tidak dihitung', () => {
    const h = rangkumBelanjaAktual([b('upah', 6_300_000, 'draft')])
    expect(h.total).toBe(0)
  })

  // `submitted` = diajukan, belum disetujui. Sama seperti draft untuk tujuan
  // laporan biaya — tapi DIHITUNG TERPISAH, karena ia sudah pasti akan jadi
  // biaya dan pembaca laporan berhak tahu berapa yang membayangi.
  it('upah SUBMITTED tidak masuk total, tapi dilaporkan sebagai menunggu', () => {
    const h = rangkumBelanjaAktual([b('upah', 11_200_000, 'submitted')])
    expect(h.total).toBe(0)
    expect(h.menunggu).toBe(11_200_000)
  })

  it('faktur supplier PAID dan UNPAID sama-sama dihitung', () => {
    // Faktur yang sudah terbit ADALAH biaya, terlepas sudah dibayar atau
    // belum. Yang belum dibayar tetap utang yang harus dibayar — menundanya
    // dari laporan biaya membuat proyek terlihat lebih untung daripada
    // kenyataannya, persis sampai tagihannya jatuh tempo.
    const h = rangkumBelanjaAktual([
      b('faktur', 20_000_000, 'paid'),
      b('faktur', 30_000_000, 'unpaid'),
    ])
    expect(h.total).toBe(50_000_000)
  })

  it('faktur DIBATALKAN tidak dihitung', () => {
    expect(rangkumBelanjaAktual([b('faktur', 5_000_000, 'cancelled')]).total).toBe(0)
  })

  // Gagal-tertutup: status yang belum dipertimbangkan TIDAK ikut total.
  // Status baru yang lolos diam-diam menaikkan biaya proyek tanpa ada yang
  // memutuskannya.
  it('status yang tak dikenal tidak dihitung (gagal-tertutup)', () => {
    const h = rangkumBelanjaAktual([b('upah', 9_000_000, 'entah_apa')])
    expect(h.total).toBe(0)
    expect(h.tak_dikenal).toBe(1)
  })
})

describe('rangkumBelanjaAktual — PO adalah komitmen, bukan biaya', () => {
  // Status PO memakai nilai NYATA dari basis (diukur 2026-08-08:
  // `fully_received:4 confirmed:1 draft:1 sent:1 cancelled:1`), bukan tebakan.
  // Versi pertama test ini memakai `'approved'` — yang tak pernah ada — dan
  // lulus hanya karena pustakanya menebak daftar yang sama salahnya.
  // Test dan kode yang salah dengan cara yang sama tetap hijau.

  // PEMBEDAAN INTI. PO yang sudah terbit MENGIKAT uang tapi belum
  // mengeluarkannya. Menjumlahkannya bersama biaya nyata menghitung ganda
  // begitu barangnya datang dan fakturnya terbit.
  it('PO TIDAK masuk total belanja', () => {
    const h = rangkumBelanjaAktual([b('po', 11_095_000, 'confirmed')])
    expect(h.total).toBe(0)
  })

  it('PO dilaporkan terpisah sebagai komitmen', () => {
    const h = rangkumBelanjaAktual([b('po', 11_095_000, 'confirmed')])
    expect(h.komitmen).toBe(11_095_000)
  })

  // Exposure = yang sudah keluar + yang sudah mengikat. Inilah angka yang
  // dipakai memutuskan "masih boleh belanja lagi?".
  it('exposure = belanja + komitmen', () => {
    const h = rangkumBelanjaAktual([
      b('upah', 100_000_000, 'paid'),
      b('po', 11_000_000, 'fully_received'),
    ])
    expect(h.exposure).toBe(111_000_000)
  })
})

describe('rangkumBelanjaAktual — rincian per sumber', () => {
  const contoh = [
    b('upah', 243_600_100, 'paid'),
    b('faktur', 50_485_000, 'unpaid'),
    b('po', 11_095_000, 'confirmed'),
    b('belanja', 0, 'approved'),
  ]

  // Pembaca laporan harus bisa menelusuri angkanya. "Rp 294 juta" tanpa
  // rinciannya tak bisa diperiksa siapa pun.
  it('membawa rincian per sumber, bukan hanya total', () => {
    const h = rangkumBelanjaAktual(contoh)
    expect(h.per_sumber.upah).toBe(243_600_100)
    expect(h.per_sumber.faktur).toBe(50_485_000)
  })

  it('sumber yang nol tetap muncul, bukan hilang', () => {
    // Sumber yang hilang dari rincian membuat orang mengira ia tak diperiksa.
    // Nol yang DINYATAKAN adalah jawaban; nol yang tak muncul adalah
    // pertanyaan.
    const h = rangkumBelanjaAktual(contoh)
    expect(h.per_sumber).toHaveProperty('belanja')
    expect(h.per_sumber.belanja).toBe(0)
  })

  it('daftar kosong memberi nol di semua sumber, bukan objek kosong', () => {
    const h = rangkumBelanjaAktual([])
    expect(h.total).toBe(0)
    expect(Object.keys(h.per_sumber).sort()).toEqual([...SUMBER].sort())
  })
})

describe('rangkumBelanjaAktual — angka dari Postgres', () => {
  // `numeric` tiba sebagai STRING. `"100" + "200"` menyambung jadi "100200".
  it('numeric berbentuk string dijumlah sebagai angka', () => {
    const h = rangkumBelanjaAktual([
      b('upah', '126600100.00', 'paid'),
      b('upah', '102000000.00', 'paid'),
    ])
    expect(h.total).toBe(228_600_100)
  })

  // Postgres `numeric` MENERIMA NaN — terbukti di repo ini, dan satu baris
  // NaN meracuni SUM() seluruh laporan. Baris yang tak terbaca DILEWATI dan
  // DIHITUNG, bukan diam-diam jadi nol.
  it('nilai NaN tidak meracuni total, dan dihitung sebagai baris cacat', () => {
    const h = rangkumBelanjaAktual([
      b('upah', 'NaN', 'paid'),
      b('upah', 1_000_000, 'paid'),
    ])
    expect(h.total).toBe(1_000_000)
    expect(Number.isNaN(h.total)).toBe(false)
    expect(h.nilai_cacat).toBe(1)
  })

  it('nilai yang tak terbaca sama sekali dihitung cacat', () => {
    expect(rangkumBelanjaAktual([b('upah', 'abc', 'paid')]).nilai_cacat).toBe(1)
  })

  // Nilai negatif nyata terjadi (koreksi, retur). Ia TIDAK dibuang — biaya
  // yang dikoreksi turun memang harus menurunkan total.
  it('nilai negatif diteruskan, bukan dibuang', () => {
    const h = rangkumBelanjaAktual([
      b('faktur', 10_000_000, 'paid'),
      b('faktur', -2_000_000, 'paid'),
    ])
    expect(h.total).toBe(8_000_000)
  })
})
