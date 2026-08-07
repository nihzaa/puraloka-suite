import { describe, it, expect } from 'vitest'
import {
  nilaiKontrakPayung, bolehTarikKuota, nilaiExpediting, nilaiNotaKredit,
  AMBANG_KUOTA_TIPIS, AMBANG_PAYUNG_SEGERA, AMBANG_TELAT_KRITIS,
  AMBANG_KREDIT_MENGGANTUNG,
} from '../pengadaan-lanjutan.js'

const HARI_INI = '2026-08-07'

describe('nilaiKontrakPayung', () => {
  const DASAR = {
    id: 'k1', nomor: 'BO-001', judul: 'Besi beton 2026',
    berlaku_dari: '2026-01-01', berlaku_sampai: '2026-12-31', status: 'aktif',
  }

  // ── Cacat #1: kontrak "aktif" yang kuotanya sudah habis ─────────────────
  it('status AKTIF tapi SELURUH kuota habis = tak bisa dipakai', () => {
    const h = nilaiKontrakPayung([{
      ...DASAR,
      item: [{ id: 'i1', uraian: 'Besi D16', satuan: 'ton',
               harga_satuan: 14_000_000, kuota: 100, terpakai: 100 }],
    }], HARI_INI)

    // Kolom `status` di basis masih 'aktif'. PO berikutnya akan ditarik di
    // luar harga kontrak, dan itu ketahuan saat tagihannya datang.
    expect(h.kontrak[0].statusNyata).toBe('kuota_habis')
    expect(h.kontrak[0].aktifTapiTakBisaDipakai).toBe(true)
    expect(h.aktifTapiTakBisaDipakai).toBe(1)
    expect(h.aktif).toBe(0)
  })

  it('SATU item habis bukan berarti kontraknya habis', () => {
    // Kontrak bisa memuat sepuluh material; sembilan masih tersedia.
    const h = nilaiKontrakPayung([{
      ...DASAR,
      item: [
        { id: 'i1', uraian: 'Besi D16', satuan: 'ton', harga_satuan: 14_000_000, kuota: 100, terpakai: 100 },
        { id: 'i2', uraian: 'Besi D13', satuan: 'ton', harga_satuan: 13_500_000, kuota: 80, terpakai: 20 },
      ],
    }], HARI_INI)

    expect(h.kontrak[0].statusNyata).toBe('aktif')
    expect(h.kontrak[0].aktifTapiTakBisaDipakai).toBe(false)
    expect(h.kontrak[0].itemDinilai[0].habis).toBe(true)
    expect(h.kontrak[0].itemDinilai[1].habis).toBe(false)
  })

  it('PAGU NILAI habis menggugurkan meski kuota per-item masih ada', () => {
    const h = nilaiKontrakPayung([{
      ...DASAR, pagu_nilai: 100_000_000,
      item: [{ id: 'i1', uraian: 'Besi D16', satuan: 'ton',
               harga_satuan: 14_000_000, kuota: 100, terpakai: 8 }],
    }], HARI_INI)

    // 8 × 14 juta = 112 juta, melewati pagu 100 juta.
    expect(h.kontrak[0].nilaiTerpakai).toBe(112_000_000)
    expect(h.kontrak[0].sisaPagu).toBe(-12_000_000)
    expect(h.kontrak[0].statusNyata).toBe('kuota_habis')
  })

  it('sisa pagu `null` bila kontrak tak berpagu nilai', () => {
    const h = nilaiKontrakPayung([{
      ...DASAR, pagu_nilai: null,
      item: [{ id: 'i1', uraian: 'X', satuan: 'ton', harga_satuan: 1000, kuota: 10, terpakai: 1 }],
    }], HARI_INI)
    // Bukan 0 — nol terbaca "pagunya habis", padahal tak ada pagu sama sekali.
    expect(h.kontrak[0].sisaPagu).toBeNull()
    expect(h.kontrak[0].statusNyata).toBe('aktif')
  })

  it('kuota tipis ≤15% ditandai hampir habis, belum habis', () => {
    expect(AMBANG_KUOTA_TIPIS).toBe(0.15)
    const h = nilaiKontrakPayung([{
      ...DASAR,
      item: [{ id: 'i1', uraian: 'Besi', satuan: 'ton', harga_satuan: 1000, kuota: 100, terpakai: 88 }],
    }], HARI_INI)
    const i = h.kontrak[0].itemDinilai[0]
    expect(i.sisa).toBe(12)
    expect(i.persenTerpakai).toBe(88)
    expect(i.hampirHabis).toBe(true)
    expect(i.habis).toBe(false)
  })

  it('masa berlaku LEWAT menggugurkan meski kuota penuh', () => {
    const h = nilaiKontrakPayung([{
      ...DASAR, berlaku_sampai: '2026-06-30',
      item: [{ id: 'i1', uraian: 'X', satuan: 'ton', harga_satuan: 1000, kuota: 100, terpakai: 0 }],
    }], HARI_INI)
    expect(h.kontrak[0].statusNyata).toBe('kedaluwarsa')
    expect(h.kontrak[0].aktifTapiTakBisaDipakai).toBe(true)
  })

  it('segera berakhir pada ≤30 hari — masih bisa dinegosiasikan ulang', () => {
    expect(AMBANG_PAYUNG_SEGERA).toBe(30)
    const h = nilaiKontrakPayung([{
      ...DASAR, berlaku_sampai: '2026-08-25',
      item: [{ id: 'i1', uraian: 'X', satuan: 'ton', harga_satuan: 1000, kuota: 100, terpakai: 0 }],
    }], HARI_INI)
    expect(h.kontrak[0].sisaHari).toBe(18)
    expect(h.kontrak[0].statusNyata).toBe('segera_berakhir')
    expect(h.segeraBerakhir).toBe(1)
  })

  it('kontrak DIBATALKAN tak pernah disebut aktif', () => {
    const h = nilaiKontrakPayung([{ ...DASAR, status: 'dibatalkan', item: [] }], HARI_INI)
    expect(h.kontrak[0].statusNyata).toBe('tak_aktif')
    expect(h.kontrak[0].aktifTapiTakBisaDipakai).toBe(false)
  })

  it('NUMERIC string dari Postgres dihitung sebagai angka', () => {
    const h = nilaiKontrakPayung([{
      ...DASAR, pagu_nilai: '50000000',
      item: [{ id: 'i1', uraian: 'X', satuan: 'ton',
               harga_satuan: '1000000', kuota: '100', terpakai: '10' }],
    }], HARI_INI)
    expect(h.kontrak[0].nilaiTerpakai).toBe(10_000_000)
    expect(h.kontrak[0].sisaPagu).toBe(40_000_000)
    expect(h.kontrak[0].itemDinilai[0].sisa).toBe(90)
  })
})

