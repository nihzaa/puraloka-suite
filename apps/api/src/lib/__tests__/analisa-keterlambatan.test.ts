import { describe, it, expect } from 'vitest'
import {
  analisaKeterlambatan,
  type BarisMilestone,
  type ParamProyek,
} from '../analisa-keterlambatan.js'

// ═════════════════════════════════════════════════════════════════════════════
// ANALISA KETERLAMBATAN — angka yang MENUDUH, dan angka yang MEMBEBASKAN.
//
// "Telat 67 hari" pada proyek yang EOT-nya disetujui 60 hari adalah tuduhan
// atas keterlambatan yang secara kontrak tak pernah terjadi — dan bisa
// dibantah dengan satu lembar surat.
//
// Sebaliknya, "tak ada telat" pada proyek yang benar-benar mundur membuat
// klaim EOT lewat tenggat pengajuannya. Kedua arah mahal, dan keduanya TIDAK
// melempar error.
// ═════════════════════════════════════════════════════════════════════════════

const HARI_INI = '2026-08-06'

const M = (o: Partial<BarisMilestone> & Pick<BarisMilestone, 'target_date'>): BarisMilestone => ({
  id: 'ms1', project_id: 'p1', title: 'Struktur selesai', ...o,
})

const P = (o: Partial<ParamProyek> = {}): ParamProyek => ({
  project_id: 'p1', project_name: 'Proyek Uji', ...o,
})

describe('analisaKeterlambatan — dasar', () => {
  it('selesai TEPAT tenggat = tepat waktu, bukan telat 0 hari', () => {
    // Bedanya penting: "telat 0 hari" masuk daftar keterlambatan dan
    // menghebohkan orang atas pekerjaan yang justru tepat janji.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-06-01', completed_at: '2026-06-01' })], [P()], HARI_INI)
    expect(h.baris[0].status).toBe('tepat_waktu')
    expect(h.baris[0].telat_kotor).toBe(0)
    expect(h.jumlah_selesai_terlambat).toBe(0)
  })

  it('selesai SESUDAH tenggat = selesai_terlambat, angkanya final', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-06-01', completed_at: '2026-06-11' })], [P()], HARI_INI)
    expect(h.baris[0].status).toBe('selesai_terlambat')
    expect(h.baris[0].telat_efektif).toBe(10)
    expect(h.baris[0].masih_bertambah).toBe(false)
  })

  it('belum selesai & tenggat lewat = berjalan_terlambat, MASIH bertambah', () => {
    // Diukur dari HARI INI, bukan dari tanggal selesai yang belum ada.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })], [P()], HARI_INI)
    expect(h.baris[0].status).toBe('berjalan_terlambat')
    expect(h.baris[0].telat_efektif).toBe(7)     // 30 Jul → 6 Agu
    expect(h.baris[0].masih_bertambah).toBe(true)
  })

  it('belum selesai & tenggat BELUM lewat = belum_jatuh_tempo', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-12-31' })], [P()], HARI_INI)
    expect(h.baris[0].status).toBe('belum_jatuh_tempo')
    expect(h.baris[0].telat_kotor).toBe(0)
  })
})

describe('analisaKeterlambatan — EOT membebaskan, dan itu wajib dihitung', () => {
  it('EOT yang disetujui MENGURANGI hari telat', () => {
    // Telat kotor 30 hari, EOT disetujui 30 hari → secara kontrak TIDAK telat.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-07' })],
      [P({ eot_hari_disetujui: 30 })],
      HARI_INI)
    expect(h.baris[0].telat_kotor).toBe(30)
    expect(h.baris[0].eot_hari).toBe(30)
    expect(h.baris[0].telat_efektif).toBe(0)
    expect(h.baris[0].status).toBe('dimaafkan_eot')
    expect(h.jumlah_dimaafkan_eot).toBe(1)
  })

  it('EOT sebagian menyisakan telat efektif', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-07' })],
      [P({ eot_hari_disetujui: 20 })],
      HARI_INI)
    expect(h.baris[0].telat_efektif).toBe(10)
    expect(h.baris[0].status).toBe('berjalan_terlambat')
  })

  it('EOT lebih besar dari telat tidak membuat angkanya NEGATIF', () => {
    // Telat efektif −20 akan terbaca sebagai "lebih cepat 20 hari" di layar,
    // dan bisa mengurangi total paparan proyek lain kalau dijumlahkan.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-08-01' })],
      [P({ eot_hari_disetujui: 100 })],
      HARI_INI)
    expect(h.baris[0].telat_efektif).toBe(0)
    expect(h.baris[0].telat_efektif).toBeGreaterThanOrEqual(0)
  })

  it('grace days ikut mengurangi, di ATAS EOT', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-07' })],
      [P({ eot_hari_disetujui: 20, penalty_grace_days: 5 })],
      HARI_INI)
    expect(h.baris[0].telat_efektif).toBe(5)   // 30 − 20 − 5
  })
})

