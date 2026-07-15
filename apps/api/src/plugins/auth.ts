import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, supabaseAuth } from '../utils/supabase.js'

// Tipe untuk user yang sudah terautentikasi
export interface AuthUser {
  id: string
  auth_id: string
  name: string
  email: string
  phone: string | null
  role: string  // Dibuat string agar custom role (bukan hanya 4 built-in) bisa di-support
}

// Dekorasi request dengan user + permission cache
declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthUser
    _permissionCache?: Set<string>  // lazy-loaded per-request, via get_role_permissions RPC
  }
}

// Middleware: verifikasi token dari Authorization header atau HttpOnly cookie
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  // Prioritas: Bearer header (untuk API clients) → HttpOnly cookie (untuk browser)
  let token: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '')
  } else if (request.cookies?.puraloka_token) {
    token = request.cookies.puraloka_token
  }

  if (!token) {
    return reply.status(401).send({ error: 'Token tidak ditemukan' })
  }

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

// Guard: hanya role tertentu yang boleh akses (legacy — dipertahankan untuk backward compat)
export function requireRole(...roles: string[]) {
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

// Guard: cek permission spesifik dari tabel role_permissions (RBAC modular)
// Permission cache di-load sekali per request via Supabase RPC, tidak ada N+1
export function requirePermission(permissionKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Belum login' })
    }

    if (!request._permissionCache) {
      const { data, error } = await supabase.rpc('get_role_permissions', {
        role_name: request.currentUser.role
      })
      if (error) {
        return reply.status(500).send({ error: 'Gagal memuat permission' })
      }
      request._permissionCache = new Set(
        (data ?? []).map((r: { permission_key: string }) => r.permission_key)
      )
    }

    if (!request._permissionCache.has(permissionKey)) {
      return reply.status(403).send({
        error: `Akses ditolak. Butuh permission: ${permissionKey}`
      })
    }
  }
}