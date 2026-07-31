import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { agregasiVarians, type CostCodeRef } from '../../lib/varians-cost-code.js'

// ============================================================
// ROADMAP #9 — Commitment & Varians per Cost Code.
//
// Migrasi 112 membangun ACL `cost_code_category_map` (category_id ↔ cost_code_id)
// dengan alasan yang dituliskan di berkasnya sendiri:
//
//   "Cost Control harus bisa membandingkan Actual Cost riil terhadap RAP
//    Baseline via Cost Code — tapi project_expenses/kasbons existing TIDAK PUNYA
//    kolom Cost Code. Tanpa ACL, Variance Calculation tak jalan."
//
// Tabelnya lahir ber-test (integritas FK, resolusi deterministik, rollup), tapi
// selama ini NOL endpoint memakainya dan isinya 0 baris. Modul ini yang membuat
// ACL itu berguna: mengisi peta, lalu membaca varians darinya.
//
// ── Kenapa COMMITMENT dipisah dari ACTUAL ──────────────────────────────────
// Ini inti nilai #9. Uang bocor ketahuan SETELAH keluar kalau yang dipantau
// hanya belanja terbayar. PO yang sudah diteken adalah kewajiban — uangnya
// belum keluar, tapi sudah tidak bisa dipakai untuk hal lain.
//
//   commitment = PO aktif (sent/confirmed/partially_received/fully_received)
//   actual     = project_expenses approved/paid + kasbons approved
//   exposure   = commitment + actual  ← angka yang sesungguhnya menentukan
//                                        apakah pagu akan terlampaui
//
// PO `cancelled` TIDAK dihitung: kewajibannya batal. PO `draft` juga tidak —
// belum diteken, belum mengikat siapa pun.
//
// ── Zero-Invention: nol tabel baru ─────────────────────────────────────────
// Seluruh angka read-model dari tabel yang sudah hidup. Tak ada trigger, tak ada
// kolom baru di tabel existing — batas yang sama yang migrasi 112 tetapkan.
// ============================================================

/** Status PO yang mengikat anggaran. `draft`/`cancelled` sengaja di luar. */
const PO_MENGIKAT = ['sent', 'confirmed', 'partially_received', 'fully_received']

/** Status belanja yang sudah menjadi biaya nyata. */
const EXPENSE_TERPAKAI = ['approved', 'paid']

