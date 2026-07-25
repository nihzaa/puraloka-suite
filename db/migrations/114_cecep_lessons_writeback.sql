-- Migration 114 — CECEP Milestone 4: Lessons Learned WRITE-BACK (Program C)
--   Company Intelligence Loop ditutup — DENGAN gerbang manusia (keputusan founder).
--
-- Keputusan founder pasca-discovery:
--   1. Lesson menyimpan USULAN KONKRET (lesson_propagation_proposals). Manusia
--      approve lesson + daftar usulan spesifik via engine approval (ADR-007, titik
--      ke-3 dari `47` §3). Approve = commit usulan itu. Bukan auto-commit tanpa
--      persetujuan ("AI tidak boleh langsung belajar", verbatim founder).
--   2. Nilai disimpan APA ADANYA sebagai versi baru (source='variance'). Blending/
--      pembobotan antar versi = keputusan terpisah (AI Estimation), bukan di sini.
--
-- Interaksi dgn immutability M1-M2: propagasi MEMBUAT VERSI BARU, tak pernah mutate.
-- Guard immutability Productivity/Price Book JUSTRU menegakkan pola ini.
--
-- LINGKUP write-back sekarang: Productivity + Price Book (nilai tunggal, bersih).
-- Assembly propagation (versi baru multi-komponen) DITUNDA — lebih kompleks,
-- additive lewat migration sendiri saat dibutuhkan. target_type dibatasi ke dua itu.

-- ─── 1. Tabel usulan propagasi (child dari lessons_learned_records) ──────────

CREATE TABLE IF NOT EXISTS lesson_propagation_proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id         UUID NOT NULL REFERENCES lessons_learned_records(id) ON DELETE CASCADE,

  -- Target knowledge base. Assembly ditunda (multi-komponen).
  target_type       TEXT NOT NULL CHECK (target_type IN ('productivity', 'price_book')),

  -- Referensi (keduanya butuh resource; productivity juga butuh cost_code).
  resource_id       UUID NOT NULL REFERENCES resources(id),
  cost_code_id      UUID REFERENCES cost_codes(id),

  -- Nilai yang diusulkan: koefisien produktivitas ATAU harga (apa adanya, source=variance).
  proposed_value    NUMERIC(18, 4) NOT NULL CHECK (proposed_value > 0),
  currency          TEXT NOT NULL DEFAULT 'IDR',    -- dipakai price_book

  -- Traceability: diisi saat propagasi — versi baru mana yang tercipta dari usulan ini.
  created_record_id UUID,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- productivity WAJIB cost_code (identitas = resource×cost_code×versi).
  CONSTRAINT proposal_shape CHECK (
    (target_type = 'productivity' AND cost_code_id IS NOT NULL) OR
    (target_type = 'price_book')
  )
);

CREATE INDEX IF NOT EXISTS idx_proposal_lesson ON lesson_propagation_proposals(lesson_id);

COMMENT ON TABLE lesson_propagation_proposals IS
  'CECEP — usulan konkret perubahan knowledge base dari sebuah Lessons Learned. '
  'Manusia approve lesson = menyetujui usulan-usulan ini. Propagasi (approved→'
  'propagated) membuat VERSI BARU di Productivity/Price Book PERSIS dari usulan '
  '(source=variance), tak pernah mutate versi lama (ADR-009).';

-- ─── 2. Usulan hanya bisa diubah saat lesson draft ──────────────────────────

CREATE OR REPLACE FUNCTION fn_proposal_parent_draft()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_status TEXT; v_lid UUID;
BEGIN
  v_lid := COALESCE(NEW.lesson_id, OLD.lesson_id);
  SELECT status INTO v_status FROM lessons_learned_records WHERE id = v_lid;
  -- created_record_id diisi SAAT propagasi (status berubah ke propagated) → izinkan
  -- UPDATE kolom itu meski bukan draft (itu penulisan traceability oleh sistem,
  -- bukan edit usulan). Deteksi: hanya created_record_id yang berubah.
  IF TG_OP = 'UPDATE'
     AND (NEW.target_type, NEW.resource_id, NEW.cost_code_id, NEW.proposed_value, NEW.currency)
       IS NOT DISTINCT FROM
         (OLD.target_type, OLD.resource_id, OLD.cost_code_id, OLD.proposed_value, OLD.currency)
  THEN
    RETURN NEW; -- hanya created_record_id/traceability yang berubah
  END IF;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION
      'Usulan propagasi hanya bisa diubah saat Lessons Learned berstatus draft (kini %).', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_proposal_parent_draft ON lesson_propagation_proposals;
CREATE TRIGGER trg_proposal_parent_draft
  BEFORE INSERT OR UPDATE OR DELETE ON lesson_propagation_proposals
  FOR EACH ROW EXECUTE FUNCTION fn_proposal_parent_draft();

-- ─── 3. Relaksasi lifecycle: izinkan approved→propagated (write-back aktif) ──
--   Mengganti guard migration 113 yang menolaknya. Sekarang propagasi resmi ada,
--   TAPI hanya dipicu lewat endanya (approve final via engine → propagate). Transisi
--   ke propagated men-set propagated_at; tak bisa mundur dari propagated.