describe('analisaKeterlambatan — paparan rupiah', () => {
  const AKTIF = { penalty_enabled: true, penalty_rate_per_day: 500_000 }

  it('paparan = tarif × hari telat efektif', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })], [P(AKTIF)], HARI_INI)
    expect(h.baris[0].telat_efektif).toBe(7)
    expect(h.baris[0].estimasi_paparan).toBe(3_500_000)
    expect(h.total_estimasi_paparan).toBe(3_500_000)
  })

  it('denda MATI → paparan null, BUKAN 0', () => {
    // 0 terbaca "tak ada risiko"; null menyatakan "tak bisa dihitung".
    // Bedanya menentukan apakah orang mengabaikannya atau memeriksanya.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })],
      [P({ penalty_enabled: false, penalty_rate_per_day: 500_000 })],
      HARI_INI)
    expect(h.baris[0].estimasi_paparan).toBeNull()
    expect(h.baris[0].telat_efektif).toBe(7)   // telatnya TETAP dilaporkan
    expect(h.jumlah_proyek_denda_mati).toBe(1)
  })

  it('tarif NOL diperlakukan sama dengan denda mati', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })],
      [P({ penalty_enabled: true, penalty_rate_per_day: 0 })],
      HARI_INI)
    expect(h.baris[0].estimasi_paparan).toBeNull()
    expect(h.jumlah_proyek_denda_mati).toBe(1)
  })

  it('cap membatasi paparan, dan dinyatakan', () => {
    // Telat 7 hari × 500rb = 3,5jt, tapi cap 1% dari kontrak 100jt = 1jt.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })],
      [P({ ...AKTIF, penalty_cap_pct: 1, contract_value: 100_000_000 })],
      HARI_INI)
    expect(h.baris[0].estimasi_paparan).toBe(1_000_000)
    expect(h.baris[0].kena_cap).toBe(true)
  })

  it('cap yang belum tersentuh tidak menandai kena_cap', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })],
      [P({ ...AKTIF, penalty_cap_pct: 50, contract_value: 100_000_000 })],
      HARI_INI)
    expect(h.baris[0].estimasi_paparan).toBe(3_500_000)
    expect(h.baris[0].kena_cap).toBe(false)
  })

  it('denda aktif TANPA telat → paparan 0, bukan null', () => {
    // Bedanya: "sudah dihitung, hasilnya nol" vs "tak bisa dihitung".
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-06-01', completed_at: '2026-06-01' })],
      [P(AKTIF)], HARI_INI)
    expect(h.baris[0].estimasi_paparan).toBe(0)
  })

  it('paparan tak dihitung untuk telat yang sudah dimaafkan EOT', () => {
    // Menuduh secara rupiah atas keterlambatan yang secara kontrak tak
    // pernah terjadi adalah kesalahan yang paling mahal di modul ini.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-07' })],
      [P({ ...AKTIF, eot_hari_disetujui: 30 })],
      HARI_INI)
    expect(h.baris[0].status).toBe('dimaafkan_eot')
    expect(h.baris[0].estimasi_paparan).toBe(0)
    expect(h.total_estimasi_paparan).toBe(0)
  })
})

describe('analisaKeterlambatan — jalan lain di mana angkanya bisa salah', () => {
  it('NUMERIC berupa STRING dijumlahkan sebagai angka', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })],
      [P({ penalty_enabled: true, penalty_rate_per_day: '500000', eot_hari_disetujui: '2' })],
      HARI_INI)
    expect(h.baris[0].eot_hari).toBe(2)
    expect(h.baris[0].telat_efektif).toBe(5)
    expect(h.baris[0].estimasi_paparan).toBe(2_500_000)
  })

  it('timestamp dengan jam dipotong ke tanggal', () => {
    // `completed_at` bisa tiba sebagai ISO penuh. Tanpa dipotong, selisih
    // harinya bisa meleset satu karena jam.
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-06-01', completed_at: '2026-06-11T23:30:00.000Z' })],
      [P()], HARI_INI)
    expect(h.baris[0].telat_efektif).toBe(10)
    expect(h.baris[0].completed_at).toBe('2026-06-11')
  })

  it('proyek yang tak ada di daftar param tak membuat NaN', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30', project_id: 'entah' })], [], HARI_INI)
    expect(Number.isNaN(h.baris[0].telat_efektif)).toBe(false)
    expect(h.baris[0].telat_efektif).toBe(7)
    expect(h.baris[0].project_name).toBe('—')
    expect(h.baris[0].estimasi_paparan).toBeNull()
  })

  it('yang MASIH BERTAMBAH diurutkan di atas yang sudah selesai', () => {
    // Yang masih berjalan masih bisa diubah hasilnya; yang sudah selesai
    // hanya bisa dinegosiasikan.
    const h = analisaKeterlambatan(
      [
        M({ id: 'selesai', title: 'Sudah selesai telat', target_date: '2026-01-01', completed_at: '2026-05-01' }),
        M({ id: 'jalan', title: 'Masih berjalan telat', target_date: '2026-08-01' }),
      ],
      [P()], HARI_INI)
    expect(h.baris[0].milestone_id).toBe('jalan')
    // walau telatnya JAUH lebih kecil (5 hari vs 120 hari)
    expect(h.baris[0].telat_efektif).toBeLessThan(h.baris[1].telat_efektif)
  })

  it('telat terparah diambil dari telat EFEKTIF, bukan kotor', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-07' })],
      [P({ eot_hari_disetujui: 25 })],
      HARI_INI)
    expect(h.baris[0].telat_kotor).toBe(30)
    expect(h.telat_terparah).toBe(5)
  })

  it('nilai null/undefined tak membuat NaN mengalir ke total', () => {
    const h = analisaKeterlambatan(
      [M({ target_date: '2026-07-30' })],
      [P({ penalty_enabled: true, penalty_rate_per_day: null, eot_hari_disetujui: null })],
      HARI_INI)
    expect(Number.isNaN(h.total_estimasi_paparan)).toBe(false)
    expect(h.total_estimasi_paparan).toBe(0)
  })
})
