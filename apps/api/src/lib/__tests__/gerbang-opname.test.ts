/**
 * D1 — gerbang opname (murni, tanpa basis).
 *
 * Jalur nyatanya diuji di `routes/v1/__tests__/opname-bersama.test.ts`
 * terhadap Postgres sungguhan.
 */
import { describe, it, expect } from 'vitest'
import { periksaGerbangOpname, pctOpname, SISTEM_WAJIB_OPNAME } from '../gerbang-opname.js'

const O = (status: string, pct: number | null, id = 'o1') =>
  ({ id, status, pctTertinggi: pct })

describe('sistem pembayaran yang dikecualikan', () => {
  it('harian LOLOS tanpa opname', () => {
    // Upah harian dibayar per hari kerja yang sudah tercatat absensi — tak ada
    // volume terpasang yang bisa diukur. Menuntut berita acara untuk itu
    // menghentikan pembayaran mingguan tukang demi dokumen tanpa isi.
    const h = periksaGerbangOpname({ sistemPembayaran: 'harian', pctDiminta: 50, opname: [] })
    expect(h).toEqual({ boleh: true, opnameId: null, alasanLolos: 'tak_wajib' })
  })

  it('borongan dan progress_pct WAJIB opname', () => {
    expect([...SISTEM_WAJIB_OPNAME]).toEqual(['borongan', 'progress_pct'])
    for (const s of SISTEM_WAJIB_OPNAME) {
      const h = periksaGerbangOpname({ sistemPembayaran: s, pctDiminta: 10, opname: [] })
      expect(h.boleh, s).toBe(false)
    }
  })

  it('sistem tak dikenal DIPERLAKUKAN sebagai tak wajib', () => {
    // Keputusan yang disengaja: menolak sistem baru yang belum terdaftar akan
    // melumpuhkan pembayaran begitu ada jenis kontrak baru ditambahkan lewat
    // migrasi, sebelum siapa pun sempat memperbarui daftar ini.
    const h = periksaGerbangOpname({ sistemPembayaran: 'lump_sum', pctDiminta: 50, opname: [] })
    expect(h.boleh).toBe(true)
  })
})

describe('penolakan, dengan sebab yang bisa ditindaklanjuti', () => {
  it('tanpa opname sama sekali', () => {
    const h = periksaGerbangOpname({ sistemPembayaran: 'borongan', pctDiminta: 30, opname: [] })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/Belum ada berita acara/i)
  })

  it('opname masih DIAJUKAN — sebabnya berbeda dari tak ada', () => {
    // Pengguna yang sudah mengajukan berhak tahu bahwa ia menunggu orang
    // lain, bukan disuruh mengukur ulang.
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 30, opname: [O('diajukan', 50)],
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/belum diverifikasi/i)
  })

  it('opname DISENGKETAKAN disebut apa adanya', () => {
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 30, opname: [O('disengketakan', 50)],
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/disengketakan/i)
  })
})

describe('perbandingan persen — gerbang yang tak hanya dilewati sekali', () => {
  it('pembayaran MELAMPAUI opname ditolak', () => {
    // Berita acara bulan lalu yang mencatat 40% tak membenarkan pembayaran
    // 80% hari ini. Tanpa ini, satu opname di awal proyek membuka seluruh
    // pembayaran sesudahnya.
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 80, opname: [O('diverifikasi', 40)],
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) {
      expect(h.sebab).toMatch(/melampaui/i)
      expect(h.sebab).toMatch(/40/)
      expect(h.sebab).toMatch(/80/)
    }
  })

  it('pembayaran SAMA DENGAN opname diterima', () => {
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 40, opname: [O('diverifikasi', 40)],
    })
    expect(h.boleh).toBe(true)
  })

  it('pembayaran DI BAWAH opname diterima', () => {
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 25, opname: [O('diverifikasi', 60)],
    })
    expect(h.boleh).toBe(true)
  })

  it('memakai persen TERTINGGI dari beberapa opname terverifikasi', () => {
    // Opname susulan bisa mencatat angka lebih rendah untuk item berbeda;
    // memakai "yang terakhir" membuat hak bayar terlihat mundur.
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 70,
      opname: [O('diverifikasi', 30, 'a'), O('diverifikasi', 75, 'b'), O('diverifikasi', 45, 'c')],
    })
    expect(h.boleh).toBe(true)
  })

  it('opname yang belum diverifikasi TAK menaikkan batas', () => {
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 70,
      opname: [O('diverifikasi', 40, 'a'), O('diajukan', 90, 'b')],
    })
    expect(h.boleh).toBe(false)
  })

  it('toleransi pembulatan 0,01 — bukan kelonggaran', () => {
    expect(periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 40.005, opname: [O('diverifikasi', 40)],
    }).boleh).toBe(true)
    expect(periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 41, opname: [O('diverifikasi', 40)],
    }).boleh).toBe(false)
  })
})

