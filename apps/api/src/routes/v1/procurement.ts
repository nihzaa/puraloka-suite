import { FastifyInstance, FastifyRequest } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { createNotification, createNotifications } from '../../utils/notifications.js'
import { resolveRecipients } from '../../utils/notification-routing.js'
import { evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain } from '../../utils/approval.js'
import { logAuditEvent } from '../../utils/audit.js'
import { computeMrAmount } from '../../lib/mr-amount.js'
import { grValueAtPoPrices, validateInvoiceCeiling } from '../../lib/three-way-match.js'

/** Nilai MR untuk dasar syarat nominal rantai — aturannya di lib/mr-amount.ts (murni, ber-test). */
async function mrApprovalAmount(mrId: string): Promise<number> {
  const { data } = await supabase
    .from('material_request_items')
    .select('qty_requested, unit_price_est')
    .eq('mr_id', mrId)
  return computeMrAmount(data ?? [])
}

/**
 * T4d — daftar proyek yang BOLEH dibaca request ini.
 * Mengembalikan `null` bila `?project_id=` menunjuk proyek tenant lain
 * (pemanggil membalas 404). Lihat pola kembar di `reports.ts`.
 */
async function proyekBolehDibaca(
  request: FastifyRequest,
  projectId: string | null | undefined
): Promise<string[] | null> {
  const milikTenant = await request.db!.projectIds()
  if (!projectId) return milikTenant
  return milikTenant.includes(projectId) ? [projectId] : null
}

