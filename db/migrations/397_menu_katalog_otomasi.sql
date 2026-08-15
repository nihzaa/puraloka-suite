-- ============================================================================
-- 397 — MENU "KATALOG OTOMASI" + "AMBANG OTOMASI"
-- ============================================================================
--
-- Dua halaman yang lahir dari satu permintaan founder (2026-08-15): katalog
-- otomasi di UI beserta penjelasan dan alur kerjanya.
--
-- ── Kenapa DUA, bukan satu
--
-- Halaman kedua tidak direncanakan. Ia ketahuan saat halaman Katalog hendak
-- menautkan tombol "ubah" untuk lima ambang yang tersimpan sejak migrasi 396 —
-- dan tautan itu tak punya tujuan. Ambangnya ada di basis, dibaca rute
-- otomasi, tetapi **tak ada satu pun tempat di UI untuk mengubahnya**.
--
-- CLAUDE.md §8 menyebut persis pola ini: "Kolom DB sudah ada" bukan selesai;
-- config-first berarti ada halaman pengaturannya di UI. Migrasi 396 berhenti
-- setengah jalan tanpa ada yang merah.
--
-- ── `required_permissions` masing-masing berbeda, dan itu disengaja
--
-- Katalog  → `otomasi:alur:lihat`  — sama dengan halaman Alur. Ia hanya
--            MEMBACA penjelasan; yang boleh melihat status alur boleh pula
--            membaca apa yang dikerjakannya.
--
-- Ambang   → `settings:manage`     — sama dengan gerbang rute yang benar-benar
--            menyimpannya (`PUT /api/v1/settings/config`). Menu yang lebih
--            longgar daripada rutenya membuat orang menemukan halaman, mengisi
--            angka, lalu ditolak saat Simpan — penolakan yang datang paling
--            terlambat dan paling tak menjelaskan.
--
-- ── `is_active` ditulis EKSPLISIT
--
-- Pelajaran migrasi 384, diulang di 390: empat sub-menu Asisten mati diam-diam
-- selama empat hari karena kolom ini tak pernah dinyalakan. Halamannya hidup,
-- rutenya jalan, dan sidebar tak menampilkan apa pun.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '397 gagal: grup menu g-ai tak ditemukan (migrasi 253)';
  END IF;

  SELECT coalesce(max(sort_order), 0) + 10 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-katalog', 'Katalog Otomasi', '/otomasi/katalog',
          'Dot', grup_id, urut,
          ARRAY['otomasi:alur:lihat']::TEXT[], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;

  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-ambang', 'Ambang Otomasi', '/pengaturan/otomasi',
          'Dot', grup_id, urut + 10,
          ARRAY['settings:manage']::TEXT[], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;
END $$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
--
-- Blok ini bukan formalitas. Migrasi menu di repo ini sudah pernah "berhasil"
-- tanpa menghasilkan menu yang terlihat, dan tak ada yang merah.
DO $$
DECLARE
  n      INT;
  v_href TEXT;
BEGIN
  FOR v_href IN SELECT unnest(ARRAY['/otomasi/katalog', '/pengaturan/otomasi'])
  LOOP
    -- Satu route satu link (disiplin 232).
    SELECT count(*) INTO n FROM menu_items WHERE href = v_href AND is_active;
    IF n <> 1 THEN
      RAISE EXCEPTION '397 gagal: % link aktif ke %, harus 1', n, v_href;
    END IF;
  END LOOP;

  -- Izin ambang WAJIB sama dengan gerbang rute penyimpannya. Kalau kelak ada
  -- yang melonggarkannya jadi array kosong "supaya semua bisa lihat", di
  -- sinilah ia berhenti.
  SELECT count(*) INTO n FROM menu_items
   WHERE key = 'ai-ambang' AND is_active
     AND required_permissions @> ARRAY['settings:manage']::TEXT[];
  IF n <> 1 THEN
    RAISE EXCEPTION '397 gagal: menu ai-ambang tak bergerbang settings:manage';
  END IF;
END $$;
