import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'

import financeRoutes from '../finance.js'
import kasbonRoutes from '../kasbons.js'
import changeOrderRoutes from '../change-orders.js'
import cashRoutes from '../cash.js'
import settingsRoutes from '../settings.js'
import rolesRoutes from '../roles.js'
import authRoutes from '../auth.js'
import projectRoutes from '../projects.js'
import procurementRoutes from '../procurement.js'

// ─────────────────────────────────────────────────────────────────────────────
// TEST INTEGRASI OTORISASI (403) — jaring pengaman wiring preHandler.
//
// KENAPA ADA: TABLE RLS dormant (API pakai service_role yang bypass RLS), sehingga
// `requirePermission` di preHandler adalah SATU-SATUNYA penegak otorisasi untuk data
// lewat API — TANPA cadangan. Sebelum test ini, wiring-nya nol test: kalau satu
// preHandler terhapus saat refactor, tak ada yang merah (persis risiko CRITICAL-1).
//
// APA YANG DIUJI (nyata, bukan mock):
//   • route module ASLI didaftarkan → rantai preHandler asli (authenticate + requirePermission)
//   • tabel `users` + RPC `get_role_permissions` ASLI (DB dev) → grant permission nyata
// YANG DI-STUB: HANYA verifikasi token (`supabaseAuth.auth.getUser`) — itu AUTENTIKASI,
// bukan otorisasi. Login nyata butuh password (blocker kredensial), dan bukan yang diuji.
//
// ASERSI:
//   • role TAK berhak  → HARUS 403 (gate menolak)
//   • role berhak      → HARUS BUKAN 403 (gate lolos; boleh 400/404/500 krn payload dummy)
// ─────────────────────────────────────────────────────────────────────────────

const UUID = '00000000-0000-0000-0000-000000000000'

/** Bentuk modul route di repo ini: `export default async function x(app: FastifyInstance)`. */
type RouteModule = (app: FastifyInstance) => Promise<void>

interface Spec {
  name: string
  routes: RouteModule
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  permission: string
  allow: string   // role yang PUNYA permission
  deny: string    // role yang TIDAK punya
  payload?: Record<string, unknown>
}

const SPECS: Spec[] = [
  { name: 'buat invoice',            routes: financeRoutes,     method: 'POST',   url: '/api/v1/finance/invoices',                     permission: 'finance:invoice:create',  allow: 'pm',    deny: 'mandor', payload: {} },
  { name: 'bayar invoice',           routes: financeRoutes,     method: 'POST',   url: `/api/v1/finance/invoice/${UUID}/pay`,          permission: 'finance:invoice:pay',     allow: 'pm',    deny: 'mandor', payload: {} },
  { name: 'putihkan denda',          routes: financeRoutes,     method: 'PATCH',  url: `/api/v1/finance/invoice/${UUID}/waive-penalty`,permission: 'finance:penalty:waive',   allow: 'admin', deny: 'pm',     payload: { reason: 'uji' } },
  { name: 'approve/reject kasbon',   routes: kasbonRoutes,      method: 'PATCH',  url: `/api/v1/kasbons/${UUID}/status`,               permission: 'mandor:kasbon:approve',   allow: 'pm',    deny: 'mandor', payload: { status: 'approved' } },
  { name: 'approve change order',    routes: changeOrderRoutes, method: 'PATCH',  url: `/api/v1/change-orders/${UUID}/approve`,        permission: 'change_order:approve',    allow: 'admin', deny: 'pm',     payload: {} },
  { name: 'reject change order',     routes: changeOrderRoutes, method: 'PATCH',  url: `/api/v1/change-orders/${UUID}/reject`,         permission: 'change_order:approve',    allow: 'admin', deny: 'pm',     payload: {} },
  { name: 'approve expense kas',     routes: cashRoutes,        method: 'PATCH',  url: `/api/v1/cash/expenses/${UUID}/status`,         permission: 'cash:expense:approve',    allow: 'admin', deny: 'pm',     payload: { status: 'approved' } },
  // deny = client, BUKAN mandor: `procurement:mr:manage` di-seed ke admin/direktur/pm/mandor
  // (diverifikasi ke DB, bukan diasumsikan) — jadi mandor memang berhak, dulu maupun sekarang.
  { name: 'approve material request',routes: procurementRoutes, method: 'PATCH',  url: `/api/v1/procurement/material-requests/${UUID}/approve`, permission: 'procurement:mr:manage', allow: 'admin', deny: 'client', payload: { action: 'approve' } },
  { name: 'ubah config finansial',   routes: settingsRoutes,    method: 'PUT',    url: '/api/v1/settings/finance',                     permission: 'settings:finance:manage', allow: 'admin', deny: 'pm',     payload: { key: 'tax.ppn_rate', value: 0.11, effective_from: '2030-01-01' } },
  { name: 'ubah permission role',    routes: rolesRoutes,       method: 'PUT',    url: `/api/v1/roles/${UUID}/permissions`,            permission: 'users:roles:manage',      allow: 'admin', deny: 'pm',     payload: { permission_ids: [] } },
  { name: 'register user baru',      routes: authRoutes,        method: 'POST',   url: '/api/v1/auth/register',                        permission: 'users:manage',            allow: 'admin', deny: 'mandor', payload: {} },
  { name: 'hapus proyek',            routes: projectRoutes,     method: 'DELETE', url: `/api/v1/projects/${UUID}`,                     permission: 'projects:delete',         allow: 'admin', deny: 'mandor' },
]

