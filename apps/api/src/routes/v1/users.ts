import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

export default async function userRoutes(app: FastifyInstance) {

  // GET /api/v1/users?role=pm — list users, optionally filtered by role
  app.get('/api/v1/users', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { role } = request.query as { role?: string }

    let query = supabase
      .from('users')
      .select('id, name, email, phone, role')
      .order('name', { ascending: true })

    if (role) {
      query = query.eq('role', role)
    }

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return { users: data }
  })
}
