import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  susunBarisRab, periksaTerapTemplate, urutkanTemplate, versiBerikutnya,
  type NodeTemplate, type RingkasTemplate, type StatusTemplate,
} from '../../lib/template-wbs.js'

/**
 * TEMPLATE WBS (F2) — kerangka pekerjaan yang dipakai ulang.
 *
 * ── Yang membuat modul ini ada
 *
 * Diukur 2026-08-12: 13 dari 15 proyek punya NOL item RAB, dan 8 dari 16
 * kategori unik pada dua proyek yang terisi IDENTIK kata demi kata. Struktur
 * yang sama diketik ulang tiap proyek — dan pos yang terlewat dari ingatan tak
 * pernah dianggarkan.
 *
 * `cbs_templates`/`cbs_nodes` sudah ada untuk ini sejak awal, dengan nol
 * pembaca di seluruh kode.
 *
 * ── Tenancy
 *
 * Keduanya kategori AB. `company_id` NULL berarti katalog `standard` yang
 * terlihat semua tenant — dan sejak migrasi 335, MENULIS baris ber-NULL
 * ditolak policy: hanya migrasi yang boleh menambah katalog bersama.
 */
export default async function templateWbsRoutes(app: FastifyInstance) {
  const ALASAN_T = 'kategori AB; disaring company_id + katalog standard di baris berikutnya'
  const ALASAN_N = 'kategori AB; template induknya sudah diverifikasi milik tenant ini'

  // ── GET /api/v1/template-wbs ─────────────────────────────────────────────
  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/template-wbs',
    { preHandler: [authenticate, requirePermission('cecep:cbs:view')] },
    async (request, reply) => {
      const db = request.db!
      const q = request.query

      // Katalog `standard` (company_id NULL) SENGAJA ikut terbaca: ia dasar
      // yang disalin jadi template perusahaan sendiri. Yang tak boleh adalah
      // MENULIS ke sana, dan itu dijaga policy.
      let query = db.unsafe('cbs_templates', ALASAN_T)
        .select('id, code, name, description, source, version_number, status, activated_at, company_id, created_at')
        .or(`company_id.eq.${request.companyId!},company_id.is.null`)
      if (q.status) query = query.eq('status', q.status)

      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })

      const daftar = (data ?? []) as unknown as Array<RingkasTemplate & { company_id: string | null }>
      if (daftar.length === 0) return reply.send({ template: [] })

      // Jumlah node per template — angka yang paling menentukan di layar.
      // Template tanpa node terlihat sama dengan yang berisi 40 baris sampai
      // seseorang membukanya.
      const { data: node, error: errNode } = await db.unsafe('cbs_nodes', ALASAN_N)
        .select('template_id')
        .in('template_id', daftar.map((t) => t.id))
      if (errNode) return reply.status(500).send({ error: errNode.message })

      const hitung = new Map<string, number>()
      for (const n of (node ?? []) as Array<{ template_id: string }>) {
        hitung.set(n.template_id, (hitung.get(n.template_id) ?? 0) + 1)
      }

      return reply.send({
        template: urutkanTemplate(
          daftar.map((t) => ({ ...t, jumlahNode: hitung.get(t.id) ?? 0 })),
        ).map((t) => ({
          ...t,
          // Katalog bersama ditandai eksplisit: ia tak bisa disunting, dan
          // tombol yang mati tanpa penjelasan terbaca sebagai kerusakan.
          milik_bersama: (t as { company_id?: string | null }).company_id === null,
        })),
      })
    },
  )

  // ── GET /api/v1/template-wbs/:id ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/template-wbs/:id',
    { preHandler: [authenticate, requirePermission('cecep:cbs:view')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params

      const { data: t, error } = await db.unsafe('cbs_templates', ALASAN_T)
        .select('id, code, name, description, source, version_number, status, activated_at, company_id')
        .eq('id', id)
        .or(`company_id.eq.${request.companyId!},company_id.is.null`)
        .maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!t) return reply.status(404).send({ error: 'Template tidak ditemukan' })

      const { data: node, error: errNode } = await db.unsafe('cbs_nodes', ALASAN_N)
        .select('id, parent_id, name, sort_order, cost_code_id')
        .eq('template_id', id)
        .order('sort_order')
      if (errNode) return reply.status(500).send({ error: errNode.message })

      return reply.send({
        template: { ...t, milik_bersama: (t as { company_id: string | null }).company_id === null },
        node: node ?? [],
      })
    },
  )

  // ── POST /api/v1/template-wbs ────────────────────────────────────────────
  app.post<{
    Body: {
      code?: string
      name?: string
      description?: string
      /** Salin struktur dari template lain (termasuk katalog standard). */
      salin_dari?: string | null
    }
  }>(
    '/api/v1/template-wbs',
    { preHandler: [authenticate, requirePermission('cecep:cbs:manage')] },
    async (request, reply) => {
      const db = request.db!
      const b = request.body

      if (!b?.code?.trim()) return reply.status(400).send({ error: 'Kode template wajib diisi' })
      if (!b.name?.trim()) return reply.status(400).send({ error: 'Nama template wajib diisi' })

      const kode = b.code.trim().toUpperCase()

      // Versi berikutnya diambil dari MAKS + 1, bukan jumlah baris: versi yang
      // dihapus tak boleh lahir kembali — dokumen yang merujuk versi lama akan
      // menunjuk struktur yang berbeda.
      const { data: adaVersi, error: errVersi } = await db.unsafe('cbs_templates', ALASAN_T)
        .select('version_number')
        .eq('company_id', request.companyId!)
        .eq('code', kode)
      if (errVersi) return reply.status(500).send({ error: errVersi.message })
      const versi = versiBerikutnya(
        ((adaVersi ?? []) as Array<{ version_number: number }>).map((v) => v.version_number),
      )

      // Sumber salinan diverifikasi lebih dulu: id dari body bisa menunjuk
      // template tenant lain, dan strukturnya akan tersalin tanpa satu pun
      // galat — pelajaran E1 (`tender_id` tanpa verifikasi).
      let sumber: NodeTemplate[] = []
      if (b.salin_dari) {
        const { data: asal, error: errAsal } = await db.unsafe('cbs_templates', ALASAN_T)
          .select('id')
          .eq('id', b.salin_dari)
          .or(`company_id.eq.${request.companyId!},company_id.is.null`)
          .maybeSingle()
        if (errAsal) return reply.status(500).send({ error: errAsal.message })
        if (!asal) return reply.status(404).send({ error: 'Template sumber tidak ditemukan' })

        const { data: nodeAsal, error: errNode } = await db.unsafe('cbs_nodes', ALASAN_N)
          .select('id, parent_id, name, sort_order, cost_code_id')
          .eq('template_id', b.salin_dari)
          .order('sort_order')
        if (errNode) return reply.status(500).send({ error: errNode.message })
        sumber = (nodeAsal ?? []) as unknown as NodeTemplate[]
      }

      const { data: baru, error } = await db.unsafe('cbs_templates', ALASAN_T)
        .insert({
          company_id: request.companyId!,
          code: kode,
          name: b.name.trim(),
          description: b.description?.trim() || null,
          source: 'company',
          version_number: versi,
          status: 'draft',
          created_by: request.currentUser!.id,
        })
        .select('id, code, name, version_number, status')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({ error: `Template ${kode} versi ${versi} sudah ada` })
        }
        return reply.status(500).send({ error: error.message })
      }

      const idBaru = (baru as { id: string }).id

      // Salin struktur PER TINGKAT: id induk yang baru hanya diketahui sesudah
      // barisnya tersimpan, jadi pemetaan lama→baru dibangun sambil berjalan.
      let tersalin = 0
      if (sumber.length > 0) {
        const susun = susunBarisRab(sumber)
        if (!susun.ok) {
          // Template sumber rusak (lingkaran induk / node yatim). Template
          // barunya SUDAH terbuat — dibiarkan sebagai draf kosong, bukan
          // dihapus: menghapus baris yang mungkin sudah dilihat orang lain
          // lebih membingungkan daripada draf kosong yang jelas.
          return reply.status(422).send({
            error: `Struktur template sumber tak bisa disalin: ${susun.galat}`,
            template: baru,
          })
        }

        const petaId = new Map<string, string>()
        for (const baris of susun.baris) {
          const indukBaru = baris.parent_kunci ? petaId.get(baris.parent_kunci) ?? null : null
          const { data: nodeBaru, error: errIns } = await db.unsafe('cbs_nodes', ALASAN_N)
            .insert({
              template_id: idBaru,
              parent_id: indukBaru,
              name: baris.name,
              sort_order: baris.sort_order,
              company_id: request.companyId!,
            })
            .select('id')
            .single()
          if (errIns) return reply.status(500).send({ error: errIns.message })
          petaId.set(baris.kunci, (nodeBaru as { id: string }).id)
          tersalin++
        }
      }

      void logAuditEvent(request, {
        tableName: 'cbs_templates', recordId: idBaru,
        action: 'template_wbs.create',
        actorId: request.currentUser!.id,
        newValues: { code: kode, version_number: versi, disalin_dari: b.salin_dari ?? null, node: tersalin },
        severity: 'info',
      })

      return reply.status(201).send({ template: baru, node_tersalin: tersalin })
    },
  )

  // ── PATCH /api/v1/template-wbs/:id/status ────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { status?: StatusTemplate } }>(
    '/api/v1/template-wbs/:id/status',
    { preHandler: [authenticate, requirePermission('cecep:cbs:manage')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const tujuan = request.body?.status

      if (tujuan !== 'active' && tujuan !== 'superseded') {
        return reply.status(400).send({
          error: 'status wajib "active" atau "superseded". Draf tak bisa dikembalikan — '
            + 'alurnya maju saja.',
        })
      }

      const { data: t, error: errBaca } = await db.unsafe('cbs_templates', ALASAN_T)
        .select('id, code, status, company_id')
        .eq('id', id).eq('company_id', request.companyId!)
        .maybeSingle()
      if (errBaca) return reply.status(500).send({ error: errBaca.message })
      // Katalog bersama TIDAK bisa diubah statusnya lewat rute ini — saringan
      // `company_id` di atas sudah mengeluarkannya, dan 404-nya benar: bagi
      // tenant ini, template itu memang bukan miliknya untuk diubah.
      if (!t) return reply.status(404).send({ error: 'Template tidak ditemukan' })

      const status = (t as { status: StatusTemplate }).status
      if (tujuan === 'active') {
        const { count, error: errNode } = await db.unsafe('cbs_nodes', ALASAN_N)
          .select('id', { count: 'exact', head: true })
          .eq('template_id', id)
        if (errNode) return reply.status(500).send({ error: errNode.message })
        if (!count || count === 0) {
          return reply.status(422).send({
            error: 'Template tanpa satu pun baris struktur tak bisa diaktifkan — '
              + 'proyek yang dibuat darinya akan lahir dengan RAB kosong.',
          })
        }
      }

      const { data, error } = await db.unsafe('cbs_templates', ALASAN_T)
        .update({ status: tujuan, updated_by: request.currentUser!.id })
        .eq('id', id).eq('company_id', request.companyId!)
        // Status lama IKUT di WHERE — dua keputusan bersamaan hanya boleh
        // menghasilkan satu yang berhasil.
        .eq('status', status)
        .select('id, code, version_number, status')
      if (error) {
        // Trigger `fn_cbs_template_status_transition` menolak transisi mundur
        // dengan pesan yang sudah ditulis untuk manusia — diteruskan apa adanya.
        if (/check_violation|tidak sah/i.test(error.message)) {
          return reply.status(422).send({ error: error.message })
        }
        if ((error as { code?: string }).code === '23505') {
          return reply.status(409).send({
            error: 'Sudah ada versi AKTIF dengan kode ini. Nonaktifkan yang lama lebih dulu '
              + '— dua versi aktif membuat template mana yang dipakai jadi tak tentu.',
          })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!data || data.length === 0) {
        return reply.status(409).send({ error: 'Template berubah dari tempat lain. Muat ulang.' })
      }

      void logAuditEvent(request, {
        tableName: 'cbs_templates', recordId: id,
        action: `template_wbs.${tujuan}`,
        actorId: request.currentUser!.id,
        oldValues: { status },
        newValues: { status: tujuan },
        severity: 'info',
      })

      return reply.send({ template: data[0] })
    },
  )

  // ── POST /api/v1/template-wbs/:id/terapkan ───────────────────────────────
  //
  // Inti F2: membuat RAB proyek dari struktur template.
  app.post<{ Params: { id: string }; Body: { project_id?: string } }>(
    '/api/v1/template-wbs/:id/terapkan',
    // `projects:edit` — izin yang SUDAH dipakai menulis `rab_items` di rute
    // lain, diukur ke kodenya. Bukan izin baru: dua izin untuk hal yang sama
    // menghasilkan dua kebenaran tentang siapa berwenang (pelajaran 289).
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      const db = request.db!
      const { id } = request.params
      const projectId = request.body?.project_id

      if (!projectId) return reply.status(400).send({ error: 'project_id wajib diisi' })
      if (!(await db.projectIds()).includes(projectId)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: t, error: errT } = await db.unsafe('cbs_templates', ALASAN_T)
        .select('id, code, name, status')
        .eq('id', id)
        .or(`company_id.eq.${request.companyId!},company_id.is.null`)
        .maybeSingle()
      if (errT) return reply.status(500).send({ error: errT.message })
      if (!t) return reply.status(404).send({ error: 'Template tidak ditemukan' })

      const { data: node, error: errNode } = await db.unsafe('cbs_nodes', ALASAN_N)
        .select('id, parent_id, name, sort_order, cost_code_id')
        .eq('template_id', id)
        .order('sort_order')
      if (errNode) return reply.status(500).send({ error: errNode.message })

      const { count: rabAda, error: errRab } = await db
        .viaProject('rab_items', projectId)
        .select('id', { count: 'exact', head: true })
      if (errRab) return reply.status(500).send({ error: errRab.message })

      const verdict = periksaTerapTemplate({
        statusTemplate: (t as { status: StatusTemplate }).status,
        jumlahNode: (node ?? []).length,
        jumlahRabProyek: rabAda ?? 0,
      })
      if (!verdict.boleh) return reply.status(422).send({ error: verdict.sebab })

      const susun = susunBarisRab((node ?? []) as unknown as NodeTemplate[])
      if (!susun.ok) return reply.status(422).send({ error: susun.galat })

      // Ditulis per-tingkat: id induk baru hanya diketahui sesudah barisnya
      // tersimpan. Bukan satu INSERT massal — dan itu memang harganya.
      const petaId = new Map<string, string>()
      let dibuat = 0
      for (const baris of susun.baris) {
        const indukBaru = baris.parent_kunci ? petaId.get(baris.parent_kunci) ?? null : null
        const { data: item, error: errIns } = await db
          .viaProject('rab_items', projectId)
          .insert({
            project_id: projectId,
            parent_id: indukBaru,
            level: baris.level,
            name: baris.name,
            sort_order: baris.sort_order,
            // Harga, volume, dan bobot SENGAJA kosong. Template membawa
            // STRUKTUR, bukan angka: harga satuan berubah tiap proyek, dan
            // template yang membawa harga lama membuat anggaran baru lahir
            // dengan harga tahun lalu — terlihat wajar sampai dibandingkan
            // dengan penawaran.
          })
          .select('id')
          .single()
        if (errIns) return reply.status(500).send({ error: errIns.message })
        petaId.set(baris.kunci, (item as { id: string }).id)
        dibuat++
      }

      void logAuditEvent(request, {
        tableName: 'rab_items', recordId: projectId,
        action: 'template_wbs.terapkan',
        actorId: request.currentUser!.id,
        newValues: { template_id: id, kode: (t as { code: string }).code, baris: dibuat },
        severity: 'critical',
      })

      return reply.status(201).send({
        dibuat,
        tingkat: susun.jumlahTingkat,
        pesan: `${dibuat} baris struktur dibuat dari template ${(t as { code: string }).code}. `
          + 'Harga dan volume belum diisi — template membawa kerangkanya, bukan angkanya.',
      })
    },
  )
}
