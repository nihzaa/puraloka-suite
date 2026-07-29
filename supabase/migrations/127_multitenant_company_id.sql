-- ============================================================
-- 127 — MULTI-TENANT T3: kolom company_id + backfill + kunci
--
-- ⚠️ RED-LINE. Dijalankan atas ACK TERTULIS founder 2026-07-29:
--    Q1 = PRIVAT   → `suppliers` kategori B (company_id NOT NULL)
--    Q2 = SEKARANG → SET NOT NULL dijalankan di sini, tidak ditunda ke T4
--    Dokumen: ADR-011-T3-AUDIT-PRA-EKSEKUSI.md §9
--
-- Klasifikasi sumber: ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md
--   20 tabel → company_id NOT NULL  (1 anchor + 18 B + audit_logs)
--   12 tabel → company_id NULLABLE  (AB: NULL = milik bersama semua tenant)
--   48 tabel → TANPA kolom (mewarisi lewat rantai FK NOT NULL ke projects)
--   12 tabel → TANPA kolom (katalog/kosakata bersama)
--    2 tabel → khusus (users lewat company_members; company_profile dibuang T4)
--
-- Yang TIDAK dilakukan: nol DELETE, nol DROP, nol perubahan tipe, nol UPDATE
-- pada kolom selain company_id yang dibuat migrasi ini sendiri. Karena itu
-- rollback-nya bersih (buang kolomnya = kembali ke keadaan pasca-126).
-- ============================================================

-- ------------------------------------------------------------
-- T3a — ADD COLUMN (aman: kolom kosong, nol baris berubah)
-- ------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE kasbons ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE cash_transfers ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE supplier_payment_allocations ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE financial_config ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE approval_chains ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE approval_progress ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE notification_rule_targets ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE material_pack ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE assembly_components ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE cost_codes ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE price_book_entries ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE cbs_templates ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE cbs_nodes ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE expense_category_templates ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE productivity_records ADD COLUMN IF NOT EXISTS company_id UUID;
-- feature_flags.company_id sudah ada sejak 077 (+ FK dari 126) — dilewati
ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS company_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='projects_company_id_fkey' AND conrelid='projects'::regclass) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='cash_accounts_company_id_fkey' AND conrelid='cash_accounts'::regclass) THEN
    ALTER TABLE cash_accounts ADD CONSTRAINT cash_accounts_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='kasbons_company_id_fkey' AND conrelid='kasbons'::regclass) THEN
    ALTER TABLE kasbons ADD CONSTRAINT kasbons_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='notifications_company_id_fkey' AND conrelid='notifications'::regclass) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='supplier_invoices_company_id_fkey' AND conrelid='supplier_invoices'::regclass) THEN
    ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='cash_transfers_company_id_fkey' AND conrelid='cash_transfers'::regclass) THEN
    ALTER TABLE cash_transfers ADD CONSTRAINT cash_transfers_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='supplier_payments_company_id_fkey' AND conrelid='supplier_payments'::regclass) THEN
    ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='supplier_payment_allocations_company_id_fkey' AND conrelid='supplier_payment_allocations'::regclass) THEN
    ALTER TABLE supplier_payment_allocations ADD CONSTRAINT supplier_payment_allocations_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='clients_company_id_fkey' AND conrelid='clients'::regclass) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='workers_company_id_fkey' AND conrelid='workers'::regclass) THEN
    ALTER TABLE workers ADD CONSTRAINT workers_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='company_settings_company_id_fkey' AND conrelid='company_settings'::regclass) THEN
    ALTER TABLE company_settings ADD CONSTRAINT company_settings_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='financial_config_company_id_fkey' AND conrelid='financial_config'::regclass) THEN
    ALTER TABLE financial_config ADD CONSTRAINT financial_config_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='approval_chains_company_id_fkey' AND conrelid='approval_chains'::regclass) THEN
    ALTER TABLE approval_chains ADD CONSTRAINT approval_chains_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='approval_steps_company_id_fkey' AND conrelid='approval_steps'::regclass) THEN
    ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='approval_progress_company_id_fkey' AND conrelid='approval_progress'::regclass) THEN
    ALTER TABLE approval_progress ADD CONSTRAINT approval_progress_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='notification_rules_company_id_fkey' AND conrelid='notification_rules'::regclass) THEN
    ALTER TABLE notification_rules ADD CONSTRAINT notification_rules_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='notification_rule_targets_company_id_fkey' AND conrelid='notification_rule_targets'::regclass) THEN
    ALTER TABLE notification_rule_targets ADD CONSTRAINT notification_rule_targets_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='material_pack_company_id_fkey' AND conrelid='material_pack'::regclass) THEN
    ALTER TABLE material_pack ADD CONSTRAINT material_pack_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='suppliers_company_id_fkey' AND conrelid='suppliers'::regclass) THEN
    ALTER TABLE suppliers ADD CONSTRAINT suppliers_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='audit_logs_company_id_fkey' AND conrelid='audit_logs'::regclass) THEN
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='assemblies_company_id_fkey' AND conrelid='assemblies'::regclass) THEN
    ALTER TABLE assemblies ADD CONSTRAINT assemblies_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='assembly_components_company_id_fkey' AND conrelid='assembly_components'::regclass) THEN
    ALTER TABLE assembly_components ADD CONSTRAINT assembly_components_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='cost_codes_company_id_fkey' AND conrelid='cost_codes'::regclass) THEN
    ALTER TABLE cost_codes ADD CONSTRAINT cost_codes_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='price_book_entries_company_id_fkey' AND conrelid='price_book_entries'::regclass) THEN
    ALTER TABLE price_book_entries ADD CONSTRAINT price_book_entries_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='materials_company_id_fkey' AND conrelid='materials'::regclass) THEN
    ALTER TABLE materials ADD CONSTRAINT materials_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='cbs_templates_company_id_fkey' AND conrelid='cbs_templates'::regclass) THEN
    ALTER TABLE cbs_templates ADD CONSTRAINT cbs_templates_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='cbs_nodes_company_id_fkey' AND conrelid='cbs_nodes'::regclass) THEN
    ALTER TABLE cbs_nodes ADD CONSTRAINT cbs_nodes_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='expense_category_templates_company_id_fkey' AND conrelid='expense_category_templates'::regclass) THEN
    ALTER TABLE expense_category_templates ADD CONSTRAINT expense_category_templates_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='productivity_records_company_id_fkey' AND conrelid='productivity_records'::regclass) THEN
    ALTER TABLE productivity_records ADD CONSTRAINT productivity_records_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='roles_company_id_fkey' AND conrelid='roles'::regclass) THEN
    ALTER TABLE roles ADD CONSTRAINT roles_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='role_permissions_company_id_fkey' AND conrelid='role_permissions'::regclass) THEN
    ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Guard komponen assembly (107) — DIPERBARUI atas keputusan founder 2026-07-29
