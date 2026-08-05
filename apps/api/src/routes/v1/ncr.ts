import type { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import type { TenantDb } from '../../utils/tenant-db.js'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { createNotifications } from '../../utils/notifications.js'
import { logAuditEvent } from '../../utils/audit.js'

// Non-Conformance Report (NCR) — INTI #7.
//
// Rancangan tabel, lima invarian, dan alasan tiap keputusan ada di
// `db/migrations/189_ncr.sql` — dibaca dulu sebelum mengubah berkas ini.
//
// Yang membedakan NCR dari punch list bukan tingkat keparahan, melainkan
// DISPOSISI: keputusan formal tentang apa yang dilakukan atas ketidaksesuaian
// (perbaiki / terima apa adanya / bongkar / ubah spesifikasi). Keputusan itu
// punya konsekuensi biaya dan kontrak, karena itu ia capability terpisah.
//
// Empat capability:
//   ncr:view      — melihat register
//   ncr:manage    — mencatat, menugaskan, mengisi tindakan perbaikan
//   ncr:disposisi — memutuskan tindakan (berkonsekuensi biaya)
//   ncr:verify    — menyatakan perbaikan sah dan menutup

const NCR_SELECT = `
  id,
  project_id,
  nomor,
  judul,
  deskripsi,
  lokasi,
  acuan,
  severity,
  status,
  rab_item_id,
  work_scope_id,
  inspection_request_id,
  dilaporkan_oleh,
  ditugaskan_ke,
  diverifikasi_oleh,
  diverifikasi_pada,
  disposisi,
  disposisi_oleh,
  disposisi_pada,
  disposisi_catatan,
  tindakan_perbaikan,
  akar_masalah,
  biaya_dampak,
  target_selesai,
  ditutup_pada,
  created_at,
  updated_at,
  pelapor:users!ncr_items_dilaporkan_oleh_fkey ( id, name ),
  petugas:users!ncr_items_ditugaskan_ke_fkey ( id, name ),
  verifikator:users!ncr_items_diverifikasi_oleh_fkey ( id, name ),
  pemutus:users!ncr_items_disposisi_oleh_fkey ( id, name ),
  rab_item:rab_items ( id, name, category_code, level ),
  work_scope:work_scopes ( id, scope_name )
`

/**
 * Status yang boleh menyusul status tertentu.
 *
 * Alurnya searah dengan satu pengecualian: `verifikasi` boleh kembali ke
 * `perbaikan`. Itu jalur "verifikator menolak hasil" — perkaranya kembali
 * dikerjakan, TIDAK ditutup dan tidak hilang.
 *
 * `ditutup` boleh dibuka kembali ke `perbaikan`: ketidaksesuaian yang
 * "selesai" lalu muncul lagi adalah kejadian normal, dan memaksa orang
 * membuat NCR baru memutus riwayatnya — padahal riwayat itu justru yang
 * dicari auditor.
 */
const TRANSISI_SAH: Record<string, string[]> = {
  terbuka:    ['disposisi', 'dibatalkan'],
  disposisi:  ['perbaikan', 'dibatalkan'],
  perbaikan:  ['verifikasi', 'disposisi'],
  verifikasi: ['ditutup', 'perbaikan'],
  ditutup:    ['perbaikan'],
  dibatalkan: ['terbuka'],
}

/** Nomor urut NCR berikutnya untuk satu proyek. */
async function nomorBerikutnya(db: TenantDb, projectId: string): Promise<string> {
  const { data, error } = await db
    .viaProject('ncr_items', projectId)
    .select('nomor')
    .order('nomor', { ascending: false })
    .limit(1)

  // Gagal baca ≠ belum ada NCR. `?? []` di sini akan mengubah kegagalan jadi
  // "mulai dari NCR-001" dan menabrak nomor yang sudah dipakai — sementara
  // nomor NCR dirujuk dalam surat resmi ke konsultan.
  if (error) throw new Error(`Gagal membaca nomor NCR terakhir: ${error.message}`)
  if (!data || data.length === 0) return 'NCR-001'

  const cocok = /^NCR-(\d+)$/.exec(data[0].nomor as string)
  if (!cocok) return 'NCR-001'
  return `NCR-${String(parseInt(cocok[1], 10) + 1).padStart(3, '0')}`
}

export default async function ncrRoutes(app: FastifyInstance) {
  // ── GET /api/v1/projects/:projectId/ncr ─────────────────────────────────
  app.get<{ Params: { projectId: string }; Querystring: { status?: string; severity?: string } }>(
    '/api/v1/projects/:projectId/ncr',
    { preHandler: [authenticate, requirePermission('ncr:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      let q = request.db!
        .viaProject('ncr_items', projectId)
        .select(NCR_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)

      if (request.query.status) q = q.eq('status', request.query.status)
      if (request.query.severity) q = q.eq('severity', request.query.severity)

      const { data, error } = await q
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat NCR')
        return reply.status(500).send({ error: 'Gagal memuat register NCR' })
      }

      // Rekap dihitung dari SELURUH baris, bukan 200 pertama. Angka yang
      // dihitung dari halaman pertama akan salah begitu NCR-nya lebih
      // banyak — dan salahnya tak terlihat.
      const { data: rekap, error: errRekap } = await request.db!
        .viaProject('ncr_items', projectId)
        .select('status, severity, biaya_dampak')

      if (errRekap) {
        request.log.error({ err: errRekap, projectId }, 'gagal menghitung rekap NCR')
      }

      const semua = rekap ?? []
      const perStatus: Record<string, number> = {}
      const perSeverity: Record<string, number> = {}
      for (const b of semua) {
        perStatus[b.status as string] = (perStatus[b.status as string] ?? 0) + 1
        perSeverity[b.severity as string] = (perSeverity[b.severity as string] ?? 0) + 1
      }

      const belumSelesai = semua.filter(
        (b) => b.status !== 'ditutup' && b.status !== 'dibatalkan',
      )

      return reply.send({
        data: data ?? [],
        meta: {
          per_status: perStatus,
          per_severity: perSeverity,
          total: semua.length,
          // Yang masih menghalangi serah terima. `dibatalkan` TIDAK dihitung
          // — itu perkara yang dinyatakan tidak berlaku, bukan sisa kerja.
          belum_selesai: belumSelesai.length,
          // Kritis yang belum tertutup adalah angka yang menentukan apakah
          // proyek boleh diserahterimakan.
          kritis_terbuka: belumSelesai.filter((b) => b.severity === 'kritis').length,
          biaya_dampak_total: semua.reduce((t, b) => t + Number(b.biaya_dampak ?? 0), 0),
          // Rekap yang gagal dihitung DITANDAI, bukan disamarkan jadi nol.
          rekap_lengkap: !errRekap,
        },
      })
    },
  )

  // ── POST /api/v1/projects/:projectId/ncr ────────────────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      judul: string
      deskripsi?: string
      lokasi?: string
      acuan?: string
      severity?: string
      rab_item_id?: string
      work_scope_id?: string
      inspection_request_id?: string
      ditugaskan_ke?: string
      target_selesai?: string
    }
  }>(
    '/api/v1/projects/:projectId/ncr',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      const b = request.body

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      if (!b?.judul || !b.judul.trim()) {
        return reply.status(400).send({ error: 'Judul wajib diisi' })
      }

      let nomor: string
      try {
        nomor = await nomorBerikutnya(request.db!, projectId)
      } catch (e) {
        request.log.error({ err: e, projectId }, 'gagal menentukan nomor NCR')
        return reply.status(500).send({ error: 'Gagal menentukan nomor NCR' })
      }

      const { data, error } = await request.db!
        .viaProject('ncr_items', projectId)
        .insert({
          project_id: projectId,
          nomor,
          judul: b.judul.trim(),
          deskripsi: b.deskripsi ?? null,
          lokasi: b.lokasi ?? null,
          acuan: b.acuan ?? null,
          severity: b.severity ?? 'minor',
          rab_item_id: b.rab_item_id ?? null,
          work_scope_id: b.work_scope_id ?? null,
          inspection_request_id: b.inspection_request_id ?? null,
          dilaporkan_oleh: request.currentUser!.id,
          ditugaskan_ke: b.ditugaskan_ke ?? null,
          target_selesai: b.target_selesai ?? null,
        })
        .select(NCR_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, projectId }, 'gagal membuat NCR')
        return reply.status(500).send({ error: 'Gagal mencatat ketidaksesuaian' })
      }

      await logAuditEvent(request, {
        action: 'INSERT', actorId: request.currentUser!.id, tableName: 'ncr_items', recordId: data.id as string,
        newValues: { nomor, judul: b.judul, severity: b.severity ?? 'minor' },
      })

      // Yang ditugaskan diberi tahu. NCR yang menunggu tanpa ada yang tahu
      // adalah cara paling umum ketidaksesuaian menumpuk sampai serah terima.
      if (b.ditugaskan_ke) {
        await createNotifications([{
          // `company_id` WAJIB — notifikasi tanpa tenant adalah cacat F0-16
          // yang sudah pernah ditemukan di repo ini.
          company_id: request.companyId!,
          user_id: b.ditugaskan_ke,
          type: 'ncr_assigned',
          title: `Ketidaksesuaian baru: ${nomor}`,
          message: b.judul.trim(),
          project_id: projectId,
          priority: b.severity === 'kritis' ? 'urgent'
            : b.severity === 'major' ? 'high' : 'normal',
        }])
      }

      return reply.status(201).send({ data })
    },
  )

  // ── PATCH /api/v1/ncr/:id ───────────────────────────────────────────────
  // Perubahan isi (bukan status). Status punya endpointnya sendiri supaya
  // transisi dan izinnya tak bisa dilewati lewat pintu belakang.
  app.patch<{
    Params: { id: string }
    Body: {
      judul?: string; deskripsi?: string; lokasi?: string; acuan?: string
      severity?: string; ditugaskan_ke?: string | null
      target_selesai?: string | null; biaya_dampak?: number | null
      tindakan_perbaikan?: string; akar_masalah?: string
    }
  }>(
    '/api/v1/ncr/:id',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body ?? {}

      const { data: lama, error: errLama } = await request.db!
        .unsafe('ncr_items', 'baca satu NCR untuk verifikasi kepemilikan tenant sebelum update')
        .select('id, project_id, nomor, status')
        .eq('id', id)
        .maybeSingle()

      if (errLama) {
        request.log.error({ err: errLama, id }, 'gagal membaca NCR')
        return reply.status(500).send({ error: 'Gagal membaca ketidaksesuaian' })
      }
      if (!lama) return reply.status(404).send({ error: 'NCR tidak ditemukan' })
      if (!(await proyekMilikTenant(request, lama.project_id as string))) {
        return reply.status(404).send({ error: 'NCR tidak ditemukan' })
      }

      const ubah: Record<string, unknown> = {}
      for (const k of ['judul', 'deskripsi', 'lokasi', 'acuan', 'severity',
        'tindakan_perbaikan', 'akar_masalah'] as const) {
        if (b[k] !== undefined) ubah[k] = b[k]
      }
      for (const k of ['ditugaskan_ke', 'target_selesai', 'biaya_dampak'] as const) {
        if (b[k] !== undefined) ubah[k] = b[k]
      }
      if (Object.keys(ubah).length === 0) {
        return reply.status(400).send({ error: 'Tidak ada perubahan' })
      }

      const { data, error } = await request.db!
        .viaProject('ncr_items', lama.project_id as string)
        .update(ubah)
        .eq('id', id)
        .select(NCR_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui NCR')
        return reply.status(500).send({ error: 'Gagal memperbarui ketidaksesuaian' })
      }

      await logAuditEvent(request, {
        action: 'UPDATE', actorId: request.currentUser!.id, tableName: 'ncr_items', recordId: id, newValues: ubah,
      })
      return reply.send({ data })
    },
  )

  // ── PATCH /api/v1/ncr/:id/disposisi ─────────────────────────────────────
  // Keputusan formal atas ketidaksesuaian. Capability TERPISAH: ia punya
  // konsekuensi biaya dan kontrak.
  app.patch<{
    Params: { id: string }
    Body: { disposisi: string; catatan?: string }
  }>(
    '/api/v1/ncr/:id/disposisi',
    { preHandler: [authenticate, requirePermission('ncr:disposisi')] },
    async (request, reply) => {
      const { id } = request.params
      const { disposisi, catatan } = request.body ?? {}

      const SAH = ['perbaiki', 'terima', 'bongkar', 'ubah_spek']
      if (!SAH.includes(disposisi)) {
        return reply.status(400).send({
          error: `Disposisi harus salah satu dari: ${SAH.join(', ')}`,
        })
      }

      // "Terima apa adanya" berarti perusahaan menanggung ketidaksesuaian.
      // Keputusan itu wajib beralasan tertulis — kalau tidak, ia akan jadi
      // jalan pintas untuk menutup NCR tanpa memperbaiki apa pun.
      if (disposisi === 'terima' && !catatan?.trim()) {
        return reply.status(400).send({
          error: 'Disposisi "terima apa adanya" wajib disertai alasan tertulis',
        })
      }

      const { data: lama, error: errLama } = await request.db!
        .unsafe('ncr_items', 'baca satu NCR untuk verifikasi tenant sebelum disposisi')
        .select('id, project_id, nomor, status, dilaporkan_oleh, ditugaskan_ke')
        .eq('id', id)
        .maybeSingle()

      if (errLama) {
        request.log.error({ err: errLama, id }, 'gagal membaca NCR')
        return reply.status(500).send({ error: 'Gagal membaca ketidaksesuaian' })
      }
      if (!lama) return reply.status(404).send({ error: 'NCR tidak ditemukan' })
      if (!(await proyekMilikTenant(request, lama.project_id as string))) {
        return reply.status(404).send({ error: 'NCR tidak ditemukan' })
      }

      const { data, error } = await request.db!
        .viaProject('ncr_items', lama.project_id as string)
        .update({
          disposisi,
          disposisi_oleh: request.currentUser!.id,
          disposisi_pada: new Date().toISOString(),
          disposisi_catatan: catatan ?? null,
          // Disposisi memindahkan NCR ke tahap berikutnya. `terima` dan
          // `ubah_spek` tak menuntut pekerjaan fisik, jadi langsung
          // menunggu verifikasi; dua lainnya masuk tahap perbaikan.
          status: ['terima', 'ubah_spek'].includes(disposisi) ? 'verifikasi' : 'perbaikan',
        })
        .eq('id', id)
        .select(NCR_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id, disposisi }, 'gagal menyimpan disposisi')
        return reply.status(500).send({ error: 'Gagal menyimpan disposisi' })
      }

      await logAuditEvent(request, {
        action: 'UPDATE', actorId: request.currentUser!.id, tableName: 'ncr_items', recordId: id,
        newValues: { disposisi, catatan },
      })

      const penerima = [lama.dilaporkan_oleh, lama.ditugaskan_ke]
        .filter((u): u is string => !!u && u !== request.currentUser!.id)
      if (penerima.length) {
        await createNotifications(penerima.map((userId) => ({
          company_id: request.companyId!,
          user_id: userId,
          type: 'ncr_disposisi',
          title: `${lama.nomor}: disposisi ${disposisi}`,
          message: catatan ?? 'Keputusan atas ketidaksesuaian sudah ditetapkan.',
          project_id: lama.project_id as string,
        })))
      }

      return reply.send({ data })
    },
  )

  // ── PATCH /api/v1/ncr/:id/status ────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { status: string; catatan?: string }
  }>(
    '/api/v1/ncr/:id/status',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { status, catatan } = request.body ?? {}

      const { data: lama, error: errLama } = await request.db!
        .unsafe('ncr_items', 'baca satu NCR untuk verifikasi tenant sebelum ubah status')
        .select('id, project_id, nomor, status, dilaporkan_oleh, ditugaskan_ke, tindakan_perbaikan, akar_masalah')
        .eq('id', id)
        .maybeSingle()

      if (errLama) {
        request.log.error({ err: errLama, id }, 'gagal membaca NCR')
        return reply.status(500).send({ error: 'Gagal membaca ketidaksesuaian' })
      }
      if (!lama) return reply.status(404).send({ error: 'NCR tidak ditemukan' })
      if (!(await proyekMilikTenant(request, lama.project_id as string))) {
        return reply.status(404).send({ error: 'NCR tidak ditemukan' })
      }

      const dariStatus = lama.status as string
      if (!TRANSISI_SAH[dariStatus]?.includes(status)) {
        return reply.status(400).send({
          error: `Tidak bisa berpindah dari "${dariStatus}" ke "${status}". ` +
            `Yang mungkin: ${(TRANSISI_SAH[dariStatus] ?? []).join(', ') || '(tidak ada)'}`,
        })
      }

      // ── Menutup: capability BERBEDA, dan pelapor tak boleh menutup sendiri
      const ubah: Record<string, unknown> = { status }

      if (status === 'ditutup') {
        // Dicek di sini juga, bukan hanya di constraint database. Constraint
        // memberi galat Postgres yang tak bisa dibaca pemakai; ini memberi
        // kalimat yang menjelaskan apa yang kurang.
        if (!(await hasPermission(request, 'ncr:verify'))) {
          return reply.status(403).send({
            error: 'Menutup NCR butuh izin verifikasi — sengaja terpisah dari kelola, ' +
              'supaya pelaksana tidak menutup perkaranya sendiri',
          })
        }
        if (lama.dilaporkan_oleh === request.currentUser!.id) {
          return reply.status(403).send({
            error: 'Pelapor tidak boleh memverifikasi temuannya sendiri',
          })
        }
        if (!lama.tindakan_perbaikan || !String(lama.tindakan_perbaikan).trim()) {
          return reply.status(400).send({
            error: 'Isi dulu tindakan perbaikan sebelum menutup NCR',
          })
        }
        if (!lama.akar_masalah || !String(lama.akar_masalah).trim()) {
          return reply.status(400).send({
            error: 'Isi dulu akar masalah sebelum menutup NCR — tanpa itu, ' +
              'NCR hanya mencatat kesalahan, bukan mencegahnya terulang',
          })
        }
        ubah.diverifikasi_oleh = request.currentUser!.id
        ubah.diverifikasi_pada = new Date().toISOString()
        ubah.ditutup_pada = new Date().toISOString()
      }

      if (status === 'dibatalkan') {
        if (!catatan?.trim()) {
          return reply.status(400).send({
            error: 'Membatalkan NCR wajib disertai alasan',
          })
        }
        ubah.disposisi_catatan = catatan.trim()
      }

      // Dibuka kembali: jejak verifikasi lama DIHAPUS. Menyisakannya berarti
      // NCR yang sedang dikerjakan ulang tetap membawa cap "sudah
      // diverifikasi" — dan itu yang akan dibaca auditor.
      if (dariStatus === 'ditutup' && status === 'perbaikan') {
        ubah.diverifikasi_oleh = null
        ubah.diverifikasi_pada = null
        ubah.ditutup_pada = null
      }

      const { data, error } = await request.db!
        .viaProject('ncr_items', lama.project_id as string)
        .update(ubah)
        .eq('id', id)
        .select(NCR_SELECT)
        .single()

      if (error) {
        request.log.error({ err: error, id, status }, 'gagal mengubah status NCR')
        return reply.status(500).send({ error: 'Gagal mengubah status ketidaksesuaian' })
      }

      await logAuditEvent(request, {
        action: 'UPDATE', actorId: request.currentUser!.id, tableName: 'ncr_items', recordId: id,
        oldValues: { status: dariStatus },
        newValues: { status, catatan },
      })

      const penerima = [lama.dilaporkan_oleh, lama.ditugaskan_ke]
        .filter((u): u is string => !!u && u !== request.currentUser!.id)
      if (penerima.length) {
        await createNotifications(penerima.map((userId) => ({
          company_id: request.companyId!,
          user_id: userId,
          type: 'ncr_status',
          title: `${lama.nomor}: ${status}`,
          message: catatan ?? `Status ketidaksesuaian berubah jadi ${status}.`,
          project_id: lama.project_id as string,
        })))
      }

      return reply.send({ data })
    },
  )
}
