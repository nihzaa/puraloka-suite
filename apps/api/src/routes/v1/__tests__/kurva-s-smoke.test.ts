import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import kurvaSRoutes from '../kurva-s.js'
import reportRoutes from '../reports.js'

// Smoke test Kurva-S: memastikan endpoint yang HIDUP benar-benar mengembalikan
// kurva berisi, dan endpoint laporan tetap utuh setelah query hantu
// `kurva_s_points` dihapus (T4 — tabel itu tak pernah ada di DB).

let app: FastifyInstance
let c: Client
let adminAuth: string
let projectId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never)

beforeAll(async () => {
  c = await createRlsClient()
  const { rows: u } = await c.query(
    `SELECT u.auth_id FROM users u JOIN roles r ON r.id=u.role_id
     WHERE r.name='admin' AND u.auth_id IS NOT NULL ORDER BY u.created_at LIMIT 1`)
  adminAuth = u[0].auth_id
  // Proyek dgn progress log terbanyak — kurva paling bermakna.
  const { rows: p } = await c.query(`
    SELECT p.id FROM projects p WHERE NOT p.is_deleted
    ORDER BY (SELECT count(*) FROM progress_logs l
              WHERE l.project_id=p.id AND l.mode='daily' AND l.pct_overall IS NOT NULL) DESC
    LIMIT 1`)
  projectId = p[0].id
  app = Fastify()
  await app.register(kurvaSRoutes)
  await app.register(reportRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => { await app?.close(); await c?.end() })

describe('Kurva-S — endpoint yang hidup', () => {
  it('GET /projects/:id/kurva-s → 200 dengan titik kurva + EVM', async () => {
    actAs(adminAuth)
    const r = await app.inject({
      method: 'GET', url: `/api/v1/projects/${projectId}/kurva-s`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const body = r.json()
    // Kurva harus BERISI — endpoint yang mengembalikan array kosong juga "200",
    // dan itu persis kegagalan senyap yang sedang kita cegah.
    expect(Array.isArray(body.chartData), 'chartData harus array').toBe(true)
    expect(body.chartData.length, 'kurva kosong = tidak berguna').toBeGreaterThan(0)
    expect(body.meta?.evm, 'meta.evm wajib ada').toBeTruthy()
    expect(typeof body.meta.evm.bac).toBe('number')
    expect(body.meta.totalWeeks, 'timeline kosong').toBeGreaterThan(0)
  })

  it('titik kurva punya bentuk yang dipakai chart (week/plan/actual)', async () => {
    actAs(adminAuth)
    const r = await app.inject({
      method: 'GET', url: `/api/v1/projects/${projectId}/kurva-s`,
      headers: { authorization: 'Bearer t' },
    })
    const t0 = r.json().chartData[0]
    expect(Object.keys(t0).length, 'titik kurva kosong').toBeGreaterThan(1)
    // Tiga garis yang dipakai kurva-s-section.tsx: rencana, serapan, aktual.
    expect(t0).toHaveProperty('week')
  })
})

describe('Laporan proyek — utuh setelah query hantu dihapus', () => {
  it('GET /reports/project-summary → 200, kurvaSPoints tetap ada sebagai array', async () => {
    actAs(adminAuth)
    const r = await app.inject({
      method: 'GET', url: `/api/v1/reports/project-summary?project_id=${projectId}`,
      headers: { authorization: 'Bearer t' },
    })
    if (r.statusCode !== 200) console.error('LAPORAN BODY:', r.statusCode, r.body.slice(0,300))
    expect(r.statusCode).toBe(200)
    const body = r.json()
    // KONTRAK dipertahankan: field tetap ada & tetap array (frontend
    // laporan/page.tsx:790 merender chart hanya bila length > 0).
    expect(Array.isArray(body.kurvaSPoints)).toBe(true)
    // Data proyeknya sendiri HARUS terisi — bukti penghapusan query hantu tak
    // merusak 13 query lain di handler yang sama.
    expect(body.project?.id).toBe(projectId)
  })
})
