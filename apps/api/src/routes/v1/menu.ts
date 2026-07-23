import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

// Menu Registry (Sub-Fase 1B.2). Struktur menu sidebar dari DB.
// PENTING: TIDAK memfilter berdasarkan permission di server — visibility tetap
// dievaluasi di client (perms.has() match-ANY), konsisten desain sidebar existing.
// Server hanya mengirim STRUKTUR + required_permissions; client memutuskan tampil/tidak.

interface MenuRow {
  id: string
  key: string
  label: string
  href: string | null
  icon: string
  parent_id: string | null
  required_permissions: string[]
  sort_order: number
  section: string
}

interface MenuNode extends MenuRow {
  children: MenuNode[]
}

export default async function menuRoutes(app: FastifyInstance) {
  // ── GET /api/v1/menu ──────────────────────────────────────────────────────
  // Return menu tree (parent + children via parent_id). Read: authenticated.
  app.get('/api/v1/menu', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, key, label, href, icon, parent_id, required_permissions, sort_order, section')
      .eq('is_active', true)
      .order('section', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('key', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })

    const rows = (data ?? []) as MenuRow[]
    const byId = new Map<string, MenuNode>()
    for (const r of rows) byId.set(r.id, { ...r, children: [] })

    const roots: MenuNode[] = []
    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) {
        byId.get(node.parent_id)!.children.push(node)
      } else {
        roots.push(node)
      }
    }

    // Sudah terurut dari query; children mengikuti urutan insert (sort_order asc).
    const sortChildren = (n: MenuNode) => {
      n.children.sort((a, b) => a.sort_order - b.sort_order)
      n.children.forEach(sortChildren)
    }
    roots.sort((a, b) => a.sort_order - b.sort_order)
    roots.forEach(sortChildren)

    return reply.send({ menu: roots })
  })
}
