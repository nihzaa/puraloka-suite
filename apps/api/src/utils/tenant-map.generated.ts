// ============================================================
// FILE INI DI-GENERATE — JANGAN DIEDIT TANGAN.
// Sumber: skema database. Regenerate: `node scripts/gen-tenant-map.mjs emit`
// Penegak: `node scripts/gen-tenant-map.mjs check` (CI) — build MERAH kalau
// ada tabel yang belum terklasifikasi (ADR-011 §9.5 P3).
//
// 105 tabel · A=12 · AB=12 · ANCHOR=1 · B=19 · C=55 · D=6
//
// Arti kategori (ADR-011 §5 + audit T1):
//   ANCHOR akar tenancy (projects) — company_id NOT NULL
//   B      milik tenant, company_id NOT NULL      → scope: eq(company_id)
//   AB     katalog bersama + boleh ditimpa tenant → scope: company_id NULL OR eq
//   C      mewarisi lewat rantai FK NOT NULL ke projects → scope lewat project
//   A      katalog/kosakata bersama semua tenant  → TANPA scope
//   D      identitas & platform, ditangani per kasus
// ============================================================

export type KategoriTenancy = 'ANCHOR' | 'A' | 'AB' | 'B' | 'C' | 'D'

export interface EntriTenancy {
  kategori: KategoriTenancy
  /** Untuk kategori C: kolom FK yang menuju induknya. */
  lewat?: string
}

