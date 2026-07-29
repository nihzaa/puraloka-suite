-- ============================================================
-- 130 — T5a-0: POLICY PERMISSIVE DASAR untuk 8 tabel ber-nol-policy
--
-- ⚠️ PRASYARAT MUTLAK sebelum policy tenant (T5a). Bukan kerapian.
--
-- KENAPA (temuan T1-F3, dibuktikan EMPIRIS — bukan dari dokumentasi):
--   Rencana T5a adalah menambah satu policy `AS RESTRICTIVE` per tabel dan
--   mengandalkan policy PERMISSIVE existing untuk axis role. Postgres meng-AND
--   restrictive dengan hasil OR SELURUH permissive. Kalau permissive-nya NOL,
--   hasil OR = FALSE, dan `FALSE AND apa pun` = FALSE.
--
--   Tabel probe + role `authenticated`:
--     RLS on, nol policy                    → 0 baris
--     + AS RESTRICTIVE ... USING (true)     → 0 baris  ← restrictive tak pernah membuka
--     + PERMISSIVE ... USING (true)         → 2 baris  ← baru terbuka
--
--   Delapan tabel ini RLS-nya SUDAH enabled tapi tak punya satu pun policy.
--   Hari ini tak terasa karena API pakai service_role (bypass total); ia baru
--   meledak persis di T5c — tahap yang paling tidak boleh meledak.
--
-- ADR-004 Mandatory Rule #2: policy MUST memanggil `has_permission()`,
-- MUST NOT memakai literal nama role. Semua policy di bawah patuh.
--
-- ADR-005: cek ownership lintas tabel MUST lewat helper SECURITY DEFINER,
-- MUST NOT subquery langsung ke tabel ber-RLS lain (itu penyebab rekursi 049).
-- Karena itu semua turunan project memakai `project_company_id()` (migrasi 127)
-- lewat helper `t5_project_terlihat()` di bawah — bukan `IN (SELECT ...)`.
--
-- CATATAN LINGKUP: policy ini axis ROLE/permission saja. Axis COMPANY
-- ditambahkan T5a sebagai policy RESTRICTIVE terpisah, sehingga keduanya
-- di-AND. Memisahkan dua axis membuat masing-masing bisa di-rollback sendiri.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: apakah project ini boleh dilihat request berjalan?
--
-- SECURITY DEFINER (ADR-005 §41) supaya tidak rekursi lewat RLS `projects`.
-- STABLE + fail-closed: NULL/tak ketemu → false.
--
-- Sengaja BELUM memeriksa company di sini — axis itu dipegang policy
-- RESTRICTIVE T5a. Fungsi ini hanya menjawab "project-nya ada dan tak dihapus".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION t5_project_terlihat(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
     WHERE p.id = p_project_id AND COALESCE(p.is_deleted, false) = false
  );
$$;

COMMENT ON FUNCTION t5_project_terlihat(UUID) IS
  'T5a-0: helper SECURITY DEFINER untuk policy tabel turunan project. Sengaja '
  'TIDAK memeriksa company — axis itu dipegang policy RESTRICTIVE T5a supaya '
  'kedua axis bisa di-rollback terpisah (ADR-011 §7).';

-- ------------------------------------------------------------
-- 1. rab_items · rab_schedule · rab_absorption_log  (turunan project langsung)
--    RAB tidak punya permission sendiri — ia bagian dari proyek, jadi
--    memakai projects:view / projects:edit (diverifikasi ada di `permissions`).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS rab_items_select ON rab_items;
CREATE POLICY rab_items_select ON rab_items FOR SELECT
  USING (has_permission('projects:view') AND t5_project_terlihat(project_id));

DROP POLICY IF EXISTS rab_items_write ON rab_items;
CREATE POLICY rab_items_write ON rab_items FOR ALL
  USING (has_permission('projects:edit') AND t5_project_terlihat(project_id))
  WITH CHECK (has_permission('projects:edit') AND t5_project_terlihat(project_id));

DROP POLICY IF EXISTS rab_schedule_select ON rab_schedule;
CREATE POLICY rab_schedule_select ON rab_schedule FOR SELECT
  USING (has_permission('projects:view') AND t5_project_terlihat(project_id));

DROP POLICY IF EXISTS rab_schedule_write ON rab_schedule;
CREATE POLICY rab_schedule_write ON rab_schedule FOR ALL
  USING (has_permission('projects:edit') AND t5_project_terlihat(project_id))
  WITH CHECK (has_permission('projects:edit') AND t5_project_terlihat(project_id));

DROP POLICY IF EXISTS rab_absorption_log_select ON rab_absorption_log;
CREATE POLICY rab_absorption_log_select ON rab_absorption_log FOR SELECT
  USING (has_permission('projects:view') AND t5_project_terlihat(project_id));

DROP POLICY IF EXISTS rab_absorption_log_write ON rab_absorption_log;
CREATE POLICY rab_absorption_log_write ON rab_absorption_log FOR ALL
  USING (has_permission('projects:edit') AND t5_project_terlihat(project_id))
  WITH CHECK (has_permission('projects:edit') AND t5_project_terlihat(project_id));

