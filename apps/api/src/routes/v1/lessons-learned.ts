import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { validasiPelajaran } from '../../lib/pelajaran.js'
import {
  evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain, idAlurPersetujuan , periksaGerbangSod } from '../../utils/approval.js'

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


  // ── GET /api/v1/lessons-learned ──────────────────────────────────────────
  //
  // Endpoint yang selama ini HILANG. Diukur 2026-08-13: modul ini punya tabel,
  // empat trigger (immutable, no-delete, transisi status, touch), fungsi
  // propagasi atomik, tiga PATCH untuk alur persetujuan, dan lima test — tetapi
  // **tak ada GET dan tak ada POST**.
  //
  // Artinya pelajaran tak bisa dibuat maupun dilihat lewat aplikasi. Ia hanya
  // bisa DISETUJUI — kalau ada yang menyisipkannya lewat SQL. Nol menu, nol
  // halaman, nol entri Peta Modul; modulnya tak terlihat dari mana pun.
  //
  // Ini yang membedakan CAPA dari sekadar perbaikan: sisi korektif (memperbaiki
  // cacat yang sudah terjadi) hidup di NCR, sedangkan sisi PREVENTIF — mengubah
  // angka yang dipakai merencanakan supaya kesalahan yang sama tak terulang —
  // ada di sini, dan selama ini tak terjangkau.
  app.get<{ Querystring: { project_id?: string; status?: string } }>(
    '/api/v1/lessons-learned',
    { preHandler: [authenticate, requirePermission('cecep:lessons:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      const idProyek = await db.projectIds()
      if (idProyek.length === 0) return reply.send({ lessons: [], total: 0 })

      if (q.project_id && !idProyek.includes(q.project_id)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let query = db
        .unsafe('lessons_learned_records', 'kategori C; disaring project_id lewat projectIds() di baris berikutnya')
        .select(`
          id, project_id, title, summary, status, planned_amount, actual_amount,
          variance_amount, approved_at, propagated_at, created_at,
          proyek:projects ( id, name ),
          usulan:lesson_propagation_proposals ( id, target_type, proposed_value, created_record_id ),
          akar:root_cause_analyses ( id, description, category, sort_order )
        `, { count: 'exact' })
        .in('project_id', q.project_id ? [q.project_id] : idProyek)
        .order('created_at', { ascending: false })

      if (q.status) query = query.eq('status', q.status)

      const { data, error, count } = await query
      if (error) return reply.status(500).send({ error: error.message })

      return reply.send({ lessons: data ?? [], total: count ?? 0 })
    },
  )

  // ── POST /api/v1/lessons-learned ─────────────────────────────────────────
  //
  // Pelajaran lahir sebagai `draft`, beserta akar masalah dan usulan
  // propagasinya sekaligus. Ketiganya dalam satu permintaan karena pelajaran
  // tanpa usulan tak mengubah apa pun saat disetujui — dan pelajaran tanpa
  // akar masalah adalah keluhan, bukan pelajaran.
  app.post(
    '/api/v1/lessons-learned',
    { preHandler: [authenticate, requirePermission('cecep:lessons:manage')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body as {
        project_id?: string
        title?: string
        summary?: string
        estimate_version_id?: string
        cost_code_id?: string
        planned_amount?: number | string
        actual_amount?: number | string
        akar?: Array<{ description?: string; category?: string }>
        usulan?: Array<{
          target_type?: string; resource_id?: string; cost_code_id?: string
          proposed_value?: number | string
        }>
      }

      const v = validasiPelajaran(b)
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      if (!(await db.projectIds()).includes(v.nilai.project_id)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: rec, error } = await db
        .unsafe('lessons_learned_records', 'project_id sudah diverifikasi lewat projectIds() di atas')
        .insert({
          project_id: v.nilai.project_id,
          title: v.nilai.title,
          summary: v.nilai.summary,
          estimate_version_id: b.estimate_version_id ?? null,
          cost_code_id: b.cost_code_id ?? null,
          planned_amount: v.nilai.planned_amount,
          actual_amount: v.nilai.actual_amount,
          created_by: request.currentUser!.id,
        })
        .select('id, title, status, planned_amount, actual_amount, variance_amount')
        .single()

      if (error) return reply.status(500).send({ error: error.message })

      const lessonId = (rec as { id: string }).id

      // Akar masalah & usulan ditulis SESUDAH induknya ada. Kalau salah satu
      // gagal, pelajarannya tetap tersimpan sebagai draft tanpa keduanya —
      // dan itu keadaan yang bisa diperbaiki manusia, bukan baris hantu.
      // Karena itu kegagalannya DILAPORKAN, bukan ditelan.
      if (v.nilai.akar.length > 0) {
        const { error: eAkar } = await db
          .viaProject('root_cause_analyses', lessonId)
          .insert(v.nilai.akar.map((a, i) => ({
            lesson_id: lessonId,
            description: a.description,
            category: a.category,
            sort_order: i,
          })))
        if (eAkar) {
          return reply.status(500).send({
            error: `Pelajaran tersimpan sebagai draft, tetapi akar masalahnya gagal ditulis: ${eAkar.message}`,
          })
        }
      }

      if (v.nilai.usulan.length > 0) {
        const { error: eUsul } = await db
          .viaProject('lesson_propagation_proposals', lessonId)
          .insert(v.nilai.usulan.map((u) => ({
            lesson_id: lessonId,
            target_type: u.target_type,
            resource_id: u.resource_id,
            cost_code_id: u.cost_code_id,
            proposed_value: u.proposed_value,
          })))
        if (eUsul) {
          return reply.status(500).send({
            error: `Pelajaran tersimpan sebagai draft, tetapi usulan propagasinya gagal ditulis: ${eUsul.message}`,
          })
        }
      }

      await logAuditEvent(request, {
        tableName: 'lessons_learned_records',
        recordId: lessonId,
        action: 'create',
        actorId: request.currentUser!.id,
        newValues: {
          title: v.nilai.title,
          jumlah_akar: v.nilai.akar.length,
          jumlah_usulan: v.nilai.usulan.length,
        },
      })

      return reply.status(201).send({
        lesson: rec,
        jumlah_akar: v.nilai.akar.length,
        jumlah_usulan: v.nilai.usulan.length,
      })
    },
  )

  // ── PATCH /submit — draft → under_review ────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/lessons-learned/:id/submit',
    { preHandler: [authenticate, requirePermission('cecep:lessons:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: l } = await supabase
        .from('lessons_learned_records').select('id, status').eq('id', id)
        .in('project_id', await request.db!.projectIds()).maybeSingle()
      if (!l) return reply.status(404).send({ error: 'Lessons Learned tidak ditemukan' })
      if (l.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya lessons learned draft yang bisa diajukan' })
      }
      const { error } = await supabase.from('lessons_learned_records')
        .update({ status: 'under_review', updated_by: request.currentUser!.id }).eq('id', id)
        .in('project_id', await request.db!.projectIds())
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'lessons_learned_records', recordId: id, action: 'lessons.submitted',
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
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
        .from('lessons_learned_records').select('id, status, variance_amount').eq('id', id)
        .in('project_id', await request.db!.projectIds()).maybeSingle()
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

      // TJS-P4 — pengaju tak boleh menyetujui pengajuannya sendiri.
      const sod = await periksaGerbangSod(request, 'lessons_learned', id, {
        alasanOverride: (request.body as { alasan_override?: string } | undefined)?.alasan_override,
        level: decision.step?.level,
      })
      if (!sod.ok) return reply.status(403).send({ error: sod.pesan })
      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'lessons_learned', entityId: id, level: decision.step.level, approvedBy: user.id, companyId: request.companyId!,
        })
        if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

        if (!decision.isFinalStep) {
          const next = decision.applicable.find(s => s.level > decision.step!.level)
          void logAuditEvent(request, {
            tableName: 'lessons_learned_records', recordId: id, action: 'lessons.approval.level',
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
            actorId: user.id, newValues: { level: decision.step.level, of: decision.applicable.length }, severity: 'critical',
          })
          return reply.send({ ok: true, pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu level ${next?.level ?? '-'}.` })
        }
      }

      // Langkah final: set approved, lalu PROPAGASI ATOMIK (fungsi DB) → propagated.
      // Status LAMA ikut di WHERE: approve = memicu propagasi write-back, jadi
      // dua approval bersamaan berarti propagasi berjalan dua kali
      // (TJS-A0, 2026-08-09).
      const { data: llApp, error: upErr } = await supabase.from('lessons_learned_records')
        .update({ status: 'approved', approved_by: user.id, updated_by: user.id }).eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .neq('status', 'approved').select('id').maybeSingle()
      if (upErr) return reply.status(500).send({ error: upErr.message })
      if (!llApp) {
        request.log.warn({ lessonId: id }, 'approval lesson learned serentak ditolak')
        return reply.status(409).send({
          error: 'Lesson ini baru saja disetujui dari tempat lain. Muat ulang halaman.',
        })
      }

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
        .from('lessons_learned_records').select('id, status').eq('id', id)
        .in('project_id', await request.db!.projectIds()).maybeSingle()
      if (!l) return reply.status(404).send({ error: 'Lessons Learned tidak ditemukan' })
      if (l.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya lessons learned under_review yang bisa ditolak' })
      }

      await clearApprovalProgress('lessons_learned', id, request.companyId!)
      const { error } = await supabase.from('lessons_learned_records')
        .update({ status: 'draft', updated_by: user.id }).eq('id', id)
        .in('project_id', await request.db!.projectIds())
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'lessons_learned_records', recordId: id, action: 'lessons.rejected',
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
        actorId: user.id,
        newValues: { status: 'draft', reason: request.body?.reason ?? null },
        // Kolom `reason`, bukan hanya di dalam JSON — lihat catatan di
        // `estimate-versions.ts` (penolakan tanpa alasan yang bisa dicari).
        reason: request.body?.reason ?? undefined,
        severity: 'warning',
      })
      return reply.send({ ok: true, status: 'draft' })
    })
}