describe('bolehTarikKuota', () => {
  const ITEM = { id: 'i1', uraian: 'Besi D16', satuan: 'ton',
                 harga_satuan: 14_000_000, kuota: 100, terpakai: 88 }

  it('penarikan dalam sisa kuota DIIZINKAN', () => {
    const h = bolehTarikKuota(ITEM, 12)
    expect(h.boleh).toBe(true)
    expect(h.sisa).toBe(12)
    expect(h.alasan).toBeNull()
  })

  it('penarikan MELEBIHI sisa ditolak, dan alasannya menyebut ANGKANYA', () => {
    // Constraint DB menolak dengan 23514 yang tak memberi tahu sisa berapa.
    // Yang mengisi form butuh angkanya, bukan penolakan telanjang.
    const h = bolehTarikKuota(ITEM, 15)
    expect(h.boleh).toBe(false)
    expect(h.sisa).toBe(12)
    expect(h.alasan).toContain('12')
    expect(h.alasan).toContain('ton')
  })

  it('penarikan TEPAT sisa masih boleh — batasnya inklusif', () => {
    expect(bolehTarikKuota(ITEM, 12).boleh).toBe(true)
  })

  it('penarikan nol/negatif ditolak', () => {
    expect(bolehTarikKuota(ITEM, 0).boleh).toBe(false)
    expect(bolehTarikKuota(ITEM, -5).boleh).toBe(false)
  })

  it('item yang belum pernah ditarik punya sisa penuh', () => {
    const h = bolehTarikKuota({ ...ITEM, terpakai: null }, 100)
    expect(h.sisa).toBe(100)
    expect(h.boleh).toBe(true)
  })
})

