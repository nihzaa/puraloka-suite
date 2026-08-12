/**
 * E1 — Surat Perintah Kerja (murni, tanpa basis).
 *
 * Jalur nyatanya diuji di `routes/v1/__tests__/spk.test.ts` terhadap Postgres
 * sungguhan.
 */
import { describe, it, expect } from 'vitest'
import { validasiSpk, hitungDendaKeterlambatan, periksaTransisiSpk } from '../spk.js'

const SAH = {
  lingkupKerja: 'Pekerjaan struktur lantai 2',
  nilaiKontrak: 100_000_000,
  tanggalMulai: '2026-09-01',
  tanggalSelesai: '2026-11-30',
}

describe('validasiSpk', () => {
  it('menerima masukan yang sah', () => {
    const h = validasiSpk(SAH)
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.nilai.nilaiKontrak).toBe(100_000_000)
  })

  it('menolak lingkup kosong dengan alasan yang menjelaskan', () => {
    const h = validasiSpk({ ...SAH, lingkupKerja: '  ' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/tak memerintahkan apa pun/i)
  })

  it('menolak nilai nol dan negatif', () => {
    for (const n of [0, -1]) {
      expect(validasiSpk({ ...SAH, nilaiKontrak: n }).ok, String(n)).toBe(false)
    }
  })

  it('menolak nilai KOSONG — bukan memperlakukannya sebagai nol', () => {
    // `Number('') === 0`, bukan NaN. Tanpa pemeriksaan sebelum konversi,
    // string kosong lolos jadi nol lalu ditolak dengan pesan yang salah.
    const h = validasiSpk({ ...SAH, nilaiKontrak: '' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/wajib diisi/i)
  })

  it('menolak tanggal selesai yang MENDAHULUI mulai', () => {
    const h = validasiSpk({ ...SAH, tanggalMulai: '2026-11-30', tanggalSelesai: '2026-09-01' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/mendahului/i)
  })

  it('menerima mulai = selesai (pekerjaan sehari)', () => {
    const h = validasiSpk({ ...SAH, tanggalMulai: '2026-09-01', tanggalSelesai: '2026-09-01' })
    expect(h.ok).toBe(true)
  })

  it('menolak bentuk tanggal yang salah', () => {
    expect(validasiSpk({ ...SAH, tanggalMulai: '01-09-2026' }).ok).toBe(false)
  })
})

describe('denda — null vs nol', () => {
  it('denda KOSONG jadi null, bukan nol', () => {
    // "Belum diputuskan" (null) beda dari "sudah diputuskan nihil" (0). Yang
    // pertama menunggu keputusan; yang kedua sudah jadi kesepakatan.
    const h = validasiSpk({ ...SAH, dendaPerHari: '' })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.nilai.dendaPerHari).toBeNull()
  })

  it('denda nol yang DITULIS tetap nol', () => {
    const h = validasiSpk({ ...SAH, dendaPerHari: 0 })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.nilai.dendaPerHari).toBe(0)
  })

  it('denda negatif ditolak', () => {
    expect(validasiSpk({ ...SAH, dendaPerHari: -1000 }).ok).toBe(false)
  })

  it('batas denda di luar 0-100 ditolak', () => {
    expect(validasiSpk({ ...SAH, dendaPerHari: 1000, dendaMaksPct: 150 }).ok).toBe(false)
  })

  it('batas TANPA tarif harian ditolak — tak ada yang bisa dihitung', () => {
    const h = validasiSpk({ ...SAH, dendaMaksPct: 5 })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.galat).toMatch(/tak ada yang bisa dihitung/i)
  })

  it('tarif TANPA batas atas diizinkan', () => {
    expect(validasiSpk({ ...SAH, dendaPerHari: 1000 }).ok).toBe(true)
  })
})

