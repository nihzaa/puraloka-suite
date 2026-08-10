import { describe, it, expect } from 'vitest'
import { inspeksiLayakNcr, ringkasKandidatNcr, type InspeksiRingkas } from '../inspeksi-ke-ncr.js'

/**
 * Inspeksi mana yang SEHARUSNYA melahirkan NCR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-11:
 *
 *   inspection_requests   24 baris   — 3 di antaranya `tidak_lolos`
 *   ncr_items             18 baris   — `inspection_request_id` terisi: **0**
 *
 * Kolomnya ada. Rute `POST /ncr` menerimanya (`ncr.ts:218`). Datanya ada di
 * KEDUA sisi. Yang tak ada: satu pun cara di UI untuk mengirimkannya.
 *
 * Kelas cacat yang sama untuk kelima kalinya (`rfq.po_id`, endpoint
 * penawaran, `rfq.mr_id`, `sumber_change_order_id`, geotag): tiap bagian ada
 * dan ber-test sendiri-sendiri, hanya sambungannya yang tidak.
 *
 * ── Kenapa ini lebih dari sekadar kolom kosong
 *
 * Inspeksi `tidak_lolos` yang tak melahirkan NCR adalah **temuan mutu yang
 * hilang**. Pemeriksanya sudah menyatakan pekerjaan itu tidak lolos; kalau
 * jejaknya berhenti di situ, tak ada yang menugaskan perbaikan, tak ada yang
 * memverifikasi, dan saat auditor bertanya "apa tindak lanjut atas temuan
 * ini", jawabannya cuma ingatan orang.
 *
 * Tiga inspeksi gagal di basis hari ini — waterproofing, instalasi listrik,
 * pasangan bata. Ketiganya jenis pekerjaan yang kalau salah, ketahuannya
 * setelah tertutup pekerjaan lain.
 *
 * ── Kenapa MENGUSULKAN, bukan membuat otomatis
 *
 * NCR punya konsekuensi: ia menugaskan orang, memasang target waktu, dan
 * angka `biaya_dampak`-nya masuk laporan. NCR yang lahir sendiri dari status
 * inspeksi akan membanjiri daftar dengan temuan yang belum tentu perlu
 * diformalkan — dan daftar yang dibanjiri berhenti dibaca.
 *
 * Pola yang sama dengan `saran-cost-map.ts`: usulkan, manusia memutuskan.
 */

const i = (o: Partial<InspeksiRingkas>): InspeksiRingkas => ({
  id: 'x', nomor: 'IR-001', judul: 'Inspeksi uji', status: 'tidak_lolos',
  lokasi: null, hasil_catatan: null, rab_item_id: null, work_scope_id: null,
  diperiksa_pada: '2026-08-01', sudah_ber_ncr: false, ...o,
})

describe('inspeksiLayakNcr — yang tidak lolos', () => {
  it('inspeksi TIDAK LOLOS layak jadi NCR', () => {
    expect(inspeksiLayakNcr(i({})).layak).toBe(true)
  })

  // INVARIAN. Inspeksi yang LOLOS tak punya temuan untuk diformalkan;
  // membuat NCR darinya menuduh pekerjaan yang sudah dinyatakan benar.
  it('inspeksi LOLOS tidak layak', () => {
    const h = inspeksiLayakNcr(i({ status: 'lolos' }))
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/lolos/i)
  })

  it('inspeksi yang BELUM diperiksa tidak layak', () => {
    for (const st of ['diminta', 'dijadwalkan']) {
      const h = inspeksiLayakNcr(i({ status: st }))
      expect(h.layak).toBe(false)
      expect(h.sebab).toMatch(/belum diperiksa/i)
    }
  })

  // Gagal-tertutup: status baru yang belum dipertimbangkan TIDAK otomatis
  // jadi kandidat. Membanjiri daftar NCR dengan usulan yang salah membuat
  // seluruh daftarnya berhenti dibaca.
  it('status tak dikenal tidak layak (gagal-tertutup)', () => {
    expect(inspeksiLayakNcr(i({ status: 'entah_apa' })).layak).toBe(false)
  })
})

describe('inspeksiLayakNcr — yang SUDAH punya NCR', () => {
  // Mengusulkan NCR untuk inspeksi yang sudah punya menghasilkan dua NCR
  // untuk satu temuan — dan dua tugas perbaikan untuk satu pekerjaan.
  it('inspeksi yang sudah ber-NCR tidak diusulkan lagi', () => {
    const h = inspeksiLayakNcr(i({ sudah_ber_ncr: true }))
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/sudah punya NCR/i)
  })
})

