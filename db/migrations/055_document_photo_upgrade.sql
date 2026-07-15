-- ============================================================
-- PURALOKA SUITE — Migration 055
-- Document Permission System + Photo Gallery Kategorisasi
-- ============================================================

-- Tambah kolom category ke project_photos
ALTER TABLE project_photos
  ADD COLUMN category TEXT NOT NULL DEFAULT 'progress'
    CHECK (category IN ('progress', 'defect', 'serah_terima', 'other'));

CREATE INDEX idx_project_photos_category ON project_photos(category);

COMMENT ON COLUMN project_photos.category IS 'Kategori foto: progress, defect, serah_terima, other';

-- Document access audit log
CREATE TABLE document_access_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL CHECK (action IN ('view', 'download')),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_access_logs_document_id ON document_access_logs(document_id);
CREATE INDEX idx_doc_access_logs_user_id     ON document_access_logs(user_id);
CREATE INDEX idx_doc_access_logs_accessed_at ON document_access_logs(accessed_at);

COMMENT ON TABLE document_access_logs IS 'Audit trail akses dokumen (view/download) per user';