export const PETA_TENANCY = {
  'ahsp_editions': { kategori: 'A' },
  'approval_chains': { kategori: 'B' },
  'approval_progress': { kategori: 'B' },
  'approval_steps': { kategori: 'B' },
  'assemblies': { kategori: 'AB' },
  'assembly_components': { kategori: 'AB' },
  'audit_logs': { kategori: 'D' },  // Punya company_id NOT NULL tapi ditulis langsung (tak pernah lewat join) supaya trail tetap terbaca meski baris induk hilang. Append-only (073).
  'borongan_settlements': { kategori: 'C', lewat: 'work_scope_id' },  // borongan_settlements.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'cash_accounts': { kategori: 'B' },
  'cash_transfers': { kategori: 'B' },
  'cbs_nodes': { kategori: 'AB' },
  'cbs_templates': { kategori: 'AB' },
  'change_order_items': { kategori: 'C', lewat: 'change_order_id' },  // change_order_items.change_order_id → change_orders.project_id
  'change_orders': { kategori: 'C', lewat: 'project_id' },  // change_orders.project_id
  'clients': { kategori: 'B' },
  'companies': { kategori: 'D' },  // Tabel tenant itu sendiri.
  'company_members': { kategori: 'D' },  // Tabel keanggotaan itu sendiri. Di-scope manual per kasus.
  'company_menu_settings': { kategori: 'B' },
  'company_profile': { kategori: 'D' },  // Deprecated — digantikan companies (dibuang setelah T4).
  'company_settings': { kategori: 'B' },
  'cost_code_category_map': { kategori: 'C', lewat: 'category_id' },  // cost_code_category_map.category_id → project_expense_categories.project_id
  'cost_codes': { kategori: 'AB' },
  'daily_wage_logs': { kategori: 'C', lewat: 'work_scope_id' },  // daily_wage_logs.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'document_access_logs': { kategori: 'C', lewat: 'document_id' },  // document_access_logs.document_id → documents.project_id
  'document_number_series': { kategori: 'D' },  // Counter penomoran per company; di-scope eksplisit oleh pemakainya.
  'documents': { kategori: 'C', lewat: 'project_id' },  // documents.project_id
  'estimate_items': { kategori: 'C', lewat: 'estimate_version_id' },  // estimate_items.estimate_version_id → estimate_versions.scenario_id → scenarios.project_id
  'estimate_versions': { kategori: 'C', lewat: 'scenario_id' },  // estimate_versions.scenario_id → scenarios.project_id
  'expense_category_templates': { kategori: 'AB' },
  'expense_items': { kategori: 'C', lewat: 'expense_report_id' },  // expense_items.expense_report_id → expense_reports.project_id
  'expense_reports': { kategori: 'C', lewat: 'project_id' },  // expense_reports.project_id
  'feature_flags': { kategori: 'AB' },
  'financial_config': { kategori: 'B' },
  'formula_definitions': { kategori: 'A' },
  'goods_receipt_items': { kategori: 'C', lewat: 'gr_id' },  // goods_receipt_items.gr_id → goods_receipts.project_id
  'goods_receipts': { kategori: 'C', lewat: 'project_id' },  // goods_receipts.project_id
  'invoice_line_items': { kategori: 'C', lewat: 'invoice_id' },  // invoice_line_items.invoice_id → invoices.project_id
  'invoice_penalties': { kategori: 'C', lewat: 'invoice_id' },  // invoice_penalties.invoice_id → invoices.project_id
  'invoices': { kategori: 'C', lewat: 'project_id' },  // invoices.project_id
  'kasbon_purposes': { kategori: 'A' },
  'kasbons': { kategori: 'B' },
  'lesson_propagation_proposals': { kategori: 'C', lewat: 'lesson_id' },  // lesson_propagation_proposals.lesson_id → lessons_learned_records.project_id
  'lessons_learned_records': { kategori: 'C', lewat: 'project_id' },  // lessons_learned_records.project_id
  'mandor_assignments': { kategori: 'C', lewat: 'project_id' },  // mandor_assignments.project_id
  'material_categories': { kategori: 'A' },
  'material_pack': { kategori: 'B' },
  'material_request_items': { kategori: 'C', lewat: 'mr_id' },  // material_request_items.mr_id → material_requests.project_id
  'material_requests': { kategori: 'C', lewat: 'project_id' },  // material_requests.project_id
  'materials': { kategori: 'AB' },
  'menu_items': { kategori: 'A' },
  'milestones': { kategori: 'C', lewat: 'project_id' },  // milestones.project_id
  'modules': { kategori: 'A' },
  'mr_quota_override': { kategori: 'C', lewat: 'project_id' },  // mr_quota_override.project_id
  'notification_rule_targets': { kategori: 'B' },
  'notification_rules': { kategori: 'B' },
  'notifications': { kategori: 'B' },
  'payments': { kategori: 'C', lewat: 'invoice_id' },  // payments.invoice_id → invoices.project_id
  'permission_scopes': { kategori: 'A' },
  'permissions': { kategori: 'A' },
  'price_book_entries': { kategori: 'AB' },
  'productivity_records': { kategori: 'AB' },
  'progress_logs': { kategori: 'C', lewat: 'project_id' },  // progress_logs.project_id
  'progress_payments': { kategori: 'C', lewat: 'work_scope_id' },  // progress_payments.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'project_expense_categories': { kategori: 'C', lewat: 'project_id' },  // project_expense_categories.project_id
  'project_expenses': { kategori: 'C', lewat: 'project_id' },  // project_expenses.project_id
  'project_photos': { kategori: 'C', lewat: 'project_id' },  // project_photos.project_id
  'project_price_override': { kategori: 'C', lewat: 'project_id' },  // project_price_override.project_id
  'project_rab_materials': { kategori: 'C', lewat: 'project_id' },  // project_rab_materials.project_id
  'project_stocks': { kategori: 'C', lewat: 'project_id' },  // project_stocks.project_id
  'projects': { kategori: 'ANCHOR' },
  'purchase_order_items': { kategori: 'C', lewat: 'po_id' },  // purchase_order_items.po_id → purchase_orders.project_id
  'purchase_orders': { kategori: 'C', lewat: 'project_id' },  // purchase_orders.project_id
  'rab_absorption_log': { kategori: 'C', lewat: 'project_id' },  // rab_absorption_log.project_id
  'rab_items': { kategori: 'C', lewat: 'project_id' },  // rab_items.project_id
  'rab_schedule': { kategori: 'C', lewat: 'project_id' },  // rab_schedule.project_id
  'rap_budget': { kategori: 'C', lewat: 'project_id' },  // rap_budget.project_id
  'rap_change_log': { kategori: 'C', lewat: 'rap_budget_id' },  // rap_change_log.rap_budget_id → rap_budget.project_id
  'rap_labor_line': { kategori: 'C', lewat: 'rap_budget_id' },  // rap_labor_line.rap_budget_id → rap_budget.project_id
  'rap_material_line': { kategori: 'C', lewat: 'rap_budget_id' },  // rap_material_line.rap_budget_id → rap_budget.project_id
  'rebar_takeoff': { kategori: 'C', lewat: 'estimate_item_id' },  // rebar_takeoff.estimate_item_id → estimate_items.estimate_version_id → estimate_versions.scenario_id → scenarios.project_id
  'resources': { kategori: 'A' },
  'role_permissions': { kategori: 'AB' },
  'roles': { kategori: 'AB' },
  'root_cause_analyses': { kategori: 'C', lewat: 'lesson_id' },  // root_cause_analyses.lesson_id → lessons_learned_records.project_id
  'scenarios': { kategori: 'C', lewat: 'project_id' },  // scenarios.project_id
  'steel_profiles': { kategori: 'A' },
  'stock_movements': { kategori: 'C', lewat: 'project_id' },  // stock_movements.project_id
  'supplier_invoices': { kategori: 'B' },
  'supplier_payment_allocations': { kategori: 'B' },
  'supplier_payments': { kategori: 'B' },
  'suppliers': { kategori: 'B' },
  'tax_records': { kategori: 'C', lewat: 'invoice_id' },  // tax_records.invoice_id → invoices.project_id
  'termin_schedules': { kategori: 'C', lewat: 'project_id' },  // termin_schedules.project_id
  'units': { kategori: 'A' },
  'users': { kategori: 'D' },  // Identitas lintas-tenant. Satu orang bisa jadi anggota >1 company dengan peran berbeda — keanggotaan hidup di company_members (ADR-011 D6), bukan di users.
  'wage_deductions': { kategori: 'C', lewat: 'report_id' },  // wage_deductions.report_id → weekly_wage_reports.assignment_id → mandor_assignments.project_id
  'wage_items': { kategori: 'C', lewat: 'report_id' },  // wage_items.report_id → weekly_wage_reports.assignment_id → mandor_assignments.project_id
  'wbs_nodes': { kategori: 'C', lewat: 'project_id' },  // wbs_nodes.project_id
  'weekly_wage_reports': { kategori: 'C', lewat: 'assignment_id' },  // weekly_wage_reports.assignment_id → mandor_assignments.project_id
  'work_categories': { kategori: 'A' },
  'work_scope_item_specs': { kategori: 'C', lewat: 'item_id' },  // work_scope_item_specs.item_id → work_scope_items.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'work_scope_items': { kategori: 'C', lewat: 'work_scope_id' },  // work_scope_items.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'work_scopes': { kategori: 'C', lewat: 'assignment_id' },  // work_scopes.assignment_id → mandor_assignments.project_id
  'worker_kasbons': { kategori: 'C', lewat: 'project_id' },  // worker_kasbons.project_id
  'workers': { kategori: 'B' },
} as const satisfies Record<string, EntriTenancy>

export type TabelTerklasifikasi = keyof typeof PETA_TENANCY
