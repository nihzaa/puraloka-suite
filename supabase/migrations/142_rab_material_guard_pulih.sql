-- Migration 142 — PULIHKAN `project_rab_materials` (ROADMAP #11, Modul 9a).
--
-- ── Kenapa migrasi ini ada: 043 tercatat SUKSES tapi tabelnya tidak pernah ada
--
-- `supabase_migrations.schema_migrations` memuat versi '043' lengkap dengan 9
-- statement tersimpan — termasuk CREATE INDEX dan CREATE TRIGGER yang MERUJUK
-- `project_rab_materials`. Tapi `pg_class` (diverifikasi lewat koneksi baru,
-- protokol reference-supabase-pooler-ddl) tak punya satu pun dari:
--   • project_rab_materials
--   • po_delivery_log
--
-- Artinya migrasi terlihat berhasil sementara objeknya nihil — kondisi yang
-- membuat siapa pun membaca daftar migrasi menyimpulkan fitur ini sudah ada.
-- Nol endpoint pernah memakainya, jadi tak ada yang menabraknya sampai hari ini.
--
-- 043 TIDAK diedit: berkas migrasi yang sudah tercatat di riwayat tak boleh
-- berubah isinya — itu membuat riwayat berbohong pada lingkungan yang benar-benar
-- pernah menjalankannya. Perbaikan datang sebagai migrasi maju yang idempoten.
--
-- ── Kenapa tabel ini dibutuhkan sekarang
--
-- Modul 9a (ERP_MASTER_PLAN §9a) menolak submit MR yang melampaui volume RAB:
--     total_yang_sudah_di_MR + volume_MR_baru > volume_RAB  →  TOLAK
-- Override hanya admin, dengan alasan tertulis, tercatat di audit log.
-- Tanpa tabel ini, tak ada angka RAB yang bisa dijadikan batas.

-- ------------------------------------------------------------
-- 1. project_rab_materials — volume material per proyek menurut RAB
--
-- Kategori C (mewarisi tenancy lewat project_id), sama seperti seluruh tabel
-- turunan proyek. TIDAK diberi company_id sendiri: dua sumber kebenaran
-- kepemilikan pada baris yang sama adalah cara termudah membuat keduanya
-- berselisih tanpa ketahuan.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_rab_materials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id         UUID NOT NULL REFERENCES materials(id),

  -- Batas keras dari RAB. > 0: baris dengan kuota nol tak punya makna sebagai
  -- batas — kalau memang tak boleh dibeli, barisnya tidak dibuat.
  rab_quantity        DECIMAL(15,3) NOT NULL CHECK (rab_quantity > 0),
  rab_unit_cost       DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (rab_unit_cost >= 0),

  -- Running total. DIHITUNG ULANG dari material_request_items setiap kali
  -- kuota diperiksa — TIDAK dipercaya sebagai sumber kebenaran. Kolom cache yang
  -- dipercaya buta akan menyimpang diam-diam begitu ada satu jalur tulis yang
  -- lupa memperbaruinya, dan penyimpangan pada angka kuota berarti pembelian
  -- lolos melebihi RAB tanpa ada yang tahu.
  requested_quantity  DECIMAL(15,3) NOT NULL DEFAULT 0 CHECK (requested_quantity >= 0),
  received_quantity   DECIMAL(15,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),

  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Satu material = satu baris kuota per proyek. Tanpa ini, dua baris untuk
  -- material yang sama membuat "berapa kuotanya" tak punya jawaban tunggal.
  CONSTRAINT project_rab_materials_unik UNIQUE (project_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_prm_project  ON project_rab_materials(project_id);
CREATE INDEX IF NOT EXISTS idx_prm_material ON project_rab_materials(material_id);

-- ------------------------------------------------------------
-- 2. Jejak override — inti akuntabilitas Modul 9a
--
-- Rancangan menyebut "override hanya Admin dengan alasan tertulis → tercatat di
-- audit log". Audit log saja tidak cukup: ia bercampur seluruh kejadian sistem
-- dan tak bisa menjawab "material apa saja yang pernah dilampaui di proyek ini,
-- berapa besar, siapa yang mengizinkan". Tabel sendiri membuat pertanyaan itu
-- terjawab satu query — dan membuat pelampauan TERLIHAT, bukan terkubur.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mr_quota_override (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mr_id          UUID NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Alasan WAJIB dan tak boleh kosong. Override tanpa alasan adalah persis
  -- keadaan yang hard-guard ini ada untuk mencegah.
  reason         TEXT NOT NULL CHECK (length(btrim(reason)) >= 10),

  -- Potret pelanggaran saat override diberikan. Disimpan, bukan dihitung ulang:
  -- angkanya harus tetap terbaca apa adanya meski RAB direvisi kemudian.
  pelanggaran    JSONB NOT NULL,

  overridden_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqo_mr      ON mr_quota_override(mr_id);
CREATE INDEX IF NOT EXISTS idx_mqo_project ON mr_quota_override(project_id);

-- ------------------------------------------------------------
-- 3. Trigger updated_at + proteksi created_at
--
-- CREATE OR REPLACE: 043 mungkin sempat membuat fungsinya di lingkungan lain.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_prm_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  -- created_at tak boleh diubah lewat UPDATE — pola protect_created_at yang
  -- sudah dipakai 10 tabel kritis lain di repo ini.
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prm_updated_at ON project_rab_materials;
CREATE TRIGGER trg_prm_updated_at
  BEFORE UPDATE ON project_rab_materials
  FOR EACH ROW EXECUTE FUNCTION set_prm_updated_at();

-- ------------------------------------------------------------
-- 4. RLS — konsisten dengan seluruh tabel kategori C
--
-- API memakai service_role (bypass RLS); ini lapis pertahanan kedua untuk akses
-- non-service-role, sesuai ADR-005 & Sub-Fase 1A.
-- ------------------------------------------------------------
ALTER TABLE project_rab_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_quota_override     ENABLE ROW LEVEL SECURITY;

-- Permission-based (ADR-004: kode & policy membaca capability, bukan literal
-- role). Kuota RAB material adalah data procurement — memakai capability yang
-- sama dengan Material Request supaya siapa yang boleh melihat/mengubah kuota
-- tak berselisih dengan siapa yang boleh mengajukan MR.
DROP POLICY IF EXISTS prm_read ON project_rab_materials;
CREATE POLICY prm_read ON project_rab_materials FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
DROP POLICY IF EXISTS prm_write ON project_rab_materials;
CREATE POLICY prm_write ON project_rab_materials FOR ALL
  USING ((SELECT has_permission('procurement:mr:manage')))
  WITH CHECK ((SELECT has_permission('procurement:mr:manage')));
DROP POLICY IF EXISTS tenant_isolation ON project_rab_materials;
CREATE POLICY tenant_isolation ON project_rab_materials AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

-- Jejak override dibaca oleh siapa pun yang boleh melihat MR: pelampauan kuota
-- justru harus TERLIHAT, bukan disembunyikan dari mata yang lebih banyak.
DROP POLICY IF EXISTS mqo_read ON mr_quota_override;
CREATE POLICY mqo_read ON mr_quota_override FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
DROP POLICY IF EXISTS mqo_write ON mr_quota_override;
CREATE POLICY mqo_write ON mr_quota_override FOR ALL
  USING ((SELECT has_permission('procurement:mr:manage')))
  WITH CHECK ((SELECT has_permission('procurement:mr:manage')));
DROP POLICY IF EXISTS tenant_isolation ON mr_quota_override;
CREATE POLICY tenant_isolation ON mr_quota_override AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- 5. Capability override — SENGAJA lebih sempit dari `procurement:mr:manage`
--
-- ERP_MASTER_PLAN §9a: "Override hanya boleh oleh Admin dengan alasan tertulis."
--
-- `procurement:mr:manage` dipegang admin, direktur, pm, DAN mandor — yaitu
-- semua yang boleh MENGAJUKAN MR. Kalau override memakai capability yang sama,
-- pengaju bisa melampaui RAB atas izinnya sendiri dan hard-guard ini hanya jadi
-- tombol konfirmasi. Maka capability baru, di-seed HANYA ke admin & direktur.
--
-- Ini memperluas ke role baru? TIDAK — kemampuan ini belum pernah ada pada
-- siapa pun. Yang terjadi: pembatasan baru pada pm & mandor yang selama ini
-- tak punya batas sama sekali (karena guard-nya memang belum ada).
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES ('procurement:mr:override_quota', 'procurement', 'Override kuota RAB',
        'Menyetujui Material Request yang melampaui volume RAB, dengan alasan tertulis yang tercatat')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'procurement:mr:override_quota'
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Verifikasi — migrasi gagal keras kalau objeknya tidak benar-benar ada.
--
-- Justru inilah pelajaran dari 043: ia tercatat sukses tanpa pernah membuat
-- tabelnya. Blok ini memastikan kegagalan yang sama tak bisa terulang diam-diam.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.project_rab_materials') IS NULL THEN
    RAISE EXCEPTION '142 gagal: project_rab_materials tidak terbentuk';
  END IF;
  IF to_regclass('public.mr_quota_override') IS NULL THEN
    RAISE EXCEPTION '142 gagal: mr_quota_override tidak terbentuk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'procurement:mr:override_quota') THEN
    RAISE EXCEPTION '142 gagal: capability override_quota tidak ter-seed';
  END IF;
END $$;
