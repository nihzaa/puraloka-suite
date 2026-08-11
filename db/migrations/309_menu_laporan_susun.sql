-- ════════════════════════════════════════════════════════════════════════════
-- 309 — Menu untuk /laporan/susun (G6d, lanjutan 308)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav hanya bisa dibuka dengan mengetik URL — sama saja
-- dengan tidak ada. `audit-nav-yatim` menangkap cacat itu pada
-- `/akuntansi/jurnalkan` (migrasi 300); sejak itu menunya dibuat bersamaan
-- dengan halamannya.
--
-- ── Kenapa menu SENDIRI, bukan tab di /laporan
--
-- ARAH-VISUAL-2026 §6a: tab = data yang sama dilihat dari sudut lain; halaman
-- = entitas yang berbeda. Sembilan laporan di `/laporan` adalah laporan yang
-- BENTUKNYA SUDAH DITENTUKAN — dibaca. Susun Laporan adalah alat: pengguna
-- memilih sumber, kolom, dan saringan. Dua hal yang berbeda sifatnya.
--
-- ── Izin
--
-- `reports:susun`, sama dengan yang dijaga endpoint. Menu yang izinnya lebih
-- longgar dari endpoint menghasilkan menu yang terlihat lalu menampilkan 403.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'lap-susun',
       'Susun Laporan',
       '/laporan/susun',
       'Table2',
       (SELECT parent_id FROM menu_items WHERE href = '/laporan' AND is_active LIMIT 1),
       ARRAY['reports:susun']::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items
                  WHERE href = '/laporan' AND is_active LIMIT 1), 800),
       (SELECT section FROM menu_items WHERE href = '/laporan' AND is_active LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'lap-susun');

UPDATE menu_items
   SET href = '/laporan/susun', is_active = TRUE,
       required_permissions = ARRAY['reports:susun']::text[]
 WHERE key = 'lap-susun';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'lap-susun' AND is_active AND href = '/laporan/susun'
  ) THEN
    RAISE EXCEPTION '309 gagal: menu lap-susun tak terbentuk atau tak aktif';
  END IF;

  -- Aturan 232: satu rute = satu tautan sidebar.
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/laporan/susun';
  IF n <> 1 THEN
    RAISE EXCEPTION '309 gagal: % menu aktif menunjuk /laporan/susun (harus 1)', n;
  END IF;

  -- Izin menu = izin endpoint.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'lap-susun'
       AND required_permissions = ARRAY['reports:susun']::text[]
  ) THEN
    RAISE EXCEPTION '309 gagal: izin menu tak sama dengan izin endpoint';
  END IF;

  -- Dan izin itu dimiliki seseorang — kalau tidak, menunya muncul untuk nol
  -- orang dan halamannya tak pernah bisa dibuka (cacat yang memakan G2b).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'reports:susun';
  IF n = 0 THEN
    RAISE EXCEPTION '309 gagal: reports:susun tak dimiliki satu peran pun';
  END IF;

  -- Menu induknya harus ADA. Menu tanpa parent melayang di akar dan tak
  -- terlihat di sidebar — halaman jadi, menu terdaftar, tetap tak terjangkau.
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'lap-susun' AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION '309 gagal: lap-susun tak punya parent — ia tak akan muncul di sidebar';
  END IF;

  RAISE NOTICE '309 OK — /laporan/susun punya menunya sendiri, segrup dengan Laporan';
END $$;
