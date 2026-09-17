-- ============================================================================
-- 576 — `fn_kasbon_approved_create_expense` TEREVERT tiap kali suite jalan
-- ============================================================================
--
-- ── Cacat yang ditutup, dan cara ia ditemukan
--
-- Bukan dari gejala produk. Ditemukan 2026-09-14 karena
-- `audit-badan-fungsi-mutakhir.mjs` (lahir 572) MERAH sesudah suite penuh
-- dijalankan — padahal ia hijau beberapa jam sebelumnya, dan tak ada migrasi
-- baru di antaranya.
--
-- Selisih yang tak bisa dijelaskan adalah temuan yang belum dibuka
-- (CLAUDE.md §8a.2). Ditelusuri dengan event trigger yang MENCATAT tiap
-- penulisan fungsi itu — bukan ditebak:
--
--     skema    objek                                          n
--     test     test.fn_kasbon_approved_create_expense()       2
--     public   public.fn_kasbon_approved_create_expense()     2   ← ini
--
-- Pelakunya `alur-uang-mandor.test.ts`. Ia me-replay sebagian rantai migrasi
-- ke schema `test`, dan salah satunya — **migrasi 100** baris 24 — memaku
-- skemanya:
--
--     CREATE OR REPLACE FUNCTION public.fn_kasbon_approved_create_expense()
--
-- Jadi test yang berjalan di schema TEST menulis ke `public`, dan badan yang
-- didaratkannya versi migrasi 100 — TANPA jatuhan `NEW.project_id` yang
-- ditambahkan 165 dan dipulihkan 572.
--
-- ── Akibatnya, dan kenapa nol gejala
--
-- Kasbon yang terikat proyek LANGSUNG tanpa `work_scope` (jalur yang dibuka
-- migrasi 056) `RETURN NEW` diam-diam — beban proyeknya tak pernah tercatat.
-- Nol galat; yang hilang cuma barisnya.
--
-- Dan pemulihannya tak bertahan: tiap kali suite dijalankan, perbaikan itu
-- terhapus lagi. Diukur berulang, deterministik:
--
--     572 diterapkan          → jatuhan ADA
--     vitest alur-uang-mandor → jatuhan HILANG
--
-- **Test yang LULUS sambil diam-diam membatalkan perbaikan produksi.**
-- Kelas yang lebih halus daripada test merah: yang merah diperbaiki, yang
-- hijau sambil merusak tak seorang pun lihat.
--
-- ── Kenapa migrasi 100 tidak diedit
--
-- §5.5 — migrasi yang sudah tercatat tak boleh disunting. Dan 165 memang
-- SUDAH menutup pemakuan itu untuk dirinya sendiri; yang tak bisa dilakukan
-- 165: mencegah 100 dijalankan ULANG oleh test yang memutar rantainya.
--
-- Dua jalan yang lebih dalam, keduanya di luar berkas ini:
--
--   · mengeluarkan 100 dari `MIGRATION_SUBSET` test itu — mengubah apa yang
--     direplay test, dan 100-lah yang memasang `ON CONFLICT` predikat parsial
--     yang justru diuji di sana;
--   · membuat `runMigrations` menolak migrasi ber-`public.` dipaku — penjaga
--     `audit-migrasi-skema-dipaku.mjs` sudah mengecualikan 100 dengan alasan
--     tertulis, jadi itu keputusan tersendiri.
--
-- Yang dikerjakan di sini: memastikan badan di `public` BENAR lagi, dan
-- memberi penjaga cara melihat kalau ia terevert lagi.
--
-- ⚠ Ini TIDAK mencegah revert berikutnya. Yang mencegahnya penjaga —
-- `audit-badan-fungsi-mutakhir.mjs` kini merah setiap kali itu terjadi, dan
-- catatan ini yang menerangkan sebabnya supaya orang berikutnya tak
-- menghabiskan waktu menelusuri ulang.
--
-- Badan di bawah DISALIN VERBATIM dari migrasi 165 (lewat 572).
-- ============================================================================

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

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Menuntut KEDUA penanda sekaligus. Versi migrasi 100 punya `ON CONFLICT`-nya
-- tetapi TIDAK punya jatuhan `NEW.project_id`; versi 051 sebaliknya. Memeriksa
-- salah satu saja akan hijau pada badan yang salah.
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = current_schema()
     AND p.proname = 'fn_kasbon_approved_create_expense'
     AND p.prosrc LIKE '%v_project_id := NEW.project_id%'
     AND p.prosrc LIKE '%ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL%';

  IF n < 1 THEN
    RAISE EXCEPTION
      '576 gagal: fn_kasbon_approved_create_expense di schema % belum memuat '
      'KEDUA penanda (jatuhan NEW.project_id + predikat ON CONFLICT). Kasbon '
      'tanpa work_scope akan berhenti mencatat beban proyek, tanpa satu pun galat.',
      current_schema();
  END IF;

  RAISE NOTICE '576 OK — kasbon tanpa work_scope kembali mencatat beban (schema %)', current_schema();
END $$;