describe('inspeksiLayakNcr — bahan yang dibawa ke NCR', () => {
  // NCR yang lahir dari inspeksi harus MEWARISI konteksnya. Tanpa itu,
  // orang yang menerima tugas perbaikan tak tahu pekerjaan mana yang
  // dimaksud, dan harus mencari sendiri.
  it('membawa judul, lokasi, dan catatan hasil pemeriksaan', () => {
    const h = inspeksiLayakNcr(i({
      judul: 'Inspeksi waterproofing',
      lokasi: 'Lantai 2 area basah',
      hasil_catatan: 'Lapisan tidak merata di 3 titik',
    }))
    expect(h.usul?.judul).toContain('waterproofing')
    expect(h.usul?.lokasi).toBe('Lantai 2 area basah')
    expect(h.usul?.deskripsi).toContain('tidak merata')
  })

  // Tautan ke pekerjaan RAB/scope dibawa apa adanya — itulah yang membuat
  // NCR bisa ditelusuri ke biaya dan ke mandor yang mengerjakan.
  it('meneruskan rab_item_id dan work_scope_id', () => {
    const h = inspeksiLayakNcr(i({ rab_item_id: 'r1', work_scope_id: 'w1' }))
    expect(h.usul?.rab_item_id).toBe('r1')
    expect(h.usul?.work_scope_id).toBe('w1')
  })

  // Catatan hasil kosong TIDAK menghasilkan deskripsi kosong: NCR tanpa
  // deskripsi tak bisa ditindaklanjuti siapa pun. Diisi rujukan inspeksinya,
  // supaya penerima tugas setidaknya tahu ke mana mencari.
  it('tanpa catatan hasil, deskripsi menunjuk nomor inspeksinya', () => {
    const h = inspeksiLayakNcr(i({ nomor: 'IR-2608-007', hasil_catatan: null }))
    expect(h.usul?.deskripsi).toContain('IR-2608-007')
    expect(h.usul?.deskripsi.length).toBeGreaterThan(10)
  })

  // Severity TIDAK ditebak dari teks. Menebaknya berarti mesin memutuskan
  // seberapa gawat sebuah temuan mutu, dan angka itu mengalir ke prioritas
  // perbaikan. Dikosongkan supaya manusia memilih.
  it('severity TIDAK ditebak — dikosongkan untuk diisi manusia', () => {
    const h = inspeksiLayakNcr(i({ hasil_catatan: 'retak parah, bahaya!' }))
    expect(h.usul?.severity).toBeNull()
  })
})

describe('ringkasKandidatNcr — daftar untuk dipilih', () => {
  const daftar = [
    i({ id: 'a', nomor: 'IR-007', status: 'tidak_lolos' }),
    i({ id: 'b', nomor: 'IR-015', status: 'tidak_lolos' }),
    i({ id: 'c', nomor: 'IR-001', status: 'lolos' }),
    i({ id: 'd', nomor: 'IR-020', status: 'tidak_lolos', sudah_ber_ncr: true }),
  ]

  it('hanya yang layak yang diusulkan', () => {
    expect(ringkasKandidatNcr(daftar).kandidat).toHaveLength(2)
  })

  // Yang tak layak DIHITUNG. Daftar yang menyusut tanpa penjelasan membuat
  // orang bertanya "inspeksi saya ke mana".
  it('yang sudah ber-NCR dihitung terpisah, bukan dihilangkan', () => {
    const r = ringkasKandidatNcr(daftar)
    expect(r.sudah_ber_ncr).toBe(1)
    expect(r.jumlah_diperiksa).toBe(4)
  })

  it('daftar kosong tidak melempar', () => {
    expect(ringkasKandidatNcr([]).kandidat).toEqual([])
  })

  // Yang paling lama menganggur naik ke atas: temuan mutu yang dibiarkan
  // makin mahal diperbaiki karena pekerjaan lain menimpanya.
  it('diurutkan dari yang paling lama diperiksa', () => {
    const r = ringkasKandidatNcr([
      i({ id: 'baru', status: 'tidak_lolos', diperiksa_pada: '2026-08-10' }),
      i({ id: 'lama', status: 'tidak_lolos', diperiksa_pada: '2026-07-01' }),
    ])
    expect(r.kandidat[0].inspection_request_id).toBe('lama')
  })

  // Tanggal periksa yang kosong tak boleh melempar maupun naik ke atas
  // seolah paling mendesak.
  //
  // TIGA baris, bukan dua. Versi pertama test ini memakai dua baris, dan
  // mutasi `if (!a.diperiksa_pada) return -1` (yang MENAIKKAN yang kosong)
  // tetap HIJAU — dengan dua elemen, membalik satu perbandingan tak selalu
  // mengubah urutan yang teramati. Ketahuan dari mutation testing.
  it('tanggal periksa kosong turun ke BAWAH, bukan naik', () => {
    const r = ringkasKandidatNcr([
      i({ id: 'kosong', status: 'tidak_lolos', diperiksa_pada: null }),
      i({ id: 'lama', status: 'tidak_lolos', diperiksa_pada: '2026-07-01' }),
      i({ id: 'baru', status: 'tidak_lolos', diperiksa_pada: '2026-08-10' }),
    ])
    expect(r.kandidat).toHaveLength(3)
    expect(r.kandidat.map((k) => k.inspection_request_id)).toEqual(['lama', 'baru', 'kosong'])
  })

  // Deskripsi kosong TIDAK boleh lolos jadi string kosong: NCR tanpa
  // deskripsi tak bisa ditindaklanjuti siapa pun, dan yang menerima tugas
  // perbaikan tak punya cara tahu apa yang salah.
  it('catatan hasil berisi SPASI SAJA diperlakukan kosong', () => {
    const h = inspeksiLayakNcr(i({ nomor: 'IR-099', hasil_catatan: '   \n  \t ' }))
    expect(h.usul?.deskripsi).toContain('IR-099')
    expect(h.usul?.deskripsi.trim().length).toBeGreaterThan(10)
  })

  it('catatan hasil string KOSONG diperlakukan kosong', () => {
    const h = inspeksiLayakNcr(i({ nomor: 'IR-100', hasil_catatan: '' }))
    expect(h.usul?.deskripsi).toContain('IR-100')
  })
})
