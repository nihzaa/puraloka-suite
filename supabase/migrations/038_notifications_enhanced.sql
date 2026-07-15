-- Migration 038: Enhance notifications table with interactive notification support
-- Adds: type, action_type, action_data, is_actioned, actioned_at, priority
-- Also adds push_subscription column to users for Web Push API

-- ── Extend notifications table ────────────────────────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS action_type   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS action_data   JSONB,
  ADD COLUMN IF NOT EXISTS is_actioned   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actioned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority      VARCHAR(20) NOT NULL DEFAULT 'normal';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read
  ON notifications (user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_sent_at
  ON notifications (user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications (type);

CREATE INDEX IF NOT EXISTS idx_notifications_priority
  ON notifications (priority);

-- ── Add push_subscription to users ───────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_subscription JSONB;

-- ── Comment documentation ─────────────────────────────────────────────────────
COMMENT ON COLUMN notifications.type IS
  'Notification type: kasbon_pending, kasbon_approved, kasbon_rejected,
   invoice_created, invoice_due, invoice_overdue, invoice_paid,
   milestone_approaching, milestone_overdue, milestone_completed,
   progress_submitted, project_assigned, project_status_changed,
   wage_report_submitted';

COMMENT ON COLUMN notifications.action_type IS
  'Action handler key: approve_kasbon, reject_kasbon, view_kasbon,
   approve_wage_report, reject_wage_report, view_invoice,
   view_project, view_milestone, view_progress';

COMMENT ON COLUMN notifications.action_data IS
  'Payload for the action handler, e.g. { "kasbon_id": "...", "amount": 500000 }';

COMMENT ON COLUMN notifications.priority IS
  'Notification priority: low | normal | high | urgent';

COMMENT ON COLUMN users.push_subscription IS
  'Web Push API PushSubscription JSON (endpoint, keys.p256dh, keys.auth)';
