import type { FastifyInstance, FastifyRequest } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { createNotifications } from '../../utils/notifications.js'
import { resolveRecipients } from '../../utils/notification-routing.js'
import { logAuditEvent } from '../../utils/audit.js'
import { periksaPenyetujuanCo } from '../../lib/penagihan-co.js'
import { evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain, idAlurPersetujuan , periksaGerbangSod } from '../../utils/approval.js'

const CO_SELECT = `
  id,
  project_id,
  co_number,
  title,
  description,
  status,
  billing_mode,
  total_amount_delta,
  baseline_contract_value,
  baseline_rab_total,
  submitted_at,
  submitted_by,
  approved_at,
  approved_by,
  rejected_at,
  rejected_by,
  rejected_reason,
  created_by,
  created_at,
  updated_at,
  creator:users!change_orders_created_by_fkey ( id, name ),
  approver:users!change_orders_approved_by_fkey ( id, name ),
  rejecter:users!change_orders_rejected_by_fkey ( id, name ),
  items:change_order_items (
    id, item_type, rab_item_id, description,
    unit, volume_delta, unit_price, amount_delta, notes, sort_order,
    rab_item:rab_items ( id, name, category_code, level )
  )
`

async function generateCoNumber(projectId: string): Promise<string> {
  const { data } = await supabase
    .from('change_orders')
    .select('co_number')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'CO-001'

  const last = data[0].co_number
  const match = last.match(/CO-(\d+)$/)
  if (!match) return 'CO-001'

  const next = parseInt(match[1], 10) + 1
  return `CO-${String(next).padStart(3, '0')}`
}

async function recalcTotalDelta(coId: string): Promise<void> {
  const { data: items } = await supabase
    .from('change_order_items')
    .select('amount_delta')
    .eq('change_order_id', coId)

  const total = (items ?? []).reduce((sum: number, i: { amount_delta: number }) => sum + (i.amount_delta ?? 0), 0)

  await supabase
    .from('change_orders')
    .update({ total_amount_delta: total })
    .eq('id', coId)
}

/**
 * T4h — apakah change order milik company aktif?
 *
 * `change_orders` kategori C via `project_id`. 10 endpoint di file ini di-key
 * oleh CO id, dan yang paling berbahaya adalah `approve`: ia meng-UPDATE
 * `projects.contract_value`. Tanpa gerbang ini, tenant A bisa menyetujui CO
 * tenant B dan MENGUBAH NILAI KONTRAK proyek mereka.
 */
async function coMilikTenant(request: FastifyRequest, coId: string): Promise<boolean> {
  const { data } = await supabase
    .from('change_orders').select('project_id').eq('id', coId).maybeSingle()
  if (!data?.project_id) return false
  return (await request.db!.projectIds()).includes(data.project_id)
}