-- ------------------------------------------------------------
-- 2. change_orders (turunan project langsung)
--    Baca ikut projects:view; tulis ikut projects:edit; APPROVE punya
--    permission sendiri (`change_order:approve`) — tapi approve adalah UPDATE,
--    jadi ia tercakup policy write + gerbang aplikasi. Policy DB tak perlu
--    membedakannya: memisahkan di sini justru menduplikasi aturan bisnis di
--    dua tempat (ADR-004 Rule #6).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS change_orders_select ON change_orders;
CREATE POLICY change_orders_select ON change_orders FOR SELECT
  USING (has_permission('projects:view') AND t5_project_terlihat(project_id));

DROP POLICY IF EXISTS change_orders_write ON change_orders;
CREATE POLICY change_orders_write ON change_orders FOR ALL
  USING (has_permission('projects:edit') AND t5_project_terlihat(project_id))
  WITH CHECK (has_permission('projects:edit') AND t5_project_terlihat(project_id));

-- ------------------------------------------------------------
-- 3. change_order_items (turunan change_orders — hop 2)
--    Helper terpisah supaya tak subquery langsung ke tabel ber-RLS.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION t5_co_terlihat(p_co_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM change_orders co
     JOIN projects p ON p.id = co.project_id
    WHERE co.id = p_co_id AND COALESCE(p.is_deleted, false) = false
  );
$$;

DROP POLICY IF EXISTS change_order_items_select ON change_order_items;
CREATE POLICY change_order_items_select ON change_order_items FOR SELECT
  USING (has_permission('projects:view') AND t5_co_terlihat(change_order_id));

DROP POLICY IF EXISTS change_order_items_write ON change_order_items;
CREATE POLICY change_order_items_write ON change_order_items FOR ALL
  USING (has_permission('projects:edit') AND t5_co_terlihat(change_order_id))
  WITH CHECK (has_permission('projects:edit') AND t5_co_terlihat(change_order_id));

-- ------------------------------------------------------------
-- 4. document_access_logs (turunan documents — hop 2)
--    Log akses: BACA butuh documents:manage (ia jejak audit, bukan data biasa).
--    TULIS sengaja longgar — setiap pembaca dokumen wajib bisa mencatat
--    aksesnya sendiri, kalau tidak jejak auditnya bolong justru untuk user
--    biasa. Ini keputusan sadar, bukan kelalaian.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION t5_dokumen_terlihat(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM documents d
     JOIN projects p ON p.id = d.project_id
    WHERE d.id = p_document_id AND COALESCE(p.is_deleted, false) = false
  );
$$;

DROP POLICY IF EXISTS document_access_logs_select ON document_access_logs;
CREATE POLICY document_access_logs_select ON document_access_logs FOR SELECT
  USING (has_permission('documents:manage') AND t5_dokumen_terlihat(document_id));

DROP POLICY IF EXISTS document_access_logs_insert ON document_access_logs;
CREATE POLICY document_access_logs_insert ON document_access_logs FOR INSERT
  WITH CHECK (t5_dokumen_terlihat(document_id) AND user_id = auth_user_id());

-- ------------------------------------------------------------
-- 5. work_scope_item_specs (turunan work_scope_items → work_scopes — hop 3)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION t5_scope_item_terlihat(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM work_scope_items wsi
     JOIN work_scopes ws          ON ws.id  = wsi.work_scope_id
     JOIN mandor_assignments ma   ON ma.id  = ws.assignment_id
     JOIN projects p              ON p.id   = ma.project_id
    WHERE wsi.id = p_item_id AND COALESCE(p.is_deleted, false) = false
  );
$$;

DROP POLICY IF EXISTS work_scope_item_specs_select ON work_scope_item_specs;
CREATE POLICY work_scope_item_specs_select ON work_scope_item_specs FOR SELECT
  USING (has_permission('projects:view') AND t5_scope_item_terlihat(item_id));

DROP POLICY IF EXISTS work_scope_item_specs_write ON work_scope_item_specs;
CREATE POLICY work_scope_item_specs_write ON work_scope_item_specs FOR ALL
  USING (has_permission('mandor:scope:item') AND t5_scope_item_terlihat(item_id))
  WITH CHECK (has_permission('mandor:scope:item') AND t5_scope_item_terlihat(item_id));

-- ------------------------------------------------------------
-- 6. company_profile — DEPRECATED (digantikan `companies`, T4i).
--    Nol pemakaian tersisa di kode produksi (diverifikasi 2026-07-29).
--    Diberi policy baca sempit supaya tidak jadi tabel-mati yang membingungkan
--    saat RLS ditegakkan; TIDAK diberi policy tulis — kalau ada kode yang masih
--    menulis ke sini, ia HARUS gagal keras, bukan diam-diam menulis ke tabel
--    yang sudah tak dipakai.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS company_profile_select ON company_profile;
CREATE POLICY company_profile_select ON company_profile FOR SELECT
  USING (has_permission('settings:manage'));

-- ------------------------------------------------------------
-- 7. Verifikasi: nol tabel RLS-enabled yang masih tanpa policy.
-- ------------------------------------------------------------
DO $$
DECLARE v_sisa TEXT;
BEGIN
  SELECT string_agg(ct.relname, ', ' ORDER BY ct.relname) INTO v_sisa
  FROM pg_class ct JOIN pg_namespace n ON n.oid = ct.relnamespace
  WHERE n.nspname = 'public' AND ct.relkind = 'r' AND ct.relrowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = ct.relname);

  IF v_sisa IS NOT NULL THEN
    RAISE EXCEPTION
      '130: masih ada tabel RLS-enabled TANPA policy: %. Menambah policy '
      'RESTRICTIVE (T5a) di atasnya akan membuat tabel-tabel itu TAK TERBACA '
      'sama sekali (T1-F3).', v_sisa;
  END IF;
  RAISE NOTICE '130: seluruh tabel RLS-enabled kini punya policy permissive dasar.';
END $$;
