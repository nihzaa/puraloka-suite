import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import ncrRoutes from '../ncr.js'

/**
 * PENOMORAN NCR terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01 lewat rute PRODUKSI, dengan muatan yang persis dirakit
 * layar mobile `app/(app)/ncr/lapor.tsx`:
 *
 *     POST /projects/:id/ncr → 500 "Gagal mencatat ketidaksesuaian"
 *
 * Log server menyebut sebab yang tak muncul di badan balasan:
 *
 *     duplicate key value violates unique constraint
 *     "uq_ncr_items_project_nomor"
 *
 * Sebabnya DUA bentuk nomor hidup berdampingan di basis:
 *
 *     18 nomor  NCR-YYMM-NNN   (mis. NCR-2608-004)
 *      1 nomor  NCR-NNN
 *
 * `nomorBerikutnya()` hanya mengenali yang kedua. Pola gagal cocok → fungsi
 * memulangkan 'NCR-001' → INSERT menabrak indeks unik. TUJUH proyek
 * terdampak, dan mandor di lapangan melihat kegagalan yang tak bisa ia
 * jelaskan maupun hindari.
 *
 * ── Kenapa cacat ini lolos sampai ke produksi
 *
 * Tak ada satu pun test yang membuat DUA NCR berurutan di proyek yang sudah
 * punya nomor berformat baru. Test yang ada memakai fixture bersih —
 * dan proyek bersih selalu memulai dari NCR-001, jalur yang memang benar.
 *
 * Yang diuji di sini: penomoran MELANJUTKAN bentuk yang sudah dipakai
 * proyek itu, apa pun bentuknya.
 *
 * Fixture berprefiks [TEST-NOMOR] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let userId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, body: unknown) =>
  app.inject({ method: 'POST', url, headers: { authorization: 'Bearer t' }, payload: body })

async function purge() {
  await client.query(`DELETE FROM ncr_items WHERE judul LIKE '[TEST-NOMOR]%'`)
}

/** Sisipkan NCR bernomor tertentu langsung ke basis — menyiapkan keadaan awal. */
async function siapkanNomor(nomor: string) {
  await client.query(
    `INSERT INTO ncr_items (project_id, nomor, judul, severity, dilaporkan_oleh)
     VALUES ($1, $2, '[TEST-NOMOR] awal', 'minor', $3)`,
    [projectId, nomor, userId]
  )
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id
  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  await purge()

  app = Fastify()
  await app.register(ncrRoutes)
  await app.ready()
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('penomoran NCR melanjutkan bentuk yang sudah dipakai', () => {
  it('proyek yang nomornya NCR-YYMM-NNN dilanjutkan dengan bentuk yang sama', async () => {
    await purge()
    await siapkanNomor('NCR-2608-004')

    actAs(adminAuth!)
    const r = await post(`/api/v1/projects/${projectId}/ncr`, {
      judul: '[TEST-NOMOR] lanjutan berperiode',
      severity: 'minor',
    })

    /*
      Sebelum perbaikan, ini 500: fungsi memulangkan 'NCR-001' dan menabrak
      indeks unik kalau NCR-001 ada — atau membuat nomor yang bentuknya
      asing bagi proyek itu kalau tidak.
    */
    expect(r.statusCode).toBe(201)
    expect(r.json().data?.nomor).toBe('NCR-2608-005')
  })

  it('proyek yang nomornya NCR-NNN tetap dilanjutkan bentuk lama', async () => {
    await purge()
    await siapkanNomor('NCR-007')

    actAs(adminAuth!)
    const r = await post(`/api/v1/projects/${projectId}/ncr`, {
      judul: '[TEST-NOMOR] lanjutan lama',
      severity: 'minor',
    })

    expect(r.statusCode).toBe(201)
    expect(r.json().data?.nomor).toBe('NCR-008')
  })

  it('proyek tanpa NCR mulai dari NCR-001', async () => {
    await purge()

    actAs(adminAuth!)
    const r = await post(`/api/v1/projects/${projectId}/ncr`, {
      judul: '[TEST-NOMOR] pertama',
      severity: 'minor',
    })

    expect(r.statusCode).toBe(201)
    expect(r.json().data?.nomor).toBe('NCR-001')
  })

  it('DUA NCR berturut-turut tak bentrok — inilah yang gagal di produksi', async () => {
    await purge()
    await siapkanNomor('NCR-2608-018')

    actAs(adminAuth!)
    const a = await post(`/api/v1/projects/${projectId}/ncr`, {
      judul: '[TEST-NOMOR] beruntun A', severity: 'minor',
    })
    const b = await post(`/api/v1/projects/${projectId}/ncr`, {
      judul: '[TEST-NOMOR] beruntun B', severity: 'minor',
    })

    expect(a.statusCode).toBe(201)
    expect(b.statusCode).toBe(201)
    const na = a.json().data?.nomor
    const nb = b.json().data?.nomor
    expect(na).toBe('NCR-2608-019')
    expect(nb).toBe('NCR-2608-020')
    expect(na).not.toBe(nb)
  })

  it('bentuk nomor ASING melempar, tidak diam-diam mulai dari satu', async () => {
    await purge()
    await siapkanNomor('NCR/2026/007')

    actAs(adminAuth!)
    const r = await post(`/api/v1/projects/${projectId}/ncr`, {
      judul: '[TEST-NOMOR] bentuk asing', severity: 'minor',
    })

    /*
      Bukan 201. Nomor NCR dirujuk dalam surat resmi ke konsultan;
      menebaknya jauh lebih mahal daripada berhenti dan mengatakan apa yang
      tak dikenali.

      Baris lama `if (!cocok) return 'NCR-001'` tampak seperti penanganan
      aman, dan justru melakukan hal yang komentar di ATAS fungsi itu
      peringatkan untuk kasus `error`: "Gagal baca ≠ belum ada NCR".
    */
    expect(r.statusCode).toBe(500)
    expect(r.json().error).toMatch(/nomor NCR/i)
  })
})
