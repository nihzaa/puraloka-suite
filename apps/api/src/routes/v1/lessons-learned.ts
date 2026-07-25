import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain,
} from '../../utils/approval.js'

// CECEP Milestone 4 — Lessons Learned WRITE-BACK, lewat engine approval ADR-007
// (titik ke-3 dari `47` §3). Company Intelligence Loop DENGAN gerbang manusia:
// approve lesson (via engine) = commit usulan propagasi. "AI tidak boleh langsung
// belajar. Harus ada approval." (verbatim founder).
//
// Alur: draft --submit--> under_review --approve(engine, FINAL)--> approved
//         --(propagasi ATOMIK via fn_propagate_lesson)--> propagated
//       under_review --reject--> draft
//
// Propagasi membuat VERSI BARU (source='variance') di Productivity/Price Book,
// PERSIS dari lesson_propagation_proposals yang disetujui. Tak pernah mutate versi
// lama (immutability M1-M2 menegakkan). Atomik lewat fungsi DB.

export default async function lessonsLearnedRoutes(app: FastifyInstance) {

  // ── PATCH /submit — draft → under_review ────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/lessons-learned/:id/submit',
    { preHandler: [authenticate, requirePermission('cecep:lessons:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: l } = await supabase
        .from('lessons_learned_records').select('id, status').eq('id', id).maybeSingle()
      if (!l) return reply.status(404).send({ error: 'Lessons Learned tidak ditemukan' })
      if (l.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya lessons learned draft yang bisa diajukan' })
      }
      const { error } = await supabase.from('lessons_learned_records')
        .update({ status: 'under_review', updated_by: request.currentUser!.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'lessons_learned_records', recordId: id, action: 'lessons.submitted',
        actorId: request.currentUser!.id, newValues: { status: 'under_review' }, severity: 'warning',
      })
      return reply.send({ ok: true, status: 'under_review' })
    })

  // ── PATCH /approve — via ENGINE → propagasi (write-back ke knowledge base) ──
  app.patch<{ Params: { id: string } }>(
    '/api/v1/lessons-learned/:id/approve',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const user = request.currentUser!

      const coarse = await canParticipateInChain(request, 'lessons_learned')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval lessons gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: l } = await supabase
        .from('lessons_learned_records').select('id, status, variance_amount').eq('id', id).maybeSingle()
      if (!l) return reply.status(404).send({ error: 'Lessons Learned tidak ditemukan' })
      if (l.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya lessons learned under_review yang bisa disetujui' })
      }

      // Basis ambang = |variance| (dampak variance bisa jadi syarat eskalasi).
      const decision = await evaluateEntityApproval(request, {
        entityType: 'lessons_learned', entityId: id, amount: Math.abs(Number(l.variance_amount) || 0),
      })
      if (decision.configError) {
        app.log.error({ configError: decision.configError, id }, 'evaluasi rantai approval lessons gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') return reply.status(409).send({ error: 'Sudah disetujui penuh' })
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'lessons_learned', entityId: id, level: decision.step.level, approvedBy: user.id,
        })
        if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

        if (!decision.isFinalStep) {
          const next = decision.applicable.find(s => s.level > decision.step!.level)
          void logAuditEvent(request, {
            tableName: 'lessons_learned_records', recordId: id, action: 'lessons.approval.level',
            actorId: user.id, newValues: { level: decision.step.level, of: decision.applicable.length }, severity: 'critical',
          })
          return reply.send({ ok: true, pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu level ${next?.level ?? '-'}.` })
        }
      }

      // Langkah final: set approved, lalu PROPAGASI ATOMIK (fungsi DB) → propagated.
      const { error: upErr } = await supabase.from('lessons_learned_records')
        .update({ status: 'approved', approved_by: user.id, updated_by: user.id }).eq('id', id)
      if (upErr) return reply.status(500).send({ error: upErr.message })

      const { data: propagated, error: propErr } = await supabase.rpc('fn_propagate_lesson', {
        p_lesson_id: id, p_approver: user.id,
      })
      if (propErr) {
        // Propagasi gagal (atomik → tak ada versi setengah jadi). Lesson tetap
        // 'approved' — bisa dicoba lagi. JANGAN diam-diam anggap sukses.
        app.log.error({ propErr, id }, 'propagasi lessons learned gagal')
        return reply.status(500).send({ error: 'Approval tercatat tapi propagasi gagal: ' + propErr.message })
      }

      void logAuditEvent(request, {
        tableName: 'lessons_learned_records', recordId: id, action: 'lessons.propagated',
        actorId: user.id,
        newValues: { status: 'propagated', propagated: propagated ?? [] }, severity: 'critical',
      })
      return reply.send({ ok: true, status: 'propagated', propagated: propagated ?? [] })
    })

  // ── PATCH /reject — under_review → draft ────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/v1/lessons-learned/:id/reject',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const user = request.currentUser!

      const coarse = await canParticipateInChain(request, 'lessons_learned')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval lessons gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: l } = await supabase
        .from('lessons_learned_records').select('id, status').eq('id', id).maybeSingle()
      if (!l) return reply.status(404).send({ error: 'Lessons Learned tidak ditemukan' })
      if (l.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya lessons learned under_review yang bisa ditolak' })
      }

      await clearApprovalProgress('lessons_learned', id)
      const { error } = await supabase.from('lessons_learned_records')
        .update({ status: 'draft', updated_by: user.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'lessons_learned_records', recordId: id, action: 'lessons.rejected',
        actorId: user.id, newValues: { status: 'draft', reason: request.body?.reason ?? null }, severity: 'warning',
      })
      return reply.send({ ok: true, status: 'draft' })
    })
}
