-- Migration 099: Approval Engine berbasis KONFIGURASI (Phase 2 / Program B — 2A, ADR-007)
--
-- KONTEKS: ADR-006 mempensiunkan workflow engine 1C (engine tanpa pemakai). ADR-007
-- membuka revival DENGAN BUKTI: founder meminta approval berjenjang TAPI seluruhnya
-- bisa dikonfigurasi dari UI — "bisa berjenjang atau enggaknya, dan role apa yang bisa
-- approve-nya juga dinamis, semuanya jangan hardcode".
--
-- BEDA TEGAS DARI 1C (jangan ulangi kesalahan):
--   • TANPA workflow_instances / dual-write / shadow. Kolom `status` di tabel sumber
--     TETAP satu-satunya sumber kebenaran. Engine ini hanya mengatur GERBANG menuju
--     status itu (berapa langkah & siapa boleh), bukan menyimpan status kedua.
--   • Konfigurasi DIBACA RUNTIME saat approve → jalur hidup, bukan bayangan.
--
-- ADR-004 dijaga: langkah menyimpan `required_permission` (BUKAN literal role).
-- "Role approver" dinamis diatur lewat UI role editor yang sudah ada (beri/cabut
-- permission itu ke role mana pun, termasuk role custom seperti `direktur`).
--
-- ADDITIVE-FIRST: seed = TEPAT SATU langkah per modul memakai permission yang SEKARANG
-- dipakai handler → keputusan engine identik dengan `requirePermission` hari ini.
-- NOL perubahan perilaku sampai founder menambah level dari UI.

-- ─── 1. Rantai approval per jenis entitas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_chains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL UNIQUE,          -- kasbon | change_order | material_request | project_expense
  label       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true, -- false = modul memakai gerbang legacy (permission tunggal)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE approval_chains IS 'Rantai approval per entitas (ADR-007). Bentuk approval = DATA. Kolom status tabel sumber tetap sumber kebenaran; ini hanya gerbang.';

-- ─── 2. Langkah/level — jumlah level = DATA, approver = PERMISSION (ADR-004) ──
CREATE TABLE IF NOT EXISTS approval_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id            UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  level               INTEGER NOT NULL CHECK (level >= 1),
  required_permission TEXT NOT NULL REFERENCES permissions(key),
  -- Syarat nominal: langkah HANYA berlaku bila nilai entitas >= min_amount.
  -- NULL = selalu berlaku. Ini yang membuat "PO di atas Rp50jt wajib Direktur"
  -- murni konfigurasi, bukan kode.
  min_amount          NUMERIC,
  label               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, level)
);
CREATE INDEX IF NOT EXISTS idx_approval_steps_chain ON approval_steps(chain_id, level);
COMMENT ON COLUMN approval_steps.required_permission IS 'ADR-004: approver ditentukan CAPABILITY, bukan literal role. Role mana yang memegangnya diatur di UI role editor.';
COMMENT ON COLUMN approval_steps.min_amount IS 'Langkah berlaku hanya bila nilai entitas >= nilai ini. NULL = selalu. Basis aturan berjenjang bersyarat nominal.';

-- ─── 3. Jejak persetujuan per level (untuk rantai > 1 langkah) ───────────────
-- Untuk rantai 1 langkah (default), tabel ini praktis mereplikasi approved_by yang
-- sudah ada — tak mengubah apa pun. Baru bermakna saat berjenjang dinyalakan.
CREATE TABLE IF NOT EXISTS approval_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  level       INTEGER NOT NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT,
  UNIQUE (entity_type, entity_id, level)
);
CREATE INDEX IF NOT EXISTS idx_approval_progress_entity ON approval_progress(entity_type, entity_id);

-- ─── 4. SEED = PERILAKU HARI INI PERSIS (satu langkah, permission existing) ──
INSERT INTO approval_chains (entity_type, label) VALUES
  ('kasbon',           'Persetujuan Kasbon'),
  ('change_order',     'Persetujuan Change Order'),
  ('material_request', 'Persetujuan Material Request'),
  ('project_expense',  'Persetujuan Pengeluaran Proyek')
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label)
SELECT c.id, 1, s.perm, NULL, 'Persetujuan'
FROM approval_chains c
JOIN (VALUES
  ('kasbon',           'mandor:kasbon:approve'),
  ('change_order',     'change_order:approve'),
  ('material_request', 'procurement:mr:manage'),
  ('project_expense',  'cash:expense:approve')
) AS s(entity_type, perm) ON s.entity_type = c.entity_type
ON CONFLICT (chain_id, level) DO NOTHING;

-- ─── 5. Derive capability kelola rantai (ADR-004) + RLS + menu ───────────────
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('approval:chains:manage', 'settings', 'Kelola Rantai Approval',
   'Mengatur jumlah level approval, permission tiap level, dan syarat nominal', 60)
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'approval:chains:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE approval_chains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_chains_read" ON approval_chains
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "approval_chains_write" ON approval_chains
  FOR ALL USING (has_permission('approval:chains:manage'))
  WITH CHECK (has_permission('approval:chains:manage'));

CREATE POLICY "approval_steps_read" ON approval_steps
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "approval_steps_write" ON approval_steps
  FOR ALL USING (has_permission('approval:chains:manage'))
  WITH CHECK (has_permission('approval:chains:manage'));

-- Jejak persetujuan: dibaca authenticated, ditulis HANYA service_role (API) —
-- persetujuan tak boleh disisipkan langsung oleh klien.
CREATE POLICY "approval_progress_read" ON approval_progress
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "approval_progress_write" ON approval_progress
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-approval', 'Rantai Approval', '/pengaturan/approval', 'GitBranch', m.id,
       ARRAY['approval:chains:manage'], 20, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;
