-- ============================================================================
-- 505 — ADMIN SAAS: marketing content (backing untuk kontrak API publik)
-- ============================================================================
--
-- Spec §4.5. content JSONB polymorphic di marketing_sections — jumlah
-- section_type kecil (6 jenis), bentuknya murni tampilan, validasi bentuk
-- JSON per tipe dilakukan app-layer admin-saas, bukan DB.
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  meta_description  TEXT,
  is_published      BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES marketing_pages(id) ON DELETE CASCADE,
  section_type  TEXT NOT NULL CHECK (section_type IN
                   ('hero','features','pricing_table','testimonials','faq','cta')),
  sort_order    INT NOT NULL DEFAULT 0,
  content       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_pricing_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID REFERENCES plans(id) ON DELETE SET NULL,
  headline       TEXT,
  price_label    TEXT,
  features_list  JSONB NOT NULL DEFAULT '[]',
  is_featured    BOOLEAN NOT NULL DEFAULT false,
  sort_order     INT NOT NULL DEFAULT 0,
  is_published   BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_testimonials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name   TEXT NOT NULL,
  author_role   TEXT,
  company_name  TEXT,
  quote         TEXT NOT NULL,
  avatar_url    TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_faqs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  is_published  BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN
     ('marketing_pages','marketing_sections','marketing_pricing_plans',
      'marketing_testimonials','marketing_faqs');
  IF n <> 5 THEN
    RAISE EXCEPTION '505 gagal: hanya % dari 5 tabel yang tercipta', n;
  END IF;

  RAISE NOTICE '505 OK: 5 tabel marketing content terpasang';
END $$;
