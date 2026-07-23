-- Migration 084: Derive capabilities untuk fix lockout AKTA 0 (Sub-Fase config-first)
--
-- ADDITIF: hanya menambah 2 permission baru + seed ke admin (scope-preserving).
-- Memperbaiki lockout role-literal F1-F4 (role-literal-reaudit-2026-07-24.md) dengan
-- pola derive-capability (ADR-004): buat permission spesifik, seed ke role yang
-- SEKARANG berhak (admin), lalu kode ganti role-literal → requirePermission.
--
-- Perilaku hari ini TIDAK berubah: admin punya semua permission (termasuk 2 ini);
-- non-admin tetap tak bisa. Bedanya: kini admin bisa MEMBERIKAN capability ini ke
-- role custom (direktur) via UI role editor tanpa deploy.

-- 1. change_order:approve — untuk F2/F3 (CO approve/reject, ganti role==='admin').
-- 2. settings:finance:manage — untuk governance config finansial (Q7); permission
--    terpisah dari settings:manage biasa (ubah tarif/uang lebih ketat).
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('change_order:approve', 'change_orders', 'Setujui/Tolak Change Order',
   'Menyetujui atau menolak change order (mengubah nilai kontrak)', 40),
  ('settings:finance:manage', 'settings', 'Kelola Konfigurasi Finansial',
   'Mengubah tarif pajak, retensi, denda, dan nilai finansial lain (effective-dated)', 20)
ON CONFLICT (key) DO NOTHING;

-- Seed ke admin (scope-preserving — admin memang berhak hari ini).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.key IN ('change_order:approve', 'settings:finance:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;
