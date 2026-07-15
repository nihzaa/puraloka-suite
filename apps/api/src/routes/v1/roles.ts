import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'

export default async function rolesRoutes(app: FastifyInstance) {

  // GET /api/v1/roles — list semua role + jumlah permissions + jumlah user
  app.get('/api/v1/roles', { preHandler: [authenticate] }, async (request, reply) => {
    const { data: roles, error } = await supabase
      .from('roles')
      .select(`
        id, name, label, description, is_builtin, portal, color, sort_order, created_at,
        role_permissions(count)
      `)
      .order('sort_order')

    if (error) return reply.status(500).send({ error: error.message })

    // Enrich dengan user count per role
    const { data: userCounts } = await supabase
      .from('users')
      .select('role')
      .eq('is_active', true)

    const countMap: Record<string, number> = {}
    for (const u of userCounts ?? []) {
      countMap[u.role] = (countMap[u.role] ?? 0) + 1
    }

    const enriched = (roles ?? []).map((r: any) => ({
      ...r,
      permission_count: r.role_permissions?.[0]?.count ?? 0,
      user_count: countMap[r.name] ?? 0,
      role_permissions: undefined,
    }))

    return reply.send({ roles: enriched })
  })

  // POST /api/v1/roles — buat role baru
  app.post('/api/v1/roles', { preHandler: [authenticate, requirePermission('users:roles:manage')] }, async (request, reply) => {
    const body = request.body as {
      name: string
      label: string
      description?: string
      portal?: string
      color?: string
      copy_from?: string  // nama role yang di-clone permission-nya
    }

    if (!body.name || !body.label) {
      return reply.status(400).send({ error: 'name dan label wajib diisi' })
    }

    // Validasi slug
    if (!/^[a-z][a-z0-9_]*$/.test(body.name)) {
      return reply.status(400).send({ error: 'name harus lowercase, boleh angka dan underscore' })
    }

    const { data: role, error } = await supabase
      .from('roles')
      .insert({
        name: body.name,
        label: body.label,
        description: body.description ?? null,
        portal: body.portal ?? 'dashboard',
        color: body.color ?? '#6B7280',
        is_builtin: false,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return reply.status(409).send({ error: `Role '${body.name}' sudah ada` })
      return reply.status(500).send({ error: error.message })
    }

    // Clone permissions dari role lain jika diminta
    if (body.copy_from) {
      const { data: sourceRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', body.copy_from)
        .single()

      if (sourceRole) {
        const { data: sourcePerms } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', sourceRole.id)

        if (sourcePerms && sourcePerms.length > 0) {
          await supabase.from('role_permissions').insert(
            sourcePerms.map((p: any) => ({
              role_id: role.id,
              permission_id: p.permission_id,
              granted_by: request.currentUser!.id,
            }))
          )
        }
      }
    }

    return reply.status(201).send({ role })
  })

  // PATCH /api/v1/roles/:id — edit role (label, desc, color, portal)
  // Built-in roles: boleh edit label/desc/color tapi tidak name
  app.patch('/api/v1/roles/:id', { preHandler: [authenticate, requirePermission('users:roles:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      label?: string
      description?: string
      portal?: string
      color?: string
      name?: string
    }

    const { data: existing } = await supabase.from('roles').select('is_builtin').eq('id', id).single()
    if (!existing) return reply.status(404).send({ error: 'Role tidak ditemukan' })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.label) update.label = body.label
    if (body.description !== undefined) update.description = body.description
    if (body.color) update.color = body.color
    if (body.portal) update.portal = body.portal
    // Tidak izinkan rename built-in roles
    if (body.name && !existing.is_builtin) update.name = body.name

    const { data: role, error } = await supabase
      .from('roles')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ role })
  })

  // DELETE /api/v1/roles/:id — hapus role custom (built-in protected by DB trigger)
  app.delete('/api/v1/roles/:id', { preHandler: [authenticate, requirePermission('users:roles:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Cek apakah masih ada user dengan role ini
    const { data: existing } = await supabase.from('roles').select('name, is_builtin').eq('id', id).single()
    if (!existing) return reply.status(404).send({ error: 'Role tidak ditemukan' })

    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', existing.name)
      .eq('is_active', true)

    if ((count ?? 0) > 0) {
      return reply.status(409).send({ error: `Tidak bisa hapus role '${existing.name}' — masih ada ${count} user aktif` })
    }

    const { error } = await supabase.from('roles').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ success: true })
  })

  // ─── PERMISSIONS ─────────────────────────────────────────────────────────────

  // GET /api/v1/permissions — list semua permissions dikelompok per modul
  app.get('/api/v1/permissions', { preHandler: [authenticate] }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('permissions')
      .select('id, key, module, label, description, sort_order')
      .order('module')
      .order('sort_order')

    if (error) return reply.status(500).send({ error: error.message })

    // Group by module
    const grouped: Record<string, any[]> = {}
    for (const p of data ?? []) {
      if (!grouped[p.module]) grouped[p.module] = []
      grouped[p.module].push(p)
    }

    return reply.send({ permissions: data ?? [], grouped })
  })

  // GET /api/v1/roles/:id/permissions — permissions yang dimiliki role ini
  app.get('/api/v1/roles/:id/permissions', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission_id, permissions(id, key, module, label)')
      .eq('role_id', id)

    if (error) return reply.status(500).send({ error: error.message })

    const perms = (data ?? []).map((row: any) => row.permissions).filter(Boolean)
    return reply.send({ permissions: perms })
  })

  // PUT /api/v1/roles/:id/permissions — replace-all permissions untuk role ini
  app.put('/api/v1/roles/:id/permissions', { preHandler: [authenticate, requirePermission('users:roles:manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { permission_ids } = request.body as { permission_ids: string[] }

    if (!Array.isArray(permission_ids)) {
      return reply.status(400).send({ error: 'permission_ids harus array' })
    }

    // Verify role exists
    const { data: role } = await supabase.from('roles').select('id, name').eq('id', id).single()
    if (!role) return reply.status(404).send({ error: 'Role tidak ditemukan' })

    // Delete all existing permissions for this role
    await supabase.from('role_permissions').delete().eq('role_id', id)

    // Insert new permission set
    if (permission_ids.length > 0) {
      const rows = permission_ids.map((pid) => ({
        role_id: id,
        permission_id: pid,
        granted_by: request.currentUser!.id,
      }))

      const { error } = await supabase.from('role_permissions').insert(rows)
      if (error) return reply.status(500).send({ error: error.message })
    }

    return reply.send({ success: true, count: permission_ids.length })
  })

  // GET /api/v1/auth/me/permissions — permission keys untuk user yang sedang login
  app.get('/api/v1/auth/me/permissions', { preHandler: [authenticate] }, async (request, reply) => {
    const { data, error } = await supabase.rpc('get_role_permissions', {
      role_name: request.currentUser!.role
    })

    if (error) return reply.status(500).send({ error: error.message })

    const keys = (data ?? []).map((r: { permission_key: string }) => r.permission_key)
    return reply.send({ permissions: keys, role: request.currentUser!.role })
  })
}
