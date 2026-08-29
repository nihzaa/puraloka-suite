import type { FastifyInstance } from 'fastify'
import PDFDocument from 'pdfkit'
import { susunCsvBupot, type BarisPajak } from '../../lib/ekspor-bupot.js'
import { susunCsvEfaktur, type BarisFaktur } from '../../lib/ekspor-efaktur.js'
import { susunEkspor, formatSah, FORMAT_EKSPOR } from '../../lib/ekspor-tabel.js'
import { supabase } from '../../utils/supabase.js'
import type { FastifyRequest } from 'fastify'

/**
 * T4d — resolusi daftar proyek yang BOLEH dibaca request ini.
 *
 * Dipakai endpoint laporan LINTAS-PROYEK. Mengembalikan `null` bila filter
 * `?project_id=` menunjuk proyek milik tenant lain — pemanggil membalas 404.
 *
 * Kenapa satu helper, bukan diulang per-endpoint: 3 endpoint × belasan query;
 * satu kelupaan sudah cukup membocorkan laporan keuangan lintas perusahaan.
 */
async function proyekBolehDibaca(
  request: FastifyRequest,
  projectId: string | null
): Promise<string[] | null> {
  const milikTenant = await request.db!.projectIds()
  if (!projectId) return milikTenant
  return milikTenant.includes(projectId) ? [projectId] : null
}
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'
import { hitungKpiEvm, statusIndeks, type ProyekUntukKpi } from '../../lib/kpi-perusahaan.js'
import { computeAging } from '../../lib/ar-register.js'
import { hitungBacklog, type BidRingkas } from '../../lib/bid-backlog.js'

