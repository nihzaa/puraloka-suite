-- ============================================================================
-- 261 — MENU "Plafon Asisten" di grup AI & Otomasi
-- ============================================================================
--
-- Halamannya sudah ada (`/pengaturan/plafon-asisten`). Didaftarkan SEKARANG,
-- di commit yang sama — CLAUDE.md §8a.4 mencatat cacat paling sering di repo
-- ini: TUJUH sub-menu pernah bertanda belum-dikerjakan padahal UI-nya sudah
-- hidup berbulan-bulan, dan status yang tertinggal membuat sesi berikutnya
-- membangun ulang sesuatu yang sudah ada.
--
-- Permission `settings:ai:batas` (migrasi 260), BUKAN `ai:setujui`. Yang boleh
-- MEMAKAI plafon bukan yang boleh MENENTUKANNYA — kalau sama, siapa pun bisa
-- menaikkan batasnya sendiri sebelum menyetujui, dan gerbang nominalnya jadi
-- hiasan.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '261 gagal: grup menu g-ai tak ditemukan (migrasi 253)';
  END IF;

  -- Ditaruh PALING BAWAH grupnya: ia pengaturan yang jarang disentuh, dan
  -- mendorongnya ke atas akan menggeser menu harian yang lebih sering dipakai.
  SELECT coalesce(max(sort_order), 0) + 10 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-plafon-setujui', 'Plafon Asisten', '/pengaturan/plafon-asisten',
          'Dot', grup_id, urut,
          ARRAY['settings:ai:batas'], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET href = EXCLUDED.href,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;
END $$;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'ai-plafon-setujui' AND kesiapan = 'hidup'
       AND href = '/pengaturan/plafon-asisten'
  ) THEN
    RAISE EXCEPTION '261 gagal: menu plafon tidak hidup';
  END IF;

  -- R-1: satu href tepat satu menu aktif.
  IF (SELECT count(*) FROM menu_items
       WHERE href = '/pengaturan/plafon-asisten' AND is_active) <> 1 THEN
    RAISE EXCEPTION '261 gagal: href tidak tepat satu menu aktif (R-1)';
  END IF;

  -- Permission yang disaring WAJIB benar-benar ada. Menu yang menyaring
  -- permission tak dikenal tak pernah terlihat siapa pun — dan gejalanya
  -- "halamannya hilang", bukan "ada yang salah".
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:ai:batas') THEN
    RAISE EXCEPTION '261 gagal: permission settings:ai:batas tidak ada';
  END IF;

  -- Ikon `Dot`, SAMA dengan empat saudaranya di grup ini (diukur dari basis,
  -- bukan ditebak). Ikon tak dikenal tampil sebagai FOLDER tanpa satu pun
  -- galat — terjadi 2026-08-09 pada menu asisten. Memakai ikon yang sudah
  -- terbukti dipakai saudaranya menutup kemungkinan itu sepenuhnya.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'ai-plafon-setujui' AND icon = 'Dot'
  ) THEN
    RAISE EXCEPTION '261 gagal: ikon menu bukan Dot — tak seragam dengan grupnya';
  END IF;
END $$;
