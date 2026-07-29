-- ============================================================
-- 140 — HARGA KHUSUS PER PROYEK (override), tanpa menyentuh harga acuan
--
-- Pertanyaan founder 2026-07-29, dari praktik nyata:
--
--   "Cor lantai di rekap analisa Rp 6,7 jt. Saat bikin RAB untuk SATU proyek
--    tertentu, saya mau pakai Rp 5 jt — tapi di database harga awalnya harus
--    TETAP. Dan dalam periode berlaku yang sama, tiap proyek bisa pakai harga
--    berbeda-beda. Selama ini di pekerjaan nyata memang begitu."
--
-- ------------------------------------------------------------
-- KENAPA BELUM TERTANGANI
-- ------------------------------------------------------------
-- `price_book_entries` punya sumbu WAKTU (effective/expired) dan LOKASI, tapi
-- TIDAK punya sumbu PROYEK. Akibatnya satu-satunya cara menurunkan harga untuk
-- satu proyek adalah mengubah harga acuannya — dan itu menyeret SELURUH proyek
-- lain yang belum terkunci. Persis yang founder tolak.
--
-- Menambah `project_id` ke `price_book_entries` juga salah: baris harga acuan
-- dan baris harga-khusus-proyek akan bercampur di satu tabel, dan tiap query
-- harga acuan harus ingat menyaring `project_id IS NULL`. Satu kelupaan =
-- harga khusus satu proyek bocor jadi harga acuan semua proyek.
--
-- ------------------------------------------------------------
-- BENTUK: TABEL TERPISAH, PRIORITAS DI ATAS PRICE BOOK
-- ------------------------------------------------------------
-- `project_price_override` = "untuk proyek ini, resource ini, pakai harga ini".
-- Harga acuan di `price_book_entries` TIDAK PERNAH tersentuh.
--
-- Urutan pemilihan harga jadi tiga lapis (resolver, migrasi ini + kode):
--   1. Override proyek  ← paling khusus, menang
--   2. Price book lokasi persis
--   3. Price book umum (location NULL)
--
-- Konsekuensi yang DIINGINKAN: dua proyek dalam periode berlaku yang sama bisa
-- memakai harga berbeda untuk resource yang sama, tanpa satu pun menyentuh
-- yang lain. Itu bukan efek samping — itu tujuannya.
--
-- ------------------------------------------------------------
-- KENAPA OVERRIDE TIDAK MERUSAK JEJAK
-- ------------------------------------------------------------
-- `hsp_snapshot` (migrasi 139) sudah menyimpan harga yang BENAR-BENAR dipakai
-- tiap item beserta asalnya. Override menambah satu jenis asal, dan snapshot
-- ikut mencatatnya. Jadi pertanyaan "kenapa cor lantai di proyek ini Rp 5 jt
-- padahal acuannya Rp 6,7 jt" terjawab dari data, bukan dari ingatan orang.
--
-- Karena itu `reason` WAJIB: harga yang menyimpang dari acuan tanpa alasan
-- tertulis adalah persis hal yang ditanyakan auditor belakangan.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_price_override (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  resource_id  UUID NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,

  amount       NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency     TEXT NOT NULL DEFAULT 'IDR',

  -- Masa berlaku OPSIONAL. Kosong = berlaku selama proyek berjalan, yang
  -- merupakan kasus terbanyak: "untuk proyek ini, semen pakai harga ini".
  -- Diisi hanya bila harga khusus itu sendiri berubah di tengah proyek.
  effective_date DATE,
  expired_date   DATE,

  -- WAJIB. Harga yang menyimpang dari acuan tanpa alasan tertulis adalah
  -- persis yang ditanyakan belakangan dan tak ada yang bisa menjawabnya.
  reason       TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  notes        TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Satu harga khusus per (proyek, resource, mulai-berlaku). Tanpa ini, dua
  -- baris bisa sama-sama berlaku dan yang menang jadi bergantung urutan baca.
  CONSTRAINT ppo_unik UNIQUE (project_id, resource_id, effective_date),

  CONSTRAINT ppo_periode_wajar CHECK (
    expired_date IS NULL OR effective_date IS NULL OR expired_date >= effective_date
  )
);

COMMENT ON TABLE project_price_override IS
  'Harga khusus untuk SATU proyek. Menang atas price_book_entries, tanpa '
  'menyentuhnya. Memungkinkan dua proyek dalam periode yang sama memakai harga '
  'berbeda untuk resource yang sama — pola kerja nyata di lapangan.';

COMMENT ON COLUMN project_price_override.effective_date IS
  'Opsional. NULL = berlaku selama proyek berjalan (kasus terbanyak). Diisi '
  'hanya bila harga khusus itu sendiri berubah di tengah proyek.';

CREATE INDEX IF NOT EXISTS idx_ppo_project  ON project_price_override (project_id);
CREATE INDEX IF NOT EXISTS idx_ppo_resource ON project_price_override (project_id, resource_id);

-- ------------------------------------------------------------
-- RLS — kategori C (tenancy lewat project_id), pola sama seluruh tabel turunan.
-- Helper dibungkus (SELECT ...) → InitPlan (migrasi 132).
-- ------------------------------------------------------------
ALTER TABLE project_price_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppo_read ON project_price_override;
CREATE POLICY ppo_read ON project_price_override FOR SELECT
  USING ((SELECT has_permission('cecep:price:view')));

DROP POLICY IF EXISTS ppo_write ON project_price_override;
CREATE POLICY ppo_write ON project_price_override FOR ALL
  USING ((SELECT has_permission('cecep:price:manage')))
  WITH CHECK ((SELECT has_permission('cecep:price:manage')));

DROP POLICY IF EXISTS tenant_isolation ON project_price_override;
CREATE POLICY tenant_isolation ON project_price_override AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='project_price_override' AND permissive='PERMISSIVE') THEN
    RAISE EXCEPTION '140: tanpa policy permissive — tabel tak terbaca siapa pun (T1-F3).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='project_price_override' AND policyname='tenant_isolation') THEN
    RAISE EXCEPTION '140: tanpa isolasi tenant — harga proyek bocor lintas company.';
  END IF;
  RAISE NOTICE '140: harga khusus per proyek aktif (menang atas price book, tanpa mengubahnya).';
END $$;
