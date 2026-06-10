import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requireRole } from '../../plugins/auth.js'

export default async function kasbonRoutes(app: FastifyInstance) {
  app.patch('/api/v1/kasbons/:id/status', {
    preHandler: [authenticate, requireRole('admin', 'pm')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }

    if (!['approved', 'rejected'].includes(status)) {
      return reply.status(400).send({ error: 'Status harus approved atau rejected' })
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'approved') {
      updateData.approved_by = request.currentUser!.id
      updateData.approved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('kasbons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    return {
      message: status === 'approved' ? 'Kasbon disetujui' : 'Kasbon ditolak',
      kasbon: data,
    }
  })
}
