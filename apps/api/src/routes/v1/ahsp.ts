import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
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
