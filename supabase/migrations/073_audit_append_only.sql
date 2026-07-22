-- Migration 073: audit_logs append-only trigger (Epic 5 F5.5)
-- ⚠️ DORMAN — TIDAK di-apply tanpa keputusan founder eksplisit (governance gate,
-- lihat Implementation-Kickoff/epic-5-decisions.md § 1 + 09-definition-of-ready.md).
--
-- Menjadikan audit_logs immutable: menolak UPDATE & DELETE. Sekali aktif, tidak
-- seorang pun (termasuk admin) bisa mengubah/menghapus baris audit lewat jalur
-- normal — bukti forensik kuat, tapi menghilangkan kontrol koreksi/pembersihan.
--
-- Catatan: service_role/superuser dari migration ini sendiri bisa DROP trigger
-- untuk maintenance terencana; trigger memblokir jalur aplikasi normal.

CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs bersifat append-only: % ditolak', TG_OP;
END $$;

CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
