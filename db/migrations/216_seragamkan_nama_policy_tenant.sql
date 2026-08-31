-- ============================================================================
-- 216 — Seragamkan nama policy tenant: `<tabel>_tenant` → `tenant_isolation`
-- ============================================================================
--
-- ── Cacat yang diperbaiki
--
-- Migrasi 212 dan 215 menamai policy RESTRICTIVE-nya `<tabel>_tenant`,
-- sementara 142 tabel lain memakai `tenant_isolation`. Isolasinya SENDIRI
-- tidak bocor — policy-nya bekerja persis sama, dan skrip invarian mengujinya
-- dengan mencari policy RESTRICTIVE ber-`auth_company_id()`, bukan namanya.
--
-- Yang rusak: `t5a-policy-tenant.test.ts` dan `t7-exit-criteria-l2.test.ts`
-- memeriksa keberadaan policy BERNAMA `tenant_isolation` di setiap tabel
-- ber-tenant. Kedua test itu merah, dan pesannya tepat:
--
--   "Tabel ber-tenant tanpa policy tenant_isolation = data terbaca LINTAS
--    company. Kalau ini tabel baru, tambahkan policy-nya."
--
-- ── Kenapa nama itu penting, bukan sekadar kerapian
--
-- Pemeriksaan lintas-repo hanya bisa diandalkan kalau ada SATU nama yang
-- dicari. Nama yang bervariasi memaksa penjaganya menebak pola, dan penjaga
-- yang menebak akan melewatkan tabel yang polanya sedikit berbeda — lalu
-- tabel itu benar-benar bocor tanpa satu pun test merah.
--
-- Kelompok B (migrasi 211) sudah memakai nama yang benar; yang menyimpang
-- hanya 212 dan 215. Diperbaiki di sini, bukan dengan melonggarkan test-nya.
--
-- Idempoten. Verifikasi di blok akhir.

DO $$
DECLARE
  t text;
  lama text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Kelompok C (migrasi 212)
    'milestone_dependencies','hari_libur','pola_kerja',
    'kebutuhan_sumber_daya','method_statement',
    -- Kelompok D (migrasi 215)
    'register_gambar','transmittal','transmittal_item',
    'notulen_rapat','notulen_tindakan','matriks_distribusi',
    'tanda_tangan_elektronik','jadwal_distribusi_laporan']
  LOOP
    lama := t || '_tenant';

    -- Hanya ganti nama bila yang lama memang ada DAN yang baru belum.
    IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                WHERE c.relname = t AND p.polname = lama)
       AND NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                        WHERE c.relname = t AND p.polname = 'tenant_isolation')
    THEN
      EXECUTE format('ALTER POLICY %I ON %I RENAME TO tenant_isolation', lama, t);
    END IF;
  END LOOP;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  n_salah int;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'milestone_dependencies','hari_libur','pola_kerja',
    'kebutuhan_sumber_daya','method_statement',
    'register_gambar','transmittal','transmittal_item',
    'notulen_rapat','notulen_tindakan','matriks_distribusi',
    'tanda_tangan_elektronik','jadwal_distribusi_laporan']
  LOOP
    -- Ada, RESTRICTIVE, dan benar-benar menyaring company. Ketiganya
    -- diperiksa: policy bernama benar yang isinya salah lebih berbahaya
    -- daripada nama yang salah, karena ia LOLOS pemeriksaan nama.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = t
         AND p.polname = 'tenant_isolation'
         AND p.polpermissive = false
         AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_company_id%'
    ) THEN
      RAISE EXCEPTION 'Tabel % tak punya policy tenant_isolation RESTRICTIVE penyaring company', t;
    END IF;
  END LOOP;

  /*
    Nol sisa nama lama DI ANTARA TABEL YANG MIGRASI INI TANGANI.

    ── Kenapa dipersempit (2026-09-01)

    Versi pertama menghitung SELURUH basis, dan itu menuntut sesuatu yang
    tak bisa dipenuhi migrasi ini — tuntutannya membusuk begitu tabel BARU
    lahir dengan nama policy berakhiran `_tenant`.

    Terjadi: migrasi 544 membuat `entitlement_baca_tenant` dan
    `entitlement_pagar_tenant` pada `entitlement_snapshot` — tabel yang
    BELUM ADA saat 216 ditulis. Akibatnya 216 gagal, tak tercatat, dan
    MENGHENTIKAN seluruh rantai di belakangnya:

        ✕ 216  Masih ada 2 policy bernama <tabel>_tenant
          BERHENTI — sisa 145 tak pernah dijalankan

    Migrasi tak boleh memaksakan aturan penamaan atas tabel yang lahir
    SESUDAHNYA. Kalau aturan itu memang harus berlaku menyeluruh,
    tempatnya penjaga CI yang bisa diperbarui — bukan verifikasi migrasi
    lama yang beku di masa lalu.

    Menyunting 216 sah: diperiksa ke buku migrasi, ia BELUM PERNAH
    tercatat. G-2 melarang menyunting yang SUDAH tercatat.
  */
  SELECT count(*) INTO n_salah
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE p.polname LIKE '%_tenant'
     AND c.relname = ANY (ARRAY[
       'milestone_dependencies','hari_libur','pola_kerja',
       'kebutuhan_sumber_daya','method_statement',
       'register_gambar','transmittal','transmittal_item',
       'notulen_rapat','notulen_tindakan','matriks_distribusi',
       'tanda_tangan_elektronik','jadwal_distribusi_laporan']);

  IF n_salah > 0 THEN
    RAISE EXCEPTION 'Masih ada % policy bernama <tabel>_tenant', n_salah;
  END IF;

  RAISE NOTICE 'VERIFIKASI 216: 13 policy diseragamkan jadi tenant_isolation, nol sisa nama lama.';
END $$;
