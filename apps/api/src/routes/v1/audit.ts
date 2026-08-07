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
      // `correlation_id` — satu request menghasilkan BANYAK event, dan
      // semuanya berbagi id ini (`logAuditEvent` mengisinya dari `request.id`).
      // Tanpa saringan ini, jejaknya tersimpan tapi tak bisa dirunut: yang
      // terbaca cuma daftar datar 21 ribu baris.
      correlation_id,
      // `severity` — memisahkan `critical` dari `info` adalah pertanyaan
      // pertama saat ada yang mempersoalkan sebuah perubahan.
      severity,
      from, to,
      page = '1', limit = '50',
    } = request.query as Record<string, string>

    const pageNum = Math.max(1, parseInt(page))
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)))
    const offset = (pageNum - 1) * pageSize

    // T4g: audit_logs kategori D — `company_id` NOT NULL diisi saat TULIS (tak
    // pernah lewat join), jadi di-scope eksplisit di sini dengan .eq() di bawah.
    // Tanpa ini, admin tenant A membaca SELURUH jejak audit semua tenant: diff
    // nilai kontrak, pemutihan denda, perubahan role — data paling sensitif
    // yang ada di sistem.
    // `reason`, `severity`, `correlation_id` ikut diambil di `select` bawah.
    //
    // Ketiganya sudah lama diisi `logAuditEvent`, tapi tak pernah sampai ke
    // pembacanya — kolom yang terisi dan tak pernah terbaca sama saja dengan
    // kolom kosong, hanya lebih menyesatkan: pemeriksaan skema melaporkannya
    // "ada", jadi tak ada yang mencurigainya.
    let q = supabase
      .from('audit_logs')
      .select(`
        id, table_name, record_id, action,
        old_values, new_values, created_at,
        reason, severity, correlation_id,
        user:users!audit_logs_user_id_fkey(id, name, email, roles:role_id(name))
      `, { count: 'exact' })
      .eq('company_id', request.companyId!)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (table_name) q = q.eq('table_name', table_name)
    if (action)     q = q.eq('action', action)
    if (user_id)    q = q.eq('user_id', user_id)
    if (severity)   q = q.eq('severity', severity)
    if (correlation_id) q = q.eq('correlation_id', correlation_id)
    if (from)       q = q.gte('created_at', from)
    if (to)         q = q.lte('created_at', to + 'T23:59:59Z')

    // project_id filter: cari record_id di table projects, atau new_values->>'project_id'
    if (project_id) {
      q = q.or(`record_id.eq.${project_id},new_values->project_id.eq."${project_id}"`)
    }

    const { data, error, count } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // FASE 3 CONTRACT: flatten user.roles.name → user.role (frontend audit page
    // menampilkan log.user.role sebagai string). Enum di-drop; role via FK.
    const logs = (data ?? []).map(log => {
      const u = log.user as { roles?: { name: string } | { name: string }[] | null } | null
      if (u) {
        const embed = u.roles
        ;(u as Record<string, unknown>).role = (Array.isArray(embed) ? embed[0] : embed)?.name ?? null
        delete (u as Record<string, unknown>).roles
      }
      return log
    })

    return reply.send({
      logs,
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
  }, async (request, reply) => {
    // Dropdown filter pun di-scope: daftar tabel/aksi milik tenant lain
    // membocorkan modul apa yang mereka pakai.
    const cid = request.companyId!
    const [tablesRes, actionsRes] = await Promise.all([
      supabase.from('audit_logs').select('table_name').eq('company_id', cid).order('table_name'),
      supabase.from('audit_logs').select('action').eq('company_id', cid).order('action'),
    ])

    const tables  = [...new Set((tablesRes.data ?? []).map((r: any) => r.table_name))].filter(Boolean)
    const actions = [...new Set((actionsRes.data ?? []).map((r: any) => r.action))].filter(Boolean)

    return reply.send({ tables, actions })
  })
}
