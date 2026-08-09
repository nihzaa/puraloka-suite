-- ============================================================================
-- 248 — MENU INBOX APPROVAL (TJS-A3b)
-- ============================================================================
--
-- Ditaruh di grup PROYEK dengan sort_order paling awal, BUKAN di Administrasi.
--
-- Alasannya: ini bukan halaman pengaturan yang dibuka sesekali, melainkan
-- pekerjaan harian approver. Menaruhnya di Administrasi — bersama Matriks Izin
-- dan Audit Log — berarti ia hanya ditemukan orang yang sedang mengonfigurasi
-- sistem, bukan orang yang sedang bekerja.
--
-- Tanpa `required_permissions`: siapa yang boleh MELIHAT antrean ditentukan
-- `canParticipateInChain` per jenis di dalam endpoint-nya. Menyaring menu
-- dengan permission tersendiri akan jadi kebenaran KEDUA tentang siapa
-- berwenang, dan dua kebenaran cepat atau lambat berbeda. Yang tak berwenang
-- melihat antrean kosong — dan itu jawaban yang benar untuknya.
-- ============================================================================

INSERT INTO menu_items (
  key, label, href, icon, sort_order, section,
  parent_id, is_active, kesiapan, required_permissions
)
VALUES (
  'approval-inbox', 'Menunggu Persetujuan', '/approval-inbox', 'Dot',
  299, 'main',
  (SELECT id FROM menu_items WHERE key = 'g-proyek'),
  true, 'hidup', ARRAY[]::text[]
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order, parent_id = EXCLUDED.parent_id,
  is_active = true, kesiapan = EXCLUDED.kesiapan;

DO $$
DECLARE v_bentrok INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'approval-inbox') THEN
    RAISE EXCEPTION '248 gagal: menu approval-inbox tidak terbentuk';
  END IF;

  IF (SELECT count(*) FROM menu_items WHERE href = '/approval-inbox' AND is_active) <> 1 THEN
    RAISE EXCEPTION '248 gagal: href /approval-inbox tidak tepat satu menu aktif (R-1)';
  END IF;

  SELECT count(*) INTO v_bentrok FROM (
    SELECT sort_order FROM menu_items
    WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-proyek') AND is_active
    GROUP BY sort_order HAVING count(*) > 1
  ) s;
  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '248 gagal: % sort_order bentrok di grup Proyek', v_bentrok;
  END IF;
END $$;