describe('hitungDendaKeterlambatan', () => {
  const dasar = {
    tanggalSelesai: '2026-11-30',
    nilaiKontrak: 100_000_000,
    dendaPerHari: 1_000_000,
    dendaMaksPct: null as number | null,
  }

  it('nol saat belum lewat tenggat', () => {
    const h = hitungDendaKeterlambatan({ ...dasar, tanggalAcuan: '2026-11-30' })
    expect(h.hariTerlambat).toBe(0)
    expect(h.dendaTerbatas).toBe(0)
  })

  it('selesai LEBIH AWAL tak menghasilkan denda negatif', () => {
    // Denda negatif akan MENAMBAH pembayaran; bonus penyelesaian dini adalah
    // kesepakatan terpisah yang tak pernah dituliskan di sini.
    const h = hitungDendaKeterlambatan({ ...dasar, tanggalAcuan: '2026-11-01' })
    expect(h.hariTerlambat).toBe(0)
    expect(h.dendaTerbatas).toBe(0)
  })

  it('menghitung per hari keterlambatan', () => {
    const h = hitungDendaKeterlambatan({ ...dasar, tanggalAcuan: '2026-12-10' })
    expect(h.hariTerlambat).toBe(10)
    expect(h.dendaKotor).toBe(10_000_000)
  })

  it('batas atas dihitung dari NILAI KONTRAK, bukan dari denda kotor', () => {
    // Menghitungnya dari denda kotor membuat batasnya bergerak mengikuti
    // keterlambatan — dan "maksimum 5%" jadi tak berarti apa-apa.
    const h = hitungDendaKeterlambatan({
      ...dasar, dendaMaksPct: 5, tanggalAcuan: '2026-12-31',
    })
    expect(h.hariTerlambat).toBe(31)
    expect(h.dendaKotor).toBe(31_000_000)
    expect(h.dendaTerbatas).toBe(5_000_000)   // 5% dari 100 jt
    expect(h.terkenaBatas).toBe(true)
  })

  it('di bawah batas tak dipotong', () => {
    const h = hitungDendaKeterlambatan({
      ...dasar, dendaMaksPct: 20, tanggalAcuan: '2026-12-05',
    })
    expect(h.dendaTerbatas).toBe(5_000_000)
    expect(h.terkenaBatas).toBe(false)
  })

  it('tanpa tarif harian, nol apa pun keterlambatannya', () => {
    const h = hitungDendaKeterlambatan({
      ...dasar, dendaPerHari: null, tanggalAcuan: '2027-06-01',
    })
    expect(h.dendaTerbatas).toBe(0)
  })
})

describe('periksaTransisiSpk', () => {
  const t = (dari: never, ke: never, o: Record<string, unknown> = {}) =>
    periksaTransisiSpk({
      statusSekarang: dari, statusTujuan: ke,
      adaTtdPenerbit: false, adaTtdPelaksana: false, ...o,
    } as never)

  it('draf → diterbitkan boleh', () => {
    expect(t('draf' as never, 'diterbitkan' as never).boleh).toBe(true)
  })

  it('draf → ditandatangani DITOLAK — harus terbit dulu', () => {
    const h = t('draf' as never, 'ditandatangani' as never,
      { adaTtdPenerbit: true, adaTtdPelaksana: true })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/diterbitkan lebih dulu/i)
  })

  it('ditandatangani menuntut KEDUA tanda tangan', () => {
    const h = t('diterbitkan' as never, 'ditandatangani' as never, { adaTtdPenerbit: true })
    expect(h.boleh).toBe(false)
    if (!h.boleh) {
      expect(h.sebab).toMatch(/tanda tangan pelaksana/i)
      // Kalimatnya menjelaskan KENAPA, bukan sekadar menolak.
      expect(h.sebab).toMatch(/pemberitahuan, bukan kesepakatan/i)
    }
  })

  it('menyebut KEDUANYA saat dua-duanya kurang', () => {
    const h = t('diterbitkan' as never, 'ditandatangani' as never)
    if (!h.boleh) expect(h.sebab).toMatch(/kedua tanda tangan/i)
  })

  it('kedua tanda tangan lengkap → boleh', () => {
    const h = t('diterbitkan' as never, 'ditandatangani' as never,
      { adaTtdPenerbit: true, adaTtdPelaksana: true })
    expect(h.boleh).toBe(true)
  })

  it('pembatalan wajib beralasan', () => {
    expect(t('diterbitkan' as never, 'dibatalkan' as never).boleh).toBe(false)
    expect(t('diterbitkan' as never, 'dibatalkan' as never, { alasanBatal: 'lingkup berubah' }).boleh).toBe(true)
  })

  it('yang sudah dibatalkan tak bisa diubah lagi', () => {
    const h = t('dibatalkan' as never, 'diterbitkan' as never)
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/sudah dibatalkan/i)
  })

  it('status yang sama ditolak', () => {
    expect(t('draf' as never, 'draf' as never).boleh).toBe(false)
  })
})
