-- ============================================================================
-- 274 — MENU "Riwayat Asisten" di grup AI & Otomasi
-- ============================================================================
--
-- Halamannya sudah ada (`/otomasi/riwayat`, S8). Didaftarkan di commit yang
-- sama — CLAUDE.md §8a.4.
--
-- ── Izin: `ai:history:view` SUDAH ADA, dan itu justru masalahnya
--
-- Permission-nya lahir jauh sebelum hari ini dan sudah dipegang peran admin.
-- Yang TIDAK ada adalah pembacanya: diukur 2026-08-10, `grep -rn
-- "ai:history:view"` di seluruh `apps/api/src` dan `apps/web/app`
-- mengembalikan NOL berkas. Izin yang tak pernah diperiksa siapa pun adalah
-- kebalikan dari izin yatim migrasi 271 — yang satu punya pemegang tanpa
-- pintu, yang satu punya pintu tanpa pemegang. Keduanya sama-sama fitur mati
-- yang tak mengeluarkan satu pun galat.
--
-- Verifikasi di bawah karena itu memeriksa DUA arah: izinnya punya pemegang,
-- DAN menunya benar-benar memakainya.
--
-- ── Pola migrasi ini menyalin 273, dan alasannya ditulis di sana
--
-- Meregenerasi `153_peta_menu_penuh.sql` untuk menambah satu baris menu
-- MEMBATALKAN `232_sidebar_disiplin` (153 mendahuluinya) — 235 item berbagi
-- 84 href, 26 di antaranya menunjuk /proyek. Migrasi maju bernomor adalah
-- satu-satunya cara yang aman.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '274 gagal: grup menu g-ai tak ditemukan (migrasi 253)';
  END IF;

  SELECT coalesce(max(sort_order), 0) + 10 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-riwayat', 'Riwayat Asisten', '/otomasi/riwayat',
          'Dot', grup_id, urut,
          ARRAY['ai:history:view'], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;
END $$;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; v_href TEXT;
BEGIN
  SELECT href INTO v_href FROM menu_items WHERE key = 'ai-riwayat' AND is_active;
  IF v_href IS DISTINCT FROM '/otomasi/riwayat' THEN
    RAISE EXCEPTION '274 gagal: menu ai-riwayat tak aktif / href salah (%)', v_href;
  END IF;

  -- Satu route satu link (disiplin 232).
  SELECT count(*) INTO n FROM menu_items WHERE href = '/otomasi/riwayat' AND is_active;
  IF n <> 1 THEN
    RAISE EXCEPTION '274 gagal: /otomasi/riwayat dipakai % link aktif (harus 1)', n;
  END IF;

  -- ARAH PERTAMA: izinnya punya pemegang. Tanpa ini menunya tak terlihat
  -- siapa pun dan halamannya jadi yatim yang tak bergejala.
  SELECT count(*) INTO n
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
   WHERE p.key = 'ai:history:view';
  IF n = 0 THEN
    RAISE EXCEPTION '274 gagal: ai:history:view yatim — menunya tak akan terlihat siapa pun';
  END IF;

  -- ARAH KEDUA: menunya benar-benar MEMAKAI izin itu. Menu yang lupa
  -- mencantumkannya akan terlihat oleh semua orang yang bisa masuk dashboard,
  -- dan halaman ini memuat percakapan orang lain.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'ai-riwayat' AND 'ai:history:view' = ANY(required_permissions)) THEN
    RAISE EXCEPTION '274 gagal: menu ai-riwayat tak menuntut ai:history:view — '
      'riwayat percakapan jadi terbuka untuk semua yang bisa masuk dashboard';
  END IF;
END $$;
