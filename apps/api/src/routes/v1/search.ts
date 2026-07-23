import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../plugins/auth.js'
import { supabase } from '../../utils/supabase.js'

export default async function searchRoutes(app: FastifyInstance) {

  // GET /api/v1/search?q=&limit=
  // Role-aware: mandor hanya lihat scope & kasbon miliknya; client tidak bisa search
  app.get('/api/v1/search', { preHandler: [authenticate] }, async (request, reply) => {
    const { q, limit = '8' } = request.query as Record<string, string>
    const user = request.currentUser!

    if (!q || q.trim().length < 2) {
      return reply.send({ results: [] })
    }

    const term = q.trim()
    const cap = Math.min(20, Math.max(1, parseInt(limit)))

    // Client tidak dapat search (portal berbeda)
    if (user.role === 'client') return reply.send({ results: [] })

    type SearchResult = {
      type: string
      id: string
      title: string
      sub: string
      url: string
      meta?: string
    }

    const results: SearchResult[] = []

    const ilike = `%${term}%`

    // ── Projects ─────────────────────────────────────────────────────
    if (user.role !== 'mandor') {
      let pq = supabase
        .from('projects')
        .select('id, name, location, status, progress_pct, clients:clients!projects_client_id_fkey(name)')
        .ilike('name', ilike)
        .eq('is_deleted', false)
        .limit(cap)

      if (user.role === 'pm') pq = pq.eq('pm_id', user.id)

      const { data } = await pq
      for (const p of data ?? []) {
        results.push({
          type: 'project',
          id: p.id,
          title: p.name,
          sub: `${p.location} · ${(p.clients as any)?.name ?? '—'}`,
          url: `/proyek/${p.id}`,
          meta: `${Number(p.progress_pct).toFixed(0)}% · ${p.status}`,
        })
      }
    }

    // ── Clients ───────────────────────────────────────────────────────
    if (user.role === 'admin' || user.role === 'pm') {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, email')
        .or(`name.ilike.${ilike},phone.ilike.${ilike},email.ilike.${ilike}`)
        .limit(cap)

      for (const c of data ?? []) {
        results.push({
          type: 'client',
          id: c.id,
          title: c.name,
          sub: [c.phone, c.email].filter(Boolean).join(' · '),
          url: `/klien`,
          meta: 'Klien',
        })
      }
    }

    // ── Invoices ──────────────────────────────────────────────────────
    if (user.role === 'admin' || user.role === 'pm') {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, status, project:projects!invoices_project_id_fkey(id, name)')
        .ilike('invoice_number', ilike)
        .limit(cap)

      for (const inv of data ?? []) {
        results.push({
          type: 'invoice',
          id: inv.id,
          title: `Invoice ${inv.invoice_number}`,
          sub: (inv.project as any)?.name ?? '—',
          url: `/keuangan`,
          meta: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(inv.total_amount)),
        })
      }
    }

    // ── Kasbons ───────────────────────────────────────────────────────
    {
      let kq = supabase
        .from('kasbons')
        .select('id, amount, purpose, status, kasbon_date, project:projects!kasbons_project_id_fkey(id, name), mandor:users!kasbons_requested_by_fkey(name)')
        .or(`purpose.ilike.${ilike}`)
        .limit(cap)

      if (user.role === 'mandor') kq = kq.eq('requested_by', user.id)

      const { data } = await kq
      for (const k of data ?? []) {
        results.push({
          type: 'kasbon',
          id: k.id,
          title: `Kasbon ${(k.mandor as any)?.name ?? '—'} — ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(k.amount))}`,
          sub: (k.project as any)?.name ?? '—',
          url: user.role === 'mandor' ? `/mandor-portal/kasbon` : `/mandor`,
          meta: k.status,
        })
      }
    }

    // ── Users ─────────────────────────────────────────────────────────
    if (user.role === 'admin') {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, role_id, roles:role_id ( name ), is_active')
        .or(`name.ilike.${ilike},email.ilike.${ilike}`)
        .limit(cap)

      for (const u of data ?? []) {
        const embed = u.roles as { name: string } | { name: string }[] | null | undefined
        const roleName = (Array.isArray(embed) ? embed[0] : embed)?.name ?? '-'
        results.push({
          type: 'user',
          id: u.id,
          title: u.name,
          sub: `${u.email} · ${roleName}`,
          url: `/users`,
          meta: u.is_active ? 'Aktif' : 'Nonaktif',
        })
      }
    }

    // ── Milestones ────────────────────────────────────────────────────
    if (user.role !== 'mandor') {
      const mq = supabase
        .from('milestones')
        .select('id, title, status, target_date, project:projects!milestones_project_id_fkey(id, name, pm_id, is_deleted)')
        .ilike('title', ilike)
        .limit(cap)

      const { data } = await mq
      for (const m of (data ?? []) as any[]) {
        if (m.project?.is_deleted) continue
        if (user.role === 'pm' && m.project?.pm_id !== user.id) continue
        results.push({
          type: 'milestone',
          id: m.id,
          title: m.title,
          sub: m.project?.name ?? '—',
          url: `/proyek/${m.project?.id}#sec-milestone`,
          meta: m.status,
        })
      }
    }

    // Deduplicate & sort by type priority
    const priority: Record<string, number> = { project: 0, client: 1, invoice: 2, kasbon: 3, milestone: 4, user: 5 }
    results.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9))

    return reply.send({ results: results.slice(0, 20) })
  })
}
