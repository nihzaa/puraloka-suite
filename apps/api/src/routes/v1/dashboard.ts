import { FastifyInstance, FastifyRequest } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate } from '../../plugins/auth.js'

type Period = 'last_30_days' | 'last_3_months' | 'last_6_months' | 'this_year' | 'all_time'

function periodToStartDate(period: Period, today: Date): string | null {
  const d = new Date(today)
  switch (period) {
    case 'last_30_days':
      d.setDate(d.getDate() - 30)
      return d.toISOString().split('T')[0]
    case 'last_3_months':
      d.setMonth(d.getMonth() - 3)
      return d.toISOString().split('T')[0]
    case 'last_6_months':
      d.setMonth(d.getMonth() - 6)
      return d.toISOString().split('T')[0]
    case 'this_year':
      return `${today.getFullYear()}-01-01`
    case 'all_time':
      return null
  }
}

// Number of weeks in cashflow chart scaled to period
function weeksForPeriod(period: Period): number {
  switch (period) {
    case 'last_30_days': return 4
    case 'last_3_months': return 12
    case 'last_6_months': return 24
    case 'this_year': return 26
    case 'all_time': return 12
  }
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/v1/dashboard', {
    preHandler: [authenticate]
  }, async (request: FastifyRequest<{ Querystring: { period?: string } }>, _reply) => {
    const rawPeriod = request.query.period ?? 'last_3_months'
    const VALID: Period[] = ['last_30_days', 'last_3_months', 'last_6_months', 'this_year', 'all_time']
    const period: Period = VALID.includes(rawPeriod as Period) ? (rawPeriod as Period) : 'last_3_months'

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    const periodStart = periodToStartDate(period, today)

    // recent activity: always last 7 days
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

    const in14Days = new Date(today)
    in14Days.setDate(today.getDate() + 14)
    const in14DaysStr = in14Days.toISOString().split('T')[0]

    // T4c — SCOPING TENANT. Dashboard = agregat lintas-proyek, jadi tabel
    // kategori C disaring lewat daftar id milik tenant. Tanpa ini, KPI di
    // halaman depan mencampur angka dua perusahaan.
    const db = request.db!
    const [idProyek, idInvoice] = await Promise.all([db.projectIds(), db.invoiceIds()])

    // Build payment and kasbon queries scoped to period
    let paymentsQuery = supabase.from('payments').select('amount_paid, paid_at')
      .in('invoice_id', idInvoice)
    if (periodStart) paymentsQuery = paymentsQuery.gte('paid_at', periodStart)

    let allKasbonsQuery = db.from('kasbons')
      .select('id, amount, status, kasbon_date, fund_source, purpose')
      .not('status', 'eq', 'rejected')
    if (periodStart) allKasbonsQuery = allKasbonsQuery.gte('kasbon_date', periodStart)

    // Supplier payments yang terhubung ke kas (cash_account_id tidak null)
    let supplierPaymentsQuery = db
      .from('supplier_payments')
      .select('amount, payment_date')
      .not('cash_account_id', 'is', null)
    if (periodStart) supplierPaymentsQuery = supplierPaymentsQuery.gte('payment_date', periodStart)

    // Promise.allSettled: jika 1 query gagal, widget lain tetap tampil
    const [
      projectsRes,
      invoicesRes,
      paymentsRes,
      allKasbonsRes,
      pendingKasbonsRes,
      recentActivityRes,
      milestonesRes,
      mandorRes,
      taxRes,
      supplierPaymentsRes,
    ] = await Promise.allSettled([
      db.from('projects')
        .select(`
          id, name, status, contract_value, progress_pct, location, end_date, contract_model,
          clients!projects_client_id_fkey ( contact_person ),
          pm:users!projects_pm_id_fkey ( name )
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),

      supabase.from('invoices')
        .select(`
          id, invoice_number, status, total_amount, amount_due, due_date, issued_date,
          projects!invoices_project_id_fkey (
            name,
            clients!projects_client_id_fkey ( contact_person )
          )
        `)
        .in('project_id', idProyek)
        .in('status', ['sent', 'partial', 'overdue'])
        .order('due_date', { ascending: true }),

      paymentsQuery,

      allKasbonsQuery,

      db.from('kasbons')
        .select(`
          id, amount, fund_source, purpose, kasbon_date, notes, status, created_at,
          work_scopes!kasbons_work_scope_id_fkey (
            scope_name, payment_system,
            mandor_assignments!work_scopes_assignment_id_fkey (
              projects!mandor_assignments_project_id_fkey ( id, name ),
              mandor:users!mandor_id ( id, name )
            )
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),

      supabase.from('progress_logs')
        .select(`
          id, pct_overall, weather, worker_count, notes, logged_at,
          projects!progress_logs_project_id_fkey ( id, name ),
          reporter:users!reported_by ( name )
        `)
        .in('project_id', idProyek)
        .gte('logged_at', sevenDaysAgoStr + 'T00:00:00+07:00')
        .lte('logged_at', todayStr + 'T23:59:59+07:00')
        .order('logged_at', { ascending: false }),

      supabase.from('milestones')
        .select(`
          id, title, target_date, completed_at, status,
          projects!milestones_project_id_fkey ( id, name )
        `)
        .in('project_id', idProyek)
        .not('status', 'eq', 'completed')
        .lte('target_date', in14DaysStr)
        .order('target_date', { ascending: true }),

      supabase.from('mandor_assignments')
        .select(`
          id, assigned_at,
          mandor:users!mandor_id ( id, name ),
          projects!mandor_assignments_project_id_fkey ( id, name ),
          work_scopes!work_scopes_assignment_id_fkey (
            id, scope_name, payment_system, progress_pct_done, status, borongan_value,
            kasbons!kasbons_work_scope_id_fkey ( amount, status, kasbon_date )
          )
        `)
        .in('project_id', idProyek)
        .eq('status', 'active'),

      supabase.from('tax_records')
        .select('id, tax_type, base_amount, rate_pct, tax_amount, period_month, status')
        .in('invoice_id', idInvoice)
        .order('period_month', { ascending: false }),

      supplierPaymentsQuery,
    ])

    const projects         = projectsRes.status      === 'fulfilled' ? (projectsRes.value.data      ?? []) : []
    const invoices         = invoicesRes.status       === 'fulfilled' ? (invoicesRes.value.data       ?? []) : []
    const payments         = paymentsRes.status       === 'fulfilled' ? (paymentsRes.value.data       ?? []) : []
    const allKasbons       = allKasbonsRes.status     === 'fulfilled' ? (allKasbonsRes.value.data     ?? []) : []
    const pendingKasbons   = pendingKasbonsRes.status === 'fulfilled' ? (pendingKasbonsRes.value.data ?? []) : []
    const recentActivity   = recentActivityRes.status === 'fulfilled' ? (recentActivityRes.value.data ?? []) : []
    const milestones       = milestonesRes.status     === 'fulfilled' ? (milestonesRes.value.data     ?? []) : []
    const mandorAssignments = mandorRes.status        === 'fulfilled' ? (mandorRes.value.data         ?? []) : []
    const taxRecords       = taxRes.status            === 'fulfilled' ? (taxRes.value.data            ?? []) : []
    const supplierPayments = supplierPaymentsRes.status === 'fulfilled' ? (supplierPaymentsRes.value.data ?? []) : []

    // Non-time-based KPIs (always all data)
    const activeProjects = projects.filter((p: any) => p.status === 'active')
    const totalContractValue = activeProjects.reduce((s: number, p: any) => s + Number(p.contract_value ?? 0), 0)
    const invoiceOutstanding = invoices.reduce((s: number, i: any) => s + Number(i.amount_due ?? 0), 0)

    // Time-scoped KPIs
    const incomePeriod = payments.reduce((s: number, p: any) => s + Number(p.amount_paid ?? 0), 0)

    const kasbonActiveTotal = allKasbons
      .filter((k: any) => ['pending', 'approved'].includes(k.status))
      .reduce((s: number, k: any) => s + Number(k.amount ?? 0), 0)

    const statusMap: Record<string, number> = {}
    for (const p of projects as any[]) {
      statusMap[p.status] = (statusMap[p.status] || 0) + 1
    }

    const invoiceOverdueCount = (invoices as any[]).filter((i: any) =>
      i.status === 'overdue' || (i.due_date && new Date(i.due_date) < today)
    ).length

    const milestoneLateCount = (milestones as any[]).filter((m: any) =>
      new Date(m.target_date) < today
    ).length

    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    const thisMonthTax = (taxRecords as any[]).filter((t: any) =>
      (t.period_month ?? '').startsWith(currentMonthStr)
    )

    const numWeeks = weeksForPeriod(period)

    return {
      period,
      kpis: {
        active_projects: activeProjects.length,
        total_contract_value: totalContractValue,
        invoice_outstanding: invoiceOutstanding,
        income_this_month: incomePeriod,
        kasbon_active_total: kasbonActiveTotal,
        net_cash_estimate: incomePeriod - kasbonActiveTotal,
      },
      alerts: {
        kasbon_pending: pendingKasbons.length,
        invoice_overdue: invoiceOverdueCount,
        milestone_late: milestoneLateCount,
      },
      cashflow_8w: buildCashflowWeeks(today, numWeeks, payments as any[], allKasbons as any[], supplierPayments as any[]),
      status_distribution: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
      active_progress: activeProjects.map((p: any) => ({
        id: p.id,
        name: p.name,
        progress_pct: Number(p.progress_pct),
        end_date: p.end_date,
        contract_value: Number(p.contract_value ?? 0),
      })),
      outstanding_invoices: invoices,
      pending_kasbons: pendingKasbons,
      today_activity: recentActivity,
      upcoming_milestones: milestones,
      mandor_overview: mandorAssignments,
      projects_list: projects,
      tax_summary: {
        records: (taxRecords as any[]).slice(0, 12),
        reported_count: (taxRecords as any[]).filter((t: any) => t.status === 'reported').length,
        pending_count: (taxRecords as any[]).filter((t: any) => t.status === 'pending').length,
        total_pph: (taxRecords as any[]).reduce((s: number, t: any) => s + Number(t.tax_amount ?? 0), 0),
        this_month_reported: thisMonthTax.filter((t: any) => t.status === 'reported').length,
        this_month_pending: thisMonthTax.filter((t: any) => t.status === 'pending').length,
      },
    }
  })
}

