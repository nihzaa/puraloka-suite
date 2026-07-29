-- ============================================================
-- 132 — PERBAIKAN PERFORMA RLS: helper jadi InitPlan, bukan per-baris
--
-- ⚠️ PRASYARAT T5c. Tanpa ini, melepas service_role membuat sistem tak layak
-- pakai — bukan "agak lambat", tapi hitungan detik untuk satu query biasa.
--
-- TEMUAN (baseline EXPLAIN ANALYZE, service_role vs authenticated):
--   assembly_components   2 ms  →  3.524 ms   (×1.580)
--   assemblies            1 ms  →    598 ms   (×486)
--   rab_items             0,2ms →     82 ms   (×480)
--   kasbons               0,04ms→     19 ms   (×460)
--
-- AKAR MASALAH (dari rencana query, bukan tebakan):
--   Filter: (... AND (has_permission('cecep:assembly:manage') OR
--                     has_permission('cecep:assembly:view')))
--   Seq Scan ... rows=17853 ... actual time=0.968..3676
--
--   `has_permission()` memang STABLE, tapi Postgres tetap memanggilnya SEKALI
--   PER BARIS selama ia berdiri sebagai ekspresi biasa di dalam policy. Tiap
--   panggilan menjalankan join 3 tabel (role_permissions × roles × permissions)
--   plus `auth_role()` yang sendirinya menembak `users`. 17.853 baris × join
--   itu = 3,6 detik.
--
--   Bandingkan `auth_company_id()` pada policy T5a (migrasi 131) di baris yang
--   sama: ia dibungkus `(SELECT ...)`, muncul sebagai `InitPlan 1` dan terukur
--   0,37 ms — SEKALI, bukan per baris. Pola yang sama, hasil yang berbeda jauh.
--
-- PERBAIKAN (pola kanonik Supabase untuk RLS berskala):
--   Bungkus tiap panggilan helper dengan `(SELECT ...)`. Postgres lalu
--   mengangkatnya jadi InitPlan — dievaluasi sekali per statement dan hasilnya
--   dipakai ulang untuk semua baris.
--
--   Terukur pada assembly_components: 3.457 ms → 5,5 ms (×630 lebih cepat),
--   jumlah baris identik 17.853 — jadi ini murni performa, bukan perubahan
--   semantik. `(SELECT f())` dan `f()` bernilai sama; yang berubah hanya
--   BERAPA KALI ia dihitung.
--
-- LINGKUP: 173 policy di 92 tabel. DI-GENERATE dari `pg_policies` (keadaan
-- database sebenarnya), bukan diketik ulang — menulis tangan 173 policy berarti
-- mengetik ulang 173 ekspresi otorisasi, dan satu salah ketik di sana adalah
-- lubang izin yang senyap. Definisi lama dibaca, dibungkus secara mekanis,
-- lalu ditulis kembali apa adanya: nama, permissive/restrictive, cmd, dan TO
-- role dipertahankan persis.
--
-- Transformasinya idempoten: panggilan yang SUDAH terbungkus dilewati, jadi
-- menjalankan ulang migrasi ini tidak menghasilkan `(SELECT (SELECT ...))`.
-- ============================================================

DROP POLICY IF EXISTS "ahsp_editions_read" ON ahsp_editions;
CREATE POLICY "ahsp_editions_read" ON ahsp_editions FOR SELECT
  USING ((SELECT has_permission('cecep:edition:view'::text)));

DROP POLICY IF EXISTS "ahsp_editions_write" ON ahsp_editions;
CREATE POLICY "ahsp_editions_write" ON ahsp_editions FOR ALL
  USING ((SELECT has_permission('cecep:edition:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:edition:manage'::text)));

DROP POLICY IF EXISTS "approval_chains_write" ON approval_chains;
CREATE POLICY "approval_chains_write" ON approval_chains FOR ALL
  USING ((SELECT has_permission('approval:chains:manage'::text)))
  WITH CHECK ((SELECT has_permission('approval:chains:manage'::text)));

DROP POLICY IF EXISTS "approval_steps_write" ON approval_steps;
CREATE POLICY "approval_steps_write" ON approval_steps FOR ALL
  USING ((SELECT has_permission('approval:chains:manage'::text)))
  WITH CHECK ((SELECT has_permission('approval:chains:manage'::text)));

DROP POLICY IF EXISTS "assemblies_read" ON assemblies;
CREATE POLICY "assemblies_read" ON assemblies FOR SELECT
  USING ((SELECT has_permission('cecep:assembly:view'::text)));

DROP POLICY IF EXISTS "assemblies_write" ON assemblies;
CREATE POLICY "assemblies_write" ON assemblies FOR ALL
  USING ((SELECT has_permission('cecep:assembly:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:assembly:manage'::text)));

DROP POLICY IF EXISTS "assembly_components_read" ON assembly_components;
CREATE POLICY "assembly_components_read" ON assembly_components FOR SELECT
  USING ((SELECT has_permission('cecep:assembly:view'::text)));

DROP POLICY IF EXISTS "assembly_components_write" ON assembly_components;
CREATE POLICY "assembly_components_write" ON assembly_components FOR ALL
  USING ((SELECT has_permission('cecep:assembly:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:assembly:manage'::text)));

