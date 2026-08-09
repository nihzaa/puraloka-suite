-- ============================================================================
-- 243 — MENU KREDENSIAL (TJS-A1)
-- ============================================================================
--
-- Mendaftarkan `/pengaturan/kredensial` ke sidebar, di grup Administrasi
-- bersama pengaturan sistem lainnya.
--
-- ── Kenapa disaring permission
--
-- Halaman ini tak pernah menampilkan nilai kredensial (dijaga penjaga CI
-- `audit-kredensial-tak-bocor.mjs`), jadi melihatnya tak membocorkan apa pun.
-- Tapi ia menunjukkan integrasi apa saja yang dipakai perusahaan ini — dan
-- itu informasi yang tak perlu dilihat semua orang.
--
-- `settings:credentials:view` sengaja yang dipakai, bukan `:manage`: menu
-- yang hanya muncul untuk yang bisa MENGUBAH akan menyembunyikannya dari
-- orang yang tugasnya justru MEMERIKSA.
--
-- ── Kenapa sesudah Situs Publik, bukan di akhir
--
-- Urutan grup Administrasi mengikuti kedekatan makna: identitas & akses
-- (Pengguna, Matriks Izin) → alur kerja (Approval, Notifikasi) → identitas
-- perusahaan (Profil, Situs) → INTEGRASI → jejak & pemeliharaan (Audit,
-- Sistem). Kredensial adalah pintu ke sistem luar, jadi ia duduk sebelum
-- audit dan pemeliharaan, bukan di antara pengaturan tampilan.
-- ============================================================================

-- Geser dua menu terakhir supaya kredensial mendapat 1608 tanpa tabrakan.
UPDATE menu_items SET sort_order = 1609 WHERE key = 'audit'   AND sort_order = 1608;
UPDATE menu_items SET sort_order = 1610 WHERE key = 'sistem'  AND sort_order = 1609;

-- INSERT langsung, bukan `pasang_menu()`: helper itu didefinisikan DI DALAM
-- migrasi 241 dan tidak persisten sesudahnya. Memanggilnya di sini gagal
-- dengan "function does not exist" — dan kegagalan itu benar, karena helper
-- yang hidup lintas migrasi akan jadi ketergantungan tak terlihat.
INSERT INTO menu_items (
  key, label, href, icon, sort_order, section,
  parent_id, is_active, kesiapan, required_permissions
)
VALUES (
  'pengaturan-kredensial',
  'Kredensial & Integrasi',
  '/pengaturan/kredensial',
  'Dot',
  1608,
  'main',
  (SELECT id FROM menu_items WHERE key = 'g-administrasi'),
  true,
  'hidup',
  ARRAY['settings:credentials:view']
)
ON CONFLICT (key) DO UPDATE SET
  label                = EXCLUDED.label,
  href                 = EXCLUDED.href,
  sort_order           = EXCLUDED.sort_order,
  parent_id            = EXCLUDED.parent_id,
  is_active            = true,
  kesiapan             = EXCLUDED.kesiapan,
  required_permissions = EXCLUDED.required_permissions;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_urut INT;
  v_bentrok INT;
BEGIN
  SELECT sort_order INTO v_urut
  FROM menu_items WHERE key = 'pengaturan-kredensial';

  IF v_urut IS NULL THEN
    RAISE EXCEPTION '243 gagal: menu pengaturan-kredensial tidak terbentuk';
  END IF;

  -- R-1 (migrasi 232): satu rute = tepat satu menu.
  IF (SELECT count(*) FROM menu_items
      WHERE href = '/pengaturan/kredensial' AND is_active) <> 1 THEN
    RAISE EXCEPTION '243 gagal: href /pengaturan/kredensial tidak tepat satu menu aktif';
  END IF;

  -- Urutan unik di dalam grupnya — dua menu ber-sort_order sama membuat
  -- urutannya bergantung pada urutan baris, yang tak dijamin.
  SELECT count(*) INTO v_bentrok
  FROM (
    SELECT sort_order FROM menu_items
    WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-administrasi')
      AND is_active
    GROUP BY sort_order HAVING count(*) > 1
  ) s;

  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '243 gagal: % sort_order bentrok di grup Administrasi', v_bentrok;
  END IF;
END $$;
