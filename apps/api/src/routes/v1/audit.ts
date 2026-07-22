import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'

export default async function auditRoutes(app: FastifyInstance) {

  // GET /api/v1/audit — list audit logs
  // Query params: table_name, action, user_id, project_id, from, to, page, limit
  app.get('/api/v1/audit', {
    preHandler: [authenticate, requirePermission('audit:view')]
  }, async (request, reply) => {
    const {
      table_name, action, user_id, project_id,
      from, to,
      page = '1', limit = '50',
    } = request.query as Record<string, string>

    const pageNum = Math.max(1, parseInt(page))
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)))
    const offset = (pageNum - 1) * pageSize

    let q = supabase
      .from('audit_logs')
      .select(`
        id, table_name, record_id, action,
        old_values, new_values, created_at,
        user:users!audit_logs_user_id_fkey(id, name, email, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (table_name) q = q.eq('table_name', table_name)
    if (action)     q = q.eq('action', action)
    if (user_id)    q = q.eq('user_id', user_id)
    if (from)       q = q.gte('created_at', from)
    if (to)         q = q.lte('created_at', to + 'T23:59:59Z')

    // project_id filter: cari record_id di table projects, atau new_values->>'project_id'
    if (project_id) {
      q = q.or(`record_id.eq.${project_id},new_values->project_id.eq."${project_id}"`)
    }

    const { data, error, count } = await q
    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({
      logs: data ?? [],
      meta: {
        total: count ?? 0,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil((count ?? 0) / pageSize),
      },
    })
  })

  // GET /api/v1/audit/tables — distinct table names + action types untuk filter dropdown
  app.get('/api/v1/audit/meta', {
    preHandler: [authenticate, requirePermission('audit:view')]
  }, async (_request, reply) => {
    const [tablesRes, actionsRes] = await Promise.all([
      supabase.from('audit_logs').select('table_name').order('table_name'),
      supabase.from('audit_logs').select('action').order('action'),
    ])

    const tables  = [...new Set((tablesRes.data ?? []).map((r: any) => r.table_name))].filter(Boolean)
    const actions = [...new Set((actionsRes.data ?? []).map((r: any) => r.action))].filter(Boolean)

    return reply.send({ tables, actions })
  })
}
