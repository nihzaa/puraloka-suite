import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'

// Kelola rantai approval dari UI (ADR-007 / Phase 2 2A-4).
// Baca = authenticated (UI menampilkan); tulis = approval:chains:manage.
//
// SAFETY: rantai TIDAK BOLEH kosong. Menghapus langkah terakhir membuat
// evaluasi fail-closed → NOL orang bisa menyetujui modul itu (lockout operasional).
// Ditolak eksplisit, seperti prinsip anti-self-lockout di RBAC.

export default async function approvalChainRoutes(app: FastifyInstance) {

  // ── GET /api/v1/approval-chains — semua rantai + langkahnya ────────────────
  app.get('/api/v1/approval-chains', { preHandler: [authenticate] }, async (request, reply) => {
    /*
      DIAMBIL BERHALAMAN — PostgREST memotong di 1.000 baris TANPA GALAT.

      Diukur 2026-08-31: `approval_chains` berisi 1.847 baris, dan pembacaan
      ini memulangkan 1.000. Yang 847 tak pernah terbaca, `error` null, dan
      halaman pengaturan menampilkan daftar rantai persetujuan yang tak
      lengkap — tanpa satu pun gejala.

      ⚠ DIUKUR SESUDAHNYA, DAN ANGKANYA TAK SEBURUK ITU. Baris-baris itu
      tersebar di ratusan tenant; RLS menyaring per-tenant lebih dulu, dan
      tenant terbesar hari ini punya 13 baris. Jadi pemotongan 1.000 BELUM
      pernah menggigit pengguna mana pun.

      Perbaikannya tetap benar — batas itu akan menggigit begitu satu tenant
      melewati 1.000, dan saat itu terjadi ia diam. Tapi klaim "8.179 baris
      tak pernah terbaca" TIDAK akurat: yang tak terbaca adalah baris milik
      tenant LAIN, yang memang tak boleh terbaca.

      Untuk tabel INI akibatnya bukan kosmetik: rantai yang tak terbaca tak
      bisa disunting, dan pemakai menyimpulkan rantainya tidak ada lalu
      membuat yang baru — dua rantai untuk entitas yang sama.

      `.limit()` tak menolong: batas 1.000 itu keras di sisi PostgREST
      (dicatat di `ahsp.ts` sesudah diverifikasi — minta 5.000 tetap dapat
      1.000). Menaikkannya hanya memindahkan ambang, dan cacat yang sama
      kembali diam-diam saat tabelnya tumbuh.

      Dijaga `audit-baca-tak-terpotong.mjs` (ambang NOL).
    */
    const HALAMAN = 1000
    const data: unknown[] = []
    for (let mulai = 0; ; mulai += HALAMAN) {
      const { data: bagian, error } = await request.db!
        .from('approval_chains')
        .select('id, entity_type, label, is_active, approval_steps ( id, level, required_permission, min_amount, max_amount, label )')
        .order('entity_type', { ascending: true })
        .range(mulai, mulai + HALAMAN - 1)
      if (error) return reply.status(500).send({ error: error.message })
      data.push(...(bagian ?? []))
      if (!bagian || bagian.length < HALAMAN) break
    }
    const chains = (data as { approval_steps?: unknown[] }[]).map(c => ({
      ...c,
      approval_steps: [...((c.approval_steps ?? []) as { level: number }[])].sort((a, b) => a.level - b.level),
    }))
    return reply.send({ chains })
  })

  // ── PATCH /api/v1/approval-chains/:entityType — aktif/nonaktif ─────────────
  app.patch<{ Params: { entityType: string }; Body: { is_active?: boolean } }>(
    '/api/v1/approval-chains/:entityType',
    { preHandler: [authenticate, requirePermission('approval:chains:manage')] },
    async (request, reply) => {
      const { entityType } = request.params
      if (typeof request.body?.is_active !== 'boolean') {
        return reply.status(400).send({ error: 'is_active (boolean) wajib' })
      }
      const { data, error } = await request.db!.from('approval_chains')
        .update({ is_active: request.body.is_active, updated_by: request.currentUser!.id, updated_at: new Date().toISOString() })
        .eq('entity_type', entityType).select('entity_type, is_active').maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!data) return reply.status(404).send({ error: 'Rantai tidak ditemukan' })
      void logAuditEvent(request, {
        tableName: 'approval_chains', recordId: entityType, action: 'approval.chain.toggle',
        actorId: request.currentUser!.id, newValues: { is_active: request.body.is_active }, severity: 'critical',
      })
      return reply.send({ chain: data })
    })

  // ── POST /api/v1/approval-chains/:entityType/steps — tambah level ──────────
  app.post<{
    Params: { entityType: string }
    Body: { level?: number; required_permission?: string; min_amount?: number | null; max_amount?: number | null; label?: string }
  }>(
    '/api/v1/approval-chains/:entityType/steps',
    { preHandler: [authenticate, requirePermission('approval:chains:manage')] },
    async (request, reply) => {
      const { entityType } = request.params
      const { level, required_permission, min_amount, max_amount, label } = request.body ?? {}
      if (!required_permission) return reply.status(400).send({ error: 'required_permission wajib' })
      if (level !== undefined && (!Number.isInteger(level) || level < 1)) {
        return reply.status(400).send({ error: 'level harus bilangan bulat >= 1' })
      }
      if (min_amount !== undefined && min_amount !== null && (typeof min_amount !== 'number' || min_amount < 0)) {
        return reply.status(400).send({ error: 'min_amount harus angka >= 0 atau kosong' })
      }
      if (max_amount !== undefined && max_amount !== null && (typeof max_amount !== 'number' || max_amount < 0)) {
        return reply.status(400).send({ error: 'max_amount harus angka >= 0 atau kosong' })
      }
      // Plafon di bawah lantai = langkah yang TAK PERNAH berlaku untuk nilai
      // apa pun. Basis menolaknya lewat CHECK (migrasi 356), tapi ditolak di
      // sini supaya pesannya menyebut sebabnya — bukan galat constraint mentah
      // yang tak memberi tahu angka mana yang salah.
      if (min_amount != null && max_amount != null && max_amount < min_amount) {
        return reply.status(400).send({
          error: `max_amount (${max_amount}) tidak boleh di bawah min_amount (${min_amount}) — langkah itu tak akan pernah berlaku`,
        })
      }

      const { data: chain } = await request.db!.from('approval_chains')
        .select('id, approval_steps ( level )').eq('entity_type', entityType).maybeSingle()
      if (!chain) return reply.status(404).send({ error: 'Rantai tidak ditemukan' })

      const existing = ((chain.approval_steps ?? []) as { level: number }[]).map(s => Number(s.level))
      const nextLevel = level ?? (existing.length ? Math.max(...existing) + 1 : 1)
      if (existing.includes(nextLevel)) {
        return reply.status(409).send({ error: `Level ${nextLevel} sudah ada` })
      }

      const { data, error } = await request.db!.from('approval_steps').insert({
        chain_id: chain.id, level: nextLevel, required_permission,
        min_amount: min_amount ?? null, max_amount: max_amount ?? null, label: label ?? null,
      }).select('id, level, required_permission, min_amount, max_amount, label').single()
      if (error) {
        // FK permissions.key → permission tak dikenal
        if ((error as { code?: string }).code === '23503') {
          return reply.status(400).send({ error: `Permission '${required_permission}' tidak dikenal` })
        }
        return reply.status(500).send({ error: error.message })
      }
      void logAuditEvent(request, {
        tableName: 'approval_steps', recordId: data.id, action: 'approval.step.create',
        actorId: request.currentUser!.id, newValues: { entityType, ...data }, severity: 'critical',
      })
      return reply.status(201).send({ step: data })
    })

  // ── PATCH /api/v1/approval-steps/:id — ubah permission/ambang/label ────────
  app.patch<{ Params: { id: string }; Body: { required_permission?: string; min_amount?: number | null; max_amount?: number | null; label?: string } }>(
    '/api/v1/approval-steps/:id',
    { preHandler: [authenticate, requirePermission('approval:chains:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body ?? {}
      if (b.min_amount !== undefined && b.min_amount !== null && (typeof b.min_amount !== 'number' || b.min_amount < 0)) {
        return reply.status(400).send({ error: 'min_amount harus angka >= 0 atau kosong' })
      }
      if (b.max_amount !== undefined && b.max_amount !== null && (typeof b.max_amount !== 'number' || b.max_amount < 0)) {
        return reply.status(400).send({ error: 'max_amount harus angka >= 0 atau kosong' })
      }
      const patch: Record<string, unknown> = {}
      if (b.required_permission !== undefined) patch.required_permission = b.required_permission
      if (b.min_amount !== undefined) patch.min_amount = b.min_amount
      if (b.max_amount !== undefined) patch.max_amount = b.max_amount
      if (b.label !== undefined) patch.label = b.label
      if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'Tidak ada field yang diubah' })

      // Pasangan lantai/plafon divalidasi terhadap NILAI AKHIR, bukan hanya isi
      // patch. Mengubah satu sisi saja bisa membuat pasangannya jadi mustahil —
      // mis. langkah ber-`min 10jt` di-patch `max 5jt`: keduanya sah sendiri,
      // hasilnya langkah yang tak pernah berlaku. Tanpa membaca baris lamanya,
      // cacat itu lolos ke basis dan hanya muncul sebagai persetujuan yang
      // diam-diam terlewat.
      if (b.min_amount !== undefined || b.max_amount !== undefined) {
        const { data: lama } = await request.db!.from('approval_steps')
          .select('min_amount, max_amount').eq('id', id).maybeSingle()
        if (!lama) return reply.status(404).send({ error: 'Langkah tidak ditemukan' })
        const min = b.min_amount !== undefined ? b.min_amount : (lama.min_amount as number | null)
        const max = b.max_amount !== undefined ? b.max_amount : (lama.max_amount as number | null)
        if (min != null && max != null && Number(max) < Number(min)) {
          return reply.status(400).send({
            error: `max_amount (${max}) tidak boleh di bawah min_amount (${min}) — langkah itu tak akan pernah berlaku`,
          })
        }
      }

      const { data, error } = await request.db!.from('approval_steps').update(patch)
        .eq('id', id).select('id, level, required_permission, min_amount, max_amount, label').maybeSingle()
      if (error) {
        if ((error as { code?: string }).code === '23503') {
          return reply.status(400).send({ error: `Permission '${b.required_permission}' tidak dikenal` })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Langkah tidak ditemukan' })
      void logAuditEvent(request, {
        tableName: 'approval_steps', recordId: id, action: 'approval.step.update',
        actorId: request.currentUser!.id, newValues: data as Record<string, unknown>, severity: 'critical',
      })
      return reply.send({ step: data })
    })

  // ── DELETE /api/v1/approval-steps/:id — hapus level ────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/approval-steps/:id',
    { preHandler: [authenticate, requirePermission('approval:chains:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: step } = await request.db!.from('approval_steps')
        .select('id, chain_id, level').eq('id', id).maybeSingle()
      if (!step) return reply.status(404).send({ error: 'Langkah tidak ditemukan' })

      // ANTI-LOCKOUT: rantai kosong = fail-closed = nol orang bisa menyetujui modul itu.
      const { count } = await request.db!.from('approval_steps')
        .select('id', { count: 'exact', head: true }).eq('chain_id', step.chain_id)
      if ((count ?? 0) <= 1) {
        return reply.status(400).send({
          error: 'Tidak bisa menghapus langkah terakhir — rantai tanpa langkah membuat NOL orang bisa menyetujui. Ubah permission-nya, atau nonaktifkan rantai.',
        })
      }

      const { error } = await request.db!.from('approval_steps').delete().eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'approval_steps', recordId: id, action: 'approval.step.delete',
        actorId: request.currentUser!.id, oldValues: step as Record<string, unknown>, severity: 'critical',
      })
      return reply.send({ ok: true })
    })
}