--
-- ⚠️ MENYENTUH GERBANG IMMUTABILITY CECEP. Dilaporkan eksplisit ke founder,
--    bukan ditafsirkan sendiri. Keputusan: buka HANYA untuk kolom company_id.
--
-- Yang TIDAK berubah (nol pelonggaran): mengubah koefisien / resource_id /
-- sort_order pada assembly berstatus <> 'draft' tetap DITOLAK. Isi paket kerja
-- yang sudah aktif tetap beku — itu inti gerbangnya dan tetap berdiri.
--
-- Yang diizinkan: UPDATE yang HANYA menyentuh company_id. Alasannya, gerbang
-- 107 dibuat untuk melindungi ISI analisa; `company_id` adalah label KEPEMILIKAN
-- yang belum ada saat gerbang itu ditulis. Melabeli pemilik bukan mengubah
-- analisa. Pelonggaran ini permanen & tercatat di migrasi (bisa direview),
-- BUKAN trigger yang dimatikan diam-diam lalu dilupakan.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assembly_component_parent_draft()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
  v_aid    UUID;
BEGIN
  v_aid := COALESCE(NEW.assembly_id, OLD.assembly_id);
  SELECT status INTO v_status FROM assemblies WHERE id = v_aid;

  -- Bila parent-nya ikut terhapus (CASCADE), v_status NULL → izinkan.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    -- Pengecualian sempit: UPDATE yang hanya mengubah company_id.
    -- Seluruh kolom pembentuk ISI harus identik — kalau ada satu saja yang
    -- berbeda, ini bukan pelabelan melainkan edit, dan tetap ditolak.
    IF TG_OP = 'UPDATE'
       AND NEW.assembly_id IS NOT DISTINCT FROM OLD.assembly_id
       AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
       AND NEW.coefficient IS NOT DISTINCT FROM OLD.coefficient
       AND NEW.sort_order  IS NOT DISTINCT FROM OLD.sort_order
       AND NEW.company_id  IS DISTINCT FROM OLD.company_id
    THEN
      RETURN NEW;   -- pelabelan kepemilikan, bukan perubahan analisa
    END IF;

    RAISE EXCEPTION
      'Komponen Assembly hanya bisa diubah saat Assembly berstatus draft (kini %). '
      'Paket kerja yang sudah active beku — buat versi Assembly baru.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

