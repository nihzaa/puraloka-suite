import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { validateMime } from '../../utils/mime.js'
import { clearConfigCache } from '../../utils/config.js'

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp']

export default async function settingsRoutes(app: FastifyInstance) {

  // ── GET /api/v1/public/invoice/:id ────────────────────────────────────────────
  // Public endpoint — no auth required — for QR verification page
  app.get('/api/v1/public/invoice/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_type, total_amount, amount_due,
        issued_date, due_date, paid_date, status,
        projects ( id, name ),
        termin_schedules ( id, label, termin_number )
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      return reply.status(404).send({ found: false })
    }

    // Also fetch company name for display
    const { data: company } = await supabase
      .from('company_profile')
      .select('company_name, logo_url')
      .limit(1)
      .single()

    return reply.send({
      found: true,
      invoice: {
        id: data.id,
        invoice_number: data.invoice_number,
        invoice_type: data.invoice_type,
        total_amount: data.total_amount,
        amount_due: data.amount_due,
        issued_date: data.issued_date,
        due_date: data.due_date,
        paid_date: data.paid_date,
        status: data.status,
        project_name: (data.projects as unknown as { name: string } | null)?.name ?? null,
      },
      company: company ?? { company_name: 'Puraloka Persada' },
    })
  })

  // ── GET /api/v1/settings/company ─────────────────────────────────────────────
  // Return company profile (single row). All roles can read (needed for PDF generation).
  app.get('/api/v1/settings/company', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const { data, error } = await supabase
      .from('company_profile')
      .select('*')
      .order('updated_at', { ascending: true })
      .limit(1)
      .single()

    if (error) {
      // If no row exists yet, return defaults
      if (error.code === 'PGRST116') {
        return reply.send({
          company: {
            company_name: 'Puraloka Persada',
            invoice_prefix: 'INV',
          },
        })
      }
      return reply.status(500).send({ error: error.message })
    }

    return reply.send({ company: data })
  })

  // ── PUT /api/v1/settings/company ─────────────────────────────────────────────
  // Update company profile. Admin only.
  app.put('/api/v1/settings/company', {
    preHandler: [authenticate, requirePermission('settings:manage')],
  }, async (request, reply) => {
    const body = request.body as {
      company_name?: string
      tagline?: string
      address?: string
      city?: string
      postal_code?: string
      phone?: string
      email?: string
      website?: string
      npwp?: string
      bank_name?: string
      bank_account?: string
      bank_account_name?: string
      invoice_prefix?: string
      invoice_notes?: string
      signature_name?: string
    }

    if (body.company_name !== undefined && !body.company_name.trim()) {
      return reply.status(400).send({ error: 'Nama perusahaan tidak boleh kosong' })
    }

    // Get the existing row id
    const { data: existing } = await supabase
      .from('company_profile')
      .select('id')
      .limit(1)
      .single()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    const allowed = [
      'company_name', 'tagline', 'address', 'city', 'postal_code',
      'phone', 'email', 'website', 'npwp', 'bank_name',
      'bank_account', 'bank_account_name', 'invoice_prefix',
      'invoice_notes', 'signature_name',
    ]
    for (const key of allowed) {
      if (key in body) updateData[key] = (body as Record<string, unknown>)[key]
    }

    let data, error
    if (existing?.id) {
      // Update existing row
      ;({ data, error } = await supabase
        .from('company_profile')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single())
    } else {
      // Insert first row
      ;({ data, error } = await supabase
        .from('company_profile')
        .insert({ company_name: body.company_name ?? 'Puraloka Persada', ...updateData })
        .select()
        .single())
    }

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ company: data })
  })

  // ── GET /api/v1/settings/config ───────────────────────────────────────────────
  // Configuration Engine (Sub-Fase 1B.1). Return key-value config, optional ?category=.
  // Read: all authenticated (config seperti tax rate dipakai luas untuk kalkulasi).
  app.get('/api/v1/settings/config', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { category } = request.query as { category?: string }
    let query = supabase
      .from('company_settings')
      .select('key, value, value_type, category, description, updated_at')
      .order('category', { ascending: true })
      .order('key', { ascending: true })

    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ config: data ?? [] })
  })

  // ── PUT /api/v1/settings/config ───────────────────────────────────────────────
  // Update config values. Admin only (settings:manage). Key = kontrak (tidak boleh
  // dibuat/dihapus lewat sini — hanya nilai yang di-set diubah). value_type divalidasi.
  app.put('/api/v1/settings/config', {
    preHandler: [authenticate, requirePermission('settings:manage')],
  }, async (request, reply) => {
    const body = request.body as { updates?: Array<{ key: string; value: unknown }> }
    if (!body.updates || !Array.isArray(body.updates) || body.updates.length === 0) {
      return reply.status(400).send({ error: 'Body harus berisi array `updates` non-kosong' })
    }

    const userId = (request.user as { id?: string } | undefined)?.id ?? null
    const results: Array<{ key: string; value: unknown }> = []

    for (const { key, value } of body.updates) {
      if (typeof key !== 'string' || !key.trim()) {
        return reply.status(400).send({ error: 'Setiap update wajib punya `key` string' })
      }

      // Key harus sudah terdaftar — endpoint ini hanya mengubah nilai, bukan membuat key baru.
      const { data: existing, error: fetchErr } = await supabase
        .from('company_settings')
        .select('key, value_type')
        .eq('key', key)
        .single()

      if (fetchErr || !existing) {
        return reply.status(404).send({ error: `Config key tidak dikenal: ${key}` })
      }

      // Validasi tipe sesuai value_type terdaftar.
      const t = existing.value_type
      const okType =
        (t === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
        (t === 'string' && typeof value === 'string') ||
        (t === 'boolean' && typeof value === 'boolean') ||
        (t === 'json' && value !== null && typeof value === 'object')
      if (!okType) {
        return reply.status(400).send({ error: `Nilai untuk ${key} harus bertipe ${t}` })
      }

      // Guard nilai tax: rate harus 0..1 (fraksi, bukan persen). Cegah 11 vs 0.11.
      if (key.startsWith('tax.') && typeof value === 'number' && (value < 0 || value > 1)) {
        return reply.status(400).send({ error: `Tarif ${key} harus fraksi 0..1 (mis. 0.11 untuk 11%)` })
      }

      const { error: updErr } = await supabase
        .from('company_settings')
        .update({ value: value as never, updated_by: userId, updated_at: new Date().toISOString() })
        .eq('key', key)

      if (updErr) return reply.status(500).send({ error: updErr.message })
      results.push({ key, value })
    }

    // Buang cache config in-process agar nilai baru langsung terbaca kalkulasi.
    clearConfigCache()
    return reply.send({ updated: results })
  })

  // ── POST /api/v1/settings/company/logo ────────────────────────────────────────
  // Upload company logo. Admin only.
  app.post('/api/v1/settings/company/logo', {
    preHandler: [authenticate, requirePermission('settings:manage')],
  }, async (request, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (request as any).parts()
    let logoUrl: string | null = null

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'logo') {
        const buf = await part.toBuffer()
        if (buf.byteLength > 2 * 1024 * 1024) {
          return reply.status(400).send({ error: 'Ukuran logo maksimal 2MB' })
        }

        let detectedMime: string
        try {
          detectedMime = validateMime(buf, ALLOWED_IMAGES)
        } catch (e: unknown) {
          return reply.status(400).send({ error: (e as Error).message })
        }

        const ext = detectedMime.split('/')[1].replace('jpeg', 'jpg')
        const filename = `logo/company-logo.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('company-assets')
          .upload(filename, buf, { contentType: detectedMime, upsert: true })

        if (uploadErr) {
          return reply.status(500).send({ error: `Upload gagal: ${uploadErr.message}` })
        }

        const { data: urlData } = supabase.storage
          .from('company-assets')
          .getPublicUrl(filename)

        // Add cache-busting timestamp to avoid browser caching stale logo
        logoUrl = urlData.publicUrl + `?t=${Date.now()}`
      } else if (part.type === 'file') {
        await part.toBuffer()
      }
    }

    if (!logoUrl) {
      return reply.status(400).send({ error: 'File logo tidak ditemukan dalam request' })
    }

    // Update logo_url in company_profile
    const { data: existing } = await supabase
      .from('company_profile')
      .select('id')
      .limit(1)
      .single()

    if (existing?.id) {
      await supabase
        .from('company_profile')
        .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('company_profile')
        .insert({ company_name: 'Puraloka Persada', logo_url: logoUrl })
    }

    return reply.send({ logo_url: logoUrl })
  })
}
