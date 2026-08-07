-- ════════════════════════════════════════════════════════════════════════════
-- 235 — Menu "Rekonsiliasi Bank" masuk kelompok Kas & Bank
--
-- Modul dibangun 2026-08-08 (migrasi 234): mencocokkan buku kas dengan
-- rekening koran. Tanpa entri menu, halamannya YATIM — hanya bisa dibuka
-- dengan mengetik URL, dan `audit-nav-yatim.mjs` akan merah.
--
-- Ditaruh sesudah "Transfer" (504) karena rekonsiliasi adalah pekerjaan AKHIR
-- BULAN: ia memeriksa apa yang sudah dicatat ketiga menu di atasnya, jadi
-- urutannya mengikuti urutan kerja, bukan abjad.
--
-- Aturan migrasi 232 tetap berlaku: satu route, satu link. `/kas/rekonsiliasi`
-- belum dipakai menu mana pun — diperiksa blok verifikasi di bawah.
--
-- Idempoten: ON CONFLICT (key) DO UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES (
  'kas-rekonsiliasi', 'Rekonsiliasi Bank', '/kas/rekonsiliasi', 'Dot', 505, 'main',
  (SELECT id FROM menu_items WHERE key = 'g-kas-bank'), true)
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label, href = EXCLUDED.href, icon = EXCLUDED.icon,
       sort_order = EXCLUDED.sort_order, section = 'main',
       parent_id = EXCLUDED.parent_id, is_active = true;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ganda TEXT;
  v_induk UUID;
BEGIN
  SELECT parent_id INTO v_induk FROM menu_items WHERE key = 'kas-rekonsiliasi';
  IF v_induk IS NULL THEN
    RAISE EXCEPTION '235 gagal: kelompok g-kas-bank tak ditemukan — menu jadi item lepas';
  END IF;

  -- Aturan pokok migrasi 232: satu alamat, satu link.
  SELECT string_agg(href || ' (' || n || ')', ', ' ORDER BY href) INTO v_ganda
    FROM (SELECT href, count(*) n FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) x;
  IF v_ganda IS NOT NULL THEN
    RAISE EXCEPTION '235 gagal: href dipakai lebih dari satu link: %', v_ganda;
  END IF;
END $$;
