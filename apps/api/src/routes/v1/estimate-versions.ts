import type { FastifyInstance, FastifyRequest } from 'fastify'
import { jelaskanItem, type HspSnapshot } from '../../lib/explain-item.js'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import {
  evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain, idAlurPersetujuan , periksaGerbangSod } from '../../utils/approval.js'
import { computeRab, computeBoq, type EstimateItemRow } from '../../lib/rab-readmodel.js'
import { forecastCashflow } from '../../lib/cashflow-forecast.js'
import { petakanKeRab } from '../../lib/estimate-ke-rab.js'
import {
  computeAhsp, computeRabLineTotal, computeRabRollup, type RoundingRule, type RabGroupInput,
} from '../../lib/ahsp-engine.js'
import {
  computeMaterialAggregation, computeRebarBar, summarizeRebarByDiameter,
  type TakeoffLineInput, type RebarTakeoffLine,
} from '../../lib/rab-compute.js'
import {
  hitungBarisTakeoff, rekapTakeoff, bandingkanTerapan, GalatTakeoff,
  SATUAN_HASIL, type MetodeTakeoff,
} from '../../lib/takeoff-dimensi.js'
import {
  hitungBarisSektor, SEKTOR_SAH, type Sektor, type Bukaan,
} from '../../lib/takeoff-sektor.js'
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
  // ── GET /api/v1/estimate-items/:itemId/explain ─────────────────────────
  // Rangkai jejak satu baris RAB jadi penjelasan yang bisa DIBACAKAN.
  //
  // Constraint TERTINGGI CECEP (`01-phase-b` §"strategy-driven, versioned,
  // explainable, replaceable"), bukan fitur pinggiran: angka RAB dibawa ke
  // hadapan klien & pemeriksa, dan angka yang tak bisa dipertahankan tak akan
  // dipakai untuk pekerjaan yang benar-benar bernilai.
  //
  // Sumbernya `hsp_snapshot` (migrasi 139) — SNAPSHOT, bukan hitung ulang.
  // Menghitung ulang hari ini memberi angka LAIN karena harga berubah,
  // sehingga penjelasannya tak cocok dengan angka di dokumen penawaran —
  // kebalikan dari tujuan explainability.
  app.get<{ Params: { itemId: string } }>(
    '/api/v1/estimate-items/:itemId/explain',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      const { itemId } = request.params

      // Gerbang tenant lewat versi induknya: `estimate_items` kategori C
      // (lewat estimate_version_id), jadi kepemilikannya diperiksa di sana.
      const { data: item } = await request.db!
        .unsafe('estimate_items', 'kategori C lewat estimate_version_id; dicek versiMilikTenant di bawah')
        /*
          ── KOLOM `description` DAN `unit` TIDAK PERNAH ADA. Diukur 2026-08-16.

          Baris ini dulu berbunyi:

              .select('id, description, unit, quantity, price_date, …')

          `estimate_items` tak punya keduanya (`introspect.mjs columns`):

              id · estimate_version_id · cost_code_id · assembly_id ·
              cbs_node_id · wbs_node_id · quantity · amount · sort_order ·
              notes · created_at · price_date · price_location ·
              hsp_snapshot · provenance_captured

          Akibatnya SELECT gagal, `item` undefined, dan penjaganya di bawah
          menyimpulkan "Item tidak ditemukan" — 404 untuk SETIAP item, termasuk
          item yang jelas-jelas ada. Di layar terbaca "Gagal memuat penjelasan".

          Yang membuatnya bertahan: 404-nya terlihat MASUK AKAL (ada cabang
          yang memang memulangkan 404 untuk item milik tenant lain), dan tak
          ada satu pun test menyentuh rute ini. Fitur "kenapa angkanya segini?"
          — janji inti modul ini — tak pernah sekali pun berhasil.

          Nama & satuan diambil dari analisanya (`assemblies`), tempat data itu
          sebenarnya tinggal; item lump-sum memakai `notes`.
        */
        .select(`id, quantity, price_date, hsp_snapshot, estimate_version_id, notes,
                 assembly:assemblies(name, output_unit_code)`)
        .eq('id', itemId)
        .maybeSingle()

      if (!item || !(await versiMilikTenant(request, item.estimate_version_id))) {
        return reply.status(404).send({ error: 'Item tidak ditemukan' })
      }

      const asm = (item as { assembly?: { name?: string; output_unit_code?: string } | null }).assembly
      const nama = asm?.name ?? (item.notes as string | null) ?? '(tanpa nama)'
      const satuan = asm?.output_unit_code ?? null

      const hasil = jelaskanItem(item.hsp_snapshot as HspSnapshot | null, {
        namaItem: nama,
        satuan,
        volume: item.quantity == null ? null : Number(item.quantity),
        priceDate: item.price_date ?? null,
      })

      return reply.send({
        data: {
          itemId: item.id,
          nama,
          satuan,
          volume: item.quantity == null ? null : Number(item.quantity),
          ...hasil,
        },
      })
    },
  )

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

  /*
    ── GET /estimate-versions — DAFTAR RAB lintas proyek ─────────────────────

    Kenapa endpoint ini ada, padahal 16 endpoint estimasi lainnya sudah cukup
    untuk MENGERJAKAN satu RAB.

    Seluruh modul ini di-key oleh id: buka versi X, ubah item Y. Itu melayani
    orang yang SUDAH TAHU RAB mana yang dicarinya. Yang tak pernah dilayani:
    "RAB apa saja yang kami punya, dan mana yang perlu saya lanjutkan?" —
    pertanyaan yang dibawa orang saat membuka menunya, bukan saat sudah di
    dalam satu dokumen.

    Diukur 2026-08-16: 208 skenario dan 2.221 versi tersimpan, dan TAK SATU
    PUN tampil di layar mana pun. Datanya ada, jalan masuknya tidak. Ikhtisar
    /estimasi menampilkan daftar PROYEK sebagai gantinya — sehingga proyek yang
    RAB-nya sudah Rp 4,8 M terlihat persis sama dengan yang masih kosong.

    Bentuk jawabannya sengaja SATU BARIS PER VERSI, bukan per proyek:
    membandingkan dua penawaran untuk proyek yang sama adalah pekerjaan nyata
    di sini (itu guna `scenarios`), dan pengelompokan per proyek justru
    menyembunyikannya.
  */
  app.get<{ Querystring: { limit?: string } }>(
    '/api/v1/estimate-versions',
    { preHandler: [authenticate, requirePermission('cecep:estimate:view')] },
    async (request, reply) => {
      // Gerbang tenancy T4g: saring lewat skenario milik tenant, bukan
      // memercayai id yang dikirim. Tanpa ini daftar membocorkan seluruh RAB
      // tenant lain sekaligus — kebocoran terluas yang mungkin di modul ini.
      const skenarioIds = await skenarioIdsTenant(request)
      if (skenarioIds.length === 0) return reply.send({ data: [] })

      // Batas eksplisit: `audit-baca-tak-terpotong` menolak baca tabel penuh
      // yang bisa terpotong senyap di 1.000 baris PostgREST. 2.221 versi sudah
      // melewatinya hari ini, jadi batasnya ditulis, bukan diwariskan.
      const limit = Math.max(1, Math.min(500, Number(request.query.limit) || 200))

      const { data, error } = await supabase
        .from('estimate_versions')
        .select(`id, version_number, status, total_amount, created_at, edition_id,
                 scenario:scenarios!inner(id, name, project_id)`)
        .in('scenario_id', skenarioIds)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return reply.status(500).send({ error: error.message })

      const baris = data ?? []

      /*
        PostgREST memulangkan relasi kadang sebagai OBJEK, kadang sebagai
        ARRAY berisi satu — bergantung bagaimana ia menyimpulkan kardinalitas
        embed. `versiMilikTenant` di berkas ini sudah menangani hal yang sama;
        pola itu diangkat jadi satu helper supaya tak ditebak dua kali.

        Kalau ini dilewatkan, `sc.project_id` bernilai undefined pada bentuk
        array — dan akibatnya BUKAN galat melainkan daftar yang nama proyeknya
        kosong seluruhnya.
      */
      const satu = <T,>(v: T | T[] | null | undefined): T | undefined =>
        (Array.isArray(v) ? v[0] : v) ?? undefined
      type ScenarioEmbed = { id: string; name: string; project_id: string }

      // Nama proyek & kode edisi diambil sekali untuk seluruh daftar, bukan
      // per baris: 200 baris × 2 query = 400 perjalanan bolak-balik, dan
      // halaman daftar adalah tempat paling sering dibuka di modul ini.
      const projectIds = [...new Set(baris
        .map((r) => satu(r.scenario as ScenarioEmbed | ScenarioEmbed[] | null)?.project_id)
        .filter((x): x is string => Boolean(x)))]
      const editionIds = [...new Set(baris
        .map((r) => r.edition_id).filter((x): x is string => Boolean(x)))]

      const [proyekRes, edisiRes] = await Promise.all([
        projectIds.length
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : Promise.resolve({ data: [], error: null }),
        editionIds.length
          ? supabase.from('ahsp_editions').select('id, code').in('id', editionIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (proyekRes.error) return reply.status(500).send({ error: proyekRes.error.message })
      if (edisiRes.error) return reply.status(500).send({ error: edisiRes.error.message })

      const namaProyek = new Map((proyekRes.data ?? []).map((p) => [p.id, p.name]))
      const kodeEdisi = new Map((edisiRes.data ?? []).map((e) => [e.id, e.code]))

      return reply.send({
        data: baris.map((r) => {
          const sc = satu(r.scenario as ScenarioEmbed | ScenarioEmbed[] | null)
          return {
            id: r.id,
            version_number: r.version_number,
            status: r.status,
            // `total_amount` numeric datang sebagai string dari PostgREST.
            // Dikirim sebagai number supaya UI tak menjumlahkan teks —
            // dan null TETAP null, bukan 0: RAB yang belum dihitung dan RAB
            // yang benar-benar nol rupiah adalah dua keadaan berbeda.
            total_amount: r.total_amount == null ? null : Number(r.total_amount),
            created_at: r.created_at,
            scenario_id: sc?.id ?? null,
            scenario_name: sc?.name ?? null,
            project_id: sc?.project_id ?? null,
            project_name: sc ? (namaProyek.get(sc.project_id) ?? null) : null,
            edition_code: r.edition_id ? (kodeEdisi.get(r.edition_id) ?? null) : null,
          }
        }),
        meta: { jumlah: baris.length, batas: limit, terpotong: baris.length === limit },
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

  // ── POST /estimate-versions/:id/terapkan-ke-rab ─────────────────────────────
  //
  // Menyalin item versi estimasi menjadi `rab_items` proyek.
  //
  // ── Kenapa MENYALIN, bukan membuat pembaca membaca dua sumber
  //
  // `estimate_items` (Komposer) dan `rab_items` (RAB proyek) selama ini tak
  // punya FK maupun sinkronisasi — RAB yang disusun rapi di Komposer tak
  // berpengaruh apa pun pada Kurva S, EVM, dan progress fisik, karena ketiganya
  // membaca `rab_items`.
  //
  // Keputusan founder (2026-07-31): sambungkan lewat penyalinan eksplisit.
  // Kurva S/EVM tak perlu diubah sama sekali — tetap membaca satu tabel — jadi
  // angka yang sudah dipakai hari ini tak berisiko bergeser. Upload Excel manual
  // tetap hidup sebagai jalur alternatif; keduanya menulis ke tabel yang sama.
  //
  // ── Menimpa, dan itu disengaja
  //
  // RAB proyek adalah SATU daftar, bukan tumpukan. Menambahkan tanpa mengganti
  // akan menghasilkan item ganda tiap kali tombol ditekan, dan bobot yang
  // berjumlah 200%. Karena itu baris lama dihapus lebih dulu — dengan jumlahnya
  // dilaporkan balik, dan dijaga `konfirmasi_timpa` supaya tak pernah terjadi
  // tanpa pemakai tahu apa yang hilang.
  app.post<{ Params: { id: string }; Body: { konfirmasi_timpa?: boolean } }>(
    '/api/v1/estimate-versions/:id/terapkan-ke-rab',
    { preHandler: [authenticate, requirePermission('projects:edit')] },
    async (request, reply) => {
      // `unsafe` beralasan: `estimate_versions` mewarisi tenancy lewat
      // `scenario_id`, bukan `project_id` — `viaProject` akan menyaring dengan
      // kolom yang salah dan mengembalikan nol baris tanpa error. Gerbangnya
      // ada di `.in('scenario_id', skenarioIdsTenant(request))` di baris yang
      // sama, yang persis pola dipakai seluruh endpoint lain di berkas ini.
      const { data: v } = await request.db!
        .unsafe('estimate_versions', 'disaring scenario_id milik tenant di baris yang sama')
        .select(`id, version_number, status, total_amount,
                 scenario:scenarios(id, name, project_id),
                 items:estimate_items(id, quantity, amount, sort_order, hsp_snapshot,
                   cost_code:cost_codes(code, name),
                   assembly:assemblies(name, output_unit_code))`)
        .eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      const projectId = (v.scenario as unknown as { project_id?: string } | null)?.project_id
      if (!projectId) return reply.status(400).send({ error: 'Versi ini tak terikat proyek' })

      type ItemRow = {
        id: string; quantity: number; amount: number; sort_order: number
        hsp_snapshot: { hsp?: { groupTotals?: Record<string, number> } } | null
        cost_code: { code: string; name: string } | null
        assembly: { name: string; output_unit_code: string | null } | null
      }
      const items = (v.items ?? []) as unknown as ItemRow[]
      if (!items.length) {
        return reply.status(400).send({ error: 'Versi ini belum punya item — tak ada yang bisa diterapkan' })
      }

      // Hitung dampak SEBELUM menghapus apa pun, supaya konfirmasi yang diminta
      // menyebut angka yang benar.
      const { data: lama } = await request.db!
        .viaProject('rab_items', projectId).select('id')
      const jumlahLama = (lama ?? []).length

      if (jumlahLama > 0 && !request.body?.konfirmasi_timpa) {
        return reply.status(409).send({
          error: 'RAB proyek sudah berisi — konfirmasi diperlukan',
          kode: 'RAB_SUDAH_ADA',
          akan_dihapus: jumlahLama,
          akan_dibuat: items.length,
          petunjuk: 'Kirim ulang dengan `konfirmasi_timpa: true` bila ingin mengganti.',
        })
      }

      const baris = petakanKeRab(items.map((it) => ({
        id: it.id,
        nama: it.assembly?.name ?? it.cost_code?.name ?? 'Pekerjaan',
        kode: it.cost_code?.code ?? null,
        unit: it.assembly?.output_unit_code ?? null,
        quantity: it.quantity,
        amount: it.amount,
        sort_order: it.sort_order,
        // ── `hsp`, BUKAN `result` ────────────────────────────────────────
        //
        // Diukur 2026-08-13: penulisnya (baris ~786 di berkas ini) menyimpan
        // `hsp_snapshot: { hsp: { groupTotals, subtotalD, ... }, prices: [...] }`
        // — kunci `result` tak pernah ada. Dibuktikan di basis: dari seluruh
        // `estimate_items` ber-snapshot, yang punya kunci `hsp` = semuanya,
        // yang punya `result` = NOL.
        //
        // Akibatnya `group_totals` selalu null, `komponenBiaya()` mengembalikan
        // nol semua, dan `material_pct`/`upah_pct`/`alat_pct` di `rab_items`
        // selalu 0 untuk SETIAP baris hasil "Terapkan ke RAB" — walaupun
        // snapshotnya lengkap.
        //
        // Gagal senyap sempurna: constraint `rab_items_pct_sum` menerima total
        // 0 (nol berarti "tak diketahui", bukan pelanggaran), jadi tak ada
        // galat, tak ada test merah, dan tak ada gejala sampai ada yang
        // bertanya kenapa kolom komponen biaya kosong terus.
        group_totals: it.hsp_snapshot?.hsp?.groupTotals ?? null,
      })))

      if (jumlahLama > 0) {
        const { error: errHapus } = await request.db!
          .viaProject('rab_items', projectId).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        if (errHapus) return reply.status(500).send({ error: `Gagal menghapus RAB lama: ${errHapus.message}` })
      }

      const { data: dibuat, error: errBuat } = await request.db!
        .viaProject('rab_items', projectId)
        .insert(baris.map((b) => ({ ...b, project_id: projectId })))
        .select('id')
      if (errBuat) return reply.status(500).send({ error: `Gagal menulis RAB: ${errBuat.message}` })

      await logAuditEvent(request, {
        tableName: 'rab_items', recordId: projectId,
        action: 'cecep.estimasi_diterapkan_ke_rab',
        actorId: request.currentUser!.id,
        severity: jumlahLama > 0 ? 'warning' : 'info',
        oldValues: jumlahLama > 0 ? { baris_rab_dihapus: jumlahLama } : null,
        newValues: {
          estimate_version_id: v.id, versi: v.version_number,
          skenario: (v.scenario as unknown as { name?: string } | null)?.name ?? null,
          baris_dibuat: (dibuat ?? []).length,
          total: baris.reduce((s, b) => s + (b.total_price ?? 0), 0),
        },
      })

      return reply.status(201).send({
        dihapus: jumlahLama,
        dibuat: (dibuat ?? []).length,
        total: baris.reduce((s, b) => s + (b.total_price ?? 0), 0),
        project_id: projectId,
      })
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

  // ══════════════════════════════════════════════════════════════════════════
  // TAKE-OFF DIMENSIONAL (431) — dari mana volume itu datang
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Melengkapi `rebar_takeoff` (besi) & `steel_profiles` (baja profil) dari 122,
  // yang keduanya hanya menangani geometri BESI. Beton, galian, urugan, dan
  // pasangan — pekerjaan yang volumenya justru paling sering salah — sebelumnya
  // tak punya jalur input geometri sama sekali: `quantity` masuk sebagai angka
  // jadi lewat satu-satunya pemeriksaan `typeof b.quantity !== 'number'`, lalu
  // dikalikan HSP menjadi rupiah.
  //
  // Memakai kunci izin yang SUDAH ADA (`cecep:takeoff:view`/`:manage`) — sengaja
  // tak membuat kunci baru: kunci yang tak ada di tabel `permissions` menolak
  // SEMUA orang tanpa gejala (penjaga `audit-izin-benar-ada`), dan take-off
  // dimensional adalah pekerjaan yang sama dengan take-off besi.

  app.get<{ Params: { id: string } }>(
    '/api/v1/estimate-versions/:id/takeoff-dimensi',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:view')] },
    async (request, reply) => {
      const { data: v } = await supabase
        .from('estimate_versions').select('id').eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })

      // Dinamai `itemTakeoff`, bukan nama umum `items`. `audit-kegagalan-senyap`
      // melacak NAMA variabel per berkas: selama masih ada destructuring nama
      // itu tanpa `error` di berkas ini (empat tersisa, warisan), setiap
      // pemakaian nama tersebut dengan penjaga-nullish ikut tertandai —
      // termasuk yang error-nya sudah diperiksa seperti di sini. Nama
      // tersendiri membuat pemeriksaan ini terbaca apa adanya oleh penjaga,
      // tanpa menaikkan ambang siapa pun.
      const { data: itemTakeoff, error: itErr } = await supabase
        .from('estimate_items')
        .select('id, quantity, assembly:assemblies(name, output_unit_code), cost_code:cost_codes(name)')
        .eq('estimate_version_id', request.params.id)
      if (itErr) return reply.status(500).send({ error: itErr.message })
      const itemIds = (itemTakeoff ?? []).map(i => i.id)
      if (itemIds.length === 0) return reply.send({ estimate_version_id: v.id, items: [] })

      const { data: rows, error } = await supabase
        .from('takeoff_dimensi')
        .select(`id, estimate_item_id, uraian, metode, panjang_m, lebar_m, tinggi_m,
                 jumlah, faktor, hasil_volume, volume_diterapkan, diterapkan_pada, catatan`)
        .in('estimate_item_id', itemIds)
        .order('created_at')
      if (error) return reply.status(500).send({ error: error.message })

      type Rel = { name?: string; output_unit_code?: string } | { name?: string; output_unit_code?: string }[] | null
      const satu = (r: Rel) => (Array.isArray(r) ? r[0] : r) ?? null

      // Dikelompokkan PER ITEM, bukan daftar datar: pertanyaan yang dijawab layar
      // ini selalu "volume item INI dari mana", tak pernah "seluruh baris
      // take-off versi ini". Mengelompokkan di sini menghemat pengelompokan yang
      // sama di UI — dan dua tempat yang mengelompokkan sendiri-sendiri akan
      // menyimpang begitu salah satunya diubah.
      const perItem = new Map<string, typeof rows>()
      for (const r of rows ?? []) {
        const arr = perItem.get(r.estimate_item_id) ?? []
        arr.push(r)
        perItem.set(r.estimate_item_id, arr)
      }

      const hasil = (itemTakeoff ?? []).map(it => {
        const baris = perItem.get(it.id) ?? []
        const rekap = rekapTakeoff(baris.map(b => ({
          hasilVolume: Number(b.hasil_volume), metode: b.metode as MetodeTakeoff,
        })))
        return {
          estimate_item_id: it.id,
          nama: satu(it.assembly as Rel)?.name ?? satu(it.cost_code as Rel)?.name ?? null,
          satuan_item: satu(it.assembly as Rel)?.output_unit_code ?? null,
          quantity_rab: Number(it.quantity),
          baris: baris.map(b => ({
            ...b,
            panjang_m: b.panjang_m === null ? null : Number(b.panjang_m),
            lebar_m: b.lebar_m === null ? null : Number(b.lebar_m),
            tinggi_m: b.tinggi_m === null ? null : Number(b.tinggi_m),
            jumlah: Number(b.jumlah), faktor: Number(b.faktor),
            hasil_volume: Number(b.hasil_volume),
            volume_diterapkan: b.volume_diterapkan === null ? null : Number(b.volume_diterapkan),
            satuan: SATUAN_HASIL[b.metode as MetodeTakeoff] ?? null,
          })),
          rekap,
          // Selisih take-off vs RAB adalah SINYAL — lihat `bandingkanTerapan`.
          // Ia sengaja dihitung di server supaya seluruh pembaca (layar, ekspor,
          // kelak notifikasi) memakai ambang toleransi yang sama.
          banding: baris.length === 0 ? null : bandingkanTerapan(Number(it.quantity), rekap.totalVolume),
        }
      })
      return reply.send({ estimate_version_id: v.id, items: hasil })
    })

  app.post<{ Params: { id: string; itemId: string }
             Body: { uraian?: string; metode?: MetodeTakeoff
                     panjang_m?: number | null; lebar_m?: number | null; tinggi_m?: number | null
                     jumlah?: number | null; faktor?: number | null; catatan?: string
                     /*
                       Kolom SEKTOR. Kehadiran `sektor` yang memilih jalur
                       hitung: ada → `lib/takeoff-sektor.ts`, tak ada → empat
                       metode generik migrasi 431, persis seperti sebelumnya.
                     */
                     sektor?: string; lokasi?: string
                     kemiringan_derajat?: number | null; cacah?: number | null
                     bukaan?: Bukaan[] | null } }>(
    '/api/v1/estimate-versions/:id/items/:itemId/takeoff-dimensi',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:manage')] },
    async (request, reply) => {
      const b = request.body ?? {}

      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', request.params.id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        return reply.status(409).send({ error: 'Take-off hanya bisa diubah saat Estimate Version draft' })
      }
      const { data: item } = await supabase
        .from('estimate_items').select('id').eq('id', request.params.itemId)
        .eq('estimate_version_id', request.params.id).maybeSingle()
      if (!item) return reply.status(404).send({ error: 'Item tidak ditemukan di versi ini' })

      /*
        ══════════════════════════════════════════════════════════════════════
        DUA JALUR HITUNG DI SATU RUTE — `sektor` yang memilihnya.

        Baris tanpa `sektor` memakai empat metode generik migrasi 431 (volume,
        luas, dinding, panjang) dan berperilaku PERSIS seperti sebelumnya.
        Baris ber-`sektor` memakai `lib/takeoff-sektor.ts`, yang menjawab tiga
        hal yang tak bisa dijawab metode generik dan ketiganya berujung rupiah:

          · bukaan dikurangkan  — dinding 4×3 m dengan satu pintu dan satu
            jendela bukan 12 m² melainkan 8,67 m². Kelebihan 28%, di sektor
            yang paling banyak barisnya (plesteran, acian, cat).
          · kemiringan atap     — luas atap BUKAN luas denah; 30° = 1,1547×.
          · cacah titik         — sanitair & MEP dihitung barang, bukan ukuran.

        Rute KEDUA akan lebih pendek ditulis dan salah dipakai: keduanya
        menulis ke tabel yang sama, dan yang kedua akan terlupa saat orang
        bertanya "volume ini dari mana".
        ══════════════════════════════════════════════════════════════════════
      */
      const sektorDiminta = typeof b.sektor === 'string' ? b.sektor : null
      if (sektorDiminta && !SEKTOR_SAH.includes(sektorDiminta as Sektor)) {
        return reply.status(400).send({
          error: `sektor tak dikenal: ${sektorDiminta}. Yang sah: ${SEKTOR_SAH.join(', ')}`,
        })
      }

      if (sektorDiminta) {
        let sk
        try {
          sk = hitungBarisSektor({
            uraian: b.uraian ?? '',
            sektor: sektorDiminta as Sektor,
            lokasi: b.lokasi,
            /*
              `?? undefined` bukan basa-basi tipe: lib sengaja MEMBEDAKAN
              "tak diisi" dari "diisi nol". Meneruskan null membuat pesan
              galatnya berbunyi "diterima: null" alih-alih menyebut dimensi
              mana yang kurang.
            */
            panjangM: b.panjang_m ?? undefined,
            lebarM: b.lebar_m ?? undefined,
            tinggiM: b.tinggi_m ?? undefined,
            jumlah: b.jumlah ?? undefined,
            faktor: b.faktor ?? undefined,
            kemiringanDerajat: b.kemiringan_derajat ?? undefined,
            cacah: b.cacah ?? undefined,
            bukaan: b.bukaan ?? undefined,
          })
        } catch (e) {
          /*
            Masukan cacat memulangkan 400 (salah pengguna), bukan 500 (salah
            server) — dua hal yang menuntut tindakan berbeda. `hitungBarisSektor`
            melempar Error biasa dengan pesan yang sudah bisa dibaca orang.
          */
          return reply.status(400).send({ error: (e as Error).message })
        }

        /*
          `metode` tetap diisi supaya CHECK lama dan pembaca lama tak melihat
          kolom kosong. Dipetakan dari satuan hasil, bukan ditebak: m² → luas,
          m → panjang, unit/titik → panjang (cacah, tak berdimensi).
        */
        const metodeSetara = sk.satuan === 'm2' ? 'luas' : 'panjang'

        const { data: rowS, error: eS } = await request.db!
          .unsafe(
            'takeoff_dimensi',
            'Kepemilikan sudah diverifikasi dua tingkat tepat di atas: versi '
            + 'lewat skenarioIdsTenant, lalu item lewat estimate_version_id. '
            + 'Kategori C dengan rantai tiga tingkat (estimate_item_id → '
            + 'estimate_items → estimate_versions → scenarios.project_id) yang '
            + 'tak dijangkau viaProject.',
          )
          .insert({
            estimate_item_id: item.id,
            uraian: sk.uraian,
            metode: metodeSetara,
            sektor: sk.sektor,
            lokasi: sk.lokasi ?? null,
            panjang_m: b.panjang_m ?? null,
            lebar_m: b.lebar_m ?? null,
            tinggi_m: b.tinggi_m ?? null,
            jumlah: b.jumlah ?? 1,
            faktor: b.faktor ?? 1,
            kemiringan_derajat: b.kemiringan_derajat ?? null,
            cacah: b.cacah ?? null,
            bukaan: b.bukaan ?? null,
            hasil_volume: sk.volume,
            /*
              RINCIAN disimpan di `catatan`, dan itu bukan sekadar tempat
              kosong yang kebetulan cocok. `estimate_items.quantity` masuk
              sebagai angka jadi; sesudah masuk, volume yang benar dan yang
              salah ketik terlihat identik. Kalimat ini satu-satunya yang
              menjawab "kenapa volumenya segini?" tanpa membuka gambar.
            */
            catatan: [sk.rincian, ...sk.catatan, b.catatan].filter(Boolean).join(' · '),
            created_by: request.currentUser!.id,
          })
          .select('id').single()
        if (eS) return reply.status(500).send({ error: eS.message })

        void logAuditEvent(request, {
          tableName: 'takeoff_dimensi', recordId: rowS.id,
          action: 'cecep.takeoff_sektor_added',
          actorId: request.currentUser!.id,
          newValues: {
            item: item.id, uraian: sk.uraian, sektor: sk.sektor,
            hasil: sk.volume, bukaanM2: sk.bukaanM2,
          },
        })
        return reply.status(201).send({ id: rowS.id, ...sk })
      }

      // Hitung lewat lib PURE ber-golden-test — nol aritmetika ad-hoc di route,
      // pola yang sama dengan `computeRebarBar` di atas. `GalatTakeoff` dibedakan
      // dari galat lain supaya masukan cacat memulangkan 400 (salah pengguna),
      // bukan 500 (salah server) — dua hal yang menuntut tindakan berbeda.
      let line
      try {
        line = hitungBarisTakeoff({
          uraian: b.uraian ?? '', metode: b.metode as MetodeTakeoff,
          panjangM: b.panjang_m, lebarM: b.lebar_m, tinggiM: b.tinggi_m,
          jumlah: b.jumlah, faktor: b.faktor,
        })
      } catch (e) {
        if (e instanceof GalatTakeoff) return reply.status(400).send({ error: e.message })
        throw e
      }

      const { data: row, error } = await supabase
        .from('takeoff_dimensi')
        .insert({
          estimate_item_id: item.id, uraian: line.uraian, metode: line.metode,
          panjang_m: line.panjangM, lebar_m: line.lebarM, tinggi_m: line.tinggiM,
          jumlah: line.jumlah, faktor: line.faktor, hasil_volume: line.hasilVolume,
          catatan: b.catatan ?? null, created_by: request.currentUser!.id,
        })
        .select('id').single()
      if (error) return reply.status(500).send({ error: error.message })

      void logAuditEvent(request, {
        tableName: 'takeoff_dimensi', recordId: row.id, action: 'cecep.takeoff_dimensi_added',
        actorId: request.currentUser!.id,
        newValues: { item: item.id, uraian: line.uraian, metode: line.metode, hasil: line.hasilVolume },
      })
      return reply.status(201).send({ id: row.id, ...line })
    })

  // ── POST /terapkan — take-off MENGUSULKAN, manusia MENERAPKAN ───────────────
  //
  // KEPUTUSAN DESAIN, dibuat sadar (sama dengan header migrasi 431):
  // hasil take-off TIDAK menimpa `estimate_items.quantity` otomatis.
  //
  // Godaannya jelas — begitu p × l × t × n × faktor menghasilkan angka, tulis
  // saja supaya orang tak perlu menyalin. Alasan menolaknya ada pada RANTAI
  // yang diikuti `quantity`, diukur di berkas ini sendiri:
  //
  //     estimate_items.quantity
  //       → computeRabLineTotal(quantity, hspRounded)
  //       → estimate_items.amount
  //       → estimate_versions.total_amount
  //       → rantai approval estimate_versions
  //       → nilai kontrak, termin, dan progres yang ditagihkan
  //
  // Menimpa otomatis berarti: seseorang membetulkan satu angka panjang di layar
  // take-off, dan nilai kontrak yang sudah disepakati ikut bergeser tanpa ada
  // yang memutuskan apa pun. Tak ada galat, tak ada persetujuan, tak ada jejak —
  // hanya total yang berbeda dari kemarin. Dan progres lapangan yang sudah
  // dicatat terhadap volume lama TIDAK BISA dibuat ulang.
  //
  // Karena itu penerapan adalah rute TERSENDIRI yang: (a) menuntut versi masih
  // `draft`, (b) hanya jalan saat manusia menekan tombol, (c) meninggalkan
  // `volume_diterapkan` + `diterapkan_pada` + `diterapkan_oleh` sebagai jejak.
  //
  // Yang membuat pilihan ini tak menyusahkan: selisih antara `hasil_volume` dan
  // `volume_diterapkan` TETAP TERLIHAT di GET di atas. Take-off yang sudah
  // direvisi tapi belum diterapkan bukan keadaan tersembunyi — ia keadaan yang
  // ditampilkan, dan itu justru yang hilang kalau keduanya disamakan diam-diam.
  app.post<{ Params: { id: string; itemId: string } }>(
    '/api/v1/estimate-versions/:id/items/:itemId/takeoff-dimensi/terapkan',
    { preHandler: [authenticate, requirePermission('cecep:takeoff:manage')] },
    async (request, reply) => {
      const { id, itemId } = request.params
      const { data: v } = await supabase
        .from('estimate_versions').select('id, status').eq('id', id)
        .in('scenario_id', await skenarioIdsTenant(request)).maybeSingle()
      if (!v) return reply.status(404).send({ error: 'Estimate Version tidak ditemukan' })
      if (v.status !== 'draft') {
        // Justru inti keputusannya: versi yang sudah diajukan/disetujui adalah
        // angka yang sudah dipakai orang lain untuk memutuskan sesuatu.
        return reply.status(409).send({
          error: 'Volume hanya bisa diterapkan saat Estimate Version draft — versi ini sudah ' + v.status,
        })
      }

      const { data: item } = await supabase
        .from('estimate_items').select('id, quantity, amount, assembly_id')
        .eq('id', itemId).eq('estimate_version_id', id).maybeSingle()
      if (!item) return reply.status(404).send({ error: 'Item tidak ditemukan di versi ini' })

      const { data: rows, error: rowErr } = await supabase
        .from('takeoff_dimensi').select('id, metode, hasil_volume').eq('estimate_item_id', itemId)
      if (rowErr) return reply.status(500).send({ error: rowErr.message })
      if ((rows ?? []).length === 0) {
        return reply.status(422).send({ error: 'Belum ada baris take-off untuk item ini' })
      }

      const rekap = rekapTakeoff((rows ?? []).map(r => ({
        hasilVolume: Number(r.hasil_volume), metode: r.metode as MetodeTakeoff,
      })))
      if (rekap.satuan === null) {
        // Menjumlahkan m³ dengan m' menghasilkan angka yang tetap terlihat
        // seperti angka. Menolak di sini, bukan di UI: UI bisa dilewati.
        return reply.status(422).send({
          error: 'Baris take-off item ini bercampur satuan (m³/m²/m) — tak bisa dijumlahkan jadi satu volume',
        })
      }
      if (rekap.totalVolume <= 0) {
        return reply.status(422).send({ error: 'Total take-off harus > 0' })
      }

      // `amount` WAJIB ikut dihitung ulang. Memperbarui `quantity` saja
      // meninggalkan `amount` pada volume lama — dan itu adalah baris RAB yang
      // volumenya tak lagi cocok dengan rupiahnya, cacat yang tak menimbulkan
      // galat apa pun dan hanya ketahuan saat totalnya dipertanyakan.
      const hspLama = Number(item.quantity) > 0 ? Number(item.amount) / Number(item.quantity) : 0
      const amountBaru = computeRabLineTotal(rekap.totalVolume, hspLama)

      const { data: upd, error: updErr } = await supabase
        .from('estimate_items')
        .update({ quantity: rekap.totalVolume, amount: amountBaru })
        .eq('id', itemId).eq('estimate_version_id', id)
        .select('id').maybeSingle()
      if (updErr) return reply.status(500).send({ error: updErr.message })
      if (!upd) return reply.status(500).send({ error: 'Gagal menerapkan volume ke item' })

      // Jejak penerapan: bertiga atau tidak sama sekali (CHECK 431). Ini yang
      // membuat "volume RAB ini berasal dari take-off yang mana, diterapkan
      // siapa, kapan" bisa dijawab tanpa menebak.
      // `.select('id')` — dan hasilnya DIPERIKSA, bukan hanya `error`-nya.
      // `error` cuma terisi bila query-nya gagal; `.eq()` yang tak cocok dengan
      // satu baris pun memulangkan NOL BARIS tanpa galat apa pun. Di sini
      // akibatnya khas: `quantity` sudah bergerak ke volume baru, tapi jejak
      // "diterapkan oleh siapa, kapan" tak pernah tertulis — persis pertanyaan
      // yang ditanyakan orang saat angka RAB dipersoalkan, dan satu-satunya
      // saat ketiadaannya ketahuan.
      const saatIni = new Date().toISOString()
      const { data: jejak, error: jejakErr } = await supabase
        .from('takeoff_dimensi')
        .update({
          volume_diterapkan: rekap.totalVolume, diterapkan_pada: saatIni,
          diterapkan_oleh: request.currentUser!.id,
        })
        .eq('estimate_item_id', itemId)
        .select('id')
      if (jejakErr) return reply.status(500).send({ error: jejakErr.message })
      if (!jejak || jejak.length === 0) {
        return reply.status(500).send({ error: 'Volume diterapkan tetapi jejak penerapan gagal ditulis' })
      }

      // `error` DIPERIKSA, dan itu bukan formalitas penjaga: kalau pembacaan
      // ini gagal, `?? []` mengubah kegagalan jadi nol baris yang terlihat sah,
      // dan `total_amount` versi ini ditimpa 0 — estimasi yang isinya puluhan
      // juta mendadak bertotal nol, tanpa galat dan tanpa gejala.
      // Dinamai `sumTerapan` dengan alasan yang sama seperti `itemTakeoff` di
      // GET: nama `sums` sudah "tercemar" tiga pemakaian tanpa `error` di
      // berkas ini, dan penjaga melacak nama.
      const { data: sumTerapan, error: sumErr } = await supabase
        .from('estimate_items').select('amount').eq('estimate_version_id', id)
      if (sumErr) {
        return reply.status(500).send({ error: 'Gagal membaca ulang item untuk total: ' + sumErr.message })
      }
      const total = (sumTerapan ?? []).reduce((s, r) => s + Number(r.amount), 0)
      // Sama seperti jejak di atas: baris tersentuh IKUT diperiksa, bukan hanya
      // `error`. Kalau update ini menyentuh nol baris, `estimate_items` sudah
      // memakai volume baru sementara `total_amount` versi masih angka lama —
      // dan rekapitulasi yang tak lagi sama dengan jumlah barisnya adalah cacat
      // yang hanya ketahuan saat totalnya dipertanyakan orang lain.
      const { data: verUpd, error: totErr } = await supabase.from('estimate_versions')
        .update({ total_amount: total, updated_by: request.currentUser!.id })
        .eq('id', id).select('id').maybeSingle()
      if (totErr) {
        return reply.status(500).send({ error: 'Gagal memperbarui total estimasi: ' + totErr.message })
      }
      if (!verUpd) {
        return reply.status(500).send({ error: 'Total estimasi gagal diperbarui — nol baris tersentuh' })
      }

      // `severity: 'critical'` — ini satu-satunya jalur di mana take-off
      // menggerakkan angka yang mengalir ke nilai kontrak. Nilai lama IKUT
      // dicatat: tanpa `oldValues`, jejaknya hanya bisa menjawab "jadi berapa",
      // bukan "berubah dari berapa" — dan yang kedua itu yang ditanyakan.
      void logAuditEvent(request, {
        tableName: 'estimate_items', recordId: itemId, action: 'cecep.takeoff_diterapkan',
        actorId: request.currentUser!.id, severity: 'critical',
        oldValues: { quantity: Number(item.quantity), amount: Number(item.amount) },
        newValues: { quantity: rekap.totalVolume, amount: amountBaru, baris: rekap.jumlahBaris },
      })
      return reply.send({
        estimate_item_id: itemId,
        quantity_lama: Number(item.quantity), quantity_baru: rekap.totalVolume,
        amount_baru: amountBaru, satuan: rekap.satuan,
        baris_diterapkan: rekap.jumlahBaris, version_total: total,
      })
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
        // Hasil DIPERIKSA — lihat komentar pada pemanggilan serupa di bawah.
        const { error: totErr } = await supabase.from('estimate_versions')
          .update({ total_amount: total, updated_by: request.currentUser!.id }).eq('id', id)
        if (totErr) {
          return reply.status(500).send({ error: 'Gagal memperbarui total estimasi: ' + totErr.message })
        }

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
      // Hasil DIPERIKSA: kalau update total gagal (constraint, RLS, kolom
      // salah), item sudah tersimpan tapi `total_amount` tertinggal — estimasi
      // menampilkan angka yang lebih kecil daripada isinya, tanpa gejala.
      const { error: totErr } = await supabase.from('estimate_versions')
        .update({ total_amount: total, updated_by: request.currentUser!.id }).eq('id', id)
      if (totErr) {
        return reply.status(500).send({ error: 'Gagal memperbarui total estimasi: ' + totErr.message })
      }

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
      // Hasil DIPERIKSA: kalau update total gagal (constraint, RLS, kolom
      // salah), item sudah tersimpan tapi `total_amount` tertinggal — estimasi
      // menampilkan angka yang lebih kecil daripada isinya, tanpa gejala.
      const { error: totErr } = await supabase.from('estimate_versions')
        .update({ total_amount: total, updated_by: request.currentUser!.id }).eq('id', id)
      if (totErr) {
        return reply.status(500).send({ error: 'Gagal memperbarui total estimasi: ' + totErr.message })
      }

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
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
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

      // TJS-P4 — pengaju tak boleh menyetujui pengajuannya sendiri.
      const sod = await periksaGerbangSod(request, 'estimate_version', id, {
        alasanOverride: (request.body as { alasan_override?: string } | undefined)?.alasan_override,
        level: decision.step?.level,
      })
      if (!sod.ok) return reply.status(403).send({ error: sod.pesan })
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
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
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
      // Status LAMA ikut di WHERE: dua approval bersamaan tak boleh sama-sama
      // lolos ke write-back di bawah (TJS-A0, 2026-08-09).
      const { data: verApp, error } = await supabase.from('estimate_versions')
        .update({ status: 'approved', approved_by: user.id, updated_by: user.id })
        .eq('id', id).neq('status', 'approved').select('id').maybeSingle()
      if (error) return reply.status(500).send({ error: error.message })
      if (!verApp) {
        request.log.warn({ versiId: id }, 'approval versi estimasi serentak ditolak')
        return reply.status(409).send({
          error: 'Versi ini baru saja disetujui dari tempat lain. Muat ulang halaman.',
        })
      }

      void logAuditEvent(request, {
        tableName: 'estimate_versions', recordId: id, action: 'estimate.approved',
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
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
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
        actorId: user.id,
        newValues: { status: 'draft', reason: request.body?.reason ?? null },
        // `reason` DI KOLOMNYA SENDIRI, bukan hanya di dalam `newValues`.
        //
        // Diukur 2026-08-07: 636 `estimate.rejected` dan 624 `estimate.approved`
        // di basis, dan NOL di antaranya punya `reason` terisi — karena
        // alasannya dikubur di dalam JSON. Kolom `reason` ada justru supaya
        // pertanyaan "keputusan mana yang tak beralasan" bisa dijawab satu
        // kueri; menaruhnya di JSON membuat jawabannya SELALU "semuanya".
        //
        // `newValues` tetap memuatnya agar bentuk riwayat lama tak berubah.
        reason: request.body?.reason ?? undefined,
        severity: 'critical',
      })
      return reply.send({ ok: true, status: 'draft' })
    })
}
