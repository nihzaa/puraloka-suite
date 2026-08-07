import { describe, it, expect } from 'vitest'
import {
  nilaiRegisterGambar, nilaiTransmittal, nilaiTindakan, nilaiJadwalLaporan,
  AMBANG_MENGGANTUNG_HARI, AMBANG_MACET,
} from '../kendali-dokumen.js'

const HARI_INI = '2026-08-07'

describe('nilaiRegisterGambar', () => {
  // ── Cacat #1: gambar "berlaku" yang sudah punya revisi lebih baru ───────
  //
  // Tukang mengerjakan rev-2 karena rev-3 tak pernah sampai. Pekerjaan
  // dibongkar, dan yang menanggung biayanya ditentukan siapa yang punya
  // bukti kirim.
  it('gambar berstatus BERLAKU yang sudah ada revisi lebih baru = USANG', () => {
    const h = nilaiRegisterGambar([
      { id: '1', nomor: 'STR-101', revisi: 2, status: 'berlaku' },
      { id: '2', nomor: 'STR-101', revisi: 3, status: 'berlaku' },
    ])

    const rev2 = h.gambar.find((g) => g.id === '1')!
    const rev3 = h.gambar.find((g) => g.id === '2')!

    // Kolom `status` keduanya 'berlaku' — memperbarui status revisi lama
    // adalah langkah manual yang mudah terlupa. Yang menentukan di sini
    // ADANYA revisi lebih tinggi, bukan kata di kolom.
    expect(rev2.usang).toBe(true)
    expect(rev3.usang).toBe(false)
    expect(h.usang).toBe(1)
  })

  it('revisi tertinggi benar meski barisnya TIDAK urut', () => {
    // Register nyata jarang urut: revisi baru disisipkan, revisi lama
    // diimpor belakangan. Implementasi yang cuma mengingat "nilai terakhir"
    // akan benar untuk data terurut naik dan salah untuk yang lain.
    const h = nilaiRegisterGambar([
      { id: '1', nomor: 'STR-101', revisi: 3, status: 'berlaku' },
      { id: '2', nomor: 'STR-101', revisi: 1, status: 'berlaku' },
      { id: '3', nomor: 'STR-101', revisi: 2, status: 'berlaku' },
    ])
    expect(h.gambar.find((g) => g.id === '1')!.revisiTertinggi).toBe(3)
    expect(h.gambar.find((g) => g.id === '1')!.usang).toBe(false)
    expect(h.gambar.find((g) => g.id === '2')!.usang).toBe(true)
    expect(h.gambar.find((g) => g.id === '3')!.usang).toBe(true)
    expect(h.usang).toBe(2)
  })

  it('revisi tertinggi dihitung per NOMOR, bukan lintas seluruh proyek', () => {
    const h = nilaiRegisterGambar([
      { id: '1', nomor: 'STR-101', revisi: 1, status: 'berlaku' },
      { id: '2', nomor: 'ARS-201', revisi: 5, status: 'berlaku' },
    ])
    // STR-101 rev-1 TIDAK usang hanya karena ada ARS-201 rev-5.
    expect(h.gambar.find((g) => g.id === '1')!.usang).toBe(false)
    expect(h.usang).toBe(0)
    expect(h.jumlahJudul).toBe(2)
  })

  it('gambar DIGANTIKAN tanpa menyebut penggantinya dihitung', () => {
    // Yang membacanya tahu gambar ini mati, tapi tak tahu mana yang hidup —
    // dan tetap mengerjakan yang lama karena itu satu-satunya yang ia punya.
    const h = nilaiRegisterGambar([
      { id: '1', nomor: 'STR-101', revisi: 1, status: 'digantikan', digantikan_oleh: null },
      { id: '2', nomor: 'STR-102', revisi: 1, status: 'digantikan', digantikan_oleh: 'x' },
    ])
    expect(h.gantungTanpaPengganti).toBe(1)
  })

  it('jumlah JUDUL berbeda dari jumlah baris — satu nomor punya banyak revisi', () => {
    const h = nilaiRegisterGambar([
      { id: '1', nomor: 'STR-101', revisi: 0, status: 'digantikan', digantikan_oleh: '2' },
      { id: '2', nomor: 'STR-101', revisi: 1, status: 'digantikan', digantikan_oleh: '3' },
      { id: '3', nomor: 'STR-101', revisi: 2, status: 'berlaku' },
    ])
    expect(h.total).toBe(3)
    expect(h.jumlahJudul).toBe(1)
    expect(h.usang).toBe(0)
  })

  it('register kosong tak melempar', () => {
    const h = nilaiRegisterGambar([])
    expect(h.total).toBe(0)
    expect(h.jumlahJudul).toBe(0)
    expect(h.usang).toBe(0)
  })
})

