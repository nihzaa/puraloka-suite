import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, hasPermission } from '../../plugins/auth.js'
import { bubbleUpProgress } from '../../lib/rab-aggregation.js'

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
        id, mode, pct_overall, pct_completion, rab_item_id, weather, worker_count, notes, logged_at, created_at,
        reporter:users!progress_logs_reported_by_fkey ( id, name ),
        rab_item:rab_items ( id, name, category_code, weight_pct ),
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
      mode?: 'daily' | 'detail'
      pct_overall?: number
      // mode=daily fields
      weather?: string
      worker_count?: number
      notes?: string
      logged_at?: string
      // mode=detail fields
      rab_item_id?: string
      pct_completion?: number
      photos?: Array<{ url: string; caption?: string; taken_at?: string }>
    }

    const mode = body.mode ?? 'daily'
    const reportedBy = request.currentUser!.id

    // ── Validasi mode=detail ────────────────────────────────────────────────
    if (mode === 'detail') {
      if (!body.rab_item_id) {
        return reply.status(400).send({ error: 'rab_item_id wajib diisi untuk mode detail' })
      }
      if (body.pct_completion === undefined || body.pct_completion === null) {
        return reply.status(400).send({ error: 'pct_completion wajib diisi untuk mode detail' })
      }
      const pct = Number(body.pct_completion)
      if (isNaN(pct) || pct < 0 || pct > 100) {
        return reply.status(400).send({ error: 'pct_completion harus antara 0 dan 100' })
      }

      // Verifikasi rab_item_id milik proyek ini
      const { data: rabItem, error: rabError } = await supabase
        .from('rab_items')
        .select('id, weight_pct, name')
        .eq('id', body.rab_item_id)
        .eq('project_id', projectId)
        .single()

      if (rabError || !rabItem) {
        return reply.status(400).send({ error: 'Item RAB tidak ditemukan untuk proyek ini' })
      }

      // Insert progress log mode=detail
      const { data: log, error: logError } = await supabase
        .from('progress_logs')
        .insert({
          project_id: projectId,
          reported_by: reportedBy,
          mode: 'detail',
          rab_item_id: body.rab_item_id,
          pct_completion: pct,
          pct_overall: null,
          weather: body.weather ?? null,
          worker_count: body.worker_count ?? null,
          notes: body.notes ?? null,
          logged_at: body.logged_at ?? new Date().toISOString(),
        })
        .select('id')
        .single()

      if (logError) {
        app.log.error({ logError }, 'Failed to create detail progress log')
        return reply.status(500).send({ error: logError.message })
      }

      // Update rab_item.progress_pct dengan nilai baru
      await supabase
        .from('rab_items')
        .update({ progress_pct: pct, updated_at: new Date().toISOString() })
        .eq('id', body.rab_item_id)

      // Bubble-up lapis 1+2: recalculate progress_pct category dan project.
      // Logic diekstrak ke lib/rab-aggregation.ts (Task 1.2.3, testable tanpa
      // HTTP/DB; sebelumnya duplikat identik di progress.ts dan rab.ts)
      const { data: allItems } = await supabase
        .from('rab_items')
        .select('id, parent_id, level, weight_pct, progress_pct')
        .eq('project_id', projectId)

      let newOverall: number | null = null
      if (allItems && allItems.length > 0) {
        const { categoryProgress, overallProgress } = bubbleUpProgress(allItems)

        const categoryUpdates = Array.from(categoryProgress.entries()).map(([parentId, pct]) =>
          supabase
            .from('rab_items')
            .update({ progress_pct: pct, updated_at: new Date().toISOString() })
            .eq('id', parentId)
        )
        if (categoryUpdates.length > 0) await Promise.all(categoryUpdates)

        if (overallProgress !== null) {
          newOverall = overallProgress
          await supabase
            .from('projects')
            .update({ progress_pct: newOverall, updated_at: new Date().toISOString() })
            .eq('id', projectId)
        }
      }

      // Insert photos jika ada
      if (body.photos && body.photos.length > 0) {
        const photoRows = body.photos.map(p => ({
          project_id: projectId,
          progress_log_id: log.id,
          url: p.url,
          caption: p.caption ?? null,
          taken_at: p.taken_at ?? null,
          uploaded_by: reportedBy,
        }))
        const { error: photoError } = await supabase.from('project_photos').insert(photoRows)
        if (photoError) app.log.error({ photoError }, 'Failed to insert photos')
      }

      const { data: fullLog } = await supabase
        .from('progress_logs')
        .select(`
          id, mode, pct_overall, pct_completion, rab_item_id, weather, worker_count, notes, logged_at, created_at,
          reporter:users!progress_logs_reported_by_fkey ( id, name ),
          rab_item:rab_items ( id, name, category_code, weight_pct ),
          photos:project_photos ( id, url, caption, taken_at )
        `)
        .eq('id', log.id)
        .single()

      return reply.status(201).send({ data: fullLog, new_overall_pct: newOverall })
    }

    // ── Validasi mode=daily ────────────────────────────────────────────────
    // pct_overall opsional — mode daily adalah catatan harian, tidak mengubah projects.progress_pct
    let dailyPct: number | null = null
    if (body.pct_overall !== undefined && body.pct_overall !== null) {
      dailyPct = Number(body.pct_overall)
      if (isNaN(dailyPct) || dailyPct < 0 || dailyPct > 100) {
        return reply.status(400).send({ error: 'pct_overall harus antara 0 dan 100' })
      }
    }

    const { data: log, error: logError } = await supabase
      .from('progress_logs')
      .insert({
        project_id: projectId,
        reported_by: reportedBy,
        mode: 'daily',
        pct_overall: dailyPct,
        rab_item_id: null,
        pct_completion: null,
        weather: body.weather ?? null,
        worker_count: body.worker_count ?? null,
        notes: body.notes ?? null,
        logged_at: body.logged_at ?? new Date().toISOString(),
      })
      .select('id')
      .single()

    if (logError) {
      app.log.error({ logError }, 'Failed to create progress log')
      return reply.status(500).send({ error: logError.message })
    }

    if (body.photos && body.photos.length > 0) {
      const photoRows = body.photos.map(p => ({
        project_id: projectId,
        progress_log_id: log.id,
        url: p.url,
        caption: p.caption ?? null,
        taken_at: p.taken_at ?? null,
        uploaded_by: reportedBy,
      }))
      const { error: photoError } = await supabase.from('project_photos').insert(photoRows)
      if (photoError) app.log.error({ photoError }, 'Failed to insert project_photos')
    }

    const { data: fullLog, error: fetchError } = await supabase
      .from('progress_logs')
      .select(`
        id, mode, pct_overall, pct_completion, rab_item_id, weather, worker_count, notes, logged_at, created_at,
        reporter:users!progress_logs_reported_by_fkey ( id, name ),
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

    const { data: log, error: fetchError } = await supabase
      .from('progress_logs')
      .select('id, reported_by, project_id')
      .eq('id', logId)
      .eq('project_id', projectId)
      .single()

    if (fetchError || !log) {
      return reply.status(404).send({ error: 'Log tidak ditemukan' })
    }

    // Authorization (ADR-004): boleh hapus jika punya progress:manage (admin/pm),
    // ATAU mandor pemilik log (ownership). Selain itu ditolak — termasuk client
    // (tak punya progress:manage & bukan mandor-owner).
    const canManage = await hasPermission(request, 'progress:manage')
    const isOwnerMandor = user.role === 'mandor' && log.reported_by === user.id
    if (!canManage && !isOwnerMandor) {
      return reply.status(403).send({ error: 'Akses ditolak' })
    }

    const { error: deleteError } = await supabase
      .from('progress_logs')
      .delete()
      .eq('id', logId)

    if (deleteError) return reply.status(500).send({ error: deleteError.message })

    return { success: true }
  })

  // GET /api/v1/projects/:projectId/photos
  // Gallery foto proyek — filter opsional ?category=progress|defect|serah_terima|other
  app.get('/api/v1/projects/:projectId/photos', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const { category } = request.query as { category?: string }

    const VALID_CATEGORIES = ['progress', 'defect', 'serah_terima', 'other']

    let query = supabase
      .from('project_photos')
      .select('id, url, caption, taken_at, category, uploaded_at, progress_log_id, uploader:users!project_photos_uploaded_by_fkey(id, name)')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    if (category && VALID_CATEGORIES.includes(category)) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      app.log.error(error)
      return reply.status(500).send({ error: 'Gagal mengambil foto' })
    }

    return reply.send({ data: data ?? [] })
  })

  // PATCH /api/v1/projects/:projectId/photos/:photoId
  // Update kategori foto — butuh permission documents:manage
  app.patch('/api/v1/projects/:projectId/photos/:photoId', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { projectId, photoId } = request.params as { projectId: string; photoId: string }

    if (!(await hasPermission(request, 'documents:manage'))) {
      return reply.status(403).send({ error: 'Akses ditolak. Butuh permission: documents:manage' })
    }

    const { category, caption } = request.body as { category?: string; caption?: string }
    const VALID_CATEGORIES = ['progress', 'defect', 'serah_terima', 'other']

    const updateFields: Record<string, unknown> = {}
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return reply.status(400).send({ error: 'Kategori tidak valid' })
      }
      updateFields.category = category
    }
    if (caption !== undefined) updateFields.caption = caption

    if (Object.keys(updateFields).length === 0) {
      return reply.status(400).send({ error: 'Tidak ada field yang diupdate' })
    }

    const { data, error } = await supabase
      .from('project_photos')
      .update(updateFields)
      .eq('id', photoId)
      .eq('project_id', projectId)
      .select('id, url, caption, taken_at, category, uploaded_at')
      .single()

    if (error) {
      app.log.error(error)
      return reply.status(500).send({ error: 'Gagal update foto' })
    }

    return reply.send({ data })
  })
}
