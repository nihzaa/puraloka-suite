import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain,
} from '../../utils/approval.js'

// CECEP Milestone 3 — approval Estimate Version LEWAT engine ADR-007 (bukan jalur
// approval kelima). Keputusan founder pasca-discovery + mandat `47` §3 CECEP
// ("reuse RBAC existing, satu mekanisme"). Pola IDENTIK 4 modul existing (kasbon,
// change_order, material_request, project_expense).
//
// Alur status Estimate Version (guard struktural di DB, migration 110+111):
//   draft --submit--> under_review --approve(engine)--> approved --> frozen/superseded
//                     under_review --reject--> draft
// `estimate_versions.status` tetap sumber kebenaran; engine hanya gerbang SIAPA
// yang boleh menyetujui (ADR-007).

export default async function estimateVersionRoutes(app: FastifyInstance) {

  // ── PATCH /submit — draft → under_review (author mengajukan) ────────────────
  // Submit = tindakan penyusun (manage), BUKAN approval. Perlu minimal 1 item
  // supaya tak mengajukan estimasi kosong.
  app.patch<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/submit',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya Estimate Version draft yang bisa diajukan' })
      }
      const { count } = await supabase
        .from('estimate_items').select('id', { count: 'exact', head: true }).eq('estimate_version_id', id)
      if ((count ?? 0) === 0) {
        return reply.status(400).send({ error: 'Estimate Version kosong — tambahkan minimal satu item' })
      }

      const { error } = await supabase.from('estimate_versions')
        .update({ status: 'under_review', updated_by: request.currentUser!.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.submitted',
        actorId: request.currentUser!.id, newValues: { status: 'under_review' }, severity: 'warning',
      })
      return reply.send({ ok: true, status: 'under_review' })
    })

  // ── PATCH /approve — under_review → approved via ENGINE ─────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/approve',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const user = request.currentUser!

      // Gerbang KASAR sebelum fetch entitas → urutan 403-sebelum-404 (Phase 1).
      const coarse = await canParticipateInChain(request, 'estimate_version')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval estimasi gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status, total_amount').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya Estimate Version under_review yang bisa disetujui' })
      }

      // total_amount = basis ambang nominal (opsional; step tanpa min_amount = selalu).
      const decision = await evaluateEntityApproval(request, {
        entityType: 'estimate_version', entityId: id, amount: Number(v.total_amount) || 0,
      })
      if (decision.configError) {
        app.log.error({ configError: decision.configError, id }, 'evaluasi rantai approval estimasi gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'Estimasi sudah disetujui penuh' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'estimate_version', entityId: id, level: decision.step.level, approvedBy: user.id,
        })
        if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

        // Bukan langkah terakhir → status TETAP under_review, menunggu level berikut.
        if (!decision.isFinalStep) {
          const next = decision.applicable.find(s => s.level > decision.step!.level)
          void logAuditEvent(request, {
            tableName: 'estimate_versions', recordId: id, action: 'estimate.approval.level',
            actorId: user.id, newValues: { level: decision.step.level, of: decision.applicable.length },
            severity: 'critical',
          })
          return reply.send({
            ok: true, pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu persetujuan level ${next?.level ?? '-'}.`,
          })
        }
      }

      // Langkah final → status jadi approved.
      const { error } = await supabase.from('estimate_versions')
        .update({ status: 'approved', approved_by: user.id, updated_by: user.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.approved',
        actorId: user.id, newValues: { status: 'approved', total_amount: v.total_amount }, severity: 'critical',
      })
      return reply.send({ ok: true, status: 'approved' })
    })

  // ── PATCH /reject — under_review → draft (approver menolak) ─────────────────
  app.patch<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/v1/estimate-versions/:id/reject',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const user = request.currentUser!

      const coarse = await canParticipateInChain(request, 'estimate_version')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval estimasi gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya Estimate Version under_review yang bisa ditolak' })
      }

      // Ditolak → jejak persetujuan dibersihkan (rantai mulai dari awal bila diajukan
      // ulang), status kembali ke draft agar bisa direvisi.
      await clearApprovalProgress('estimate_version', id)
      const { error } = await supabase.from('estimate_versions')
        .update({ status: 'draft', updated_by: user.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.rejected',
        actorId: user.id, newValues: { status: 'draft', reason: request.body?.reason ?? null }, severity: 'critical',
      })
      return reply.send({ ok: true, status: 'draft' })
    })
}
