-- ════════════════════════════════════════════════════════════════════════════
-- 322 — Menu untuk /pengaturan/field-tambahan (TJS-P5)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav hanya bisa dibuka dengan mengetik URL. Menu dibuat
-- bersamaan dengan halamannya sejak migrasi 300.
--
-- ── Induk: Master Data, bukan Sistem
--
-- Field tambahan MENDEFINISIKAN bentuk data master (proyek, pemasok, material,
-- pegawai, klien) — ia tetangga "Satuan" dan "Kategori Pekerjaan", bukan
-- tetangga "Recycle Bin". Yang mencarinya akan mencari di dekat data yang
-- dibentuknya.
--
-- ── `sort_order` 59: celah yang DIUKUR, bukan ditebak
--
-- Grup `g-master-data` terisi 51–58 lalu 61–64. 59 dan 60 kosong, dan 59
-- menempatkannya persis sesudah kelompok `pengaturan-*` yang sekerabat.
--
-- Diukur karena pada 2026-08-12 sesi lain baru memperbaiki LIMA pasang
-- `sort_order` yang bentrok dalam satu grup (migrasi 319). Menebak angka di
-- sini akan menambah pasangan keenam pada hari yang sama.
--
-- ── `required_permissions`: view, bukan manage
--
-- Menu muncul untuk yang boleh MELIHAT; halamannya sendiri menyembunyikan
-- kontrol ubah bagi yang tak punya `manage`. Menuntut `manage` di menu berarti
-- staf yang mengisi field tak pernah bisa membuka daftarnya untuk tahu field
-- apa saja yang ada.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'md-field-tambahan',
       'Field Tambahan',
       '/pengaturan/field-tambahan',
       'SlidersHorizontal',
       (SELECT id FROM menu_items WHERE key = 'g-master-data' LIMIT 1),
       ARRAY['settings:customfield:view']::text[],
       59,
       (SELECT section FROM menu_items WHERE key = 'pengaturan-satuan' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-field-tambahan');

UPDATE menu_items
   SET href = '/pengaturan/field-tambahan',
       is_active = TRUE,
       required_permissions = ARRAY['settings:customfield:view']::text[]
 WHERE key = 'md-field-tambahan';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'md-field-tambahan' AND is_active AND href = '/pengaturan/field-tambahan'
  ) THEN
    RAISE EXCEPTION '322 gagal: menu md-field-tambahan tak terbentuk atau tak aktif';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-field-tambahan' AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION '322 gagal: md-field-tambahan tak punya induk — tak akan muncul di sidebar';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/pengaturan/field-tambahan';
  IF n <> 1 THEN
    RAISE EXCEPTION '322 gagal: % menu aktif menunjuk /pengaturan/field-tambahan (harus 1)', n;
  END IF;

  -- `sort_order` TAK BOLEH bentrok dalam satu grup — migrasi 319 baru
  -- memperbaiki lima bentrokan pada hari yang sama.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT id FROM menu_items WHERE key = 'g-master-data' LIMIT 1)
     AND m.sort_order = 59;
  IF n <> 1 THEN
    RAISE EXCEPTION '322 gagal: % item aktif ber-sort_order 59 di g-master-data (harus 1)', n;
  END IF;

  -- Izin yang menjaga menunya harus ADA, kalau tidak menu tak pernah tampil
  -- untuk siapa pun dan halamannya jadi tak terjangkau.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:customfield:view') THEN
    RAISE EXCEPTION '322 gagal: izin settings:customfield:view tak ada — menu tak akan tampil';
  END IF;

  RAISE NOTICE '322 OK — /pengaturan/field-tambahan punya menunya sendiri di Master Data (sort 59)';
END $$;
