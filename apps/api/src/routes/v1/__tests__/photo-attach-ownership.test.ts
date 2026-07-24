import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import progressRoutes from '../progress.js'

// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP retry-attach foto (temuan verifikasi founder).
//
// Endpoint POST /projects/:projectId/photos/upload menerima `progress_log_id`
// (untuk retry). Tanpa ownership check, user terautentikasi mana pun bisa
// menautkan foto ke progress log MILIK ORANG LAIN — service_role bypass RLS &
// table-RLS dormant, jadi gate di handler adalah satu-satunya penjaga.
//
// Pola penolakan mengikuti DELETE progress-log di file yang sama:
//   404 "Log tidak ditemukan"  → log tak ada ATAU bukan milik proyek itu
//                                (tak membocorkan mana yang benar terjadi)
//   403 "Akses ditolak"        → ada, tapi user tak berhak
//
// Catatan: cek otorisasi berjalan SEBELUM upload ke storage, jadi test negatif
// TIDAK mengotori bucket.
// ─────────────────────────────────────────────────────────────────────────────

const NON_EXISTENT = '00000000-0000-0000-0000-000000000000'
// base64 kecil & bukan gambar valid → lolos gate otorisasi, gagal di validasi MIME (400).
// Dipakai untuk kasus POSITIF supaya tak menulis file sungguhan ke storage.
const NOT_AN_IMAGE = Buffer.from('bukan gambar').toString('base64')

let app: FastifyInstance
let client: Client
let adminAuth: string
let otherMandorAuth: string
let ownerAuth: string
let log: { id: string; project_id: string; reported_by: string } | null = null

function actAs(authId: string) {
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({
    data: { user: { id: authId } }, error: null,
  } as never)
}

const upload = (projectId: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: `/api/v1/projects/${projectId}/photos/upload`,
    payload: { file_base64: NOT_AN_IMAGE, file_name: 'x.png', ...body },
    headers: { authorization: 'Bearer test' },
  })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(progressRoutes)
  await app.ready()

  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''

  // FIXTURE KRITIS: log milik mandor X, DAN mandor Y yang JUGA DITUGASKAN di proyek
  // yang sama. Mandor Y harus LOLOS gate proyek tapi DITOLAK oleh cek kepemilikan log.
  // (Kalau Y tidak ditugaskan, ia ditolak gate proyek duluan → test jadi vacuous:
  //  terbukti lewat mutation test — mematikan cek kepemilikan tetap hijau.)
  // Pemilik log (mandor X) HARUS juga ditugaskan di proyeknya → supaya test POSITIF
  // benar-benar melewati gate proyek DAN gate kepemilikan log.
  const { rows } = await client.query(`
    SELECT pl.id, pl.project_id, pl.reported_by, uo.auth_id AS owner_auth, uy.auth_id AS other_auth
    FROM progress_logs pl
    JOIN users uo ON uo.id = pl.reported_by AND uo.auth_id IS NOT NULL
    JOIN roles ro ON ro.id = uo.role_id AND ro.name = 'mandor'
    JOIN mandor_assignments mo ON mo.project_id = pl.project_id AND mo.mandor_id = pl.reported_by
                              AND mo.status <> 'terminated'
    JOIN mandor_assignments ma ON ma.project_id = pl.project_id AND ma.mandor_id <> pl.reported_by
                              AND ma.status <> 'terminated'
    JOIN users uy ON uy.id = ma.mandor_id AND uy.auth_id IS NOT NULL
    JOIN roles ry ON ry.id = uy.role_id AND ry.name = 'mandor'
    LIMIT 1`)
  log = rows[0] ? { id: rows[0].id, project_id: rows[0].project_id, reported_by: rows[0].reported_by } : null
  otherMandorAuth = rows[0]?.other_auth ?? ''
  ownerAuth = rows[0]?.owner_auth ?? ''
}, 60_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => { await app.close(); await client.end() })

describe('Retry-attach foto — ownership progress_log_id', () => {
  it('NEGATIF: mandor SE-PROYEK (lolos gate proyek) tetap DITOLAK menautkan ke log milik mandor lain', async () => {
    if (!log || !otherMandorAuth) return expect.unreachable('fixture mandor/log tidak tersedia')
    actAs(otherMandorAuth)
    const res = await upload(log.project_id, { progress_log_id: log.id })
    // 403 = ditolak cek KEPEMILIKAN LOG (bukan gate proyek — mandor ini ditugaskan di proyek itu)
    expect([403, 404], `harus ditolak, dapat ${res.statusCode}: ${res.body}`).toContain(res.statusCode)
  }, 30_000)

  it('NEGATIF: progress_log_id tak dikenal → 404 (tak bocorkan keberadaan)', async () => {
    if (!log) return expect.unreachable('fixture log tidak tersedia')
    actAs(adminAuth)
    const res = await upload(log.project_id, { progress_log_id: NON_EXISTENT })
    expect(res.statusCode).toBe(404)
  }, 30_000)

  it('NEGATIF: log milik proyek LAIN → 404 (cegah tautan lintas-proyek)', async () => {
    if (!log) return expect.unreachable('fixture log tidak tersedia')
    actAs(adminAuth)
    // projectId sengaja tidak cocok dengan project_id milik log
    const res = await upload(NON_EXISTENT, { progress_log_id: log.id })
    expect([403, 404]).toContain(res.statusCode)
  }, 30_000)

  it('POSITIF: admin LOLOS gate ownership (gagal di validasi MIME, bukan 403/404)', async () => {
    if (!log) return expect.unreachable('fixture log tidak tersedia')
    actAs(adminAuth)
    const res = await upload(log.project_id, { progress_log_id: log.id })
    expect(res.statusCode, 'admin harus lolos gate').toBe(400) // MIME invalid = gate sudah lewat
  }, 30_000)

  // TEST PALING PENTING: menangkap gagal-TERTUTUP. Tanpa ini, bug "semua mandor sah
  // ditolak 403" lolos — semua test negatif tetap hijau karena mereka memang
  // mengharapkan penolakan. (Bug nyata: `.neq('status','cancelled')` padahal enum
  // assignment_status = active|completed|terminated → query error → data null →
  // dianggap tak ditugaskan.)
  it('POSITIF: mandor DITUGASKAN + pemilik log → LOLOS kedua gate (bukan 403)', async () => {
    if (!ownerAuth || !log) return expect.unreachable('fixture pemilik log tidak tersedia')
    actAs(ownerAuth)
    const res = await upload(log.project_id, { progress_log_id: log.id })
    expect(res.statusCode, `mandor pemilik log TIDAK boleh ditolak, dapat ${res.statusCode}: ${res.body}`).not.toBe(403)
    expect(res.statusCode).not.toBe(404)
    expect(res.statusCode).toBe(400) // gagal di validasi MIME = kedua gate sudah lewat
  }, 30_000)

  it('NEGATIF: upload TANPA attach pun butuh akses proyek (mandor tak ditugaskan → 403)', async () => {
    if (!otherMandorAuth) return expect.unreachable('fixture mandor tidak tersedia')
    actAs(otherMandorAuth)
    const res = await upload(NON_EXISTENT, {}) // proyek yang tak ada = pasti tak ditugaskan
    expect(res.statusCode).toBe(403)
  }, 30_000)
})
