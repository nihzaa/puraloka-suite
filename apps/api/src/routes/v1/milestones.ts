import type { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { createNotifications } from '../../utils/notifications.js'
import { resolveRecipients } from '../../utils/notification-routing.js'

export default async function milestoneRoutes(app: FastifyInstance) {
  // ── GET /api/v1/projects/:projectId/milestones ──────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/milestones',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await request.db!
        .viaProject('milestones', projectId)
        .select(`
          id,
          project_id,
          title,
          description,
          target_date,
          completed_at,
          status,
          sort_order,
          created_by,
          created_at,
          updated_at,
          creator:users!milestones_created_by_fkey ( id, name )
        `)
        .eq('project_id', projectId)
        .order('target_date', { ascending: true })

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil data milestones' })
      }

      return reply.send({ data: data ?? [] })
    }
  )

  // ── POST /api/v1/projects/:projectId/milestones ─────────────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      title: string
      description?: string
      target_date: string
      sort_order?: number
    }
  }>(
    '/api/v1/projects/:projectId/milestones',
    { preHandler: [authenticate, requirePermission('milestones:manage')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { title, description, target_date, sort_order } = request.body

      if (!title?.trim()) {
        return reply.status(400).send({ error: 'Judul milestone wajib diisi' })
      }
      if (!target_date) {
        return reply.status(400).send({ error: 'Tanggal target wajib diisi' })
      }

      const insertPayload: Record<string, unknown> = {
        project_id:  projectId,
        title:       title.trim(),
        description: description?.trim() || null,
        target_date,
        status:      'pending',
        created_by:  request.currentUser!.id,
      }
      if (sort_order !== undefined) insertPayload.sort_order = sort_order

      const { data, error } = await request.db!
        .viaProject('milestones', projectId)
        .insert(insertPayload)
        .select(`
          id,
          project_id,
          title,
          description,
          target_date,
          completed_at,
          status,
          sort_order,
          created_by,
          created_at,
          updated_at,
          creator:users!milestones_created_by_fkey ( id, name )
        `)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal membuat milestone' })
      }

      return reply.status(201).send({ data })
    }
  )

  // ── PATCH /api/v1/projects/:projectId/milestones/:milestoneId ───────────────
  app.patch<{
    Params: { projectId: string; milestoneId: string }
    Body: {
      title?: string
      description?: string
      target_date?: string
      completed_at?: string | null
      status?: string
      sort_order?: number
    }
  }>(
    '/api/v1/projects/:projectId/milestones/:milestoneId',
    { preHandler: [authenticate, requirePermission('milestones:manage')] },
    async (request, reply) => {
      const { projectId, milestoneId } = request.params
      // T4h: PATCH/DELETE sebelumnya tak punya gerbang (GET/POST sudah), jadi
      // milestone tenant lain bisa diubah/dihapus hanya dgn tahu id-nya.
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { title, description, target_date, completed_at, status, sort_order } = request.body

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (title !== undefined)       updates.title        = title.trim()
      if (description !== undefined) updates.description  = description?.trim() || null
      if (target_date !== undefined) updates.target_date  = target_date
      if (completed_at !== undefined) updates.completed_at = completed_at
      if (status !== undefined)      updates.status       = status
      if (sort_order !== undefined)  updates.sort_order   = sort_order

      const { data, error } = await request.db!
        .viaProject('milestones', projectId)
        .update(updates)
        .eq('id', milestoneId)
        .eq('project_id', projectId)
        .select(`
          id,
          project_id,
          title,
          description,
          target_date,
          completed_at,
          status,
          sort_order,
          created_by,
          created_at,
          updated_at,
          creator:users!milestones_created_by_fkey ( id, name )
        `)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal memperbarui milestone' })
      }

      // ── Fire-and-forget: notif ke admin jika milestone selesai ───────────
      if (status === 'completed' && data) {
        try {
          const adminIds = await resolveRecipients('milestone_completed', { companyId: request.companyId! })
          const { data: proj } = await request.db!.from('projects').select('name').eq('id', request.params.projectId).single()
          createNotifications(adminIds.map(uid => ({
            company_id: request.companyId!,
            user_id:     uid,
            title:       'Milestone Selesai',
            message:     `Milestone "${data.title}" di proyek ${proj?.name ?? ''} ditandai selesai oleh ${request.currentUser!.name}`,
            type:        'milestone_completed' as const,
            priority:    'normal' as const,
            project_id:  request.params.projectId,
            action_url:  `/proyek/${request.params.projectId}`,
            action_type: 'view_milestone',
            action_data: { milestone_id: milestoneId },
          })))
        } catch (err) {
          // best-effort: notifikasi tak boleh membatalkan tindakan yang sudah sah.
          // Tapi TIDAK ditelan — rantai notifikasi pernah putus berbulan-bulan
          // tanpa satu pun gejala (Web Push, 2026-08-01), dan `catch {}` adalah
          // persis tempat gejala itu seharusnya muncul.
          request.log.error({ err }, 'notifikasi gagal dikirim')
        }
      }

      return reply.send({ data })
    }
  )

  // ── DELETE /api/v1/projects/:projectId/milestones/:milestoneId ──────────────
  app.delete<{ Params: { projectId: string; milestoneId: string } }>(
    '/api/v1/projects/:projectId/milestones/:milestoneId',
    { preHandler: [authenticate, requirePermission('milestones:manage')] },
    async (request, reply) => {
      const { projectId, milestoneId } = request.params
      // T4h: PATCH/DELETE sebelumnya tak punya gerbang (GET/POST sudah), jadi
      // milestone tenant lain bisa diubah/dihapus hanya dgn tahu id-nya.
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { error } = await request.db!
        .viaProject('milestones', projectId)
        .delete()
        .eq('id', milestoneId)
        .eq('project_id', projectId)

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menghapus milestone' })
      }

      return reply.send({ success: true })
    }
  )
}
