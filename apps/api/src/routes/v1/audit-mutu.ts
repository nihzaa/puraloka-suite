import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  ringkasTemuan, bolehDiselesaikan,
  type TemuanAudit, type Audit,
} from '../../lib/audit-mutu.js'

/**
 * AUDIT MUTU (G1f) — pemeriksaan berkala penerapan SISTEM mutu.
 *
 * ── Kenapa berkas terpisah
 *
 * `mutu.ts` menangani HASIL pemeriksaan pekerjaan (checklist, uji material),
 * `rencana-mutu.ts` menangani RENCANA. Berkas ini menangani pemeriksaan atas
 * SISTEM-nya: apakah yang direncanakan benar-benar dijalankan.
 *
 * ── Peringatan tenancy
 *
 * `temuan_audit` kategori C dengan `lewat: 'audit_id'` — BUKAN `project_id`.
 * `viaProject('temuan_audit', projekId)` menyusun `.eq('audit_id', projekId)`
 * dan mengembalikan NOL BARIS tanpa galat apa pun. Kesalahan sekelas ini
 * sudah terjadi tiga kali di repo ini (rap.ts 2026-07-30,
 * weekly_wage_reports 2026-08-11, dan nyaris di itp_titik G1e).
 * `audit-viaproject-argumen.mjs` menjaganya.
 *
 * Skema, constraint, trigger, dan alasannya ada di `db/migrations/283_*.sql`.
 */

const AUDIT_SELECT = `
  id, project_id, nomor, judul, status, lingkup, kriteria,
  tanggal_rencana, tanggal_mulai, tanggal_selesai, teraudit,
  auditor, kesimpulan, catatan, rencana_mutu_id, created_at, updated_at,
  pemeriksa:users!audit_mutu_auditor_fkey ( id, name ),
  rencana:rencana_mutu ( id, nomor, judul )
`

const TEMUAN_SELECT = `
  id, audit_id, urutan, kode, uraian, klausul, bukti, klasifikasi,
  ncr_id, ditutup_pada, ditutup_oleh, catatan_penutupan,
  ncr:ncr_items ( id, nomor, judul, status )
`

