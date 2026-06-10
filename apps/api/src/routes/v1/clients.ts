import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

export default async function clientRoutes(app: FastifyInstance) {

  // GET /api/v1/clients — list all clients
  app.get('/api/v1/clients', {
    preHandler: [authenticate]
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, company_name, contact_person, phone, email, client_type, address')
      .order('contact_person', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })
    return { clients: data }
  })
}
