import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'
import { createNotifications, getProjectAdminsAndPM } from '../../utils/notifications.js'
import { logAuditEvent } from '../../utils/audit.js'
import { enforceKasbonLimit } from '../../utils/kasbon-limit.js'
import { evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain } from '../../utils/approval.js'

export default async function kasbonRoutes(app: FastifyInstance) {

  // GET /api/v1/kasbons — list kasbon mandor
  // mandor: hanya scope milik mandor tersebut | admin/pm: semua
  app.get('/api/v1/kasbons', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { status, work_scope_id, limit = '100', offset = '0' } = request.query as Record<string, string>
    const lim = Math.min(Math.max(1, Number(limit) || 100), 200)
    const off = Math.max(0, Number(offset) || 0)

    let q = supabase
      .from('kasbons')
      .select(`
        id, amount, fund_source, purpose, kasbon_date,
        status, notes, created_at, approved_at,
        project:projects!kasbons_project_id_fkey ( id, name ),
        work_scopes (
          id, scope_name,
          mandor_assignments (
            id,
            mandor:users!mandor_assignments_mandor_id_fkey ( id, name, phone )
          )
        ),
        requester:users!kasbons_requested_by_fkey ( id, name ),
        approver:users!kasbons_approved_by_fkey ( id, name ),
        cash_account:cash_accounts!kasbons_cash_account_id_fkey ( id, name, type )
      `)
      .order('kasbon_date', { ascending: false })
      .range(off, off + lim - 1)

    if (status) q = q.eq('status', status)
    if (work_scope_id) q = q.eq('work_scope_id', work_scope_id)

    if (user.role === 'mandor') {
      // Ambil semua proyek yang mandor ini punya assignment aktif
      const { data: myAssignments } = await supabase
        .from('mandor_assignments')
        .select('project_id')
        .eq('mandor_id', user.id)

      const projectIds = (myAssignments ?? []).map((a: { project_id: string }) => a.project_id)
      if (projectIds.length === 0) return reply.send({ kasbons: [] })
      // Filter by project_id (mencakup kasbon dengan scope maupun tanpa scope)
      q = q.in('project_id', projectIds).eq('requested_by', user.id)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ kasbons: data ?? [] })
  })

  // POST /api/v1/kasbons — ajukan kasbon baru
  // work_scope_id opsional; project_id wajib (bisa dari scope atau langsung)
  // mandor: status=pending | admin/pm: auto-approved dengan cash_account_id
  app.post('/api/v1/kasbons', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      project_id?: string
      work_scope_id?: string
      amount: number
      fund_source: 'owner_advance' | 'client_fund'
      purpose: 'gaji_tukang' | 'uang_makan' | 'pembelian_alat' | 'operasional' | 'lain_lain'
      kasbon_date?: string
      notes?: string
      cash_account_id?: string
      auto_approve?: boolean
      photo_url?: string
    }

    if (!body.amount || !body.fund_source || !body.purpose) {
      return reply.status(400).send({ error: 'Field wajib: amount, fund_source, purpose' })
    }
    if (!body.project_id && !body.work_scope_id) {
      return reply.status(400).send({ error: 'Wajib isi project_id atau work_scope_id' })
    }

    // Tujuan kasbon = master `kasbon_purposes` (config-first A4). Validasi terhadap
    // lookup AKTIF → tujuan baru yang ditambah dari UI langsung valid tanpa deploy.
    const { data: purposeRow } = await supabase.from('kasbon_purposes')
      .select('code').eq('code', body.purpose).eq('is_active', true).maybeSingle()
    if (!purposeRow) return reply.status(400).send({ error: 'purpose tidak valid' })
    const validSources  = ['owner_advance', 'client_fund']
    if (!validSources.includes(body.fund_source)) return reply.status(400).send({ error: 'fund_source tidak valid' })
    if (Number(body.amount) <= 0) return reply.status(400).send({ error: 'amount harus lebih dari 0' })

    // Resolve project_id dan validasi scope ownership jika scope diisi
    let resolvedProjectId = body.project_id ?? null
    if (body.work_scope_id) {
      const { data: scope } = await supabase
        .from('work_scopes')
        .select('id, mandor_assignments!inner(mandor_id, project_id)')
        .eq('id', body.work_scope_id)
        .single()

      if (!scope) return reply.status(404).send({ error: 'Work scope tidak ditemukan' })

      if (user.role === 'mandor') {
        const isMine = (scope.mandor_assignments as any[]).some((a: any) => a.mandor_id === user.id)
        if (!isMine) return reply.status(403).send({ error: 'Hanya bisa ajukan kasbon untuk scope Anda sendiri' })
      }

      // Gunakan project_id dari scope jika belum diisi
      if (!resolvedProjectId) {
        resolvedProjectId = (scope.mandor_assignments as any[])[0]?.project_id ?? null
      }
    }

    // Validasi mandor hanya bisa kasbon untuk proyek yang dia punya assignment
    if (user.role === 'mandor' && resolvedProjectId && !body.work_scope_id) {
      const { data: asgn } = await supabase
        .from('mandor_assignments')
        .select('id')
        .eq('project_id', resolvedProjectId)
        .eq('mandor_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!asgn) return reply.status(403).send({ error: 'Anda tidak memiliki assignment aktif di proyek ini' })
    }

    // Business rule, BUKAN authorization gate (ADR-004 Rule #6): menentukan
    // apakah kasbon langsung approved — bukan boleh/tidak mengajukan. Jangan
    // migrasikan ke permission; ini kandidat Workflow Engine (Program B).
    const isAdminOrPm = user.role === 'admin' || user.role === 'pm'
    const autoApprove = isAdminOrPm && (body.auto_approve !== false)

    if (autoApprove && body.cash_account_id) {
      const { data: acct } = await supabase
        .from('cash_accounts')
        .select('id, is_active, balance, name')
        .eq('id', body.cash_account_id)
        .single()

      if (!acct || !acct.is_active) {
        return reply.status(400).send({ error: 'Akun kas tidak valid atau tidak aktif' })
      }
      if (Number(acct.balance) < Number(body.amount)) {
        return reply.status(400).send({
          error: `Saldo ${acct.name} tidak mencukupi. Saldo: Rp ${Number(acct.balance).toLocaleString('id-ID')}, dibutuhkan: Rp ${Number(body.amount).toLocaleString('id-ID')}`
        })
      }
    }

    const now = new Date().toISOString()
    const insertData: Record<string, unknown> = {
      project_id:    resolvedProjectId,
      work_scope_id: body.work_scope_id ?? null,
      amount:        Number(body.amount),
      fund_source:   body.fund_source,
      purpose:       body.purpose,
      kasbon_date:   body.kasbon_date ?? new Date().toISOString().split('T')[0],
      notes:         body.notes ?? null,
      photo_url:     body.photo_url ?? null,
      requested_by:  user.id,
      status:        autoApprove ? 'approved' : 'pending',
    }

    if (autoApprove) {
      insertData.approved_by = user.id
      insertData.approved_at = now
      insertData.cash_account_id = body.cash_account_id ?? null
    }

    const { data, error } = await supabase
      .from('kasbons')
      .insert(insertData)
      .select(`
        id, amount, fund_source, purpose, kasbon_date, status, notes, created_at, approved_at,
        project:projects ( id, name ),
        work_scopes ( id, scope_name ),
        requester:users!kasbons_requested_by_fkey ( id, name ),
        approver:users!kasbons_approved_by_fkey ( id, name )
      `)
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    // ── Fire-and-forget: notif ke admin + PM jika kasbon masih pending ───────
    if (!autoApprove && data && resolvedProjectId) {
      try {
        const { data: projInfo } = await supabase
          .from('projects')
          .select('name')
          .eq('id', resolvedProjectId)
          .single()

        const projectName = projInfo?.name ?? ''
        const scopeName   = body.work_scope_id ? ((data as any).work_scopes?.scope_name ?? '') : ''
        const amtFmt      = Number(body.amount).toLocaleString('id-ID')
        const context     = scopeName ? `${scopeName} - ${projectName}` : projectName

        const recipients = await getProjectAdminsAndPM(resolvedProjectId)
        createNotifications(recipients.map(uid => ({
          user_id:     uid,
          title:       'Kasbon Baru Diajukan',
          message:     `Kasbon Rp ${amtFmt} diajukan oleh ${user.name} untuk ${context}`,
          type:        'kasbon_pending' as const,
          priority:    'high' as const,
          project_id:  resolvedProjectId!,
          action_url:  '/mandor?tab=kasbon',
          action_type: 'approve_kasbon',
          action_data: { kasbon_id: data!.id, amount: Number(body.amount) },
        })))
      } catch { /* ignore */ }
    }

    return reply.status(201).send({
      message: autoApprove ? 'Kasbon berhasil dibuat dan disetujui' : 'Kasbon berhasil diajukan, menunggu persetujuan',
      kasbon: data,
    })
  })

  // PATCH /api/v1/kasbons/:id/status — approve/reject kasbon mandor
  //
  // GERBANG APPROVAL = KONFIGURASI (ADR-007, Phase 2/2A). `requirePermission` statis
  // diganti evaluasi rantai `approval_chains` supaya jumlah level & siapa yang boleh
  // menyetujui bisa diubah dari UI tanpa deploy.
  // BEHAVIOR-PRESERVING: seed = TEPAT 1 langkah dgn permission 'mandor:kasbon:approve'
  // → keputusan identik gerbang lama (tanpa permission = 403). Berjenjang baru aktif
  // bila founder menambah level di UI.
  app.patch('/api/v1/kasbons/:id/status', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.currentUser!
    const { status, cash_account_id } = request.body as { status: string; cash_account_id?: string }

    if (!['approved', 'rejected'].includes(status)) {
      return reply.status(400).send({ error: 'Status harus approved atau rejected' })
    }

    // Gerbang KASAR dulu (sebelum entitas di-fetch) supaya urutan lama terjaga:
    // tak berwenang = 403 tanpa membocorkan apakah id-nya ada (403-sebelum-404).
    const coarse = await canParticipateInChain(request, 'kasbon')
    if (coarse.configError) {
      app.log.error({ configError: coarse.configError }, 'baca rantai approval gagal')
      return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
    }
    if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

    // Nilai kasbon → dasar syarat nominal rantai (mis. "di atas Rp X butuh level 2").
    const { data: kasbonAmt } = await supabase.from('kasbons').select('amount').eq('id', id).maybeSingle()
    if (!kasbonAmt) return reply.status(404).send({ error: 'Kasbon tidak ditemukan' })

    const decision = await evaluateEntityApproval(request, {
      entityType: 'kasbon', entityId: id, amount: Number(kasbonAmt.amount) || 0,
    })
    // Kegagalan baca konfigurasi TIDAK boleh menyamar jadi "tidak berhak" (Phase 1 §4E).
    if (decision.configError) {
      app.log.error({ configError: decision.configError, id }, 'evaluasi rantai approval gagal')
      return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
    }
    if (!decision.allowed) {
      if (decision.reason === 'already_approved') {
        return reply.status(409).send({ error: 'Kasbon sudah disetujui penuh' })
      }
      return reply.status(403).send({ error: 'Akses ditolak' })
    }

    // Project isolation untuk PM: hanya boleh approve kasbon di proyek sendiri
    if (user.role === 'pm') {
      const { data: kasbon } = await supabase
        .from('kasbons')
        .select('project_id, work_scope_id')
        .eq('id', id)
        .single()
      if (!kasbon) return reply.status(404).send({ error: 'Kasbon tidak ditemukan' })

      // project_id bisa langsung dari kolom atau null (edge case data lama)
      let projectId: string | null = kasbon.project_id ?? null

      // Fallback: resolve dari work_scope jika project_id null (data sebelum migration 056)
      if (!projectId && kasbon.work_scope_id) {
        const { data: scope } = await supabase
          .from('work_scopes')
          .select('mandor_assignments!inner(project_id)')
          .eq('id', kasbon.work_scope_id)
          .single()
        projectId = (scope?.mandor_assignments as any)?.[0]?.project_id ?? null
      }

      if (projectId) {
        const { data: project } = await supabase.from('projects').select('pm_id').eq('id', projectId).single()
        if (project?.pm_id !== user.id) return reply.status(403).send({ error: 'Akses ditolak' })
      }
    }

    // Validasi & cek saldo kas jika approve
    if (status === 'approved' && cash_account_id) {
      const { data: acct } = await supabase
        .from('cash_accounts')
        .select('id, is_active, balance, name')
        .eq('id', cash_account_id)
        .single()

      if (!acct || !acct.is_active) {
        return reply.status(400).send({ error: 'Akun kas tidak valid atau tidak aktif' })
      }

      // Ambil amount kasbon untuk cek saldo
      const { data: kasbon } = await supabase
        .from('kasbons')
        .select('amount')
        .eq('id', id)
        .single()

      if (kasbon && Number(acct.balance) < Number(kasbon.amount)) {
        return reply.status(400).send({
          error: `Saldo ${acct.name} tidak mencukupi. Saldo: Rp ${Number(acct.balance).toLocaleString('id-ID')}, dibutuhkan: Rp ${Number(kasbon.amount).toLocaleString('id-ID')}`
        })
      }
    }

    // Batas kasbon (config-first Q2): bila enforcement ON (default OFF), tolak approve
    // yang melebihi batas % earned value untuk scope progress_pct. Fail-open saat OFF
    // → nol perubahan perilaku hari ini.
    if (status === 'approved') {
      const { data: k } = await supabase.from('kasbons').select('amount').eq('id', id).single()
      const limitCheck = await enforceKasbonLimit(id, Number(k?.amount) || 0)
      if (!limitCheck.allowed) {
        return reply.status(400).send({ error: limitCheck.reason })
      }
    }

    // Catat persetujuan level ini. Bila BUKAN langkah terakhir, kasbon TETAP 'pending'
    // menunggu level berikutnya — status sumber baru berubah di langkah final.
    if (status === 'approved' && decision.step) {
      const rec = await recordApproval({
        entityType: 'kasbon', entityId: id, level: decision.step.level, approvedBy: user.id,
      })
      if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

      if (!decision.isFinalStep) {
        const next = decision.applicable.find(s => s.level > decision.step!.level)
        void logAuditEvent(request, {
          tableName: 'kasbons', recordId: id, action: 'kasbon.approval.level',
          actorId: user.id, newValues: { level: decision.step.level, of: decision.applicable.length },
          severity: 'critical',
        })
        return reply.send({
          data: null,
          pending_next_level: true,
          message: `Persetujuan level ${decision.step.level} tercatat. Menunggu persetujuan level ${next?.level ?? '-'}.`,
        })
      }
    }

    // Ditolak → jejak persetujuan dibersihkan supaya rantai mulai dari awal bila diajukan lagi.
    if (status === 'rejected') {
      await clearApprovalProgress('kasbon', id)
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'approved') {
      updateData.approved_by = request.currentUser!.id
      updateData.approved_at = new Date().toISOString()
      updateData.cash_account_id = cash_account_id ?? null
    }

    // Guard atomik: hanya update jika status SAAT INI masih 'pending' — mencegah
    // approve/reject ganda dan race condition dua approval bersamaan (filter
    // status ikut serta dalam WHERE clause tunggal di level DB, bukan
    // SELECT-lalu-UPDATE terpisah yang rawan race).
    const { data, error } = await supabase
      .from('kasbons')
      .update(updateData)
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) {
      const { data: current } = await supabase.from('kasbons').select('status').eq('id', id).single()
      if (!current) return reply.status(404).send({ error: 'Kasbon tidak ditemukan' })
      return reply.status(409).send({ error: `Kasbon sudah berstatus '${current.status}', tidak bisa diproses ulang` })
    }

    // Audit: perubahan status kasbon (finansial-kritis, severity critical)
    void logAuditEvent(request, {
      tableName: 'kasbons',
      recordId: id,
      action: 'kasbon.status',
      actorId: user.id,
      oldValues: { status: 'pending' },
      newValues: { status },
      severity: 'critical',
    })

    // ── Fire-and-forget: notif ke mandor yang mengajukan ─────────────────────
    try {
      const { data: kasbonFull } = await supabase
        .from('kasbons')
        .select(`
          amount, requested_by, project_id,
          project:projects!kasbons_project_id_fkey ( id, name ),
          work_scopes ( scope_name )
        `)
        .eq('id', id)
        .single()

      if (kasbonFull?.requested_by) {
        const projectName = (kasbonFull.project as any)?.name ?? ''
        const projectId   = (kasbonFull.project as any)?.id as string | undefined
        const scopeName   = (kasbonFull.work_scopes as any)?.scope_name ?? ''
        const context     = scopeName ? `${scopeName} - ${projectName}` : projectName
        const amtFmt      = Number(kasbonFull.amount).toLocaleString('id-ID')

        createNotifications([{
          user_id:     kasbonFull.requested_by,
          title:       status === 'approved' ? 'Kasbon Disetujui' : 'Kasbon Ditolak',
          message:     status === 'approved'
            ? `Kasbon Rp ${amtFmt} untuk ${context} telah disetujui`
            : `Kasbon Rp ${amtFmt} untuk ${context} ditolak`,
          type:        status === 'approved' ? 'kasbon_approved' as const : 'kasbon_rejected' as const,
          priority:    'normal' as const,
          project_id:  projectId,
          action_url:  '/mandor?tab=kasbon',
          action_type: 'view_kasbon',
          action_data: { kasbon_id: id },
        }])
      }
    } catch { /* ignore */ }

    return {
      message: status === 'approved' ? 'Kasbon disetujui' : 'Kasbon ditolak',
      kasbon: data,
    }
  })
}
