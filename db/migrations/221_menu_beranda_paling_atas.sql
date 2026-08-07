-- ════════════════════════════════════════════════════════════════════════════
-- 221 — Beranda ke paling atas sidebar; "Dashboard Eksekutif" dipensiunkan
--
-- ── Cacat yang diperbaiki
--
-- `/dashboard` adalah halaman yang dibuka SETIAP KALI orang masuk aplikasi.
-- Di sidebar, ia satu-satunya jalan masuknya adalah item bernama **"Dashboard
-- Eksekutif"** di kelompok Business Intelligence, `sort_order` **1801** —
-- paling bawah dari 20 kelompok.
--
-- Dua hal salah sekaligus:
--
--   1. Pintu yang paling sering dilewati ditaruh paling jauh. Orang yang ingin
--      kembali ke beranda menekan logo, tombol "back", atau mengetik URL —
--      bukan memakai sidebar. Navigasi yang tak dipakai untuk tujuan tersering
--      adalah navigasi yang gagal.
--
--   2. Namanya membohongi. "Eksekutif" terdengar seperti laporan khusus
--      direksi yang mungkin tak boleh dibuka orang lapangan. Padahal itu
--      beranda semua orang — isinya proyek aktif, kas hari ini, dan apa yang
--      menunggu keputusan.
--
-- ── Yang dilakukan
--
--   • `bi-eksekutif` DINONAKTIFKAN — bukan diubah label. Ia berada di kelompok
--     BI, dan memindahkannya keluar kelompok akan meninggalkan kelompok BI
--     dengan satu anak yang menunjuk halaman yang sama dengan item baru.
--   • Item baru `beranda`: TANPA induk (bukan anggota kelompok mana pun),
--     `sort_order = 10` — di atas 'Master Data' (100), jauh di atas 1801.
--
-- ── Kenapa item lepas, bukan kelompok
--
-- Sidebar sudah merender item tanpa anak sebagai tautan langsung
-- (`sidebar.tsx:753`). Membungkus Beranda dalam kelompok berisi satu anak
-- memaksa orang mengklik dua kali untuk tujuan yang paling sering — persis
-- lawan dari tujuan migrasi ini.
--
-- ── Idempoten
--
-- `ON CONFLICT (key) DO UPDATE` menetapkan nilai akhir. `menu_items.key` unik
-- (dipakai `company_menu_settings.menu_key` sebagai acuan), jadi konflik yang
-- diandalkan di sini memang mengikat — bukan `DO NOTHING` yang tak mengikat
-- apa-apa pada tabel tanpa unique constraint.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Beranda, paling atas, tanpa kelompok ─────────────────────────────────
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('beranda', 'Beranda', '/dashboard', 'LayoutDashboard', 10, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE
   SET label       = EXCLUDED.label,
       href        = EXCLUDED.href,
       icon        = EXCLUDED.icon,
       sort_order  = EXCLUDED.sort_order,
       section     = EXCLUDED.section,
       parent_id   = EXCLUDED.parent_id,
       is_active   = true;

-- ── 2. "Dashboard Eksekutif" dipensiunkan ───────────────────────────────────
--
-- Dinonaktifkan, TIDAK dihapus: `company_menu_settings.menu_key` bisa memuat
-- acuan ke key ini pada tenant yang sudah menyetelnya. Menghapus barisnya
-- meninggalkan pengaturan yang menunjuk sesuatu yang tak ada.
UPDATE menu_items SET is_active = false WHERE key = 'bi-eksekutif';

-- ------------------------------------------------------------
-- Verifikasi — gagal keras kalau hasilnya tidak seperti yang dimaksud.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_urut   INT;
  v_min    INT;
  v_ganda  INT;
BEGIN
  SELECT sort_order INTO v_urut
    FROM menu_items WHERE key = 'beranda' AND is_active;
  IF v_urut IS NULL THEN
    RAISE EXCEPTION '221 gagal: item beranda tidak terbentuk atau tidak aktif';
  END IF;

  -- Beranda WAJIB yang paling atas. Kalau kelak ada kelompok ber-sort_order
  -- lebih kecil, migrasi ini harus tahu — bukan diam-diam jadi nomor dua.
  SELECT min(sort_order) INTO v_min
    FROM menu_items
   WHERE is_active AND section = 'main' AND parent_id IS NULL AND key <> 'beranda';
  IF v_min IS NOT NULL AND v_min <= v_urut THEN
    RAISE EXCEPTION '221 gagal: beranda (%) tidak paling atas — ada item lain di %', v_urut, v_min;
  END IF;

  -- Tak boleh ada dua jalan masuk aktif ke /dashboard: itu justru cacat T-3
  -- yang sedang diberantas.
  SELECT count(*) INTO v_ganda
    FROM menu_items WHERE is_active AND href = '/dashboard';
  IF v_ganda <> 1 THEN
    RAISE EXCEPTION '221 gagal: /dashboard punya % jalan masuk aktif, harus tepat 1', v_ganda;
  END IF;
END $$;
