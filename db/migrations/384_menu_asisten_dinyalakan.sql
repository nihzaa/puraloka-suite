-- ============================================================================
-- 384 — EMPAT SUB-MENU ASISTEN YANG HALAMANNYA HIDUP TAPI BARISNYA MATI
-- ============================================================================
--
-- Founder 2026-08-15, sambil membuka `/pengaturan/asisten/pemilik`:
--
--   *"untuk tab yg aktiv kaya gini kenapa di sidebarnya kebaca gaada yang
--    aktif, ini aneh"*
--
-- Memang aneh, dan sebabnya bukan di logika penyorotan. Diukur:
--
--   /pengaturan/asisten          is_active = true
--   /pengaturan/asisten/pemilik  is_active = FALSE
--   /pengaturan/asisten/staf     is_active = FALSE
--   /pengaturan/asisten/wawasan  is_active = FALSE
--   /pengaturan/asisten/web      is_active = FALSE
--
-- `routes/v1/menu.ts:48` menyaring `is_active = true`, jadi keempat baris itu
-- **tak pernah dikirim ke sidebar sama sekali**. Yang tak dirender tak bisa
-- disorot — dan sidebar yang bekerja dengan benar akhirnya terlihat rusak.
--
-- ── Kenapa ini terjadi
--
-- Halaman Asisten dipecah jadi empat pada 2026-08-11 (satu halaman setinggi
-- 4.566 px → empat sub-halaman). Halamannya dibuat, rutenya jalan, dan
-- barisnya didaftarkan — tetapi `is_active` tak pernah dinyalakan.
--
-- Ini bentuk lain dari cacat yang CLAUDE.md §8a.4 sebut paling sering di repo
-- ini: **dokumen/menu tertinggal dari kode**. Tujuh sub-menu pernah ditandai
-- 🔴 padahal UI-nya sudah hidup berbulan-bulan. Kali ini kebalikannya —
-- halamannya hidup, barisnya yang mati — tapi akarnya sama: dua tempat yang
-- harus sepakat, dan hanya satu yang diperbarui.
--
-- ── Kenapa `is_active` DIPERTAHANKAN, bukan dihapus saja
--
-- Kolom itu berguna: sub-menu yang halamannya belum ada memang harus bisa
-- disembunyikan tanpa menghapus barisnya. Yang salah bukan kolomnya,
-- melainkan bahwa tak ada yang memeriksa "baris mati padahal halamannya ada".
-- Penjaga `uji-menu-halaman-hidup.mjs` (ambang NOL) dipasang bersama migrasi
-- ini supaya pasangan berikutnya tak lolos diam-diam.
-- ============================================================================

UPDATE menu_items
   SET is_active = true
 WHERE href IN (
        '/pengaturan/asisten/pemilik',
        '/pengaturan/asisten/staf',
        '/pengaturan/asisten/web',
        '/pengaturan/asisten/wawasan'
       )
   AND is_active = false;

-- ------------------------------------------------------------
-- Verifikasi — artefak, bukan niat.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_mati INTEGER;
BEGIN
  SELECT count(*) INTO n_mati
    FROM menu_items
   WHERE href LIKE '/pengaturan/asisten%'
     AND is_active = false;

  IF n_mati > 0 THEN
    RAISE EXCEPTION '384 gagal: masih % baris menu asisten yang mati', n_mati;
  END IF;

  -- Keempatnya harus benar-benar ADA, bukan sekadar "tak ada yang mati".
  -- Tanpa pemeriksaan ini, migrasi tetap hijau di basis yang barisnya
  -- terhapus — dan verdict "sudah diperbaiki" jadi bohong.
  IF (SELECT count(*) FROM menu_items WHERE href LIKE '/pengaturan/asisten/%') <> 4 THEN
    RAISE EXCEPTION '384 gagal: sub-menu asisten tidak berjumlah empat';
  END IF;
END $$;
