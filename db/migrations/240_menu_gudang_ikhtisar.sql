-- ════════════════════════════════════════════════════════════════════════════
-- 240 — Menu "Ringkasan Gudang" — grup Gudang akhirnya punya halaman ikhtisar
--
-- ── Kenapa
--
-- Penjaga `uji-induk-punya-ikhtisar.mjs` (2026-08-09) mencatat TIGA grup induk
-- tanpa halaman ikhtisar: Estimasi & Biaya, Gudang, Mutu & Kepatuhan. Gudang
-- salah satunya — ketiga anaknya halaman kerja dua-ruas
-- (`/gudang/rekonsiliasi`, `/gudang/transfer`, `/gudang/material-klien`),
-- sehingga mengklik "Gudang" hanya membuka/menutup.
--
-- Halaman `/gudang` sekarang ada (dashboard ikhtisar), jadi menunya
-- didaftarkan dan `tujuanGrup()` akan otomatis menemukannya: satu-ruas dan
-- menaungi ketiga anak lainnya.
--
-- ── Aturan migrasi 232 tetap berlaku
--
--   R-1  satu route = tepat satu link
--   R-3  menu hanya untuk halaman yang ADA
--
-- `/gudang` belum dipakai menu mana pun — diperiksa blok verifikasi di bawah.
-- Halamannya `apps/web/app/(dashboard)/gudang/page.tsx`, dibuat di commit yang
-- sama dengan migrasi ini.
--
-- ── sort_order 1301
--
-- Grup Gudang memakai rentang 1300-an. Angka 1 di belakang menandai "yang
-- pertama dibuka" — pola yang sama dengan `keuangan` (401), `kas` (501),
-- `procurement` (701), `mandor` (901), `lapangan` (1001).
--
-- Idempoten: ON CONFLICT (key) DO UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- `required_permissions` adalah KOLOM array di `menu_items`, bukan tabel
-- penghubung. Percobaan pertama menulis ke `menu_item_permissions` dan
-- ditolak Postgres — tabel itu tak pernah ada.
--
-- Server hanya MENGIRIM daftar ini; client yang memutuskan tampil/tidak
-- (lihat catatan di `routes/v1/menu.ts`).
INSERT INTO menu_items (
  key, label, href, icon, sort_order, section, parent_id, is_active,
  required_permissions
)
VALUES (
  'gudang', 'Ringkasan Gudang', '/gudang', 'Dot', 1301, 'main',
  (SELECT id FROM menu_items WHERE key = 'g-gudang'), true,
  ARRAY['gudang:view']
)
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label, href = EXCLUDED.href, icon = EXCLUDED.icon,
       sort_order = EXCLUDED.sort_order, section = 'main',
       parent_id = EXCLUDED.parent_id, is_active = true,
       required_permissions = EXCLUDED.required_permissions;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_induk UUID;
  v_ganda TEXT;
BEGIN
  SELECT parent_id INTO v_induk FROM menu_items WHERE key = 'gudang';
  IF v_induk IS NULL THEN
    RAISE EXCEPTION '240 gagal: kelompok g-gudang tak ditemukan — menu jadi item lepas';
  END IF;

  -- Aturan pokok migrasi 232: satu alamat, satu link.
  SELECT string_agg(href, ', ') INTO v_ganda
    FROM (SELECT href FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) s;
  IF v_ganda IS NOT NULL THEN
    RAISE EXCEPTION '240 gagal: ada href dipakai lebih dari satu menu aktif: %', v_ganda;
  END IF;

  RAISE NOTICE '240 OK — menu /gudang terdaftar di bawah g-gudang';
END $$;
