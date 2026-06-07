-- ============================================================
-- PURALOKA SUITE — Migration 004
-- Expense Categories (Master Template & Per Project)
-- ============================================================

-- ============================================================
-- EXPENSE_CATEGORY_TEMPLATES
-- Master template global yang dikelola admin
-- ============================================================
CREATE TABLE expense_category_templates (
  id            UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255)            NOT NULL,
  type          expense_category_type   NOT NULL,
  parent_id     UUID                    REFERENCES expense_category_templates(id),  -- Null = kategori induk
  sort_order    SMALLINT                NOT NULL DEFAULT 0,
  is_active     BOOLEAN                 NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expense_cat_templates_parent_id ON expense_category_templates(parent_id);
CREATE INDEX idx_expense_cat_templates_type      ON expense_category_templates(type);
CREATE INDEX idx_expense_cat_templates_is_active ON expense_category_templates(is_active);

COMMENT ON TABLE  expense_category_templates          IS 'Template kategori pengeluaran global — di-clone ke setiap proyek baru';
COMMENT ON COLUMN expense_category_templates.parent_id IS 'Null = kategori induk, berisi UUID = sub-kategori';

-- ============================================================
-- PROJECT_EXPENSE_CATEGORIES
-- Salinan kategori per proyek (clone dari template saat proyek dibuat)
-- Bisa dimodifikasi per proyek tanpa affect template atau proyek lain
-- ============================================================
CREATE TABLE project_expense_categories (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID                    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id     UUID                    REFERENCES expense_category_templates(id),  -- Null jika kategori custom tambahan
  name            VARCHAR(255)            NOT NULL,
  type            expense_category_type   NOT NULL,
  parent_id       UUID                    REFERENCES project_expense_categories(id),  -- Null = kategori induk
  sort_order      SMALLINT                NOT NULL DEFAULT 0,
  is_active       BOOLEAN                 NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proj_exp_cat_project_id  ON project_expense_categories(project_id);
CREATE INDEX idx_proj_exp_cat_parent_id   ON project_expense_categories(parent_id);
CREATE INDEX idx_proj_exp_cat_template_id ON project_expense_categories(template_id);
CREATE INDEX idx_proj_exp_cat_type        ON project_expense_categories(type);

COMMENT ON TABLE  project_expense_categories             IS 'Kategori pengeluaran per proyek — clone dari template saat proyek dibuat';
COMMENT ON COLUMN project_expense_categories.template_id IS 'Referensi ke template asal, null jika kategori custom tambahan proyek';
COMMENT ON COLUMN project_expense_categories.parent_id   IS 'Null = kategori induk, berisi UUID = sub-kategori';
