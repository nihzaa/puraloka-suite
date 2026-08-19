/**
 * BARANG TERTAHAN — yang diuji: kiriman yang tak sampai dan tak ditanyakan.
 *
 * Data acuan dari basis nyata 2026-08-16:
 *
 *   PO-2026-001  dalam_perjalanan · Gudang transit Cikarang · LEWAT 132 hari
 *   PO-2026-002  tertahan · Tanjung Priok · LEWAT 85 hari · dokumen impor
 *   PO-2026-003  tiba tepat pada tanggal janji
 */
import { describe, it, expect } from 'vitest'
import { nilaiKiriman } from '../barang-tertahan.js'

const K = (o: Partial<Parameters<typeof nilaiKiriman>[0]> = {}) => ({
  status: 'dalam_perjalanan', lewatHari: 132,
  sebabTertahan: null, sudahTiba: false, ...o,
})

// Ambang: tertahan 3 hari, terlambat 7 hari.
const A = [3, 7] as const

describe('nilaiKiriman', () => {
  it('PO-2026-001 apa adanya: 132 hari di gudang transit', () => {
    const h = nilaiKiriman(K(), ...A)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('terlambat')
  })

  it('PO-2026-002 apa adanya: tertahan bea cukai 85 hari', () => {
    const h = nilaiKiriman(K({
      status: 'tertahan', lewatHari: 85,
      sebabTertahan: 'Dokumen impor kurang lengkap — menunggu SNI marking dari bea cukai',
    }), ...A)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('tertahan')
  })

  it('TERTAHAN ditegur LEBIH CEPAT daripada terlambat biasa', () => {
    /*
      Berlawanan dengan dugaan pertama. Yang sebabnya DIKETAHUI justru ditegur
      duluan, karena penahanan hampir selalu administratif: dokumen yang kurang
      tak akan lengkap sendiri, sementara barangnya menumpuk biaya penyimpanan
      tiap hari. Keterlambatan tanpa sebab sering menyelesaikan dirinya sendiri
      dalam beberapa hari perjalanan.

      Pada hari ke-5: yang tertahan sudah ditegur, yang biasa belum.
    */
    expect(nilaiKiriman(K({ status: 'tertahan', lewatHari: 5 }), ...A).perlu).toBe(true)
    expect(nilaiKiriman(K({ lewatHari: 5 }), ...A).perlu).toBe(false)
  })

  it('SEBAB TERTULIS memicu jalur tertahan walau statusnya bukan `tertahan`', () => {
    // Status diketik manusia dan sering tertinggal. Sebab yang terisi adalah
    // bukti bahwa seseorang benar-benar tahu barangnya berhenti.
    const h = nilaiKiriman(K({
      status: 'dalam_perjalanan', lewatHari: 4,
      sebabTertahan: 'Menunggu pelunasan termin kedua',
    }), ...A)
    expect(h.sebab).toBe('tertahan')
  })

  it('sebab berisi SPASI saja bukan sebab', () => {
    const h = nilaiKiriman(K({ lewatHari: 4, sebabTertahan: '   ' }), ...A)
    expect(h.perlu).toBe(false)
  })

  it('TIBA_AKTUAL terisi menutup perkara walau status masih `tertahan`', () => {
    /*
      Bila kolom status dan tanggal tiba bertentangan, yang menang adalah yang
      punya bukti fisik. Status diketik; tanggal tiba diisi saat barangnya
      benar-benar diterima.
    */
    const h = nilaiKiriman(K({ status: 'tertahan', lewatHari: 400, sudahTiba: true }), ...A)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('aman')
  })

  it('status selesai tak ditegur berapa pun lewatnya', () => {
    for (const st of ['tiba', 'Tiba', ' DITERIMA ', 'batal', 'dibatalkan']) {
      expect(nilaiKiriman(K({ status: st, lewatHari: 999 }), ...A).perlu).toBe(false)
    }
  })

  it('kiriman TANPA TENGGAT DILAPORKAN, bukan dilewati', () => {
    /*
      Kebalikan dari `uji-material-gagal`, yang MELEWATI catatan tanpa tanggal.

      Di sana tanggal uji hanyalah metadata. Di sini tenggat ADALAH satu-satunya
      alat untuk menilai kiriman sehat atau tidak — kiriman tanpa tenggat tak
      bisa dinilai selamanya, dan diamnya justru menjadikannya tempat paling
      aman untuk hilang.
    */
    for (const l of [null, Number.NaN]) {
      const h = nilaiKiriman(K({ lewatHari: l as number | null }), ...A)
      expect(h.perlu).toBe(true)
      expect(h.sebab).toBe('tanpa_tenggat')
    }
  })

  it('kiriman yang BELUM jatuh tempo tidak ditegur', () => {
    // Tenggat masih 10 hari lagi.
    expect(nilaiKiriman(K({ lewatHari: -10 }), ...A).perlu).toBe(false)
    expect(nilaiKiriman(K({ status: 'tertahan', lewatHari: -10 }), ...A).perlu).toBe(false)
  })
})