export default async function costControlRoutes(app: FastifyInstance) {
  // ── GET /cost-codes — registry untuk dropdown pemetaan ────────────────────
  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/cost-codes',
    { preHandler: [authenticate, requirePermission('cecep:cost_code:view')] },
    async (request, reply) => {
      let q = supabase
        .from('cost_codes')
        .select('id, code, name, description, category, status')
        .order('code')
        .limit(500)

      // Default menyertakan draft: 43 dari 44 cost code di dev masih draft, dan
      // menyembunyikannya membuat halaman pemetaan tampak kosong tanpa sebab.
      if (request.query.status) q = q.eq('status', request.query.status)

      const { data, error } = await q
      if (error) return reply.status(500).send({ error: error.message })
      return reply.send({ data: data ?? [] })
    })

  // ── GET /projects/:projectId/cost-map — peta kategori → cost code ─────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/cost-map',
    { preHandler: [authenticate, requirePermission('cecep:cost_map:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // Kategori proyek + pemetaannya (kalau ada). LEFT-join disengaja: yang
      // BELUM dipetakan justru informasi utamanya — itulah daftar kerja pengguna.
      const { data: kategori, error } = await request.db!
        .viaProject('project_expense_categories', projectId)
        .select('id, name, type')
        .order('name')
      if (error) return reply.status(500).send({ error: error.message })

      const ids = (kategori ?? []).map((k) => k.id)
      const peta = ids.length
        ? (await supabase
            .from('cost_code_category_map')
            .select('category_id, cost_code_id, cost_codes(id, code, name, status)')
            .in('category_id', ids)).data ?? []
        : []
      const petaPer = new Map(peta.map((p) => [p.category_id, p]))

      const data = (kategori ?? []).map((k) => {
        const m = petaPer.get(k.id)
        return {
          category_id: k.id,
          category_name: k.name,
          type: k.type ?? null,
          cost_code: (m?.cost_codes as unknown as { id: string; code: string; name: string; status: string } | null) ?? null,
        }
      })

      return reply.send({
        data,
        belum_dipetakan: data.filter((d) => !d.cost_code).length,
      })
    })

  // ── PUT /cost-map/:categoryId — set / ganti pemetaan ──────────────────────
  app.put<{ Params: { categoryId: string }; Body: { cost_code_id: string | null } }>(
    '/api/v1/cost-map/:categoryId',
    { preHandler: [authenticate, requirePermission('cecep:cost_map:manage')] },
    async (request, reply) => {
      const { categoryId } = request.params
      const costCodeId = request.body?.cost_code_id ?? null

      // Gerbang tenancy: kategori milik proyek lain tak boleh disentuh.
      const { data: kat } = await supabase
        .from('project_expense_categories')
        .select('id, name, project_id')
        .eq('id', categoryId)
        .maybeSingle()
      if (!kat || !(await proyekMilikTenant(request, kat.project_id))) {
        return reply.status(404).send({ error: 'Kategori tidak ditemukan' })
      }

      const { data: lama } = await supabase
        .from('cost_code_category_map')
        .select('id, cost_code_id')
        .eq('category_id', categoryId)
        .maybeSingle()

      // cost_code_id null = LEPASKAN pemetaan. Dibedakan dari "tidak dikirim"
      // supaya pengguna bisa membatalkan salah-petakan tanpa menghapus kategori.
      if (costCodeId === null) {
        if (lama) {
          await supabase.from('cost_code_category_map').delete().eq('id', lama.id)
          await logAuditEvent(request, {
            tableName: 'cost_code_category_map', recordId: lama.id,
            action: 'cecep.cost_map_dilepas',
            actorId: request.currentUser!.id,
            oldValues: { category: kat.name, cost_code_id: lama.cost_code_id },
          })
        }
        return reply.send({ data: null, dilepas: Boolean(lama) })
      }

      const { data: cc } = await supabase
        .from('cost_codes').select('id, code, name').eq('id', costCodeId).maybeSingle()
      if (!cc) return reply.status(400).send({ error: 'Cost Code tidak ditemukan' })

      // UNIQUE(category_id) di DB menjamin satu kategori → satu cost code
      // (migrasi 112: "resolusi deterministik"). Upsert menghormati itu, bukan
      // melawannya dengan menyisipkan baris kedua.
      const { data, error } = await supabase
        .from('cost_code_category_map')
        .upsert(
          { category_id: categoryId, cost_code_id: costCodeId,
            updated_by: request.currentUser!.id,
            ...(lama ? {} : { created_by: request.currentUser!.id }) },
          { onConflict: 'category_id' })
        .select('id, category_id, cost_code_id')
        .single()
      if (error) return reply.status(500).send({ error: error.message })

      await logAuditEvent(request, {
        tableName: 'cost_code_category_map', recordId: data.id,
        action: lama ? 'cecep.cost_map_diubah' : 'cecep.cost_map_dibuat',
        actorId: request.currentUser!.id,
        oldValues: lama ? { cost_code_id: lama.cost_code_id } : null,
        newValues: { category: kat.name, cost_code: cc.code },
      })
      return reply.send({ data })
    })

  // ── GET /projects/:projectId/varians — pagu vs commitment vs actual ───────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/varians',
    { preHandler: [authenticate, requirePermission('cecep:cost_map:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // ── 1. Peta kategori → cost code ───────────────────────────────────
      // Hanya `id` yang dibutuhkan: nama kategori tak muncul di laporan varians
      // (baris dikelompokkan per cost code, bukan per kategori).
      const { data: kategori } = await request.db!
        .viaProject('project_expense_categories', projectId)
        .select('id')
      const katIds = (kategori ?? []).map((k) => k.id)

      const peta = katIds.length
        ? (await supabase
            .from('cost_code_category_map')
            .select('category_id, cost_code_id, cost_codes(id, code, name, status)')
            .in('category_id', katIds)).data ?? []
        : []
      const katKeCc = new Map(peta.map((p) => [p.category_id, p]))

      // ── 2. Realisasi: belanja proyek + kasbon ──────────────────────────
      const { data: expenses } = await request.db!
        .viaProject('project_expenses', projectId)
        .select('category_id, total_amount, status')
        .in('status', EXPENSE_TERPAKAI)

      // ── 3. Commitment: PO yang mengikat ────────────────────────────────
      // PO tidak punya category_id; jalurnya lewat item → material. Karena
      // pemetaan material↔cost code BELUM ada (lihat DISCOVERY-RAP-VS-REALISASI),
      // commitment dilaporkan sebagai TOTAL PROYEK, bukan per cost code.
      // Menaruhnya di baris cost code mana pun = menebak, dan tebakan di angka
      // uang adalah kegagalan yang tak berbunyi.
      const { data: po } = await request.db!
        .viaProject('purchase_orders', projectId)
        .select('id, total_amount, status')
        .in('status', PO_MENGIKAT)
      const commitmentTotal = (po ?? []).reduce((s, p) => s + (Number(p.total_amount) || 0), 0)

      // ── 4. Pagu RAP terkunci per cost code ─────────────────────────────
      // RAP menyimpan pagu per RESOURCE, bukan per cost code. Selama jembatan
      // resource↔cost_code belum ada (DISCOVERY-RAP-VS-REALISASI.md), pagu
      // per-baris tak bisa diisi jujur — maka peta ini sengaja kosong, dan
      // `agregasiVarians` melaporkan variance `null` (= belum diketahui),
      // bukan angka yang membuat semua baris tampak jebol.
      const paguPerCc = new Map<string, number>()

      // ── 5. Rakit baris varians ─────────────────────────────────────────
      // Aritmetikanya di lib/varians-cost-code.ts — murni dan ber-test (12 test,
      // termasuk invariant "nol rupiah hilang" dan "belanja tak terpetakan tetap
      // muncul"). Route hanya mengambil data dan menyerahkan hitungannya.
      const katKeCcRingkas = new Map<string, CostCodeRef>()
      for (const [katId, m] of katKeCc) {
        const cc = m.cost_codes as unknown as CostCodeRef | null
        if (cc) katKeCcRingkas.set(katId, cc)
      }

      const baris = agregasiVarians(
        (expenses ?? []).map((e) => ({
          category_id: e.category_id, total_amount: e.total_amount,
        })),
        katKeCcRingkas,
        paguPerCc,
      )
      const totalActual = baris.reduce((s, b) => s + b.actual, 0)
      const belumDipetakan = baris.find((b) => b.cost_code_id === null)

      return reply.send({
        data: baris,
        meta: {
          total_actual: totalActual,
          commitment_total: commitmentTotal,
          exposure_total: totalActual + commitmentTotal,
          jumlah_po_mengikat: (po ?? []).length,
          kategori_total: katIds.length,
          kategori_dipetakan: peta.length,
          actual_belum_dipetakan: belumDipetakan?.actual ?? 0,
          // Dinyatakan eksplisit supaya pembaca API tak menyimpulkan sendiri
          // bahwa angka pagu/commitment per baris memang seharusnya kosong.
          batas: {
            pagu_per_cost_code: 'belum tersedia — RAP menyimpan pagu per resource, jembatan resource↔cost_code belum ada (lihat CECEP/DISCOVERY-RAP-VS-REALISASI.md)',
            commitment_per_cost_code: 'belum tersedia — PO menunjuk material, jembatan material↔cost_code belum ada; commitment dilaporkan sebagai total proyek',
          },
        },
      })
    })
}