-- ------------------------------------------------------------
-- T3b — BACKFILL (menetapkan kepemilikan)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company UUID;
  v_national INT;
BEGIN
  -- Fail-loud: backfill hanya sah saat sistem berisi TEPAT SATU tenant.
  -- Kalau sudah >1, "milik siapa" tidak dapat diturunkan secara mekanis dan
  -- menebak = mencampur data dua perusahaan. Lebih baik migrasi berhenti.
  IF (SELECT count(*) FROM companies) <> 1 THEN
    RAISE EXCEPTION
      '127 T3b menolak jalan: companies berisi % baris, bukan 1. Backfill '
      'otomatis hanya sah pada sistem satu-tenant.', (SELECT count(*) FROM companies);
  END IF;
  SELECT id INTO v_company FROM companies;

  -- (1) Kategori B + anchor + audit: seluruh baris milik tenant tunggal.
  UPDATE projects SET company_id = v_company WHERE company_id IS NULL;
  UPDATE cash_accounts SET company_id = v_company WHERE company_id IS NULL;
  UPDATE kasbons SET company_id = v_company WHERE company_id IS NULL;
  UPDATE notifications SET company_id = v_company WHERE company_id IS NULL;
  UPDATE supplier_invoices SET company_id = v_company WHERE company_id IS NULL;
  UPDATE cash_transfers SET company_id = v_company WHERE company_id IS NULL;
  UPDATE supplier_payments SET company_id = v_company WHERE company_id IS NULL;
  UPDATE supplier_payment_allocations SET company_id = v_company WHERE company_id IS NULL;
  UPDATE clients SET company_id = v_company WHERE company_id IS NULL;
  UPDATE workers SET company_id = v_company WHERE company_id IS NULL;
  UPDATE company_settings SET company_id = v_company WHERE company_id IS NULL;
  UPDATE financial_config SET company_id = v_company WHERE company_id IS NULL;
  UPDATE approval_chains SET company_id = v_company WHERE company_id IS NULL;
  UPDATE approval_steps SET company_id = v_company WHERE company_id IS NULL;
  UPDATE approval_progress SET company_id = v_company WHERE company_id IS NULL;
  UPDATE notification_rules SET company_id = v_company WHERE company_id IS NULL;
  UPDATE notification_rule_targets SET company_id = v_company WHERE company_id IS NULL;
  UPDATE material_pack SET company_id = v_company WHERE company_id IS NULL;
  UPDATE suppliers SET company_id = v_company WHERE company_id IS NULL;
  -- audit_logs dijaga trigger append-only (073): UPDATE/DELETE ditolak mentah.
  -- Founder MEMUTUSKAN 2026-07-29 membuka segel itu SATU KALI untuk backfill ini,
  -- setelah diberi tahu konsekuensinya (lihat ADR-011-T3-AUDIT-PRA-EKSEKUSI §9).
  -- Alasan memilih ini: semua audit log punya identitas perusahaan sejak awal →
  -- filter UI lurus tanpa pengecualian `OR IS NULL` yang bisa terlupa di satu
  -- layar dan menghilangkan 1.555 catatan lama dari pandangan.
  --
  -- Cakupan pembukaan dibuat SESEMPIT MUNGKIN — hanya 2 trigger itu, hanya
  -- selama UPDATE ini, dan langsung dipasang kembali. TIDAK memakai
  -- session_replication_role='replica' yang akan mematikan SELURUH trigger di
  -- SEMUA tabel (termasuk protect_created_at & trigger saldo kas).
  ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_update;
  UPDATE audit_logs SET company_id = v_company WHERE company_id IS NULL;
  ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_update;

  -- Segel WAJIB kembali terpasang. Kalau tidak, audit trail berhenti jadi
  -- append-only tanpa ada yang sadar — kegagalan paling senyap di migrasi ini.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='audit_logs'::regclass
      AND tgname='trg_audit_logs_no_update' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      '127: trigger append-only audit_logs GAGAL dipasang kembali. Migrasi '
      'dibatalkan — audit trail tidak boleh ditinggalkan dalam keadaan bisa diubah.';
  END IF;

  -- (2) AB — HANYA yang jelas milik tenant. Sisanya SENGAJA dibiarkan NULL
  --     (= milik bersama). Inilah yang menjaga katalog AHSP nasional tetap
  --     jadi aset produk, bukan aset satu pelanggan.
  UPDATE assemblies SET company_id = v_company
   WHERE source <> 'national' AND company_id IS NULL;

  -- Komponen WAJIB mengikuti induknya — tak boleh beda tenant dari analisanya.
  UPDATE assembly_components ac SET company_id = a.company_id
    FROM assemblies a
   WHERE a.id = ac.assembly_id
     AND ac.company_id IS DISTINCT FROM a.company_id;

  SELECT count(*) INTO v_national FROM assemblies
   WHERE source = 'national' AND company_id IS NOT NULL;
  IF v_national > 0 THEN
    RAISE EXCEPTION
      '127 T3b: % assembly source=national ikut ter-klaim tenant. Katalog '
      'nasional harus tetap milik bersama (company_id NULL).', v_national;
  END IF;
