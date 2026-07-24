-- Migration 100: 🔴 BUGFIX — trigger approve kasbon SELALU gagal (ON CONFLICT vs index partial)
--
-- TEMUAN (saat wiring Approval Engine 2A-3, tapi BUG-nya PRE-EXISTING sejak 051):
-- `fn_kasbon_approved_create_expense()` memakai `ON CONFLICT (ref_id) DO NOTHING`,
-- padahal unique index-nya PARSIAL:
--     CREATE UNIQUE INDEX idx_project_expenses_ref_id ON project_expenses (ref_id)
--       WHERE (ref_id IS NOT NULL)
-- PostgreSQL TIDAK bisa memakai index parsial sebagai arbiter ON CONFLICT kecuali
-- klausa WHERE-nya ikut disebut. Akibatnya trigger melempar 42P10:
--     "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- → SETIAP approve kasbon (yang punya work_scope + kategori) GAGAL 500.
--
-- DIBUKTIKAN PRE-EXISTING (bukan akibat Approval Engine): `UPDATE kasbons SET
-- status='approved'` lewat SQL MURNI — tanpa API sama sekali — menghasilkan error
-- yang sama persis.
--
-- Kenapa lolos selama ini: trigger hanya menyisipkan bila project_id bisa diresolusi
-- dari `work_scope_id`; kasbon TANPA scope (jalur umum pasca migration 056) langsung
-- RETURN NEW sehingga tak pernah menyentuh ON CONFLICT.
--
-- FIX: sebutkan predikat index parsial pada conflict target. BEHAVIOR-PRESERVING —
-- niat aslinya memang idempotensi per ref_id (ref_id di sini selalu NEW.id, non-null).

CREATE OR REPLACE FUNCTION public.fn_kasbon_approved_create_expense()
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
    -- FIX: predikat index parsial WAJIB disebut agar dipakai sebagai arbiter.
    ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING;

  END IF;
  RETURN NEW;
END $function$;
