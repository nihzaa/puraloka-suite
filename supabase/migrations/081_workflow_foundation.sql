-- Migration 081: Workflow Foundation (Sub-Fase 1C.1)
-- ADDITIVE MURNI. Membuat skema state-machine workflow. TIDAK menyentuh tabel
-- kasbons/change_orders/purchase_orders — migrasi modul ke engine ini adalah
-- pekerjaan strangler-fig terpisah yang butuh keputusan founder (jendela waktu +
-- backfill approval in-flight, risk register R7).
--
-- Sampai modul dimigrasi, tabel ini TERISI (seed definisi) tapi BELUM menjadi
-- sumber kebenaran — status modul masih dibaca dari kolom `status` masing-masing.
-- Ini disengaja: additive-first, nol perubahan perilaku.

-- ─── Definisi workflow per entity ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,        -- 'kasbon_approval', 'change_order_approval'
  entity_type TEXT NOT NULL,               -- 'kasbon', 'change_order', 'purchase_order'
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── State yang mungkin dalam sebuah workflow ────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,               -- 'pending', 'approved', 'rejected'
  label       TEXT NOT NULL,
  is_initial  BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workflow_id, key)
);

-- Tepat SATU initial state per workflow — mencegah definisi ambigu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_single_initial
  ON workflow_states(workflow_id) WHERE is_initial;

-- ─── Transisi yang diizinkan (inti state machine) ────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  from_state          TEXT NOT NULL,
  to_state            TEXT NOT NULL,
  label               TEXT NOT NULL,
  -- Permission (BUKAN role) — konsisten ADR-004: kode/konfigurasi mengacu capability.
  required_permission TEXT REFERENCES permissions(key),
  -- Perluasan 1C (target-architecture § SUB-FASE 1C):
  sla_hours           INTEGER,             -- NULL = tanpa SLA
  escalation_role     TEXT REFERENCES roles(name),
  approval_mode       TEXT NOT NULL DEFAULT 'sequential'
                      CHECK (approval_mode IN ('sequential','parallel','any_one')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, from_state, to_state)
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_lookup
  ON workflow_transitions(workflow_id, from_state);

