import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'

export default async function projectRoutes(app: FastifyInstance) {

  // GET /api/v1/projects — ambil semua proyek
  app.get('/api/v1/projects', async (request, reply) => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients ( id, contact_person, phone, client_type ),
        pm:users!projects_pm_id_fkey ( id, name, email, phone )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return reply.status(500).send({ error: error.message })
    }

    return { total: data.length, projects: data }
  })

  // GET /api/v1/projects/:id — ambil detail satu proyek
  app.get('/api/v1/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients ( id, contact_person, phone, email, address, client_type ),
        pm:users!projects_pm_id_fkey ( id, name, email, phone ),
        termin_schedules ( * ),
        milestones ( * ),
        mandor_assignments (
          *,
          mandor:users!mandor_assignments_mandor_id_fkey ( id, name, phone ),
          work_scopes (
            *,
            kasbons ( * ),
            daily_wage_logs ( * ),
            progress_payments ( * ),
            borongan_settlements ( * )
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    return { project: data }
  })
}