describe('nilaiExpediting', () => {
  const DASAR = { id: 'e1', po_id: 'p1', po_number: 'PO-001', status: 'dalam_perjalanan' }

  // ── Cacat #2: telat diukur dari janji vendor, bukan kebutuhan kita ──────
  it('telat dihitung dari KEBUTUHAN kita, bukan dari janji vendor', () => {
    const h = nilaiExpediting([{
      ...DASAR,
      butuh_tanggal: '2026-07-25',      // kita butuh tanggal 25 Juli
      janji_vendor: '2026-08-10',       // vendor menjanjikan 10 Agustus
      perkiraan_tiba: '2026-08-10',
    }], HARI_INI)

    const e = h.kiriman[0]
    // Terhadap kebutuhan: telat 16 hari — inilah yang menghentikan pekerjaan.
    expect(e.telatHari).toBe(16)
    // Terhadap janji vendor: tepat waktu. Percakapan yang berbeda.
    expect(e.telatDariJanji).toBe(0)
    // Vendor menjanjikan tanggal yang SUDAH lebih lambat dari kebutuhan.
    expect(e.janjiSudahTelat).toBe(true)
    expect(h.janjiSudahTelat).toBe(1)
  })

  it('vendor yang menjanjikan tepat waktu tapi TERLAMBAT — dua-duanya telat', () => {
    const h = nilaiExpediting([{
      ...DASAR,
      butuh_tanggal: '2026-07-25',
      janji_vendor: '2026-07-25',
      perkiraan_tiba: '2026-08-05',
    }], HARI_INI)
    expect(h.kiriman[0].telatHari).toBe(11)
    expect(h.kiriman[0].telatDariJanji).toBe(11)
    expect(h.kiriman[0].janjiSudahTelat).toBe(false)
  })

  it('kritis pada telat ≥7 hari, dan hanya yang BELUM tiba', () => {
    expect(AMBANG_TELAT_KRITIS).toBe(7)
    const belum = nilaiExpediting([{
      ...DASAR, butuh_tanggal: '2026-07-28', perkiraan_tiba: HARI_INI,
    }], HARI_INI)
    expect(belum.kiriman[0].telatHari).toBe(10)
    expect(belum.kiriman[0].kritis).toBe(true)

    // Yang SUDAH tiba tak bisa "kritis" lagi — keterlambatannya sudah
    // terjadi dan tercatat, bukan sesuatu yang masih bisa dikejar.
    const tiba = nilaiExpediting([{
      ...DASAR, status: 'tiba', butuh_tanggal: '2026-07-28', tiba_aktual: '2026-08-06',
    }], HARI_INI)
    expect(tiba.kiriman[0].telatHari).toBe(9)
    expect(tiba.kiriman[0].kritis).toBe(false)
    expect(tiba.kritis).toBe(0)
  })

  // ── Cacat #4: rata-rata yang menelan satu barang tertahan ───────────────
  it('yang dilaporkan telat TERPARAH, bukan rata-rata', () => {
    const h = nilaiExpediting([
      { ...DASAR, id: 'a', butuh_tanggal: '2026-08-06', perkiraan_tiba: '2026-08-07' },
      { ...DASAR, id: 'b', butuh_tanggal: '2026-08-06', perkiraan_tiba: '2026-08-07' },
      { ...DASAR, id: 'c', butuh_tanggal: '2026-07-15', perkiraan_tiba: '2026-08-07' },
    ], HARI_INI)

    // Rata-ratanya (1+1+23)/3 = 8,3 hari. Yang menghentikan pekerjaan
    // adalah yang 23 hari.
    expect(h.telatTerparah).toBe(23)
    expect(h.telat).toBe(3)
  })

  it('telat terparah `null` bila tak ada yang telat', () => {
    const h = nilaiExpediting([
      { ...DASAR, butuh_tanggal: '2026-09-01', perkiraan_tiba: '2026-08-20' },
    ], HARI_INI)
    // Bukan 0 — nol terbaca "telat nol hari", padahal tak ada yang telat.
    expect(h.telatTerparah).toBeNull()
    expect(h.telat).toBe(0)
  })

  it('yang TERTAHAN dihitung terpisah', () => {
    const h = nilaiExpediting([
      { ...DASAR, status: 'tertahan', sebab_tertahan: 'Ditahan bea cukai',
        butuh_tanggal: '2026-08-01', perkiraan_tiba: HARI_INI },
    ], HARI_INI)
    expect(h.tertahan).toBe(1)
  })

  it('tanpa tanggal kebutuhan, telat `null` — bukan 0', () => {
    const h = nilaiExpediting([{ ...DASAR, butuh_tanggal: null }], HARI_INI)
    expect(h.kiriman[0].telatHari).toBeNull()
    expect(h.kiriman[0].kritis).toBe(false)
  })
})

