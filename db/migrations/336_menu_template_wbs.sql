-- ════════════════════════════════════════════════════════════════════════════
-- 336 — Menu Template WBS (F2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `md-wbs` DINONAKTIFKAN migrasi 334 (F1) karena `/master/wbs` adalah tautan
-- 404 — halamannya tak pernah dibuat. Waktu itu saya menulis di migrasinya:
--
--     "`md-wbs` dihidupkan lagi di F2. Kalau F2 tak jadi dikerjakan, ia tetap
--      nonaktif — dan itu jujur."
--
-- F2 jadi dikerjakan, jadi ini menepatinya.
--
-- ── Izin: `cecep:cbs:view`, bukan izin baru
--
-- Policy `cbs_templates_read` sudah memakainya sejak tabelnya lahir. Membuat
-- izin kedua untuk hal yang sama menghasilkan dua kebenaran tentang siapa
-- berwenang, dan dua kebenaran cepat atau lambat berbeda (pelajaran 289).
--
-- ── Dua tautan 404 yang MASIH mati, dan itu disengaja
--
-- `md-karyawan` (/master/karyawan) dan `md-template-dok`
-- (/master/template-dokumen) tetap nonaktif — halamannya belum ada. Menu mati
-- lebih baik daripada menu yang menjanjikan halaman lalu memberi 404.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/master/wbs',
       label = 'Template WBS',
       icon = 'Network',
       is_active = TRUE,
       required_permissions = ARRAY['cecep:cbs:view']::text[]
 WHERE key = 'md-wbs';

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'md-wbs',
       'Template WBS',
       '/master/wbs',
       'Network',
       (SELECT parent_id FROM menu_items WHERE key = 'md-penomoran' LIMIT 1),
       ARRAY['cecep:cbs:view']::text[],
       61,
       (SELECT section FROM menu_items WHERE key = 'md-penomoran' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-wbs');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'md-wbs' AND is_active AND href = '/master/wbs'
       AND 'cecep:cbs:view' = ANY(required_permissions)
  ) THEN
    RAISE EXCEPTION '336 gagal: md-wbs tak aktif, href salah, atau tanpa izin';
  END IF;

  -- Izin yang dirujuk WAJIB ada. Menu yang menuntut izin hantu tak pernah
  -- terlihat siapa pun, dan tak ada galat yang menandainya.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'cecep:cbs:view') THEN
    RAISE EXCEPTION '336 gagal: izin cecep:cbs:view tak ada';
  END IF;

  -- Dan benar-benar DIBERIKAN ke sebuah peran — kalau tidak, menunya tak
  -- pernah muncul dan halamannya tak pernah bisa dibuka siapa pun.
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'cecep:cbs:view'
  ) THEN
    RAISE EXCEPTION '336 gagal: cecep:cbs:view tak diberikan ke peran mana pun';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/master/wbs';
  IF n <> 1 THEN
    RAISE EXCEPTION '336 gagal: % menu aktif menunjuk /master/wbs (harus 1)', n;
  END IF;

  -- Induk WAJIB aktif.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'md-wbs' AND p.is_active
  ) THEN
    RAISE EXCEPTION '336 gagal: induk md-wbs nonaktif — itemnya menggantung';
  END IF;

  -- sort_order tak bentrok DI ANTARA YANG AKTIF.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'md-wbs' LIMIT 1)
     AND m.sort_order = (SELECT sort_order FROM menu_items WHERE key = 'md-wbs' LIMIT 1);
  IF n <> 1 THEN
    RAISE EXCEPTION '336 gagal: % item AKTIF ber-sort_order sama di grup itu (harus 1)', n;
  END IF;

  -- Dua tautan 404 lainnya TETAP mati — kalau salah satu hidup tanpa halaman,
  -- migrasi 334 sia-sia.
  SELECT count(*) INTO n FROM menu_items
   WHERE key IN ('md-karyawan', 'md-template-dok') AND is_active;
  IF n > 0 THEN
    RAISE EXCEPTION '336 gagal: % menu /master/* hidup lagi tanpa halaman', n;
  END IF;

  RAISE NOTICE '336 OK — /master/wbs hidup berizin; dua tautan 404 tetap mati';
END $$;
