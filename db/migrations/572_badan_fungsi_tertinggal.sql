-- ============================================================================
-- 572 — Empat badan fungsi yang migrasinya TERCATAT jalan dan tak pernah
--       berlaku
-- ============================================================================
--
-- ── Asalnya
--
-- Bukan dari gejala. Ditemukan 2026-09-13 oleh penjaga yang lahir dari cacat
-- migrasi 111 (lihat 570), yang membandingkan BADAN fungsi di basis dengan
-- migrasi terakhir yang mendefinisikannya:
--
--     node apps/api/scripts/audit-badan-fungsi-mutakhir.mjs
--
-- Jalan pertamanya menemukan tujuh selisih. Ditelusuri satu per satu, sebab
-- angka tanpa penelusuran bukan temuan melainkan tersangka:
--
--   · has_permission                     → ditutup migrasi 571
--   · generate_gr_number                 → BUKAN selisih: `now(), 'yyyy'`
--                                          vs `now(),'yyyy'`. Spasi. Logika
--                                          identik; tak ada yang perlu
--                                          diperbaiki
--   · fn_lessons_status_transition       → SENGAJA berbeda, R-013 (lihat
--                                          catatan di bawah — JANGAN ditutup)
--   · empat sisanya                      → berkas ini
--
-- ── ⚠ KENAPA `fn_lessons_status_transition` TIDAK ADA DI BERKAS INI
--
-- Ia muncul di keluaran penjaga, dan ia HARUS tetap berbeda.
--
-- Berkas migrasi 114 mengaktifkan `approved → propagated`. Basis menolaknya
-- dengan pesan yang menyatakan alasannya sendiri: *"BELUM diaktifkan —
-- mekanisme propagasi via approval belum di-wire (butuh keputusan founder)"*.
--
-- Basisnya yang BENAR. Propagasi menulis `productivity_records` dan
-- `price_book_entries` — angka yang dipakai menghitung RAB proyek
-- BERIKUTNYA. RATIFIKASI R-013 membukanya sebagai keputusan founder dan
-- belum dijawab.
--
-- Menyamakannya ke berkas di sini akan MENGAKTIFKAN propagasi lewat migrasi
-- perapian — keputusan produk yang turun diam-diam sebagai efek samping
-- kerapian teknis. Dibiarkan berbeda, dan dikecualikan eksplisit di penjaga
-- supaya selisihnya tak terbaca sebagai pekerjaan yang belum selesai.
--
-- ── Keempat yang ditutup di sini
--
--  1 · fn_riwayat_periode_append_only (296) — TERUKUR RUSAK HARI INI
--
--      Basis memuat versi 294: `RAISE EXCEPTION` untuk SEMUA operasi.
--      Migrasi 296 mengecualikan CASCADE lewat `pg_trigger_depth() > 1`.
--      Direproduksi terhadap basis hidup sebelum berkas ini ditulis:
--
--        INSERT periode → INSERT riwayat → DELETE periode
--        → ❌ "periode_akuntansi_riwayat bersifat append-only: DELETE ditolak"
--
--      Jadi **periode akuntansi tak bisa dihapus sama sekali** — dan
--      galatnya menyebut tabel LAIN daripada yang dihapus, sehingga
--      sebabnya tak terbaca dari pesannya. Persis yang diramalkan kepala
--      migrasi 296.
--
--      Append-only-nya TETAP: UPDATE ditolak tanpa kecuali, DELETE langsung
--      ditolak. Yang diizinkan hanya penghapusan yang menyertai hilangnya
--      INDUKNYA.
--
--  2 · fn_assembly_component_parent_draft (127)
--
--      Basis menolak SEMUA perubahan komponen saat assembly bukan draft.
--      127 menambah pengecualian sempit: UPDATE yang HANYA mengubah
--      `company_id` (pelabelan kepemilikan multi-tenant), dengan seluruh
--      kolom pembentuk isi wajib identik. Tanpa itu, pelabelan tenant atas
--      analisa non-draft mustahil.
--
--  3 · fn_edition_provenance_immutable (118)
--
--      Basis memuat versi 117: identitas DAN provenance sama-sama beku
--      total. 118 menjadikan provenance **write-once** — boleh diisi saat
--      masih NULL (impor pertama), tak boleh diubah sesudah terisi.
--      Dengan badan 117, impor yang mengisi provenance edisi yang baru
--      dibuat DITOLAK.
--
--  4 · fn_kasbon_approved_create_expense (165)
--
--      Basis kehilangan jatuhan `NEW.project_id`. Kasbon yang terikat
--      proyek LANGSUNG tanpa `work_scope` (jalur yang dibuka migrasi 056)
--      karenanya `RETURN NEW` diam-diam — beban proyeknya tak pernah
--      tercatat. Nol galat; yang hilang cuma barisnya.
--
--      ⚠ `ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL` dipertahankan
--      PERSIS — predikat index parsial wajib disebut agar dipakai sebagai
--      arbiter (inti perbaikan migrasi 100).
--
-- ── Semua badan DISALIN VERBATIM dari migrasi asalnya
--
-- Bukan ditulis ulang. Menulis ulang dari ingatan adalah cara paling mudah
-- membuat dua basis yang keduanya "sudah dimigrasi" berperilaku berbeda.
-- ============================================================================

