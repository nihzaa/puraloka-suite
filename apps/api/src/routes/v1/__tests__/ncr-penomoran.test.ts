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

/*
  `payload` diketik `Record<string, unknown>`, bukan `unknown`.

  `unknown` tak bisa ditugaskan ke `InjectPayload`, dan tanpa `await`-nya
  di dalam fungsi, `app.inject` memulangkan tipe rantai (`Chain`) yang tak
  punya `.statusCode`. Keduanya lolos `npx tsc --noEmit` di mesin ini
  tetapi MENGGAGALKAN `pnpm build` di server — dan build itu yang
  membangun image produksi.
*/
const post = async (url: string, body: Record<string, unknown>) =>
  await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer t' }, payload: body })

async function purge() {
  await client.query(`DELETE FROM ncr_items WHERE judul LIKE '[TEST-NOMOR]%'`)
}

/*
  Proyek milik berkas ini DIHAPUS di akhir — bukan sekadar NCR-nya.

  Tanpa ini tiap jalan suite meninggalkan satu proyek AKTIF, dan itu kelas
  cacat yang sudah mahal di repo ini: fixture berkas LAIN memilih proyek
  lewat `LIMIT 1` dan mendarat di sampah (CLAUDE.md 7).

  `ncr_items`-nya dihapus lebih dulu — FK-nya menunjuk projects.
*/
async function purgeProyek() {
  const { rows } = await client.query(
    `SELECT id FROM projects WHERE name LIKE '[TEST-NOMOR]%'`)
  if (rows.length === 0) return
  const ids = rows.map((r) => r.id)
  await client.query(`DELETE FROM ncr_items WHERE project_id = ANY($1)`, [ids])
  await client.query(`DELETE FROM projects WHERE id = ANY($1)`, [ids])
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

  const { rows: u0 } = await client.query(`SELECT id FROM users LIMIT 1`)

  /*
    WARN Proyek SENDIRI, bukan meminjam yang sudah ada — diperbaiki 2026-09-14.

    Versi sebelumnya memakai `SELECT id FROM projects ... ORDER BY created_at
    LIMIT 1`, lalu `purge()` menghapus baris ber-[TEST-NOMOR] saja — dengan
    benar, sebab test tak boleh membuang data seed.

    Yang tak terlihat: proyek tertua itu 'Renovasi Dapur & KM Pak Hendra'
    dan ia SUDAH punya 15 NCR nyata (tertinggi NCR-2608-015). Jadi
    `purge()` tak pernah bisa mengosongkannya, dan:

        diharapkan  NCR-001
        didapat     NCR-2608-016   <- rute BENAR, melanjutkan yang ada

    Test yang menuntut 'proyek tanpa NCR mulai dari NCR-001' memakai proyek
    yang jelas PUNYA NCR. Yang salah fixture-nya, bukan penomorannya.

    Proyek milik sendiri membuat ketiga kasus (kosong, NCR-NNN,
    NCR-YYMM-NNN) benar-benar berangkat dari keadaan yang dinyatakannya.
  */
  const { rows: co } = await client.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1`)
  const { rows: cl } = await client.query(
    `SELECT id FROM clients WHERE company_id = $1 LIMIT 1`, [co[0].id])
  const { rows: p } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, $3, '[TEST-NOMOR] Proyek Penomoran NCR', 'Bandung',
             CURRENT_DATE, CURRENT_DATE + 30, $3)
     RETURNING id`,
    [co[0].id, cl[0].id, u0[0].id])
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
  await purgeProyek()
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
