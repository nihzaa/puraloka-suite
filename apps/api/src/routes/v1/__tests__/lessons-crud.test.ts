/**
 * GET & POST lessons-learned — endpoint yang selama ini HILANG.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-13: modul ini punya tabel, empat trigger, fungsi propagasi
 * atomik, alur persetujuan, dan lima test — tetapi rutenya HANYA tiga PATCH.
 * Pelajaran tak bisa dibuat maupun dilihat lewat aplikasi.
 *
 *   • akar masalah & usulan benar-benar tersimpan bersama induknya
 *   • pelajaran proyek tenant lain tak terlihat maupun tersentuh
 *   • trigger `trg_lessons_immutable` & `trg_lessons_no_delete` masih menjaga
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import lessonsRoutes from '../lessons-learned.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let resourceId: string
let costCodeId: string

const TANDA = '[UJI-LLC]'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

const isiSah = (o: Record<string, unknown> = {}) => ({
  project_id: projectId,
  title: `${TANDA} Bekisting kolom butuh 1,4x tenaga dari asumsi AHSP`,
  planned_amount: 10_000_000,
  actual_amount: 14_000_000,
  akar: [{ description: 'Tinggi kolom 4,2 m menuntut perancah tambahan', category: 'metode' }],
  usulan: [{ target_type: 'price_book', resource_id: resourceId, proposed_value: 145_000 }],
  ...o,
})

async function bersihkan() {
  // ── Status DITURUNKAN ke draft lebih dulu ────────────────────────────────
  //
  // `trg_lessons_no_delete` melarang menghapus yang berstatus <> 'draft', dan
  // test di berkas ini sengaja memajukan satu baris ke `under_review` untuk
  // menguji larangan itu. Tanpa langkah ini, pembersihannya gagal dan SELURUH
  // berkas ini di-skip pada run berikutnya — persis yang terjadi 2026-08-13.
  //
  // Menonaktifkan triggernya akan lebih pendek, tetapi itu melemahkan pagar
  // produksi demi kenyamanan test. Menurunkan status adalah operasi yang
  // memang diizinkan alur (`under_review → draft` = reject).
  await db.query(
    `UPDATE lessons_learned_records SET status = 'draft'
      WHERE title LIKE $1 AND status = 'under_review'`, [`${TANDA}%`])

  // Cascade dimatikan di jalur lain, jadi anak dihapus lebih dulu — pelajaran
  // yang sama dengan residu 1.873 baris yatim (lessons-writeback.test.ts).
  await db.query(
    `DELETE FROM lesson_propagation_proposals WHERE lesson_id IN
       (SELECT id FROM lessons_learned_records WHERE title LIKE $1)`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM root_cause_analyses WHERE lesson_id IN
       (SELECT id FROM lessons_learned_records WHERE title LIKE $1)`, [`${TANDA}%`])
  await db.query('DELETE FROM lessons_learned_records WHERE title LIKE $1', [`${TANDA}%`])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [u[0].id])
  companyId = co[0].company_id

  const { rows: p } = await db.query(
    'SELECT id FROM projects WHERE company_id = $1 LIMIT 1', [companyId])
  if (!p.length) throw new Error('tak ada proyek di company ini')
  projectId = p[0].id

  const { rows: r } = await db.query('SELECT id FROM resources LIMIT 1')
  if (!r.length) throw new Error('tak ada resource — fixture tak terbentuk')
  resourceId = r[0].id

  const { rows: cc } = await db.query('SELECT id FROM cost_codes LIMIT 1')
  if (!cc.length) throw new Error('tak ada cost code — fixture tak terbentuk')
  costCodeId = cc[0].id

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(lessonsRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('menolak yang tak mengubah apa pun', () => {
  it('tanpa usulan ditolak 400', async () => {
    const r = await post('/api/v1/lessons-learned', isiSah({ usulan: [] }))
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/tak mengubah apa pun/i)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM lessons_learned_records WHERE title LIKE $1', [`${TANDA}%`])
    expect(rows[0].n, 'pelajaran tersimpan padahal ditolak').toBe(0)
  })

  it('tanpa akar masalah ditolak 400', async () => {
    const r = await post('/api/v1/lessons-learned', isiSah({ akar: [] }))
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/keluhan/i)
  })

  it('proyek milik tenant LAIN ditolak 404', async () => {
    const { rows } = await db.query(
      'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) throw new Error('tak ada proyek tenant lain — fixture tak terbentuk')

    const r = await post('/api/v1/lessons-learned', isiSah({ project_id: rows[0].id }))
    expect(r.statusCode, r.body).toBe(404)

    const { rows: cek } = await db.query(
      'SELECT count(*)::int n FROM lessons_learned_records WHERE project_id = $1', [rows[0].id])
    expect(cek[0].n, 'pelajaran tercatat pada proyek perusahaan lain').toBe(0)
  })
})

describe('membuat pelajaran', () => {
  let lessonId: string

  it('pelajaran, akar, dan usulan tersimpan bersama', async () => {
    const r = await post('/api/v1/lessons-learned', isiSah({
      usulan: [
        { target_type: 'price_book', resource_id: resourceId, proposed_value: 145_000 },
        { target_type: 'productivity', resource_id: resourceId, cost_code_id: costCodeId, proposed_value: 0.42 },
      ],
      akar: [
        { description: 'Tinggi kolom 4,2 m menuntut perancah tambahan', category: 'metode' },
        { description: 'Koefisien AHSP mengasumsikan kolom 3 m', category: 'estimasi' },
      ],
    }))
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().jumlah_akar).toBe(2)
    expect(r.json().jumlah_usulan).toBe(2)
    lessonId = r.json().lesson.id

    // Diperiksa di BASIS, bukan dari balasan: balasan bisa melaporkan angka
    // yang tak pernah tersimpan.
    const { rows: a } = await db.query(
      'SELECT count(*)::int n FROM root_cause_analyses WHERE lesson_id = $1', [lessonId])
    expect(a[0].n, 'akar masalah tak tersimpan').toBe(2)

    const { rows: p } = await db.query(
      'SELECT count(*)::int n FROM lesson_propagation_proposals WHERE lesson_id = $1', [lessonId])
    expect(p[0].n, 'usulan propagasi tak tersimpan').toBe(2)
  })

  it('lahir sebagai DRAFT, dan variansnya dihitung basis', async () => {
    const { rows } = await db.query(
      'SELECT status, variance_amount FROM lessons_learned_records WHERE id = $1', [lessonId])
    expect(rows[0].status).toBe('draft')
    expect(Number(rows[0].variance_amount)).toBe(4_000_000)
  })

  it('GET menampilkannya beserta akar & usulannya', async () => {
    const r = await get('/api/v1/lessons-learned')
    expect(r.statusCode, r.body).toBe(200)

    const l = r.json().lessons.find((x: { id: string }) => x.id === lessonId)
    expect(l, 'pelajaran yang baru dibuat tak muncul di daftar').toBeTruthy()
    expect(l.akar).toHaveLength(2)
    expect(l.usulan).toHaveLength(2)
    expect(l.proyek?.id).toBe(projectId)
  })

  it('saringan status bekerja', async () => {
    const draf = await get('/api/v1/lessons-learned?status=draft')
    expect(draf.json().lessons.some((x: { id: string }) => x.id === lessonId)).toBe(true)

    const prop = await get('/api/v1/lessons-learned?status=propagated')
    expect(prop.json().lessons.some((x: { id: string }) => x.id === lessonId)).toBe(false)
  })

  it('GET proyek tenant LAIN ditolak 404', async () => {
    const { rows } = await db.query(
      'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) throw new Error('tak ada proyek tenant lain — fixture tak terbentuk')
    const r = await get(`/api/v1/lessons-learned?project_id=${rows[0].id}`)
    expect(r.statusCode, r.body).toBe(404)
  })
})

describe('trigger lama masih menjaga', () => {
  let lessonId: string

  beforeAll(async () => {
    const { rows } = await db.query(
      'SELECT id FROM lessons_learned_records WHERE title LIKE $1 LIMIT 1', [`${TANDA}%`])
    lessonId = rows[0].id
  })

  it('status tak bisa melompat draft → propagated', async () => {
    // Transisi diatur trigger: melompati approval berarti knowledge base
    // berubah tanpa satu pun manusia menyetujuinya.
    await expect(
      db.query(`UPDATE lessons_learned_records SET status = 'propagated' WHERE id = $1`, [lessonId]),
    ).rejects.toThrow(/[Tt]ransisi status/)
  })

  it('DRAFT boleh dihapus, yang sudah maju TIDAK — trg_lessons_no_delete', async () => {
    // Rancangan yang belum jadi rekam jejak boleh dibuang; yang sudah
    // di-submit adalah jejak keputusan dan tak boleh lenyap.
    //
    // Versi pertama test ini mengasumsikan larangan MUTLAK dan gagal. Yang
    // salah asumsinya, bukan triggernya — dibaca dari `prosrc`: larangan
    // hanya berlaku untuk `status <> 'draft'`.
    const { rows: baru } = await db.query(
      `INSERT INTO lessons_learned_records (project_id, title, planned_amount, actual_amount, created_by)
       VALUES ($1, $2, 1000, 2000, (SELECT id FROM users LIMIT 1)) RETURNING id`,
      [projectId, `${TANDA} rancangan yang dibuang`])

    // draft → boleh
    await db.query('DELETE FROM lessons_learned_records WHERE id = $1', [baru.rows?.[0]?.id ?? baru[0].id])

    // sudah maju → ditolak
    await db.query(`UPDATE lessons_learned_records SET status = 'under_review' WHERE id = $1`, [lessonId])
    await expect(
      db.query('DELETE FROM lessons_learned_records WHERE id = $1', [lessonId]),
    ).rejects.toThrow(/tidak boleh dihapus/i)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM lessons_learned_records WHERE id = $1', [lessonId])
    expect(rows[0].n, 'jejak keputusan hilang').toBe(1)
  })
})
