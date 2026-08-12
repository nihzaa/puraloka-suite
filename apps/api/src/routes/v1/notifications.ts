import type { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission, hasPermission } from '../../plugins/auth.js'

export default async function notificationRoutes(app: FastifyInstance) {

  // ── GET /api/v1/notifications ─────────────────────────────────────────────
  // List notifikasi untuk user yang login
  // Query: ?is_read=true|false  &limit=20  &offset=0  &priority=urgent|high
  app.get('/api/v1/notifications', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { is_read, limit = '30', offset = '0', priority } = request.query as Record<string, string>

    const lim = Math.min(Math.max(1, Number(limit) || 30), 100)
    const off = Math.max(0, Number(offset) || 0)

    let q = request.db!
      .from('notifications')
      .select(`
        id, user_id, project_id, title, message, channel,
        is_read, read_at, action_url, sent_at, created_at,
        type, action_type, action_data, is_actioned, actioned_at, priority
      `)
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .range(off, off + lim - 1)

    if (is_read === 'true')  q = q.eq('is_read', true)
    if (is_read === 'false') q = q.eq('is_read', false)
    if (priority)            q = q.eq('priority', priority)

    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ notifications: data ?? [] })
  })

  // ── GET /api/v1/notifications/count ──────────────────────────────────────
  // Jumlah notifikasi belum dibaca (untuk badge di topbar)
  app.get('/api/v1/notifications/count', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!

    const { count, error } = await request.db!
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ count: count ?? 0 })
  })

  // ── PATCH /api/v1/notifications/:id/read ─────────────────────────────────
  // Tandai satu notifikasi sebagai sudah dibaca
  app.patch('/api/v1/notifications/:id/read', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { id } = request.params as { id: string }

    const { data, error } = await request.db!
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)   // pastikan hanya bisa update milik sendiri
      .select('id, is_read, read_at')
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Notifikasi tidak ditemukan' })

    return reply.send({ notification: data })
  })

  // ── PATCH /api/v1/notifications/read-all ─────────────────────────────────
  // Tandai semua notifikasi user sebagai sudah dibaca
  app.patch('/api/v1/notifications/read-all', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!

    const { error } = await request.db!
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ success: true })
  })

  // ── DELETE /api/v1/notifications/:id ─────────────────────────────────────
  app.delete('/api/v1/notifications/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { id } = request.params as { id: string }

    const { error } = await request.db!
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ success: true })
  })

  // ── POST /api/v1/notifications/:id/action ────────────────────────────────
  // Eksekusi action dari notifikasi interaktif
  // Body: { action: 'approve' | 'reject', data?: { reason?: string, cash_account_id?: string } }
  app.post('/api/v1/notifications/:id/action', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const { id } = request.params as { id: string }
    const body = request.body as {
      action: 'approve' | 'reject'
      data?: {
        reason?: string
        cash_account_id?: string
      }
    }

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return reply.status(400).send({ error: 'action harus approve atau reject' })
    }

    // Ambil notifikasi
    const { data: notif, error: nErr } = await request.db!
      .from('notifications')
      .select('id, user_id, action_type, action_data, is_actioned')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (nErr || !notif) return reply.status(404).send({ error: 'Notifikasi tidak ditemukan' })
    if (notif.is_actioned) return reply.status(409).send({ error: 'Notifikasi ini sudah pernah di-action' })

    const actionType = notif.action_type as string | null
    const actionData = notif.action_data as Record<string, unknown> | null

    let resultMessage = ''

    // ── approve_kasbon / reject_kasbon ──────────────────────────────────────
    //
    // ⚠️ UTANG TERDAFTAR: INI PINTU KEDUA KE KASBON (TJS-A3a)
    //
    // `kasbons.ts:263-352` menyetujui kasbon lewat mesin approval BERJENJANG
    // (`utils/approval.ts`) — permission per level, jejak di `approval_progress`,
    // syarat nominal dari `approval_steps.min_amount`.
    //
    // Endpoint ini TIDAK. Ia memeriksa satu permission lalu langsung menulis
    // status. Konsekuensinya nyata: kasbon yang seharusnya butuh persetujuan
    // dua level bisa lolos dengan satu ketukan dari kartu notifikasi.
    //
    // Ini kelas cacat yang sama yang didokumentasikan pada TJS (spec lapisan
    // AI §5.1 C-2/C-3): *gerbang yang benar di satu jalur, bolong di jalur
    // lain*. Puraloka punya bentuknya sendiri, dan sudah ada sejak sebelum AI.
    //
    // Balapan status sudah ditutup di bawah (TJS-A0). Yang BELUM: menyatukan
    // jalurnya ke mesin approval. Itu TJS-A3a, dan sengaja tidak dikerjakan di
    // sini supaya perubahan perilaku approval tidak menyelinap masuk lewat
    // commit yang judulnya soal balapan.
    if (actionType === 'approve_kasbon' || actionType === 'reject_kasbon') {
      if (!(await hasPermission(request, 'mandor:kasbon:approve'))) {
        return reply.status(403).send({ error: 'Akses ditolak. Butuh permission: mandor:kasbon:approve' })
      }

      const kasbonId = actionData?.kasbon_id as string | undefined
      if (!kasbonId) return reply.status(400).send({ error: 'action_data.kasbon_id tidak ada' })

      // Cek kasbon masih pending
      const { data: kasbon } = await request.db!
        .from('kasbons')
        .select('id, status, amount')
        .eq('id', kasbonId)
        .single()

      if (!kasbon) return reply.status(404).send({ error: 'Kasbon tidak ditemukan' })
      if (kasbon.status !== 'pending') {
        return reply.status(409).send({ error: `Kasbon sudah berstatus ${kasbon.status}` })
      }

      // ── UTANG DIBAYAR: satu pintu, bukan dua (TJS-A3a, 2026-08-09)
      //
      // Dulu blok ini menulis `status` + `approved_by` langsung — pintu KEDUA
      // ke kasbon, memotong mesin approval berjenjang yang dipakai
      // `kasbons.ts`. Kasbon yang menurut konfigurasi butuh dua level bisa
      // lolos dengan satu ketukan dari kartu notifikasi.
      //
      // Sekarang ia MENERUSKAN ke rute kanonik. Bukan menyalin logikanya:
      // salinan cepat atau lambat berbeda dari aslinya, dan yang berbeda
      // diam-diam selalu salinannya — karena tak ada yang mengujinya.
      //
      // Yang ikut didapat gratis: evaluasi jenjang, syarat nominal
      // `min_amount`, isolasi proyek untuk PM, jejak `approval_progress`,
      // `workflow_id` lintas request, dan klaim status atomik.
      const teruskan = await app.inject({
        method: 'PATCH',
        url: `/api/v1/kasbons/${kasbonId}/status`,
        headers: {
          authorization: request.headers.authorization ?? '',
          cookie: request.headers.cookie ?? '',
          'x-company-id': request.companyId ?? '',
        },
        payload: {
          status: body.action === 'approve' ? 'approved' : 'rejected',
          ...(body.data?.cash_account_id ? { cash_account_id: body.data.cash_account_id } : {}),
        },
      })

      if (teruskan.statusCode >= 400) {
        // Diteruskan APA ADANYA — termasuk 403 karena level approval belum
        // cukup. Menerjemahkannya jadi pesan sendiri akan menyembunyikan
        // sebab yang justru perlu dibaca pengguna.
        let pesan = 'Gagal memproses kasbon'
        try {
          pesan = (JSON.parse(teruskan.body) as { error?: string }).error ?? pesan
        } catch (errParse) {
          // Badan bukan JSON — pesan bawaan dipakai, TAPI kejadiannya dicatat.
          // Rute kanonik selalu membalas JSON; kalau tidak, ada yang berubah di
          // sana dan itu perlu terlihat. `catch {}` kosong di sini akan
          // menyembunyikan perubahan kontrak antar-rute.
          request.log.warn(
            { err: errParse, kode: teruskan.statusCode, cuplikan: teruskan.body.slice(0, 120) },
            'balasan rute kasbon bukan JSON — kontraknya mungkin berubah',
          )
        }
        request.log.warn(
          { kasbonId, kode: teruskan.statusCode },
          'keputusan kasbon lewat notifikasi ditolak rute kanonik',
        )
        return reply.status(teruskan.statusCode).send({ error: pesan })
      }

      resultMessage = body.action === 'approve' ? 'Kasbon disetujui' : 'Kasbon ditolak'

      // Kirim notifikasi balik ke mandor yang mengajukan
      const { data: kasbonFull } = await request.db!
        .from('kasbons')
        .select(`
          amount, requested_by,
          work_scopes(scope_name, mandor_assignments(projects(name)))
        `)
        .eq('id', kasbonId)
        .single()

      if (kasbonFull?.requested_by) {
        const projectName = (kasbonFull.work_scopes as any)?.mandor_assignments?.projects?.name ?? ''
        const scopeName   = (kasbonFull.work_scopes as any)?.scope_name ?? ''
        const amtFormatted = Number(kasbonFull.amount).toLocaleString('id-ID')

        const { createNotification } = await import('../../utils/notifications.js')
        createNotification({
          company_id: request.companyId!,
          user_id:    kasbonFull.requested_by,
          title:      body.action === 'approve' ? 'Kasbon Disetujui' : 'Kasbon Ditolak',
          message:    body.action === 'approve'
            ? `Kasbon Rp ${amtFormatted} untuk ${scopeName} - ${projectName} telah disetujui`
            : `Kasbon Rp ${amtFormatted} untuk ${scopeName} - ${projectName} ditolak${body.data?.reason ? `: ${body.data.reason}` : ''}`,
          type:        body.action === 'approve' ? 'kasbon_approved' : 'kasbon_rejected',
          priority:   'normal',
          action_url:  '/mandor?tab=kasbon',
          action_type: 'view_kasbon',
          action_data: { kasbon_id: kasbonId },
        })
      }
    }

    // ── approve_wage_report / reject_wage_report ────────────────────────────
    else if (actionType === 'approve_wage_report' || actionType === 'reject_wage_report') {
      if (!(await hasPermission(request, 'mandor:wage:approve'))) {
        return reply.status(403).send({ error: 'Akses ditolak. Butuh permission: mandor:wage:approve' })
      }

      const reportId = actionData?.report_id as string | undefined
      if (!reportId) return reply.status(400).send({ error: 'action_data.report_id tidak ada' })

      // T4i: weekly_wage_reports kategori C via assignment_id. Cabang
      // approve_kasbon persis di atas SUDAH pakai request.db!; cabang ini
      // terlewat — inkonsistensi dalam satu fungsi yang sama.
      const idAsgNotif = await request.db!.assignmentIds()
      const { data: report } = await supabase
        .from('weekly_wage_reports')
        .select('id, status')
        .eq('id', reportId)
        .in('assignment_id', idAsgNotif)
        .maybeSingle()

      if (!report) return reply.status(404).send({ error: 'Laporan upah tidak ditemukan' })
      if (!['submitted', 'draft'].includes(report.status)) {
        return reply.status(409).send({ error: `Laporan sudah berstatus ${report.status}` })
      }

      const newStatus = body.action === 'approve' ? 'approved' : 'rejected'
      const update: Record<string, unknown> = {
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (body.data?.reason) update.review_notes = body.data.reason

      const { error: rErr } = await supabase
        .from('weekly_wage_reports')
        .update(update)
        .eq('id', reportId)
        .in('assignment_id', idAsgNotif)

      if (rErr) return reply.status(500).send({ error: rErr.message })

      resultMessage = body.action === 'approve' ? 'Laporan upah disetujui' : 'Laporan upah ditolak'
    }

    else {
      return reply.status(400).send({ error: `action_type '${actionType}' tidak dikenali` })
    }

    // ── Mark notification as actioned ───────────────────────────────────────
    // Hasil diperiksa: tindakannya (approve/reject kasbon atau laporan upah)
    // SUDAH dijalankan di atas. Kalau penandaan ini gagal diam-diam, tombolnya
    // tetap aktif dan bisa ditekan lagi — approve kedua kalinya pada data yang
    // sudah berubah. Dilaporkan, tapi TIDAK 500: tindakannya sendiri berhasil,
    // dan membalas gagal akan membuat orang mengulanginya — persis akibat yang
    // sedang dihindari.
    const { error: errTandai } = await request.db!
      .from('notifications')
      .update({
        is_actioned: true,
        actioned_at: new Date().toISOString(),
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (errTandai) {
      request.log.error(
        { err: errTandai, notifId: id },
        'tindakan dijalankan tapi notifikasi gagal ditandai — tombolnya masih bisa ditekan lagi',
      )
    }

    return reply.send({ success: true, message: resultMessage })
  })

  // ── GET /api/v1/notifications/check-milestones ───────────────────────────
  // Polling endpoint: cek milestone yang approaching (3 hari) atau overdue.
  // Dipanggil manual / dari cron external. Idempotent — tidak insert duplikat
  // jika notif sudah ada dalam 24 jam terakhir untuk kombinasi (type, project, milestone).
  app.get('/api/v1/notifications/check-milestones', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')]
  }, async (request, reply) => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const in3Days = new Date(today.getTime() + 3 * 86_400_000).toISOString().split('T')[0]

    // Milestone approaching: target_date dalam 3 hari ke depan, belum completed/cancelled
    const [approachingRes, overdueRes] = await Promise.all([
      supabase
        .from('milestones')
        .select('id, title, target_date, project_id, projects(name, pm_id)')
        .gte('target_date', todayStr)
        .lte('target_date', in3Days)
        .not('status', 'in', '("completed","cancelled")'),

      supabase
        .from('milestones')
        .select('id, title, target_date, project_id, projects(name, pm_id)')
        .lt('target_date', todayStr)
        .not('status', 'in', '("completed","cancelled")'),
    ])

    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')

    let created = 0

    // Approaching milestones
    for (const ms of approachingRes.data ?? []) {
      const proj = ms.projects as any
      const recipients = await resolveRecipients('milestone_approaching', { projectId: ms.project_id, companyId: request.companyId! })

      // Cek apakah sudah ada notif approaching untuk milestone ini hari ini
      const { count } = await request.db!
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'milestone_approaching')
        .contains('action_data', { milestone_id: ms.id })
        .gte('sent_at', todayStr + 'T00:00:00')

      if ((count ?? 0) > 0) continue

      const daysLeft = Math.ceil((new Date(ms.target_date).getTime() - today.getTime()) / 86_400_000)

      for (const uid of recipients) {
        createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Milestone Mendekati Jatuh Tempo',
          message:    `Milestone "${ms.title}" di proyek ${proj?.name ?? ''} jatuh tempo dalam ${daysLeft} hari`,
          type:       'milestone_approaching',
          priority:   'high',
          project_id: ms.project_id,
          action_url: `/proyek/${ms.project_id}`,
          action_type: 'view_milestone',
          action_data: { milestone_id: ms.id },
        })
        created++
      }
    }

    // Overdue milestones
    for (const ms of overdueRes.data ?? []) {
      const proj = ms.projects as any
      const recipients = await resolveRecipients('milestone_overdue', { projectId: ms.project_id, companyId: request.companyId! })

      // Maksimal sekali per hari per milestone
      const { count } = await request.db!
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'milestone_overdue')
        .contains('action_data', { milestone_id: ms.id })
        .gte('sent_at', todayStr + 'T00:00:00')

      if ((count ?? 0) > 0) continue

      for (const uid of recipients) {
        createNotification({
          company_id: request.companyId!,
          user_id:    uid,
          title:      'Milestone Terlambat',
          message:    `Milestone "${ms.title}" di proyek ${proj?.name ?? ''} telah melewati tanggal target`,
          type:       'milestone_overdue',
          priority:   'urgent',
          project_id: ms.project_id,
          action_url: `/proyek/${ms.project_id}`,
          action_type: 'view_milestone',
          action_data: { milestone_id: ms.id },
        })
        created++
      }
    }

    return reply.send({
      success: true,
      approaching: approachingRes.data?.length ?? 0,
      overdue: overdueRes.data?.length ?? 0,
      notifications_created: created,
    })
  })

  // ── GET /api/v1/notifications/check-deadlines ───────────────────────────
  // Idempotent reminder checker: termin overdue, project end approaching, kasbon pending lama.
  // Dipanggil dari scheduler eksternal atau tombol manual di UI (admin only).
  // Dedup: max 1 notif per (type, record_id, hari).
  app.get('/api/v1/notifications/check-deadlines', {
    preHandler: [authenticate, requirePermission('notifications:milestone:check')]
  }, async (request, reply) => {
    const { createNotification } = await import('../../utils/notifications.js')
    const { resolveRecipients } = await import('../../utils/notification-routing.js')
    const {
      sendMilestoneReminderEmail,
      sendTerminReminderEmail,
      sendInvoiceOverdueEmail,
      sendKasbonPendingEmail,
      sendProjectEndingEmail,
    } = await import('../../utils/email.js')

    const now   = new Date()
    const today = now.toISOString().split('T')[0]
    const in7   = new Date(now.getTime() + 7  * 86_400_000).toISOString().split('T')[0]
    const ago7  = new Date(now.getTime() - 7  * 86_400_000).toISOString().split('T')[0]

    // Lookup email per user_id (batch, cached dalam satu request)
    const emailCache: Record<string, string | null> = {}
    async function getUserEmail(userId: string): Promise<string | null> {
      if (emailCache[userId] !== undefined) return emailCache[userId]
      const { data } = await supabase.from('users').select('email').eq('id', userId).single()
      emailCache[userId] = data?.email ?? null
      return emailCache[userId]
    }

    let created = 0

    // Helper: cek apakah notif dengan type+action_data sudah dikirim hari ini
    async function alreadySent(type: string, recordId: string): Promise<boolean> {
      const { count } = await request.db!
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', type)
        .contains('action_data', { record_id: recordId })
        .gte('sent_at', today + 'T00:00:00')
      return (count ?? 0) > 0
    }

    // ── 1. Termin yang sudah bisa ditagih tapi masih pending ─────────────────
    // Termin on_progress: project.progress_pct >= trigger_pct
    // Termin on_sign: langsung bisa ditagih
    // T4i: sama seperti invoice di bawah — data yang jadi ISI notifikasi wajib
    // di-scope, bukan cuma penerimanya.
    const idProyekTermin = await request.db!.projectIds()
    const { data: termins } = await supabase
      .from('termin_schedules')
      .select(`
        id, termin_number, amount, trigger_type, trigger_pct, due_date,
        project:projects!termin_schedules_project_id_fkey(id, name, progress_pct, pm_id, status)
      `)
      .in('project_id', idProyekTermin)
      .eq('status', 'pending')
      .not('projects.status', 'in', '("cancelled","completed")')

    for (const t of termins ?? []) {
      const proj = t.project as any
      if (!proj || proj.status === 'cancelled') continue

      const isTriggered =
        t.trigger_type === 'on_sign' ||
        (t.trigger_type === 'on_progress' && t.trigger_pct !== null && Number(proj.progress_pct) >= Number(t.trigger_pct))

      if (!isTriggered) continue
      if (await alreadySent('invoice_due', t.id)) continue

      // Berapa lama sudah triggered? Cek due_date jika ada
      let isUrgent = false
      if (t.due_date) {
        const daysLeft = Math.round((new Date(t.due_date).getTime() - now.getTime()) / 86_400_000)
        // Hanya kirim pada H-7, H-3, H-1 dari due_date jika ada
        if (![7, 3, 1, 0].includes(daysLeft) && daysLeft > 0) continue
        isUrgent = daysLeft <= 1
      }

      const recipients = await resolveRecipients('invoice_due', { projectId: proj.id, companyId: request.companyId! })
      const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

      for (const uid of recipients) {
        await createNotification({
          company_id: request.companyId!,
          user_id:     uid,
          title:       'Termin Siap Ditagih',
          message:     `Termin ${t.termin_number} (${fmt(Number(t.amount))}) di proyek "${proj.name}" sudah memenuhi syarat tagih${t.due_date ? ` — jatuh tempo ${t.due_date}` : ''}`,
          type:        'invoice_due',
          priority:    isUrgent ? 'urgent' : 'high',
          project_id:  proj.id,
          action_url:  `/proyek/${proj.id}#sec-termin`,
          action_data: { record_id: t.id, termin_number: t.termin_number },
        })
        const email = await getUserEmail(uid)
        if (email) sendTerminReminderEmail({ to: email, terminNumber: t.termin_number, amount: Number(t.amount), projectName: proj.name, projectId: proj.id, dueDate: t.due_date ?? undefined })
        created++
      }
    }

    // ── 2. Proyek mendekati/melewati tanggal selesai ─────────────────────────
    //
    // ⚠ DIPERBAIKI 2026-08-12 — pemeriksaan ini TIDAK PERNAH BERJALAN.
    //
    // Saringannya berbunyi `.in('status', ['active', 'in_progress'])`, padahal
    // enum `project_status` hanya punya: draft | active | on_hold | completed |
    // cancelled. Nilai 'in_progress' TIDAK PERNAH ADA — Postgres menolak
    // SELURUH query dengan 22P02 ("invalid input value for enum").
    //
    // Dan galatnya dibuang: hanya `{ data }` yang diambil, `error` tidak.
    // Jadi `endingProjects` selalu `undefined`, putarannya nol iterasi, dan
    // endpoint tetap membalas 200 dengan `ending_projects: 0` — terbaca
    // sebagai "tak ada proyek yang mendekati tenggat", bukan sebagai rusak.
    //
    // Ketahuan karena saya menyalin baris ini ke automation baru, dan di sana
    // galatnya TIDAK dibuang sehingga muncul sebagai 500 di test.
    const { data: endingProjects, error: eEnding } = await request.db!
      .from('projects')
      .select('id, name, end_date, pm_id, progress_pct')
      .eq('status', 'active')
      .eq('is_deleted', false)
      .lte('end_date', in7)   // selesai dalam 7 hari atau sudah lewat

    if (eEnding) {
      request.log.error({ err: eEnding }, 'gagal membaca proyek mendekati tenggat')
      return reply.status(500).send({ error: eEnding.message })
    }

    for (const p of endingProjects ?? []) {
      const daysLeft = Math.round((new Date(p.end_date).getTime() - now.getTime()) / 86_400_000)
      const isOverdue = daysLeft < 0
      const type = isOverdue ? 'milestone_overdue' : 'milestone_approaching'

      // Hanya kirim pada H-7, H-3, H-1 dan setiap hari saat overdue
      if (!isOverdue && ![7, 3, 1].includes(daysLeft)) continue
      if (await alreadySent(type, `project_end_${p.id}`)) continue

      const recipients = await resolveRecipients('project_deadline', { projectId: p.id, companyId: request.companyId! })
      for (const uid of recipients) {
        await createNotification({
          company_id: request.companyId!,
          user_id:     uid,
          title:       isOverdue ? 'Proyek Melewati Deadline' : `Proyek Selesai dalam ${daysLeft} Hari`,
          message:     isOverdue
            ? `Proyek "${p.name}" melewati deadline ${Math.abs(daysLeft)} hari yang lalu (progress: ${Number(p.progress_pct).toFixed(0)}%)`
            : `Proyek "${p.name}" akan selesai dalam ${daysLeft} hari (progress: ${Number(p.progress_pct).toFixed(0)}%)`,
          type,
          priority:    isOverdue ? 'urgent' : daysLeft <= 1 ? 'urgent' : 'high',
          project_id:  p.id,
          action_url:  `/proyek/${p.id}`,
          action_data: { record_id: `project_end_${p.id}`, days_left: daysLeft },
        })
        const email = await getUserEmail(uid)
        if (email) sendProjectEndingEmail({ to: email, projectName: p.name, projectId: p.id, endDate: p.end_date, daysLeft, progressPct: Number(p.progress_pct) })
        created++
      }
    }

    // ── 3. Kasbon pending > 3 hari tanpa tindakan ────────────────────────────
    const { data: stalKasbons } = await request.db!
      .from('kasbons')
      .select(`
        id, amount, purpose, kasbon_date,
        project:projects!kasbons_project_id_fkey(id, name, pm_id),
        mandor:users!kasbons_requested_by_fkey(id, name)
      `)
      .eq('status', 'pending')
      .lte('kasbon_date', ago7)   // pending lebih dari 7 hari

    for (const k of stalKasbons ?? []) {
      const proj = k.project as any
      if (!proj) continue
      if (await alreadySent('kasbon_pending', k.id)) continue

      const daysWaiting = Math.round((now.getTime() - new Date(k.kasbon_date).getTime()) / 86_400_000)
      const recipients = await resolveRecipients('kasbon_pending', { projectId: proj.id, companyId: request.companyId! })
      const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
      const mandorName = (k.mandor as any)?.name ?? 'Mandor'

      for (const uid of recipients) {
        await createNotification({
          company_id: request.companyId!,
          user_id:     uid,
          title:       'Kasbon Menunggu Persetujuan',
          message:     `Kasbon ${fmt(Number(k.amount))} dari ${mandorName} di proyek "${proj.name}" sudah menunggu ${daysWaiting} hari`,
          type:        'kasbon_pending',
          priority:    daysWaiting >= 14 ? 'urgent' : 'high',
          project_id:  proj.id,
          action_url:  `/mandor`,
          action_data: { record_id: k.id, days_waiting: daysWaiting },
        })
        const email = await getUserEmail(uid)
        if (email) sendKasbonPendingEmail({ to: email, mandorName, amount: Number(k.amount), projectName: proj.name, daysWaiting })
        created++
      }
    }

    // ── 4. Invoice overdue (due_date sudah lewat, belum paid) ────────────────
    // T4i: check-deadlines membaca invoice/termin lalu MENGIRIM notifikasi &
    // email berdasarkan isinya. Penerimanya sudah di-scope (resolveRecipients),
    // tapi DATANYA belum — jadi isi pesannya bisa memuat nomor invoice & nominal
    // tenant lain. Disaring di sumbernya.
    const idProyekDl = await request.db!.projectIds()
    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, total_amount, amount_due, due_date,
        project:projects!invoices_project_id_fkey(id, name, pm_id)
      `)
      .in('project_id', idProyekDl)
      .in('status', ['sent', 'partial'])
      .lt('due_date', today)

    for (const inv of overdueInvoices ?? []) {
      const proj = inv.project as any
      if (!proj) continue
      if (await alreadySent('invoice_overdue', inv.id)) continue

      const daysLate = Math.round((now.getTime() - new Date(inv.due_date).getTime()) / 86_400_000)
      const recipients = await resolveRecipients('invoice_overdue', { projectId: proj.id, companyId: request.companyId! })
      const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

      for (const uid of recipients) {
        await createNotification({
          company_id: request.companyId!,
          user_id:     uid,
          title:       'Invoice Jatuh Tempo Terlewat',
          message:     `Invoice ${inv.invoice_number} (${fmt(Number(inv.amount_due))}) di proyek "${proj.name}" sudah ${daysLate} hari melewati jatuh tempo`,
          type:        'invoice_overdue',
          priority:    daysLate >= 14 ? 'urgent' : 'high',
          project_id:  proj.id,
          action_url:  `/keuangan`,
          action_data: { record_id: inv.id, days_late: daysLate },
        })
        const email = await getUserEmail(uid)
        if (email) sendInvoiceOverdueEmail({ to: email, invoiceNumber: inv.invoice_number, amountDue: Number(inv.amount_due), projectName: proj.name, daysLate, dueDate: inv.due_date })
        created++
      }
    }

    return reply.send({
      success: true,
      notifications_created: created,
      checked: {
        termins:          (termins ?? []).length,
        ending_projects:  (endingProjects ?? []).length,
        stale_kasbons:    (stalKasbons ?? []).length,
        overdue_invoices: (overdueInvoices ?? []).length,
      },
    })
  })

  // ── POST /api/v1/notifications/subscribe ─────────────────────────────────
  // Simpan Web Push subscription dari browser
  app.post('/api/v1/notifications/subscribe', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!
    const subscription = request.body as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return reply.status(400).send({ error: 'Subscription tidak valid (butuh endpoint + keys.p256dh + keys.auth)' })
    }

    const { error } = await supabase
      .from('users')
      .update({ push_subscription: subscription })
      .eq('id', user.id)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ success: true })
  })

  // ── DELETE /api/v1/notifications/subscribe ────────────────────────────────
  // Hapus Web Push subscription (unsubscribe)
  app.delete('/api/v1/notifications/subscribe', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const user = request.currentUser!

    const { error } = await supabase
      .from('users')
      .update({ push_subscription: null })
      .eq('id', user.id)

    if (error) return reply.status(500).send({ error: error.message })

    return reply.send({ success: true })
  })
}
