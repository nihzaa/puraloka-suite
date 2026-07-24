-- Migration 093: RESTORE workflow foundation — REVERT drop prematur di 092
--
-- KOREKSI OVER-REACH: migration 092 men-DROP seluruh tabel workflow (definitions/states/
-- transitions/instances/approval_delegations) sebagai bagian fase CONTRACT. Itu MELEBIHI
-- yang disetujui founder: yang disetujui adalah "pensiunkan dual-write SHADOW" (hentikan
-- tulisan bayangan + kode dual-write) — BUKAN keputusan men-drop seluruh scaffolding engine.
-- Founder secara eksplisit MENAHAN keputusan drop tabel ("JANGAN drop tanpa keputusanku";
-- drop lewat migration TERPISAH setelah temuan yatim dilaporkan + rekomendasi).
--
-- Migration ini MENGEMBALIKAN struktur + seed config + RLS (identik 081) supaya keputusan
-- keep/drop kembali ke tangan founder. Kode dual-write TETAP dihapus (#34) — jadi tabel ini
-- kini benar-benar YATIM (nol penulis, nol pembaca bisnis), didokumentasikan sebagai temuan
-- terbuka di HARDCODE-CENSUS/AUDIT_REPORT. workflow_instances DIKEMBALIKAN KOSONG: isinya
-- dulu data bayangan turunan (56 kasbon + 2 change_order) yang bisa direkonstruksi dari
-- tabel sumber; tak relevan untuk keputusan keep/drop tabel.
--
-- Idempoten (CREATE IF NOT EXISTS + ON CONFLICT), aman jika 092 belum/terlanjur diterapkan.

-- ─── Definisi workflow per entity ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  is_initial  BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workflow_id, key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_single_initial
  ON workflow_states(workflow_id) WHERE is_initial;

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  from_state          TEXT NOT NULL,
  to_state            TEXT NOT NULL,
  label               TEXT NOT NULL,
  required_permission TEXT REFERENCES permissions(key),
  sla_hours           INTEGER,
  escalation_role     TEXT REFERENCES roles(name),
  approval_mode       TEXT NOT NULL DEFAULT 'sequential'
                      CHECK (approval_mode IN ('sequential','parallel','any_one')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, from_state, to_state)
);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_lookup
  ON workflow_transitions(workflow_id, from_state);