function fmt(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function drawTableRow(
  doc: InstanceType<typeof PDFDocument>,
  cols: { text: string; x: number; w: number; align?: 'left' | 'right' | 'center' }[],
  y: number, h: number, fill?: string
) {
  if (fill) {
    doc.rect(cols[0].x, y, cols[cols.length - 1].x + cols[cols.length - 1].w - cols[0].x, h).fill(fill).fillColor('#111827')
  }
  for (const c of cols) {
    doc.fontSize(8).text(c.text, c.x + 4, y + (h - 8) / 2, { width: c.w - 8, align: c.align ?? 'left', lineBreak: false })
  }
}

function drawTableHeader(
  doc: InstanceType<typeof PDFDocument>,
  cols: { label: string; x: number; w: number; align?: 'left' | 'right' | 'center' }[],
  y: number
) {
  const h = 22
  for (const c of cols) {
    doc.rect(c.x, y, c.w, h).fill('#003366')
    doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
      .text(c.label.toUpperCase(), c.x + 4, y + (h - 7) / 2, { width: c.w - 8, align: c.align ?? 'left', lineBreak: false })
    doc.fillColor('#111827').font('Helvetica')
  }
  return y + h
}

/**
 * Ambil nama tenant untuk kop laporan.
 *
 * Kosong → 'Laporan', BUKAN nama siapa pun. Pola yang sama dipakai
 * `lib/ekspor-tabel.ts`, dan alasannya sama: kop yang salah nama lebih
 * buruk daripada kop tanpa nama.
 */
async function namaTenant(request: FastifyRequest): Promise<string> {
  try {
    const { data } = await request.db!
      .from('companies')
      .select('name')
      .eq('id', request.companyId!)
      .maybeSingle()
    const nama = (data as { name?: string } | null)?.name?.trim()
    return nama || 'Laporan'
  } catch {
    /*
      Gagal membaca nama BUKAN alasan menggagalkan laporannya — orang
      menunggu angkanya, bukan kopnya. Yang tak boleh: jatuh ke nama
      tenant lain.
    */
    return 'Laporan'
  }
}

/*
  ══════════════════════════════════════════════════════════════════════════
  KOP MEMAKAI NAMA TENANT — bukan nama produk
  ══════════════════════════════════════════════════════════════════════════

  Sampai 2026-08-27 baris di bawah memaku tulisan 'Puraloka Suite' di kop
  TIAP laporan PDF. Untuk aplikasi satu perusahaan itu benar; untuk SaaS
  multi-tenant artinya **PT lain menerima laporan berkop nama pesaingnya**.

  Cacat ini sudah dikenali saat `lib/ekspor-tabel.ts` dibangun — komentarnya
  menyebut `pdfHeader()` sebagai contoh yang harus diperbaiki. Tetapi
  perbaikannya hanya dipasang di jalur ekspor BARU; tiga laporan lama
  (proyek, mandor & upah, keuangan) tetap memakai jalur ini.

  Catatan yang menyebut cacat sebagai 'sudah diperbaiki' padahal hanya
  sebagian adalah bentuk kebusukan dokumen yang paling menipu: ia membuat
  pembaca berikutnya menyilangnya dari daftar.
*/
function pdfHeader(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  subtitle: string,
  kop: string,
) {
  doc.rect(0, 0, doc.page.width, 70).fill('#003366')
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(kop, 40, 18)
  doc.fontSize(10).font('Helvetica').text(title, 40, 42)
  doc.fontSize(9).fillColor('#93C5FD').text(subtitle, 40, 56)
  doc.fillColor('#111827').font('Helvetica')
  return 90
}

export default async function reportsRoutes(app: FastifyInstance) {

  // ── GET /api/v1/reports/projects ────────────────────────────────────────────
  // Daftar proyek untuk filter dropdown laporan
  app.get('/api/v1/reports/projects', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    let q = request.db!
      .from('projects')
      .select('id, name, location, status, contract_model, contract_value, start_date, end_date, pm_id')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (user.role === 'pm') q = q.eq('pm_id', user.id)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: 'Gagal memuat daftar proyek' })
    return reply.send({ projects: data ?? [] })
  })

  // ── GET /api/v1/reports/project-summary ─────────────────────────────────────
  // Laporan komprehensif satu proyek (end-to-end)
  app.get('/api/v1/reports/project-summary', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const { project_id } = q
    if (!project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })

    const _user = request.currentUser!
    // F5 (AKTA 0): capability `finance:view:all` (org-wide finance), BUKAN role
    // literal `admin||pm`. Sengaja BUKAN `finance:view` (dimiliki mandor/client utk
    // data ter-scope) supaya scope tetap admin+pm — grantable ke direktur via UI.
    const canViewFinance = await hasPermission(request, 'finance:view:all')

    // T4d — GERBANG KEPEMILIKAN. Seluruh query di bawah adalah tabel kategori C
    // yang disaring `project_id` dari QUERY STRING. Tanpa pemeriksaan ini, siapa
    // pun bisa membaca laporan lengkap proyek perusahaan lain hanya dengan
    // menebak/mengetahui id-nya — termasuk nilai kontrak, invoice, dan upah.
    // Diperiksa SEKALI di sini, bukan diulang di 14 query (satu kelupaan =
    // seluruh gerbang tak berguna).
    if (!(await request.db!.projectIds()).includes(project_id)) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const [
      projectRes,
      terminRes,
      invoiceRes,
      milestoneRes,
      progressRes,
      expenseRes,
      mandorRes,
      kasbonRes,
      wageRes,
      photoRes,
      documentRes,
      kurvaSRes,
    ] = await Promise.allSettled([
      request.db!.from('projects').select(`
        id, name, location, status, contract_model, contract_value,
        commission_pct, retention_pct, start_date, end_date, description,
        created_at, updated_at,
        clients(id, contact_person, phone, address),
        pm:users!projects_pm_id_fkey(id, name, phone)
      `).eq('id', project_id).eq('is_deleted', false).single(),

      canViewFinance ? request.db!.viaProject('termin_schedules', project_id).select('*').order('termin_number') : Promise.resolve({ data: [], error: null }),

      canViewFinance ? request.db!.viaProject('invoices', project_id).select(`
        id, invoice_number, invoice_type, base_amount, total_amount,
        amount_paid, amount_due, status, issued_date, due_date, paid_date
      `).order('issued_date') : Promise.resolve({ data: [], error: null }),

      request.db!.viaProject('milestones', project_id).select('*').order('target_date'),

      request.db!.viaProject('progress_logs', project_id).select(`
        id, pct_overall, notes, logged_at,
        logger:users!progress_logs_reported_by_fkey(id, name)
      `).order('logged_at', { ascending: false }).limit(50),

      canViewFinance ? request.db!.viaProject('project_expenses', project_id).select(`
        id, description, total_amount, expense_date, expense_source, vendor_name, status,
        category:project_expense_categories(id, name, type, parent_id)
      `).eq('status', 'approved').order('expense_date') : Promise.resolve({ data: [], error: null }),

      request.db!.viaProject('mandor_assignments', project_id).select(`
        id, created_at,
        mandor:users!mandor_assignments_mandor_id_fkey(id, name, phone),
        work_scopes(
          id, scope_name, payment_system, borongan_value, status,
          progress_pct_done, created_at
        )
      `),

      canViewFinance ? request.db!.from('kasbons').select(`
        id, amount, purpose, fund_source, status, kasbon_date, approved_at,
        scope:work_scopes!inner(
          id, scope_name,
          assignment:mandor_assignments!inner(
            mandor:users!mandor_assignments_mandor_id_fkey(id, name)
          )
        )
      `).eq('scope.assignment.project_id', project_id).in('status', ['approved', 'settled']) : Promise.resolve({ data: [], error: null }),

      canViewFinance ? supabase.from('weekly_wage_reports').select(`
        id, net_amount, week_start, week_end, status, paid_at,
        assignment:mandor_assignments!inner(
          mandor:users!mandor_assignments_mandor_id_fkey(id, name),
          project_id
        ),
        scope:work_scopes(id, scope_name)
      `).eq('assignment.project_id', project_id).eq('status', 'paid') : Promise.resolve({ data: [], error: null }),

      request.db!.viaProject('project_photos', project_id).select('id, url, caption, taken_at, progress_log_id').order('taken_at', { ascending: false }).limit(20),

      // ⚠️ `title`/`doc_type`, BUKAN `name`/`document_type` — kolom itu tak ada,
      // jadi query ini selalu gagal dan daftar dokumen di laporan proyek SELALU
      // kosong tanpa satu pun gejala. Kelas cacat yang sama dengan AC kurva-S
      // (Rp 755,7 jt hilang); diverifikasi ke information_schema 2026-08-01.
      canViewFinance ? request.db!.viaProject('documents', project_id).select('id, title, doc_type, file_url, created_at').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),

      // TABEL `kurva_s_points` TIDAK ADA di database — diverifikasi 2026-07-29
      // (information_schema kosong). Query ini selalu error, tertelan
      // Promise.allSettled, dan `kurvaSPoints` selalu [] sejak ditulis.
      // Frontend (laporan/page.tsx:790) merender chart hanya bila length > 0,
      // jadi ia diam-diam tak pernah tampil.
      //
      // Kontrak respons DIPERTAHANKAN (tetap mengirim array kosong) supaya nol
      // perubahan bagi frontend — menghapus fieldnya = breaking change di luar
      // lingkup T4. Yang dihapus hanya query hantunya.
      //
      // Ditemukan oleh gerbang P3 (tenancy-ratchet) pada run pertamanya: tabel
      // dipakai kode tapi tak ada di peta. Kurva-S yang BERFUNGSI ada di
      // endpoint terpisah GET /projects/:id/kurva-s (kurva-s.ts) yang menghitung
      // dari rab_schedule + progress_logs, bukan dari tabel ini.
      Promise.resolve({ data: [], error: null }),
    ])

    const get = <T>(r: PromiseSettledResult<{ data: T | null; error: unknown }>) =>
      r.status === 'fulfilled' ? (r.value.data ?? null) : null

     
    const projectSettled = projectRes as PromiseSettledResult<{ data: any; error: any }>
    if (projectSettled.status === 'rejected' || projectSettled.value?.error) {
      const err = projectSettled.status === 'rejected' ? projectSettled.reason : projectSettled.value.error
      return reply.status(500).send({ error: 'Query proyek gagal', detail: err?.message ?? String(err) })
    }
    const project = projectSettled.status === 'fulfilled' ? projectSettled.value.data : null
    if (!project) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    // Ringkasan keuangan
     
    const invoices = (get<any[]>(invoiceRes as PromiseSettledResult<{ data: any[]; error: unknown }>) ?? [])
    const totalInvoiced = invoices.reduce((s: number, i: { total_amount: number }) => s + Number(i.total_amount), 0)
    const totalPaid     = invoices.reduce((s: number, i: { amount_paid: number }) => s + Number(i.amount_paid), 0)
    const totalDue      = invoices.reduce((s: number, i: { amount_due: number }) => s + Number(i.amount_due), 0)

    // Resolve parent category name for expenses
    const { data: projCats } = await request.db!.viaProject('project_expense_categories', project_id).select('id, name, parent_id')
     
    const projCatMap = new Map<string, string>((projCats ?? []).map((c: any) => [c.id, c.name]))
     
    const rawExpenses = (get<any[]>(expenseRes as PromiseSettledResult<{ data: any[]; error: unknown }>) ?? [])
     
    const expenses = rawExpenses.map((e: any) => ({
      ...e,
      category_label: e.category ? (e.category.parent_id ? `${projCatMap.get(e.category.parent_id) ?? e.category.name} › ${e.category.name}` : e.category.name) : 'Lainnya',
    }))
    const totalExpense = expenses.reduce((s: number, e: { total_amount: number }) => s + Number(e.total_amount), 0)

     
    const kasbons = (get<any[]>(kasbonRes as PromiseSettledResult<{ data: any[]; error: unknown }>) ?? [])
    const totalKasbon = kasbons.reduce((s: number, k: { amount: number }) => s + Number(k.amount), 0)

     
    const wages = (get<any[]>(wageRes as PromiseSettledResult<{ data: any[]; error: unknown }>) ?? [])
    const totalWage = wages.reduce((s: number, w: { net_amount: number }) => s + Number(w.net_amount), 0)

    // Progress fisik terbaru
     
    const progressLogs = (get<any[]>(progressRes as PromiseSettledResult<{ data: any[]; error: unknown }>) ?? [])
    const latestProgress = progressLogs.length > 0 ? Number(progressLogs[0].pct_overall) : 0

    // Serapan anggaran
    const serapan = project.contract_value > 0
      ? Math.min(100, (totalExpense / Number(project.contract_value)) * 100)
      : 0

    return reply.send({
      project,
      summary: {
        totalInvoiced, totalPaid, totalDue,
        totalExpense, totalKasbon, totalWage,
        totalOutflow: totalExpense + totalKasbon + totalWage,
        latestProgress, serapan,
      },
      termin:    get(terminRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>),
      invoices,
      milestones: get(milestoneRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>),
      progressLogs,
      expenses,
      mandorAssignments: get(mandorRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>),
      kasbons,
      wages,
      photos:    get(photoRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>),
      documents: get(documentRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>),
      kurvaSPoints: get(kurvaSRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>),
    })
  })

  // ── GET /api/v1/reports/financial ───────────────────────────────────────────
  // Laporan keuangan lintas proyek per periode
  app.get('/api/v1/reports/financial', {
    preHandler: [authenticate, requirePermission('reports:view')]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const dateFrom   = q.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const dateTo     = q.date_to   || new Date().toISOString().split('T')[0]
    const projectId  = q.project_id || null
    const user       = request.currentUser!

    const idProyek = await proyekBolehDibaca(request, projectId)
    if (idProyek === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    let invoiceQ = supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_type, total_amount, amount_paid, amount_due,
        status, issued_date, due_date, paid_date,
        projects!inner(id, name, contract_model)
      `)
      .in('project_id', idProyek)
      .gte('issued_date', dateFrom).lte('issued_date', dateTo)
      .neq('status', 'cancelled')

    let paymentQ = supabase
      .from('payments')
      .select(`
        id, amount_paid, paid_at, payment_method,
        invoices!inner(id, invoice_number, project_id,
          projects!inner(id, name))
      `)
      .in('invoices.project_id', idProyek)
      .gte('paid_at', dateFrom + 'T00:00:00').lte('paid_at', dateTo + 'T23:59:59')

    if (projectId) {
      invoiceQ = invoiceQ.eq('project_id', projectId)
      paymentQ = paymentQ.eq('invoices.project_id', projectId)
    }
    if (user.role === 'pm') {
      invoiceQ = invoiceQ.eq('projects.pm_id', user.id)
    }

    const [invRes, payRes] = await Promise.all([
      Promise.resolve(invoiceQ),
      Promise.resolve(paymentQ),
    ])

    if (invRes.error) return reply.status(500).send({ error: 'Gagal memuat data keuangan' })

     
    const invoices = (invRes.data ?? []) as any[]
     
    const payments = (payRes.data ?? []) as any[]

    const totalInvoiced   = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
    const totalPaid       = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
    const totalOutstanding = invoices.reduce((s, i) => s + Number(i.amount_due), 0)
    const overdueCount    = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && new Date(i.due_date) < new Date()).length

    // Rekap per proyek
    const byProject = new Map<string, { name: string; invoiced: number; paid: number; due: number; count: number }>()
    for (const inv of invoices) {
      const pid = inv.projects?.id ?? 'unknown'
      const cur = byProject.get(pid) ?? { name: inv.projects?.name ?? '—', invoiced: 0, paid: 0, due: 0, count: 0 }
      cur.invoiced += Number(inv.total_amount)
      cur.paid     += Number(inv.amount_paid)
      cur.due      += Number(inv.amount_due)
      cur.count    += 1
      byProject.set(pid, cur)
    }

    return reply.send({
      period: { dateFrom, dateTo },
      summary: { totalInvoiced, totalPaid, totalOutstanding, overdueCount },
      byProject: Array.from(byProject.entries()).map(([id, v]) => ({ id, ...v })),
      invoices,
      payments,
    })
  })

  // ── GET /api/v1/reports/cashflow ─────────────────────────────────────────────
  // Laporan arus kas komprehensif per periode
  app.get('/api/v1/reports/cashflow', {
    preHandler: [authenticate, requirePermission('reports:view')]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const dateFrom  = q.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const dateTo    = q.date_to   || new Date().toISOString().split('T')[0]
    const projectId = q.project_id || null
    const fromTs    = dateFrom + 'T00:00:00'
    const toTs      = dateTo   + 'T23:59:59'

    let payQ = supabase.from('payments').select(`
      id, amount_paid, paid_at, payment_method,
      invoices!inner(id, invoice_number, project_id, projects!inner(id, name))
    `).gte('paid_at', fromTs).lte('paid_at', toTs)

    let expQ = supabase.from('project_expenses').select(`
      id, description, total_amount, expense_date, expense_source, vendor_name,
      projects(id, name),
      category:project_expense_categories(id, name, type, parent_id)
    `).eq('status', 'approved').gte('expense_date', dateFrom).lte('expense_date', dateTo)

    let wageQ = supabase.from('weekly_wage_reports').select(`
      id, net_amount, paid_at, week_start, week_end,
      assignment:mandor_assignments!inner(
        mandor:users!mandor_assignments_mandor_id_fkey(id, name),
        projects!inner(id, name)
      )
    `).eq('status', 'paid').gte('paid_at', fromTs).lte('paid_at', toTs)

    // kasbon_date is DATE NOT NULL — more reliable than approved_at (nullable TIMESTAMPTZ)
    let kasbonQ = request.db!.from('kasbons').select(`
      id, amount, purpose, fund_source, kasbon_date, approved_at,
      scope:work_scopes!inner(
        assignment:mandor_assignments!inner(
          mandor:users!mandor_assignments_mandor_id_fkey(id, name),
          projects!inner(id, name)
        )
      )
    `).in('status', ['approved', 'settled'])
      .gte('kasbon_date', dateFrom).lte('kasbon_date', dateTo)

    // T4d: SELALU di-scope. `projectId` hanya MEMPERSEMPIT lebih jauh — kalau
    // tak diisi, cakupannya seluruh proyek TENANT, bukan seluruh proyek di DB.
    const idProyekCf = await proyekBolehDibaca(request, projectId)
    if (idProyekCf === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    payQ    = payQ.in('invoices.project_id', idProyekCf)
    expQ    = expQ.in('project_id', idProyekCf)
    wageQ   = wageQ.in('assignment.project_id', idProyekCf)
    kasbonQ = kasbonQ.in('scope.assignment.project_id', idProyekCf)

    const [pR, eR, wR, kR] = await Promise.all([
      Promise.resolve(payQ),
      Promise.resolve(expQ),
      Promise.resolve(wageQ),
      Promise.resolve(kasbonQ),
    ])

     
    const payments  = (pR.data ?? []) as any[]
     
    const expenses  = (eR.data ?? []) as any[]
     
    const wages     = (wR.data ?? []) as any[]
     
    const kasbons   = (kR.data ?? []) as any[]

    const totalIn       = payments.reduce((s, p) => s + Number(p.amount_paid), 0)
    const totalExpense  = expenses.reduce((s, e) => s + Number(e.total_amount), 0)
    const totalWage     = wages.reduce((s, w) => s + Number(w.net_amount), 0)
    const totalKasbon   = kasbons.reduce((s, k) => s + Number(k.amount), 0)
    const totalOut      = totalExpense + totalWage + totalKasbon
    const netFlow       = totalIn - totalOut

    // Agregasi per bulan
    const monthMap = new Map<string, { masuk: number; keluar: number }>()
    const addMonth = (dateStr: string, masuk: number, keluar: number) => {
      const d = new Date(dateStr)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const cur = monthMap.get(key) ?? { masuk: 0, keluar: 0 }
      monthMap.set(key, { masuk: cur.masuk + masuk, keluar: cur.keluar + keluar })
    }
    for (const p of payments) addMonth(p.paid_at, Number(p.amount_paid), 0)
    for (const e of expenses)  addMonth(e.expense_date, 0, Number(e.total_amount))
    for (const w of wages)     addMonth(w.paid_at, 0, Number(w.net_amount))
    for (const k of kasbons)   addMonth(k.kasbon_date ?? k.approved_at, 0, Number(k.amount))

    const byMonth = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => {
      const [y, m] = period.split('-')
      return {
        period,
        label: new Date(Number(y), Number(m) - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
        masuk: v.masuk, keluar: v.keluar, net: v.masuk - v.keluar,
      }
    })

    return reply.send({
      period: { dateFrom, dateTo },
      summary: { totalIn, totalExpense, totalWage, totalKasbon, totalOut, netFlow },
      byMonth,
      payments,
      expenses,
      wages,
      kasbons,
    })
  })

  // ── GET /api/v1/reports/mandor ───────────────────────────────────────────────
  // Laporan mandor, upah, kasbon, dan progress scope pekerjaan
  app.get('/api/v1/reports/mandor', {
    preHandler: [authenticate, requirePermission('reports:view')]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const dateFrom  = q.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const dateTo    = q.date_to   || new Date().toISOString().split('T')[0]
    const projectId = q.project_id || null

    let assignQ = supabase.from('mandor_assignments').select(`
      id, created_at, project_id,
      mandor:users!mandor_assignments_mandor_id_fkey(id, name, phone),
      projects!inner(id, name, location),
      work_scopes(
        id, scope_name, payment_system, borongan_value, status, progress_pct_done,
        work_scope_items(id, item_name, unit, volume, volume_done)
      )
    `)
    // T4d: SELALU di-scope; projectId hanya mempersempit.
    const idProyekMd = await proyekBolehDibaca(request, projectId)
    if (idProyekMd === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    assignQ = assignQ.in('project_id', idProyekMd)

    let wageQ = supabase.from('weekly_wage_reports').select(`
      id, net_amount, week_start, week_end, status, paid_at,
      assignment_id,
      scope:work_scopes(id, scope_name)
    `).eq('status', 'paid').gte('paid_at', dateFrom + 'T00:00:00').lte('paid_at', dateTo + 'T23:59:59')

    // Fetch kasbons scoped to project via work_scopes join.
    // Filter project_id in TypeScript to avoid unreliable nested-join filter syntax.
    const kasbonQ = request.db!.from('kasbons').select(`
      id, amount, purpose, fund_source, status, kasbon_date, approved_at,
      scope:work_scopes!inner(
        id, scope_name,
        assignment:mandor_assignments!inner(id, project_id,
          mandor:users!mandor_assignments_mandor_id_fkey(id, name))
      )
    `).in('status', ['approved', 'settled'])

    wageQ = wageQ.in('assignment.project_id', idProyekMd)

    const [aR, wR, kR] = await Promise.all([
      Promise.resolve(assignQ),
      Promise.resolve(wageQ),
      Promise.resolve(kasbonQ),
    ])

     
    const assignments = (aR.data ?? []) as any[]
     
    const wages       = (wR.data ?? []) as any[]
    // Filter kasbons in TypeScript: by project_id (via scope.assignment.project_id)
    // and by date range using kasbon_date (always set, unlike approved_at which can be null)
     
    const allKasbons  = (kR.data ?? []) as any[]
    const kasbons = allKasbons.filter((k: any) => {
      // kasbon_date is DATE (always set, NOT NULL) — use it as primary date anchor
      const kDateStr: string = k.kasbon_date
        ?? (k.approved_at ? k.approved_at.substring(0, 10) : null)
      if (!kDateStr) return false
      if (kDateStr < dateFrom || kDateStr > dateTo) return false
      if (projectId && k.scope?.assignment?.project_id !== projectId) return false
      return true
    })

    // Index upah & kasbon per assignment
    const wageByAssignment   = new Map<string, number>()
    const kasbonByAssignment = new Map<string, number>()

    for (const w of wages) {
      wageByAssignment.set(w.assignment_id, (wageByAssignment.get(w.assignment_id) ?? 0) + Number(w.net_amount))
    }
    for (const k of kasbons) {
      const asgId = k.scope?.assignment?.id
      if (asgId) kasbonByAssignment.set(asgId, (kasbonByAssignment.get(asgId) ?? 0) + Number(k.amount))
    }

    const mandorReport = assignments.map(a => ({
      assignment: a,
      totalWage:   wageByAssignment.get(a.id) ?? 0,
      totalKasbon: kasbonByAssignment.get(a.id) ?? 0,
      wages:       wages.filter(w => w.assignment_id === a.id),
      kasbons:     kasbons.filter(k => k.scope?.assignment?.id === a.id),
    }))

    const grandTotalWage   = wages.reduce((s, w) => s + Number(w.net_amount), 0)
    const grandTotalKasbon = kasbons.reduce((s, k) => s + Number(k.amount), 0)

    return reply.send({
      period: { dateFrom, dateTo },
      summary: { totalMandor: assignments.length, grandTotalWage, grandTotalKasbon },
      mandorReport,
    })
  })

  // ── GET /api/v1/reports/expenses ─────────────────────────────────────────────
  // Laporan pengeluaran per kategori/proyek
  app.get('/api/v1/reports/expenses', {
    preHandler: [authenticate, requirePermission('reports:view')]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const dateFrom  = q.date_from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const dateTo    = q.date_to   || new Date().toISOString().split('T')[0]
    const projectId = q.project_id || null

    let expQ = supabase.from('project_expenses').select(`
      id, description, total_amount, expense_date, expense_source, vendor_name, notes, status,
      projects(id, name),
      category:project_expense_categories(id, name, type, parent_id),
      submitter:users!project_expenses_submitted_by_fkey(id, name)
    `).eq('status', 'approved')
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
      .order('expense_date', { ascending: false })

    // T4d: SELALU di-scope; projectId hanya mempersempit.
    const idProyekEx = await proyekBolehDibaca(request, projectId)
    if (idProyekEx === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    expQ = expQ.in('project_id', idProyekEx)

    // Fetch semua kategori untuk resolve nama parent di backend
    const catScope = projectId
      ? request.db!.unsafe('project_expense_categories', 'disaring .eq(project_id, ...) yang sudah diverifikasi milik tenant').select('id, name, parent_id').eq('project_id', projectId)
      : supabase.from('project_expense_categories').select('id, name, parent_id')

    const [{ data, error }, { data: allCats }] = await Promise.all([expQ, catScope])
    if (error) return reply.status(500).send({ error: 'Gagal memuat data pengeluaran' })

    // Build lookup map id → name untuk resolve parent
     
    const catMap = new Map<string, string>((allCats ?? []).map((c: any) => [c.id, c.name]))
     
    const resolveLabel = (cat: any) => {
      if (!cat) return 'Lainnya'
      if (cat.parent_id) return `${catMap.get(cat.parent_id) ?? cat.name} › ${cat.name}`
      return cat.name
    }

     
    const expenses = ((data ?? []) as any[]).map(e => ({
      ...e,
      category_label: resolveLabel(e.category),
    }))
    const total    = expenses.reduce((s, e) => s + Number(e.total_amount), 0)

    // Rekap per kategori induk + breakdown sub-kategori
    const byCat = new Map<string, { name: string; total: number; count: number; subs: Map<string, { name: string; total: number; count: number }> }>()
    for (const e of expenses) {
      const isSubCat = Boolean(e.category?.parent_id)
      const parentName = isSubCat ? (catMap.get(e.category.parent_id) ?? 'Lainnya') : (e.category?.name ?? 'Lainnya')
      const subName = isSubCat ? e.category.name : null

      const cur = byCat.get(parentName) ?? { name: parentName, total: 0, count: 0, subs: new Map() }
      cur.total += Number(e.total_amount)
      cur.count += 1
      if (subName) {
        const sub = cur.subs.get(subName) ?? { name: subName, total: 0, count: 0 }
        sub.total += Number(e.total_amount)
        sub.count += 1
        cur.subs.set(subName, sub)
      }
      byCat.set(parentName, cur)
    }

    // Rekap per proyek
    const byProject = new Map<string, { name: string; total: number; count: number }>()
    for (const e of expenses) {
      const pid = e.projects?.id ?? 'unknown'
      const cur = byProject.get(pid) ?? { name: e.projects?.name ?? '—', total: 0, count: 0 }
      cur.total += Number(e.total_amount)
      cur.count += 1
      byProject.set(pid, cur)
    }

    return reply.send({
      period: { dateFrom, dateTo },
      summary: { total, count: expenses.length },
      byCategory: Array.from(byCat.values()).sort((a, b) => b.total - a.total).map(c => ({
        ...c,
        subs: Array.from(c.subs.values()).sort((a, b) => b.total - a.total),
      })),
      byProject:  Array.from(byProject.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total),
      expenses,
    })
  })

  // ── GET /api/v1/reports/export-pdf ───────────────────────────────────────────
  // Export PDF laporan — type: project | mandor | financial
  app.get('/api/v1/reports/export-pdf', {
    preHandler: [authenticate, requirePermission('reports:view')]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const type      = q.type ?? 'financial'
    const projectId = q.project_id ?? null
    const dateFrom  = q.date_from ?? new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const dateTo    = q.date_to   ?? new Date().toISOString().split('T')[0]

    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Laporan ${type}`, Author: await namaTenant(request) } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    if (type === 'project') {
      if (!projectId) return reply.status(400).send({ error: 'project_id wajib untuk tipe project' })

      const [projRes, milRes, progRes, invRes] = await Promise.all([
        request.db!.from('projects').select('id, name, location, status, contract_value, start_date, end_date, clients(contact_person, phone), pm:users!projects_pm_id_fkey(name)').eq('id', projectId).eq('is_deleted', false).single(),
        // ⚠️ `title`/`completed_at`, BUKAN `name`/`actual_date` — kolom itu tak
        // ada, jadi query ini selalu gagal dan tabel milestone di PDF laporan
        // proyek SELALU kosong. Diverifikasi ke information_schema 2026-08-01.
        request.db!.viaProject('milestones', projectId).select('title, target_date, completed_at, status').order('target_date'),
        request.db!.viaProject('progress_logs', projectId).select('pct_overall, notes, logged_at').order('logged_at', { ascending: false }).limit(20),
        request.db!.viaProject('invoices', projectId).select('invoice_number, total_amount, amount_paid, amount_due, status, issued_date, due_date').order('issued_date'),
      ])

      const proj = projRes.data
      if (!proj) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      const milestones = milRes.data ?? []
      const logs       = progRes.data ?? []
      const invoices   = invRes.data ?? []

      let y = pdfHeader(doc, `Laporan Proyek: ${proj.name}`, `Dicetak: ${fmtDate(new Date().toISOString())}`, await namaTenant(request))

      // Project info block
      doc.rect(40, y, doc.page.width - 80, 60).fill('#F8F9FA').stroke('#E5E7EB').fillColor('#111827')
      doc.fontSize(9).font('Helvetica-Bold').text('Klien', 52, y + 8)
      doc.font('Helvetica').text((proj.clients as any)?.contact_person ?? '—', 52, y + 19)
      doc.fontSize(9).font('Helvetica-Bold').text('PM', 200, y + 8)
      doc.font('Helvetica').text((proj.pm as any)?.name ?? '—', 200, y + 19)
      doc.fontSize(9).font('Helvetica-Bold').text('Nilai Kontrak', 340, y + 8)
      doc.font('Helvetica').text(fmt(Number(proj.contract_value)), 340, y + 19)
      doc.fontSize(9).font('Helvetica-Bold').text('Periode', 52, y + 36)
      doc.font('Helvetica').text(`${fmtDate(proj.start_date)} — ${fmtDate(proj.end_date)}`, 52, y + 47)
      doc.fontSize(9).font('Helvetica-Bold').text('Lokasi', 200, y + 36)
      doc.font('Helvetica').text(proj.location ?? '—', 200, y + 47)
      y += 76

      // Milestones
      if (milestones.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Milestone', 40, y).fillColor('#111827').font('Helvetica')
        y += 16
        const mcols = [
          { label: 'Nama Milestone', x: 40,  w: 230 },
          { label: 'Target',        x: 270, w: 100, align: 'center' as const },
          { label: 'Realisasi',     x: 370, w: 100, align: 'center' as const },
          { label: 'Status',        x: 470, w:  85, align: 'center' as const },
        ]
        y = drawTableHeader(doc, mcols, y)
        milestones.forEach((m, i) => {
          const rh = 20
          drawTableRow(doc, [
            { text: m.title ?? '—',            x: 40,  w: 230 },
            { text: fmtDate(m.target_date),    x: 270, w: 100, align: 'center' },
            { text: fmtDate(m.completed_at),   x: 370, w: 100, align: 'center' },
            { text: m.status ?? '—',           x: 470, w:  85, align: 'center' },
          ], y, rh, i % 2 === 0 ? '#F8F9FA' : '#FFFFFF')
          y += rh
          if (y > doc.page.height - 80) { doc.addPage(); y = 40 }
        })
        y += 12
      }

      // Progress logs
      if (logs.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Log Progress Terbaru', 40, y).fillColor('#111827').font('Helvetica')
        y += 16
        const pcols = [
          { label: 'Tanggal',  x: 40,  w: 110, align: 'center' as const },
          { label: '% Fisik',  x: 150, w:  80, align: 'center' as const },
          { label: 'Catatan',  x: 230, w: 325 },
        ]
        y = drawTableHeader(doc, pcols, y)
        logs.forEach((l, i) => {
          const rh = 20
          drawTableRow(doc, [
            { text: fmtDate(l.logged_at),          x: 40,  w: 110, align: 'center' },
            { text: `${Number(l.pct_overall)}%`,   x: 150, w:  80, align: 'center' },
            { text: l.notes ?? '—',                x: 230, w: 325 },
          ], y, rh, i % 2 === 0 ? '#F8F9FA' : '#FFFFFF')
          y += rh
          if (y > doc.page.height - 80) { doc.addPage(); y = 40 }
        })
        y += 12
      }

      // Invoices
      if (invoices.length > 0) {
        if (y > doc.page.height - 140) { doc.addPage(); y = 40 }
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Invoice', 40, y).fillColor('#111827').font('Helvetica')
        y += 16
        const icols = [
          { label: 'No Invoice',  x: 40,  w: 120 },
          { label: 'Total',       x: 160, w: 110, align: 'right' as const },
          { label: 'Terbayar',    x: 270, w: 110, align: 'right' as const },
          { label: 'Sisa',        x: 380, w: 100, align: 'right' as const },
          { label: 'Status',      x: 480, w:  75, align: 'center' as const },
        ]
        y = drawTableHeader(doc, icols, y)
        invoices.forEach((inv, i) => {
          const rh = 20
          drawTableRow(doc, [
            { text: inv.invoice_number ?? '—',      x: 40,  w: 120 },
            { text: fmt(Number(inv.total_amount)),  x: 160, w: 110, align: 'right' },
            { text: fmt(Number(inv.amount_paid)),   x: 270, w: 110, align: 'right' },
            { text: fmt(Number(inv.amount_due)),    x: 380, w: 100, align: 'right' },
            { text: inv.status ?? '—',              x: 480, w:  75, align: 'center' },
          ], y, rh, i % 2 === 0 ? '#F8F9FA' : '#FFFFFF')
          y += rh
          if (y > doc.page.height - 80) { doc.addPage(); y = 40 }
        })
      }

    } else if (type === 'mandor') {
      const assignQ = supabase.from('mandor_assignments').select(`
        id, project_id,
        mandor:users!mandor_assignments_mandor_id_fkey(id, name, phone),
        projects!inner(id, name),
        work_scopes(id, scope_name, payment_system, status, progress_pct_done)
      `)
      const kasbonQ = request.db!.from('kasbons').select(`
        id, amount, purpose, fund_source, status, kasbon_date,
        scope:work_scopes!inner(assignment:mandor_assignments!inner(id, project_id, mandor:users!mandor_assignments_mandor_id_fkey(id, name)))
      `).in('status', ['approved', 'settled'])
        .gte('kasbon_date', dateFrom).lte('kasbon_date', dateTo)

      const wageQ = supabase.from('weekly_wage_reports').select(`
        id, net_amount, week_start, week_end, status, paid_at, assignment_id
      `).eq('status', 'paid')
        .gte('paid_at', dateFrom + 'T00:00:00').lte('paid_at', dateTo + 'T23:59:59')

      const [aR, kR, wR] = await Promise.all([assignQ, kasbonQ, wageQ])

      // Galat DIPERIKSA sebelum `.data` dipakai. Tanpa ini `?? []` mengubah
      // query yang GAGAL jadi "nol baris" yang terlihat sah — dan laporan ini
      // menjumlahkan UANG (upah + kasbon mandor). Nol yang palsu di sini
      // terbaca sebagai "tak ada pengeluaran", persis kelas cacat yang
      // membuat kurva-s kehilangan Rp 631,7 juta selama berbulan-bulan.
      for (const [nama, r] of [['penugasan', aR], ['kasbon', kR], ['upah', wR]] as const) {
        if (r.error) {
          request.log.error({ err: r.error, bagian: nama }, 'gagal memuat data rekap mandor')
          return reply.status(500).send({ error: `Gagal memuat data ${nama}` })
        }
      }

      // `?? []` sengaja TIDAK dipakai: galatnya sudah dipulangkan 500 di atas,
      // jadi `data` mustahil null karena kegagalan. Menuliskannya tetap salah
      // bentuk — itu pola yang penjaga cari, dan penjaga tak bisa membedakan
      // yang aman dari yang berbahaya.
      const assignments = aR.data as any[]

      const kasbons     = (kR.data as any[]).filter((k: any) => !projectId || k.scope?.assignment?.project_id === projectId)

      const wages       = wR.data as any[]

      const grandWage   = wages.reduce((s, w) => s + Number(w.net_amount), 0)
      const grandKasbon = kasbons.reduce((s, k) => s + Number(k.amount), 0)

      let y = pdfHeader(doc, 'Laporan Mandor & Upah', `Periode: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}   Dicetak: ${fmtDate(new Date().toISOString())}`, await namaTenant(request))

      // Summary KPI
      doc.rect(40, y, 160, 44).fill('#F0FDF4').stroke('#BBF7D0').fillColor('#15803d')
      doc.fontSize(8).font('Helvetica-Bold').text('TOTAL UPAH TERBAYAR', 50, y + 8)
      doc.fontSize(11).text(fmt(grandWage), 50, y + 22)
      doc.rect(220, y, 160, 44).fill('#FEF2F2').stroke('#FECACA').fillColor('#B91C1C')
      doc.fontSize(8).font('Helvetica-Bold').text('TOTAL KASBON', 230, y + 8)
      doc.fontSize(11).text(fmt(grandKasbon), 230, y + 22)
      doc.rect(400, y, 155, 44).fill('#EFF6FF').stroke('#BFDBFE').fillColor('#1D4ED8')
      doc.fontSize(8).font('Helvetica-Bold').text('TOTAL MANDOR AKTIF', 410, y + 8)
      doc.fontSize(11).text(String(assignments.length), 410, y + 22)
      doc.fillColor('#111827').font('Helvetica')
      y += 60

      // Assignments table
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Data Penugasan Mandor', 40, y).fillColor('#111827').font('Helvetica')
      y += 16
      const acols = [
        { label: 'Mandor',   x: 40,  w: 150 },
        { label: 'Proyek',   x: 190, w: 180 },
        { label: 'Scope',    x: 370, w: 105 },
        { label: 'Progress', x: 475, w:  80, align: 'center' as const },
      ]
      y = drawTableHeader(doc, acols, y)
      for (const a of assignments) {
         
        for (const s of (a.work_scopes as any[] ?? [])) {
          const rh = 20
          if (y > doc.page.height - 80) { doc.addPage(); y = 40 }
          drawTableRow(doc, [
            { text: (a.mandor as { name: string } | null)?.name ?? '—', x: 40,  w: 150 },
            { text: (a.projects as { name: string } | null)?.name ?? '—', x: 190, w: 180 },
            { text: s.scope_name ?? '—',            x: 370, w: 105 },
            { text: `${s.progress_pct_done ?? 0}%`, x: 475, w:  80, align: 'center' },
          ], y, rh, (y % 40 < 20) ? '#F8F9FA' : '#FFFFFF')
          y += rh
        }
      }
      y += 12

      // Kasbons table
      if (kasbons.length > 0) {
        if (y > doc.page.height - 120) { doc.addPage(); y = 40 }
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Kasbon Periode Ini', 40, y).fillColor('#111827').font('Helvetica')
        y += 16
        const kcols = [
          { label: 'Mandor',    x: 40,  w: 140 },
          { label: 'Tanggal',   x: 180, w: 100, align: 'center' as const },
          { label: 'Tujuan',    x: 280, w: 110 },
          { label: 'Jumlah',    x: 390, w: 110, align: 'right' as const },
          { label: 'Status',    x: 500, w:  55, align: 'center' as const },
        ]
        y = drawTableHeader(doc, kcols, y)
        kasbons.forEach((k, i) => {
          const rh = 20
          if (y > doc.page.height - 60) { doc.addPage(); y = 40 }
          drawTableRow(doc, [
            { text: k.scope?.assignment?.mandor?.name ?? '—', x: 40,  w: 140 },
            { text: fmtDate(k.kasbon_date),                   x: 180, w: 100, align: 'center' },
            { text: k.purpose ?? '—',                         x: 280, w: 110 },
            { text: fmt(Number(k.amount)),                    x: 390, w: 110, align: 'right' },
            { text: k.status ?? '—',                          x: 500, w:  55, align: 'center' },
          ], y, rh, i % 2 === 0 ? '#F8F9FA' : '#FFFFFF')
          y += rh
        })
      }

    } else {
      // financial
      const [invRes, payRes] = await Promise.all([
        supabase.from('invoices').select(`
          id, invoice_number, invoice_type, total_amount, amount_paid, amount_due, status, issued_date, due_date,
          projects!inner(id, name)
        `).gte('issued_date', dateFrom).lte('issued_date', dateTo).neq('status', 'cancelled'),
        supabase.from('payments').select(`
          id, amount_paid, paid_at, payment_method,
          invoices!inner(invoice_number, projects!inner(name))
        `).gte('paid_at', dateFrom + 'T00:00:00').lte('paid_at', dateTo + 'T23:59:59'),
      ])

       
      const invoices = (invRes.data ?? []) as any[]
       
      const payments = (payRes.data ?? []) as any[]

      const totalInvoiced    = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
      const totalPaid        = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
      const totalOutstanding = invoices.reduce((s, i) => s + Number(i.amount_due), 0)
      const overdueCount     = invoices.filter(i => i.status !== 'paid' && new Date(i.due_date) < new Date()).length

      let y = pdfHeader(doc, 'Laporan Keuangan', `Periode: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}   Dicetak: ${fmtDate(new Date().toISOString())}`, await namaTenant(request))

      // KPI boxes
      const kpis = [
        { label: 'Total Invoice',     val: fmt(totalInvoiced),    fill: '#EFF6FF', stroke: '#BFDBFE', color: '#1D4ED8' },
        { label: 'Terbayar',          val: fmt(totalPaid),         fill: '#F0FDF4', stroke: '#BBF7D0', color: '#15803d' },
        { label: 'Outstanding',       val: fmt(totalOutstanding),  fill: '#FEF2F2', stroke: '#FECACA', color: '#B91C1C' },
        { label: 'Invoice Overdue',   val: String(overdueCount),   fill: '#FFFBEB', stroke: '#FDE68A', color: '#D97706' },
      ]
      const kw = (doc.page.width - 80 - 12) / 4
      kpis.forEach((kpi, i) => {
        const kx = 40 + i * (kw + 4)
        doc.rect(kx, y, kw, 48).fill(kpi.fill).stroke(kpi.stroke).fillColor(kpi.color)
        doc.fontSize(7.5).font('Helvetica-Bold').text(kpi.label.toUpperCase(), kx + 8, y + 8)
        doc.fontSize(11).text(kpi.val, kx + 8, y + 24, { width: kw - 16 })
      })
      doc.fillColor('#111827').font('Helvetica')
      y += 64

      // Invoice table
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Daftar Invoice', 40, y).fillColor('#111827').font('Helvetica')
      y += 16
      const icols = [
        { label: 'No Invoice',  x: 40,  w: 110 },
        { label: 'Proyek',      x: 150, w: 155 },
        { label: 'Total',       x: 305, w: 100, align: 'right' as const },
        { label: 'Terbayar',    x: 405, w: 100, align: 'right' as const },
        { label: 'Status',      x: 505, w:  50, align: 'center' as const },
      ]
      y = drawTableHeader(doc, icols, y)
      invoices.forEach((inv, i) => {
        const rh = 20
        if (y > doc.page.height - 80) { doc.addPage(); y = 40 }
        drawTableRow(doc, [
          { text: inv.invoice_number ?? '—',             x: 40,  w: 110 },
          { text: (inv.projects as { name: string } | null)?.name ?? '—', x: 150, w: 155 },
          { text: fmt(Number(inv.total_amount)),         x: 305, w: 100, align: 'right' },
          { text: fmt(Number(inv.amount_paid)),          x: 405, w: 100, align: 'right' },
          { text: inv.status ?? '—',                    x: 505, w:  50, align: 'center' },
        ], y, rh, i % 2 === 0 ? '#F8F9FA' : '#FFFFFF')
        y += rh
      })
      y += 16

      // Payments table
      if (payments.length > 0) {
        if (y > doc.page.height - 120) { doc.addPage(); y = 40 }
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#003366').text('Riwayat Pembayaran Masuk', 40, y).fillColor('#111827').font('Helvetica')
        y += 16
        const pcols = [
          { label: 'Tanggal',         x: 40,  w: 110, align: 'center' as const },
          { label: 'Proyek',          x: 150, w: 185 },
          { label: 'No Invoice',      x: 335, w: 130 },
          { label: 'Jumlah',          x: 465, w: 90, align: 'right' as const },
        ]
        y = drawTableHeader(doc, pcols, y)
        payments.forEach((p, i) => {
          const rh = 20
          if (y > doc.page.height - 60) { doc.addPage(); y = 40 }
          drawTableRow(doc, [
            { text: fmtDate(p.paid_at),                                         x: 40,  w: 110, align: 'center' },
            { text: (p.invoices as any)?.projects?.name ?? '—',                 x: 150, w: 185 },
            { text: (p.invoices as any)?.invoice_number ?? '—',                 x: 335, w: 130 },
            { text: fmt(Number(p.amount_paid)),                                 x: 465, w:  90, align: 'right' },
          ], y, rh, i % 2 === 0 ? '#F8F9FA' : '#FFFFFF')
          y += rh
        })
      }
    }

    // Footer on last page
    doc.fontSize(7).fillColor('#9CA3AF').text(`Laporan ini dibuat otomatis — ${new Date().toLocaleString('id-ID')}`, 40, doc.page.height - 28, { width: doc.page.width - 80, align: 'center' })

    doc.end()
    await new Promise<void>(resolve => doc.on('end', resolve))
    const pdfBuffer = Buffer.concat(chunks)
    const filename = `laporan-${type}-${dateFrom}.pdf`
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(pdfBuffer)
  })

  // ── GET /api/v1/reports/progress ─────────────────────────────────────────────
  // Laporan progress fisik + foto dokumentasi (semua role dengan scope)
  app.get('/api/v1/reports/progress', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const { project_id } = q
    if (!project_id) return reply.status(400).send({ error: 'project_id wajib diisi' })

    const dateFrom = q.date_from || null
    const dateTo   = q.date_to   || null

    let progressQ = request.db!.viaProject('progress_logs', project_id).select(`
      id, pct_overall, notes, logged_at,
      logger:users!progress_logs_reported_by_fkey(id, name),
      project_photos(id, url, caption, taken_at)
    `).order('logged_at', { ascending: false })

    if (dateFrom) progressQ = progressQ.gte('logged_at', dateFrom + 'T00:00:00')
    if (dateTo)   progressQ = progressQ.lte('logged_at', dateTo + 'T23:59:59')

    const [progRes, milestoneRes, projectRes] = await Promise.all([
      Promise.resolve(progressQ),
      request.db!.unsafe('milestones', 'disaring .eq(project_id, ...) yang sudah diverifikasi milik tenant').select('*').eq('project_id', project_id).order('target_date'),
      request.db!.from('projects').select('id, name, location, start_date, end_date, status').eq('id', project_id).eq('is_deleted', false).single(),
    ])

    if (projectRes.error) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

     
    const logs      = (progRes.data ?? []) as any[]
    const latestPct = logs.length > 0 ? Number(logs[0].pct_overall) : 0

    return reply.send({
      project:    projectRes.data,
      milestones: milestoneRes.data ?? [],
      progressLogs: logs,
      latestProgress: latestPct,
      period: { dateFrom, dateTo },
    })
  })

  // ── GET /api/v1/reports/rekap-pajak ──────────────────────────────────────────
  // Rekap pajak (PPh/PPN) per proyek + per bulan + export-ready
  // Query: ?project_id= &from= &to= &status= &tax_type=
  app.get('/api/v1/reports/rekap-pajak', {
    preHandler: [authenticate, requirePermission('finance:tax:view')]
  }, async (request, reply) => {
    const { project_id, from, to, status, tax_type } = request.query as Record<string, string>

    // ⚠️ Saringan tenant. Tanpa ini daftar rekap pajak memuat SELURUH
    // perusahaan — lengkap dengan NPWP & nama klien tenant lain, yang bukan
    // cuma angka tapi data pribadi pihak ketiga.
    //
    // `tax_records` kategori C lewat `invoice_id → invoices.project_id`, jadi
    // disaring pada embed invoice-nya (`!inner` membuat baris tanpa invoice
    // yang cocok ikut terbuang).
    const idProyekPajak = await proyekBolehDibaca(request, project_id ?? null)
    if (idProyekPajak === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    let q = request.db!
      .unsafe('tax_records', 'kategori C lewat invoice_id; disaring .in(invoice.project_id) di bawah')
      .select(`
        id, tax_type, tax_scheme, base_amount, rate_pct, tax_amount,
        efaktur_number, period_month, status, notes, created_at,
        invoice:invoices!tax_records_invoice_id_fkey (
          id, invoice_number, issued_date, total_amount,
          project:projects!invoices_project_id_fkey ( id, name,
            client:clients!projects_client_id_fkey ( contact_person, company_name, npwp )
          )
        )
      `)
      .in('invoice.project_id', idProyekPajak)
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (status)   q = q.eq('status', status)
    if (tax_type) q = q.eq('tax_type', tax_type)
    if (from)     q = q.gte('period_month', from)
    if (to)       q = q.lte('period_month', to)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // Filter by project_id if provided
     
    /*
      SATU tipe bernama, bukan `any` di tujuh lambda.

      Bentuknya diturunkan dari `.select()` di atas — bukan ditebak. Menuliskan
      `(r: any)` di tiap filter/reduce berarti tujuh tempat yang harus diingat
      saat kolomnya berubah, dan tak satu pun akan berbunyi kalau salah nama:
      `r.tax_amont` diam-diam `undefined`, lalu `Number(undefined)` jadi NaN,
      lalu totalnya NaN — di laporan pajak.
    */
    interface BarisPajak {
      tax_type?: string | null
      tax_amount?: number | string | null
      status?: string | null
      period_month?: string | null
      invoice?: { project?: { id?: string } | null } | null
      [k: string]: unknown
    }

    let records = (data ?? []) as BarisPajak[]
    if (project_id) {
      records = records.filter((r) => r.invoice?.project?.id === project_id)
    }

    // Aggregasi per bulan
    const byMonth: Record<string, { period: string; pph: number; ppn: number; total: number; count: number; pending: number; reported: number }> = {}
    for (const r of records) {
      const m = r.period_month?.slice(0, 7) ?? 'unknown'
      if (!byMonth[m]) byMonth[m] = { period: m, pph: 0, ppn: 0, total: 0, count: 0, pending: 0, reported: 0 }
      const amt = Number(r.tax_amount ?? 0)
      byMonth[m].total += amt
      byMonth[m].count++
      if (r.tax_type === 'pph_final') byMonth[m].pph += amt
      if (r.tax_type === 'ppn')       byMonth[m].ppn += amt
      if (r.status === 'pending')  byMonth[m].pending++
      if (r.status === 'reported') byMonth[m].reported++
    }

    const totalPph    = records.filter((r) => r.tax_type === 'pph_final').reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
    const totalPpn    = records.filter((r) => r.tax_type === 'ppn').reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
    const totalPending  = records.filter((r) => r.status === 'pending').length
    const totalReported = records.filter((r) => r.status === 'reported').length

    return reply.send({
      records,
      summary_by_month: Object.values(byMonth).sort((a, b) => b.period.localeCompare(a.period)),
      totals: {
        pph_final: totalPph,
        ppn: totalPpn,
        grand_total: totalPph + totalPpn,
        pending_count: totalPending,
        reported_count: totalReported,
        record_count: records.length,
      },
    })
  })

  // ── GET /api/v1/reports/rekap-pajak/ekspor ───────────────────────────────
  //
  // Rekap pajak dalam format APA PUN: csv · xlsx · pdf · json.
  //
  // ── Kenapa TERPISAH dari `bupot.csv` dan `efaktur.csv`
  //
  // Dua endpoint itu menghasilkan berkas berSKEMA WAJIB dari DJP — susunan
  // kolomnya ditentukan aplikasi penerima, dan mengubahnya berarti berkasnya
  // ditolak. Menambahkan `?format=pdf` di sana akan menghasilkan PDF yang
  // meniru skema mesin: tak terbaca manusia, dan tak diterima DJP.
  //
  // Yang ini kebalikannya: rekap untuk DIBACA — dikirim ke akuntan, dilampirkan
  // ke berkas pengajuan, atau disimpan sebagai arsip. Karena itu susunannya
  // bebas dan formatnya empat.
  //
  // ── Kenapa PDF ikut, padahal CSV lebih berguna untuk diolah
  //
  // CSV untuk MESIN, PDF untuk MANUSIA. Rekap pajak yang dikirim ke akuntan
  // lewat WhatsApp tak berguna sebagai CSV — ia dibuka di HP, dan yang
  // dibutuhkan halaman yang bisa dibaca apa adanya.
  app.get('/api/v1/reports/rekap-pajak/ekspor', {
    preHandler: [authenticate, requirePermission('finance:tax:view')],
  }, async (request, reply) => {
    const { project_id, date_from, date_to, format } = request.query as {
      project_id?: string; date_from?: string; date_to?: string; format?: string
    }

    // Daftar TERTUTUP — `format` datang dari query string.
    const fmt = formatSah(format ?? 'csv')
    if (!fmt) {
      return reply.status(400).send({
        error: `Format tidak dikenal. Pilih salah satu: ${FORMAT_EKSPOR.join(', ')}.`,
      })
    }

    const idProyek = await proyekBolehDibaca(request, project_id ?? null)
    if (idProyek === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    const { data: co } = await request.db!
      .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
      .select('name, legal_name').eq('id', request.companyId!).maybeSingle()

    let q = request.db!
      .unsafe('tax_records', 'kategori C lewat invoice_id; disaring .in(invoice.project_id) di bawah')
      .select(`
        id, tax_type, tax_scheme, base_amount, rate_pct, tax_amount,
        period_month, efaktur_number, status,
        invoice:invoices!tax_records_invoice_id_fkey (
          invoice_number, issued_date, project_id,
          project:projects!invoices_project_id_fkey ( name,
            client:clients!projects_client_id_fkey ( contact_person, company_name, npwp )
          )
        )
      `)
      .order('period_month', { ascending: true })
      .limit(5000)

    if (idProyek.length > 0) q = q.in('invoice.project_id', idProyek)
    if (date_from) q = q.gte('period_month', String(date_from).slice(0, 7))
    if (date_to) q = q.lte('period_month', String(date_to).slice(0, 7))

    const { data, error } = await q
    if (error) {
      request.log.error({ err: error }, 'gagal memuat rekap pajak untuk ekspor')
      return reply.status(500).send({ error: 'Gagal memuat rekap pajak' })
    }

    type Baris = {
      tax_type: string; tax_scheme: string | null
      base_amount: number | string | null; rate_pct: number | string | null
      tax_amount: number | string | null; period_month: string | null
      efaktur_number: string | null; status: string | null
      invoice: {
        invoice_number?: string | null; issued_date?: string | null
        project?: { name?: string | null; client?: { contact_person?: string | null
          company_name?: string | null; npwp?: string | null } | null } | null
      } | null
    }

    const baris = ((data ?? []) as Baris[])
      .filter((r) => r.invoice)
      .map((r) => ({
        periode: r.period_month ?? '',
        jenis: r.tax_type,
        proyek: r.invoice?.project?.name ?? '',
        klien: r.invoice?.project?.client?.company_name
          ?? r.invoice?.project?.client?.contact_person ?? '',
        npwp: r.invoice?.project?.client?.npwp ?? '',
        invoice: r.invoice?.invoice_number ?? '',
        tanggal: r.invoice?.issued_date ?? '',
        dpp: Number(r.base_amount) || 0,
        tarif: Number(r.rate_pct) || 0,
        pajak: Number(r.tax_amount) || 0,
        nomor_faktur: r.efaktur_number ?? '',
        status: r.status ?? '',
      }))

    const hasil = await susunEkspor(fmt, {
      judul: 'Rekap Pajak',
      tenant: (co as { legal_name?: string; name?: string } | null)?.legal_name
        ?? (co as { name?: string } | null)?.name ?? null,
      keterangan: `Periode ${date_from ?? 'awal'} s.d. ${date_to ?? 'akhir'} · ${baris.length} catatan`,
      kolom: [
        { kunci: 'periode', judul: 'Masa', lebar: 10 },
        { kunci: 'jenis', judul: 'Jenis', lebar: 14 },
        { kunci: 'proyek', judul: 'Proyek', lebar: 22 },
        { kunci: 'klien', judul: 'Klien', lebar: 22 },
        { kunci: 'npwp', judul: 'NPWP', lebar: 18 },
        { kunci: 'invoice', judul: 'Invoice', lebar: 18 },
        { kunci: 'dpp', judul: 'DPP', angka: true, lebar: 16 },
        { kunci: 'tarif', judul: 'Tarif %', angka: true, lebar: 9 },
        { kunci: 'pajak', judul: 'Pajak', angka: true, lebar: 16 },
        { kunci: 'nomor_faktur', judul: 'No. Faktur', lebar: 18 },
        { kunci: 'status', judul: 'Status', lebar: 11 },
      ],
      baris,
    })

    return reply
      .header('content-type', hasil.tipeKonten)
      .header('content-disposition',
        `attachment; filename="rekap-pajak-${date_from ?? 'awal'}-${date_to ?? 'akhir'}.${hasil.ekstensi}"`)
      .header('x-ekspor-jumlah', String(baris.length))
      .send(hasil.isi)
  })

  // ── GET /api/v1/reports/rekap-pajak/bupot.csv ────────────────────────────
  //
  // Bukti potong siap UNGGAH ke e-Bupot Unifikasi DJP.
  //
  // ── Kenapa berkas unggah, bukan sambungan API
  //
  // DJP tidak membuka API publik untuk e-Bupot; host-to-host hanya lewat
  // PJAP bersertifikat dengan langganan bulanan. Untuk perusahaan dengan
  // 18 catatan pajak setahun (diukur 2026-08-17), langganan itu lebih mahal
  // daripada mengetik ulang.
  //
  // Yang benar-benar menghemat waktu adalah berkas yang bisa diunggah — dan
  // itu tak butuh kredensial apa pun. Katalog menandai `fn-efaktur`
  // "sebagian" karena "pembuatan berkasnya lewat aplikasi DJP"; ini
  // memangkas separuh pekerjaan itu tanpa berpura-pura menggantikannya.
  //
  // ── Kenapa BUPOT, bukan e-Faktur
  //
  // 18 dari 18 catatan bertipe `pph_final_42`, NOL PPN. e-Faktur adalah
  // aplikasi PPN — tak relevan bagi yang belum PKP. Bukti potong PPh Final
  // justru terbit tiap kali klien memotong pembayaran.
  //
  // ── Baris yang tak lengkap: DILAPORKAN, bukan dibuang
  //
  // Header `X-Bupot-Ditolak` membawa jumlahnya, dan badan CSV hanya memuat
  // yang sah. Membuang diam-diam berarti orang mengunggah 12 baris dari 18
  // lalu mengira sudah lengkap — dan kekurangannya baru ketahuan saat DJP
  // menagih.
  app.get('/api/v1/reports/rekap-pajak/bupot.csv', {
    preHandler: [authenticate, requirePermission('finance:tax:view')],
  }, async (request, reply) => {
    const { project_id, date_from, date_to } = request.query as {
      project_id?: string; date_from?: string; date_to?: string
    }

    const idProyek = await proyekBolehDibaca(request, project_id ?? null)
    if (idProyek === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    let q = request.db!
      .unsafe('tax_records', 'kategori C lewat invoice_id; disaring .in(invoice.project_id) di bawah')
      .select(`
        id, tax_type, base_amount, rate_pct, tax_amount, period_month, efaktur_number,
        invoice:invoices!tax_records_invoice_id_fkey (
          id, invoice_number, issued_date, project_id,
          project:projects!invoices_project_id_fkey ( id, name,
            client:clients!projects_client_id_fkey ( contact_person, company_name, npwp )
          )
        )
      `)
      .limit(5000)

    if (idProyek.length > 0) q = q.in('invoice.project_id', idProyek)
    if (date_from) q = q.gte('period_month', String(date_from).slice(0, 7))
    if (date_to) q = q.lte('period_month', String(date_to).slice(0, 7))

    const { data, error } = await q
    if (error) {
      request.log.error({ err: error }, 'gagal memuat catatan pajak untuk ekspor bupot')
      return reply.status(500).send({ error: 'Gagal memuat catatan pajak' })
    }

    // Baris tanpa invoice tersaring di sini: `.in('invoice.project_id')` pada
    // PostgREST menyaring RELASINYA, bukan barisnya — jadi baris yang
    // invoicenya di luar jangkauan tetap terbawa dengan `invoice: null`.
    const baris = (data as BarisPajak[]).filter((r) => r.invoice)
    const hasil = susunCsvBupot(baris)

    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition',
        `attachment; filename="bupot-${date_from ?? 'awal'}-${date_to ?? 'akhir'}.csv"`)
      .header('x-bupot-jumlah', String(hasil.jumlah))
      .header('x-bupot-ditolak', String(hasil.ditolak.length))
      .send(hasil.csv)
  })

  // ── GET /api/v1/reports/rekap-pajak/efaktur.csv ──────────────────────────
  //
  // Faktur Pajak siap IMPOR ke aplikasi e-Faktur DJP (skema FK/LT/OF).
  //
  // ── Kenapa ada meski Puraloka belum PKP
  //
  // Ini produk SaaS multi-tenant. Tenant yang sudah PKP wajib menerbitkan
  // Faktur Pajak tiap masa — dan mengetiknya ulang satu per satu di aplikasi
  // DJP adalah pekerjaan yang paling mudah salah ketik justru karena
  // membosankan.
  //
  // Membangunnya hanya kalau tenant PERTAMA membutuhkannya berarti
  // menyempitkan keputusan produk ke data satu perusahaan — kesalahan yang
  // sama bentuknya dengan menulis angka di dokumen konteks.
  //
  // ── Gerbang PKP, dan kenapa ia BERTANGGAL
  //
  // Non-PKP yang menerbitkan Faktur Pajak melanggar UU PPN. Karena itu
  // endpoint ini menolak bila `companies.pkp_sejak` NULL — dan memakai
  // TANGGAL, bukan boolean: faktur untuk masa SEBELUM dikukuhkan tetap tak
  // sah meski hari ini perusahaannya sudah PKP.
  app.get('/api/v1/reports/rekap-pajak/efaktur.csv', {
    preHandler: [authenticate, requirePermission('finance:tax:view')],
  }, async (request, reply) => {
    const { project_id, date_from, date_to } = request.query as {
      project_id?: string; date_from?: string; date_to?: string
    }

    const { data: co, error: eCo } = await request.db!
      .unsafe('companies', 'tabel tenant itu sendiri; di-scope eq(id, companyId)')
      .select('id, name, pkp_sejak, pkp_dicabut_sejak')
      .eq('id', request.companyId!)
      .maybeSingle()
    if (eCo) {
      request.log.error({ err: eCo }, 'gagal memuat status PKP')
      return reply.status(500).send({ error: 'Gagal memuat status PKP perusahaan' })
    }

    const pkp = (co as { pkp_sejak?: string | null } | null)?.pkp_sejak ?? null
    if (!pkp) {
      // 422, bukan 403: ini bukan soal hak akses melainkan keadaan
      // perusahaan — dan pesannya menyebut cara memperbaikinya.
      return reply.status(422).send({
        error: 'Perusahaan ini belum berstatus PKP, jadi tidak menerbitkan Faktur Pajak. '
          + 'Isi tanggal pengukuhan PKP di Pengaturan bila sudah dikukuhkan. '
          + 'Untuk PPh Final, pakai ekspor bukti potong (bupot.csv).',
      })
    }

    const idProyek = await proyekBolehDibaca(request, project_id ?? null)
    if (idProyek === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

    let q = request.db!
      .unsafe('tax_records', 'kategori C lewat invoice_id; disaring .in(invoice.project_id) di bawah')
      .select(`
        id, tax_type, base_amount, rate_pct, tax_amount, period_month, efaktur_number,
        invoice:invoices!tax_records_invoice_id_fkey (
          id, invoice_number, issued_date, project_id,
          project:projects!invoices_project_id_fkey ( id, name,
            client:clients!projects_client_id_fkey ( contact_person, company_name, npwp, address )
          )
        )
      `)
      // HANYA PPN. PPh Final tak pernah masuk Faktur Pajak — mencampurnya
      // membuat SPT Masa PPN memuat pajak yang bukan objeknya.
      .eq('tax_type', 'ppn')
      .limit(5000)

    if (idProyek.length > 0) q = q.in('invoice.project_id', idProyek)
    if (date_from) q = q.gte('period_month', String(date_from).slice(0, 7))
    if (date_to) q = q.lte('period_month', String(date_to).slice(0, 7))

    const { data, error } = await q
    if (error) {
      request.log.error({ err: error }, 'gagal memuat catatan PPN untuk ekspor e-faktur')
      return reply.status(500).send({ error: 'Gagal memuat catatan PPN' })
    }

    const baris = (data as BarisFaktur[]).filter((r) => r.invoice)
    const hasil = susunCsvEfaktur(baris)

    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition',
        `attachment; filename="efaktur-${date_from ?? 'awal'}-${date_to ?? 'akhir'}.csv"`)
      .header('x-efaktur-jumlah', String(hasil.jumlah))
      .header('x-efaktur-ditolak', String(hasil.ditolak.length))
      .send(hasil.csv)
  })

  // ── PATCH /api/v1/reports/rekap-pajak/:id/status ─────────────────────────────
  // Update status tax_record: pending → reported (sudah dilaporkan ke DJP)
  app.patch('/api/v1/reports/rekap-pajak/:id/status', {
    preHandler: [authenticate, requirePermission('finance:tax:submit')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, efaktur_number } = request.body as { status: string; efaktur_number?: string }

    const valid = ['pending', 'reported']
    if (!valid.includes(status)) return reply.status(400).send({ error: 'Status tidak valid' })

    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (efaktur_number !== undefined) update.efaktur_number = efaktur_number || null

    // ⚠️ Gerbang tenant. Tanpa ini `UPDATE … WHERE id = $1` menyunting rekap
    // pajak perusahaan MANA PUN yang id-nya diketahui — dan yang diubah adalah
    // status pelaporan pajak + nomor e-Faktur, dua hal yang dipakai saat
    // berhadapan dengan kantor pajak.
    //
    // `tax_records` kategori C: tenancy-nya lewat `invoice_id → invoices.
    // project_id` (lihat tenant-map). Jadi pemeriksaannya dua langkah —
    // ambil invoice-nya dulu, lalu pastikan proyeknya milik tenant ini.
    // `.unsafe()` dengan alasan, BUKAN `.from()` atau `.viaProject()`:
    // `tax_records` kategori C tapi jalurnya `invoice_id → invoices.project_id`,
    // bukan `project_id` langsung — jadi `viaProject()` akan menyaring dengan
    // kolom yang tidak ada. Tenancy-nya dijamin oleh pemeriksaan di bawah
    // (`proyekBolehDibaca`), bukan oleh wrapper.
    const { data: rekap } = await request.db!
      .unsafe('tax_records', 'kategori C lewat invoice_id, bukan project_id — disaring proyekBolehDibaca di bawah')
      .select('id, invoice:invoices!inner(project_id)')
      .eq('id', id)
      .maybeSingle()
    const invEmbed = rekap?.invoice as { project_id?: string } | { project_id?: string }[] | null
    const proyekRekap = (Array.isArray(invEmbed) ? invEmbed[0] : invEmbed)?.project_id ?? null
    if (!proyekRekap || !(await proyekBolehDibaca(request, proyekRekap))) {
      return reply.status(404).send({ error: 'Record tidak ditemukan' })
    }

    const { data, error } = await supabase
      .from('tax_records')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Record tidak ditemukan' })
    return reply.send({ record: data })
  })

  // ── GET /api/v1/reports/kpi-perusahaan ───────────────────────────────────
  //
  // C1. Diukur 2026-08-12: kelima angkanya SUDAH dihitung, masing-masing di
  // lib-nya sendiri dan dipakai satu rute — CPI/SPI di `kurva-s.ts`, margin
  // di `cost-control.ts`, umur piutang di `finance.ts`, backlog di `bids.ts`.
  //
  // Yang tak ada: satu tempat yang membacanya BERSAMAAN. Untuk menjawab
  // "bagaimana keadaan perusahaan", seseorang harus membuka empat layar dan
  // menjumlahkan sendiri di kepala.
  //
  // Endpoint ini MEMANGGIL lib yang sama, bukan menghitung ulang. Menyalin
  // rumusnya akan membuat dua sumber kebenaran untuk angka yang sama, dan
  // cepat atau lambat dashboard melaporkan CPI berbeda dari halaman proyek.
  app.get(
    '/api/v1/reports/kpi-perusahaan',
    { preHandler: [authenticate, requirePermission('reports:view')] },
    async (request, reply) => {
      const db = request.db!
      const hariIni = new Date().toISOString().slice(0, 10)

      const [proyek, biaya, kasbon, bayarProgres, upah, invoice, bid] = await Promise.all([
        db.from('projects')
          .select('id, name, status, progress_pct, contract_value, start_date, end_date')
          .neq('status', 'cancelled'),

        // AC = pengeluaran proyek yang SUDAH DISETUJUI.
        //
        // Bukan seluruh baris: pengajuan yang masih `submitted` belum tentu
        // jadi biaya, dan memasukkannya membuat CPI terlihat lebih buruk
        // daripada kenyataannya — lalu membaik sendiri saat pengajuan ditolak.
        //
        // `unsafe` + saringan `project_id` eksplisit: `project_expenses`
        // kategori C (mewarisi tenancy lewat proyek), dan `db.from()`
        // MENOLAKNYA — gerbang tenancy menabrak percobaan pertama endpoint
        // ini dengan pesan yang tepat. `viaProject` tak dipakai karena ia
        // untuk SATU proyek; di sini seluruh proyek tenant sekaligus.
        db.unsafe('project_expenses', 'kategori C; disaring in(project_id, projectIds) di baris berikutnya')
          .select('project_id, total_amount')
          .eq('status', 'approved')
          .in('project_id', await db.projectIds()),

        // AC TIDAK cukup dari `project_expenses` saja.
        //
        // Diukur 2026-08-12: tabel itu KOSONG (nol baris), sementara biaya
        // nyata ada di kasbon (56), progress payment (5), dan upah harian.
        // Memakai `project_expenses` sendirian membuat AC = 0 dan CPI SELALU
        // null — angka yang terlihat "belum ada data" padahal datanya ada,
        // hanya di tabel lain.
        //
        // Sumbernya disamakan dengan `kurva-s.ts` supaya CPI perusahaan dan
        // CPI per proyek tak bercerita hal yang berbeda. Ketiganya menuju
        // proyek lewat `work_scopes → mandor_assignments`.
        /*
          ⚠ Disaring lewat `project_id`, BUKAN lewat `work_scopes!inner`.

          Versi sebelumnya menempuh rantai `work_scopes → mandor_assignments`
          dengan INNER join. Kasbon yang tak terikat work scope karena itu
          DIBUANG dari AC — diam-diam, tanpa satu pun galat.

          Diukur 2026-08-30 di basis dev: satu kasbon approved senilai
          Rp 2.500.000 tanpa `work_scope_id` hilang dari perhitungan, membuat
          AC perusahaan 1.362.255.000 sementara jumlah sebenarnya
          1.364.755.000. Arah kesalahannya berbahaya: AC yang terlalu KECIL
          membuat CPI terlihat lebih BAIK dari kenyataan.

          `kasbons` punya `project_id` sendiri (48 dari 48 kasbon approved
          terisi) dan `company_id`, jadi rantai itu tak pernah dibutuhkan.
          `work_scope_id` memang nullable — kasbon boleh diajukan untuk proyek
          tanpa menunjuk lingkup kerja tertentu.
        */
        db.from('kasbons')
          .select('amount, project_id')
          .eq('status', 'approved')
          .in('project_id', await db.projectIds()),

        // Keduanya kategori C lewat `work_scope_id` — `db.from()` MENOLAKNYA,
        // dan gerbang tenancy menabrak percobaan pertama endpoint ini dengan
        // pesan yang tepat. `viaProject` tak dipakai karena ia untuk SATU
        // proyek; di sini seluruh lingkup kerja tenant sekaligus.
        db.unsafe('progress_payments', 'kategori C; disaring in(work_scope_id, workScopeIds) di baris berikutnya')
          .select('net_payment, work_scopes!inner(mandor_assignments!inner(project_id))')
          .in('work_scope_id', await db.workScopeIds()),

        db.unsafe('daily_wage_logs', 'kategori C; disaring in(work_scope_id, workScopeIds) di baris berikutnya')
          .select('total_amount, work_scopes!inner(mandor_assignments!inner(project_id))')
          .in('work_scope_id', await db.workScopeIds()),

        // `invoices` kategori C, sama seperti `project_expenses` di atas.
        db.unsafe('invoices', 'kategori C; disaring in(project_id, projectIds) di baris berikutnya')
          .select('id, status, amount_due, due_date')
          .in('project_id', await db.projectIds()),

        db.from('bids')
          .select('id, status, bid_value, winner_value, submitted_at, decided_at, project_id'),
      ])

      // Diperiksa satu per satu dengan menyebut namanya, bukan lewat loop:
      // query yang ditambahkan nanti dan lupa dimasukkan ke array akan gagal
      // tanpa suara, dan `?? []` mengubahnya jadi "nol biaya" yang sah.
      if (proyek.error) return reply.status(500).send({ error: proyek.error.message })
      if (biaya.error) return reply.status(500).send({ error: biaya.error.message })
      if (kasbon.error) return reply.status(500).send({ error: kasbon.error.message })
      if (bayarProgres.error) return reply.status(500).send({ error: bayarProgres.error.message })
      if (upah.error) return reply.status(500).send({ error: upah.error.message })
      if (invoice.error) return reply.status(500).send({ error: invoice.error.message })
      if (bid.error) return reply.status(500).send({ error: bid.error.message })

      const acPerProyek = new Map<string, number>()
      const tambahAc = (id: string | null | undefined, n: number) => {
        if (!id || !Number.isFinite(n) || n === 0) return
        acPerProyek.set(id, (acPerProyek.get(id) ?? 0) + n)
      }
      for (const b of (biaya.data ?? []) as Array<Record<string, unknown>>) {
        tambahAc(b.project_id as string, Number(b.total_amount) || 0)
      }
      // Tiga sumber lain menuju proyek lewat relasi bersarang; id-nya dibaca
      // dari bentuk yang dipulangkan PostgREST.
      const idDariScope = (row: Record<string, unknown>): string | null => {
        const ws = row.work_scopes as Record<string, unknown> | undefined
        const ma = ws?.mandor_assignments as Record<string, unknown> | undefined
        return (ma?.project_id as string) ?? null
      }
      for (const k of (kasbon.data ?? []) as Array<Record<string, unknown>>) {
        // `project_id` LANGSUNG — kasbon tak lagi menempuh rantai work_scopes
        // (lihat alasannya di kuerinya). `idDariScope` akan memulangkan
        // undefined di sini karena embed-nya sudah tak ada.
        tambahAc(k.project_id as string | undefined, Number(k.amount) || 0)
      }
      for (const p of (bayarProgres.data ?? []) as Array<Record<string, unknown>>) {
        // `net_payment`, bukan gross: kasbon yang dipotong sudah masuk AC
        // lewat jalurnya sendiri. Memakai gross menghitungnya dua kali.
        tambahAc(idDariScope(p), Number(p.net_payment) || 0)
      }
      for (const w of (upah.data ?? []) as Array<Record<string, unknown>>) {
        tambahAc(idDariScope(w), Number(w.total_amount) || 0)
      }

      const untukKpi: ProyekUntukKpi[] = ((proyek.data ?? []) as Array<Record<string, unknown>>)
        .map((p) => ({
          id: p.id as string,
          name: (p.name as string) ?? '(tanpa nama)',
          // BAC = nilai kontrak.
          //
          // `kurva-s.ts` memakai pagu RAP bila terkunci, lalu total RAB, baru
          // nilai kontrak — tiga query berat per proyek. Untuk angka
          // PERUSAHAAN itu tak sepadan, dan nilai kontrak adalah dasar yang
          // sama untuk semua proyek. Konsekuensinya DISEBUTKAN di respons
          // (`dasar_bac`) supaya tak ada yang mengira ini angka yang sama
          // dengan kurva-S per proyek.
          bac: Number(p.contract_value) || 0,
          ac: acPerProyek.get(p.id as string) ?? 0,
          progresPct: Number(p.progress_pct) || 0,
          // Rencana progres LINEAR terhadap waktu.
          //
          // Baseline jadwal sesungguhnya ada di `baseline_jadwal_item` dan
          // lebih tepat; ia dipakai halaman proyek. Di sini pendekatan linear
          // dipakai supaya endpoint tetap satu query — dan `null` dipulangkan
          // bila proyek tak punya tanggal, sehingga SPI-nya null, bukan
          // ditebak.
          rencanaPct: rencanaLinear(p.start_date as string | null, p.end_date as string | null, hariIni),
        }))

      const evm = hitungKpiEvm(untukKpi)
      const aging = computeAging((invoice.data ?? []) as never[], hariIni)
      // Argumen kedua `hitungBacklog` adalah id proyek yang SUDAH SELESAI,
      // bukan tanggal. Tender yang menang tapi proyeknya tuntas bukan backlog
      // lagi — memasukkannya membuat kapasitas terlihat penuh padahal sudah
      // lowong, dan itu membuat perusahaan menolak kerja yang sanggup diambil.
      const proyekSelesai = new Set(
        ((proyek.data ?? []) as Array<Record<string, unknown>>)
          .filter((p) => p.status === 'completed' || p.status === 'selesai')
          .map((p) => p.id as string),
      )
      const backlog = hitungBacklog((bid.data ?? []) as BidRingkas[], proyekSelesai)

      return reply.send({
        tanggal: hariIni,
        evm: {
          ...evm,
          statusCpi: statusIndeks(evm.cpi, 'cpi'),
          statusSpi: statusIndeks(evm.spi, 'spi'),
          // Disebutkan supaya angka ini tak dikira identik dengan kurva-S.
          dasar_bac: 'contract_value',
          dasar_pv: 'linear terhadap tanggal mulai & selesai',
        },
        piutang: aging,
        backlog,
      })
    },
  )
}

/**
 * Persen rencana progres pada `hariIni`, linear terhadap durasi proyek.
 *
 * `null` bila tanggalnya tak lengkap atau durasinya nol — supaya SPI-nya
 * null, bukan ditebak. Proyek tanpa tanggal tak punya jadwal untuk
 * dibandingkan, dan menganggapnya tepat jadwal adalah kebohongan.
 */
function rencanaLinear(mulai: string | null, selesai: string | null, kini: string): number | null {
  if (!mulai || !selesai) return null
  const m = Date.parse(mulai)
  const s = Date.parse(selesai)
  const k = Date.parse(kini)
  if (!Number.isFinite(m) || !Number.isFinite(s) || s <= m) return null
  if (k <= m) return 0
  if (k >= s) return 100
  return Math.round(((k - m) / (s - m)) * 10_000) / 100
}
