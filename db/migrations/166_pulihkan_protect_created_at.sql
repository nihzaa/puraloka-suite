-- ============================================================
-- PURALOKA SUITE — Migration 166
-- Pulihkan `trg_protect_created_at` di 10 tabel kritis — DI DEV.
-- ============================================================
--
-- ── Yang ditemukan
--
-- `protect_created_at()` ada di `pg_proc` dev tapi **NOL tabel** memakainya.
-- Diuji langsung di transaksi yang di-ROLLBACK (nol data berubah):
--
--     UPDATE invoices SET created_at = '2000-01-01' WHERE id = <salah satu>;
--     → BERHASIL. Stempel waktu invoice bisa ditulis ulang.
--
-- Sepuluh tabel yang seharusnya immutable, sepuluh-duanya terbuka di dev:
--   projects · invoices · payments · kasbons · project_expenses
--   mandor_assignments · work_scopes · audit_logs · users · clients
--
-- ── ⚠️ KOREKSI: migrasi 037 TIDAK rusak
--
-- Dugaan pertama saya: `037_security_hardening.sql` gagal memasang trigger-nya.
-- Itu SALAH, dan dibuktikan salah dengan menjalankan rantai migrasi di schema
-- yang benar-benar bersih (2026-08-02):
--
--   dengan 037 saja, TANPA migrasi ini → 10/10 tabel terlindungi.
--
-- Jadi CI dan environment mana pun yang dibangun dari migrasi SUDAH aman.
-- Yang menyimpang hanya database **dev**, yang riwayatnya memuat operasi di
-- luar migrasi (repo ini baru punya `schema_migrations` belakangan).
--
-- Koreksi ini ditulis, bukan disunting diam-diam: temuan yang ternyata keliru
-- lebih berguna dicatat daripada dihapus — ia menandai di mana dev berbeda
-- dari migrasi, dan itu justru inti masalahnya.
--
-- ── Kenapa migrasi ini TETAP ada
--
-- 1. Ia memulihkan dev, yang sampai sekarang benar-benar tak terlindungi.
-- 2. Idempoten (`DROP … CREATE`) — aman di database yang sudah punya.
-- 3. Verifikasinya gagal keras kalau ada tabel yang luput, sehingga
--    environment berikutnya tak bisa diam-diam kehilangan perlindungan ini.
--
-- ── Kenapa `created_at` yang bisa digeser itu serius
--
-- `audit_logs` yang tanggalnya bisa diubah berhenti menjadi bukti. Ia masih
-- append-only lewat `trg_audit_logs_no_update`, tapi itu penjaga berbeda —
-- urutan kejadian tetap rusak kalau stempel waktunya bisa dipindah.
--
-- Bukan hanya soal niat jahat: skrip perbaikan data, migrasi salah tulis, atau
-- `UPDATE` yang meleset semuanya bisa menggesernya tanpa ada yang sadar.
--
-- ── Dampak ke data yang sudah ada: NOL
--
-- `BEFORE UPDATE` hanya bereaksi pada perubahan BARU. Tak ada baris yang
-- dibaca, dihitung ulang, atau diperbaiki.
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  hilang TEXT := '';
BEGIN
  -- Daftar SAMA PERSIS dengan migrasi 037 — ini pemulihan, bukan perluasan.
  -- Menambah tabel di sini akan mengubah cakupan tanpa keputusan, dan itu
  -- pekerjaan terpisah.
  FOREACH tbl IN ARRAY ARRAY[
    'projects', 'invoices', 'payments', 'kasbons',
    'project_expenses', 'mandor_assignments', 'work_scopes',
    'audit_logs', 'users', 'clients'
  ] LOOP
    -- Kualifikasi schema WAJIB eksplisit. `to_regclass('projects')` polos
    -- mengikuti `search_path` dan bisa menemukan `public.projects` walau
    -- schema aktif adalah `test` — itu cacat yang migrasi 154 dokumentasikan,
    -- dan blok verifikasi di bawah sempat mengulanginya: uji mutasi lolos
    -- karena ia memeriksa tabel di schema LAIN.
    IF to_regclass(current_schema() || '.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_protect_created_at ON %I; ' ||
      'CREATE TRIGGER trg_protect_created_at ' ||
      'BEFORE UPDATE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION protect_created_at()',
      tbl, tbl
    );
  END LOOP;

  -- ── Verifikasi: benar-benar terpasang ─────────────────────────────────────
  -- Migrasi 037 "berhasil" tanpa meninggalkan satu trigger pun. Tanpa blok ini,
  -- migrasi 166 bisa mengulangi persis kegagalan yang sama.
  FOREACH tbl IN ARRAY ARRAY[
    'projects', 'invoices', 'payments', 'kasbons',
    'project_expenses', 'mandor_assignments', 'work_scopes',
    'audit_logs', 'users', 'clients'
  ] LOOP
    IF to_regclass(current_schema() || '.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname = 'trg_protect_created_at'
         AND tgrelid = to_regclass(current_schema() || '.' || tbl)
    ) THEN
      hilang := hilang || tbl || ' ';
    END IF;
  END LOOP;

  IF hilang <> '' THEN
    RAISE EXCEPTION 'trg_protect_created_at TIDAK terpasang sesudah migrasi 166: %', hilang;
  END IF;
END $$;
