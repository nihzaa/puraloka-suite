import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { hitungLDProyek, type ProyekUntukLD } from '../../utils/rantai-kontrak.js'
import { ringkasBond, type BarisEOT, type BarisBond, type JenisBond } from '../../lib/rantai-kontrak.js'

/**
 * RANTAI KONTRAK — EOT, LD arah kontraktor, register jaminan (ROADMAP #16,
 * migrasi 152).
 *
 * ── Kenapa ketiganya satu berkas
 *
 * Bukan pengelompokan administratif: LD **tak bisa dihitung benar tanpa EOT**
 * (tanggal efektif bergeser), dan jaminan pelaksanaan bisa dicairkan justru
 * ketika LD menyentuh batas. Ketiganya satu rantai sebab-akibat; memisahkannya
 * membuat pemanggil harus menyusun sendiri urutannya, dan yang lupa akan
 * menghitung denda dari tanggal yang salah.
 *
 * ── Yang paling dijaga di sini
 *
 * `days_approved`, bukan `days_requested`, yang menggeser tanggal. Kalau yang
 * dipakai adalah jumlah yang DIAJUKAN, kontraktor menentukan tenggatnya
 * sendiri — dan denda jadi tak berarti apa pun.
 */
export default async function rantaiKontrakRoutes(app: FastifyInstance) {

  /** Ambil EOT sebuah proyek dalam bentuk yang dipahami lib. */
  async function ambilEOT(request: { db?: unknown }, projectId: string): Promise<BarisEOT[]> {
    const db = (request as { db: NonNullable<typeof request.db> }).db as {
      viaProject: (t: string, id: string) => { select: (s: string) => Promise<{ data: unknown[] | null }> }
    }
    const { data } = await db.viaProject('contract_eot', projectId)
      .select('id, days_requested, days_approved, status, decided_at')
    return ((data ?? []) as Array<Record<string, unknown>>).map((e) => ({
      id: String(e.id),
      // Yang menggeser tanggal adalah hari yang DISETUJUI. `days_requested`
      // hanya dipakai saat statusnya belum diputus — dan di situ pun ia tak
      // menggeser apa pun karena statusnya bukan 'disetujui'.
      hariTambahan: Number(e.days_approved ?? 0),
      status: String(e.status) as BarisEOT['status'],
      tanggalKeputusan: e.decided_at ? String(e.decided_at) : null,
    }))
  }

  // ── GET /api/v1/projects/:id/eot ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/projects/:id/eot',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { data: proyek } = await request.db!
        .from('projects').select('id, end_date').eq('id', request.params.id).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('contract_eot', request.params.id)
        .select('id, eot_number, days_requested, days_approved, reason, status, ' +
                'submitted_at, decided_at, decision_note, created_at')
        .order('submitted_at', { ascending: false })
      if (error) {
        request.log.error({ err: error }, 'gagal memuat EOT')
        return reply.status(500).send({ error: 'Gagal memuat perpanjangan waktu' })
      }

      const daftar = await ambilEOT(request, request.params.id)
      const { tanggalSelesaiEfektif } = await import('../../lib/rantai-kontrak.js')
      return reply.send({
        data: data ?? [],
        meta: tanggalSelesaiEfektif(String(proyek.end_date), daftar),
      })
    },
  )

  // ── POST /api/v1/projects/:id/eot ─────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/projects/:id/eot',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const hari = Number(b.days_requested ?? 0)
      const alasan = String(b.reason ?? '').trim()

      if (!Number.isFinite(hari) || hari < 0) {
        return reply.status(400).send({ error: 'Jumlah hari perpanjangan tidak sah' })
      }
      if (alasan.length < 10) {
        // EOT adalah dasar hukum yang menghapus denda. Alasan sekadar "telat"
        // takkan bisa dipertahankan saat pemberi kerja memeriksanya.
        return reply.status(400).send({
          error: 'Alasan perpanjangan wajib diisi, minimal 10 karakter — ' +
                 'ini yang menjadi dasar saat denda dibatalkan',
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.id).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('contract_eot', request.params.id)
        .insert({
          project_id: request.params.id,
          eot_number: (b.eot_number as string)?.trim() || null,
          days_requested: Math.trunc(hari),
          reason: alasan,
          status: 'diajukan',
          created_by: request.currentUser!.id,
        })
        .select().single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Nomor EOT sudah dipakai di proyek ini' })
        }
        request.log.error({ err: error }, 'gagal membuat EOT')
        return reply.status(500).send({ error: 'Gagal menyimpan pengajuan' })
      }

      void logAuditEvent(request, {
        tableName: 'contract_eot', recordId: data.id, action: 'eot.submit',
        actorId: request.currentUser!.id, newValues: data,
      })
      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/eot/:id/decide — setujui / tolak ────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/eot/:id/decide',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const status = String(b.status ?? '')
      if (!['disetujui', 'ditolak'].includes(status)) {
        return reply.status(400).send({ error: 'Status keputusan harus disetujui atau ditolak' })
      }

      // Dibaca lewat `unsafe` DENGAN alasan tertulis: `contract_eot` kategori C
      // dan wrapper `viaProject` butuh project_id yang justru baru diketahui
      // SETELAH baris ini dibaca. Batas tenant tetap ditegakkan — oleh policy
      // RESTRICTIVE `tenant_isolation` (152) dan oleh pembacaan `projects`
      // ber-scope di bawah, yang menolak bila proyeknya milik tenant lain.
      const { data: lama } = await request.db!
        .unsafe('contract_eot', 'baca-by-id untuk resolve project_id; tenant ditegakkan oleh cek projects ber-scope di bawah')
        .select('*').eq('id', request.params.id).maybeSingle()
      if (!lama) return reply.status(404).send({ error: 'Pengajuan EOT tidak ditemukan' })

      // INI gerbang tenancy-nya: pembacaan ber-scope. Proyek milik perusahaan
      // lain tak akan terbaca, jadi keputusannya ditolak 404.
      const { data: proyek } = await request.db!
        .from('projects').select('id, name').eq('id', lama.project_id).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Pengajuan EOT tidak ditemukan' })

      if (lama.status !== 'diajukan') {
        return reply.status(409).send({
          error: `Pengajuan ini sudah ${lama.status} — keputusan tak bisa diubah. ` +
                 'Ajukan EOT baru bila ada perubahan.',
        })
      }

      let hariDisetujui: number | null = null
      if (status === 'disetujui') {
        // Default ke yang diajukan bila tak disebut — tapi kalau disebut, yang
        // dipakai adalah angka PENYETUJU. Pemberi kerja sering menyetujui
        // lebih sedikit dari yang diminta.
        hariDisetujui = b.days_approved == null
          ? Number(lama.days_requested)
          : Math.trunc(Number(b.days_approved))
        if (!Number.isFinite(hariDisetujui) || hariDisetujui < 0) {
          return reply.status(400).send({ error: 'Jumlah hari yang disetujui tidak sah' })
        }
      }

      const { data, error } = await request.db!
        .unsafe('contract_eot', 'update by-id sesudah kepemilikan proyek diverifikasi ber-scope di atas')
        .update({
          status,
          days_approved: hariDisetujui,
          decided_at: new Date().toISOString().slice(0, 10),
          decided_by: request.currentUser!.id,
          decision_note: (b.decision_note as string)?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.params.id).select().single()

      if (error) {
        request.log.error({ err: error }, 'gagal memutus EOT')
        return reply.status(500).send({ error: 'Gagal menyimpan keputusan' })
      }

      void logAuditEvent(request, {
        tableName: 'contract_eot', recordId: data.id, action: `eot.${status}`,
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
        // EOT yang disetujui MENGHAPUS denda — perubahan bernilai uang, jadi
        // severitasnya dinaikkan supaya tak tenggelam di antara log rutin.
        severity: status === 'disetujui' ? 'warning' : undefined,
      })
      return reply.send({ data })
    },
  )

  // ── GET /api/v1/projects/:id/liquidated-damages ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/projects/:id/liquidated-damages',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { data: p, error } = await request.db!
        .from('projects')
        .select('id, name, company_id, contract_value, end_date, actual_end_date, progress_pct, ' +
                'ld_enabled, ld_basis, ld_rate_per_day, ld_cap_pct, ld_grace_days, ld_waived')
        .eq('id', request.params.id)
        // Tipe disebut eksplisit: klien Supabase memulangkan union yang memuat
        // `GenericStringError`, dan `as any` akan menyembunyikannya sekaligus
        // menaikkan ratchet `any` yang hanya boleh turun.
        .maybeSingle<ProyekUntukLD & { company_id: string; name: string }>()
      if (error) return reply.status(500).send({ error: 'Gagal memuat proyek' })
      if (!p) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const daftarEOT = await ambilEOT(request, request.params.id)
      const hasil = await hitungLDProyek(
        p as unknown as ProyekUntukLD, daftarEOT, String(p.company_id))

      return reply.send({
        data: hasil,
        meta: {
          // Label ini bukan hiasan: selama proyek belum selesai, angkanya
          // masih bergerak tiap hari. Angka yang tampak final padahal masih
          // berubah mengundang penagihan yang keliru.
          label: hasil.otoritatif
            ? 'Angka final — dihitung dari tanggal serah terima'
            : 'ESTIMASI — proyek belum selesai, angka masih bertambah tiap hari',
          peringatan: hasil.tanggal.eotMenggantung > 0
            ? `${hasil.tanggal.eotMenggantung} pengajuan EOT belum diputus — ` +
              'angka ini bisa turun bila disetujui'
            : null,
        },
      })
    },
  )

  // ── GET /api/v1/bonds ─────────────────────────────────────────────────────
  app.get<{ Querystring: { project_id?: string; status?: string } }>(
    '/api/v1/bonds',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      let q = request.db!
        .from('contract_bonds')
        .select('id, project_id, bid_id, bond_type, bond_number, issuer, amount, ' +
                'issued_date, expiry_date, status, released_at, notes')
        .order('expiry_date', { ascending: true })
      if (request.query.project_id) q = q.eq('project_id', request.query.project_id)
      if (request.query.status) q = q.eq('status', request.query.status)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error }, 'gagal memuat jaminan')
        return reply.status(500).send({ error: 'Gagal memuat register jaminan' })
      }

      const baris = (data ?? []) as unknown as Array<Record<string, unknown>>
      const untukLib: BarisBond[] = baris.map((b) => ({
        id: String(b.id),
        jenis: String(b.bond_type) as JenisBond,
        nilai: Number(b.amount ?? 0),
        tanggalTerbit: String(b.issued_date),
        tanggalKadaluarsa: String(b.expiry_date),
        status: String(b.status) as BarisBond['status'],
      }))

      return reply.send({
        data: baris,
        meta: ringkasBond(untukLib, new Date().toISOString().slice(0, 10)),
      })
    },
  )

  // ── POST /api/v1/bonds ────────────────────────────────────────────────────
  app.post(
    '/api/v1/bonds',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const jenis = String(b.bond_type ?? '')
      if (!['penawaran', 'pelaksanaan', 'uang_muka', 'pemeliharaan'].includes(jenis)) {
        return reply.status(400).send({ error: 'Jenis jaminan tidak sah' })
      }
      if (!b.project_id && !b.bid_id) {
        // Jaminan tanpa induk jadi baris yatim yang tak muncul di layar mana
        // pun — uang yang hilang dari pandangan.
        return reply.status(400).send({
          error: 'Jaminan harus terkait proyek atau tender',
        })
      }
      if (!b.issued_date || !b.expiry_date) {
        return reply.status(400).send({ error: 'Tanggal terbit & kadaluarsa wajib diisi' })
      }

      const { data, error } = await request.db!
        .from('contract_bonds')
        .insert({
          project_id: b.project_id ?? null,
          bid_id: b.bid_id ?? null,
          bond_type: jenis,
          bond_number: (b.bond_number as string)?.trim() || null,
          issuer: (b.issuer as string)?.trim() || null,
          amount: Number(b.amount ?? 0),
          issued_date: b.issued_date,
          expiry_date: b.expiry_date,
          status: b.status ?? 'aktif',
          notes: (b.notes as string)?.trim() || null,
          created_by: request.currentUser!.id,
        })
        .select().single()

      if (error) {
        request.log.error({ err: error }, 'gagal membuat jaminan')
        return reply.status(500).send({ error: 'Gagal menyimpan jaminan' })
      }

      void logAuditEvent(request, {
        tableName: 'contract_bonds', recordId: data.id, action: 'bond.create',
        actorId: request.currentUser!.id, newValues: data,
      })
      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/bonds/:id ───────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/bonds/:id',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>

      const { data: lama } = await request.db!
        .from('contract_bonds').select('*').eq('id', request.params.id).maybeSingle()
      if (!lama) return reply.status(404).send({ error: 'Jaminan tidak ditemukan' })

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ['bond_number', 'issuer', 'amount', 'issued_date',
        'expiry_date', 'status', 'released_at', 'notes']) {
        if (k in b) patch[k] = b[k]
      }

      const { data, error } = await request.db!
        .from('contract_bonds').update(patch).eq('id', request.params.id).select().single()
      if (error) return reply.status(500).send({ error: 'Gagal menyimpan perubahan jaminan' })

      void logAuditEvent(request, {
        tableName: 'contract_bonds', recordId: data.id, action: 'bond.update',
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
        // Pencairan jaminan = uang keluar. Dinaikkan supaya terlihat di audit.
        severity: b.status === 'dicairkan' ? 'warning' : undefined,
      })
      return reply.send({ data })
    },
  )
}
