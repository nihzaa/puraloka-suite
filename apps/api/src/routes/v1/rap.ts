import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { computeMaterialAggregation, type TakeoffLineInput } from '../../lib/rab-compute.js'

// ============================================================
// CECEP langkah 7 — RAP / PAGU (desain §D6).
//
// RAB (estimate_*) = rencana JUAL ke klien: harga pasar + upah harian lewat AHSP.
// RAP (di sini)    = rencana BELANJA internal: harga supplier + borongan mandor.
// Selisihnya adalah margin yang dikelola — RAP tidak menggantikan RAB.
//
// Kuantitas material DITURUNKAN dari take-off RAB (endpoint /material-takeoff,
// langkah 6) lalu DISALIN ke `qty_ahsp`. Disalin, bukan dihitung ulang tiap
// dibuka: pagu adalah komitmen, dan angka yang ikut berubah setiap RAB atau
// katalog AHSP disunting bukan komitmen.
//
// Yang TIDAK dibangun: sambungan ke realisasi belanja (D7). Desainnya sendiri
// menandainya "discovery, jangan bangun" — titik sambungnya belum dipastikan.
// ============================================================

export default async function rapRoutes(app: FastifyInstance) {
  // ── GET /projects/:projectId/rap ──────────────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rap',
    { preHandler: [authenticate, requirePermission('cecep:rap:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await request.db!
        .viaProject('rap_budget', projectId)
        .select('id, name, status, notes, estimate_version_id, locked_at, created_at')
        .order('created_at', { ascending: false })

      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data: data ?? [] })
    })

  // ── POST /projects/:projectId/rap — turunkan RAP dari take-off RAB ────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/rap',
    { preHandler: [authenticate, requirePermission('cecep:rap:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body as { estimate_version_id?: string; name?: string; notes?: string }

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      if (!body.estimate_version_id) {
        return reply.status(400).send({ error: 'estimate_version_id wajib diisi' })
      }

      // Versi RAB harus benar-benar milik proyek ini. Tanpa cek ini, RAP proyek
      // A bisa diturunkan dari RAB proyek B — pagu yang isinya pekerjaan orang
      // lain, dan tak ada yang menandainya salah.
      // SENGAJA `.unsafe()`: query ini MEMVERIFIKASI versi milik proyek mana.
      // Kalau ia disaring duluan oleh wrapper, versi milik proyek lain hilang
      // dari hasil dan cabang "bukan milik proyek ini" tak pernah tercapai —
      // yang muncul malah 400 "versi tidak ditemukan", pesan yang menyesatkan
      // untuk kesalahan yang berbeda.
      const { data: versi } = await request.db!
        .unsafe('estimate_versions', 'verifikasi kepemilikan; TIDAK boleh disaring duluan agar cabang "bukan milik proyek ini" tercapai')
        .select('id, scenario:scenarios(project_id)')
        .eq('id', body.estimate_version_id)
        .maybeSingle()
      const sc = (versi as { scenario?: { project_id?: string } | { project_id?: string }[] } | null)?.scenario
      const proyekVersi = (Array.isArray(sc) ? sc[0] : sc)?.project_id
      if (!versi || proyekVersi !== projectId) {
        return reply.status(400).send({
          error: 'Versi estimasi tersebut bukan milik proyek ini',
        })
      }

      const { data: rap, error: errRap } = await request.db!
        .viaProject('rap_budget', projectId)
        .insert({
          project_id: projectId,
          estimate_version_id: body.estimate_version_id,
          name: body.name?.trim() || 'RAP',
          notes: body.notes?.trim() || null,
          created_by: request.currentUser!.id,
          updated_by: request.currentUser!.id,
        })
        .select('id, name, status, estimate_version_id')
        .single()

      if (errRap || !rap) {
        request.log.error({ err: errRap }, 'gagal membuat RAP')
        return reply.status(500).send({ error: 'Gagal membuat RAP' })
      }

      // Turunkan kuantitas dari take-off RAB. Memakai fungsi agregasi yang SAMA
      // dengan endpoint /material-takeoff — bukan menyalin logikanya — supaya
      // pagu tak pernah berbeda dari take-off yang dilihat di layar RAB.
      const { data: items } = await request.db!
        .viaProject('estimate_items', projectId)
        .select(`id, quantity,
                 assembly:assemblies(code, name,
                   components:assembly_components(coefficient,
                     resource:resources(id, code, name, category, unit_code)))`)
        .eq('estimate_version_id', body.estimate_version_id)
        .not('assembly_id', 'is', null)

      type CompRow = {
        coefficient: number
        resource: { id: string; name: string; category: string; unit_code: string } | null
      }
      type ItemRow = {
        id: string; quantity: number
        assembly: { code: string; name: string; components: CompRow[] } | null
      }

      const lines: TakeoffLineInput[] = []
      const satuan = new Map<string, string>()
      for (const it of (items ?? []) as unknown as ItemRow[]) {
        if (!it.assembly) continue
        for (const c of it.assembly.components) {
          if (!c.resource) continue
          // Hanya BAHAN yang masuk pagu material. Tenaga & alat punya jalurnya
          // sendiri (rap_labor_line, model borongan) — memasukkannya ke sini
          // berarti menganggarkan upah dua kali.
          if (c.resource.category !== 'material') continue
          lines.push({
            estimateItemId: it.id,
            workName: `${it.assembly.code} — ${it.assembly.name}`,
            volume: Number(it.quantity),
            resourceId: c.resource.id,
            resourceName: c.resource.name,
            unitCode: c.resource.unit_code,
            coefficient: Number(c.coefficient),
          })
          satuan.set(c.resource.id, c.resource.unit_code)
        }
      }

      const agregat = computeMaterialAggregation(lines)
      if (agregat.length > 0) {
        const { error: errLine } = await request.db!
          .viaProject('rap_material_line', projectId)
          .insert(agregat.map((a) => ({
            rap_budget_id: rap.id,
            resource_id: a.resourceId,
            qty_ahsp: a.qtyAhsp,
            // Tanpa penyesuaian, adjusted = ahsp. Bukan nol: RAP yang lahir
            // dengan seluruh pagu nol terlihat seperti RAP kosong.
            qty_adjusted: a.qtyAhsp,
            unit_code: satuan.get(a.resourceId) ?? a.unitCode,
            supplier_price: 0,
          })))
        if (errLine) {
          request.log.error({ err: errLine }, 'gagal menurunkan baris material RAP')
        }
      }

      await logAuditEvent(request, {
        tableName: 'rap_budget',
        recordId: rap.id,
        action: 'cecep.rap_created',
        actorId: request.currentUser!.id,
        newValues: { name: rap.name, estimate_version_id: rap.estimate_version_id,
                     baris_material: agregat.length },
        reason: 'RAP diturunkan dari take-off RAB',
      })

      return reply.status(201).send({ data: rap, baris_material: agregat.length })
    })

  // ── GET /rap/:id — detail + pagu ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/rap/:id',
    { preHandler: [authenticate, requirePermission('cecep:rap:view')] },
    async (request, reply) => {
      const rap = await ambilRap(request, request.params.id)
      if (!rap) return reply.status(404).send({ error: 'RAP tidak ditemukan' })

      const { data: material } = await request.db!
        .viaProject('rap_material_line', rap.project_id)
        .select(`id, resource_id, qty_ahsp, qty_adjusted, unit_code, supplier_price,
                 supplier_id, pagu, notes, resource:resources(code, name)`)
        .eq('rap_budget_id', rap.id)

      const { data: labor } = await request.db!
        .viaProject('rap_labor_line', rap.project_id)
        .select('id, work_scope_id, description, borongan_value, notes')
        .eq('rap_budget_id', rap.id)

      const totalMaterial = (material ?? []).reduce(
        (s: number, r: { pagu: string | number }) => s + Number(r.pagu ?? 0), 0)
      const totalLabor = (labor ?? []).reduce(
        (s: number, r: { borongan_value: string | number }) => s + Number(r.borongan_value ?? 0), 0)

      return reply.send({
        data: rap,
        material: material ?? [],
        labor: labor ?? [],
        total: {
          material: totalMaterial,
          labor: totalLabor,
          pagu: totalMaterial + totalLabor,
        },
      })
    })

  // ── PATCH /rap/:id/material/:lineId — sesuaikan qty / harga supplier ──────
  app.patch<{ Params: { id: string; lineId: string } }>(
    '/api/v1/rap/:id/material/:lineId',
    { preHandler: [authenticate, requirePermission('cecep:rap:manage')] },
    async (request, reply) => {
      const rap = await ambilRap(request, request.params.id)
      if (!rap) return reply.status(404).send({ error: 'RAP tidak ditemukan' })
      if (rap.status === 'locked') {
        return reply.status(409).send({
          error: 'RAP sudah dikunci. Perubahan pagu dicatat lewat change log.',
        })
      }

      const body = request.body as {
        qty_adjusted?: number; supplier_price?: number
        supplier_id?: string | null; notes?: string
      }
      const patch: Record<string, unknown> = {}
      if (body.qty_adjusted !== undefined) {
        if (!(body.qty_adjusted >= 0)) {
          return reply.status(400).send({ error: 'qty_adjusted tidak boleh negatif' })
        }
        patch.qty_adjusted = body.qty_adjusted
      }
      if (body.supplier_price !== undefined) {
        if (!(body.supplier_price >= 0)) {
          return reply.status(400).send({ error: 'supplier_price tidak boleh negatif' })
        }
        patch.supplier_price = body.supplier_price
      }
      if (body.supplier_id !== undefined) patch.supplier_id = body.supplier_id
      if (body.notes !== undefined) patch.notes = body.notes
      if (Object.keys(patch).length === 0) {
        return reply.status(400).send({ error: 'Tidak ada perubahan yang dikirim' })
      }
      patch.updated_at = new Date().toISOString()

      const { data, error } = await request.db!
        .viaProject('rap_material_line', rap.project_id)
        .update(patch)
        .eq('id', request.params.lineId)
        .eq('rap_budget_id', rap.id)
        .select('id, qty_ahsp, qty_adjusted, supplier_price, pagu')
        .maybeSingle()

      if (error) return reply.status(500).send({ error: error.message })
      if (!data) return reply.status(404).send({ error: 'Baris pagu tidak ditemukan' })
      return reply.send({ data })
    })

  // ── POST /rap/:id/labor — tambah pagu borongan ────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/rap/:id/labor',
    { preHandler: [authenticate, requirePermission('cecep:rap:manage')] },
    async (request, reply) => {
      const rap = await ambilRap(request, request.params.id)
      if (!rap) return reply.status(404).send({ error: 'RAP tidak ditemukan' })
      if (rap.status === 'locked') {
        return reply.status(409).send({ error: 'RAP sudah dikunci' })
      }

      const body = request.body as {
        description?: string; borongan_value?: number
        work_scope_id?: string | null; notes?: string
      }
      if (!body.description?.trim()) {
        return reply.status(400).send({ error: 'Uraian pekerjaan wajib diisi' })
      }
      if (!(Number(body.borongan_value ?? 0) >= 0)) {
        return reply.status(400).send({ error: 'Nilai borongan tidak boleh negatif' })
      }

      const { data, error } = await request.db!
        .viaProject('rap_labor_line', rap.project_id)
        .insert({
          rap_budget_id: rap.id,
          work_scope_id: body.work_scope_id ?? null,
          description: body.description.trim(),
          borongan_value: body.borongan_value ?? 0,
          notes: body.notes?.trim() || null,
        })
        .select('id, description, borongan_value')
        .single()

      if (error) return reply.status(500).send({ error: error.message })
      return reply.status(201).send({ data })
    })

  // ── PATCH /rap/:id/lock — kunci pagu ──────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/rap/:id/lock',
    { preHandler: [authenticate, requirePermission('cecep:rap:manage')] },
    async (request, reply) => {
      const rap = await ambilRap(request, request.params.id)
      if (!rap) return reply.status(404).send({ error: 'RAP tidak ditemukan' })
      if (rap.status === 'locked') {
        return reply.status(409).send({ error: 'RAP sudah dikunci' })
      }

      // Mengunci pagu yang seluruhnya nol hampir pasti bukan yang dimaksud —
      // biasanya harga supplier belum sempat diisi. Ditolak dengan penjelasan,
      // bukan dibiarkan menghasilkan komitmen kosong yang tak bisa dibuka lagi.
      const { data: baris } = await request.db!
        .viaProject('rap_material_line', rap.project_id)
        .select('pagu').eq('rap_budget_id', rap.id)
      const { data: upah } = await request.db!
        .viaProject('rap_labor_line', rap.project_id)
        .select('borongan_value').eq('rap_budget_id', rap.id)

      const total =
        (baris ?? []).reduce((s: number, r: { pagu: string | number }) => s + Number(r.pagu ?? 0), 0) +
        (upah ?? []).reduce((s: number, r: { borongan_value: string | number }) => s + Number(r.borongan_value ?? 0), 0)

      if (total <= 0) {
        return reply.status(400).send({
          error:
            'Pagu masih nol seluruhnya — isi harga supplier atau nilai borongan ' +
            'sebelum mengunci. RAP yang terkunci tidak dapat dibuka kembali.',
        })
      }

      const { data, error } = await request.db!
        .viaProject('rap_budget', rap.project_id)
        .update({
          status: 'locked',
          locked_at: new Date().toISOString(),
          locked_by: request.currentUser!.id,
          updated_by: request.currentUser!.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rap.id)
        .select('id, status, locked_at')
        .single()

      if (error) return reply.status(500).send({ error: error.message })

      await logAuditEvent(request, {
        tableName: 'rap_budget',
        recordId: rap.id,
        action: 'cecep.rap_locked',
        actorId: request.currentUser!.id,
        newValues: { status: 'locked', total_pagu: total },
        severity: 'critical',
        reason: 'Pagu dikunci — menjadi komitmen; perubahan berikutnya lewat change log',
      })

      return reply.send({ data, total_pagu: total })
    })

  // ── POST /rap/:id/change-log — catat perubahan SESUDAH lock ───────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/rap/:id/change-log',
    { preHandler: [authenticate, requirePermission('cecep:rap:manage')] },
    async (request, reply) => {
      const rap = await ambilRap(request, request.params.id)
      if (!rap) return reply.status(404).send({ error: 'RAP tidak ditemukan' })

      const body = request.body as {
        line_table?: string; line_id?: string; field_name?: string
        old_value?: string; new_value?: string; reason?: string
      }
      if (!body.reason?.trim()) {
        return reply.status(400).send({
          error: 'Alasan perubahan wajib diisi — change log tanpa alasan hanya ' +
                 'mencatat bahwa sesuatu berubah, bukan kenapa',
        })
      }
      if (body.line_table !== 'rap_material_line' && body.line_table !== 'rap_labor_line') {
        return reply.status(400).send({ error: 'line_table tidak dikenal' })
      }

      const { data, error } = await request.db!
        .viaProject('rap_change_log', rap.project_id)
        .insert({
          rap_budget_id: rap.id,
          line_table: body.line_table,
          line_id: body.line_id,
          field_name: body.field_name,
          old_value: body.old_value ?? null,
          new_value: body.new_value ?? null,
          reason: body.reason.trim(),
          changed_by: request.currentUser!.id,
        })
        .select('id, changed_at')
        .single()

      if (error) return reply.status(500).send({ error: error.message })
      return reply.status(201).send({ data })
    })

  // ── GET /rap/:id/change-log ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/rap/:id/change-log',
    { preHandler: [authenticate, requirePermission('cecep:rap:view')] },
    async (request, reply) => {
      const rap = await ambilRap(request, request.params.id)
      if (!rap) return reply.status(404).send({ error: 'RAP tidak ditemukan' })

      const { data, error } = await request.db!
        .viaProject('rap_change_log', rap.project_id)
        .select('id, line_table, line_id, field_name, old_value, new_value, reason, changed_at, changed_by')
        .eq('rap_budget_id', rap.id)
        .order('changed_at', { ascending: false })

      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data: data ?? [] })
    })
}

/**
 * Ambil RAP milik tenant ini. `null` bila tak ada atau bukan miliknya —
 * pemanggil membalas 404, bukan 403: menjawab "tidak ditemukan" tak
 * membocorkan bahwa RAP itu ADA di perusahaan lain.
 */
async function ambilRap(
  request: FastifyRequest,
  id: string
): Promise<{ id: string; project_id: string; status: string } | null> {
  const proyekTenant = await request.db!.projectIds()
  if (proyekTenant.length === 0) return null

  // `.unsafe()` karena RAP dicari HANYA lewat id-nya — proyeknya belum
  // diketahui, jadi `.viaProject()` yang mensyaratkan project_id tak bisa
  // dipakai. Lingkupnya tetap dijaga: `.in('project_id', proyekTenant)` di
  // bawah, daftar proyek milik company aktif.
  const { data } = await request.db!
    .unsafe('rap_budget', 'lookup by id; proyek belum diketahui — di-scope .in(project_id, proyekTenant)')
    .select('id, project_id, status, name, notes, estimate_version_id, locked_at, created_at')
    .eq('id', id)
    .in('project_id', proyekTenant)
    .maybeSingle()

  return (data as { id: string; project_id: string; status: string } | null) ?? null
}
