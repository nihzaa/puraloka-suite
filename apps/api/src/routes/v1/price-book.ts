import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'

// CECEP — Price Book management (M3): jalur masuk HARGA NYATA ke sistem.
//
// Lifecycle DB-guarded (104, maju saja): draft → verified → active → expired.
// Hanya entry ACTIVE yang dipakai resolusi harga (lib/price-resolver.ts).
// Verified WAJIB jejak (verified_by/at — constraint price_book_verified_trace).
// Field inti entry non-draft dikunci guard; API ini tak pernah mengedit angka
// entry non-draft — koreksi harga = entry BARU (versi berikutnya).

export default async function priceBookRoutes(app: FastifyInstance) {

  // ── GET /cecep/price-book — daftar harga (filter resource/status/lokasi) ────
  app.get<{ Querystring: { resource?: string; status?: string; location?: string; limit?: string } }>(
    '/api/v1/cecep/price-book',
    { preHandler: [authenticate, requirePermission('cecep:price:view')] },
    async (request, reply) => {
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100)) // cap 200
      let q = request.db!
        .from('price_book_entries')
        .select(`id, amount, currency, version_number, effective_date, expired_date,
                 location, supplier, confidence_level, status, verified_at, created_at,
                 resource:resources(id, code, name, category, unit_code)`)
        .order('effective_date', { ascending: false })
        .limit(limit)
      if (request.query.status) q = q.eq('status', request.query.status)
      if (request.query.location) q = q.eq('location', request.query.location)
      if (request.query.resource) {
        const { data: r } = await request.db!
          .from('resources').select('id').eq('code', request.query.resource).maybeSingle()
        if (!r) return reply.status(404).send({ error: `Resource ${request.query.resource} tidak ditemukan` })
        q = q.eq('resource_id', r.id)
      }
      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── POST /cecep/price-book — entry baru (selalu lahir DRAFT) ────────────────
  app.post<{ Body: { resource_code?: string; resource_id?: string; amount?: number
                     effective_date?: string; expired_date?: string | null
                     location?: string | null; supplier?: string | null
                     confidence_level?: 'high' | 'medium' | 'low' | null } }>(
    '/api/v1/cecep/price-book',
    { preHandler: [authenticate, requirePermission('cecep:price:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (typeof b.amount !== 'number' || b.amount < 0) {
        return reply.status(400).send({ error: 'amount wajib angka >= 0' })
      }
      if (!b.effective_date) return reply.status(400).send({ error: 'effective_date wajib (harga = wilayah+tanggal)' })

      let resourceId = b.resource_id ?? null
      if (!resourceId && b.resource_code) {
        const { data: r } = await request.db!
          .from('resources').select('id').eq('code', b.resource_code).maybeSingle()
        if (!r) return reply.status(404).send({ error: `Resource ${b.resource_code} tidak ditemukan` })
        resourceId = r.id
      }
      if (!resourceId) return reply.status(400).send({ error: 'resource_id atau resource_code wajib' })

      // version_number = lanjutan tertinggi utk (resource, location) — jejak revisi harga
      const { data: prev } = await request.db!
        .from('price_book_entries').select('version_number')
        .eq('resource_id', resourceId)
        .order('version_number', { ascending: false }).limit(1)
      const version = ((prev?.[0]?.version_number as number | undefined) ?? 0) + 1

      const { data: row, error } = await request.db!
        .from('price_book_entries')
        .insert({
          resource_id: resourceId, amount: b.amount, effective_date: b.effective_date,
          expired_date: b.expired_date ?? null, location: b.location ?? null,
          supplier: b.supplier ?? null, confidence_level: b.confidence_level ?? null,
          version_number: version, status: 'draft', created_by: request.currentUser!.id,
        })
        .select('id, version_number').single()
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'price_book_entries', recordId: row.id, action: 'pricebook.created',
        actorId: request.currentUser!.id,
        newValues: { resource_id: resourceId, amount: b.amount, effective_date: b.effective_date,
                     location: b.location ?? null, version },
      })
      return reply.status(201).send({ id: row.id, version_number: row.version_number, status: 'draft' })
    })

  // ── PATCH /cecep/price-book/:id/status — transisi lifecycle (guard DB) ──────
  app.patch<{ Params: { id: string }; Body: { status?: 'verified' | 'active' | 'expired' } }>(
    '/api/v1/cecep/price-book/:id/status',
    { preHandler: [authenticate, requirePermission('cecep:price:manage')] },
    async (request, reply) => {
      const target = request.body?.status
      if (!target || !['verified', 'active', 'expired'].includes(target)) {
        return reply.status(400).send({ error: "status wajib 'verified' | 'active' | 'expired'" })
      }
      const { data: cur } = await request.db!
        .from('price_book_entries').select('id, status').eq('id', request.params.id).maybeSingle()
      if (!cur) return reply.status(404).send({ error: 'Entry tidak ditemukan' })

      const patch: Record<string, unknown> = { status: target, updated_by: request.currentUser!.id }
      if (target === 'verified') {
        patch.verified_by = request.currentUser!.id
        patch.verified_at = new Date().toISOString()
      }
      const { error } = await request.db!
        .from('price_book_entries').update(patch).eq('id', request.params.id)
      if (error) {
        // guard DB menolak transisi tak sah (mundur/lompat) → surface apa adanya
        const invalid = /tidak sah|check_violation|price_book/i.test(error.message)
        return reply.status(invalid ? 409 : 500).send({ error: error.message })
      }
      void logAuditEvent(request, {
        tableName: 'price_book_entries', recordId: request.params.id, action: `pricebook.${target}`,
        actorId: request.currentUser!.id, newValues: { from: cur.status, to: target },
      })
      return reply.send({ ok: true, status: target })
    })
}
