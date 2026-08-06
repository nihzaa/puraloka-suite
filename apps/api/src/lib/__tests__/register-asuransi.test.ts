import { describe, it, expect } from 'vitest'
import {
  hitungRegisterAsuransi,
  AMBANG_SEGERA_HARI,
  type BarisPolis,
  type BarisProyek,
} from '../register-asuransi.js'

// ═════════════════════════════════════════════════════════════════════════════
// REGISTER ASURANSI — dokumen yang terlihat sah, tapi tak menanggung apa pun.
//
// Saat klaim terjadi, yang menentukan bukan "punya polis atau tidak"
// melainkan "apakah tanggal kejadiannya tertanggung". Tiga celah menghasilkan
// polis yang rapi di lemari dan tak berguna saat dibutuhkan:
//
//   polis MULAI setelah proyek jalan    → hari awal tanpa penanggung
//   polis BERAKHIR sebelum proyek usai  → hari akhir tanpa penanggung
//   polis sudah lewat masa berlakunya   → tak menanggung apa pun hari ini
//
// Tak satu pun melempar error. Semuanya menghasilkan daftar yang terlihat
// lengkap.
// ═════════════════════════════════════════════════════════════════════════════

const HARI_INI = '2026-08-06'

const P = (o: Partial<BarisPolis> & Pick<BarisPolis, 'periode_mulai' | 'periode_selesai'>): BarisPolis => ({
  id: 'pol1', project_id: 'p1', jenis: 'car',
  nomor_polis: 'POL-001', penerbit: 'PT Asuransi Uji', ...o,
})

const PR = (o: Partial<BarisProyek> = {}): BarisProyek => ({
  project_id: 'p1', project_name: 'Proyek Uji',
  start_date: '2026-01-01', end_date: '2026-12-31', ...o,
})

describe('hitungRegisterAsuransi — status menurut masa berlaku', () => {
  it('polis yang masih lama = aktif', () => {
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-12-31' })], [PR()], HARI_INI)
    expect(h.polis[0].status).toBe('aktif')
    expect(h.jumlah_aktif).toBe(1)
  })

  it('polis yang sudah lewat = kadaluarsa, sisa hari NEGATIF', () => {
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-06-30' })], [PR()], HARI_INI)
    expect(h.polis[0].status).toBe('kadaluarsa')
    expect(h.polis[0].sisa_hari).toBeLessThan(0)
    expect(h.jumlah_kadaluarsa).toBe(1)
  })

  it('polis yang BELUM MULAI bukan "aktif"', () => {
    // Polis terbit tapi baru berlaku bulan depan TIDAK menanggung apa pun
    // hari ini. Menyebutnya aktif membuat orang mengira sudah terlindungi.
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-09-01', periode_selesai: '2027-09-01' })], [PR()], HARI_INI)
    expect(h.polis[0].status).toBe('belum_berlaku')
    expect(h.polis[0].status).not.toBe('aktif')
    expect(h.jumlah_belum_berlaku).toBe(1)
    expect(h.jumlah_aktif).toBe(0)
  })

  it('polis yang berakhir dalam ambang = segera_berakhir', () => {
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-08-20' })], [PR()], HARI_INI)
    expect(h.polis[0].sisa_hari).toBe(14)
    expect(h.polis[0].status).toBe('segera_berakhir')
    expect(AMBANG_SEGERA_HARI).toBe(30)
  })

  it('status dibatalkan MENANG atas perhitungan tanggal', () => {
    // Polis yang dibatalkan tak menanggung apa pun walau periodenya masih
    // berjalan — dan tanggalnya sendiri tak menunjukkan pembatalan itu.
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', status: 'dibatalkan' })],
      [PR()], HARI_INI)
    expect(h.polis[0].status).toBe('dibatalkan')
    expect(h.jumlah_aktif).toBe(0)
  })
})

