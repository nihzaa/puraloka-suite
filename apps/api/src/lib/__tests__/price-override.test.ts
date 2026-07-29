import { describe, it, expect } from 'vitest'
import {
  resolvePrices, resolveProjectOverride,
  type PriceBookEntryRow, type ProjectPriceOverrideRow,
} from '../price-resolver.js'

// ============================================================
// HARGA KHUSUS PER PROYEK (migrasi 140).
//
// Kebutuhan nyata founder: "cor lantai di acuan Rp 6,7 jt, tapi untuk proyek
// INI pakai Rp 5 jt — dan harga acuannya harus TETAP. Dalam periode berlaku
// yang sama, tiap proyek bisa pakai harga berbeda."
//
// Sumbu waktu & lokasi tidak bisa menjawab itu: keduanya berlaku lintas
// proyek. Karena itu override hidup di tabel sendiri dan dievaluasi lebih dulu.
//
// Diuji di level fungsi (pure, tanpa I/O) supaya aturannya teruji lengkap —
// termasuk kasus yang sulit dibuat lewat HTTP.
// ============================================================

const HARI_INI = '2026-06-01'

const acuan = (amount: number, over: Partial<PriceBookEntryRow> = {}): PriceBookEntryRow => ({
  id: 'pb-1', resource_id: 'r1', amount, currency: 'IDR', version_number: 1,
  effective_date: '2026-01-01', expired_date: null, location: null, status: 'active',
  ...over,
})

const khusus = (
  amount: number, over: Partial<ProjectPriceOverrideRow> = {}
): ProjectPriceOverrideRow => ({
  id: 'ov-1', project_id: 'p1', resource_id: 'r1', amount, currency: 'IDR',
  effective_date: null, expired_date: null, reason: 'nego supplier',
  ...over,
})

describe('Harga khusus proyek — menang atas acuan', () => {
  it('memakai harga khusus bila ada', () => {
    const { resolved } = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null, [khusus(5_000_000)])
    expect(resolved.get('r1')!.entry.amount).toBe(5_000_000)
    expect(resolved.get('r1')!.override?.reason).toBe('nego supplier')
  })

  it('jatuh ke harga acuan bila proyek tak punya harga khusus', () => {
    const { resolved } = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null, [])
    expect(resolved.get('r1')!.entry.amount).toBe(6_700_000)
    expect(resolved.get('r1')!.override ?? null).toBeNull()
  })

  it('dua proyek boleh beda harga di PERIODE YANG SAMA', () => {
    // Inti kebutuhan founder. Kalau ini gagal, satu-satunya cara menurunkan
    // harga satu proyek adalah mengubah acuannya — dan itu menyeret semua.
    const a = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null,
      [khusus(5_000_000, { project_id: 'pA' })])
    const b = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null,
      [khusus(7_200_000, { project_id: 'pB' })])
    const c = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null, [])

    expect(a.resolved.get('r1')!.entry.amount).toBe(5_000_000)
    expect(b.resolved.get('r1')!.entry.amount).toBe(7_200_000)
    expect(c.resolved.get('r1')!.entry.amount, 'proyek tanpa override harus ikut acuan')
      .toBe(6_700_000)
  })

  it('tanpa parameter override, perilaku PERSIS seperti sebelum migrasi 140', () => {
    // Menjaga seluruh pemanggil lama: parameter override opsional, dan
    // ketiadaannya tak boleh mengubah apa pun.
    const lama = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null)
    const baru = resolvePrices([acuan(6_700_000)], ['r1'], HARI_INI, null, [])
    expect(lama.resolved.get('r1')!.entry.amount).toBe(baru.resolved.get('r1')!.entry.amount)
    expect(lama.missing).toEqual(baru.missing)
  })
})

describe('Harga khusus proyek — masa berlaku opsional', () => {
  it('tanpa tanggal = berlaku selama proyek berjalan', () => {
    // Kasus terbanyak: "untuk proyek ini, semen pakai harga ini". Memaksa
    // mengisi tanggal untuk sesuatu yang tak bertanggal hanya menambah kerja.
    const o = resolveProjectOverride([khusus(5_000_000)], 'r1', HARI_INI)
    expect(o?.amount).toBe(5_000_000)
  })

  it('override yang BELUM berlaku diabaikan', () => {
    const o = resolveProjectOverride(
      [khusus(5_000_000, { effective_date: '2026-09-01' })], 'r1', HARI_INI)
    expect(o, 'harga yang belum berlaku ikut terpakai').toBeNull()
  })

  it('override yang SUDAH kedaluwarsa diabaikan', () => {
    const o = resolveProjectOverride(
      [khusus(5_000_000, { effective_date: '2026-01-01', expired_date: '2026-03-01' })],
      'r1', HARI_INI)
    expect(o).toBeNull()
  })

  it('bila beberapa berlaku sekaligus, yang bertanggal terbaru menang', () => {
    // Menyebut tanggal adalah pernyataan yang lebih spesifik daripada tidak.
    const o = resolveProjectOverride([
      khusus(5_000_000, { id: 'tanpa-tanggal' }),
      khusus(5_500_000, { id: 'lama', effective_date: '2026-02-01' }),
      khusus(6_000_000, { id: 'baru', effective_date: '2026-05-01' }),
    ], 'r1', HARI_INI)
    expect(o?.id).toBe('baru')
  })
})