CREATE OR REPLACE FUNCTION fn_lessons_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'draft'        AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review' AND NEW.status = 'approved')
    OR (OLD.status = 'under_review' AND NEW.status = 'draft')
    OR (OLD.status = 'approved'     AND NEW.status = 'propagated')   -- write-back (kini aktif)
  ) THEN
    RAISE EXCEPTION
      'Transisi status Lessons Learned tidak sah: % → %. Alur sah: '
      'draft→under_review→approved→propagated, under_review→draft.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved'   AND NEW.approved_at   IS NULL THEN NEW.approved_at   := now(); END IF;
  IF NEW.status = 'propagated' AND NEW.propagated_at IS NULL THEN NEW.propagated_at := now(); END IF;
  IF NEW.status = 'draft' THEN NEW.approved_by := NULL; NEW.approved_at := NULL; END IF;
  RETURN NEW;
END $function$;

-- ─── 4. Capability approve (ADR-004) + rantai approval (titik ke-3, `47` §3) ─

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:lessons:approve', 'cecep', 'Setujui & Propagasi Lessons Learned',
   'Menyetujui lessons learned — memicu propagasi usulan ke knowledge base', 33)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:lessons:approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO approval_chains (entity_type, label) VALUES
  ('lessons_learned', 'Persetujuan Lessons Learned')
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label)
SELECT c.id, 1, 'cecep:lessons:approve', NULL, 'Persetujuan'
FROM approval_chains c WHERE c.entity_type = 'lessons_learned'
ON CONFLICT (chain_id, level) DO NOTHING;

-- ─── 5. RLS untuk tabel usulan ──────────────────────────────────────────────

ALTER TABLE lesson_propagation_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_read ON lesson_propagation_proposals;
CREATE POLICY proposal_read ON lesson_propagation_proposals
  FOR SELECT USING (has_permission('cecep:lessons:view'));
DROP POLICY IF EXISTS proposal_write ON lesson_propagation_proposals;
CREATE POLICY proposal_write ON lesson_propagation_proposals
  FOR ALL USING (has_permission('cecep:lessons:manage'))
  WITH CHECK (has_permission('cecep:lessons:manage'));

-- ─── 6. Fungsi propagasi ATOMIK ─────────────────────────────────────────────
--
-- Propagasi menyentuh beberapa tabel knowledge base sekaligus; harus all-or-nothing
-- (versi tercipta + lesson jadi 'propagated' dalam SATU transaksi). Kalau separuh
-- jalan gagal, tak boleh ada versi yatim atau lesson yang "approved tapi sebagian
-- terpropagasi". Fungsi = satu transaksi implisit → atomik.
--
-- Dipanggil API SETELAH approval final via engine (status lesson sudah 'approved').
-- Membuat VERSI BARU (tak pernah mutate) — konsisten immutability M1-M2.

CREATE OR REPLACE FUNCTION fn_propagate_lesson(p_lesson_id UUID, p_approver UUID)
RETURNS TABLE(target_type TEXT, created_record_id UUID)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
  r        RECORD;
  v_new_id UUID;
  v_next   INT;
BEGIN
  SELECT status INTO v_status FROM lessons_learned_records WHERE id = p_lesson_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lessons Learned tidak ditemukan: %', p_lesson_id;
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Propagasi hanya dari status approved (kini %). Approve dulu lewat engine.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  FOR r IN SELECT * FROM lesson_propagation_proposals WHERE lesson_id = p_lesson_id LOOP
    IF r.target_type = 'productivity' THEN
      -- Versi produktivitas BARU dari nilai aktual (source=variance). Immutable.
      SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
      FROM productivity_records WHERE resource_id = r.resource_id AND cost_code_id = r.cost_code_id;
      INSERT INTO productivity_records
        (resource_id, cost_code_id, version_number, productivity_value, source, created_by)
      VALUES (r.resource_id, r.cost_code_id, v_next, r.proposed_value, 'variance', p_approver)
      RETURNING id INTO v_new_id;

    ELSIF r.target_type = 'price_book' THEN
      -- Entry harga BARU, langsung 'verified' — approval lesson = verifikasi harga
      -- (gerbang manusia). Bukan 'active' (menjadikannya harga berlaku = keputusan
      -- operasional terpisah, lewat lifecycle Price Book normal).
      SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
      FROM price_book_entries WHERE resource_id = r.resource_id;
      INSERT INTO price_book_entries
        (resource_id, amount, currency, version_number, effective_date,
         confidence_level, status, verified_by, verified_at, created_by)
      VALUES (r.resource_id, r.proposed_value, r.currency, v_next, CURRENT_DATE,
              'high', 'verified', p_approver, now(), p_approver)
      RETURNING id INTO v_new_id;
    ELSE
      RAISE EXCEPTION 'target_type propagasi tak dikenal: %', r.target_type;
    END IF;

    UPDATE lesson_propagation_proposals SET created_record_id = v_new_id WHERE id = r.id;
    target_type := r.target_type; created_record_id := v_new_id; RETURN NEXT;
  END LOOP;

  UPDATE lessons_learned_records SET status = 'propagated' WHERE id = p_lesson_id;
END $function$;
