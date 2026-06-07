-- ============================================================
-- PURALOKA SUITE — Migration 008
-- Project Monitoring: Progress Logs, Photos, Milestones, Documents
-- ============================================================

-- ============================================================
-- MILESTONES
-- Target pencapaian per proyek
-- ============================================================
CREATE TABLE milestones (
  id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID                NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           VARCHAR(255)        NOT NULL,
  description     TEXT,
  target_date     DATE                NOT NULL,
  completed_at    DATE,
  status          milestone_status    NOT NULL DEFAULT 'pending',
  sort_order      SMALLINT            NOT NULL DEFAULT 0,
  created_by      UUID                NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_milestones_project_id  ON milestones(project_id);
CREATE INDEX idx_milestones_status      ON milestones(status);
CREATE INDEX idx_milestones_target_date ON milestones(target_date);

COMMENT ON TABLE milestones IS 'Target pencapaian proyek yang bisa dilihat oleh klien melalui portal';

-- ============================================================
-- PROGRESS_LOGS
-- Log progress harian proyek secara keseluruhan
-- ============================================================
CREATE TABLE progress_logs (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reported_by     UUID          NOT NULL REFERENCES users(id),
  pct_overall     NUMERIC(5,2)  NOT NULL,                           -- Persentase progress keseluruhan
  weather         VARCHAR(50),                                      -- Cuaca saat itu
  worker_count    SMALLINT,                                         -- Jumlah pekerja hari ini
  notes           TEXT,
  logged_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_progress_pct_overall CHECK (pct_overall >= 0 AND pct_overall <= 100)
);

CREATE INDEX idx_progress_logs_project_id  ON progress_logs(project_id);
CREATE INDEX idx_progress_logs_reported_by ON progress_logs(reported_by);
CREATE INDEX idx_progress_logs_logged_at   ON progress_logs(logged_at);

COMMENT ON TABLE  progress_logs            IS 'Log progress harian proyek secara keseluruhan — input dari lapangan';
COMMENT ON COLUMN progress_logs.pct_overall IS 'Persentase progress keseluruhan proyek saat log dibuat';

-- ============================================================
-- PROJECT_PHOTOS
-- Foto dokumentasi lapangan per progress log
-- ============================================================
CREATE TABLE project_photos (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  progress_log_id   UUID          REFERENCES progress_logs(id),     -- Null jika foto standalone
  url               TEXT          NOT NULL,                          -- URL Supabase Storage
  thumbnail_url     TEXT,                                            -- URL thumbnail
  caption           TEXT,
  taken_at          TIMESTAMPTZ,
  file_size_kb      INTEGER,
  uploaded_by       UUID          NOT NULL REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_photos_project_id      ON project_photos(project_id);
CREATE INDEX idx_project_photos_progress_log_id ON project_photos(progress_log_id);
CREATE INDEX idx_project_photos_uploaded_at     ON project_photos(uploaded_at);

COMMENT ON TABLE  project_photos                IS 'Foto dokumentasi lapangan proyek';
COMMENT ON COLUMN project_photos.url            IS 'URL foto di Supabase Storage';
COMMENT ON COLUMN project_photos.progress_log_id IS 'Null jika foto diunggah secara standalone tanpa terkait progress log';

-- ============================================================
-- DOCUMENTS
-- Dokumen proyek: kontrak, gambar kerja, berita acara, dll
-- ============================================================
CREATE TABLE documents (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           VARCHAR(255)    NOT NULL,
  doc_type        document_type   NOT NULL,
  file_url        TEXT            NOT NULL,                          -- URL Supabase Storage
  file_size_kb    INTEGER,
  file_extension  VARCHAR(20),
  version         VARCHAR(50)     DEFAULT '1.0',
  is_visible_to_client BOOLEAN    NOT NULL DEFAULT false,            -- Apakah klien bisa lihat dokumen ini
  uploaded_by     UUID            NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_project_id          ON documents(project_id);
CREATE INDEX idx_documents_doc_type            ON documents(doc_type);
CREATE INDEX idx_documents_is_visible_to_client ON documents(is_visible_to_client);

COMMENT ON TABLE  documents                        IS 'Dokumen proyek: kontrak, gambar kerja, berita acara, dll';
COMMENT ON COLUMN documents.is_visible_to_client   IS 'True = klien bisa lihat dokumen ini di portal mereka';
