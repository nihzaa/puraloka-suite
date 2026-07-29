-- ============================================================
-- 138 — CECEP langkah 7: RAP / PAGU (D6)
--
-- Desain: `CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md` §D6.
-- Prasyarat yang akhirnya terpenuhi: multi-tenant TUNTAS (Program D T0–T7 +
-- T9). RAP adalah commitment ledger — tripwire #1 melarangnya lahir sebelum
-- multi-tenant selesai, supaya ia lahir dengan `company_id` sejak baris
-- pertama dan nol backfill. Itulah yang terjadi di sini.
--
-- ------------------------------------------------------------
-- BEDA RAB DAN RAP — inti langkah ini
-- ------------------------------------------------------------
--   RAB (sudah ada, `estimate_*`)  = rencana JUAL ke klien.
--                                    Harga pasar + upah harian, lewat AHSP.
--   RAP (ini)                      = rencana BELANJA internal.
--                                    Harga supplier nyata + borongan mandor.
--
-- Selisih keduanya adalah margin yang dikelola. Karena itu RAP TIDAK
-- menggantikan RAB dan tidak menyalinnya: ia menurunkan kuantitas dari take-off
-- RAB, lalu memakai harga dan cara upah yang berbeda.
--
-- ------------------------------------------------------------
-- KENAPA QTY DISALIN, BUKAN DIHITUNG ULANG TIAP DIBUKA
-- ------------------------------------------------------------
-- Take-off dihitung on-the-fly dari `estimate_items × assembly_components`
-- (endpoint /material-takeoff, langkah 6). RAP menyalin hasilnya sekali saat
-- diturunkan, ke `qty_ahsp`.
--
-- Alasannya bukan performa: pagu adalah KOMITMEN. Kalau angkanya ikut berubah
-- setiap kali RAB atau katalog AHSP disunting, maka "pagu semen 12 ton" bisa
-- diam-diam menjadi angka lain setelah disetujui — dan tak ada yang tahu kapan
-- berubahnya. `qty_ahsp` menyimpan apa yang DIPUTUSKAN, `qty_adjusted`
-- menyimpan penyesuaian manusia terhadapnya, dan keduanya tetap terbaca
-- berdampingan.
--
-- ------------------------------------------------------------
-- YANG TIDAK DIBANGUN DI SINI (sengaja)
-- ------------------------------------------------------------
-- Sambungan ke realisasi belanja (D7: PO/GR/project_expenses) TIDAK dibangun.
-- Desainnya sendiri menandainya "discovery, jangan bangun" — titik sambungnya
-- (`resource_id` ↔ material procurement) belum dipastikan, dan menebaknya
-- sekarang berarti menulis join yang harus dibongkar lagi.
-- ============================================================

-- ------------------------------------------------------------
-- 1. rap_budget — satu RAP per (project, versi estimasi sumber).
--
-- Kategori C (mewarisi tenancy lewat project_id) mengikuti pola seluruh tabel
-- turunan proyek. TIDAK diberi company_id sendiri: dua sumber kebenaran
-- kepemilikan pada baris yang sama adalah cara paling mudah membuat keduanya
-- berbeda tanpa ketahuan.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rap_budget (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Versi RAB yang menjadi asal kuantitas. Disimpan supaya pertanyaan "pagu ini
  -- diturunkan dari RAB yang mana" selalu terjawab, termasuk setelah RAB
  -- di-supersede versi baru.
  estimate_version_id UUID NOT NULL REFERENCES estimate_versions(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'locked')),
  notes               TEXT,
  locked_at           TIMESTAMPTZ,
  locked_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,

  -- status dan jejak lock tidak boleh berselisih: 'locked' tanpa locked_at
  -- membuat "kapan dikunci" tak terjawab, dan locked_at pada draft membuat
  -- statusnya berbohong.
  CONSTRAINT rap_budget_lock_konsisten CHECK (
    (status = 'locked' AND locked_at IS NOT NULL) OR
    (status = 'draft'  AND locked_at IS NULL)
  )
);

COMMENT ON TABLE rap_budget IS
  'CECEP D6: RAP (rencana belanja internal) per proyek, diturunkan dari satu '
  'versi RAB. draft = boleh disunting; locked = pagu jadi komitmen, perubahan '
  'hanya lewat rap_change_log.';

CREATE INDEX IF NOT EXISTS idx_rap_budget_project ON rap_budget (project_id);
CREATE INDEX IF NOT EXISTS idx_rap_budget_version ON rap_budget (estimate_version_id);