-- ─── 1. fn_riwayat_periode_append_only — dari migrasi 296 ────────────────────
CREATE OR REPLACE FUNCTION fn_riwayat_periode_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- UPDATE selalu ditolak, tanpa kecuali. Tak ada alasan sah mengubah
  -- riwayat yang sudah tercatat.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'periode_akuntansi_riwayat bersifat append-only: UPDATE ditolak';
  END IF;

  -- DELETE: diizinkan HANYA bila berasal dari CASCADE penghapusan induknya
  -- (kedalaman trigger > 1). DELETE langsung tetap ditolak.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'periode_akuntansi_riwayat bersifat append-only: DELETE ditolak. '
    'Riwayat hanya hilang bersama periodenya, dan penghapusan periode itu '
    'sendiri tercatat di audit_logs.';
END $$;

-- ─── 2. fn_assembly_component_parent_draft — dari migrasi 127 ────────────────
CREATE OR REPLACE FUNCTION fn_assembly_component_parent_draft()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
  v_aid    UUID;
BEGIN
  v_aid := COALESCE(NEW.assembly_id, OLD.assembly_id);
  SELECT status INTO v_status FROM assemblies WHERE id = v_aid;

  -- Bila parent-nya ikut terhapus (CASCADE), v_status NULL → izinkan.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    -- Pengecualian sempit: UPDATE yang hanya mengubah company_id.
    -- Seluruh kolom pembentuk ISI harus identik — kalau ada satu saja yang
    -- berbeda, ini bukan pelabelan melainkan edit, dan tetap ditolak.
    IF TG_OP = 'UPDATE'
       AND NEW.assembly_id IS NOT DISTINCT FROM OLD.assembly_id
       AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
       AND NEW.coefficient IS NOT DISTINCT FROM OLD.coefficient
       AND NEW.sort_order  IS NOT DISTINCT FROM OLD.sort_order
       AND NEW.company_id  IS DISTINCT FROM OLD.company_id
    THEN
      RETURN NEW;   -- pelabelan kepemilikan, bukan perubahan analisa
    END IF;

    RAISE EXCEPTION
      'Komponen Assembly hanya bisa diubah saat Assembly berstatus draft (kini %). '
      'Paket kerja yang sudah active beku — buat versi Assembly baru.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

-- ─── 3. fn_edition_provenance_immutable — dari migrasi 118 ───────────────────
CREATE OR REPLACE FUNCTION fn_edition_provenance_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  -- code & publish_date: identitas — beku total.
  IF (NEW.code, NEW.publish_date) IS DISTINCT FROM (OLD.code, OLD.publish_date) THEN
    RAISE EXCEPTION
      'Edisi AHSP (code=%): identitas (code/publish_date) immutable.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  -- provenance impor: WRITE-ONCE — boleh diisi saat masih NULL (impor pertama),
  -- tak pernah boleh DIUBAH/DIKOSONGKAN setelah terisi.
  IF (OLD.se_number     IS NOT NULL AND NEW.se_number     IS DISTINCT FROM OLD.se_number)
  OR (OLD.source_file   IS NOT NULL AND NEW.source_file   IS DISTINCT FROM OLD.source_file)
  OR (OLD.source_sha256 IS NOT NULL AND NEW.source_sha256 IS DISTINCT FROM OLD.source_sha256)
  OR (OLD.imported_at   IS NOT NULL AND NEW.imported_at   IS DISTINCT FROM OLD.imported_at)
  OR (OLD.imported_by   IS NOT NULL AND NEW.imported_by   IS DISTINCT FROM OLD.imported_by)
  THEN
    RAISE EXCEPTION
      'Edisi AHSP (code=%): provenance impor sudah terisi — write-once, tak bisa '
      'diganti. Edisi baru = baris baru.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;

-- ─── 4. fn_kasbon_approved_create_expense — dari migrasi 165 ─────────────────
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
-- Memeriksa ISI keempatnya, bukan keberadaannya — persis cacat yang membuat
-- keempat migrasi asalnya lolos tanpa berlaku. Tiap penanda dipilih karena ia
-- ADA di versi baru dan TIDAK ADA di versi lama yang sedang menempati basis.
DO $$
DECLARE
  n INT;
  kurang TEXT := '';
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = current_schema() AND p.proname = 'fn_riwayat_periode_append_only'
     AND p.prosrc LIKE '%pg_trigger_depth()%';
  IF n < 1 THEN kurang := kurang || ' fn_riwayat_periode_append_only(pg_trigger_depth)'; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = current_schema() AND p.proname = 'fn_assembly_component_parent_draft'
     AND p.prosrc LIKE '%TG_OP = ''UPDATE''%';
  IF n < 1 THEN kurang := kurang || ' fn_assembly_component_parent_draft(TG_OP)'; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = current_schema() AND p.proname = 'fn_edition_provenance_immutable'
     AND p.prosrc LIKE '%OLD.se_number     IS NOT NULL%';
  IF n < 1 THEN kurang := kurang || ' fn_edition_provenance_immutable(write-once)'; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = current_schema() AND p.proname = 'fn_kasbon_approved_create_expense'
     AND p.prosrc LIKE '%v_project_id := NEW.project_id%'
     AND p.prosrc LIKE '%ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL%';
  IF n < 1 THEN kurang := kurang || ' fn_kasbon_approved_create_expense(project_id/ON CONFLICT)'; END IF;

  IF kurang <> '' THEN
    RAISE EXCEPTION '572 gagal: badan fungsi belum mutakhir —%', kurang;
  END IF;

  RAISE NOTICE '572 OK — empat badan fungsi mutakhir (lessons SENGAJA dikecualikan, R-013)';
END $$;
