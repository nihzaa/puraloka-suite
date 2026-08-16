import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { createNotification, createNotifications } from '../../utils/notifications.js'
import { resolveRecipients } from '../../utils/notification-routing.js'
import { logAuditEvent } from '../../utils/audit.js'
import { getEffectiveFinancialValue } from '../../utils/financial-config.js'
import { todayWIB } from '../../lib/financial-config.js'

export default async function projectRoutes(app: FastifyInstance) {

  // GET /api/v1/projects — list projects (exclude soft-deleted)
  // Role client: hanya proyek milik client yang terhubung via clients.user_id
  app.get('/api/v1/projects', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const currentUser = request.currentUser!

    let q = request.db!
      .from('projects')
      .select(`
        id, name, description, location, contract_model, tax_scheme,
        contract_value, commission_pct, retention_pct, retention_amount,
        penalty_enabled, penalty_basis, penalty_rate_per_day, penalty_cap_pct, penalty_grace_days,
        start_date, end_date, actual_end_date, status, progress_pct, notes,
        created_at, updated_at,
        clients ( id, contact_person, phone, client_type, user_id ),
        pm:users!projects_pm_id_fkey ( id, name, email, phone )
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    // Client hanya lihat proyek mereka sendiri
    if (currentUser.role === 'client') {
      const { data: clientRecord } = await request.db!
        .from('clients')
        .select('id')
        .eq('user_id', currentUser.id)
        .single()

      if (!clientRecord) return { total: 0, projects: [] }
      q = q.eq('client_id', clientRecord.id)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return { total: data.length, projects: data }
  })

  // GET /api/v1/projects/:id — full project detail
  app.get('/api/v1/projects/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const [projectRes, logsRes, invoicesRes, scopelessKasbonsRes] = await Promise.all([
      request.db!
        .from('projects')
        // `lintang`/`bujur`/`radius_lokasi_m` — titik acuan lokasi (migrasi
        // 190). Tanpa ketiganya koordinat foto tak punya pembanding: "300 m
        // dari lokasi" mustahil dihitung, dan itu justru angka yang menentukan
        // apakah foto ini bukti atau bukan.
        //
        // Komentar ditaruh DI SINI, bukan di dalam template `.select()`:
        // isinya string yang dikirim apa adanya ke PostgREST, jadi `--` di
        // dalamnya menjadi bagian daftar kolom dan seluruh query gagal.
        .select(`
          id, name, description, location, contract_model, tax_scheme,
          contract_value, commission_pct, retention_pct, retention_amount,
          penalty_enabled, penalty_basis, penalty_rate_per_day, penalty_cap_pct, penalty_grace_days,
          start_date, end_date, actual_end_date,
          status, progress_pct, notes, created_at, updated_at,
          pm_id, client_id,
          lintang, bujur, radius_lokasi_m,
          clients ( id, contact_person, phone, email, address, client_type ),
          pm:users!projects_pm_id_fkey ( id, name, email, phone ),
          termin_schedules (
            id, termin_number, label, amount, pct_of_contract,
            target_date, status, notes,
            trigger_type, trigger_pct, due_days
          ),
          milestones (
            id, title, description, target_date, completed_at,
            status, sort_order
          ),
          mandor_assignments (
            id, notes, status, assigned_at,
            mandor:users!mandor_assignments_mandor_id_fkey ( id, name, phone ),
            work_scopes (
              id, scope_name, description, payment_system, borongan_value,
              progress_pct_done, status, start_date, end_date,
              kasbons ( id, amount, fund_source, purpose, kasbon_date, status, notes ),
              borongan_settlements ( id, borongan_value, total_kasbon, remaining_balance, settled_at )
            )
          )
        `)
        .eq('id', id)
        .eq('is_deleted', false)
        .single(),

      supabase
        .from('progress_logs')
        .select(`
          id, mode, pct_overall, weather, worker_count, notes, logged_at,
          reporter:users!progress_logs_reported_by_fkey ( id, name )
        `)
        .eq('project_id', id)
        .eq('mode', 'daily')
        .not('pct_overall', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(20),

      supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_type, base_amount, commission_amount,
          tax_amount, total_amount, amount_paid, amount_due,
          issued_date, due_date, paid_date, status, notes
        `)
        .eq('project_id', id)
        .order('issued_date', { ascending: false }),

      // Kasbon tanpa scope (project_id langsung, work_scope_id null)
      request.db!
        .from('kasbons')
        .select('id, amount, fund_source, purpose, kasbon_date, status, notes, requested_by')
        .eq('project_id', id)
        .is('work_scope_id', null)
        .order('kasbon_date', { ascending: false }),
    ])

    if (projectRes.error || !projectRes.data) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const project = projectRes.data as typeof projectRes.data & { pm_id: string; client_id: string }

    // Ownership check — admin bebas; PM hanya proyeknya; mandor harus assigned ke proyek ini; client hanya proyeknya
    if (currentUser.role === 'pm' && project.pm_id !== currentUser.id) {
      return reply.status(403).send({ error: 'Akses ditolak' })
    }
    if (currentUser.role === 'mandor') {
      const assigned = (project.mandor_assignments as unknown as Array<{ mandor: { id: string } | null }> | null)
        ?.some(a => a.mandor?.id === currentUser.id) ?? false
      if (!assigned) return reply.status(403).send({ error: 'Akses ditolak' })
    }
    if (currentUser.role === 'client') {
      // Cek client_id cocok dengan user ini — perlu join ke clients table via auth_id
      const { data: clientRow } = await request.db!
        .from('clients')
        .select('id')
        .eq('auth_id', currentUser.auth_id)
        .single()
      if (!clientRow || project.client_id !== clientRow.id) {
        return reply.status(403).send({ error: 'Akses ditolak' })
      }
    }

    return {
      project: {
        ...project,
        progress_logs: logsRes.data ?? [],
        invoices: invoicesRes.data ?? [],
        scopeless_kasbons: scopelessKasbonsRes.data ?? [],
      }
    }
  })

  // POST /api/v1/projects — create new project (admin or pm)
  app.post('/api/v1/projects', {
    preHandler: [authenticate, requirePermission('projects:create')]
  }, async (request, reply) => {
    const body = request.body as {
      name: string
      location: string
      client_id: string
      pm_id: string
      description?: string
      contract_model: 'termin' | 'komisi'
      contract_value: number
      tax_scheme: 'pph_final' | 'ppn'
      commission_pct?: number
      retention_pct?: number
      start_date: string
      end_date: string
      termin_schedules?: Array<{
        label: string
        pct_of_contract: number
        target_date?: string
        trigger_type?: 'on_sign' | 'on_progress' | 'on_retention'
        trigger_pct?: number | null
        due_days?: number | null
      }>
    }

    const { name, location, client_id, pm_id, description, contract_model,
            contract_value, tax_scheme, commission_pct, retention_pct,
            start_date, end_date, termin_schedules } = body

    if (!name || !location || !client_id || !contract_model || !contract_value || !start_date || !end_date) {
      return reply.status(400).send({ error: 'Field wajib: name, location, client_id, contract_model, contract_value, start_date, end_date' })
    }

    if (!pm_id) {
      return reply.status(400).send({ error: 'Project Manager wajib dipilih' })
    }

    const VALID_CONTRACT_MODELS = ['termin', 'komisi']
    const VALID_TAX_SCHEMES = ['pph_final', 'ppn']
    if (!VALID_CONTRACT_MODELS.includes(contract_model)) {
      return reply.status(400).send({ error: `contract_model tidak valid. Pilih: ${VALID_CONTRACT_MODELS.join(', ')}` })
    }
    if (tax_scheme && !VALID_TAX_SCHEMES.includes(tax_scheme)) {
      return reply.status(400).send({ error: `tax_scheme tidak valid. Pilih: ${VALID_TAX_SCHEMES.join(', ')}` })
    }

    // Default retensi dari config effective-dated (Q1) bila tak di-override per proyek.
    // financial_config simpan fraksi (0.05); kolom projects.retention_pct = persen (×100).
    // Fallback aman ke 5 bila config hilang (getEffectiveFinancialValue sudah berisik).
    let retPct = retention_pct
    if (retPct === undefined || retPct === null) {
      const frac = Number(await getEffectiveFinancialValue('retention.default_pct', todayWIB()))
      retPct = Number.isFinite(frac) ? Math.round(frac * 100 * 100) / 100 : 5
    }
    const retAmount = Number(contract_value) * (retPct / 100)
    const createdBy = request.currentUser!.id

    const { data: project, error: projError } = await request.db!
      .from('projects')
      .insert({
        name,
        location,
        client_id,
        pm_id,
        description: description || null,
        contract_model,
        contract_value: Number(contract_value),
        tax_scheme,
        commission_pct: commission_pct ? Number(commission_pct) : null,
        retention_pct: retPct,
        retention_amount: retAmount,
        // Override denda per proyek (null = pakai global effective — syarat founder #2).
        penalty_enabled:      (body as Record<string, unknown>).penalty_enabled ?? null,
        penalty_basis:        (body as Record<string, unknown>).penalty_basis ?? null,
        penalty_rate_per_day: (body as Record<string, unknown>).penalty_rate_per_day ?? null,
        penalty_cap_pct:      (body as Record<string, unknown>).penalty_cap_pct ?? null,
        penalty_grace_days:   (body as Record<string, unknown>).penalty_grace_days ?? null,
        start_date,
        end_date,
        status: 'draft',
        progress_pct: 0,
        created_by: createdBy,
      })
      .select('id, name, status, created_at')
      .single()

    if (projError) {
      app.log.error({ projError }, 'Failed to create project')
      return reply.status(500).send({ error: projError.message })
    }

    // Create termin_schedules if contract_model is termin
    if (contract_model === 'termin' && termin_schedules && termin_schedules.length > 0) {
      const rows = termin_schedules.map((t, i) => ({
        project_id: project.id,
        termin_number: i + 1,
        label: t.label,
        pct_of_contract: Number(t.pct_of_contract),
        amount: Number(contract_value) * (Number(t.pct_of_contract) / 100),
        target_date: t.target_date || null,
        trigger_type: t.trigger_type ?? 'on_progress',
        trigger_pct: t.trigger_pct ?? null,
        due_days: t.due_days ?? null,
        status: 'pending',
      }))
      const { error: terminError } = await supabase.from('termin_schedules').insert(rows)
      if (terminError) {
        // Project was created — log but don't fail the whole request
        app.log.error({ terminError }, 'Failed to create termin_schedules')
      }
    }

    // Clone global expense_category_templates to project_expense_categories.
    //
    // ⚠️ `description` DIBUANG 2026-08-01: kolom itu tak ada di tabelnya, jadi
    // query ini SELALU gagal dan kategori pengeluaran tak pernah ter-clone ke
    // proyek baru — padahal `cash.ts` mengandalkan auto-clone itu. Ia juga tak
    // pernah dipakai di bawah. Diverifikasi ke information_schema.
    // Dampaknya terbukti di data nyata: `project_expense_categories` berisi
    // **NOL baris** — auto-clone tak pernah sekali pun berhasil sejak baris ini
    // ditulis, dan tak ada gejala apa pun karena errornya tertelan.
    const { data: templates, error: eTpl } = await request.db!
      .from('expense_category_templates')
      .select('id, name, type, parent_id, sort_order')
    if (eTpl) {
      request.log.error({ err: eTpl, projectId: project.id },
        'gagal memuat template kategori — proyek baru lahir tanpa kategori pengeluaran')
    }

    if (templates && templates.length > 0) {
      // `description` DIBUANG dari sini juga — kolom itu tak ada di tabel
      // TUJUAN maupun tabel SUMBER. Kalau query di atas kebetulan berhasil,
      // INSERT ini akan gagal berikutnya, dan cacatnya cuma berpindah tempat.
      const cats = templates.map(t => ({
        project_id: project.id,
        template_id: t.id,
        name: t.name,
        type: t.type,
        parent_id: t.parent_id,
        sort_order: t.sort_order,
      }))
      const { error: eIns } = await supabase.from('project_expense_categories').insert(cats)
      if (eIns) {
        request.log.error({ err: eIns, projectId: project.id },
          'gagal meng-clone kategori pengeluaran ke proyek baru')
      }
    }

    // ── Fire-and-forget: notif ke PM yang di-assign ──────────────────────────
    if (pm_id && project) {
      createNotification({
        company_id: request.companyId!,
        user_id:     pm_id,
        title:       'Anda Di-assign Sebagai PM',
        message:     `Anda ditugaskan sebagai Project Manager di proyek "${project.name}"`,
        type:        'project_assigned',
        priority:    'high',
        project_id:  project.id,
        action_url:  `/proyek/${project.id}`,
        action_type: 'view_project',
        action_data: { record_id: project.id, project_id: project.id },
      })
    }

    return reply.status(201).send({ project })
  })

  // PUT /api/v1/projects/:id — update project fields (admin or pm)
  app.put('/api/v1/projects/:id', {
    preHandler: [authenticate, requirePermission('projects:edit')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>

    // Only allow safe, explicitly listed fields
    const allowed = [
      'name', 'location', 'description', 'client_id', 'pm_id',
      'contract_model', 'contract_value', 'tax_scheme',
      'commission_pct', 'retention_pct', 'retention_amount',
      'start_date', 'end_date', 'actual_end_date',
      'status', 'progress_pct', 'notes',
      // Override denda per proyek (syarat kontrak — null = pakai global effective).
      'penalty_enabled', 'penalty_basis', 'penalty_rate_per_day', 'penalty_cap_pct', 'penalty_grace_days',
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'Tidak ada field yang diupdate' })
    }

    const { data: existing } = await request.db!
      .from('projects').select('id, is_deleted').eq('id', id).single()
    if (!existing) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    if (existing.is_deleted) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    updates.updated_at = new Date().toISOString()

    const { data, error } = await request.db!
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select('id, name, status, updated_at')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return { project: data }
  })

  // PATCH /api/v1/projects/:id/status — update status only (admin)
  app.patch('/api/v1/projects/:id/status', {
    preHandler: [authenticate, requirePermission('projects:status')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }

    const valid = ['draft', 'active', 'on_hold', 'completed', 'cancelled']
    if (!status || !valid.includes(status)) {
      return reply.status(400).send({ error: `Status harus salah satu dari: ${valid.join(', ')}` })
    }

    const { data: existing } = await request.db!
      .from('projects').select('id, is_deleted, status').eq('id', id).single()
    if (!existing) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    if (existing.is_deleted) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'completed') updates.actual_end_date = new Date().toISOString().split('T')[0]

    const { data, error } = await request.db!
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select('id, name, status')
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    // Audit: perubahan status proyek
    if (data) {
      void logAuditEvent(request, {
        tableName: 'projects',
        recordId: id,
        action: 'project.status',
        actorId: request.currentUser!.id,
        oldValues: { status: existing.status },
        newValues: { status },
        severity: 'warning',
      })
    }

    // ── Fire-and-forget: notif ke admin + PM saat status berubah ─────────────
    if (data) {
      try {
        const recipients = await resolveRecipients('project_status_changed', { projectId: id, companyId: request.companyId! })
        createNotifications(recipients.map(uid => ({
          company_id: request.companyId!,
          user_id:     uid,
          title:       'Status Proyek Berubah',
          message:     `Status proyek "${data.name}" berubah ke ${status}`,
          type:        'project_status_changed' as const,
          priority:    'normal' as const,
          project_id:  id,
          action_url:  `/proyek/${id}`,
          action_type: 'view_project',
          action_data: { record_id: id, project_id: id, new_status: status },
        })))
      } catch (err) {
        // best-effort: notifikasi tak boleh membatalkan tindakan yang sudah sah.
        // Tapi TIDAK ditelan — rantai notifikasi pernah putus berbulan-bulan
        // tanpa satu pun gejala (Web Push, 2026-08-01), dan `catch {}` adalah
        // persis tempat gejala itu seharusnya muncul.
        request.log.error({ err }, 'notifikasi gagal dikirim')
      }
    }

    return { project: data }
  })

  // DELETE /api/v1/projects/:id — SOFT DELETE only (admin only)
  // Proyek tidak pernah benar-benar dihapus dari DB.
  // Data keuangan (invoice, kasbon, expense) tetap ada dan terlindungi oleh FK RESTRICT.
  app.delete('/api/v1/projects/:id', {
    preHandler: [authenticate, requirePermission('projects:delete')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Cek proyek ada dan belum dihapus
    const { data: existing } = await request.db!
      .from('projects')
      .select('id, name, is_deleted')
      .eq('id', id)
      .single()

    if (!existing) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    if (existing.is_deleted) return reply.status(409).send({ error: 'Proyek sudah dihapus sebelumnya' })

    const { error } = await request.db!
      .from('projects')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: request.currentUser!.id,
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ success: true, message: `Proyek "${existing.name}" berhasil dihapus (soft-delete)` })
  })
}
