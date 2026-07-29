-- ============================================================
-- 131 — T5a: POLICY RESTRICTIVE dual-axis (axis COMPANY)
--
-- STRATEGI: KOMPOSISI, bukan menyunting 218 policy existing (ADR-011 §7).
-- Postgres membedakan PERMISSIVE (di-OR) dan RESTRICTIVE (di-AND). Seluruh
-- policy existing bersifat permissive dan memegang axis ROLE. Satu policy
-- restrictive per tabel di-AND dengan hasil OR seluruhnya, sehingga axis
-- COMPANY ditambahkan TANPA menyentuh satu pun policy lama.
--
-- Rollback granular & instan: DROP POLICY tenant_isolation ON <tabel>.
--
-- PRASYARAT (sudah dipenuhi migration 130): tak boleh ada tabel RLS-enabled
-- tanpa policy permissive. Restrictive di-AND dgn OR-himpunan-kosong = FALSE,
-- artinya tabelnya mati total (T1-F3, terbukti empiris).
--
-- CAKUPAN: 79 tabel.
--   ANCHOR+B (19)  company_id NOT NULL → harus sama dgn company aktif
--   AB (12)       NULL = milik BERSAMA (2.620 AHSP nasional) → tetap terlihat
--   C (48)       mewarisi lewat rantai FK → helper SECURITY DEFINER
-- Kategori A (katalog/kosakata) & D (identitas/platform) SENGAJA tanpa policy
-- tenant — lihat audit T1 §5.
--
-- DI-GENERATE dari `tenant-map.generated.ts` (yang ia sendiri di-generate dari
-- skema), BUKAN diketik tangan. 79 policy + 16 helper yang diketik manual pasti
-- menyimpan salah-ketik kolom; jalur FK tiap helper diambil dari komentar peta.
--
-- POLA PERFORMA (ADR-011 §7): `(SELECT auth_company_id())` dibungkus subquery
-- supaya jadi InitPlan — dievaluasi SEKALI per statement, bukan per baris.
--
-- ⚠️ BELUM AKTIF SECARA EFEKTIF: API masih memakai service_role yang mem-bypass
-- RLS. Policy ini baru benar-benar dievaluasi setelah T5c. Itu disengaja —
-- memasang policy lebih dulu membuat T5c bisa diuji tanpa perubahan skema lagi.
--
-- ------------------------------------------------------------
-- TEMUAN DRY-RUN (dicatat, bukan disembunyikan)
--
-- Dry-run pertama menunjukkan `estimate_items` jadi 0/1206 terlihat. Ditelusuri
-- sampai akar, BUKAN di-workaround: seluruh 1.206 baris itu yatim — rantainya
-- estimate_items → estimate_versions → scenarios → projects putus di hop
-- terakhir, karena 104 `scenarios` (semua bernama '[TEST] Skenario') menunjuk
-- project yang sudah tidak ada. Sama untuk 413 `lessons_learned_records`
-- ('[TEST] Lesson'). Postgres sendiri menolak mem-VALIDATE ulang FK-nya.
--
-- Asalnya sudah terdokumentasi: sebelum CI dipisah ke proyek Supabase sendiri,
-- test handler CECEP menulis ke dev `public` (lihat cleanup-cecep-residue.mjs).
-- Project induknya ikut terhapus, anaknya selamat karena trigger no-delete
-- memblokir cascade — jadi tertinggal sebagai yatim.
--
-- KESIMPULAN: policy ini BENAR. Ia menyembunyikan baris yang pemiliknya tidak
-- ada — itu memang yang seharusnya terjadi. Yang perlu dibereskan adalah residu
-- dev-nya (di luar lingkup migrasi; skrip cleanup-nya sudah ada). Tabel yang
-- memuat data nyata terbukti 100% sehat: rab_items 373/373, invoices 26/26,
-- milestones 39/39, change_orders 2/2.
--
-- Kelas kegagalan terkait yang SUDAH tertutup secara struktural: kalau kolom
-- penghubung kategori C boleh NULL, `helper(NULL) = auth_company_id()` bernilai
-- NULL (bukan TRUE) dan barisnya hilang dari SEMUA tenant tanpa suara. Diperiksa
-- ke seluruh 48 tabel C: tak satu pun kolom penghubungnya nullable — generator
-- peta memang hanya menerima jalur yang seluruhnya NOT NULL.
-- ============================================================

