import { describe, it, expect } from 'vitest'
import { coLayakJadiSumber, ringkasCoSumber } from '../co-sumber-contingency.js'

/**
 * Change order mana yang boleh jadi SUMBER penarikan cadangan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ditemukan 2026-08-08 oleh penjaga `audit-kolom-tak-tersambung.mjs` yang
 * baru dipasang — bentuknya persis sama dengan `rfq.mr_id`:
 *
 *   `penggunaan_contingency.sumber_change_order_id` diterima di body
 *   `POST /contingency/:id/penggunaan` dan LANGSUNG di-insert, tanpa
 *   diperiksa sama sekali. UI tak punya cara mengirimnya.
 *
 * Bedanya dengan RFQ: **ini uang.**
 *
 * ── Kenapa hanya CO yang DISETUJUI
 *
 * Penarikan cadangan yang mengaku bersumber dari CO yang ditolak adalah jejak
 * audit yang berbohong — dan jejak audit yang berbohong lebih buruk daripada
 * tak ada jejak sama sekali, karena ia dipercaya.
 *
 * Diukur pada data nyata: CO-001 `approved`, CO-002 `rejected`. Tanpa aturan
 * ini, keduanya sama-sama bisa dipilih dan tak ada yang menghalangi.
 *
 * ── Kenapa TIDAK menghitung sisa CO di sini
 *
 * Satu CO bisa jadi sumber beberapa penarikan — pekerjaan tambah yang
 * dikerjakan bertahap. Membatasi "sekali pakai" akan salah. Yang dijaga di
 * sini adalah KELAYAKAN sumbernya; kecukupan pagu dijaga pos cadangan itu
 * sendiri, dan itu invarian yang berbeda.
 */

const co = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'c1', co_number: 'CO-001', status, project_id: 'p1',
  description: 'Tambah kamar mandi', ...extra,
})

describe('coLayakJadiSumber', () => {
  it('CO disetujui → layak', () => {
    expect(coLayakJadiSumber(co('approved'), 'p1').layak).toBe(true)
  })

  // INVARIAN INTI. Penarikan yang mengaku bersumber dari CO yang DITOLAK
  // adalah jejak audit yang berbohong.
  it('CO DITOLAK tidak layak', () => {
    const h = coLayakJadiSumber(co('rejected'), 'p1')
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/ditolak/i)
  })

  it('CO masih draft tidak layak', () => {
    const h = coLayakJadiSumber(co('draft'), 'p1')
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/belum disetujui/i)
  })

  it('CO menunggu persetujuan tidak layak', () => {
    expect(coLayakJadiSumber(co('submitted'), 'p1').layak).toBe(false)
  })

  // Gagal-tertutup: status baru yang belum dipertimbangkan otomatis tidak
  // layak. Daftar hitam akan meloloskan apa pun yang lupa ditambahkan, dan
  // yang lolos di sini adalah pembenaran palsu untuk uang yang keluar.
  it('status yang tak dikenal tidak layak (gagal-tertutup)', () => {
    expect(coLayakJadiSumber(co('entah_apa'), 'p1').layak).toBe(false)
  })

  // CO proyek LAIN. Bentuk celah yang sama dengan `mr_id` lintas-proyek:
  // hanya ketahuan saat seseorang bertanya "dasarnya apa", jauh setelah
  // uangnya keluar.
  it('CO dari proyek LAIN tidak layak, meski disetujui', () => {
    const h = coLayakJadiSumber(co('approved', { project_id: 'p2' }), 'p1')
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/proyek/i)
  })

  it('CO yang tidak ada tidak layak, dan tidak melempar', () => {
    const h = coLayakJadiSumber(null, 'p1')
    expect(h.layak).toBe(false)
    expect(h.sebab).toMatch(/tidak ditemukan/i)
  })

  // Postgres `numeric` MENERIMA NaN — terbukti di repo ini, dan satu baris
  // NaN meracuni SUM() seluruh laporan. Nilai yang tak terbaca harus jadi
  // null (tak diketahui), bukan NaN yang menyamar sebagai angka.
  //
  // Test ini ditambahkan SESUDAH mutation testing menemukan pengaman NaN-nya
  // tidak dijaga apa pun: mutasi `Number.isFinite(n) ? n : null` → `n`
  // tetap HIJAU. Pengaman yang tak diuji adalah pengaman yang bisa hilang
  // tanpa ada yang tahu.
  it('nilai yang tak terbaca jadi null, BUKAN NaN', () => {
    const h = coLayakJadiSumber(co('approved', { total_amount_delta: 'abc' }), 'p1')
    expect(h.nilai).toBeNull()
    expect(Number.isNaN(h.nilai as number)).toBe(false)
  })

  it('numeric yang tiba sebagai string tetap terbaca sebagai angka', () => {
    const h = coLayakJadiSumber(co('approved', { total_amount_delta: '2500000.00' }), 'p1')
    expect(h.nilai).toBe(2_500_000)
  })

  it('nilai kosong jadi null, bukan nol — "tak diketahui" bukan "nol rupiah"', () => {
    expect(coLayakJadiSumber(co('approved', { total_amount_delta: null }), 'p1').nilai).toBeNull()
  })
})

describe('ringkasCoSumber — daftar untuk dipilih manusia', () => {
  const daftar = [
    co('approved', { id: 'a', co_number: 'CO-001' }),
    co('rejected', { id: 'b', co_number: 'CO-002' }),
    co('draft', { id: 'c', co_number: 'CO-003' }),
  ]

  it('hanya yang layak bisa dipilih', () => {
    expect(ringkasCoSumber(daftar, 'p1').layak).toHaveLength(1)
  })

  // Yang tak layak DIHITUNG. Daftar yang menyusut tanpa penjelasan membuat
  // orang bertanya "CO saya ke mana" dan tak menemukan jawabannya.
  it('yang tidak layak dihitung, bukan dihilangkan diam-diam', () => {
    expect(ringkasCoSumber(daftar, 'p1').tak_layak).toBe(2)
  })

  it('daftar kosong tidak melempar', () => {
    expect(ringkasCoSumber([], 'p1').layak).toEqual([])
  })

  it('nomor CO dibawa — itu yang dikenali manusia, bukan uuid', () => {
    expect(ringkasCoSumber(daftar, 'p1').layak[0].co_number).toBe('CO-001')
  })
})
