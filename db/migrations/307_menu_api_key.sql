-- ════════════════════════════════════════════════════════════════════════════
-- 307 — Menu untuk /pengaturan/api-key (G6c, lanjutan 305/306)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav sama saja dengan tidak ada. `audit-nav-yatim`
-- menangkap cacat itu pada `/akuntansi/jurnalkan` (migrasi 300); sejak itu
-- menunya dibuat bersamaan dengan halamannya.
--
-- Izin `settings:apikey:view` — SAMA dengan yang dijaga endpoint. Menu yang
-- izinnya lebih longgar menghasilkan menu yang terlihat lalu menampilkan 403,
-- dan pengguna menyimpulkan aplikasi rusak padahal ia memang tak berhak.
--
-- Ditempatkan bertetangga dengan `set-markup` di grup Pengaturan.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'set-api-key',
       'Kunci API',
       '/pengaturan/api-key',
       'KeyRound',
       (SELECT parent_id FROM menu_items WHERE key = 'set-markup' LIMIT 1),
       ARRAY['settings:apikey:view']::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items WHERE key = 'set-markup' LIMIT 1), 951),
       (SELECT section FROM menu_items WHERE key = 'set-markup' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'set-api-key');

UPDATE menu_items
   SET href = '/pengaturan/api-key', is_active = TRUE,
       required_permissions = ARRAY['settings:apikey:view']::text[]
 WHERE key = 'set-api-key';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'set-api-key' AND is_active AND href = '/pengaturan/api-key'
  ) THEN
    RAISE EXCEPTION '307 gagal: menu set-api-key tak terbentuk atau tak aktif';
  END IF;

  -- Aturan 232: satu rute = satu tautan sidebar.
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/pengaturan/api-key';
  IF n <> 1 THEN
    RAISE EXCEPTION '307 gagal: % menu aktif menunjuk /pengaturan/api-key (harus 1)', n;
  END IF;

  -- Izin menu = izin endpoint.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'set-api-key'
       AND required_permissions = ARRAY['settings:apikey:view']::text[]
  ) THEN
    RAISE EXCEPTION '307 gagal: izin menu tak sama dengan izin endpoint';
  END IF;

  -- Dan izin itu dimiliki seseorang — kalau tidak, halamannya 403 untuk
  -- semua orang (cacat yang memakan G2b).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'settings:apikey:view';
  IF n = 0 THEN
    RAISE EXCEPTION '307 gagal: settings:apikey:view tak dimiliki satu peran pun';
  END IF;

  RAISE NOTICE '307 OK — /pengaturan/api-key punya menunya sendiri, izin cocok endpoint';
END $$;
