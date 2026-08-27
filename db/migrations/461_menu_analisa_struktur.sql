-- ════════════════════════════════════════════════════════════════════════════
-- 461 — Menu "Analisa Struktur" di bawah Estimasi & Anggaran
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman `/estimasi/struktur` sudah ada, tetapi belum punya satu pun tautan
-- navigasi — hanya bisa dibuka dengan mengetik URL. Dijaga
-- `audit-nav-yatim.mjs`, yang memerah begitu halamannya dibuat.
--
-- Halaman yang tak bisa dicapai siapa pun sama dengan halaman yang tak ada:
-- tujuh endpoint, 372 test, dan sebuah mesin hitung struktur lengkap tak
-- berguna kalau tak seorang pun menemukannya.
--
-- ── Kenapa izinnya DIISI, bukan dibiarkan kosong
--
-- Menu ber-izin kosong tampil untuk SEMUA orang, termasuk yang halamannya
-- sendiri akan menolak mereka — dan yang ditolak sesudah mengklik
-- menyimpulkan aplikasinya rusak, bukan bahwa ia memang tak berhak.
--
-- Kuncinya `cecep:struktur:view`, SAMA dengan yang dipakai `requirePermission`
-- di `routes/v1/struktur.ts`. Bukan kunci baru: kunci yang tak ada di tabel
-- `permissions` menolak semua orang tanpa gejala (dijaga
-- `audit-izin-benar-ada.mjs`), dan izin itu sudah dibuat migrasi 458 lalu
-- ditautkan ke peran oleh migrasi 459.
--
-- ── Kenapa sort_order 507
--
-- Diukur, bukan ditebak: anak `g-anggaran` memakai 501–506 dan 507 kosong.
-- CLAUDE.md mencatat `sort_order` bentrok sebagai cacat yang pernah lolos ke
-- CI, jadi angkanya diperiksa ke basis lebih dulu — dan blok verifikasi di
-- bawah menolak migrasi ini kalau ternyata bentrok.
--
-- ── Kenapa idempoten lewat `key`, bukan `id`
--
-- `id` berbeda antar lingkungan (dev/CI/produksi). `key` kontrak yang sama di
-- semuanya. Induknya pun dicari lewat `key`, bukan UUID yang dipaku.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
SELECT
  'cc-struktur',
  'Analisa Struktur',
  '/estimasi/struktur',
  'Ruler',
  induk.id,
  ARRAY['cecep:struktur:view'],
  507,
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
    FROM menu_items m WHERE m.key = 'cc-struktur';

  IF r IS NULL THEN
    RAISE EXCEPTION '461 gagal: menu cc-struktur tak terbentuk — induk g-anggaran ada?';
  END IF;

  IF r.href <> '/estimasi/struktur' OR NOT r.is_active THEN
    RAISE EXCEPTION '461 gagal: href/is_active tak sesuai (href=%, aktif=%)', r.href, r.is_active;
  END IF;

  IF r.parent_id IS NULL THEN
    RAISE EXCEPTION '461 gagal: menu tanpa induk — ia tak akan muncul di sidebar mana pun';
  END IF;

  -- Izinnya wajib BENAR-BENAR ADA di tabel permissions. Kunci hantu menolak
  -- semua orang tanpa satu pun galat yang menunjuk sebabnya.
  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key = ANY(r.required_permissions);
  IF n <> array_length(r.required_permissions, 1) THEN
    RAISE EXCEPTION '461 gagal: ada kunci izin yang tak terdaftar di tabel permissions';
  END IF;

  -- Dan wajib dipegang setidaknya satu peran — izin yang tak dipegang siapa
  -- pun membuat menunya tak pernah tampil, persis seperti tak dibuat.
  SELECT count(*) INTO n
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:struktur:view';
  IF n = 0 THEN
    RAISE EXCEPTION '461 gagal: cecep:struktur:view tak dipegang peran mana pun (jalankan 459)';
  END IF;

  -- sort_order tak boleh bentrok dengan saudara seinduk.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.parent_id = r.parent_id
     AND m.sort_order = r.sort_order
     AND m.key <> 'cc-struktur';
  IF n > 0 THEN
    RAISE EXCEPTION '461 gagal: sort_order % bentrok dengan % saudara seinduk', r.sort_order, n;
  END IF;

  RAISE NOTICE '461 OK — menu cc-struktur aktif di /estimasi/struktur, sort_order %', r.sort_order;
END $$;
