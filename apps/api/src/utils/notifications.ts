import { supabase } from './supabase.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'kasbon_pending'
  | 'kasbon_submitted'
  | 'kasbon_approved'
  | 'kasbon_rejected'
  | 'invoice_created'
  | 'invoice_due'
  | 'invoice_overdue'
  | 'invoice_paid'
  | 'milestone_approaching'
  | 'milestone_overdue'
  | 'milestone_completed'
  | 'progress_submitted'
  | 'project_assigned'
  | 'project_status_changed'
  | 'wage_report_submitted'
  | 'change_order_submitted'
  | 'change_order_approved'
  | 'change_order_rejected'
  // Punch List (migrasi 156). Tiga tipe, bukan satu `punch_item`: penerima dan
  // urgensinya berbeda — yang ditugaskan perlu tahu SEGERA ada cacat atas
  // namanya, penemunya perlu tahu perkaranya sudah selesai atau dianggap tak
  // berlaku. Satu tipe generik membuat ketiganya tak bisa disaring terpisah,
  // dan pengaturan notifikasi per-jenis jadi mustahil.
  | 'punch_assigned'
  | 'punch_closed'
  | 'punch_rejected'
  | 'general'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface NotificationParams {
  user_id: string
  title: string
  message: string
  type: NotificationType
  priority?: NotificationPriority
  project_id?: string
  action_url?: string
  action_type?: string
  action_data?: Record<string, unknown>
}

// ── Single notification insert ─────────────────────────────────────────────────

export async function createNotification(params: NotificationParams): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id:     params.user_id,
    title:       params.title,
    message:     params.message,
    type:        params.type,
    priority:    params.priority ?? 'normal',
    project_id:  params.project_id ?? null,
    action_url:  params.action_url ?? null,
    action_type: params.action_type ?? null,
    action_data: params.action_data ?? null,
    channel:     'push',
    is_read:     false,
    is_actioned: false,
    sent_at:     new Date().toISOString(),
  })

  if (error) {
    // Non-fatal: log but never throw — notifications should never break the main flow
    console.error('[notifications] createNotification error:', error.message)
  }
}

// ── Batch insert ──────────────────────────────────────────────────────────────

export async function createNotifications(list: NotificationParams[]): Promise<void> {
  if (list.length === 0) return

  const rows = list.map(params => ({
    user_id:     params.user_id,
    title:       params.title,
    message:     params.message,
    type:        params.type,
    priority:    params.priority ?? 'normal',
    project_id:  params.project_id ?? null,
    action_url:  params.action_url ?? null,
    action_type: params.action_type ?? null,
    action_data: params.action_data ?? null,
    channel:     'push',
    is_read:     false,
    is_actioned: false,
    sent_at:     new Date().toISOString(),
  }))

  const { error } = await supabase.from('notifications').insert(rows)

  if (error) {
    console.error('[notifications] createNotifications batch error:', error.message)
  }
}

// ── Resolusi penerima ─────────────────────────────────────────────────────────
//
// Sudah PINDAH ke Notification Routing Engine (2B): `resolveRecipients(eventType, ctx)`
// di utils/notification-routing.ts, yang membaca `notification_rules` — penerima
// jadi konfigurasi yang bisa diubah dari UI, bukan fungsi hardcoded.
//
// getAllAdmins() / getProjectAdminsAndPM() / getProjectMandors() SENGAJA DIHAPUS,
// bukan disisakan sebagai pembungkus: dua jalur resolusi = dua perilaku yang bisa
// menyimpang diam-diam, persis kesalahan shadow 1C yang sudah di-retire (ADR-006).