export default async function changeOrderRoutes(app: FastifyInstance) {

  // ── GET /api/v1/projects/:projectId/change-orders ──────────────────────────
  app.get<{ Params: { projectId: string }; Querystring: { status?: string } }>(
    '/api/v1/projects/:projectId/change-orders',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { status } = request.query

      let q = request.db!
        .viaProject('change_orders', projectId)
        .select(CO_SELECT)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (status) q = q.eq('status', status)

      const { data, error } = await q

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengambil data change orders' })
      }

      return reply.send({ data: data ?? [] })
    }
  )

  // ── GET /api/v1/change-orders/:id ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/change-orders/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('change_orders')
        .select(CO_SELECT)
        .eq('id', id)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      }

      return reply.send({ data })
    }
  )

  // ── POST /api/v1/projects/:projectId/change-orders ─────────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      title: string
      description?: string
      billing_mode?: string
    }
  }>(
    '/api/v1/projects/:projectId/change-orders',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { title, description, billing_mode } = request.body

      if (!title?.trim()) {
        return reply.status(400).send({ error: 'Judul change order wajib diisi' })
      }

      // Verify project exists and is not deleted
      const { data: project } = await request.db!
        .from('projects')
        .select('id, name, is_deleted')
        .eq('id', projectId)
        .single()

      if (!project || project.is_deleted) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const coNumber = await generateCoNumber(projectId)

      const { data, error } = await request.db!
        .viaProject('change_orders', projectId)
        .insert({
          project_id:   projectId,
          co_number:    coNumber,
          title:        title.trim(),
          description:  description?.trim() || null,
          billing_mode: billing_mode || null,
          status:       'draft',
          created_by:   request.currentUser!.id,
        })
        .select(CO_SELECT)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal membuat change order' })
      }


      return reply.status(201).send({ data })
    }
  )

  // ── PUT /api/v1/change-orders/:id ──────────────────────────────────────────
  app.put<{
    Params: { id: string }
    Body: {
      title?: string
      description?: string
      billing_mode?: string
    }
  }>(
    '/api/v1/change-orders/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }
      const { title, description, billing_mode } = request.body

      const { data: existing } = await supabase
        .from('change_orders')
        .select('id, status')
        .eq('id', id)
        .single()

      if (!existing) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (existing.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya change order berstatus draft yang bisa diubah' })
      }

      const updates: Record<string, unknown> = {}
      if (title !== undefined)        updates.title        = title.trim()
      if (description !== undefined)  updates.description  = description?.trim() || null
      if (billing_mode !== undefined) updates.billing_mode = billing_mode || null

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: 'Tidak ada field yang diubah' })
      }

      const { data, error } = await supabase
        .from('change_orders')
        .update(updates)
        .eq('id', id)
        .select(CO_SELECT)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal memperbarui change order' })
      }

      return reply.send({ data })
    }
  )

  // ── DELETE /api/v1/change-orders/:id ───────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/change-orders/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }

      const { data: existing } = await supabase
        .from('change_orders')
        .select('id, status')
        .eq('id', id)
        .single()

      if (!existing) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (existing.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya change order berstatus draft yang bisa dihapus' })
      }

      const { error } = await supabase.from('change_orders').delete().eq('id', id)

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menghapus change order' })
      }

      return reply.send({ success: true })
    }
  )

  // ── POST /api/v1/change-orders/:id/items ───────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      item_type: string
      description: string
      amount_delta: number
      rab_item_id?: string
      unit?: string
      volume_delta?: number
      unit_price?: number
      notes?: string
      sort_order?: number
    }
  }>(
    '/api/v1/change-orders/:id/items',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }
      const { item_type, description, amount_delta, rab_item_id, unit, volume_delta, unit_price, notes, sort_order } = request.body

      const { data: existing } = await supabase
        .from('change_orders')
        .select('id, status')
        .eq('id', id)
        .single()

      if (!existing) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (existing.status !== 'draft') {
        return reply.status(400).send({ error: 'Tidak bisa menambah item ke change order yang sudah disubmit' })
      }

      if (!description?.trim()) {
        return reply.status(400).send({ error: 'Deskripsi item wajib diisi' })
      }
      if (amount_delta === undefined || amount_delta === null) {
        return reply.status(400).send({ error: 'Nilai delta harga wajib diisi' })
      }

      const valid_types = ['kerja_tambah', 'kerja_kurang', 'perubahan_volume', 'perubahan_spec']
      if (!valid_types.includes(item_type)) {
        return reply.status(400).send({ error: 'Tipe item tidak valid' })
      }

      const { data: item, error } = await supabase
        .from('change_order_items')
        .insert({
          change_order_id: id,
          item_type,
          description:     description.trim(),
          amount_delta,
          rab_item_id:     rab_item_id || null,
          unit:            unit || null,
          volume_delta:    volume_delta ?? null,
          unit_price:      unit_price ?? null,
          notes:           notes?.trim() || null,
          sort_order:      sort_order ?? 0,
        })
        .select(`
          id, change_order_id, item_type, rab_item_id, description,
          unit, volume_delta, unit_price, amount_delta, notes, sort_order,
          rab_item:rab_items ( id, name, category_code, level )
        `)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menambah item change order' })
      }

      // Recalc total delta
      await recalcTotalDelta(id)

      return reply.status(201).send({ data: item })
    }
  )

  // ── PUT /api/v1/change-orders/:id/items/:itemId ────────────────────────────
  app.put<{
    Params: { id: string; itemId: string }
    Body: {
      item_type?: string
      description?: string
      amount_delta?: number
      rab_item_id?: string | null
      unit?: string
      volume_delta?: number | null
      unit_price?: number | null
      notes?: string
      sort_order?: number
    }
  }>(
    '/api/v1/change-orders/:id/items/:itemId',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id, itemId } = request.params
      // T4j: POST .../items di atas SUDAH memanggil coMilikTenant; PUT & DELETE
      // item terlewat — inkonsistensi dalam satu file yang sama.
      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }

      const { data: existing } = await supabase
        .from('change_orders')
        .select('id, status')
        .eq('id', id)
        .single()

      if (!existing) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (existing.status !== 'draft') {
        return reply.status(400).send({ error: 'Tidak bisa mengubah item change order yang sudah disubmit' })
      }

      const { item_type, description, amount_delta, rab_item_id, unit, volume_delta, unit_price, notes, sort_order } = request.body
      const updates: Record<string, unknown> = {}
      if (item_type !== undefined)    updates.item_type    = item_type
      if (description !== undefined)  updates.description  = description.trim()
      if (amount_delta !== undefined)  updates.amount_delta = amount_delta
      if (rab_item_id !== undefined)  updates.rab_item_id  = rab_item_id || null
      if (unit !== undefined)         updates.unit         = unit || null
      if (volume_delta !== undefined) updates.volume_delta = volume_delta
      if (unit_price !== undefined)   updates.unit_price   = unit_price
      if (notes !== undefined)        updates.notes        = notes?.trim() || null
      if (sort_order !== undefined)   updates.sort_order   = sort_order

      const { data: item, error } = await supabase
        .from('change_order_items')
        .update(updates)
        .eq('id', itemId)
        .eq('change_order_id', id)
        .select(`
          id, change_order_id, item_type, rab_item_id, description,
          unit, volume_delta, unit_price, amount_delta, notes, sort_order,
          rab_item:rab_items ( id, name, category_code, level )
        `)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal memperbarui item change order' })
      }

      await recalcTotalDelta(id)

      return reply.send({ data: item })
    }
  )

  // ── DELETE /api/v1/change-orders/:id/items/:itemId ─────────────────────────
  app.delete<{ Params: { id: string; itemId: string } }>(
    '/api/v1/change-orders/:id/items/:itemId',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id, itemId } = request.params
      // T4j: POST .../items di atas SUDAH memanggil coMilikTenant; PUT & DELETE
      // item terlewat — inkonsistensi dalam satu file yang sama.
      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }

      const { data: existing } = await supabase
        .from('change_orders')
        .select('id, status')
        .eq('id', id)
        .single()

      if (!existing) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (existing.status !== 'draft') {
        return reply.status(400).send({ error: 'Tidak bisa menghapus item change order yang sudah disubmit' })
      }

      const { error } = await supabase
        .from('change_order_items')
        .delete()
        .eq('id', itemId)
        .eq('change_order_id', id)

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menghapus item change order' })
      }

      await recalcTotalDelta(id)

      return reply.send({ success: true })
    }
  )

  // ── PATCH /api/v1/change-orders/:id/submit ─────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/change-orders/:id/submit',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }

      const { data: co } = await supabase
        .from('change_orders')
        .select('id, status, project_id, title, co_number, total_amount_delta')
        .eq('id', id)
        .single()

      if (!co) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (co.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya change order berstatus draft yang bisa disubmit' })
      }

      // Cek ada minimal 1 item
      const { count } = await supabase
        .from('change_order_items')
        .select('id', { count: 'exact', head: true })
        .eq('change_order_id', id)

      if (!count || count === 0) {
        return reply.status(400).send({ error: 'Change order harus memiliki minimal 1 item sebelum disubmit' })
      }

      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status:       'submitted',
          submitted_at: new Date().toISOString(),
          submitted_by: request.currentUser!.id,
        })
        .eq('id', id)
        .select(CO_SELECT)
        .single()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal mengsubmit change order' })
      }

      // Fire-and-forget: notif ke admin + PM
      ;(async () => {
        try {
          const recipients = await resolveRecipients('change_order_submitted', { projectId: co.project_id, companyId: request.companyId! })
          const { data: proj } = await request.db!.from('projects').select('name').eq('id', co.project_id).single()
          const deltaText = co.total_amount_delta >= 0
            ? `+Rp ${Math.abs(co.total_amount_delta).toLocaleString('id-ID')}`
            : `-Rp ${Math.abs(co.total_amount_delta).toLocaleString('id-ID')}`

          createNotifications(recipients.map(uid => ({
            company_id: request.companyId!,
            user_id:     uid,
            title:       'Change Order Disubmit',
            message:     `${co.co_number} "${co.title}" (${deltaText}) di proyek ${proj?.name ?? ''} menunggu persetujuan`,
            type:        'change_order_submitted' as const,
            priority:    'high' as const,
            project_id:  co.project_id,
            action_url:  `/proyek/${co.project_id}?tab=change-order`,
            action_type: 'view_change_order',
            /*
              `record_id` WAJIB — dan kunci lamanya DIPERTAHANKAN.

              Sebelum ini kolom ini hanya berisi kunci bernama sendiri, jadi
              `record_id`-nya NULL. Akibatnya jenis ini kebal dedup DAN tak
              terlihat `audit-notifikasi-tak-kembar`, yang sengaja melewati
              baris ber-record_id NULL.

              Cacat yang sama sudah ditemukan dan diperbaiki tiga kali di repo
              ini: `mandor.ts` 2026-08-14, `kasbons.ts` dan berkas ini
              2026-08-16. Sekarang dijaga `audit-notifikasi-punya-record.mjs`.

              Kunci lamanya tetap ditulis: ia kontrak dengan halaman notifikasi,
              dan menghapusnya perubahan terpisah yang menuntut pemeriksaan
              sendiri.
            */
            action_data: { record_id: id, change_order_id: id },
          })))
        } catch (err) {
          // best-effort: notifikasi tak boleh membatalkan tindakan yang sudah sah.
          // Tapi TIDAK ditelan — rantai notifikasi pernah putus berbulan-bulan
          // tanpa satu pun gejala (Web Push, 2026-08-01), dan `catch {}` adalah
          // persis tempat gejala itu seharusnya muncul.
          request.log.error({ err }, 'notifikasi gagal dikirim')
        }
      })()

      return reply.send({ data })
    }
  )

  // ── PATCH /api/v1/change-orders/:id/approve ────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    // F2 (AKTA 0 lockout fix): otorisasi via capability `change_order:approve`
    // (di-seed ke admin, migration 084 — scope identik), BUKAN role literal 'admin'.
    // 2A-5 (ADR-007): siapa yang boleh & berapa level kini dibaca dari rantai
    // approval (config), bukan satu requirePermission tetap. Seed = 1 langkah
    // dengan permission yang sama persis → perilaku hari ini tidak berubah.
    '/api/v1/change-orders/:id/approve',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.currentUser!
      const { id } = request.params


      // Gerbang KASAR sebelum entitas di-fetch: menjaga urutan lama 403-sebelum-404
      // (tak berwenang tidak boleh tahu apakah id-nya ada).
      const coarse = await canParticipateInChain(request, 'change_order')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      // T4h: gerbang tenant SETELAH gerbang izin — urutan 403-sebelum-404 yang
      // sudah ada sengaja dipertahankan (user tak berwenang tak boleh tahu
      // apakah id-nya ada).
      if (!(await coMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Change Order tidak ditemukan' })
      }

      const { data: coFull } = await supabase
        .from('change_orders')
        .select(`
          id, status, project_id, co_number, title, total_amount_delta, billing_mode,
          items:change_order_items ( id, item_type, rab_item_id, description, unit, volume_delta, unit_price, amount_delta )
        `)
        .eq('id', id)
        .single()

      if (!coFull) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (coFull.status !== 'submitted') {
        return reply.status(400).send({ error: 'Hanya change order berstatus submitted yang bisa diapprove' })
      }

      // Dasar syarat nominal = NILAI MUTLAK delta. CO kerja kurang −500jt sama
      // signifikannya dengan kerja tambah +500jt; keduanya mengubah nilai kontrak
      // sebesar itu, jadi ambang "di atas Rp X naik ke direktur" harus kena dua-duanya.
      const decision = await evaluateEntityApproval(request, {
        entityType: 'change_order', entityId: id,
        amount: Math.abs(Number(coFull.total_amount_delta) || 0),
      })
      // Gagal baca konfigurasi TIDAK boleh menyamar jadi "tidak berhak" (Phase 1 §4E).
      if (decision.configError) {
        app.log.error({ configError: decision.configError, id }, 'evaluasi rantai approval gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'Change order sudah disetujui penuh' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      // Catat persetujuan level ini. Bila BUKAN langkah terakhir, CO TETAP
      // 'submitted' — nilai kontrak baru berubah di langkah final.
      // TJS-P4 — pengaju tak boleh menyetujui pengajuannya sendiri.
      const sod = await periksaGerbangSod(request, 'change_order', id, {
        alasanOverride: (request.body as { alasan_override?: string } | undefined)?.alasan_override,
        level: decision.step?.level,
      })
      if (!sod.ok) return reply.status(403).send({ error: sod.pesan })
      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'change_order', entityId: id, level: decision.step.level, approvedBy: user.id, companyId: request.companyId!,
        })
        if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

        if (!decision.isFinalStep) {
          const next = decision.applicable.find(s => s.level > decision.step!.level)
          void logAuditEvent(request, {
            tableName: 'change_orders', recordId: id, action: 'change_order.approval.level',
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
            actorId: user.id, newValues: { level: decision.step.level, of: decision.applicable.length },
            severity: 'critical',
          })
          return reply.send({
            data: null,
            pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu persetujuan level ${next?.level ?? '-'}.`,
          })
        }
      }

      // ── CARA PENAGIHAN diperiksa SEBELUM apa pun disentuh ──────────────
      //
      // `billing_mode` ada sejak migrasi 053 dan diterima rute ini sejak awal,
      // tetapi disisir 2026-08-13: TAK SATU PUN baris kode membacanya. Ketiga
      // nilainya hanya muncul di CHECK constraint yang mendefinisikannya.
      //
      // Akibatnya langkah 2 di bawah menaikkan `contract_value` untuk SEMUA CO
      // yang disetujui — termasuk yang ditandai `separate_co`, yang justru
      // berarti "jangan tagih lewat termin". IPC lalu menagihnya lewat progres,
      // dan bila tagihan terpisahnya juga terbit, pekerjaan yang sama tertagih
      // dua kali tanpa satu pun galat.
      const caraTagih = periksaPenyetujuanCo({
        billingMode: coFull.billing_mode,
        deltaNilai: coFull.total_amount_delta,
      })
      if (!caraTagih.boleh) {
        return reply.status(422).send({ error: caraTagih.sebab })
      }

      // Get current project contract_value and RAB total
      const { data: project } = await request.db!
        .from('projects')
        .select('id, name, contract_value, pm_id')
        .eq('id', coFull.project_id)
        .single()

      if (!project) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: rabTotal } = await supabase
        .from('rab_items')
        .select('total_price')
        .eq('project_id', coFull.project_id)
        .eq('level', 'category')

      const currentRabTotal = (rabTotal ?? []).reduce((s: number, r: { total_price: number }) => s + (r.total_price ?? 0), 0)

      // 1. Update change_order status + save baseline snapshot
      //
      // ── KLAIM ATOMIK: status LAMA ikut di WHERE (TJS-A0, 2026-08-09)
      //
      // Tanpa `.neq('status', 'approved')`, dua approval yang tiba bersamaan
      // sama-sama lolos sampai sini, dan LANGKAH 2 di bawah menambahkan
      // `total_amount_delta` DUA KALI ke `contract_value` — karena keduanya
      // membaca `project.contract_value` yang sama sebelum salah satu menulis.
      //
      // Akibatnya nilai kontrak membengkak tanpa satu pun error, tanpa test
      // merah, dan tanpa gejala sampai ada yang membandingkan dengan dokumen
      // kontrak aslinya.
      //
      // `.neq` (bukan `.eq('status','pending')`) karena CO bisa sah disetujui
      // dari beberapa status awal; yang dilarang hanyalah menyetujui yang
      // SUDAH disetujui.
      const { data: updatedCo, error: coErr } = await supabase
        .from('change_orders')
        .update({
          status:                  'approved',
          approved_at:             new Date().toISOString(),
          approved_by:             user.id,
          baseline_contract_value: project.contract_value,
          baseline_rab_total:      currentRabTotal,
        })
        .eq('id', id)
        .neq('status', 'approved')
        .select(CO_SELECT)
        .maybeSingle()

      if (coErr) {
        app.log.error(coErr)
        return reply.status(500).send({ error: 'Gagal menyetujui change order' })
      }
      if (!updatedCo) {
        // Nol baris terkena = CO ini sudah disetujui request lain sepersekian
        // detik lalu. BERHENTI DI SINI — langkah 2 belum berjalan, jadi
        // `contract_value` belum tersentuh dan tak ada yang perlu dibatalkan.
        request.log.warn({ coId: id }, 'approval change order serentak ditolak')
        return reply.status(409).send({
          error: 'Change order ini baru saja disetujui dari tempat lain. Muat ulang halaman.',
        })
      }

      // 2. Update projects.contract_value
      //
      // Aman dijalankan sekarang: langkah 1 sudah membuktikan KITA yang
      // memenangkan klaim status, jadi hanya satu request yang pernah sampai
      // ke baris ini untuk CO ini.
      //
      // Hasilnya tetap DIPERIKSA — nilai kontrak adalah angka yang dipakai
      // seluruh laporan, dan kegagalan senyap di sini berarti CO tercatat
      // disetujui sementara nilainya tak pernah berubah.
      // HANYA `include_termin` yang menaikkan nilai kontrak. Dua cara lain
      // ditagih di luar jalur termin; menaikkannya membuat IPC ikut menagih.
      const newContractValue = caraTagih.naikkanKontrak
        ? (project.contract_value ?? 0) + coFull.total_amount_delta
        : (project.contract_value ?? 0)
      // `.select('id')` supaya NOL BARIS terbarui tak menyamar jadi sukses.
      // Ini yang paling mahal kalau lolos: change order tercatat disetujui,
      // nilai kontrak proyek TIDAK berubah, dan selisihnya baru ketahuan saat
      // penagihan — persis kegagalan senyap yang penjaga ini cari.
      const { data: proyekTerbarui, error: projErr } = await request.db!
        .from('projects')
        .update({ contract_value: newContractValue })
        .eq('id', coFull.project_id)
        .select('id')
      if (!projErr && (!proyekTerbarui || proyekTerbarui.length === 0)) {
        app.log.error({ coId: id, projectId: coFull.project_id },
          'CO disetujui tetapi NOL baris projects terbarui — proyeknya tak terjangkau')
        return reply.status(500).send({
          error: 'Change order disetujui, tetapi nilai kontrak gagal diperbarui: proyek tidak ditemukan',
        })
      }
      if (projErr) {
        app.log.error({ err: projErr, coId: id, projectId: coFull.project_id },
          'CO disetujui tetapi contract_value gagal diperbarui')
        return reply.status(500).send({
          error: 'Change order disetujui, tetapi nilai kontrak gagal diperbarui: ' +
                 projErr.message + '. Periksa manual sebelum menerbitkan tagihan.',
        })
      }

      // 3. Log to audit_logs via helper terpusat (severity critical — contract.value
      //    berubah). diff/ip/user_agent diisi otomatis oleh logAuditEvent.
      void logAuditEvent(request, {
        tableName: 'change_orders',
        recordId: id,
        action: 'change_order_approved',
        actorId: user.id,
        oldValues: { contract_value: project.contract_value },
        newValues: { contract_value: newContractValue },
        severity: 'critical',
        reason: `CO ${coFull.co_number} approved (delta ${coFull.total_amount_delta})`,
      })

      // 4. Fire-and-forget: notify PM + submitter
      ;(async () => {
        try {
          const recipients = new Set<string>()
          if (project.pm_id) recipients.add(project.pm_id)

          const { data: coWithSubmitter } = await supabase
            .from('change_orders')
            .select('submitted_by')
            .eq('id', id)
            .single()
          if (coWithSubmitter?.submitted_by) recipients.add(coWithSubmitter.submitted_by)

          const deltaText = coFull.total_amount_delta >= 0
            ? `+Rp ${Math.abs(coFull.total_amount_delta).toLocaleString('id-ID')}`
            : `-Rp ${Math.abs(coFull.total_amount_delta).toLocaleString('id-ID')}`

          createNotifications(Array.from(recipients).map(uid => ({
            company_id: request.companyId!,
            user_id:     uid,
            title:       'Change Order Disetujui',
            message:     `${coFull.co_number} "${coFull.title}" (${deltaText}) telah disetujui. Nilai kontrak baru: Rp ${newContractValue.toLocaleString('id-ID')}`,
            type:        'change_order_approved' as const,
            priority:    'high' as const,
            project_id:  coFull.project_id,
            action_url:  `/proyek/${coFull.project_id}?tab=change-order`,
            action_type: 'view_change_order',
            action_data: { record_id: id, change_order_id: id },
          })))
        } catch (err) {
          // best-effort: notifikasi tak boleh membatalkan tindakan yang sudah sah.
          // Tapi TIDAK ditelan — rantai notifikasi pernah putus berbulan-bulan
          // tanpa satu pun gejala (Web Push, 2026-08-01), dan `catch {}` adalah
          // persis tempat gejala itu seharusnya muncul.
          request.log.error({ err }, 'notifikasi gagal dikirim')
        }
      })()

      return reply.send({ data: updatedCo })
    }
  )

  // ── PATCH /api/v1/change-orders/:id/reject ─────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { reason?: string }
  }>(
    // F3 (AKTA 0 lockout fix): capability `change_order:approve` (approve+reject
    // satu authority), BUKAN role literal 'admin'.
    // 2A-5: otoritas menolak = ikut rantai yang sama — siapa pun yang berhak
    // menyetujui di level mana pun boleh menolak, seperti pola kasbon.
    '/api/v1/change-orders/:id/reject',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params

      const user = request.currentUser!

      const coarse = await canParticipateInChain(request, 'change_order')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: coInfo } = await supabase
        .from('change_orders')
        .select('id, status, project_id, co_number, title, submitted_by')
        .eq('id', id)
        .single()

      if (!coInfo) return reply.status(404).send({ error: 'Change order tidak ditemukan' })
      if (coInfo.status !== 'submitted') {
        return reply.status(400).send({ error: 'Hanya change order berstatus submitted yang bisa ditolak' })
      }

      // Cek `status !== 'submitted'` di atas TERPISAH dari penulisan ini, jadi
      // ada jeda tempat request lain bisa menyetujui/menolak CO yang sama.
      // Status ikut di WHERE supaya pemeriksaan dan penulisan jadi satu operasi
      // di level DB (TJS-A0, 2026-08-09).
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status:          'rejected',
          rejected_at:     new Date().toISOString(),
          rejected_by:     user.id,
          rejected_reason: request.body.reason?.trim() || null,
        })
        .eq('id', id)
        .eq('status', 'submitted')
        .select(CO_SELECT)
        .maybeSingle()

      if (error) {
        app.log.error(error)
        return reply.status(500).send({ error: 'Gagal menolak change order' })
      }
      if (!data) {
        request.log.warn({ coId: id }, 'penolakan change order serentak ditolak')
        return reply.status(409).send({
          error: 'Change order ini baru saja diproses dari tempat lain. Muat ulang halaman.',
        })
      }

      // Ditolak → jejak persetujuan dibersihkan supaya rantai mulai dari level 1
      // lagi bila CO ini diajukan ulang.
      await clearApprovalProgress('change_order', id, request.companyId!)

      // Fire-and-forget: notify submitter
      ;(async () => {
        try {
          if (!coInfo.submitted_by) return
          const { data: proj } = await request.db!.from('projects').select('name').eq('id', coInfo.project_id).single()

          createNotifications([{
            company_id: request.companyId!,
            user_id:     coInfo.submitted_by,
            title:       'Change Order Ditolak',
            message:     `${coInfo.co_number} "${coInfo.title}" di proyek ${proj?.name ?? ''} ditolak${request.body.reason ? `: ${request.body.reason}` : ''}`,
            type:        'change_order_rejected' as const,
            priority:    'high' as const,
            project_id:  coInfo.project_id,
            action_url:  `/proyek/${coInfo.project_id}?tab=change-order`,
            action_type: 'view_change_order',
            action_data: { record_id: id, change_order_id: id },
          }])
        } catch (err) {
          // best-effort: notifikasi tak boleh membatalkan tindakan yang sudah sah.
          // Tapi TIDAK ditelan — rantai notifikasi pernah putus berbulan-bulan
          // tanpa satu pun gejala (Web Push, 2026-08-01), dan `catch {}` adalah
          // persis tempat gejala itu seharusnya muncul.
          request.log.error({ err }, 'notifikasi gagal dikirim')
        }
      })()

      return reply.send({ data })
    }
  )
}