describe('nilaiTransmittal', () => {
  // ── Cacat #2: "terkirim" yang tak pernah dikonfirmasi ───────────────────
  it('dikirim SEPEKAN tanpa konfirmasi terima = MENGGANTUNG', () => {
    expect(AMBANG_MENGGANTUNG_HARI).toBe(7)
    const h = nilaiTransmittal([
      { id: '1', nomor: 'TR-001', status: 'dikirim', dikirim_pada: '2026-07-25' },
    ], HARI_INI)
    expect(h.transmittal[0].umurHari).toBe(13)
    expect(h.transmittal[0].menggantung).toBe(true)
    expect(h.menggantung).toBe(1)
  })

  it('dikirim HARI INI belum menggantung — bukan sekadar "belum diterima"', () => {
    const h = nilaiTransmittal([
      { id: '1', nomor: 'TR-002', status: 'dikirim', dikirim_pada: HARI_INI },
    ], HARI_INI)
    expect(h.transmittal[0].menggantung).toBe(false)
    expect(h.menggantung).toBe(0)
  })

  it('yang SUDAH diterima tak pernah menggantung, seberapa pun lamanya', () => {
    const h = nilaiTransmittal([
      { id: '1', nomor: 'TR-003', status: 'diterima',
        dikirim_pada: '2026-01-01', diterima_pada: '2026-01-03' },
    ], HARI_INI)
    expect(h.transmittal[0].menggantung).toBe(false)
    expect(h.diterima).toBe(1)
  })

  it('status masih "dikirim" tapi tanggal terima SUDAH ada -> tidak menggantung', () => {
    // Kejadian umum: penerima mengonfirmasi, tanggalnya dicatat, tapi
    // status barisnya belum diperbarui. Yang menentukan BUKTI terimanya,
    // bukan kata di kolom status.
    const h = nilaiTransmittal([
      { id: '1', nomor: 'TR-005', status: 'dikirim',
        dikirim_pada: '2026-01-01', diterima_pada: '2026-01-04' },
    ], HARI_INI)
    expect(h.transmittal[0].umurHari).toBeGreaterThan(200)
    expect(h.transmittal[0].menggantung).toBe(false)
    expect(h.menggantung).toBe(0)
  })

  it('rasio diterima `null` saat belum ada yang dikirim, BUKAN 0%', () => {
    const h = nilaiTransmittal([
      { id: '1', nomor: 'TR-004', status: 'draft' },
    ], HARI_INI)
    // 0% terbaca "tak ada yang mengonfirmasi" — padahal belum ada yang perlu.
    expect(h.rasioDiterima).toBeNull()
    expect(h.terkirim).toBe(0)
  })

  it('rasio dihitung dari yang DIKIRIM, bukan dari seluruh baris', () => {
    const h = nilaiTransmittal([
      { id: '1', nomor: 'A', status: 'draft' },
      { id: '2', nomor: 'B', status: 'dikirim', dikirim_pada: '2026-08-01' },
      { id: '3', nomor: 'C', status: 'diterima',
        dikirim_pada: '2026-08-01', diterima_pada: '2026-08-02' },
    ], HARI_INI)
    // 1 dari 2 yang dikirim = 50%. Draft tak ikut jadi penyebut.
    expect(h.terkirim).toBe(2)
    expect(h.rasioDiterima).toBe(50)
  })
})

describe('nilaiTindakan', () => {
  // ── Cacat #3: butir lewat tenggat tenggelam di antara yang selesai ──────
  it('butir TERBUKA yang lewat tenggat ditandai', () => {
    const h = nilaiTindakan([
      { id: '1', status: 'terbuka', tenggat: '2026-07-30' },
      { id: '2', status: 'terbuka', tenggat: '2026-08-20' },
    ], HARI_INI)
    expect(h.tindakan[0].lewatTenggat).toBe(true)
    expect(h.tindakan[0].sisaHari).toBe(-8)
    expect(h.tindakan[1].lewatTenggat).toBe(false)
    expect(h.lewatTenggat).toBe(1)
  })

  it('butir SELESAI yang tenggatnya lewat BUKAN masalah — sudah dikerjakan', () => {
    const h = nilaiTindakan([
      { id: '1', status: 'selesai', tenggat: '2026-01-01', selesai_pada: '2026-01-05' },
    ], HARI_INI)
    expect(h.tindakan[0].lewatTenggat).toBe(false)
    expect(h.lewatTenggat).toBe(0)
  })

  it('butir terbuka TANPA tenggat dinyatakan terpisah — ia hanya mengendap', () => {
    // Tak akan pernah muncul sebagai "lewat tenggat", jadi kalau tak
    // dihitung tersendiri ia tak pernah terlihat sama sekali.
    const h = nilaiTindakan([
      { id: '1', status: 'terbuka', tenggat: null },
      { id: '2', status: 'terbuka', tenggat: '2026-09-01' },
    ], HARI_INI)
    expect(h.tanpaTenggat).toBe(1)
    expect(h.lewatTenggat).toBe(0)
  })

  it('DIBATALKAN tak masuk penyebut — persentase tak bisa dinaikkan dengan membatalkan', () => {
    const h = nilaiTindakan([
      { id: '1', status: 'selesai', selesai_pada: '2026-08-01' },
      { id: '2', status: 'terbuka' },
      { id: '3', status: 'dibatalkan' },
      { id: '4', status: 'dibatalkan' },
    ], HARI_INI)
    // 1 selesai dari 2 relevan = 50%. Kalau dibatalkan ikut jadi "bukan
    // terbuka", angkanya jadi 75% hanya dengan membatalkan dua butir.
    expect(h.persenSelesai).toBe(50)
  })

  it('persen selesai `null` saat belum ada butir sama sekali', () => {
    expect(nilaiTindakan([], HARI_INI).persenSelesai).toBeNull()
  })
})

