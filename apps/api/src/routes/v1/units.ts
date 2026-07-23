import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { normalizeUnitCode, validateUnitInput } from '../../lib/units.js'

// ─────────────────────────────────────────────────────────────────────────────
// Master satuan (unit of measure) terpusat — migration 090 (AKTA 3 config-first).
// SATU sumber untuk dropdown satuan mandor + procurement (hilangkan 2 daftar hardcode
// yang divergen). Read = authenticated (form butuh dropdown); tulis = units:manage.
// `code` immutable (kunci = nilai tersimpan konvensi mandor) → hanya symbol/label/
// category/sort_order/is_active yang boleh diedit.
// ─────────────────────────────────────────────────────────────────────────────

export default async function unitsRoutes(app: FastifyInstance) {
  // ── GET /api/v1/units ─────────────────────────────────────────────────────────
  // Default: hanya aktif (untuk dropdown). ?all=true: termasuk nonaktif (untuk kelola).
  app.get('/api/v1/units', { preHandler: [authenticate] }, async (request, reply) => {
    const includeInactive = (request.query as { all?: string })?.all === 'true'
    let q = supabase.from('units')
      .select('code, symbol, label, category, sort_order, is_active')
      .order('sort_order', { ascending: true }).order('code', { ascending: true })
    if (!includeInactive) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ units: data ?? [] })
  })

  // ── POST /api/v1/units ────────────────────────────────────────────────────────
  // Tambah satuan baru. code dinormalisasi → kunci stabil. units:manage. Audit.
  app.post('/api/v1/units', {
    preHandler: [authenticate, requirePermission('units:manage')],
  }, async (request, reply) => {
    const body = request.body as {
      code?: string; symbol?: string; label?: string; category?: string; sort_order?: number
    }
    const code = normalizeUnitCode(body.code ?? '')
    const v = validateUnitInput(
      { code, symbol: body.symbol, label: body.label, category: body.category, sort_order: body.sort_order },
      { requireCode: true },
    )
    if (!v.ok) return reply.status(400).send({ error: v.error })
    if (body.symbol === undefined || body.label === undefined || body.category === undefined) {
      return reply.status(400).send({ error: 'Wajib: code, symbol, label, category' })
    }

    const { data, error } = await supabase.from('units').insert({
      code,
      symbol: String(body.symbol).trim(),
      label: String(body.label).trim(),
      category: body.category,
      sort_order: body.sort_order ?? 0,
      updated_by: request.currentUser!.id,
    }).select('code, symbol, label, category, sort_order, is_active').single()

    if (error) {
      // 23505 = unique_violation (code sudah ada).
      if ((error as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Satuan dengan code "${code}" sudah ada` })
      }
      return reply.status(500).send({ error: error.message })
    }

    void logAuditEvent(request, {
      tableName: 'units', recordId: code, action: 'units.create',
      actorId: request.currentUser!.id, newValues: data as Record<string, unknown>, severity: 'info',
    })
    return reply.status(201).send({ unit: data })
  })

  // ── PATCH /api/v1/units/:code ─────────────────────────────────────────────────
  // Ubah symbol/label/category/sort_order/is_active. code TIDAK bisa diubah (kunci =
  // nilai tersimpan). Nonaktifkan (is_active=false) alih-alih hapus → nilai lama aman.
  app.patch('/api/v1/units/:code', {
    preHandler: [authenticate, requirePermission('units:manage')],
  }, async (request, reply) => {
    const code = normalizeUnitCode((request.params as { code: string }).code)
    const body = request.body as {
      symbol?: string; label?: string; category?: string; sort_order?: number; is_active?: boolean
    }
    const v = validateUnitInput(body)
    if (!v.ok) return reply.status(400).send({ error: v.error })

    const patch: Record<string, unknown> = { updated_by: request.currentUser!.id, updated_at: new Date().toISOString() }
    if (body.symbol !== undefined) patch.symbol = String(body.symbol).trim()
    if (body.label !== undefined) patch.label = String(body.label).trim()
    if (body.category !== undefined) patch.category = body.category
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order
    if (body.is_active !== undefined) patch.is_active = !!body.is_active
    if (Object.keys(patch).length <= 2) {
      return reply.status(400).send({ error: 'Tidak ada field yang diubah' })
    }

    const { data: prev } = await supabase.from('units')
      .select('symbol, label, category, sort_order, is_active').eq('code', code).maybeSingle()
    if (!prev) return reply.status(404).send({ error: `Satuan "${code}" tidak ditemukan` })

    const { data, error } = await supabase.from('units').update(patch as never)
      .eq('code', code).select('code, symbol, label, category, sort_order, is_active').single()
    if (error) return reply.status(500).send({ error: error.message })

    void logAuditEvent(request, {
      tableName: 'units', recordId: code, action: 'units.update',
      actorId: request.currentUser!.id,
      oldValues: prev as Record<string, unknown>, newValues: data as Record<string, unknown>,
      severity: 'info',
    })
    return reply.send({ unit: data })
  })
}
