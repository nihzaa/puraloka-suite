import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'

const CLIENT_SELECT = `
  id, company_name, contact_person, phone, email, address,
  npwp, id_number, client_type, notes, is_active, created_at, updated_at
`

export default async function clientRoutes(app: FastifyInstance) {

  // GET /api/v1/clients — list klien
  // ?all=true → termasuk nonaktif (admin only)
  app.get('/api/v1/clients', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { all, search } = request.query as { all?: string; search?: string }

    let q = supabase
      .from('clients')
      .select(CLIENT_SELECT)
      .order('contact_person', { ascending: true })

    if (all === 'true' && user.role === 'admin') {
      // admin bisa lihat semua termasuk nonaktif
    } else {
      q = q.eq('is_active', true)
    }

    if (search?.trim()) {
      q = q.or(`contact_person.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ clients: data ?? [] })
  })

  // GET /api/v1/clients/:id — detail klien + ringkasan proyek + invoice summary
  app.get('/api/v1/clients/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [clientRes, projectsRes] = await Promise.all([
      supabase.from('clients').select(CLIENT_SELECT).eq('id', id).single(),
      supabase
        .from('projects')
        .select('id, name, status, contract_value, start_date, end_date, progress_pct')
        .eq('client_id', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
    ])

    if (clientRes.error || !clientRes.data) {
      return reply.status(404).send({ error: 'Klien tidak ditemukan' })
    }

    const projects = projectsRes.data ?? []
    const totalContractValue = projects.reduce((sum, p) => sum + Number(p.contract_value ?? 0), 0)
    const projectIds = projects.map(p => p.id)

    // Invoice summary untuk semua proyek klien ini
    let invoiceSummary = { total: 0, outstanding: 0, overdue: 0, paid: 0 }
    if (projectIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('total_amount, amount_due, status, due_date')
        .in('project_id', projectIds)

      const today = new Date().toISOString().split('T')[0]
      for (const inv of invoices ?? []) {
        invoiceSummary.total += Number(inv.total_amount ?? 0)
        if (inv.status === 'paid') {
          invoiceSummary.paid += Number(inv.total_amount ?? 0)
        } else {
          invoiceSummary.outstanding += Number(inv.amount_due ?? 0)
          if (inv.due_date && inv.due_date < today) {
            invoiceSummary.overdue += Number(inv.amount_due ?? 0)
          }
        }
      }
    }

    return reply.send({
      client: clientRes.data,
      projects,
      summary: {
        total_projects: projects.length,
        total_contract_value: totalContractValue,
        invoice_total: invoiceSummary.total,
        invoice_outstanding: invoiceSummary.outstanding,
        invoice_overdue: invoiceSummary.overdue,
        invoice_paid: invoiceSummary.paid,
      },
    })
  })

  // POST /api/v1/clients — buat klien baru (admin & pm)
  app.post('/api/v1/clients', {
    preHandler: [authenticate, requirePermission('clients:manage')]
  }, async (request, reply) => {
    const user = request.currentUser!
    const body = request.body as {
      contact_person: string
      phone: string
      company_name?: string
      email?: string
      address?: string
      npwp?: string
      id_number?: string
      client_type?: 'perorangan' | 'perusahaan'
      notes?: string
    }

    if (!body.contact_person?.trim()) return reply.status(400).send({ error: 'Nama kontak wajib diisi' })
    if (!body.phone?.trim()) return reply.status(400).send({ error: 'Nomor telepon wajib diisi' })

    const { data, error } = await supabase
      .from('clients')
      .insert({
        contact_person: body.contact_person.trim(),
        phone: body.phone.trim(),
        company_name: body.company_name?.trim() ?? null,
        email: body.email?.trim() ?? null,
        address: body.address?.trim() ?? null,
        npwp: body.npwp?.trim() ?? null,
        id_number: body.id_number?.trim() ?? null,
        client_type: body.client_type ?? 'perorangan',
        notes: body.notes?.trim() ?? null,
        created_by: user.id,
      })
      .select(CLIENT_SELECT)
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ client: data })
  })

  // PATCH /api/v1/clients/:id — update klien (admin & pm)
  app.patch('/api/v1/clients/:id', {
    preHandler: [authenticate, requirePermission('clients:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      contact_person?: string
      phone?: string
      company_name?: string | null
      email?: string | null
      address?: string | null
      npwp?: string | null
      id_number?: string | null
      client_type?: 'perorangan' | 'perusahaan'
      notes?: string | null
    }

    if (body.contact_person !== undefined && !body.contact_person.trim()) {
      return reply.status(400).send({ error: 'Nama kontak tidak boleh kosong' })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.contact_person !== undefined) update.contact_person = body.contact_person.trim()
    if (body.phone !== undefined) update.phone = body.phone.trim()
    if (body.company_name !== undefined) update.company_name = body.company_name?.trim() ?? null
    if (body.email !== undefined) update.email = body.email?.trim() ?? null
    if (body.address !== undefined) update.address = body.address?.trim() ?? null
    if (body.npwp !== undefined) update.npwp = body.npwp?.trim() ?? null
    if (body.id_number !== undefined) update.id_number = body.id_number?.trim() ?? null
    if (body.client_type !== undefined) update.client_type = body.client_type
    if (body.notes !== undefined) update.notes = body.notes?.trim() ?? null

    const { data, error } = await supabase
      .from('clients')
      .update(update)
      .eq('id', id)
      .select(CLIENT_SELECT)
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Klien tidak ditemukan' })
    return reply.send({ client: data })
  })

  // PATCH /api/v1/clients/:id/toggle-active — aktifkan / nonaktifkan klien (admin only)
  app.patch('/api/v1/clients/:id/toggle-active', {
    preHandler: [authenticate, requirePermission('clients:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data: existing } = await supabase.from('clients').select('is_active').eq('id', id).single()
    if (!existing) return reply.status(404).send({ error: 'Klien tidak ditemukan' })

    const { data, error } = await supabase
      .from('clients')
      .update({ is_active: !existing.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(CLIENT_SELECT)
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ client: data })
  })
}
