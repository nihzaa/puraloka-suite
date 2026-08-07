import { describe, it, expect } from 'vitest'
import {
  nilaiBaris, usulkanPencocokan, hitungLaporan, sidikBaris, TOLERANSI_HARI,
  type BarisKoran, type TransaksiBuku,
} from '../rekonsiliasi-bank'

const baris = (o: Partial<BarisKoran> & { id: string }): BarisKoran => ({
  tanggal: '2026-03-05', keterangan: 'Transfer', debit: 0, kredit: 0, ...o,
})
const trx = (o: Partial<TransaksiBuku> & { id: string }): TransaksiBuku => ({
  sumber: 'payments', tanggal: '2026-03-05', nominal: 0, keterangan: '', ...o,
})

describe('nilaiBaris', () => {
  it('kredit = uang MASUK, bernilai positif dari sudut buku', () => {
    expect(nilaiBaris(baris({ id: 'a', kredit: 1_000_000 }))).toBe(1_000_000)
  })

  it('debit = uang KELUAR, bernilai negatif', () => {
    expect(nilaiBaris(baris({ id: 'a', debit: 750_000 }))).toBe(-750_000)
  })

  // Postgres NUMERIC tiba sebagai string, dan `+` pada string MENGGABUNG.
  it('menangani NUMERIC yang tiba sebagai string', () => {
    expect(nilaiBaris(baris({ id: 'a', kredit: '1000000', debit: '250000' }))).toBe(750_000)
  })
})

describe('usulkanPencocokan', () => {
  it('mencocokkan nominal & tanggal yang sama persis', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 5_000_000, tanggal: '2026-03-10' })],
      [trx({ id: 't1', nominal: 5_000_000, tanggal: '2026-03-10' })],
    )
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({ baris_id: 'b1', sumber_id: 't1', keyakinan: 'persis', selisih_hari: 0 })
  })

  it('mencocokkan tanggal berbeda dalam toleransi — transfer antar bank butuh 1-3 hari', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 5_000_000, tanggal: '2026-03-12' })],
      [trx({ id: 't1', nominal: 5_000_000, tanggal: '2026-03-10' })],
    )
    expect(u[0]).toMatchObject({ keyakinan: 'dekat', selisih_hari: 2 })
  })

  it('TIDAK mencocokkan di luar toleransi', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 5_000_000, tanggal: '2026-03-20' })],
      [trx({ id: 't1', nominal: 5_000_000, tanggal: '2026-03-10' })],
    )
    expect(u).toHaveLength(0)
  })

  // Inilah aturan yang paling menentukan: toleransi HANYA pada tanggal.
  it('TIDAK PERNAH mencocokkan nominal yang berbeda, sedekat apa pun', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 5_000_001 })],
      [trx({ id: 't1', nominal: 5_000_000 })],
    )
    expect(u).toHaveLength(0)
  })

  // Kalau `dekat` diambil lebih dulu, pasangan persis bisa "dicuri" dan
  // menyisakan dua baris tak cocok yang sebenarnya punya pasangan.
  it('mendahulukan kecocokan PERSIS sebelum yang dekat', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 1_000_000, tanggal: '2026-03-10' })],
      [
        trx({ id: 't-dekat', nominal: 1_000_000, tanggal: '2026-03-08' }),
        trx({ id: 't-persis', nominal: 1_000_000, tanggal: '2026-03-10' }),
      ],
    )
    expect(u).toHaveLength(1)
    expect(u[0].sumber_id).toBe('t-persis')
  })

  it('satu transaksi buku tak diusulkan untuk dua baris koran', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 2_000_000 }), baris({ id: 'b2', kredit: 2_000_000 })],
      [trx({ id: 't1', nominal: 2_000_000 })],
    )
    expect(u).toHaveLength(1)
  })

  it('melewati yang sudah dicocokkan sebelumnya', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 2_000_000, sudah_cocok: true })],
      [trx({ id: 't1', nominal: 2_000_000 })],
    )
    expect(u).toHaveLength(0)
  })

  it('mencocokkan pengeluaran (debit koran ↔ nominal negatif buku)', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', debit: 3_000_000 })],
      [trx({ id: 't1', nominal: -3_000_000, sumber: 'supplier_payments' })],
    )
    expect(u).toHaveLength(1)
    expect(u[0].sumber).toBe('supplier_payments')
  })

  it('toleransi terpakai tepat di batasnya', () => {
    const u = usulkanPencocokan(
      [baris({ id: 'b1', kredit: 100, tanggal: '2026-03-13' })],
      [trx({ id: 't1', nominal: 100, tanggal: '2026-03-10' })],
    )
    expect(u).toHaveLength(1)
    expect(u[0].selisih_hari).toBe(TOLERANSI_HARI)
  })
})

