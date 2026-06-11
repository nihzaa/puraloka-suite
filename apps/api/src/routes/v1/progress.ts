import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

export default async function progressRoutes(app: FastifyInstance) {

  // GET /api/v1/projects/:projectId/progress-logs
  app.get('/api/v1/projects/:projectId/progress-logs', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const query = request.query as { page?: string; limit?: string }

    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)))
    const offset = (page - 1) * limit

    // Count total
    const { count, error: countError } = await supabase
      .from('progress_logs')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)

    if (countError) return reply.status(500).send({ error: countError.message })

    const total = count ?? 0
    const totalPages = Math.ceil(total / limit)

    const { data, error } = await supabase
      .from('progress_logs')
      .select(`
        id, pct_overall, weather, worker_count, notes, logged_at, created_at,
        reporter:users!progress_logs_reported_by_fkey ( id, name, role ),
        photos:project_photos ( id, url, caption, taken_at )
      `)
      .eq('project_id', projectId)
      .order('logged_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return reply.status(500).send({ error: error.message })

    return { data, meta: { total, page, limit, totalPages } }
  })

  // POST /api/v1/projects/:projectId/progress-logs
  app.post('/api/v1/projects/:projectId/progress-logs', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = request.body as {
      pct_overall: number
      weather?: string
      worker_count?: number
      notes?: string
      logged_at?: string
      photos?: Array<{ url: string; caption?: string; taken_at?: string }>
    }

    const { pct_overall, weather, worker_count, notes, logged_at, photos } = body

    if (pct_overall === undefined || pct_overall === null) {
      return reply.status(400).send({ error: 'pct_overall wajib diisi' })
    }

    const pct = Number(pct_overall)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return reply.status(400).send({ error: 'pct_overall harus antara 0 dan 100' })
    }

    const reportedBy = request.currentUser!.id

    const { data: log, error: logError } = await supabase
      .from('progress_logs')
      .insert({
        project_id: projectId,
        reported_by: reportedBy,
        pct_overall: pct,
        weather: weather ?? null,
        worker_count: worker_count ?? null,
        notes: notes ?? null,
        logged_at: logged_at ?? new Date().toISOString(),
      })
      .select('id')
      .single()

    if (logError) {
      app.log.error({ logError }, 'Failed to create progress log')
      return reply.status(500).send({ error: logError.message })
    }

    // Insert photos if provided
    if (photos && photos.length > 0) {
      const photoRows = photos.map(p => ({
        project_id: projectId,
        progress_log_id: log.id,
        url: p.url,
        caption: p.caption ?? null,
        taken_at: p.taken_at ?? null,
        uploaded_by: reportedBy,
      }))
      const { error: photoError } = await supabase.from('project_photos').insert(photoRows)
      if (photoError) {
        app.log.error({ photoError }, 'Failed to insert project_photos')
      }
    }

    // Return full log with joins
    const { data: fullLog, error: fetchError } = await supabase
      .from('progress_logs')
      .select(`
        id, pct_overall, weather, worker_count, notes, logged_at, created_at,
        reporter:users!progress_logs_reported_by_fkey ( id, name, role ),
        photos:project_photos ( id, url, caption, taken_at )
      `)
      .eq('id', log.id)
      .single()

    if (fetchError) return reply.status(500).send({ error: fetchError.message })

    return reply.status(201).send({ data: fullLog })
  })

  // DELETE /api/v1/projects/:projectId/progress-logs/:logId
  app.delete('/api/v1/projects/:projectId/progress-logs/:logId', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { projectId, logId } = request.params as { projectId: string; logId: string }
    const user = request.currentUser!

    // Fetch the log to check ownership
    const { data: log, error: fetchError } = await supabase
      .from('progress_logs')
      .select('id, reported_by, project_id')
      .eq('id', logId)
      .eq('project_id', projectId)
      .single()

    if (fetchError || !log) {
      return reply.status(404).send({ error: 'Log tidak ditemukan' })
    }

    // Mandor can only delete their own logs; admin and pm can delete any
    if (user.role === 'mandor' && log.reported_by !== user.id) {
      return reply.status(403).send({ error: 'Anda hanya bisa hapus log milik sendiri' })
    }

    if (user.role === 'client') {
      return reply.status(403).send({ error: 'Akses ditolak' })
    }

    const { error: deleteError } = await supabase
      .from('progress_logs')
      .delete()
      .eq('id', logId)

    if (deleteError) return reply.status(500).send({ error: deleteError.message })

    return { success: true }
  })
}
