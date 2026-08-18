-- 459 — Izin analisa struktur ditautkan ke peran.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KENAPA MIGRASI TERPISAH
--
-- Migrasi 458 MEMBUAT `cecep:struktur:view` / `cecep:struktur:manage`, tetapi
-- tak menautkannya ke satu peran pun. Akibatnya seluruh 7 endpoint menjawab
-- 403 kepada SEMUA orang — termasuk admin. Ketahuannya bukan dari membaca
-- kode, melainkan dari test rute yang merah 16 dari 16 dengan 403.
--
-- Izin yang tak dipegang siapa pun adalah fitur yang tak ada. Penjaga
-- `audit-izin-benar-ada.mjs` menjaga arah sebaliknya (kunci hantu di kode),
-- bukan arah ini — jadi cacat ini lolos penjaga dan hanya ketahuan lewat test.
--
-- 458 tak diedit (§5.5: migrasi lama tak boleh disunting; ia sudah dijalankan
-- dan tercatat di buku migrasi).
--
-- ── Peran mana
--
-- Mengikuti pola CECEP yang sudah mapan, diukur dari basis:
--   *:view    → admin, pm, direktur   (yang membaca angka)
--   *:manage  → admin, estimator      (yang menyusun & menghitungnya)
--
-- Ditautkan ke peran TEMPLATE (`company_id IS NULL`) dan ke seluruh peran
-- per-tenant bernama sama — persis seperti migrasi 379 dan seterusnya.
-- Tanpa yang kedua, tenant yang sudah ada tetap tak bisa memakainya.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'cecep:struktur:view'
   AND r.name IN ('admin', 'pm', 'direktur')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'cecep:struktur:manage'
   AND r.name IN ('admin', 'estimator')
ON CONFLICT DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ──────────────────────────────────────────
DO $$
DECLARE
  v_view int;
  v_manage int;
  v_admin_template int;
BEGIN
  SELECT count(*) INTO v_view
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:struktur:view';

  SELECT count(*) INTO v_manage
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:struktur:manage';

  IF v_view = 0 THEN
    RAISE EXCEPTION 'cecep:struktur:view tak dipegang peran mana pun — 403 untuk semua orang';
  END IF;
  IF v_manage = 0 THEN
    RAISE EXCEPTION 'cecep:struktur:manage tak dipegang peran mana pun — 403 untuk semua orang';
  END IF;

  -- Admin TEMPLATE wajib memegang keduanya: tenant baru dibuat dari template,
  -- dan tenant yang lahir tanpa izin ini mengulang cacat yang sama.
  SELECT count(*) INTO v_admin_template
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    JOIN roles r ON r.id = rp.role_id
   WHERE p.key IN ('cecep:struktur:view', 'cecep:struktur:manage')
     AND r.name = 'admin' AND r.company_id IS NULL;

  IF v_admin_template < 2 THEN
    RAISE EXCEPTION 'peran admin TEMPLATE belum memegang kedua izin struktur — tenant baru akan lahir tanpa akses';
  END IF;

  RAISE NOTICE '459 OK — view tertaut ke % peran, manage ke % peran', v_view, v_manage;
END $$;