-- ------------------------------------------------------------
-- 2. rap_material_line — pagu material.
--
-- `pagu` GENERATED, bukan kolom biasa yang diisi aplikasi: qty × harga adalah
-- turunan murni, dan membiarkan aplikasi menghitungnya berarti dua tempat bisa
-- tidak sepakat (mis. update harga lupa menghitung ulang pagu). Database yang
-- menjaminnya.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rap_material_line (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rap_budget_id  UUID NOT NULL REFERENCES rap_budget(id) ON DELETE CASCADE,
  resource_id    UUID NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,

  -- Kuantitas hasil take-off RAB saat diturunkan. TIDAK berubah lagi — ia
  -- catatan "menurut RAB, segini kebutuhannya".
  qty_ahsp       NUMERIC(18,4) NOT NULL CHECK (qty_ahsp >= 0),
  -- Penyesuaian manusia (sisa material, beli borongan, pembulatan kemasan).
  -- Default = qty_ahsp supaya tanpa penyesuaian keduanya sama, bukan nol.
  qty_adjusted   NUMERIC(18,4) NOT NULL CHECK (qty_adjusted >= 0),
  unit_code      TEXT NOT NULL,

  -- Harga SUPPLIER, bukan harga pasar di price book RAB. Inilah beda RAP.
  supplier_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (supplier_price >= 0),
  supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  pagu           NUMERIC(20,2) GENERATED ALWAYS AS
                   (ROUND(qty_adjusted * supplier_price, 2)) STORED,

  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rap_material_unik UNIQUE (rap_budget_id, resource_id)
);

COMMENT ON COLUMN rap_material_line.qty_ahsp IS
  'Kuantitas dari take-off RAB saat RAP diturunkan. Beku — bukan dihitung ulang '
  'tiap dibuka, supaya pagu yang sudah diputuskan tidak berubah diam-diam saat '
  'RAB atau katalog AHSP disunting.';
COMMENT ON COLUMN rap_material_line.qty_adjusted IS
  'Kuantitas yang benar-benar dianggarkan. Selisihnya terhadap qty_ahsp adalah '
  'keputusan manusia yang tetap terbaca (mis. pembulatan ke kemasan).';

CREATE INDEX IF NOT EXISTS idx_rap_material_budget ON rap_material_line (rap_budget_id);

