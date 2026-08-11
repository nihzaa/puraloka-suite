import { describe, it, expect } from 'vitest'
import {
  periksaKesiapan, selisihSeimbang, periodeUntukTanggal, tanggalTerkunci,
  ringkasPeriode, bolehBukaKembali, MIN_ALASAN_BUKA,
  type Periode, type IsiPeriode,
} from '../tutup-buku.js'

function periode(p: Partial<Periode> = {}): Periode {
  return {
    id: 'p1', nama: 'Januari 2026',
    tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31',
    status: 'terbuka', ditutup_pada: null, dibuka_ulang: 0, ...p,
  }
}

function isi(p: Partial<IsiPeriode> = {}): IsiPeriode {
  return { posted: 5, draft: 0, total_debit: 1000, total_kredit: 1000, ...p }
}

describe('periksaKesiapan — periode tertutup adalah null, bukan false', () => {
  it('periode yang SUDAH tertutup menjawab null', () => {
    // `false` akan terbaca "ada yang salah". Yang benar: pertanyaannya tak
    // berlaku.
    const k = periksaKesiapan(periode({ status: 'tertutup' }), isi())
    expect(k.boleh).toBeNull()
    expect(k.masalah).toEqual([])
  })

  it('periode bersih boleh ditutup tanpa masalah', () => {
    const k = periksaKesiapan(periode(), isi())
    expect(k.boleh).toBe(true)
    expect(k.masalah).toEqual([])
  })
})

describe('periksaKesiapan — periode sebelumnya adalah SATU-SATUNYA penghalang', () => {
  it('periode sebelum yang masih terbuka MENGHALANGI', () => {
    const k = periksaKesiapan(periode(), isi(), 'Desember 2025')
    expect(k.boleh).toBe(false)
    expect(k.masalah[0].berat).toBe('penghalang')
    expect(k.masalah[0].pesan).toMatch(/Desember 2025/)
    expect(k.masalah[0].pesan).toMatch(/tak bisa dijumlahkan/)
  })

  it('draft TIDAK menghalangi — hanya memperingatkan', () => {
    // Memaksanya jadi penghalang akan membuat orang MENGHAPUS draft asal
    // periodenya bisa ditutup.
    const k = periksaKesiapan(periode(), isi({ draft: 3 }))
    expect(k.boleh).toBe(true)
    expect(k.masalah.some((m) => m.berat === 'peringatan')).toBe(true)
  })

  it('periode kosong TIDAK menghalangi — hanya dicatat', () => {
    const k = periksaKesiapan(periode(), isi({ posted: 0 }))
    expect(k.boleh).toBe(true)
    expect(k.masalah.some((m) => m.berat === 'catatan')).toBe(true)
    expect(k.masalah.find((m) => m.berat === 'catatan')!.pesan)
      .toMatch(/tak menjaga apa pun/)
  })

  it('penghalang menang meski hanya ada satu di antara banyak peringatan', () => {
    const k = periksaKesiapan(periode(), isi({ posted: 0, draft: 2 }), 'Desember 2025')
    expect(k.boleh).toBe(false)
    expect(k.masalah).toHaveLength(3)
  })
})

describe('periksaKesiapan — kalimat tunggal dan jamak berbeda', () => {
  it('satu draft memakai kalimat TUNGGAL', () => {
    const k = periksaKesiapan(periode(), isi({ draft: 1 }))
    expect(k.masalah[0].pesan).toMatch(/^1 jurnal masih/)
    // Mutasi membuktikan awalan saja tak cukup: `pesan: false` menghasilkan
    // cabang jamak yang JUGA berawalan "1 jurnal". Yang membedakan ada di
    // isinya — cabang jamak berkata "Kalau ADA YANG seharusnya masuk".
    expect(k.masalah[0].pesan).toMatch(/Kalau ia seharusnya masuk/)
    expect(k.masalah[0].pesan).not.toMatch(/Kalau ada yang seharusnya masuk/)
  })

  it('banyak draft memakai kalimat JAMAK', () => {
    const k = periksaKesiapan(periode(), isi({ draft: 4 }))
    expect(k.masalah[0].pesan).toMatch(/^4 jurnal masih/)
    expect(k.masalah[0].pesan).toMatch(/Kalau ada yang seharusnya masuk/)
  })
})

