import type { FastifyInstance } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { hitungWIP, ringkasWIP, type InputWIP } from '../../lib/wip-psak.js'

/**
 * LAPORAN WIP — pengakuan pendapatan PSAK 72 (ROADMAP #15).
 *
 * ── Kenapa ini yang membuat L/R kontraktor bermakna
 *
 * Termin ditentukan negosiasi, bukan kemajuan pekerjaan. Kalau pendapatan
 * diakui saat invoice terbit, laporan bulanan jadi bergerigi tanpa arti: bulan
 * ber-termin besar terlihat sangat untung, bulan berikutnya terlihat rugi —
 * padahal pekerjaannya berjalan sama. WIP meratakannya sesuai kemajuan.
 *
 * ── Definisi biaya SENGAJA sama dengan kurva-S
 *
 * Biaya terjadi di sini memakai lima sumber yang sama persis dengan AC di
 * `kurva-s.ts`: kasbon approved + project_expenses + upah mandor + progress
 * payment + settlement borongan. Definisi yang berbeda untuk hal yang sama
 * menghasilkan dua angka "biaya proyek" yang tak pernah cocok, dan
 * ketidakcocokan itu selalu ditemukan pada saat paling buruk.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * Tidak menulis jurnal. GL (Modul 10) belum ada; ini laporan, bukan pembukuan.
 * Saat GL dibangun, angka di sinilah sumber jurnalnya — karena itu tiap
 * komponen dipisah eksplisit, bukan digabung jadi satu total.
 */
export default async function wipRoutes(app: FastifyInstance) {

  // ── GET /api/v1/reports/wip ───────────────────────────────────────────────
  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/reports/wip',
    { preHandler: [authenticate, requirePermission('reports:view')] },
    async (request, reply) => {
      let qProyek = request.db!
        .from('projects')
        .select('id, name, status, contract_value, progress_pct')
        .neq('is_deleted', true)
      if (request.query.status) qProyek = qProyek.eq('status', request.query.status)

      const { data: proyek, error } = await qProyek
      if (error) {
        request.log.error({ err: error }, 'gagal memuat proyek untuk WIP')
        return reply.status(500).send({ error: 'Gagal memuat data proyek' })
      }

      const baris = (proyek ?? []) as unknown as Array<{
        id: string; name: string; status: string
        contract_value: number | null; progress_pct: number | null
      }>
      if (baris.length === 0) {
        return reply.send({ data: [], meta: ringkasWIP([]) })
      }
      const ids = baris.map((p) => p.id)

      // Lima sumber biaya — SAMA dengan AC di kurva-s.ts. Lihat catatan kepala.
      const [expRes, kasbonRes, wageRes, progPayRes, boronganRes, rapRes, invRes] =
        await Promise.all([
          // ⚠️ Hanya `approved`. Enum `expense_status` = draft/submitted/
          // approved/rejected — TAK ADA 'paid'. `kurva-s.ts` menyaring
          // `['approved','paid']`; nilai kedua itu tak pernah cocok apa pun,
          // jadi hasilnya kebetulan sama dan cacatnya tak pernah berbunyi.
          // Diverifikasi ke `pg_enum`, bukan disalin dari kode yang ada.
          request.db!.from('project_expenses')
            .select('project_id, total_amount').in('project_id', ids)
            .eq('status', 'approved'),
          request.db!.from('kasbons')
            .select('project_id, amount').in('project_id', ids).eq('status', 'approved'),
          request.db!.from('daily_wage_logs')
            .select('total_wage, work_scopes!inner(mandor_assignments!inner(project_id))')
            .eq('status', 'paid'),
          request.db!.from('progress_payments')
            .select('amount, work_scopes!inner(mandor_assignments!inner(project_id))'),
          request.db!.from('borongan_settlements')
            .select('net_settlement, work_scopes!inner(mandor_assignments!inner(project_id))'),
          // Pagu RAP terkunci = estimasi total biaya. Inilah yang membuat
          // cost-to-cost bisa dihitung; tanpanya jatuh ke progres fisik.
          request.db!.from('rap_budget')
            .select('project_id, rap_material_line(pagu), rap_labor_line(borongan_value)')
            .in('project_id', ids).eq('status', 'locked'),
          request.db!.from('invoices')
            .select('project_id, total_amount').in('project_id', ids),
        ])

      const tambah = (m: Map<string, number>, k: string | null | undefined, v: number) => {
        if (!k) return
        m.set(k, (m.get(k) ?? 0) + (Number(v) || 0))
      }

      const biaya = new Map<string, number>()
      for (const r of (expRes.data ?? []) as Array<Record<string, unknown>>) {
        tambah(biaya, r.project_id as string, Number(r.total_amount ?? 0))
      }
      for (const r of (kasbonRes.data ?? []) as Array<Record<string, unknown>>) {
        tambah(biaya, r.project_id as string, Number(r.amount ?? 0))
      }
      // Tiga sumber terakhir mencapai proyek lewat rantai scope → assignment,
      // jadi project_id-nya bersarang di hasil join.
      const lewatScope = (
        rows: unknown[] | null,
        kolom: string,
      ) => {
        for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
          const ws = r.work_scopes as { mandor_assignments?: { project_id?: string } } | undefined
          tambah(biaya, ws?.mandor_assignments?.project_id, Number(r[kolom] ?? 0))
        }
      }
      lewatScope(wageRes.data, 'total_wage')
      lewatScope(progPayRes.data, 'amount')
      lewatScope(boronganRes.data, 'net_settlement')

      const ditagih = new Map<string, number>()
      for (const r of (invRes.data ?? []) as Array<Record<string, unknown>>) {
        tambah(ditagih, r.project_id as string, Number(r.total_amount ?? 0))
      }

      const pagu = new Map<string, number>()
      for (const r of (rapRes.data ?? []) as Array<Record<string, unknown>>) {
        const mat = (r.rap_material_line ?? []) as Array<{ pagu?: number }>
        const lab = (r.rap_labor_line ?? []) as Array<{ borongan_value?: number }>
        const total = mat.reduce((s, x) => s + Number(x.pagu ?? 0), 0)
                    + lab.reduce((s, x) => s + Number(x.borongan_value ?? 0), 0)
        // Pagu nol bukan estimasi yang sah — RAP terkunci tanpa satu baris pun
        // berarti belum diisi, dan memakainya membuat cost-to-cost jadi
        // pembagian dengan nol yang diam-diam berubah jadi 0%.
        if (total > 0) tambah(pagu, r.project_id as string, total)
      }

      const hasil = baris.map((p) => hitungWIP({
        projectId: p.id,
        nama: p.name,
        status: p.status,
        nilaiKontrak: Number(p.contract_value ?? 0),
        biayaTerjadi: biaya.get(p.id) ?? 0,
        estimasiTotalBiaya: pagu.get(p.id) ?? null,
        progressPct: Number(p.progress_pct ?? 0),
        totalDitagih: ditagih.get(p.id) ?? 0,
      } satisfies InputWIP))

      // Urutan = urutan PERHATIAN: yang rugi di atas, lalu BIE terbesar
      // (liabilitas tersembunyi), lalu sisanya.
      hasil.sort((a, b) => {
        const rugiA = (a.labaDiakui ?? 0) < 0 ? 0 : 1
        const rugiB = (b.labaDiakui ?? 0) < 0 ? 0 : 1
        if (rugiA !== rugiB) return rugiA - rugiB
        return b.bie - a.bie
      })

      return reply.send({ data: hasil, meta: ringkasWIP(hasil) })
    },
  )
}
