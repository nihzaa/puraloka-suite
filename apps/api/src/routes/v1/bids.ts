import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { hitungBacklog, type BidRingkas } from '../../lib/bid-backlog.js'

/**
 * BID REGISTER — register tender ringan (ROADMAP #22 · migrasi 147).
 *
 * Menjawab dua hal yang sebelumnya tak terekam di mana pun:
 *   1. Kenapa sebuah tender kalah — harga, atau syarat?
 *   2. Berapa backlog (pekerjaan sudah dimenangkan, belum selesai) saat
 *      memutuskan mengambil kerja baru.
 *
 * SENGAJA bukan CRM: `PETA-PRIORITAS-ERP.md` mencoret pipeline penuh. Satu
 * tabel, satu daftar, satu ringkasan.
 *
 * Permission memakai `projects:view`/`projects:edit` yang SUDAH ADA — bukan
 * membuat `bids:*` baru. Alasannya: orang yang boleh melihat & menyunting
 * proyek adalah orang yang sama yang mengurus tendernya, dan menambah
 * permission baru berarti menambah baris yang harus di-seed ke tiap role
 * (dan satu role yang terlewat = fitur tak terlihat tanpa gejala).
 */
export default async function bidRoutes(app: FastifyInstance) {

  // ── GET /api/v1/bids ──────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/bids',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { status } = request.query

      // `request.db.from()` — `bids` kategori B, wrapper menyaring company
      // otomatis. Tak perlu (dan tak boleh) menyaring manual di sini.
      let q = request.db!
        .from('bids')
        .select('id, bid_number, title, owner_name, location, bid_value, winner_value, submitted_at, decided_at, status, decision_note, project_id, created_at')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (status) q = q.eq('status', status)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'gagal memuat bids')
        return reply.status(500).send({ error: 'Gagal memuat register tender' })
      }

      const baris = (data ?? []) as BidRingkas[]
      return reply.send({ data: baris, meta: hitungBacklog(baris) })
    },
  )

  // ── POST /api/v1/bids ─────────────────────────────────────────────────────
  app.post(
    '/api/v1/bids',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as {
        bid_number?: string; title?: string; owner_name?: string; location?: string
        bid_value?: number; submitted_at?: string; status?: string
      }
      if (!b.title?.trim()) {
        return reply.status(400).send({ error: 'Judul tender wajib diisi' })
      }

      const { data, error } = await request.db!
        .from('bids')
        .insert({
          // `company_id` TIDAK diisi manual — wrapper mengisinya dari company
          // aktif, dan migrasi 128 menolak INSERT yang ambigu.
          bid_number: b.bid_number?.trim() || null,
          title: b.title.trim(),
          owner_name: b.owner_name?.trim() || null,
          location: b.location?.trim() || null,
          bid_value: b.bid_value ?? null,
          submitted_at: b.submitted_at || null,
          status: b.status ?? 'prospek',
          created_by: request.currentUser!.id,
        })
        .select()
        .single()

      if (error) {
        // 23505 = nomor tender kembar dalam company ini (uq_bids_company_number).
        if (error.code === '23505') {
          return reply.status(409).send({ error: `Nomor tender '${b.bid_number}' sudah ada` })
        }
        request.log.error({ err: error }, 'gagal membuat bid')
        return reply.status(500).send({ error: error.message })
      }

      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/bids/:id ────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/bids/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body as Record<string, unknown>

      // Gerbang tenant: baca lewat wrapper dulu. Baris milik company lain tak
      // terlihat → maybeSingle() null → 404. Tanpa langkah ini, UPDATE
      // `.eq('id', …)` akan menyunting tender perusahaan lain yang id-nya
      // diketahui (pola cacat yang ditutup 8× hari ini).
      const { data: ada } = await request.db!
        .from('bids').select('id, status').eq('id', id).maybeSingle()
      if (!ada) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

      const boleh = ['bid_number', 'title', 'owner_name', 'location', 'bid_value',
        'winner_value', 'submitted_at', 'decided_at', 'status', 'decision_note', 'project_id']
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of boleh) if (k in b) patch[k] = b[k]

      const { data, error } = await request.db!
        .from('bids').update(patch).eq('id', id).select().single()

      if (error) {
        if (error.code === '23505') return reply.status(409).send({ error: 'Nomor tender sudah ada' })
        // 23514 = constraint tanggal/nilai. Pesannya diterjemahkan supaya user
        // tahu APA yang salah, bukan menerima istilah Postgres.
        if (error.code === '23514') {
          return reply.status(400).send({
            error: 'Tanggal keputusan tak boleh mendahului tanggal pengajuan, dan nilai tak boleh negatif',
          })
        }
        request.log.error({ err: error }, 'gagal update bid')
        return reply.status(500).send({ error: error.message })
      }

      // Perubahan status tender = keputusan bisnis (menang/kalah/no-go).
      // Dicatat supaya "kenapa dulu kita no-go" bisa ditelusuri, bukan diingat.
      if (typeof b.status === 'string' && b.status !== ada.status) {
        void logAuditEvent(request, {
          tableName: 'bids', recordId: id, action: 'bid.status',
          actorId: request.currentUser!.id,
          oldValues: { status: ada.status },
          newValues: { status: b.status, decision_note: b.decision_note ?? null },
          severity: 'info',
        })
      }

      return reply.send({ data })
    },
  )

  // ── DELETE /api/v1/bids/:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/bids/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: ada } = await request.db!
        .from('bids').select('id, status').eq('id', id).maybeSingle()
      if (!ada) return reply.status(404).send({ error: 'Tender tidak ditemukan' })

      // Tender yang SUDAH diputuskan tak boleh dihapus — justru itu datanya
      // yang berguna dipelajari. Yang salah-input saat masih prospek boleh.
      if (['menang', 'kalah'].includes(ada.status)) {
        return reply.status(409).send({
          error: 'Tender yang sudah diputuskan menang/kalah tak bisa dihapus — ubah statusnya jadi "batal" bila perlu',
        })
      }

      const { error } = await request.db!.from('bids').delete().eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ ok: true })
    },
  )
}