-- ------------------------------------------------------------
-- 3. rap_labor_line — pagu upah, model BORONGAN.
--
-- Bukan upah harian: RAB memakai upah harian lewat koefisien AHSP, RAP memakai
-- borongan per scope karena itulah yang benar-benar dibayarkan ke mandor.
-- Karena itu tabel ini TIDAK diturunkan dari take-off — ia diisi manusia.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rap_labor_line (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rap_budget_id  UUID NOT NULL REFERENCES rap_budget(id) ON DELETE CASCADE,
  -- Boleh menunjuk work_scope yang sudah ada, boleh berdiri sendiri: saat RAP
  -- disusun, scope mandor belum tentu sudah dibuat.
  work_scope_id  UUID REFERENCES work_scopes(id) ON DELETE SET NULL,
  description    TEXT NOT NULL,
  borongan_value NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (borongan_value >= 0),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rap_labor_line IS
  'CECEP D6: pagu upah model BORONGAN per scope — bukan upah harian seperti RAB. '
  'Diisi manusia, tidak diturunkan dari take-off.';

CREATE INDEX IF NOT EXISTS idx_rap_labor_budget ON rap_labor_line (rap_budget_id);

-- ------------------------------------------------------------
-- 4. rap_change_log — perubahan SESUDAH lock.
--
-- Pola sama dengan Change Order: yang dikunci bukan "tak boleh berubah
-- selamanya", melainkan "tak boleh berubah tanpa jejak". Alasan WAJIB.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rap_change_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rap_budget_id UUID NOT NULL REFERENCES rap_budget(id) ON DELETE CASCADE,
  line_table    TEXT NOT NULL CHECK (line_table IN ('rap_material_line', 'rap_labor_line')),
  line_id       UUID NOT NULL,
  field_name    TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  -- WAJIB dan tak boleh kosong. Change log tanpa alasan hanya mencatat BAHWA
  -- sesuatu berubah, sementara pertanyaan yang selalu muncul belakangan adalah
  -- KENAPA.
  reason        TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE rap_change_log IS
  'CECEP D6: jejak perubahan pagu SESUDAH lock. Alasan wajib — pola Change Order.';

CREATE INDEX IF NOT EXISTS idx_rap_change_budget ON rap_change_log (rap_budget_id, changed_at DESC);

-- ------------------------------------------------------------
-- 5. Guard: line beku setelah lock.
--
-- Ditegakkan di DATABASE, bukan hanya di endpoint. Alasannya bukan ketidak-
-- percayaan pada kode sendiri: pagu yang terkunci adalah angka yang dipakai
-- menilai kinerja proyek, dan jalur tulis bisa bertambah (script, job, endpoint
-- baru). Guard di satu tempat menutup semuanya sekaligus.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_rap_line_terkunci()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_status TEXT;
  v_budget UUID;
BEGIN
  v_budget := COALESCE(NEW.rap_budget_id, OLD.rap_budget_id);
  SELECT status INTO v_status FROM rap_budget WHERE id = v_budget;

  IF v_status = 'locked' THEN
    RAISE EXCEPTION
      'RAP sudah dikunci — pagu tidak dapat diubah langsung. Catat perubahannya '
      'lewat rap_change_log (alasan wajib), seperti Change Order.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_rap_material_terkunci ON rap_material_line;
CREATE TRIGGER trg_rap_material_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON rap_material_line
  FOR EACH ROW EXECUTE FUNCTION fn_rap_line_terkunci();

DROP TRIGGER IF EXISTS trg_rap_labor_terkunci ON rap_labor_line;
CREATE TRIGGER trg_rap_labor_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON rap_labor_line
  FOR EACH ROW EXECUTE FUNCTION fn_rap_line_terkunci();

-- ------------------------------------------------------------
-- 6. Guard: lock tidak bisa dibuka lagi.
--
-- Membuka kunci akan membuat seluruh gunanya hilang — pagu bisa disunting diam-
-- diam lalu dikunci ulang, dan change log-nya kosong. Kalau pagu memang harus
-- berubah, jalurnya adalah change log, atau RAP baru.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_rap_lock_sekali()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status = 'locked' AND NEW.status <> 'locked' THEN
    RAISE EXCEPTION
      'RAP yang sudah dikunci tidak dapat dibuka kembali. Perubahan pagu dicatat '
      'lewat rap_change_log, atau buat RAP baru.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_rap_lock_sekali ON rap_budget;
CREATE TRIGGER trg_rap_lock_sekali
  BEFORE UPDATE ON rap_budget
  FOR EACH ROW EXECUTE FUNCTION fn_rap_lock_sekali();

-- ------------------------------------------------------------
-- 7. RLS — dua axis, pola sama dengan seluruh tabel kategori C.
--   permissive = axis ROLE (permission), restrictive = axis COMPANY.
-- Helper dibungkus (SELECT ...) → InitPlan (migrasi 132).
-- ------------------------------------------------------------
ALTER TABLE rap_budget        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rap_material_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE rap_labor_line    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rap_change_log    ENABLE ROW LEVEL SECURITY;

-- Helper: company pemilik sebuah RAP (lewat project-nya).
CREATE OR REPLACE FUNCTION t5_company_dari_rap_budget(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id FROM rap_budget b
    JOIN projects p ON p.id = b.project_id
   WHERE b.id = p_id;
$$;

DROP POLICY IF EXISTS rap_budget_read ON rap_budget;
CREATE POLICY rap_budget_read ON rap_budget FOR SELECT
  USING ((SELECT has_permission('cecep:rap:view')));
DROP POLICY IF EXISTS rap_budget_write ON rap_budget;
CREATE POLICY rap_budget_write ON rap_budget FOR ALL
  USING ((SELECT has_permission('cecep:rap:manage')))
  WITH CHECK ((SELECT has_permission('cecep:rap:manage')));
DROP POLICY IF EXISTS tenant_isolation ON rap_budget;
CREATE POLICY tenant_isolation ON rap_budget AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

DROP POLICY IF EXISTS rap_material_read ON rap_material_line;
CREATE POLICY rap_material_read ON rap_material_line FOR SELECT
  USING ((SELECT has_permission('cecep:rap:view')));
DROP POLICY IF EXISTS rap_material_write ON rap_material_line;
CREATE POLICY rap_material_write ON rap_material_line FOR ALL
  USING ((SELECT has_permission('cecep:rap:manage')))
  WITH CHECK ((SELECT has_permission('cecep:rap:manage')));
DROP POLICY IF EXISTS tenant_isolation ON rap_material_line;
CREATE POLICY tenant_isolation ON rap_material_line AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_rap_budget(rap_budget_id) = (SELECT auth_company_id()))
  WITH CHECK (t5_company_dari_rap_budget(rap_budget_id) = (SELECT auth_company_id()));

DROP POLICY IF EXISTS rap_labor_read ON rap_labor_line;
CREATE POLICY rap_labor_read ON rap_labor_line FOR SELECT
  USING ((SELECT has_permission('cecep:rap:view')));
DROP POLICY IF EXISTS rap_labor_write ON rap_labor_line;
CREATE POLICY rap_labor_write ON rap_labor_line FOR ALL
  USING ((SELECT has_permission('cecep:rap:manage')))
  WITH CHECK ((SELECT has_permission('cecep:rap:manage')));
DROP POLICY IF EXISTS tenant_isolation ON rap_labor_line;
CREATE POLICY tenant_isolation ON rap_labor_line AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_rap_budget(rap_budget_id) = (SELECT auth_company_id()))
  WITH CHECK (t5_company_dari_rap_budget(rap_budget_id) = (SELECT auth_company_id()));

