-- ============================================================
-- 151 — Menu "Aset & Alat" (pelengkap migrasi 149/150)
--
-- ── Kenapa migrasi terpisah dari 149
--
-- 149 membuat TABEL, 150 memperbaiki policy-nya, ini membuat JALAN MASUKNYA.
-- Dipisah supaya bisa di-rollback sendiri: menyembunyikan menu tak menghapus
-- data aset, dan itu memang perilaku yang benar bila fitur ini suatu saat
-- ditunda.
--
-- ── Kenapa menu WAJIB
--
-- Navigasi dibaca dari `menu_items` (Menu Registry, migrasi 136), bukan
-- di-hardcode di sidebar. Halaman tanpa baris di sini TIDAK MUNCUL di navigasi
-- mana pun — persis nasib `/estimasi` selama berbulan-bulan (temuan
-- 2026-07-30), dan `/piutang` yang dibangun 2026-07-28 lalu tak terjangkau
-- sampai penjaga rute menemukannya 2026-07-31.
--
-- Satu fitur baru butuh TIGA hal, dan lupa salah satunya membuat sisanya mati
-- tanpa gejala:
--   1. halaman        → `app/(dashboard)/aset/page.tsx`            ✅
--   2. izin rute      → `middleware.ts` ROLE_ALLOWED (admin + pm)  ✅
--   3. baris menu     → di sini                                     ← ini
--
-- ── Permission
--
-- `assets:view` — permission BARU yang lahir bersama 149, bukan menumpang
-- `projects:view` seperti tender. Alasannya: aset adalah harta perusahaan,
-- bukan pekerjaan proyek. 149 sudah men-seed-nya ke role yang scope-nya sudah
-- setara (pemegang `projects:view` untuk lihat, `cash:manage` untuk kelola),
-- jadi tak ada role yang kehilangan menu ini karena permission-nya baru.
-- ============================================================

BEGIN;

INSERT INTO menu_items (key, label, href, icon, required_permissions, sort_order, section, is_active)
VALUES (
  'aset', 'Aset & Alat', '/aset', 'Truck',
  ARRAY['assets:view'],
  -- 55: tepat sesudah Pengadaan (50), sebelum Mandor (60). Keduanya soal
  -- sumber daya FISIK yang dibeli/disewa lalu dipakai di proyek, jadi orang
  -- yang membuka Pengadaan sering butuh Aset di napas yang sama.
  55, 'main', true
)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      href = EXCLUDED.href,
      icon = EXCLUDED.icon,
      required_permissions = EXCLUDED.required_permissions,
      sort_order = EXCLUDED.sort_order,
      section = EXCLUDED.section,
      is_active = true,
      updated_at = now();

DO $$
DECLARE n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'aset' AND is_active) THEN
    RAISE EXCEPTION '151 GAGAL: menu aset tak terpasang/aktif';
  END IF;

  -- Menu yang menuntut permission yang tak dipegang SIAPA PUN sama saja dengan
  -- tak ada menu — dan itu gagal dalam diam. Diperiksa, bukan diandaikan.
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'assets:view';
  IF n = 0 THEN
    RAISE EXCEPTION '151 GAGAL: nol role memegang assets:view — menunya takkan terlihat siapa pun';
  END IF;

  RAISE NOTICE '151 OK: menu Aset & Alat aktif (sort 55), assets:view dipegang % role', n;
END $$;

COMMIT;
