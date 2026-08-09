-- ============================================================================
-- 255 — MENU "Pemakaian & Biaya" jadi HIDUP + halamannya
-- ============================================================================
--
-- Migrasi 253 mendaftarkannya `kesiapan: 'rencana'` tanpa href, karena
-- halamannya memang belum ada. Sekarang ada (`/pengaturan/biaya-ai`).
--
-- Menandainya sekarang, bukan nanti: CLAUDE.md §8a.4 mencatat cacat paling
-- sering di repo ini — TUJUH sub-menu pernah bertanda 🔴 padahal UI-nya sudah
-- hidup berbulan-bulan. Status yang tertinggal membuat sesi berikutnya
-- membangun ulang sesuatu yang sudah ada.
--
-- ── Kenapa halaman terpisah dari Penyedia AI
--
-- Penyedia AI menjawab *berapa* bulan ini; halaman ini menjawab *kenapa*
-- angkanya berubah. Menggabungkannya membuat satu halaman panjang yang
-- separuhnya konfigurasi dan separuhnya laporan — dan orang yang datang untuk
-- menelusuri lonjakan biaya harus melewati kotak isian dulu.
-- ============================================================================

UPDATE menu_items
   SET href = '/pengaturan/biaya-ai',
       kesiapan = 'hidup',
       is_active = true
 WHERE key = 'ai-biaya';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'ai-biaya' AND kesiapan = 'hidup' AND href = '/pengaturan/biaya-ai'
  ) THEN
    RAISE EXCEPTION '255 gagal: menu ai-biaya tidak jadi hidup';
  END IF;

  -- R-1: satu href tepat satu menu aktif.
  IF (SELECT count(*) FROM menu_items WHERE href = '/pengaturan/biaya-ai' AND is_active) <> 1 THEN
    RAISE EXCEPTION '255 gagal: href /pengaturan/biaya-ai tidak tepat satu menu aktif (R-1)';
  END IF;
END $$;
