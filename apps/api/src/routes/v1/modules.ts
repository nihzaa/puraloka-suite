import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { clearModuleCache } from '../../utils/modules.js'

// Module Registry & Feature Flags (Sub-Fase 1B.3).
// Read: authenticated (status modul dibaca luas untuk gating UI).
// Write: settings:manage (admin) — toggle modul/flag = kelas pengaturan.
//
// ADDITIVE-FIRST: modul existing seed enabled=true. Endpoint ini hanya mengubah
// STATUS modul terdaftar, tidak membuat/menghapus modul (key = kontrak arsitektur).

export default async function moduleRoutes(app: FastifyInstance) {
  // ── GET /api/v1/modules ───────────────────────────────────────────────────
  app.get('/api/v1/modules', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('modules')
      .select('key, label, is_enabled, min_plan_tier, sort_order')
      .order('sort_order', { ascending: true })
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ modules: data ?? [] })
  })

  // ── PATCH /api/v1/modules/:key ────────────────────────────────────────────
  // Toggle is_enabled satu modul. Admin only.
  app.patch<{ Params: { key: string } }>('/api/v1/modules/:key', {
    preHandler: [authenticate, requirePermission('settings:manage')],
  }, async (request, reply) => {
    const { key } = request.params
    const body = request.body as { is_enabled?: boolean }
    if (typeof body.is_enabled !== 'boolean') {
      return reply.status(400).send({ error: 'Field `is_enabled` (boolean) wajib' })
    }

    const { data: existing } = await supabase
      .from('modules').select('key').eq('key', key).single()
    if (!existing) return reply.status(404).send({ error: `Modul tidak dikenal: ${key}` })

    const { data, error } = await supabase
      .from('modules')
      .update({ is_enabled: body.is_enabled, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select('key, label, is_enabled')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    clearModuleCache()
    return reply.send({ module: data })
  })

  // ── GET /api/v1/feature-flags ─────────────────────────────────────────────
  app.get('/api/v1/feature-flags', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, label, is_enabled, rollout_pct, company_id')
      .order('key', { ascending: true })
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ feature_flags: data ?? [] })
  })

  // ── PUT /api/v1/feature-flags/:key ────────────────────────────────────────
  // Upsert satu feature flag (buat jika belum ada — flag memang bertambah seiring
  // fitur eksperimental, berbeda dari modules yang key-nya kontrak tetap). Admin only.
  app.put<{ Params: { key: string } }>('/api/v1/feature-flags/:key', {
    preHandler: [authenticate, requirePermission('settings:manage')],
  }, async (request, reply) => {
    const { key } = request.params
    const body = request.body as { is_enabled?: boolean; label?: string; rollout_pct?: number }
    if (typeof body.is_enabled !== 'boolean') {
      return reply.status(400).send({ error: 'Field `is_enabled` (boolean) wajib' })
    }
    if (body.rollout_pct !== undefined && (typeof body.rollout_pct !== 'number' || body.rollout_pct < 0 || body.rollout_pct > 100)) {
      return reply.status(400).send({ error: '`rollout_pct` harus 0..100' })
    }

    const { data, error } = await supabase
      .from('feature_flags')
      .upsert({
        key,
        label: body.label ?? null,
        is_enabled: body.is_enabled,
        rollout_pct: body.rollout_pct ?? 100,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      .select('key, label, is_enabled, rollout_pct')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ feature_flag: data })
  })
}
