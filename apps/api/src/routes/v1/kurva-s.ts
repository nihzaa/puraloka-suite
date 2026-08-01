import type { FastifyInstance } from 'fastify'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'
import { normalCDF, calculateEVM } from '../../lib/evm-calculation.js'
import { nilaiRencanaPerMinggu, ringkasCakupan } from '../../lib/rencana-dari-gantt.js'

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
          .select('id, weight_pct, total_price, sort_order, level, planned_start, planned_end')
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

        // Project expenses approved (pembelian material, sewa alat, dll)
        //
        // ⚠️ DIPERBAIKI 2026-08-01 — dua cacat yang membuat query ini SELALU
        // GAGAL, dan kegagalannya tak pernah berbunyi:
        //
        //   1. `.select('amount')` — kolomnya `total_amount`. PostgREST membalas
        //      "column project_expenses.amount does not exist", `data` jadi null,
        //      dan loop di bawah (`for (const e of expenseRes.data ?? [])`)
        //      diam-diam melewati NOL baris.
        //   2. `.in('status', ['approved','paid'])` — enum `expense_status`
        //      hanya punya draft/submitted/approved/rejected. Tak ada 'paid'.
        //
        // Akibatnya `project_expenses` TAK PERNAH masuk AC sejak baris ini
        // ditulis: **Rp 631,7 juta di 70 baris** hilang dari perhitungan (satu
        // proyek sendirian kehilangan Rp 477 jt). CPI karena itu terlalu
        // optimis — biaya terlihat lebih kecil dari kenyataan, dan proyek yang
        // sebenarnya boros terlihat sehat.
        //
        // Ditemukan saat membangun WIP (#15): Postgres langsung menolak filter
        // status yang sama, sementara PostgREST hanya memulangkan error di
        // field `error` yang tak pernah diperiksa. Pelajarannya: `?? []` pada
        // hasil query mengubah KEGAGALAN jadi HASIL KOSONG yang terlihat sah.
        supabase
          .from('project_expenses')
          .select('total_amount, expense_date')
          .eq('project_id', projectId)
          .eq('status', 'approved')
          .order('expense_date'),

        // Upah harian mandor.
        // ⚠️ DIPERBAIKI 2026-08-01 — cacat yang sama dengan project_expenses:
        // kolomnya `total_amount`/`work_date`, bukan `total_wage`/`log_date`,
        // dan tabel ini TAK PUNYA kolom `status` sama sekali (upah tercatat =
        // upah terjadi). Ketiga kesalahan itu membuat query selalu gagal.
        supabase
          .from('daily_wage_logs')
          .select('total_amount, work_date, work_scopes!inner(mandor_assignments!inner(project_id))')
          .eq('work_scopes.mandor_assignments.project_id', projectId)
          .order('work_date'),

        // Progress payments (bayar per persentase ke mandor).
        // ⚠️ `net_payment`/`paid_at`, bukan `amount`/`payment_date`.
        // `net_payment` (bukan `gross_payment`) karena kasbon yang dipotong
        // sudah masuk AC lewat jalurnya sendiri — memakai gross akan
        // menghitung uang yang sama dua kali.
        supabase
          .from('progress_payments')
          .select('net_payment, paid_at, work_scopes!inner(mandor_assignments!inner(project_id))')
          .eq('work_scopes.mandor_assignments.project_id', projectId)
          .order('paid_at'),

        // Settlement akhir borongan.
        // ⚠️ `remaining_balance`/`settled_at`, bukan `net_settlement`/
        // `settlement_date`. `remaining_balance` = sisa yang benar-benar
        // dibayar setelah kasbon & progress payment dipotong — dua-duanya
        // sudah masuk AC lewat jalur masing-masing.
        supabase
          .from('borongan_settlements')
          .select('remaining_balance, settled_at, work_scopes!inner(mandor_assignments!inner(project_id))')
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

      // Tingkat 2 dihitung di sini supaya cabang `else if` di bawah tetap
      // bersih. `null` = tak ada satu pun item berjadwal → jatuh ke CDF.
      // ⚠️ Diambil dari level `category`, BUKAN `item`. Diverifikasi ke dev:
      // 14 dari 24 kategori punya tanggal rencana, sementara level item hanya
      // 1 dari 296 — perencanaan Gantt di sistem ini memang disusun per
      // KATEGORI pekerjaan, bukan per baris RAB. Memfilter `level === 'item'`
      // membuat cakupan 0,37% dan tingkat-2 tak pernah aktif; filter yang
      // "kelihatan benar" itulah yang membuat fitur lahir mati.
      //
      // Nilai kategori sudah merupakan jumlah anak-anaknya, jadi tak ada
      // dobel-hitung selama HANYA satu level yang dipakai.
      const itemsGantt = allRabItems
        .filter(r => r.level === 'category')
        .map(r => ({
          totalPrice: Number(r.total_price ?? 0),
          plannedStart: (r as { planned_start?: string | null }).planned_start ?? null,
          plannedEnd: (r as { planned_end?: string | null }).planned_end ?? null,
        }))
      const rencanaGantt = hasSchedule ? null : nilaiRencanaPerMinggu(itemsGantt, startDate, totalWeeks)
      const cakupanGantt = ringkasCakupan(itemsGantt)

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
      } else if (rencanaGantt) {
        // ── TINGKAT 2: turunkan dari tanggal Gantt (`planned_start/end`) ────
        // Kolomnya sudah ada sejak migrasi 052 dan dipakai Gantt Chart, tapi
        // kurva-S tak pernah membacanya. Akibatnya PV selalu dari normal CDF —
        // kurva lonceng yang benar secara matematis tapi TAK ADA HUBUNGANNYA
        // dengan rencana proyek ini, sehingga SPI mengukur penyimpangan
        // terhadap tebakan, bukan terhadap rencana.
        for (let i = 0; i < totalWeeks; i++) rencanaValuePerWeek[i] = rencanaGantt[i]
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
      //
      // Kegagalan query TIDAK boleh lagi lewat diam-diam sebagai "nol baris".
      // Itulah yang menyembunyikan Rp 631,7 juta selama ini — lihat catatan di
      // blok query. AC yang kekurangan biaya membuat CPI terlihat sehat pada
      // proyek yang justru boros, dan tak ada gejala apa pun yang muncul.
      if (expenseRes.error) {
        request.log.error({ err: expenseRes.error, projectId },
          'gagal memuat project_expenses untuk AC — angka CPI/SPI akan kekurangan biaya')
      }
      for (const e of (expenseRes.data ?? [])) {
        acEntries.push({ amount: Number(e.total_amount), date: e.expense_date })
      }

      // Upah harian mandor — nama kolom diperbaiki 2026-08-01, lihat blok query.
      if (wageRes.error) {
        request.log.error({ err: wageRes.error, projectId },
          'gagal memuat daily_wage_logs untuk AC — angka CPI/SPI akan kekurangan biaya')
      }
      for (const w of (wageRes.data ?? [])) {
        acEntries.push({
          amount: Number((w as Record<string, unknown>).total_amount),
          date: (w as Record<string, unknown>).work_date as string,
        })
      }

      // Progress payments (bayar per % ke mandor) — `net_payment`, bukan gross:
      // kasbon yang dipotong sudah masuk AC lewat jalurnya sendiri.
      if (progressPayRes.error) {
        request.log.error({ err: progressPayRes.error, projectId },
          'gagal memuat progress_payments untuk AC — angka CPI/SPI akan kekurangan biaya')
      }
      for (const p of (progressPayRes.data ?? [])) {
        acEntries.push({
          amount: Number((p as Record<string, unknown>).net_payment),
          date: (p as Record<string, unknown>).paid_at as string,
        })
      }

      // Settlement borongan — `remaining_balance` = sisa yang benar-benar
      // dibayar setelah kasbon & progress payment dipotong.
      if (boronganRes.error) {
        request.log.error({ err: boronganRes.error, projectId },
          'gagal memuat borongan_settlements untuk AC — angka CPI/SPI akan kekurangan biaya')
      }
      for (const b of (boronganRes.data ?? [])) {
        acEntries.push({
          amount: Number((b as Record<string, unknown>).remaining_balance),
          date: (b as Record<string, unknown>).settled_at as string,
        })
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
          // Sumber kurva rencana — WAJIB ikut dikirim. Tanpa ini pemakai tak
          // bisa membedakan SPI yang diukur terhadap rencana sungguhan dari
          // SPI yang diukur terhadap kurva lonceng generik, padahal angkanya
          // sama-sama terlihat meyakinkan.
          rencanaSource: hasSchedule ? 'rab_schedule' : rencanaGantt ? 'gantt' : 'normal_cdf',
          // Cakupan NILAI item yang punya tanggal rencana. PV dari tingkat 2
          // hanya sekuat cakupannya: 15 dari 296 item = kurva yang mewakili
          // sebagian kecil pekerjaan.
          cakupanJadwalPct: cakupanGantt.pctNilai,
          itemBerjadwal: cakupanGantt.berjadwal,
          itemTotal: cakupanGantt.total,
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
