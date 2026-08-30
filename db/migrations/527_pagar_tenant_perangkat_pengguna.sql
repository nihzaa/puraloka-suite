-- ============================================================================
-- 527 — `perangkat_pengguna` di-FORCE tanpa pagar tenant RESTRICTIVE
-- ============================================================================
--
-- ── Yang bocor
--
-- Tabel ini punya DUA policy, keduanya PERMISSIVE:
--
--     perangkat_pengguna_self   USING (user_id = auth_user_id())
--     tenant_isolation          USING (company_id = auth_company_id())
--
-- PERMISSIVE digabung dengan **OR**. Artinya baris terbaca bila SALAH SATU
-- terpenuhi — dan `perangkat_pengguna_self` tak menyebut `company_id` sama
-- sekali. Pagar tenant di sebelahnya tidak menyaring apa pun; ia hanya
-- MENAMBAH jalan masuk kedua.
--
-- Ini bentuk cacat yang sama persis dengan `document_number_series` yang
-- dicatat di CLAUDE.md §6: satu policy permissive yang hanya memeriksa
-- identitas MEMBATALKAN penyaringan saudaranya, tanpa satu pun galat.
--
-- ── Kenapa baru ketahuan sekarang
--
-- Migrasi 438 memasang policy tenant-nya bernama `perangkat_pengguna_tenant`,
-- nama yang luput dari pemindaian global migrasi 216. Commit 2026-08-31
-- me-rename-nya jadi `tenant_isolation` supaya 216 berhasil — dan rename itu
-- membuat `audit-tabel-force-berpagar.mjs` akhirnya BISA melihat tabel ini
-- dan langsung melaporkannya merah.
--
-- Jadi cacatnya tidak dibuat oleh rename itu. Rename itu yang MENGUNGKAPNYA.
-- Tabel ini sudah terbaca lintas tenant sejak 438 dipasang.
--
-- ── Perbaikannya
--
-- Policy tenant dijadikan RESTRICTIVE. RESTRICTIVE digabung dengan **AND**,
-- jadi ia berlaku pada SEMUA jalan masuk, termasuk `_self`. Sesudah ini,
-- pemilik perangkat tetap hanya melihat perangkatnya sendiri — DAN hanya
-- selama perangkat itu di tenant yang sama.
--
-- Diperiksa lebih dulu: nol baris ber-`company_id` NULL (diukur 2026-08-31).
-- Baris NULL akan lenyap dari pandangan semua orang tanpa galat, jadi
-- pemeriksaan itu bukan formalitas — blok verifikasi di bawah mengulanginya.
--
-- Idempoten.

DO $$
DECLARE
  n_null int;
BEGIN
  IF to_regclass('public.perangkat_pengguna') IS NULL THEN
    RAISE NOTICE '527: tabel perangkat_pengguna belum ada — dilewati.';
    RETURN;
  END IF;

  -- Baris NULL akan HILANG dari pandangan semua orang begitu pagar dipasang.
  -- Lebih baik migrasinya berhenti daripada data lenyap diam-diam.
  SELECT count(*) INTO n_null FROM public.perangkat_pengguna WHERE company_id IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION '527 berhenti: % baris perangkat_pengguna ber-company_id NULL. '
                    'Isi dulu company_id-nya — pagar RESTRICTIVE akan menyembunyikan '
                    'baris NULL dari SEMUA pengguna tanpa galat.', n_null;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.perangkat_pengguna';
  EXECUTE 'CREATE POLICY tenant_isolation ON public.perangkat_pengguna AS RESTRICTIVE FOR ALL
             USING (company_id = (SELECT auth_company_id()))
             WITH CHECK (company_id = (SELECT auth_company_id()))';
END $$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_restrictive int;
  n_permissive int;
BEGIN
  IF to_regclass('public.perangkat_pengguna') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO n_restrictive FROM pg_policy
   WHERE polrelid = 'public.perangkat_pengguna'::regclass AND NOT polpermissive;
  IF n_restrictive < 1 THEN
    RAISE EXCEPTION '527 gagal: perangkat_pengguna masih tanpa policy RESTRICTIVE';
  END IF;

  -- Himpunan PERMISSIVE kosong bernilai FALSE — tabel jadi tak terbaca SIAPA PUN.
  SELECT count(*) INTO n_permissive FROM pg_policy
   WHERE polrelid = 'public.perangkat_pengguna'::regclass AND polpermissive;
  IF n_permissive < 1 THEN
    RAISE EXCEPTION '527 gagal: nol policy PERMISSIVE — tabel tak terbaca siapa pun';
  END IF;

  RAISE NOTICE '527 OK: perangkat_pengguna berpagar RESTRICTIVE (% permissive tersisa).', n_permissive;
END $$;
