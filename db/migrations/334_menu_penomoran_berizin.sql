-- ════════════════════════════════════════════════════════════════════════════
-- 334 — Menu penomoran: izin yang hilang, dan empat tautan 404
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang ditemukan saat membangun F1
--
-- `md-penomoran` sudah AKTIF dan menunjuk `/master/penomoran`. Halamannya tak
-- pernah dibuat — jadi menu itu tautan 404 yang terlihat semua orang.
--
-- Dan bukan hanya satu. Diukur 2026-08-12, keempat menu `/master/*` aktif
-- dengan NOL halaman:
--
--     md-wbs            /master/wbs               404
--     md-karyawan       /master/karyawan          404
--     md-penomoran      /master/penomoran         404  ← ditutup F1
--     md-template-dok   /master/template-dokumen  404
--
-- Migrasi ini menutup satu (halamannya dibuat di commit yang sama) dan
-- MENONAKTIFKAN sisanya sampai halamannya ada. Menonaktifkan bukan menghapus:
-- entrinya tetap jadi catatan rancangan, dan menghidupkannya kembali cukup
-- satu UPDATE saat halamannya jadi.
--
-- `md-wbs` dihidupkan lagi di F2. Kalau F2 tak jadi dikerjakan, ia tetap
-- nonaktif — dan itu jujur: menu mati lebih baik daripada menu yang menjanjikan
-- halaman lalu memberi 404.
--
-- ── Izin yang hilang
--
-- Keempatnya ber-`required_permissions = '{}'` — terlihat SEMUA orang. Untuk
-- penomoran itu salah: nomor dokumen menentukan bentuk invoice yang keluar ke
-- klien, dan siapa saja bisa membukanya berarti siapa saja bisa mengubahnya
-- (sampai rutenya menolak, yang datang belakangan dan terbaca seperti bug).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Penomoran: berizin, dan halamannya nyata ─────────────────────────────
UPDATE menu_items
   SET required_permissions = ARRAY['penomoran:view']::text[],
       icon = 'Hash',
       is_active = TRUE
 WHERE key = 'md-penomoran';

-- ── 2. Tiga tautan 404 dinonaktifkan ────────────────────────────────────────
--
-- Diambil dari daftar EKSPLISIT, bukan "semua yang halamannya tak ada":
-- migrasi tak bisa membaca berkas, jadi menebaknya berarti mematikan menu
-- yang halamannya sebenarnya ada.
UPDATE menu_items
   SET is_active = FALSE
 WHERE key IN ('md-wbs', 'md-karyawan', 'md-template-dok');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'md-penomoran' AND is_active AND href = '/master/penomoran'
       AND 'penomoran:view' = ANY(required_permissions)
  ) THEN
    RAISE EXCEPTION '334 gagal: md-penomoran tak aktif, href salah, atau tanpa izin';
  END IF;

  -- Izin yang dirujuk WAJIB ada. Menu yang menuntut izin hantu tak pernah
  -- terlihat siapa pun, dan tak ada galat yang menandainya.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'penomoran:view') THEN
    RAISE EXCEPTION '334 gagal: izin penomoran:view tak ada — jalankan migrasi 333 lebih dulu';
  END IF;

  SELECT count(*) INTO n FROM menu_items
   WHERE key IN ('md-wbs', 'md-karyawan', 'md-template-dok') AND is_active;
  IF n > 0 THEN
    RAISE EXCEPTION '334 gagal: % menu /master/* masih aktif tanpa halaman', n;
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/master/penomoran';
  IF n <> 1 THEN
    RAISE EXCEPTION '334 gagal: % menu aktif menunjuk /master/penomoran (harus 1)', n;
  END IF;

  -- Induk WAJIB aktif.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'md-penomoran' AND p.is_active
  ) THEN
    RAISE EXCEPTION '334 gagal: induk md-penomoran nonaktif — itemnya menggantung';
  END IF;

  RAISE NOTICE '334 OK — penomoran berizin & berhalaman; 3 tautan 404 dimatikan';
END $$;
