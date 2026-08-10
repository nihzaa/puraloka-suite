-- ============================================================================
-- 267 — Menu induk "AI & Otomasi" punya IKHTISAR + sub-menu Penyedia Layanan
-- ============================================================================
--
-- ── Hutang yang sudah tercatat, bukan permintaan baru
--
-- `uji-induk-punya-ikhtisar` menandai `g-ai` sebagai satu dari DUA grup induk
-- tanpa halaman ikhtisar (lantai 2). Penjaga itu menuliskan aturannya sendiri:
-- "menu induk yang punya anak WAJIB punya halaman ikhtisar" — dan
-- menurunkan lantainya harus di commit yang SAMA dengan halamannya.
--
-- Lantai 2 → 1 diturunkan di commit ini.
--
-- ── Kenapa `/otomasi`, bukan `/pengaturan/ai`
--
-- Grup ini bukan hanya pengaturan. Ia memuat kanal WhatsApp, riwayat
-- percakapan, dan kelak workflow — hal-hal yang dibuka untuk MELIHAT keadaan,
-- bukan untuk mengubah setelan. Menaruhnya di bawah `/pengaturan` membuat
-- orang yang mencari "kenapa asistennya diam" berhenti karena merasa salah
-- tempat.
--
-- ── Penyedia Layanan jadi sub-menu PERTAMA
--
-- Ia yang menjawab pertanyaan paling sering: "sambungannya hidup tidak?".
-- Sub-menu lain mengubah perilaku; yang ini menjelaskan kenapa perilakunya
-- tak muncul sama sekali.
-- ============================================================================

-- Grup induk mendapat href-nya sendiri.
UPDATE menu_items SET href = '/otomasi' WHERE key = 'g-ai' AND parent_id IS NULL;

DO $$
DECLARE grup_id UUID;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '267 gagal: grup g-ai tak ditemukan';
  END IF;

  -- Ikon `Dot`, seragam dengan saudaranya (diukur dari basis 2026-08-10).
  -- Ikon tak dikenal tampil sebagai FOLDER tanpa galat — pernah terjadi pada
  -- menu asisten.
  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-penyedia', 'Penyedia Layanan', '/pengaturan/penyedia',
          'Dot', grup_id, 5,
          ARRAY['settings:penyedia:view'], 'hidup', true)
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
DECLARE n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'g-ai' AND href = '/otomasi'
  ) THEN
    RAISE EXCEPTION '267 gagal: grup g-ai tak punya href ikhtisar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'ai-penyedia' AND kesiapan = 'hidup'
       AND href = '/pengaturan/penyedia' AND is_active
  ) THEN
    RAISE EXCEPTION '267 gagal: sub-menu Penyedia Layanan tidak hidup';
  END IF;

  -- R-1: satu href tepat satu menu aktif.
  FOR n IN
    SELECT count(*) FROM menu_items
     WHERE href IN ('/otomasi', '/pengaturan/penyedia') AND is_active
     GROUP BY href
  LOOP
    IF n <> 1 THEN
      RAISE EXCEPTION '267 gagal: ada href dengan % menu aktif (R-1)', n;
    END IF;
  END LOOP;

  -- Permission yang disaring WAJIB ada; menu yang menyaring permission tak
  -- dikenal tak pernah terlihat siapa pun.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:penyedia:view') THEN
    RAISE EXCEPTION '267 gagal: permission settings:penyedia:view tidak ada';
  END IF;
END $$;
