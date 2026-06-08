import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'
import projectRoutes from './routes/v1/projects.js'
import authRoutes from './routes/v1/auth.js'
import { supabase } from './utils/supabase.js'

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

await app.register(authRoutes)
await app.register(projectRoutes)

const PORT = Number(process.env.PORT) || 3001

try {
    // Debug: test supabase connection
app.get('/debug/users', async () => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, auth_id')
    .limit(3)

  return { data, error }
})

// Debug: test login flow
app.get('/debug/login-test', async () => {
  // Step 1: coba sign in
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'nizarzul16@gmail.com',
    password: 'nizar123'
  })

  if (authError) return { step: 'auth_failed', error: authError.message }

  // Step 2: cari user di tabel
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, email, auth_id')
    .eq('auth_id', authData.user.id)
    .single()

  return {
    auth_user_id: authData.user.id,
    user_found: user,
    user_error: userError
  }
})

  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\n🚀 Puraloka Suite API running on http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/health`)
  console.log(`📊 Projects: http://localhost:${PORT}/api/v1/projects`)
  console.log(`🔐 Auth: http://localhost:${PORT}/api/v1/auth/login\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}