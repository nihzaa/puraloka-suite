import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'
import projectRoutes from './routes/v1/projects.js'

dotenv.config()

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

await app.register(helmet)
await app.register(cors, {
  origin: ['http://localhost:3000', 'http://localhost:8081'],
  credentials: true
})
await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'fallback_secret'
})

app.get('/health', async () => {
  return {
    status: 'ok',
    app: 'Puraloka Suite API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }
})

await app.register(projectRoutes)

const PORT = Number(process.env.PORT) || 3001

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\n🚀 Puraloka Suite API running on http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/health`)
  console.log(`📊 Projects: http://localhost:${PORT}/api/v1/projects\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}