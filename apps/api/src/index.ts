import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import projectRoutes from './routes/v1/projects.js'
import authRoutes from './routes/v1/auth.js'
import dashboardRoutes from './routes/v1/dashboard.js'
import kasbonRoutes from './routes/v1/kasbons.js'
import clientRoutes from './routes/v1/clients.js'
import userRoutes from './routes/v1/users.js'
import progressRoutes from './routes/v1/progress.js'
import milestoneRoutes from './routes/v1/milestones.js'
import rabRoutes from './routes/v1/rab.js'
import documentRoutes from './routes/v1/documents.js'
import contractRoutes from './routes/v1/contracts.js'
import kurvaSRoutes from './routes/v1/kurva-s.js'
import terminPaymentRoutes from './routes/v1/termin-payment.js'
import financeRoutes from './routes/v1/finance.js'
import cashRoutes from './routes/v1/cash.js'
import mandorRoutes from './routes/v1/mandor.js'
import reportsRoutes from './routes/v1/reports.js'
import settingsRoutes from './routes/v1/settings.js'
import companiesRoutes from './routes/v1/companies.js'
import rapRoutes from './routes/v1/rap.js'
import menuRoutes from './routes/v1/menu.js'
import moduleRoutes from './routes/v1/modules.js'
import notificationRoutes from './routes/v1/notifications.js'
import procurementRoutes from './routes/v1/procurement.js'
import rolesRoutes from './routes/v1/roles.js'
import changeOrderRoutes from './routes/v1/change-orders.js'
import rabScheduleRoutes from './routes/v1/rab-schedule.js'
import auditRoutes from './routes/v1/audit.js'
import searchRoutes from './routes/v1/search.js'
import unitsRoutes from './routes/v1/units.js'
import workCategoriesRoutes from './routes/v1/work-categories.js'
import kasbonPurposesRoutes from './routes/v1/kasbon-purposes.js'
import approvalChainRoutes from './routes/v1/approval-chains.js'
import notificationRuleRoutes from './routes/v1/notification-rules.js'
import estimateVersionRoutes from './routes/v1/estimate-versions.js'
import ahspRoutes from './routes/v1/ahsp.js'
import priceBookRoutes from './routes/v1/price-book.js'
import lessonsLearnedRoutes from './routes/v1/lessons-learned.js'
import { supabase } from './utils/supabase.js'
import { registerObservability } from './utils/observability.js'

dotenv.config()

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required')

// ── Sub-Fase 1D.1 — Structured Logging (environment-aware) ───────────────────
// Production: JSON terstruktur ke stdout (TANPA transport pino-pretty) supaya bisa
// di-ingest log aggregator. Development: pino-pretty agar terbaca manusia.
// Ini perubahan KONFIGURASI, bukan ganti library — Pino sudah dipakai; pino-pretty
// hanya transport-nya.
//
// ⚠️ Risiko yang disadari (Phase1/03-migration-strategy.md § Migrasi 1D): kalau
// NODE_ENV tidak diset benar di server, log bisa berubah format tak terduga.
// Nilai NODE_ENV di-log eksplisit saat start (lihat blok listen) agar terverifikasi,
// bukan diasumsikan.
const isProduction = process.env.NODE_ENV === 'production'

const app = Fastify({
  logger: isProduction
    ? { level: process.env.LOG_LEVEL ?? 'info' }
    : {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      },
  // ── Sub-Fase 1D.2 — Correlation ID ─────────────────────────────────────────
  // Satu UUID per request, dipakai DUA konsumen: (1) korelasi log line,
  // (2) audit_logs.correlation_id. (Konsumen ke-3 workflow_instances dihapus saat
  // fase CONTRACT 1C — engine diretire, lihat ADR-006.)
  //
  // requestIdHeader:false WAJIB — default Fastify memakai header `request-id`
  // dari proxy/klien sebagai req.id (bisa non-UUID). Karena correlation_id kolom
  // bertipe uuid, req.id HARUS UUID → matikan trust header, genReqId selalu jalan.
  requestIdHeader: false,
  genReqId: () => randomUUID(),
})

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const allowed = [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
    ]
    if (allowed.some(re => re.test(origin))) return cb(null, true)
    cb(new Error('Not allowed by CORS'), false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
await app.register(helmet, {
  crossOriginResourcePolicy: { policy: 'same-site' },
})
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET ?? process.env.JWT_SECRET,
  parseOptions: {},
})
await app.register(rateLimit, {
  global: false,  // hanya apply ke route yang pakai config rateLimit
  max: 10,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'Terlalu banyak percobaan, coba lagi dalam 1 menit' }),
})
await app.register(jwt, {
  secret: process.env.JWT_SECRET!
})
await app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

// 1D.3 — instrumentasi OTel (opt-in via OTEL_ENABLED=true; default no-op).
// Didaftarkan SEBELUM route agar instrumentasi membungkus handler.
await registerObservability(app)

