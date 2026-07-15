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
 * Returns user IDs of all admins + the PM of the given project.
 * Deduplicates so a user who is both admin and PM only gets one entry.
 */
export async function getProjectAdminsAndPM(project_id: string): Promise<string[]> {
  const [adminsRes, projectRes] = await Promise.all([
    supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true),
    supabase.from('projects').select('pm_id').eq('id', project_id).single(),
  ])

  const ids = new Set<string>()
  for (const u of adminsRes.data ?? []) ids.add(u.id)
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
  const { data } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true)
  return (data ?? []).map((u: { id: string }) => u.id)
}