describe('hitungRegisterAsuransi — CELAH pertanggungan', () => {
  it('polis MULAI setelah proyek jalan meninggalkan celah awal', () => {
    // Proyek mulai 1 Jan, polis baru berlaku 1 Feb → 31 hari tanpa penanggung.
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-02-01', periode_selesai: '2026-12-31' })],
      [PR({ start_date: '2026-01-01', end_date: '2026-12-31' })], HARI_INI)
    expect(h.polis[0].celah_awal).toBe(31)
    expect(h.polis[0].celah_akhir).toBe(0)
    expect(h.polis[0].celah_hari).toBe(31)
    expect(h.jumlah_ada_celah).toBe(1)
  })

  it('polis BERAKHIR sebelum proyek usai meninggalkan celah akhir', () => {
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-11-30' })],
      [PR({ start_date: '2026-01-01', end_date: '2026-12-31' })], HARI_INI)
    expect(h.polis[0].celah_awal).toBe(0)
    expect(h.polis[0].celah_akhir).toBe(31)
    expect(h.polis[0].celah_hari).toBe(31)
  })

  it('celah awal dan akhir TIDAK saling menutupi', () => {
    // Ini jebakannya: polis telat 10 hari di depan TAPI lebih 10 hari di
    // belakang. Kalau dihitung sebagai satu selisih, hasilnya "pas" — padahal
    // 10 hari pertama proyek benar-benar tak tertanggung.
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-11', periode_selesai: '2027-01-10' })],
      [PR({ start_date: '2026-01-01', end_date: '2026-12-31' })], HARI_INI)
    expect(h.polis[0].celah_awal).toBe(10)
    expect(h.polis[0].celah_akhir).toBe(0)
    expect(h.polis[0].celah_hari).toBe(10)   // BUKAN 0
  })

  it('polis yang menutupi penuh punya celah 0', () => {
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2025-12-01', periode_selesai: '2027-01-31' })],
      [PR({ start_date: '2026-01-01', end_date: '2026-12-31' })], HARI_INI)
    expect(h.polis[0].celah_hari).toBe(0)
    expect(h.jumlah_ada_celah).toBe(0)
  })

  it('tanggal proyek TAK DIKETAHUI → celah null, BUKAN 0', () => {
    // 0 terbaca "tertanggung penuh" — kabar baik palsu pada data yang tak
    // diketahui. null menyatakan "tak bisa dihitung".
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-12-31' })],
      [PR({ start_date: null, end_date: null })], HARI_INI)
    expect(h.polis[0].celah_hari).toBeNull()
    expect(h.jumlah_ada_celah).toBe(0)
  })
})

