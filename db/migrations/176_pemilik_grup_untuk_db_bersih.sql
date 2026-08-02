-- ============================================================================
-- Migration 176 — F0-12: rantai migrasi harus bisa di-replay dari NOL.
-- ============================================================================
--
-- ── Cacat yang diperbaiki
--
-- Ditemukan 2026-08-03 saat menjalankan `ci-project-setup.mjs setup-clean`
-- (wipe + replay 172 migrasi) untuk menuntaskan R-001. Replay berhenti di:
--
--     HARD FAIL — migrasi GAGAL di LUAR allowlist: 137_t9_pemilik_grup.sql
--       137: 1 akar grup tanpa owner_user_id. Grup itu tak akan bisa menambah
--            badan usaha baru dari UI.
--
-- Rantainya:
--
--   1. Migrasi **032** men-seed `company_profile` — jadi profil perusahaan ADA
--      di database yang baru di-wipe.
--   2. Migrasi **126** membuat tenant pertama dari profil itu, dan mengisi
--      `created_by`/`updated_by` dari `v_admin` = admin aktif tertua. Tetapi
--      **tidak ada satu pun user di database yang baru di-wipe** — seed user
--      dijalankan `ci-project-setup.mjs` SETELAH seluruh migrasi selesai.
--      Jadi `v_admin` NULL, dan perusahaan lahir tanpa jejak pemilik.
--   3. Migrasi **137** mem-backfill `companies.owner_user_id` dari
--      `COALESCE(created_by, admin-aktif-tertua)`. Keduanya NULL.
--   4. Penjaga di 137 melempar — **dan itu benar**. Akar grup tanpa pemilik
--      memang tak bisa menambah badan usaha lewat UI, dan tak ada jalan
--      memperbaikinya dari dalam aplikasi.
--
-- ── Kenapa penjaga 137 TIDAK dilemahkan
--
-- Godaan termudah adalah membuat 137 "diam saja kalau tak ada user". Itu salah:
-- penjaga itu justru yang menemukan cacat ini, dan melonggarkannya berarti
-- membiarkan produksi lahir dengan grup tanpa pemilik — persis kondisi yang ia
-- dirancang untuk mencegah. Yang salah bukan penjaganya, melainkan **urutan
-- seed-vs-migrasi**.
--
-- ── Kenapa migrasi baru, bukan mengubah 126/137
--
-- Keduanya SUDAH TERCATAT di `supabase_migrations.schema_migrations` di dev dan
-- pernah berjalan. Mengubah isinya membuat lingkungan yang sudah menjalankannya
-- tak pernah menerima perbaikan ini (buku menganggapnya selesai), sementara
-- lingkungan baru menerima versi yang berbeda dari yang tercatat. Migrasi maju
-- yang terpisah berlaku sama di kedua-duanya.
--
-- ── Apa yang dilakukan migrasi ini
--
-- Mengisi `owner_user_id` untuk akar grup yang masih kosong, dengan urutan
-- prioritas yang sama seperti 137 — lalu, bila database memang belum punya user
-- sama sekali, membiarkannya kosong DENGAN SENGAJA dan mencatat alasannya.
--
-- Bagian terakhir itu yang menyelesaikan F0-12: pada database bersih, kepemilikan
-- BELUM BISA ditentukan karena pemiliknya memang belum ada. Yang benar bukan
-- menebak, melainkan menunda sampai user pertama lahir — dan itu dijamin oleh
-- trigger di bawah, bukan oleh harapan.
--
-- ── Idempoten
--
-- Hanya menyentuh baris yang `owner_user_id`-nya NULL. Dijalankan berapa kali pun
-- hasilnya sama.
-- ============================================================================

-- ── 1. Backfill sekali lagi (untuk lingkungan yang usernya SUDAH ada) ────────
--
-- Di dev, ini no-op: 137 sudah mengisinya. Di lingkungan yang migrasinya
-- di-replay setelah user ada, ini yang menyelamatkannya.
UPDATE companies c
   SET owner_user_id = COALESCE(
     c.created_by,
     (SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.is_active ORDER BY u.created_at LIMIT 1),
     (SELECT u.id FROM users u WHERE u.is_active ORDER BY u.created_at LIMIT 1)
   )
 WHERE c.parent_company_id IS NULL
   AND c.owner_user_id IS NULL;