describe('selisihSeimbang', () => {
  it('nol saat seimbang', () => {
    expect(selisihSeimbang(isi({ total_debit: 5000, total_kredit: 5000 }))).toBe(0)
  })

  it('numeric string dari Postgres dibaca benar', () => {
    expect(selisihSeimbang(isi({ total_debit: '7500.50', total_kredit: '7500.50' }))).toBe(0)
  })

  it("string KOSONG menjawab null, bukan 0 — `Number('')` adalah 0", () => {
    // Mutasi versi pertama membuktikan penjaga string-kosong TIDAK BERARTI
    // apa-apa selama hasilnya dijatuhkan ke 0: `Number('')` memang 0, dan
    // melepas penjaganya tak mengubah satu pun keluaran. Penjaga yang tak
    // bisa dibuat merah adalah hiasan.
    //
    // Diperbaiki di KODENYA, bukan di test: `angka()` kini mengembalikan
    // `null` untuk yang tak terbaca, dan selisihnya ikut `null`. Bedanya
    // nyata di layar — periode yang debitnya gagal dibaca TIDAK boleh
    // dinyatakan seimbang.
    expect(selisihSeimbang(isi({ total_debit: '', total_kredit: '1000' }))).toBeNull()
  })

  it('spasi saja juga menjawab null', () => {
    expect(selisihSeimbang(isi({ total_debit: '  ', total_kredit: 1000 }))).toBeNull()
  })

  it('teks bukan-angka menjawab null, bukan mengarang selisih', () => {
    expect(selisihSeimbang(isi({ total_debit: 'seribu', total_kredit: 1000 }))).toBeNull()
  })

  it('nilai NULL dari basis menjawab null, bukan 0', () => {
    // Kolom yang belum pernah diisi tiba sebagai `null` — dan `null` yang
    // dibaca 0 membuat periode tanpa data terlihat seimbang.
    expect(selisihSeimbang(isi({ total_debit: null, total_kredit: 1000 }))).toBeNull()
    expect(selisihSeimbang(isi({ total_debit: 1000, total_kredit: null }))).toBeNull()
  })

  it('NOL SUNGGUHAN tetap 0, bukan null', () => {
    // Yang membedakan `null` dari 0: periode berdebit nol memang seimbang.
    expect(selisihSeimbang(isi({ total_debit: 0, total_kredit: 0 }))).toBe(0)
    expect(selisihSeimbang(isi({ total_debit: '0', total_kredit: '0' }))).toBe(0)
  })

  it('selisih bukan nol terlihat — gejala jurnal lewat jalur tak ber-trigger', () => {
    expect(selisihSeimbang(isi({ total_debit: 5000, total_kredit: 4900 }))).toBe(100)
  })
})

