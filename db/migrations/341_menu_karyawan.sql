-- ════════════════════════════════════════════════════════════════════════════
-- 341 — Menu Data Kepegawaian
-- ════════════════════════════════════════════════════════════════════════════
--
-- `md-karyawan` DINONAKTIFKAN migrasi 334 (F1) karena `/master/karyawan`
-- adalah tautan 404. Waktu itu saya menulis di migrasinya bahwa ia tetap
-- nonaktif sampai halamannya ada — dan sekarang ada.
--
-- Tinggal SATU tautan 404 yang masih mati: `md-template-dok`
-- (/master/template-dokumen).
--
-- ── Izin: `sdm:pegawai:view`
--
-- Izin itu ADA sejak lama, diberikan ke dua peran, dan dipakai policy RLS —
-- tetapi nol rute memakainya sampai hari ini (migrasi 340 + rute
-- `/api/v1/sdm/pegawai/kelola`). Menu ini yang membuatnya benar-benar terpakai.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/master/karyawan',
       label = 'Data Kepegawaian',
       icon = 'IdCard',
       is_active = TRUE,
       required_permissions = ARRAY['sdm:pegawai:view']::text[]
 WHERE key = 'md-karyawan';

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'md-karyawan',
       'Data Kepegawaian',
       '/master/karyawan',
       'IdCard',
       (SELECT parent_id FROM menu_items WHERE key = 'md-penomoran' LIMIT 1),
       ARRAY['sdm:pegawai:view']::text[],
       62,
       (SELECT section FROM menu_items WHERE key = 'md-penomoran' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-karyawan');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'md-karyawan' AND is_active AND href = '/master/karyawan'
       AND 'sdm:pegawai:view' = ANY(required_permissions)
  ) THEN
    RAISE EXCEPTION '341 gagal: md-karyawan tak aktif, href salah, atau tanpa izin';
  END IF;

  -- Izin yang dirujuk WAJIB ada DAN diberikan. Menu yang menuntut izin hantu
  -- tak pernah terlihat siapa pun, dan tak ada galat yang menandainya.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'sdm:pegawai:view') THEN
    RAISE EXCEPTION '341 gagal: izin sdm:pegawai:view tak ada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'sdm:pegawai:view'
  ) THEN
    RAISE EXCEPTION '341 gagal: sdm:pegawai:view tak diberikan ke peran mana pun';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/master/karyawan';
  IF n <> 1 THEN
    RAISE EXCEPTION '341 gagal: % menu aktif menunjuk /master/karyawan (harus 1)', n;
  END IF;

  -- Induk WAJIB aktif.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'md-karyawan' AND p.is_active
  ) THEN
    RAISE EXCEPTION '341 gagal: induk md-karyawan nonaktif — itemnya menggantung';
  END IF;

  -- sort_order tak bentrok DI ANTARA YANG AKTIF.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'md-karyawan' LIMIT 1)
     AND m.sort_order = (SELECT sort_order FROM menu_items WHERE key = 'md-karyawan' LIMIT 1);
  IF n <> 1 THEN
    RAISE EXCEPTION '341 gagal: % item AKTIF ber-sort_order sama di grup itu (harus 1)', n;
  END IF;

  -- Tautan 404 yang tersisa TETAP mati — kalau ia hidup tanpa halaman,
  -- migrasi 334 sia-sia.
  IF EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-template-dok' AND is_active) THEN
    RAISE EXCEPTION '341 gagal: md-template-dok hidup lagi tanpa halaman';
  END IF;

  RAISE NOTICE '341 OK — /master/karyawan hidup berizin; satu tautan 404 tersisa (md-template-dok)';
END $$;
