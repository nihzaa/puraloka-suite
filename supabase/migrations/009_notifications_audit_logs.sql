-- ============================================================
-- PURALOKA SUITE — Migration 009
-- Notifications & Audit Logs
-- ============================================================

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id      UUID                    REFERENCES projects(id),
  title           VARCHAR(255)            NOT NULL,
  message         TEXT                    NOT NULL,
  channel         notification_channel    NOT NULL DEFAULT 'push',
  is_read         BOOLEAN                 NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  action_url      TEXT,                                             -- URL deep link untuk mobile
  sent_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_project_id ON notifications(project_id);
CREATE INDEX idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX idx_notifications_sent_at    ON notifications(sent_at);

COMMENT ON TABLE  notifications            IS 'Notifikasi sistem ke pengguna via push, WhatsApp, atau email';
COMMENT ON COLUMN notifications.action_url IS 'Deep link untuk navigasi langsung ke halaman terkait di mobile app';

-- ============================================================
-- AUDIT_LOGS
-- Rekam jejak semua perubahan data sensitif
-- ============================================================
CREATE TABLE audit_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          REFERENCES users(id),
  action          VARCHAR(100)  NOT NULL,                           -- INSERT | UPDATE | DELETE | LOGIN | etc
  table_name      VARCHAR(100)  NOT NULL,
  record_id       UUID,                                             -- ID record yang diubah
  old_values      JSONB,                                            -- Nilai sebelum perubahan
  new_values      JSONB,                                            -- Nilai setelah perubahan
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_record_id  ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action     ON audit_logs(action);

COMMENT ON TABLE  audit_logs            IS 'Rekam jejak semua perubahan data sensitif untuk keperluan audit';
COMMENT ON COLUMN audit_logs.old_values IS 'Snapshot nilai sebelum perubahan dalam format JSONB';
COMMENT ON COLUMN audit_logs.new_values IS 'Snapshot nilai setelah perubahan dalam format JSONB';