function buildCashflowWeeks(
  today: Date,
  numWeeks: number,
  payments: Array<{ amount_paid: number; paid_at: string }>,
  kasbons: Array<{ amount: number; kasbon_date: string; status: string }>,
  supplierPayments: Array<{ amount: number; payment_date: string }> = []
) {
  const weeks = []
  for (let w = numWeeks - 1; w >= 0; w--) {
    const weekEnd = new Date(today)
    weekEnd.setDate(today.getDate() - w * 7)
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekEnd.getDate() - 6)

    const startStr = weekStart.toISOString().split('T')[0]
    const endStr = weekEnd.toISOString().split('T')[0]
    const label = `${startStr.slice(8, 10)}/${startStr.slice(5, 7)}`

    const income = payments
      .filter(p => p.paid_at >= startStr && p.paid_at <= endStr)
      .reduce((s, p) => s + Number(p.amount_paid ?? 0), 0)

    const kasbonExpense = kasbons
      .filter(k => k.kasbon_date >= startStr && k.kasbon_date <= endStr && k.status !== 'rejected')
      .reduce((s, k) => s + Number(k.amount ?? 0), 0)

    const supplierExpense = supplierPayments
      .filter(sp => sp.payment_date >= startStr && sp.payment_date <= endStr)
      .reduce((s, sp) => s + Number(sp.amount ?? 0), 0)

    weeks.push({ week_label: label, week_start: startStr, income, expense: kasbonExpense + supplierExpense })
  }
  return weeks
}
