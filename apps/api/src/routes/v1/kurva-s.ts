import type { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'
import { normalCDF, calculateEVM } from '../../lib/evm-calculation.js'

/**
 * Endpoint: GET /api/v1/projects/:projectId/kurva-s
 *
 * Mengembalikan data time-series per minggu untuk:
 * - rencana: distribusi bobot RAB ke timeline (S-curve normal CDF)
 * - aktual:  serapan kumulatif nyata (kasbon approved + payments)
 * - progress: pct_overall dari progress_logs (scatter)
 * - milestones: marker target_date milestone
 */
export default async function kurvaSRoutes(app: FastifyInstance) {

  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/kurva-s',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { projectId } = request.params

      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      // ── Fetch semua data yang dibutuhkan paralel ─────────────────────────
      const [projRes, progressRes, milestoneRes, rabRes, scheduleRes, absorptionRes] = await Promise.all([
        request.db!
          .from('projects')
          .select('start_date, end_date, contract_value, progress_pct')
          .eq('id', projectId)
          .single(),

        // Progress logs fisik — hanya mode=daily yang punya pct_overall bermakna
        supabase
          .from('progress_logs')
          .select('pct_overall, logged_at, mode')
          .eq('project_id', projectId)
          .eq('mode', 'daily')
          .not('pct_overall', 'is', null)
          .order('logged_at'),

        // Milestones
        supabase
          .from('milestones')
          .select('title, target_date, status, completed_at')
          .eq('project_id', projectId)
          .not('target_date', 'is', null)
          .order('target_date'),

        // RAB items (semua level) untuk hitung bobot serapan
        supabase
          .from('rab_items')
          .select('id, weight_pct, total_price, sort_order, level')
          .eq('project_id', projectId)
          .gt('weight_pct', 0)
          .order('sort_order'),

        // Jadwal rencana serapan (dari input manual PM)
        supabase
          .from('rab_schedule')
          .select('rab_item_id, week_start, material_pct, upah_pct, alat_pct, other_pct')
          .eq('project_id', projectId)
          .order('week_start'),

        // Log serapan aktual manual (dari input PM per minggu)
        supabase
          .from('rab_absorption_log')
          .select('rab_item_id, week_start, material_pct, upah_pct, alat_pct, other_pct')
          .eq('project_id', projectId)
          .order('week_start'),
      ])

      if (projRes.error || !projRes.data) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const proj = projRes.data
      const contractValue = Number(proj.contract_value)
      const startDate = new Date(proj.start_date)
      const endDate = new Date(proj.end_date)

      // ── Fetch semua sumber pengeluaran aktual proyek secara paralel ───────
      // AC = semua uang yang keluar untuk proyek: kasbon + project_expenses + upah mandor + settlement
      const [kasbonRes, expenseRes, wageRes, progressPayRes, boronganRes] = await Promise.all([
        // Kasbon approved (uang operasional ke mandor)
        request.db!
          .from('kasbons')
          .select('amount, kasbon_date, work_scopes!inner(mandor_assignments!inner(project_id))')
          .eq('work_scopes.mandor_assignments.project_id', projectId)
          .eq('status', 'approved')
          .order('kasbon_date'),

        // Project expenses approved/paid (pembelian material, sewa alat, dll)
        supabase
          .from('project_expenses')
          .select('amount, expense_date')
          .eq('project_id', projectId)
          .in('status', ['approved', 'paid'])
          .order('expense_date'),

        // Wage reports paid (upah mandor mingguan yang sudah dibayar)
        supabase
          .from('daily_wage_logs')
          .select('total_wage, log_date, work_scopes!inner(mandor_assignments!inner(project_id))')
          .eq('work_scopes.mandor_assignments.project_id', projectId)
          .eq('status', 'paid')
          .order('log_date'),

        // Progress payments (bayar per persentase ke mandor)
        supabase
          .from('progress_payments')
          .select('amount, payment_date, work_scopes!inner(mandor_assignments!inner(project_id))')
          .eq('work_scopes.mandor_assignments.project_id', projectId)
          .order('payment_date'),

        // Borongan settlements (settlement akhir mandor borongan)
        supabase
          .from('borongan_settlements')
          .select('net_settlement, settlement_date, work_scopes!inner(mandor_assignments!inner(project_id))')
          .eq('work_scopes.mandor_assignments.project_id', projectId)
          .order('settlement_date'),
      ])

      // ── Cost Baseline untuk EVM: pagu RAP yang SUDAH DIKUNCI ──────────────
      //
      // BAC (Budget At Completion) harus berupa BIAYA yang dianggarkan, bukan
      // nilai JUAL. RAB = harga ke klien — sudah mengandung margin/BUK, jadi
      // memakainya sebagai BAC membuat CPI/SPI sistematis terlalu optimistis:
      // pembengkakan biaya kecil tersembunyi di balik bantalan margin sampai
      // margin itu habis. Ini akar masalah yang CECEP/03 §6 catat sejak awal
      // dan CECEP/52 Gap-2 tetapkan solusinya: Cost Baseline = RAP Frozen.
      //
      // Hanya RAP ber-status 'locked' yang dipakai — RAP draft masih berubah,
      // dan baseline yang bergerak bukan baseline. Bila proyek belum punya RAP
      // terkunci, perilaku LAMA dipertahankan apa adanya (fallback RAB →
      // contract_value) supaya proyek berjalan tidak berubah angkanya
      // mendadak; `bacSource` di respons menyatakan basis mana yang dipakai.
      const rapLockedRes = await request.db!
        .viaProject('rap_budget', projectId)
        .select('id, rap_material_line(pagu), rap_labor_line(borongan_value)')
        .eq('status', 'locked')
        .order('locked_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Total durasi proyek dalam minggu
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1
      const totalWeeks = Math.ceil(totalDays / 7)

      // ── Buat array minggu (label + date range) ──────────────────────────
      interface WeekSlot {
        week: number          // 1-based
        label: string         // "M1", "M2", ...
        weekStart: Date
        weekEnd: Date
        isoStart: string
      }

      const weeks: WeekSlot[] = []
      for (let w = 0; w < totalWeeks; w++) {
        const weekStart = new Date(startDate)
        weekStart.setDate(weekStart.getDate() + w * 7)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 6)
        weeks.push({
          week: w + 1,
          label: `M${w + 1}`,
          weekStart,
          weekEnd,
          isoStart: weekStart.toISOString().split('T')[0],
        })
      }

      // ── RAB baseline ─────────────────────────────────────────────────────
      const allRabItems = rabRes.data ?? []
      const totalRABValue = allRabItems
        .filter(r => r.level === 'category')
        .reduce((s, r) => s + Number(r.total_price ?? 0), 0)
      const hasRAB = totalRABValue > 0

      // Map item_id → total_price untuk kalkulasi serapan
      const itemPriceMap = new Map<string, number>()
      for (const it of allRabItems) {
        itemPriceMap.set(it.id, Number(it.total_price ?? 0))
      }

      // ── RENCANA: dari rab_schedule (input manual PM) ──────────────────────
      // Jika belum ada jadwal manual → fallback ke normal CDF
      const scheduleRows = scheduleRes.data ?? []
      const hasSchedule = scheduleRows.length > 0

      // Hitung nilai rencana per minggu dari rab_schedule
      // Setiap baris: nilai = (mat+upah+alat+other)% × total_price item
      const rencanaValuePerWeek: number[] = new Array(totalWeeks).fill(0)

      if (hasSchedule) {
        for (const row of scheduleRows) {
          const itemPrice = itemPriceMap.get(row.rab_item_id) ?? 0
          const pctThisWeek = Number(row.material_pct) + Number(row.upah_pct) + Number(row.alat_pct) + Number(row.other_pct)
          const valueThisWeek = itemPrice * pctThisWeek / 100

          const weekStart = new Date(row.week_start)
          const weekIdx = Math.floor((weekStart.getTime() - startDate.getTime()) / (7 * 86400000))
          if (weekIdx >= 0 && weekIdx < totalWeeks) {
            rencanaValuePerWeek[weekIdx] += valueThisWeek
          }
        }
      } else {
        // Fallback: distribusi normal CDF jika belum ada jadwal manual
        // normalCDF diekstrak ke lib/evm-calculation.ts (Task 1.2.2, testable tanpa HTTP/DB)
        const rabValueForCDF = totalRABValue > 0 ? totalRABValue : contractValue
        // CDF sebagai nilai absolut per minggu (delta tiap minggu)
        let prevCdf = 0
        for (let i = 0; i < totalWeeks; i++) {
          const x = (i + 1) / totalWeeks
          const cdf = normalCDF(x)
          rencanaValuePerWeek[i] = rabValueForCDF * (cdf - prevCdf)
          prevCdf = cdf
        }
      }

      // Kumulatif rencana sebagai %
      let cumRencana = 0
      const rencanaPerWeek: number[] = rencanaValuePerWeek.map(val => {
        cumRencana += val
        const base = totalRABValue > 0 ? totalRABValue : contractValue
        return parseFloat(Math.min(100, base > 0 ? (cumRencana / base) * 100 : 0).toFixed(2))
      })

      // ── AKTUAL: semua sumber pengeluaran per minggu (kumulatif) ────────────
      // AC = kasbon approved + project_expenses + upah mandor + progress payments + borongan settlements
      type SpendEntry = { amount: number; date: string }
      const acEntries: SpendEntry[] = []

      // Kasbon approved
      for (const k of (kasbonRes.data ?? [])) {
        acEntries.push({ amount: Number(k.amount), date: (k as Record<string, unknown>).kasbon_date as string })
      }

      // Project expenses (pembelian material, sewa alat, dll)
      for (const e of (expenseRes.data ?? [])) {
        acEntries.push({ amount: Number(e.amount), date: e.expense_date })
      }

      // Wage reports / daily wage logs yang sudah dibayar
      for (const w of (wageRes.data ?? [])) {
        acEntries.push({ amount: Number(w.total_wage), date: (w as Record<string, unknown>).log_date as string })
      }

      // Progress payments (bayar per % ke mandor)
      for (const p of (progressPayRes.data ?? [])) {
        acEntries.push({ amount: Number(p.amount), date: (p as Record<string, unknown>).payment_date as string })
      }

      // Borongan settlements
      for (const b of (boronganRes.data ?? [])) {
        acEntries.push({ amount: Number(b.net_settlement), date: (b as Record<string, unknown>).settlement_date as string })
      }

      // Bin ke dalam slot minggu
      const aktualPerWeek: number[] = new Array(totalWeeks).fill(0)
      for (const entry of acEntries) {
        if (!entry.date) continue
        const d = new Date(entry.date)
        const weekIdx = Math.floor((d.getTime() - startDate.getTime()) / (7 * 86400000))
        if (weekIdx >= 0 && weekIdx < totalWeeks) {
          aktualPerWeek[weekIdx] += entry.amount
        }
      }

      // Kumulatif aktual sebagai % dari contract value
      let cumulativeActual = 0
      let totalAC = 0
      const aktualKumulatif: (number | null)[] = weeks.map((w, i) => {
        cumulativeActual += aktualPerWeek[i]
        totalAC = cumulativeActual
        const pct = contractValue > 0 ? parseFloat(((cumulativeActual / contractValue) * 100).toFixed(2)) : 0
        // Tampilkan null untuk minggu yang belum lewat (future weeks)
        const now = new Date()
        return w.weekEnd > now ? null : pct
      })

      // ── SERAPAN DANA: dari rab_absorption_log (input manual PM) ─────────────
      // Setiap baris: nilai serapan = (mat+upah+alat+other)% × total_price item
      const absorptionRows = absorptionRes.data ?? []
      const serapanValuePerWeek: number[] = new Array(totalWeeks).fill(0)

      for (const row of absorptionRows) {
        const itemPrice = itemPriceMap.get(row.rab_item_id) ?? 0
        const pctThisWeek = Number(row.material_pct) + Number(row.upah_pct) + Number(row.alat_pct) + Number(row.other_pct)
        const valueThisWeek = itemPrice * pctThisWeek / 100

        const weekStart = new Date(row.week_start)
        const weekIdx = Math.floor((weekStart.getTime() - startDate.getTime()) / (7 * 86400000))
        if (weekIdx >= 0 && weekIdx < totalWeeks) {
          serapanValuePerWeek[weekIdx] += valueThisWeek
        }
      }

      // Kumulatif serapan sebagai %
      let cumSerapan = 0
      let totalSerapan = 0
      const base = totalRABValue > 0 ? totalRABValue : contractValue
      const serapanKumulatif: (number | null)[] = weeks.map((w, i) => {
        cumSerapan += serapanValuePerWeek[i]
        totalSerapan = cumSerapan
        const pct = base > 0 ? parseFloat(((cumSerapan / base) * 100).toFixed(2)) : 0
        // null untuk minggu yang belum ada data absorption
        return serapanValuePerWeek[i] === 0 && cumSerapan === 0 && w.weekEnd > new Date() ? null : pct
      })

      // Hitung serapan terbaru (% kumulatif sampai sekarang)
      const latestSerapanPct = absorptionRows.length > 0
        ? (serapanKumulatif.filter(v => v !== null).slice(-1)[0] ?? 0)
        : 0

      // ── PROGRESS FISIK dari progress_logs mode=daily ─────────────────────
      // mode=daily sudah difilter di query, pct_overall tidak null
      const progressLogs = (progressRes.data ?? []).map(log => {
        const d = new Date(log.logged_at)
        const weekIdx = Math.floor((d.getTime() - startDate.getTime()) / (7 * 86400000))
        return {
          weekIdx: Math.max(0, Math.min(totalWeeks - 1, weekIdx)),
          pct: Number(log.pct_overall),
          date: log.logged_at.split('T')[0],
        }
      })

      // Ambil progress fisik terbaru per minggu
      const progressPerWeek: (number | null)[] = new Array(totalWeeks).fill(null)
      for (const log of progressLogs) {
        const existing = progressPerWeek[log.weekIdx]
        if (existing === null || log.pct > existing) {
          progressPerWeek[log.weekIdx] = log.pct
        }
      }

      // ── MILESTONE markers ───────────────────────────────────────────────
      const milestones = (milestoneRes.data ?? []).map(m => {
        const d = new Date(m.target_date!)
        const weekIdx = Math.floor((d.getTime() - startDate.getTime()) / (7 * 86400000))
        return {
          title: m.title,
          date: m.target_date,
          status: m.status,
          weekIdx: Math.max(0, weekIdx),
          week: Math.max(1, weekIdx + 1),
        }
      })

      // ── Build response data ─────────────────────────────────────────────
      const chartData = weeks.map((w, i) => ({
        week: w.label,
        weekNum: w.week,
        date: w.isoStart,
        rencana: rencanaPerWeek[i],
        serapan: serapanKumulatif[i],   // serapan dana manual PM
        aktual: aktualKumulatif[i],      // aktual kas (kasbon + expense + upah)
        progress: progressPerWeek[i],    // progress fisik dari log
      }))

      // ── Summary & EVM building blocks ──────────────────────────────────────
      const latestActual = aktualKumulatif.filter(v => v !== null).slice(-1)[0] ?? 0
      const nowWeekIdx = weeks.findIndex(w => w.weekEnd > new Date())
      const latestRencana = rencanaPerWeek[Math.min(nowWeekIdx < 0 ? totalWeeks - 1 : nowWeekIdx, totalWeeks - 1)] ?? 0

      // EVM — pakai serapan dana (bukan aktual kas) sebagai AC untuk PM view
      //
      // BAC berjenjang: pagu RAP terkunci (biaya) → RAB (jual) → contract_value.
      // Urutannya sengaja: yang paling benar dulu, turun ke yang tersedia.
      type PaguRow = { pagu: string | number }
      type BoronganRow = { borongan_value: string | number }
      const rapRow = rapLockedRes.data as
        | { rap_material_line?: PaguRow[]; rap_labor_line?: BoronganRow[] }
        | null
      const paguRAP = rapRow
        ? (rapRow.rap_material_line ?? []).reduce((s, r) => s + Number(r.pagu ?? 0), 0)
          + (rapRow.rap_labor_line ?? []).reduce((s, r) => s + Number(r.borongan_value ?? 0), 0)
        : 0

      const bacSource: 'rap_locked' | 'rab' | 'contract_value' =
        paguRAP > 0 ? 'rap_locked' : totalRABValue > 0 ? 'rab' : 'contract_value'
      const bac = paguRAP > 0 ? paguRAP : totalRABValue > 0 ? totalRABValue : contractValue
      const ac = totalAC                    // aktual kas (internal only)
      const acSerapan = totalSerapan        // serapan dana manual
      const evPct = Number(proj.progress_pct ?? 0)
      const ev = bac * evPct / 100
      const pvPct = latestRencana
      const pv = bac * pvPct / 100

      // Formula EVM diekstrak ke lib/evm-calculation.ts (Task 1.2.2, testable tanpa HTTP/DB)
      const { cpi, spi, sv, cv, eac, etc, vac, tcpi } = calculateEVM({ bac, ac, ev, pv })

      return reply.send({
        meta: {
          projectId,
          startDate: proj.start_date,
          endDate: proj.end_date,
          contractValue,
          totalWeeks,
          hasRAB,
          hasSchedule,
          totalRABValue,
          latestActualPct: latestActual,
          latestSerapanPct,
          latestRencanaPct: latestRencana,
          deviasi: parseFloat((latestSerapanPct - latestRencana).toFixed(2)),
          evm: { bac, bacSource, paguRAP, ac, acSerapan, ev, pv, sv, cv, cpi, spi, eac, etc, vac, tcpi, evPct, pvPct, acPct: latestActual },
        },
        chartData,
        milestones,
      })
    }
  )
}
