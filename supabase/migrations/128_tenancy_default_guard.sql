-- ============================================================
-- 128 — JARING PENGAMAN TENANCY: isi company_id saat baris lahir
--
-- Keputusan founder 2026-07-29 (analogi "petugas gudang menempel label"):
-- pasang lapis otomatis di DB SEKALIGUS tetap memigrasi 240 call-site ke jalur
-- aman (T4). Dua lapis, bukan salah satunya.
--
-- MASALAH YANG DISELESAIKAN (risiko R-3 di dokumen audit T3 — terjadi persis
-- seperti diperkirakan): setelah T3 mengunci company_id NOT NULL, setiap INSERT
-- yang tak menyertakannya GAGAL. 23 file test langsung merah, dan 240 call-site
-- produksi akan menyusul satu per satu saat dipakai.
--
-- YANG DILAKUKAN TRIGGER INI:
--   company_id sudah diisi pemanggil  → BIARKAN (nol pembajakan nilai eksplisit)
--   company_id NULL + app.company_id  → isi dari situ (request ber-tenant)
--   company_id NULL + tepat 1 company → isi dari situ (fase satu-tenant)
--   selain itu                        → BIARKAN NULL → NOT NULL menolak
--
-- YANG **TIDAK** DILAKUKAN — penting, ini bukan pelonggaran:
--   Trigger ini TIDAK PERNAH menebak saat perusahaan ambigu. Begitu tenant
--   kedua ada DAN app.company_id tak di-set, ia membiarkan NULL dan constraint
--   NOT NULL tetap menolak. Jadi jaring ini otomatis "mengeras" sendiri persis
--   di saat ambiguitas muncul — bukan melemah.
--
-- Ini SETARA DEFAULT, bukan pengganti scoping. Isolasi antar-tenant tetap
-- ditegakkan di lapis kode (T4 wrapper) + lapis RLS (T5).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_isi_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_company UUID;
  v_jumlah  INT;
BEGIN
  -- 1. Pemanggil sudah menyatakan pemilik → hormati apa adanya.
  IF NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Konteks request ber-tenant (di-set wrapper/RLS impersonation).
  BEGIN
    v_company := NULLIF(current_setting('app.company_id', true), '')::UUID;
  EXCEPTION WHEN others THEN
    v_company := NULL;   -- nilai korup di GUC tidak boleh menggagalkan INSERT
  END;

  -- 3. Fase satu-tenant: tak ambigu, jadi aman diisi.
  --    Begitu ada tenant kedua, cabang ini berhenti berlaku DENGAN SENDIRINYA.
  IF v_company IS NULL THEN
    -- min() tidak ada untuk UUID di Postgres — ambil barisnya, bukan agregat.
    SELECT count(*) INTO v_jumlah FROM companies;
    IF v_jumlah = 1 THEN
      SELECT id INTO v_company FROM companies;
    ELSE
      v_company := NULL;   -- ambigu → JANGAN menebak; biarkan NOT NULL menolak
    END IF;
  END IF;

  NEW.company_id := v_company;
  RETURN NEW;
END $function$;

COMMENT ON FUNCTION fn_isi_company_id() IS
  'Jaring pengaman tenancy: mengisi company_id saat INSERT tak menyebutkannya. '
  'TIDAK PERNAH menebak saat >1 company dan konteks tak di-set — di situ ia '
  'membiarkan NULL agar constraint NOT NULL menolak. Bukan pengganti scoping '
  'di lapis kode (ADR-011 T4) maupun RLS (T5).';

DROP TRIGGER IF EXISTS trg_projects_isi_company ON projects;
CREATE TRIGGER trg_projects_isi_company
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_cash_accounts_isi_company ON cash_accounts;
CREATE TRIGGER trg_cash_accounts_isi_company
  BEFORE INSERT ON cash_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_kasbons_isi_company ON kasbons;
CREATE TRIGGER trg_kasbons_isi_company
  BEFORE INSERT ON kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_notifications_isi_company ON notifications;
CREATE TRIGGER trg_notifications_isi_company
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_supplier_invoices_isi_company ON supplier_invoices;
CREATE TRIGGER trg_supplier_invoices_isi_company
  BEFORE INSERT ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_cash_transfers_isi_company ON cash_transfers;
CREATE TRIGGER trg_cash_transfers_isi_company
  BEFORE INSERT ON cash_transfers
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_supplier_payments_isi_company ON supplier_payments;
CREATE TRIGGER trg_supplier_payments_isi_company
  BEFORE INSERT ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_supplier_payment_allocations_isi_company ON supplier_payment_allocations;
CREATE TRIGGER trg_supplier_payment_allocations_isi_company
  BEFORE INSERT ON supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_clients_isi_company ON clients;
CREATE TRIGGER trg_clients_isi_company
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_workers_isi_company ON workers;
CREATE TRIGGER trg_workers_isi_company
  BEFORE INSERT ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_company_settings_isi_company ON company_settings;
CREATE TRIGGER trg_company_settings_isi_company
  BEFORE INSERT ON company_settings
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_financial_config_isi_company ON financial_config;
CREATE TRIGGER trg_financial_config_isi_company
  BEFORE INSERT ON financial_config
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_approval_chains_isi_company ON approval_chains;
CREATE TRIGGER trg_approval_chains_isi_company
  BEFORE INSERT ON approval_chains
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_approval_steps_isi_company ON approval_steps;
CREATE TRIGGER trg_approval_steps_isi_company
  BEFORE INSERT ON approval_steps
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_approval_progress_isi_company ON approval_progress;
CREATE TRIGGER trg_approval_progress_isi_company
  BEFORE INSERT ON approval_progress
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_notification_rules_isi_company ON notification_rules;
CREATE TRIGGER trg_notification_rules_isi_company
  BEFORE INSERT ON notification_rules
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_notification_rule_targets_isi_company ON notification_rule_targets;
CREATE TRIGGER trg_notification_rule_targets_isi_company
  BEFORE INSERT ON notification_rule_targets
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_material_pack_isi_company ON material_pack;
CREATE TRIGGER trg_material_pack_isi_company
  BEFORE INSERT ON material_pack
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_suppliers_isi_company ON suppliers;
CREATE TRIGGER trg_suppliers_isi_company
  BEFORE INSERT ON suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
DROP TRIGGER IF EXISTS trg_audit_logs_isi_company ON audit_logs;
CREATE TRIGGER trg_audit_logs_isi_company
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
