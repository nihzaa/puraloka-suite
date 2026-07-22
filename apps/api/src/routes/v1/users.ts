import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'

export default async function userRoutes(app: FastifyInstance) {

  // GET /api/v1/users?role=pm&all=true — list users
  // Tanpa all=true: hanya aktif (untuk dropdown). Dengan all=true (admin): semua user + is_active
  app.get('/api/v1/users', { preHandler: [authenticate] }, async (request, reply) => {
    const { role, all } = request.query as { role?: string; all?: string }

    // Data-scoping, bukan authorization gate (ADR-004 Rule #1): endpoint sudah
    // ter-authenticate; ini hanya menentukan apakah user nonaktif ikut ditampilkan.
    const isAdmin = request.currentUser?.role === 'admin'
    const showAll = all === 'true' && isAdmin

    let query = supabase
      .from('users')
      .select('id, name, email, phone, role, is_active, created_at')
      .order('role')
      .order('name')

    if (role) query = query.eq('role', role)
    if (!showAll) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return { users: data }
  })

  // PATCH /api/v1/users/:id — update data user (admin only)
  app.patch('/api/v1/users/:id', { preHandler: [authenticate, requirePermission('users:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, phone, role } = request.body as { name?: string; phone?: string; role?: string }

    // Dynamic role validation: query roles table
    if (role !== undefined) {
      const { data: roleRow } = await supabase.from('roles').select('id').eq('name', role).single()
      if (!roleRow) {
        return reply.status(400).send({ error: `Role '${role}' tidak valid` })
      }
    }

    const updates: Record<string, unknown> = {}
    if (name) updates.name = name.trim()
    if (phone !== undefined) updates.phone = phone || null
    if (role) updates.role = role
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: 'Tidak ada field yang diubah' })
    const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single()
    if (error) return reply.status(500).send({ error: error.message })
    return { user: data }
  })

  // PATCH /api/v1/users/:id/toggle-active — aktifkan/nonaktifkan user (admin only)
  app.patch('/api/v1/users/:id/toggle-active', { preHandler: [authenticate, requirePermission('users:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (id === request.currentUser?.id) {
      return reply.status(400).send({ error: 'Tidak bisa mengubah status akun sendiri' })
    }
    const { data: current } = await supabase.from('users').select('is_active').eq('id', id).single()
    if (!current) return reply.status(404).send({ error: 'User tidak ditemukan' })
    const { data, error } = await supabase.from('users').update({ is_active: !current.is_active }).eq('id', id).select().single()
    if (error) return reply.status(500).send({ error: error.message })
    return { user: data }
  })
}
