import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'

// Kelola aturan routing notifikasi dari UI (2B / config-first §12).
// Baca = authenticated; tulis = notifications:rules:manage.
//
// SAFETY: aturan yang AKTIF tidak boleh kehilangan target terakhirnya — itu
// keadaan senyap (notifikasi menguap tanpa jejak), persis bug #47. Kalau memang
// tak ingin dinotifikasi, matikan aturannya; niatnya jadi eksplisit dan terekam.

const RULE_SELECT = `
  id, event_type, label, description, is_active,
  notification_rule_targets ( id, target_type, role_name, permission_key )
`

export default async function notificationRuleRoutes(app: FastifyInstance) {

  // ── GET /api/v1/notification-rules ─────────────────────────────────────────
  app.get('/api/v1/notification-rules', { preHandler: [authenticate] }, async (request, reply) => {
    const { data, error } = await request.db!
      .from('notification_rules').select(RULE_SELECT).order('event_type')
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ rules: data ?? [] })
  })

  // ── PATCH /api/v1/notification-rules/:eventType — aktif/nonaktif ───────────
  app.patch<{ Params: { eventType: string }; Body: { is_active?: boolean } }>(
    '/api/v1/notification-rules/:eventType',
    { preHandler: [authenticate, requirePermission('notifications:rules:manage')] },
    async (request, reply) => {
      const { eventType } = request.params
      if (typeof request.body?.is_active !== 'boolean') {
        return reply.status(400).send({ error: 'is_active (boolean) wajib' })
      }
      const { data, error } = await request.db!.from('notification_rules')
        .update({
          is_active: request.body.is_active,
          updated_by: request.currentUser!.id,
          updated_at: new Date().toISOString(),
        })
        .eq('event_type', eventType).select('event_type, is_active').maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!data) return reply.status(404).send({ error: 'Aturan tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'notification_rules', recordId: eventType, action: 'notification.rule.toggle',
        actorId: request.currentUser!.id, newValues: { is_active: request.body.is_active },
        severity: 'warning',
      })
      return reply.send({ rule: data })
    })

  // ── POST /api/v1/notification-rules/:eventType/targets — tambah penerima ───
  app.post<{
    Params: { eventType: string }
    Body: { target_type?: string; role_name?: string | null; permission_key?: string | null }
  }>(
    '/api/v1/notification-rules/:eventType/targets',
    { preHandler: [authenticate, requirePermission('notifications:rules:manage')] },
    async (request, reply) => {
      const { eventType } = request.params
      const { target_type, role_name, permission_key } = request.body ?? {}
      const VALID = ['role', 'permission', 'project_pm', 'project_mandors']
      if (!target_type || !VALID.includes(target_type)) {
        return reply.status(400).send({ error: `target_type harus salah satu dari: ${VALID.join(', ')}` })
      }
      if (target_type === 'role' && !role_name) {
        return reply.status(400).send({ error: 'role_name wajib untuk target bertipe role' })
      }
      if (target_type === 'permission' && !permission_key) {
        return reply.status(400).send({ error: 'permission_key wajib untuk target bertipe permission' })
      }

      const { data: rule } = await request.db!.from('notification_rules')
        .select('id').eq('event_type', eventType).maybeSingle()
      if (!rule) return reply.status(404).send({ error: 'Aturan tidak ditemukan' })

      const { data, error } = await request.db!.from('notification_rule_targets').insert({
        rule_id: rule.id,
        target_type,
        role_name: target_type === 'role' ? role_name : null,
        permission_key: target_type === 'permission' ? permission_key : null,
      }).select('id, target_type, role_name, permission_key').single()

      if (error) {
        const code = (error as { code?: string }).code
        // FK roles(name) / permissions(key) → nilai tak dikenal
        if (code === '23503') {
          return reply.status(400).send({ error: `Role atau permission '${role_name ?? permission_key}' tidak dikenal` })
        }
        if (code === '23505') return reply.status(409).send({ error: 'Penerima ini sudah ada di aturan tersebut' })
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'notification_rule_targets', recordId: data.id, action: 'notification.target.create',
        actorId: request.currentUser!.id, newValues: { eventType, ...data }, severity: 'warning',
      })
      return reply.status(201).send({ target: data })
    })

  // ── DELETE /api/v1/notification-rule-targets/:id ───────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/notification-rule-targets/:id',
    { preHandler: [authenticate, requirePermission('notifications:rules:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: target } = await request.db!.from('notification_rule_targets')
        .select('id, rule_id, target_type, role_name, permission_key').eq('id', id).maybeSingle()
      if (!target) return reply.status(404).send({ error: 'Penerima tidak ditemukan' })

      // SAFETY: aturan AKTIF tanpa target = notifikasi menguap tanpa jejak (bug #47).
      // Menonaktifkan aturan tetap boleh — niatnya eksplisit dan terekam audit.
      const [{ data: rule }, { count }] = await Promise.all([
        request.db!.from('notification_rules').select('is_active, event_type').eq('id', target.rule_id).maybeSingle(),
        request.db!.from('notification_rule_targets').select('id', { count: 'exact', head: true })
          .eq('rule_id', target.rule_id),
      ])
      if (rule?.is_active && (count ?? 0) <= 1) {
        return reply.status(400).send({
          error: 'Tidak bisa menghapus penerima terakhir selama aturan masih aktif — '
               + 'notifikasi akan hilang tanpa jejak. Nonaktifkan aturannya bila memang tak ingin dikirim.',
        })
      }

      const { error } = await request.db!.from('notification_rule_targets').delete().eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'notification_rule_targets', recordId: id, action: 'notification.target.delete',
        actorId: request.currentUser!.id, oldValues: target as Record<string, unknown>, severity: 'warning',
      })
      return reply.send({ ok: true })
    })
}