-- ------------------------------------------------------------
-- Helper kategori C: dari id entitas anak → company pemiliknya.
-- SECURITY DEFINER (ADR-005 §41): WAJIB, karena mereka membaca tabel ber-RLS.
-- Subquery langsung dari dalam policy akan rekursi — itu bug 049 yang sudah
-- pernah terjadi di proyek ini.
-- ------------------------------------------------------------
-- borongan_settlements.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
-- dipakai 4 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_work_scope(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM work_scopes t1
    JOIN mandor_assignments t2 ON t2.id = t1.assignment_id
    JOIN projects p ON p.id = t2.project_id
   WHERE t1.id = p_id;
$$;

-- change_order_items.change_order_id → change_orders.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_change_order(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM change_orders t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- cost_code_category_map.category_id → project_expense_categories.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_category(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM project_expense_categories t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- document_access_logs.document_id → documents.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_document(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM documents t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- estimate_items.estimate_version_id → estimate_versions.scenario_id → scenarios.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_estimate_version(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM estimate_versions t1
    JOIN scenarios t2 ON t2.id = t1.scenario_id
    JOIN projects p ON p.id = t2.project_id
   WHERE t1.id = p_id;
$$;

-- estimate_versions.scenario_id → scenarios.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_scenario(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM scenarios t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- expense_items.expense_report_id → expense_reports.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_expense_report(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM expense_reports t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- goods_receipt_items.gr_id → goods_receipts.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_gr(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM goods_receipts t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- invoice_line_items.invoice_id → invoices.project_id
-- dipakai 4 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_invoice(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM invoices t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- lesson_propagation_proposals.lesson_id → lessons_learned_records.project_id
-- dipakai 2 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_lesson(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM lessons_learned_records t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- material_request_items.mr_id → material_requests.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_mr(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM material_requests t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- purchase_order_items.po_id → purchase_orders.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_po(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM purchase_orders t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- rebar_takeoff.estimate_item_id → estimate_items.estimate_version_id → estimate_versions.scenario_id → scenarios.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_estimate_item(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM estimate_items t1
    JOIN estimate_versions t2 ON t2.id = t1.estimate_version_id
    JOIN scenarios t3 ON t3.id = t2.scenario_id
    JOIN projects p ON p.id = t3.project_id
   WHERE t1.id = p_id;
$$;

-- wage_deductions.report_id → weekly_wage_reports.assignment_id → mandor_assignments.project_id
-- dipakai 2 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_report(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM weekly_wage_reports t1
    JOIN mandor_assignments t2 ON t2.id = t1.assignment_id
    JOIN projects p ON p.id = t2.project_id
   WHERE t1.id = p_id;
$$;

-- weekly_wage_reports.assignment_id → mandor_assignments.project_id
-- dipakai 2 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_assignment(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM mandor_assignments t1
    JOIN projects p ON p.id = t1.project_id
   WHERE t1.id = p_id;
$$;

-- work_scope_item_specs.item_id → work_scope_items.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
-- dipakai 1 tabel
CREATE OR REPLACE FUNCTION t5_company_dari_item(p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id
    FROM work_scope_items t1
    JOIN work_scopes t2 ON t2.id = t1.work_scope_id
    JOIN mandor_assignments t3 ON t3.id = t2.assignment_id
    JOIN projects p ON p.id = t3.project_id
   WHERE t1.id = p_id;
$$;

-- ------------------------------------------------------------
-- ANCHOR + B — company_id NOT NULL
-- ------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON projects;
CREATE POLICY tenant_isolation ON projects AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON approval_chains;
CREATE POLICY tenant_isolation ON approval_chains AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON approval_progress;
CREATE POLICY tenant_isolation ON approval_progress AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON approval_steps;
CREATE POLICY tenant_isolation ON approval_steps AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON cash_accounts;
CREATE POLICY tenant_isolation ON cash_accounts AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON cash_transfers;
CREATE POLICY tenant_isolation ON cash_transfers AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON clients;
CREATE POLICY tenant_isolation ON clients AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON company_settings;
CREATE POLICY tenant_isolation ON company_settings AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON financial_config;
CREATE POLICY tenant_isolation ON financial_config AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON kasbons;
CREATE POLICY tenant_isolation ON kasbons AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON material_pack;
CREATE POLICY tenant_isolation ON material_pack AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON notification_rule_targets;
CREATE POLICY tenant_isolation ON notification_rule_targets AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON notification_rules;
CREATE POLICY tenant_isolation ON notification_rules AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON notifications;
CREATE POLICY tenant_isolation ON notifications AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON supplier_invoices;
CREATE POLICY tenant_isolation ON supplier_invoices AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON supplier_payment_allocations;
CREATE POLICY tenant_isolation ON supplier_payment_allocations AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON supplier_payments;
CREATE POLICY tenant_isolation ON supplier_payments AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON suppliers;
CREATE POLICY tenant_isolation ON suppliers AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON workers;
CREATE POLICY tenant_isolation ON workers AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id())) WITH CHECK (company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- AB — NULL berarti milik BERSAMA (katalog nasional tetap terlihat semua tenant)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON assemblies;
CREATE POLICY tenant_isolation ON assemblies AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON assembly_components;
CREATE POLICY tenant_isolation ON assembly_components AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON cbs_nodes;
CREATE POLICY tenant_isolation ON cbs_nodes AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON cbs_templates;
CREATE POLICY tenant_isolation ON cbs_templates AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON cost_codes;
CREATE POLICY tenant_isolation ON cost_codes AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON expense_category_templates;
CREATE POLICY tenant_isolation ON expense_category_templates AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON feature_flags;
CREATE POLICY tenant_isolation ON feature_flags AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON materials;
CREATE POLICY tenant_isolation ON materials AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON price_book_entries;
CREATE POLICY tenant_isolation ON price_book_entries AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON productivity_records;
CREATE POLICY tenant_isolation ON productivity_records AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON role_permissions;
CREATE POLICY tenant_isolation ON role_permissions AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON roles;
CREATE POLICY tenant_isolation ON roles AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id())) WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- C — mewarisi lewat rantai FK
-- ------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON borongan_settlements;
CREATE POLICY tenant_isolation ON borongan_settlements AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON change_order_items;
CREATE POLICY tenant_isolation ON change_order_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_change_order(change_order_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_change_order(change_order_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON change_orders;
CREATE POLICY tenant_isolation ON change_orders AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON cost_code_category_map;
CREATE POLICY tenant_isolation ON cost_code_category_map AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_category(category_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_category(category_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON daily_wage_logs;
CREATE POLICY tenant_isolation ON daily_wage_logs AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON document_access_logs;
CREATE POLICY tenant_isolation ON document_access_logs AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_document(document_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_document(document_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON documents;
CREATE POLICY tenant_isolation ON documents AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON estimate_items;
CREATE POLICY tenant_isolation ON estimate_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_estimate_version(estimate_version_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_estimate_version(estimate_version_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON estimate_versions;
CREATE POLICY tenant_isolation ON estimate_versions AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_scenario(scenario_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_scenario(scenario_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON expense_items;
CREATE POLICY tenant_isolation ON expense_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_expense_report(expense_report_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_expense_report(expense_report_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON expense_reports;
CREATE POLICY tenant_isolation ON expense_reports AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON goods_receipt_items;
CREATE POLICY tenant_isolation ON goods_receipt_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_gr(gr_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_gr(gr_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON goods_receipts;
CREATE POLICY tenant_isolation ON goods_receipts AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON invoice_line_items;
CREATE POLICY tenant_isolation ON invoice_line_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON invoice_penalties;
CREATE POLICY tenant_isolation ON invoice_penalties AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON invoices;
CREATE POLICY tenant_isolation ON invoices AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON lesson_propagation_proposals;
CREATE POLICY tenant_isolation ON lesson_propagation_proposals AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_lesson(lesson_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_lesson(lesson_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON lessons_learned_records;
CREATE POLICY tenant_isolation ON lessons_learned_records AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON mandor_assignments;
CREATE POLICY tenant_isolation ON mandor_assignments AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON material_request_items;
CREATE POLICY tenant_isolation ON material_request_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_mr(mr_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_mr(mr_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON material_requests;
CREATE POLICY tenant_isolation ON material_requests AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON milestones;
CREATE POLICY tenant_isolation ON milestones AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON progress_logs;
CREATE POLICY tenant_isolation ON progress_logs AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON progress_payments;
CREATE POLICY tenant_isolation ON progress_payments AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON project_expense_categories;
CREATE POLICY tenant_isolation ON project_expense_categories AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON project_expenses;
CREATE POLICY tenant_isolation ON project_expenses AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON project_photos;
CREATE POLICY tenant_isolation ON project_photos AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON project_stocks;
CREATE POLICY tenant_isolation ON project_stocks AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON purchase_order_items;
CREATE POLICY tenant_isolation ON purchase_order_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_po(po_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_po(po_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON purchase_orders;
CREATE POLICY tenant_isolation ON purchase_orders AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON rab_absorption_log;
CREATE POLICY tenant_isolation ON rab_absorption_log AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON rab_items;
CREATE POLICY tenant_isolation ON rab_items AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON rab_schedule;
CREATE POLICY tenant_isolation ON rab_schedule AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON rebar_takeoff;
CREATE POLICY tenant_isolation ON rebar_takeoff AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_estimate_item(estimate_item_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_estimate_item(estimate_item_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON root_cause_analyses;
CREATE POLICY tenant_isolation ON root_cause_analyses AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_lesson(lesson_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_lesson(lesson_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON scenarios;
CREATE POLICY tenant_isolation ON scenarios AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON stock_movements;
CREATE POLICY tenant_isolation ON stock_movements AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON tax_records;
CREATE POLICY tenant_isolation ON tax_records AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_invoice(invoice_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON termin_schedules;
CREATE POLICY tenant_isolation ON termin_schedules AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON wage_deductions;
CREATE POLICY tenant_isolation ON wage_deductions AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_report(report_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_report(report_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON wage_items;
CREATE POLICY tenant_isolation ON wage_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_report(report_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_report(report_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON wbs_nodes;
CREATE POLICY tenant_isolation ON wbs_nodes AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON weekly_wage_reports;
CREATE POLICY tenant_isolation ON weekly_wage_reports AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_assignment(assignment_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_assignment(assignment_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON work_scope_item_specs;
CREATE POLICY tenant_isolation ON work_scope_item_specs AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_item(item_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_item(item_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON work_scope_items;
CREATE POLICY tenant_isolation ON work_scope_items AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_work_scope(work_scope_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON work_scopes;
CREATE POLICY tenant_isolation ON work_scopes AS RESTRICTIVE FOR ALL
  USING (t5_company_dari_assignment(assignment_id) = (SELECT auth_company_id())) WITH CHECK (t5_company_dari_assignment(assignment_id) = (SELECT auth_company_id()));
DROP POLICY IF EXISTS tenant_isolation ON worker_kasbons;
CREATE POLICY tenant_isolation ON worker_kasbons AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id())) WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi: setiap tabel target benar-benar punya policy restriktif.
-- ------------------------------------------------------------
DO $$
DECLARE v_kurang TEXT;
BEGIN
  SELECT string_agg(t, ', ' ORDER BY t) INTO v_kurang FROM (
    SELECT unnest(ARRAY['projects','approval_chains','approval_progress','approval_steps','cash_accounts','cash_transfers','clients','company_settings','financial_config','kasbons','material_pack','notification_rule_targets','notification_rules','notifications','supplier_invoices','supplier_payment_allocations','supplier_payments','suppliers','workers','assemblies','assembly_components','cbs_nodes','cbs_templates','cost_codes','expense_category_templates','feature_flags','materials','price_book_entries','productivity_records','role_permissions','roles','borongan_settlements','change_order_items','change_orders','cost_code_category_map','daily_wage_logs','document_access_logs','documents','estimate_items','estimate_versions','expense_items','expense_reports','goods_receipt_items','goods_receipts','invoice_line_items','invoice_penalties','invoices','lesson_propagation_proposals','lessons_learned_records','mandor_assignments','material_request_items','material_requests','milestones','payments','progress_logs','progress_payments','project_expense_categories','project_expenses','project_photos','project_stocks','purchase_order_items','purchase_orders','rab_absorption_log','rab_items','rab_schedule','rebar_takeoff','root_cause_analyses','scenarios','stock_movements','tax_records','termin_schedules','wage_deductions','wage_items','wbs_nodes','weekly_wage_reports','work_scope_item_specs','work_scope_items','work_scopes','worker_kasbons']) AS t
  ) x WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename=x.t AND p.policyname='tenant_isolation');
  IF v_kurang IS NOT NULL THEN
    RAISE EXCEPTION '131: tabel tanpa policy tenant_isolation: %', v_kurang;
  END IF;
  RAISE NOTICE '131: 79 policy tenant terpasang.';
END $$;
