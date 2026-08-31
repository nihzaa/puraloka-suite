-- ════════════════════════════════════════════════════════════════════════════
-- 554 — Menu "Rekomendasi Pembesian" di bawah Estimasi & Anggaran
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman `/estimasi/pembesian` sudah ada, tetapi belum punya satu pun tautan
-- navigasi — hanya bisa dibuka dengan mengetik URL. `audit-nav-yatim.mjs`
-- memerah begitu halamannya dibuat, dan itu memang tugasnya.
--
-- Halaman yang tak bisa dicapai siapa pun sama dengan halaman yang tak ada.
--
-- ── Kenapa izinnya `cecep:struktur:view`, bukan kunci baru
--
-- Layar ini memanggil `POST /api/v1/struktur/saran-pembesian`, yang dijaga
-- `requirePermission('cecep:struktur:view')`. Menu dan rute WAJIB memakai
-- kunci yang sama: menu yang tampil untuk orang yang rutenya akan menolak
-- membuat yang ditolak menyimpulkan aplikasinya rusak, bukan bahwa ia memang
-- tak berhak.
--
-- Kunci itu sudah dibuat migrasi 458 dan ditautkan ke peran oleh 459 — bukan
-- kunci baru. Kunci yang tak ada di tabel `permissions` menolak SEMUA orang
-- tanpa satu pun gejala (dijaga `audit-izin-benar-ada.mjs`), dan blok
-- verifikasi di bawah menolak migrasi ini kalau itu terjadi.
--
-- ── Kenapa sort_order 541
--
-- DIUKUR ke basis, bukan ditebak. Anak `g-anggaran` memakai 501, 502, 503,
-- dan 540 (`cc-struktur`); 541 kosong dan menempatkan layar ini tepat
-- SESUDAH Analisa Struktur — pasangannya yang arahnya berlawanan.
--
-- CLAUDE.md mencatat `sort_order` bentrok sebagai cacat yang pernah lolos ke
-- CI, jadi blok verifikasi di bawah menolak migrasi ini bila bentrok.
--
-- ── Kenapa idempoten lewat `key`, bukan `id`
--
-- `id` berbeda antar lingkungan (dev/CI/produksi). `key` kontrak yang sama di
-- semuanya. Induknya pun dicari lewat `key`, bukan UUID yang dipaku.
--
-- ⚠ Migrasi ini hanya MENAMBAH satu baris menu. Tak ada DROP, tak ada
-- perubahan data yang sudah ada.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
SELECT
  'cc-pembesian',
  'Rekomendasi Pembesian',
  '/estimasi/pembesian',
  'Ruler',
  induk.id,
  ARRAY['cecep:struktur:view'],
  541,
  induk.section,
  TRUE,
  'hidup'
  FROM menu_items induk
 WHERE induk.key = 'g-anggaran'
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label,
       href = EXCLUDED.href,
       parent_id = EXCLUDED.parent_id,
       required_permissions = EXCLUDED.required_permissions,
       sort_order = EXCLUDED.sort_order,
       is_active = TRUE,
       kesiapan = 'hidup',
       updated_at = now();

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  n INT;
BEGIN
  SELECT m.href, m.is_active, m.required_permissions, m.sort_order, m.parent_id
    INTO r
    FROM menu_items m WHERE m.key = 'cc-pembesian';

  IF r IS NULL THEN
    RAISE EXCEPTION '554 gagal: menu cc-pembesian tak terbentuk — induk g-anggaran ada?';
  END IF;

  IF r.href <> '/estimasi/pembesian' OR NOT r.is_active THEN
    RAISE EXCEPTION '554 gagal: href/is_active tak sesuai (href=%, aktif=%)', r.href, r.is_active;
  END IF;

  IF r.parent_id IS NULL THEN
    RAISE EXCEPTION '554 gagal: menu tanpa induk — ia tak akan muncul di sidebar mana pun';
  END IF;

  -- Izinnya wajib BENAR-BENAR ADA di tabel permissions. Kunci hantu menolak
  -- semua orang tanpa satu pun galat yang menunjuk sebabnya.
  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key = ANY(r.required_permissions);
  IF n <> array_length(r.required_permissions, 1) THEN
    RAISE EXCEPTION '554 gagal: ada kunci izin yang tak terdaftar di tabel permissions';
  END IF;

  -- Dan wajib dipegang setidaknya satu peran — izin yang tak dipegang siapa
  -- pun membuat menunya tak pernah tampil, persis seperti tak dibuat.
  SELECT count(*) INTO n
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:struktur:view';
  IF n = 0 THEN
    RAISE EXCEPTION '554 gagal: cecep:struktur:view tak dipegang peran mana pun (jalankan 459)';
  END IF;

  -- sort_order tak boleh bentrok dengan saudara seinduk.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.parent_id = r.parent_id
     AND m.sort_order = r.sort_order
     AND m.key <> 'cc-pembesian';
  IF n > 0 THEN
    RAISE EXCEPTION '554 gagal: sort_order % bentrok dengan % saudara seinduk', r.sort_order, n;
  END IF;

  RAISE NOTICE '554 OK: menu cc-pembesian → /estimasi/pembesian (sort_order %)', r.sort_order;
END $$;
