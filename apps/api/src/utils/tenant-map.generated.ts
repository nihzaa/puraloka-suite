// ============================================================
// FILE INI DI-GENERATE — JANGAN DIEDIT TANGAN.
// Sumber: skema database. Regenerate: `node scripts/gen-tenant-map.mjs emit`
// Penegak: `node scripts/gen-tenant-map.mjs check` (CI) — build MERAH kalau
// ada tabel yang belum terklasifikasi (ADR-011 §9.5 P3).
//
// 182 tabel · A=10 · AB=14 · ANCHOR=1 · B=67 · C=83 · D=7
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
  /**
   * `true` bila ini VIEW, bukan tabel.
   *
   * Penting bagi pemeriksaan yang menuntut artefak yang hanya dimiliki tabel:
   * view TIDAK BISA punya policy RLS maupun `relrowsecurity`. Tanpa penanda
   * ini, sebuah view berkategori B akan membuat T5a dan T7-L2 merah selamanya,
   * dan satu-satunya "perbaikan" yang tersedia adalah salah kategori.
   *
   * Keamanannya datang dari tempat lain: daftar kolom terkunci di definisi
   * view, dan pemanggilnya wajib menyaring `company_id`.
   */
  view?: true
}

export const PETA_TENANCY = {
  'absensi_harian': { kategori: 'C', lewat: 'scope_id' },  // absensi_harian.scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'accounts': { kategori: 'B' },
  'ahsp_editions': { kategori: 'A' },
  'approval_chains': { kategori: 'B' },
  'approval_progress': { kategori: 'B' },
  'approval_steps': { kategori: 'B' },
  'assemblies': { kategori: 'AB' },
  'assembly_components': { kategori: 'AB' },
  'asset_depreciation_logs': { kategori: 'C', lewat: 'asset_id' },  // asset_depreciation_logs.asset_id
  'asset_movements': { kategori: 'C', lewat: 'asset_id' },  // asset_movements.asset_id
  'asset_rentals': { kategori: 'B' },
  'assets': { kategori: 'B' },
  'audit_logs': { kategori: 'D' },  // Punya company_id NOT NULL tapi ditulis langsung (tak pernah lewat join) supaya trail tetap terbaca meski baris induk hilang. Append-only (073).
  'biaya_operasional_alat': { kategori: 'B' },
  'bids': { kategori: 'B' },
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
  'contract_bonds': { kategori: 'B' },
  'contract_claims': { kategori: 'C', lewat: 'project_id' },  // contract_claims.project_id
  'contract_eot': { kategori: 'C', lewat: 'project_id' },  // contract_eot.project_id
  'cost_code_category_map': { kategori: 'C', lewat: 'category_id' },  // cost_code_category_map.category_id → project_expense_categories.project_id
  'cost_codes': { kategori: 'AB' },
  'critical_audit_events': { kategori: 'D', view: true },  // VIEW tanpa company_id — tentukan tenancy-nya secara sadar
  'daily_wage_logs': { kategori: 'C', lewat: 'work_scope_id' },  // daily_wage_logs.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'document_access_logs': { kategori: 'C', lewat: 'document_id' },  // document_access_logs.document_id → documents.project_id
  'document_number_series': { kategori: 'D' },  // Counter penomoran per company; di-scope eksplisit oleh pemakainya.
  'documents': { kategori: 'C', lewat: 'project_id' },  // documents.project_id
  'dokumen_kepatuhan': { kategori: 'B' },
  'dokumen_prakualifikasi': { kategori: 'B' },
  'estimate_items': { kategori: 'C', lewat: 'estimate_version_id' },  // estimate_items.estimate_version_id → estimate_versions.scenario_id → scenarios.project_id
  'estimate_versions': { kategori: 'C', lewat: 'scenario_id' },  // estimate_versions.scenario_id → scenarios.project_id
  'evaluasi_subkon': { kategori: 'B' },
  'evaluasi_vendor': { kategori: 'B' },
  'expediting': { kategori: 'B' },
  'expediting_jejak': { kategori: 'B' },
  'expense_category_templates': { kategori: 'AB' },
  'expense_items': { kategori: 'C', lewat: 'category_id' },  // expense_items.category_id → project_expense_categories.project_id
  'expense_reports': { kategori: 'C', lewat: 'project_id' },  // expense_reports.project_id
  'feature_flags': { kategori: 'AB' },
  'field_instructions': { kategori: 'C', lewat: 'project_id' },  // field_instructions.project_id
  'financial_config': { kategori: 'B' },
  'formula_definitions': { kategori: 'A' },
  'goods_receipt_items': { kategori: 'C', lewat: 'gr_id' },  // goods_receipt_items.gr_id → goods_receipts.project_id
  'goods_receipts': { kategori: 'C', lewat: 'project_id' },  // goods_receipts.project_id
  'hari_libur': { kategori: 'B' },
  'idempotency_keys': { kategori: 'B' },
  'information_requests': { kategori: 'C', lewat: 'project_id' },  // information_requests.project_id
  'inspection_requests': { kategori: 'C', lewat: 'project_id' },  // inspection_requests.project_id
  'invoice_line_items': { kategori: 'C', lewat: 'invoice_id' },  // invoice_line_items.invoice_id → invoices.project_id
  'invoice_penalties': { kategori: 'C', lewat: 'invoice_id' },  // invoice_penalties.invoice_id → invoices.project_id
  'invoices': { kategori: 'C', lewat: 'project_id' },  // invoices.project_id
  'izin_kerja': { kategori: 'B' },
  'jadwal_distribusi_laporan': { kategori: 'B' },
  'jadwal_perawatan': { kategori: 'B' },
  'journal_entries': { kategori: 'B' },
  'journal_entry_lines': { kategori: 'C', lewat: 'account_id' },  // journal_entry_lines.account_id
  'kasbon_purposes': { kategori: 'AB' },
  'kasbons': { kategori: 'B' },
  'kebutuhan_sumber_daya': { kategori: 'B' },
  'kontrak_payung': { kategori: 'B' },
  'kontrak_payung_item': { kategori: 'B' },
  'lesson_propagation_proposals': { kategori: 'C', lewat: 'lesson_id' },  // lesson_propagation_proposals.lesson_id → lessons_learned_records.project_id
  'lessons_learned_records': { kategori: 'C', lewat: 'project_id' },  // lessons_learned_records.project_id
  'mandor_assignments': { kategori: 'C', lewat: 'project_id' },  // mandor_assignments.project_id
  'material_categories': { kategori: 'A' },
  'material_pack': { kategori: 'B' },
  'material_request_items': { kategori: 'C', lewat: 'mr_id' },  // material_request_items.mr_id → material_requests.project_id
  'material_requests': { kategori: 'C', lewat: 'project_id' },  // material_requests.project_id
  'materials': { kategori: 'AB' },
  'matriks_distribusi': { kategori: 'B' },
  'menu_items': { kategori: 'A' },
  'method_statement': { kategori: 'B' },
  'milestone_dependencies': { kategori: 'B' },
  'milestones': { kategori: 'C', lewat: 'project_id' },  // milestones.project_id
  'modules': { kategori: 'AB' },
  'mr_quota_override': { kategori: 'C', lewat: 'project_id' },  // mr_quota_override.project_id
  'ncr_items': { kategori: 'C', lewat: 'project_id' },  // ncr_items.project_id
  'ncr_photos': { kategori: 'C', lewat: 'ncr_id' },  // ncr_photos.ncr_id → ncr_items.project_id
  'nota_kredit': { kategori: 'B' },
  'notification_rule_targets': { kategori: 'B' },
  'notification_rules': { kategori: 'B' },
  'notifications': { kategori: 'B' },
  'notulen_rapat': { kategori: 'B' },
  'notulen_tindakan': { kategori: 'B' },
  'payments': { kategori: 'C', lewat: 'invoice_id' },  // payments.invoice_id → invoices.project_id
  'pemakaian_alat': { kategori: 'B' },
  'penawaran_subkon': { kategori: 'C', lewat: 'tender_id' },  // penawaran_subkon.tender_id → tender_subkon.project_id
  'pencocokan_bank': { kategori: 'B' },
  'penerimaan_material_klien': { kategori: 'C', lewat: 'project_id' },  // penerimaan_material_klien.project_id
  'penggunaan_contingency': { kategori: 'C', lewat: 'pos_id' },  // penggunaan_contingency.pos_id → pos_contingency.project_id
  'penyesuaian_rekonsiliasi': { kategori: 'B' },
  'penyusutan_alat': { kategori: 'B' },
  'permission_scopes': { kategori: 'A' },
  'permissions': { kategori: 'A' },
  'po_delivery_log': { kategori: 'C', lewat: 'project_id' },  // po_delivery_log.project_id
  'pola_kerja': { kategori: 'B' },
  'polis_asuransi': { kategori: 'C', lewat: 'project_id' },  // polis_asuransi.project_id
  'pos_contingency': { kategori: 'C', lewat: 'project_id' },  // pos_contingency.project_id
  'prakualifikasi_vendor': { kategori: 'B' },
  'price_book_entries': { kategori: 'AB' },
  'productivity_records': { kategori: 'AB' },
  'progress_logs': { kategori: 'C', lewat: 'project_id' },  // progress_logs.project_id
  'progress_payments': { kategori: 'C', lewat: 'work_scope_id' },  // progress_payments.work_scope_id → work_scopes.assignment_id → mandor_assignments.project_id
  'project_expense_categories': { kategori: 'C', lewat: 'project_id' },  // project_expense_categories.project_id
  'project_expenses': { kategori: 'C', lewat: 'project_id' },  // project_expenses.project_id
  'project_letters': { kategori: 'C', lewat: 'project_id' },  // project_letters.project_id
  'project_photos': { kategori: 'C', lewat: 'project_id' },  // project_photos.project_id
  'project_price_override': { kategori: 'C', lewat: 'project_id' },  // project_price_override.project_id
  'project_rab_materials': { kategori: 'C', lewat: 'project_id' },  // project_rab_materials.project_id
  'project_stocks': { kategori: 'C', lewat: 'project_id' },  // project_stocks.project_id
  'projects': { kategori: 'ANCHOR' },
  'punch_item_photos': { kategori: 'C', lewat: 'photo_id' },  // punch_item_photos.photo_id → project_photos.project_id
  'punch_items': { kategori: 'C', lewat: 'project_id' },  // punch_items.project_id
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
  'register_gambar': { kategori: 'B' },
  'rekening_koran': { kategori: 'B' },
  'rekening_koran_baris': { kategori: 'C', lewat: 'koran_id' },  // rekening_koran_baris.koran_id
  'resources': { kategori: 'A' },
  'rfq': { kategori: 'C', lewat: 'project_id' },  // rfq.project_id
  'rfq_penawaran': { kategori: 'C', lewat: 'rfq_id' },  // rfq_penawaran.rfq_id → rfq.project_id
  'riwayat_perawatan': { kategori: 'B' },
  'role_permissions': { kategori: 'AB' },
  'roles': { kategori: 'AB' },
  'root_cause_analyses': { kategori: 'C', lewat: 'lesson_id' },  // root_cause_analyses.lesson_id → lessons_learned_records.project_id
  'scenarios': { kategori: 'C', lewat: 'project_id' },  // scenarios.project_id
  'sertifikat_ipc': { kategori: 'C', lewat: 'project_id' },  // sertifikat_ipc.project_id
  'situs_kategori': { kategori: 'B' },
  'situs_konten': { kategori: 'B' },
  'situs_legalitas': { kategori: 'B' },
  'situs_media': { kategori: 'B' },
  'situs_merek': { kategori: 'B' },
  'situs_milestone': { kategori: 'B' },
  'situs_seksi': { kategori: 'B' },
  'steel_profiles': { kategori: 'A' },
  'stock_movements': { kategori: 'C', lewat: 'project_id' },  // stock_movements.project_id
  'stock_transfers': { kategori: 'C', lewat: 'project_asal_id' },  // stock_transfers.project_asal_id
  'subcontract_retention_releases': { kategori: 'B' },
  'submittal_documents': { kategori: 'C', lewat: 'document_id' },  // submittal_documents.document_id → documents.project_id
  'submittals': { kategori: 'C', lewat: 'project_id' },  // submittals.project_id
  'supplier_invoices': { kategori: 'B' },
  'supplier_payment_allocations': { kategori: 'B' },
  'supplier_payments': { kategori: 'B' },
  'suppliers': { kategori: 'B' },
  'tanda_tangan_elektronik': { kategori: 'B' },
  'tax_records': { kategori: 'C', lewat: 'invoice_id' },  // tax_records.invoice_id → invoices.project_id
  'tender_subkon': { kategori: 'C', lewat: 'project_id' },  // tender_subkon.project_id
  'termin_schedules': { kategori: 'C', lewat: 'project_id' },  // termin_schedules.project_id
  'transmittal': { kategori: 'B' },
  'transmittal_item': { kategori: 'B' },
  'units': { kategori: 'A' },
  'users': { kategori: 'D' },  // Identitas lintas-tenant. Satu orang bisa jadi anggota >1 company dengan peran berbeda — keanggotaan hidup di company_members (ADR-011 D6), bukan di users.
  'v_situs_publik': { kategori: 'B', view: true },
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
