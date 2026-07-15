-- ============================================================
-- PURALOKA SUITE — Migration 036
-- Soft-delete untuk tabel projects
--
-- MASALAH: Sebelumnya DELETE projects CASCADE ke semua tabel
-- keuangan (invoices, expense_reports, mandor_assignments, dst)
-- sehingga satu perintah DELETE menghapus data bulan-bulan
-- secara permanen tanpa recovery.
--
-- SOLUSI:
-- 1. Tambah kolom is_deleted + deleted_at ke tabel projects
-- 2. Ubah FK di tabel KEUANGAN dari CASCADE → RESTRICT
--    (hapus proyek tidak bisa dilakukan jika masih ada data)
-- 3. Tabel monitoring (milestones, progress_logs, photos,
--    documents) tetap CASCADE karena ini operational data,
--    bukan financial record — dan sudah ada di Storage
-- 4. API endpoint DELETE /projects/:id hanya set is_deleted = true
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Tambah soft-delete columns ke projects
-- ─────────────────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID        REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_projects_is_deleted ON projects(is_deleted) WHERE is_deleted = false;

COMMENT ON COLUMN projects.is_deleted IS 'Soft-delete flag — proyek tidak pernah benar-benar dihapus dari DB';
COMMENT ON COLUMN projects.deleted_at IS 'Timestamp saat soft-delete dilakukan';
COMMENT ON COLUMN projects.deleted_by IS 'User yang melakukan soft-delete';

-- ─────────────────────────────────────────────────────────────
-- 2. Tabel KEUANGAN & MANDOR: CASCADE → RESTRICT
--    Ini melindungi data finansial — proyek tidak bisa dihapus
--    (bahkan hard-delete) jika masih ada data di bawahnya.
-- ─────────────────────────────────────────────────────────────

-- mandor_assignments: CASCADE → RESTRICT
ALTER TABLE mandor_assignments
  DROP CONSTRAINT IF EXISTS mandor_assignments_project_id_fkey,
  ADD  CONSTRAINT mandor_assignments_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- invoices: tidak ada CASCADE, tapi pastikan ON DELETE RESTRICT
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_project_id_fkey,
  ADD  CONSTRAINT invoices_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- expense_reports (migration 005): CASCADE → RESTRICT
ALTER TABLE expense_reports
  DROP CONSTRAINT IF EXISTS expense_reports_project_id_fkey,
  ADD  CONSTRAINT expense_reports_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- project_expense_categories (migration 004): CASCADE → RESTRICT
ALTER TABLE project_expense_categories
  DROP CONSTRAINT IF EXISTS project_expense_categories_project_id_fkey,
  ADD  CONSTRAINT project_expense_categories_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- project_expenses (migration 016): CASCADE → RESTRICT
ALTER TABLE project_expenses
  DROP CONSTRAINT IF EXISTS project_expenses_project_id_fkey,
  ADD  CONSTRAINT project_expenses_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- rab_items (migration 013): CASCADE → RESTRICT
ALTER TABLE rab_items
  DROP CONSTRAINT IF EXISTS rab_items_project_id_fkey,
  ADD  CONSTRAINT rab_items_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- worker_kasbons (migration 018): CASCADE → RESTRICT
ALTER TABLE worker_kasbons
  DROP CONSTRAINT IF EXISTS worker_kasbons_project_id_fkey,
  ADD  CONSTRAINT worker_kasbons_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- termin_schedules (migration 003): CASCADE → RESTRICT
-- (data kontrak, wajib dilindungi)
ALTER TABLE termin_schedules
  DROP CONSTRAINT IF EXISTS termin_schedules_project_id_fkey,
  ADD  CONSTRAINT termin_schedules_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────
-- 3. Tabel MONITORING tetap CASCADE (operational, bukan finansial)
--    milestones, progress_logs, project_photos, documents
--    → dibiarkan ON DELETE CASCADE (sudah ada dari migration 008)
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 4. cash_accounts.project_id: SET NULL (kas tidak ikut terhapus)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE cash_accounts
  DROP CONSTRAINT IF EXISTS cash_accounts_project_id_fkey,
  ADD  CONSTRAINT cash_accounts_project_id_fkey
       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