END $$;

-- ------------------------------------------------------------
-- T3c — KUNCI (Q2 = SEKARANG)
--   SET NOT NULL hanya untuk 20 tabel yang backfill-nya menyeluruh.
--   12 tabel AB tetap nullable BY DESIGN — NULL di sana bermakna
--   "milik bersama", bukan "belum diisi".
-- ------------------------------------------------------------
ALTER TABLE projects ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE cash_accounts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE kasbons ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supplier_invoices ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE cash_transfers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supplier_payments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supplier_payment_allocations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE workers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE company_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE financial_config ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE approval_chains ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE approval_steps ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE approval_progress ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE notification_rules ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE notification_rule_targets ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE material_pack ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN company_id SET NOT NULL;

-- Index: setiap query ber-tenant menyaring kolom ini, termasuk policy RLS T5.
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_accounts_company ON cash_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_kasbons_company ON kasbons(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_company ON supplier_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_company ON cash_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_company ON supplier_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_company ON supplier_payment_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company_id);
CREATE INDEX IF NOT EXISTS idx_company_settings_company ON company_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_financial_config_company ON financial_config(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_company ON approval_chains(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_company ON approval_steps(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_progress_company ON approval_progress(company_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_company ON notification_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_notification_rule_targets_company ON notification_rule_targets(company_id);
CREATE INDEX IF NOT EXISTS idx_material_pack_company ON material_pack(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_company ON assemblies(company_id);
CREATE INDEX IF NOT EXISTS idx_assembly_components_company ON assembly_components(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_company ON cost_codes(company_id);
CREATE INDEX IF NOT EXISTS idx_price_book_entries_company ON price_book_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_company ON materials(company_id);
CREATE INDEX IF NOT EXISTS idx_cbs_templates_company ON cbs_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_cbs_nodes_company ON cbs_nodes(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_category_templates_company ON expense_category_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_productivity_records_company ON productivity_records(company_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_company ON feature_flags(company_id);
CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_company ON role_permissions(company_id);

-- Penjaga katalog nasional. Tanpa CHECK ini, satu tenant bisa "mengklaim"
-- AHSP nasional lewat UPDATE biasa dan katalog itu hilang dari tenant lain.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname='assemblies_source_company_konsisten'
      AND conrelid='assemblies'::regclass) THEN
    ALTER TABLE assemblies ADD CONSTRAINT assemblies_source_company_konsisten CHECK (
      (source =  'national' AND company_id IS NULL) OR
      (source <> 'national' AND company_id IS NOT NULL));
  END IF;
END $$;

-- ------------------------------------------------------------
-- project_company_id() — ditunda dari T2 (126) karena butuh kolom di atas.
-- Dipakai policy RLS T5 untuk 48 tabel kategori C.
-- search_path sengaja tidak di-SET (pola helper existing) agar file yang sama
-- bisa dijalankan verbatim di schema test terisolasi — lihat ADR-011 §9.6.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION project_company_id(p_project_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id FROM projects p WHERE p.id = p_project_id;
$$;

COMMENT ON FUNCTION project_company_id(UUID) IS
  'Tenancy tabel kategori C (mewarisi lewat project). Dipakai policy RLS T5.';
