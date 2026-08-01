-- Migration 073: audit_logs append-only trigger (Epic 5 F5.5)
--
-- ✅ SUDAH DI-APPLY — gerbang founder DIBUKA, di-apply via PR #13 (`d9ea114`).
--    Diverifikasi 2026-08-01 dari koneksi baru: `trg_audit_logs_no_update` &
--    `trg_audit_logs_no_delete` keduanya `tgenabled='O'` di pg_trigger.
--
--    Header ini SEBELUMNYA berbunyi "⚠️ DORMAN — jangan di-apply". Itu benar saat
--    ditulis, lalu tak pernah diperbarui setelah founder menyetujui. Akibatnya dua
--    dokumen (taksonomi §19 + Lima Pembeda #1) mengutipnya sebagai gap terbuka
--    selama berbulan-bulan, dan Kriteria Kualitas #1 dinilai "kuat SEBAGIAN"
--    padahal sudah kuat penuh.
--
--    Pelajarannya: komentar gerbang di berkas migrasi adalah SUMBER yang dikutip
--    dokumen lain. Saat gerbangnya dibuka, komentarnya ikut diperbarui — kalau
--    tidak, ia jadi klaim usang yang menyebar. Isi DDL di bawah tak diubah;
--    yang diperbarui hanya keterangannya.
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
