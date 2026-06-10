import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, supabaseAuth } from '../utils/supabase.js'

// Tipe untuk user yang sudah terautentikasi
export interface AuthUser {
  id: string
  auth_id: string
  name: string
  email: string
  phone: string | null
  role: 'admin' | 'pm' | 'mandor' | 'client'
}

// Dekorasi request dengan user
declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthUser
  }
}

// Middleware: verifikasi token dan ambil user dari database
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Token tidak ditemukan' })
  }

  const token = authHeader.replace('Bearer ', '')

  // Verifikasi token via dedicated auth client (keeps service-role client clean for data queries)
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token)

  if (authError || !authData.user) {
    return reply.status(401).send({ error: 'Token tidak valid atau sudah expired' })
  }

  // Ambil data user dari tabel users berdasarkan auth_id
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, auth_id, name, email, phone, role')
    .eq('auth_id', authData.user.id)
    .single()

  if (userError || !user) {
    return reply.status(403).send({ error: 'User tidak terdaftar di sistem' })
  }

  request.currentUser = user as AuthUser
}

// Guard: hanya role tertentu yang boleh akses
export function requireRole(...roles: AuthUser['role'][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Belum login' })
    }

    if (!roles.includes(request.currentUser.role)) {
      return reply.status(403).send({
        error: `Akses ditolak. Butuh role: ${roles.join(' atau ')}`
      })
    }
  }
}