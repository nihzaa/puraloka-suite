import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { analisaProyek, ringkasPortofolio, urutkanPerhatian, type BarisProyek } from '../../lib/cost-analytics.js'
import { agregasiVarians, type CostCodeRef } from '../../lib/varians-cost-code.js'
import { sarankanPemetaan } from '../../lib/saran-cost-map.js'
import { rangkumBelanjaAktual, type BarisSumber } from '../../lib/belanja-aktual.js'
import { ringkasCvr, type BarisScope } from '../../lib/cvr.js'

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

/**
 * Status belanja yang sudah menjadi biaya nyata.
 *
 * ⚠️ Sebelum 2026-08-01 daftar ini berisi `['approved','paid']`. Enum
 * `expense_status` hanya punya draft/submitted/approved/rejected — **tak ada
 * 'paid'**, jadi nilai itu tak pernah cocok apa pun. Hasilnya kebetulan benar,
 * tapi polanya menyesatkan: ia mengajarkan bahwa 'paid' adalah status yang sah,
 * dan penyalinan berikutnya bisa memakainya di tempat yang berakibat.
 *
 * Diverifikasi ke `pg_enum`, bukan disalin dari kode yang ada.
 */
const EXPENSE_TERPAKAI = ['approved']

export default async function costControlRoutes(app: FastifyInstance) {
  // ── GET /cost-codes — registry untuk dropdown pemetaan ────────────────────
  // ── GET /api/v1/cost-analytics/portfolio ───────────────────────────────
  // Agregasi biaya LINTAS PROYEK (ROADMAP #18).
  //
  // Semua laporan yang ada bersifat per-proyek. Yang tak bisa dijawab:
  // "dari 15 proyek, mana yang paling menggerus margin?" — dan tanpa itu
  // pemilik tak bisa memutuskan di mana harus turun tangan.
  //
  // ⚠️ Respons WAJIB membawa `meta.keterbatasan`. ROADMAP #18 menuliskan
  // syaratnya sendiri: dashboard ini harus menyatakan EKSPLISIT bahwa
  // angkanya belum diadu ke realisasi belanja per-material (§D7 masih
  // terkunci — pemetaan resource↔material baru cocok 0,1%). Angka yang
  // terlihat rapi tanpa peringatan mengundang keputusan yang datanya belum
  // sanggup menopang.
  app.get(
    '/api/v1/cost-analytics/portfolio',
    { preHandler: [authenticate, requirePermission('reports:view')] },
    async (request, reply) => {
      // Seluruh query lewat wrapper — daftar proyek pun sudah ter-scope tenant.
      const { data: proyek, error } = await request.db!
        .from('projects')
        .select('id, name, status, contract_value, progress_pct')
        .eq('is_deleted', false)
        .order('name')

      if (error) {
        request.log.error({ err: error }, 'gagal memuat portofolio')
        return reply.status(500).send({ error: 'Gagal memuat analitik biaya' })
      }

      const ids = (proyek ?? []).map((p: { id: string }) => p.id)
      if (ids.length === 0) {
        return reply.send({ data: [], meta: ringkasPortofolio([]) })
      }

      // Tiga sumber, diambil sekaligus lalu diagregasi di memori. Dipilih
      // begitu karena jumlah proyek puluhan, bukan ribuan — dan satu query
      // per proyek akan jadi N+1 yang menyakitkan begitu portofolio tumbuh.
      /*
       * ⚠️ `db.unsafe()`, BUKAN `db.from()` — dan ini perbaikan cacat, bukan
       * pelonggaran.
       *
       * Ketiga tabel di bawah berkategori C (tenancy diwarisi lewat project),
       * dan `db.from()` MENOLAKNYA di titik `from()`. Akibatnya endpoint ini
       * selalu 500 sejak ditulis:
       *
       *   TenantDbError: 'rab_items' mewarisi tenancy lewat project —
       *   pakai db.viaProject('rab_items', projectId).
       *
       * `viaProject()` pun tak berlaku: ia menuntut SATU projectId, sementara
       * ini layar LINTAS-PROYEK. Jadi pintu yang sah adalah `unsafe()` dengan
       * alasan tercatat — pola yang sama dipakai `/dashboard/fokus`,
       * `/dashboard/deret`, dan `/ai/insight`.
       *
       * Saringannya sendiri SUDAH benar sejak awal (`.in('project_id', ids)`,
       * dan `ids` berasal dari query projects yang sudah ter-scope tenant di
       * atas) — yang salah cuma jalurnya. Cacat ini tak pernah tertangkap test
       * karena tak ada test yang memanggil endpointnya.
       */
      const ALASAN = 'analitik biaya lintas-proyek milik company; sudah disaring .in(project_id, ids) dari query projects ter-scope tenant di atas'

      const [rabRes, rapRes, expRes] = await Promise.all([
        request.db!.unsafe('rab_items', ALASAN)
          .select('project_id, total_price, level')
          .in('project_id', ids).eq('level', 'category'),
        request.db!.unsafe('rap_budget', ALASAN)
          .select('id, project_id, status, rap_material_line(pagu), rap_labor_line(borongan_value)')
          .in('project_id', ids).eq('status', 'locked'),
        request.db!.unsafe('project_expenses', ALASAN)
          .select('project_id, total_amount')
          .in('project_id', ids).eq('status', 'approved'),
      ])

      /*
        Ketiga hasil DIPERIKSA, dan itu bukan formalitas.

        Bentuk pertama hanya membaca `.data` dari ketiganya dan tak pernah
        menyentuh `.error`. Query yang gagal memulangkan `data: null`, dan
        `?? []` di `jumlahkan()` mengubahnya jadi peta kosong — yang artinya
        RAB nol, pagu nol, serapan nol.

        Akibatnya bukan galat melainkan LAPORAN YANG SALAH: tiap proyek muncul
        dengan `serapanPct` 0% dan `dasarPembanding: 'tak_ada'`, dan layar
        Portofolio Biaya menampilkannya seperti perusahaan yang belum
        membelanjakan apa pun. Tak ada satu pun tanda bahwa datanya gagal
        dibaca.

        Ditemukan saat meriset otomasi 2.9 yang hendak memakai endpoint ini
        sebagai sumbernya — bukan oleh siapa pun yang membuka layarnya.

        DILEMPAR sebagai 500, bukan diteruskan dengan nol: laporan biaya yang
        mati ketahuan, laporan biaya yang bohong dipakai mengambil keputusan.
      */
      for (const [nama, res] of [
        ['RAB', rabRes], ['pagu RAP', rapRes], ['pengeluaran', expRes],
      ] as const) {
        if (res.error) {
          request.log.error({ err: res.error, bagian: nama }, 'cost-analytics: gagal membaca')
          return reply.status(500).send({
            error: `Gagal membaca ${nama} — angka portofolio tak bisa dipercaya.`,
          })
        }
      }

      const jumlahkan = <T,>(rows: T[] | null, key: keyof T, val: (r: T) => number) => {
        const m = new Map<string, number>()
        for (const r of rows ?? []) {
          const k = String(r[key])
          m.set(k, (m.get(k) ?? 0) + val(r))
        }
        return m
      }

      const rabPer = jumlahkan(rabRes.data as { project_id: string; total_price: number }[] | null,
        'project_id', (r) => Number(r.total_price ?? 0))
      const expPer = jumlahkan(expRes.data as { project_id: string; total_amount: number }[] | null,
        'project_id', (r) => Number(r.total_amount ?? 0))

      type RapRow = {
        project_id: string
        rap_material_line?: { pagu: number | string }[]
        rap_labor_line?: { borongan_value: number | string }[]
      }
      const rapPer = new Map<string, number>()
      for (const r of (rapRes.data ?? []) as RapRow[]) {
        const total = (r.rap_material_line ?? []).reduce((s, x) => s + Number(x.pagu ?? 0), 0)
          + (r.rap_labor_line ?? []).reduce((s, x) => s + Number(x.borongan_value ?? 0), 0)
        rapPer.set(r.project_id, (rapPer.get(r.project_id) ?? 0) + total)
      }

      const baris: BarisProyek[] = (proyek ?? []).map((p: {
        id: string; name: string; status: string
        contract_value: number | null; progress_pct: number | null
      }) => ({
        projectId: p.id,
        nama: p.name,
        status: p.status,
        contractValue: Number(p.contract_value ?? 0),
        rabValue: rabPer.get(p.id) ?? 0,
        paguRAP: rapPer.get(p.id) ?? 0,
        serapan: expPer.get(p.id) ?? 0,
        progressPct: Number(p.progress_pct ?? 0),
      }))

      const hasil = urutkanPerhatian(baris.map(analisaProyek))
      return reply.send({ data: hasil, meta: ringkasPortofolio(hasil) })
    },
  )

  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/cost-codes',
    { preHandler: [authenticate, requirePermission('cecep:cost_code:view')] },
    async (request, reply) => {
      // `shared`: `cost_codes` kategori AB — katalog bersama lintas tenant.
      let q = request.db!
        .shared('cost_codes')
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
      // `unsafe` beralasan — alasan sama dengan di endpoint /varians:
      // tabel ini kategori C `lewat: category_id`, jadi viaProject akan
      // menyaring dengan id yang salah jenis. Tenancy dijamin oleh `ids`.
      const peta = ids.length
        ? (await request.db!
            .unsafe('cost_code_category_map',
              'disaring lewat ids kategori yang sudah ber-scope tenant via viaProject')
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

  // ── GET /projects/:projectId/belanja-aktual ──────────────────────────────
  //
  // Biaya yang SUNGGUH keluar, disatukan dari tabel tempat ia benar-benar
  // tercatat.
  //
  // ── Cacat yang ditutup, diukur 2026-08-08
  //
  //   upah mingguan `paid`      43 baris   Rp 243.600.100
  //   faktur supplier            5 baris   Rp  50.485.000
  //   PO (komitmen)              8 baris   Rp  11.095.000
  //   `project_expenses`         0 baris   Rp           0  ← dipakai laporan
  //
  // Seluruh laporan biaya membaca `project_expenses`, dan tabel itu NOL BARIS.
  // Tab Varians menampilkan "Belanja aktual Rp 0" di sebelah "Commitment
  // Rp 11.095.000" — bukan karena belum ada belanja, melainkan karena melihat
  // ke tabel yang salah. Hampir Rp 300 juta tak masuk laporan mana pun.
  //
  // ── Kenapa endpoint BARU, bukan mengubah varians per-cost-code
  //
  // Varians per cost code sengaja melaporkan `null` untuk baris yang jembatan
  // resource↔cost_code-nya belum ada — dan itu keputusan yang benar
  // (`DISCOVERY-RAP-VS-REALISASI.md`). Upah dan faktur TIDAK punya cost code
  // sama sekali, jadi menaruhnya di baris cost code mana pun adalah menebak.
  //
  // Endpoint ini menjawab pertanyaan yang berbeda dan bisa dijawab jujur:
  // "berapa yang sudah keluar di proyek ini, seluruhnya?" — tanpa mengklaim
  // tahu ke cost code mana ia jatuh.
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/belanja-aktual',
    { preHandler: [authenticate, requirePermission('projects:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // ⚠️ `viaProject('weekly_wage_reports', projectId)` SALAH — dan salahnya
      // tak berbunyi.
      //
      // Peta tenancy mendaftarkannya `lewat: 'assignment_id'`, sehingga
      // `viaProject` menyusun `.eq('assignment_id', projectId)` — membandingkan
      // id penugasan dengan id proyek. Dua jenis id berbeda: **nol baris,
      // tanpa satu pun error.** Rp 243 juta upah hilang dari laporan sambil
      // terlihat seperti "memang belum ada upah".
      //
      // Bug yang sama sudah pernah ditemukan 2026-07-30 di `rap.ts:102`
      // (`estimate_items` diberi `projectId`), didokumentasikan panjang di
      // sana, dan **terulang di sini** karena tak ada penjaga yang
      // mencegahnya. Test `belanja-aktual-endpoint.test.ts` yang menangkapnya:
      // `jumlah_baris.upah` nol padahal barisnya baru saja disisipkan.
      //
      // Yang benar: kumpulkan id penugasan lebih dulu dari sisi yang MEMANG
      // ber-scope proyek, lalu saring dengan itu.
      const { data: penugasan, error: ePen } = await request.db!
        .viaProject('mandor_assignments', projectId)
        .select('id')
      if (ePen) return reply.status(500).send({ error: ePen.message })
      const idPenugasan = (penugasan as { id: string }[]).map((x) => x.id)

      // `supplier_invoices` kategori B (punya `company_id` langsung), jadi ia
      // memakai `.from()` lalu disaring `project_id` — bukan `viaProject`,
      // yang hanya untuk kategori C.
      const [upahRes, fakturRes, belanjaRes, poRes] = await Promise.all([
        idPenugasan.length > 0
          ? request.db!
              .unsafe('weekly_wage_reports',
                'disaring lewat idPenugasan yang sudah ber-scope tenant via viaProject(mandor_assignments)')
              .select('id, net_amount, status')
              .in('assignment_id', idPenugasan)
          : Promise.resolve({ data: [], error: null }),
        request.db!.from('supplier_invoices')
          .select('id, total_amount, status')
          .eq('project_id', projectId),
        request.db!.viaProject('project_expenses', projectId)
          .select('id, total_amount, status'),
        request.db!.viaProject('purchase_orders', projectId)
          .select('id, total_amount, status'),
      ])

      for (const r of [upahRes, fakturRes, belanjaRes, poRes]) {
        if (r.error) return reply.status(500).send({ error: r.error.message })
      }

      type Nilai = { id: string; net_amount?: unknown; total_amount?: unknown; status: string }
      const petakan = (rows: unknown, sumber: BarisSumber['sumber'], kolom: 'net_amount' | 'total_amount') =>
        (rows as Nilai[]).map((r) => ({
          sumber, nilai: r[kolom] as number | string | null, status: r.status, ref: r.id,
        }))

      const hasil = rangkumBelanjaAktual([
        ...petakan(upahRes.data, 'upah', 'net_amount'),
        ...petakan(fakturRes.data, 'faktur', 'total_amount'),
        ...petakan(belanjaRes.data, 'belanja', 'total_amount'),
        ...petakan(poRes.data, 'po', 'total_amount'),
      ])

      return reply.send({
        ...hasil,
        // Jumlah baris per sumber dibawa supaya "Rp 0" bisa dibedakan:
        // nol dari nol baris = belum ada apa-apa; nol dari 5 baris = semuanya
        // berstatus yang tak dihitung. Dua keadaan yang menuntut tindakan
        // berbeda.
        jumlah_baris: {
          upah: (upahRes.data as unknown[]).length,
          faktur: (fakturRes.data as unknown[]).length,
          belanja: (belanjaRes.data as unknown[]).length,
          po: (poRes.data as unknown[]).length,
        },
      })
    },
  )

  // ── GET /projects/:projectId/cvr ─────────────────────────────────────────
  //
  // Cost Value Reconciliation — biaya terpakai vs NILAI TERPASANG, per scope
  // borongan mandor.
  //
  // ── Kenapa per SCOPE, bukan per cost code
  //
  // CVR adalah 🔴 terakhir di taksonomi yang bukan "jangan dibangun", dan
  // ditunda 2026-08-07 dengan alasan yang benar saat itu: sisi biaya kosong.
  // Diukur ulang 2026-08-08, separuh alasannya sudah tidak berlaku:
  //
  //   sisi BIAYA           ✅ Rp 168 juta terbukti (`belanja-aktual`)
  //   per COST CODE        ❌ `work_scopes.rab_category_id` 0 dari 20
  //   per SCOPE BORONGAN   ✅ `weekly_wage_reports.scope_id` 50/50 terisi
  //
  // Yang dibangun karena itu adalah CVR yang bisa dijawab JUJUR hari ini.
  // Ruang lingkupnya dibawa di `meta.cakupan` dan WAJIB ditampilkan — pembaca
  // yang mengira ini mencakup seluruh biaya proyek akan salah menyimpulkan,
  // dan salahnya di angka untung-rugi.
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/cvr',
    { preHandler: [authenticate, requirePermission('reports:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // Rantainya: work_scopes → mandor_assignments → projects.
      // `viaProject('work_scopes', projectId)` SALAH — petanya menyatakan
      // `lewat: 'assignment_id'`, jadi ia akan menyusun
      // `.eq('assignment_id', <uuid proyek>)`: nol baris tanpa error.
      // Dijaga `audit-viaproject-argumen.mjs` sejak 2026-08-08.
      const { data: penugasan, error: ePen } = await request.db!
        .viaProject('mandor_assignments', projectId)
        .select('id')
      if (ePen) return reply.status(500).send({ error: ePen.message })
      const idPenugasan = (penugasan as { id: string }[]).map((x) => x.id)

      if (idPenugasan.length === 0) {
        return reply.send({
          baris: [], total_nilai_terpasang: 0, total_terpakai: 0, total_selisih: 0,
          terpakai_harian: 0,
          jumlah_rugi: 0, jumlah_tanpa_biaya: 0, jumlah_tak_berlaku: 0,
          meta: { cakupan: 'upah borongan mandor', jumlah_scope: 0 },
        })
      }

      const [scopeRes, upahRes] = await Promise.all([
        request.db!
          .unsafe('work_scopes',
            'disaring lewat idPenugasan yang sudah ber-scope tenant via viaProject(mandor_assignments)')
          .select('id, scope_name, borongan_value, borongan_value_override, progress_pct_done, rab_category_id')
          .in('assignment_id', idPenugasan),
        request.db!
          .unsafe('weekly_wage_reports',
            'disaring lewat idPenugasan yang sudah ber-scope tenant via viaProject(mandor_assignments)')
          .select('scope_id, net_amount, status')
          .in('assignment_id', idPenugasan),
      ])
      for (const r of [scopeRes, upahRes]) {
        if (r.error) return reply.status(500).send({ error: r.error.message })
      }

      // Hanya upah `paid` yang dihitung — aturan yang SAMA dengan
      // `belanja-aktual.ts`. Dua angka biaya yang berbeda di dua layar untuk
      // proyek yang sama adalah cara tercepat kehilangan kepercayaan pemakai.
      type Upah = { scope_id: string | null; net_amount: unknown; status: string }
      const perScope = new Map<string, { total: number; n: number }>()
      for (const u of upahRes.data as Upah[]) {
        if (u.status !== 'paid' || !u.scope_id) continue
        const n = Number(u.net_amount)
        const kini = perScope.get(u.scope_id) ?? { total: 0, n: 0 }
        // NaN dilewati, bukan dijumlahkan — satu baris meracuni seluruh scope.
        perScope.set(u.scope_id, {
          total: kini.total + (Number.isFinite(n) ? n : 0),
          n: kini.n + 1,
        })
      }

      type Scope = {
        id: string; scope_name: string
        borongan_value: unknown; borongan_value_override: unknown
        progress_pct_done: unknown
        rab_category_id: string | null
      }
      const baris: BarisScope[] = (scopeRes.data as Scope[]).map((sc) => {
        const pakai = perScope.get(sc.id) ?? { total: 0, n: 0 }
        return {
          scope_id: sc.id,
          scope_name: sc.scope_name,
          // `override` menang bila ada: itulah nilai yang benar-benar
          // disepakati, dan `borongan_value` jadi angka rencana yang tertinggal.
          borongan_value: (sc.borongan_value_override ?? sc.borongan_value) as number | string | null,
          progress_pct: sc.progress_pct_done as number | string | null,
          terpakai: pakai.total,
          jumlah_laporan: pakai.n,
          rab_category_id: sc.rab_category_id,
        }
      })

      const hasil = ringkasCvr(baris)
      return reply.send({
        ...hasil,
        meta: {
          // Cakupan DINYATAKAN, bukan disamarkan. Ini CVR upah borongan —
          // material dan faktur supplier belum bisa dipecah per scope.
          cakupan: 'upah borongan mandor',
          keterbatasan:
            'Hanya upah borongan. Material dan faktur supplier belum bisa dipecah ' +
            'per pekerjaan karena tak menyimpan cost code — lihat F5-1 §PEMBEDA CVR.',
          jumlah_scope: baris.length,
        },
      })
    },
  )

  // ── GET /projects/:projectId/cost-map/saran — USULKAN, jangan terapkan ────
  //
  // ══════════════════════════════════════════════════════════════════════════
  // KENAPA ENDPOINT INI ADA
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Diukur 2026-08-08: `cost_code_category_map` **nol baris**, padahal
  // endpoint dan UI-nya sudah ada berbulan-bulan. Peta kosong itu memblokir
  // tiga hal sekaligus:
  //
  //   • CVR tak punya cara menghubungkan pengeluaran ke cost code — dan
  //     itulah alasan taksonomi menandainya "tertunda, data belum ada"
  //   • varians per cost code kehilangan sisi "aktual"
  //   • impor BOQ → RFQ mustahil: BOQ menghasilkan cost_code_id, RFQ butuh
  //     material_id, dan peta inilah satu-satunya jembatan
  //
  // Mengisi sepuluh baris bukan pekerjaan besar. Tapi tak seorang pun
  // melakukannya, dan itu sendiri informasi: layar berisi sepuluh dropdown
  // kosong tanpa petunjuk adalah pekerjaan rumah, bukan alat.
  //
  // ── Kenapa GET, dan kenapa ia TIDAK MENULIS apa pun
  //
  // Pemetaan ini menentukan ke cost code mana sebuah biaya jatuh, dan itu
  // mengalir ke laporan varians yang dipakai menilai untung-rugi proyek.
  // Tebakan mesin yang diterapkan diam-diam menghasilkan laporan yang terlihat
  // benar dan salah di tempat yang tak seorang pun periksa.
  //
  // Karena itu: `GET`, permission `view` (bukan `manage`), dan hasilnya usulan
  // bersama SKORNYA. Yang menulis tetap `PUT /cost-map/:categoryId`, satu per
  // satu, atas keputusan manusia.
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/cost-map/saran',
    { preHandler: [authenticate, requirePermission('cecep:cost_map:view')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: kategori, error: eKat } = await request.db!
        .viaProject('project_expense_categories', projectId)
        .select('id, name')
        .order('name')
      if (eKat) return reply.status(500).send({ error: eKat.message })

      // Cadangan-array-kosong sengaja TIDAK dipakai di sini.
      //
      // `audit-kegagalan-senyap.mjs` menandai pola itu, dan ia benar meski
      // `error` sudah diperiksa di atas: bentuk tersebut melatih pembaca
      // berikutnya menyalin sesuatu yang MENYAMARKAN kegagalan jadi "nol
      // baris". Errornya sudah membalas 500 beberapa baris di atas, jadi
      // nilainya pasti array — cukup nyatakan itu lewat tipe, jangan tulis
      // pagar yang tak menjaga apa pun tapi mengajarkan pola yang salah.
      //
      // (Komentar ini pun sempat memerahkan penjaga karena mengutip polanya
      // secara harfiah. Penjaga tak membedakan komentar dari kode — dan itu
      // pilihan yang benar: komentar yang mengutip pola berbahaya adalah
      // tempat paling mudah untuk menyalinnya kembali.)
      const daftarKategori = kategori as { id: string; name: string }[]
      const ids = daftarKategori.map((k) => k.id)
      if (ids.length === 0) return reply.send({ saran: [], jumlah_kategori: 0 })

      // Yang SUDAH dipetakan dilewati — saran yang menimpa keputusan manusia
      // adalah saran yang merusak.
      const { data: peta, error: ePeta } = await request.db!
        .unsafe('cost_code_category_map',
          'disaring lewat ids kategori yang sudah ber-scope tenant via viaProject')
        .select('category_id')
        .in('category_id', ids)
      if (ePeta) return reply.status(500).send({ error: ePeta.message })

      // `shared`, bukan `from`: `cost_codes` kategori AB — katalog bersama
      // lintas tenant, sama seperti endpoint `/cost-codes` di atas. Memakai
      // `from` akan menyaringnya dengan company_id yang tak ada di tabel itu.
      //
      // ── Yang DIBUANG hanya `deprecated`, bukan "selain active"
      //
      // Percobaan pertama menyaring `status = 'active'`. Diukur ke basis:
      // **nol cost code berstatus active** — 43 dari 44 masih `draft`, satu
      // `deprecated`. Hasilnya endpoint mengembalikan nol saran untuk 12
      // kategori yang jelas punya padanan, dan test-nya merah.
      //
      // Lifecycle-nya `draft → active → deprecated` (migrasi 102), dan
      // registry ini memang belum pernah diaktifkan. Endpoint `/cost-codes`
      // yang mengisi dropdown UI pun tak menyaring status sama sekali —
      // menyaring lebih ketat di sini berarti menyarankan dari daftar yang
      // lebih sempit daripada yang boleh dipilih manusia, dan itu
      // membingungkan tanpa alasan.
      //
      // `deprecated` tetap dibuang: menyarankan kode yang sudah dipensiunkan
      // berarti mengarahkan biaya baru ke pekerjaan yang tak dipakai lagi.
      const { data: cc, error: eCc } = await request.db!
        .shared('cost_codes')
        .select('id, code, name')
        .neq('status', 'deprecated')
        .order('code')
      if (eCc) return reply.status(500).send({ error: eCc.message })

      const daftarPeta = peta as { category_id: string }[]
      const daftarCc = cc as { id: string; code: string; name: string }[]

      const saran = sarankanPemetaan(
        daftarKategori,
        daftarCc,
        { sudahDipetakan: daftarPeta.map((p) => p.category_id) },
      )

      return reply.send({
        saran,
        jumlah_kategori: ids.length,
        sudah_dipetakan: daftarPeta.length,
        // Dinyatakan, bukan disembunyikan: yang TAK disarankan adalah daftar
        // kerja yang tetap manual, dan pemakainya berhak tahu berapa banyak.
        tanpa_saran: ids.length - daftarPeta.length - saran.length,
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
      // Lookup by-id tanpa konteks proyek — proyeknya justru yang sedang dicari,
      // lalu SEGERA diadu ke `proyekMilikTenant`. Itulah gerbangnya.
      const { data: kat } = await request.db!
        .unsafe('project_expense_categories',
          'lookup by-id untuk menemukan project_id, lalu diadu proyekMilikTenant di baris berikutnya')
        .select('id, name, project_id')
        .eq('id', categoryId)
        .maybeSingle()
      if (!kat || !(await proyekMilikTenant(request, kat.project_id))) {
        return reply.status(404).send({ error: 'Kategori tidak ditemukan' })
      }

      // Setelah gerbang di atas lolos, categoryId terbukti milik tenant ini.
      const { data: lama } = await request.db!
        .unsafe('cost_code_category_map',
          'categoryId sudah lolos gerbang proyekMilikTenant di atas')
        .select('id, cost_code_id')
        .eq('category_id', categoryId)
        .maybeSingle()

      // cost_code_id null = LEPASKAN pemetaan. Dibedakan dari "tidak dikirim"
      // supaya pengguna bisa membatalkan salah-petakan tanpa menghapus kategori.
      if (costCodeId === null) {
        if (lama) {
          await request.db!
            .unsafe('cost_code_category_map', 'hapus baris yang sudah lolos gerbang tenant di atas')
            .delete().eq('id', lama.id)
          await logAuditEvent(request, {
            tableName: 'cost_code_category_map', recordId: lama.id,
            action: 'cecep.cost_map_dilepas',
            actorId: request.currentUser!.id,
            oldValues: { category: kat.name, cost_code_id: lama.cost_code_id },
          })
        }
        return reply.send({ data: null, dilepas: Boolean(lama) })
      }

      // `shared`: cost_codes kategori AB, katalog bersama lintas tenant.
      const { data: cc } = await request.db!
        .shared('cost_codes').select('id, code, name').eq('id', costCodeId).maybeSingle()
      if (!cc) return reply.status(400).send({ error: 'Cost Code tidak ditemukan' })

      // UNIQUE(category_id) di DB menjamin satu kategori → satu cost code
      // (migrasi 112: "resolusi deterministik"). Upsert menghormati itu, bukan
      // melawannya dengan menyisipkan baris kedua.
      const { data, error } = await request.db!
        .unsafe('cost_code_category_map', 'categoryId sudah lolos gerbang proyekMilikTenant di atas')
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

      // `unsafe` beralasan, BUKAN `viaProject`: `cost_code_category_map`
      // terdaftar kategori C dengan `lewat: 'category_id'`, sehingga
      // `viaProject(tabel, projectId)` akan menyaring `category_id = projectId`
      // — id yang berbeda jenis, hasilnya nol baris tanpa satu pun error.
      // Tenancy di sini sudah dijamin oleh `katIds`, yang berasal dari
      // `viaProject('project_expense_categories', projectId)` di atas.
      const peta = katIds.length
        ? (await request.db!
            .unsafe('cost_code_category_map',
              'disaring lewat katIds yang sudah ber-scope tenant via viaProject')
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
