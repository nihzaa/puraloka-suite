-- ════════════════════════════════════════════════════════════════════════════
-- 311 — Menu untuk /gudang/susut (G6e, lanjutan 310)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav hanya bisa dibuka dengan mengetik URL — sama saja
-- dengan tidak ada. Menu dibuat bersamaan dengan halamannya sejak migrasi 300.
--
-- Izin `gudang:susut:view`, sama dengan yang dijaga endpoint. Menu yang
-- izinnya lebih longgar menghasilkan menu yang terlihat lalu menampilkan 403.
--
-- Ditempatkan bertetangga dengan Rekonsiliasi Material: halaman ini adalah
-- PEMBANDING untuk halaman itu, dan keduanya dibaca berpasangan.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'gd-susut',
       'Rencana Susut',
       '/gudang/susut',
       'Percent',
       (SELECT parent_id FROM menu_items WHERE href = '/gudang/rekonsiliasi' AND is_active LIMIT 1),
       ARRAY['gudang:susut:view']::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items
                  WHERE href = '/gudang/rekonsiliasi' AND is_active LIMIT 1), 700),
       (SELECT section FROM menu_items WHERE href = '/gudang/rekonsiliasi' AND is_active LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'gd-susut');

UPDATE menu_items
   SET href = '/gudang/susut', is_active = TRUE,
       required_permissions = ARRAY['gudang:susut:view']::text[]
 WHERE key = 'gd-susut';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'gd-susut' AND is_active AND href = '/gudang/susut'
  ) THEN
    RAISE EXCEPTION '311 gagal: menu gd-susut tak terbentuk atau tak aktif';
  END IF;

  -- Aturan 232: satu rute = satu tautan sidebar.
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/gudang/susut';
  IF n <> 1 THEN
    RAISE EXCEPTION '311 gagal: % menu aktif menunjuk /gudang/susut (harus 1)', n;
  END IF;

  -- Izin menu = izin endpoint.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'gd-susut'
       AND required_permissions = ARRAY['gudang:susut:view']::text[]
  ) THEN
    RAISE EXCEPTION '311 gagal: izin menu tak sama dengan izin endpoint';
  END IF;

  -- Dan izin itu dimiliki seseorang — kalau tidak, menunya muncul untuk nol
  -- orang dan halamannya tak pernah bisa dibuka (cacat yang memakan G2b).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'gudang:susut:view';
  IF n = 0 THEN
    RAISE EXCEPTION '311 gagal: gudang:susut:view tak dimiliki satu peran pun';
  END IF;

  -- Punya parent — menu tanpa parent melayang di akar dan tak terlihat.
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'gd-susut' AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION '311 gagal: gd-susut tak punya parent — ia tak akan muncul di sidebar';
  END IF;

  RAISE NOTICE '311 OK — /gudang/susut punya menunya sendiri, bertetangga dengan Rekonsiliasi';
END $$;
