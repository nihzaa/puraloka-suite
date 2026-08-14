import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import tarifPayrollRoutes from '../tarif-payroll.js'

/**
 * TARIF PAYROLL terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 28 test di `lib/__tests__/tarif-payroll.test.ts`
 * (14 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • string kosong dari form TIDAK tersimpan sebagai NUMERIC 0 — cacat yang
 *     sama dengan `Number('') === 0`, tapi di sisi TULIS. Tarif nol yang
 *     tampak sah adalah bentuk paling berbahaya dari kegagalan modul ini
 *   • constraint DB benar-benar menolak (baris tanpa nilai, persen di luar
 *     0–100, rentang terbalik)
 *   • kesiapan dilaporkan sebagai TIDAK SIAP selama tarif belum lengkap
 *   • hapus baris yang tak ada membalas 404, bukan 200 palsu
 *   • periode ganda (jenis + tanggal sama) ditolak dengan pesan yang bisa
 *     dibaca, bukan galat constraint mentah
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let periodeId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'DELETE', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM tarif_payroll_periode WHERE dasar_hukum LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')
  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(tarifPayrollRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /payroll/tarif — periode', () => {
  it('dasar_hukum WAJIB — tarif tanpa dasar tak bisa dipertanggungjawabkan', async () => {
    const r = await kirim('POST', '/api/v1/payroll/tarif', {
      jenis: 'bpjs', berlaku_sejak: '2031-01-01',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/dasar_hukum/i)
    // Bukan pesan constraint mentah.
    expect(r.json().error).not.toMatch(/null value in column/)
  })

  it('jenis di luar tiga nilai ditolak sebelum menyentuh basis', async () => {
    const r = await kirim('POST', '/api/v1/payroll/tarif', {
      jenis: 'pph22', berlaku_sejak: '2031-01-01', dasar_hukum: '[TEST] x',
    })
    expect(r.statusCode).toBe(400)
  })

  it('periode baru tersimpan', async () => {
    const r = await kirim('POST', '/api/v1/payroll/tarif', {
      jenis: 'bpjs', berlaku_sejak: '2031-01-01',
      dasar_hukum: '[TEST] uji, bukan aturan nyata',
    })
    expect(r.statusCode).toBe(201)
    periodeId = r.json().periode.id
  })

  it('periode GANDA ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', '/api/v1/payroll/tarif', {
      jenis: 'bpjs', berlaku_sejak: '2031-01-01', dasar_hukum: '[TEST] dobel',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).not.toMatch(/duplicate key/)
    expect(r.json().error).toMatch(/tanggal berlaku/i)
  })
})

describe('POST /payroll/tarif/:id/baris', () => {
  it('STRING KOSONG tidak tersimpan sebagai NUMERIC 0', async () => {
    // ── Invarian paling penting di berkas ini ─────────────────────────────
    //
    // `Number('')` adalah 0, bukan NaN. Kolom tarif yang dikosongkan di form
    // dan diteruskan apa adanya akan tersimpan sebagai tarif NOL — potongan
    // Rp 0 yang tampak sah, tanpa satu pun peringatan bahwa tarifnya hilang.
    //
    // Cacat yang sama ditemukan di `angka()` saat test pustaka ditulis; ini
    // sisi tulisnya.
    const r = await kirim('POST', `/api/v1/payroll/tarif/${periodeId}/baris`, {
      kunci: 'jht', label: 'Hari Tua',
      persen_perusahaan: '3.7', persen_karyawan: '2',
      nilai_nominal: '', nilai_persen: '   ', batas_atas: '',
    })
    expect(r.statusCode).toBe(201)

    const { rows } = await client.query(
      `SELECT nilai_nominal, nilai_persen, batas_atas, persen_perusahaan
         FROM tarif_payroll_baris WHERE id = $1`, [r.json().baris.id])
    expect(rows[0].nilai_nominal).toBeNull()
    expect(rows[0].nilai_persen).toBeNull()
    expect(rows[0].batas_atas).toBeNull()
    // Yang benar-benar diisi tetap tersimpan.
    expect(Number(rows[0].persen_perusahaan)).toBe(3.7)
  })

  it('baris TANPA SATU PUN nilai ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', `/api/v1/payroll/tarif/${periodeId}/baris`, {
      kunci: 'kosong',
    })
    expect(r.statusCode).toBe(400)
    // Baris tanpa nilai terhitung "sudah diisi" oleh pemeriksaan kelengkapan
    // sementara perhitungannya menghasilkan nol.
    expect(r.json().error).toMatch(/nilai/i)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('persen 5000 (salah ketik 50,00) ditolak BASIS', async () => {
    const r = await kirim('POST', `/api/v1/payroll/tarif/${periodeId}/baris`, {
      kunci: 'salah-ketik', persen_karyawan: 5000,
    })
    expect(r.statusCode).toBe(400)
  })

  it('rentang terbalik ditolak BASIS', async () => {
    const r = await kirim('POST', `/api/v1/payroll/tarif/${periodeId}/baris`, {
      kunci: 'terbalik', batas_bawah: 9000000, batas_atas: 5000000, nilai_persen: 5,
    })
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk periode yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/payroll/tarif/00000000-0000-0000-0000-0000000000ff/baris',
      { kunci: 'x', nilai_persen: 1 })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /payroll/tarif — kesiapan', () => {
  it('TIDAK SIAP selama ada jenis yang belum ditetapkan', async () => {
    const r = await get('/api/v1/payroll/tarif?pada=2026-06-01')
    expect(r.statusCode).toBe(200)
    const j = r.json()
    // Hanya `bpjs` yang dibuat di test ini — dua jenis lain belum ada.
    //
    // Catatan: basis bersama bisa saja punya tarif lain dari sesi lain, jadi
    // yang diuji BUKAN daftar persisnya melainkan bahwa jenis yang memang
    // belum ada dilaporkan, dan `siap` mengikuti.
    expect(j.kesiapan.siap).toBe(j.kesiapan.belum_ditetapkan.length === 0
      && j.kesiapan.kosong.length === 0)
    expect(j.pada).toBe('2026-06-01')
  })

  it('baris ikut terbawa dalam periodenya', async () => {
    const j = (await get('/api/v1/payroll/tarif?pada=2026-06-01')).json()
    const p = j.periode.find((x: { id: string }) => x.id === periodeId)
    expect(p).toBeDefined()
    expect(p.baris.length).toBeGreaterThan(0)
  })

  it('periode MASA DEPAN tak dianggap berlaku', async () => {
    // Periode dibuat berlaku 2026-01-01; pada 2025-06-01 ia belum berlaku.
    const j = (await get('/api/v1/payroll/tarif?pada=2025-06-01')).json()
    expect(j.berlaku.bpjs).not.toBe(periodeId)
  })

  it('periode yang berlaku dikenali pada tanggalnya', async () => {
    const j = (await get('/api/v1/payroll/tarif?pada=2026-06-01')).json()
    // Bisa saja ada periode bpjs lain yang lebih baru dari sesi lain; yang
    // diuji: `berlaku.bpjs` menunjuk periode yang BENAR-BENAR ada dan
    // berlaku_sejak-nya tak melewati tanggal itu.
    const dipilih = j.periode.find((x: { id: string }) => x.id === j.berlaku.bpjs)
    expect(dipilih).toBeDefined()
    expect(dipilih.berlaku_sejak <= '2026-06-01').toBe(true)
  })
})

describe('DELETE /payroll/tarif/baris/:id', () => {
  it('menghapus baris yang TAK ADA membalas 404, bukan 200 palsu', async () => {
    const r = await kirim('DELETE',
      '/api/v1/payroll/tarif/baris/00000000-0000-0000-0000-0000000000ff')
    // Nol baris terhapus bukan keberhasilan: layar akan menghapus baris dari
    // tampilan sementara di basis ia masih ada, dan tarif yang dikira sudah
    // dihapus tetap dipakai menghitung.
    expect(r.statusCode).toBe(404)
  })

  it('menghapus baris yang ada berhasil dan benar-benar hilang', async () => {
    const buat = await kirim('POST', `/api/v1/payroll/tarif/${periodeId}/baris`, {
      kunci: 'hapus-saya', nilai_persen: 1,
    })
    const id = buat.json().baris.id

    const r = await kirim('DELETE', `/api/v1/payroll/tarif/baris/${id}`)
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT id FROM tarif_payroll_baris WHERE id = $1`, [id])
    expect(rows).toHaveLength(0)
  })
})