export default async function auditMutuRoutes(app: FastifyInstance) {
  // ── GET /projects/:projectId/audit-mutu ──────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/audit-mutu',
    { preHandler: [authenticate, requirePermission('ncr:view')] },
    async (request, reply) => {
      const { projectId } = request.params

      const { data, error } = await request.db!
        .viaProject('audit_mutu', projectId)
        .select(AUDIT_SELECT)
        // Yang direncanakan paling akhir lebih dulu — audit terbaru yang
        // dicari, dan yang lama sudah punya laporannya sendiri.
        .order('tanggal_rencana', { ascending: false, nullsFirst: false })
        .limit(100)
      if (error) {
        request.log.error({ err: error, projectId }, 'gagal memuat audit mutu')
        return reply.status(500).send({ error: 'Gagal memuat audit mutu' })
      }

      return reply.send({ audit: data ?? [] })
    },
  )

  // ── GET /audit-mutu/:id — satu audit beserta temuannya ───────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/audit-mutu/:id',
    { preHandler: [authenticate, requirePermission('ncr:view')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: aud, error: eAud } = await request.db!
        .unsafe('audit_mutu',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select(AUDIT_SELECT)
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eAud) {
        request.log.error({ err: eAud, id }, 'gagal memuat audit mutu')
        return reply.status(500).send({ error: 'Gagal memuat audit mutu' })
      }
      if (!aud) return reply.status(404).send({ error: 'Audit tidak ditemukan' })

      // ⚠ `temuan_audit` lewat `audit_id`, BUKAN project_id.
      const { data: temuanData, error: eTemuan } = await request.db!
        .viaProject('temuan_audit', id)
        .select(TEMUAN_SELECT)
        .order('urutan', { ascending: true })
        .limit(500)
      if (eTemuan) {
        request.log.error({ err: eTemuan, id }, 'gagal memuat temuan audit')
        return reply.status(500).send({ error: 'Gagal memuat temuan audit' })
      }

      const temuan = (temuanData ?? []) as unknown as TemuanAudit[]
      const dok = aud as unknown as Audit

      return reply.send({
        audit: aud,
        temuan,
        ringkasan: ringkasTemuan(temuan),
        penyelesaian: bolehDiselesaikan(dok, temuan),
      })
    },
  )

  // ── POST /projects/:projectId/audit-mutu ─────────────────────────────────
  app.post<{
    Params: { projectId: string }
    Body: {
      nomor?: string; judul?: string; lingkup?: string; kriteria?: string
      tanggal_rencana?: string; auditor?: string; teraudit?: string
      rencana_mutu_id?: string
    }
  }>(
    '/api/v1/projects/:projectId/audit-mutu',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      const b = request.body

      if (!b.nomor?.trim()) return reply.status(400).send({ error: 'nomor wajib diisi' })
      if (!b.judul?.trim()) return reply.status(400).send({ error: 'judul wajib diisi' })

      const { data, error } = await request.db!
        .viaProject('audit_mutu', projectId)
        .insert({
          project_id: projectId,
          nomor: b.nomor.trim(),
          judul: b.judul.trim(),
          lingkup: b.lingkup?.trim() || null,
          kriteria: b.kriteria?.trim() || null,
          tanggal_rencana: b.tanggal_rencana || null,
          auditor: b.auditor || null,
          teraudit: b.teraudit?.trim() || null,
          rencana_mutu_id: b.rencana_mutu_id || null,
          dibuat_oleh: request.currentUser!.id,
        })
        .select('id, nomor, judul, status')
        .single()

      if (error) {
        request.log.error({ err: error, projectId }, 'gagal membuat audit mutu')
        return reply.status(500).send({ error: error.message })
      }

      await logAuditEvent(request, {
        action: 'INSERT',
        actorId: request.currentUser!.id,
        tableName: 'audit_mutu',
        recordId: data!.id as string,
        newValues: data as Record<string, unknown>,
      })
      return reply.status(201).send({ audit: data })
    },
  )

  // ── POST /audit-mutu/:id/temuan ──────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      uraian?: string; klausul?: string
      klasifikasi?: 'major' | 'minor' | 'observasi'
      kode?: string; bukti?: string; urutan?: number
    }
  }>(
    '/api/v1/audit-mutu/:id/temuan',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      if (!b.uraian?.trim()) return reply.status(400).send({ error: 'uraian wajib diisi' })

      // Klausul WAJIB. Temuan tanpa acuan adalah pendapat auditor, dan
      // pendapat tak bisa dibantah maupun ditutup — yang diaudit tak punya
      // cara menunjukkan bahwa ia sudah patuh.
      if (!b.klausul?.trim()) {
        return reply.status(400).send({
          error: 'klausul wajib diisi — temuan tanpa acuan adalah pendapat, '
            + 'dan yang diaudit tak punya cara membantah maupun menutupnya',
        })
      }

      // Klasifikasi menentukan AKIBAT (major wajib melahirkan NCR), jadi ia
      // tak boleh punya nilai bawaan. Menebak 'observasi' membuat kegagalan
      // sistem tercatat sebagai catatan; menebak 'major' membanjiri NCR
      // dengan hal yang tak menuntutnya.
      if (!b.klasifikasi || !['major', 'minor', 'observasi'].includes(b.klasifikasi)) {
        return reply.status(400).send({
          error: 'klasifikasi wajib salah satu: major, minor, observasi — '
            + 'ia menentukan apakah temuan ini wajib melahirkan NCR',
        })
      }

      const { data: aud, error: eAud } = await request.db!
        .unsafe('audit_mutu',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select('id, status')
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eAud) return reply.status(500).send({ error: eAud.message })
      if (!aud) return reply.status(404).send({ error: 'Audit tidak ditemukan' })

      if ((aud as { status: string }).status === 'selesai') {
        return reply.status(409).send({
          error: 'Audit sudah diselesaikan — laporannya sudah keluar. '
            + 'Temuan baru masuk audit berikutnya.',
        })
      }

      const { data, error } = await request.db!
        // ⚠ argumen kedua = audit_id (kolom `lewat`), BUKAN project_id.
        .viaProject('temuan_audit', id)
        .insert({
          audit_id: id,
          urutan: Number.isFinite(b.urutan) ? b.urutan : 0,
          kode: b.kode?.trim() || null,
          uraian: b.uraian.trim(),
          klausul: b.klausul.trim(),
          bukti: b.bukti?.trim() || null,
          klasifikasi: b.klasifikasi,
        })
        .select('id, uraian, klasifikasi')
        .single()

      if (error) {
        request.log.error({ err: error, id }, 'gagal menambah temuan audit')
        return reply.status(500).send({ error: error.message })
      }
      return reply.status(201).send({ temuan: data })
    },
  )

  // ── PATCH /temuan-audit/:id — tautkan NCR / tutup temuan ─────────────────
  app.patch<{
    Params: { id: string }
    Body: { ncr_id?: string | null; tutup?: boolean; catatan_penutupan?: string | null }
  }>(
    '/api/v1/temuan-audit/:id',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body

      const perubahan: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (b.ncr_id !== undefined) perubahan.ncr_id = b.ncr_id || null
      if (b.catatan_penutupan !== undefined) {
        perubahan.catatan_penutupan = b.catatan_penutupan?.trim() || null
      }
      // Penutup diisi SERVER dari sesi, bukan diterima dari klien. Penutup
      // yang bisa dipilih sendiri bukan bukti verifikasi.
      if (b.tutup === true) {
        perubahan.ditutup_pada = new Date().toISOString()
        perubahan.ditutup_oleh = request.currentUser!.id
      } else if (b.tutup === false) {
        perubahan.ditutup_pada = null
        perubahan.ditutup_oleh = null
      }

      const { data, error } = await request.db!
        .unsafe('temuan_audit',
          'id temuan langsung; tenancy dijamin RLS RESTRICTIVE lewat audit→project')
        .update(perubahan)
        .eq('id', id)
        .select('id, uraian, klasifikasi, ncr_id, ditutup_pada')
        .maybeSingle()

      if (error) {
        request.log.error({ err: error, id }, 'gagal memperbarui temuan audit')
        return reply.status(500).send({ error: error.message })
      }
      if (!data) return reply.status(404).send({ error: 'Temuan tidak ditemukan' })

      await logAuditEvent(request, {
        action: 'UPDATE',
        actorId: request.currentUser!.id,
        tableName: 'temuan_audit',
        recordId: id,
        newValues: data as Record<string, unknown>,
      })
      return reply.send({ temuan: data })
    },
  )

  // ── POST /audit-mutu/:id/selesaikan ──────────────────────────────────────
  //
  // Menyelesaikan audit berarti menyatakan pemeriksaan tuntas dan laporannya
  // berlaku. Basis menegakkan syaratnya lewat trigger dua sisi (283); yang di
  // sini menjelaskan SEBELUM orang mencoba — penolakan yang bisa diramalkan
  // lebih baik daripada penolakan yang mengejutkan.
  app.post<{ Params: { id: string }; Body: { kesimpulan?: string } }>(
    '/api/v1/audit-mutu/:id/selesaikan',
    { preHandler: [authenticate, requirePermission('ncr:manage')] },
    async (request, reply) => {
      const { id } = request.params

      const { data: aud, error: eAud } = await request.db!
        .unsafe('audit_mutu',
          'lookup by id, lalu disaring .in(project_id, projectIds()) di query yang SAMA')
        .select(AUDIT_SELECT)
        .eq('id', id)
        .in('project_id', await request.db!.projectIds())
        .maybeSingle()
      if (eAud) return reply.status(500).send({ error: eAud.message })
      if (!aud) return reply.status(404).send({ error: 'Audit tidak ditemukan' })

      const { data: temuanData, error: eTemuan } = await request.db!
        .viaProject('temuan_audit', id)
        .select(TEMUAN_SELECT)
        .limit(500)
      if (eTemuan) return reply.status(500).send({ error: eTemuan.message })

      const temuan = (temuanData ?? []) as unknown as TemuanAudit[]
      const dok = aud as unknown as Audit

      const izin = bolehDiselesaikan(dok, temuan)
      if (!izin.boleh) {
        const akhir = izin.penghalang.some(
          (p) => p.kode === 'sudah-selesai' || p.kode === 'dibatalkan')
        return reply.status(akhir ? 409 : 422).send({
          error: 'Audit belum bisa diselesaikan',
          penghalang: izin.penghalang,
        })
      }

      // Status lama ikut di WHERE — dua permintaan bersamaan tak boleh
      // sama-sama berhasil (pola yang dituntut `audit-klaim-status-atomik`).
      const { data, error } = await request.db!
        .unsafe('audit_mutu',
          'update dengan status lama di WHERE (anti penyelesaian ganda); disaring projectIds() di query yang SAMA')
        .update({
          status: 'selesai',
          tanggal_selesai: new Date().toISOString().slice(0, 10),
          ...(request.body?.kesimpulan !== undefined
            ? { kesimpulan: request.body.kesimpulan?.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .neq('status', 'selesai')
        .in('project_id', await request.db!.projectIds())
        .select('id, nomor, status, tanggal_selesai')
        .maybeSingle()

      if (error) {
        // Trigger 283 melempar `check_violation` bila ada major tanpa NCR.
        // Pemeriksaan di atas sudah menangkapnya lebih dulu; ini jaring
        // terakhir untuk perlombaan — temuan major bisa ditambahkan ANTARA
        // pemeriksaan dan update.
        request.log.error({ err: error, id }, 'gagal menyelesaikan audit')
        return reply.status(422).send({ error: error.message })
      }
      if (!data) {
        return reply.status(409).send({ error: 'Audit ini sudah diselesaikan' })
      }

      await logAuditEvent(request, {
        action: 'audit_mutu.selesai',
        actorId: request.currentUser!.id,
        tableName: 'audit_mutu',
        recordId: id,
        newValues: data as Record<string, unknown>,
        severity: 'critical',
      })
      return reply.send({ audit: data })
    },
  )
}
