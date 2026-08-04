import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { hitungLDProyek, type ProyekUntukLD } from '../../utils/rantai-kontrak.js'
import { ringkasBond, type BarisEOT, type BarisBond, type JenisBond } from '../../lib/rantai-kontrak.js'
import {
  evaluasiBatasPemberitahuan, validasiKeputusanKlaim, type StatusKlaim,
} from '../../lib/klaim-kontraktual.js'

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

  // ═══════════════════════════════════════════════════════════════════════════
  // KLAIM KONTRAKTUAL (INTI #4 · migrasi 184)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Pilar ketiga rantai ini, dan sengaja ditaruh SEBERKAS dengan EOT & jaminan:
  // klaim sering lahir dari peristiwa yang sama dengan EOT (lahan terlambat,
  // gambar berubah, penghentian sementara), dan memisahkannya membuat pemanggil
  // harus menyusun sendiri hubungannya.
  //
  // Bedanya dari dua saudaranya:
  //   change_orders  lingkup BERTAMBAH → nilai kontrak naik
  //   contract_eot   waktu bergeser    → denda bergeser
  //   contract_claims  lingkup SAMA, biayanya yang naik
  //
  // Yang paling dijaga di sini: BATAS WAKTU PEMBERITAHUAN. Klaim jarang gugur
  // karena angkanya salah — ia gugur karena terlambat diberitahukan.

  /** Hari ini dalam WIB, format YYYY-MM-DD. */
  function hariIniWIB(): string {
    // +7 jam lalu ambil bagian tanggalnya. Memakai tanggal UTC akan menggeser
    // batas klaim sehari untuk peristiwa yang terjadi malam hari WIB — dan
    // sehari bisa menentukan klaim gugur atau tidak.
    return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  }

  // ── GET /api/v1/projects/:id/claims ───────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/projects/:id/claims',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.id).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('contract_claims', request.params.id)
        .select('*')
      if (error) return reply.status(500).send({ error: 'Gagal membaca klaim' })

      const kini = hariIniWIB()
      type BarisKlaim = Record<string, unknown> & {
        amount_claimed?: number | string | null
        amount_approved?: number | string | null
        status?: string
      }
      const klaim = ((data ?? []) as BarisKlaim[]).map((k) => ({
        ...k,
        // Status batas waktu DIHITUNG, tidak disimpan: ia berubah tiap hari
        // berjalan, dan kolom yang perlu di-refresh tiap hari pasti akan basi.
        batas_pemberitahuan: evaluasiBatasPemberitahuan({
          tanggalPeristiwa: String(k.event_date),
          batasHari: k.notice_days_limit as number | null,
          tanggalPemberitahuan: (k.notified_at as string | null) ?? null,
          hariIni: kini,
        }),
      }))

      const diklaim = klaim.reduce((t, k) => t + Number(k.amount_claimed ?? 0), 0)
      const disetujui = klaim.reduce((t, k) => t + Number(k.amount_approved ?? 0), 0)

      return reply.send({
        data: klaim,
        ringkas: {
          jumlah: klaim.length,
          total_diklaim: diklaim,
          total_disetujui: disetujui,
          // Klaim yang batasnya terlampaui dan BELUM diputus — inilah yang
          // benar-benar mendesak, bukan sekadar "ada klaim terbuka".
          berisiko_gugur: klaim.filter((k) =>
            k.batas_pemberitahuan.keadaan === 'terlambat' &&
            ['draft', 'diberitahukan', 'diajukan'].includes(String(k.status))).length,
          mendesak: klaim.filter((k) => k.batas_pemberitahuan.keadaan === 'mendesak').length,
        },
      })
    },
  )

  // ── POST /api/v1/projects/:id/claims ──────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/projects/:id/claims',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const nomor = String(b.claim_number ?? '').trim()
      const judul = String(b.title ?? '').trim()
      const nilai = Number(b.amount_claimed ?? NaN)
      const tglPeristiwa = String(b.event_date ?? '').trim()

      if (!nomor) return reply.status(400).send({ error: 'Nomor klaim wajib diisi' })
      if (judul.length < 10) {
        // Sama alasannya dengan EOT: judul "klaim" tak bisa dipertahankan saat
        // pemberi kerja memeriksanya setahun kemudian.
        return reply.status(400).send({
          error: 'Judul klaim wajib diisi, minimal 10 karakter — ini yang dibaca ' +
                 'pemberi kerja saat klaim diperiksa',
        })
      }
      if (!Number.isFinite(nilai) || nilai < 0) {
        return reply.status(400).send({ error: 'Nilai klaim tidak sah' })
      }

      const cekTanggal = evaluasiBatasPemberitahuan({
        tanggalPeristiwa: tglPeristiwa,
        batasHari: b.notice_days_limit as number | null,
        tanggalPemberitahuan: (b.notified_at as string | null) ?? null,
        hariIni: hariIniWIB(),
      })
      if (cekTanggal.keadaan === 'tak_terbaca') {
        return reply.status(400).send({ error: cekTanggal.pesan })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', request.params.id).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('contract_claims', request.params.id)
        .insert({
          project_id: request.params.id,
          claim_number: nomor,
          claim_type: String(b.claim_type ?? 'lain_lain'),
          title: judul,
          description: (b.description as string) ?? null,
          event_date: tglPeristiwa,
          notified_at: (b.notified_at as string) ?? null,
          notice_days_limit: (b.notice_days_limit as number) ?? null,
          amount_claimed: nilai,
          eot_id: (b.eot_id as string) ?? null,
          status: b.notified_at ? 'diberitahukan' : 'draft',
          created_by: request.currentUser!.id,
        })
        .select().single()

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({ error: 'Nomor klaim sudah dipakai di proyek ini' })
        }
        request.log.error({ err: error }, 'gagal membuat klaim')
        return reply.status(500).send({ error: 'Gagal menyimpan klaim' })
      }

      void logAuditEvent(request, {
        tableName: 'contract_claims', recordId: data.id, action: 'claim.create',
        actorId: request.currentUser!.id, newValues: data,
        severity: 'critical',
      })
      // Peringatan disertakan di respons, bukan menolak: klaim yang sudah
      // telanjur terlambat TETAP harus tercatat. Menolaknya justru menghapus
      // bukti bahwa peristiwanya pernah terjadi.
      return reply.status(201).send({ data, batas_pemberitahuan: cekTanggal })
    },
  )

  // ── PATCH /api/v1/claims/:id/decide ───────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/claims/:id/decide',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const b = request.body as Record<string, unknown>
      const status = String(b.status ?? '') as StatusKlaim

      // ⚠️ `contract_claims` kategori C — `project_id`-nya WAJIB diketahui
      // lebih dulu, dan endpoint ini hanya menerima id klaim.
      //
      // Versi pertama saya memakai `.from('contract_claims')` langsung dan
      // penjaga tenancy MENOLAKNYA dengan benar: tanpa `project_id`, query itu
      // mengembalikan klaim milik tenant lain — dan endpoint ini MEMUTUSKAN
      // UANG.
      //
      // Jalurnya karena itu dua langkah: `project_id` diminta di body,
      // divalidasi milik tenant, baru `viaProject`. Menaruhnya di body terasa
      // merepotkan, tapi itulah yang membuat gerbangnya tak bisa lupa dipasang.
      const projectId = String(b.project_id ?? '').trim()
      if (!projectId) {
        return reply.status(400).send({
          error: 'project_id wajib disertakan — klaim mewarisi tenancy lewat proyek',
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('id').eq('id', projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      // `error` diperiksa, bukan diabaikan: query yang GAGAL mengembalikan
      // `null`, lalu `?? []` mengubahnya jadi "klaim tidak ditemukan" yang
      // terlihat sah. Pemakai akan mengira klaimnya terhapus, dan keputusan
      // yang seharusnya tercatat tak pernah terjadi — tanpa satu pun gejala.
      const { data: lamaRows, error: bacaErr } = await request.db!
        .viaProject('contract_claims', projectId)
        .select('*')
        .eq('id', request.params.id)
      if (bacaErr) {
        request.log.error({ err: bacaErr }, 'gagal membaca klaim')
        return reply.status(500).send({ error: 'Gagal membaca klaim' })
      }
      const lama = ((lamaRows ?? []) as Array<Record<string, unknown>>)[0]
      if (!lama) return reply.status(404).send({ error: 'Klaim tidak ditemukan' })

      const verdict = validasiKeputusanKlaim({
        status,
        diklaim: Number(lama.amount_claimed),
        disetujui: b.amount_approved == null ? null : Number(b.amount_approved),
      })
      if (!verdict.ok) return reply.status(422).send({ error: verdict.galat })

      const memutuskan = ['disetujui', 'disetujui_sebagian', 'ditolak', 'gugur'].includes(status)

      const { data, error } = await request.db!
        .viaProject('contract_claims', projectId)
        .update({
          status,
          amount_approved: b.amount_approved == null ? null : Number(b.amount_approved),
          decision_note: (b.decision_note as string) ?? null,
          // Constraint DB menuntut keduanya terisi pada status yang memutuskan.
          // Diisi di sini supaya galat yang muncul adalah pesan bisnis, bukan
          // pelanggaran constraint yang tak bisa dibaca pemakai.
          decided_at: memutuskan ? new Date().toISOString() : null,
          decided_by: memutuskan ? request.currentUser!.id : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.params.id)
        .select().single()

      if (error) {
        request.log.error({ err: error }, 'gagal memutuskan klaim')
        return reply.status(500).send({ error: 'Gagal menyimpan keputusan klaim' })
      }

      void logAuditEvent(request, {
        tableName: 'contract_claims', recordId: data.id, action: 'claim.decide',
        actorId: request.currentUser!.id, oldValues: lama, newValues: data,
        severity: 'critical',
      })
      return reply.send({ data })
    },
  )
}
