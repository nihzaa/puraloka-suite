-- Migration 111 — CECEP Milestone 3: Estimate Version approval via ADR-007 engine
--
-- Keputusan founder pasca-discovery: WIRE lewat engine approval yang SUDAH ADA
-- (ADR-007), BUKAN jalur approval kelima. Diperkuat mandat CECEP sendiri (`47` §3):
-- "approval_steps WAJIB merujuk role_permissions existing... Approval Workflow SATU
-- mekanisme di TIGA titik (Estimate Version, Price Book, Lessons Learned), bukan
-- tiga sistem terpisah." Membangun sistem approval baru = melanggar Zero-Invention
-- CECEP. Routing 7-dimensi (`44` §12) sengaja DITUNDA (Fase 12, bukti kebutuhan).
--
-- Yang dilakukan migration ini:
--   1. capability approval Estimate Version (ADR-004) — cecep:estimate:approve.
--   2. baris approval_chains + approval_steps untuk entity_type='estimate_version'
--      (seed 1 langkah tanpa ambang → perilaku "butuh satu approval" apa adanya;
--      founder tambah level/ambang lewat UI /pengaturan/approval yang sudah ada).
--   3. relaksasi transisi lifecycle: izinkan under_review→draft (jalur REJECT —
--      estimasi ditolak balik ke draft untuk direvisi). Semua transisi maju tetap
--      seperti migration 110.

-- ─── 1. Capability approval (ADR-004: capability, bukan literal role) ────────

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:estimate:approve', 'cecep', 'Setujui Estimasi',
   'Menyetujui/menolak Estimate Version yang diajukan (via engine approval)', 28)
ON CONFLICT (key) DO NOTHING;

-- Seed ke admin (perilaku hari ini: admin approver). Founder bisa memberikannya ke
-- role lain (mis. direktur) lewat UI role editor — persis pola 4 modul lain.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:estimate:approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 2. Rantai approval Estimate Version (seed = 1 langkah, tanpa ambang) ────

INSERT INTO approval_chains (entity_type, label) VALUES
  ('estimate_version', 'Persetujuan Estimasi')
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label)
SELECT c.id, 1, 'cecep:estimate:approve', NULL, 'Persetujuan'
FROM approval_chains c
WHERE c.entity_type = 'estimate_version'
ON CONFLICT (chain_id, level) DO NOTHING;

-- ─── 3. Relaksasi transisi: izinkan under_review→draft (jalur reject) ────────
--
-- Estimasi yang ditolak saat review kembali ke draft untuk direvisi (item &
-- total jadi editable lagi — guard immutability migration 110 hanya mengunci saat
-- status ≠ draft, jadi kembali ke draft membuka edit kembali, itu memang yang
-- diinginkan untuk estimasi yang perlu diperbaiki). Transisi maju lain tak berubah.

CREATE OR REPLACE FUNCTION fn_estimate_version_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'draft'        AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review' AND NEW.status = 'approved')
    OR (OLD.status = 'under_review' AND NEW.status = 'draft')          -- REJECT (baru)
    OR (OLD.status = 'approved'     AND NEW.status = 'frozen')
    OR (OLD.status = 'frozen'       AND NEW.status = 'superseded')
    OR (OLD.status = 'approved'     AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'Transisi status Estimate Version tidak sah: % → %. Alur sah: '
      'draft→under_review→approved→frozen→superseded, under_review→draft (reject).',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  IF NEW.status = 'frozen'   AND NEW.frozen_at   IS NULL THEN NEW.frozen_at   := now(); END IF;
  -- Reject: bersihkan jejak approval + metadata approver di baris (jejak level di
  -- approval_progress dibersihkan di layer aplikasi via clearApprovalProgress).
  IF NEW.status = 'draft' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $function$;
