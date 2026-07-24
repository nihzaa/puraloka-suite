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

// ── Project helpers ───────────────────────────────────────────────────────────

/**
 * ID user AKTIF dengan nama role tertentu.
 *
 * 🔴 Dulu ini `.eq('role', …)` — kolom `users.role` DI-DROP di Sub-Fase 1B.4 dan
 * diganti FK `role_id`. Query lama membalas 42703 "column users.role does not
 * exist", tapi `error`-nya tidak pernah diperiksa: hasilnya `[]` tanpa suara,
 * sehingga admin BERHENTI menerima notifikasi apa pun tanpa jejak.
 *
 * Kegagalan tetap TIDAK dilempar — notifikasi wajib fire-and-forget dan tak boleh
 * merusak alur utama — tapi sekarang DICATAT, dan ada test integrasi yang gagal
 * bila resolusi ini balik kosong. Sunyi adalah alasan bug ini bertahan.
 */
async function activeUserIdsWithRole(roleName: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, roles!inner(name)')
    .eq('roles.name', roleName)
    .eq('is_active', true)

  if (error) {
    console.error(`[notifications] gagal resolusi penerima role='${roleName}':`, error.message)
    return []
  }
  return (data ?? []).map((u: { id: string }) => u.id)
}

/**
 * Returns user IDs of all admins + the PM of the given project.
 * Deduplicates so a user who is both admin and PM only gets one entry.
 */
export async function getProjectAdminsAndPM(project_id: string): Promise<string[]> {
  const [adminIds, projectRes] = await Promise.all([
    activeUserIdsWithRole('admin'),
    supabase.from('projects').select('pm_id').eq('id', project_id).single(),
  ])

  const ids = new Set<string>(adminIds)
  if (projectRes.data?.pm_id) ids.add(projectRes.data.pm_id)

  return Array.from(ids)
}

/**
 * Returns user IDs of all mandors assigned to the given project.
 */
export async function getProjectMandors(project_id: string): Promise<string[]> {
  const { data } = await supabase
    .from('mandor_assignments')
    .select('mandor_id')
    .eq('project_id', project_id)
    .eq('status', 'active')

  return (data ?? []).map((a: { mandor_id: string }) => a.mandor_id)
}

/**
 * Returns IDs of all active admins.
 */
export async function getAllAdmins(): Promise<string[]> {
  return activeUserIdsWithRole('admin')
}
