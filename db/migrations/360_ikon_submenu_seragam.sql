-- ============================================================================
-- 360 — 19 sub-menu berikon sendiri, 122 bertitik: ritme yang patah
-- ============================================================================
--
-- ── Yang founder lihat, 2026-08-14
--
--   "terus ini ada 2 sub menu yg pake icon, emang menurutmu lebih baik sub
--    menu itu gapake icon?"
--
-- Yang ia tunjuk `sys-recycle-bin` (Trash2) dan `sys-impor` (Upload) di grup
-- Administrasi. Diukur, ternyata bukan dua:
--
--   sub-menu aktif   141
--   ikon `Dot`       122   ← pola
--   ikon lain         19   ← ganjil, tersebar di 10 grup
--
-- ── Kenapa yang 19 yang diseragamkan, bukan 122 yang diberi ikon
--
-- `components/sidebar.tsx` sudah menuliskan alasannya sendiri, dan itu bukan
-- selera: *"202 ikon berbeda justru menghapus fungsi ikon sebagai penanda"*.
--
-- Saat sidebar TERBUKA, yang bekerja adalah labelnya. Ikon yang berbeda-beda
-- di sana justru membuat mata berhenti di tempat acak — bukan di tempat yang
-- penting. Titik seragam berfungsi sebagai penanda RITME: mata memakainya
-- untuk mengukur jarak antar-baris, bukan untuk membaca isinya.
--
-- Sembilan belas yang ganjil merusak justru fungsi itu: deretan titik yang
-- tiba-tiba disela satu gambar membuat baris itu tampak lebih penting dari
-- tetangganya — padahal `Recycle Bin` tidak lebih penting dari `Audit Log`.
--
-- Ini juga arah yang dipakai Linear, Notion, dan Vercel hari ini: ikon di
-- tingkat GRUP (yang memang dibaca sendirian saat sidebar diciutkan), teks
-- polos di tingkat anak.
--
-- ── Ikon GRUP tidak disentuh
--
-- Ke-19 ikon grup tetap berbeda-beda, dan itu memang seharusnya: saat sidebar
-- diciutkan jadi 64px, labelnya hilang dan ikon grup adalah satu-satunya yang
-- tersisa. Alasan yang sama yang membuat sub-menu tak butuh ikon membuat grup
-- WAJIB punya.
-- ============================================================================

DO $$
DECLARE
  n_sebelum int;
  n_sesudah int;
  n_grup    int;
BEGIN
  SELECT count(*) INTO n_sebelum
    FROM menu_items a JOIN menu_items b ON b.id = a.parent_id
   WHERE a.is_active AND a.icon IS DISTINCT FROM 'Dot';

  IF n_sebelum = 0 THEN
    RAISE NOTICE '360: sub-menu sudah seragam, tak ada yang diubah';
  END IF;

  -- HANYA yang punya induk. Item tingkat atas (grup) tak tersentuh.
  UPDATE menu_items a
     SET icon = 'Dot', updated_at = now()
    FROM menu_items b
   WHERE b.id = a.parent_id
     AND a.icon IS DISTINCT FROM 'Dot';

  SELECT count(*) INTO n_sesudah
    FROM menu_items a JOIN menu_items b ON b.id = a.parent_id
   WHERE a.icon IS DISTINCT FROM 'Dot';

  IF n_sesudah <> 0 THEN
    RAISE EXCEPTION '360 gagal: masih ada % sub-menu berikon ganjil', n_sesudah;
  END IF;

  -- Ikon GRUP wajib tetap beragam. Kalau UPDATE di atas salah sasaran dan
  -- ikut meratakan grup, sidebar yang diciutkan berubah jadi 19 titik
  -- identik — dan tak ada galat yang menyatakannya.
  SELECT count(DISTINCT icon) INTO n_grup
    FROM menu_items WHERE parent_id IS NULL AND is_active AND icon IS NOT NULL;

  IF n_grup < 10 THEN
    RAISE EXCEPTION '360 gagal: ikon grup ikut diratakan (% bentuk unik tersisa)', n_grup;
  END IF;

  RAISE NOTICE '360: % sub-menu diseragamkan ke Dot · % bentuk ikon grup tetap utuh',
    n_sebelum, n_grup;
END $$;