describe('nilaiNotaKredit', () => {
  const DASAR = { id: 'n1', nomor: 'CN-001', jenis: 'retur_barang' }

  // ── Cacat #3: disetujui tapi tak pernah diterapkan ──────────────────────
  it('DISETUJUI tapi tak pernah diterapkan = MENGGANTUNG', () => {
    expect(AMBANG_KREDIT_MENGGANTUNG).toBe(14)
    const h = nilaiNotaKredit([{
      ...DASAR, status: 'disetujui', jumlah: 25_000_000,
      diputuskan_pada: '2026-07-10', diterapkan_pada: null,
    }], HARI_INI)

    // Potongannya disepakati, tagihan penuh tetap dibayar. Uang hilang
    // dengan seluruh persetujuan lengkap.
    expect(h.nota[0].umurSetujuHari).toBe(28)
    expect(h.nota[0].menggantung).toBe(true)
    expect(h.menggantung).toBe(1)
    expect(h.nilaiMenggantung).toBe(25_000_000)
  })

  it('disetujui KEMARIN belum menggantung — masih wajar', () => {
    const h = nilaiNotaKredit([{
      ...DASAR, status: 'disetujui', jumlah: 5_000_000,
      diputuskan_pada: '2026-08-06',
    }], HARI_INI)
    expect(h.nota[0].menggantung).toBe(false)
    expect(h.nilaiMenggantung).toBe(0)
  })

  it('status masih "disetujui" tapi tanggal terap SUDAH ada -> tidak menggantung', () => {
    // Kejadian umum: potongan sudah diterapkan ke tagihan, tanggalnya
    // dicatat, tapi status barisnya belum diperbarui. Yang menentukan
    // BUKTI penerapannya, bukan kata di kolom status.
    const h = nilaiNotaKredit([{
      ...DASAR, status: 'disetujui', jumlah: 7_000_000,
      diputuskan_pada: '2026-01-01', diterapkan_pada: '2026-01-04',
    }], HARI_INI)
    expect(h.nota[0].umurSetujuHari).toBeGreaterThan(200)
    expect(h.nota[0].menggantung).toBe(false)
    expect(h.menggantung).toBe(0)
    expect(h.nilaiMenggantung).toBe(0)
  })

  it('yang SUDAH diterapkan tak pernah menggantung, seberapa pun lamanya', () => {
    const h = nilaiNotaKredit([{
      ...DASAR, status: 'diterapkan', jumlah: 9_000_000,
      diputuskan_pada: '2026-01-01', diterapkan_pada: '2026-01-05',
    }], HARI_INI)
    expect(h.nota[0].menggantung).toBe(false)
    expect(h.totalDiterapkan).toBe(9_000_000)
  })

  it('total disetujui mencakup yang sudah diterapkan', () => {
    const h = nilaiNotaKredit([
      { ...DASAR, id: 'a', status: 'disetujui', jumlah: 10_000_000, diputuskan_pada: '2026-08-05' },
      { ...DASAR, id: 'b', status: 'diterapkan', jumlah: 15_000_000,
        diputuskan_pada: '2026-07-01', diterapkan_pada: '2026-07-03' },
      { ...DASAR, id: 'c', status: 'ditolak', jumlah: 99_000_000, diputuskan_pada: '2026-07-01' },
    ], HARI_INI)

    // Ditolak TIDAK masuk: itu potongan yang tak pernah disepakati.
    expect(h.totalDisetujui).toBe(25_000_000)
    expect(h.totalDiterapkan).toBe(15_000_000)
  })

  it('DRAFT belum diputuskan — umur `null`, tak menggantung', () => {
    const h = nilaiNotaKredit([{
      ...DASAR, status: 'draft', jumlah: 3_000_000, diputuskan_pada: null,
    }], HARI_INI)
    expect(h.nota[0].umurSetujuHari).toBeNull()
    expect(h.nota[0].menggantung).toBe(false)
  })

  it('NUMERIC string dijumlah sebagai ANGKA, bukan digabung teks', () => {
    const h = nilaiNotaKredit([
      { ...DASAR, id: 'a', status: 'disetujui', jumlah: '1000000', diputuskan_pada: '2026-08-05' },
      { ...DASAR, id: 'b', status: 'disetujui', jumlah: '500000', diputuskan_pada: '2026-08-05' },
    ], HARI_INI)
    // Kalau digabung sebagai teks: "01000000500000".
    expect(h.totalDisetujui).toBe(1_500_000)
  })

  it('daftar kosong tak melempar', () => {
    const h = nilaiNotaKredit([], HARI_INI)
    expect(h.totalDisetujui).toBe(0)
    expect(h.menggantung).toBe(0)
  })
})
