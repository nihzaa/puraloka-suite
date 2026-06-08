import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

export default async function authRoutes(app: FastifyInstance) {

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as {
      email: string
      password: string
    }

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email dan password wajib diisi' })
    }

    // Login via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return reply.status(401).send({ error: 'Email atau password salah' })
    }

    // Ambil data user dari tabel users
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, auth_id, name, email, phone, role, avatar_url')
      .eq('auth_id', data.user.id)
      .single()

    if (userError || !user) {
      return reply.status(403).send({ error: 'Akun belum terdaftar di sistem Puraloka Suite' })
    }

    // Update last_login_at
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)

    return {
      user,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    }
  })

  // POST /api/v1/auth/register — hanya admin yang bisa daftarkan user baru
  app.post('/api/v1/auth/register', {
    preHandler: [authenticate]
  }, async (request, reply) => {

    // Cek apakah yang register adalah admin
    if (request.currentUser?.role !== 'admin') {
      return reply.status(403).send({ error: 'Hanya admin yang bisa mendaftarkan user baru' })
    }

    const { email, password, name, phone, role } = request.body as {
      email: string
      password: string
      name: string
      phone?: string
      role: 'admin' | 'pm' | 'mandor' | 'client'
    }

    if (!email || !password || !name || !role) {
      return reply.status(400).send({ error: 'Email, password, name, dan role wajib diisi' })
    }

    // Buat auth user di Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      return reply.status(400).send({ error: authError.message })
    }

    // Simpan ke tabel users
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authData.user.id,
        name,
        email,
        phone: phone ?? null,
        role
      })
      .select()
      .single()

    if (userError) {
      return reply.status(500).send({ error: userError.message })
    }

    return { message: 'User berhasil didaftarkan', user }
  })

  // GET /api/v1/auth/me — ambil data user yang sedang login
  app.get('/api/v1/auth/me', {
    preHandler: [authenticate]
  }, async (request) => {
    return { user: request.currentUser }
  })

  // POST /api/v1/auth/refresh — refresh token
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token: string }

    if (!refresh_token) {
      return reply.status(400).send({ error: 'Refresh token wajib diisi' })
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    })

    if (error || !data.session) {
      return reply.status(401).send({ error: 'Refresh token tidak valid' })
    }

    return {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    }
  })
}