-- ============================================================================
-- 246 — MENU JADWAL TUGAS (TJS-A2)
-- ============================================================================
--
-- Mendaftarkan `/pengaturan/jadwal` di grup Administrasi, tepat sesudah
-- Kredensial & Integrasi: keduanya "pintu ke luar" — satu ke sistem lain,
-- satu ke waktu.
--
-- Disaring `settings:schedule:view` (bukan `:manage`) dengan alasan yang sama
-- seperti menu kredensial: halaman ini menjawab "kenapa notifikasi belum
-- datang", dan yang paling butuh menanyakannya sering bukan yang berwenang
-- mengubah jadwalnya.
-- ============================================================================

UPDATE menu_items SET sort_order = 1610 WHERE key = 'audit'  AND sort_order = 1609;
UPDATE menu_items SET sort_order = 1611 WHERE key = 'sistem' AND sort_order = 1610;

INSERT INTO menu_items (
  key, label, href, icon, sort_order, section,
  parent_id, is_active, kesiapan, required_permissions
)
VALUES (
  'pengaturan-jadwal', 'Jadwal Tugas', '/pengaturan/jadwal', 'Dot',
  1609, 'main',
  (SELECT id FROM menu_items WHERE key = 'g-administrasi'),
  true, 'hidup', ARRAY['settings:schedule:view']
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order, parent_id = EXCLUDED.parent_id,
  is_active = true, kesiapan = EXCLUDED.kesiapan,
  required_permissions = EXCLUDED.required_permissions;

DO $$
DECLARE v_bentrok INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'pengaturan-jadwal') THEN
    RAISE EXCEPTION '246 gagal: menu pengaturan-jadwal tidak terbentuk';
  END IF;

  IF (SELECT count(*) FROM menu_items WHERE href = '/pengaturan/jadwal' AND is_active) <> 1 THEN
    RAISE EXCEPTION '246 gagal: href /pengaturan/jadwal tidak tepat satu menu aktif (R-1)';
  END IF;

  SELECT count(*) INTO v_bentrok FROM (
    SELECT sort_order FROM menu_items
    WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-administrasi') AND is_active
    GROUP BY sort_order HAVING count(*) > 1
  ) s;
  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '246 gagal: % sort_order bentrok di grup Administrasi', v_bentrok;
  END IF;
END $$;