describe('hitungLaporan', () => {
  it('laporan empat baris: bank + setoran − cek ± penyesuaian = buku', () => {
    const l = hitungLaporan(
      12_000_000, 13_485_000,
      [baris({ id: 'b1', kredit: 1, sudah_cocok: true })],
      [
        trx({ id: 't1', nominal: 2_000_000 }),   // setoran dalam perjalanan
        trx({ id: 't2', nominal: -500_000 }),    // cek beredar
      ],
      [{ jenis: 'biaya_admin', nominal: -15_000 }],
    )
    expect(l.setoran_dalam_perjalanan).toBe(2_000_000)
    expect(l.cek_beredar).toBe(500_000)
    expect(l.penyesuaian).toBe(-15_000)
    expect(l.saldo_buku_seharusnya).toBe(13_485_000)
    expect(l.selisih).toBe(0)
    expect(l.tuntas).toBe(true)
  })

  // Setoran dan cek DIPISAH, bukan dijumlahkan jadi satu angka bersih:
  // angka bersih benar secara aritmetika tapi tak bisa dijelaskan ke siapa pun.
  it('memisahkan setoran dari cek, bukan menjumlahkannya', () => {
    const l = hitungLaporan(0, 0, [], [
      trx({ id: 'a', nominal: 1_000_000 }),
      trx({ id: 'b', nominal: -1_000_000 }),
    ])
    expect(l.setoran_dalam_perjalanan).toBe(1_000_000)
    expect(l.cek_beredar).toBe(1_000_000)
    expect(l.saldo_buku_seharusnya).toBe(0)
  })

  it('selisih TIDAK disembunyikan — itu pertanyaan yang belum terjawab', () => {
    const l = hitungLaporan(10_000_000, 9_500_000, [], [])
    expect(l.selisih).toBe(500_000)
    expect(l.tuntas).toBe(false)
  })

  // Baris koran yang belum cocok berarti ada uang bergerak di rekening yang
  // tak punya catatan — itu tak tuntas meski angkanya kebetulan pas.
  it('TIDAK tuntas selama masih ada baris koran tanpa pasangan', () => {
    const l = hitungLaporan(1_000_000, 1_000_000,
      [baris({ id: 'b1', kredit: 50_000 })], [])
    expect(l.selisih).toBe(0)
    expect(l.tuntas).toBe(false)
    expect(l.baris_belum_cocok).toBe(1)
  })

  it('menangani saldo NUMERIC yang tiba sebagai string', () => {
    const l = hitungLaporan('12000000', '12000000', [], [])
    expect(l.saldo_bank).toBe(12_000_000)
    expect(l.selisih).toBe(0)
  })

  it('sen dari pembagian tak membuat rekonsiliasi terlihat gagal', () => {
    const l = hitungLaporan(1_000_000.004, 1_000_000, [], [])
    expect(l.selisih).toBe(0)
    expect(l.tuntas).toBe(true)
  })
})

describe('sidikBaris', () => {
  it('berkas yang sama menghasilkan sidik yang sama', () => {
    const a = sidikBaris('2026-03-05', 'Transfer masuk', 0, 1_000_000, 1)
    const b = sidikBaris('2026-03-05', 'Transfer masuk', 0, 1_000_000, 1)
    expect(a).toBe(b)
  })

  it('spasi & huruf besar-kecil tak mengubah sidik', () => {
    expect(sidikBaris('2026-03-05', '  TRANSFER   MASUK ', 0, 1000, 1))
      .toBe(sidikBaris('2026-03-05', 'transfer masuk', 0, 1000, 1))
  })

  // Dua biaya admin Rp 6.500 di hari yang sama benar-benar terjadi.
  it('dua baris identik di koran yang sama tetap berbeda lewat urutan', () => {
    expect(sidikBaris('2026-03-05', 'Biaya admin', 6_500, 0, 1))
      .not.toBe(sidikBaris('2026-03-05', 'Biaya admin', 6_500, 0, 2))
  })

  it('nominal berbeda menghasilkan sidik berbeda', () => {
    expect(sidikBaris('2026-03-05', 'X', 0, 1000, 1))
      .not.toBe(sidikBaris('2026-03-05', 'X', 0, 1001, 1))
  })
})
