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
import estimateVersionRoutes from '../estimate-versions.js'
import lessonsLearnedRoutes from '../lessons-learned.js'

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

/*
  ⚠ `allow` dan `deny` WAJIB dicocokkan ke tabel `role_permissions`, bukan
  ditebak dari nama jabatan.

  Tiga spek di bawah semula menulis `allow: 'pm'` untuk buat-invoice,
  bayar-invoice, dan approve-kasbon. Diukur 2026-08-31, template `pm` tak
  memegang satu pun dari ketiganya — yang memegang hanya `admin` dan
  `direktur`. Ketiga test itu MERAH sejak commit yang melahirkannya
  (f80654b0): spek dan test ditulis bersamaan, dan `allow`-nya tak pernah
  diverifikasi ke basis.

  Yang diuji berkas ini adalah WIRING preHandler — apakah gerbangnya
  terpasang — bukan kebijakan siapa boleh apa. `allow` karena itu hanya label
  untuk "peran yang PUNYA izin ini", persis seperti komentar di tipe `Spec`.
  Salah label = test merah atas gerbang yang justru bekerja benar.

  Menaikkan izin `pm` agar test hijau adalah arah yang SALAH: `finance:invoice:pay`
  memindahkan uang, dan memperluas kewenangan demi kehijauan test menukar
  pengendalian internal dengan kenyamanan. Kalau PM memang perlu ketiganya,
  itu keputusan produk yang ditulis di RATIFIKASI lalu diberikan lewat
  migrasi — bukan efek samping perbaikan test.

  Cara memeriksa sebelum menambah spek baru:

      SELECT r.name FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key = '<izin>' AND r.company_id IS NULL;
*/
const SPECS: Spec[] = [
  { name: 'buat invoice',            routes: financeRoutes,     method: 'POST',   url: '/api/v1/finance/invoices',                     permission: 'finance:invoice:create',  allow: 'direktur', deny: 'pm',     payload: {} },
  { name: 'bayar invoice',           routes: financeRoutes,     method: 'POST',   url: `/api/v1/finance/invoice/${UUID}/pay`,          permission: 'finance:invoice:pay',     allow: 'direktur', deny: 'pm',     payload: {} },
  { name: 'putihkan denda',          routes: financeRoutes,     method: 'PATCH',  url: `/api/v1/finance/invoice/${UUID}/waive-penalty`,permission: 'finance:penalty:waive',   allow: 'admin', deny: 'pm',     payload: { reason: 'uji' } },
  { name: 'approve/reject kasbon',   routes: kasbonRoutes,      method: 'PATCH',  url: `/api/v1/kasbons/${UUID}/status`,               permission: 'mandor:kasbon:approve',   allow: 'direktur', deny: 'pm',     payload: { status: 'approved' } },
  { name: 'approve change order',    routes: changeOrderRoutes, method: 'PATCH',  url: `/api/v1/change-orders/${UUID}/approve`,        permission: 'change_order:approve',    allow: 'admin', deny: 'pm',     payload: {} },
  { name: 'reject change order',     routes: changeOrderRoutes, method: 'PATCH',  url: `/api/v1/change-orders/${UUID}/reject`,         permission: 'change_order:approve',    allow: 'admin', deny: 'pm',     payload: {} },
  { name: 'approve expense kas',     routes: cashRoutes,        method: 'PATCH',  url: `/api/v1/cash/expenses/${UUID}/status`,         permission: 'cash:expense:approve',    allow: 'admin', deny: 'pm',     payload: { status: 'approved' } },
  // deny = client, BUKAN mandor: `procurement:mr:manage` di-seed ke admin/direktur/pm/mandor
  // (diverifikasi ke DB, bukan diasumsikan) — jadi mandor memang berhak, dulu maupun sekarang.
  { name: 'approve material request',routes: procurementRoutes, method: 'PATCH',  url: `/api/v1/procurement/material-requests/${UUID}/approve`, permission: 'procurement:mr:manage', allow: 'admin', deny: 'client', payload: { action: 'approve' } },
  // Estimate Version approve/reject: gerbang via canParticipateInChain (bukan
  // requirePermission preHandler) — pm TANPA cecep:estimate:approve → 403.
  { name: 'approve estimasi',        routes: estimateVersionRoutes, method: 'PATCH', url: `/api/v1/estimate-versions/${UUID}/approve`, permission: 'cecep:estimate:approve', allow: 'admin', deny: 'pm', payload: {} },
  { name: 'reject estimasi',         routes: estimateVersionRoutes, method: 'PATCH', url: `/api/v1/estimate-versions/${UUID}/reject`,  permission: 'cecep:estimate:approve', allow: 'admin', deny: 'pm', payload: {} },
  // Lessons Learned approve = memicu write-back ke knowledge base. Gerbang kasar
  // canParticipateInChain menjaga 403-sebelum-404: pm (tanpa cecep:lessons:approve)
  // TAK boleh tahu apakah id lesson-nya ada.
  { name: 'approve lessons learned', routes: lessonsLearnedRoutes, method: 'PATCH', url: `/api/v1/lessons-learned/${UUID}/approve`, permission: 'cecep:lessons:approve', allow: 'admin', deny: 'pm', payload: {} },
  { name: 'reject lessons learned',  routes: lessonsLearnedRoutes, method: 'PATCH', url: `/api/v1/lessons-learned/${UUID}/reject`,  permission: 'cecep:lessons:approve', allow: 'admin', deny: 'pm', payload: {} },
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
  /*
    Peran diturunkan DARI SPECS, bukan didaftar tangan.

    Daftar tangan `['admin','pm','mandor','client']` membuat spek yang memakai
    peran di luar keempatnya gagal dengan "Tidak ada user ber-auth_id" — galat
    yang menuduh DATA UJI, padahal daftarnya yang tertinggal. Terjadi
    2026-08-31 saat tiga spek dipindah ke `direktur`.

    'client' tetap disertakan meski tak selalu muncul di SPECS: ia dipakai
    sebagai `deny` untuk MR (`procurement:mr:manage` dipegang admin/pm/mandor/
    direktur, jadi satu-satunya yang benar-benar tak berhak adalah client).
  */
  const peranDipakai = new Set<string>(['client'])
  for (const spec of SPECS) {
    peranDipakai.add(spec.allow)
    peranDipakai.add(spec.deny)
  }
  const tanpaAkun: string[] = []
  for (const role of peranDipakai) {
    AUTH[role] = (await authIdForRole(client, role)) ?? ''
    if (!AUTH[role]) tanpaAkun.push(role)
  }
  /*
    Gagal KERAS di sini, bukan nanti per-test.

    Tanpa ini, tiap spek yang memakai peran tak ber-akun gagal sendiri-sendiri
    dengan pesan yang sama — dan yang membaca hasilnya menghitung 3 kegagalan
    berbeda alih-alih satu sebab tunggal.
  */
  if (tanpaAkun.length > 0) {
    throw new Error(
      `Tak ada pengguna ber-auth_id untuk peran: ${tanpaAkun.join(', ')}. ` +
        'Jalankan `UJI_SANDI_PERAN=… node scripts/siapkan-akun-uji-peran.mjs`.',
    )
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