CREATE TABLE IF NOT EXISTS approval_delegations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_key TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_delegation_period CHECK (ends_at > starts_at),
  CONSTRAINT chk_delegation_not_self CHECK (delegator_id <> delegate_id)
);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_active
  ON approval_delegations(delegate_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key     TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  current_state    TEXT NOT NULL,
  entered_state_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_deadline     TIMESTAMPTZ,
  escalated_at     TIMESTAMPTZ,
  correlation_id   UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_correlation ON workflow_instances(correlation_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_sla
  ON workflow_instances(sla_deadline) WHERE escalated_at IS NULL;

COMMENT ON TABLE workflow_definitions IS 'YATIM setelah 1C CONTRACT (nol pembaca/penulis bisnis). Dipulihkan dari drop prematur 092; keputusan keep/drop di tangan founder — lihat AUDIT_REPORT.';
COMMENT ON TABLE workflow_instances IS 'YATIM setelah 1C CONTRACT — dual-write dihapus (#34). Dipulihkan KOSONG (data bayangan turunan tak dipulihkan).';

-- ─── Seed definisi (cermin perilaku existing) — identik 081 ───────────────────
INSERT INTO workflow_definitions (key, entity_type, name, description) VALUES
  ('kasbon_approval', 'kasbon', 'Persetujuan Kasbon', 'Cermin logic kasbons.ts (pending → approved/rejected → settled)')
ON CONFLICT (key) DO NOTHING;
INSERT INTO workflow_states (workflow_id, key, label, is_initial, is_terminal, sort_order)
SELECT w.id, s.key, s.label, s.is_initial, s.is_terminal, s.sort_order
FROM workflow_definitions w,
  (VALUES ('pending','Menunggu Persetujuan',true,false,10),
          ('approved','Disetujui',false,false,20),
          ('rejected','Ditolak',false,true,30),
          ('settled','Lunas',false,true,40)) AS s(key,label,is_initial,is_terminal,sort_order)
WHERE w.key='kasbon_approval'
ON CONFLICT (workflow_id, key) DO NOTHING;
INSERT INTO workflow_transitions (workflow_id, from_state, to_state, label, required_permission)
SELECT w.id, t.f, t.tt, t.lbl, t.perm
FROM workflow_definitions w,
  (VALUES ('pending','approved','Setujui','mandor:kasbon:approve'),
          ('pending','rejected','Tolak','mandor:kasbon:approve'),
          ('approved','settled','Tandai Lunas','mandor:kasbon:approve')) AS t(f,tt,lbl,perm)
WHERE w.key='kasbon_approval'
ON CONFLICT (workflow_id, from_state, to_state) DO NOTHING;

INSERT INTO workflow_definitions (key, entity_type, name, description) VALUES
  ('change_order_approval', 'change_order', 'Persetujuan Change Order', 'Cermin logic change-orders.ts (draft → submitted → approved/rejected)')
ON CONFLICT (key) DO NOTHING;
INSERT INTO workflow_states (workflow_id, key, label, is_initial, is_terminal, sort_order)
SELECT w.id, s.key, s.label, s.is_initial, s.is_terminal, s.sort_order
FROM workflow_definitions w,
  (VALUES ('draft','Draft',true,false,10),
          ('submitted','Diajukan',false,false,20),
          ('approved','Disetujui',false,true,30),
          ('rejected','Ditolak',false,true,40)) AS s(key,label,is_initial,is_terminal,sort_order)
WHERE w.key='change_order_approval'
ON CONFLICT (workflow_id, key) DO NOTHING;
INSERT INTO workflow_transitions (workflow_id, from_state, to_state, label, required_permission)
SELECT w.id, t.f, t.tt, t.lbl, t.perm
FROM workflow_definitions w,
  (VALUES ('draft','submitted','Ajukan','projects:edit'),
          ('submitted','approved','Setujui','projects:edit'),
          ('submitted','rejected','Tolak','projects:edit')) AS t(f,tt,lbl,perm)
WHERE w.key='change_order_approval'
ON CONFLICT (workflow_id, from_state, to_state) DO NOTHING;

-- ─── RLS (identik 081) ───────────────────────────────────────────────────────
ALTER TABLE workflow_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_delegations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflow_definitions_read" ON workflow_definitions;
CREATE POLICY "workflow_definitions_read" ON workflow_definitions
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS "workflow_definitions_write" ON workflow_definitions;
CREATE POLICY "workflow_definitions_write" ON workflow_definitions
  FOR ALL USING (has_permission('settings:manage')) WITH CHECK (has_permission('settings:manage'));

DROP POLICY IF EXISTS "workflow_states_read" ON workflow_states;
CREATE POLICY "workflow_states_read" ON workflow_states
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS "workflow_states_write" ON workflow_states;
CREATE POLICY "workflow_states_write" ON workflow_states
  FOR ALL USING (has_permission('settings:manage')) WITH CHECK (has_permission('settings:manage'));

DROP POLICY IF EXISTS "workflow_transitions_read" ON workflow_transitions;
CREATE POLICY "workflow_transitions_read" ON workflow_transitions
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS "workflow_transitions_write" ON workflow_transitions;
CREATE POLICY "workflow_transitions_write" ON workflow_transitions
  FOR ALL USING (has_permission('settings:manage')) WITH CHECK (has_permission('settings:manage'));

DROP POLICY IF EXISTS "approval_delegations_read" ON approval_delegations;
CREATE POLICY "approval_delegations_read" ON approval_delegations
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR delegator_id = auth_user_id()
    OR delegate_id  = auth_user_id()
    OR has_permission('users:manage')
  );
DROP POLICY IF EXISTS "approval_delegations_write" ON approval_delegations;
CREATE POLICY "approval_delegations_write" ON approval_delegations
  FOR ALL USING (has_permission('users:manage')) WITH CHECK (has_permission('users:manage'));

DROP POLICY IF EXISTS "workflow_instances_read" ON workflow_instances;
CREATE POLICY "workflow_instances_read" ON workflow_instances
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS "workflow_instances_write" ON workflow_instances;
CREATE POLICY "workflow_instances_write" ON workflow_instances
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