-- Change log: dibaca oleh pemegang view, ditulis oleh pemegang manage.
-- TIDAK ada policy UPDATE/DELETE — jejak perubahan yang bisa disunting bukan
-- jejak. (Postgres: tanpa policy untuk suatu perintah, perintah itu ditolak.)
DROP POLICY IF EXISTS rap_change_read ON rap_change_log;
CREATE POLICY rap_change_read ON rap_change_log FOR SELECT
  USING ((SELECT has_permission('cecep:rap:view')));
DROP POLICY IF EXISTS rap_change_insert ON rap_change_log;
CREATE POLICY rap_change_insert ON rap_change_log FOR INSERT
  WITH CHECK ((SELECT has_permission('cecep:rap:manage')));
DROP POLICY IF EXISTS tenant_isolation ON rap_change_log;
CREATE POLICY tenant_isolation ON rap_change_log AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_rap_budget(rap_budget_id) = (SELECT auth_company_id()))
  WITH CHECK (t5_company_dari_rap_budget(rap_budget_id) = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- 8. Permission baru + seed ke role yang sudah memegang estimasi.
--
-- Scope dijaga identik dengan `cecep:estimate:*` (Engineering Default Rule #3:
-- capability diturunkan mekanis, tanpa memperluas SIAPA yang boleh).
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES
  ('cecep:rap:view',   'cecep', 'Lihat RAP',   'Melihat rencana anggaran pelaksanaan (pagu belanja internal)'),
  ('cecep:rap:manage', 'cecep', 'Kelola RAP',  'Membuat, menyunting, dan mengunci RAP/pagu')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM permissions p
  JOIN permissions pe ON pe.key = 'cecep:estimate:view'
  JOIN role_permissions rp ON rp.permission_id = pe.id
 WHERE p.key = 'cecep:rap:view'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM permissions p
  JOIN permissions pe ON pe.key = 'cecep:estimate:manage'
  JOIN role_permissions rp ON rp.permission_id = pe.id
 WHERE p.key = 'cecep:rap:manage'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 9. Verifikasi.
-- ------------------------------------------------------------
DO $$
DECLARE v_kurang TEXT;
BEGIN
  -- Tiap tabel baru wajib punya policy permissive DAN restrictive. RLS aktif
  -- tanpa permissive = tabel mati total (T1-F3); tanpa restrictive = bocor
  -- lintas company.
  SELECT string_agg(t, ', ') INTO v_kurang FROM (
    SELECT unnest(ARRAY['rap_budget','rap_material_line','rap_labor_line','rap_change_log']) t
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
                     AND p.tablename = x.t AND p.permissive='PERMISSIVE')
     OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
                     AND p.tablename = x.t AND p.policyname='tenant_isolation');
  IF v_kurang IS NOT NULL THEN
    RAISE EXCEPTION '138: tabel RAP tanpa policy lengkap: %', v_kurang;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'cecep:rap:manage') THEN
    RAISE EXCEPTION '138: permission cecep:rap:manage gagal dibuat.';
  END IF;

  RAISE NOTICE '138: RAP/Pagu siap — 4 tabel, guard lock, RLS dua axis.';
END $$;
