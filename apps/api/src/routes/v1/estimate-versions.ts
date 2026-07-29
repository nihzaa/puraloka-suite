import type { FastifyInstance, FastifyRequest } from 'fastify'
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
import {
  computeMaterialAggregation, computeRebarBar, summarizeRebarByDiameter,
  type TakeoffLineInput, type RebarTakeoffLine,
} from '../../lib/rab-compute.js'
import { resolvePrices, type PriceBookEntryRow, type ProjectPriceOverrideRow } from '../../lib/price-resolver.js'
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

/**
 * T4g — apakah estimate_version milik company aktif?
 *
 * Rantainya: estimate_versions.scenario_id → scenarios.project_id → projects.
 * Seluruh modul estimasi (16 endpoint) di-key oleh id versi/skenario/item, jadi
 * tanpa gerbang ini tenant A bisa membaca DAN mengubah estimasi tenant B —
 * termasuk approve, reject, dan mengubah itemnya — hanya dgn mengetahui id-nya.
 *
 * Satu query, di-memo per request lewat projectIds() milik wrapper.
 */
async function versiMilikTenant(request: FastifyRequest, versionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('estimate_versions')
    .select('scenario:scenarios!inner(project_id)')
    .eq('id', versionId)
    .maybeSingle()
  const sc = data?.scenario as { project_id: string } | { project_id: string }[] | undefined
  const projectId = (Array.isArray(sc) ? sc[0] : sc)?.project_id
  if (!projectId) return false
  return (await request.db!.projectIds()).includes(projectId)
}

/** Daftar id scenario milik tenant — dipakai menyaring query versi. */
async function skenarioIdsTenant(request: FastifyRequest): Promise<string[]> {
  const { data } = await supabase
    .from('scenarios').select('id').in('project_id', await request.db!.projectIds())
  return (data ?? []).map((r: { id: string }) => r.id)
}

/** Idem untuk scenario_id. */
async function skenarioMilikTenant(request: FastifyRequest, scenarioId: string): Promise<boolean> {
  const { data } = await supabase
    .from('scenarios').select('project_id').eq('id', scenarioId).maybeSingle()
  if (!data?.project_id) return false
  return (await request.db!.projectIds()).includes(data.project_id)
}