let client: Client
const AUTH: Record<string, string> = {}
const apps = new Map<RouteModule, FastifyInstance>()

async function appFor(routes: RouteModule): Promise<FastifyInstance> {
  const cached = apps.get(routes)
  if (cached) return cached
  const app = Fastify({ logger: false })
  // Plugin minimal yang dipakai route (cookie utk fallback token, multipart utk upload).
  await app.register((await import('@fastify/cookie')).default)
  await app.register((await import('@fastify/multipart')).default)
  await app.register(routes as never)
  await app.ready()
  apps.set(routes, app)
  return app
}

/** Impersonasi role: stub HANYA verifikasi token; sisanya (users, permission) nyata. */
function actAs(role: string) {
  const authId = AUTH[role]
  if (!authId) throw new Error(`Tidak ada user ber-auth_id untuk role '${role}'`)
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({
    data: { user: { id: authId } }, error: null,
  } as never)
}

beforeAll(async () => {
  client = await createRlsClient()
  // 'client' ditambahkan untuk MR: `procurement:mr:manage` dipegang admin/pm/mandor/
  // direktur, jadi satu-satunya role yang benar-benar TIDAK berhak adalah client.
  for (const role of ['admin', 'pm', 'mandor', 'client']) {
    AUTH[role] = (await authIdForRole(client, role)) ?? ''
  }
}, 60_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  for (const app of apps.values()) await app.close()
  await client.end()
})

describe('Otorisasi endpoint sensitif — gate requirePermission (jaring wiring)', () => {
  for (const s of SPECS) {
    it(`NEGATIF: ${s.deny} DITOLAK 403 — ${s.name} (${s.permission})`, async () => {
      const app = await appFor(s.routes)
      actAs(s.deny)
      const res = await app.inject({
        method: s.method, url: s.url,
        payload: s.payload as never,
        headers: { authorization: 'Bearer test' },
      })
      expect(res.statusCode, `${s.method} ${s.url} sbg ${s.deny} harus 403, dapat ${res.statusCode}`).toBe(403)
    }, 30_000)

    it(`POSITIF: ${s.allow} LOLOS gate — ${s.name} (${s.permission})`, async () => {
      const app = await appFor(s.routes)
      actAs(s.allow)
      const res = await app.inject({
        method: s.method, url: s.url,
        payload: s.payload as never,
        headers: { authorization: 'Bearer test' },
      })
      // Bukan 403 = gate lolos. Status lain (400/404/500) wajar krn payload dummy.
      expect(res.statusCode, `${s.method} ${s.url} sbg ${s.allow} TIDAK boleh 403`).not.toBe(403)
    }, 30_000)
  }
})
