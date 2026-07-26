import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain,
} from '../../utils/approval.js'
import { computeRab, computeBoq, type EstimateItemRow } from '../../lib/rab-readmodel.js'
import { forecastCashflow } from '../../lib/cashflow-forecast.js'
import {
  computeAhsp, computeRabLineTotal, computeRabRollup, type RoundingRule, type RabGroupInput,
} from '../../lib/ahsp-engine.js'
import { resolvePrices, type PriceBookEntryRow } from '../../lib/price-resolver.js'
import { getTaxRate } from '../../utils/financial-config.js'

// CECEP Milestone 3 — approval Estimate Version LEWAT engine ADR-007 (bukan jalur
// approval kelima). Keputusan founder pasca-discovery + mandat `47` §3 CECEP
// ("reuse RBAC existing, satu mekanisme"). Pola IDENTIK 4 modul existing (kasbon,
// change_order, material_request, project_expense).
//
// Alur status Estimate Version (guard struktural di DB, migration 110+111):
//   draft --submit--> under_review --approve(engine)--> approved --> frozen/superseded
//                     under_review --reject--> draft
// `estimate_versions.status` tetap sumber kebenaran; engine hanya gerbang SIAPA
// yang boleh menyetujui (ADR-007).

export default async function estimateVersionRoutes(app: FastifyInstance) {

  // ── GET /rab — read-model breakdown biaya (Milestone 4, no tabel baru) ──────
  // RAB = render Estimate Item jadi breakdown per CBS (`37` §3). Turunan murni;
  // angka dihitung lib/rab-readmodel.ts (ber-test terhadap hitungan manual).
  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/rab',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status, total_amount').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      const { data: items, error } = await supabase
        .from('estimate_items')
        .select('cost_code_id, cbs_node_id, quantity, amount')
        .eq('estimate_version_id', id)
      if (error) return reply.status(500).send({ error: error.message })

      const rab = computeRab((items ?? []) as EstimateItemRow[])
      return reply.send({ estimate_version_id: id, status: v.status, ...rab })
    })

  // ── GET /boq — kuantitas saja, TANPA harga (dokumen supplier) ───────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/boq',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: v } = await supabase
        .from('estimate_versions').select('id').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      const { data: items, error } = await supabase
        .from('estimate_items')
        .select('cost_code_id, cbs_node_id, quantity, amount')
        .eq('estimate_version_id', id)
      if (error) return reply.status(500).send({ error: error.message })

      return reply.send({ estimate_version_id: id, lines: computeBoq((items ?? []) as EstimateItemRow[]) })
    })

  // ── GET /cashflow-forecast — proyeksi pencairan kas (Milestone 4) ───────────
  // Read-model: distribusikan total estimasi ke N periode via normal-CDF (`52`
  // Gap 1). Angka dihitung lib/cashflow-forecast.ts (ber-test: Σ = baseline persis).
  // Fallback agregat (tanpa jadwal per-cost-code) = pola normal-CDF, sesuai `52`.
  app.get<{ Params: { id: string }; Querystring: { periods?: string } }>(
    '/api/v1/estimate-versions/:id/cashflow-forecast',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { id } = request.params
      const periods = Math.max(1, Math.min(104, Number(request.query.periods) || 12)) // cap 2 tahun mingguan
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status, total_amount').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      const forecast = forecastCashflow(Number(v.total_amount) || 0, periods)
      return reply.send({
        estimate_version_id: id, status: v.status,
        baseline_total: Number(v.total_amount) || 0, periods, forecast,
      })
    })

  // ── GET /projects/:projectId/scenarios — daftar skenario + ringkas versi ────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/scenarios',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { data, error } = await supabase
        .from('scenarios')
        .select(`id, name, purpose, status, created_at,
                 versions:estimate_versions(id, version_number, status, total_amount, edition_id)`)
        .eq('project_id', request.params.projectId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── POST /projects/:projectId/scenarios — buat skenario (wadah estimasi) ────
  app.post<{ Params: { projectId: string }; Body: { name?: string; purpose?: string } }>(
    '/api/v1/projects/:projectId/scenarios',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const name = request.body?.name?.trim()
      if (!name) return reply.status(400).send({ error: 'name wajib' })
      const { data: proj } = await supabase
        .from('projects').select('id').eq('id', request.params.projectId).maybeSingle()
      if (!proj) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      const { data: row, error } = await supabase
        .from('scenarios')
        .insert({ project_id: proj.id, name, purpose: request.body?.purpose ?? null,
                  created_by: request.currentUser!.id })
        .select('id').single()
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'scenarios', recordId: row.id, action: 'estimate.scenario_created',
        actorId: request.currentUser!.id, newValues: { name, project_id: proj.id },
      })
      return reply.status(201).send({ id: row.id })
    })

  // ── POST /scenarios/:scenarioId/versions — versi estimasi baru (draft) ──────
  // Estimasi MENYATAKAN edisi (117): edition_code opsional saat draft, permanen
  // begitu keluar draft (guard DB). version_number = lanjutan (identitas unik).
  app.post<{ Params: { scenarioId: string }; Body: { edition_code?: string } }>(
    '/api/v1/scenarios/:scenarioId/versions',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { data: sc } = await supabase
        .from('scenarios').select('id, status').eq('id', request.params.scenarioId).maybeSingle()
      if (!sc) return reply.status(404).send({ error: 'Skenario tidak ditemukan' })
      if (sc.status === 'archived') {
        return reply.status(409).send({ error: 'Skenario sudah diarsip — buat skenario baru' })
      }
      let editionId: string | null = null
      if (request.body?.edition_code) {
        const { data: ed } = await supabase
          .from('ahsp_editions').select('id, is_active')
          .eq('code', request.body.edition_code).maybeSingle()
        if (!ed) return reply.status(404).send({ error: `Edisi ${request.body.edition_code} tidak ditemukan` })
        if (!ed.is_active) return reply.status(409).send({ error: `Edisi ${request.body.edition_code} nonaktif` })
        editionId = ed.id
      }
      const { data: prev } = await supabase
        .from('estimate_versions').select('version_number')
        .eq('scenario_id', sc.id).order('version_number', { ascending: false }).limit(1)
      const next = ((prev?.[0]?.version_number as number | undefined) ?? 0) + 1
      const { data: row, error } = await supabase
        .from('estimate_versions')
        .insert({ scenario_id: sc.id, version_number: next, total_amount: 0,
                  edition_id: editionId, created_by: request.currentUser!.id })
        .select('id, version_number').single()
      if (error) return reply.status(500).send({ error: error.message })
      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: row.id, action: 'estimate.version_created',
        actorId: request.currentUser!.id,
        newValues: { scenario_id: sc.id, version_number: next, edition_code: request.body?.edition_code ?? null },
      })
      return reply.status(201).send({ id: row.id, version_number: row.version_number, status: 'draft' })
    })

  // ── GET /estimate-versions/:id — detail + items (untuk komposer UI) ─────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { data: v, error } = await supabase
        .from('estimate_versions')
        .select(`id, scenario_id, version_number, status, total_amount,
                 approved_by, approved_at, frozen_at, created_at,
                 edition:ahsp_editions!estimate_versions_edition_id_fkey(code, name),
                 items:estimate_items(id, quantity, amount, sort_order, notes,
                   cost_code:cost_codes(code, name),
                   assembly:assemblies(id, code, name, output_unit_code, source, version_number))`)
        .eq('id', request.params.id).maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      return reply.send({ data: v })
    })

  // ── GET /estimate-versions/:id/rollup — rekap per kategori (cost code) + PPN ─
  // Misi (c): SUM item per cost_code -> TOTAL BIAYA -> PPN -> GRAND TOTAL
  // (computeRabRollup, sama seperti REKAPITULASI workbook). PPN pakai tarif FLAT
  // ber-effective-date (financial_config 'tax.ppn_rate') via getTaxRate — model
  // dua-angka (rate x dpp_factor 11/12, PMK 131/2024) SENGAJA TIDAK dinyalakan;
  // itu gerbang terpisah (D10 guardrail, NEXT-EXEC-PREP.md §1) yang butuh
  // guardrail dijalankan ulang di lingkungan target sebelum aktif. Di sini
  // dppNum=dppDen=1 -> computePpn == dpp x rate persis (ekuivalen matematis).
  app.get<{ Params: { id: string }; Querystring: { at_date?: string } }>(
    '/api/v1/estimate-versions/:id/rollup',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { data: v, error } = await supabase
        .from('estimate_versions')
        .select(`id, created_at,
                 items:estimate_items(amount, cost_code:cost_codes(code, name))`)
        .eq('id', request.params.id).maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      type ItemRow = { amount: number; cost_code: { code: string; name: string } | null }
      const items = (v.items ?? []) as unknown as ItemRow[]
      const byGroup = new Map<string, { name: string; lineTotals: number[] }>()
      for (const it of items) {
        const key = it.cost_code?.code ?? '(tanpa kategori)'
        const name = it.cost_code?.name ?? '(tanpa kategori)'
        if (!byGroup.has(key)) byGroup.set(key, { name, lineTotals: [] })
        byGroup.get(key)!.lineTotals.push(Number(it.amount))
      }
      const groups: RabGroupInput[] = [...byGroup.entries()]
        .map(([code, g]) => ({ name: `${code} — ${g.name}`, lineTotals: g.lineTotals }))

      const atDate = request.query.at_date ?? (v.created_at as string).slice(0, 10)
      const ppnRate = await getTaxRate('ppn', atDate)
      const rollup = computeRabRollup(groups, { rate: ppnRate, dppNum: 1, dppDen: 1 })

      return reply.send({
        estimate_version_id: v.id, at_date: atDate, ppn_rate: ppnRate, ...rollup,
      })
    })

  // ── POST /items — tambah item dari ASSEMBLY (M3: jalur hitung ter-telusur) ──
  // Rantai explainability penuh: assembly (koefisien, edisi) × price book
  // (harga per resource, ter-resolve by tanggal+lokasi) → engine paritas →
  // amount = hsp_rounded × quantity. C1: BUK & rounding WAJIB dari caller —
  // TIDAK ada default diam-diam (config effective-date menyusul sebagai Lapis 1).
  app.post<{ Params: { id: string }
             Body: { assembly_id?: string; quantity?: number; price_date?: string
                     location?: string | null; buk_fraction?: number; rounding?: RoundingRule
                     cbs_node_id?: string; wbs_node_id?: string; notes?: string } }>(
    '/api/v1/estimate-versions/:id/items',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const b = request.body ?? {}
      if (!b.assembly_id) return reply.status(400).send({ error: 'assembly_id wajib' })
      if (typeof b.quantity !== 'number' || b.quantity <= 0) {
        return reply.status(400).send({ error: 'quantity wajib angka > 0' })
      }
      if (typeof b.buk_fraction !== 'number' || b.buk_fraction < 0 || b.buk_fraction > 1) {
        return reply.status(400).send({ error: 'buk_fraction wajib angka 0..1 — tidak ada default' })
      }
      if (!b.rounding || !['down', 'up', 'nearest', 'none'].includes(b.rounding.mode)
          || typeof b.rounding.step !== 'number') {
        return reply.status(400).send({ error: "rounding wajib {mode:'down'|'up'|'nearest'|'none', step:number}" })
      }
      const priceDate = b.price_date ?? new Date().toISOString().slice(0, 10)

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(409).send({ error: 'Item hanya bisa ditambah saat Estimate Version draft' })
      }

      const { data: asm, error: asmErr } = await supabase
        .from('assemblies')
        .select(`id, code, name, status, cost_code_id, output_unit_code,
                 components:assembly_components(coefficient,
                   resource:resources(id, code, name, category, unit_code))`)
        .eq('id', b.assembly_id).maybeSingle()
      if (asmErr) return reply.status(500).send({ error: asmErr.message })
      if (!asm) return reply.status(404).send({ error: 'Assembly tidak ditemukan' })
      if (asm.status !== 'active') {
        return reply.status(409).send({ error: `Assembly berstatus ${asm.status} — hanya assembly active yang bisa dipakai estimasi` })
      }

      type CompRow = { coefficient: number
        resource: { id: string; code: string; name: string; category: string; unit_code: string } | null }
      const comps = ((asm.components ?? []) as unknown as CompRow[]).filter(c => c.resource)
      const resourceIds = comps.map(c => c.resource!.id)

      const { data: pbe, error: pbErr } = await supabase
        .from('price_book_entries')
        .select('id, resource_id, amount, currency, version_number, effective_date, expired_date, location, status')
        .in('resource_id', resourceIds)
      if (pbErr) return reply.status(500).send({ error: pbErr.message })

      const { resolved, missing } = resolvePrices(
        (pbe ?? []) as PriceBookEntryRow[], resourceIds, priceDate, b.location ?? null)
      if (missing.length) {
        const missCodes = comps.filter(c => missing.includes(c.resource!.id)).map(c => c.resource!.code)
        return reply.status(422).send({
          error: `Harga tidak ter-resolve dari price book (tanggal ${priceDate}${b.location ? `, lokasi ${b.location}` : ''})`,
          missing: missCodes })
      }

      const GROUP: Record<string, 'tenaga' | 'bahan' | 'alat'> =
        { labor: 'tenaga', material: 'bahan', equipment: 'alat' }
      const unmappable = comps.filter(c => !GROUP[c.resource!.category]).map(c => c.resource!.code)
      if (unmappable.length) {
        return reply.status(422).send({ error: 'Kategori resource tanpa pemetaan grup AHSP', unmappable })
      }
      const engineComps = comps.map(c => ({
        group: GROUP[c.resource!.category], name: c.resource!.name, unit: c.resource!.unit_code,
        coefficient: Number(c.coefficient), hsd: Number(resolved.get(c.resource!.id)!.entry.amount),
      }))
      const hsp = computeAhsp(engineComps, b.buk_fraction, b.rounding)
      const amount = computeRabLineTotal(b.quantity, hsp.hspRounded)

      const { data: item, error: insErr } = await supabase
        .from('estimate_items')
        .insert({
          estimate_version_id: id, cost_code_id: asm.cost_code_id, assembly_id: asm.id,
          cbs_node_id: b.cbs_node_id ?? null, wbs_node_id: b.wbs_node_id ?? null,
          quantity: b.quantity, amount, notes: b.notes ?? null,
        })
        .select('id').single()
      if (insErr) return reply.status(500).send({ error: insErr.message })

      // total_amount = Σ item (hanya sah saat draft; guard DB menegakkan)
      const { data: sums } = await supabase
        .from('estimate_items').select('amount').eq('estimate_version_id', id)
      const total = (sums ?? []).reduce((s, r) => s + Number(r.amount), 0)
      await supabase.from('estimate_versions')
        .update({ total_amount: total, updated_by: request.currentUser!.id }).eq('id', id)

      void logAuditEvent(request, {
        tableName: 'estimate_items', recordId: item.id, action: 'estimate.item_added',
        actorId: request.currentUser!.id,
        newValues: { assembly: asm.code, quantity: b.quantity, amount, hsp: hsp.hspRounded },
      })
      return reply.status(201).send({
        item: { id: item.id, assembly_id: asm.id, assembly_code: asm.code,
                quantity: b.quantity, amount },
        hsp: hsp, // groupTotals + subtotalD + bukAmount + hspRaw + hspRounded
        prices: comps.map(c => {
          const r = resolved.get(c.resource!.id)!
          return { resource: c.resource!.code, amount: Number(r.entry.amount),
                   price_book_entry_id: r.entry.id, effective_date: r.entry.effective_date,
                   location: r.entry.location, matched_location: r.matched_location }
        }),
        version_total: total,
      })
    })

  // ── DELETE /items/:itemId — buang item (draft-only; total di-recompute) ─────
  app.delete<{ Params: { id: string; itemId: string } }>(
    '/api/v1/estimate-versions/:id/items/:itemId',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { id, itemId } = request.params
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(409).send({ error: 'Item hanya bisa dihapus saat Estimate Version draft' })
      }
      const { error: delErr, count } = await supabase
        .from('estimate_items').delete({ count: 'exact' })
        .eq('id', itemId).eq('estimate_version_id', id)
      if (delErr) return reply.status(500).send({ error: delErr.message })
      if (!count) return reply.status(404).send({ error: 'Item tidak ditemukan di versi ini' })

      const { data: sums } = await supabase
        .from('estimate_items').select('amount').eq('estimate_version_id', id)
      const total = (sums ?? []).reduce((s, r) => s + Number(r.amount), 0)
      await supabase.from('estimate_versions')
        .update({ total_amount: total, updated_by: request.currentUser!.id }).eq('id', id)

      void logAuditEvent(request, {
        tableName: 'estimate_items', recordId: itemId, action: 'estimate.item_removed',
        actorId: request.currentUser!.id, newValues: { version_total: total },
      })
      return reply.send({ ok: true, version_total: total })
    })

  // ── PATCH /submit — draft → under_review (author mengajukan) ────────────────
  // Submit = tindakan penyusun (manage), BUKAN approval. Perlu minimal 1 item
  // supaya tak mengajukan estimasi kosong.
  app.patch<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/submit',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { id } = request.params
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(400).send({ error: 'Hanya Estimate Version draft yang bisa diajukan' })
      }
      const { count } = await supabase
        .from('estimate_items').select('id', { count: 'exact', head: true }).eq('estimate_version_id', id)
      if ((count ?? 0) === 0) {
        return reply.status(400).send({ error: 'Estimate Version kosong — tambahkan minimal satu item' })
      }

      const { error } = await supabase.from('estimate_versions')
        .update({ status: 'under_review', updated_by: request.currentUser!.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.submitted',
        actorId: request.currentUser!.id, newValues: { status: 'under_review' }, severity: 'warning',
      })
      return reply.send({ ok: true, status: 'under_review' })
    })

  // ── PATCH /approve — under_review → approved via ENGINE ─────────────────────
  app.patch<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/approve',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const user = request.currentUser!

      // Gerbang KASAR sebelum fetch entitas → urutan 403-sebelum-404 (Phase 1).
      const coarse = await canParticipateInChain(request, 'estimate_version')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval estimasi gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status, total_amount').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya Estimate Version under_review yang bisa disetujui' })
      }

      // total_amount = basis ambang nominal (opsional; step tanpa min_amount = selalu).
      const decision = await evaluateEntityApproval(request, {
        entityType: 'estimate_version', entityId: id, amount: Number(v.total_amount) || 0,
      })
      if (decision.configError) {
        app.log.error({ configError: decision.configError, id }, 'evaluasi rantai approval estimasi gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!decision.allowed) {
        if (decision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'Estimasi sudah disetujui penuh' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }

      if (decision.step) {
        const rec = await recordApproval({
          entityType: 'estimate_version', entityId: id, level: decision.step.level, approvedBy: user.id,
        })
        if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

        // Bukan langkah terakhir → status TETAP under_review, menunggu level berikut.
        if (!decision.isFinalStep) {
          const next = decision.applicable.find(s => s.level > decision.step!.level)
          void logAuditEvent(request, {
            tableName: 'estimate_versions', recordId: id, action: 'estimate.approval.level',
            actorId: user.id, newValues: { level: decision.step.level, of: decision.applicable.length },
            severity: 'critical',
          })
          return reply.send({
            ok: true, pending_next_level: true,
            message: `Persetujuan level ${decision.step.level} tercatat. Menunggu persetujuan level ${next?.level ?? '-'}.`,
          })
        }
      }

      // Langkah final → status jadi approved.
      const { error } = await supabase.from('estimate_versions')
        .update({ status: 'approved', approved_by: user.id, updated_by: user.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.approved',
        actorId: user.id, newValues: { status: 'approved', total_amount: v.total_amount }, severity: 'critical',
      })
      return reply.send({ ok: true, status: 'approved' })
    })

  // ── PATCH /reject — under_review → draft (approver menolak) ─────────────────
  app.patch<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/v1/estimate-versions/:id/reject',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const user = request.currentUser!

      const coarse = await canParticipateInChain(request, 'estimate_version')
      if (coarse.configError) {
        app.log.error({ configError: coarse.configError }, 'baca rantai approval estimasi gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya Estimate Version under_review yang bisa ditolak' })
      }

      // Ditolak → jejak persetujuan dibersihkan (rantai mulai dari awal bila diajukan
      // ulang), status kembali ke draft agar bisa direvisi.
      await clearApprovalProgress('estimate_version', id)
      const { error } = await supabase.from('estimate_versions')
        .update({ status: 'draft', updated_by: user.id }).eq('id', id)
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.rejected',
        actorId: user.id, newValues: { status: 'draft', reason: request.body?.reason ?? null }, severity: 'critical',
      })
      return reply.send({ ok: true, status: 'draft' })
    })
}
