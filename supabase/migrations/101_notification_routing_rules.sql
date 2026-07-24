-- Migration 101 — Notification Routing Engine (Phase 2 / Program B, Sub-Fase 2B)
--
-- KEADAAN SEBELUM INI: siapa yang menerima notifikasi ditentukan fungsi hardcoded
-- (`getAllAdmins`, `getProjectAdminsAndPM`) yang dipanggil dari 15 tempat di 8 file
-- route. Mengubah "siapa dapat notif apa" = ubah kode + deploy.
--
-- SESUDAH: penerima tiap event = DATA. Founder bisa mengubahnya dari UI.
--
-- ── Dua pelajaran yang dipatuhi desain ini ───────────────────────────────────
--
-- 1. ADR-006 / kegagalan 1C: JANGAN bangun engine bayangan. Tabel ini dibaca di
--    JALUR HIDUP — setiap notifikasi melewatinya sejak hari pertama, tak ada
--    dual-write, tak ada sumber kebenaran kedua. Resolver lama DIGANTI, bukan
--    didampingi.
--
-- 2. Bug #47 (admin berhenti menerima notifikasi tanpa suara): kegagalan
--    resolusi penerima TIDAK BOLEH sunyi. Karena itu ada `notification_rules`
--    per event dan test CI yang menolak event tanpa aturan aktif — hilangnya
--    notifikasi jadi MERAH di CI, bukan diam-diam.
--
-- ── Target penerima: peran ATAU kapabilitas ATAU konteks ─────────────────────
--
-- `permission` sengaja ada dan sejalan ADR-004: "notifikasi ke SIAPA PUN yang
-- boleh menyetujui" lebih benar daripada "notifikasi ke admin" — begitu founder
-- memberi kapabilitas approve ke direktur lewat UI, notifikasinya ikut, tanpa
-- deploy. Seed TETAP memakai `role` supaya perilaku hari ini tidak berubah;
-- perpindahan ke permission adalah keputusan founder lewat UI, bukan diam-diam.

