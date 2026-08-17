/**
 * REVISI DOKUMEN lewat RUTE — terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penurunan statusnya sudah dikunci 12 test murni di
 * `lib/__tests__/revisi-dokumen.test.ts`. Yang tersisa ada di jalur nyata:
 *
 *   • daftar dokumen benar-benar MEMBAWA status revisinya — sebelum ini,
 *     dua baris berjudul sama tampil sebagai dokumen terpisah tanpa cara
 *     tahu mana yang berlaku
 *   • percabangan ditolak SEBELUM berkasnya diunggah, bukan sesudah — kalau
 *     sesudah, berkas yatim tertinggal di storage dan tak ada yang
 *     membersihkannya
 *   • basis menegakkan aturan yang sama, jadi jalur tulis lain pun terjaga
 *
 * Fixture ditulis LANGSUNG ke basis (tanpa storage) — yang diuji rantainya,
 * bukan unggahnya.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import documentRoutes from '../documents.js'

let app: FastifyInstance
let db: Client
let projectId: string
let userId: string

const TANDA = 'UJI-DREV'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  // Anak dulu, baru induk — FK-nya `SET NULL`, jadi urutan ini sebenarnya
  // tak wajib; ditulis begitu supaya tetap benar kalau FK-nya diperketat.
  await db.query('DELETE FROM documents WHERE title LIKE $1', [`${TANDA}%`])
}

async function buatDok(judul: string, menggantikan: string | null, revisi: number) {
  const { rows } = await db.query(
    `INSERT INTO documents (project_id, title, doc_type, file_url, uploaded_by,
                            revisi, menggantikan_id)
     VALUES ($1, $2, 'lainnya', $3, $4, $5, $6) RETURNING id`,
    [projectId, judul, `uji://${judul}-${revisi}`, userId, revisi, menggantikan])
  return rows[0].id as string
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  userId = u[0].id
  // Company dipilih yang BENAR-BENAR punya proyek. Akun uji anggota TIGA
  // company, dan `LIMIT 1` tanpa `ORDER BY` menyerahkan pilihannya ke
  // Postgres — sempat memilih company yang kosong, lalu seluruh test gagal
  // dengan "Proyek tidak ditemukan" yang menuduh SEED, padahal seednya baik.
  const companyId = await companyBerisi(db, auth, ['projects'])
  const { rows: p } = await db.query(
    'SELECT id FROM projects WHERE company_id = $1 LIMIT 1', [companyId])
  if (!p.length) throw new Error('tak ada proyek di company ini')
  projectId = p[0].id

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(documentRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('daftar dokumen membawa status revisinya', () => {
  it('yang punya penerus ditandai digantikan, beserta id penggantinya', async () => {
    const r1 = await buatDok(`${TANDA} Gambar`, null, 1)
    const r2 = await buatDok(`${TANDA} Gambar`, r1, 2)

    const r = await get(`/api/v1/projects/${projectId}/documents`)
    expect(r.statusCode, r.body).toBe(200)

    const baris = (r.json().data as Array<Record<string, unknown>>)
    const a = baris.find((d) => d.id === r1)!
    const b = baris.find((d) => d.id === r2)!

    // Sebelum ini, keduanya tampil sebagai dokumen terpisah berjudul sama —
    // dan tak ada cara tahu mana yang berlaku.
    expect(a.digantikan).toBe(true)
    expect(a.digantikan_oleh).toBe(r2)
    expect(b.digantikan).toBe(false)
    expect(b.digantikan_oleh).toBeNull()
  })

  it('tiap baris tahu revisi keberapa ia, dan berapa yang terkini', async () => {
    await bersihkan()
    const r1 = await buatDok(`${TANDA} Rantai`, null, 1)
    const r2 = await buatDok(`${TANDA} Rantai`, r1, 2)
    const r3 = await buatDok(`${TANDA} Rantai`, r2, 3)

    const r = await get(`/api/v1/projects/${projectId}/documents`)
    const baris = (r.json().data as Array<Record<string, unknown>>)

    // "Anda melihat rev-1 dari 3" — itu yang membuat orang membuka yang benar.
    expect(baris.find((d) => d.id === r1)!.revisi_hitung).toBe(1)
    expect(baris.find((d) => d.id === r3)!.revisi_hitung).toBe(3)
    for (const id of [r1, r2, r3]) {
      expect(baris.find((d) => d.id === id)!.revisi_terkini).toBe(3)
    }
  })
})

describe('basis menegakkan aturan yang sama', () => {
  it('satu dokumen hanya boleh digantikan SEKALI', async () => {
    await bersihkan()
    const r1 = await buatDok(`${TANDA} Cabang`, null, 1)
    await buatDok(`${TANDA} Cabang`, r1, 2)

    // Percabangan tak menghasilkan galat di aplikasi mana pun — ia hanya
    // membuat dua orang memegang dokumen berbeda sambil sama-sama yakin
    // memegang yang terbaru. Yang menahannya indeks unik parsial migrasi 410.
    await expect(buatDok(`${TANDA} Cabang`, r1, 2)).rejects.toThrow(/duplicate|unique/i)
  })

  it('dokumen tak boleh menggantikan dirinya sendiri', async () => {
    await bersihkan()
    const r1 = await buatDok(`${TANDA} Diri`, null, 1)
    await expect(
      db.query('UPDATE documents SET menggantikan_id = $1 WHERE id = $1', [r1]),
    ).rejects.toThrow(/documents_tak_mengganti_diri|check/i)
  })

  it('menghapus revisi LAMA tidak menghapus yang baru', async () => {
    await bersihkan()
    const r1 = await buatDok(`${TANDA} Hapus`, null, 1)
    const r2 = await buatDok(`${TANDA} Hapus`, r1, 2)

    await db.query('DELETE FROM documents WHERE id = $1', [r1])

    // CASCADE akan menghapus rev-2 dan rev-3 sekaligus, dan yang
    // menghapusnya mengira ia hanya merapikan satu baris.
    const { rows } = await db.query(
      'SELECT id, menggantikan_id FROM documents WHERE id = $1', [r2])
    expect(rows).toHaveLength(1)
    expect(rows[0].menggantikan_id).toBeNull()
  })

  it('rev-3 yang induknya terhapus TIDAK dilaporkan sebagai rev-1', async () => {
    await bersihkan()
    const r1 = await buatDok(`${TANDA} Yatim`, null, 1)
    const r2 = await buatDok(`${TANDA} Yatim`, r1, 2)
    const r3 = await buatDok(`${TANDA} Yatim`, r2, 3)

    // Induk TENGAH dihapus — rantainya putus di tengah.
    await db.query('DELETE FROM documents WHERE id = $1', [r2])

    const r = await get(`/api/v1/projects/${projectId}/documents`)
    const baris = (r.json().data as Array<Record<string, unknown>>)
    const sisa = baris.find((d) => d.id === r3)!

    // Melaporkannya rev-1 membuat orang menyimpulkan belum pernah ada revisi.
    expect(Number(sisa.revisi_hitung)).toBeGreaterThan(1)
    expect(baris.find((d) => d.id === r1)!.digantikan).toBe(false)
  })
})