app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
  const status = (err as any).statusCode ?? 500
  // Body melebihi bodyLimit → pesan Fastify default berbahasa Inggris & teknis
  // ("Request body is too large"). Terjemahkan supaya user paham (upload foto/dokumen).
  if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply.status(413).send({ error: 'Ukuran file terlalu besar untuk diunggah' })
  }
  if (status >= 500) {
    app.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
  return reply.status(status).send({ error: err.message })
})

// ── Sub-Fase 1D.3 — /health diperluas: cek konektivitas DB ───────────────────
// Sebelumnya /health hanya enumerasi route → selalu "ok" walau DB mati (health
// check yang tak pernah gagal tidak berguna untuk load balancer/uptime monitor).
// Sekarang benar-benar menyentuh DB dengan query murah + timeout, dan mengembalikan
// 503 bila DB tak terjangkau.
app.get('/health', async (_request, reply) => {
  const routes = app.printRoutes({ commonPrefix: false })
  const groups = [...new Set(
    routes.split('\n')
      .map(l => l.match(/\/api\/v1\/([^\/\s]+)/)?.[1])
      .filter((g): g is string => Boolean(g))
  )]

  // Query paling murah yang membuktikan koneksi hidup + RLS/PostgREST responsif.
  // Timeout eksplisit supaya /health tidak menggantung saat DB lambat.
  const startedAt = Date.now()
  let dbStatus: 'ok' | 'error' = 'ok'
  let dbError: string | undefined
  try {
    const probe = supabase.from('roles').select('id', { head: true, count: 'exact' }).limit(1)
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('db probe timeout 3s')), 3000))
    const { error } = await Promise.race([probe, timeout]) as { error?: { message: string } }
    if (error) { dbStatus = 'error'; dbError = error.message }
  } catch (e) {
    dbStatus = 'error'
    dbError = (e as Error).message
  }
  const dbLatencyMs = Date.now() - startedAt

  const healthy = dbStatus === 'ok'
  if (!healthy) reply.status(503)

  return {
    status: healthy ? 'ok' : 'degraded',
    app: 'Puraloka Suite API',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
    checks: {
      database: { status: dbStatus, latencyMs: dbLatencyMs, ...(dbError ? { error: dbError } : {}) },
    },
    routeGroups: groups,
  }
})

await app.register(authRoutes)
await app.register(projectRoutes)
await app.register(dashboardRoutes)
await app.register(kasbonRoutes)
await app.register(clientRoutes)
await app.register(userRoutes)
await app.register(progressRoutes)
await app.register(milestoneRoutes)
await app.register(rabRoutes)
await app.register(documentRoutes)
await app.register(contractRoutes)
await app.register(kurvaSRoutes)
await app.register(terminPaymentRoutes)
await app.register(financeRoutes)
await app.register(cashRoutes)
await app.register(mandorRoutes)
await app.register(reportsRoutes)
await app.register(settingsRoutes)
await app.register(companiesRoutes)
await app.register(rapRoutes)
await app.register(menuRoutes)
await app.register(moduleRoutes)
await app.register(notificationRoutes)
await app.register(procurementRoutes)
await app.register(rolesRoutes)
await app.register(changeOrderRoutes)
await app.register(rabScheduleRoutes)
await app.register(auditRoutes)
await app.register(searchRoutes)
await app.register(unitsRoutes)
await app.register(workCategoriesRoutes)
await app.register(kasbonPurposesRoutes)
await app.register(approvalChainRoutes)
await app.register(notificationRuleRoutes)
await app.register(estimateVersionRoutes)
await app.register(ahspRoutes)
await app.register(priceBookRoutes)
await app.register(lessonsLearnedRoutes)

const PORT = Number(process.env.PORT) || 3001

try {
  const HOST = process.env.HOST ?? '127.0.0.1'
  await app.listen({ port: PORT, host: HOST })
  console.log(`\n🚀 Puraloka Suite API running on http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/health`)
  // 1D.1 — cetak NODE_ENV & mode logger secara eksplisit. Risiko yang disebut
  // migration-strategy adalah "NODE_ENV salah set diam-diam"; ini membuatnya
  // terverifikasi tiap start, bukan diasumsikan benar.
  console.log(`🔧 NODE_ENV=${process.env.NODE_ENV ?? '(unset → development)'} · logger=${isProduction ? 'json (production)' : 'pino-pretty (dev)'}`)

  // Print registered route groups so every restart is self-verifying
  const routes = app.printRoutes({ commonPrefix: false })
  const groups = [...new Set(
    routes.split('\n')
      .map(l => l.match(/\/api\/v1\/([^\/\s]+)/)?.[1])
      .filter(Boolean)
  )]
  console.log(`📡 Route groups: ${groups.join(', ')}\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
