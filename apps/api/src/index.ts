import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
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
import menuRoutes from './routes/v1/menu.js'
import moduleRoutes from './routes/v1/modules.js'
import notificationRoutes from './routes/v1/notifications.js'
import procurementRoutes from './routes/v1/procurement.js'
import rolesRoutes from './routes/v1/roles.js'
import changeOrderRoutes from './routes/v1/change-orders.js'
import rabScheduleRoutes from './routes/v1/rab-schedule.js'
import auditRoutes from './routes/v1/audit.js'
import searchRoutes from './routes/v1/search.js'

dotenv.config()

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required')

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  }
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

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = (err as any).statusCode ?? 500
  if (status >= 500) {
    app.log.error(err)
    return reply.status(500).send({ error: 'Internal server error' })
  }
  return reply.status(status).send({ error: err.message })
})

app.get('/health', async () => {
  const routes = app.printRoutes({ commonPrefix: false })
  const groups = [...new Set(
    routes.split('\n')
      .map(l => l.match(/\/api\/v1\/([^\/\s]+)/)?.[1])
      .filter((g): g is string => Boolean(g))
  )]
  return {
    status: 'ok',
    app: 'Puraloka Suite API',
    timestamp: new Date().toISOString(),
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
await app.register(menuRoutes)
await app.register(moduleRoutes)
await app.register(notificationRoutes)
await app.register(procurementRoutes)
await app.register(rolesRoutes)
await app.register(changeOrderRoutes)
await app.register(rabScheduleRoutes)
await app.register(auditRoutes)
await app.register(searchRoutes)

const PORT = Number(process.env.PORT) || 3001

try {
  const HOST = process.env.HOST ?? '127.0.0.1'
  await app.listen({ port: PORT, host: HOST })
  console.log(`\n🚀 Puraloka Suite API running on http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/health`)

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
