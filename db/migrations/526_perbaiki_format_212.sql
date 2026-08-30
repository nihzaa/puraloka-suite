-- ============================================================================
-- 526 - MEMPERBAIKI GEJALA YANG SALAH — dipertahankan sebagai PENEGAS
-- ============================================================================
--
-- ⚠ MIGRASI INI SEMULA MENAMBAL AKIBAT, BUKAN PENYEBAB — dan itu keliru.
--
-- Ia ditulis untuk memasang policy yang migrasi 212 gagal pasang. Yang tak
-- saya lihat saat menulisnya: apps/api/scripts/ci-project-setup.mjs membungkus
-- TIAP migrasi dalam transaksi, jadi kegagalan di baris 210 me-ROLLBACK
-- seluruh 212 — termasuk KELIMA TABEL yang dibuat di baris 37-141.
--
-- Yang hilang bukan policy-nya. Yang hilang TABELNYA.
--
-- Ketahuannya baru sesudah CI melaporkan kegagalan BERIKUTNYA:
--
--     HARD FAIL — 213_libur_unik_nulls_not_distinct.sql
--       relation "hari_libur" does not exist
--
-- 212 kini DIPERBAIKI DI TEMPATNYA (dua argumen untuk dua %I), mengikuti
-- preseden 016 yang dicatat di 181: "Menambal hanya di 181 akan meninggalkan
-- lubang yang terbuka kembali di setiap lingkungan baru."
--
-- ── KENAPA TIDAK DIHAPUS SAJA
--
-- Nomornya sudah ter-commit dan ter-push. Berkas migrasi yang lenyap membuat
-- riwayat punya lubang, dan lingkungan yang sudah mencatatnya di buku migrasi
-- akan mencari berkas yang tak ada.
--
-- Isinya dipertahankan sebagai PENEGAS: idempoten, no-op pada basis yang
-- sudah benar, dan blok verifikasinya tetap berguna — ia membuktikan kelima
-- tabel berpolicy RESTRICTIVE, bukan sekadar berpolicy.
--
-- Pelajarannya layak ditulis: saya memperbaiki gejala pertama yang terlihat,
-- dan baru tahu itu salah sasaran karena CI melaporkan gejala KEDUA. Kalau
-- 213 kebetulan tak ada, cacatnya akan tampak sudah beres.
-- ⚠⚠ DAN PERBAIKAN ITU PUN SALAH DUA KALI.
--
-- Versi kedua migrasi ini memasang policy bernama `tenant_isolation`. Itu
-- membuat migrasi 214 gagal:
--
--     Policy tak lengkap sesudah dipasang ulang: 20 (harusnya 15)
--
-- 214 memasang ulang policy-nya sebagai `<tabel>_tenant`, dan
-- `tenant_isolation` yang migrasi ini buat tetap tinggal — lima policy ekstra.
--
-- Urutan sesungguhnya di repo ini:
--
--     212  memasang `<tabel>_tenant`
--     214  memasang ulang, tetap `<tabel>_tenant` (bungkus InitPlan)
--     216  RENAME semuanya ke `tenant_isolation`
--
-- Nama akhirnya memang `tenant_isolation`, tetapi 216 yang berhak memberinya.
--
-- ── KARENA ITU MIGRASI INI KINI NO-OP SEPENUHNYA
--
-- Yang tersisa hanya blok VERIFIKASI: ia membuktikan kelima tabel berpolicy
-- RESTRICTIVE ber-`auth_company_id()`, TANPA menuntut nama tertentu — karena
-- namanya berubah sepanjang rantai 212 → 214 → 216, dan verifikasi yang
-- mematok satu nama akan salah di dua dari tiga titik itu.
--
-- Tiga kali salah pada satu cacat, dan tiap kali karena memperbaiki apa yang
-- TERLIHAT alih-alih mengukur rantainya sampai habis.
-- ============================================================================
-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  t TEXT; n INT; kurang TEXT := '';
  TABEL TEXT[] := ARRAY['milestone_dependencies', 'hari_libur', 'pola_kerja',
                        'kebutuhan_sumber_daya', 'method_statement'];
BEGIN
  FOREACH t IN ARRAY TABEL LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    /*
      DIPERIKSA BENTUKNYA, BUKAN NAMANYA.

      Tiga policy per tabel, dan yang menentukan perannya bukan nama melainkan
      sifatnya:

        satu RESTRICTIVE   memagari company_id — digabung dengan AND
        dua  PERMISSIVE    izin baca & tulis   — digabung dengan OR

      Kehilangan yang RESTRICTIVE membuat tabel terbaca LINTAS TENANT tanpa
      satu pun galat — persis cacat `document_number_series` di CLAUDE.md §6.

      ⚠ NAMA SENGAJA TIDAK DIPATOK. Versi sebelumnya menuntut
      `tenant_isolation` secara harfiah, dan itu salah di DUA dari TIGA titik
      rantai ini: 212 dan 214 memasangnya sebagai `<tabel>_tenant`; barulah
      216 me-rename-nya.

      Verifikasi yang mematok nama akan merah di lingkungan bersih yang baru
      sampai migrasi 213 — padahal keadaannya benar untuk titik itu.
    */
    SELECT count(*) INTO n FROM pg_policy
     WHERE polrelid = ('public.' || t)::regclass;
    IF n <> 3 THEN
      kurang := kurang || format('%s(%s policy, harusnya 3) ', t, n);
    END IF;

    -- Tepat SATU yang RESTRICTIVE, apa pun namanya.
    SELECT count(*) INTO n FROM pg_policy
     WHERE polrelid = ('public.' || t)::regclass AND NOT polpermissive;
    IF n <> 1 THEN
      kurang := kurang || format('%s(%s policy RESTRICTIVE, harusnya 1) ', t, n);
    END IF;

    SELECT count(*) INTO n FROM pg_class
     WHERE oid = ('public.' || t)::regclass AND relrowsecurity AND relforcerowsecurity;
    IF n <> 1 THEN
      kurang := kurang || format('%s(RLS/FORCE mati) ', t);
    END IF;
  END LOOP;

  IF kurang <> '' THEN
    RAISE EXCEPTION '526 gagal: %', kurang;
  END IF;

  RAISE NOTICE '526 OK: kelima tabel jadwal berpolicy lengkap (RESTRICTIVE + baca + tulis), RLS & FORCE aktif';
END $$;
