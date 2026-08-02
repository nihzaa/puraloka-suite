-- ============================================================
-- PURALOKA SUITE — Migration 165
-- `fn_kasbon_approved_create_expense` tanpa skema yang dipaku.
-- ============================================================
--
-- ── Cacat: bugfix yang tak pernah sampai ke tempat yang diuji
--
-- Migrasi `100_fix_kasbon_expense_trigger_on_conflict.sql` memperbaiki bug
-- nyata — `ON CONFLICT ref_id` (tanpa kurung, dan tanpa predikat index
-- parsial) membuat SETIAP approve kasbon gagal dengan:
--
--     there is no unique or exclusion constraint matching the
--     ON CONFLICT specification
--
-- Perbaikannya benar. Masalahnya ia ditulis sebagai:
--
--     CREATE OR REPLACE FUNCTION public.fn_kasbon_approved_create_expense()
--                                ^^^^^^^
--
-- Skema dipaku ke `public`. Saat test menjalankan rantai migrasi di schema
-- `test` (isolasi antar-run, lihat `test-utils/test-db.ts`), migrasi 051
-- membuat versi RUSAK di `test`, lalu migrasi 100 menimpa versi di `public` —
-- dan versi rusak di `test` tak pernah tersentuh.
--
-- Akibatnya bugfix itu **tak bisa diverifikasi oleh test apa pun**. Ia benar di
-- dev dan produksi, tapi setiap test yang menjalankan alur ini akan tetap
-- melihat perilaku lama. Diverifikasi 2026-08-02 dengan membaca `prosrc` di
-- kedua schema:
--
--   public : ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING   ← benar
--   test   : ON CONFLICT ref_id                                          ← rusak
--
-- ── Kenapa ini lebih dari sekadar ketidaknyamanan test
--
-- Migrasi yang memaku skema adalah migrasi yang berbohong tentang dirinya:
-- ia "berhasil" di lingkungan apa pun, tapi hanya berefek di satu. Kelas cacat
-- yang sama dengan trigger hilang (migrasi 161/162/164) — semuanya berbentuk
-- "berhasil tanpa melakukan apa-apa".
--
-- Repo ini sudah pernah menemuinya: `154_guard_regclass_schema_aware.sql`
-- memperbaiki `to_regclass` yang mengabaikan `search_path`. Ini kejadian kedua
-- dengan sebab yang sama.
--
-- ── Yang migrasi ini lakukan
--
-- Mendefinisikan ulang fungsinya TANPA kualifikasi skema, sehingga ia mendarat
-- di schema yang sedang aktif (`search_path`) — `public` di dev/produksi,
-- `test` saat test berjalan. Isinya identik dengan versi benar di migrasi 100;
-- tak ada perubahan perilaku sama sekali di dev.
--
-- `144_auth_role_per_company.sql` punya pola yang sama (`public.auth_role()`)
-- tapi TIDAK diubah di sini: ia sengaja global — `auth_role()` dipanggil oleh
-- policy RLS yang memang hidup di `public`, dan memindahkannya ke schema test
-- akan mengubah arti policy-nya. Dicatat supaya bedanya tak dikira kelalaian.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_kasbon_approved_create_expense()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_project_id UUID;
  v_cat_id     UUID;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    SELECT ma.project_id INTO v_project_id
    FROM work_scopes ws
    JOIN mandor_assignments ma ON ma.id = ws.assignment_id
    WHERE ws.id = NEW.work_scope_id;

    -- Kasbon bisa terikat proyek langsung tanpa scope (migrasi 056).
    IF v_project_id IS NULL THEN
      v_project_id := NEW.project_id;
    END IF;

    IF v_project_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT id INTO v_cat_id
    FROM project_expense_categories
    WHERE project_id = v_project_id
      AND (name ILIKE '%kasbon%' OR name ILIKE '%upah%')
    ORDER BY (name ILIKE '%kasbon%') DESC
    LIMIT 1;

    IF v_cat_id IS NULL THEN
      SELECT id INTO v_cat_id
      FROM project_expense_categories
      WHERE project_id = v_project_id
      LIMIT 1;
    END IF;

    IF v_cat_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO project_expenses (
      project_id, category_id, expense_source, description, expense_date,
      qty, unit_price, total_amount, status, submitted_by, ref_type, ref_id
    ) VALUES (
      v_project_id, v_cat_id, 'main_cash',
      'Kasbon mandor: ' || NEW.purpose::TEXT,
      NEW.kasbon_date, 1, NEW.amount, NEW.amount, 'approved',
      COALESCE(NEW.approved_by, NEW.requested_by), 'kasbon', NEW.id
    )
    -- Predikat index parsial WAJIB disebut agar dipakai sebagai arbiter —
    -- inti perbaikan migrasi 100, dipertahankan persis.
    ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;

COMMENT ON FUNCTION fn_kasbon_approved_create_expense() IS
  'Catat kasbon yang disetujui sebagai beban proyek. Didefinisikan ulang tanpa '
  'kualifikasi skema di migrasi 165: versi migrasi 100 memaku `public.` '
  'sehingga bugfix-nya tak pernah sampai ke schema test dan tak bisa '
  'diverifikasi test apa pun.';

-- ── Verifikasi: fungsi di schema AKTIF memuat perbaikannya ──────────────────
DO $$
DECLARE
  v_src TEXT;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'fn_kasbon_approved_create_expense'
     AND n.nspname = current_schema();

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'fn_kasbon_approved_create_expense tak ada di schema % sesudah migrasi 165', current_schema();
  END IF;

  IF v_src NOT LIKE '%ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'fn_kasbon_approved_create_expense di schema % masih versi rusak', current_schema();
  END IF;
END $$;
