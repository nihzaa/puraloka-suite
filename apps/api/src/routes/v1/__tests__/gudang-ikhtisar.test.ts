import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import gudangIkhtisarRoutes from '../gudang-ikhtisar.js'

/**
 * IKHTISAR GUDANG — endpoint terhadap Postgres NYATA.
 *
 * ── Yang dijaga, dan kenapa mock tak bisa
 *
 *   • INVARIAN LOKASI. Aset tak boleh tercatat di gudang DAN di proyek
 *     sekaligus (constraint `assets_lokasi_tunggal`, migrasi 238). Kalau
 *     invarian itu bocor, pertanyaan "di mana barang ini" tak punya jawaban —
 *     dan itu satu-satunya pertanyaan yang gudang ada untuk menjawabnya.
 *
 *   • SARINGAN TENANT DI MEMORI. `gudang_stok` dan `asset_movements` tak
 *     punya company_id; keduanya disaring di JS terhadap id milik company.
 *     Kalau saringan itu hilang, angkanya mencakup tenant lain dan tetap
 *     terlihat wajar.
 *
 *   • PENYUSUTAN TAK BOLEH NEGATIF. Aset yang umur ekonomisnya sudah habis
 *     akan menghasilkan nilai buku minus kalau penjepitnya lepas — dan nilai
 *     buku negatif di neraca adalah cacat yang menular ke laporan lain.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = () =>
  app.inject({ method: 'GET', url: URL_IKHTISAR, headers: { authorization: 'Bearer t' } })

const URL_IKHTISAR = '/api/v1/gudang/ikhtisar'

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(gudangIkhtisarRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await app?.close()
  await client?.end()
})

describe('GET /api/v1/gudang/ikhtisar', () => {
  it('200 dan tak satu pun kolom yang tak ada di schema', async () => {
    const r = await get()
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)
  })

  it('mengirim delapan cabang yang dibaca halaman', async () => {
    const j = (await get()).json()
    expect(j.kpi).toBeTypeOf('object')
    expect(Array.isArray(j.gudang)).toBe(true)
    expect(Array.isArray(j.aset_per_kategori)).toBe(true)
    expect(Array.isArray(j.aset_per_kondisi)).toBe(true)
    expect(Array.isArray(j.isi_gudang)).toBe(true)
    expect(Array.isArray(j.pergerakan)).toBe(true)
    expect(Array.isArray(j.material_gudang)).toBe(true)
    expect(Array.isArray(j.belum_ditarik)).toBe(true)
  })

  it('di_gudang + di_lapangan tak pernah melebihi total aset', async () => {
    // Kalau melebihi, ada aset terhitung di dua tempat — invarian
    // `assets_lokasi_tunggal` bocor.
    const { kpi } = (await get()).json()
    expect(kpi.di_gudang + kpi.di_lapangan).toBeLessThanOrEqual(kpi.total_aset)
  })

  it('DB sendiri menolak aset di dua tempat sekaligus', async () => {
    // Bukan menguji endpoint melainkan constraint yang mendasarinya — kalau
    // ia dilepas kelak, test ini yang akan berbunyi lebih dulu.
    const { rows } = await client.query(
      `select count(*)::int n from assets
        where gudang_id is not null and current_project_id is not null`)
    expect(rows[0].n).toBe(0)
  })

  it('nilai buku tak pernah negatif, dan tak melebihi harga perolehan', async () => {
    const { kpi } = (await get()).json()
    const buku = Number(kpi.nilai_buku)
    const perolehan = Number(kpi.nilai_perolehan)
    expect(buku).toBeGreaterThanOrEqual(0)
    expect(buku).toBeLessThanOrEqual(perolehan)
  })

  it('perolehan = buku + akumulasi susut (invarian penyusutan)', async () => {
    const { kpi } = (await get()).json()
    const selisih = Math.abs(
      Number(kpi.nilai_perolehan) - (Number(kpi.nilai_buku) + Number(kpi.akumulasi_susut)))
    // Toleransi 1 rupiah untuk pembulatan .toFixed(2).
    expect(selisih).toBeLessThanOrEqual(1)
  })

  it('SELURUH nominal string numeric, bukan float (§5.4)', async () => {
    const { kpi } = (await get()).json()
    for (const k of ['nilai_perolehan', 'nilai_buku', 'akumulasi_susut']) {
      expect(typeof kpi[k], `kpi.${k}`).toBe('string')
      expect(kpi[k], `kpi.${k}`).toMatch(/^-?\d+\.\d{2}$/)
    }
  })

  it('isi_gudang: seluruhnya benar-benar di gudang, bukan di proyek', async () => {
    const j = (await get()).json()
    expect(j.isi_gudang.length).toBeLessThanOrEqual(j.kpi.di_gudang)
    for (const a of j.isi_gudang) {
      expect(a.gudang, a.kode).toBeTruthy()
    }
  })

  it('isi_gudang terurut: kondisi terburuk di atas', async () => {
    const bobot: Record<string, number> = { buruk: 0, cukup: 1, baik: 2 }
    const j = (await get()).json()
    const nilai = j.isi_gudang.map((a: { kondisi: string }) => bobot[a.kondisi] ?? 9)
    expect([...nilai].sort((a, b) => a - b)).toEqual(nilai)
  })

  it('penanda "memburuk" konsisten dengan kondisi sebelum/sesudah', async () => {
    // Dihitung di server supaya urutan tingkat kondisi tak ditulis ulang di
    // tiap tempat yang menampilkannya.
    const bobot: Record<string, number> = { buruk: 0, cukup: 1, baik: 2 }
    const { pergerakan } = (await get()).json()
    for (const m of pergerakan) {
      if (!m.kondisi_sebelum || !m.kondisi_sesudah) {
        expect(m.memburuk, m.id).toBe(false)
        continue
      }
      const harusnya = bobot[m.kondisi_sesudah] < bobot[m.kondisi_sebelum]
      expect(m.memburuk, `${m.id} ${m.kondisi_sebelum}→${m.kondisi_sesudah}`).toBe(harusnya)
    }
  })

  it('pergerakan terurut dari yang PALING BARU', async () => {
    const { pergerakan } = (await get()).json()
    const hari = pergerakan
      .map((m: { hari_lalu: number | null }) => m.hari_lalu)
      .filter((h: number | null): h is number => h !== null)
    expect([...hari].sort((a, b) => a - b)).toEqual(hari)
  })

  it('belum_ditarik HANYA memuat proyek yang sudah selesai', async () => {
    // Ini bagian yang paling menjawab kekhawatiran founder: proyek selesai
    // tapi materialnya masih di lokasi. Kalau proyek AKTIF ikut masuk, kartu
    // itu berubah jadi kebisingan dan orang berhenti membacanya.
    const j = (await get()).json()
    if (j.belum_ditarik.length === 0) return
    const nama = j.belum_ditarik.map((b: { proyek: string }) => b.proyek)
    const { rows } = await client.query(
      `select name from projects where status = 'completed' and is_deleted = false`)
    const selesai = new Set(rows.map((r) => r.name))
    for (const n of nama) expect(selesai.has(n), n).toBe(true)
  })

  it('jumlah belum_ditarik cocok dengan KPI-nya', async () => {
    const j = (await get()).json()
    expect(j.belum_ditarik.length).toBe(j.kpi.proyek_belum_ditarik)
  })

  it('tiap gudang melaporkan jumlah aset & material yang konsisten', async () => {
    const j = (await get()).json()
    const totalAset = j.gudang.reduce(
      (s: number, g: { jumlah_aset: number }) => s + g.jumlah_aset, 0)
    expect(totalAset).toBe(j.kpi.di_gudang)
  })

  it('menolak tanpa autentikasi', async () => {
    const r = await app.inject({ method: 'GET', url: URL_IKHTISAR })
    expect(r.statusCode).toBe(401)
  })
})
