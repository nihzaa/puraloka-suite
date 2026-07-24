import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'
import { createNotifications, getProjectAdminsAndPM } from '../../utils/notifications.js'
import { flattenUserRole } from '../../utils/user-role.js'
import { validateMime } from '../../utils/mime.js'

const KASBON_PHOTO_BUCKET = 'kasbon-photos'
const KASBON_PHOTO_ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const KASBON_PHOTO_MAX_MB = 10

export default async function mandorRoutes(app: FastifyInstance) {

  // ── POST /api/v1/mandor/kasbon-photo/upload ────────────────────────────────
  // Upload foto nota kasbon LEWAT API. Bucket `kasbon-photos` privat +
  // service_role-only (migration 098) — browser tak menulis langsung. Signed URL.
  app.post<{ Body: { file_base64?: string; file_name?: string } }>(
    '/api/v1/mandor/kasbon-photo/upload',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { file_base64, file_name } = request.body ?? {}
      if (!file_base64) return reply.status(400).send({ error: 'File tidak ditemukan' })

      const buffer = Buffer.from(file_base64, 'base64')
      if (buffer.byteLength > KASBON_PHOTO_MAX_MB * 1024 * 1024) {
        return reply.status(400).send({ error: `Ukuran foto maksimal ${KASBON_PHOTO_MAX_MB}MB` })
      }
      let detectedType: string
      try {
        detectedType = validateMime(buffer, KASBON_PHOTO_ALLOWED)
      } catch (e: unknown) {
        return reply.status(400).send({ error: (e as Error).message })
      }

      const ext = detectedType.split('/')[1].replace('jpeg', 'jpg')
      const safe = (file_name ?? 'nota').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      const storagePath = `worker-kasbons/${Date.now()}_${safe}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(KASBON_PHOTO_BUCKET).upload(storagePath, buffer, { contentType: detectedType, upsert: false })
      if (upErr) {
        app.log.error({ upErr }, 'upload foto kasbon gagal')
        return reply.status(500).send({ error: 'Gagal upload foto ke storage: ' + upErr.message })
      }

      const { data: urlData } = await supabase.storage
        .from(KASBON_PHOTO_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      if (!urlData?.signedUrl) return reply.status(500).send({ error: 'Gagal membuat URL foto' })

      return reply.status(201).send({ url: urlData.signedUrl })
    }
  )

  // â”€â”€â”€ WORKERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/v1/mandor/workers — global registry, filter opsional: ?search=&tipe=&status=&mandor_id=
  app.get('/api/v1/mandor/workers', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { mandor_id, search, tipe, status } = request.query as Record<string, string>

    let q = supabase
      .from('workers')
      .select('id, name, phone, notes, tipe, skills, is_active, created_at, mandor:users!workers_mandor_id_fkey(id, name)')
      .order('name')

    // Mandor hanya lihat worker yang pernah muncul di scope-nya — tapi untuk global registry
    // cukup filter by mandor_id jika user adalah mandor (tampilkan yang mereka kenal)
    if (user.role === 'mandor') {
      q = q.eq('mandor_id', user.id)
    } else if (mandor_id) {
      q = q.eq('mandor_id', mandor_id)
    }

    if (tipe) q = q.eq('tipe', tipe)
    if (status === 'aktif') q = q.eq('is_active', true)
    else if (status === 'nonaktif') q = q.eq('is_active', false)
    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // Enrich dengan mandor_terakhir dan total_laporan dari wage_items
    const workerIds = (data ?? []).map((w: any) => w.id)
    let enriched = data ?? []
    if (workerIds.length > 0) {
      const { data: wageData } = await supabase
        .from('wage_items')
        .select(`
          worker_id,
          report:weekly_wage_reports!inner(
            id, week_start,
            assignment:mandor_assignments!inner(
              mandor:users!mandor_assignments_mandor_id_fkey(id, name)
            )
          )
        `)
        .in('worker_id', workerIds)
        .not('worker_id', 'is', null)

      // Agregasi per worker_id
      const statsMap: Record<string, { total_laporan: number; mandor_terakhir: string | null; last_week: string }> = {}
      for (const wi of (wageData ?? []) as any[]) {
        const wid = wi.worker_id
        const weekStart = wi.report?.week_start ?? ''
        const mandorName = wi.report?.assignment?.mandor?.name ?? null
        if (!statsMap[wid]) {
          statsMap[wid] = { total_laporan: 0, mandor_terakhir: null, last_week: '' }
        }
        statsMap[wid].total_laporan++
        if (weekStart > statsMap[wid].last_week) {
          statsMap[wid].last_week = weekStart
          statsMap[wid].mandor_terakhir = mandorName
        }
      }

      enriched = (data ?? []).map((w: any) => ({
        ...w,
        mandor_terakhir: statsMap[w.id]?.mandor_terakhir ?? null,
        total_laporan: statsMap[w.id]?.total_laporan ?? 0,
      }))
    }

    return reply.send({ workers: enriched })
  })

  // GET /api/v1/mandor/workers/:id/history — riwayat laporan upah worker ini
  app.get('/api/v1/mandor/workers/:id/history', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data: worker } = await supabase.from('workers').select('id, name').eq('id', id).single()
    if (!worker) return reply.status(404).send({ error: 'Pekerja tidak ditemukan' })

    const { data, error } = await supabase
      .from('wage_items')
      .select(`
        id, days_worked, daily_rate, overtime_hours, overtime_rate, subtotal, notes,
        report:weekly_wage_reports!inner(
          id, week_start, week_end, status, net_amount, paid_at,
          assignment:mandor_assignments!inner(
            mandor:users!mandor_assignments_mandor_id_fkey(id, name),
            project:projects(id, name)
          ),
          scope:work_scopes(id, scope_name)
        )
      `)
      .eq('worker_id', id)
      .order('created_at', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ worker, history: data ?? [] })
  })

  // POST /api/v1/mandor/workers — tambah pekerja baru (mandor_id opsional untuk global registry)
  app.post('/api/v1/mandor/workers', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as { name: string; tipe?: string; phone?: string; notes?: string; skills?: string[]; mandor_id?: string }

    if (!body.name?.trim()) return reply.status(400).send({ error: 'Nama pekerja wajib diisi' })

    // Mandor selalu dikaitkan ke dirinya sendiri. Admin/PM bisa kirim mandor_id atau biarkan null.
    const mandorId = user.role === 'mandor' ? user.id : (body.mandor_id ?? null)

    const { data, error } = await supabase
      .from('workers')
      .insert({
        mandor_id: mandorId,
        name: body.name.trim(),
        tipe: body.tipe ?? null,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        skills: body.skills ?? [],
      })
      .select('id, name, phone, notes, tipe, skills, is_active, created_at, mandor:users!workers_mandor_id_fkey(id, name)')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ worker: data })
  })

  // PATCH /api/v1/mandor/workers/:id — update pekerja (nama, tipe, hp, keahlian, status)
  app.patch('/api/v1/mandor/workers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.currentUser!
    const body = request.body as { name?: string; tipe?: string | null; phone?: string; notes?: string; skills?: string[]; is_active?: boolean }

    if (body.name !== undefined && !body.name.trim()) {
      return reply.status(400).send({ error: 'Nama pekerja tidak boleh kosong' })
    }

    // Ownership check: mandor hanya boleh edit worker miliknya sendiri
    if (user.role === 'mandor') {
      const { data: existing } = await supabase.from('workers').select('mandor_id').eq('id', id).single()
      if (!existing) return reply.status(404).send({ error: 'Tukang tidak ditemukan' })
      if (existing.mandor_id !== user.id) return reply.status(403).send({ error: 'Akses ditolak' })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) update.name = body.name.trim()
    if (body.tipe !== undefined) update.tipe = body.tipe || null
    if (body.phone !== undefined) update.phone = body.phone || null
    if (body.notes !== undefined) update.notes = body.notes || null
    if (body.skills !== undefined) update.skills = body.skills
    if (body.is_active !== undefined) update.is_active = body.is_active

    const { data, error } = await supabase
      .from('workers')
      .update(update)
      .eq('id', id)
      .select('id, name, phone, notes, tipe, skills, is_active, created_at, mandor:users!workers_mandor_id_fkey(id, name)')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ worker: data })
  })

  // DELETE /api/v1/mandor/workers/:id — hapus tukang
  // Hard delete, tapi tolak jika masih punya wage_items aktif
  app.delete('/api/v1/mandor/workers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.currentUser!

    // Cek apakah tukang ada + ownership check untuk mandor
    const { data: worker } = await supabase
      .from('workers').select('id, name, mandor_id').eq('id', id).single()
    if (!worker) return reply.status(404).send({ error: 'Tukang tidak ditemukan' })

    if (user.role === 'mandor' && worker.mandor_id !== user.id) {
      return reply.status(403).send({ error: 'Akses ditolak' })
    }

    // Tolak jika tukang masih punya wage_items yang terkait laporan aktif (submitted/approved)
    const { data: activeItems } = await supabase
      .from('wage_items')
      .select('id, report:weekly_wage_reports!inner(id, status)')
      .eq('worker_id', id)
      .in('weekly_wage_reports.status', ['submitted', 'approved'])

    if (activeItems && activeItems.length > 0) {
      return reply.status(409).send({ error: `${worker.name} masih punya laporan upah yang belum selesai. Selesaikan atau tolak laporan tersebut dulu.` })
    }

    const { error } = await supabase.from('workers').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(204).send()
  })

  // â”€â”€â”€ WORKER KASBONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  // GET /api/v1/mandor/scopes — work scope dengan info mandor + proyek (untuk dropdown kasbon)
  app.get('/api/v1/mandor/scopes', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!

    let q = supabase
      .from('work_scopes')
      .select(`
        id, scope_name, payment_system, status,
        assignment:mandor_assignments!inner (
          id,
          mandor:users!mandor_assignments_mandor_id_fkey ( id, name, phone ),
          project:projects ( id, name )
        )
      `)
      .eq('status', 'active')
      .order('scope_name')

    if (user.role === 'mandor') {
      q = (q as any).eq('mandor_assignments.mandor_id', user.id)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ scopes: data ?? [] })
  })

  // GET /api/v1/mandor/worker-kasbons?project_id=&mandor_id=&is_settled=
  app.get('/api/v1/mandor/worker-kasbons', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { project_id, mandor_id, is_settled } = request.query as Record<string, string>

    let q = supabase
      .from('worker_kasbons')
      .select(`
        id, amount, purpose, kasbon_date, notes, amount_settled, is_settled, created_at,
        worker:workers(id, name, phone),
        mandor:users!worker_kasbons_mandor_id_fkey(id, name),
        project:projects(id, name),
        scope:work_scopes(id, scope_name)
      `)
      .order('kasbon_date', { ascending: false })

    if (user.role === 'mandor') q = q.eq('mandor_id', user.id)
    else if (mandor_id) q = q.eq('mandor_id', mandor_id)

    if (project_id) q = q.eq('project_id', project_id)
    if (is_settled !== undefined) q = q.eq('is_settled', is_settled === 'true')

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ kasbons: data ?? [] })
  })

  // POST /api/v1/mandor/worker-kasbons â€” catat kasbon tukang baru
  app.post('/api/v1/mandor/worker-kasbons', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      worker_id: string
      project_id: string
      scope_id?: string
      amount: number
      purpose?: string
      kasbon_date?: string
      notes?: string
      mandor_id?: string
      photo_url?: string
    }

    if (!body.worker_id || !body.project_id || !body.amount) {
      return reply.status(400).send({ error: 'worker_id, project_id, dan amount wajib diisi' })
    }

    // Pastikan worker benar-benar milik mandor ini
    const mandorId = user.role === 'mandor' ? user.id : (body.mandor_id ?? user.id)
    const { data: worker } = await supabase
      .from('workers').select('id, mandor_id').eq('id', body.worker_id).single()
    if (!worker || worker.mandor_id !== mandorId) {
      return reply.status(403).send({ error: 'Tukang tidak ditemukan atau bukan milik mandor ini' })
    }

    const { data, error } = await supabase
      .from('worker_kasbons')
      .insert({
        worker_id: body.worker_id,
        mandor_id: mandorId,
        project_id: body.project_id,
        scope_id: body.scope_id ?? null,
        amount: body.amount,
        purpose: body.purpose ?? 'gaji_tukang',
        kasbon_date: body.kasbon_date ?? new Date().toISOString().split('T')[0],
        notes: body.notes ?? null,
        photo_url: body.photo_url ?? null,
      })
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ kasbon: data })
  })

  // â”€â”€â”€ MANDOR ASSIGNMENTS (list mandor per proyek) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  // PATCH /api/v1/mandor/worker-kasbons/:id/cicilan
  app.patch('/api/v1/mandor/worker-kasbons/:id/cicilan', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { nominal: number; catatan?: string }

    if (!body.nominal || Number(body.nominal) <= 0) {
      return reply.status(400).send({ error: 'nominal harus lebih dari 0' })
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('worker_kasbons')
      .select('id, amount, amount_settled, is_settled')
      .eq('id', id)
      .single()

    if (fetchErr || !existing) return reply.status(404).send({ error: 'Kasbon tidak ditemukan' })
    if (existing.is_settled) return reply.status(400).send({ error: 'Kasbon sudah lunas' })

    const newSettled = Math.min(Number(existing.amount_settled) + Number(body.nominal), Number(existing.amount))
    const isNowSettled = newSettled >= Number(existing.amount)

    const { data, error } = await supabase
      .from('worker_kasbons')
      .update({ amount_settled: newSettled, is_settled: isNowSettled })
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ kasbon: data, is_now_settled: isNowSettled })
  })

  // GET /api/v1/mandor/assignments?project_id=
  app.get('/api/v1/mandor/assignments', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { project_id } = request.query as Record<string, string>

    let q = supabase
      .from('mandor_assignments')
      .select(`
        id, status, notes, assigned_at, created_at,
        project:projects(id, name, location),
        mandor:users!mandor_assignments_mandor_id_fkey(id, name, phone),
        assigner:users!mandor_assignments_assigned_by_fkey(id, name),
        work_scopes(
          id, scope_name, payment_system, status,
          borongan_value, borongan_value_override, progress_pct_done,
          kasbons(id, amount, status),
          progress_payments(id, gross_payment, status),
          borongan_settlements(id, net_payment, borongan_value, total_kasbon)
        )
      `)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false })

    if (user.role === 'mandor') q = q.eq('mandor_id', user.id)
    if (project_id) q = q.eq('project_id', project_id)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // Enrich scopes with computed financial fields
    const enriched = (data ?? []).map((asg: any) => ({
      ...asg,
      work_scopes: (asg.work_scopes ?? []).map((sc: any) => {
        const totalKasbon = (sc.kasbons ?? [])
          .filter((k: any) => ['approved', 'settled'].includes(k.status))
          .reduce((s: number, k: any) => s + Number(k.amount), 0)
        const totalProgressPaid = (sc.progress_payments ?? [])
          .filter((p: any) => p.status === 'approved')
          .reduce((s: number, p: any) => s + Number(p.gross_payment), 0)
        const contractValue = sc.borongan_value_override ?? sc.borongan_value ?? 0
        const settlement = sc.borongan_settlements?.[0] ?? null
        return {
          ...sc,
          contract_value: contractValue,
          total_kasbon: totalKasbon,
          total_progress_paid: totalProgressPaid,
          financial_pct: contractValue > 0 ? Math.min(100, Math.round((totalKasbon / contractValue) * 100)) : 0,
          paid_pct: contractValue > 0 ? Math.min(100, Math.round((totalProgressPaid / contractValue) * 100)) : 0,
          settlement,
          // Tetap expose borongan_value untuk backward compat
          borongan_value: contractValue,
        }
      }),
    }))

    return reply.send({ assignments: enriched })
  })

  // POST /api/v1/mandor/assignments â€” assign mandor ke proyek
  app.post('/api/v1/mandor/assignments', {
    preHandler: [authenticate, requirePermission('mandor:assign')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      project_id: string
      mandor_id: string
      notes?: string
      assigned_at?: string
    }

    if (!body.project_id || !body.mandor_id) {
      return reply.status(400).send({ error: 'project_id dan mandor_id wajib diisi' })
    }

    const { data, error } = await supabase
      .from('mandor_assignments')
      .insert({
        project_id: body.project_id,
        mandor_id: body.mandor_id,
        notes: body.notes ?? null,
        assigned_at: body.assigned_at ?? new Date().toISOString().split('T')[0],
        assigned_by: user.id,
        status: 'active',
      })
      .select(`
        id, status, notes, assigned_at, created_at,
        project:projects(id, name, location),
        mandor:users!mandor_assignments_mandor_id_fkey(id, name, phone),
        assigner:users!mandor_assignments_assigned_by_fkey(id, name),
        work_scopes(id, scope_name, payment_system, status, borongan_value, progress_pct_done)
      `)
      .single()
    if (error) {
      if (error.code === '23505') return reply.status(409).send({ error: 'Mandor ini sudah di-assign ke proyek tersebut' })
      return reply.status(500).send({ error: error.message })
    }
    return reply.status(201).send({ assignment: data })
  })

  // PATCH /api/v1/mandor/assignments/:id â€” update status assignment
  app.patch('/api/v1/mandor/assignments/:id', {
    preHandler: [authenticate, requirePermission('mandor:assign')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { status?: string; notes?: string }

    const { data, error } = await supabase
      .from('mandor_assignments')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ assignment: data })
  })

  // â”€â”€â”€ WORK SCOPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // POST /api/v1/mandor/work-scopes — buat scope pekerjaan baru
  app.post('/api/v1/mandor/work-scopes', {
    preHandler: [authenticate, requirePermission('mandor:scope:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      assignment_id: string
      scope_name: string
      description?: string
      payment_system: 'harian' | 'borongan' | 'progress_pct'
      borongan_value?: number
      start_date?: string
      end_date?: string
      rab_category_id?: string
    }

    if (!body.assignment_id || !body.scope_name || !body.payment_system) {
      return reply.status(400).send({ error: 'assignment_id, scope_name, dan payment_system wajib diisi' })
    }

    const VALID_PAYMENT_SYSTEMS = ['harian', 'borongan', 'progress_pct']
    if (!VALID_PAYMENT_SYSTEMS.includes(body.payment_system)) {
      return reply.status(400).send({ error: `payment_system tidak valid. Pilih: ${VALID_PAYMENT_SYSTEMS.join(', ')}` })
    }

    if (body.payment_system !== 'harian' && !body.borongan_value) {
      return reply.status(400).send({ error: 'borongan_value wajib untuk sistem borongan dan progress_pct' })
    }

    const { data, error } = await supabase
      .from('work_scopes')
      .insert({
        assignment_id: body.assignment_id,
        scope_name: body.scope_name,
        description: body.description ?? null,
        payment_system: body.payment_system,
        borongan_value: body.borongan_value ?? null,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        rab_category_id: body.rab_category_id ?? null,
        status: 'active',
      })
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ scope: data })
  })

  // PATCH /api/v1/mandor/work-scopes/:id — update scope
  app.patch('/api/v1/mandor/work-scopes/:id', {
    preHandler: [authenticate, requirePermission('mandor:scope:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      scope_name?: string
      description?: string
      status?: string
      borongan_value?: number
      start_date?: string
      end_date?: string
    }

    const allowed: Record<string, unknown> = {}
    if (body.scope_name !== undefined) allowed.scope_name = body.scope_name
    if (body.description !== undefined) allowed.description = body.description
    if (body.status !== undefined) allowed.status = body.status
    if (body.borongan_value !== undefined) allowed.borongan_value = body.borongan_value
    if (body.start_date !== undefined) allowed.start_date = body.start_date
    if (body.end_date !== undefined) allowed.end_date = body.end_date

    const { data, error } = await supabase
      .from('work_scopes')
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ scope: data })
  })

  // DELETE /api/v1/mandor/work-scopes/:id â€” hapus scope (hanya jika belum ada laporan)
  app.delete('/api/v1/mandor/work-scopes/:id', {
    preHandler: [authenticate, requirePermission('mandor:scope:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Cek apakah ada laporan upah untuk scope ini
    const { data: reports } = await supabase
      .from('weekly_wage_reports')
      .select('id')
      .eq('scope_id', id)
      .limit(1)
    if (reports && reports.length > 0) {
      return reply.status(409).send({ error: 'Scope tidak bisa dihapus karena sudah ada laporan upah' })
    }

    const { error } = await supabase.from('work_scopes').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(204).send()
  })


  // GET /api/v1/mandor/work-scopes/:id — detail scope + items
  app.get('/api/v1/mandor/work-scopes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [scopeRes, itemsRes] = await Promise.all([
      supabase
        .from('work_scopes')
        .select(`
          id, scope_name, description, payment_system, borongan_value,
          progress_pct_done, status, start_date, end_date, created_at,
          rab_category_id,
          rab_category:rab_items ( id, category_code, name, total_price, weight_pct ),
          assignment:mandor_assignments!work_scopes_assignment_id_fkey (
            id,
            mandor:users!mandor_assignments_mandor_id_fkey ( id, name, phone ),
            project:projects ( id, name, location )
          )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('work_scope_items')
        .select(`
          id, item_name, category, description, unit, volume, unit_price,
          subtotal, volume_done, pct_done, sort_order, notes, created_at,
          specs:work_scope_item_specs ( id, spec_key, spec_value, sort_order )
        `)
        .eq('work_scope_id', id)
        .order('sort_order')
        .order('created_at'),
    ])
    if (scopeRes.error || !scopeRes.data) return reply.status(404).send({ error: 'Scope tidak ditemukan' })

    const currentUser = request.currentUser!
    const scope = scopeRes.data as typeof scopeRes.data & {
      assignment: { mandor: { id: string } | null; project: { id: string } | null } | null
    }

    // Mandor hanya bisa lihat scope miliknya sendiri
    if (currentUser.role === 'mandor') {
      if (scope.assignment?.mandor?.id !== currentUser.id) {
        return reply.status(403).send({ error: 'Akses ditolak' })
      }
    }
    // PM hanya bisa lihat scope di proyeknya
    if (currentUser.role === 'pm') {
      const projectId = scope.assignment?.project?.id ?? null
      if (projectId) {
        const { data: proj } = await supabase.from('projects').select('pm_id').eq('id', projectId).single()
        if (!proj || proj.pm_id !== currentUser.id) return reply.status(403).send({ error: 'Akses ditolak' })
      }
    }

    return reply.send({ scope: scopeRes.data, items: itemsRes.data ?? [] })
  })

  // POST /api/v1/mandor/work-scopes/:id/items — tambah item rincian pekerjaan
  app.post('/api/v1/mandor/work-scopes/:id/items', {
    preHandler: [authenticate, requirePermission('mandor:scope:item')]
  }, async (request, reply) => {
    const { id: scopeId } = request.params as { id: string }
    const user = request.currentUser!
    const body = request.body as {
      item_name: string; category?: string; description?: string
      unit: string; volume: number; unit_price: number
      volume_done?: number; sort_order?: number; notes?: string
      specs?: Array<{ spec_key: string; spec_value: string; sort_order?: number }>
    }

    if (!body.item_name || !body.unit || body.volume == null || body.unit_price == null) {
      return reply.status(400).send({ error: 'item_name, unit, volume, dan unit_price wajib diisi' })
    }
    if (Number(body.volume) <= 0) return reply.status(400).send({ error: 'volume harus lebih dari 0' })
    if (Number(body.unit_price) < 0) return reply.status(400).send({ error: 'unit_price tidak boleh negatif' })

    const { data: item, error } = await supabase
      .from('work_scope_items')
      .insert({
        work_scope_id: scopeId,
        item_name: body.item_name.trim(),
        category: body.category ?? 'lain_lain',
        description: body.description ?? null,
        unit: body.unit,
        volume: Number(body.volume),
        unit_price: Number(body.unit_price),
        volume_done: Number(body.volume_done ?? 0),
        sort_order: body.sort_order ?? 0,
        notes: body.notes ?? null,
        created_by: user.id,
      })
      .select('id, item_name, category, unit, volume, unit_price, subtotal, volume_done, pct_done, sort_order, notes')
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    if (body.specs?.length && item) {
      await supabase.from('work_scope_item_specs').insert(
        body.specs.map((s, i) => ({ item_id: item.id, spec_key: s.spec_key, spec_value: s.spec_value, sort_order: s.sort_order ?? i }))
      )
    }

    return reply.status(201).send({ item })
  })

  // Helper: resolve project_id + mandor_id dari scope-item, return null jika tidak ditemukan
  async function resolveScopeItemOwnership(itemId: string): Promise<{
    project_id: string; mandor_id: string; pm_id: string | null
  } | null> {
    const { data } = await supabase
      .from('work_scope_items')
      .select(`
        scope_id,
        scope:work_scopes!inner(
          assignment:mandor_assignments!inner(
            mandor_id,
            project:projects!inner(id, pm_id)
          )
        )
      `)
      .eq('id', itemId)
      .single()
    if (!data) return null
    const assignment = (data.scope as any)?.assignment
    return {
      project_id: assignment?.project?.id ?? null,
      mandor_id:  assignment?.mandor_id ?? null,
      pm_id:      assignment?.project?.pm_id ?? null,
    }
  }

  // PATCH /api/v1/mandor/scope-items/:id — update item
  app.patch('/api/v1/mandor/scope-items/:id', {
    preHandler: [authenticate, requirePermission('mandor:scope:item')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.currentUser!
    const body = request.body as {
      item_name?: string; category?: string; description?: string; unit?: string
      volume?: number; unit_price?: number; volume_done?: number; sort_order?: number; notes?: string
      specs?: Array<{ spec_key: string; spec_value: string; sort_order?: number }>
    }

    // Project + ownership isolation
    const ownership = await resolveScopeItemOwnership(id)
    if (!ownership) return reply.status(404).send({ error: 'Item tidak ditemukan' })
    if (user.role === 'pm' && ownership.pm_id !== user.id) {
      return reply.status(403).send({ error: 'Akses ditolak: item bukan di proyek Anda' })
    }
    if (user.role === 'mandor' && ownership.mandor_id !== user.id) {
      return reply.status(403).send({ error: 'Akses ditolak: item bukan milik Anda' })
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.item_name !== undefined) updateData.item_name = body.item_name.trim()
    if (body.category !== undefined) updateData.category = body.category
    if (body.description !== undefined) updateData.description = body.description
    if (body.unit !== undefined) updateData.unit = body.unit
    if (body.volume !== undefined) updateData.volume = Number(body.volume)
    if (body.unit_price !== undefined) updateData.unit_price = Number(body.unit_price)
    if (body.volume_done !== undefined) updateData.volume_done = Number(body.volume_done)
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order
    if (body.notes !== undefined) updateData.notes = body.notes

    const { data: item, error } = await supabase
      .from('work_scope_items')
      .update(updateData)
      .eq('id', id)
      .select('id, item_name, category, unit, volume, unit_price, subtotal, volume_done, pct_done, sort_order, notes')
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    if (body.specs !== undefined && item) {
      await supabase.from('work_scope_item_specs').delete().eq('item_id', id)
      if (body.specs.length > 0) {
        await supabase.from('work_scope_item_specs').insert(
          body.specs.map((s, i) => ({ item_id: id, spec_key: s.spec_key, spec_value: s.spec_value, sort_order: s.sort_order ?? i }))
        )
      }
    }
    return reply.send({ item })
  })

  // DELETE /api/v1/mandor/scope-items/:id
  app.delete('/api/v1/mandor/scope-items/:id', {
    preHandler: [authenticate, requirePermission('mandor:scope:item')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.currentUser!

    // Project + ownership isolation untuk semua role non-admin
    const ownership = await resolveScopeItemOwnership(id)
    if (!ownership) return reply.status(404).send({ error: 'Item tidak ditemukan' })
    if (user.role === 'pm' && ownership.pm_id !== user.id) {
      return reply.status(403).send({ error: 'Akses ditolak: item bukan di proyek Anda' })
    }
    if (user.role === 'mandor' && ownership.mandor_id !== user.id) {
      return reply.status(403).send({ error: 'Akses ditolak: item bukan milik Anda' })
    }

    const { error } = await supabase.from('work_scope_items').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(204).send()
  })

  // PATCH /api/v1/mandor/scope-items/:id/progress — update realisasi volume lapangan
  app.patch('/api/v1/mandor/scope-items/:id/progress', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.currentUser!
    const { volume_done, notes } = request.body as { volume_done: number; notes?: string }

    if (volume_done == null || Number(volume_done) < 0) {
      return reply.status(400).send({ error: 'volume_done wajib dan tidak boleh negatif' })
    }

    // Ownership isolation: mandor hanya bisa update progress scope miliknya
    if (user.role === 'mandor' || user.role === 'pm') {
      const ownership = await resolveScopeItemOwnership(id)
      if (!ownership) return reply.status(404).send({ error: 'Item tidak ditemukan' })
      if (user.role === 'mandor' && ownership.mandor_id !== user.id) {
        return reply.status(403).send({ error: 'Akses ditolak: item bukan milik Anda' })
      }
      if (user.role === 'pm' && ownership.pm_id !== user.id) {
        return reply.status(403).send({ error: 'Akses ditolak: item bukan di proyek Anda' })
      }
    }

    const updateData: Record<string, unknown> = { volume_done: Number(volume_done), updated_at: new Date().toISOString() }
    if (notes !== undefined) updateData.notes = notes

    const { data: item, error } = await supabase
      .from('work_scope_items')
      .update(updateData)
      .eq('id', id)
      .select('id, item_name, volume, volume_done, pct_done, unit')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ item })
  })

  // GET /api/v1/mandor/list — daftar user mandor (dropdown assign)
  app.get('/api/v1/mandor/list', {
    preHandler: [authenticate, requirePermission('mandor:assign')]
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, phone, email, is_active')
      .eq('role', 'mandor')
      .eq('is_active', true)
      .order('name')

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ mandors: data ?? [] })
  })


  // â”€â”€â”€ WEEKLY WAGE REPORTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/v1/mandor/profile/:mandor_id — profil lengkap mandor untuk halaman detail
  app.get('/api/v1/mandor/profile/:mandor_id', { preHandler: [authenticate] }, async (request, reply) => {
    const { mandor_id } = request.params as { mandor_id: string }

    const [mandorRes, assignmentsRes, kasbonsRes] = await Promise.all([
      supabase.from('users').select('id, name, phone, email, role_id, roles:role_id ( name ), is_active').eq('id', mandor_id).single(),
      supabase.from('mandor_assignments')
        .select(`
          id, assigned_at,
          project:projects(id, name, location),
          work_scopes(id, scope_name, payment_system, status, borongan_value, progress_pct_done, start_date, end_date)
        `)
        .eq('mandor_id', mandor_id)
        .eq('status', 'active'),
      supabase.from('worker_kasbons')
        .select('id, amount, amount_settled, purpose, kasbon_date, worker:workers(id, name), project:projects(id, name)')
        .eq('mandor_id', mandor_id)
        .eq('is_settled', false)
        .order('kasbon_date', { ascending: false }),
    ])

    if (mandorRes.error || !mandorRes.data) return reply.status(404).send({ error: 'Mandor tidak ditemukan' })

    const assignments = assignmentsRes.data ?? []
    const assignmentIds = assignments.map((a: any) => a.id)
    const scopeIds = assignments.flatMap((a: any) => (a.work_scopes ?? []).map((sc: any) => sc.id))

    // KPI + scope budget — semua paralel
    const [paidRes, workerRes, scopeWagesRes, reportsRes, registeredRes] = await Promise.all([
      assignmentIds.length > 0
        ? supabase.from('weekly_wage_reports').select('net_amount').in('assignment_id', assignmentIds).in('status', ['approved', 'paid'])
        : Promise.resolve({ data: [] }),
      assignmentIds.length > 0
        ? supabase.from('wage_items')
            .select('worker_name, report:weekly_wage_reports!inner(assignment_id, week_start)')
            .in('weekly_wage_reports.assignment_id', assignmentIds)
            .gte('weekly_wage_reports.week_start', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
        : Promise.resolve({ data: [] }),
      scopeIds.length > 0
        ? supabase.from('weekly_wage_reports').select('scope_id, net_amount').in('scope_id', scopeIds).in('status', ['approved', 'paid'])
        : Promise.resolve({ data: [] }),
      assignmentIds.length > 0
        ? supabase.from('weekly_wage_reports')
            .select('id, week_start, week_end, status, net_amount, payment_method, paid_at, scope:work_scopes(id, scope_name), assignment:mandor_assignments(project:projects(id, name))')
            .in('assignment_id', assignmentIds)
            .order('week_start', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      // Pekerja aktif terdaftar di bawah mandor ini
      supabase.from('workers').select('id').eq('mandor_id', mandor_id).eq('is_active', true),
    ])

    const totalPaid = ((paidRes as any).data ?? []).reduce((s: number, r: any) => s + Number(r.net_amount), 0)
    const uniqueWorkers = new Set(((workerRes as any).data ?? []).map((wi: any) => wi.worker_name))
    const activeWorkersThisMonth = uniqueWorkers.size
    const totalRegisteredWorkers = (registeredRes as any).data?.length ?? 0
    const totalKasbonOutstanding = (kasbonsRes.data ?? []).reduce((s: number, k: any) => s + (Number(k.amount) - Number(k.amount_settled)), 0)
    const activeScopeCount = assignments.flatMap((a: any) => a.work_scopes ?? []).filter((sc: any) => sc.status === 'active').length

    const scopeBudgetMap: Record<string, number> = {}
    for (const r of ((scopeWagesRes as any).data ?? []) as any[]) {
      scopeBudgetMap[r.scope_id] = (scopeBudgetMap[r.scope_id] ?? 0) + Number(r.net_amount)
    }

    const enrichedAssignments = assignments.map((a: any) => ({
      ...a,
      work_scopes: (a.work_scopes ?? []).map((sc: any) => ({
        ...sc,
        total_paid: scopeBudgetMap[sc.id] ?? 0,
      })),
    }))

    return reply.send({
      mandor: flattenUserRole(mandorRes.data),
      kpi: { totalPaid, totalKasbonOutstanding, activeScopeCount, activeWorkersThisMonth, totalRegisteredWorkers },
      assignments: enrichedAssignments,
      reports: (reportsRes as any).data ?? [],
      kasbons: kasbonsRes.data ?? [],
    })
  })

  // GET /api/v1/mandor/wage-reports?project_id=&assignment_id=&scope_id=&status=
  app.get('/api/v1/mandor/wage-reports', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { project_id, assignment_id, scope_id, status } = request.query as Record<string, string>

    let q = supabase
      .from('weekly_wage_reports')
      .select(`
        id, week_start, week_end, status, subtotal, total_deduction, net_amount,
        notes, submitted_at, reviewed_at, review_notes, paid_at, created_at,
        assignment:mandor_assignments(
          id,
          project:projects(id, name),
          mandor:users!mandor_assignments_mandor_id_fkey(id, name)
        ),
        scope:work_scopes(id, scope_name, payment_system),
        reviewer:users!weekly_wage_reports_reviewed_by_fkey(id, name)
      `)
      .order('week_start', { ascending: false })

    if (status) q = q.eq('status', status)
    if (scope_id) q = q.eq('scope_id', scope_id)
    if (assignment_id) q = q.eq('assignment_id', assignment_id)

    // Untuk mandor, filter by assignment mereka
    if (user.role === 'mandor') {
      const { data: asgn } = await supabase
        .from('mandor_assignments')
        .select('id')
        .eq('mandor_id', user.id)
      const ids = (asgn ?? []).map((a: any) => a.id)
      if (ids.length === 0) return reply.send({ reports: [] })
      q = q.in('assignment_id', ids)
    }

    if (project_id) {
      const { data: asgn } = await supabase
        .from('mandor_assignments')
        .select('id')
        .eq('project_id', project_id)
      const ids = (asgn ?? []).map((a: any) => a.id)
      if (ids.length === 0) return reply.send({ reports: [] })
      q = q.in('assignment_id', ids)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ reports: data ?? [] })
  })

  // GET /api/v1/mandor/wage-reports/:id â€” detail laporan + items + deductions
  app.get('/api/v1/mandor/wage-reports/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [reportRes, itemsRes, deductionsRes] = await Promise.all([
      supabase
        .from('weekly_wage_reports')
        .select(`
          id, week_start, week_end, status, subtotal, total_deduction, net_amount,
          notes, submitted_at, reviewed_at, review_notes, paid_at, created_at, updated_at,
          assignment:mandor_assignments(
            id,
            project:projects(id, name, location),
            mandor:users!mandor_assignments_mandor_id_fkey(id, name, phone)
          ),
          scope:work_scopes(id, scope_name, payment_system, borongan_value),
          reviewer:users!weekly_wage_reports_reviewed_by_fkey(id, name)
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('wage_items')
        .select('id, worker_name, worker_id, days_worked, daily_rate, overtime_hours, overtime_rate, subtotal, notes')
        .eq('report_id', id)
        .order('created_at'),
      supabase
        .from('wage_deductions')
        .select(`
          id, label, amount, created_at,
          worker_kasbon:worker_kasbons(id, amount, purpose, kasbon_date, worker:workers(id, name))
        `)
        .eq('report_id', id)
        .order('created_at'),
    ])

    if (reportRes.error) return reply.status(404).send({ error: 'Laporan tidak ditemukan' })
    return reply.send({
      report: reportRes.data,
      items: itemsRes.data ?? [],
      deductions: deductionsRes.data ?? [],
    })
  })

  // POST /api/v1/mandor/wage-reports â€” buat laporan upah baru
  app.post('/api/v1/mandor/wage-reports', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      assignment_id: string
      scope_id: string
      week_start: string  // ISO date, harus Senin
      notes?: string
      items: Array<{
        worker_name: string
        worker_id?: string
        days_worked: number
        daily_rate: number
        overtime_hours?: number
        overtime_rate?: number
      }>
      deductions?: Array<{
        tipe?: 'kasbon_kolektif' | 'kasbon_individu'
        worker_kasbon_id?: string
        worker_name?: string
        label: string
        amount: number
      }>
    }

    if (!body.assignment_id || !body.scope_id || !body.week_start || !body.items?.length) {
      return reply.status(400).send({ error: 'assignment_id, scope_id, week_start, dan items wajib diisi' })
    }

    // Validasi deductions
    if (body.deductions?.length) {
      for (const d of body.deductions) {
        const tipe = d.tipe ?? 'kasbon_kolektif'
        if (tipe === 'kasbon_individu' && !d.worker_kasbon_id && !d.worker_name) {
          return reply.status(400).send({ error: 'Potongan individu harus menyertakan worker_kasbon_id atau worker_name' })
        }
      }
    }

    // Hitung week_end (Minggu = week_start + 6 hari)
    const weekStart = new Date(body.week_start)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    // Buat laporan
    const { data: report, error: rErr } = await supabase
      .from('weekly_wage_reports')
      .insert({
        assignment_id: body.assignment_id,
        scope_id: body.scope_id,
        week_start: body.week_start,
        week_end: weekEndStr,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        notes: body.notes ?? null,
      })
      .select()
      .single()
    if (rErr) {
      if (rErr.code === '23505') return reply.status(409).send({ error: 'Laporan untuk minggu ini sudah ada di scope ini' })
      return reply.status(500).send({ error: rErr.message })
    }

    // Insert wage items
    const itemRows = body.items.map(item => {
      const overtimeHours = item.overtime_hours ?? 0
      const overtimeRate = item.overtime_rate ?? 0
      const subtotal = (item.days_worked * item.daily_rate) + (overtimeHours * overtimeRate)
      return {
        report_id: report.id,
        worker_name: item.worker_name,
        worker_id: item.worker_id ?? null,
        days_worked: item.days_worked,
        daily_rate: item.daily_rate,
        overtime_hours: overtimeHours,
        overtime_rate: overtimeRate,
        subtotal,
      }
    })

    const { error: iErr } = await supabase.from('wage_items').insert(itemRows)
    if (iErr) return reply.status(500).send({ error: iErr.message })

    // Insert deductions jika ada
    if (body.deductions?.length) {
      const dedRows = body.deductions.map(d => ({
        report_id: report.id,
        tipe: d.tipe ?? 'kasbon_kolektif',
        worker_kasbon_id: d.worker_kasbon_id ?? null,
        worker_name: d.worker_name ?? null,
        label: d.label,
        amount: d.amount,
      }))
      const { error: dErr } = await supabase.from('wage_deductions').insert(dedRows)
      if (dErr) return reply.status(500).send({ error: dErr.message })
    }

    // Ambil laporan final dengan totals (trigger sudah update subtotal/net)
    const { data: final } = await supabase
      .from('weekly_wage_reports')
      .select('id, subtotal, total_deduction, net_amount, status, week_start, week_end')
      .eq('id', report.id)
      .single()

    // ── Fire-and-forget: notif ke admin + PM saat laporan upah disubmit ──────
    try {
      const { data: assignInfo } = await supabase
        .from('mandor_assignments')
        .select('project_id, mandor:users!mandor_assignments_mandor_id_fkey(name)')
        .eq('id', body.assignment_id)
        .single()

      if (assignInfo?.project_id) {
        const recipients = await getProjectAdminsAndPM(assignInfo.project_id)
        const mandorName = (assignInfo.mandor as any)?.name ?? user.name
        createNotifications(recipients.map(uid => ({
          user_id:     uid,
          title:       'Laporan Upah Diajukan',
          message:     `Laporan upah minggu ${body.week_start} – ${weekEndStr} diajukan oleh ${mandorName}`,
          type:        'wage_report_submitted' as const,
          priority:    'normal' as const,
          project_id:  assignInfo.project_id,
          action_url:  '/mandor?tab=laporan',
          action_type: 'approve_wage_report',
          action_data: { report_id: report.id },
        })))
      }
    } catch { /* ignore */ }

    return reply.status(201).send({ report: final })
  })

  // PATCH /api/v1/mandor/wage-reports/:id/status â€” approve / reject / paid
  app.patch('/api/v1/mandor/wage-reports/:id/status', {
    preHandler: [authenticate, requirePermission('mandor:wage:approve')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { id } = request.params as { id: string }
    const { status, review_notes, paid_at, cash_account_id, payment_method } = request.body as {
      status: 'approved' | 'rejected' | 'paid'
      review_notes?: string
      paid_at?: string
      cash_account_id?: string
      payment_method?: 'cash' | 'transfer_bank'
    }

    if (!['approved', 'rejected', 'paid'].includes(status)) {
      return reply.status(400).send({ error: 'Status harus: approved | rejected | paid' })
    }

    // Validasi cash account jika bayar upah
    if (status === 'paid' && cash_account_id) {
      const { data: acct } = await supabase
        .from('cash_accounts')
        .select('id, is_active, balance, name')
        .eq('id', cash_account_id)
        .single()
      if (!acct || !acct.is_active) {
        return reply.status(400).send({ error: 'Akun kas tidak valid atau tidak aktif' })
      }
      // Ambil net_amount untuk cek saldo
      const { data: rpt } = await supabase
        .from('weekly_wage_reports')
        .select('net_amount')
        .eq('id', id)
        .single()
      if (rpt && Number(acct.balance) < Number(rpt.net_amount)) {
        return reply.status(400).send({
          error: `Saldo ${acct.name} tidak mencukupi. Saldo: Rp ${Number(acct.balance).toLocaleString('id-ID')}, dibutuhkan: Rp ${Number(rpt.net_amount).toLocaleString('id-ID')}`
        })
      }
    }

    const update: Record<string, unknown> = {
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (review_notes) update.review_notes = review_notes
    if (status === 'approved' || status === 'paid') {
      update.paid_at = paid_at ?? new Date().toISOString().split('T')[0]
      if (payment_method) update.payment_method = payment_method
    }
    if (status === 'paid') {
      update.cash_account_id = cash_account_id ?? null
    }

    const { data, error } = await supabase
      .from('weekly_wage_reports')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ report: data })
  })

  // DELETE /api/v1/mandor/wage-reports/:id â€” hapus laporan (hanya jika masih draft/submitted)
  app.delete('/api/v1/mandor/wage-reports/:id', {
    preHandler: [authenticate, requirePermission('mandor:wage:create')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data: existing } = await supabase
      .from('weekly_wage_reports').select('status').eq('id', id).single()
    if (!existing) return reply.status(404).send({ error: 'Laporan tidak ditemukan' })
    if (!['draft', 'submitted'].includes(existing.status)) {
      return reply.status(409).send({ error: 'Laporan yang sudah approved/paid tidak bisa dihapus' })
    }

    const { error } = await supabase.from('weekly_wage_reports').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(204).send()
  })

  // â”€â”€â”€ SUMMARY per mandor / per proyek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // ─── PROGRESS PAYMENTS ───────────────────────────────────────────────────

  // GET /api/v1/mandor/progress-payments?work_scope_id=&status=
  app.get('/api/v1/mandor/progress-payments', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { work_scope_id, status } = request.query as Record<string, string>

    let q = supabase
      .from('progress_payments')
      .select(`
        id, pct_completed, earned_value, gross_payment, deducted_kasbon, net_payment,
        paid_at, payment_method, ref_number, notes, status, cash_account_id, created_at,
        scope:work_scopes!inner(
          id, scope_name, payment_system,
          assignment:mandor_assignments!inner(
            mandor:users!mandor_assignments_mandor_id_fkey(id, name)
          )
        ),
        approver:users!progress_payments_approved_by_fkey(id, name),
        requester:users!progress_payments_requested_by_fkey(id, name)
      `)
      .order('created_at', { ascending: false })

    if (work_scope_id) q = q.eq('work_scope_id', work_scope_id)
    if (status) q = q.eq('status', status)

    if (user.role === 'mandor') {
      const { data: asgn } = await supabase
        .from('mandor_assignments').select('id').eq('mandor_id', user.id)
      const asgIds = (asgn ?? []).map((a: any) => a.id)
      if (asgIds.length === 0) return reply.send({ payments: [] })
      q = (q as any).in('work_scopes.assignment_id', asgIds)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ payments: data ?? [] })
  })

  // POST /api/v1/mandor/progress-payments — mandor submit penagihan progress%
  app.post('/api/v1/mandor/progress-payments', {
    preHandler: [authenticate, requirePermission('mandor:kasbon:create')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      work_scope_id: string
      pct_completed: number
      gross_payment: number
      notes?: string
    }

    if (!body.work_scope_id || body.pct_completed == null || body.gross_payment == null) {
      return reply.status(400).send({ error: 'work_scope_id, pct_completed, dan gross_payment wajib diisi' })
    }
    if (body.pct_completed <= 0 || body.pct_completed > 100) {
      return reply.status(400).send({ error: 'pct_completed harus antara 1 dan 100' })
    }
    if (body.gross_payment <= 0) {
      return reply.status(400).send({ error: 'gross_payment harus lebih dari 0' })
    }

    const { data: scope } = await supabase
      .from('work_scopes')
      .select('id, payment_system, borongan_value, borongan_value_override, assignment:mandor_assignments!inner(mandor_id, project_id)')
      .eq('id', body.work_scope_id)
      .single()

    if (!scope) return reply.status(404).send({ error: 'Scope tidak ditemukan' })
    if (scope.payment_system !== 'progress_pct') return reply.status(400).send({ error: 'Scope ini bukan tipe progress%' })
    if (user.role === 'mandor' && (scope.assignment as any)?.mandor_id !== user.id) {
      return reply.status(403).send({ error: 'Akses ditolak' })
    }

    const contractValue = (scope as any).borongan_value_override ?? scope.borongan_value ?? 0
    const earnedValue = contractValue > 0 ? (body.pct_completed * contractValue / 100) : body.gross_payment

    const { data, error } = await supabase
      .from('progress_payments')
      .insert({
        work_scope_id: body.work_scope_id,
        pct_completed: body.pct_completed,
        earned_value: earnedValue,
        gross_payment: body.gross_payment,
        deducted_kasbon: 0,
        net_payment: body.gross_payment,
        paid_at: new Date().toISOString().split('T')[0],
        payment_method: 'transfer_bank',
        notes: body.notes ?? null,
        status: 'pending',
        requested_by: user.id,
        approved_by: user.id,
      })
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })

    try {
      const projectId = (scope.assignment as any)?.project_id
      if (projectId) {
        const recipients = await getProjectAdminsAndPM(projectId)
        createNotifications(recipients.map(uid => ({
          user_id:    uid,
          title:      'Penagihan Progress Diajukan',
          message:    `Mandor mengajukan penagihan ${body.pct_completed}% senilai Rp ${body.gross_payment.toLocaleString('id-ID')}`,
          type:       'kasbon_submitted' as const,
          priority:   'normal' as const,
          project_id: projectId,
          action_url: '/mandor?tab=kasbon',
        })))
      }
    } catch { /* ignore */ }

    return reply.status(201).send({ payment: data })
  })

  // PATCH /api/v1/mandor/progress-payments/:id/confirm — admin/PM konfirmasi pembayaran
  app.patch('/api/v1/mandor/progress-payments/:id/confirm', {
    preHandler: [authenticate, requirePermission('mandor:kasbon:approve')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { id } = request.params as { id: string }
    const body = request.body as {
      cash_account_id?: string
      actual_payment?: number
      deducted_kasbon?: number
      notes?: string
      status: 'approved' | 'rejected'
    }

    if (!['approved', 'rejected'].includes(body.status)) {
      return reply.status(400).send({ error: 'status harus approved atau rejected' })
    }

    const { data: existing } = await supabase
      .from('progress_payments')
      .select('id, status, gross_payment, work_scope_id')
      .eq('id', id)
      .single()
    if (!existing) return reply.status(404).send({ error: 'Penagihan tidak ditemukan' })
    if ((existing as any).status !== 'pending') return reply.status(400).send({ error: 'Penagihan ini sudah diproses' })

    if (body.status === 'approved') {
      if (!body.cash_account_id) return reply.status(400).send({ error: 'cash_account_id wajib saat approve' })
      const { data: acct } = await supabase.from('cash_accounts').select('id, balance, is_active, name').eq('id', body.cash_account_id).single()
      if (!acct || !acct.is_active) return reply.status(400).send({ error: 'Akun kas tidak valid' })
      const toPay = body.actual_payment ?? Number((existing as any).gross_payment)
      if (Number(acct.balance) < toPay) {
        return reply.status(400).send({ error: `Saldo ${acct.name} tidak cukup. Saldo: Rp ${Number(acct.balance).toLocaleString('id-ID')}` })
      }
    }

    const deducted = body.deducted_kasbon ?? 0
    const netPayment = (body.actual_payment ?? Number((existing as any).gross_payment)) - deducted
    const update: Record<string, unknown> = {
      status: body.status,
      approved_by: user.id,
      notes: body.notes ?? null,
    }
    if (body.status === 'approved') {
      update.cash_account_id = body.cash_account_id
      update.net_payment = netPayment
      update.deducted_kasbon = deducted
      if (body.actual_payment) update.gross_payment = body.actual_payment
    }

    const { data, error } = await supabase
      .from('progress_payments')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })

    try {
      const { data: scopeData } = await supabase
        .from('work_scopes')
        .select('assignment:mandor_assignments!inner(mandor_id, project_id)')
        .eq('id', existing.work_scope_id)
        .single()
      const mandorId = (scopeData?.assignment as any)?.mandor_id
      const projectId = (scopeData?.assignment as any)?.project_id
      if (mandorId) {
        createNotifications([{
          user_id:    mandorId,
          title:      body.status === 'approved' ? 'Penagihan Progress Disetujui' : 'Penagihan Progress Ditolak',
          message:    body.status === 'approved'
            ? `Penagihan progress Anda disetujui. Dana Rp ${netPayment.toLocaleString('id-ID')} akan segera ditransfer.`
            : `Penagihan progress Anda ditolak. ${body.notes ?? ''}`,
          type:       'kasbon_approved' as const,
          priority:   'high' as const,
          project_id: projectId,
          action_url: '/mandor-portal/penagihan',
        }])
      }
    } catch { /* ignore */ }

    return reply.send({ payment: data })
  })

  // ─── BORONGAN SETTLEMENTS ─────────────────────────────────────────────────

  // GET /api/v1/mandor/borongan-settlements?work_scope_id=
  app.get('/api/v1/mandor/borongan-settlements', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { work_scope_id } = request.query as Record<string, string>

    let q = supabase
      .from('borongan_settlements')
      .select(`
        id, borongan_value, total_kasbon, total_progress_paid, total_other_expense,
        remaining_balance, net_payment, cash_account_id, settled_at, notes, created_at,
        scope:work_scopes!inner(
          id, scope_name,
          assignment:mandor_assignments!inner(
            mandor:users!mandor_assignments_mandor_id_fkey(id, name)
          )
        ),
        approver:users!borongan_settlements_approved_by_fkey(id, name)
      `)
      .order('settled_at', { ascending: false })

    if (work_scope_id) q = q.eq('work_scope_id', work_scope_id)

    if (user.role === 'mandor') {
      const { data: asgn } = await supabase
        .from('mandor_assignments').select('id').eq('mandor_id', user.id)
      const asgIds = (asgn ?? []).map((a: any) => a.id)
      if (asgIds.length === 0) return reply.send({ settlements: [] })
      q = (q as any).in('work_scopes.assignment_id', asgIds)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ settlements: data ?? [] })
  })

  // POST /api/v1/mandor/borongan-settlements — admin/PM cairkan settlement borongan
  app.post('/api/v1/mandor/borongan-settlements', {
    preHandler: [authenticate, requirePermission('mandor:kasbon:approve')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      work_scope_id: string
      borongan_value: number
      total_kasbon: number
      total_progress_paid: number
      total_other_expense: number
      net_payment: number
      cash_account_id?: string
      notes?: string
    }

    if (!body.work_scope_id || body.borongan_value == null || body.net_payment == null) {
      return reply.status(400).send({ error: 'work_scope_id, borongan_value, dan net_payment wajib diisi' })
    }

    const { data: scope } = await supabase
      .from('work_scopes')
      .select('id, payment_system, assignment:mandor_assignments!inner(mandor_id, project_id)')
      .eq('id', body.work_scope_id)
      .single()
    if (!scope) return reply.status(404).send({ error: 'Scope tidak ditemukan' })
    if (!['borongan', 'progress_pct'].includes(scope.payment_system)) {
      return reply.status(400).send({ error: 'Settlement hanya untuk scope borongan atau progress_pct' })
    }

    const { data: existingSettlement } = await supabase
      .from('borongan_settlements').select('id').eq('work_scope_id', body.work_scope_id).single()
    if (existingSettlement) return reply.status(409).send({ error: 'Settlement untuk scope ini sudah ada' })

    if (body.cash_account_id && body.net_payment > 0) {
      const { data: acct } = await supabase.from('cash_accounts').select('id, balance, is_active, name').eq('id', body.cash_account_id).single()
      if (!acct || !acct.is_active) return reply.status(400).send({ error: 'Akun kas tidak valid' })
      if (Number(acct.balance) < body.net_payment) {
        return reply.status(400).send({ error: `Saldo ${acct.name} tidak cukup. Saldo: Rp ${Number(acct.balance).toLocaleString('id-ID')}` })
      }
    }

    const remainingBalance = body.borongan_value - body.total_kasbon - body.total_progress_paid - body.total_other_expense

    const { data, error } = await supabase
      .from('borongan_settlements')
      .insert({
        work_scope_id: body.work_scope_id,
        borongan_value: body.borongan_value,
        total_kasbon: body.total_kasbon,
        total_progress_paid: body.total_progress_paid,
        total_other_expense: body.total_other_expense,
        remaining_balance: remainingBalance,
        net_payment: body.net_payment,
        cash_account_id: body.cash_account_id ?? null,
        settled_at: new Date().toISOString().split('T')[0],
        notes: body.notes ?? null,
        approved_by: user.id,
      })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return reply.status(409).send({ error: 'Settlement untuk scope ini sudah ada' })
      return reply.status(500).send({ error: error.message })
    }

    await supabase.from('work_scopes').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', body.work_scope_id)

    try {
      const mandorId = (scope.assignment as any)?.mandor_id
      const projectId = (scope.assignment as any)?.project_id
      if (mandorId) {
        createNotifications([{
          user_id:    mandorId,
          title:      'Settlement Borongan Dicairkan',
          message:    `Settlement pekerjaan selesai. Dana bersih Rp ${body.net_payment.toLocaleString('id-ID')} telah diproses.`,
          type:       'kasbon_approved' as const,
          priority:   'high' as const,
          project_id: projectId,
          action_url: '/mandor-portal/pembayaran',
        }])
      }
    } catch { /* ignore */ }

    return reply.status(201).send({ settlement: data })
  })

  // PATCH /api/v1/mandor/work-scopes/:id/borongan-value — update override nilai kontrak
  app.patch('/api/v1/mandor/work-scopes/:id/borongan-value', {
    preHandler: [authenticate, requirePermission('mandor:scope:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { borongan_value_override } = request.body as { borongan_value_override: number | null }

    const { data, error } = await supabase
      .from('work_scopes')
      .update({ borongan_value_override, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, scope_name, borongan_value, borongan_value_override')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ scope: data })
  })

  // PATCH /api/v1/mandor/worker-kasbons/:id/status — approve/reject worker kasbon
  app.patch('/api/v1/mandor/worker-kasbons/:id/status', {
    preHandler: [authenticate, requirePermission('mandor:kasbon:approve')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { id } = request.params as { id: string }
    const { status, notes, cash_account_id } = request.body as {
      status: 'approved' | 'rejected'
      notes?: string
      cash_account_id?: string
    }

    if (!['approved', 'rejected'].includes(status)) {
      return reply.status(400).send({ error: 'status harus approved atau rejected' })
    }

    const { data: existing } = await supabase
      .from('worker_kasbons')
      .select('id, amount, mandor_id, worker_id, project_id')
      .eq('id', id)
      .single()
    if (!existing) return reply.status(404).send({ error: 'Kasbon tukang tidak ditemukan' })

    if (status === 'approved' && cash_account_id) {
      const { data: acct } = await supabase.from('cash_accounts').select('id, balance, is_active, name').eq('id', cash_account_id).single()
      if (!acct || !acct.is_active) return reply.status(400).send({ error: 'Akun kas tidak valid' })
      if (Number(acct.balance) < Number(existing.amount)) {
        return reply.status(400).send({ error: `Saldo ${acct.name} tidak cukup. Saldo: Rp ${Number(acct.balance).toLocaleString('id-ID')}` })
      }
    }

    const update: Record<string, unknown> = { notes, updated_at: new Date().toISOString() }
    if (status === 'approved' && cash_account_id) {
      update.cash_account_id = cash_account_id
    }

    const { data, error } = await supabase
      .from('worker_kasbons')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error) return reply.status(500).send({ error: error.message })

    try {
      if (existing.mandor_id) {
        createNotifications([{
          user_id:    existing.mandor_id,
          title:      status === 'approved' ? 'Kasbon Tukang Disetujui' : 'Kasbon Tukang Ditolak',
          message:    status === 'approved'
            ? `Kasbon tukang Rp ${Number(existing.amount).toLocaleString('id-ID')} telah disetujui.`
            : `Kasbon tukang Rp ${Number(existing.amount).toLocaleString('id-ID')} ditolak. ${notes ?? ''}`,
          type:       'kasbon_approved' as const,
          priority:   'normal' as const,
          project_id: (existing as any).project_id ?? undefined,
          action_url: '/mandor-portal/kasbon-tukang',
        }])
      }
    } catch { /* ignore */ }

    return reply.send({ kasbon: data, approved: status === 'approved' })
  })

  // GET /api/v1/mandor/my-scopes — scopes dengan computed fields (untuk portal mandor)
  app.get('/api/v1/mandor/my-scopes', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!

    let asgQ = supabase
      .from('mandor_assignments')
      .select(`
        id, assigned_at,
        project:projects(id, name, location),
        work_scopes(
          id, scope_name, description, payment_system, borongan_value, borongan_value_override,
          progress_pct_done, status, start_date, end_date
        )
      `)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false })

    if (user.role === 'mandor') asgQ = asgQ.eq('mandor_id', user.id)

    const { data: assignments, error } = await asgQ
    if (error) return reply.status(500).send({ error: error.message })

    const allScopes = (assignments ?? []).flatMap((a: any) =>
      (a.work_scopes ?? []).map((s: any) => ({ ...s, project: a.project, assignment_id: a.id }))
    )
    const scopeIds = allScopes.map((s: any) => s.id)
    if (scopeIds.length === 0) return reply.send({ scopes: [] })

    const [kasbonRes, progressRes, settlementRes, itemsRes] = await Promise.all([
      supabase
        .from('kasbons')
        .select('work_scope_id, amount, status')
        .in('work_scope_id', scopeIds)
        .in('status', ['approved', 'settled']),
      supabase
        .from('progress_payments')
        .select('work_scope_id, gross_payment, net_payment, status')
        .in('work_scope_id', scopeIds),
      supabase
        .from('borongan_settlements')
        .select('work_scope_id, borongan_value, total_kasbon, net_payment, remaining_balance, settled_at')
        .in('work_scope_id', scopeIds),
      supabase
        .from('work_scope_items')
        .select('work_scope_id, subtotal')
        .in('work_scope_id', scopeIds),
    ])

    const kasbonMap: Record<string, number> = {}
    for (const k of (kasbonRes.data ?? []) as any[]) {
      kasbonMap[k.work_scope_id] = (kasbonMap[k.work_scope_id] ?? 0) + Number(k.amount)
    }
    const progressPaidMap: Record<string, number> = {}
    for (const p of (progressRes.data ?? []) as any[]) {
      if (p.status === 'approved') {
        progressPaidMap[p.work_scope_id] = (progressPaidMap[p.work_scope_id] ?? 0) + Number(p.net_payment)
      }
    }
    const itemsTotalMap: Record<string, number> = {}
    for (const item of (itemsRes.data ?? []) as any[]) {
      if (item.subtotal) {
        itemsTotalMap[item.work_scope_id] = (itemsTotalMap[item.work_scope_id] ?? 0) + Number(item.subtotal)
      }
    }
    const settlementMap: Record<string, any> = {}
    for (const s of (settlementRes.data ?? []) as any[]) {
      settlementMap[s.work_scope_id] = s
    }

    const enriched = allScopes.map((s: any) => {
      const contractValue = s.borongan_value_override ?? (itemsTotalMap[s.id] > 0 ? itemsTotalMap[s.id] : s.borongan_value) ?? 0
      const totalKasbon = kasbonMap[s.id] ?? 0
      const totalProgressPaid = progressPaidMap[s.id] ?? 0
      return {
        ...s,
        contract_value: contractValue,
        items_subtotal: itemsTotalMap[s.id] ?? 0,
        total_kasbon: totalKasbon,
        total_progress_paid: totalProgressPaid,
        financial_pct: contractValue > 0 ? Math.min(100, Math.round((totalKasbon / contractValue) * 100)) : 0,
        settlement: settlementMap[s.id] ?? null,
      }
    })

    return reply.send({ scopes: enriched })
  })

  // GET /api/v1/mandor/summary?project_id=
  app.get('/api/v1/mandor/summary', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { project_id } = request.query as Record<string, string>

    // Ambil assignments
    let asgQ = supabase
      .from('mandor_assignments')
      .select('id, mandor_id, project_id')
      .eq('status', 'active')
    if (user.role === 'mandor') asgQ = asgQ.eq('mandor_id', user.id)
    if (project_id) asgQ = asgQ.eq('project_id', project_id)
    const { data: assignments } = await asgQ
    const asgIds = (assignments ?? []).map((a: any) => a.id)

    if (asgIds.length === 0) {
      return reply.send({ pendingReports: 0, approvedAmount: 0, activeWorkersThisMonth: 0, totalWorkersAll: 0, activeKasbons: 0, activeKasbonAmount: 0 })
    }

    const mandorIds = (assignments ?? []).map((a: any) => a.mandor_id)
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const windowStart = thirtyDaysAgo.toISOString().split('T')[0]
    const windowEnd = now.toISOString().split('T')[0]

    const [reportRes, activeWorkerRes, allWorkerRes, kasbonRes] = await Promise.all([
      supabase
        .from('weekly_wage_reports')
        .select('id, status, net_amount')
        .in('assignment_id', asgIds)
        .in('status', ['submitted', 'approved']),
      // Tukang aktif 30 hari terakhir: laporan dengan week_start dalam 30 hari → wage_items
      supabase
        .from('weekly_wage_reports')
        .select('id, wage_items(worker_name)')
        .in('assignment_id', asgIds)
        .gte('week_start', windowStart)
        .lte('week_start', windowEnd),
      // Total pekerja aktif terdaftar (is_active = true)
      supabase
        .from('workers')
        .select('id')
        .in('mandor_id', mandorIds)
        .eq('is_active', true),
      supabase
        .from('worker_kasbons')
        .select('id, amount, amount_settled')
        .eq('is_settled', false)
        .in('mandor_id', mandorIds),
    ])

    const pendingReports = (reportRes.data ?? []).filter((r: any) => r.status === 'submitted').length
    const approvedAmount = (reportRes.data ?? [])
      .filter((r: any) => r.status === 'approved')
      .reduce((s: number, r: any) => s + Number(r.net_amount), 0)
    const activeKasbonAmount = (kasbonRes.data ?? [])
      .reduce((s: number, k: any) => s + (Number(k.amount) - Number(k.amount_settled)), 0)

    // Unique workers who appeared in any wage report this month
    const allWorkerNames = (activeWorkerRes.data ?? []).flatMap((r: any) => (r.wage_items ?? []).map((wi: any) => wi.worker_name))
    const uniqueActiveWorkers = new Set(allWorkerNames).size

    return reply.send({
      pendingReports,
      approvedAmount,
      activeWorkersThisMonth: uniqueActiveWorkers,
      totalWorkersAll: allWorkerRes.data?.length ?? 0,
      activeKasbons: kasbonRes.data?.length ?? 0,
      activeKasbonAmount,
    })
  })

  // ─── GET /api/v1/mandor/rekapitulasi?project_id= ─────────────────────────────
  // Ringkasan keuangan mandor: earned vs paid vs outstanding vs kasbon beredar
  app.get('/api/v1/mandor/rekapitulasi', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { project_id } = request.query as Record<string, string>

    // Mandor hanya bisa lihat miliknya; admin/pm bisa filter by project
    let asgQ = supabase
      .from('mandor_assignments')
      .select('id, mandor_id, project_id, project:projects(id, name)')
      .eq('status', 'active')
    if (user.role === 'mandor') asgQ = asgQ.eq('mandor_id', user.id)
    if (project_id) asgQ = asgQ.eq('project_id', project_id)
    const { data: assignments } = await asgQ
    const asgIds = (assignments ?? []).map((a: any) => a.id)

    if (asgIds.length === 0) {
      return reply.send({
        total_earned: 0, total_paid: 0, outstanding: 0,
        kasbon_beredar: 0, sisa_bersih: 0,
        projects: [],
      })
    }

    // Get all work scopes with payment info
    const { data: scopes } = await supabase
      .from('work_scopes')
      .select(`
        id, scope_name, payment_system, payment_system_value,
        assignment_id,
        progress_payments(id, gross_payment, status),
        borongan_settlements(id, net_payment),
        weekly_wage_reports(id, net_amount, status)
      `)
      .in('assignment_id', asgIds)

    const scopeIds = (scopes ?? []).map((s: any) => s.id)

    // Kasbons yang belum lunas (settled_at IS NULL, status approved atau pending)
    const { data: kasbons } = scopeIds.length > 0
      ? await supabase
          .from('kasbons')
          .select('id, amount, status, settled_at')
          .in('work_scope_id', scopeIds)
          .in('status', ['pending', 'approved'])
          .is('settled_at', null)
      : { data: [] }

    // Per-project breakdown
    const projectMap: Record<string, {
      id: string; name: string;
      earned: number; paid: number;
    }> = {}

    const asgProjectMap: Record<string, { id: string; name: string }> = {}
    for (const a of assignments ?? []) {
      asgProjectMap[a.id] = { id: (a.project as any)?.id, name: (a.project as any)?.name ?? '?' }
    }

    let totalEarned = 0
    let totalPaid = 0

    for (const scope of scopes ?? []) {
      const proj = asgProjectMap[scope.assignment_id]
      if (!proj?.id) continue
      if (!projectMap[proj.id]) projectMap[proj.id] = { id: proj.id, name: proj.name, earned: 0, paid: 0 }

      if (scope.payment_system === 'harian') {
        const reports: any[] = scope.weekly_wage_reports ?? []
        for (const r of reports) {
          if (['approved', 'paid'].includes(r.status)) {
            const amt = Number(r.net_amount ?? 0)
            totalEarned += amt
            projectMap[proj.id].earned += amt
            if (r.status === 'paid') {
              totalPaid += amt
              projectMap[proj.id].paid += amt
            }
          }
        }
      } else if (scope.payment_system === 'progress_pct') {
        const payments: any[] = scope.progress_payments ?? []
        for (const p of payments) {
          if (['approved', 'paid'].includes(p.status)) {
            const amt = Number(p.gross_payment ?? 0)
            totalEarned += amt
            projectMap[proj.id].earned += amt
            totalPaid += amt
            projectMap[proj.id].paid += amt
          }
        }
      } else if (scope.payment_system === 'borongan') {
        const settlements: any[] = scope.borongan_settlements ?? []
        for (const s of settlements) {
          const amt = Number(s.net_payment ?? 0)
          totalEarned += amt
          projectMap[proj.id].earned += amt
          totalPaid += amt
          projectMap[proj.id].paid += amt
        }
      }
    }

    // Kasbon beredar: semua kasbon approved/pending yang belum settled
    const kasbonBeredar = (kasbons ?? []).reduce((s: number, k: any) => {
      return s + Number(k.amount)
    }, 0)

    // Per project kasbon (approximation: distribute equally)
    const outstanding = totalEarned - totalPaid
    const sisaBersih = outstanding - kasbonBeredar

    return reply.send({
      total_earned: totalEarned,
      total_paid: totalPaid,
      outstanding,
      kasbon_beredar: kasbonBeredar,
      sisa_bersih: sisaBersih,
      projects: Object.values(projectMap),
    })
  })
}