describe('nilaiJadwalLaporan', () => {
  // ── Cacat #4: jadwal yang diam-diam berhenti terkirim ───────────────────
  it('gagal berturut mencapai ambang = MACET', () => {
    expect(AMBANG_MACET).toBe(3)
    const h = nilaiJadwalLaporan([
      { id: '1', nama: 'Laporan mingguan', irama: 'mingguan', aktif: true,
        terakhir_dikirim: '2026-08-05', gagal_berturut: 3 },
    ], HARI_INI)
    expect(h.jadwal[0].macet).toBe(true)
    expect(h.macet).toBe(1)
  })

  it('MACET juga saat telat jauh, meski nol galat tercatat', () => {
    // Proses penjadwalnya mati: tak ada galat, tak ada gejala, laporan
    // berhenti datang. Justru bentuk inilah yang paling lama tak ketahuan.
    const h = nilaiJadwalLaporan([
      { id: '1', nama: 'Laporan mingguan', irama: 'mingguan', aktif: true,
        terakhir_dikirim: '2026-06-01', gagal_berturut: 0 },
    ], HARI_INI)
    expect(h.jadwal[0].macet).toBe(true)
  })

  it('telat SEHARI pada laporan mingguan bukan macet — ada toleransi 2x irama', () => {
    const h = nilaiJadwalLaporan([
      { id: '1', nama: 'Mingguan', irama: 'mingguan', aktif: true,
        terakhir_dikirim: '2026-07-31', gagal_berturut: 0 },
    ], HARI_INI)
    expect(h.jadwal[0].umurKirimHari).toBe(7)
    expect(h.jadwal[0].macet).toBe(false)
  })

  it('jadwal TIDAK AKTIF tak pernah disebut macet', () => {
    // Dimatikan dengan sengaja bukan kegagalan.
    const h = nilaiJadwalLaporan([
      { id: '1', nama: 'Lama', irama: 'harian', aktif: false,
        terakhir_dikirim: '2025-01-01', gagal_berturut: 99 },
    ], HARI_INI)
    expect(h.jadwal[0].macet).toBe(false)
    expect(h.macet).toBe(0)
    expect(h.aktif).toBe(0)
  })

  it('belum pernah terkirim: umur `null`, dan tak dituduh telat tanpa galat', () => {
    const h = nilaiJadwalLaporan([
      { id: '1', nama: 'Baru', irama: 'bulanan', aktif: true,
        terakhir_dikirim: null, gagal_berturut: 0 },
    ], HARI_INI)
    expect(h.jadwal[0].umurKirimHari).toBeNull()
    expect(h.jadwal[0].macet).toBe(false)
  })

  it('NUMERIC string dari Postgres dibaca sebagai angka', () => {
    // Catatan jujur: `>=` di JavaScript SELALU memaksa string jadi angka,
    // jadi `angka()` di jalur ini tak mengubah hasil — mutasi yang
    // menghapusnya terbukti SETARA, bukan lolos karena test lemah. Test ini
    // tetap ada supaya bentuk masukan dari Postgres (string) terkunci, kalau
    // nanti perbandingannya berubah jadi operasi yang TIDAK memaksa.
    for (const nilai of ['3', '10', 3, 10]) {
      const h = nilaiJadwalLaporan([
        { id: '1', nama: 'X', irama: 'harian', aktif: true,
          terakhir_dikirim: HARI_INI, gagal_berturut: nilai },
      ], HARI_INI)
      expect(h.jadwal[0].macet).toBe(true)
    }

    for (const nilai of ['0', '2', 0, 2]) {
      const h = nilaiJadwalLaporan([
        { id: '1', nama: 'X', irama: 'harian', aktif: true,
          terakhir_dikirim: HARI_INI, gagal_berturut: nilai },
      ], HARI_INI)
      expect(h.jadwal[0].macet).toBe(false)
    }
  })
})
