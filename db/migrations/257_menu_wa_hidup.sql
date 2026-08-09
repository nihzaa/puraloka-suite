-- ============================================================================
-- 257 — MENU "Kanal WhatsApp" jadi HIDUP
-- ============================================================================
--
-- Migrasi 253 mendaftarkannya `kesiapan: 'rencana'` tanpa href — halamannya
-- memang belum ada. Sekarang ada (`/pengaturan/whatsapp`).
--
-- Ditandai SEKARANG, bukan nanti: CLAUDE.md §8a.4 mencatat cacat paling sering
-- di repo ini — TUJUH sub-menu pernah bertanda 🔴 padahal UI-nya sudah hidup
-- berbulan-bulan. Status yang tertinggal membuat sesi berikutnya membangun
-- ulang sesuatu yang sudah ada.
--
-- Permission-nya `settings:wa:view` (migrasi 256), bukan `settings:ai:manage`
-- seperti saat masih rencana: halaman ini menjawab "nomor siapa saja yang
-- terdaftar" dan "kenapa notifikasi tak sampai" — pertanyaan yang sering
-- dibawa orang yang tak berwenang mengubahnya.
-- ============================================================================

UPDATE menu_items
   SET href = '/pengaturan/whatsapp',
       kesiapan = 'hidup',
       required_permissions = ARRAY['settings:wa:view'],
       is_active = true
 WHERE key = 'ai-whatsapp';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'ai-whatsapp' AND kesiapan = 'hidup' AND href = '/pengaturan/whatsapp'
  ) THEN
    RAISE EXCEPTION '257 gagal: menu ai-whatsapp tidak jadi hidup';
  END IF;

  -- R-1: satu href tepat satu menu aktif.
  IF (SELECT count(*) FROM menu_items WHERE href = '/pengaturan/whatsapp' AND is_active) <> 1 THEN
    RAISE EXCEPTION '257 gagal: href /pengaturan/whatsapp tidak tepat satu menu aktif (R-1)';
  END IF;

  -- Permission yang disaring harus benar-benar ada. Menu yang menyaring
  -- permission tak dikenal tidak pernah terlihat siapa pun — dan gejalanya
  -- "halamannya hilang", bukan "ada yang salah".
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:wa:view') THEN
    RAISE EXCEPTION '257 gagal: permission settings:wa:view tidak ada';
  END IF;
END $$;
