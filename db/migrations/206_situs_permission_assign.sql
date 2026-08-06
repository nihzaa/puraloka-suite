-- ════════════════════════════════════════════════════════════════════════════
-- 206 — `situs:view` / `situs:manage` di-assign ke role
--
-- ── Cacat yang ditutup
--
-- Migrasi 205 MEMBUAT dua permission, tapi membuat permission tidak memberikan
-- akses kepada siapa pun. Tanpa migrasi ini, `situs_*_kelola` mengevaluasi
-- `has_permission('situs:manage')` menjadi false untuk SETIAP orang — termasuk
-- admin — dan gejalanya hanya "layar situs kosong", tanpa satu pun galat.
--
-- Kelas cacat yang sama sudah dicatat di header migrasi 204: policy yang
-- menunjuk permission yang tak terjangkau menolak semua orang secara senyap.
-- Di sana penyebabnya key salah ketik; di sini key-nya benar tapi tak pernah
-- sampai ke role.
--
-- ── Kenapa mengikuti `settings:manage`, bukan daftar role ditulis tangan
--
-- Mengelola konten situs adalah pekerjaan yang sama tingkatnya dengan mengedit
-- profil perusahaan. Menurunkan penerimanya DARI `settings:manage` berarti
-- kebijakan itu tetap benar saat role bertambah atau berganti nama — sementara
-- daftar `('admin','direktur')` yang ditulis tangan langsung basi begitu ada
-- tenant yang menamai perannya berbeda (ADR-004: peran adalah data
-- konfigurasi per-tenant, bukan konstanta).
--
-- Hari ini yang cocok: admin dan direktur.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- situs:view mengikuti pemegang settings:manage.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_baru.id
  FROM role_permissions rp
  JOIN permissions p_lama ON p_lama.id = rp.permission_id
 CROSS JOIN permissions p_baru
 WHERE p_lama.key = 'settings:manage'
   AND p_baru.key = 'situs:view'
ON CONFLICT DO NOTHING;

-- situs:manage mengikuti pemegang settings:manage.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_baru.id
  FROM role_permissions rp
  JOIN permissions p_lama ON p_lama.id = rp.permission_id
 CROSS JOIN permissions p_baru
 WHERE p_lama.key = 'settings:manage'
   AND p_baru.key = 'situs:manage'
ON CONFLICT DO NOTHING;

COMMIT;
