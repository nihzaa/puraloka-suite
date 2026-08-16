import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { validateMime } from '../../utils/mime.js'
import { clearConfigCache } from '../../utils/config.js'
import { setFinancialConfig, getEffectiveFinancialValue } from '../../utils/financial-config.js'
import { todayWIB } from '../../lib/financial-config.js'
import { getGlobalPenaltyTerms } from '../../utils/penalty.js'
import { PENALTY_BASES } from '../../lib/penalty.js'
import { logAuditEvent } from '../../utils/audit.js'
import { AMBANG_OTOMASI } from '../../lib/ambang-otomasi.js'

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp']

export default async function settingsRoutes(app: FastifyInstance) {

  // ── GET /api/v1/my/companies ─────────────────────────────────────────────
  // T7: daftar perusahaan yang boleh diakses user ini — fondasi company
  // switcher di UI.
  //
  // SENGAJA tidak memakai `request.db!`: wrapper menyaring ke company AKTIF,
  // sementara justru itu yang mau diganti. Sumber kebenarannya `company_members`
  // milik user, jadi lingkupnya ditentukan `user_id` — bukan company aktif.
  //
  // Tidak butuh permission khusus: setiap user berhak tahu ia anggota
  // perusahaan mana. Yang TIDAK boleh adalah melihat perusahaan yang bukan
  // haknya, dan itu dijaga filter `user_id` di bawah.
  app.get('/api/v1/my/companies', { preHandler: [authenticate] }, async (request, reply) => {
    const { data, error } = await supabase
      .from('company_members')
      .select('company_id, is_default, companies ( id, code, name, logo_url )')
      .eq('user_id', request.currentUser!.id)
      .eq('is_active', true)

    if (error) {
      request.log.error({ err: error }, 'gagal memuat daftar perusahaan user')
      return reply.status(500).send({ error: 'Gagal memuat daftar perusahaan' })
    }

    type BarisKeanggotaan = {
      company_id: string
      is_default: boolean
      companies: { id: string; code: string; name: string; logo_url: string | null } | null
    }

    const daftar = ((data ?? []) as unknown as BarisKeanggotaan[])
      .filter((r) => r.companies !== null)
      .map((r) => ({
        id: r.companies!.id,
        code: r.companies!.code,
        name: r.companies!.name,
        logo_url: r.companies!.logo_url,
        is_default: r.is_default,
        is_active: r.company_id === request.companyId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Sengaja mengembalikan `active_company_id` juga: UI tak perlu menebak
    // company mana yang sedang dipakai request ini, dan tak ada dua sumber
    // kebenaran yang bisa berbeda.
    return reply.send({ data: daftar, active_company_id: request.companyId })
  })

  // ── GET /api/v1/public/invoice/:id ────────────────────────────────────────────
  // Public endpoint — no auth required — for QR verification page
  app.get('/api/v1/public/invoice/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_type, total_amount, amount_due,
        issued_date, due_date, paid_date, status,
        projects ( id, name, company_id ),
        termin_schedules ( id, label, termin_number )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      return reply.status(404).send({ found: false })
    }

    // T4i: endpoint PUBLIK (tanpa auth), jadi tak ada request.db!. Perusahaan
    // diturunkan DARI INVOICE-nya sendiri — bukan dari "baris pertama
    // company_profile" yang dulu berarti semua invoice menampilkan nama & logo
    // perusahaan yang sama, siapa pun penerbitnya.
    const proj = (data as { projects?: { company_id?: string } | { company_id?: string }[] }).projects
    const companyId = (Array.isArray(proj) ? proj[0] : proj)?.company_id
    const { data: companyRow } = companyId
      ? await supabase.from('companies').select('name, logo_url').eq('id', companyId).maybeSingle()
      : { data: null }
    const company = companyRow ? { company_name: companyRow.name, logo_url: companyRow.logo_url } : null

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
  }, async (request, reply) => {
    // T4i: BACA DARI `companies`, bukan `company_profile`.
    //
    // `company_profile` adalah tabel SINGLE-ROW tanpa kolom company_id — semua
    // tenant berbagi satu baris. PUT dari satu perusahaan MENIMPA profil yang
    // dipakai perusahaan lain, termasuk NOMOR REKENING BANK yang muncul di PDF
    // invoice mereka. Itu korupsi data lintas-perusahaan, bukan sekadar
    // kebocoran baca.
    //
    // Tidak butuh migrasi data: migration 126 sudah menyalin seluruh isinya ke
    // `companies` (diverifikasi 2026-07-29 — nol kolom hilang, nol nilai beda).
    // `companies` kategori ANCHOR, jadi request.db! menyaringnya otomatis.
    // Nama kolomnya sama persis kecuali company_name -> name (di-alias di bawah
    // supaya bentuk respons untuk frontend TIDAK berubah).
    const { data: row, error } = await request.db!
      .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
      .select('*')
      .eq('id', request.companyId!)
      .maybeSingle()
    const data = row ? { ...row, company_name: (row as { name: string }).name } : null

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

    // T4i: barisnya adalah company aktif itu sendiri — tak perlu "cari baris
    // pertama" seperti pola single-row lama.
    const existing = { id: request.companyId! }

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

    // company_name di body -> kolom `name` di companies.
    if ('company_name' in updateData) {
      updateData.name = updateData.company_name
      delete updateData.company_name
    }
    const { data: row, error } = await request.db!
      .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .maybeSingle()
    const data = row ? { ...row, company_name: (row as { name: string }).name } : null

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
    let query = request.db!
      .from('company_settings')
      .select('key, value, value_type, category, description, updated_at')
      .order('category', { ascending: true })
      .order('key', { ascending: true })

    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ config: data ?? [] })
  })

  // ── GET /api/v1/settings/ambang-otomasi ───────────────────────────────────────
  //
  // Daftar ambang otomasi LENGKAP — metadata dari kode, nilai dari basis.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA RUTE INI ADA, DAN APA YANG IA PERBAIKI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Halaman `/pengaturan/otomasi` sebelumnya memelihara daftar ambangnya
  // SENDIRI — array yang ditulis tangan di frontend. Tiap ambang baru harus
  // ditambahkan di dua tempat, dan yang lupa ditambahkan jadi tak bisa disetel
  // siapa pun.
  //
  // Diukur 2026-08-16: 37 ambang di kode, 15 di halaman. DUA PULUH DUA tak
  // bisa disetel dari UI mana pun — nilainya ada di basis, rutenya membacanya,
  // dan satu-satunya cara mengubahnya adalah SQL langsung. Itu persis yang
  // dilarang CHARTER §8: "kolom DB sudah ada bukan selesai; config-first
  // berarti ada halaman pengaturannya di UI".
  //
  // Rute ini membuat halaman berhenti punya daftar sendiri. Menambah ambang
  // baru di `AMBANG_OTOMASI` cukup — ia langsung muncul, dan tak ada lagi
  // tempat kedua yang bisa tertinggal.
  //
  // Penjaga `audit-ambang-bisa-disetel.mjs` menahan kemunduran: kalau ada yang
  // membuat halaman kembali memakai daftar sendiri, CI merah.
  //
  // ── Izin: sama dengan `config` — semua yang login boleh MEMBACA
  //
  // Ambang menentukan kapan orang menerima pesan; yang menerimanya berhak tahu
  // kenapa. Yang dibatasi MENGUBAHNYA, dan itu tetap lewat `PUT config`.
  app.get('/api/v1/settings/ambang-otomasi', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { data, error } = await request.db!
      .from('company_settings')
      .select('key, value')
      .in('key', Object.keys(AMBANG_OTOMASI))

    if (error) return reply.status(500).send({ error: error.message })

    const tersimpan = new Map(
      (data ?? []).map((r) => {
        const s = r as { key: string; value: unknown }
        return [s.key, Number(s.value)]
      }),
    )

    const ambang = Object.entries(AMBANG_OTOMASI).map(([kunci, m]) => ({
      kunci,
      judul: m.judul,
      akibat: m.akibat,
      satuan: m.satuan,
      langkah: m.langkah,
      min: m.min,
      max: m.max,
      bawaan: m.bawaan,
      /*
        `nilai` selalu terisi — bawaan dipakai bila tenant belum menyetel.
        `disetel` memisahkan keduanya, karena UI perlu bisa mengatakan "ini
        masih bawaan" tanpa menampilkan kotak kosong yang terbaca seperti
        pengaturan yang hilang.
      */
      nilai: tersimpan.get(kunci) ?? m.bawaan,
      disetel: tersimpan.has(kunci),
    }))

    return reply.send({ ambang })
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
      const { data: existing, error: fetchErr } = await request.db!
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

      const { error: updErr } = await request.db!
        .from('company_settings')
        .update({ value: value as never, updated_by: userId, updated_at: new Date().toISOString() })
        .eq('key', key)

      if (updErr) return reply.status(500).send({ error: updErr.message })
      results.push({ key, value })
    }

    // Buang cache config in-process agar nilai baru langsung terbaca kalkulasi.
    // Di-scope ke company request ini — tenant lain tak perlu ikut kehilangan
    // cache-nya hanya karena perusahaan ini mengubah setting-nya sendiri.
    clearConfigCache(request.companyId)
    return reply.send({ updated: results })
  })

  // ── GET /api/v1/settings/finance ──────────────────────────────────────────────
  // Riwayat config finansial effective-dated (tarif pajak, retensi, denda). Read auth.
  app.get('/api/v1/settings/finance', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { data, error } = await request.db!
      .from('financial_config')
      .select('key, value, value_type, effective_from, effective_to, note, updated_at:created_at')
      .order('key', { ascending: true })
      .order('effective_from', { ascending: false })
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ config: data ?? [] })
  })

  // ── GET /api/v1/settings/penalty ──────────────────────────────────────────────
  // Terms denda GLOBAL yang BERLAKU hari ini (resolved) — untuk ringkasan & prefill
  // override proyek. Detail riwayat effective-dated tetap via GET /settings/finance.
  app.get('/api/v1/settings/penalty', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const terms = await getGlobalPenaltyTerms(todayWIB())
    return reply.send({ bases: PENALTY_BASES, effective: terms })
  })

  // ── PUT /api/v1/settings/finance ──────────────────────────────────────────────
  // Set nilai config finansial baru berlaku sejak tanggal (effective-dated, governance
  // ketat: settings:finance:manage — Q7). Close-then-insert anti-gap (C4). Audit critical.
  app.put('/api/v1/settings/finance', {
    preHandler: [authenticate, requirePermission('settings:finance:manage')],
  }, async (request, reply) => {
    const body = request.body as {
      key?: string; value?: unknown; value_type?: 'number' | 'string' | 'boolean' | 'json'
      effective_from?: string; note?: string
    }
    if (!body.key || body.value === undefined || !body.effective_from) {
      return reply.status(400).send({ error: 'Wajib: key, value, effective_from (YYYY-MM-DD)' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.effective_from)) {
      return reply.status(400).send({ error: 'effective_from harus format YYYY-MM-DD (tanggal WIB)' })
    }
    // Validasi: semua key tarif/persentase (rate/pct) = FRAKSI 0..1 (konvensi seragam
    // financial_config). Config invalid ditolak, bukan diterima diam.
    const isRateKey = body.key.includes('rate') || body.key.includes('pct')
    if (isRateKey && (typeof body.value !== 'number' || body.value < 0 || body.value > 1)) {
      return reply.status(400).send({ error: `Nilai ${body.key} harus angka fraksi 0..1 (mis. 0.11 untuk 11%)` })
    }
    // Guard khusus key denda (config-first, effective-dated seperti tarif pajak).
    if (body.key === 'penalty.basis' && !PENALTY_BASES.includes(body.value as never)) {
      return reply.status(400).send({ error: `penalty.basis harus salah satu: ${PENALTY_BASES.join(', ')}` })
    }
    if (body.key === 'penalty.grace_days' && (typeof body.value !== 'number' || !Number.isInteger(body.value) || body.value < 0 || body.value > 3650)) {
      return reply.status(400).send({ error: 'penalty.grace_days harus bilangan bulat 0..3650 hari' })
    }
    if (body.key === 'penalty.enabled' && typeof body.value !== 'boolean') {
      return reply.status(400).send({ error: 'penalty.enabled harus boolean (true/false)' })
    }

    // Snapshot nilai berlaku SEBELUM ubah (untuk audit from→to).
    const { data: prev } = await request.db!
      .from('financial_config').select('value').eq('key', body.key).is('effective_to', null).maybeSingle()

    const result = await setFinancialConfig({
      key: body.key, value: body.value, valueType: body.value_type ?? 'number',
      effectiveFrom: body.effective_from, note: body.note,
      updatedBy: (request.currentUser as { id?: string } | undefined)?.id ?? null,
      // Company AKTIF, bukan company mana pun: tarif pajak milik satu badan
      // usaha. Sebelum ini argumennya tak ada sama sekali, sehingga penutupan
      // rentang lama menyapu SELURUH perusahaan (lihat 145 + financial-config.ts).
      companyId: request.companyId!,
    })
    if (!result.ok) return reply.status(409).send({ error: result.error })

    // Audit: perubahan tarif finansial = kepatuhan-kritis, severity critical.
    void logAuditEvent(request, {
      tableName: 'financial_config', recordId: body.key, action: 'finance.config',
      actorId: request.currentUser!.id,
      oldValues: { value: prev?.value ?? null },
      newValues: { value: body.value, effective_from: body.effective_from },
      severity: 'critical',
    })
    return reply.send({ ok: true, key: body.key, effective_from: body.effective_from })
  })

  // ── GET /api/v1/settings/project-defaults ─────────────────────────────────────
  // Default form proyek baru (DP%, masa pemeliharaan, retensi). Read authenticated
  // (project-modal memakainya untuk pre-fill).
  app.get('/api/v1/settings/project-defaults', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { data } = await request.db!
      .from('company_settings').select('key, value')
      .in('key', ['project.dp_default_pct', 'project.maintenance_days'])
    const map: Record<string, unknown> = {}
    for (const r of data ?? []) map[r.key] = r.value
    // Retensi default dari financial_config (effective hari ini), disajikan sebagai persen.
    const retFrac = Number(await getEffectiveFinancialValue('retention.default_pct', todayWIB()))
    return reply.send({
      dp_default_pct: Number(map['project.dp_default_pct'] ?? 30),
      maintenance_days: Number(map['project.maintenance_days'] ?? 90),
      retention_pct: Number.isFinite(retFrac) ? Math.round(retFrac * 100 * 100) / 100 : 5,
    })
  })

  // ── PUT /api/v1/settings/project-defaults ─────────────────────────────────────
  // Ubah default DP% & masa pemeliharaan. Money-affecting → settings:finance:manage. Audit.
  app.put('/api/v1/settings/project-defaults', {
    preHandler: [authenticate, requirePermission('settings:finance:manage')],
  }, async (request, reply) => {
    const body = request.body as { dp_default_pct?: number; maintenance_days?: number }
    const updates: { key: string; value: number }[] = []
    if (body.dp_default_pct !== undefined) {
      if (typeof body.dp_default_pct !== 'number' || body.dp_default_pct < 0 || body.dp_default_pct > 100)
        return reply.status(400).send({ error: 'dp_default_pct harus 0..100 (persen)' })
      updates.push({ key: 'project.dp_default_pct', value: body.dp_default_pct })
    }
    if (body.maintenance_days !== undefined) {
      if (typeof body.maintenance_days !== 'number' || body.maintenance_days < 0 || body.maintenance_days > 3650)
        return reply.status(400).send({ error: 'maintenance_days harus 0..3650 hari' })
      updates.push({ key: 'project.maintenance_days', value: body.maintenance_days })
    }
    if (updates.length === 0) return reply.status(400).send({ error: 'Tidak ada field yang diubah' })

    for (const u of updates) {
      const { error } = await request.db!.from('company_settings')
        .update({ value: u.value as never, updated_by: request.currentUser!.id, updated_at: new Date().toISOString() })
        .eq('key', u.key)
      if (error) return reply.status(500).send({ error: error.message })
    }
    clearConfigCache(request.companyId)
    void logAuditEvent(request, {
      tableName: 'company_settings', recordId: 'project.defaults', action: 'project.defaults',
      actorId: request.currentUser!.id, newValues: Object.fromEntries(updates.map(u => [u.key, u.value])),
      severity: 'info',
    })
    return reply.send({ ok: true })
  })

  // ── GET /api/v1/settings/kasbon-limit ─────────────────────────────────────────
  // Status toggle batas kasbon (Q2). Read authenticated.
  app.get('/api/v1/settings/kasbon-limit', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { data } = await request.db!
      .from('company_settings').select('value').eq('key', 'kasbon.limit.enabled').maybeSingle()
    return reply.send({ enabled: data?.value === true })
  })

  // ── PUT /api/v1/settings/kasbon-limit ─────────────────────────────────────────
  // Nyalakan/matikan enforcement batas kasbon. Governance ketat (money-affecting =
  // settings:finance:manage, Q7). Audit critical.
  app.put('/api/v1/settings/kasbon-limit', {
    preHandler: [authenticate, requirePermission('settings:finance:manage')],
  }, async (request, reply) => {
    const body = request.body as { enabled?: boolean }
    if (typeof body.enabled !== 'boolean') {
      return reply.status(400).send({ error: 'Field `enabled` (boolean) wajib' })
    }
    const { data: prev } = await request.db!
      .from('company_settings').select('value').eq('key', 'kasbon.limit.enabled').maybeSingle()

    const { error } = await request.db!
      .from('company_settings')
      .update({ value: body.enabled as never, updated_by: request.currentUser!.id, updated_at: new Date().toISOString() })
      .eq('key', 'kasbon.limit.enabled')
    if (error) return reply.status(500).send({ error: error.message })
    clearConfigCache(request.companyId)

    void logAuditEvent(request, {
      tableName: 'company_settings', recordId: 'kasbon.limit.enabled', action: 'kasbon.limit.toggle',
      actorId: request.currentUser!.id,
      oldValues: { enabled: prev?.value === true }, newValues: { enabled: body.enabled },
      severity: 'critical',
    })
    return reply.send({ enabled: body.enabled })
  })

  // ── POST /api/v1/settings/company/logo ────────────────────────────────────────
  // Upload company logo. Admin only.
  app.post('/api/v1/settings/company/logo', {
    preHandler: [authenticate, requirePermission('settings:manage')],
  }, async (request, reply) => {
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
        // ⚠️ SEGMEN TENANT WAJIB DI DEPAN (F2-5).
        //
        // Sebelumnya `logo/company-logo.${ext}` — SAMA untuk semua tenant, dan
        // dengan `upsert: true` PT kedua yang mengunggah MENIMPA logo PT
        // pertama. Kerusakannya senyap: unggahan berhasil, tak ada galat, dan
        // yang tertimpa baru sadar saat melihat logo perusahaan lain di
        // dokumennya sendiri.
        const filename = `${request.companyId}/logo/company-logo.${ext}`

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

    // T4i: logo disimpan di `companies` (ter-scope), bukan company_profile
    // single-row. Tanpa ini, mengganti logo di satu perusahaan mengubah logo
    // yang tercetak di invoice perusahaan lain.
    // Hasil diperiksa: berkasnya SUDAH terunggah ke storage di baris atas.
    // Kalau baris ini gagal diam-diam, logo ada di storage tapi tak pernah
    // terpasang — orang melihat "berhasil", lalu mengunggah lagi dan lagi,
    // menumpuk berkas yatim tanpa pernah tahu kenapa logonya tak berubah.
    const { error: errLogo } = await request.db!
      .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', request.companyId!)
    if (errLogo) {
      return reply.status(500).send({ error: `Logo terunggah tapi gagal dipasang: ${errLogo.message}` })
    }

    return reply.send({ logo_url: logoUrl })
  })
}