-- ── 2. Trigger: user pertama otomatis jadi pemilik grup yatim ────────────────
--
-- Inilah yang membuat rantai migrasi bisa di-replay dari nol TANPA melemahkan
-- penjaga mana pun. Pada database bersih, akar grup lahir tanpa pemilik karena
-- pemiliknya memang belum ada; begitu user admin pertama dibuat, trigger ini
-- mengisinya seketika.
--
-- Sengaja `AFTER INSERT` dan hanya menyentuh akar yang masih NULL: ia tidak
-- pernah mengambil alih kepemilikan yang sudah ditetapkan.
-- SENGAJA TANPA `SET search_path`.
--
-- Versi pertama fungsi ini memakai `SET search_path = pg_catalog, public`, dan
-- triggernya **diam-diam tidak bekerja** saat diuji di schema sementara: ia
-- membaca-menulis `public.companies`, bukan tabel di schema tempat migrasi
-- sedang berjalan. Gejalanya persis kelas cacat yang dijaga
-- `audit-guard-schema.mjs` — guard yang bertanya "ada di sini?" tapi menjawab
-- "ada di mana pun?", dan diam sampai ada schema kedua. Repo ini PUNYA schema
-- kedua: schema test.
--
-- Konvensi repo (64 fungsi SECURITY DEFINER, nol di antaranya memakai
-- `SET search_path`) adalah membiarkannya mengikuti search_path pemanggil,
-- sehingga migrasi tetap bisa dijalankan di schema mana pun oleh test harness.
-- Fungsi ini mengikuti konvensi itu.
CREATE OR REPLACE FUNCTION fn_isi_pemilik_grup_yatim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  -- Hanya user aktif yang layak jadi pemilik. User nonaktif sebagai pemilik
  -- menghasilkan grup yang tetap tak bisa menambah badan usaha.
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  UPDATE companies
     SET owner_user_id = NEW.id
   WHERE parent_company_id IS NULL
     AND owner_user_id IS NULL;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION fn_isi_pemilik_grup_yatim() IS
  'F0-12: pada DB yang di-replay dari nol, akar grup lahir sebelum user mana pun ada. '
  'Trigger ini mengisi owner_user_id begitu user aktif pertama lahir. Tak pernah '
  'mengambil alih kepemilikan yang sudah ditetapkan.';

DROP TRIGGER IF EXISTS trg_isi_pemilik_grup_yatim ON users;
CREATE TRIGGER trg_isi_pemilik_grup_yatim
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION fn_isi_pemilik_grup_yatim();

-- ── 3. Verifikasi ───────────────────────────────────────────────────────────
--
-- Dua keadaan yang SAH, dan satu yang tidak:
--
--   sah   : ada user → setiap akar grup punya pemilik
--   sah   : belum ada user sama sekali → akar grup boleh tanpa pemilik,
--           karena trigger di atas menjamin ia terisi saat user pertama lahir
--   TIDAK : ada user, tapi masih ada akar grup tanpa pemilik
DO $$
DECLARE
  v_user  INT;
  v_yatim INT;
BEGIN
  SELECT count(*) INTO v_user FROM users WHERE is_active;
  SELECT count(*) INTO v_yatim FROM companies
   WHERE parent_company_id IS NULL AND owner_user_id IS NULL;

  IF v_user > 0 AND v_yatim > 0 THEN
    RAISE EXCEPTION
      '176: % akar grup tanpa pemilik padahal ada % user aktif. Backfill gagal — '
      'ini BUKAN kondisi database-bersih yang sah.', v_yatim, v_user;
  END IF;

  IF v_user = 0 AND v_yatim > 0 THEN
    RAISE NOTICE
      '176: % akar grup belum punya pemilik — SAH, database ini belum punya user. '
      'Trigger trg_isi_pemilik_grup_yatim akan mengisinya saat user aktif pertama lahir.',
      v_yatim;
  ELSE
    RAISE NOTICE '176: kepemilikan grup terverifikasi (user aktif=%, akar yatim=%).',
      v_user, v_yatim;
  END IF;

  -- Trigger WAJIB benar-benar terpasang. Tanpa ini, jaminan di atas kosong.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal
       AND n.nspname = current_schema()
       AND c.relname = 'users'
       AND t.tgname  = 'trg_isi_pemilik_grup_yatim'
  ) THEN
    RAISE EXCEPTION '176: trigger trg_isi_pemilik_grup_yatim tak terpasang.';
  END IF;
END $$;
