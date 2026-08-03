import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// F1-1 — LOGIKA helper idempotensi (cabang keputusannya, bukan constraint-nya).
//
// `idempotency.test.ts` menguji apa yang benar-benar MENJAGA: constraint unik
// di database. Berkas ini menguji hal berbeda dan saling melengkapi — cabang
// keputusan di `utils/idempotency.ts`, yang tak tersentuh test DB sama sekali
// (terukur: 31% lines, 33% branches).
//
// Cabang-cabang itu bukan hiasan. Tiga di antaranya menentukan apakah jaminan
// idempotensi benar-benar aktif:
//
//   · tanpa header       → operasi berjalan TANPA jaminan (keputusan sadar,
//     lihat catatan "kunci OPSIONAL" di idempotency.ts)
//   · gagal baca tabel   → operasi TETAP jalan, tapi WAJIB ter-log; kalau
//     senyap, kita kehilangan satu-satunya petunjuk jaminan sedang mati
//   · 23505 saat mencatat → BUKAN kesalahan; dua request kembar berlomba dan
//     yang kalah cukup diam. Memperlakukannya sebagai galat akan membanjiri
//     log dengan kejadian yang justru menandakan mekanismenya bekerja.
//
// Supabase di-mock karena yang diuji di sini keputusan, bukan penyimpanan.
// ============================================================================

const bacaHasil = {
  data: null as { status_http: number; hasil: unknown } | null,
  error: null as { message: string; code?: string } | null,
}
const insertHasil = { error: null as { message: string; code?: string } | null }
let insertTerakhir: Record<string, unknown> | null = null

vi.mock('../supabase.js', () => {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => bacaHasil),
    insert: vi.fn(async (row: Record<string, unknown>) => {
      insertTerakhir = row
      return insertHasil
    }),
  }
  return { supabase: { from: vi.fn(() => chain) } }
})

const { periksaIdempotensi, catatIdempotensi } = await import('../idempotency.js')

const COMPANY = 'cccccccc-0000-0000-0000-000000000001'
const USER = 'uuuuuuuu-0000-0000-0000-000000000001'

const logError = vi.fn()

/** Request tiruan seminimal mungkin — hanya yang benar-benar dibaca helper. */
const req = (headers: Record<string, string | string[]> = {}) =>
  ({
    headers,
    companyId: COMPANY,
    currentUser: { id: USER },
    log: { error: logError },
  }) as never

beforeEach(() => {
  bacaHasil.data = null
  bacaHasil.error = null
  insertHasil.error = null
  insertTerakhir = null
  logError.mockClear()
})

describe('periksaIdempotensi — cabang keputusan', () => {
  it('tanpa header Idempotency-Key → jalan tanpa jaminan, kunci null', async () => {
    const h = await periksaIdempotensi(req(), 'finance:invoice:pay')
    expect(h.diulang).toBe(false)
    expect(h.kunci).toBeNull()
  })

  it('header kosong/spasi diperlakukan seperti tidak ada', async () => {
    const h = await periksaIdempotensi(req({ 'idempotency-key': '   ' }), 'finance:invoice:pay')
    expect(h.kunci).toBeNull()
  })

  it('kunci baru (belum tercatat) → diulang: false, kunci diteruskan', async () => {
    bacaHasil.data = null
    const h = await periksaIdempotensi(req({ 'idempotency-key': 'K-1' }), 'finance:invoice:pay')
    expect(h.diulang).toBe(false)
    expect(h.kunci).toBe('K-1')
  })

  it('kunci SUDAH tercatat → diulang: true, membawa status & hasil pertama', async () => {
    // Inilah inti idempotensi: pemanggil yang kehilangan respons pertama
    // mendapatkannya kembali, bukan sekadar ditolak.
    bacaHasil.data = { status_http: 201, hasil: { payment: { id: 'p1' } } }
    const h = await periksaIdempotensi(req({ 'idempotency-key': 'K-1' }), 'finance:invoice:pay')
    expect(h.diulang).toBe(true)
    expect(h.status).toBe(201)
    expect(h.hasil).toEqual({ payment: { id: 'p1' } })
  })

  it('gagal MEMBACA tabel → operasi tetap jalan, TAPI ter-log', async () => {
    // Menggagalkan operasi karena tabel idempotensi tak terbaca akan menukar
    // risiko duplikat dengan risiko lumpuh total — pilihan yang lebih buruk.
    // Yang tak boleh: senyap.
    bacaHasil.error = { message: 'koneksi putus' }
    const h = await periksaIdempotensi(req({ 'idempotency-key': 'K-1' }), 'finance:invoice:pay')
    expect(h.diulang).toBe(false)
    expect(h.kunci).toBe('K-1')
    expect(logError, 'kegagalan baca TIDAK ter-log — jaminan mati tanpa jejak').toHaveBeenCalled()
  })

  it('kunci sangat panjang dipotong, bukan ditolak diam-diam', async () => {
    const panjang = 'x'.repeat(500)
    const h = await periksaIdempotensi(req({ 'idempotency-key': panjang }), 'finance:invoice:pay')
    expect(h.kunci!.length).toBeLessThanOrEqual(200)
  })

  it('header berupa array (proxy mengirim ganda) → ambil yang pertama', async () => {
    const h = await periksaIdempotensi(req({ 'idempotency-key': ['K-A', 'K-B'] }), 'finance:invoice:pay')
    expect(h.kunci).toBe('K-A')
  })
})

describe('catatIdempotensi — cabang keputusan', () => {
  it('kunci null → tidak mencatat apa pun', async () => {
    await catatIdempotensi(req(), 'finance:invoice:pay', null, 201, { ok: true })
    expect(insertTerakhir).toBeNull()
  })

  it('mencatat company_id, operasi, kunci, status, hasil, dan pelakunya', async () => {
    await catatIdempotensi(req(), 'finance:invoice:pay', 'K-1', 201, { payment: { id: 'p1' } })
    expect(insertTerakhir).toMatchObject({
      company_id: COMPANY,
      operasi: 'finance:invoice:pay',
      kunci: 'K-1',
      user_id: USER,
      status_http: 201,
    })
  })

  it('23505 (kunci sudah ada) TIDAK di-log sebagai galat', async () => {
    // Dua request kembar yang lolos bersamaan akan berlomba di sini. Yang kalah
    // cukup diam — barisnya sudah ada, jaminannya tetap terpenuhi. Mencatatnya
    // sebagai galat akan membanjiri log dengan kejadian yang justru menandakan
    // mekanismenya BEKERJA.
    insertHasil.error = { message: 'duplicate key', code: '23505' }
    await catatIdempotensi(req(), 'finance:invoice:pay', 'K-1', 201, { ok: true })
    expect(logError).not.toHaveBeenCalled()
  })

  it('galat LAIN saat mencatat → ter-log (tak boleh senyap)', async () => {
    insertHasil.error = { message: 'kolom tak ada', code: '42703' }
    await catatIdempotensi(req(), 'finance:invoice:pay', 'K-1', 201, { ok: true })
    expect(logError).toHaveBeenCalled()
  })
})