-- ─── 1. TABLE: notification_rules ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_rules (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  TEXT NOT NULL UNIQUE,      -- kunci semantik event (BUKAN notifications.type)
  label       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN notification_rules.event_type IS
  'Kunci semantik event (mis. kasbon_submitted). Berbeda dari notifications.type '
  'yang merupakan kategori tampilan — beberapa event bisa memakai type yang sama '
  '(mis. general), tapi aturan penerimanya harus bisa dibedakan.';

-- ─── 2. TABLE: notification_rule_targets ────────────────────────────────────
-- Satu aturan boleh punya beberapa target (mis. admin + PM proyek).

CREATE TABLE IF NOT EXISTS notification_rule_targets (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id        UUID NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  target_type    TEXT NOT NULL CHECK (target_type IN (
                   'role',            -- semua user aktif dengan role tsb
                   'permission',      -- semua user aktif yang memegang kapabilitas tsb
                   'project_pm',      -- PM proyek terkait (kontekstual)
                   'project_mandors'  -- mandor ber-assignment aktif di proyek (kontekstual)
                 )),
  -- Integritas ditegakkan DB, bukan harapan: role/permission yang tak dikenal
  -- ditolak FK, jadi salah ketik tidak berujung notifikasi hilang senyap.
  role_name      TEXT REFERENCES roles(name) ON UPDATE CASCADE ON DELETE CASCADE,
  permission_key TEXT REFERENCES permissions(key) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Tepat satu bentuk nilai yang boleh terisi, sesuai target_type-nya.
  CONSTRAINT notification_rule_targets_value_shape CHECK (
    (target_type = 'role'       AND role_name IS NOT NULL AND permission_key IS NULL) OR
    (target_type = 'permission' AND permission_key IS NOT NULL AND role_name IS NULL) OR
    (target_type IN ('project_pm', 'project_mandors')
       AND role_name IS NULL AND permission_key IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_rule_targets_rule
  ON notification_rule_targets(rule_id);

-- Cegah target kembar dalam satu aturan (mis. dua kali 'role admin').
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_rule_targets_unik
  ON notification_rule_targets(
       rule_id, target_type, COALESCE(role_name, ''), COALESCE(permission_key, ''));

-- ─── 3. SEED = PERILAKU HARI INI PERSIS ─────────────────────────────────────
-- Diturunkan dari 15 call site nyata, bukan dikarang. `getAllAdmins()` → role admin;
-- `getProjectAdminsAndPM()` → role admin + PM proyek.

INSERT INTO notification_rules (event_type, label, description) VALUES
  ('invoice_created',            'Invoice Dibuat',              'Invoice baru diterbitkan'),
  ('invoice_paid',               'Invoice Dibayar',             'Pembayaran invoice tercatat'),
  ('invoice_due',                'Invoice Jatuh Tempo',         'Invoice mendekati jatuh tempo'),
  ('invoice_overdue',            'Invoice Terlambat',           'Invoice melewati jatuh tempo'),
  ('milestone_completed',        'Milestone Selesai',           'Milestone ditandai selesai'),
  ('milestone_approaching',      'Milestone Mendekat',          'Milestone mendekati tenggat'),
  ('milestone_overdue',          'Milestone Terlambat',         'Milestone melewati tenggat'),
  ('material_request_submitted', 'Material Request Diajukan',   'MR baru menunggu persetujuan'),
  ('change_order_submitted',     'Change Order Diajukan',       'CO baru menunggu persetujuan'),
  ('kasbon_pending',             'Kasbon Menunggu Persetujuan', 'Kasbon menunggu tindakan'),
  ('kasbon_submitted',           'Kasbon Diajukan',             'Kasbon baru diajukan mandor'),
  ('wage_report_submitted',      'Laporan Upah Diajukan',       'Laporan upah mingguan diajukan'),
  ('project_status_changed',     'Status Proyek Berubah',       'Status proyek diperbarui'),
  ('project_deadline',           'Deadline Proyek',             'Proyek mendekati/melewati deadline')
ON CONFLICT (event_type) DO NOTHING;

-- Semua 14 event di atas hari ini menyertakan admin. Daftarnya disebut eksplisit
-- (bukan "semua baris di tabel") supaya aturan yang ditambahkan kelak tidak
-- diam-diam kebagian target admin dari migration ini.
INSERT INTO notification_rule_targets (rule_id, target_type, role_name)
SELECT r.id, 'role', 'admin' FROM notification_rules r
WHERE r.event_type IN (
  'invoice_created', 'invoice_paid', 'invoice_due', 'invoice_overdue',
  'milestone_completed', 'milestone_approaching', 'milestone_overdue',
  'material_request_submitted', 'change_order_submitted',
  'kasbon_pending', 'kasbon_submitted', 'wage_report_submitted',
  'project_status_changed', 'project_deadline'
)
ON CONFLICT DO NOTHING;

-- Event yang dulu lewat getProjectAdminsAndPM() juga menyertakan PM proyek.
INSERT INTO notification_rule_targets (rule_id, target_type)
SELECT r.id, 'project_pm' FROM notification_rules r
WHERE r.event_type IN (
  'invoice_paid', 'invoice_due', 'invoice_overdue',
  'milestone_approaching', 'milestone_overdue',
  'change_order_submitted', 'kasbon_pending', 'kasbon_submitted',
  'wage_report_submitted', 'project_status_changed', 'project_deadline'
)
ON CONFLICT DO NOTHING;

-- ─── 4. Capability kelola aturan (ADR-004: derive, jangan pakai literal role) ─

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('notifications:rules:manage', 'settings', 'Kelola Aturan Notifikasi',
   'Mengatur siapa yang menerima notifikasi untuk tiap jenis kejadian', 61)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'notifications:rules:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 5. RLS — sejajar tabel konfigurasi lain ────────────────────────────────

ALTER TABLE notification_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rule_targets  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_rules_read ON notification_rules;
CREATE POLICY notification_rules_read ON notification_rules
  FOR SELECT USING (auth_user_id() IS NOT NULL);

DROP POLICY IF EXISTS notification_rules_write ON notification_rules;
CREATE POLICY notification_rules_write ON notification_rules
  FOR ALL USING (has_permission('notifications:rules:manage'))
  WITH CHECK (has_permission('notifications:rules:manage'));

DROP POLICY IF EXISTS notification_rule_targets_read ON notification_rule_targets;
CREATE POLICY notification_rule_targets_read ON notification_rule_targets
  FOR SELECT USING (auth_user_id() IS NOT NULL);

DROP POLICY IF EXISTS notification_rule_targets_write ON notification_rule_targets;
CREATE POLICY notification_rule_targets_write ON notification_rule_targets
  FOR ALL USING (has_permission('notifications:rules:manage'))
  WITH CHECK (has_permission('notifications:rules:manage'));

-- ─── 6. Menu (config-first §12: harus bisa ditemukan & diubah dari UI) ───────

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-notifikasi', 'Aturan Notifikasi', '/pengaturan/notifikasi', 'BellRing', m.id,
       ARRAY['notifications:rules:manage'], 21, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;
