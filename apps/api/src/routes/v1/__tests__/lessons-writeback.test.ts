import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, penggunaLain } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import lessonsLearnedRoutes from '../lessons-learned.js'

// CECEP Milestone 4 — WRITE-BACK Lessons Learned via engine ADR-007.
//
// Menguji Company Intelligence Loop DENGAN gerbang manusia. Invariant paling mahal:
//   1. Knowledge base HANYA berubah lewat approval — pm (tanpa approve) tak bisa.
//   2. Approve = propagasi membuat VERSI BARU (source='variance'), PERSIS dari usulan.
//   3. Versi LAMA tak tersentuh (immutability). Traceability terisi.
// Terhadap dev `public` (service_role). Entitas [TEST] + dibersihkan.

let app: FastifyInstance
let client: Client
let adminAuth: string
let pmAuth: string
let adminUserId: string
let pengajuId: string
let projectId: string
let resourceId: string
let costCodeId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const req = (method: 'PATCH', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function newLessonWithProposal(
  target: 'productivity' | 'price_book', value: number, ccOverride?: string,
): Promise<string> {
  const cc = ccOverride ?? costCodeId
  const { rows: l } = await client.query(
    `INSERT INTO lessons_learned_records (project_id, title, planned_amount, actual_amount, created_by)
     VALUES ($1,'[TEST] Lesson',10000000,12000000,$2) RETURNING id`, [projectId, pengajuId])
  const lid = l[0].id
  await client.query(
    `INSERT INTO lesson_propagation_proposals (lesson_id, target_type, resource_id, cost_code_id, proposed_value)
     VALUES ($1,$2,$3,$4,$5)`,
    [lid, target, resourceId, target === 'productivity' ? cc : null, value])
  return lid
}
/** Cost code baru berprefiks CC-LLWB (dibersihkan di purge). */
async function freshCostCode(suffix: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO cost_codes (code,name,created_by) VALUES ($1,'x',$2) RETURNING id`,
    [`CC-LLWB-${suffix}`, adminUserId])
  return rows[0].id
}
const lessonStatus = async (id: string) =>
  (await client.query(`SELECT status FROM lessons_learned_records WHERE id=$1`, [id])).rows[0]?.status

async function purge() {
  await client.query(`SET session_replication_role='replica'`)
  try {
    // ⚠️ Saringan SEMPIT ('[TEST] Loop Intelijen'), bukan '[TEST]%'.
    //
    // Versi sebelumnya menyapu SETIAP proyek berawalan '[TEST]' — dan 17 berkas
    // test lain memakai awalan yang sama di schema `public` BERSAMA. Berjalan
    // berurutan itu tak pernah terlihat; berjalan PARALEL (6 shard), berkas ini
    // menghapus proyek yang sedang dipakai shard lain, lalu shard itu gagal:
    //
    //     insert or update on table "lessons_learned_records" violates
    //     foreign key constraint "lessons_learned_records_project_id_fkey"
    //
    // Pembersihan yang menyapu milik orang lain bukan pembersihan.
    await client.query(`DELETE FROM approval_progress WHERE entity_type='lessons_learned'
      AND entity_id IN (SELECT l.id FROM lessons_learned_records l JOIN projects p ON p.id=l.project_id WHERE p.name = '[TEST] Loop Intelijen')`)
    await client.query(`DELETE FROM productivity_records WHERE source='variance' AND cost_code_id IN (SELECT id FROM cost_codes WHERE code LIKE 'CC-LLWB%')`)
    await client.query(`DELETE FROM price_book_entries WHERE resource_id IN (SELECT id FROM resources WHERE code LIKE 'RBS-LLWB%')`)
    await client.query(`DELETE FROM productivity_records WHERE cost_code_id IN (SELECT id FROM cost_codes WHERE code LIKE 'CC-LLWB%')`)
    // ⚠️ Lesson-nya SENDIRI harus dihapus di sini, SEBELUM proyeknya.
    //
    // Sampai 2026-08-01 baris ini tak ada, dan akibatnya tak terlihat karena
    // `session_replication_role='replica'` (dipasang di atas) MEMATIKAN FK
    // cascade: menghapus `projects` tak menyeret `lessons_learned_records`
    // ikut hilang, ia hanya jadi yatim yang menunjuk proyek yang tak ada.
    //
    // Tiap run menambah, tanpa satu pun gejala. Terhitung 913 baris yatim
    // pada hari ini — dan angka itu sempat dibaca sebagai "modul Lessons
    // Learned punya 828 data", padahal seluruhnya residu test yang menumpuk.
    // Pembersihan yang melewatkan tabel utamanya bukan pembersihan.
    await client.query(
      `DELETE FROM lessons_learned_records
       -- Judul '[TEST] Lesson' adalah milik berkas INI, dan sudah mencakup
       -- yatim dari run sebelumnya (baris yang proyeknya keburu hilang).
       -- Menyapu SEMUA yatim — seperti versi sebelumnya — akan menghapus residu
       -- berkas lain yang sedang berjalan paralel.
       WHERE title = '[TEST] Lesson'
          OR project_id IN (SELECT id FROM projects WHERE name = '[TEST] Loop Intelijen')`)
    await client.query(`DELETE FROM projects WHERE name = '[TEST] Loop Intelijen'`)
    await client.query(`DELETE FROM cost_codes WHERE code LIKE 'CC-LLWB%'`)
    await client.query(`DELETE FROM resources WHERE code LIKE 'RBS-LLWB%'`)
  } finally { await client.query(`SET session_replication_role='origin'`) }
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(lessonsLearnedRoutes)
  await app.ready()

  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  pmAuth = (await authIdForRole(client, 'pm')) ?? ''
  const { rows: au } = await client.query(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = au[0].id
  // Pengaju ORANG LAIN — gerbang SoD (TJS-P4, 2026-08-12) melarang pengaju
  // menyetujui pengajuannya sendiri. Fixture ini dulu memakai satu orang
  // untuk dua peran; diperbaiki di fixture, BUKAN dengan alasan_override
  // (itu akan membuat test menempuh jalur istimewa dan yang diuji berubah).
  const _lain = await penggunaLain(client, adminUserId)
  if (!_lain) throw new Error('butuh minimal 2 pengguna aktif — fixture approval perlu pengaju ≠ penyetuju')
  pengajuId = _lain.userId

  await purge()
  const { rows: cl } = await client.query(`SELECT id FROM clients LIMIT 1`)
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id,pm_id,name,location,start_date,end_date,created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1,$2,'[TEST] Loop Intelijen','Bandung',CURRENT_DATE,CURRENT_DATE+30,$2) RETURNING id`, [cl[0].id, adminUserId])
  projectId = pr[0].id
  const { rows: rr } = await client.query(
    `INSERT INTO resources (code,name,category,unit_code,created_by) VALUES ('RBS-LLWB-TK','Tukang Besi','labor','OH',$1) RETURNING id`, [adminUserId])
  resourceId = rr[0].id
  const { rows: cc } = await client.query(
    `INSERT INTO cost_codes (code,name,created_by) VALUES ('CC-LLWB-PB','Pembesian',$1) RETURNING id`, [adminUserId])
  costCodeId = cc[0].id
}, 90_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => { await purge(); await app.close(); await client.end() })