describe('periodeUntukTanggal — rentang INKLUSIF di kedua ujung', () => {
  const d = [
    periode({ id: 'a', nama: 'Jan', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31' }),
    periode({ id: 'b', nama: 'Feb', tanggal_mulai: '2026-02-01', tanggal_akhir: '2026-02-28' }),
  ]

  it('tanggal mulai termasuk', () => {
    expect(periodeUntukTanggal(d, '2026-01-01')!.id).toBe('a')
  })

  it('tanggal akhir termasuk', () => {
    // Harus sama dengan `daterange(...,'[]')` di constraint DB — kalau beda,
    // ada tanggal yang menurut basis di satu periode tapi menurut aplikasi
    // di dua.
    expect(periodeUntukTanggal(d, '2026-01-31')!.id).toBe('a')
  })

  it('tanggal di tengah', () => {
    expect(periodeUntukTanggal(d, '2026-02-14')!.id).toBe('b')
  })

  it('tanggal di luar semua periode = null', () => {
    expect(periodeUntukTanggal(d, '2026-03-01')).toBeNull()
    expect(periodeUntukTanggal(d, '2025-12-31')).toBeNull()
  })
})

describe('tanggalTerkunci — null berbeda dari "tidak terkunci"', () => {
  const d = [
    periode({ id: 'a', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31', status: 'tertutup' }),
    periode({ id: 'b', tanggal_mulai: '2026-02-01', tanggal_akhir: '2026-02-28', status: 'terbuka' }),
  ]

  it('di periode tertutup = true', () => {
    expect(tanggalTerkunci(d, '2026-01-15')).toBe(true)
  })

  it('di periode terbuka = false', () => {
    expect(tanggalTerkunci(d, '2026-02-15')).toBe(false)
  })

  it('DI LUAR periode mana pun = null, bukan false', () => {
    // Perusahaan tanpa periode sama sekali tidak sedang "bebas memposting
    // dengan aman" — ia sedang tak punya kerangka pembukuan.
    expect(tanggalTerkunci(d, '2026-06-01')).toBeNull()
    expect(tanggalTerkunci([], '2026-01-15')).toBeNull()
  })
})

describe('ringkasPeriode', () => {
  it('menghitung terbuka, tertutup, dan yang pernah dibuka ulang', () => {
    const r = ringkasPeriode([
      periode({ id: 'a', status: 'tertutup', dibuka_ulang: 2 }),
      periode({ id: 'b', tanggal_mulai: '2026-02-01', tanggal_akhir: '2026-02-28' }),
      periode({ id: 'c', tanggal_mulai: '2026-03-01', tanggal_akhir: '2026-03-31', status: 'tertutup' }),
    ])
    expect(r.total).toBe(3)
    expect(r.terbuka).toBe(1)
    expect(r.tertutup).toBe(2)
    expect(r.pernah_dibuka_ulang).toBe(1)
  })

  it('terbuka_terlama adalah yang tanggal mulainya paling awal', () => {
    const r = ringkasPeriode([
      periode({ id: 'b', nama: 'Mar', tanggal_mulai: '2026-03-01', tanggal_akhir: '2026-03-31' }),
      periode({ id: 'a', nama: 'Jan', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31' }),
    ])
    expect(r.terbuka_terlama!.nama).toBe('Jan')
  })

  it('terbuka_terlama null bila semuanya tertutup', () => {
    const r = ringkasPeriode([periode({ status: 'tertutup' })])
    expect(r.terbuka_terlama).toBeNull()
  })

  it('periode BERSEBELAHAN tak dianggap berlubang', () => {
    // Feb mulai TEPAT sehari sesudah Jan berakhir.
    const r = ringkasPeriode([
      periode({ id: 'a', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31' }),
      periode({ id: 'b', tanggal_mulai: '2026-02-01', tanggal_akhir: '2026-02-28' }),
    ])
    expect(r.lubang).toEqual([])
  })

  it('LUBANG terdeteksi beserta rentangnya', () => {
    // Lubang berarti ada transaksi yang tak pernah bisa dikunci.
    const r = ringkasPeriode([
      periode({ id: 'a', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31' }),
      periode({ id: 'b', tanggal_mulai: '2026-03-01', tanggal_akhir: '2026-03-31' }),
    ])
    expect(r.lubang).toEqual([{ dari: '2026-02-01', sampai: '2026-02-28' }])
  })

  it('lubang terdeteksi meski daftarnya tak urut', () => {
    const r = ringkasPeriode([
      periode({ id: 'b', tanggal_mulai: '2026-03-01', tanggal_akhir: '2026-03-31' }),
      periode({ id: 'a', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-31' }),
    ])
    expect(r.lubang).toHaveLength(1)
  })

  it('lubang satu hari terdeteksi', () => {
    const r = ringkasPeriode([
      periode({ id: 'a', tanggal_mulai: '2026-01-01', tanggal_akhir: '2026-01-30' }),
      periode({ id: 'b', tanggal_mulai: '2026-02-01', tanggal_akhir: '2026-02-28' }),
    ])
    expect(r.lubang).toEqual([{ dari: '2026-01-31', sampai: '2026-01-31' }])
  })

  it('daftar kosong', () => {
    const r = ringkasPeriode([])
    expect(r.total).toBe(0)
    expect(r.lubang).toEqual([])
    expect(r.terbuka_terlama).toBeNull()
  })
})

describe('bolehBukaKembali', () => {
  it('periode yang tidak tertutup tak bisa dibuka', () => {
    const h = bolehBukaKembali(periode({ status: 'terbuka' }), 'a'.repeat(30))
    expect(h.boleh).toBe(false)
    expect(h.galat).toMatch(/tidak sedang tertutup/)
  })

  it('alasan terlalu pendek ditolak dengan penjelasan', () => {
    const h = bolehBukaKembali(periode({ status: 'tertutup' }), 'koreksi')
    expect(h.boleh).toBe(false)
    expect(h.galat).toMatch(/tak ada di ruangan/)
  })

  it('alasan TEPAT di ambang diterima', () => {
    const tepat = 'x'.repeat(MIN_ALASAN_BUKA)
    expect(bolehBukaKembali(periode({ status: 'tertutup' }), tepat).boleh).toBe(true)
  })

  it('sehuruf kurang dari ambang ditolak', () => {
    const kurang = 'x'.repeat(MIN_ALASAN_BUKA - 1)
    expect(bolehBukaKembali(periode({ status: 'tertutup' }), kurang).boleh).toBe(false)
  })

  it('spasi tak dihitung sebagai alasan', () => {
    const h = bolehBukaKembali(periode({ status: 'tertutup' }), '   '.repeat(20))
    expect(h.boleh).toBe(false)
  })

  it('alasan sungguhan diterima', () => {
    const h = bolehBukaKembali(
      periode({ status: 'tertutup' }),
      'Audit menemukan salah posting biaya material ke akun overhead')
    expect(h.boleh).toBe(true)
    expect(h.galat).toBeUndefined()
  })
})