describe('hitungRegisterAsuransi — yang tak boleh hilang dari laporan', () => {
  it('proyek TANPA polis dinyatakan, tidak menghilang', () => {
    // "Nol polis kadaluarsa" terbaca "semuanya aman" — padahal bisa jadi
    // tak ada polisnya sama sekali. Ini kebalikan risiko yang sama.
    const h = hitungRegisterAsuransi(
      [P({ project_id: 'p1', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31' })],
      [PR({ project_id: 'p1' }), PR({ project_id: 'p2', project_name: 'Tanpa Polis' })],
      HARI_INI)
    expect(h.jumlah_kadaluarsa).toBe(0)
    expect(h.proyek_tanpa_polis).toHaveLength(1)
    expect(h.proyek_tanpa_polis[0].project_name).toBe('Tanpa Polis')
  })

  it('total pertanggungan TIDAK memuat polis kadaluarsa/dibatalkan', () => {
    // Menjumlahkan polis mati membuat perusahaan tampak terlindungi oleh
    // pertanggungan yang sudah tak berlaku.
    const h = hitungRegisterAsuransi(
      [
        P({ id: 'a', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', nilai_pertanggungan: 1_000_000_000 }),
        P({ id: 'b', periode_mulai: '2026-01-01', periode_selesai: '2026-06-30', nilai_pertanggungan: 5_000_000_000 }),
        P({ id: 'c', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', nilai_pertanggungan: 9_000_000_000, status: 'dibatalkan' }),
      ],
      [PR()], HARI_INI)
    expect(h.total_nilai_pertanggungan).toBe(1_000_000_000)
  })

  it('yang KADALUARSA diurutkan paling atas — walau celahnya lebih kecil', () => {
    // Polis yang sudah mati adalah risiko yang sedang berjalan, bukan arsip.
    //
    // ⚠️ Uji versi pertama memakai dua polis yang celahnya sama, sehingga ia
    // lulus lewat pemecah seri berikutnya (`periode_selesai`) — bukan lewat
    // status. Mutasi "buang urutan status" LOLOS (2026-08-06).
    //
    // Sekarang yang AKTIF sengaja diberi celah JAUH LEBIH BESAR: kalau
    // urutannya tak lagi menimbang status, ia akan naik ke atas.
    const h = hitungRegisterAsuransi(
      [
        P({
          id: 'aktif-celah-besar', periode_mulai: '2026-06-01', periode_selesai: '2026-12-31',
        }),
        P({
          id: 'mati-celah-kecil', periode_mulai: '2026-01-01', periode_selesai: '2026-05-01',
        }),
      ],
      [PR({ start_date: '2026-01-01', end_date: '2026-12-31' })], HARI_INI)

    // aktif punya celah awal 151 hari; mati punya celah akhir 244 hari…
    // yang menentukan urutan HARUS statusnya, bukan besar celahnya.
    expect(h.polis[0].status).toBe('kadaluarsa')
    expect(h.polis[0].id).toBe('mati-celah-kecil')
    expect(h.polis[1].status).toBe('aktif')
  })

  it('urutan menimbang status LEBIH DULU daripada celah', () => {
    // Pembanding langsung: polis aktif dengan celah TERBESAR tetap di bawah
    // polis kadaluarsa yang celahnya nol.
    const h = hitungRegisterAsuransi(
      [
        P({ id: 'aktif-celah-300', periode_mulai: '2026-11-01', periode_selesai: '2027-12-31' }),
        P({ id: 'mati-celah-0', periode_mulai: '2025-01-01', periode_selesai: '2026-07-01' }),
      ],
      [PR({ start_date: '2026-01-01', end_date: '2026-06-30' })], HARI_INI)
    expect(h.polis[0].id).toBe('mati-celah-0')
    expect(h.polis[0].celah_hari).toBe(0)
    expect(h.polis[1].celah_hari).toBeGreaterThan(0)
  })
})

describe('hitungRegisterAsuransi — jalan lain di mana angkanya bisa salah', () => {
  it('NUMERIC berupa STRING dijumlahkan sebagai angka', () => {
    const h = hitungRegisterAsuransi(
      [
        P({ id: 'a', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', nilai_pertanggungan: '1000000' }),
        P({ id: 'b', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', nilai_pertanggungan: '2000000' }),
      ],
      [PR()], HARI_INI)
    expect(h.total_nilai_pertanggungan).toBe(3_000_000)
  })

  it('nilai pertanggungan null tetap null, tak jadi 0 di baris', () => {
    // Bedanya: "belum diisi" vs "nol rupiah dipertanggungkan".
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', nilai_pertanggungan: null })],
      [PR()], HARI_INI)
    expect(h.polis[0].nilai_pertanggungan).toBeNull()
    expect(Number.isNaN(h.total_nilai_pertanggungan)).toBe(false)
  })

  it('jenis "lainnya" memakai jenis_lain sebagai label', () => {
    const h = hitungRegisterAsuransi(
      [P({ jenis: 'lainnya', jenis_lain: 'Asuransi Alat Berat', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31' })],
      [PR()], HARI_INI)
    expect(h.polis[0].jenis_label).toBe('Asuransi Alat Berat')
  })

  it('jenis baku memakai label bakunya, bukan jenis_lain', () => {
    const h = hitungRegisterAsuransi(
      [P({ jenis: 'car', jenis_lain: 'jangan dipakai', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31' })],
      [PR()], HARI_INI)
    expect(h.polis[0].jenis_label).toContain('CAR')
    expect(h.polis[0].jenis_label).not.toBe('jangan dipakai')
  })

  it('proyek yang tak ada di daftar tak membuat NaN', () => {
    const h = hitungRegisterAsuransi(
      [P({ project_id: 'entah', periode_mulai: '2026-01-01', periode_selesai: '2026-12-31' })],
      [], HARI_INI)
    expect(h.polis[0].project_name).toBe('—')
    expect(h.polis[0].celah_hari).toBeNull()
    expect(Number.isNaN(h.polis[0].sisa_hari)).toBe(false)
  })

  it('berakhir TEPAT hari ini masih dianggap berlaku', () => {
    // Polis berlaku sampai akhir hari terakhirnya. Menyebutnya kadaluarsa
    // sehari lebih awal menolak klaim yang sebenarnya sah.
    const h = hitungRegisterAsuransi(
      [P({ periode_mulai: '2026-01-01', periode_selesai: HARI_INI })], [PR()], HARI_INI)
    expect(h.polis[0].sisa_hari).toBe(0)
    expect(h.polis[0].status).not.toBe('kadaluarsa')
    expect(h.polis[0].status).toBe('segera_berakhir')
  })
})