-- ─── Delegasi approval sementara (mis. PM cuti) ──────────────────────────────
CREATE TABLE IF NOT EXISTS approval_delegations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_key TEXT,                        -- NULL = semua workflow
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_delegation_period CHECK (ends_at > starts_at),
  CONSTRAINT chk_delegation_not_self CHECK (delegator_id <> delegate_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_active
  ON approval_delegations(delegate_id, starts_at, ends_at);

-- ─── Instance tracking (SLA / eskalasi / korelasi) ───────────────────────────
CREATE TABLE IF NOT EXISTS workflow_instances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key     TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  current_state    TEXT NOT NULL,
  entered_state_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_deadline     TIMESTAMPTZ,
  escalated_at     TIMESTAMPTZ,
  -- Konsumen KETIGA dari correlation ID (1D.2): request → audit_logs → workflow.
  correlation_id   UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_correlation ON workflow_instances(correlation_id);
-- Query utama job eskalasi: cari yang lewat SLA & belum dieskalasi.
CREATE INDEX IF NOT EXISTS idx_workflow_instances_sla
  ON workflow_instances(sla_deadline) WHERE escalated_at IS NULL;

COMMENT ON TABLE workflow_definitions IS 'Definisi workflow per entity (Sub-Fase 1C). Menggantikan status-logic hardcode yang terduplikasi di 3+ file.';
COMMENT ON TABLE workflow_transitions IS 'Transisi yang diizinkan + permission/SLA/approval_mode. Dibaca canTransition().';
COMMENT ON TABLE workflow_instances IS 'Tracking state aktual per entity untuk SLA/eskalasi. BELUM sumber kebenaran sampai modul dimigrasi (strangler-fig).';

-- ─── Seed: definisi workflow yang MENCERMINKAN perilaku existing ─────────────
-- PENTING: seed ini adalah CERMIN dari logic hardcode yang berjalan hari ini,
-- bukan perilaku baru. Belum dipakai runtime — dipakai saat modul dimigrasi.

-- 1. Kasbon (enum kasbon_status: pending/approved/rejected/settled)
INSERT INTO workflow_definitions (key, entity_type, name, description) VALUES
  ('kasbon_approval', 'kasbon', 'Persetujuan Kasbon', 'Cermin logic kasbons.ts saat ini (pending → approved/rejected → settled)')
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
  -- Permission diambil dari yang BENAR-BENAR dipakai kasbons.ts hari ini
  -- (requirePermission('mandor:kasbon:approve')) — cermin, bukan capability baru.
  (VALUES ('pending','approved','Setujui','mandor:kasbon:approve'),
          ('pending','rejected','Tolak','mandor:kasbon:approve'),
          ('approved','settled','Tandai Lunas','mandor:kasbon:approve')) AS t(f,tt,lbl,perm)
WHERE w.key='kasbon_approval'
ON CONFLICT (workflow_id, from_state, to_state) DO NOTHING;

-- 2. Change Order (CHECK: draft/submitted/approved/rejected)
INSERT INTO workflow_definitions (key, entity_type, name, description) VALUES
  ('change_order_approval', 'change_order', 'Persetujuan Change Order', 'Cermin logic change-orders.ts saat ini (draft → submitted → approved/rejected)')
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
  -- change-orders.ts hari ini memakai requirePermission('projects:edit') untuk
  -- SEMUA aksi CO (termasuk approve/reject). Di-cermin apa adanya — memperkenalkan
  -- capability baru (mis. change_order:approve) = mengubah SIAPA yang boleh, itu
  -- keputusan produk, bukan bagian 1C.1 yang additive.
  (VALUES ('draft','submitted','Ajukan','projects:edit'),
          ('submitted','approved','Setujui','projects:edit'),
          ('submitted','rejected','Tolak','projects:edit')) AS t(f,tt,lbl,perm)
WHERE w.key='change_order_approval'
ON CONFLICT (workflow_id, from_state, to_state) DO NOTHING;

-- ─── RLS (pola Sub-Fase 1A: has_permission, bukan literal role) ──────────────
ALTER TABLE workflow_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_delegations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances    ENABLE ROW LEVEL SECURITY;

-- Definisi workflow: dibaca luas (UI perlu tahu transisi yang tersedia), ditulis admin.
CREATE POLICY "workflow_definitions_read" ON workflow_definitions
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "workflow_definitions_write" ON workflow_definitions
  FOR ALL USING (has_permission('settings:manage')) WITH CHECK (has_permission('settings:manage'));

CREATE POLICY "workflow_states_read" ON workflow_states
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "workflow_states_write" ON workflow_states
  FOR ALL USING (has_permission('settings:manage')) WITH CHECK (has_permission('settings:manage'));

CREATE POLICY "workflow_transitions_read" ON workflow_transitions
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "workflow_transitions_write" ON workflow_transitions
  FOR ALL USING (has_permission('settings:manage')) WITH CHECK (has_permission('settings:manage'));

-- Delegasi: user lihat yang melibatkan dirinya; admin kelola semua.
CREATE POLICY "approval_delegations_read" ON approval_delegations
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR delegator_id = auth_user_id()
    OR delegate_id  = auth_user_id()
    OR has_permission('users:manage')
  );
CREATE POLICY "approval_delegations_write" ON approval_delegations
  FOR ALL USING (has_permission('users:manage')) WITH CHECK (has_permission('users:manage'));

-- Instance: dibaca authenticated (status ditampilkan di UI), ditulis service_role
-- (API) — bukan langsung oleh user, karena transisi harus lewat canTransition().
CREATE POLICY "workflow_instances_read" ON workflow_instances
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "workflow_instances_write" ON workflow_instances
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
