import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { computeAhsp, type AhspComponent, type ResourceGroup, type RoundingRule } from '../../lib/ahsp-engine.js'

// CECEP — AHSP katalog + kalkulator HSP (thin-slice pertama, 4e).
//
// PARITAS & C1 (nol angka bisnis telanjang): endpoint compute TIDAK punya default
// BUK/pembulatan/harga — semua di-inject caller (nanti: config effective-date /
// price book). Salah satu hilang = 400, bukan tebakan diam-diam.
//
// Peta kategori RBS → grup AHSP (A/B/C): labor→tenaga, material→bahan,
// equipment→alat. `subcontract` TIDAK dipetakan — workbook acuan tak punya grup
// subkontrak di blok AHSP; memetakannya = mengarang → ditolak eksplisit.
const GROUP_BY_CATEGORY: Record<string, ResourceGroup> = {
  labor: 'tenaga', material: 'bahan', equipment: 'alat',
}

interface ComponentRow {
  coefficient: number
  resource: { code: string; name: string; category: string; unit_code: string } | null
}

export default async function ahspRoutes(app: FastifyInstance) {

  // ── GET /cecep/resources — registry resource (RBS), untuk picker Price Book ─
  // Terpisah dari /cecep/assemblies: sebagian resource (mis. yang di-seed via
  // impor batch) belum tentu dipakai assembly manapun, tapi tetap perlu diberi
  // harga di price book. Pagination cap 200 (kebijakan pagination existing).
  app.get<{ Querystring: { q?: string; category?: string; limit?: string } }>(
    '/api/v1/cecep/resources',
    { preHandler: [authenticate, requirePermission('cecep:resource:view')] },
    async (request, reply) => {
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100))
      let q = supabase
        .from('resources')
        .select('id, code, name, category, unit_code, status')
        .eq('status', 'active')
        .order('name')
        .limit(limit)
      if (request.query.category) q = q.eq('category', request.query.category)
      if (request.query.q) q = q.ilike('name', `%${request.query.q}%`)
      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── GET /cecep/steel-profiles — katalog profil baja (D4, Lapis 2) ───────────
  // Katalog profil + berat/m TIDAK ADA di AHSP nasional (nasional generik per-kg)
  // → data referensi ter-seed (migration 123, sumber DAFTAR BESI verbatim).
  app.get<{ Querystring: { type?: string; q?: string; limit?: string } }>(
    '/api/v1/cecep/steel-profiles',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:view')] },
    async (request, reply) => {
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100))
      let q = supabase
        .from('steel_profiles')
        .select('id, profile_type, designation, h_mm, b_mm, t1_mm, t2_mm, weight_per_bar_kg, standard_length_m, weight_kg_per_m, source_note')
        .eq('is_active', true)
        .order('profile_type').order('designation')
        .limit(limit)
      if (request.query.type) q = q.eq('profile_type', request.query.type)
      if (request.query.q) q = q.ilike('designation', `%${request.query.q}%`)
      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── GET/POST /cecep/material-pack — faktor kemasan per resource (D5) ────────
  app.get<{ Querystring: { resource?: string } }>(
    '/api/v1/cecep/material-pack',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:view')] },
    async (request, reply) => {
      let q = supabase
        .from('material_pack')
        .select('id, buy_unit_code, factor, round_up, note, resource:resources(id, code, name, unit_code)')
        .limit(200)
      if (request.query.resource) {
        const { data: r } = await supabase
          .from('resources').select('id').eq('code', request.query.resource).maybeSingle()
        if (!r) return reply.status(404).send({ error: `Resource ${request.query.resource} tidak ditemukan` })
        q = q.eq('resource_id', r.id)
      }
      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  app.post<{ Body: { resource_code?: string; buy_unit_code?: string; factor?: number
                     round_up?: boolean; note?: string } }>(
    '/api/v1/cecep/material-pack',
    { preHandler: [authenticate, requirePermission('cecep:refdata:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (!b.resource_code) return reply.status(400).send({ error: 'resource_code wajib' })
      if (!b.buy_unit_code) return reply.status(400).send({ error: 'buy_unit_code wajib' })
      if (typeof b.factor !== 'number' || b.factor <= 0) {
        return reply.status(400).send({ error: 'factor wajib angka > 0 (satuan AHSP per 1 satuan belanja)' })
      }
      const { data: r } = await supabase
        .from('resources').select('id').eq('code', b.resource_code).maybeSingle()
      if (!r) return reply.status(404).send({ error: `Resource ${b.resource_code} tidak ditemukan` })
      const { data: u } = await supabase
        .from('units').select('code').eq('code', b.buy_unit_code).maybeSingle()
      if (!u) return reply.status(404).send({ error: `Satuan ${b.buy_unit_code} tidak ditemukan` })

      const { data: row, error } = await supabase
        .from('material_pack')
        .insert({ resource_id: r.id, buy_unit_code: u.code, factor: b.factor,
                  round_up: b.round_up ?? true, note: b.note ?? null,
                  created_by: request.currentUser!.id })
        .select('id').single()
      if (error) {
        const dup = /material_pack_unik|duplicate/i.test(error.message)
        return reply.status(dup ? 409 : 500).send({ error: error.message })
      }
      void logAuditEvent(request, {
        tableName: 'material_pack', recordId: row.id, action: 'cecep.material_pack_created',
        actorId: request.currentUser!.id,
        newValues: { resource_code: b.resource_code, buy_unit_code: b.buy_unit_code, factor: b.factor },
      })
      return reply.status(201).send({ id: row.id })
    })

  // ── GET /cecep/cost-codes — registry cost code, untuk picker UI ─────────────
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/api/v1/cecep/cost-codes',
    { preHandler: [authenticate, requirePermission('cecep:cost_code:view')] },
    async (request, reply) => {
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100))
      let q = supabase.from('cost_codes').select('id, code, name').order('code').limit(limit)
      if (request.query.q) q = q.ilike('name', `%${request.query.q}%`)
      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── POST /cecep/assemblies — buat analisa COMPANY di-tengah-estimasi ────────
  // MENYENTUH GERBANG IMMUTABILITY (disebut eksplisit, disetujui desain §2.2
  // AHSP-EDITION-BUILDER-DESIGN.md "buat analisa company DI TENGAH layar
  // estimasi, tanpa keluar, TANPA approval"): endpoint ini MENULIS baris baru
  // ke tabel `assemblies` yang dijaga fn_assembly_immutable/fn_assembly_no_delete
  // (migration 107/117). Ini AMAN terhadap guard — guard mengunci UPDATE/DELETE
  // baris existing bukan sesudah-draft; endpoint ini hanya INSERT baris BARU
  // berstatus 'draft', source WAJIB 'company' (tak pernah 'national' — national
  // hanya lahir dari jalur impor, §1.4). created_in_estimate_id menandai asal
  // (§2.4 "N analisa baru dibuat di estimasi ini" — cegah katalog berantakan
  // tanpa sadar) sehingga TIDAK mencemari katalog national/company lama.
  app.post<{ Body: { code?: string; name?: string; cost_code_id?: string
                     output_unit_code?: string; waste_factor?: number
                     components?: { resource_code: string; coefficient: number }[]
                     created_in_estimate_id?: string; derived_from_assembly_id?: string } }>(
    '/api/v1/cecep/assemblies',
    { preHandler: [authenticate, requirePermission('cecep:assembly:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}
      if (!b.code?.trim()) return reply.status(400).send({ error: 'code wajib' })
      if (!b.name?.trim()) return reply.status(400).send({ error: 'name wajib' })
      if (!b.cost_code_id) return reply.status(400).send({ error: 'cost_code_id wajib' })
      if (!b.output_unit_code?.trim()) return reply.status(400).send({ error: 'output_unit_code wajib' })
      if (!Array.isArray(b.components) || b.components.length === 0) {
        return reply.status(400).send({ error: 'components wajib minimal 1 (resource_code + coefficient)' })
      }
      for (const c of b.components) {
        if (!c.resource_code || typeof c.coefficient !== 'number' || c.coefficient <= 0) {
          return reply.status(400).send({ error: `komponen tak valid: ${JSON.stringify(c)} — coefficient wajib > 0` })
        }
      }

      const { data: cc } = await supabase
        .from('cost_codes').select('id').eq('id', b.cost_code_id).maybeSingle()
      if (!cc) return reply.status(404).send({ error: 'Cost code tidak ditemukan' })

      const { data: unit } = await supabase
        .from('units').select('code').eq('code', b.output_unit_code).maybeSingle()
      if (!unit) return reply.status(404).send({ error: `Satuan ${b.output_unit_code} tidak ditemukan` })

      // Resolusi resource_code -> id; fail-loud kalau ada yang tak dikenal (nol tebak).
      const codes = b.components.map(c => c.resource_code)
      const { data: resources, error: resErr } = await supabase
        .from('resources').select('id, code').in('code', codes)
      if (resErr) return reply.status(500).send({ error: resErr.message })
      const byCode = new Map((resources ?? []).map(r => [r.code, r.id]))
      const unknown = codes.filter(c => !byCode.has(c))
      if (unknown.length) {
        return reply.status(404).send({ error: 'Resource tidak ditemukan', unknown })
      }

      if (b.created_in_estimate_id) {
        const { data: ev } = await supabase
          .from('estimate_versions').select('id').eq('id', b.created_in_estimate_id).maybeSingle()
        if (!ev) return reply.status(404).send({ error: 'Estimate Version (created_in_estimate_id) tidak ditemukan' })
      }

      const { data: asm, error: asmErr } = await supabase
        .from('assemblies')
        .insert({
          code: b.code.trim(), name: b.name.trim(), cost_code_id: cc.id,
          source: 'company', version_number: 1, waste_factor: b.waste_factor ?? 0,
          sequence: [], output_unit_code: unit.code,
          created_in_estimate_id: b.created_in_estimate_id ?? null,
          derived_from_assembly_id: b.derived_from_assembly_id ?? null,
          created_by: request.currentUser!.id,
        })
        .select('id').single()
      if (asmErr) return reply.status(500).send({ error: asmErr.message })

      const rows = b.components.map((c, i) => ({
        assembly_id: asm.id, resource_id: byCode.get(c.resource_code)!,
        coefficient: c.coefficient, sort_order: i,
      }))
      const { error: compErr } = await supabase.from('assembly_components').insert(rows)
      if (compErr) return reply.status(500).send({ error: compErr.message })

      // Aktifkan langsung (§2.2: "hanya dipakai sendiri", tanpa approval) supaya
      // bisa langsung dipakai POST /estimate-versions/:id/items (butuh status active).
      const { error: actErr } = await supabase
        .from('assemblies').update({ status: 'active' }).eq('id', asm.id)
      if (actErr) return reply.status(500).send({ error: actErr.message })

      void logAuditEvent(request, {
        tableName: 'assemblies', recordId: asm.id, action: 'cecep.assembly_created_company',
        actorId: request.currentUser!.id,
        newValues: { code: b.code, source: 'company', created_in_estimate_id: b.created_in_estimate_id ?? null },
      })
      return reply.status(201).send({ id: asm.id, code: b.code, source: 'company', status: 'active' })
    })

  // ── GET /cecep/editions — registry edisi + provenance ──────────────────────
  app.get(
    '/api/v1/cecep/editions',
    { preHandler: [authenticate, requirePermission('cecep:edition:view')] },
    async (_request, reply) => {
      const { data, error } = await supabase
        .from('ahsp_editions')
        .select('id, code, name, se_number, publish_date, source_file, source_sha256, imported_at, is_active')
        .order('publish_date', { ascending: false })
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── GET /cecep/assemblies — katalog AHSP (filter edisi/sumber) ──────────────
  app.get<{ Querystring: { edition?: string; source?: string; limit?: string } }>(
    '/api/v1/cecep/assemblies',
    { preHandler: [authenticate, requirePermission('cecep:assembly:view')] },
    async (request, reply) => {
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100)) // cap 200 (kebijakan pagination)
      let q = supabase
        .from('assemblies')
        .select(`id, code, name, source, version_number, status, waste_factor,
                 output_unit_code, is_import_baseline, edit_type,
                 edition:ahsp_editions!assemblies_edition_id_fkey(code, name),
                 components:assembly_components(coefficient, sort_order,
                   resource:resources(code, name, category, unit_code))`)
        .order('code')
        .limit(limit)
      if (request.query.source) q = q.eq('source', request.query.source)
      if (request.query.edition) {
        const { data: ed } = await supabase
          .from('ahsp_editions').select('id').eq('code', request.query.edition).maybeSingle()
        if (!ed) return reply.status(404).send({ error: `Edisi ${request.query.edition} tidak ditemukan` })
        q = q.eq('edition_id', ed.id)
      }
      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data })
    })

  // ── POST /cecep/assemblies/:id/hsp — hitung HSP (engine paritas) ────────────
  // Body: { prices: {<resource_code>: number}, buk_fraction: number,
  //         rounding: { mode: 'down'|'up'|'nearest'|'none', step: number } }
  app.post<{ Params: { id: string }
             Body: { prices?: Record<string, number>; buk_fraction?: number; rounding?: RoundingRule } }>(
    '/api/v1/cecep/assemblies/:id/hsp',
    { preHandler: [authenticate, requirePermission('cecep:assembly:view')] },
    async (request, reply) => {
      const { prices, buk_fraction, rounding } = request.body ?? {}
      if (!prices || typeof prices !== 'object') {
        return reply.status(400).send({ error: 'prices wajib: peta {resource_code: harga}' })
      }
      if (typeof buk_fraction !== 'number' || buk_fraction < 0 || buk_fraction > 1) {
        return reply.status(400).send({ error: 'buk_fraction wajib angka 0..1 (mis. 0.1) — tidak ada default' })
      }
      if (!rounding || !['down', 'up', 'nearest', 'none'].includes(rounding.mode)
          || typeof rounding.step !== 'number') {
        return reply.status(400).send({ error: "rounding wajib {mode:'down'|'up'|'nearest'|'none', step:number}" })
      }

      const { data: asm, error } = await supabase
        .from('assemblies')
        .select(`id, code, name, output_unit_code, status,
                 components:assembly_components(coefficient, sort_order,
                   resource:resources(code, name, category, unit_code))`)
        .eq('id', request.params.id)
        .maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!asm) return reply.status(404).send({ error: 'Assembly tidak ditemukan' })

      const comps: AhspComponent[] = []
      const missingPrice: string[] = []
      const unmappable: string[] = []
      for (const row of (asm.components ?? []) as unknown as ComponentRow[]) {
        const r = row.resource
        if (!r) continue
        const group = GROUP_BY_CATEGORY[r.category]
        if (!group) { unmappable.push(`${r.code} (${r.category})`); continue }
        const hsd = prices[r.code]
        if (typeof hsd !== 'number') { missingPrice.push(r.code); continue }
        comps.push({ group, name: r.name, unit: r.unit_code, coefficient: Number(row.coefficient), hsd })
      }
      // FAIL LOUD — tidak menghitung dengan data bolong (paritas: Excel pun error/#N/A)
      if (unmappable.length) {
        return reply.status(422).send({
          error: 'Komponen berkategori tanpa pemetaan grup AHSP (subcontract belum didefinisikan paritasnya)',
          unmappable })
      }
      if (missingPrice.length) {
        return reply.status(422).send({ error: 'Harga resource kurang', missing: missingPrice })
      }

      const result = computeAhsp(comps, buk_fraction, rounding)
      return reply.send({
        assembly: { id: asm.id, code: asm.code, name: asm.name, output_unit: asm.output_unit_code },
        input: { buk_fraction, rounding },
        result, // { groupTotals, subtotalD, bukAmount, hspRaw, hspRounded }
      })
    })
}