export default async function estimateVersionRoutes(app: FastifyInstance) {

  // ── GET /rab — read-model breakdown biaya (Milestone 4, no tabel baru) ──────
  // RAB = render Estimate Item jadi breakdown per CBS (`37` §3). Turunan murni;
  // angka dihitung lib/rab-readmodel.ts (ber-test terhadap hitungan manual).
  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/rab',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }
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

      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }
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

      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }
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
      // T4g: gerbang proyek — skenario+versi tenant lain tak boleh terbaca.
      if (!(await request.db!.projectIds()).includes(request.params.projectId)) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
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
      const { data: proj } = await request.db!
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
        .from('scenarios').select('id, status').eq('id', request.params.scenarioId)
        .in('project_id', await request.db!.projectIds()).maybeSingle()
      if (!sc) return reply.status(404).send({ error: 'Skenario tidak ditemukan' })
      if (sc.status === 'archived') {
        return reply.status(409).send({ error: 'Skenario sudah diarsip — buat skenario baru' })
      }
      let editionId: string | null = null
      if (request.body?.edition_code) {
        const { data: ed } = await request.db!
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
      // T4h: tanpa saringan ini, detail estimasi + seluruh itemnya terbaca
      // lintas tenant hanya dengan mengetahui id versi.
      const { data: v, error } = await supabase
        .from('estimate_versions')
        .select(`id, scenario_id, version_number, status, total_amount,
                 approved_by, approved_at, frozen_at, created_at,
                 edition:ahsp_editions!estimate_versions_edition_id_fkey(code, name),
                 items:estimate_items(id, quantity, amount, sort_order, notes,
                   cost_code:cost_codes(code, name),
                   assembly:assemblies(id, code, name, output_unit_code, source, version_number))`)
        .eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
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
        .eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
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

  // ── GET /estimate-versions/:id/material-takeoff — agregasi kebutuhan (D2) ───
  // Langkah 6 build-order CECEP (MATERIAL-RAP-COMPANY-UI-DESIGN.md §D2): satu
  // baris per resource (BUKAN disimpan mentah — view/komputasi dari
  // estimate_item × assembly_component), dengan drill-down "kenapa semennya
  // sebanyak ini". qtyAhsp = angka ANGGARAN (D8: koefisien AHSP sudah mengandung
  // waste — bukan target akurasi lapangan presisi). Item lump-sum (assembly_id
  // NULL) TIDAK punya komponen material — dilewati dari agregasi (sesuai desain:
  // take-off hanya bermakna untuk pekerjaan beranalisa).
  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/material-takeoff',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { data: v } = await supabase
        .from('estimate_versions').select('id').eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      const { data: items, error } = await supabase
        .from('estimate_items')
        .select(`id, quantity,
                 assembly:assemblies(code, name,
                   components:assembly_components(coefficient,
                     resource:resources(id, code, name, category, unit_code)))`)
        .eq('estimate_version_id', request.params.id)
        .not('assembly_id', 'is', null)
      if (error) return reply.status(500).send({ error: error.message })

      type CompRow = { coefficient: number
        resource: { id: string; code: string; name: string; category: string; unit_code: string } | null }
      type ItemRow = { id: string; quantity: number
        assembly: { code: string; name: string; components: CompRow[] } | null }

      const lines: TakeoffLineInput[] = []
      const categoryByResource = new Map<string, string>()
      for (const it of (items ?? []) as unknown as ItemRow[]) {
        if (!it.assembly) continue
        for (const c of it.assembly.components) {
          if (!c.resource) continue
          lines.push({
            estimateItemId: it.id, workName: `${it.assembly.code} — ${it.assembly.name}`,
            volume: Number(it.quantity), resourceId: c.resource.id, resourceName: c.resource.name,
            unitCode: c.resource.unit_code, coefficient: Number(c.coefficient),
          })
          categoryByResource.set(c.resource.id, c.resource.category)
        }
      }
      // Kategori dibawa untuk UI (filter bahan/tenaga/alat) — take-off "kebutuhan
      // belanja" utamanya relevan utk bahan, tapi tenaga/alat tetap ditelusuri.
      const materials = computeMaterialAggregation(lines).map(a => ({
        ...a, category: categoryByResource.get(a.resourceId) ?? null,
      }))
      return reply.send({ estimate_version_id: v.id, materials })
    })

  // ── BBS besi per diameter (D3) — jalur input GEOMETRI, terpisah dari AHSP ───
  // Desain §D3: diameter hidup di level ITEM + BBS, BUKAN di analisa (koef AHSP
  // besi per-kg). Take-off AHSP = kg KASAR anggaran; BBS = kg PRESISI per Ø
  // untuk pagu belanja. weight_kg_per_m DISIMPAN per baris (angka historis tak
  // berubah bila konstanta direvisi kelak).
  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/rebar-takeoff',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:view')] },
    async (request, reply) => {
      const { data: v } = await supabase
        .from('estimate_versions').select('id').eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      const { data: items } = await supabase
        .from('estimate_items').select('id').eq('estimate_version_id', request.params.id)
      const itemIds = (items ?? []).map(i => i.id)
      if (itemIds.length === 0) return reply.send({ estimate_version_id: v.id, lines: [], summary: [] })

      const { data: rows, error } = await supabase
        .from('rebar_takeoff')
        .select('id, estimate_item_id, rebar_type, diameter_mm, bar_count, length_per_bar_m, weight_kg_per_m, total_weight_kg, notes')
        .in('estimate_item_id', itemIds)
        .order('rebar_type').order('diameter_mm')
      if (error) return reply.status(500).send({ error: error.message })

      const lines: RebarTakeoffLine[] = (rows ?? []).map(r => ({
        rebarType: r.rebar_type as 'BjTP' | 'BjTS', diameterMm: Number(r.diameter_mm),
        barCount: r.bar_count, lengthPerBarM: Number(r.length_per_bar_m),
        totalLengthM: r.bar_count * Number(r.length_per_bar_m),
        weightKgPerM: Number(r.weight_kg_per_m), totalWeightKg: Number(r.total_weight_kg),
      }))
      return reply.send({
        estimate_version_id: v.id, lines: rows ?? [],
        summary: summarizeRebarByDiameter(lines), // rekap "Total Besi <Ø>" ala BBS
      })
    })

  app.post<{ Params: { id: string; itemId: string }
             Body: { rebar_type?: 'BjTP' | 'BjTS'; diameter_mm?: number
                     bar_count?: number; length_per_bar_m?: number
                     weight_kg_per_m?: number; notes?: string } }>(
    '/api/v1/estimate-versions/:id/items/:itemId/rebar',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (b.rebar_type !== 'BjTP' && b.rebar_type !== 'BjTS') {
        return reply.status(400).send({ error: "rebar_type wajib 'BjTP' (polos) atau 'BjTS' (sirip)" })
      }
      if (typeof b.diameter_mm !== 'number' || b.diameter_mm <= 0) {
        return reply.status(400).send({ error: 'diameter_mm wajib angka > 0' })
      }
      if (typeof b.bar_count !== 'number' || b.bar_count <= 0) {
        return reply.status(400).send({ error: 'bar_count wajib angka > 0' })
      }
      if (typeof b.length_per_bar_m !== 'number' || b.length_per_bar_m <= 0) {
        return reply.status(400).send({ error: 'length_per_bar_m wajib angka > 0' })
      }

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(409).send({ error: 'BBS hanya bisa diubah saat Estimate Version draft' })
      }
      const { data: item } = await supabase
        .from('estimate_items').select('id').eq('id', request.params.itemId)
        .eq('estimate_version_id', request.params.id).maybeSingle()
      if (!item) return reply.status(404).send({ error: 'Item tidak ditemukan di versi ini' })

      // Hitung lewat lib pure (ber-golden-test) — nol aritmetika ad-hoc di route.
      const line = computeRebarBar({
        rebarType: b.rebar_type, diameterMm: b.diameter_mm,
        barCount: b.bar_count, lengthPerBarM: b.length_per_bar_m,
        weightKgPerM: b.weight_kg_per_m,
      })

      const { data: row, error } = await supabase
        .from('rebar_takeoff')
        .insert({
          estimate_item_id: item.id, rebar_type: line.rebarType, diameter_mm: line.diameterMm,
          bar_count: line.barCount, length_per_bar_m: line.lengthPerBarM,
          weight_kg_per_m: line.weightKgPerM, total_weight_kg: line.totalWeightKg,
          notes: b.notes ?? null, created_by: request.currentUser!.id,
        })
        .select('id').single()
      if (error) {
        const dup = /rebar_takeoff_unik|duplicate/i.test(error.message)
        return reply.status(dup ? 409 : 500).send({ error: error.message })
      }
      void logAuditEvent(request, {
        tableName: 'rebar_takeoff', recordId: row.id, action: 'cecep.rebar_added',
        actorId: request.currentUser!.id,
        newValues: { item: item.id, type: line.rebarType, d: line.diameterMm, kg: line.totalWeightKg },
      })
      return reply.status(201).send({ id: row.id, ...line })
    })

  // ── POST /items — tambah item dari ASSEMBLY atau LUMP-SUM (M3+misi d) ───────
  // Rantai explainability penuh (jalur assembly): assembly (koefisien, edisi) ×
  // price book (harga per resource, ter-resolve by tanggal+lokasi) → engine
  // paritas → amount = hsp_rounded × quantity. C1: BUK & rounding WAJIB dari
  // caller — TIDAK ada default diam-diam (config effective-date Lapis 1 menyusul).
  //
  // item_type='lumpsum' (desain §2.3 AHSP-EDITION-BUILDER-DESIGN.md): untuk
  // pekerjaan BUKAN-beranalisa (lift/pompa/septictank/air kerja) — JANGAN
  // dipaksa jadi AHSP. amount diinput langsung, TANPA assembly/price-book/engine.
  // Butuh flag eksplisit supaya tak tertukar dgn lupa isi assembly_id (fail-loud,
  // bukan silent-default).
  app.post<{ Params: { id: string }
             Body: { item_type?: 'assembly' | 'lumpsum'
                     assembly_id?: string; quantity?: number; price_date?: string
                     location?: string | null; buk_fraction?: number; rounding?: RoundingRule
                     cost_code_id?: string; amount?: number
                     cbs_node_id?: string; wbs_node_id?: string; notes?: string } }>(
    '/api/v1/estimate-versions/:id/items',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { id } = request.params

      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }
      const b = request.body ?? {}
      const itemType = b.item_type ?? 'assembly'
      if (!['assembly', 'lumpsum'].includes(itemType)) {
        return reply.status(400).send({ error: "item_type wajib 'assembly' atau 'lumpsum'" })
      }

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(409).send({ error: 'Item hanya bisa ditambah saat Estimate Version draft' })
      }

      if (itemType === 'lumpsum') {
        if (!b.cost_code_id) return reply.status(400).send({ error: 'cost_code_id wajib untuk item lumpsum' })
        if (typeof b.amount !== 'number' || b.amount <= 0) {
          return reply.status(400).send({ error: 'amount wajib angka > 0 untuk item lumpsum (tidak ada default)' })
        }
        const { data: cc } = await request.db!
          .from('cost_codes').select('id').eq('id', b.cost_code_id).maybeSingle()
        if (!cc) return reply.status(404).send({ error: 'Cost code tidak ditemukan' })

        const { data: item, error: insErr } = await supabase
          .from('estimate_items')
          .insert({
            estimate_version_id: id, cost_code_id: cc.id, assembly_id: null,
            cbs_node_id: b.cbs_node_id ?? null, wbs_node_id: b.wbs_node_id ?? null,
            quantity: 1, amount: b.amount, notes: b.notes ?? null,
          })
          .select('id').single()
        if (insErr) return reply.status(500).send({ error: insErr.message })

        const { data: sums } = await supabase
          .from('estimate_items').select('amount').eq('estimate_version_id', id)
        const total = (sums ?? []).reduce((s, r) => s + Number(r.amount), 0)
        await supabase.from('estimate_versions')
          .update({ total_amount: total, updated_by: request.currentUser!.id }).eq('id', id)

        void logAuditEvent(request, {
          tableName: 'estimate_items', recordId: item.id, action: 'estimate.item_added_lumpsum',
          actorId: request.currentUser!.id, newValues: { amount: b.amount, cost_code_id: cc.id },
        })
        return reply.status(201).send({
          item: { id: item.id, item_type: 'lumpsum', amount: b.amount },
          version_total: total,
        })
      }

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

      const { data: asm, error: asmErr } = await request.db!
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

      const { data: pbe, error: pbErr } = await request.db!
        .from('price_book_entries')
        .select('id, resource_id, amount, currency, version_number, effective_date, expired_date, location, status, company_id')
        .in('resource_id', resourceIds)
      if (pbErr) return reply.status(500).send({ error: pbErr.message })

      // Harga khusus proyek (migrasi 140) — MENANG atas price book, tanpa
      // menyentuhnya. Inilah yang membuat dua proyek dalam periode berlaku yang
      // sama bisa memakai harga berbeda untuk resource yang sama, sementara
      // harga acuannya tetap utuh untuk proyek lain.
      // `.unsafe()`: versi dicari lewat id-nya untuk MENEMUKAN proyeknya —
      // jadi `.viaProject()` yang justru mensyaratkan project_id tak bisa
      // dipakai di sini. Aman: `versiMilikTenant(request, id)` di awal handler
      // sudah memastikan versi ini milik company aktif.
      const { data: verProj } = await request.db!
        .unsafe('estimate_versions', 'mencari project_id DARI versi; gerbang tenant sudah lewat versiMilikTenant()')
        .select('scenario:scenarios(project_id)')
        .eq('id', id)
        .maybeSingle()
      const scVer = (verProj as { scenario?: { project_id?: string } | { project_id?: string }[] } | null)?.scenario
      const proyekVersi = (Array.isArray(scVer) ? scVer[0] : scVer)?.project_id ?? null

      const { data: ovr } = proyekVersi
        ? await request.db!
            .viaProject('project_price_override', proyekVersi)
            .select('id, project_id, resource_id, amount, currency, effective_date, expired_date, reason')
            .in('resource_id', resourceIds)
        : { data: [] as unknown[] }

      const { resolved, missing } = resolvePrices(
        (pbe ?? []) as PriceBookEntryRow[], resourceIds, priceDate, b.location ?? null,
        (ovr ?? []) as ProjectPriceOverrideRow[])
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
          // Provenance harga (migrasi 139). Sebelumnya rincian ini hanya
          // dikembalikan ke pemanggil lalu hilang begitu response ditutup —
          // sehingga pertanyaan "kenapa RAB ini segini" setahun kemudian hanya
          // bisa ditebak. Rekonstruksi tidak bisa diandalkan: harganya mungkin
          // sudah expired, dan price_date yang dipakai tak tersimpan.
          price_date: priceDate,
          price_location: b.location ?? null,
          hsp_snapshot: {
            hsp: {
              groupTotals: hsp.groupTotals,
              subtotalD: hsp.subtotalD,
              bukAmount: hsp.bukAmount,
              bukFraction: b.buk_fraction,
              hspRaw: hsp.hspRaw,
              hspRounded: hsp.hspRounded,
              rounding: b.rounding,
            },
            prices: comps.map((cc) => {
              const r = resolved.get(cc.resource!.id)!
              return {
                resource_id: cc.resource!.id,
                resource_code: cc.resource!.code,
                coefficient: cc.coefficient,
                amount: Number(r.entry.amount),
                price_book_entry_id: r.entry.id,
                effective_date: r.entry.effective_date,
                location: r.entry.location,
                matched_location: r.matched_location,
                // Asal harga dicatat eksplisit. Tanpa ini, harga override
                // terlihat persis seperti harga acuan di snapshot — dan
                // pertanyaan "kenapa proyek ini beda" kembali tak terjawab.
                sumber: r.override ? 'override_proyek' : 'price_book',
                override_reason: r.override?.reason ?? null,
              }
            }),
          },
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
      // T4h: DELETE item sebelumnya tanpa gerbang, padahal POST item di atasnya
      // sudah punya — inkonsistensi dalam satu file yang sama.
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
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

      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }
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

      // T4g: gerbang tenant SETELAH gerbang izin — urutan 403-sebelum-404
      // yang sudah ada sengaja dipertahankan (Phase 1). Kalau dibalik,
      // user tanpa izin dapat 404 dan kehilangan pesan 'akses ditolak'.
      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }

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
          entityType: 'estimate_version', entityId: id, level: decision.step.level, approvedBy: user.id, companyId: request.companyId!,
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

      // T4g: gerbang tenant SETELAH gerbang izin — urutan 403-sebelum-404 yang
      // sudah ada sengaja dipertahankan (Phase 1).
      if (!(await versiMilikTenant(request, id))) {
        return reply.status(404).send({ error: 'Estimasi tidak ditemukan' })
      }

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'under_review') {
        return reply.status(400).send({ error: 'Hanya Estimate Version under_review yang bisa ditolak' })
      }

      // Ditolak → jejak persetujuan dibersihkan (rantai mulai dari awal bila diajukan
      // ulang), status kembali ke draft agar bisa direvisi.
      await clearApprovalProgress('estimate_version', id, request.companyId!)
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
