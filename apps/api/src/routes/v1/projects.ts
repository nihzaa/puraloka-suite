import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

export default async function projectRoutes(app: FastifyInstance) {

  // GET /api/v1/projects — list all projects
  app.get('/api/v1/projects', {
    preHandler: [authenticate]
  }, async (request, reply) => {
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

    if (error) {
      return reply.status(500).send({ error: error.message })
    }

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

    if (projectRes.error) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    return {
      project: {
        ...projectRes.data,
        progress_logs: logsRes.data ?? [],
        invoices: invoicesRes.data ?? [],
      }
    }
  })
}
