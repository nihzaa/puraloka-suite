-- ════════════════════════════════════════════════════════════════════════════
-- 302 — Menu untuk /pengaturan/markup (G6, lanjutan 301)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav sama saja dengan tidak ada — ia hanya bisa dibuka
-- dengan mengetik URL. `audit-nav-yatim` menangkap cacat yang sama pada
-- `/akuntansi/jurnalkan` beberapa jam lalu (migrasi 300); kali ini menunya
-- dibuat bersamaan dengan halamannya.
--
-- Izinnya `cecep:markup:view` — SAMA dengan yang dijaga endpoint. Menu yang
-- izinnya lebih longgar dari endpoint menghasilkan menu yang terlihat lalu
-- menampilkan 403, dan pengguna menyimpulkan aplikasi rusak padahal ia
-- memang tak berhak.
--
-- Ditempatkan di grup Pengaturan, bukan Estimasi: markup adalah kebijakan
-- perusahaan yang ditetapkan sekali dan jarang disentuh, bukan pekerjaan
-- harian estimator. Yang dipakai harian adalah HASILNYA, yang sudah muncul
-- otomatis di layar estimasi.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'set-markup',
       'Markup & Margin',
       '/pengaturan/markup',
       'Percent',
       (SELECT parent_id FROM menu_items WHERE key = 'hr-bpjs' LIMIT 1),
       ARRAY['cecep:markup:view']::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items WHERE key = 'hr-bpjs' LIMIT 1), 950),
       (SELECT section FROM menu_items WHERE key = 'hr-bpjs' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'set-markup');

UPDATE menu_items
   SET href = '/pengaturan/markup', is_active = TRUE,
       required_permissions = ARRAY['cecep:markup:view']::text[]
 WHERE key = 'set-markup';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'set-markup' AND is_active AND href = '/pengaturan/markup'
  ) THEN
    RAISE EXCEPTION '302 gagal: menu set-markup tak terbentuk atau tak aktif';
  END IF;

  -- Aturan 232: satu rute = satu tautan sidebar.
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/pengaturan/markup';
  IF n <> 1 THEN
    RAISE EXCEPTION '302 gagal: % menu aktif menunjuk /pengaturan/markup (harus 1)', n;
  END IF;

  -- Izin menu HARUS sama dengan izin endpoint.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'set-markup'
       AND required_permissions = ARRAY['cecep:markup:view']::text[]
  ) THEN
    RAISE EXCEPTION '302 gagal: izin menu tak sama dengan izin endpoint';
  END IF;

  -- Dan izin itu benar-benar dimiliki seseorang — kalau tidak, menunya
  -- muncul untuk nol orang dan halamannya tak pernah bisa dibuka (G2b).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:markup:view';
  IF n = 0 THEN
    RAISE EXCEPTION '302 gagal: cecep:markup:view tak dimiliki satu peran pun';
  END IF;

  RAISE NOTICE '302 OK — /pengaturan/markup punya menunya sendiri, izin cocok endpoint';
END $$;