DROP POLICY IF EXISTS "audit_logs_admin_select" ON audit_logs;
CREATE POLICY "audit_logs_admin_select" ON audit_logs FOR SELECT
  USING (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "borongan_settlements_admin_pm" ON borongan_settlements;
CREATE POLICY "borongan_settlements_admin_pm" ON borongan_settlements FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "borongan_settlements_mandor_select" ON borongan_settlements;
CREATE POLICY "borongan_settlements_mandor_select" ON borongan_settlements FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (work_scope_id IN ( SELECT ws.id
   FROM (work_scopes ws
     JOIN mandor_assignments ma ON ((ws.assignment_id = ma.id)))
  WHERE (ma.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "cash_accounts_manage_v2" ON cash_accounts;
CREATE POLICY "cash_accounts_manage_v2" ON cash_accounts FOR ALL
  USING ((SELECT has_permission('cash:manage'::text)))
  WITH CHECK ((SELECT has_permission('cash:manage'::text)));

DROP POLICY IF EXISTS "cash_transfers_manage_v2" ON cash_transfers;
CREATE POLICY "cash_transfers_manage_v2" ON cash_transfers FOR ALL
  USING ((SELECT has_permission('cash:manage'::text)))
  WITH CHECK ((SELECT has_permission('cash:manage'::text)));

DROP POLICY IF EXISTS "cbs_nodes_read" ON cbs_nodes;
CREATE POLICY "cbs_nodes_read" ON cbs_nodes FOR SELECT
  USING ((SELECT has_permission('cecep:cbs:view'::text)));

DROP POLICY IF EXISTS "cbs_nodes_write" ON cbs_nodes;
CREATE POLICY "cbs_nodes_write" ON cbs_nodes FOR ALL
  USING ((SELECT has_permission('cecep:cbs:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:cbs:manage'::text)));

DROP POLICY IF EXISTS "cbs_templates_read" ON cbs_templates;
CREATE POLICY "cbs_templates_read" ON cbs_templates FOR SELECT
  USING ((SELECT has_permission('cecep:cbs:view'::text)));

DROP POLICY IF EXISTS "cbs_templates_write" ON cbs_templates;
CREATE POLICY "cbs_templates_write" ON cbs_templates FOR ALL
  USING ((SELECT has_permission('cecep:cbs:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:cbs:manage'::text)));

DROP POLICY IF EXISTS "change_order_items_select" ON change_order_items;
CREATE POLICY "change_order_items_select" ON change_order_items FOR SELECT
  USING (((SELECT has_permission('projects:view'::text)) AND t5_co_terlihat(change_order_id)));

DROP POLICY IF EXISTS "change_order_items_write" ON change_order_items;
CREATE POLICY "change_order_items_write" ON change_order_items FOR ALL
  USING (((SELECT has_permission('projects:edit'::text)) AND t5_co_terlihat(change_order_id)))
  WITH CHECK (((SELECT has_permission('projects:edit'::text)) AND t5_co_terlihat(change_order_id)));

DROP POLICY IF EXISTS "change_orders_select" ON change_orders;
CREATE POLICY "change_orders_select" ON change_orders FOR SELECT
  USING (((SELECT has_permission('projects:view'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "change_orders_write" ON change_orders;
CREATE POLICY "change_orders_write" ON change_orders FOR ALL
  USING (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)))
  WITH CHECK (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "clients_admin" ON clients;
CREATE POLICY "clients_admin" ON clients FOR ALL
  USING (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "clients_mandor_select" ON clients;
CREATE POLICY "clients_mandor_select" ON clients FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (is_active = true)));

DROP POLICY IF EXISTS "clients_pm_insert" ON clients;
CREATE POLICY "clients_pm_insert" ON clients FOR INSERT
  WITH CHECK (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "clients_pm_select" ON clients;
CREATE POLICY "clients_pm_select" ON clients FOR SELECT
  USING ((((SELECT auth_role()) = 'pm'::text) AND (is_active = true)));

DROP POLICY IF EXISTS "clients_pm_update" ON clients;
CREATE POLICY "clients_pm_update" ON clients FOR UPDATE
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])))
  WITH CHECK (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "clients_self_select" ON clients;
CREATE POLICY "clients_self_select" ON clients FOR SELECT
  USING ((((SELECT auth_role()) = 'client'::text) AND (id = (SELECT auth_client_id()))));

DROP POLICY IF EXISTS "companies_manage" ON companies;
CREATE POLICY "companies_manage" ON companies FOR ALL
  USING ((is_member_of(id) AND (SELECT has_permission('settings:manage'::text))))
  WITH CHECK ((is_member_of(id) AND (SELECT has_permission('settings:manage'::text))));

DROP POLICY IF EXISTS "company_members_manage" ON company_members;
CREATE POLICY "company_members_manage" ON company_members FOR ALL
  USING ((is_member_of(company_id) AND (SELECT has_permission('users:manage'::text))))
  WITH CHECK ((is_member_of(company_id) AND (SELECT has_permission('users:manage'::text))));

DROP POLICY IF EXISTS "company_members_select" ON company_members;
CREATE POLICY "company_members_select" ON company_members FOR SELECT
  USING (((user_id = (SELECT auth_user_id())) OR is_member_of(company_id)));

DROP POLICY IF EXISTS "company_profile_select" ON company_profile;
CREATE POLICY "company_profile_select" ON company_profile FOR SELECT
  USING ((SELECT has_permission('settings:manage'::text)));

DROP POLICY IF EXISTS "company_settings_write" ON company_settings;
CREATE POLICY "company_settings_write" ON company_settings FOR ALL
  USING ((SELECT has_permission('settings:manage'::text)))
  WITH CHECK ((SELECT has_permission('settings:manage'::text)));

DROP POLICY IF EXISTS "ccc_map_read" ON cost_code_category_map;
CREATE POLICY "ccc_map_read" ON cost_code_category_map FOR SELECT
  USING ((SELECT has_permission('cecep:cost_map:view'::text)));

DROP POLICY IF EXISTS "ccc_map_write" ON cost_code_category_map;
CREATE POLICY "ccc_map_write" ON cost_code_category_map FOR ALL
  USING ((SELECT has_permission('cecep:cost_map:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:cost_map:manage'::text)));

DROP POLICY IF EXISTS "cost_codes_read" ON cost_codes;
CREATE POLICY "cost_codes_read" ON cost_codes FOR SELECT
  USING ((SELECT has_permission('cecep:cost_code:view'::text)));

DROP POLICY IF EXISTS "cost_codes_write" ON cost_codes;
CREATE POLICY "cost_codes_write" ON cost_codes FOR ALL
  USING ((SELECT has_permission('cecep:cost_code:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:cost_code:manage'::text)));

DROP POLICY IF EXISTS "daily_wage_logs_admin_pm" ON daily_wage_logs;
CREATE POLICY "daily_wage_logs_admin_pm" ON daily_wage_logs FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "daily_wage_logs_mandor_insert" ON daily_wage_logs;
CREATE POLICY "daily_wage_logs_mandor_insert" ON daily_wage_logs FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (work_scope_id IN ( SELECT ws.id
   FROM (work_scopes ws
     JOIN mandor_assignments ma ON ((ws.assignment_id = ma.id)))
  WHERE (ma.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "daily_wage_logs_mandor_select" ON daily_wage_logs;
CREATE POLICY "daily_wage_logs_mandor_select" ON daily_wage_logs FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (work_scope_id IN ( SELECT ws.id
   FROM (work_scopes ws
     JOIN mandor_assignments ma ON ((ws.assignment_id = ma.id)))
  WHERE (ma.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "document_access_logs_insert" ON document_access_logs;
CREATE POLICY "document_access_logs_insert" ON document_access_logs FOR INSERT
  WITH CHECK ((t5_dokumen_terlihat(document_id) AND (user_id = (SELECT auth_user_id()))));

DROP POLICY IF EXISTS "document_access_logs_select" ON document_access_logs;
CREATE POLICY "document_access_logs_select" ON document_access_logs FOR SELECT
  USING (((SELECT has_permission('documents:manage'::text)) AND t5_dokumen_terlihat(document_id)));

DROP POLICY IF EXISTS "dns_manage" ON document_number_series;
CREATE POLICY "dns_manage" ON document_number_series FOR ALL
  USING ((is_member_of(company_id) AND (SELECT has_permission('settings:manage'::text))))
  WITH CHECK ((is_member_of(company_id) AND (SELECT has_permission('settings:manage'::text))));

DROP POLICY IF EXISTS "documents_manage_v2" ON documents;
CREATE POLICY "documents_manage_v2" ON documents FOR ALL
  USING ((SELECT has_permission('documents:manage'::text)))
  WITH CHECK ((SELECT has_permission('documents:manage'::text)));

DROP POLICY IF EXISTS "estimate_items_read" ON estimate_items;
CREATE POLICY "estimate_items_read" ON estimate_items FOR SELECT
  USING ((SELECT has_permission('cecep:estimate:view'::text)));

DROP POLICY IF EXISTS "estimate_items_write" ON estimate_items;
CREATE POLICY "estimate_items_write" ON estimate_items FOR ALL
  USING ((SELECT has_permission('cecep:estimate:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:estimate:manage'::text)));

DROP POLICY IF EXISTS "estimate_versions_read" ON estimate_versions;
CREATE POLICY "estimate_versions_read" ON estimate_versions FOR SELECT
  USING ((SELECT has_permission('cecep:estimate:view'::text)));

DROP POLICY IF EXISTS "estimate_versions_write" ON estimate_versions;
CREATE POLICY "estimate_versions_write" ON estimate_versions FOR ALL
  USING ((SELECT has_permission('cecep:estimate:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:estimate:manage'::text)));

DROP POLICY IF EXISTS "expense_templates_admin" ON expense_category_templates;
CREATE POLICY "expense_templates_admin" ON expense_category_templates FOR INSERT
  WITH CHECK (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "expense_templates_admin_delete" ON expense_category_templates;
CREATE POLICY "expense_templates_admin_delete" ON expense_category_templates FOR DELETE
  USING (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "expense_templates_admin_update" ON expense_category_templates;
CREATE POLICY "expense_templates_admin_update" ON expense_category_templates FOR UPDATE
  USING (((SELECT auth_role()) = 'admin'::text))
  WITH CHECK (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "expense_items_manage_v2" ON expense_items;
CREATE POLICY "expense_items_manage_v2" ON expense_items FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "expense_reports_manage_v2" ON expense_reports;
CREATE POLICY "expense_reports_manage_v2" ON expense_reports FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "feature_flags_write" ON feature_flags;
CREATE POLICY "feature_flags_write" ON feature_flags FOR ALL
  USING ((SELECT has_permission('settings:manage'::text)))
  WITH CHECK ((SELECT has_permission('settings:manage'::text)));

DROP POLICY IF EXISTS "financial_config_write" ON financial_config;
CREATE POLICY "financial_config_write" ON financial_config FOR ALL
  USING ((SELECT has_permission('settings:finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('settings:finance:manage'::text)));

DROP POLICY IF EXISTS "formula_read" ON formula_definitions;
CREATE POLICY "formula_read" ON formula_definitions FOR SELECT
  USING ((SELECT has_permission('cecep:formula:view'::text)));

DROP POLICY IF EXISTS "formula_write" ON formula_definitions;
CREATE POLICY "formula_write" ON formula_definitions FOR ALL
  USING ((SELECT has_permission('cecep:formula:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:formula:manage'::text)));

DROP POLICY IF EXISTS "goods_receipt_items_admin_pm" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_admin_pm" ON goods_receipt_items FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "goods_receipt_items_mandor" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_mandor" ON goods_receipt_items FOR ALL
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (gr_id IN ( SELECT goods_receipts.id
   FROM goods_receipts
  WHERE (goods_receipts.project_id IN ( SELECT mandor_assignments.project_id
           FROM mandor_assignments
          WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))))));

DROP POLICY IF EXISTS "goods_receipts_admin_pm" ON goods_receipts;
CREATE POLICY "goods_receipts_admin_pm" ON goods_receipts FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "goods_receipts_mandor_insert" ON goods_receipts;
CREATE POLICY "goods_receipts_mandor_insert" ON goods_receipts FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "goods_receipts_mandor_select" ON goods_receipts;
CREATE POLICY "goods_receipts_mandor_select" ON goods_receipts FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "invoice_line_items_manage_v2" ON invoice_line_items;
CREATE POLICY "invoice_line_items_manage_v2" ON invoice_line_items FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "invoice_penalties_read" ON invoice_penalties;
CREATE POLICY "invoice_penalties_read" ON invoice_penalties FOR SELECT
  USING (((SELECT has_permission('finance:view:all'::text)) OR (auth.role() = 'service_role'::text)));

DROP POLICY IF EXISTS "invoices_manage_v2" ON invoices;
CREATE POLICY "invoices_manage_v2" ON invoices FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "kasbon_purposes_write" ON kasbon_purposes;
CREATE POLICY "kasbon_purposes_write" ON kasbon_purposes FOR ALL
  USING ((SELECT has_permission('kasbon_purposes:manage'::text)))
  WITH CHECK ((SELECT has_permission('kasbon_purposes:manage'::text)));

DROP POLICY IF EXISTS "kasbons_manage_v2" ON kasbons;
CREATE POLICY "kasbons_manage_v2" ON kasbons FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "proposal_read" ON lesson_propagation_proposals;
CREATE POLICY "proposal_read" ON lesson_propagation_proposals FOR SELECT
  USING ((SELECT has_permission('cecep:lessons:view'::text)));

DROP POLICY IF EXISTS "proposal_write" ON lesson_propagation_proposals;
CREATE POLICY "proposal_write" ON lesson_propagation_proposals FOR ALL
  USING ((SELECT has_permission('cecep:lessons:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:lessons:manage'::text)));

DROP POLICY IF EXISTS "lessons_read" ON lessons_learned_records;
CREATE POLICY "lessons_read" ON lessons_learned_records FOR SELECT
  USING ((SELECT has_permission('cecep:lessons:view'::text)));

DROP POLICY IF EXISTS "lessons_write" ON lessons_learned_records;
CREATE POLICY "lessons_write" ON lessons_learned_records FOR ALL
  USING ((SELECT has_permission('cecep:lessons:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:lessons:manage'::text)));

DROP POLICY IF EXISTS "mandor_assignments_admin" ON mandor_assignments;
CREATE POLICY "mandor_assignments_admin" ON mandor_assignments FOR ALL
  USING (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "mandor_assignments_mandor_select" ON mandor_assignments;
CREATE POLICY "mandor_assignments_mandor_select" ON mandor_assignments FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (mandor_id = (SELECT auth_user_id()))));

DROP POLICY IF EXISTS "mandor_assignments_pm_insert" ON mandor_assignments;
CREATE POLICY "mandor_assignments_pm_insert" ON mandor_assignments FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'pm'::text) AND is_pm_of_project(project_id)));

DROP POLICY IF EXISTS "mandor_assignments_pm_select" ON mandor_assignments;
CREATE POLICY "mandor_assignments_pm_select" ON mandor_assignments FOR SELECT
  USING ((((SELECT auth_role()) = 'pm'::text) AND is_pm_of_project(project_id)));

DROP POLICY IF EXISTS "mandor_assignments_pm_update" ON mandor_assignments;
CREATE POLICY "mandor_assignments_pm_update" ON mandor_assignments FOR UPDATE
  USING ((((SELECT auth_role()) = 'pm'::text) AND is_pm_of_project(project_id)))
  WITH CHECK ((((SELECT auth_role()) = 'pm'::text) AND is_pm_of_project(project_id)));

DROP POLICY IF EXISTS "material_categories_manage_insert_v2" ON material_categories;
CREATE POLICY "material_categories_manage_insert_v2" ON material_categories FOR INSERT
  WITH CHECK ((SELECT has_permission('procurement:material:manage'::text)));

DROP POLICY IF EXISTS "material_categories_manage_update_v2" ON material_categories;
CREATE POLICY "material_categories_manage_update_v2" ON material_categories FOR UPDATE
  USING ((SELECT has_permission('procurement:material:manage'::text)))
  WITH CHECK ((SELECT has_permission('procurement:material:manage'::text)));

DROP POLICY IF EXISTS "material_pack_read" ON material_pack;
CREATE POLICY "material_pack_read" ON material_pack FOR SELECT
  USING ((SELECT has_permission('cecep:takeoff:view'::text)));

DROP POLICY IF EXISTS "material_pack_write" ON material_pack;
CREATE POLICY "material_pack_write" ON material_pack FOR ALL
  USING ((SELECT has_permission('cecep:refdata:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:refdata:manage'::text)));

DROP POLICY IF EXISTS "material_request_items_admin_pm" ON material_request_items;
CREATE POLICY "material_request_items_admin_pm" ON material_request_items FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "material_request_items_mandor" ON material_request_items;
CREATE POLICY "material_request_items_mandor" ON material_request_items FOR ALL
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (mr_id IN ( SELECT material_requests.id
   FROM material_requests
  WHERE (material_requests.project_id IN ( SELECT mandor_assignments.project_id
           FROM mandor_assignments
          WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))))));

DROP POLICY IF EXISTS "material_requests_admin_pm" ON material_requests;
CREATE POLICY "material_requests_admin_pm" ON material_requests FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "material_requests_mandor_insert" ON material_requests;
CREATE POLICY "material_requests_mandor_insert" ON material_requests FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "material_requests_mandor_select" ON material_requests;
CREATE POLICY "material_requests_mandor_select" ON material_requests FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "materials_manage_delete_v2" ON materials;
CREATE POLICY "materials_manage_delete_v2" ON materials FOR DELETE
  USING ((SELECT has_permission('procurement:material:manage'::text)));

DROP POLICY IF EXISTS "materials_manage_insert_v2" ON materials;
CREATE POLICY "materials_manage_insert_v2" ON materials FOR INSERT
  WITH CHECK ((SELECT has_permission('procurement:material:manage'::text)));

DROP POLICY IF EXISTS "materials_manage_update_v2" ON materials;
CREATE POLICY "materials_manage_update_v2" ON materials FOR UPDATE
  USING ((SELECT has_permission('procurement:material:manage'::text)))
  WITH CHECK ((SELECT has_permission('procurement:material:manage'::text)));

DROP POLICY IF EXISTS "menu_items_write" ON menu_items;
CREATE POLICY "menu_items_write" ON menu_items FOR ALL
  USING ((SELECT has_permission('settings:manage'::text)))
  WITH CHECK ((SELECT has_permission('settings:manage'::text)));

DROP POLICY IF EXISTS "milestones_manage_v2" ON milestones;
CREATE POLICY "milestones_manage_v2" ON milestones FOR ALL
  USING ((SELECT has_permission('milestones:manage'::text)))
  WITH CHECK ((SELECT has_permission('milestones:manage'::text)));

DROP POLICY IF EXISTS "modules_write" ON modules;
CREATE POLICY "modules_write" ON modules FOR ALL
  USING ((SELECT has_permission('settings:manage'::text)))
  WITH CHECK ((SELECT has_permission('settings:manage'::text)));

DROP POLICY IF EXISTS "notification_rule_targets_read" ON notification_rule_targets;
CREATE POLICY "notification_rule_targets_read" ON notification_rule_targets FOR SELECT
  USING (((SELECT auth_user_id()) IS NOT NULL));

DROP POLICY IF EXISTS "notification_rule_targets_write" ON notification_rule_targets;
CREATE POLICY "notification_rule_targets_write" ON notification_rule_targets FOR ALL
  USING ((SELECT has_permission('notifications:rules:manage'::text)))
  WITH CHECK ((SELECT has_permission('notifications:rules:manage'::text)));

DROP POLICY IF EXISTS "notification_rules_read" ON notification_rules;
CREATE POLICY "notification_rules_read" ON notification_rules FOR SELECT
  USING (((SELECT auth_user_id()) IS NOT NULL));

DROP POLICY IF EXISTS "notification_rules_write" ON notification_rules;
CREATE POLICY "notification_rules_write" ON notification_rules FOR ALL
  USING ((SELECT has_permission('notifications:rules:manage'::text)))
  WITH CHECK ((SELECT has_permission('notifications:rules:manage'::text)));

DROP POLICY IF EXISTS "notifications_own_delete" ON notifications;
CREATE POLICY "notifications_own_delete" ON notifications FOR DELETE
  USING ((user_id = (SELECT auth_user_id())));

DROP POLICY IF EXISTS "notifications_own_select" ON notifications;
CREATE POLICY "notifications_own_select" ON notifications FOR SELECT
  USING ((user_id = (SELECT auth_user_id())));

DROP POLICY IF EXISTS "notifications_own_update" ON notifications;
CREATE POLICY "notifications_own_update" ON notifications FOR UPDATE
  USING ((user_id = (SELECT auth_user_id())))
  WITH CHECK ((user_id = (SELECT auth_user_id())));

DROP POLICY IF EXISTS "payments_manage_v2" ON payments;
CREATE POLICY "payments_manage_v2" ON payments FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "price_book_read" ON price_book_entries;
CREATE POLICY "price_book_read" ON price_book_entries FOR SELECT
  USING ((SELECT has_permission('cecep:price:view'::text)));

DROP POLICY IF EXISTS "price_book_write" ON price_book_entries;
CREATE POLICY "price_book_write" ON price_book_entries FOR ALL
  USING ((SELECT has_permission('cecep:price:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:price:manage'::text)));

DROP POLICY IF EXISTS "productivity_read" ON productivity_records;
CREATE POLICY "productivity_read" ON productivity_records FOR SELECT
  USING ((SELECT has_permission('cecep:productivity:view'::text)));

DROP POLICY IF EXISTS "productivity_write" ON productivity_records;
CREATE POLICY "productivity_write" ON productivity_records FOR ALL
  USING ((SELECT has_permission('cecep:productivity:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:productivity:manage'::text)));

DROP POLICY IF EXISTS "progress_logs_manage_v2" ON progress_logs;
CREATE POLICY "progress_logs_manage_v2" ON progress_logs FOR ALL
  USING ((SELECT has_permission('progress:manage'::text)))
  WITH CHECK ((SELECT has_permission('progress:manage'::text)));

DROP POLICY IF EXISTS "progress_payments_admin_pm" ON progress_payments;
CREATE POLICY "progress_payments_admin_pm" ON progress_payments FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "progress_payments_mandor_select" ON progress_payments;
CREATE POLICY "progress_payments_mandor_select" ON progress_payments FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (work_scope_id IN ( SELECT ws.id
   FROM (work_scopes ws
     JOIN mandor_assignments ma ON ((ws.assignment_id = ma.id)))
  WHERE (ma.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "project_expense_categories_admin_pm" ON project_expense_categories;
CREATE POLICY "project_expense_categories_admin_pm" ON project_expense_categories FOR ALL
  USING ((((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])) AND (project_id IN ( SELECT projects.id
   FROM projects
  WHERE (((SELECT auth_role()) = 'admin'::text) OR (projects.pm_id = (SELECT auth_user_id())))))));

DROP POLICY IF EXISTS "project_expense_categories_mandor_select" ON project_expense_categories;
CREATE POLICY "project_expense_categories_mandor_select" ON project_expense_categories FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "project_expenses_manage_v2" ON project_expenses;
CREATE POLICY "project_expenses_manage_v2" ON project_expenses FOR ALL
  USING ((SELECT has_permission('cash:manage'::text)))
  WITH CHECK ((SELECT has_permission('cash:manage'::text)));

DROP POLICY IF EXISTS "project_photos_manage_v2" ON project_photos;
CREATE POLICY "project_photos_manage_v2" ON project_photos FOR ALL
  USING ((SELECT has_permission('documents:manage'::text)))
  WITH CHECK ((SELECT has_permission('documents:manage'::text)));

DROP POLICY IF EXISTS "project_stocks_admin_pm" ON project_stocks;
CREATE POLICY "project_stocks_admin_pm" ON project_stocks FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "project_stocks_mandor_insert" ON project_stocks;
CREATE POLICY "project_stocks_mandor_insert" ON project_stocks FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "project_stocks_mandor_select" ON project_stocks;
CREATE POLICY "project_stocks_mandor_select" ON project_stocks FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "projects_admin" ON projects;
CREATE POLICY "projects_admin" ON projects FOR ALL
  USING (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "projects_client_select" ON projects;
CREATE POLICY "projects_client_select" ON projects FOR SELECT
  USING ((((SELECT auth_role()) = 'client'::text) AND (is_deleted = false) AND (client_id = (SELECT auth_client_id()))));

DROP POLICY IF EXISTS "projects_mandor_select" ON projects;
CREATE POLICY "projects_mandor_select" ON projects FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (is_deleted = false) AND is_assigned_mandor(id)));

DROP POLICY IF EXISTS "projects_pm_insert" ON projects;
CREATE POLICY "projects_pm_insert" ON projects FOR INSERT
  WITH CHECK (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "projects_pm_select" ON projects;
CREATE POLICY "projects_pm_select" ON projects FOR SELECT
  USING ((((SELECT auth_role()) = 'pm'::text) AND (pm_id = (SELECT auth_user_id())) AND (is_deleted = false)));

DROP POLICY IF EXISTS "projects_pm_update" ON projects;
CREATE POLICY "projects_pm_update" ON projects FOR UPDATE
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])))
  WITH CHECK (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "purchase_order_items_admin_pm" ON purchase_order_items;
CREATE POLICY "purchase_order_items_admin_pm" ON purchase_order_items FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "purchase_order_items_mandor_select" ON purchase_order_items;
CREATE POLICY "purchase_order_items_mandor_select" ON purchase_order_items FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (po_id IN ( SELECT purchase_orders.id
   FROM purchase_orders
  WHERE (purchase_orders.project_id IN ( SELECT mandor_assignments.project_id
           FROM mandor_assignments
          WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))))));

DROP POLICY IF EXISTS "purchase_orders_admin_pm" ON purchase_orders;
CREATE POLICY "purchase_orders_admin_pm" ON purchase_orders FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "purchase_orders_mandor_select" ON purchase_orders;
CREATE POLICY "purchase_orders_mandor_select" ON purchase_orders FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "rab_absorption_log_select" ON rab_absorption_log;
CREATE POLICY "rab_absorption_log_select" ON rab_absorption_log FOR SELECT
  USING (((SELECT has_permission('projects:view'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "rab_absorption_log_write" ON rab_absorption_log;
CREATE POLICY "rab_absorption_log_write" ON rab_absorption_log FOR ALL
  USING (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)))
  WITH CHECK (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "rab_items_select" ON rab_items;
CREATE POLICY "rab_items_select" ON rab_items FOR SELECT
  USING (((SELECT has_permission('projects:view'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "rab_items_write" ON rab_items;
CREATE POLICY "rab_items_write" ON rab_items FOR ALL
  USING (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)))
  WITH CHECK (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "rab_schedule_select" ON rab_schedule;
CREATE POLICY "rab_schedule_select" ON rab_schedule FOR SELECT
  USING (((SELECT has_permission('projects:view'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "rab_schedule_write" ON rab_schedule;
CREATE POLICY "rab_schedule_write" ON rab_schedule FOR ALL
  USING (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)))
  WITH CHECK (((SELECT has_permission('projects:edit'::text)) AND t5_project_terlihat(project_id)));

DROP POLICY IF EXISTS "rebar_takeoff_read" ON rebar_takeoff;
CREATE POLICY "rebar_takeoff_read" ON rebar_takeoff FOR SELECT
  USING ((SELECT has_permission('cecep:takeoff:view'::text)));

DROP POLICY IF EXISTS "rebar_takeoff_write" ON rebar_takeoff;
CREATE POLICY "rebar_takeoff_write" ON rebar_takeoff FOR ALL
  USING ((SELECT has_permission('cecep:takeoff:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:takeoff:manage'::text)));

DROP POLICY IF EXISTS "resources_read" ON resources;
CREATE POLICY "resources_read" ON resources FOR SELECT
  USING ((SELECT has_permission('cecep:resource:view'::text)));

DROP POLICY IF EXISTS "resources_write" ON resources;
CREATE POLICY "resources_write" ON resources FOR ALL
  USING ((SELECT has_permission('cecep:resource:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:resource:manage'::text)));

DROP POLICY IF EXISTS "root_cause_read" ON root_cause_analyses;
CREATE POLICY "root_cause_read" ON root_cause_analyses FOR SELECT
  USING ((SELECT has_permission('cecep:lessons:view'::text)));

DROP POLICY IF EXISTS "root_cause_write" ON root_cause_analyses;
CREATE POLICY "root_cause_write" ON root_cause_analyses FOR ALL
  USING ((SELECT has_permission('cecep:lessons:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:lessons:manage'::text)));

DROP POLICY IF EXISTS "scenarios_read" ON scenarios;
CREATE POLICY "scenarios_read" ON scenarios FOR SELECT
  USING ((SELECT has_permission('cecep:estimate:view'::text)));

DROP POLICY IF EXISTS "scenarios_write" ON scenarios;
CREATE POLICY "scenarios_write" ON scenarios FOR ALL
  USING ((SELECT has_permission('cecep:estimate:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:estimate:manage'::text)));

DROP POLICY IF EXISTS "steel_profiles_read" ON steel_profiles;
CREATE POLICY "steel_profiles_read" ON steel_profiles FOR SELECT
  USING ((SELECT has_permission('cecep:takeoff:view'::text)));

DROP POLICY IF EXISTS "steel_profiles_write" ON steel_profiles;
CREATE POLICY "steel_profiles_write" ON steel_profiles FOR ALL
  USING ((SELECT has_permission('cecep:refdata:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:refdata:manage'::text)));

DROP POLICY IF EXISTS "stock_movements_admin_pm" ON stock_movements;
CREATE POLICY "stock_movements_admin_pm" ON stock_movements FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "stock_movements_mandor_insert" ON stock_movements;
CREATE POLICY "stock_movements_mandor_insert" ON stock_movements FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "stock_movements_mandor_select" ON stock_movements;
CREATE POLICY "stock_movements_mandor_select" ON stock_movements FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "supplier_invoices_admin_pm" ON supplier_invoices;
CREATE POLICY "supplier_invoices_admin_pm" ON supplier_invoices FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "supplier_payment_allocations_admin_pm" ON supplier_payment_allocations;
CREATE POLICY "supplier_payment_allocations_admin_pm" ON supplier_payment_allocations FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "supplier_payments_admin_pm" ON supplier_payments;
CREATE POLICY "supplier_payments_admin_pm" ON supplier_payments FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "suppliers_admin_pm" ON suppliers;
CREATE POLICY "suppliers_admin_pm" ON suppliers FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "tax_records_manage_v2" ON tax_records;
CREATE POLICY "tax_records_manage_v2" ON tax_records FOR ALL
  USING ((SELECT has_permission('finance:manage'::text)))
  WITH CHECK ((SELECT has_permission('finance:manage'::text)));

DROP POLICY IF EXISTS "termin_schedules_admin_pm" ON termin_schedules;
CREATE POLICY "termin_schedules_admin_pm" ON termin_schedules FOR ALL
  USING ((((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])) AND (project_id IN ( SELECT projects.id
   FROM projects
  WHERE ((projects.pm_id = (SELECT auth_user_id())) OR ((SELECT auth_role()) = 'admin'::text))))));

DROP POLICY IF EXISTS "termin_schedules_client_select" ON termin_schedules;
CREATE POLICY "termin_schedules_client_select" ON termin_schedules FOR SELECT
  USING ((((SELECT auth_role()) = 'client'::text) AND (project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.client_id = (SELECT auth_client_id()))))));

DROP POLICY IF EXISTS "units_write" ON units;
CREATE POLICY "units_write" ON units FOR ALL
  USING ((SELECT has_permission('units:manage'::text)))
  WITH CHECK ((SELECT has_permission('units:manage'::text)));

DROP POLICY IF EXISTS "users_admin" ON users;
CREATE POLICY "users_admin" ON users FOR ALL
  USING (((SELECT auth_role()) = 'admin'::text));

DROP POLICY IF EXISTS "users_pm_mandor_select" ON users;
CREATE POLICY "users_pm_mandor_select" ON users FOR SELECT
  USING ((((SELECT auth_role()) = ANY (ARRAY['pm'::text, 'mandor'::text])) AND (is_active = true)));

DROP POLICY IF EXISTS "users_self_select" ON users;
CREATE POLICY "users_self_select" ON users FOR SELECT
  USING ((id = (SELECT auth_user_id())));

DROP POLICY IF EXISTS "users_self_update" ON users;
CREATE POLICY "users_self_update" ON users FOR UPDATE
  USING ((id = (SELECT auth_user_id())))
  WITH CHECK ((id = (SELECT auth_user_id())));

DROP POLICY IF EXISTS "wage_deductions_admin_pm" ON wage_deductions;
CREATE POLICY "wage_deductions_admin_pm" ON wage_deductions FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "wage_deductions_mandor" ON wage_deductions;
CREATE POLICY "wage_deductions_mandor" ON wage_deductions FOR ALL
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (report_id IN ( SELECT weekly_wage_reports.id
   FROM weekly_wage_reports
  WHERE (weekly_wage_reports.assignment_id IN ( SELECT mandor_assignments.id
           FROM mandor_assignments
          WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))))));

DROP POLICY IF EXISTS "wage_items_admin_pm" ON wage_items;
CREATE POLICY "wage_items_admin_pm" ON wage_items FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "wage_items_mandor" ON wage_items;
CREATE POLICY "wage_items_mandor" ON wage_items FOR ALL
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (report_id IN ( SELECT weekly_wage_reports.id
   FROM weekly_wage_reports
  WHERE (weekly_wage_reports.assignment_id IN ( SELECT mandor_assignments.id
           FROM mandor_assignments
          WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))))));

DROP POLICY IF EXISTS "wbs_nodes_read" ON wbs_nodes;
CREATE POLICY "wbs_nodes_read" ON wbs_nodes FOR SELECT
  USING ((SELECT has_permission('cecep:wbs:view'::text)));

DROP POLICY IF EXISTS "wbs_nodes_write" ON wbs_nodes;
CREATE POLICY "wbs_nodes_write" ON wbs_nodes FOR ALL
  USING ((SELECT has_permission('cecep:wbs:manage'::text)))
  WITH CHECK ((SELECT has_permission('cecep:wbs:manage'::text)));

DROP POLICY IF EXISTS "wage_reports_admin_pm" ON weekly_wage_reports;
CREATE POLICY "wage_reports_admin_pm" ON weekly_wage_reports FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "wage_reports_mandor_insert" ON weekly_wage_reports;
CREATE POLICY "wage_reports_mandor_insert" ON weekly_wage_reports FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (assignment_id IN ( SELECT mandor_assignments.id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "wage_reports_mandor_select" ON weekly_wage_reports;
CREATE POLICY "wage_reports_mandor_select" ON weekly_wage_reports FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (assignment_id IN ( SELECT mandor_assignments.id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "work_categories_write" ON work_categories;
CREATE POLICY "work_categories_write" ON work_categories FOR ALL
  USING ((SELECT has_permission('work_categories:manage'::text)))
  WITH CHECK ((SELECT has_permission('work_categories:manage'::text)));

DROP POLICY IF EXISTS "work_scope_item_specs_select" ON work_scope_item_specs;
CREATE POLICY "work_scope_item_specs_select" ON work_scope_item_specs FOR SELECT
  USING (((SELECT has_permission('projects:view'::text)) AND t5_scope_item_terlihat(item_id)));

DROP POLICY IF EXISTS "work_scope_item_specs_write" ON work_scope_item_specs;
CREATE POLICY "work_scope_item_specs_write" ON work_scope_item_specs FOR ALL
  USING (((SELECT has_permission('mandor:scope:item'::text)) AND t5_scope_item_terlihat(item_id)))
  WITH CHECK (((SELECT has_permission('mandor:scope:item'::text)) AND t5_scope_item_terlihat(item_id)));

DROP POLICY IF EXISTS "work_scope_items_manage_v2" ON work_scope_items;
CREATE POLICY "work_scope_items_manage_v2" ON work_scope_items FOR ALL
  USING ((SELECT has_permission('mandor:scope:item'::text)))
  WITH CHECK ((SELECT has_permission('mandor:scope:item'::text)));

DROP POLICY IF EXISTS "work_scopes_manage_v2" ON work_scopes;
CREATE POLICY "work_scopes_manage_v2" ON work_scopes FOR ALL
  USING (((SELECT has_permission('mandor:scope:manage'::text)) OR pm_owns_scope_assignment(assignment_id)))
  WITH CHECK (((SELECT has_permission('mandor:scope:manage'::text)) OR pm_owns_scope_assignment(assignment_id)));

DROP POLICY IF EXISTS "worker_kasbons_admin_pm" ON worker_kasbons;
CREATE POLICY "worker_kasbons_admin_pm" ON worker_kasbons FOR ALL
  USING (((SELECT auth_role()) = ANY (ARRAY['admin'::text, 'pm'::text])));

DROP POLICY IF EXISTS "worker_kasbons_mandor_insert" ON worker_kasbons;
CREATE POLICY "worker_kasbons_mandor_insert" ON worker_kasbons FOR INSERT
  WITH CHECK ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "worker_kasbons_mandor_select" ON worker_kasbons;
CREATE POLICY "worker_kasbons_mandor_select" ON worker_kasbons FOR SELECT
  USING ((((SELECT auth_role()) = 'mandor'::text) AND (project_id IN ( SELECT mandor_assignments.project_id
   FROM mandor_assignments
  WHERE (mandor_assignments.mandor_id = (SELECT auth_user_id()))))));

DROP POLICY IF EXISTS "workers_manage_v2" ON workers;
CREATE POLICY "workers_manage_v2" ON workers FOR ALL
  USING ((SELECT has_permission('workers:manage'::text)))
  WITH CHECK ((SELECT has_permission('workers:manage'::text)));

DROP POLICY IF EXISTS "workers_mandor_insert_v2" ON workers;
CREATE POLICY "workers_mandor_insert_v2" ON workers FOR INSERT
  WITH CHECK ((SELECT has_permission('mandor:worker:manage'::text)));

DROP POLICY IF EXISTS "workers_mandor_update_v2" ON workers;
CREATE POLICY "workers_mandor_update_v2" ON workers FOR UPDATE
  USING ((mandor_id = (SELECT auth_user_id())))
  WITH CHECK ((mandor_id = (SELECT auth_user_id())));

-- ------------------------------------------------------------
-- Verifikasi: tak boleh ada lagi panggilan helper yang telanjang.
-- ------------------------------------------------------------
DO $$
DECLARE v_sisa INT;
BEGIN
  SELECT count(*) INTO v_sisa FROM pg_policies
   WHERE schemaname='public'
     AND (regexp_replace(coalesce(qual,''), '\(\s*SELECT\s+[a-z_]+\([^)]*\)[^)]*\)', 'X', 'gi')
            ~ '(has_permission|auth_role|auth_user_id|auth_client_id)\s*\('
      OR regexp_replace(coalesce(with_check,''), '\(\s*SELECT\s+[a-z_]+\([^)]*\)[^)]*\)', 'X', 'gi')
            ~ '(has_permission|auth_role|auth_user_id|auth_client_id)\s*\(');
  IF v_sisa > 0 THEN
    RAISE EXCEPTION
      '132: masih ada % policy yang memanggil helper per-baris. Tiap satu di '
      'antaranya membuat query pada tabel besar melambat ratusan kali begitu '
      'service_role dilepas (T5c).', v_sisa;
  END IF;
  RAISE NOTICE '132: seluruh policy kini memakai InitPlan.';
END $$;
