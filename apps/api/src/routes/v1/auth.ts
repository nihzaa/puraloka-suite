import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { sendWelcomeEmail } from '../../utils/email.js'
import { flattenUserRole } from '../../utils/user-role.js'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60,
}


export default async function authRoutes(app: FastifyInstance) {

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        // `isRateLimit` wajib ada — setErrorHandler memakainya untuk membalas 429.
        // Tanpa penanda ini balasan jatuh jadi 500 "Internal server error" dan user
        // yang terkena limit mengira kredensialnya yang salah.
        errorResponseBuilder: () => ({
          isRateLimit: true,
          error: 'Terlalu banyak percobaan login, coba lagi dalam 1 menit',
        }),
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as {
      email: string
      password: string
    }

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email dan password wajib diisi' })
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password minimal 8 karakter' })
    }

    // Login via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return reply.status(401).send({ error: 'Email atau password salah' })
    }

    // Ambil data user dari tabel users. FASE 3 CONTRACT: role via FK (enum di-drop).
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id, auth_id, name, email, phone, role_id, roles:role_id ( name ), avatar_url')
      .eq('auth_id', data.user.id)
      .single()

    if (userError || !userRow) {
      return reply.status(403).send({ error: 'Akun belum terdaftar di sistem Puraloka Suite' })
    }
    const user = flattenUserRole(userRow)

    // Update last_login_at
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)

    // Ambil permissions + portal home secara paralel
    const [permsResult, roleResult] = await Promise.all([
      supabase.rpc('get_role_permissions', { role_name: user.role }),
      supabase.from('roles').select('portal').eq('name', user.role).single(),
    ])
    const permissions = (permsResult.data ?? []).map((r: { permission_key: string }) => r.permission_key)
    const homePortal = roleResult.data?.portal ?? 'dashboard'

    // Set HttpOnly cookies — tidak bisa dibaca JS di browser
    reply
      .setCookie('puraloka_token', data.session.access_token, COOKIE_OPTS)
      .setCookie('puraloka_refresh', data.session.refresh_token, COOKIE_OPTS)

    return reply.send({
      user,
      permissions,
      homePortal,
      session: {
        expires_at: data.session.expires_at
      }
    })
  })

  // POST /api/v1/auth/register — hanya admin yang bisa daftarkan user baru
  // F1 (AKTA 0 lockout fix): otorisasi via permission `users:manage`, BUKAN role
  // literal 'admin'. Sebelumnya register tak punya requirePermission sama sekali —
  // otorisasi 100% role literal yang melockout role custom (direktur punya users:manage).
  app.post('/api/v1/auth/register', {
    preHandler: [authenticate, requirePermission('users:manage')]
  }, async (request, reply) => {

    const { email, password, name, phone, role } = request.body as {
      email: string
      password: string
      name: string
      phone?: string
      role: string
    }

    if (!email || !password || !name || !role) {
      return reply.status(400).send({ error: 'Email, password, name, dan role wajib diisi' })
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password minimal 8 karakter' })
    }

    // T4i: lewat wrapper — `roles` kategori AB. `roles.name` UNIQUE GLOBAL
    // (migration 050), jadi tanpa saringan ini admin tenant A yang tahu/menebak
    // nama role custom tenant B bisa mendaftarkan user dengan role_id milik B
    // dan mewarisi permission set perusahaan lain.
    const { data: roleRow } = await request.db!
      .from('roles').select('id').eq('name', role).maybeSingle()
    if (!roleRow) {
      return reply.status(400).send({ error: `Role '${role}' tidak valid` })
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
        role_id: roleRow.id // FASE 3 CONTRACT: role_id satu-satunya sumber (enum di-drop).
                            // Menerima role custom apa pun yang ada di tabel roles.
      })
      .select()
      .single()

    if (userError) {
      // Rollback: hapus auth user yang sudah dibuat
      await supabase.auth.admin.deleteUser(authData.user.id)
      return reply.status(500).send({ error: 'Gagal menyimpan data user' })
    }

    // Fire-and-forget welcome email
    sendWelcomeEmail({ to: email, name, role, password }).catch(() => {})

    return reply.status(201).send({ message: 'User berhasil didaftarkan', user })
  })

  // GET /api/v1/auth/me — ambil data user yang sedang login
  app.get('/api/v1/auth/me', {
    preHandler: [authenticate]
  }, async (request) => {
    return { user: request.currentUser }
  })

  // POST /api/v1/auth/refresh — refresh token via cookie atau body
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    // Coba ambil refresh token dari HttpOnly cookie dulu, fallback ke body
    const refreshTokenFromCookie = request.cookies?.puraloka_refresh
    const { refresh_token: refreshTokenFromBody } = (request.body ?? {}) as { refresh_token?: string }
    const refresh_token = refreshTokenFromCookie ?? refreshTokenFromBody

    if (!refresh_token) {
      return reply.status(400).send({ error: 'Refresh token tidak ditemukan' })
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    })

    if (error || !data.session) {
      // Hapus cookie yang sudah tidak valid
      reply
        .clearCookie('puraloka_token', { path: '/' })
        .clearCookie('puraloka_refresh', { path: '/' })
      return reply.status(401).send({ error: 'Refresh token tidak valid' })
    }

    // Update HttpOnly cookies dengan token baru
    reply
      .setCookie('puraloka_token', data.session.access_token, COOKIE_OPTS)
      .setCookie('puraloka_refresh', data.session.refresh_token, COOKIE_OPTS)

    return reply.send({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    })
  })

  // POST /api/v1/auth/google-callback — tukar Supabase OAuth session → HttpOnly cookie
  // Whitelist-only: hanya email yang sudah ada di tabel users yang boleh masuk
  app.post('/api/v1/auth/google-callback', async (request, reply) => {
    const { access_token, refresh_token } = request.body as {
      access_token: string
      refresh_token?: string
    }

    if (!access_token) {
      return reply.status(400).send({ error: 'access_token wajib diisi' })
    }

    // Verifikasi access_token ke Supabase
    const { data: { user: supaUser }, error: tokenError } = await supabase.auth.getUser(access_token)
    if (tokenError || !supaUser) {
      return reply.status(401).send({ error: 'Token tidak valid' })
    }

    // Whitelist check: email harus sudah ada di tabel users. FASE 3: role via FK.
    const { data: userRow } = await supabase
      .from('users')
      .select('id, auth_id, name, email, phone, role_id, roles:role_id ( name ), avatar_url')
      .eq('email', supaUser.email!)
      .single()

    if (!userRow) {
      return reply.status(403).send({ error: 'Akun belum terdaftar. Hubungi admin untuk mendapatkan akses.' })
    }
    const user = flattenUserRole(userRow)

    // Jika auth_id belum diisi (user dibuat sebelum Google OAuth aktif), update sekarang
    if (!user.auth_id) {
      // Hasil DIPERIKSA: `auth_id` adalah tautan akun ke Supabase Auth. Kalau
      // update ini gagal diam-diam, login Google berikutnya menempuh jalur yang
      // sama dan gagal menaut lagi — selamanya, tanpa gejala. Tak diblokir
      // (login yang sedang berjalan tetap sah), tapi dicatat sebagai error
      // supaya kegagalan berulang terlihat.
      const { error: tautErr } = await supabase
        .from('users').update({ auth_id: supaUser.id }).eq('id', user.id)
      if (tautErr) {
        request.log.error({ tautErr, userId: user.id }, 'Gagal menautkan auth_id ke user')
      }
    }

    // `last_login_at` sengaja fire-and-forget: kegagalannya tak mengubah apa
    // pun yang penting, dan memblokir login karena stempel waktu jauh lebih
    // buruk daripada stempel yang meleset. Dicatat, tak diblokir.
    const { error: loginErr } = await supabase
      .from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
    if (loginErr) {
      request.log.warn({ loginErr, userId: user.id }, 'Gagal mencatat last_login_at')
    }

    // Ambil permissions + portal home
    const [permsResult2, roleResult2] = await Promise.all([
      supabase.rpc('get_role_permissions', { role_name: user.role }),
      supabase.from('roles').select('portal').eq('name', user.role).single(),
    ])
    const permissions = (permsResult2.data ?? []).map((r: { permission_key: string }) => r.permission_key)
    const homePortal = roleResult2.data?.portal ?? 'dashboard'

    // Set HttpOnly cookies
    reply
      .setCookie('puraloka_token', access_token, COOKIE_OPTS)
    if (refresh_token) {
      reply.setCookie('puraloka_refresh', refresh_token, COOKIE_OPTS)
    }

    return reply.send({ user, permissions, homePortal })
  })

  // POST /api/v1/auth/logout — hapus cookie server-side
  app.post('/api/v1/auth/logout', async (_request, reply) => {
    reply
      .clearCookie('puraloka_token', { path: '/' })
      .clearCookie('puraloka_refresh', { path: '/' })
    return reply.send({ success: true })
  })
}
