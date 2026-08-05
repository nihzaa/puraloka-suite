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

      // `requested_by` dan `project_id` ikut diambil sebagai JALUR CADANGAN.
      //
      // Nama mandor & proyek biasanya datang lewat rantai
      // `work_scopes → mandor_assignments`. Tapi `work_scope_id` boleh NULL
      // (kasbon yang tak terikat lingkup kerja), dan untuk kasbon seperti itu
      // seluruh rantai putus — dashboard menampilkan "—" di kolom Mandor DAN
      // Proyek, lalu tetap menyodorkan tombol "Setuju".
      //
      // Menyetujui pengeluaran uang tanpa tahu siapa yang meminta dan untuk
      // proyek apa adalah kegagalan kontrol, bukan sekadar tampilan kosong.
      //
      // Dan informasinya SELALU ADA: `requested_by` NOT NULL di skema, dan
      // `project_id` terisi. Diperiksa di data nyata — kasbon Rp 1 juta yang
      // tampil "—/—" ternyata diajukan Pak Budi Santoso untuk proyek Renovasi
      // Rumah Pak Andi. Datanya lengkap, cuma tak pernah diambil.
      db.from('kasbons')
        .select(`
          id, amount, fund_source, purpose, kasbon_date, notes, status, created_at,
          pemohon:users!kasbons_requested_by_fkey ( id, name ),
          proyek_langsung:projects!kasbons_project_id_fkey ( id, name ),
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

  // ── GET /api/v1/dashboard/fokus ──────────────────────────────────────────
  //
  // "Berapa hal yang menunggu keputusan saya, dan berapa yang sudah lewat
  // tenggat?" — pertanyaan yang orang bawa saat membuka aplikasi, dan yang
  // hari ini jawabannya tersebar di enam halaman berbeda.
  //
  // Dipakai widget sidebar, jadi ia hadir di SETIAP halaman. Itu sengaja:
  // yang paling mendesak justru ditemukan saat sedang mengerjakan hal lain,
  // bukan saat kebetulan membuka dashboard.
  //
  // ── Kenapa `lewat` DIPISAH dari `menunggu`
  //
  // Dua-duanya "belum selesai", tapi yang satu masih dalam kendali dan yang
  // lain sudah merugikan. Menyatukannya membuat yang mendesak tenggelam di
  // antara yang biasa — dan angka gabungan yang besar melatih orang
  // mengabaikannya.
  app.get('/api/v1/dashboard/fokus', {
    preHandler: [authenticate],
  }, async (request) => {
    const hariIni = new Date().toISOString().split('T')[0]

    // Seluruhnya lewat `request.db` (sadar tenant). Ringkasan lintas-modul
    // adalah tempat paling mudah membocorkan data perusahaan lain: satu
    // query mentah di sini membuat angkanya salah tanpa gejala apa pun.
    const db = request.db!

    // ⚠️ Empat dari lima tabel di bawah berkategori C — mewarisi tenancy dari
    // project, TIDAK punya `company_id` sendiri. Penjaga menolak query
    // langsung ke tabel C, dan itu benar: ini layar LINTAS-PROYEK, jadi tak
    // ada satu project sebagai konteks dan `viaProject()` tak berlaku.
    //
    // Pola yang sah (tenant-db.ts baris 108-133, dipakai juga di baris 63
    // berkas ini): ambil daftar id milik company, lalu saring `supabase`
    // mentah dengan `.in()`. `db.from()` menolak kategori C di titik `from()`
    // — sebelum `.in()` sempat terpasang — jadi ia memang bukan jalannya.
    //
    // `projectIds()`/`workScopeIds()` di-memo per request, jadi empat query
    // di sini tetap sekali hit DB per daftar.
    //
    // Kalau saringan ini hilang, ringkasan menghitung pekerjaan perusahaan
    // LAIN — dan angkanya tetap terlihat masuk akal. Kebocoran tanpa gejala
    // adalah yang paling lama tak ketahuan.
    const [idProyek, idScope] = await Promise.all([db.projectIds(), db.workScopeIds()])

    // Alasan tercatat untuk `db.unsafe()` di bawah — wajib, dan itu
    // memang gunanya: pemakaian yang melewati pintu aman harus
    // meninggalkan jejak yang bisa ditinjau.
    const ALASAN = 'ringkasan lintas-proyek milik company; sudah disaring lewat idProyek/idScope dari db.projectIds()/workScopeIds()'

    const [kasbon, penagihan, invoice, klaim, instruksi] = await Promise.all([
      // Kasbon menunggu persetujuan — uang keluar. Kategori B, punya
      // company_id sendiri, jadi `db.from()` sudah cukup.
      db.from('kasbons').select('id').eq('status', 'pending'),
      // ── Empat query berikut memakai `db.unsafe()`, BUKAN `supabase` mentah.
      //
      // Keempat tabelnya kategori C (tenancy diwarisi lewat project/scope),
      // dan `viaProject()` menuntut SATU `projectId` — sementara widget ini
      // meringkas SELURUH proyek milik company. Jadi pintu yang benar adalah
      // `unsafe()` dengan alasan tercatat, bukan `supabase` yang menghindari
      // pencatatan itu sama sekali.
      //
      // Saya sendiri yang menulisnya salah di commit 8dec5c7 ("widget fokus"),
      // dan ratchet tenancy menangkapnya: 366 → 370. Filternya memang sudah
      // benar sejak awal (`.in('project_id', idProyek)` cocok persis dengan
      // kolom yang ditetapkan `tenant-map.generated.ts`) — yang salah hanya
      // jalur yang dipakai, dan itu justru yang membuat pelanggaran seperti
      // ini tak terlihat saat ditinjau.
      // Penagihan progres mandor menunggu konfirmasi.
      db.unsafe('progress_payments', ALASAN).select('id').eq('status', 'pending')
        .in('work_scope_id', idScope),
      // Invoice jatuh tempo yang belum lunas — INI yang lewat tenggat.
      db.unsafe('invoices', ALASAN).select('id, due_date, amount_due, status')
        .neq('status', 'cancelled').gt('amount_due', 0)
        .in('project_id', idProyek),
      // Klaim yang batas pemberitahuannya sudah lewat dan belum diputus.
      db.unsafe('contract_claims', ALASAN).select('id, event_date, notice_days_limit, notified_at, status')
        .in('status', ['draft', 'diberitahukan', 'diajukan'])
        .in('project_id', idProyek),
      // Instruksi lisan yang belum dikonfirmasi — utang bukti.
      db.unsafe('field_instructions', ALASAN).select('id, bentuk_perintah, diterima_pada, dikonfirmasi_pada, status')
        .in('status', ['dicatat'])
        .in('project_id', idProyek),
    ])

    // Galat dari mana pun membuat SELURUH ringkasan salah — "3 menunggu" saat
    // sebenarnya 11 lebih berbahaya daripada widget yang menghilang. Jadi
    // gagal keras, biar sidebar menyembunyikan dirinya sendiri.
    for (const [nama, hasil] of Object.entries({ kasbon, penagihan, invoice, klaim, instruksi })) {
      if (hasil.error) {
        request.log.error({ err: hasil.error, sumber: nama }, 'fokus: query gagal')
        throw new Error(`Gagal membaca ${nama}: ${hasil.error.message}`)
      }
    }

    const invoiceLewat = ((invoice.data ?? []) as Array<{ due_date: string }>)
      .filter((i) => i.due_date && i.due_date < hariIni).length

    const klaimLewat = ((klaim.data ?? []) as Array<{
      event_date: string; notice_days_limit: number | null; notified_at: string | null
    }>).filter((k) => {
      // Sudah diberitahukan = tenggatnya sudah terpenuhi, apa pun statusnya
      // sekarang. Yang dihitung hanya yang BELUM diberitahukan.
      if (k.notified_at || k.notice_days_limit == null) return false
      const batas = new Date(k.event_date)
      batas.setDate(batas.getDate() + k.notice_days_limit)
      return batas.toISOString().split('T')[0] < hariIni
    }).length

    // Instruksi LISAN/TELEPON punya batas 24 jam (lihat lib/instruksi-lapangan).
    // Bentuk lain tak dihitung di sini — tertulis sudah berjejak, dan
    // whatsapp/rapat punya batas lebih longgar yang belum mendesak hari ini.
    const batasMs = 24 * 3_600_000
    const instruksiLewat = ((instruksi.data ?? []) as Array<{
      bentuk_perintah: string; diterima_pada: string; dikonfirmasi_pada: string | null
    }>).filter((i) =>
      !i.dikonfirmasi_pada &&
      (i.bentuk_perintah === 'lisan' || i.bentuk_perintah === 'telepon') &&
      Date.now() - Date.parse(i.diterima_pada) > batasMs
    ).length

    const lewat = invoiceLewat + klaimLewat + instruksiLewat
    const menunggu = (kasbon.data?.length ?? 0) + (penagihan.data?.length ?? 0)

    return {
      lewat,
      menunggu,
      // Ke mana orang harus pergi. Yang lewat tenggat lebih mendesak, jadi
      // tautannya menang — mengirim orang ke daftar umum saat ada yang
      // terlambat berarti ia harus mencari lagi.
      tautan: lewat > 0 ? '/keuangan' : '/mandor',
      rincian: {
        invoice_jatuh_tempo: invoiceLewat,
        klaim_lewat_batas: klaimLewat,
        instruksi_belum_dikonfirmasi: instruksiLewat,
        kasbon_menunggu: kasbon.data?.length ?? 0,
        penagihan_menunggu: penagihan.data?.length ?? 0,
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
