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
  }, async (request, reply) => {
    // `modules` kategori AB sejak migrasi 155: baris BERSAMA (company_id NULL)
    // adalah katalog "modul apa saja yang ada", baris ber-company adalah
    // PENGECUALIAN "perusahaan ini mematikan/menyalakan modul itu".
    //
    // Keduanya diambil, lalu pengecualian menimpa katalog. Mengambil salah
    // satu saja salah ke dua arah: hanya katalog → pengaturan perusahaan
    // diabaikan; hanya pengecualian → modul yang tak pernah diatur menghilang.
    const { data, error } = await supabase
      .from('modules')
      .select('key, label, is_enabled, min_plan_tier, sort_order, company_id')
      .order('sort_order', { ascending: true })
    if (error) return reply.status(500).send({ error: error.message })

    const companyId = request.companyId ?? null
    const baris = (data ?? []) as Array<{
      key: string; label: string; is_enabled: boolean
      min_plan_tier: string | null; sort_order: number; company_id: string | null
    }>

    const gabung = new Map<string, typeof baris[number]>()
    for (const b of baris) if (b.company_id == null) gabung.set(b.key, b)
    for (const b of baris) if (companyId && b.company_id === companyId) gabung.set(b.key, b)

    return reply.send({
      modules: [...gabung.values()]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ company_id, ...sisa }) => ({
          ...sisa,
          // Membedakan "diatur perusahaan ini" dari "bawaan sistem" — tanpa
          // itu, admin tak tahu apakah nilainya pilihannya sendiri.
          diatur_perusahaan: company_id != null,
        })),
    })
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

    // ⚠️ CELAH YANG DITUTUP (migrasi 155). Versi sebelumnya meng-UPDATE baris
    // KATALOG — baris yang dipakai bersama seluruh perusahaan. Perusahaan A
    // mematikan "procurement" → modul itu mati untuk B, C, dan setiap pelanggan
    // SaaS. Endpointnya sudah bergerbang `settings:manage`, jadi bukan soal
    // siapa boleh menekannya; yang salah adalah CAKUPAN akibatnya. Admin sebuah
    // perusahaan berwenang penuh atas perusahaannya sendiri — dan kewenangan
    // itu tak boleh menyeberang.
    //
    // Kini: katalog TIDAK PERNAH disentuh. Yang ditulis adalah baris
    // pengecualian milik perusahaan aktif.
    const companyId = request.companyId
    if (!companyId) {
      return reply.status(400).send({
        error: 'Perusahaan aktif tak dapat ditentukan — pengaturan modul selalu per-perusahaan',
      })
    }

    const { data: katalog } = await supabase
      .from('modules')
      .select('key, label, min_plan_tier, sort_order')
      .eq('key', key).is('company_id', null).maybeSingle()
    if (!katalog) return reply.status(404).send({ error: `Modul tidak dikenal: ${key}` })

    // Upsert pada `(company_id, key)` — indeks unik dari 155. Baris katalog
    // (company_id NULL) tak mungkin tersentuh karena target konfliknya berbeda.
    const { data, error } = await supabase
      .from('modules')
      .upsert({
        company_id: companyId,
        key,
        label: katalog.label,
        min_plan_tier: katalog.min_plan_tier,
        sort_order: katalog.sort_order,
        is_enabled: body.is_enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,key' })
      .select('key, label, is_enabled')
      .single()
    if (error) {
      request.log.error({ err: error, key, companyId }, 'gagal menyimpan pengaturan modul')
      return reply.status(500).send({ error: 'Gagal menyimpan pengaturan modul' })
    }
    clearModuleCache()
    return reply.send({ module: { ...data, diatur_perusahaan: true } })
  })

  // ── GET /api/v1/feature-flags ─────────────────────────────────────────────
  app.get('/api/v1/feature-flags', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    // `feature_flags` kategori AB: baris BERSAMA (company_id NULL) + override
    // per-perusahaan. Tanpa saringan ini, daftar yang dikembalikan memuat
    // override milik perusahaan lain — termasuk nama flag fitur yang belum
    // dirilis di sana.
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, label, is_enabled, rollout_pct, company_id')
      .or(`company_id.is.null,company_id.eq.${request.companyId}`)
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
        // ⚠️ `company_id` + onConflict per-company. Sebelumnya upsert memakai
        // `onConflict: 'key'` SAJA, jadi perusahaan A yang mengubah sebuah flag
        // MENIMPA baris perusahaan B — bukan membuat override sendiri.
        // Migrasi 146 mengganti UNIQUE(key) global jadi UNIQUE(company_id,key);
        // `onConflict` di sini WAJIB ikut, kalau tidak upsert-nya gagal.
        company_id: request.companyId,
      }, { onConflict: 'company_id,key' })
      .select('key, label, is_enabled, rollout_pct')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ feature_flag: data })
  })
}
