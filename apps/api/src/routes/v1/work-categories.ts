import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { normalizeCategoryCode, validateCategoryInput } from '../../lib/work-categories.js'

// Master kategori pekerjaan terpusat — migration 094 (census A7, pola units 090).
// Read = authenticated (dropdown form mandor); tulis = work_categories:manage.
// `code` immutable (= nilai tersimpan work_scope_items.category) → nonaktifkan bukan hapus.
export default async function workCategoriesRoutes(app: FastifyInstance) {
  app.get('/api/v1/work-categories', { preHandler: [authenticate] }, async (request, reply) => {
    const includeInactive = (request.query as { all?: string })?.all === 'true'
    let q = request.db!.from('work_categories')
      .select('code, label, sort_order, is_active')
      .order('sort_order', { ascending: true }).order('code', { ascending: true })
    if (!includeInactive) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ categories: data ?? [] })
  })

  app.post('/api/v1/work-categories', {
    preHandler: [authenticate, requirePermission('work_categories:manage')],
  }, async (request, reply) => {
    const body = request.body as { code?: string; label?: string; sort_order?: number }
    const code = normalizeCategoryCode(body.code ?? '')
    const v = validateCategoryInput({ code, label: body.label, sort_order: body.sort_order }, { requireCode: true })
    if (!v.ok) return reply.status(400).send({ error: v.error })
    if (body.label === undefined) return reply.status(400).send({ error: 'Wajib: code, label' })

    const { data, error } = await request.db!.from('work_categories').insert({
      code, label: String(body.label).trim(), sort_order: body.sort_order ?? 0,
      updated_by: request.currentUser!.id,
    }).select('code, label, sort_order, is_active').single()
    if (error) {
      if ((error as { code?: string }).code === '23505') return reply.status(409).send({ error: `Kategori "${code}" sudah ada` })
      return reply.status(500).send({ error: error.message })
    }
    void logAuditEvent(request, {
      tableName: 'work_categories', recordId: code, action: 'work_categories.create',
      actorId: request.currentUser!.id, newValues: data as Record<string, unknown>, severity: 'info',
    })
    return reply.status(201).send({ category: data })
  })

  app.patch('/api/v1/work-categories/:code', {
    preHandler: [authenticate, requirePermission('work_categories:manage')],
  }, async (request, reply) => {
    const code = normalizeCategoryCode((request.params as { code: string }).code)
    const body = request.body as { label?: string; sort_order?: number; is_active?: boolean }
    const v = validateCategoryInput(body)
    if (!v.ok) return reply.status(400).send({ error: v.error })

    const patch: Record<string, unknown> = { updated_by: request.currentUser!.id, updated_at: new Date().toISOString() }
    if (body.label !== undefined) patch.label = String(body.label).trim()
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order
    if (body.is_active !== undefined) patch.is_active = !!body.is_active
    if (Object.keys(patch).length <= 2) return reply.status(400).send({ error: 'Tidak ada field yang diubah' })

    const { data: prev } = await request.db!.from('work_categories')
      .select('label, sort_order, is_active').eq('code', code).maybeSingle()
    if (!prev) return reply.status(404).send({ error: `Kategori "${code}" tidak ditemukan` })

    const { data, error } = await request.db!.from('work_categories').update(patch as never)
      .eq('code', code).select('code, label, sort_order, is_active').single()
    if (error) return reply.status(500).send({ error: error.message })
    void logAuditEvent(request, {
      tableName: 'work_categories', recordId: code, action: 'work_categories.update',
      actorId: request.currentUser!.id,
      oldValues: prev as Record<string, unknown>, newValues: data as Record<string, unknown>, severity: 'info',
    })
    return reply.send({ category: data })
  })
}
