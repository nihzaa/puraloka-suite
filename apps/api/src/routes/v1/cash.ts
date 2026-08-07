import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { validateMime } from '../../utils/mime.js'
import { evaluateEntityApproval, recordApproval, clearApprovalProgress, canParticipateInChain, idAlurPersetujuan } from '../../utils/approval.js'
import { logAuditEvent } from '../../utils/audit.js'
import { proyekBolehDibaca, proyekMilikTenant } from '../../utils/tenant-guard.js'
import { gerbangIdempotensi, catatIdempotensi } from '../../utils/idempotency.js'

const ALLOWED_IMAGE_PDF = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export default async function cashRoutes(app: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════════════════════
  // CASH ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/cash/accounts — list semua akun kas
  app.get('/api/v1/cash/accounts', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { type, project_id, include_inactive } = request.query as Record<string, string>

    let q = request.db!
      .from('cash_accounts')
      .select(`
        id, name, type, balance, currency, notes, is_active, created_at,
        owner:users!cash_accounts_owner_id_fkey ( id, name ),
        projects ( id, name )
      `)
      .order('type')
      .order('name')

    if (!include_inactive || include_inactive === 'false') q = q.eq('is_active', true)
    if (type) q = q.eq('type', type)
    if (project_id) q = q.eq('project_id', project_id)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ accounts: data ?? [] })
  })

  // GET /api/v1/cash/accounts/:id — detail akun + history transfer
  app.get<{ Params: { id: string } }>('/api/v1/cash/accounts/:id', {
    preHandler: [authenticate, requirePermission('cash:view')]
  }, async (request, reply) => {
    const { id } = request.params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return reply.status(400).send({ error: 'ID tidak valid' })
    }

    const [accountRes, transfersRes, expensesRes] = await Promise.all([
      request.db!
        .from('cash_accounts')
        .select(`
          id, name, type, balance, currency, notes, is_active, created_at,
          owner:users!cash_accounts_owner_id_fkey ( id, name ),
          projects ( id, name )
        `)
        .eq('id', id)
        .single(),

      request.db!
        .from('cash_transfers')
        .select(`
          id, amount, transfer_date, status, ref_number, notes, proof_url, created_at,
          from_account:cash_accounts!cash_transfers_from_account_id_fkey ( id, name, type ),
          to_account:cash_accounts!cash_transfers_to_account_id_fkey ( id, name, type ),
          creator:users!cash_transfers_created_by_fkey ( id, name )
        `)
        .or(`from_account_id.eq.${id},to_account_id.eq.${id}`)
        .order('transfer_date', { ascending: false })
        .limit(50),

      supabase
        .from('project_expenses')
        .select('id, description, total_amount, expense_date, status, projects(id, name)')
        .eq('petty_cash_id', id)
        .eq('status', 'approved')
        .order('expense_date', { ascending: false })
        .limit(20),
    ])

    if (accountRes.error || !accountRes.data) return reply.status(404).send({ error: 'Akun tidak ditemukan' })

    const currentUser = request.currentUser!
    const acct = accountRes.data as typeof accountRes.data & { owner: { id: string } | null; projects: { id: string } | null }

    // PM hanya bisa lihat akun kas proyeknya sendiri (data-scoping ownership,
    // bukan authorization gate — ADR-004 Rule #1; akses cash:view sudah dijamin
    // permission gate di preHandler, ini menyempitkan ke proyek milik PM).
    if (currentUser.role === 'pm') {
      const projectId = acct.projects?.id ?? null
      if (projectId) {
        const { data: proj } = await request.db!.from('projects').select('pm_id').eq('id', projectId).single()
        if (!proj || proj.pm_id !== currentUser.id) return reply.status(403).send({ error: 'Akses ditolak' })
      }
    }

    return reply.send({
      account: acct,
      transfers: transfersRes.data ?? [],
      expenses: expensesRes.data ?? [],
    })
  })

  // POST /api/v1/cash/accounts — buat akun kas baru
  app.post('/api/v1/cash/accounts', {
    preHandler: [authenticate, requirePermission('cash:account:manage')]
  }, async (request, reply) => {
    const body = request.body as {
      name: string
      type: 'main' | 'collector' | 'petty_cash'
      owner_id?: string
      project_id?: string
      initial_balance?: number
      notes?: string
    }

    if (!body.name || !body.type) {
      return reply.status(400).send({ error: 'name dan type wajib diisi' })
    }
    if (body.type === 'petty_cash' && (!body.owner_id || !body.project_id)) {
      return reply.status(400).send({ error: 'Kas kecil membutuhkan owner_id dan project_id' })
    }
    // T4g: akun kas ini ter-scope company (kategori B), tapi `project_id`-nya
    // datang dari body — tanpa cek, akun tenant A bisa menunjuk proyek tenant B
    // (data korup, dan laporan kas per-proyek jadi salah di kedua sisi).
    if (body.project_id && !(await proyekMilikTenant(request, body.project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const { data, error } = await request.db!
      .from('cash_accounts')
      .insert({
        name: body.name,
        type: body.type,
        owner_id: body.owner_id ?? null,
        project_id: body.project_id ?? null,
        balance: body.initial_balance ?? 0,
        notes: body.notes ?? null,
        created_by: (request as any).currentUser!.id,
      })
      .select(`
        id, name, type, balance, currency, notes, is_active, created_at,
        owner:users!cash_accounts_owner_id_fkey ( id, name ),
        projects ( id, name )
      `)
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ account: data })
  })

  // PATCH /api/v1/cash/accounts/:id — edit nama/catatan atau deactivate
  app.patch<{ Params: { id: string } }>('/api/v1/cash/accounts/:id', {
    preHandler: [authenticate, requirePermission('cash:account:manage')]
  }, async (request, reply) => {
    const { id } = request.params
    const body = request.body as { name?: string; notes?: string; is_active?: boolean }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data, error } = await request.db!
      .from('cash_accounts')
      .update(updates)
      .eq('id', id)
      .select('id, name, type, balance, is_active, notes')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ account: data })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CASH TRANSFERS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/cash/transfers — list semua transfer
  app.get('/api/v1/cash/transfers', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { status, limit = '50', offset = '0', from_id, to_id } = request.query as Record<string, string>
    const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
    const off = Math.max(0, Number(offset) || 0)

    let q = request.db!
      .from('cash_transfers')
      .select(`
        id, amount, transfer_date, status, ref_number, notes, proof_url,
        confirmed_at, created_at,
        from_account:cash_accounts!cash_transfers_from_account_id_fkey ( id, name, type ),
        to_account:cash_accounts!cash_transfers_to_account_id_fkey ( id, name, type ),
        creator:users!cash_transfers_created_by_fkey ( id, name ),
        confirmer:users!cash_transfers_confirmed_by_fkey ( id, name )
      `)
      .order('transfer_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1)

    if (status) q = q.eq('status', status)
    if (from_id) q = q.eq('from_account_id', from_id)
    if (to_id) q = q.eq('to_account_id', to_id)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ transfers: data ?? [] })
  })

  // POST /api/v1/cash/transfers — catat transfer baru
  app.post('/api/v1/cash/transfers', {
    preHandler: [authenticate, requirePermission('cash:transfer:create')]
  }, async (request, reply) => {
    // Gerbang idempotensi (F1-1). `cash_transfers` punya
    // `trg_cash_transfer_balance` — satu baris ganda = saldo dua rekening
    // bergeser dua kali. Diperiksa sebelum apa pun divalidasi atau ditulis.
    const kunciIdem = await gerbangIdempotensi(request, reply, 'cash:transfer:create')
    if (kunciIdem === null) return

    const body = request.body as {
      from_account_id: string
      to_account_id: string
      amount: number
      transfer_date?: string
      status?: 'pending' | 'confirmed'
      ref_number?: string
      notes?: string
    }

    if (!body.from_account_id || !body.to_account_id || !body.amount) {
      return reply.status(400).send({ error: 'from_account_id, to_account_id, dan amount wajib diisi' })
    }
    if (body.from_account_id === body.to_account_id) {
      return reply.status(400).send({ error: 'Akun asal dan tujuan tidak boleh sama' })
    }

    // Cek saldo akun asal (jika langsung confirmed)
    const targetStatus = body.status ?? 'pending'
    if (targetStatus === 'confirmed') {
      const { data: fromAcc } = await request.db!
        .from('cash_accounts')
        .select('balance, name')
        .eq('id', body.from_account_id)
        .single()

      // Akun WAJIB ketemu. `if (fromAcc && …)` melewatkan pemeriksaan diam-diam
      // saat query gagal atau id-nya salah — transaksi lolos dan saldo bisa
      // jatuh di bawah nol tanpa satu pun pesan.
      if (!fromAcc) {
        return reply.status(404).send({ error: 'Akun kas asal tidak ditemukan' })
      }
      if (Number(fromAcc.balance) < body.amount) {
        return reply.status(400).send({
          error: `Saldo ${fromAcc.name} tidak mencukupi (saldo: Rp ${Number(fromAcc.balance).toLocaleString('id-ID')}, dibutuhkan: Rp ${body.amount.toLocaleString('id-ID')})`
        })
      }
    }

    const { data, error } = await request.db!
      .from('cash_transfers')
      .insert({
        from_account_id: body.from_account_id,
        to_account_id: body.to_account_id,
        amount: body.amount,
        transfer_date: body.transfer_date ?? new Date().toISOString().split('T')[0],
        status: targetStatus,
        ref_number: body.ref_number ?? null,
        notes: body.notes ?? null,
        confirmed_at: targetStatus === 'confirmed' ? new Date().toISOString() : null,
        confirmed_by: targetStatus === 'confirmed' ? (request as any).currentUser!.id : null,
        created_by: (request as any).currentUser!.id,
      })
      .select(`
        id, amount, transfer_date, status, ref_number, notes, created_at,
        from_account:cash_accounts!cash_transfers_from_account_id_fkey ( id, name, type ),
        to_account:cash_accounts!cash_transfers_to_account_id_fkey ( id, name, type )
      `)
      .single()

    if (error) return reply.status(500).send({ error: error.message })

    const hasilTransfer = { transfer: data }
    await catatIdempotensi(request, 'cash:transfer:create', kunciIdem ?? null, 201, hasilTransfer)
    return reply.status(201).send(hasilTransfer)
  })

  // PATCH /api/v1/cash/transfers/:id/confirm — konfirmasi penerimaan
  app.patch<{ Params: { id: string } }>('/api/v1/cash/transfers/:id/confirm', {
    preHandler: [authenticate, requirePermission('cash:transfer:confirm')]
  }, async (request, reply) => {
    const { id } = request.params

    const { data: transfer } = await request.db!
      .from('cash_transfers')
      .select('id, status, amount, from_account_id')
      .eq('id', id)
      .single()

    if (!transfer) return reply.status(404).send({ error: 'Transfer tidak ditemukan' })
    if (transfer.status === 'confirmed') return reply.status(400).send({ error: 'Transfer sudah dikonfirmasi' })
    if (transfer.status === 'cancelled') return reply.status(400).send({ error: 'Transfer sudah dibatalkan' })

    // Cek saldo
    const { data: fromAcc } = await request.db!
      .from('cash_accounts')
      .select('balance, name')
      .eq('id', transfer.from_account_id)
      .single()

    // Akun WAJIB ketemu. `if (fromAcc && …)` melewatkan pemeriksaan diam-diam
    // saat query gagal atau id-nya salah — transaksi lolos dan saldo bisa
    // jatuh di bawah nol tanpa satu pun pesan.
    if (!fromAcc) {
      return reply.status(404).send({ error: 'Akun kas asal tidak ditemukan' })
    }
    if (Number(fromAcc.balance) < transfer.amount) {
      return reply.status(400).send({
        error: `Saldo ${fromAcc.name} tidak mencukupi untuk konfirmasi transfer ini`
      })
    }

    const { data, error } = await request.db!
      .from('cash_transfers')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: (request as any).currentUser!.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status, confirmed_at')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ transfer: data })
  })

  // PATCH /api/v1/cash/transfers/:id/cancel — batalkan transfer
  app.patch<{ Params: { id: string } }>('/api/v1/cash/transfers/:id/cancel', {
    preHandler: [authenticate, requirePermission('cash:account:manage')]
  }, async (request, reply) => {
    const { id } = request.params

    const { data: transfer } = await request.db!
      .from('cash_transfers')
      .select('id, status')
      .eq('id', id)
      .single()

    if (!transfer) return reply.status(404).send({ error: 'Transfer tidak ditemukan' })
    if (transfer.status === 'cancelled') return reply.status(400).send({ error: 'Transfer sudah dibatalkan' })

    const { data, error } = await request.db!
      .from('cash_transfers')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ transfer: data })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT EXPENSES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/cash/expenses — list pengeluaran lintas proyek
  app.get('/api/v1/cash/expenses', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const {
      project_id, status, category_id, petty_cash_id,
      date_from, date_to, limit = '100', offset = '0'
    } = request.query as Record<string, string>
    const lim2 = Math.min(Math.max(1, Number(limit) || 100), 200)
    const off2 = Math.max(0, Number(offset) || 0)

    let q = supabase
      .from('project_expenses')
      .select(`
        id, description, qty, unit, unit_price, total_amount,
        expense_date, expense_source, vendor_name, receipt_url, notes,
        status, created_at,
        projects ( id, name, location ),
        category:project_expense_categories ( id, name, type ),
        petty_cash:cash_accounts!project_expenses_petty_cash_id_fkey ( id, name, type ),
        main_cash:cash_accounts!project_expenses_main_cash_id_fkey ( id, name, type ),
        submitter:users!project_expenses_submitted_by_fkey ( id, name ),
        reviewer:users!project_expenses_reviewed_by_fkey ( id, name )
      `)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(off2, off2 + lim2 - 1)

    // T4g: SELALU di-scope; project_id hanya mempersempit.
    const idProyekExp = await proyekBolehDibaca(request, project_id)
    if (idProyekExp === null) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    q = q.in('project_id', idProyekExp)
    if (status)        q = q.eq('status', status)
    if (category_id)   q = q.eq('category_id', category_id)
    if (petty_cash_id) q = q.eq('petty_cash_id', petty_cash_id)
    if (date_from)     q = q.gte('expense_date', date_from)
    if (date_to)       q = q.lte('expense_date', date_to)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ expenses: data ?? [] })
  })

  // POST /api/v1/cash/expenses — input pengeluaran baru (multipart: bisa upload nota)
  app.post('/api/v1/cash/expenses', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    // Parse multipart
    const parts = request.parts()
    const fields: Record<string, string> = {}
    let receiptUrl: string | null = null

    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'receipt') {
          const buf = await part.toBuffer()
          if (buf.length > 5 * 1024 * 1024) {
            return reply.status(400).send({ error: 'Ukuran file maksimal 5MB' })
          }
          let detectedMime: string
          try {
            detectedMime = validateMime(buf, ALLOWED_IMAGE_PDF)
          } catch (e: unknown) {
            return reply.status(400).send({ error: (e as Error).message })
          }
          const ext = detectedMime.split('/')[1].replace('jpeg', 'jpg')
          // Segmen tenant di depan (F2-5). `project_id` bisa kosong —
          // fallback lamanya `'unknown'` membuat SEMUA tenant berbagi satu
          // folder `receipts/unknown/`, dan bukti pengeluaran mereka bercampur
          // di sana.
          const filename =
            `${request.companyId}/receipts/${fields.project_id ?? 'tanpa-proyek'}/${Date.now()}.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('expense-receipts')
            .upload(filename, buf, { contentType: detectedMime })
          if (!uploadErr) {
            // Bucket privat (migration 097): pakai signed URL (bukan public URL) — pola documents.ts.
            const { data: urlData } = await supabase.storage.from('expense-receipts')
              .createSignedUrl(filename, 60 * 60 * 24 * 365 * 10)
            receiptUrl = urlData?.signedUrl ?? null
          }
        } else {
          await part.toBuffer()
        }
      } else {
        fields[part.fieldname] = (part as any).value as string
      }
    }

    const {
      project_id, category_id, petty_cash_id, main_cash_id, expense_source,
      description, expense_date, qty, unit, unit_price, vendor_name, notes
    } = fields

    if (!project_id || !category_id || !description || !unit_price) {
      return reply.status(400).send({ error: 'project_id, category_id, description, unit_price wajib diisi' })
    }
    // T4g: project_id datang dari BODY. Tanpa gerbang ini, tenant A mencatat
    // pengeluaran (yang untuk admin/pm langsung auto-approved) ke proyek tenant
    // B dan mengunggah notanya ke folder storage milik B.
    if (!(await proyekMilikTenant(request, project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    const source = (expense_source ?? 'petty_cash') as 'petty_cash' | 'main_cash' | 'personal'
    if (source === 'petty_cash' && !petty_cash_id) {
      return reply.status(400).send({ error: 'petty_cash_id wajib jika expense_source = petty_cash' })
    }
    if (source === 'main_cash' && !main_cash_id) {
      return reply.status(400).send({ error: 'main_cash_id wajib jika expense_source = main_cash' })
    }

    const qtyNum = parseFloat(qty ?? '1')
    const priceNum = parseFloat(unit_price)
    const total = parseFloat((qtyNum * priceNum).toFixed(2))

    // Cek saldo kas kecil jika dari petty cash
    if (source === 'petty_cash' && petty_cash_id) {
      const { data: acc } = await request.db!
        .from('cash_accounts')
        .select('balance, name')
        .eq('id', petty_cash_id)
        .single()

      // Akun WAJIB ketemu. `if (acc && …)` melewatkan pemeriksaan diam-diam
      // saat query gagal atau id-nya salah — transaksi lolos dan saldo bisa
      // jatuh di bawah nol tanpa satu pun pesan.
      if (!acc) {
        return reply.status(404).send({ error: 'Akun kas kecil tidak ditemukan' })
      }
      if (Number(acc.balance) < total) {
        return reply.status(400).send({
          error: `Saldo kas kecil (${acc.name}) tidak mencukupi. Saldo: Rp ${Number(acc.balance).toLocaleString('id-ID')}, dibutuhkan: Rp ${total.toLocaleString('id-ID')}`
        })
      }
    }

    // Cek saldo kas utama jika dari main_cash (hanya saat admin/pm yg langsung approve)
    if (source === 'main_cash' && main_cash_id) {
      const { data: acc } = await request.db!
        .from('cash_accounts')
        .select('balance, name, type')
        .eq('id', main_cash_id)
        .eq('type', 'main')
        .single()

      if (!acc) {
        return reply.status(400).send({ error: 'Akun Kas Utama tidak valid' })
      }
    }

    const currentUser = (request as any).currentUser!
    // Business rule, BUKAN authorization gate (ADR-004 Rule #6): menentukan
    // apakah expense langsung approved vs submitted — bukan boleh/tidak submit.
    // Jangan migrasikan ke permission; ini kandidat Workflow Engine (Program B).
    const autoApprove = currentUser.role === 'admin' || currentUser.role === 'pm'

    const { data, error } = await request.db!
      .viaProject('project_expenses', project_id)
      .insert({
        project_id,
        category_id,
        petty_cash_id: source === 'petty_cash' ? (petty_cash_id ?? null) : null,
        main_cash_id: source === 'main_cash' ? (main_cash_id ?? null) : null,
        expense_source: source,
        description,
        expense_date: expense_date ?? new Date().toISOString().split('T')[0],
        qty: qtyNum,
        unit: unit ?? null,
        unit_price: priceNum,
        total_amount: total,
        vendor_name: vendor_name ?? null,
        receipt_url: receiptUrl,
        notes: notes ?? null,
        status: autoApprove ? 'approved' : 'submitted',
        submitted_by: currentUser.id,
        reviewed_by: autoApprove ? currentUser.id : null,
        reviewed_at: autoApprove ? new Date().toISOString() : null,
      })
      .select(`
        id, description, qty, unit, unit_price, total_amount,
        expense_date, expense_source, vendor_name, receipt_url, status, created_at,
        projects ( id, name ),
        category:project_expense_categories ( id, name, type ),
        petty_cash:cash_accounts!project_expenses_petty_cash_id_fkey ( id, name ),
        main_cash:cash_accounts!project_expenses_main_cash_id_fkey ( id, name )
      `)
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(201).send({ expense: data })
  })

  // PATCH /api/v1/cash/expenses/:id/status — approve atau reject
  // 2A-5 (ADR-007): berapa level & siapa yang boleh = rantai approval (config),
  // bukan satu requirePermission tetap. Seed = 1 langkah dengan permission yang
  // sama persis (`cash:expense:approve`) → perilaku hari ini tidak berubah.
  app.patch<{ Params: { id: string } }>('/api/v1/cash/expenses/:id/status', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params
    const { status, notes } = request.body as { status: 'approved' | 'rejected'; notes?: string }

    if (!['approved', 'rejected'].includes(status)) {
      return reply.status(400).send({ error: 'status harus approved atau rejected' })
    }

    // Gerbang KASAR sebelum entitas di-fetch → urutan lama 403-sebelum-404 terjaga.
    const coarse = await canParticipateInChain(request, 'project_expense')
    if (coarse.configError) {
      app.log.error({ configError: coarse.configError }, 'baca rantai approval gagal')
      return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
    }
    if (!coarse.ok) return reply.status(403).send({ error: 'Akses ditolak' })

    const { data: expense } = await supabase
      .from('project_expenses')
      .select('id, status, expense_source, petty_cash_id, main_cash_id, total_amount, project_id')
      .eq('id', id)
      .maybeSingle()

    if (!expense) return reply.status(404).send({ error: 'Pengeluaran tidak ditemukan' })
    // T4g: approve/reject pengeluaran tenant lain = memindahkan uang di
    // pembukuan mereka. Diperiksa SETELAH gerbang approval (403) supaya urutan
    // 403-sebelum-404 yang sudah ada tetap terjaga.
    if (!(await proyekMilikTenant(request, expense.project_id))) {
      return reply.status(404).send({ error: 'Pengeluaran tidak ditemukan' })
    }
    if (expense.status === 'approved' && status === 'approved') {
      return reply.status(400).send({ error: 'Pengeluaran sudah disetujui' })
    }

    // Evaluasi rantai (nilai pengeluaran = dasar syarat nominal).
    let expenseDecision: Awaited<ReturnType<typeof evaluateEntityApproval>> | null = null
    if (status === 'approved') {
      expenseDecision = await evaluateEntityApproval(request, {
        entityType: 'project_expense', entityId: id, amount: Number(expense.total_amount) || 0,
      })
      // Gagal baca konfigurasi TIDAK boleh menyamar jadi "tidak berhak" (Phase 1 §4E).
      if (expenseDecision.configError) {
        app.log.error({ configError: expenseDecision.configError, id }, 'evaluasi rantai approval gagal')
        return reply.status(500).send({ error: 'Gagal memeriksa konfigurasi approval' })
      }
      if (!expenseDecision.allowed) {
        if (expenseDecision.reason === 'already_approved') {
          return reply.status(409).send({ error: 'Pengeluaran sudah disetujui penuh' })
        }
        return reply.status(403).send({ error: 'Akses ditolak' })
      }
    } else {
      // Ditolak → jejak dibersihkan supaya rantai mulai dari level 1 bila diajukan ulang.
      await clearApprovalProgress('project_expense', id, request.companyId!)
    }

    // Cek saldo kalau approve dari petty_cash
    if (status === 'approved' && expense.expense_source === 'petty_cash' && expense.petty_cash_id) {
      const { data: acc } = await request.db!
        .from('cash_accounts')
        .select('balance, name')
        .eq('id', expense.petty_cash_id)
        .single()

      if (!acc) {
        return reply.status(404).send({ error: 'Akun kas sumber pengeluaran tidak ditemukan' })
      }
      if (Number(acc.balance) < Number(expense.total_amount)) {
        return reply.status(400).send({
          error: `Saldo kas kecil tidak mencukupi untuk approve pengeluaran ini`
        })
      }
    }

    // Cek saldo kalau approve dari main_cash
    if (status === 'approved' && expense.expense_source === 'main_cash' && expense.main_cash_id) {
      const { data: acc } = await request.db!
        .from('cash_accounts')
        .select('balance, name')
        .eq('id', expense.main_cash_id)
        .single()

      if (!acc) {
        return reply.status(404).send({ error: 'Akun kas sumber pengeluaran tidak ditemukan' })
      }
      if (Number(acc.balance) < Number(expense.total_amount)) {
        return reply.status(400).send({
          error: `Saldo kas utama (${acc.name}) tidak mencukupi untuk approve pengeluaran ini`
        })
      }
    }

    // Catat persetujuan SETELAH semua validasi (termasuk cek saldo) supaya
    // permintaan yang gagal tidak meninggalkan jejak level yang tak pernah terjadi.
    if (expenseDecision?.step) {
      const rec = await recordApproval({
        entityType: 'project_expense', entityId: id,
        level: expenseDecision.step.level, approvedBy: (request as any).currentUser!.id, companyId: request.companyId!,
      })
      if (!rec.ok) return reply.status(500).send({ error: 'Gagal mencatat persetujuan: ' + rec.error })

      // Bukan langkah terakhir → status TETAP, kas belum berkurang.
      if (!expenseDecision.isFinalStep) {
        const step = expenseDecision.step
        const next = expenseDecision.applicable.find(s => s.level > step.level)
        void logAuditEvent(request, {
          tableName: 'project_expenses', recordId: id, action: 'project_expense.approval.level',
        // `workflowId` mengikat SELURUH langkah alur ini, lintas request.
        // `correlation_id` hanya mengikat dalam satu request; persetujuan
        // berjenjang terjadi di request berbeda, oleh orang berbeda, di hari
        // berbeda. Lihat `idAlurPersetujuan` di utils/approval.ts.
        workflowId: idAlurPersetujuan(id),
          actorId: (request as any).currentUser!.id,
          newValues: { level: step.level, of: expenseDecision.applicable.length },
          severity: 'critical',
        })
        return reply.send({
          expense: null,
          pending_next_level: true,
          message: `Persetujuan level ${step.level} tercatat. Menunggu persetujuan level ${next?.level ?? '-'}.`,
        })
      }
    }

    const { data, error } = await request.db!
      .viaProject('project_expenses', expense.project_id)
      .update({
        status,
        notes: notes ?? undefined,
        reviewed_by: (request as any).currentUser!.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status, reviewed_at')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ expense: data })
  })

  // DELETE /api/v1/cash/expenses/:id — hapus (hanya draft/submitted, hanya admin)
  app.delete<{ Params: { id: string } }>('/api/v1/cash/expenses/:id', {
    preHandler: [authenticate, requirePermission('cash:expense:approve')]
  }, async (request, reply) => {
    const { id } = request.params

    const { data: expense } = await supabase
      .from('project_expenses')
      .select('id, status, project_id')
      .eq('id', id)
      .maybeSingle()

    if (!expense) return reply.status(404).send({ error: 'Pengeluaran tidak ditemukan' })
    // T4g: pengeluaran kategori C — verifikasi proyeknya milik tenant ini.
    if (!(await proyekMilikTenant(request, expense.project_id))) {
      return reply.status(404).send({ error: 'Pengeluaran tidak ditemukan' })
    }
    if (expense.status === 'approved') {
      return reply.status(400).send({ error: 'Tidak bisa hapus pengeluaran yang sudah disetujui' })
    }

    const { error } = await request.db!.viaProject('project_expenses', expense.project_id).delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ success: true })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY — ringkasan kas untuk header page
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/cash/summary
  app.get('/api/v1/cash/summary', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    // T4c: project_expenses kategori C — disaring lewat daftar project tenant.
    const idProyek = await request.db!.projectIds()
    const [accountsRes, pendingTransfersRes, pendingExpensesRes, expensesThisMonthRes] = await Promise.all([
      request.db!
        .from('cash_accounts')
        .select('id, type, balance')
        .eq('is_active', true),

      request.db!
        .from('cash_transfers')
        .select('id, amount')
        .eq('status', 'pending'),

      supabase
        .from('project_expenses')
        .select('id, total_amount')
        .in('project_id', idProyek)
        .eq('status', 'submitted'),

      supabase
        .from('project_expenses')
        .select('total_amount')
        .in('project_id', idProyek)
        .eq('status', 'approved')
        .gte('expense_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
    ])

    const accounts = accountsRes.data ?? []
    const mainBalance = accounts.filter(a => a.type === 'main').reduce((s, a) => s + Number(a.balance), 0)
    const collectorBalance = accounts.filter(a => a.type === 'collector').reduce((s, a) => s + Number(a.balance), 0)
    const pettyBalance = accounts.filter(a => a.type === 'petty_cash').reduce((s, a) => s + Number(a.balance), 0)
    const totalBalance = mainBalance + collectorBalance + pettyBalance

    const pendingTransfers = pendingTransfersRes.data ?? []
    const pendingExpenses = pendingExpensesRes.data ?? []

    return reply.send({
      totalBalance,
      mainBalance,
      collectorBalance,
      pettyBalance,
      pendingTransferCount: pendingTransfers.length,
      pendingTransferAmount: pendingTransfers.reduce((s, t) => s + Number(t.amount), 0),
      pendingExpenseCount: pendingExpenses.length,
      pendingExpenseAmount: pendingExpenses.reduce((s, e) => s + Number(e.total_amount), 0),
      expensesThisMonth: (expensesThisMonthRes.data ?? []).reduce((s, e) => s + Number(e.total_amount), 0),
    })
  })

  // GET /api/v1/cash/categories?project_id= — daftar kategori + sub-kategori untuk dropdown
  // Jika project_id ada: pakai project_expense_categories, fallback ke template global jika kosong
  // Selalu return struktur flat dengan parent_id agar frontend bisa grouping sendiri
  app.get('/api/v1/cash/categories', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id } = request.query as Record<string, string>
    // T4j: project_id dipakai membaca (dan pada /categories juga MENYISIPKAN
    // template kategori ke) proyek mana pun tanpa cek kepemilikan.
    if (project_id && !(await proyekMilikTenant(request, project_id))) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    if (project_id) {
      const { data: projCats, error } = await request.db!
        .viaProject('project_expense_categories', project_id)
        .select('id, name, type, parent_id, sort_order')
        .eq('project_id', project_id)
        .eq('is_active', true)
        .order('sort_order')
      if (error) return reply.status(500).send({ error: error.message })

      // Jika sudah ada project categories, pakai langsung
      if (projCats && projCats.length > 0) {
        return reply.send({ categories: projCats, source: 'project' })
      }

      // Belum ada — clone dari template global ke project_expense_categories
      const { data: templates } = await request.db!
        .from('expense_category_templates')
        .select('id, name, type, parent_id, sort_order')
        .eq('is_active', true)
        .order('sort_order')

      if (templates && templates.length > 0) {
        // Clone parent dulu (yang tidak punya parent_id)
        const parents = templates.filter(t => !t.parent_id)
        const children = templates.filter(t => t.parent_id)

        const { data: clonedParents } = await request.db!
          .viaProject('project_expense_categories', project_id)
          .insert(parents.map(p => ({
            project_id,
            name: p.name,
            type: p.type,
            parent_id: null,
            sort_order: p.sort_order,
            template_id: p.id,
          })))
          .select('id, name, type, parent_id, sort_order, template_id')

        // Map template parent id → cloned parent id
        const parentIdMap: Record<string, string> = {}
        for (const cp of clonedParents ?? []) {
          const tpl = cp as any
          if (tpl.template_id) parentIdMap[tpl.template_id] = tpl.id
        }

        // Clone children dengan parent_id yang sudah dimapping
        const childRows = children
          .filter(c => c.parent_id && parentIdMap[c.parent_id])
          .map(c => ({
            project_id,
            name: c.name,
            type: c.type,
            parent_id: parentIdMap[c.parent_id!],
            sort_order: c.sort_order,
            template_id: c.id,
          }))

        if (childRows.length > 0) {
          await request.db!.viaProject('project_expense_categories', project_id).insert(childRows)
        }

        // Fetch ulang yang sudah di-clone
        const { data: freshCats } = await request.db!
          .viaProject('project_expense_categories', project_id)
          .select('id, name, type, parent_id, sort_order')
          .eq('project_id', project_id)
          .eq('is_active', true)
          .order('sort_order')

        return reply.send({ categories: freshCats ?? [], source: 'project' })
      }
    }

    // Tidak ada project_id — return template global (untuk dropdown tanpa project)
    const { data, error } = await request.db!
      .from('expense_category_templates')
      .select('id, name, type, parent_id, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send({ categories: data ?? [], source: 'template' })
  })

  // GET /api/v1/cash/expenses/summary-by-category?project_id= — agregat per kategori
  app.get('/api/v1/cash/expenses/summary-by-category', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { project_id, date_from, date_to } = request.query as Record<string, string>

    // ⚠️ Gerbang tenant WAJIB di sini, dan justru kasus TANPA `project_id`
    // yang paling berbahaya: tanpa saringan, endpoint ini menjumlahkan
    // seluruh pengeluaran approved SEMUA perusahaan jadi satu angka.
    // Bukan sekadar bocor per-baris — ia menyajikan total keuangan tenant lain.
    const idProyek = await request.db!.projectIds()
    if (project_id && !idProyek.includes(project_id)) {
      return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
    }

    let q = supabase
      .from('project_expenses')
      .select('total_amount, category_id, category:project_expense_categories(id, name, type, parent_id)')
      .eq('status', 'approved')
      .in('project_id', idProyek)

    if (project_id) q = q.eq('project_id', project_id)
    if (date_from) q = q.gte('expense_date', date_from)
    if (date_to) q = q.lte('expense_date', date_to)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    // Group by category
    const byCategory: Record<string, { name: string; type: string; total: number; count: number }> = {}
    for (const e of data ?? []) {
      const cat = e.category as unknown as { id: string; name: string; type: string } | null
      if (!cat) continue
      if (!byCategory[cat.id]) byCategory[cat.id] = { name: cat.name, type: cat.type, total: 0, count: 0 }
      byCategory[cat.id].total += Number(e.total_amount)
      byCategory[cat.id].count += 1
    }

    return reply.send({
      summary: Object.entries(byCategory)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.total - a.total)
    })
  })
}
