import { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { authenticate, hasPermission } from '../../plugins/auth.js'
import { bubbleUpProgress } from '../../lib/rab-aggregation.js'
import { validateMime } from '../../utils/mime.js'

const PHOTO_BUCKET = 'project-photos'
const PHOTO_ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const PHOTO_MAX_MB = 10
// bodyLimit HARUS > cap file: base64 menambah ~33% + overhead JSON. Tanpa ini,
// Fastify (default 1MB) menolak 413 SEBELUM validasi custom jalan → foto valid
// ditolak diam-diam. Diverifikasi: 2MB foto = 413 sebelum patch ini.
const PHOTO_BODY_LIMIT = 15 * 1024 * 1024

export default async function progressRoutes(app: FastifyInstance) {

  // ── POST /api/v1/projects/:projectId/photos/upload ─────────────────────────
  // Upload foto progress LEWAT API (bukan browser→storage langsung). Bucket
  // `project-photos` privat + policy service_role-only (migration 098) — browser
  // tak boleh menulis langsung. Baca via signed URL (pola documents.ts).
  app.post<{
    Params: { projectId: string }
    Body: { file_base64?: string; file_name?: string; progress_log_id?: string; caption?: string }
  }>(
    '/api/v1/projects/:projectId/photos/upload',
    { preHandler: [authenticate], bodyLimit: PHOTO_BODY_LIMIT },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { file_base64, file_name, progress_log_id, caption } = request.body ?? {}
      const user = request.currentUser!
      if (!file_base64) return reply.status(400).send({ error: 'File tidak ditemukan' })

      // ── OTORISASI (ADR-004) — WAJIB sebelum menulis apa pun ke storage/DB ────
      // service_role bypass RLS & table-RLS dormant → gate di handler adalah SATU-
      // SATUNYA penjaga. Tanpa ini, user terautentikasi mana pun bisa menulis ke
      // folder proyek siapa saja / menautkan foto ke log milik orang lain.
      const canManageProgress = await hasPermission(request, 'progress:manage') // admin/pm
      let isAssignedToProject = false
      if (!canManageProgress) {
        // Tanpa cabang literal role (ADR-004): siapa pun yang PUNYA assignment aktif di
        // proyek ini boleh upload. Non-mandor tanpa progress:manage otomatis tak punya.
        // enum assignment_status = active | completed | terminated (TIDAK ada 'cancelled').
        // Nilai enum yang salah membuat PostgREST ERROR & data null → dulu diam-diam
        // dianggap "tak ditugaskan" = SEMUA mandor sah tertolak 403 (gagal-tertutup senyap).
        const { data: asg, error: asgErr } = await request.db!
          .viaProject('mandor_assignments', projectId)
          .select('id')
          .eq('mandor_id', user.id)
          .neq('status', 'terminated')
          .limit(1)
        if (asgErr) {
          // JANGAN diam: kegagalan query otorisasi harus terlihat, bukan menyamar
          // sebagai "tidak berhak".
          app.log.error({ asgErr, projectId, userId: user.id }, 'cek assignment gagal')
          return reply.status(500).send({ error: 'Gagal memeriksa hak akses proyek' })
        }
        isAssignedToProject = (asg?.length ?? 0) > 0
      }
      if (!canManageProgress && !isAssignedToProject) {
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      // Attach ke log yang sudah ada → log WAJIB milik proyek ini (cegah lintas-proyek).
      // Pola sama DELETE progress-log: 404 utk "tak ada / bukan proyek ini" (tak
      // membocorkan mana yang benar terjadi), 403 utk "ada tapi tak berhak".
      if (progress_log_id) {
        const { data: log } = await request.db!
          .viaProject('progress_logs', projectId)
          .select('id, reported_by, project_id')
          .eq('id', progress_log_id)
          .maybeSingle()
        if (!log) return reply.status(404).send({ error: 'Log tidak ditemukan' })
        // Mandor hanya boleh menautkan ke log MILIKNYA sendiri; admin/pm bebas.
        if (!canManageProgress && log.reported_by !== user.id) {
          return reply.status(403).send({ error: 'Akses ditolak' })
        }
      }

      const buffer = Buffer.from(file_base64, 'base64')
      if (buffer.byteLength > PHOTO_MAX_MB * 1024 * 1024) {
        return reply.status(400).send({ error: `Ukuran foto maksimal ${PHOTO_MAX_MB}MB` })
      }
      let detectedType: string
      try {
        detectedType = validateMime(buffer, PHOTO_ALLOWED)
      } catch (e: unknown) {
        return reply.status(400).send({ error: (e as Error).message })
      }

      const ext = detectedType.split('/')[1].replace('jpeg', 'jpg')
      const safe = (file_name ?? 'foto').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      const storagePath = `${projectId}/${Date.now()}_${safe}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET).upload(storagePath, buffer, { contentType: detectedType, upsert: false })
      if (upErr) {
        app.log.error({ upErr }, 'upload foto progress gagal')
        return reply.status(500).send({ error: 'Gagal upload foto ke storage: ' + upErr.message })
      }

      const { data: urlData } = await supabase.storage
        .from(PHOTO_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      if (!urlData?.signedUrl) return reply.status(500).send({ error: 'Gagal membuat URL foto' })

      const url = urlData.signedUrl
      const size_kb = Math.ceil(buffer.byteLength / 1024)

      // RETRY/ATTACH: bila `progress_log_id` diberikan, langsung tautkan foto ke log
      // yang SUDAH tersimpan. Ini yang membuat "log tersimpan dulu, foto menyusul"
      // mungkin — mandor bersinyal buruk tak kehilangan laporan hariannya.
      if (progress_log_id) {
        const { data: photo, error: insErr } = await request.db!.viaProject('project_photos', projectId).insert({
          project_id: projectId,
          progress_log_id,
          url,
          caption: caption ?? null,
          file_size_kb: size_kb,
          uploaded_by: request.currentUser!.id,
        }).select('id, url, caption').single()
        if (insErr) return reply.status(500).send({ error: 'Foto terupload tapi gagal ditautkan: ' + insErr.message })
        return reply.status(201).send({ url, size_kb, photo })
      }

      return reply.status(201).send({ url, size_kb })
    }
  )

  // GET /api/v1/projects/:projectId/progress-logs
  app.get('/api/v1/projects/:projectId/progress-logs', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }

    if (!(await proyekMilikTenant(request, projectId))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }
    const query = request.query as { page?: string; limit?: string }

    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)))
    const offset = (page - 1) * limit

    const { count, error: countError } = await request.db!
      .viaProject('progress_logs', projectId)
      .select('*', { count: 'exact', head: true })

    if (countError) return reply.status(500).send({ error: countError.message })

    const total = count ?? 0
    const totalPages = Math.ceil(total / limit)

    const { data, error } = await request.db!
      .viaProject('progress_logs', projectId)
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

    if (!(await proyekMilikTenant(request, projectId))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }
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
      const { data: rabItem, error: rabError } = await request.db!
        .viaProject('rab_items', projectId)
        .select('id, weight_pct, name')
        .eq('id', body.rab_item_id)
        .single()

      if (rabError || !rabItem) {
        return reply.status(400).send({ error: 'Item RAB tidak ditemukan untuk proyek ini' })
      }

      // Insert progress log mode=detail
      const { data: log, error: logError } = await request.db!
        .viaProject('progress_logs', projectId)
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

      // Update rab_item.progress_pct dengan nilai baru.
      //
      // Hasil diperiksa: ini INTI dari mode detail. Kalau gagal diam-diam,
      // log progres tersimpan tapi persentasenya tidak — lalu bubble-up di
      // bawah menghitung ulang dari nilai LAMA, dan seluruh rantai (kategori →
      // proyek → Kurva S → SPI) memakai angka yang salah. API tetap 200, jadi
      // orang mengetik ulang dan mengira dirinya yang keliru.
      const { error: errItem } = await request.db!
        .viaProject('rab_items', projectId)
        .update({ progress_pct: pct, updated_at: new Date().toISOString() })
        .eq('id', body.rab_item_id)
      if (errItem) {
        return reply.status(500).send({
          error: `Log tersimpan, tapi progres item RAB gagal diperbarui: ${errItem.message}`,
        })
      }

      // Bubble-up lapis 1+2: recalculate progress_pct category dan project.
      // Logic diekstrak ke lib/rab-aggregation.ts (Task 1.2.3, testable tanpa
      // HTTP/DB; sebelumnya duplikat identik di progress.ts dan rab.ts)
      const { data: allItems } = await request.db!
        .viaProject('rab_items', projectId)
        .select('id, parent_id, level, weight_pct, progress_pct')

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
          await request.db!
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
        const { error: photoError } = await request.db!.viaProject('project_photos', projectId).insert(photoRows)
        if (photoError) app.log.error({ photoError }, 'Failed to insert photos')
      }

      const { data: fullLog } = await request.db!
        .viaProject('progress_logs', projectId)
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

    const { data: log, error: logError } = await request.db!
      .viaProject('progress_logs', projectId)
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
      const { error: photoError } = await request.db!.viaProject('project_photos', projectId).insert(photoRows)
      if (photoError) app.log.error({ photoError }, 'Failed to insert project_photos')
    }

    const { data: fullLog, error: fetchError } = await request.db!
      .viaProject('progress_logs', projectId)
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

    if (!(await proyekMilikTenant(request, projectId))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }
    const user = request.currentUser!

    const { data: log, error: fetchError } = await request.db!
      .viaProject('progress_logs', projectId)
      .select('id, reported_by, project_id')
      .eq('id', logId)
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

    const { error: deleteError } = await request.db!
      .viaProject('progress_logs', projectId)
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

    if (!(await proyekMilikTenant(request, projectId))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }
    const { category } = request.query as { category?: string }

    const VALID_CATEGORIES = ['progress', 'defect', 'serah_terima', 'other']

    let query = request.db!
      .viaProject('project_photos', projectId)
      .select('id, url, caption, taken_at, category, uploaded_at, progress_log_id, uploader:users!project_photos_uploaded_by_fkey(id, name)')
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

    if (!(await proyekMilikTenant(request, projectId))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

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

    const { data, error } = await request.db!
      .viaProject('project_photos', projectId)
      .update(updateFields)
      .eq('id', photoId)
      .select('id, url, caption, taken_at, category, uploaded_at')
      .single()

    if (error) {
      app.log.error(error)
      return reply.status(500).send({ error: 'Gagal update foto' })
    }

    return reply.send({ data })
  })
}