export default async function procurementRoutes(app: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════════════════════
  // MATERIAL CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/material-categories
  app.get('/api/v1/procurement/material-categories', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { data, error } = await request.db!
      .from('material_categories')
      .select('id, name, description, sort_order')
      .order('sort_order')
    if (error) return reply.status(500).send({ error: error.message })
    return { categories: data }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MATERIALS (Master Katalog)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/materials
  app.get('/api/v1/procurement/materials', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { category_id, search, is_active } = request.query as Record<string, string>

    let q = request.db!
      .from('materials')
      .select('id, code, name, unit, unit_price, description, is_active, category:material_categories(id, name)')
      .order('name')

    if (category_id) q = q.eq('category_id', category_id)
    if (is_active !== undefined) q = q.eq('is_active', is_active === 'true')
    else q = q.eq('is_active', true)
    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error } = await q.limit(200)
    if (error) return reply.status(500).send({ error: error.message })
    return { materials: data }
  })

  // POST /api/v1/procurement/materials
  app.post('/api/v1/procurement/materials', {
    preHandler: [authenticate, requirePermission('procurement:material:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      name: string; unit: string; category_id?: string
      unit_price?: number; description?: string; code?: string
    }
    if (!body.name || !body.unit) return reply.status(400).send({ error: 'name dan unit wajib diisi' })

    const { data, error } = await request.db!
      .from('materials')
      .insert({ ...body, created_by: request.currentUser!.id })
      .select('id, name, unit, unit_price, code')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ material: data })
  })

  // PATCH /api/v1/procurement/materials/:id
  app.patch('/api/v1/procurement/materials/:id', {
    preHandler: [authenticate, requirePermission('procurement:material:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const allowed = ['name', 'unit', 'category_id', 'unit_price', 'description', 'code', 'is_active']
    const body = request.body as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    for (const k of allowed) { if (k in body) updates[k] = body[k] }
    if (!Object.keys(updates).length) return reply.status(400).send({ error: 'Tidak ada field yang diupdate' })

    const { data, error } = await request.db!.from('materials').update(updates).eq('id', id).select('id, name').single()
    if (error) return reply.status(500).send({ error: error.message })
    return { material: data }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLIERS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/suppliers
  app.get('/api/v1/procurement/suppliers', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { search, is_active } = request.query as Record<string, string>

    let q = request.db!
      .from('suppliers')
      .select(`
        id, code, name, contact_person, phone, email, address, city,
        payment_terms, credit_limit, notes, is_active, created_at,
        outstanding_amount:supplier_invoices(amount_due)
      `)
      .order('name')

    if (is_active !== undefined) q = q.eq('is_active', is_active === 'true')
    else q = q.eq('is_active', true)
    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error } = await q.limit(200)
    if (error) return reply.status(500).send({ error: error.message })
    return { suppliers: data }
  })

  // GET /api/v1/procurement/suppliers/:id
  app.get('/api/v1/procurement/suppliers/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [supplierRes, invoicesRes, paymentsRes] = await Promise.all([
      request.db!.from('suppliers').select('*').eq('id', id).single(),
      request.db!.from('supplier_invoices')
        .select('id, invoice_number, invoice_date, due_date, total_amount, amount_paid, amount_due, status, description, project:projects(id, name)')
        .eq('supplier_id', id).order('invoice_date', { ascending: false }).limit(50),
      request.db!.from('supplier_payments')
        .select('id, amount, payment_date, payment_method, reference_number, notes')
        .eq('supplier_id', id).order('payment_date', { ascending: false }).limit(50),
    ])
    if (supplierRes.error || !supplierRes.data) return reply.status(404).send({ error: 'Supplier tidak ditemukan' })
    return { supplier: supplierRes.data, invoices: invoicesRes.data ?? [], payments: paymentsRes.data ?? [] }
  })

  // POST /api/v1/procurement/suppliers
  app.post('/api/v1/procurement/suppliers', {
    preHandler: [authenticate, requirePermission('procurement:supplier:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      name: string; contact_person?: string; phone?: string; email?: string
      address?: string; city?: string; payment_terms?: string; credit_limit?: number; notes?: string; code?: string
    }
    if (!body.name) return reply.status(400).send({ error: 'Nama supplier wajib diisi' })

    const { data, error } = await request.db!
      .from('suppliers')
      .insert({ ...body, created_by: request.currentUser!.id })
      .select('id, name, phone, payment_terms')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ supplier: data })
  })

  // PATCH /api/v1/procurement/suppliers/:id
  app.patch('/api/v1/procurement/suppliers/:id', {
    preHandler: [authenticate, requirePermission('procurement:supplier:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const allowed = ['name', 'contact_person', 'phone', 'email', 'address', 'city', 'payment_terms', 'credit_limit', 'notes', 'code', 'is_active']
    const body = request.body as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    for (const k of allowed) { if (k in body) updates[k] = body[k] }
    if (!Object.keys(updates).length) return reply.status(400).send({ error: 'Tidak ada field yang diupdate' })

    const { data, error } = await request.db!.from('suppliers').update(updates).eq('id', id).select('id, name').single()
    if (error) return reply.status(500).send({ error: error.message })
    return { supplier: data }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MATERIAL REQUESTS (MR)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/material-requests
  app.get('/api/v1/procurement/material-requests', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id, status } = request.query as Record<string, string>
    const currentUser = request.currentUser!

    let q = supabase
      .from('material_requests')
      .select(`
        id, mr_number, status, request_date, needed_date, notes, created_at,
        project:projects(id, name),
        requested_by:users!material_requests_requested_by_fkey(id, name),
        approved_by:users!material_requests_approved_by_fkey(id, name),
        items:material_request_items(id, qty_requested, qty_ordered, unit, material:materials(id, name, unit))
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    // T4d: SELALU di-scope ke proyek tenant; project_id hanya mempersempit.
    const idProyekMr = await proyekBolehDibaca(request, project_id)
    if (idProyekMr === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    q = q.in('project_id', idProyekMr)
    if (status) q = q.eq('status', status)
    // mandor hanya lihat MR milik sendiri
    if (currentUser.role === 'mandor') q = q.eq('requested_by', currentUser.id)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return { material_requests: data }
  })

  // GET /api/v1/procurement/material-requests/:id
  app.get('/api/v1/procurement/material-requests/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await supabase
      .from('material_requests')
      .select(`
        *, project:projects(id, name),
        requested_by:users!material_requests_requested_by_fkey(id, name, phone),
        approved_by:users!material_requests_approved_by_fkey(id, name),
        items:material_request_items(*, material:materials(id, name, unit, unit_price))
      `)
      // T4d: filter tenant DI QUERY YANG SAMA — tanpa ini, MR perusahaan lain
      // terbaca lengkap hanya dengan mengetahui id-nya. Memakai .in() alih-alih
      // round-trip cek terpisah: satu query, dan "bukan milik saya" otomatis
      // jadi 404 yang sama dengan "tidak ada" (nol kebocoran keberadaan).
      .in('project_id', await request.db!.projectIds())
      .eq('id', id).maybeSingle()
    if (error || !data) return reply.status(404).send({ error: 'MR tidak ditemukan' })
    return { material_request: data }
  })

  // POST /api/v1/procurement/material-requests
  app.post('/api/v1/procurement/material-requests', {
    preHandler: [authenticate, requirePermission('procurement:mr:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      project_id: string; needed_date?: string; notes?: string
      items: Array<{ material_id: string; qty_requested: number; unit: string; unit_price_est?: number; notes?: string }>
    }
    if (!body.project_id || !body.items?.length) {
      return reply.status(400).send({ error: 'project_id dan items wajib diisi' })
    }

    const { data: mr, error: mrError } = await supabase
      .from('material_requests')
      .insert({
        project_id: body.project_id,
        requested_by: request.currentUser!.id,
        needed_date: body.needed_date ?? null,
        notes: body.notes ?? null,
        status: 'draft',
        mr_number: '',
      })
      .select('id, mr_number')
      .single()

    if (mrError) return reply.status(500).send({ error: mrError.message })

    const items = body.items.map(i => ({
      mr_id: mr.id,
      material_id: i.material_id,
      qty_requested: Number(i.qty_requested),
      unit: i.unit,
      unit_price_est: i.unit_price_est ? Number(i.unit_price_est) : null,
      notes: i.notes ?? null,
    }))
    const { error: itemError } = await supabase.from('material_request_items').insert(items)
    if (itemError) return reply.status(500).send({ error: itemError.message })

    return reply.status(201).send({ material_request: mr })
  })

  // PATCH /api/v1/procurement/material-requests/:id/submit
  app.patch('/api/v1/procurement/material-requests/:id/submit', {
    preHandler: [authenticate, requirePermission('procurement:mr:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data: mr } = await supabase.from('material_requests').select('id, status, mr_number, project:projects(name)').eq('id', id).single()
    if (!mr) return reply.status(404).send({ error: 'MR tidak ditemukan' })
    if (mr.status !== 'draft') return reply.status(400).send({ error: 'Hanya MR draft yang bisa disubmit' })

    const { error } = await supabase.from('material_requests').update({ status: 'submitted' }).eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })

    // Notif ke semua admin
    try {
      const admins = await resolveRecipients('material_request_submitted')
      createNotifications(admins.map(uid => ({
        user_id: uid, title: 'Material Request Baru',
        message: `${(mr.project as any)?.name ?? 'Proyek'}: MR ${mr.mr_number} menunggu persetujuan`,
        type: 'general' as const, priority: 'normal' as const,
        action_url: `/procurement/requests/${id}`,
      })))
    } catch { /* ignore */ }

    return { success: true }
  })

  // PATCH /api/v1/procurement/material-requests/:id/approve
  // 2A-5 (ADR-007): berapa level & siapa yang boleh = rantai approval (config),
  // bukan satu requirePermission tetap. Seed = 1 langkah dengan permission yang
  // sama persis (`procurement:mr:manage`) → perilaku hari ini tidak berubah.
  app.patch('/api/v1/procurement/material-requests/:id/approve', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { action, rejection_notes } = request.body as { action: 'approve' | 'reject'; rejection_notes?: string }

    if (!['approve', 'reject'].includes(action)) return reply.status(400).send({ error: 'action harus approve atau reject' })

    // Gerbang KASAR sebelum entitas di-fetch → urutan lama 403-sebelum-404 terjaga.
    const coarse = await canParticipateInChain(request, 'material_request')
    if (coarse.configError) {
      app.log.error({ configError: coarse.configError }, 'baca rantai approval gagal')
      return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
    }
    if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

    const { data: mr } = await supabase.from('material_requests').select('id, status, requested_by, mr_number').eq('id', id).single()
    if (!mr) return reply.status(404).send({ error: 'MR tidak ditemukan' })
    if (mr.status !== 'submitted') return reply.status(400).send({ error: 'Hanya MR submitted yang bisa di-approve/reject' })

    if (action === 'approve') {
      const decision = await evaluateEntityApproval(request, {
        entityType: 'material_request', entityId: id, amount: await mrApprovalAmount(id),
      })
      // Gagal baca konfigurasi TIDAK boleh menyamar jadi "tidak berhak" (Phase 1 §4E).
      if (decision.configError) {
        app.log.error({ configError: decision.configError, id }, 'evaluasi rantai approval gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'MR sudah disetujui penuh' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'material_request', entityId: id, level: decision.step.level, approvedBy: request.currentUser!.id,
        })
        if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

        // Bukan langkah terakhir → MR TETAP 'submitted', belum boleh jadi PO.
        if (!decision.isFinalStep) {
          const next = decision.applicable.find(s => s.level > decision.step!.level)
          void logAuditEvent(request, {
            tableName: 'material_requests', recordId: id, action: 'material_request.approval.level',
            actorId: request.currentUser!.id,
            newValues: { level: decision.step.level, of: decision.applicable.length },
            severity: 'critical',
          })
          return reply.send({
            success: true,
            pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu persetujuan level ${next?.level ?? '-'}.`,
          })
        }
      }
    } else {
      // Ditolak → jejak dibersihkan supaya rantai mulai dari level 1 bila diajukan ulang.
      await clearApprovalProgress('material_request', id)
    }

    const updates: Record<string, unknown> = {
      status: action === 'approve' ? 'approved' : 'rejected',
      approved_by: request.currentUser!.id,
      approved_at: action === 'approve' ? new Date().toISOString() : null,
      rejection_notes: action === 'reject' ? (rejection_notes ?? null) : null,
    }
    const { error } = await supabase.from('material_requests').update(updates).eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })

    // Notif ke requester
    try {
      createNotification({
        user_id: mr.requested_by, title: action === 'approve' ? 'MR Disetujui' : 'MR Ditolak',
        message: `Material Request ${mr.mr_number} telah ${action === 'approve' ? 'disetujui' : 'ditolak'}`,
        type: 'general' as const, priority: 'normal' as const,
        action_url: `/procurement/requests/${id}`,
      })
    } catch { /* ignore */ }

    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE ORDERS (PO)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/purchase-orders
  app.get('/api/v1/procurement/purchase-orders', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id, supplier_id, status } = request.query as Record<string, string>

    let q = supabase
      .from('purchase_orders')
      .select(`
        id, po_number, status, order_date, expected_delivery_date, total_amount, payment_terms, created_at,
        project:projects(id, name),
        supplier:suppliers(id, name, phone),
        created_by:users!purchase_orders_created_by_fkey(id, name),
        items:purchase_order_items(id, qty_ordered, qty_received, unit, unit_price, total_price, material:materials(id, name))
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    const idProyekPo = await proyekBolehDibaca(request, project_id)
    if (idProyekPo === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    q = q.in('project_id', idProyekPo)
    if (supplier_id) q = q.eq('supplier_id', supplier_id)
    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return { purchase_orders: data }
  })

  // GET /api/v1/procurement/purchase-orders/:id
  app.get('/api/v1/procurement/purchase-orders/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *, project:projects(id, name, location),
        supplier:suppliers(id, name, phone, email, address, payment_terms),
        created_by:users!purchase_orders_created_by_fkey(id, name),
        mr:material_requests(id, mr_number),
        items:purchase_order_items(*, material:materials(id, name, unit))
      `)
      .in('project_id', await request.db!.projectIds())   // T4d: sama spt MR detail
      .eq('id', id).maybeSingle()
    if (error || !data) return reply.status(404).send({ error: 'PO tidak ditemukan' })
    return { purchase_order: data }
  })

  // POST /api/v1/procurement/purchase-orders
  app.post('/api/v1/procurement/purchase-orders', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      project_id: string; supplier_id: string; mr_id?: string
      expected_delivery_date?: string; delivery_address?: string; notes?: string; payment_terms?: string
      items: Array<{ material_id: string; mr_item_id?: string; qty_ordered: number; unit: string; unit_price: number; notes?: string }>
    }
    if (!body.project_id || !body.supplier_id || !body.items?.length) {
      return reply.status(400).send({ error: 'project_id, supplier_id, dan items wajib diisi' })
    }

    // Hitung total
    const total = body.items.reduce((sum, i) => sum + (Number(i.qty_ordered) * Number(i.unit_price)), 0)

    // Ambil payment_terms dari supplier jika tidak disupply
    let paymentTerms = body.payment_terms
    if (!paymentTerms) {
      const { data: sup } = await request.db!.from('suppliers').select('payment_terms').eq('id', body.supplier_id).single()
      paymentTerms = sup?.payment_terms ?? 'cod'
    }

    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        project_id: body.project_id, supplier_id: body.supplier_id,
        mr_id: body.mr_id ?? null, created_by: request.currentUser!.id,
        expected_delivery_date: body.expected_delivery_date ?? null,
        delivery_address: body.delivery_address ?? null,
        notes: body.notes ?? null, payment_terms: paymentTerms,
        total_amount: total, po_number: '',
      })
      .select('id, po_number')
      .single()

    if (poError) return reply.status(500).send({ error: poError.message })

    const items = body.items.map(i => ({
      po_id: po.id, material_id: i.material_id,
      mr_item_id: i.mr_item_id ?? null,
      qty_ordered: Number(i.qty_ordered), unit: i.unit,
      unit_price: Number(i.unit_price), notes: i.notes ?? null,
    }))
    const { error: itemError } = await supabase.from('purchase_order_items').insert(items)
    if (itemError) return reply.status(500).send({ error: itemError.message })

    return reply.status(201).send({ purchase_order: po })
  })

  // PATCH /api/v1/procurement/purchase-orders/:id/status
  app.patch('/api/v1/procurement/purchase-orders/:id/status', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    const valid = ['draft', 'sent', 'confirmed', 'cancelled']
    if (!valid.includes(status)) return reply.status(400).send({ error: `Status tidak valid. Pilih: ${valid.join(', ')}` })

    const updates: Record<string, unknown> = { status }
    if (status === 'sent') updates.sent_at = new Date().toISOString()

    const { data, error } = await supabase.from('purchase_orders').update(updates).eq('id', id).select('id, po_number, status').single()
    if (error) return reply.status(500).send({ error: error.message })
    return { purchase_order: data }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GOODS RECEIPTS (GR)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/goods-receipts
  app.get('/api/v1/procurement/goods-receipts', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id, supplier_id, status } = request.query as Record<string, string>

    let q = supabase
      .from('goods_receipts')
      .select(`
        id, gr_number, status, receipt_date, delivery_note_number, delivery_note_url, notes, confirmed_at, created_at,
        project:projects(id, name),
        supplier:suppliers(id, name),
        po:purchase_orders(id, po_number),
        received_by:users!goods_receipts_received_by_fkey(id, name),
        items:goods_receipt_items(id, qty_received, unit, unit_price, material:materials(id, name))
      `)
      .order('created_at', { ascending: false }).limit(200)

    const idProyekGr = await proyekBolehDibaca(request, project_id)
    if (idProyekGr === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    q = q.in('project_id', idProyekGr)
    if (supplier_id) q = q.eq('supplier_id', supplier_id)
    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return { goods_receipts: data }
  })

  // POST /api/v1/procurement/goods-receipts — buat GR baru dari PO
  app.post('/api/v1/procurement/goods-receipts', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      po_id: string; receipt_date?: string; delivery_note_number?: string; notes?: string
      items: Array<{ po_item_id: string; material_id: string; qty_received: number; unit: string; unit_price?: number; notes?: string }>
    }
    if (!body.po_id || !body.items?.length) return reply.status(400).send({ error: 'po_id dan items wajib diisi' })

    // Ambil project_id dan supplier_id dari PO
    const { data: po } = await supabase.from('purchase_orders').select('id, project_id, supplier_id, status').eq('id', body.po_id).single()
    if (!po) return reply.status(404).send({ error: 'PO tidak ditemukan' })
    if (po.status === 'cancelled') return reply.status(400).send({ error: 'PO sudah dibatalkan' })

    // Validasi over-receipt: qty_received (GR confirmed existing) + qty baru
    // tidak boleh melebihi qty_ordered per item PO. Dicek di sini sebagai
    // early warning saat GR dibuat — guard terakhir yang benar-benar mencegah
    // stok bertambah berlebih ada di /confirm (trigger sync_po_receipt_status
    // hanya menghitung dari GR berstatus 'confirmed', bukan draft).
    const poItemIds = body.items.map(i => i.po_item_id)
    const { data: poItems, error: poItemsErr } = await supabase
      .from('purchase_order_items')
      .select('id, qty_ordered, qty_received, material:materials(name)')
      .in('id', poItemIds)
    if (poItemsErr) return reply.status(500).send({ error: poItemsErr.message })

    const poItemMap = new Map((poItems ?? []).map(i => [i.id, i]))
    for (const item of body.items) {
      const poItem = poItemMap.get(item.po_item_id)
      if (!poItem) return reply.status(404).send({ error: `PO item ${item.po_item_id} tidak ditemukan` })

      const qtyReceivedConfirmed = Number(poItem.qty_received ?? 0)
      const qtyOrdered = Number(poItem.qty_ordered)
      const qtyBaru = Number(item.qty_received)
      const sisa = qtyOrdered - qtyReceivedConfirmed

      if (qtyBaru > sisa) {
        const materialName = (poItem.material as any)?.name ?? item.material_id
        return reply.status(400).send({
          error: `Over-receipt: ${materialName} — qty diterima (${qtyBaru}) melebihi sisa PO (${sisa} dari total ${qtyOrdered}, sudah diterima ${qtyReceivedConfirmed})`
        })
      }
    }

    const { data: gr, error: grError } = await supabase
      .from('goods_receipts')
      .insert({
        po_id: body.po_id, project_id: po.project_id, supplier_id: po.supplier_id,
        received_by: request.currentUser!.id,
        receipt_date: body.receipt_date ?? new Date().toISOString().split('T')[0],
        delivery_note_number: body.delivery_note_number ?? null,
        notes: body.notes ?? null, gr_number: '',
      })
      .select('id, gr_number')
      .single()

    if (grError) return reply.status(500).send({ error: grError.message })

    const items = body.items.map(i => ({
      gr_id: gr.id, po_item_id: i.po_item_id, material_id: i.material_id,
      qty_received: Number(i.qty_received), unit: i.unit,
      unit_price: i.unit_price ? Number(i.unit_price) : 0,
      notes: i.notes ?? null,
    }))
    const { error: itemError } = await supabase.from('goods_receipt_items').insert(items)
    if (itemError) return reply.status(500).send({ error: itemError.message })

    return reply.status(201).send({ goods_receipt: gr })
  })

  // PATCH /api/v1/procurement/goods-receipts/:id/confirm — konfirmasi GR → update stok
  app.patch('/api/v1/procurement/goods-receipts/:id/confirm', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data: gr } = await supabase.from('goods_receipts').select('id, status, po_id, supplier_id').eq('id', id).single()
    if (!gr) return reply.status(404).send({ error: 'GR tidak ditemukan' })
    if (gr.status === 'confirmed') return reply.status(400).send({ error: 'GR sudah dikonfirmasi' })

    // Validasi over-receipt — guard TERAKHIR sebelum trigger sync_po_receipt_status
    // benar-benar menambah stok (hanya jalan saat status berubah jadi confirmed).
    // Dicek ulang di sini (bukan hanya saat create GR) karena race: dua GR draft
    // untuk PO yang sama bisa lolos validasi create (belum ada yang confirmed
    // saat itu), tapi jika keduanya dikonfirmasi totalnya bisa melebihi PO.
    const { data: grItems, error: grItemsErr } = await supabase
      .from('goods_receipt_items')
      .select('po_item_id, qty_received, material:materials(name)')
      .eq('gr_id', id)
    if (grItemsErr) return reply.status(500).send({ error: grItemsErr.message })

    const poItemIds = [...new Set((grItems ?? []).map(i => i.po_item_id))]
    if (poItemIds.length > 0) {
      const { data: poItems, error: poItemsErr } = await supabase
        .from('purchase_order_items')
        .select('id, qty_ordered, qty_received')
        .in('id', poItemIds)
      if (poItemsErr) return reply.status(500).send({ error: poItemsErr.message })

      const poItemMap = new Map((poItems ?? []).map(i => [i.id, i]))
      for (const grItem of (grItems ?? [])) {
        const poItem = poItemMap.get(grItem.po_item_id)
        if (!poItem) continue
        const qtyReceivedConfirmed = Number(poItem.qty_received ?? 0)
        const qtyOrdered = Number(poItem.qty_ordered)
        const qtyBaru = Number(grItem.qty_received)
        const sisa = qtyOrdered - qtyReceivedConfirmed

        if (qtyBaru > sisa) {
          const materialName = (grItem.material as any)?.name ?? grItem.po_item_id
          return reply.status(400).send({
            error: `Over-receipt: ${materialName} — qty GR ini (${qtyBaru}) melebihi sisa PO (${sisa} dari total ${qtyOrdered}, sudah dikonfirmasi ${qtyReceivedConfirmed} dari GR lain). GR ini tidak bisa dikonfirmasi.`
          })
        }
      }
    }

    const { data, error } = await supabase
      .from('goods_receipts')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: request.currentUser!.id })
      .eq('id', id)
      .select('id, gr_number, status')
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    // Auto-buat supplier invoice dari GR — HANYA jika GR ini belum punya invoice
    // (invoice manual ber-link GR yang dientri lebih dulu menang; cegah dobel).
    // Backstop race: unique index uq_supplier_invoices_gr (migration 121) —
    // insert kalah race gagal senyap di try/catch ini, tidak menghasilkan dobel.
    try {
      const { data: existingInvoice } = await request.db!
        .from('supplier_invoices')
        .select('id')
        .eq('goods_receipt_id', id)
        .limit(1)

      if (!existingInvoice || existingInvoice.length === 0) {
        const { data: grItems } = await supabase
          .from('goods_receipt_items')
          .select('qty_received, unit_price')
          .eq('gr_id', id)
        const totalAmount = (grItems ?? []).reduce((s, i) => s + (i.qty_received * i.unit_price), 0)

        if (totalAmount > 0) {
          const { data: po } = await supabase.from('goods_receipts').select('po_id, project_id, supplier_id').eq('id', id).single()
          if (po) {
            await request.db!.from('supplier_invoices').insert({
              supplier_id: po.supplier_id, project_id: po.project_id,
              goods_receipt_id: id, total_amount: totalAmount,
              description: `Invoice dari GR ${data?.gr_number}`,
            })
          }
        }
      }
    } catch { /* non-blocking */ }

    return { goods_receipt: data }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLIER INVOICES & PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/supplier-invoices
  app.get('/api/v1/procurement/supplier-invoices', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { supplier_id, project_id, status } = request.query as Record<string, string>

    let q = request.db!
      .from('supplier_invoices')
      .select(`
        id, invoice_number, invoice_date, due_date, total_amount, amount_paid, amount_due, status, description, created_at,
        supplier:suppliers(id, name, phone, payment_terms),
        project:projects(id, name)
      `)
      .order('invoice_date', { ascending: false }).limit(200)

    if (supplier_id) q = q.eq('supplier_id', supplier_id)
    if (project_id) {
      // supplier_invoices sudah ter-scope wrapper (kategori B); filter proyek
      // tetap divalidasi agar tak dipakai membaca proyek tenant lain.
      if (!(await request.db!.projectIds()).includes(project_id)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      q = q.eq('project_id', project_id)
    }
    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // Hitung summary
    const total_outstanding = (data ?? []).reduce((s, i) => s + Number(i.amount_due), 0)
    const overdue = (data ?? []).filter(i => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'paid')

    return { supplier_invoices: data, summary: { total_outstanding, overdue_count: overdue.length } }
  })

  // POST /api/v1/procurement/supplier-invoices — input manual bon supplier
  // 3-way match (PETA-PRIORITAS §3 #2): wajib ter-link GR, satu GR satu invoice,
  // total tidak boleh melebihi nilai GR pada harga PO.
  app.post('/api/v1/procurement/supplier-invoices', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      supplier_id: string; goods_receipt_id?: string; invoice_number?: string
      invoice_date?: string; due_date?: string; total_amount: number; description?: string; notes?: string
    }
    if (!body.supplier_id || !body.total_amount) return reply.status(400).send({ error: 'supplier_id dan total_amount wajib diisi' })
    if (!body.goods_receipt_id) {
      return reply.status(400).send({
        error: 'goods_receipt_id wajib diisi — invoice supplier harus ter-link Goods Receipt (3-way match PO–GR–Invoice)'
      })
    }

    const { data: gr } = await supabase
      .from('goods_receipts')
      .select('id, po_id, project_id, supplier_id, gr_number')
      .eq('id', body.goods_receipt_id)
      .single()
    if (!gr) return reply.status(404).send({ error: 'Goods Receipt tidak ditemukan' })
    if (gr.supplier_id !== body.supplier_id) {
      return reply.status(400).send({ error: 'supplier_id tidak cocok dengan supplier pada GR tersebut' })
    }

    // Anti-dobel #1: satu GR maksimal satu invoice (manual ATAU auto dari confirm)
    const { data: existingForGr } = await request.db!
      .from('supplier_invoices')
      .select('id, invoice_number')
      .eq('goods_receipt_id', gr.id)
      .limit(1)
    if (existingForGr && existingForGr.length > 0) {
      return reply.status(409).send({
        error: `GR ${gr.gr_number} sudah punya invoice — satu GR hanya boleh ditagih sekali. Hapus/periksa invoice yang ada sebelum entri ulang.`
      })
    }

    // Anti-dobel #2: nomor faktur supplier tidak boleh dientri dua kali
    if (body.invoice_number) {
      const { data: dupNumber } = await request.db!
        .from('supplier_invoices')
        .select('id')
        .eq('supplier_id', body.supplier_id)
        .eq('invoice_number', body.invoice_number)
        .limit(1)
      if (dupNumber && dupNumber.length > 0) {
        return reply.status(409).send({
          error: `Nomor faktur ${body.invoice_number} sudah pernah dientri untuk supplier ini — potensi tagihan dobel.`
        })
      }
    }

    // Validasi harga vs PO: total invoice ≤ nilai GR pada harga PO
    const { data: grItems, error: giError } = await supabase
      .from('goods_receipt_items')
      .select('po_item_id, qty_received')
      .eq('gr_id', gr.id)
    if (giError) return reply.status(500).send({ error: giError.message })

    const poItemIds = [...new Set((grItems ?? []).map(i => i.po_item_id))]
    let poItems: Array<{ id: string; unit_price: number }> = []
    if (poItemIds.length > 0) {
      const { data, error: piError } = await supabase
        .from('purchase_order_items')
        .select('id, unit_price')
        .in('id', poItemIds)
      if (piError) return reply.status(500).send({ error: piError.message })
      poItems = data ?? []
    }

    const matchValue = grValueAtPoPrices(grItems ?? [], poItems)
    const verdict = validateInvoiceCeiling(Number(body.total_amount), matchValue)
    if (!verdict.ok) {
      return reply.status(400).send({
        error: `Total invoice (${Number(body.total_amount)}) melebihi nilai GR pada harga PO (${matchValue}) — selisih ${verdict.excess}. Periksa qty/harga, atau revisi PO bila harga memang berubah.`
      })
    }

    // Insert dengan field whitelist (bukan spread body — cegah mass-assignment)
    const { data, error } = await request.db!
      .from('supplier_invoices')
      .insert({
        supplier_id: body.supplier_id,
        project_id: gr.project_id,
        goods_receipt_id: gr.id,
        invoice_number: body.invoice_number ?? null,
        invoice_date: body.invoice_date ?? undefined,
        due_date: body.due_date ?? null,
        total_amount: Number(body.total_amount),
        description: body.description ?? null,
        notes: body.notes ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, invoice_number, total_amount, status')
      .single()
    if (error) {
      // 23505 = unique_violation (uq_supplier_invoices_gr / _supplier_number, migration 121)
      if ((error as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: 'Invoice duplikat terdeteksi (GR atau nomor faktur sudah dipakai)' })
      }
      return reply.status(500).send({ error: error.message })
    }
    return reply.status(201).send({ supplier_invoice: data })
  })

  // POST /api/v1/procurement/supplier-payments — catat pembayaran ke supplier
  app.post('/api/v1/procurement/supplier-payments', {
    preHandler: [authenticate, requirePermission('procurement:payment:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      supplier_id: string; amount: number; payment_date?: string
      payment_method?: string; reference_number?: string; notes?: string
      cash_account_id?: string
      // Alokasi: jika tidak diisi, sistem auto-FIFO ke invoice terlama
      allocations?: Array<{ supplier_invoice_id: string; amount: number }>
    }
    if (!body.supplier_id || !body.amount) return reply.status(400).send({ error: 'supplier_id dan amount wajib diisi' })

    // Validasi saldo kas jika cash_account_id diberikan
    if (body.cash_account_id) {
      const { data: acct } = await request.db!
        .from('cash_accounts')
        .select('balance, name')
        .eq('id', body.cash_account_id)
        .single()
      if (!acct) return reply.status(400).send({ error: 'Akun kas tidak ditemukan' })
      if (Number(acct.balance) < Number(body.amount)) {
        return reply.status(400).send({ error: `Saldo ${acct.name} tidak cukup (tersedia: ${acct.balance})` })
      }
    }

    const { data: payment, error: payError } = await request.db!
      .from('supplier_payments')
      .insert({
        supplier_id: body.supplier_id, amount: Number(body.amount),
        payment_date: body.payment_date ?? new Date().toISOString().split('T')[0],
        payment_method: body.payment_method ?? 'transfer',
        reference_number: body.reference_number ?? null,
        notes: body.notes ?? null,
        cash_account_id: body.cash_account_id ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, amount')
      .single()
    if (payError) return reply.status(500).send({ error: payError.message })

    let allocations = body.allocations
    // Auto-FIFO jika tidak ada alokasi manual
    if (!allocations || allocations.length === 0) {
      const { data: unpaidInvoices } = await request.db!
        .from('supplier_invoices')
        .select('id, amount_due')
        .eq('supplier_id', body.supplier_id)
        .neq('status', 'paid')
        .gt('amount_due', 0)
        .order('invoice_date', { ascending: true })

      let remaining = Number(body.amount)
      allocations = []
      for (const inv of unpaidInvoices ?? []) {
        if (remaining <= 0) break
        const alloc = Math.min(remaining, Number(inv.amount_due))
        allocations.push({ supplier_invoice_id: inv.id, amount: alloc })
        remaining -= alloc
      }
    }

    if (allocations.length > 0) {
      const rows = allocations.map(a => ({ payment_id: payment.id, ...a }))
      const { error: allocError } = await request.db!.from('supplier_payment_allocations').insert(rows)
      if (allocError) app.log.error({ allocError }, 'Failed to insert payment allocations')
    }

    return reply.status(201).send({ supplier_payment: payment, allocations_count: allocations.length })
  })

  // GET /api/v1/procurement/supplier-payments — riwayat pembayaran (untuk kas page)
  app.get('/api/v1/procurement/supplier-payments', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const query = request.query as { cash_account_id?: string; supplier_id?: string; limit?: string }
    let q = request.db!
      .from('supplier_payments')
      .select(`
        id, amount, payment_date, payment_method, reference_number, notes, created_at,
        supplier:suppliers(id, name),
        cash_account:cash_accounts(id, name, type),
        creator:users!supplier_payments_created_by_fkey(id, name)
      `)
      .order('payment_date', { ascending: false })
      .limit(Number(query.limit ?? 100))

    if (query.cash_account_id) q = q.eq('cash_account_id', query.cash_account_id)
    if (query.supplier_id) q = q.eq('supplier_id', query.supplier_id)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ supplier_payments: data })
  })

  // GET /api/v1/procurement/supplier-invoices/overdue — alert jatuh tempo
  app.get('/api/v1/procurement/supplier-invoices/overdue', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const today = new Date()
    const in3days = new Date(today); in3days.setDate(today.getDate() + 3)

    const { data, error } = await request.db!
      .from('supplier_invoices')
      .select('id, invoice_number, invoice_date, due_date, amount_due, supplier:suppliers(id, name, phone)')
      .neq('status', 'paid')
      .not('due_date', 'is', null)
      .lte('due_date', in3days.toISOString().split('T')[0])
      .order('due_date')

    if (error) return reply.status(500).send({ error: error.message })

    const overdue = (data ?? []).filter(i => new Date(i.due_date!) < today)
    const dueSoon = (data ?? []).filter(i => new Date(i.due_date!) >= today)

    return { overdue, due_soon: dueSoon }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCK
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/procurement/stocks?project_id=
  app.get('/api/v1/procurement/stocks', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id } = request.query as { project_id?: string }
    let q = supabase
      .from('project_stocks')
      .select('id, qty_on_hand, qty_reserved, last_updated_at, project:projects(id, name), material:materials(id, name, unit, category:material_categories(name))')
      .order('last_updated_at', { ascending: false })

    const idProyekSt = await proyekBolehDibaca(request, project_id)
    if (idProyekSt === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    q = q.in('project_id', idProyekSt)


    const { data, error } = await q.limit(500)
    if (error) return reply.status(500).send({ error: error.message })
    return { stocks: data }
  })

  // GET /api/v1/procurement/stocks/:project_id/movements
  app.get('/api/v1/procurement/stocks/:project_id/movements', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id } = request.params as { project_id: string }
    const { limit } = request.query as { limit?: string }
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, movement_type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_at, material:materials(id, name, unit), created_by:users(id, name)')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(Number(limit ?? 200))
    if (error) return reply.status(500).send({ error: error.message })
    return { movements: data }
  })

  // POST /api/v1/procurement/stocks/usage — Catat pemakaian / return / adjustment manual
  app.post('/api/v1/procurement/stocks/usage', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const body = request.body as {
      project_id: string; material_id: string
      qty: number; movement_type: 'usage' | 'return' | 'adjustment'; notes?: string
    }
    const { project_id, material_id, movement_type, notes } = body
    const qty = Number(body.qty)

    if (!project_id || !material_id || !qty || !movement_type) {
      return reply.status(400).send({ error: 'project_id, material_id, qty, movement_type wajib diisi' })
    }
    if (!['usage', 'return', 'adjustment'].includes(movement_type)) {
      return reply.status(400).send({ error: 'movement_type harus: usage, return, atau adjustment' })
    }
    if (qty <= 0) return reply.status(400).send({ error: 'qty harus lebih dari 0' })

    // Ambil stok saat ini
    const { data: stock } = await supabase
      .from('project_stocks')
      .select('id, qty_on_hand')
      .eq('project_id', project_id)
      .eq('material_id', material_id)
      .single()

    const qty_before = Number(stock?.qty_on_hand ?? 0)
    let qty_after: number
    let movement_qty: number  // qty yg masuk ke stock_movements (bisa negatif)

    if (movement_type === 'usage') {
      if (qty > qty_before) {
        return reply.status(400).send({ error: `Stok tidak cukup. Tersedia: ${qty_before}, diminta: ${qty}` })
      }
      qty_after = qty_before - qty
      movement_qty = -qty
    } else if (movement_type === 'return') {
      qty_after = qty_before + qty
      movement_qty = qty
    } else {
      // adjustment: qty adalah nilai absolut stok baru
      qty_after = qty
      movement_qty = qty - qty_before  // bisa positif atau negatif
    }

    // Update project_stocks
    if (stock) {
      await supabase.from('project_stocks')
        .update({ qty_on_hand: qty_after, last_updated_at: new Date().toISOString() })
        .eq('id', stock.id)
    } else {
      // Stok belum ada (misal return barang yang tidak lewat GR)
      await supabase.from('project_stocks')
        .insert({ project_id, material_id, qty_on_hand: qty_after })
    }

    // Insert stock_movements
    const { data: movement, error: mvErr } = await supabase
      .from('stock_movements')
      .insert({
        project_id, material_id,
        movement_type,
        qty: movement_qty,
        qty_before,
        qty_after,
        reference_type: 'manual',
        notes: notes ?? null,
        created_by: request.currentUser!.id,
      })
      .select('id, movement_type, qty, qty_before, qty_after, created_at')
      .single()

    if (mvErr) return reply.status(500).send({ error: mvErr.message })
    return reply.status(201).send({ movement, qty_before, qty_after })
  })

  // DELETE /api/v1/procurement/material-requests/:id — hapus MR draft
  app.delete('/api/v1/procurement/material-requests/:id', {
    preHandler: [authenticate, requirePermission('procurement:mr:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data: mr } = await supabase.from('material_requests').select('id, status, requested_by').eq('id', id).single()
    if (!mr) return reply.status(404).send({ error: 'MR tidak ditemukan' })
    if (mr.status !== 'draft') return reply.status(400).send({ error: 'Hanya MR draft yang bisa dihapus' })
    // F4 (AKTA 0 lockout fix): otorisasi = capability `procurement:mr:manage` (preHandler).
    // Role literal admin/pm dihapus — melockout role custom (direktur punya
    // procurement:mr:manage). Pemegang capability = authority hapus MR draft.
    await supabase.from('material_request_items').delete().eq('mr_id', id)
    const { error } = await supabase.from('material_requests').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return { success: true }
  })

  // POST /api/v1/procurement/material-requests/:id/items — tambah item ke MR draft
  app.post('/api/v1/procurement/material-requests/:id/items', {
    preHandler: [authenticate, requirePermission('procurement:mr:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data: mr } = await supabase.from('material_requests').select('id, status').eq('id', id).single()
    if (!mr) return reply.status(404).send({ error: 'MR tidak ditemukan' })
    if (mr.status !== 'draft') return reply.status(400).send({ error: 'Hanya MR draft yang bisa ditambah item' })
    const body = request.body as { material_id: string; qty_requested: number; unit: string; unit_price_est?: number; notes?: string }
    if (!body.material_id || !body.qty_requested || !body.unit) return reply.status(400).send({ error: 'material_id, qty_requested, unit wajib diisi' })
    const { data, error } = await supabase
      .from('material_request_items')
      .insert({ mr_id: id, material_id: body.material_id, qty_requested: Number(body.qty_requested), unit: body.unit, unit_price_est: body.unit_price_est ?? null, notes: body.notes ?? null })
      .select('id, qty_requested, unit, material:materials(id, name, unit)')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ item: data })
  })

  // DELETE /api/v1/procurement/material-requests/:id/items/:itemId — hapus item MR draft
  app.delete('/api/v1/procurement/material-requests/:id/items/:itemId', {
    preHandler: [authenticate, requirePermission('procurement:mr:manage')]
  }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const { data: mr } = await supabase.from('material_requests').select('id, status').eq('id', id).single()
    if (!mr) return reply.status(404).send({ error: 'MR tidak ditemukan' })
    if (mr.status !== 'draft') return reply.status(400).send({ error: 'Hanya item MR draft yang bisa dihapus' })
    const { error } = await supabase.from('material_request_items').delete().eq('id', itemId).eq('mr_id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return { success: true }
  })

  // PATCH /api/v1/procurement/purchase-orders/:id/cancel — batalkan PO
  app.patch('/api/v1/procurement/purchase-orders/:id/cancel', {
    preHandler: [authenticate, requirePermission('procurement:po:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { notes } = (request.body ?? {}) as { notes?: string }
    const { data: po } = await supabase.from('purchase_orders').select('id, status, mr_id').eq('id', id).single()
    if (!po) return reply.status(404).send({ error: 'PO tidak ditemukan' })
    if (['fully_received', 'cancelled'].includes(po.status)) return reply.status(400).send({ error: `PO dengan status ${po.status} tidak bisa dibatalkan` })
    const { error } = await supabase.from('purchase_orders').update({ status: 'cancelled', notes }).eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    // Jika PO dari MR → revert MR status ke approved
    if (po.mr_id) {
      const { data: otherPos } = await supabase.from('purchase_orders').select('id, status').eq('mr_id', po.mr_id).neq('id', id)
      const hasActivePO = (otherPos ?? []).some(p => p.status !== 'cancelled')
      if (!hasActivePO) {
        await supabase.from('material_requests').update({ status: 'approved' }).eq('id', po.mr_id)
      }
    }
    return { success: true }
  })

  // GET /api/v1/procurement/dashboard — KPI summary
  app.get('/api/v1/procurement/dashboard', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const today = new Date().toISOString().split('T')[0]
    const in7days = new Date(); in7days.setDate(in7days.getDate() + 7)
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    const [mrRes, poRes, invRes, stockRes] = await Promise.all([
      supabase.from('material_requests').select('id, status').in('status', ['draft', 'submitted']),
      supabase.from('purchase_orders').select('id, status, total_amount, order_date').gte('order_date', startOfMonth),
      request.db!.from('supplier_invoices').select('id, due_date, amount_due, status').neq('status', 'paid'),
      supabase.from('project_stocks').select('id, qty_on_hand, material:materials(min_stock)').not('material', 'is', null),
    ])

    const mrPendingApproval = (mrRes.data ?? []).filter(m => m.status === 'submitted').length
    const mrDraft = (mrRes.data ?? []).filter(m => m.status === 'draft').length
    const poThisMonth = (poRes.data ?? []).length
    const poValueThisMonth = (poRes.data ?? []).reduce((s, p) => s + Number(p.total_amount), 0)
    const overdueInvoices = (invRes.data ?? []).filter(i => i.due_date && i.due_date < today)
    const dueSoonInvoices = (invRes.data ?? []).filter(i => i.due_date && i.due_date >= today && i.due_date <= in7days.toISOString().split('T')[0])
    const totalOutstanding = (invRes.data ?? []).reduce((s, i) => s + Number(i.amount_due), 0)
    const lowStockCount = (stockRes.data ?? []).filter((s: any) => {
      const min = Number(s.material?.min_stock ?? 0)
      return min > 0 && Number(s.qty_on_hand) < min
    }).length

    return {
      mr_pending_approval: mrPendingApproval,
      mr_draft: mrDraft,
      po_this_month: poThisMonth,
      po_value_this_month: poValueThisMonth,
      overdue_invoices: overdueInvoices.length,
      overdue_amount: overdueInvoices.reduce((s, i) => s + Number(i.amount_due), 0),
      due_soon_invoices: dueSoonInvoices.length,
      total_outstanding: totalOutstanding,
      low_stock_count: lowStockCount,
    }
  })

  // GET /api/v1/procurement/reports/purchases — rekap pembelian per periode
  app.get('/api/v1/procurement/reports/purchases', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const { from, to, supplier_id, project_id } = request.query as Record<string, string>
    let q = supabase
      .from('purchase_orders')
      .select('id, po_number, order_date, total_amount, status, supplier:suppliers(id, name), project:projects(id, name), items:purchase_order_items(qty_ordered, unit_price, total_price, material:materials(id, name, category:material_categories(name)))')
      .not('status', 'eq', 'cancelled')
      .order('order_date', { ascending: false })
    if (from) q = q.gte('order_date', from)
    if (to) q = q.lte('order_date', to)
    if (supplier_id) q = q.eq('supplier_id', supplier_id)
    const idProyekLp = await proyekBolehDibaca(request, project_id)
    if (idProyekLp === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    q = q.in('project_id', idProyekLp)
    const { data, error } = await q.limit(500)
    if (error) return reply.status(500).send({ error: error.message })

    // Agregasi per supplier
    const bySupplier: Record<string, { name: string; total: number; count: number }> = {}
    ;(data ?? []).forEach(po => {
      const sid = (po.supplier as any)?.id ?? 'unknown'
      const sname = (po.supplier as any)?.name ?? '—'
      if (!bySupplier[sid]) bySupplier[sid] = { name: sname, total: 0, count: 0 }
      bySupplier[sid].total += Number(po.total_amount)
      bySupplier[sid].count += 1
    })

    // Agregasi per bulan
    const byMonth: Record<string, { total: number; count: number }> = {}
    ;(data ?? []).forEach(po => {
      const month = (po.order_date ?? '').slice(0, 7)
      if (!byMonth[month]) byMonth[month] = { total: 0, count: 0 }
      byMonth[month].total += Number(po.total_amount)
      byMonth[month].count += 1
    })

    return {
      purchase_orders: data,
      summary: {
        total_value: (data ?? []).reduce((s, p) => s + Number(p.total_amount), 0),
        total_pos: (data ?? []).length,
        by_supplier: Object.entries(bySupplier).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total),
        by_month: Object.entries(byMonth).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
      }
    }
  })

  // GET /api/v1/procurement/reports/aging — aging hutang supplier
  app.get('/api/v1/procurement/reports/aging', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const today = new Date()
    const { data, error } = await request.db!
      .from('supplier_invoices')
      .select('id, invoice_number, invoice_date, due_date, total_amount, amount_due, amount_paid, status, description, supplier:suppliers(id, name), project:projects(id, name)')
      .neq('status', 'paid')
      .order('due_date', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })

    const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 }
    const rows = (data ?? []).map(inv => {
      const due = inv.due_date ? new Date(inv.due_date) : null
      const daysOverdue = due ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0
      const bucket = !due || daysOverdue <= 0 ? 'current'
        : daysOverdue <= 30 ? 'days_1_30'
        : daysOverdue <= 60 ? 'days_31_60'
        : daysOverdue <= 90 ? 'days_61_90'
        : 'over_90'
      buckets[bucket as keyof typeof buckets] += Number(inv.amount_due)
      return { ...inv, days_overdue: Math.max(0, daysOverdue), bucket }
    })

    return { invoices: rows, buckets, total: (data ?? []).reduce((s, i) => s + Number(i.amount_due), 0) }
  })

  // PATCH /api/v1/procurement/materials/:id/min-stock — set stok minimum
  app.patch('/api/v1/procurement/materials/:id/min-stock', {
    preHandler: [authenticate, requirePermission('procurement:material:manage')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { min_stock } = request.body as { min_stock: number }
    if (min_stock == null || min_stock < 0) return reply.status(400).send({ error: 'min_stock harus >= 0' })
    const { data, error } = await request.db!.from('materials').update({ min_stock: Number(min_stock) }).eq('id', id).select('id, name, min_stock').single()
    if (error) return reply.status(500).send({ error: error.message })
    return { material: data }
  })

  // POST /api/v1/procurement/stocks/opname — Opname stok mingguan (bulk)
  app.post('/api/v1/procurement/stocks/opname', {
    preHandler: [authenticate, requirePermission('procurement:view')]
  }, async (request, reply) => {
    const body = request.body as {
      project_id: string; notes?: string
      items: Array<{ material_id: string; qty_actual: number }>
    }
    const { project_id, notes, items } = body
    if (!project_id || !items?.length) {
      return reply.status(400).send({ error: 'project_id dan items wajib diisi' })
    }

    // Ambil semua stok proyek ini sekaligus
    const { data: currentStocks } = await supabase
      .from('project_stocks')
      .select('id, material_id, qty_on_hand')
      .eq('project_id', project_id)

    const stockMap = new Map((currentStocks ?? []).map((s: any) => [s.material_id, s]))

    const movements: any[] = []
    const updates: Array<{ id: string; qty_actual: number }> = []
    const inserts: Array<{ project_id: string; material_id: string; qty_on_hand: number }> = []

    for (const item of items) {
      const qty_actual = Number(item.qty_actual)
      if (qty_actual < 0) continue  // skip nilai tidak valid

      const existing = stockMap.get(item.material_id)
      const qty_before = Number(existing?.qty_on_hand ?? 0)
      const selisih = qty_actual - qty_before

      if (selisih === 0) continue  // tidak ada perubahan, skip

      movements.push({
        project_id,
        material_id: item.material_id,
        movement_type: 'adjustment',
        qty: selisih,
        qty_before,
        qty_after: qty_actual,
        reference_type: 'opname',
        notes: notes ?? null,
        created_by: request.currentUser!.id,
      })

      if (existing) {
        updates.push({ id: existing.id, qty_actual })
      } else {
        inserts.push({ project_id, material_id: item.material_id, qty_on_hand: qty_actual })
      }
    }

    // Jalankan semua update
    await Promise.all([
      ...updates.map(u =>
        supabase.from('project_stocks')
          .update({ qty_on_hand: u.qty_actual, last_updated_at: new Date().toISOString() })
          .eq('id', u.id)
      ),
      inserts.length > 0 ? supabase.from('project_stocks').insert(inserts) : Promise.resolve(),
      movements.length > 0 ? supabase.from('stock_movements').insert(movements) : Promise.resolve(),
    ])

    return reply.status(201).send({
      opname_by: request.currentUser!.name,
      project_id,
      total_items_checked: items.length,
      items_with_adjustment: movements.length,
      items_unchanged: items.length - movements.length,
    })
  })
}
