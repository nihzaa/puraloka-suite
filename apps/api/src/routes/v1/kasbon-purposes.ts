import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { normalizePurposeCode, validatePurposeInput } from '../../lib/kasbon-purposes.js'

// Master tujuan kasbon terpusat — migration 096 (census A4, pola units/work_categories).
// Read = authenticated (dropdown form kasbon mandor); tulis = kasbon_purposes:manage.
// `code` immutable (= nilai tersimpan kasbons.purpose) → nonaktifkan bukan hapus.
export default async function kasbonPurposesRoutes(app: FastifyInstance) {
  app.get('/api/v1/kasbon-purposes', { preHandler: [authenticate] }, async (request, reply) => {
    const includeInactive = (request.query as { all?: string })?.all === 'true'
    let q = request.db!.from('kasbon_purposes')
      .select('code, label, sort_order, is_active')
      .order('sort_order', { ascending: true }).order('code', { ascending: true })
    if (!includeInactive) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ purposes: data ?? [] })
  })

  app.post('/api/v1/kasbon-purposes', {
    preHandler: [authenticate, requirePermission('kasbon_purposes:manage')],
  }, async (request, reply) => {
    const body = request.body as { code?: string; label?: string; sort_order?: number }
    const code = normalizePurposeCode(body.code ?? '')
    const v = validatePurposeInput({ code, label: body.label, sort_order: body.sort_order }, { requireCode: true })
    if (!v.ok) return reply.status(400).send({ error: v.error })
    if (body.label === undefined) return reply.status(400).send({ error: 'Wajib: code, label' })

    const { data, error } = await request.db!.from('kasbon_purposes').insert({
      code, label: String(body.label).trim(), sort_order: body.sort_order ?? 0,
      updated_by: request.currentUser!.id,
    }).select('code, label, sort_order, is_active').single()
    if (error) {
      if ((error as { code?: string }).code === '23505') return reply.status(409).send({ error: `Tujuan "${code}" sudah ada` })
      return reply.status(500).send({ error: error.message })
    }
    void logAuditEvent(request, {
      tableName: 'kasbon_purposes', recordId: code, action: 'kasbon_purposes.create',
      actorId: request.currentUser!.id, newValues: data as Record<string, unknown>, severity: 'info',
    })
    return reply.status(201).send({ purpose: data })
  })

  app.patch('/api/v1/kasbon-purposes/:code', {
    preHandler: [authenticate, requirePermission('kasbon_purposes:manage')],
  }, async (request, reply) => {
    const code = normalizePurposeCode((request.params as { code: string }).code)
    const body = request.body as { label?: string; sort_order?: number; is_active?: boolean }
    const v = validatePurposeInput(body)
    if (!v.ok) return reply.status(400).send({ error: v.error })

    const patch: Record<string, unknown> = { updated_by: request.currentUser!.id, updated_at: new Date().toISOString() }
    if (body.label !== undefined) patch.label = String(body.label).trim()
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order
    if (body.is_active !== undefined) patch.is_active = !!body.is_active
    if (Object.keys(patch).length <= 2) return reply.status(400).send({ error: 'Tidak ada field yang diubah' })

    const { data: prev } = await request.db!.from('kasbon_purposes')
      .select('label, sort_order, is_active').eq('code', code).maybeSingle()
    if (!prev) return reply.status(404).send({ error: `Tujuan "${code}" tidak ditemukan` })

    const { data, error } = await request.db!.from('kasbon_purposes').update(patch as never)
      .eq('code', code).select('code, label, sort_order, is_active').single()
    if (error) return reply.status(500).send({ error: error.message })
    void logAuditEvent(request, {
      tableName: 'kasbon_purposes', recordId: code, action: 'kasbon_purposes.update',
      actorId: request.currentUser!.id,
      oldValues: prev as Record<string, unknown>, newValues: data as Record<string, unknown>, severity: 'info',
    })
    return reply.send({ purpose: data })
  })
}
