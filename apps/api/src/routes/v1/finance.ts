import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { validateMime } from '../../utils/mime.js'
import { createNotifications } from '../../utils/notifications.js'
import { resolveRecipients } from '../../utils/notification-routing.js'
import { logAuditEvent } from '../../utils/audit.js'
import { computeAndPersistPenalty, estimatePenalty } from '../../utils/penalty.js'
import { computeAging, retentionOutstanding, validateDpDeduction } from '../../lib/ar-register.js'

const ALLOWED_IMAGE_PDF = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export default async function financeRoutes(app: FastifyInstance) {

  // ── GET /api/v1/finance/summary ──────────────────────────────────────────────
  // Params (optional): date_from, date_to (ISO date YYYY-MM-DD)
  // Jika tidak diisi → default ke bulan ini (backward-compatible)
  app.get('/api/v1/finance/summary', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Period resolution
    const dateFrom = q.date_from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const dateTo   = q.date_to   || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
    const dateFromTs = dateFrom + 'T00:00:00'
    const dateToTs   = dateTo   + 'T23:59:59'

    // Human-readable period label
    const fmtLabel = (d: string) => {
      const dt = new Date(d)
      return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    const d1 = new Date(dateFrom), d2 = new Date(dateTo)
    const sameMonth = d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()
    const sameYear  = d1.getFullYear() === d2.getFullYear()
    let periodLabel: string
    if (sameMonth) {
      periodLabel = d1.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    } else if (sameYear) {
      periodLabel = `${fmtLabel(dateFrom)} – ${fmtLabel(dateTo)}`
    } else {
      periodLabel = `${fmtLabel(dateFrom)} – ${fmtLabel(dateTo)}`
    }

    // T4c — SCOPING TENANT. Dashboard ini agregat LINTAS-PROYEK, jadi tabel
    // kategori C disaring lewat daftar id milik tenant (project / invoice /
    // assignment / work_scope), bukan viaProject() yang butuh satu project.
    // Sebelum perubahan ini, seluruh query di bawah berjalan TANPA saringan
    // tenancy apa pun — angka dashboard akan mencampur dua perusahaan.
    const db = request.db!
    const [idProyek, idInvoice, idAssignment, idScope] = await Promise.all([
      db.projectIds(), db.invoiceIds(), db.assignmentIds(), db.workScopeIds(),
    ])

    const [
      invoicesRes, paymentsRes, kasbonPendingRes,
      cashAccountsRes, wageApprovedRes,
      expenseRes,
      kasbonSettledRes, kasbonAllActiveRes,
      wageRes, progressRes, settlementRes,
    ] = await Promise.all([
      // Invoice & AR (all time — untuk outstanding/overdue tidak dibatasi periode)
      supabase.from('invoices').select('id, total_amount, amount_paid, amount_due, status, due_date')
        .in('project_id', idProyek).neq('status', 'cancelled'),
      // Pendapatan diterima dalam periode
      supabase.from('payments').select('amount_paid')
        .in('invoice_id', idInvoice).gte('paid_at', dateFromTs).lte('paid_at', dateToTs),
      // Kasbon pending (all time — untuk alert)
      db.from('kasbons').select('id, amount').eq('status', 'pending'),
      // Saldo kas real-time (all time)
      db.from('cash_accounts').select('id, name, type, balance').eq('is_active', true),
      // Laporan upah pending approval (all time — untuk alert)
      supabase.from('weekly_wage_reports').select('net_amount')
        .in('assignment_id', idAssignment).eq('status', 'approved'),
      // Pengeluaran proyek dalam periode — join kategori untuk split per type
      supabase.from('project_expenses')
        .select('total_amount, category:project_expense_categories(type)')
        .in('project_id', idProyek)
        .eq('status', 'approved')
        .gte('expense_date', dateFrom).lte('expense_date', dateTo),
      // Kasbon settled dalam periode (untuk hitung berapa yang sudah lunas)
      db.from('kasbons').select('amount').eq('status', 'settled')
        .gte('settled_at', dateFromTs).lte('settled_at', dateToTs),
      // Semua kasbon active (approved, not yet settled) — advance beredar
      db.from('kasbons').select('amount').in('status', ['approved']),
      // Upah mandor dibayar dalam periode
      supabase.from('weekly_wage_reports').select('net_amount')
        .in('assignment_id', idAssignment).eq('status', 'paid')
        .gte('paid_at', dateFromTs).lte('paid_at', dateToTs),
      // Progress payments dalam periode
      supabase.from('progress_payments').select('gross_payment')
        .in('work_scope_id', idScope).eq('status', 'approved')
        .not('paid_at', 'is', null)
        .gte('paid_at', dateFromTs).lte('paid_at', dateToTs),
      // Settlement borongan dalam periode
      supabase.from('borongan_settlements').select('net_payment')
        .in('work_scope_id', idScope)
        .not('settled_at', 'is', null)
        .gte('settled_at', dateFromTs).lte('settled_at', dateToTs),
    ])

    const invoices      = invoicesRes.data ?? []
    const kasbonPending = kasbonPendingRes.data ?? []
    const cashAccounts  = cashAccountsRes.data ?? []

    // AR / Invoice aggregation
    const totalInvoiced    = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
    const totalPaid        = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
    const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + Number(i.amount_due), 0)
    const totalOverdue     = invoices.filter(i => i.status !== 'paid' && i.due_date < today).reduce((s, i) => s + Number(i.amount_due), 0)
    const overdueCount     = invoices.filter(i => i.status !== 'paid' && i.due_date < today).length
    const paidThisMonth    = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount_paid), 0)
    const kasbonPendingTotal = kasbonPending.reduce((s, k) => s + Number(k.amount), 0)

    // Saldo kas
    const totalKasMain      = cashAccounts.filter(a => a.type === 'main').reduce((s, a) => s + Number(a.balance), 0)
    const totalKasCollector = cashAccounts.filter(a => a.type === 'collector').reduce((s, a) => s + Number(a.balance), 0)
    const totalKasPetty     = cashAccounts.filter(a => a.type === 'petty_cash').reduce((s, a) => s + Number(a.balance), 0)
    const totalKas          = totalKasMain + totalKasCollector + totalKasPetty

    // Expense split per category type
     
    const expenses = (expenseRes.data ?? []) as any[]
    let materialCost = 0, laborExpenseCost = 0, equipmentCost = 0, operationalCost = 0, otherCost = 0
    for (const e of expenses) {
      const type = e.category?.type ?? 'other'
      const amt = Number(e.total_amount)
      if (type === 'material')    materialCost    += amt
      else if (type === 'labor')  laborExpenseCost += amt
      else if (type === 'equipment') equipmentCost += amt
      else if (type === 'operational') operationalCost += amt
      else                        otherCost       += amt
    }
    const totalExpense = materialCost + laborExpenseCost + equipmentCost + operationalCost + otherCost

    // Labor cost (upah + progress + settlement + labor-category expenses)
    const wageThisMonth       = (wageRes.data ?? []).reduce((s, w) => s + Number(w.net_amount), 0)
    const progressThisMonth   = (progressRes.data ?? []).reduce((s, p) => s + Number(p.gross_payment), 0)
    const settlementThisMonth = (settlementRes.data ?? []).reduce((s, s2) => s + Number(s2.net_payment), 0)
    const laborCost           = wageThisMonth + progressThisMonth + settlementThisMonth + laborExpenseCost

    // Non-labor direct costs
    const nonLaborCost  = materialCost + equipmentCost + operationalCost + otherCost

    // Total biaya nyata (labor + material + ops) — kasbon TIDAK masuk
    const totalKeluar   = laborCost + nonLaborCost

    // Advance beredar: kasbon mandor yang masih approved (belum settled)
    const advanceBeredar     = (kasbonAllActiveRes.data ?? []).reduce((s, k) => s + Number(k.amount), 0)
    const kasbonSettledPeriod = (kasbonSettledRes.data ?? []).reduce((s, k) => s + Number(k.amount), 0)

    // Upah pending approval (alert)
    const wagePendingTotal = (wageApprovedRes.data ?? []).reduce((s, w) => s + Number(w.net_amount), 0)
    const wagePendingCount = (wageApprovedRes.data ?? []).length

    return reply.send({
      // Period info
      dateFrom, dateTo, periodLabel,
      // AR
      totalInvoiced, totalPaid, totalOutstanding, totalOverdue,
      overdueCount, paidThisMonth,
      // Kasbon alerts
      kasbonPendingCount: kasbonPending.length, kasbonPendingTotal,
      // Kas saldo (real-time, tidak dibatasi periode)
      totalKas, totalKasMain, totalKasCollector, totalKasPetty, cashAccounts,
      // Biaya keluar periode (tidak termasuk kasbon)
      totalKeluar,
      laborCost, wageThisMonth, progressThisMonth, settlementThisMonth, laborExpenseCost,
      materialCost, equipmentCost, operationalCost, otherCost, nonLaborCost, totalExpense,
      // Advance mandor (bukan biaya)
      advanceBeredar, kasbonSettledPeriod,
      // Upah pending
      wagePendingTotal, wagePendingCount,
      // Legacy fields untuk backward-compat
      keluarThisMonth: totalKeluar,
      expenseThisMonth: totalExpense,
      kasbonThisMonth: advanceBeredar,
    })
  })

  // ── GET /api/v1/finance/invoices ─────────────────────────────────────────────
  // List semua invoice lintas proyek
  app.get('/api/v1/finance/invoices', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { status, project_id, type, limit = '100', offset = '0' } = request.query as Record<string, string>
    const lim = Math.min(Math.max(1, Number(limit) || 100), 200)
    const off = Math.max(0, Number(offset) || 0)

    let q = supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_type, base_amount, commission_amount,
        tax_amount, total_amount, amount_paid, amount_due,
        issued_date, due_date, paid_date, status, notes, created_at,
        projects ( id, name, location, contract_model ),
        termin_schedules ( id, label, termin_number ),
        payments ( id, amount_paid, payment_method, paid_at, ref_number, bank_name, proof_url )
      `)
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1)

    if (status) q = q.eq('status', status)
    if (project_id) q = q.eq('project_id', project_id)
    if (type) q = q.eq('invoice_type', type)

    const { data, error, count } = await q
    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ invoices: data ?? [], total: count ?? (data?.length ?? 0) })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER PIUTANG (PETA §3 #3) — AR aging + retensi + uang muka
  // Compute-on-read untuk TAMPILAN register (bukan angka pembukuan resmi yang
  // dipersist) — konsisten pola estimasi penalty (DOMAIN §7).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/finance/ar-aging?as_of=YYYY-MM-DD ───────────────────────────
  // Bucket 30/60/90: current | 1–30 | 31–60 | 61–90 | >90 hari lewat jatuh tempo.
  app.get('/api/v1/finance/ar-aging', {
    preHandler: [authenticate, requirePermission('finance:view:all')]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const asOf = q.as_of && /^\d{4}-\d{2}-\d{2}$/.test(q.as_of)
      ? q.as_of
      : new Date().toISOString().split('T')[0]

    let query = supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_type, issued_date, due_date, total_amount, amount_paid, amount_due, status,
        project:projects(id, name, client:clients(id, company_name, contact_person))
      `)
      .in('status', ['sent', 'partial', 'overdue'])
      .gt('amount_due', 0)
      .order('due_date', { ascending: true })
      .limit(1000)
    if (q.project_id) query = query.eq('project_id', q.project_id)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })

    const summary = computeAging(
      (data ?? []).map(i => ({ id: i.id, due_date: i.due_date, amount_due: i.amount_due, status: i.status })),
      asOf
    )
    const byId = new Map(summary.rows.map(r => [r.id, r]))
    const rows = (data ?? [])
      .filter(i => byId.has(i.id))
      .map(i => {
        const agingRow = byId.get(i.id)!
        const proj = i.project as unknown as { id: string; name: string; client?: { id: string; company_name: string | null; contact_person: string } | null } | null
        return {
          id: i.id,
          invoice_number: i.invoice_number,
          invoice_type: i.invoice_type,
          issued_date: i.issued_date,
          due_date: i.due_date,
          total_amount: Number(i.total_amount),
          amount_due: Number(i.amount_due),
          status: i.status,
          days_past_due: agingRow.days_past_due,
          bucket: agingRow.bucket,
          project: proj ? { id: proj.id, name: proj.name } : null,
          client: proj?.client ? { id: proj.client.id, name: proj.client.company_name ?? proj.client.contact_person } : null,
        }
      })

    return {
      as_of: asOf,
      buckets: summary.buckets,
      total_outstanding: summary.total,
      invoice_count: summary.count,
      truncated: (data ?? []).length >= 1000,
      rows,
    }
  })

  // ── GET /api/v1/finance/retention-register ──────────────────────────────────
  // Per proyek: retensi ditahan (Σ invoices.retensi_amount) vs dicairkan
  // (Σ invoice retention_release) + jadwal termin on_retention. Tanggal jatuh
  // tempo pencairan = ESTIMASI (end_date proyek + due_days) — BAST formal belum
  // ada di sistem (DOMAIN §1), bukan angka resmi.
  app.get('/api/v1/finance/retention-register', {
    preHandler: [authenticate, requirePermission('finance:view:all')]
  }, async (_request, reply) => {
    const today = new Date().toISOString().split('T')[0]

    const idProyekAr = await _request.db!.projectIds()
    const [invRes, projRes, terminRes] = await Promise.all([
      supabase.from('invoices')
        .select('project_id, invoice_type, retensi_amount, total_amount, status')
        .in('project_id', idProyekAr)
        .neq('status', 'cancelled')
        .limit(2000),
      supabase.from('projects')
        .select('id, name, status, end_date, retention_pct, retention_amount, is_deleted, client:clients(id, company_name, contact_person)')
        .eq('is_deleted', false)
        .limit(500),
      supabase.from('termin_schedules')
        .select('id, project_id, label, amount, pct_of_contract, status, due_days, trigger_type')
        .eq('trigger_type', 'on_retention')
        .limit(500),
    ])
    if (invRes.error) return reply.status(500).send({ error: invRes.error.message })
    if (projRes.error) return reply.status(500).send({ error: projRes.error.message })
    if (terminRes.error) return reply.status(500).send({ error: terminRes.error.message })

    const withheldByProject = new Map<string, number>()
    const releasedByProject = new Map<string, number>()
    for (const inv of invRes.data ?? []) {
      if (inv.status === 'draft') continue
      if (inv.invoice_type === 'retention_release') {
        releasedByProject.set(inv.project_id, (releasedByProject.get(inv.project_id) ?? 0) + Number(inv.total_amount ?? 0))
      } else {
        withheldByProject.set(inv.project_id, (withheldByProject.get(inv.project_id) ?? 0) + Number(inv.retensi_amount ?? 0))
      }
    }
    const terminByProject = new Map<string, Array<{ id: string; label: string; amount: number; pct_of_contract: number; status: string; due_days: number | null }>>()
    for (const t of terminRes.data ?? []) {
      const list = terminByProject.get(t.project_id) ?? []
      list.push({ id: t.id, label: t.label, amount: Number(t.amount), pct_of_contract: Number(t.pct_of_contract), status: t.status, due_days: t.due_days })
      terminByProject.set(t.project_id, list)
    }

    const rows = (projRes.data ?? [])
      .map(p => {
        const withheld = withheldByProject.get(p.id) ?? 0
        const released = releasedByProject.get(p.id) ?? 0
        const outstanding = retentionOutstanding(withheld, released)
        const termins = terminByProject.get(p.id) ?? []
        const dueDays = termins.find(t => t.due_days != null)?.due_days ?? null
        let estimatedReleaseDue: string | null = null
        if (p.end_date && dueDays != null) {
          const d = new Date(`${p.end_date}T00:00:00Z`)
          d.setUTCDate(d.getUTCDate() + dueDays)
          estimatedReleaseDue = d.toISOString().split('T')[0]
        }
        const client = p.client as unknown as { id: string; company_name: string | null; contact_person: string } | null
        return {
          project: { id: p.id, name: p.name, status: p.status, end_date: p.end_date },
          client: client ? { id: client.id, name: client.company_name ?? client.contact_person } : null,
          retention_pct: p.retention_pct != null ? Number(p.retention_pct) : null,
          contract_retention_amount: p.retention_amount != null ? Number(p.retention_amount) : null,
          withheld,
          released,
          outstanding,
          on_retention_termins: termins,
          estimated_release_due: estimatedReleaseDue,
          is_due_estimate: estimatedReleaseDue != null && estimatedReleaseDue <= today && outstanding > 0,
        }
      })
      .filter(r => r.withheld > 0 || r.released > 0 || r.on_retention_termins.length > 0)

    const total_outstanding = rows.reduce((s, r) => s + r.outstanding, 0)
    return { as_of: today, total_outstanding, rows }
  })

  // ── GET /api/v1/finance/dp-register ─────────────────────────────────────────
  // Per proyek: DP ditagih/terbayar (invoice termin on_sign) vs sudah dipotong
  // (Σ dp_deduction_amount) → sisa DP yang masih harus di-recoup di invoice
  // progres berikutnya. Basis saldo = DP TERBAYAR (bukan sekadar ditagih).
  app.get('/api/v1/finance/dp-register', {
    preHandler: [authenticate, requirePermission('finance:view:all')]
  }, async (_request, reply) => {
    const idProyekDp = await _request.db!.projectIds()
    const [invRes, projRes] = await Promise.all([
      supabase.from('invoices')
        .select('project_id, total_amount, amount_paid, dp_deduction_amount, status, termin_schedules(trigger_type)')
        .in('project_id', idProyekDp)
        .neq('status', 'cancelled')
        .limit(2000),
      supabase.from('projects')
        .select('id, name, status, contract_value, is_deleted, client:clients(id, company_name, contact_person)')
        .eq('is_deleted', false)
        .limit(500),
    ])
    if (invRes.error) return reply.status(500).send({ error: invRes.error.message })
    if (projRes.error) return reply.status(500).send({ error: projRes.error.message })

    const agg = new Map<string, { dpBilled: number; dpPaid: number; recouped: number }>()
    const bump = (pid: string, fn: (a: { dpBilled: number; dpPaid: number; recouped: number }) => void) => {
      const a = agg.get(pid) ?? { dpBilled: 0, dpPaid: 0, recouped: 0 }
      fn(a); agg.set(pid, a)
    }
    for (const inv of invRes.data ?? []) {
      const embed = inv.termin_schedules as { trigger_type?: string } | { trigger_type?: string }[] | null
      const trig = (Array.isArray(embed) ? embed[0] : embed)?.trigger_type
      if (trig === 'on_sign') {
        bump(inv.project_id, a => {
          a.dpBilled += Number(inv.total_amount ?? 0)
          a.dpPaid += Number(inv.amount_paid ?? 0)
        })
      }
      if (Number(inv.dp_deduction_amount ?? 0) > 0) {
        bump(inv.project_id, a => { a.recouped += Number(inv.dp_deduction_amount ?? 0) })
      }
    }

    const rows = (projRes.data ?? [])
      .filter(p => agg.has(p.id))
      .map(p => {
        const a = agg.get(p.id)!
        const client = p.client as unknown as { id: string; company_name: string | null; contact_person: string } | null
        return {
          project: { id: p.id, name: p.name, status: p.status, contract_value: Number(p.contract_value ?? 0) },
          client: client ? { id: client.id, name: client.company_name ?? client.contact_person } : null,
          dp_billed: a.dpBilled,
          dp_paid: a.dpPaid,
          recouped: a.recouped,
          remaining_to_recoup: a.dpPaid - a.recouped,
        }
      })

    const total_remaining = rows.reduce((s, r) => s + r.remaining_to_recoup, 0)
    return { total_remaining_to_recoup: total_remaining, rows }
  })

  // ── POST /api/v1/finance/invoices ────────────────────────────────────────────
  // Buat invoice baru — mendukung semua tipe:
  //   termin_billing    : tagih termin, wajib termin_schedule_id
  //   commission_billing: tagih total pengeluaran + fee komisi (model lama)
  //   expense_billing   : tagih pengeluaran spesifik via line_items (model baru)
  //   commission_fee    : invoice fee komisi saja, terpisah dari pengeluaran
  //   retention_release : pencairan retensi
  app.post('/api/v1/finance/invoices', {
    preHandler: [authenticate, requirePermission('finance:invoice:create')]
  }, async (request, reply) => {
    const body = request.body as {
      project_id: string
      invoice_type: 'termin_billing' | 'commission_billing' | 'expense_billing' | 'commission_fee' | 'retention_release'
      // Termin
      termin_schedule_id?: string
      // Legacy komisi
      base_amount?: number
      commission_amount?: number
      commission_pct?: number
      total_pengeluaran?: number
      // Expense billing — array of line items
      line_items?: Array<{
        expense_id?: string | null    // null = item manual
        description: string
        qty: number
        unit?: string
        unit_price: number
        amount: number               // nilai yang ditagihkan (bisa partial)
        sort_order?: number
        notes?: string
      }>
      // Commission fee
      commission_fee_amount?: number  // override auto-suggest
      // Shared
      tax_amount?: number
      retensi_pct?: number
      retensi_amount?: number
      // Potongan uang muka (DP recoupment) — hanya termin_billing non-on_sign (migration 124)
      dp_deduction_amount?: number
      dp_deduction_pct?: number
      due_date: string
      issued_date?: string
      notes?: string
      description?: string
    }

    if (!body.project_id || !body.invoice_type || !body.due_date) {
      return reply.status(400).send({ error: 'Field wajib: project_id, invoice_type, due_date' })
    }

    // ── Validasi per tipe ────────────────────────────────────────────────────

    if (body.invoice_type === 'termin_billing' && !body.termin_schedule_id) {
      return reply.status(400).send({ error: 'termin_billing membutuhkan termin_schedule_id' })
    }

    if (body.invoice_type === 'expense_billing') {
      if (!body.line_items || body.line_items.length === 0) {
        return reply.status(400).send({ error: 'expense_billing membutuhkan minimal 1 line item' })
      }
      for (const item of body.line_items) {
        if (!item.description || !item.amount || item.amount <= 0) {
          return reply.status(400).send({ error: 'Setiap line item harus punya description dan amount > 0' })
        }
      }
    }

    if ((body.invoice_type === 'commission_billing' || body.invoice_type === 'commission_fee') && !body.base_amount && !body.commission_fee_amount) {
      return reply.status(400).send({ error: 'commission_billing / commission_fee membutuhkan base_amount atau commission_fee_amount' })
    }

    // ── Validasi project exists dan akses ────────────────────────────────────
    const { data: project } = await supabase
      .from('projects')
      .select('id, pm_id, commission_pct, is_deleted')
      .eq('id', body.project_id)
      .single()
    if (!project || project.is_deleted) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    // PM hanya bisa buat invoice untuk proyek sendiri; admin bebas
    const currentUser = (request as any).currentUser!
    if (currentUser.role === 'pm' && project.pm_id !== currentUser.id) {
      return reply.status(403).send({ error: 'Anda tidak memiliki akses ke proyek ini' })
    }

    // ── Validasi termin jika termin_billing ──────────────────────────────────
    let terminTriggerType: string | null = null
    if (body.termin_schedule_id) {
      const { data: termin } = await supabase
        .from('termin_schedules')
        .select('id, status, project_id, trigger_type')
        .eq('id', body.termin_schedule_id)
        .single()
      if (!termin) return reply.status(404).send({ error: 'Termin tidak ditemukan' })
      if (termin.project_id !== body.project_id) {
        return reply.status(400).send({ error: 'Termin bukan milik proyek ini' })
      }
      if (termin.status === 'billed' || termin.status === 'paid') {
        return reply.status(400).send({ error: 'Termin ini sudah pernah ditagih' })
      }
      terminTriggerType = termin.trigger_type ?? null
    }

    // ── Validasi expense line items (expense_billing) ────────────────────────
    if (body.invoice_type === 'expense_billing' && body.line_items) {
      const expenseIds = body.line_items.map(i => i.expense_id).filter(Boolean) as string[]
      if (expenseIds.length > 0) {
        const { data: expenses } = await supabase
          .from('project_expenses')
          .select('id, project_id, status, total_amount, billed_amount')
          .in('id', expenseIds)

        for (const item of body.line_items) {
          if (!item.expense_id) continue
          const exp = expenses?.find(e => e.id === item.expense_id)
          if (!exp) return reply.status(400).send({ error: `Pengeluaran ${item.expense_id} tidak ditemukan` })
          if (exp.project_id !== body.project_id) {
            return reply.status(400).send({ error: `Pengeluaran ${item.expense_id} bukan milik proyek ini` })
          }
          if (exp.status !== 'approved') {
            return reply.status(400).send({ error: `Pengeluaran "${item.description}" belum disetujui` })
          }
          const remaining = Number(exp.total_amount) - Number(exp.billed_amount)
          if (item.amount > remaining + 0.01) { // 0.01 tolerance for float
            return reply.status(400).send({
              error: `Pengeluaran "${item.description}" hanya tersisa Rp ${remaining.toLocaleString('id-ID')} yang bisa ditagihkan`
            })
          }
        }

        // Cek tidak ada expense_id yang sudah di-link di invoice lain (selain jika fully billed)
        if (expenseIds.length > 0) {
          const { data: existingLines } = await supabase
            .from('invoice_line_items')
            .select('expense_id, invoice_id')
            .in('expense_id', expenseIds)
          if (existingLines && existingLines.length > 0) {
            // Fetch expenses remaining sekali lagi untuk cek
            const alreadyBilled = existingLines.map(l => l.expense_id)
            const { data: checkExp } = await supabase
              .from('project_expenses')
              .select('id, total_amount, billed_amount, description')
              .in('id', alreadyBilled)
            for (const exp of checkExp ?? []) {
              const remaining = Number(exp.total_amount) - Number(exp.billed_amount)
              const reqItem = body.line_items.find(i => i.expense_id === exp.id)
              if (reqItem && reqItem.amount > remaining + 0.01) {
                return reply.status(400).send({ error: `Pengeluaran "${exp.description}" sudah pernah ditagihkan sebagian — sisa Rp ${remaining.toLocaleString('id-ID')}` })
              }
            }
          }
        }
      }
    }

    // ── Hitung amount ────────────────────────────────────────────────────────
    let baseAmount = 0
    let commissionAmount = 0

    if (body.invoice_type === 'expense_billing') {
      // base = sum semua line items
      baseAmount = (body.line_items ?? []).reduce((s, i) => s + Number(i.amount), 0)
    } else if (body.invoice_type === 'commission_fee') {
      // Fee komisi saja — amount sudah dihitung di frontend (auto-suggest atau manual)
      baseAmount = Number(body.commission_fee_amount ?? body.base_amount ?? 0)
    } else {
      baseAmount = Number(body.base_amount ?? 0)
      commissionAmount = Number(body.commission_amount ?? 0)
    }

    if (baseAmount <= 0 && body.invoice_type !== 'retention_release') {
      return reply.status(400).send({ error: 'Total invoice harus lebih dari 0' })
    }

    const taxAmount     = Number(body.tax_amount ?? 0)
    const retensiAmount = Number(body.retensi_amount ?? 0)

    // ── Potongan uang muka (DP recoupment) — PETA §3 #3, migration 124 ───────
    // Hanya invoice termin progres (bukan termin on_sign = invoice DP itu
    // sendiri). Saldo = DP TERBAYAR (Σ amount_paid invoice termin on_sign) −
    // yang sudah dipotong di invoice lain. Fail-closed via validateDpDeduction.
    const dpDeduction = Number(body.dp_deduction_amount ?? 0)
    if (dpDeduction > 0) {
      if (body.invoice_type !== 'termin_billing') {
        return reply.status(400).send({ error: 'Potongan uang muka hanya berlaku untuk invoice termin (progres)' })
      }
      if (terminTriggerType === 'on_sign') {
        return reply.status(400).send({ error: 'Tidak bisa memotong uang muka pada invoice DP (termin on_sign) itu sendiri' })
      }

      const { data: projInvoices, error: dpErr } = await supabase
        .from('invoices')
        .select('amount_paid, dp_deduction_amount, status, termin_schedules(trigger_type)')
        .eq('project_id', body.project_id)
        .neq('status', 'cancelled')
      if (dpErr) return reply.status(500).send({ error: dpErr.message })

      let dpPaid = 0
      let alreadyRecouped = 0
      for (const inv of projInvoices ?? []) {
        const embed = inv.termin_schedules as { trigger_type?: string } | { trigger_type?: string }[] | null
        const trig = (Array.isArray(embed) ? embed[0] : embed)?.trigger_type
        if (trig === 'on_sign') dpPaid += Number(inv.amount_paid ?? 0)
        alreadyRecouped += Number(inv.dp_deduction_amount ?? 0)
      }

      const verdict = validateDpDeduction({
        deduction: dpDeduction,
        dpPaid,
        alreadyRecouped,
        invoiceNet: baseAmount + commissionAmount - retensiAmount,
      })
      if (!verdict.ok) return reply.status(400).send({ error: verdict.error })
    }

    const totalAmount   = parseFloat((baseAmount + commissionAmount - retensiAmount - dpDeduction + taxAmount).toFixed(2))

    // ── Generate nomor invoice ───────────────────────────────────────────────
    const { data: companyRow } = await supabase
      .from('company_profile')
      .select('invoice_prefix')
      .limit(1)
      .single()
    const prefix = companyRow?.invoice_prefix ?? 'INV'
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    // Sequence = MAX segmen terakhir nomor existing prefix bulan ini + 1.
    // Basis lama (COUNT per issued_date bulan berjalan) tabrakan saat ada
    // invoice terhapus atau issued_date backdate (nomor sama → unique violation).
    const numberPrefix = `${prefix}/${year}/${month}/`
    const { data: monthNumbers } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `${numberPrefix}%`)
    const maxSeq = (monthNumbers ?? []).reduce((max, r) => {
      const n = parseInt(String(r.invoice_number).slice(numberPrefix.length), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0)
    const seq = String(maxSeq + 1).padStart(3, '0')
    const invoiceNumber = `${numberPrefix}${seq}`
    const issuedDate = body.issued_date ?? now.toISOString().split('T')[0]

    // ── Insert invoice ───────────────────────────────────────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        project_id:         body.project_id,
        termin_schedule_id: body.termin_schedule_id ?? null,
        invoice_number:     invoiceNumber,
        invoice_type:       body.invoice_type,
        base_amount:        baseAmount,
        commission_amount:  commissionAmount,
        commission_pct:     body.commission_pct ?? null,
        total_pengeluaran:  body.total_pengeluaran ?? null,
        tax_amount:         taxAmount,
        retensi_pct:        body.retensi_pct ?? null,
        retensi_amount:     retensiAmount,
        dp_deduction_amount: dpDeduction,
        dp_deduction_pct:   body.dp_deduction_pct ?? null,
        total_amount:       totalAmount,
        amount_paid:        0,
        amount_due:         totalAmount,
        issued_date:        issuedDate,
        due_date:           body.due_date,
        status:             'sent',
        notes:              body.notes ?? null,
        description:        body.description ?? null,
        created_by:         currentUser.id,
      })
      .select('id, invoice_number, invoice_type, base_amount, total_amount, amount_due, issued_date, due_date, status, description, projects(id, name)')
      .single()

    if (invErr) return reply.status(500).send({ error: invErr.message })

    // Audit: pembuatan invoice — nilai tagihan (invoice.amount)
    void logAuditEvent(request, {
      tableName: 'invoices',
      recordId: invoice.id,
      action: 'invoice.amount',
      actorId: currentUser.id,
      newValues: { invoice_number: invoice.invoice_number, total_amount: totalAmount },
      severity: 'critical',
    })

    // ── Post-insert: insert line items (expense_billing) ─────────────────────
    if (body.invoice_type === 'expense_billing' && body.line_items && body.line_items.length > 0) {
      const lineRows = body.line_items.map((item, idx) => ({
        invoice_id:   invoice!.id,
        expense_id:   item.expense_id ?? null,
        description:  item.description,
        qty:          Number(item.qty ?? 1),
        unit:         item.unit ?? null,
        unit_price:   Number(item.unit_price ?? item.amount),
        amount:       Number(item.amount),
        sort_order:   item.sort_order ?? idx,
        notes:        item.notes ?? null,
      }))

      const { error: lineErr } = await supabase
        .from('invoice_line_items')
        .insert(lineRows)

      if (lineErr) {
        // Rollback: hapus invoice yang baru dibuat
        await supabase.from('invoices').delete().eq('id', invoice!.id)
        return reply.status(500).send({ error: `Gagal menyimpan line items: ${lineErr.message}` })
      }
      // billed_amount di project_expenses diupdate otomatis oleh trigger trg_sync_expense_billed_amount
    }

    // ── Post-insert: mark termin as billed ───────────────────────────────────
    if (body.termin_schedule_id) {
      await supabase
        .from('termin_schedules')
        .update({ status: 'billed', updated_at: new Date().toISOString() })
        .eq('id', body.termin_schedule_id)
    }

    // ── Fire-and-forget: notif ke admin saat invoice baru dibuat ─────────────
    if (invoice) {
      try {
        const adminIds = await resolveRecipients('invoice_created', { companyId: request.companyId! })
        const projName = (invoice.projects as any)?.name ?? ''
        createNotifications(adminIds.map(uid => ({
          user_id:     uid,
          title:       'Invoice Baru Dibuat',
          message:     `Invoice ${invoice.invoice_number} dibuat untuk proyek ${projName}`,
          type:        'invoice_created' as const,
          priority:    'normal' as const,
          project_id:  body.project_id,
          action_url:  '/keuangan?tab=invoice',
          action_type: 'view_invoice',
          action_data: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
        })))
      } catch { /* ignore */ }
    }

    return reply.status(201).send({ invoice })
  })

  // ── PATCH /api/v1/finance/invoices/:id/status ────────────────────────────────
  app.patch<{ Params: { id: string } }>('/api/v1/finance/invoices/:id/status', {
    preHandler: [authenticate, requirePermission('finance:invoice:create')]
  }, async (request, reply) => {
    const { id } = request.params
    const { status } = request.body as { status: string }
    const allowed = ['draft', 'sent', 'cancelled']
    if (!allowed.includes(status)) {
      return reply.status(400).send({ error: `Status harus salah satu dari: ${allowed.join(', ')}` })
    }
    const { data, error } = await supabase
      .from('invoices')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .single()
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ invoice: data })
  })

  // ── GET /api/v1/finance/payments ─────────────────────────────────────────────
  // History semua payment masuk
  app.get('/api/v1/finance/payments', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { limit = '50', offset = '0', month } = request.query as Record<string, string>
    const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
    const off = Math.max(0, Number(offset) || 0)

    let q = supabase
      .from('payments')
      .select(`
        id, amount_paid, payment_method, paid_at, ref_number,
        bank_name, notes, proof_url, created_at,
        invoices (
          id, invoice_number, invoice_type, total_amount,
          projects ( id, name )
        ),
        recorder:users!payments_recorded_by_fkey ( id, name ),
        cash_account:cash_accounts!payments_cash_account_id_fkey ( id, name, type )
      `)
      .order('paid_at', { ascending: false })
      .range(off, off + lim - 1)

    if (month) {
      // month format: "2026-06"
      const start = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const end = `${month}-${String(lastDay).padStart(2, '0')}`
      q = q.gte('paid_at', start).lte('paid_at', end)
    }

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ payments: data ?? [] })
  })

  // ── GET /api/v1/finance/cashflow ─────────────────────────────────────────────
  // Cashflow per bulan (6 bulan): semua masuk vs semua keluar
  app.get('/api/v1/finance/cashflow', {
    preHandler: [authenticate]
  }, async (_request, reply) => {
    const now = new Date()
    const months: { label: string; start: string; end: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      months.push({ label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }), start, end })
    }
    const rangeStart = months[0].start
    const rangeEnd = months[months.length - 1].end

    const dbCf = _request.db!
    const [idInvCf, idAsgCf] = await Promise.all([dbCf.invoiceIds(), dbCf.assignmentIds()])
    const idProyekCf = await dbCf.projectIds()
    const [paymentsRes, kasbonsRes, expensesRes, wagesRes] = await Promise.all([
      supabase.from('payments').select('amount_paid, paid_at')
        .in('invoice_id', idInvCf).gte('paid_at', rangeStart).lte('paid_at', rangeEnd),
      dbCf.from('kasbons').select('amount, kasbon_date').eq('status', 'approved')
        .gte('kasbon_date', rangeStart).lte('kasbon_date', rangeEnd),
      supabase.from('project_expenses').select('total_amount, expense_date')
        .in('project_id', idProyekCf).eq('status', 'approved')
        .gte('expense_date', rangeStart).lte('expense_date', rangeEnd),
      supabase.from('weekly_wage_reports').select('net_amount, paid_at')
        .in('assignment_id', idAsgCf).eq('status', 'paid')
        .gte('paid_at', rangeStart).lte('paid_at', rangeEnd),
    ])

    const payments = paymentsRes.data ?? []
    const kasbons  = kasbonsRes.data ?? []
    const expenses = expensesRes.data ?? []
    const wages    = wagesRes.data ?? []

    const chartData = months.map(({ label, start, end }) => {
      const masuk = payments.filter(p => p.paid_at >= start && p.paid_at <= end)
        .reduce((s, p) => s + Number(p.amount_paid), 0)

      const keluarKasbon = kasbons
        .filter(k => k.kasbon_date && k.kasbon_date >= start && k.kasbon_date <= end)
        .reduce((s, k) => s + Number(k.amount), 0)
      const keluarExpense = expenses.filter(e => e.expense_date >= start && e.expense_date <= end)
        .reduce((s, e) => s + Number(e.total_amount), 0)
      const keluarUpah = wages.filter(w => w.paid_at && w.paid_at >= start && w.paid_at <= end)
        .reduce((s, w) => s + Number(w.net_amount), 0)
      const keluar = keluarKasbon + keluarExpense + keluarUpah

      return { label, masuk, keluar, net: masuk - keluar, keluarKasbon, keluarExpense, keluarUpah }
    })

    return reply.send({ chartData })
  })

  // ── GET /api/v1/finance/kasbon-summary ──────────────────────────────────────
  // Summary kasbon per mandor: total, breakdown per purpose, per project
  app.get('/api/v1/finance/kasbon-summary', {
    preHandler: [authenticate]
  }, async (_request, reply) => {
    // Step 1: Ambil semua kasbons (flat, tanpa nested join yang rawan null)
    const { data: kasbons, error: kErr } = await supabase
      .from('kasbons')
      .select('id, amount, purpose, fund_source, status, kasbon_date, work_scope_id')
      .in('status', ['approved', 'pending', 'settled'])
      .order('kasbon_date', { ascending: false })

    if (kErr) return reply.status(500).send({ error: kErr.message })
    const rows = kasbons ?? []

    // Step 2: Resolve mandor + project per work_scope_id via work_scopes → mandor_assignments
    const scopeIds = [...new Set(rows.map(r => r.work_scope_id).filter(Boolean))]
    const scopeMap: Record<string, { mandorId: string; mandorName: string; projectId: string; projectName: string }> = {}

    if (scopeIds.length > 0) {
      // work_scopes.assignment_id → mandor_assignments.id (bukan work_scope_id)
      const { data: scopeData } = await supabase
        .from('work_scopes')
        .select(`
          id,
          assignment:mandor_assignments!work_scopes_assignment_id_fkey (
            id,
            mandor:users!mandor_assignments_mandor_id_fkey ( id, name ),
            projects ( id, name )
          )
        `)
        .in('id', scopeIds)

      for (const s of scopeData ?? []) {
        const a = s.assignment as any
        const m = a?.mandor
        const p = a?.projects
        if (m && s.id) {
          scopeMap[s.id] = {
            mandorId: m.id,
            mandorName: m.name,
            projectId: p?.id ?? '',
            projectName: p?.name ?? '',
          }
        }
      }
    }

    // Step 3: Group per mandor menggunakan scopeMap
    const mandorMap = new Map<string, {
      mandorId: string; mandorName: string;
      projects: Map<string, string>;
      total: number; totalApproved: number; totalPending: number; totalSettled: number;
      byPurpose: Record<string, number>;
      byProject: Record<string, { name: string; total: number }>;
      kasbonCount: number;
    }>()

    for (const k of rows) {
      const scope = k.work_scope_id ? scopeMap[k.work_scope_id] : null
      if (!scope) continue

      if (!mandorMap.has(scope.mandorId)) {
        mandorMap.set(scope.mandorId, {
          mandorId: scope.mandorId, mandorName: scope.mandorName,
          projects: new Map(),
          total: 0, totalApproved: 0, totalPending: 0, totalSettled: 0,
          byPurpose: {}, byProject: {}, kasbonCount: 0,
        })
      }
      const entry = mandorMap.get(scope.mandorId)!
      const amt = Number(k.amount)

      entry.total += amt
      entry.kasbonCount++
      if (k.status === 'approved') entry.totalApproved += amt
      else if (k.status === 'pending') entry.totalPending += amt
      else if (k.status === 'settled') entry.totalSettled += amt

      entry.byPurpose[k.purpose] = (entry.byPurpose[k.purpose] ?? 0) + amt

      if (scope.projectId) {
        entry.projects.set(scope.projectId, scope.projectName)
        if (!entry.byProject[scope.projectId]) {
          entry.byProject[scope.projectId] = { name: scope.projectName, total: 0 }
        }
        entry.byProject[scope.projectId].total += amt
      }
    }

    const summary = Array.from(mandorMap.values()).map(e => ({
      mandorId: e.mandorId,
      mandorName: e.mandorName,
      projectCount: e.projects.size,
      total: e.total,
      totalApproved: e.totalApproved,
      totalPending: e.totalPending,
      totalSettled: e.totalSettled,
      byPurpose: e.byPurpose,
      byProject: Object.values(e.byProject),
      kasbonCount: e.kasbonCount,
    })).sort((a, b) => b.total - a.total)

    // Grand total per purpose (approved + settled saja)
    const grandByPurpose: Record<string, number> = {}
    for (const k of rows) {
      if (k.status === 'approved' || k.status === 'settled') {
        grandByPurpose[k.purpose] = (grandByPurpose[k.purpose] ?? 0) + Number(k.amount)
      }
    }

    return reply.send({ summary, grandByPurpose, totalKasbons: rows.length })
  })

  // ── GET /api/v1/finance/kasbons ──────────────────────────────────────────────
  // List semua kasbon lintas proyek (admin/PM view) — single joined query, no N+1
  app.get('/api/v1/finance/kasbons', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { status, limit = '100', offset = '0' } = request.query as Record<string, string>
    const lim = Math.min(Math.max(1, Number(limit) || 100), 200)
    const off = Math.max(0, Number(offset) || 0)

    let q = supabase
      .from('kasbons')
      .select(`
        id, amount, fund_source, purpose, kasbon_date, work_scope_id,
        status, notes, created_at, approved_at,
        work_scopes (
          id, scope_name,
          assignment:mandor_assignments!work_scopes_assignment_id_fkey (
            mandor:users!mandor_assignments_mandor_id_fkey ( id, name, phone ),
            projects ( id, name )
          )
        ),
        requester:users!kasbons_requested_by_fkey ( id, name ),
        approver:users!kasbons_approved_by_fkey ( id, name ),
        cash_account:cash_accounts!kasbons_cash_account_id_fkey ( id, name, type )
      `)
      .order('kasbon_date', { ascending: false })
      .range(off, off + lim - 1)

    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ kasbons: data ?? [] })
  })

  // ── POST /api/v1/finance/invoice/:id/pay ────────────────────────────────────
  // Catat pembayaran untuk invoice tertentu (multipart, bisa upload bukti)
  app.post<{ Params: { id: string } }>('/api/v1/finance/invoice/:id/pay', {
    preHandler: [authenticate, requirePermission('finance:invoice:pay')]
  }, async (request, reply) => {
    const { id } = request.params

    // Ambil data invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, status, total_amount, amount_paid, amount_due, project_id, due_date, penalty_waived')
      .eq('id', id)
      .single()

    if (invErr || !invoice) return reply.status(404).send({ error: 'Invoice tidak ditemukan' })
    if (invoice.status === 'cancelled') return reply.status(400).send({ error: 'Invoice sudah dibatalkan' })
    if (invoice.status === 'paid') return reply.status(400).send({ error: 'Invoice sudah lunas' })

    // Parse multipart
    const parts = request.parts()
    const fields: Record<string, string> = {}
    let proofUrl: string | null = null

    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'proof') {
          const buf = await part.toBuffer()
          let detectedMime: string
          try {
            detectedMime = validateMime(buf, ALLOWED_IMAGE_PDF)
          } catch (e: unknown) {
            return reply.status(400).send({ error: (e as Error).message })
          }
          const ext = detectedMime.split('/')[1].replace('jpeg', 'jpg')
          const filename = `invoices/${id}/bukti-${Date.now()}.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('payment-proofs')
            .upload(filename, buf, { contentType: detectedMime, upsert: false })
          if (!uploadErr) {
            // Bucket privat (migration 097): signed URL, bukan public URL (pola documents.ts).
            const { data: urlData } = await supabase.storage.from('payment-proofs')
              .createSignedUrl(filename, 60 * 60 * 24 * 365 * 10)
            proofUrl = urlData?.signedUrl ?? null
          }
        } else {
          await part.toBuffer()
        }
      } else {
        fields[part.fieldname] = (part as any).value as string
      }
    }

    const amountPaid = parseFloat(fields.amount_paid ?? '0')
    const paidAt = fields.paid_at
    const paymentMethod = fields.payment_method ?? 'transfer_bank'
    const cashAccountId = fields.cash_account_id || null

    if (!paidAt || isNaN(amountPaid) || amountPaid <= 0) {
      return reply.status(400).send({ error: 'paid_at dan amount_paid wajib diisi' })
    }

    // Validasi cash account jika disertakan
    if (cashAccountId) {
      const { data: acct } = await supabase
        .from('cash_accounts')
        .select('id, is_active')
        .eq('id', cashAccountId)
        .single()
      if (!acct || !acct.is_active) {
        return reply.status(400).send({ error: 'Akun kas tidak valid atau tidak aktif' })
      }
    }

    // Insert payment (trigger akan update saldo kas otomatis)
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        invoice_id: id,
        amount_paid: amountPaid,
        paid_at: paidAt,
        payment_method: paymentMethod,
        ref_number: fields.ref_number || null,
        bank_name: fields.bank_name || null,
        notes: fields.notes || null,
        proof_url: proofUrl,
        cash_account_id: cashAccountId,
        recorded_by: request.currentUser!.id,
      })
      .select('id, amount_paid, paid_at')
      .single()

    if (payErr) return reply.status(500).send({ error: payErr.message })

    // Update invoice amounts
    const newPaid = Number(invoice.amount_paid) + amountPaid
    const newDue = Math.max(0, Number(invoice.total_amount) - newPaid)
    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : invoice.status
    const paidDate = newDue <= 0 ? paidAt : null

    await supabase
      .from('invoices')
      .update({
        amount_paid: newPaid,
        amount_due: newDue,
        status: newStatus,
        paid_date: paidDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    // ── Denda otoritatif: saat invoice LUNAS telat, hitung sekali & persist ──────
    // Fire-and-forget: TIDAK memblokir/ menggagalkan pencatatan pembayaran. Default OFF →
    // computeAndPersistPenalty balik 'disabled' tanpa efek. Anchor hari telat = paidAt.
    if (newStatus === 'paid') {
      void (async () => {
        try {
          const { data: proj } = await supabase.from('projects')
            .select('id, contract_value, penalty_enabled, penalty_basis, penalty_rate_per_day, penalty_cap_pct, penalty_grace_days')
            .eq('id', invoice.project_id).maybeSingle()
          await computeAndPersistPenalty({
            invoice: { id: invoice.id, project_id: invoice.project_id, total_amount: invoice.total_amount, due_date: (invoice as { due_date: string }).due_date, penalty_waived: (invoice as { penalty_waived?: boolean }).penalty_waived },
            project: proj, paidDate: paidAt, createdBy: request.currentUser!.id,
          })
        } catch { /* never block payment */ }
      })()
    }

    // ── Fire-and-forget: notif ke admin + PM saat pembayaran diterima ────────
    try {
      const recipients = await resolveRecipients('invoice_paid', { projectId: invoice.project_id, companyId: request.companyId! })
      const amtFmt = amountPaid.toLocaleString('id-ID')
      createNotifications(recipients.map(uid => ({
        user_id:     uid,
        title:       'Pembayaran Invoice Diterima',
        message:     `Pembayaran Rp ${amtFmt} diterima untuk proyek — status invoice: ${newStatus}`,
        type:        'invoice_paid' as const,
        priority:    'normal' as const,
        project_id:  invoice.project_id,
        action_url:  '/keuangan?tab=invoice',
        action_type: 'view_invoice',
        action_data: { invoice_id: id, amount_paid: amountPaid },
      })))
    } catch { /* ignore */ }

    return reply.status(201).send({ payment, invoiceStatus: newStatus })
  })

  // ── PATCH /api/v1/finance/invoice/:id/waive-penalty ─────────────────────────
  // Putihkan (waive) / batalkan pemutihan denda invoice. ALASAN WAJIB. Gated
  // finance:penalty:waive + audit critical (cegah "akali dgn ubah tanggal" — syarat #3).
  app.patch<{ Params: { id: string } }>('/api/v1/finance/invoice/:id/waive-penalty', {
    preHandler: [authenticate, requirePermission('finance:penalty:waive')],
  }, async (request, reply) => {
    const { id } = request.params
    const body = request.body as { waived?: boolean; reason?: string }
    const waived = body.waived !== false // default true (memutihkan)
    if (!body.reason || !String(body.reason).trim()) {
      return reply.status(400).send({ error: 'Alasan wajib diisi (tercatat di audit)' })
    }
    const { data: prev } = await supabase.from('invoices')
      .select('id, penalty_waived, penalty_waived_reason').eq('id', id).maybeSingle()
    if (!prev) return reply.status(404).send({ error: 'Invoice tidak ditemukan' })

    const { error } = await supabase.from('invoices').update({
      penalty_waived: waived,
      penalty_waived_reason: String(body.reason).trim(),
      penalty_waived_by: request.currentUser!.id,
      penalty_waived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })

    // Waiver membebaskan denda: void angka otoritatif yang mungkin sudah dipersist
    // (kasus: invoice lunas telat lalu diputihkan). Peristiwa waive tetap terekam audit.
    if (waived) {
      await supabase.from('invoice_penalties').delete().eq('invoice_id', id)
    }

    void logAuditEvent(request, {
      tableName: 'invoices', recordId: id, action: waived ? 'penalty.waive' : 'penalty.unwaive',
      actorId: request.currentUser!.id,
      oldValues: { penalty_waived: prev.penalty_waived ?? false },
      newValues: { penalty_waived: waived, reason: String(body.reason).trim() },
      severity: 'critical',
    })
    return reply.send({ ok: true, penalty_waived: waived })
  })

  // ── GET /api/v1/finance/invoice/:id/penalty ─────────────────────────────────
  // Denda invoice: angka OTORITATIF (dipersist, jika ada) + ESTIMASI on-read (tampilan,
  // dilabeli 'estimate' + as_of, BUKAN angka resmi — menutup lubang event-driven #4).
  app.get<{ Params: { id: string } }>('/api/v1/finance/invoice/:id/penalty', {
    preHandler: [authenticate, requirePermission('finance:view:all')],
  }, async (request, reply) => {
    const { id } = request.params
    const { data: inv } = await supabase.from('invoices')
      .select('id, project_id, total_amount, due_date, status, penalty_waived, penalty_waived_reason')
      .eq('id', id).maybeSingle()
    if (!inv) return reply.status(404).send({ error: 'Invoice tidak ditemukan' })

    const { data: proj } = inv.project_id
      ? await supabase.from('projects')
          .select('id, contract_value, penalty_enabled, penalty_basis, penalty_rate_per_day, penalty_cap_pct, penalty_grace_days')
          .eq('id', inv.project_id).maybeSingle()
      : { data: null }

    const { data: authoritative } = await supabase.from('invoice_penalties')
      .select('*').eq('invoice_id', id).maybeSingle()

    const estimate = await estimatePenalty({ invoice: inv, project: proj })
    return reply.send({
      invoice_id: id,
      waived: inv.penalty_waived === true,
      waived_reason: inv.penalty_waived_reason ?? null,
      authoritative: authoritative ?? null,   // angka resmi (immutable) bila invoice sudah lunas telat
      estimate,                                // estimasi tampilan (as_of), non-otoritatif
    })
  })

  // ── GET /api/v1/finance/cashflow-transactions ────────────────────────────────
  app.get('/api/v1/finance/cashflow-transactions', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>

    const now = new Date()
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const defaultTo   = now.toISOString().split('T')[0]

    const dateFrom    = q.date_from || defaultFrom
    const dateTo      = q.date_to   || defaultTo
    const projectId   = q.project_id || null
    const typeFilter  = q.type ? q.type.split(',').map(t => t.trim()) : ['payment', 'expense', 'wage', 'kasbon', 'progress_payment', 'settlement_borongan']
    const categoryId   = q.category_id || null
    const categoryName = q.category_name ? q.category_name.trim() : null

    const dateFromTs  = dateFrom + 'T00:00:00'
    const dateToTs    = dateTo   + 'T23:59:59'

    const queries: Promise<unknown>[] = []

    // 1. payments (masuk)
    if (typeFilter.includes('payment')) {
      let q1 = supabase
        .from('payments')
        .select(`id, amount_paid, paid_at, payment_method, notes,
          invoices!inner(id, invoice_number, project_id,
            projects!inner(id, name))`)
        .gte('paid_at', dateFromTs).lte('paid_at', dateToTs)
      if (projectId) q1 = q1.eq('invoices.project_id', projectId)
      queries.push(Promise.resolve(q1).then(r => ({ src: 'payment', data: r.data, error: r.error })))
    } else {
      queries.push(Promise.resolve({ src: 'payment', data: [], error: null }))
    }

    // 2. project_expenses (keluar)
    if (typeFilter.includes('expense')) {
      let q2 = supabase
        .from('project_expenses')
        .select(`id, description, total_amount, expense_date, expense_source, vendor_name, project_id,
          projects(id, name),
          category:project_expense_categories(id, name, type, parent_id)`)
        .eq('status', 'approved')
        .gte('expense_date', dateFromTs.split('T')[0]).lte('expense_date', dateToTs.split('T')[0])
      if (projectId) q2 = q2.eq('project_id', projectId)
      if (categoryId) q2 = q2.eq('category_id', categoryId)
      queries.push(Promise.resolve(q2).then(r => ({ src: 'expense', data: r.data, error: r.error })))
    } else {
      queries.push(Promise.resolve({ src: 'expense', data: [], error: null }))
    }

    // 3. weekly_wage_reports (keluar)
    if (typeFilter.includes('wage')) {
      let q3 = supabase
        .from('weekly_wage_reports')
        .select(`id, net_amount, paid_at, week_start, week_end,
          assignment:mandor_assignments!inner(id, project_id,
            mandor:users!mandor_assignments_mandor_id_fkey(id, name),
            projects!inner(id, name)),
          scope:work_scopes(id, scope_name)`)
        .eq('status', 'paid')
        .gte('paid_at', dateFromTs).lte('paid_at', dateToTs)
      if (projectId) q3 = q3.eq('assignment.project_id', projectId)
      queries.push(Promise.resolve(q3).then(r => ({ src: 'wage', data: r.data, error: r.error })))
    } else {
      queries.push(Promise.resolve({ src: 'wage', data: [], error: null }))
    }

    // 4. kasbons (keluar)
    if (typeFilter.includes('kasbon')) {
      // Use kasbon_date (DATE NOT NULL) instead of approved_at (nullable TIMESTAMPTZ)
      let q4 = supabase
        .from('kasbons')
        .select(`id, amount, purpose, fund_source, kasbon_date, approved_at,
          scope:work_scopes!inner(id, scope_name,
            assignment:mandor_assignments!inner(id, project_id,
              mandor:users!mandor_assignments_mandor_id_fkey(id, name),
              projects!inner(id, name)))`)
        .in('status', ['approved', 'settled'])
        .gte('kasbon_date', dateFrom).lte('kasbon_date', dateTo)
      if (projectId) q4 = q4.eq('scope.assignment.project_id', projectId)
      queries.push(Promise.resolve(q4).then(r => ({ src: 'kasbon', data: r.data, error: r.error })))
    } else {
      queries.push(Promise.resolve({ src: 'kasbon', data: [], error: null }))
    }

    // 5. progress_payments (keluar — bayar progress% mandor)
    if (typeFilter.includes('progress_payment')) {
      let q5 = supabase
        .from('progress_payments')
        .select(`id, gross_payment, paid_at, pct_completed,
          scope:work_scopes!inner(id, scope_name,
            assignment:mandor_assignments!inner(id, project_id,
              mandor:users!mandor_assignments_mandor_id_fkey(id, name),
              projects!inner(id, name)))`)
        .eq('status', 'approved')
        .not('paid_at', 'is', null)
        .gte('paid_at', dateFromTs).lte('paid_at', dateToTs)
      if (projectId) q5 = q5.eq('scope.assignment.project_id', projectId)
      queries.push(Promise.resolve(q5).then(r => ({ src: 'progress_payment', data: r.data, error: r.error })))
    } else {
      queries.push(Promise.resolve({ src: 'progress_payment', data: [], error: null }))
    }

    // 6. borongan_settlements (keluar — settlement akhir borongan)
    if (typeFilter.includes('settlement_borongan')) {
      let q6 = supabase
        .from('borongan_settlements')
        .select(`id, net_payment, settled_at,
          scope:work_scopes!inner(id, scope_name,
            assignment:mandor_assignments!inner(id, project_id,
              mandor:users!mandor_assignments_mandor_id_fkey(id, name),
              projects!inner(id, name)))`)
        .not('settled_at', 'is', null)
        .gte('settled_at', dateFromTs).lte('settled_at', dateToTs)
      if (projectId) q6 = q6.eq('scope.assignment.project_id', projectId)
      queries.push(Promise.resolve(q6).then(r => ({ src: 'settlement_borongan', data: r.data, error: r.error })))
    } else {
      queries.push(Promise.resolve({ src: 'settlement_borongan', data: [], error: null }))
    }

    // Fetch kategori untuk resolve parent name (paralel dengan queries di atas sudah selesai)
    const catScope = projectId
      ? supabase.from('project_expense_categories').select('id, name, parent_id').eq('project_id', projectId)
      : supabase.from('project_expense_categories').select('id, name, parent_id')
    const [results, { data: allCats }] = await Promise.all([
      Promise.all(queries) as Promise<Array<{ src: string; data: unknown[] | null; error: unknown }>>,
      catScope,
    ])
     
    const catNameMap = new Map<string, string>((allCats ?? []).map((c: any) => [c.id, c.name]))

    const purposeLabel: Record<string, string> = {
      gaji_tukang: 'Gaji Tukang', uang_makan: 'Uang Makan',
      pembelian_alat: 'Pembelian Alat', operasional: 'Operasional', lain_lain: 'Lain-lain',
    }

     
    const txns: any[] = []
    let totalIn = 0, totalOut = 0
    let byTypePayment = 0, byTypeExpense = 0, byTypeWage = 0, byTypeKasbon = 0, byTypeProgressPayment = 0, byTypeSettlementBorongan = 0

    for (const res of results) {
      if (!res.data) continue
       
      for (const row of res.data as any[]) {
        if (res.src === 'payment') {
          const amt = Number(row.amount_paid)
          totalIn += amt; byTypePayment += amt
          txns.push({
            id: row.id, type: 'payment', direction: 'in',
            date: row.paid_at,
            amount: amt,
            label: `Pembayaran Invoice ${row.invoices?.invoice_number || ''}`,
            project: row.invoices?.projects ? { id: row.invoices.projects.id, name: row.invoices.projects.name } : null,
            category: null,
            sub_label: row.payment_method || '',
            meta: { invoice_number: row.invoices?.invoice_number, notes: row.notes },
          })
        } else if (res.src === 'expense') {
          const cat = row.category
          // Apply category_name filter post-query (needed when no project_id, IDs differ per project)
          if (categoryName) {
            const catNameLower = categoryName.toLowerCase()
            const matchesSub = cat?.name?.toLowerCase() === catNameLower
            const matchesParent = cat?.parent_id
              ? (catNameMap.get(cat.parent_id) ?? '').toLowerCase() === catNameLower
              : cat?.name?.toLowerCase() === catNameLower
            if (!matchesSub && !matchesParent) continue
          }
          const amt = Number(row.total_amount)
          totalOut += amt; byTypeExpense += amt
          txns.push({
            id: row.id, type: 'expense', direction: 'out',
            date: row.expense_date,
            amount: amt,
            label: row.description || row.vendor_name || 'Pengeluaran',
            project: row.projects ? { id: row.projects.id, name: row.projects.name } : null,
            category: cat ? {
              id: cat.id, name: cat.name,
              parent_name: cat.parent_id ? (catNameMap.get(cat.parent_id) ?? null) : null,
            } : null,
            sub_label: row.vendor_name || '',
            meta: { vendor_name: row.vendor_name, expense_source: row.expense_source },
          })
        } else if (res.src === 'wage') {
          const amt = Number(row.net_amount)
          totalOut += amt; byTypeWage += amt
          const assignment = row.assignment
          txns.push({
            id: row.id, type: 'wage', direction: 'out',
            date: row.paid_at,
            amount: amt,
            label: `Upah ${assignment?.mandor?.name || 'Mandor'}`,
            project: assignment?.projects ? { id: assignment.projects.id, name: assignment.projects.name } : null,
            category: null,
            sub_label: `${row.week_start} – ${row.week_end}${row.scope ? ` · ${row.scope.scope_name}` : ''}`,
            meta: { week_start: row.week_start, week_end: row.week_end, scope: row.scope?.scope_name },
          })
        } else if (res.src === 'kasbon') {
          const amt = Number(row.amount)
          totalOut += amt; byTypeKasbon += amt
          const assignment = row.scope?.assignment
          txns.push({
            id: row.id, type: 'kasbon', direction: 'out',
            date: row.kasbon_date ?? row.approved_at,
            amount: amt,
            label: `Kasbon ${assignment?.mandor?.name || 'Mandor'}`,
            project: assignment?.projects ? { id: assignment.projects.id, name: assignment.projects.name } : null,
            category: null,
            sub_label: purposeLabel[row.purpose] || row.purpose,
            meta: { purpose: row.purpose, fund_source: row.fund_source, scope: row.scope?.scope_name },
          })
        } else if (res.src === 'progress_payment') {
          const amt = Number(row.gross_payment)
          totalOut += amt; byTypeProgressPayment += amt
          const assignment = row.scope?.assignment
          txns.push({
            id: row.id, type: 'progress_payment', direction: 'out',
            date: row.paid_at,
            amount: amt,
            label: `Bayar Progress ${row.pct_completed ?? 0}% · ${assignment?.mandor?.name || 'Mandor'}`,
            project: assignment?.projects ? { id: assignment.projects.id, name: assignment.projects.name } : null,
            category: null,
            sub_label: row.scope?.scope_name || '',
            meta: { pct_completed: row.pct_completed, scope: row.scope?.scope_name },
          })
        } else if (res.src === 'settlement_borongan') {
          const amt = Number(row.net_payment)
          totalOut += amt; byTypeSettlementBorongan += amt
          const assignment = row.scope?.assignment
          txns.push({
            id: row.id, type: 'settlement_borongan', direction: 'out',
            date: row.settled_at,
            amount: amt,
            label: `Settlement Borongan · ${assignment?.mandor?.name || 'Mandor'}`,
            project: assignment?.projects ? { id: assignment.projects.id, name: assignment.projects.name } : null,
            category: null,
            sub_label: row.scope?.scope_name || '',
            meta: { scope: row.scope?.scope_name },
          })
        }
      }
    }

    txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return reply.send({
      totalIn,
      totalOut,
      netFlow: totalIn - totalOut,
      byType: { payment: byTypePayment, expense: byTypeExpense, wage: byTypeWage, kasbon: byTypeKasbon, progress_payment: byTypeProgressPayment, settlement_borongan: byTypeSettlementBorongan },
      transactions: txns,
    })
  })

  // ── GET /api/v1/finance/billable-expenses ───────────────────────────────────
  // List pengeluaran proyek yang bisa ditagihkan ke klien:
  //   - status approved
  //   - billed_amount < total_amount (belum fully billed)
  // Digunakan untuk modal expense_billing agar PM bisa pilih item.
  app.get('/api/v1/finance/billable-expenses', {
    preHandler: [authenticate, requirePermission('finance:invoice:create')]
  }, async (request, reply) => {
    const { project_id } = request.query as Record<string, string>
    if (!project_id) {
      return reply.status(400).send({ error: 'project_id wajib diisi' })
    }

    // PM hanya bisa lihat proyek sendiri
    const currentUser = (request as any).currentUser!
    if (currentUser.role === 'pm') {
      const { data: proj } = await supabase
        .from('projects')
        .select('pm_id')
        .eq('id', project_id)
        .single()
      if (!proj || proj.pm_id !== currentUser.id) {
        return reply.status(403).send({ error: 'Anda tidak memiliki akses ke proyek ini' })
      }
    }

    const { data, error } = await supabase
      .from('project_expenses')
      .select(`
        id, description, expense_date, qty, unit, unit_price,
        total_amount, billed_amount, vendor_name, notes, receipt_url,
        category:project_expense_categories ( id, name, type )
      `)
      .eq('project_id', project_id)
      .eq('status', 'approved')
      .order('expense_date', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })

    // Filter di sisi JS karena Supabase tidak support kolom-vs-kolom comparison langsung
    const billable = (data ?? []).filter(e => Number(e.billed_amount) < Number(e.total_amount))

    return reply.send({
      expenses: billable.map(e => ({
        ...e,
        remaining: parseFloat((Number(e.total_amount) - Number(e.billed_amount)).toFixed(2)),
      }))
    })
  })

  // ── GET /api/v1/finance/commission-fee-suggest ───────────────────────────────
  // Hitung auto-suggest fee komisi berdasarkan total pengeluaran approved di proyek
  app.get('/api/v1/finance/commission-fee-suggest', {
    preHandler: [authenticate, requirePermission('finance:invoice:create')]
  }, async (request, reply) => {
    const { project_id } = request.query as Record<string, string>
    if (!project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })

    const currentUser = (request as any).currentUser!
    const { data: proj } = await supabase
      .from('projects')
      .select('id, pm_id, commission_pct, contract_value')
      .eq('id', project_id)
      .single()
    if (!proj) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    if (currentUser.role === 'pm' && proj.pm_id !== currentUser.id) {
      return reply.status(403).send({ error: 'Anda tidak memiliki akses ke proyek ini' })
    }

    // Total pengeluaran approved
    const { data: expenseSum } = await supabase
      .from('project_expenses')
      .select('total_amount')
      .eq('project_id', project_id)
      .eq('status', 'approved')

    const totalExpense = (expenseSum ?? []).reduce((s, e) => s + Number(e.total_amount), 0)
    const commissionPct = Number(proj.commission_pct ?? 0)
    const suggestedFee = parseFloat((totalExpense * commissionPct / 100).toFixed(2))

    // Total fee komisi yang sudah pernah ditagih (invoice commission_fee yang tidak cancelled)
    const { data: prevFeeInvoices } = await supabase
      .from('invoices')
      .select('base_amount')
      .eq('project_id', project_id)
      .eq('invoice_type', 'commission_fee')
      .neq('status', 'cancelled')

    const alreadyBilledFee = (prevFeeInvoices ?? []).reduce((s, i) => s + Number(i.base_amount), 0)
    const remainingFee = parseFloat((suggestedFee - alreadyBilledFee).toFixed(2))

    return reply.send({
      commission_pct: commissionPct,
      total_expense: totalExpense,
      suggested_fee: suggestedFee,
      already_billed_fee: alreadyBilledFee,
      remaining_fee: Math.max(0, remainingFee),
    })
  })

  // ── GET /api/v1/finance/invoice-line-items/:invoiceId ────────────────────────
  // List line items untuk invoice tertentu (dipakai di PDF dan detail view)
  app.get<{ Params: { invoiceId: string } }>('/api/v1/finance/invoice-line-items/:invoiceId', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { invoiceId } = request.params

    // Verifikasi invoice ada dan user punya akses
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, project_id, projects(pm_id)')
      .eq('id', invoiceId)
      .single()
    if (!inv) return reply.status(404).send({ error: 'Invoice tidak ditemukan' })

    const currentUser = (request as any).currentUser!
    const pmId = (inv.projects as any)?.pm_id
    if (currentUser.role === 'pm' && pmId !== currentUser.id) {
      return reply.status(403).send({ error: 'Anda tidak memiliki akses ke invoice ini' })
    }

    const { data, error } = await supabase
      .from('invoice_line_items')
      .select(`
        id, description, qty, unit, unit_price, amount, sort_order, notes,
        expense:project_expenses ( id, expense_date, vendor_name, receipt_url,
          category:project_expense_categories ( id, name ) )
      `)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ line_items: data ?? [] })
  })

  // ── GET /api/v1/finance/cashflow-chart ───────────────────────────────────────
  app.get('/api/v1/finance/cashflow-chart', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>

    const now = new Date()
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const defaultTo   = now.toISOString().split('T')[0]

    const dateFrom   = q.date_from || defaultFrom
    const dateTo     = q.date_to   || defaultTo
    const projectId  = q.project_id || null
    const typeFilter = q.type ? q.type.split(',').map(t => t.trim()) : ['payment', 'expense', 'wage', 'kasbon', 'progress_payment', 'settlement_borongan']

    const diffDays = Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000)
    const groupBy  = diffDays <= 31 ? 'day' : diffDays <= 90 ? 'week' : 'month'

    const dateFromTs = dateFrom + 'T00:00:00'
    const dateToTs   = dateTo   + 'T23:59:59'

    // T4c: arus kas juga agregat lintas-proyek. Saat `projectId` diberikan,
    // proyek itu WAJIB milik tenant ini — kalau tidak, siapa pun bisa membaca
    // arus kas proyek perusahaan lain hanya dengan menebak id-nya.
    const dbAk = request.db!
    const [idProyekAk, idInvAk, idAsgAk, idScopeAk] = await Promise.all([
      dbAk.projectIds(), dbAk.invoiceIds(), dbAk.assignmentIds(), dbAk.workScopeIds(),
    ])
    if (projectId && !idProyekAk.includes(projectId)) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }
    const proyekTerpakai = projectId ? [projectId] : idProyekAk
    const invTerpakai = projectId
      ? (await supabase.from('invoices').select('id').eq('project_id', projectId)).data?.map(r => r.id) ?? []
      : idInvAk

    const [payRes, expRes, wageRes, kasbonRes, ppRes, bsRes] = await Promise.all([
      typeFilter.includes('payment')
        ? supabase.from('payments').select('amount_paid, paid_at')
            .in('invoice_id', invTerpakai).gte('paid_at', dateFromTs).lte('paid_at', dateToTs)
        : Promise.resolve({ data: [] }),
      typeFilter.includes('expense')
        ? supabase.from('project_expenses').select('total_amount, expense_date')
            .in('project_id', proyekTerpakai).eq('status', 'approved')
            .gte('expense_date', dateFrom).lte('expense_date', dateTo)
        : Promise.resolve({ data: [] }),
      typeFilter.includes('wage')
        ? supabase.from('weekly_wage_reports').select('net_amount, paid_at')
            .in('assignment_id', idAsgAk).eq('status', 'paid')
            .gte('paid_at', dateFromTs).lte('paid_at', dateToTs)
        : Promise.resolve({ data: [] }),
      typeFilter.includes('kasbon')
        ? dbAk.from('kasbons').select('amount, kasbon_date')
            .in('status', ['approved', 'settled']).gte('kasbon_date', dateFrom).lte('kasbon_date', dateTo)
        : Promise.resolve({ data: [] }),
      typeFilter.includes('progress_payment')
        ? supabase.from('progress_payments').select('gross_payment, paid_at')
            .in('work_scope_id', idScopeAk).eq('status', 'approved').not('paid_at', 'is', null)
            .gte('paid_at', dateFromTs).lte('paid_at', dateToTs)
        : Promise.resolve({ data: [] }),
      typeFilter.includes('settlement_borongan')
        ? supabase.from('borongan_settlements').select('net_payment, settled_at')
            .in('work_scope_id', idScopeAk).not('settled_at', 'is', null)
            .gte('settled_at', dateFromTs).lte('settled_at', dateToTs)
        : Promise.resolve({ data: [] }),
    ])

    const periodMap = new Map<string, { masuk: number; keluar: number }>()

    const getPeriod = (dateStr: string) => {
      const d = new Date(dateStr)
      if (groupBy === 'day') return d.toISOString().split('T')[0]
      if (groupBy === 'week') {
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1)
        const mon = new Date(d.setDate(diff))
        return mon.toISOString().split('T')[0]
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    const add = (dateStr: string | null | undefined, masuk: number, keluar: number) => {
      if (!dateStr) return
      const p = getPeriod(dateStr)
      const cur = periodMap.get(p) || { masuk: 0, keluar: 0 }
      periodMap.set(p, { masuk: cur.masuk + masuk, keluar: cur.keluar + keluar })
    }

     
    for (const row of (payRes.data || []) as any[]) add(row.paid_at, Number(row.amount_paid), 0)
     
    for (const row of (expRes.data || []) as any[]) add(row.expense_date, 0, Number(row.total_amount))
     
    for (const row of (wageRes.data || []) as any[]) add(row.paid_at, 0, Number(row.net_amount))
     
    for (const row of (kasbonRes.data || []) as any[]) add(row.kasbon_date, 0, Number(row.amount))
     
    for (const row of (ppRes.data || []) as any[]) add(row.paid_at, 0, Number(row.gross_payment))
     
    for (const row of (bsRes.data || []) as any[]) add(row.settled_at, 0, Number(row.net_payment))

    const chartData = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { masuk, keluar }]) => {
        let label = period
        if (groupBy === 'day') {
          const d = new Date(period)
          label = `${d.getDate()} ${d.toLocaleString('id-ID', { month: 'short' })}`
        } else if (groupBy === 'week') {
          const d = new Date(period)
          label = `Minggu ${d.getDate()} ${d.toLocaleString('id-ID', { month: 'short' })}`
        } else {
          const [y, m] = period.split('-')
          label = new Date(Number(y), Number(m) - 1).toLocaleString('id-ID', { month: 'short', year: '2-digit' })
        }
        return { period, label, masuk, keluar, net: masuk - keluar }
      })

    return reply.send({ chartData, groupBy })
  })

  // ── GET /api/v1/finance/profitability ────────────────────────────────────────
  // Params (optional): date_from, date_to, project_id
  app.get('/api/v1/finance/profitability', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { date_from, date_to, project_id } = request.query as Record<string, string>

    // Fetch all projects (or single if filtered)
    let projectQ = supabase
      .from('projects')
      .select('id, name, contract_model, contract_value, commission_pct')
      .eq('is_deleted', false)
    if (project_id) projectQ = projectQ.eq('id', project_id)
    const { data: projects } = await projectQ

    if (!projects || projects.length === 0) return reply.send({ projects: [], totals: {} })

    const projectIds = projects.map(p => p.id)

    // Run all queries in parallel
    const [
      invoiceRes, paymentRes,
      wageRes, progressRes, settlementRes,
      expenseRes, kasbonRes,
    ] = await Promise.all([
      // Revenue: sum of invoice total_amount (non-cancelled)
      supabase.from('invoices').select('project_id, total_amount').in('project_id', projectIds).neq('status', 'cancelled'),
      // Paid: sum of payments via invoices
      supabase.from('payments').select('amount_paid, invoices!inner(project_id)').in('invoices.project_id', projectIds),
      // Labor: weekly wage reports (approved)
      supabase.from('weekly_wage_reports')
        .select('net_amount, mandor_assignments!inner(project_id)')
        .eq('status', 'approved')
        .in('mandor_assignments.project_id', projectIds),
      // Progress payments (approved)
      supabase.from('progress_payments')
        .select('gross_payment, work_scopes!inner(mandor_assignments!inner(project_id))')
        .eq('status', 'approved')
        .in('work_scopes.mandor_assignments.project_id', projectIds),
      // Borongan settlements
      supabase.from('borongan_settlements')
        .select('net_payment, work_scopes!inner(mandor_assignments!inner(project_id))')
        .in('work_scopes.mandor_assignments.project_id', projectIds),
      // Expenses (approved) with category type
      supabase.from('project_expenses')
        .select('project_id, total_amount, category:project_expense_categories(type)')
        .eq('status', 'approved')
        .in('project_id', projectIds),
      // Advance beredar: kasbons approved not yet settled
      supabase.from('kasbons')
        .select('amount, work_scopes!inner(mandor_assignments!inner(project_id))')
        .eq('status', 'approved')
        .in('work_scopes.mandor_assignments.project_id', projectIds),
    ])

    // Build per-project accumulators
    const acc: Record<string, {
      revenue: number; paid: number;
      labor_wage: number; labor_progress: number; labor_settlement: number;
      material: number; equipment: number; operational: number; other_expense: number;
      advance: number;
    }> = {}
    for (const p of projects) {
      acc[p.id] = { revenue: 0, paid: 0, labor_wage: 0, labor_progress: 0, labor_settlement: 0, material: 0, equipment: 0, operational: 0, other_expense: 0, advance: 0 }
    }

    for (const inv of invoiceRes.data ?? []) {
      if (acc[inv.project_id]) acc[inv.project_id].revenue += Number(inv.total_amount)
    }
    for (const pay of paymentRes.data ?? []) {
      const pid = (pay.invoices as unknown as { project_id: string })?.project_id
      if (pid && acc[pid]) acc[pid].paid += Number(pay.amount_paid)
    }
    for (const w of wageRes.data ?? []) {
      const pid = (w.mandor_assignments as unknown as { project_id: string })?.project_id
      if (pid && acc[pid]) acc[pid].labor_wage += Number(w.net_amount)
    }
    for (const pp of progressRes.data ?? []) {
      const pid = (pp.work_scopes as unknown as { mandor_assignments: { project_id: string } })?.mandor_assignments?.project_id
      if (pid && acc[pid]) acc[pid].labor_progress += Number(pp.gross_payment)
    }
    for (const bs of settlementRes.data ?? []) {
      const pid = (bs.work_scopes as unknown as { mandor_assignments: { project_id: string } })?.mandor_assignments?.project_id
      if (pid && acc[pid]) acc[pid].labor_settlement += Number(bs.net_payment)
    }
    for (const e of expenseRes.data ?? []) {
      if (!acc[e.project_id]) continue
      const type = (e.category as unknown as { type: string } | null)?.type ?? 'other'
      if (type === 'material')    acc[e.project_id].material     += Number(e.total_amount)
      else if (type === 'equipment') acc[e.project_id].equipment  += Number(e.total_amount)
      else if (type === 'operational') acc[e.project_id].operational += Number(e.total_amount)
      else                            acc[e.project_id].other_expense += Number(e.total_amount)
    }
    for (const k of kasbonRes.data ?? []) {
      const pid = (k.work_scopes as unknown as { mandor_assignments: { project_id: string } })?.mandor_assignments?.project_id
      if (pid && acc[pid]) acc[pid].advance += Number(k.amount)
    }

    const result = projects.map(p => {
      const a = acc[p.id]
      const labor_cost = a.labor_wage + a.labor_progress + a.labor_settlement
      const material_cost = a.material
      const non_labor_cost = a.equipment + a.operational + a.other_expense
      const total_cost = labor_cost + material_cost + non_labor_cost
      const gross_profit = a.revenue - total_cost
      const gross_margin_pct = a.revenue > 0 ? Math.round((gross_profit / a.revenue) * 1000) / 10 : 0
      return {
        id: p.id, name: p.name,
        contract_model: p.contract_model,
        contract_value: Number(p.contract_value),
        revenue: a.revenue, paid: a.paid,
        outstanding: a.revenue - a.paid,
        labor_cost, material_cost, non_labor_cost, total_cost,
        gross_profit, gross_margin_pct,
        advance_outstanding: a.advance,
      }
    })

    const totals = result.reduce((t, p) => ({
      revenue:          t.revenue          + p.revenue,
      paid:             t.paid             + p.paid,
      labor_cost:       t.labor_cost       + p.labor_cost,
      material_cost:    t.material_cost    + p.material_cost,
      non_labor_cost:   t.non_labor_cost   + p.non_labor_cost,
      total_cost:       t.total_cost       + p.total_cost,
      gross_profit:     t.gross_profit     + p.gross_profit,
      advance_outstanding: t.advance_outstanding + p.advance_outstanding,
    }), { revenue: 0, paid: 0, labor_cost: 0, material_cost: 0, non_labor_cost: 0, total_cost: 0, gross_profit: 0, advance_outstanding: 0 })

    return reply.send({ projects: result, totals })
  })
}
