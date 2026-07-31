-- ============================================================
-- 148 — Menu "Register Tender" (pelengkap migrasi 147)
--
-- ── Kenapa migrasi terpisah, bukan digabung ke 147
--
-- 147 membuat TABEL; ini membuat JALAN MASUKNYA. Dipisah supaya bisa
-- di-rollback sendiri: menyembunyikan menu tak menghapus data tender, dan
-- itu memang perilaku yang benar bila suatu saat fitur ini ditunda.
--
-- ── Kenapa menu WAJIB, bukan opsional
--
-- Navigasi di aplikasi ini dibaca dari `menu_items` (Menu Registry, migrasi
-- 136), bukan di-hardcode di sidebar. Halaman tanpa baris di sini TIDAK MUNCUL
-- di navigasi mana pun — persis nasib `/estimasi` yang selama berbulan-bulan
-- tak bisa diakses karena middleware belum menyebutnya (temuan 2026-07-30).
--
-- Karena itu, satu fitur baru butuh TIGA hal sekaligus, dan lupa salah satunya
-- membuat sisanya mati tanpa gejala:
--   1. halaman (`app/(dashboard)/tender/page.tsx`)
--   2. izin rute di `middleware.ts` (kalau tidak: redirect balik ke /dashboard)
--   3. baris menu di sini (kalau tidak: tak ada tautannya di mana pun)
--
-- ── Permission
--
-- `projects:view` — SAMA dengan halaman Proyek, bukan permission baru.
-- Menambah `bids:view` berarti menambah baris yang harus di-seed ke tiap role,
-- dan satu role terlewat = menu hilang tanpa pesan kesalahan.
-- ============================================================

BEGIN;

INSERT INTO menu_items (key, label, href, icon, required_permissions, sort_order, section, is_active)
VALUES (
  'tender', 'Register Tender', '/tender', 'Gavel',
  ARRAY['projects:view'],
  -- 26: tepat sesudah `estimasi` (25). Keduanya pra-konstruksi, dan alur
  -- kerjanya memang berurutan — tender diikuti dulu, estimasinya menyusul.
  26, 'main', true
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'tender' AND is_active) THEN
    RAISE EXCEPTION '148 GAGAL: menu tender tak terpasang/aktif';
  END IF;
  RAISE NOTICE '148 OK: menu Register Tender aktif di section main (sort 26)';
END $$;

COMMIT;
