-- ============================================================================
-- 179 — F2-3 BATCH 2: isolasi tenant untuk `audit_logs`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CELAH YANG DITUTUP
-- ══════════════════════════════════════════════════════════════════════════
--
-- `audit_logs` PUNYA `company_id` (13.691 baris, ter-backfill penuh di F0-16)
-- tetapi **nol policy yang menyaringnya**. Satu-satunya policy-nya berbunyi:
--
--     audit_logs_admin_select  USING (auth_role() = 'admin')
--
-- Itu menyaring PERAN, bukan TENANT. Admin PT A karenanya bisa membaca jejak
-- audit PT B — dan audit log memuat jejak SELURUH tindakan: siapa mengubah
-- nilai kontrak, siapa menyetujui kasbon, berapa nominalnya.
--
-- Ditemukan saat mengerjakan F2-3 batch 2 (kategori D). Tiga tabel D lain
-- ternyata sudah benar; `audit_logs` satu-satunya yang belum.
--
-- ── Kenapa RESTRICTIVE, bukan mengubah policy yang ada
--
-- Policy PERMISSIVE saling di-OR-kan: menambah satu lagi hanya MEMPERLUAS
-- akses. Yang dibutuhkan di sini adalah syarat yang di-AND-kan ke SEMUA jalur
-- akses, dan itu persis arti RESTRICTIVE (ADR-011 §7).
--
-- Mengubah `audit_logs_admin_select` juga bisa, tetapi lebih rapuh: siapa pun
-- yang menambah policy PERMISSIVE baru kelak akan melewati syarat tenant tanpa
-- menyadarinya. RESTRICTIVE berlaku untuk semuanya, termasuk yang belum ada.
--
-- ── Immutability TIDAK disentuh
--
-- Migrasi 073 membuat `audit_logs` append-only lewat trigger penolak
-- UPDATE/DELETE. Migrasi ini hanya menambah policy SELECT/INSERT — nol
-- perubahan pada jaminan append-only, yang termasuk Ember [C].
-- ============================================================================

DO $$
DECLARE v_permissive int;
BEGIN
  -- ⚠️ RESTRICTIVE SENDIRIAN MEMATIKAN TABEL (T1-F3, migrasi 131).
  -- Ia di-AND-kan; tanpa PERMISSIVE yang mengizinkan sesuatu, hasilnya nol
  -- baris untuk semua orang — termasuk yang berhak.
  SELECT count(*) INTO v_permissive
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'audit_logs'
     AND permissive = 'PERMISSIVE';

  IF v_permissive = 0 THEN
    RAISE EXCEPTION '179: audit_logs tak punya policy PERMISSIVE. Menambah '
                    'RESTRICTIVE sekarang akan MEMATIKAN tabel audit.';
  END IF;
END $$;

DROP POLICY IF EXISTS tenant_isolation ON audit_logs;

-- Baris audit hanya terlihat oleh tenant pemiliknya.
--
-- `company_id IS NULL` SENGAJA TIDAK diizinkan, berbeda dari pola A/B:
-- audit_logs bukan tabel overlay. Baris tanpa pemilik di sini berarti jejak
-- yang tak bisa dikaitkan ke siapa pun — dan F0-16 sudah mengisi seluruh
-- 13.691 baris, jadi tak ada yang tertinggal.
--
-- WITH CHECK memakai syarat yang sama: menulis jejak atas nama tenant lain
-- akan memalsukan riwayat, dan riwayat palsu lebih buruk daripada tak ada
-- riwayat.
CREATE POLICY tenant_isolation ON audit_logs
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DO $$ BEGIN
  RAISE NOTICE '179: audit_logs kini terisolasi per tenant. '
               'Append-only (073) TIDAK disentuh.';
END $$;