describe('Gerbang manusia — knowledge base HANYA berubah lewat approval', () => {
  it('NEGATIF: pm (tanpa cecep:lessons:approve) tak bisa approve → 403, nol propagasi', async () => {
    const lid = await newLessonWithProposal('productivity', 0.42)
    actAs(adminAuth); await req('PATCH', `/api/v1/lessons-learned/${lid}/submit`)
    actAs(pmAuth)
    const r = await req('PATCH', `/api/v1/lessons-learned/${lid}/approve`)
    expect(r.statusCode).toBe(403)
    // knowledge base TIDAK berubah
    const { rows } = await client.query(
      `SELECT COUNT(*)::int n FROM productivity_records WHERE cost_code_id=$1 AND source='variance'`, [costCodeId])
    expect(rows[0].n, 'pm ditolak → nol versi baru').toBe(0)
    expect(await lessonStatus(lid)).toBe('under_review')
  }, 30_000)
})

describe('Approve = propagasi productivity: VERSI BARU source=variance', () => {
  it('produktivitas aktual 0,42 → versi baru; lesson jadi propagated', async () => {
    const lid = await newLessonWithProposal('productivity', 0.42)
    actAs(adminAuth); await req('PATCH', `/api/v1/lessons-learned/${lid}/submit`)
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/lessons-learned/${lid}/approve`)
    expect(r.statusCode, r.body).toBe(200)
    expect(JSON.parse(r.body).status).toBe('propagated')
    expect(await lessonStatus(lid)).toBe('propagated')

    // versi baru produktivitas dgn nilai PERSIS + source=variance
    const { rows } = await client.query(
      `SELECT productivity_value::float8 AS v, source FROM productivity_records
        WHERE cost_code_id=$1 AND resource_id=$2 ORDER BY version_number DESC LIMIT 1`, [costCodeId, resourceId])
    expect(rows[0].v).toBe(0.42)
    expect(rows[0].source).toBe('variance')

    // traceability: proposal.created_record_id terisi
    const { rows: pr } = await client.query(
      `SELECT created_record_id FROM lesson_propagation_proposals WHERE lesson_id=$1`, [lid])
    expect(pr[0].created_record_id).not.toBeNull()
  }, 60_000)

  it('versi LAMA tak tersentuh: propagasi menambah versi, bukan mutate', async () => {
    const cc = await freshCostCode('OLD')
    // seed versi awal (bootstrap 0,5) untuk cost code segar
    await client.query(
      `INSERT INTO productivity_records (resource_id,cost_code_id,version_number,productivity_value,source,created_by)
       VALUES ($1,$2,1,0.5,'national_bootstrap',$3)`, [resourceId, cc, adminUserId])
    const lid = await newLessonWithProposal('productivity', 0.42, cc)
    actAs(adminAuth); await req('PATCH', `/api/v1/lessons-learned/${lid}/submit`)
    actAs(adminAuth); await req('PATCH', `/api/v1/lessons-learned/${lid}/approve`)
    // versi 1 masih 0,5 (immutable), versi baru 0,42 hidup berdampingan
    const { rows } = await client.query(
      `SELECT version_number, productivity_value::float8 AS v FROM productivity_records
        WHERE cost_code_id=$1 AND resource_id=$2 ORDER BY version_number`, [cc, resourceId])
    expect(rows[0].v, 'versi lama utuh').toBe(0.5)
    expect(rows[rows.length - 1].v, 'versi baru dari variance').toBe(0.42)
  }, 60_000)
})

describe('Approve = propagasi price_book: entry VERIFIED baru', () => {
  it('harga aktual → price_book_entry baru status verified (approval lesson = verifikasi)', async () => {
    const lid = await newLessonWithProposal('price_book', 175000)
    actAs(adminAuth); await req('PATCH', `/api/v1/lessons-learned/${lid}/submit`)
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/lessons-learned/${lid}/approve`)
    expect(r.statusCode, r.body).toBe(200)
    const { rows } = await client.query(
      `SELECT amount::float8 AS a, status, verified_by FROM price_book_entries
        WHERE resource_id=$1 ORDER BY version_number DESC LIMIT 1`, [resourceId])
    expect(rows[0].a).toBe(175000)
    expect(rows[0].status).toBe('verified')
    expect(rows[0].verified_by).toBe(adminUserId)
  }, 60_000)
})

describe('Guard STOP tetap: approved→propagated hanya via propagasi, bukan manual', () => {
  it('set status propagated manual TANPA lewat approve tetap bisa? tidak — hanya fungsi yg memicu, dan itu butuh approved', async () => {
    // Lesson under_review, coba paksa ke propagated langsung via SQL → ditolak transisi
    const lid = await newLessonWithProposal('productivity', 0.42)
    actAs(adminAuth); await req('PATCH', `/api/v1/lessons-learned/${lid}/submit`)
    await expect(client.query(`UPDATE lessons_learned_records SET status='propagated' WHERE id=$1`, [lid]))
      .rejects.toThrow(/tidak sah/) // under_review→propagated bukan transisi sah
  }, 30_000)
})