describe('Harga khusus proyek — tidak menyembunyikan kesalahan', () => {
  it('resource TANPA acuan dan TANPA override tetap dilaporkan missing', () => {
    // Fail-loud harus tetap berlaku: override menutup kasus "sengaja beda
    // harga", bukan kasus "harga memang belum diisi".
    const { missing } = resolvePrices([], ['r1'], HARI_INI, null, [])
    expect(missing).toEqual(['r1'])
  })

  it('resource tanpa acuan TAPI punya override → dianggap ada', () => {
    // Sah: item yang memang hanya dipakai satu proyek dan tak punya harga
    // acuan. Kalau ini dilaporkan missing, pengguna dipaksa mengisi harga
    // acuan yang tak akan dipakai siapa pun.
    const { resolved, missing } = resolvePrices([], ['r1'], HARI_INI, null, [khusus(5_000_000)])
    expect(missing).toEqual([])
    expect(resolved.get('r1')!.entry.amount).toBe(5_000_000)
  })

  it('override resource LAIN tidak terpakai untuk resource ini', () => {
    const { missing } = resolvePrices([], ['r1'], HARI_INI, null,
      [khusus(5_000_000, { resource_id: 'r-lain' })])
    expect(missing, 'harga resource lain bocor jadi harga resource ini').toEqual(['r1'])
  })
})

// ============================================================
// SUMBU LINGKUP — harga company menang atas harga nasional.
//
// Ditemukan saat memverifikasi HSP terhadap workbook: Pekerja terhitung
// Rp 100.000 (nasional SE-47) padahal harga company Cibuluh Rp 110.000,
// sehingga HSP jadi 18.398,75 — bukan 17.778,75 yang cocok workbook.
//
// Sebabnya urutan: harga nasional di-seed ber-tanggal 2026 sementara harga
// company ber-tanggal 2019 (mengikuti tahun workbook-nya). Dengan tanggal
// sebagai penentu utama, acuan nasional MENGALAHKAN harga yang sengaja
// diputuskan dipakai badan usaha.
//
// Secara makna juga begitu: workbook SE-47 sendiri menyatakan harganya "diubah
// sesuai harga daerah masing-masing" — ia acuan, bukan pengikat.
// ============================================================
describe('Sumbu lingkup — harga sendiri menang atas acuan nasional', () => {
  const nasional = (amount: number, tanggal: string): PriceBookEntryRow => ({
    id: 'nas', resource_id: 'r1', amount, currency: 'IDR', version_number: 1,
    effective_date: tanggal, expired_date: null, location: null, status: 'active',
    company_id: null,
  })
  const milikKita = (amount: number, tanggal: string, loc: string | null = null): PriceBookEntryRow => ({
    id: 'comp', resource_id: 'r1', amount, currency: 'IDR', version_number: 1,
    effective_date: tanggal, expired_date: null, location: loc, status: 'active',
    company_id: 'c1',
  })

  it('harga company menang meski TANGGALNYA LEBIH LAMA', () => {
    // Kasus nyata: nasional 2026 Rp 100.000 vs company 2019 Rp 110.000.
    const { resolved } = resolvePrices(
      [nasional(100_000, '2026-01-01'), milikKita(110_000, '2019-01-01')],
      ['r1'], HARI_INI)
    expect(
      resolved.get('r1')!.entry.amount,
      'harga acuan nasional mengalahkan harga badan usaha sendiri'
    ).toBe(110_000)
  })

  it('jatuh ke harga nasional bila badan usaha belum punya harganya', () => {
    // 257 resource memang belum punya harga company — acuan nasional yang
    // dipakai, dan itu benar.
    const { resolved } = resolvePrices([nasional(100_000, '2026-01-01')], ['r1'], HARI_INI)
    expect(resolved.get('r1')!.entry.amount).toBe(100_000)
  })

  it('di antara sesama harga company, yang TERBARU tetap menang', () => {
    // Sumbu lingkup tidak menggantikan sumbu waktu — ia hanya di atasnya.
    const { resolved } = resolvePrices(
      [milikKita(110_000, '2019-01-01'), milikKita(150_000, '2026-01-01')],
      ['r1'], HARI_INI)
    expect(resolved.get('r1')!.entry.amount).toBe(150_000)
  })

  it('override PROYEK tetap menang atas harga company', () => {
    // Urutan penuh: override proyek → harga company → harga nasional.
    const { resolved } = resolvePrices(
      [nasional(100_000, '2026-01-01'), milikKita(110_000, '2019-01-01')],
      ['r1'], HARI_INI, null, [khusus(5_000_000)])
    expect(resolved.get('r1')!.entry.amount).toBe(5_000_000)
    expect(resolved.get('r1')!.override).toBeTruthy()
  })

  it('tanpa company_id sama sekali, perilaku seperti sebelum sumbu ini ada', () => {
    // Menjaga pemanggil lama: entry tanpa kolom company_id tak boleh berubah
    // perilakunya.
    const tanpaKolom: PriceBookEntryRow = {
      id: 'x', resource_id: 'r1', amount: 7_000, currency: 'IDR', version_number: 1,
      effective_date: '2026-01-01', expired_date: null, location: null, status: 'active',
    }
    const { resolved } = resolvePrices([tanpaKolom], ['r1'], HARI_INI)
    expect(resolved.get('r1')!.entry.amount).toBe(7_000)
  })
})
