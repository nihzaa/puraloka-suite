import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { computeAhsp, type AhspComponent, type ResourceGroup, type RoundingRule } from '../../lib/ahsp-engine.js'
import {
  resolvePrices, type PriceBookEntryRow, type ProjectPriceOverrideRow,
} from '../../lib/price-resolver.js'

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
      let q = request.db!
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
      let q = request.db!
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
      let q = request.db!
        .from('material_pack')
        .select('id, buy_unit_code, factor, round_up, note, resource:resources(id, code, name, unit_code)')
        .limit(200)
      if (request.query.resource) {
        const { data: r } = await request.db!
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
      const { data: r } = await request.db!
        .from('resources').select('id').eq('code', b.resource_code).maybeSingle()
      if (!r) return reply.status(404).send({ error: `Resource ${b.resource_code} tidak ditemukan` })
      const { data: u } = await request.db!
        .from('units').select('code').eq('code', b.buy_unit_code).maybeSingle()
      if (!u) return reply.status(404).send({ error: `Satuan ${b.buy_unit_code} tidak ditemukan` })

      const { data: row, error } = await request.db!
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
      let q = request.db!.from('cost_codes').select('id, code, name').order('code').limit(limit)
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

      const { data: cc } = await request.db!
        .from('cost_codes').select('id').eq('id', b.cost_code_id).maybeSingle()
      if (!cc) return reply.status(404).send({ error: 'Cost code tidak ditemukan' })

      const { data: unit } = await request.db!
        .from('units').select('code').eq('code', b.output_unit_code).maybeSingle()
      if (!unit) return reply.status(404).send({ error: `Satuan ${b.output_unit_code} tidak ditemukan` })

      // Resolusi resource_code -> id; fail-loud kalau ada yang tak dikenal (nol tebak).
      const codes = b.components.map(c => c.resource_code)
      const { data: resources, error: resErr } = await request.db!
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

      const { data: asm, error: asmErr } = await request.db!
        .from('assemblies')
        .insert({
          code: b.code.trim(), name: b.name.trim(), cost_code_id: cc.id,
          source: 'company', version_number: 1, waste_factor: b.waste_factor ?? 0,
          // T4: assembly source='company' WAJIB bertuan (CHECK
          // assemblies_source_company_konsisten, migrasi 127) — hanya katalog
          // nasional yang boleh company_id NULL. Diambil dari company aktif
          // request, bukan ditebak.
          company_id: request.companyId,
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
      const { error: compErr } = await request.db!.from('assembly_components').insert(rows)
      if (compErr) return reply.status(500).send({ error: compErr.message })

      // Aktifkan langsung (§2.2: "hanya dipakai sendiri", tanpa approval) supaya
      // bisa langsung dipakai POST /estimate-versions/:id/items (butuh status active).
      const { error: actErr } = await request.db!
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
    async (request, reply) => {
      const { data, error } = await request.db!
        .from('ahsp_editions')
        .select('id, code, name, se_number, publish_date, source_file, source_sha256, imported_at, is_active')
        .order('publish_date', { ascending: false })
      if (error) return reply.status(500).send({ error: error.message })

      // Jumlah analisa AKTIF per edisi.
      //
      // Registry edisi bisa memuat edisi yang belum diimpor isinya — di dev hari
      // ini SE-68-2024 dan SNI-2013 terdaftar dengan NOL analisa. Tanpa angka
      // ini, memilihnya saat membuat versi menghasilkan katalog kosong tanpa
      // sebab yang terlihat, dan pemakai menyimpulkan sistemnya rusak.
      const { data: asm } = await request.db!
        .from('assemblies').select('edition_id').eq('status', 'active').limit(10000)
      const per = new Map<string, number>()
      for (const a of asm ?? []) {
        if (a.edition_id) per.set(a.edition_id, (per.get(a.edition_id) ?? 0) + 1)
      }

      return reply.send({
        data: (data ?? []).map((e) => ({ ...e, jumlah_analisa: per.get(e.id) ?? 0 })),
      })
    })

  // ── GET /cecep/assemblies — katalog AHSP (filter edisi/sumber) ──────────────
  app.get<{ Querystring: { edition?: string; source?: string; limit?: string; q?: string } }>(
    '/api/v1/cecep/assemblies',
    { preHandler: [authenticate, requirePermission('cecep:assembly:view')] },
    async (request, reply) => {
      // Cap 5.000, bukan 200 seperti endpoint list lain.
      //
      // Katalog AHSP adalah data REFERENSI, bukan transaksi: ia dibaca sebagai
      // satu daftar utuh untuk dicari-cari, bukan ditelusuri per halaman. Dengan
      // cap 200, analisa di baris ke-500 tak pernah bisa dilihat tanpa mengetik
      // kata kunci yang tepat — padahal pemakai justru sedang mencari-cari
      // karena BELUM tahu kata kuncinya.
      //
      // Beban dijaga di dua sisi: respons ~1-2 MB untuk 3.043 baris (sekali,
      // lalu dicari di memori tanpa menyentuh server lagi), dan UI merender
      // hanya baris yang terlihat (virtualisasi). Cap tetap ada supaya katalog
      // yang tumbuh sepuluh kali lipat tak diam-diam melumpuhkan halaman.
      const limit = Math.max(1, Math.min(5000, Number(request.query.limit) || 100))
      let q = request.db!
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
        const { data: ed } = await request.db!
          .from('ahsp_editions').select('id').eq('code', request.query.edition).maybeSingle()
        if (!ed) return reply.status(404).send({ error: `Edisi ${request.query.edition} tidak ditemukan` })
        q = q.eq('edition_id', ed.id)
      }

      // Pencarian di SERVER, bukan menyaring 200 baris yang terlanjur termuat.
      // Katalog berisi 3.043 analisa sementara respons dibatasi 200 — menyaring
      // di klien berarti analisa di baris ke-500 TIDAK PERNAH bisa ditemukan,
      // dan pemakai tak mendapat tanda apa pun bahwa pencariannya tak lengkap.
      const cari = request.query.q?.trim()
      if (cari) {
        const aman = cari.replace(/[%,()]/g, ' ')
        q = q.or(`name.ilike.%${aman}%,code.ilike.%${aman}%`)
      }

      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })

      // Total sesungguhnya untuk kriteria yang sama — supaya UI bisa jujur
      // menyebut "menampilkan 200 dari 3.043", bukan mengesankan 200 itu semua.
      let hitung = request.db!.from('assemblies').select('id', { count: 'exact', head: true })
      if (request.query.source) hitung = hitung.eq('source', request.query.source)
      if (request.query.edition) {
        const { data: ed } = await request.db!
          .from('ahsp_editions').select('id').eq('code', request.query.edition).maybeSingle()
        if (ed) hitung = hitung.eq('edition_id', ed.id)
      }
      if (cari) {
        const aman = cari.replace(/[%,()]/g, ' ')
        hitung = hitung.or(`name.ilike.%${aman}%,code.ilike.%${aman}%`)
      }
      const { count } = await hitung

      return reply.send({ data, total: count ?? null, limit })
    })

  // ── GET /cecep/assemblies/price-coverage — analisa mana yang harganya kurang
  //
  // `hsp-live` sudah melaporkan `missing_prices`, TAPI hanya per-analisa dan
  // hanya saat analisa itu dibuka. Dari 3.043 analisa, tak ada yang akan
  // mengetahui mana yang bermasalah tanpa membuka satu per satu — jadi analisa
  // yang tak bisa dihitung HSP-nya baru ketahuan saat sudah dipilih untuk RAB.
  //
  // Endpoint ini menjawabnya sekaligus: berapa resource per analisa yang belum
  // punya harga aktif. Read-model, nol tabel baru.
  app.get<{ Querystring: { source?: string; edition?: string } }>(
    '/api/v1/cecep/assemblies/price-coverage',
    { preHandler: [authenticate, requirePermission('cecep:assembly:view')] },
    async (request, reply) => {
      let qa = request.db!.from('assemblies').select('id, edition_id, source').limit(4000)
      if (request.query.source) qa = qa.eq('source', request.query.source)
      if (request.query.edition) {
        const { data: ed } = await request.db!
          .from('ahsp_editions').select('id').eq('code', request.query.edition).maybeSingle()
        if (!ed) return reply.status(404).send({ error: `Edisi ${request.query.edition} tidak ditemukan` })
        qa = qa.eq('edition_id', ed.id)
      }
      const { data: asm, error } = await qa
      if (error) return reply.status(500).send({ error: error.message })
      const ids = (asm ?? []).map((a) => a.id)
      if (!ids.length) return reply.send({ data: {}, resource_tanpa_harga: 0 })

      const { data: komp } = await request.db!
        .from('assembly_components').select('assembly_id, resource_id').in('assembly_id', ids)

      const resourceIds = [...new Set((komp ?? []).map((k) => k.resource_id))]
      const { data: harga } = await request.db!
        .from('price_book_entries').select('resource_id').eq('status', 'active')
        .in('resource_id', resourceIds)
      const adaHarga = new Set((harga ?? []).map((h) => h.resource_id))

      // { assembly_id: jumlah resource yang BELUM berharga }. Hanya yang > 0
      // dikirim — mengirim ribuan nol hanya memperbesar respons tanpa informasi.
      const kurang: Record<string, number> = {}
      for (const k of komp ?? []) {
        if (!adaHarga.has(k.resource_id)) kurang[k.assembly_id] = (kurang[k.assembly_id] ?? 0) + 1
      }

      return reply.send({
        data: kurang,
        resource_tanpa_harga: resourceIds.filter((r) => !adaHarga.has(r)).length,
        analisa_terdampak: Object.keys(kurang).length,
        analisa_diperiksa: ids.length,
      })
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

      const { data: asm, error } = await request.db!
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

  // ── POST /cecep/assemblies/:id/adopt — salin analisa jadi milik company ────
  //
  // Kebutuhan founder 2026-07-29: "AHSP nasional mau jadi AHSP company juga,
  // tapi KOEFISIENNYA bisa disesuaikan — analisa Cibuluh yang lama tetap ada."
  //
  // KENAPA MENYALIN, BUKAN MENYUNTING YANG ADA:
  //   Analisa nasional dipakai BERSAMA seluruh badan usaha (company_id NULL).
  //   Menyuntingnya berarti mengubah katalog milik semua orang hanya karena
  //   satu tim punya kebiasaan berbeda. Guard `fn_assembly_immutable` juga
  //   menolaknya — dan itu benar.
  //
  // KENAPA TIDAK PERLU MENYALIN UNTUK SEKADAR GANTI HARGA:
  //   Harga bukan bagian analisa (nol kolom harga di assembly_components).
  //   Untuk memakai analisa nasional dengan harga sendiri, cukup isi price book
  //   company — harga company sudah menang atas nasional (sumbu lingkup).
  //   Endpoint ini HANYA untuk yang mau mengubah KOEFISIEN.
  //
  // JEJAK ASAL-USUL: `derived_from_assembly_id` + `derived_from_edition_id`
  // diisi, jadi pertanyaan "salinan ini asalnya dari mana, dan sudah diubah
  // apa" selalu terjawab dari data. Tanpa itu, salinan yang koefisiennya
  // berbeda tak bisa dibedakan dari analisa yang memang disusun sendiri.
  app.post<{ Params: { id: string }
             Body: { code?: string; name?: string; reason?: string
                     components?: { resource_code: string; coefficient: number }[] } }>(
    '/api/v1/cecep/assemblies/:id/adopt',
    { preHandler: [authenticate, requirePermission('cecep:assembly:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}

      const { data: asal, error: errAsal } = await request.db!
        .from('assemblies')
        .select(`id, code, name, source, cost_code_id, output_unit_code, edition_id,
                 reference_standard, waste_factor, status,
                 components:assembly_components(coefficient, sort_order, notes,
                   resource:resources(id, code, name, unit_code))`)
        .eq('id', request.params.id)
        .maybeSingle()
      if (errAsal) return reply.status(500).send({ error: errAsal.message })
      if (!asal) return reply.status(404).send({ error: 'Analisa tidak ditemukan' })

      // Menyalin analisa yang SUDAH milik company sendiri tidak dilarang, tapi
      // hampir selalu bukan yang dimaksud — biasanya orang ingin menyalin dari
      // katalog nasional. Ditolak dengan penjelasan, bukan diam-diam membuat
      // duplikat yang membingungkan.
      if (asal.source !== 'national') {
        return reply.status(400).send({
          error: `Analisa ini sudah bersumber "${asal.source}", bukan katalog nasional. ` +
                 'Untuk mengubah koefisiennya, sunting langsung selagi berstatus draft.',
        })
      }

      const kode = b.code?.trim() || `${asal.code}-CO`
      if (!/^[A-Za-z0-9][A-Za-z0-9.\-_/]{1,58}$/.test(kode)) {
        return reply.status(400).send({
          error: 'Kode hanya boleh huruf, angka, titik, strip, garis bawah, dan garis miring (2–60 karakter)',
        })
      }

      const { data: bentrok } = await request.db!
        .from('assemblies').select('id').eq('code', kode).eq('source', 'company').maybeSingle()
      if (bentrok) {
        return reply.status(409).send({ error: `Kode "${kode}" sudah dipakai analisa company lain` })
      }

      type KompAsal = {
        coefficient: number; sort_order: number | null; notes: string | null
        resource: { id: string; code: string; name: string; unit_code: string } | null
      }
      const kompAsal = ((asal.components ?? []) as unknown as KompAsal[]).filter((x) => x.resource)
      if (kompAsal.length === 0) {
        return reply.status(400).send({ error: 'Analisa asal tidak punya komponen untuk disalin' })
      }

      // Koefisien pengganti bersifat OPSIONAL dan PARSIAL: yang tidak disebut
      // memakai koefisien asli. Tanpa itu, mengubah satu koefisien memaksa
      // pengguna mengetik ulang seluruh komponen — dan salah ketik di situ
      // menghasilkan analisa yang diam-diam berbeda dari yang dimaksud.
      const ganti = new Map<string, number>()
      for (const c of b.components ?? []) {
        if (!c.resource_code || typeof c.coefficient !== 'number' || c.coefficient <= 0) {
          return reply.status(400).send({
            error: `Koefisien tak valid untuk "${c.resource_code}" — wajib angka > 0`,
          })
        }
        if (!kompAsal.some((k) => k.resource!.code === c.resource_code)) {
          return reply.status(400).send({
            error: `"${c.resource_code}" bukan komponen analisa ini. Endpoint ini menyalin ` +
                   'lalu menyesuaikan koefisien; untuk menambah komponen baru, buat analisa sendiri.',
          })
        }
        ganti.set(c.resource_code, c.coefficient)
      }

      const { data: baru, error: errBuat } = await request.db!
        .from('assemblies')
        .insert({
          code: kode,
          name: b.name?.trim() || asal.name,
          source: 'company',
          company_id: request.companyId!,
          cost_code_id: asal.cost_code_id,
          output_unit_code: asal.output_unit_code,
          edition_id: asal.edition_id,
          reference_standard: asal.reference_standard,
          waste_factor: asal.waste_factor,
          version_number: 1,
          status: 'draft',
          derived_from_assembly_id: asal.id,
          derived_from_edition_id: asal.edition_id,
          // `deviation` = koefisien perusahaan menyimpang dari standar
          // nasional; itu persis maknanya di sini. Bukan `correction` — kita
          // tidak menyatakan angka nasionalnya salah, hanya bahwa cara kerja
          // tim ini berbeda. (Nilai sah: correction | deviation | NULL.)
          // NULL saat koefisien tidak diubah sama sekali: salinan yang identik
          // bukan penyimpangan.
          edit_type: ganti.size > 0 ? 'deviation' : null,
          edit_reason: b.reason?.trim() || 'Adopsi katalog nasional ke katalog perusahaan',
          created_by: request.currentUser!.id,
        })
        .select('id, code, name, source, status')
        .single()

      if (errBuat || !baru) {
        request.log.error({ err: errBuat }, 'gagal menyalin analisa')
        return reply.status(500).send({ error: errBuat?.message ?? 'Gagal menyalin analisa' })
      }

      const { error: errKomp } = await request.db!
        .from('assembly_components')
        .insert(kompAsal.map((k, i) => ({
          assembly_id: baru.id,
          resource_id: k.resource!.id,
          coefficient: ganti.get(k.resource!.code) ?? k.coefficient,
          sort_order: k.sort_order ?? i,
          notes: k.notes,
          company_id: request.companyId!,
        })))

      if (errKomp) {
        // Analisa tanpa komponen tak bisa dihitung dan tak bisa diperbaiki dari
        // UI — lebih baik tak jadi dibuat daripada lahir mati.
        await request.db!.from('assemblies').delete().eq('id', baru.id)
        request.log.error({ err: errKomp }, 'gagal menyalin komponen; analisa dibatalkan')
        return reply.status(500).send({
          error: 'Gagal menyalin komponen analisa. Tidak ada yang dibuat.',
        })
      }

      const diubah = kompAsal
        .filter((k) => ganti.has(k.resource!.code) && ganti.get(k.resource!.code) !== Number(k.coefficient))
        .map((k) => ({
          resource_code: k.resource!.code,
          dari: Number(k.coefficient),
          jadi: ganti.get(k.resource!.code)!,
        }))

      void logAuditEvent(request, {
        tableName: 'assemblies',
        recordId: baru.id,
        action: 'cecep.assembly_adopted',
        actorId: request.currentUser!.id,
        newValues: {
          kode_baru: baru.code, dari_analisa: asal.code,
          komponen: kompAsal.length, koefisien_diubah: diubah,
        },
        reason: b.reason?.trim() || 'Adopsi katalog nasional ke katalog perusahaan',
      })

      return reply.status(201).send({
        data: baru,
        asal: { id: asal.id, code: asal.code, name: asal.name },
        komponen_disalin: kompAsal.length,
        koefisien_diubah: diubah,
      })
    })

  // ── POST /cecep/assemblies/:id/edit — versi baru (correction | deviation) ──
  //
  // Menutup janji pesan error /adopt ("sunting langsung selagi berstatus
  // draft") dan §1.1–1.2 AHSP-EDITION-BUILDER-DESIGN.md: assembly APA PUN
  // (national maupun company, draft maupun active) bisa diberi versi baru
  // dengan koefisien berbeda — TANPA mutate baris lama (guard
  // fn_assembly_immutable/fn_assembly_baseline_immutable menolaknya, dan itu
  // benar: assembly active dipakai estimate_items, is_import_baseline adalah
  // jejak "SE bilang apa").
  //
  // DUA JENIS, DITENTUKAN CALLER (bukan ditebak dari isi perubahan):
  //   - correction: impor salah baca, dibetulkan supaya COCOK sumber aslinya.
  //     `source`+`edition_id` TETAP SAMA — label dipertahankan (tetap "SE
  //     47/2026" atau tetap "company"). Assembly BUKAN national juga sah
  //     dikoreksi (migrasi 141 adalah preseden manual utk kasus ini — company
  //     Cibuluh yang salah baca parser; endpoint ini adalah jalur API-nya).
  //   - deviation: cara kerja SENGAJA diubah beda dari sumber asal. Kalau
  //     asalnya 'national', hasil OTOMATIS di-fork ke 'company' (national
  //     tetap murni — deviasi tak pernah menimpa katalog bersama); kalau
  //     asalnya sudah 'company', tetap 'company' (tak ada tempat lain untuk
  //     di-fork). `edition_id` dipertahankan sebagai provenance INDUK bila ada.
  //
  // SAFETY: assembly SUMBER (yang diberi versi baru) TIDAK diubah sama sekali
  // — hanya dibaca lalu disalin. estimate_items yang sudah memakainya tetap
  // menunjuk versi lama (immutability M1-M2, §1.3): edit tak pernah mengubah
  // RAB yang sudah dibuat, hanya menyediakan versi baru untuk RAB berikutnya.
  app.post<{ Params: { id: string }
             Body: { edit_type?: string; reason?: string; name?: string
                     components?: { resource_code: string; coefficient: number }[] } }>(
    '/api/v1/cecep/assemblies/:id/edit',
    { preHandler: [authenticate, requirePermission('cecep:assembly:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}

      if (b.edit_type !== 'correction' && b.edit_type !== 'deviation') {
        return reply.status(400).send({
          error: "edit_type wajib 'correction' (perbaikan, tetap cocok sumber asal) " +
                 "atau 'deviation' (cara kerja sengaja beda, fork ke company)",
        })
      }
      if (!b.reason?.trim()) {
        return reply.status(400).send({ error: 'reason wajib — alasan edit tercatat sebagai jejak audit' })
      }

      const { data: asal, error: errAsal } = await request.db!
        .from('assemblies')
        .select(`id, code, name, source, cost_code_id, output_unit_code, edition_id,
                 reference_standard, waste_factor, version_number, status,
                 components:assembly_components(coefficient, sort_order, notes,
                   resource:resources(id, code, name, unit_code))`)
        .eq('id', request.params.id)
        .maybeSingle()
      if (errAsal) return reply.status(500).send({ error: errAsal.message })
      if (!asal) return reply.status(404).send({ error: 'Analisa tidak ditemukan' })

      type KompAsal = {
        coefficient: number; sort_order: number | null; notes: string | null
        resource: { id: string; code: string; name: string; unit_code: string } | null
      }
      const kompAsal = ((asal.components ?? []) as unknown as KompAsal[]).filter((x) => x.resource)
      if (kompAsal.length === 0) {
        return reply.status(400).send({ error: 'Analisa asal tidak punya komponen untuk diberi versi baru' })
      }

      // Koefisien pengganti OPSIONAL+PARSIAL — pola sama dgn /adopt (L411-429):
      // yang tak disebut memakai koefisien asli, cegah ketik-ulang massal.
      const ganti = new Map<string, number>()
      for (const c of b.components ?? []) {
        if (!c.resource_code || typeof c.coefficient !== 'number' || c.coefficient <= 0) {
          return reply.status(400).send({
            error: `Koefisien tak valid untuk "${c.resource_code}" — wajib angka > 0`,
          })
        }
        if (!kompAsal.some((k) => k.resource!.code === c.resource_code)) {
          return reply.status(400).send({
            error: `"${c.resource_code}" bukan komponen analisa ini. Endpoint ini membuat versi ` +
                   'baru dari komponen yang sudah ada; untuk menambah komponen baru, buat analisa sendiri.',
          })
        }
        ganti.set(c.resource_code, c.coefficient)
      }
      if (ganti.size === 0) {
        return reply.status(400).send({
          error: 'Tidak ada koefisien yang diubah — versi baru identik dengan asalnya tidak dibuat',
        })
      }

      // deviation dari national WAJIB fork; deviation dari company tetap company.
      // correction TIDAK PERNAH mengubah source (itulah yang membuatnya "tetap
      // cocok sumber asal" — kalau source berubah, itu deviation, bukan correction).
      const sourceBaru = b.edit_type === 'deviation' && asal.source === 'national' ? 'company' : asal.source
      if (sourceBaru === 'company' && !request.companyId) {
        return reply.status(400).send({ error: 'Company aktif tidak diketahui — tak bisa fork ke company' })
      }

      const kodeBaru = asal.code
      const versiBaru = asal.version_number + 1
      // assembly_identity: UNIQUE NULLS NOT DISTINCT (code, edition_id, source, version_number).
      // Kalau deviation berpindah source (national→company), (code, edition_id, version_number)
      // yang sama di source BEDA tak bertabrakan — tapi kalau correction (source tetap sama)
      // dan versi ini kebetulan sudah pernah dibuat, gagal jelas, bukan diam-diam menimpa.
      const { data: bentrok } = await request.db!
        .from('assemblies').select('id')
        .eq('code', kodeBaru).eq('source', sourceBaru).eq('version_number', versiBaru)
        .maybeSingle()
      if (bentrok) {
        return reply.status(409).send({
          error: `Versi ${versiBaru} untuk "${kodeBaru}" (source=${sourceBaru}) sudah ada`,
        })
      }

      const { data: baru, error: errBuat } = await request.db!
        .from('assemblies')
        .insert({
          code: kodeBaru,
          name: b.name?.trim() || asal.name,
          source: sourceBaru,
          company_id: sourceBaru === 'company' ? request.companyId! : null,
          cost_code_id: asal.cost_code_id,
          output_unit_code: asal.output_unit_code,
          // Provenance edisi dipertahankan sbg INDUK meski deviation fork ke
          // company (§1.1: "edition_id tetap menunjuk edisi INDUK") — bukan
          // diklaim sbg national baru (source sudah berubah, itu cukup).
          edition_id: asal.edition_id,
          reference_standard: asal.reference_standard,
          waste_factor: asal.waste_factor,
          version_number: versiBaru,
          status: 'draft',
          edited_from: asal.id,
          edit_type: b.edit_type,
          edit_reason: b.reason.trim(),
          created_by: request.currentUser!.id,
        })
        .select('id, code, name, source, version_number, status, edit_type')
        .single()

      if (errBuat || !baru) {
        request.log.error({ err: errBuat }, 'gagal membuat versi baru assembly')
        return reply.status(500).send({ error: errBuat?.message ?? 'Gagal membuat versi baru' })
      }

      const { error: errKomp } = await request.db!
        .from('assembly_components')
        .insert(kompAsal.map((k, i) => ({
          assembly_id: baru.id,
          resource_id: k.resource!.id,
          coefficient: ganti.get(k.resource!.code) ?? k.coefficient,
          sort_order: k.sort_order ?? i,
          notes: k.notes,
          company_id: sourceBaru === 'company' ? request.companyId! : null,
        })))

      if (errKomp) {
        await request.db!.from('assemblies').delete().eq('id', baru.id)
        request.log.error({ err: errKomp }, 'gagal menyalin komponen; versi baru dibatalkan')
        return reply.status(500).send({
          error: 'Gagal menyalin komponen ke versi baru. Tidak ada yang dibuat.',
        })
      }

      const diubah = kompAsal
        .filter((k) => ganti.has(k.resource!.code) && ganti.get(k.resource!.code) !== Number(k.coefficient))
        .map((k) => ({
          resource_code: k.resource!.code,
          dari: Number(k.coefficient),
          jadi: ganti.get(k.resource!.code)!,
        }))

      void logAuditEvent(request, {
        tableName: 'assemblies',
        recordId: baru.id,
        action: b.edit_type === 'correction' ? 'cecep.assembly_corrected' : 'cecep.assembly_deviated',
        actorId: request.currentUser!.id,
        newValues: {
          kode: baru.code, versi_baru: versiBaru, dari_versi: asal.version_number,
          source_asal: asal.source, source_baru: sourceBaru, koefisien_diubah: diubah,
        },
        reason: b.reason.trim(),
      })

      return reply.status(201).send({
        data: baru,
        asal: { id: asal.id, code: asal.code, version_number: asal.version_number, source: asal.source },
        koefisien_diubah: diubah,
      })
    })

  // ── PATCH /cecep/assemblies/:id/activate — draft → active ──────────────────
  //
  // Menutup gap: /adopt dan /edit SENGAJA melahirkan baris berstatus 'draft'
  // (versi baru layak direview dulu — koefisien yang diketik/diubah manusia
  // bisa salah ketik), tapi picker komposer (KatalogTab, estimasi/page.tsx
  // L360) hanya menampilkan status='active'. Tanpa endpoint ini draft yang
  // dihasilkan kedua endpoint itu tak pernah bisa dipakai dari UI.
  //
  // Transisi draft→active dijaga DB (fn_assembly_status_transition, 107):
  // hanya satu arah, tak bisa mundur. Endpoint ini TIDAK menduplikasi guard
  // itu — ia mengandalkannya (UPDATE yang melanggar aturan gagal di DB,
  // dilaporkan sebagai 500 dengan pesan asli, bukan ditebak lolos di sini).
  app.patch<{ Params: { id: string } }>(
    '/api/v1/cecep/assemblies/:id/activate',
    { preHandler: [authenticate, requirePermission('cecep:assembly:manage')] },
    async (request, reply) => {
      const { data: asm, error: errGet } = await request.db!
        .from('assemblies').select('id, code, status').eq('id', request.params.id).maybeSingle()
      if (errGet) return reply.status(500).send({ error: errGet.message })
      if (!asm) return reply.status(404).send({ error: 'Analisa tidak ditemukan' })
      if (asm.status !== 'draft') {
        return reply.status(400).send({
          error: `Analisa berstatus "${asm.status}" — hanya draft yang bisa diaktifkan`,
        })
      }

      const { data: updated, error: errUpd } = await request.db!
        .from('assemblies').update({ status: 'active' }).eq('id', asm.id)
        .select('id, code, status, activated_at').single()
      if (errUpd || !updated) {
        return reply.status(500).send({ error: errUpd?.message ?? 'Gagal mengaktifkan analisa' })
      }

      void logAuditEvent(request, {
        tableName: 'assemblies', recordId: asm.id, action: 'cecep.assembly_activated',
        actorId: request.currentUser!.id, newValues: { code: asm.code, status: 'active' },
      })
      return reply.send({ data: updated })
    })

  // ── GET /cecep/prices/missing — daftar prioritas harga yang belum diisi ────
  //
  // Kebutuhan founder: 252 resource belum berharga, dan satu resource bisa
  // memblokir puluhan analisa sekaligus — "Sewa Tripot" saja dipakai 213
  // analisa. Diurutkan dari DAMPAK TERBESAR supaya mengisi 4 baris teratas
  // langsung menghidupkan ratusan analisa, bukan mengisi berurutan abjad.
  app.get<{ Querystring: { source?: string; limit?: string } }>(
    '/api/v1/cecep/prices/missing',
    { preHandler: [authenticate, requirePermission('cecep:price:view')] },
    async (request, reply) => {
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 50))
      const source = request.query.source

      // Dampak = berapa analisa yang tak bisa dihitung gara-gara resource ini.
      // Dihitung di aplikasi karena wrapper tenant tidak menyediakan jalur SQL
      // mentah, dan menembusnya berarti melewati scoping otomatis. Batas 20.000
      // baris cukup untuk ~18.000 komponen yang ada; kalau kelak terlampaui,
      // angkanya jadi kurang — itu sebabnya `total_tanpa_harga` dilaporkan
      // terpisah agar selisihnya terlihat, bukan tersamar.
      const { data, error } = await request.db!
        .from('assembly_components')
        .select(`resource_id, assembly:assemblies!inner(source),
                 resource:resources!inner(id, code, name, category, unit_code)`)
        .limit(20000)

      if (error) return reply.status(500).send({ error: error.message })

      type Row = {
        resource_id: string
        assembly: { source: string } | { source: string }[]
        resource: { id: string; code: string; name: string; category: string; unit_code: string }
      }
      const pakai = new Map<string, { r: Row['resource']; n: number }>()
      for (const row of (data ?? []) as unknown as Row[]) {
        const asm = Array.isArray(row.assembly) ? row.assembly[0] : row.assembly
        if (source && asm?.source !== source) continue
        const k = row.resource_id
        const cur = pakai.get(k) ?? { r: row.resource, n: 0 }
        cur.n += 1
        pakai.set(k, cur)
      }

      const ids = [...pakai.keys()]
      const { data: berharga } = await request.db!
        .from('price_book_entries')
        .select('resource_id')
        .in('resource_id', ids)
        .eq('status', 'active')
      const sudah = new Set((berharga ?? []).map((x: { resource_id: string }) => x.resource_id))

      const daftar = [...pakai.values()]
        .filter((x) => !sudah.has(x.r.id))
        .sort((a, b) => b.n - a.n)
        .slice(0, limit)
        .map((x) => ({
          resource_id: x.r.id, code: x.r.code, name: x.r.name,
          category: x.r.category, unit_code: x.r.unit_code,
          dipakai_analisa: x.n,
        }))

      return reply.send({
        data: daftar,
        total_tanpa_harga: [...pakai.values()].filter((x) => !sudah.has(x.r.id)).length,
      })
    })

  // ── GET /cecep/assemblies/:id/hsp-live — HSP dari harga YANG SEDANG BERLAKU ─
  //
  // Beda dengan POST /hsp di atas: yang itu menuntut pemanggil mengirim peta
  // harga sendiri (dipakai simulasi "bagaimana kalau harga X jadi Y"). Yang ini
  // MENGAMBIL harga dari price book — persis seperti sheet analisa Excel yang
  // nge-link ke HS.UPAH/HS.BAHAN.
  //
  // Ada karena layar katalog butuh menampilkan HSP begitu analisa dibuka, dan
  // tanpa endpoint ini UI harus mengambil price book lalu menerapkan aturan
  // resolusi harga sendiri — menyalin logika (status active, masa berlaku,
  // preferensi lokasi, override proyek) ke frontend, tempat ia pasti menyimpang
  // diam-diam dari yang di backend.
  //
  // TIDAK fail-loud saat harga kurang. Berbeda dengan menyusun RAB — di sini
  // pengguna sedang MELIHAT katalog, dan menolak menampilkan apa pun hanya
  // karena satu komponen belum berharga membuat 43% katalog jadi layar error.
  // Yang kurang dilaporkan eksplisit di `missing_prices` supaya terlihat mana
  // yang perlu diisi, dan `hsp_partial` menandai angkanya belum utuh.
  app.get<{ Params: { id: string }
            Querystring: { price_date?: string; location?: string; project_id?: string
                           buk_fraction?: string; rounding_step?: string } }>(
    '/api/v1/cecep/assemblies/:id/hsp-live',
    { preHandler: [authenticate, requirePermission('cecep:assembly:view')] },
    async (request, reply) => {
      const priceDate = request.query.price_date ?? new Date().toISOString().slice(0, 10)
      const buk = request.query.buk_fraction != null ? Number(request.query.buk_fraction) : 0.1
      const step = request.query.rounding_step != null ? Number(request.query.rounding_step) : 0
      if (!(buk >= 0 && buk <= 1)) {
        return reply.status(400).send({ error: 'buk_fraction wajib 0..1' })
      }

      const { data: asm, error } = await request.db!
        .from('assemblies')
        .select(`id, code, name, output_unit_code, status, source,
                 components:assembly_components(coefficient, sort_order,
                   resource:resources(id, code, name, category, unit_code))`)
        .eq('id', request.params.id)
        .maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!asm) return reply.status(404).send({ error: 'Assembly tidak ditemukan' })

      type Comp = {
        coefficient: number
        resource: { id: string; code: string; name: string; category: string; unit_code: string } | null
      }
      const rows = ((asm.components ?? []) as unknown as Comp[]).filter((x) => x.resource)
      const resourceIds = rows.map((x) => x.resource!.id)

      const { data: pbe } = await request.db!
        .from('price_book_entries')
        .select('id, resource_id, amount, currency, version_number, effective_date, expired_date, location, status, company_id')
        .in('resource_id', resourceIds)

      // Harga khusus proyek ikut dihormati bila layar dibuka DARI konteks
      // proyek — supaya angka di katalog sama dengan yang nanti masuk RAB
      // proyek itu, bukan angka acuan yang berbeda.
      let overrides: ProjectPriceOverrideRow[] = []
      if (request.query.project_id) {
        if (!(await request.db!.projectIds()).includes(request.query.project_id)) {
          return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
        }
        const { data: ov } = await request.db!
          .viaProject('project_price_override', request.query.project_id)
          .select('id, project_id, resource_id, amount, currency, effective_date, expired_date, reason')
          .in('resource_id', resourceIds)
        overrides = (ov ?? []) as ProjectPriceOverrideRow[]
      }

      const { resolved, missing } = resolvePrices(
        (pbe ?? []) as PriceBookEntryRow[], resourceIds, priceDate,
        request.query.location ?? null, overrides)

      const comps: AhspComponent[] = []
      const rincian: unknown[] = []
      const tanpaHarga: string[] = []
      for (const row of rows) {
        const r = row.resource!
        const group = GROUP_BY_CATEGORY[r.category]
        const hit = resolved.get(r.id)
        if (!group || !hit) {
          if (!hit) tanpaHarga.push(r.code)
          rincian.push({
            resource_code: r.code, resource_name: r.name, unit: r.unit_code,
            coefficient: Number(row.coefficient), category: r.category,
            amount: null, subtotal: null, sumber: null,
          })
          continue
        }
        const hsd = Number(hit.entry.amount)
        comps.push({ group, name: r.name, unit: r.unit_code, coefficient: Number(row.coefficient), hsd })
        rincian.push({
          resource_code: r.code, resource_name: r.name, unit: r.unit_code,
          coefficient: Number(row.coefficient), category: r.category,
          amount: hsd,
          subtotal: Number((Number(row.coefficient) * hsd).toFixed(4)),
          sumber: hit.override ? 'override_proyek' : 'price_book',
          override_reason: hit.override?.reason ?? null,
          effective_date: hit.entry.effective_date,
        })
      }

      const result = comps.length
        ? computeAhsp(comps, buk, { mode: step > 0 ? 'down' : 'none', step })
        : null

      return reply.send({
        assembly: {
          id: asm.id, code: asm.code, name: asm.name,
          output_unit: asm.output_unit_code, source: asm.source, status: asm.status,
        },
        input: { price_date: priceDate, location: request.query.location ?? null,
                 project_id: request.query.project_id ?? null, buk_fraction: buk },
        components: rincian,
        // Ditandai eksplisit: HSP yang dihitung dari sebagian komponen BUKAN
        // HSP. Tanpa penanda ini angkanya terlihat sah padahal kurang.
        hsp_partial: missing.length > 0,
        missing_prices: tanpaHarga,
        result,
      })
    })
}
