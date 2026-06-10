import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requireRole } from '../../plugins/auth.js'

export default async function projectRoutes(app: FastifyInstance) {

  // GET /api/v1/projects — list all projects
  app.get('/api/v1/projects', {
    preHandler: [authenticate]
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, name, description, location, contract_model, tax_scheme,
        contract_value, commission_pct, retention_pct, retention_amount,
        start_date, end_date, actual_end_date, status, progress_pct, notes,
        created_at, updated_at,
        clients ( id, contact_person, phone, client_type ),
        pm:users!projects_pm_id_fkey ( id, name, email, phone )
      `)
      .order('created_at', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })
    return { total: data.length, projects: data }
  })

  // GET /api/v1/projects/:id — full project detail
  app.get('/api/v1/projects/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [projectRes, logsRes, invoicesRes] = await Promise.all([
      supabase
        .from('projects')
        .select(`
          id, name, description, location, contract_model, tax_scheme,
          contract_value, commission_pct, retention_pct, retention_amount,
          kasbon_limit_pct, start_date, end_date, actual_end_date,
          status, progress_pct, notes, created_at, updated_at,
          clients ( id, contact_person, phone, email, address, client_type ),
          pm:users!projects_pm_id_fkey ( id, name, email, phone ),
          termin_schedules (
            id, termin_number, label, amount, pct_of_contract,
            target_date, status, notes
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
              kasbon_limit_pct, progress_pct_done, status, start_date, end_date,
              kasbons ( id, amount, fund_source, purpose, kasbon_date, status, notes ),
              borongan_settlements ( id, borongan_value, total_kasbon, remaining_balance, settled_at )
            )
          )
        `)
        .eq('id', id)
        .single(),

      supabase
        .from('progress_logs')
        .select(`
          id, pct_overall, weather, worker_count, notes, logged_at,
          reporter:users!progress_logs_reported_by_fkey ( id, name )
        `)
        .eq('project_id', id)
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
    ])

    if (projectRes.error) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    return {
      project: {
        ...projectRes.data,
        progress_logs: logsRes.data ?? [],
        invoices: invoicesRes.data ?? [],
      }
    }
  })

  // POST /api/v1/projects — create new project (admin or pm)
  app.post('/api/v1/projects', {
    preHandler: [authenticate, requireRole('admin', 'pm')]
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

    const retPct = retention_pct ?? 5
    const retAmount = Number(contract_value) * (retPct / 100)
    const createdBy = request.currentUser!.id

    const { data: project, error: projError } = await supabase
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
        status: 'pending',
      }))
      const { error: terminError } = await supabase.from('termin_schedules').insert(rows)
      if (terminError) {
        // Project was created — log but don't fail the whole request
        app.log.error({ terminError }, 'Failed to create termin_schedules')
      }
    }

    // Clone global expense_category_templates to project_expense_categories
    const { data: templates } = await supabase
      .from('expense_category_templates')
      .select('id, name, description')

    if (templates && templates.length > 0) {
      const cats = templates.map(t => ({
        project_id: project.id,
        template_id: t.id,
        name: t.name,
        description: t.description,
      }))
      await supabase.from('project_expense_categories').insert(cats)
    }

    return reply.status(201).send({ project })
  })

  // PUT /api/v1/projects/:id — update project fields (admin or pm)
  app.put('/api/v1/projects/:id', {
    preHandler: [authenticate, requireRole('admin', 'pm')]
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
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'Tidak ada field yang diupdate' })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
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
    preHandler: [authenticate, requireRole('admin')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }

    const valid = ['draft', 'active', 'on_hold', 'completed', 'cancelled']
    if (!status || !valid.includes(status)) {
      return reply.status(400).send({ error: `Status harus salah satu dari: ${valid.join(', ')}` })
    }

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'completed') updates.actual_end_date = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select('id, name, status')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return { project: data }
  })
}
