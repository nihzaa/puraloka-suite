import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  validasiKontrak, periksaTransisiKontrak, hitungNilaiKontrak, bandingkanNilai,
  type StatusKontrak, type BarisKontrak, type MasukanKontrak,
} from '../../lib/kontrak.js'

/**
 * REGISTER KONTRAK (kt-register) — dokumen kontrak sebagai entitas.
 *
 * ── Pembagian tugas dengan `projects` (keputusan founder 2026-08-12)
 *
 *     kontrak.nilai            apa yang DITANDATANGANI
 *     projects.contract_value  apa yang BERLAKU sekarang (jalur uang)
 *
 * `contract_value` dibaca 104 tempat — invoice, PPN, retensi, EVM, kurva S,
 * dashboard, IPC, termin, CVR. Rute ini TIDAK menulisnya: dua penulis untuk
 * satu kolom pasti berselisih, dan yang kalah adalah invoice yang terbit
 * dengan angka salah tanpa satu pun galat.
 *
 * Yang disediakan: PEMBANDING. Selisihnya dilaporkan beserta kemungkinan
 * sebabnya, dan manusia yang memutuskan.
 *
 * ── Tenancy
 *
 * `kontrak` kategori B — `company_id` langsung, RLS ber-FORCE.
 */
export default async function kontrakRoutes(app: FastifyInstance) {
  const ALASAN = 'kategori B; disaring company_id di baris berikutnya'

  const SELECT_KONTRAK = `
    id, jenis, nomor, judul, tanggal_tanda_tangan, tanggal_mulai, tanggal_selesai,
    nilai, retensi_pct, syarat_pembayaran, lingkup, status, alasan_batal,
    file_url, catatan, project_id, client_id, kontrak_induk_id, dibuat_pada,
    proyek:projects ( id, name, contract_value ),
    klien:clients ( id, company_name, contact_person ),
    induk:kontrak!kontrak_kontrak_induk_id_fkey ( id, nomor, judul )
  `

  // ── GET /api/v1/kontrak ──────────────────────────────────────────────────
  app.get<{ Querystring: { project_id?: string; status?: string; jenis?: string } }>(
    '/api/v1/kontrak',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      let query = db.unsafe('kontrak', ALASAN)
        .select(SELECT_KONTRAK)
        .eq('company_id', request.companyId!)
        .order('tanggal_tanda_tangan', { ascending: false })

      if (q.project_id) query = query.eq('project_id', q.project_id)
      if (q.status) query = query.eq('status', q.status)
      if (q.jenis) query = query.eq('jenis', q.jenis)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      return reply.send({ kontrak: data ?? [] })
    },
  )

  // ── GET /api/v1/kontrak/proyek/:projectId ────────────────────────────────
  //
  // Nilai kontraktual satu proyek beserta PEMBANDINGNYA terhadap jalur uang.
  // Inti guna modul ini: menjawab "berapa nilai awalnya, dan berapa sekarang".
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/kontrak/proyek/:projectId',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const db = request.db!
      const { projectId } = request.params

      if (!(await db.projectIds()).includes(projectId)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: daftar, error } = await db.unsafe('kontrak', ALASAN)
        .select('id, jenis, nomor, judul, tanggal_tanda_tangan, nilai, status, kontrak_induk_id')
        .eq('company_id', request.companyId!)
        .eq('project_id', projectId)
        .order('tanggal_tanda_tangan')
      if (error) return reply.status(500).send({ error: error.message })

      const { data: proyek, error: errProyek } = await db
        .unsafe('projects', 'id sudah diverifikasi lewat projectIds() di atas')
        .select('id, name, contract_value')
        .eq('id', projectId)
        .maybeSingle()
      if (errProyek) return reply.status(500).send({ error: errProyek.message })

      // Change order disetujui yang BELUM diaddendumkan — penjelas selisih
      // yang sah. Tanpa ini, selisih apa pun terbaca sebagai kesalahan.
      const { count: coBelum, error: errCo } = await db
        .viaProject('change_orders', projectId)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .is('kontrak_addendum_id', null)
      if (errCo) return reply.status(500).send({ error: errCo.message })

      const nilai = hitungNilaiKontrak((daftar ?? []) as unknown as BarisKontrak[])
      const banding = bandingkanNilai({
        menurutKontrak: nilai.berjalan,
        menurutProyek: (proyek as { contract_value: number | string } | null)?.contract_value ?? 0,
        adaCoBelumAddendum: (coBelum ?? 0) > 0,
      })

      return reply.send({
        proyek,
        kontrak: daftar ?? [],
        nilai,
        banding,
        co_belum_addendum: coBelum ?? 0,
      })
    },
  )

  // ── POST /api/v1/kontrak ─────────────────────────────────────────────────
  app.post<{
    Body: Record<string, unknown> & {
      project_id?: string
      kontrak_induk_id?: string | null
    }
  }>(
    '/api/v1/kontrak',
    { preHandler: [authenticate, requirePermission('projects:contract')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })

      const v = validasiKontrak(b as MasukanKontrak)
      if (!v.ok) return reply.status(400).send({ error: v.galat })

      if (v.nilai.jenis === 'addendum' && !b.kontrak_induk_id) {
        return reply.status(400).send({
          error: 'Addendum wajib menunjuk kontrak induknya — addendum yatim tak pernah '
            + 'masuk hitungan nilai proyeknya.',
        })
      }
      if (v.nilai.jenis === 'induk' && b.kontrak_induk_id) {
        return reply.status(400).send({
          error: 'Kontrak induk tak boleh menunjuk kontrak lain. Pilih jenis "addendum" '
            + 'bila ini perubahan atas kontrak yang sudah ada.',
        })
      }

      // Proyek WAJIB milik tenant ini, dan kliennya diambil DARI proyek —
      // bukan dari body. Klien yang diterima apa adanya bisa menunjuk pihak
      // yang tak pernah berhubungan dengan proyeknya.
      if (!(await db.projectIds()).includes(b.project_id)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const { data: proyek, error: errProyek } = await db
        .unsafe('projects', 'id sudah diverifikasi lewat projectIds() di atas')
        .select('id, client_id')
        .eq('id', b.project_id)
        .maybeSingle()
      if (errProyek) return reply.status(500).send({ error: errProyek.message })
      const clientId = (proyek as { client_id?: string } | null)?.client_id
      if (!clientId) {
        return reply.status(422).send({
          error: 'Proyek ini belum punya klien — kontrak tak bisa dibuat tanpa pihak '
            + 'yang menandatanganinya.',
        })
      }

      // Induk diverifikasi milik tenant ini SEBELUM menulis. Trigger basis
      // juga menegakkannya, tetapi galat Postgres tak bisa ditindaklanjuti
      // pengguna — dan pelajaran E1: rujukan yang tak diverifikasi terlihat
      // seperti bukti.
      if (b.kontrak_induk_id) {
        const { data: induk, error: errInduk } = await db.unsafe('kontrak', ALASAN)
          .select('id, jenis, project_id, status')
          .eq('id', b.kontrak_induk_id)
          .eq('company_id', request.companyId!)
          .maybeSingle()
        if (errInduk) return reply.status(500).send({ error: errInduk.message })
        if (!induk) return reply.status(404).send({ error: 'Kontrak induk tidak ditemukan' })

        const i = induk as Record<string, unknown>
        if (i.jenis !== 'induk') {
          return reply.status(422).send({
            error: 'Addendum hanya boleh menunjuk kontrak INDUK, bukan addendum lain — '
              + 'rantai berlapis membuat nilai kontrak jadi penelusuran rekursif.',
          })
        }
        if (i.project_id !== b.project_id) {
          return reply.status(422).send({
            error: 'Kontrak induk itu milik proyek lain — nilai addendumnya akan '
              + 'terhitung ke proyek yang salah.',
          })
        }
      }

      const { data, error } = await db.unsafe('kontrak', ALASAN)
        .insert({
          company_id: request.companyId!,
          project_id: b.project_id,
          client_id: clientId,
          kontrak_induk_id: b.kontrak_induk_id ?? null,
          file_url: (b.file_url as string | undefined) ?? null,
          dibuat_oleh: request.currentUser!.id,
          ...v.nilai,
        })
        .select('id, nomor, jenis, status, nilai')
        .single()
      if (error) {
        const kode = (error as { code?: string }).code
        if (kode === '23505') {
          return reply.status(409).send({
            error: `Nomor kontrak ${v.nilai.nomor} sudah dipakai, atau proyek ini sudah `
              + 'punya kontrak induk yang berlaku.',
          })
        }
        if (kode === '23514' || /check_violation/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'kontrak', recordId: (data as { id: string }).id,
        action: `kontrak.${v.nilai.jenis}.create`,
        actorId: request.currentUser!.id,
        newValues: { nomor: v.nilai.nomor, nilai: v.nilai.nilai, project_id: b.project_id },
        severity: 'critical',
      })

      return reply.status(201).send({ kontrak: data })
    },
  )

  // ── PATCH /api/v1/kontrak/:id/status ─────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { status?: StatusKontrak; alasan?: string }
  }>(
    '/api/v1/kontrak/:id/status',
    { preHandler: [authenticate, requirePermission('projects:contract')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const b = request.body ?? {}

      if (!b.status) return reply.status(400).send({ error: 'status wajib diisi' })

      const { data: ada, error: errBaca } = await db.unsafe('kontrak', ALASAN)
        .select('id, nomor, status, jenis, project_id')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      if (!ada) return reply.status(404).send({ error: 'Kontrak tidak ditemukan' })

      const k = ada as Record<string, unknown>
      const verdict = periksaTransisiKontrak({
        statusSekarang: k.status as StatusKontrak,
        statusTujuan: b.status,
        alasanBatal: b.alasan,
      })
      if (!verdict.boleh) return reply.status(409).send({ error: verdict.sebab })

      const patch: Record<string, unknown> = { status: b.status }
      if (b.status === 'dibatalkan') patch.alasan_batal = b.alasan!.trim()

      const { data, error } = await db.unsafe('kontrak', ALASAN)
        .update(patch)
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama IKUT di WHERE — dua keputusan bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', k.status as string)
        .select('id, nomor, status')
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: 'Proyek ini sudah punya kontrak induk yang BERLAKU. Selesaikan atau '
              + 'batalkan yang lama lebih dulu — dua kontrak induk berlaku membuat '
              + '"berapa nilai kontraknya" tak punya jawaban tunggal.',
          })
        }
        if (/check_violation/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Kontrak berubah dari tempat lain. Muat ulang.' })
      }

      void logAuditEvent(request, {
        tableName: 'kontrak', recordId: id,
        action: `kontrak.${b.status}`,
        actorId: request.currentUser!.id,
        oldValues: { status: k.status },
        newValues: patch,
        severity: 'critical',
      })

      return reply.send({ kontrak: data[0] })
    },
  )

  // ── PATCH /api/v1/change-orders/:id/addendum ─────────────────────────────
  //
  // Menyambungkan change order yang sudah disetujui ke addendum yang
  // mengesahkannya. Dipisah dari rute change order karena ia mengubah
  // hubungan KONTRAKTUAL, bukan lingkup pekerjaannya.
  app.patch<{ Params: { id: string }; Body: { kontrak_addendum_id?: string | null } }>(
    '/api/v1/change-orders/:id/addendum',
    { preHandler: [authenticate, requirePermission('projects:contract')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const addendumId = request.body?.kontrak_addendum_id ?? null

      const idProyek = await db.projectIds()
      const { data: co, error: errCo } = await db
        .unsafe('change_orders', 'disaring project_id milik tenant di baris berikutnya')
        .select('id, co_number, status, project_id')
        .eq('id', id)
        .in('project_id', idProyek)
        .maybeSingle()
      if (errCo) return reply.status(500).send({ error: errCo.message })
      if (!co) return reply.status(404).send({ error: 'Change order tidak ditemukan' })

      const c = co as Record<string, unknown>
      if (c.status !== 'approved') {
        return reply.status(409).send({
          error: `Change order ${c.co_number} berstatus ${c.status} — hanya yang sudah `
            + 'disetujui yang bisa disambungkan ke addendum.',
        })
      }

      if (addendumId) {
        const { data: add, error: errAdd } = await db.unsafe('kontrak', ALASAN)
          .select('id, jenis, project_id, status')
          .eq('id', addendumId)
          .eq('company_id', request.companyId!)
          .maybeSingle()
        if (errAdd) return reply.status(500).send({ error: errAdd.message })
        if (!add) return reply.status(404).send({ error: 'Addendum tidak ditemukan' })

        const a = add as Record<string, unknown>
        if (a.jenis !== 'addendum') {
          return reply.status(422).send({
            error: 'Yang dipilih bukan addendum. Change order disahkan oleh addendum, '
              + 'bukan oleh kontrak induk.',
          })
        }
        if (a.project_id !== c.project_id) {
          return reply.status(422).send({
            error: 'Addendum itu milik proyek lain.',
          })
        }
      }

      const { data, error } = await db
        .unsafe('change_orders', 'id sudah diverifikasi milik tenant di atas')
        .update({ kontrak_addendum_id: addendumId })
        .eq('id', id)
        .in('project_id', idProyek)
        .select('id, co_number, kontrak_addendum_id')
      if (error) return reply.status(500).send({ error: error.message })
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Change order berubah dari tempat lain.' })
      }

      void logAuditEvent(request, {
        tableName: 'change_orders', recordId: id,
        action: addendumId ? 'change_order.sambung_addendum' : 'change_order.lepas_addendum',
        actorId: request.currentUser!.id,
        newValues: { kontrak_addendum_id: addendumId },
        severity: 'info',
      })

      return reply.send({ change_order: data[0] })
    },
  )
}