describe('berita acara yang mendasari', () => {
  it('menunjuk opname yang persennya MENCUKUPI, bukan yang pertama', () => {
    // Yang tercatat di `opname_report_id` harus benar-benar membenarkan
    // pembayaran itu — kalau tidak, jejaknya menunjuk dokumen yang isinya
    // tak mendukung angkanya.
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 50,
      opname: [O('diverifikasi', 30, 'kecil'), O('diverifikasi', 60, 'cukup')],
    })
    expect(h.boleh).toBe(true)
    if (h.boleh) expect(h.opnameId).toBe('cukup')
  })

  it('memilih yang PALING PAS, bukan yang tertinggi', () => {
    // Di antara dua yang mencukupi, yang lebih dekat lebih tepat sebagai
    // dasar — ia berita acara yang benar-benar mengukur kemajuan ini.
    const h = periksaGerbangOpname({
      sistemPembayaran: 'borongan', pctDiminta: 50,
      opname: [O('diverifikasi', 55, 'pas'), O('diverifikasi', 95, 'jauh')],
    })
    if (h.boleh) expect(h.opnameId).toBe('pas')
  })
})

describe('pctOpname — rata-rata TERTIMBANG', () => {
  it('ditimbang NILAI bila volume & harga lengkap', () => {
    // "Pengecatan 100% (nilai kecil)" + "struktur 20% (nilai besar)".
    // Rata-rata polos = 60% dan membuka pembayaran separuh nilai borongan
    // untuk pekerjaan yang sebagian besar belum berdiri.
    const h = pctOpname([
      { pct_selesai: 100, volume_rencana: 10, harga_satuan: 100_000 },     // nilai 1 jt
      { pct_selesai: 20, volume_rencana: 100, harga_satuan: 1_000_000 },   // nilai 100 jt
    ])
    expect(h.dasar).toBe('nilai')
    expect(h.pct).toBeLessThan(25)  // bukan 60
  })

  it('ditimbang VOLUME bila harga tak ada', () => {
    const h = pctOpname([
      { pct_selesai: 100, volume_rencana: 10 },
      { pct_selesai: 0, volume_rencana: 90 },
    ])
    expect(h.dasar).toBe('volume')
    expect(h.pct).toBe(10)
  })

  it('rata-rata polos hanya bila volume pun tak ada, dan DISEBUTKAN', () => {
    const h = pctOpname([{ pct_selesai: 100 }, { pct_selesai: 0 }])
    expect(h.dasar).toBe('rata')
    expect(h.pct).toBe(50)
  })

  it('daftar kosong memulangkan null, bukan nol', () => {
    // Nol berarti "diukur, hasilnya nol". Null berarti "belum diukur".
    expect(pctOpname([]).pct).toBeNull()
  })

  it('volume nol total tak membagi dengan nol', () => {
    const h = pctOpname([
      { pct_selesai: 50, volume_rencana: 0, harga_satuan: 0 },
    ])
    expect(h.pct).toBe(50)
    expect(h.dasar).toBe('rata')
  })

  it('nilai numeric bertipe string dari Postgres dibaca benar', () => {
    const h = pctOpname([
      { pct_selesai: '80', volume_rencana: '10', harga_satuan: '5000' },
    ])
    expect(h.pct).toBe(80)
  })
})
